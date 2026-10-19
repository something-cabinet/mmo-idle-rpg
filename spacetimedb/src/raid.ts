// Raid fights (docs/design/raids.md): a party of up to RAID_PARTY_SIZE against a raid
// boss, online only. Pure and deterministic, like sim.ts: the server plays the whole
// fight when the leader starts it (that decides the outcome), and every client in the
// party replays the very same fight from the stored setup and seed to animate it.

import { critMultAgainst, defenseAgainst, effectDamageMult, mitigation, type CombatStats } from './combat';
import { Effect, LAST_STAND_BELOW, MOONLIGHT_EVERY, effectAmount, waxingMult } from './data/legendary';
import { NPC_POWER, RAID_RARITY_ODDS, THREAT_FOCUS, bossPhases, type RaidDef } from './data/raids';
import { raidUniques } from './data/uniques';
import { base, type DamageType } from './data/bases';
import type { EnemyDef } from './data/zones';
import { accuracyAtLevel } from './data/stats';
import { makeItem, makeUnique, seededRng, type NewItem, type Rng } from './loot';

const RAID_SALT = 0x72616964n; // "raid"
const RAID_LOOT_SALT = 0x726c6f6f74n; // "rloot"
/** Raids behind the odds estimate. */
export const RAID_ODDS_SAMPLES = 200;

export interface RaidFighter {
  /** 0 for a hired NPC. */
  characterId: bigint;
  name: string;
  /** With the Phial drunk for this fight, if any (`phialId`). */
  stats: CombatStats;
  /** The Phial drunk for this fight (data/supplies.ts); absent for none. */
  phialId?: number;
}

/** What a fight is played from: stored on the party when it starts, so every client replays the same fight. */
export interface RaidSetup {
  raidId: number;
  fighters: RaidFighter[];
}

export interface RaidEvent {
  t: number;
  /** Fighter index that swung, or -1: the boss. */
  by: number;
  /** 'phase': the boss turns to its next Lunar Phase (`phase`). */
  kind: 'hit' | 'crit' | 'dodge' | 'aoe' | 'phase';
  /** The boss's target (fighter index); -1 when a fighter hits the boss, for the boss's AoE and a phase change. */
  target: number;
  /** Damage dealt (to the boss by a fighter; to the target, or to each fighter for an AoE, before their own mitigation is shown). */
  damage: number;
  /** Every fighter's HP after the event. */
  hp: number[];
  bossHp: number;
  /** Fighters Second Wind saved in this event. */
  saved?: number[];
  /** A boss hit: what reached the target after Stoneskin, Bulwark and Last Stand (the shield's share included). */
  dealt?: number;
  /** A boss hit Bulwark blocked half of. */
  blocked?: boolean;
  /** Every fighter's Second Skin shield after the event, when anyone in the party has one. */
  shield?: number[];
  /** A phase change: the phase the boss is now in (its index in `RaidDef.phases.list`). */
  phase?: number;
}

export interface RaidResult {
  events: RaidEvent[];
  maxHp: number[];
  /** Seconds from the start to the kill, the wipe or the enrage. */
  end: number;
  won: boolean;
  /** The party lasted to the enrage timer (a wipe). */
  enraged: boolean;
}

export const raidRng = (partyId: bigint, startMicros: bigint): Rng => seededRng(partyId, startMicros, RAID_SALT);

/** How much of the boss's attention a fighter with `threat` draws (THREAT_FOCUS). */
export const threatWeight = (threat: number) => Math.exp(THREAT_FOCUS * threat);

/** Each fighter's share of the boss's attacks while all of `threats` are alive. */
export function aggroShares(threats: readonly number[]): number[] {
  const w = threats.map(threatWeight);
  const total = w.reduce((a, b) => a + b, 0);
  return w.map(x => x / total);
}

/** What one fighter's swings do to the boss (`boss`: as it is in the current phase), per swing before crits, variance and effects that need HP. */
function offense(s: CombatStats, boss: EnemyDef) {
  const src = s.sources[0];
  const amount = (id: number) => effectAmount(s.effects, id);
  const voidtouched = s.effects.has(Effect.Voidtouched);
  const mitP = voidtouched ? 0 : mitigation(boss.armor, s.armorPen, boss.level) * (1 - amount(Effect.Rending));
  const mitM = voidtouched ? 0 : mitigation(boss.resistance, s.magicPen, boss.level) * (1 - amount(Effect.Spellbreaker));
  if (!src) return { period: Infinity, hit: 0, heal: 0, healAll: false, crit: 0, critX: 1, mitP, mitM };
  const crit = Math.min(1, src.critChance);
  return {
    period: 1 / src.attacksPerSec,
    hit: src.hit.Physical * (1 - mitP) + src.hit.Magic * (1 - mitM),
    heal: src.heal,
    healAll: src.healAll,
    crit,
    // Deadeye: crits ignore a share of the boss's mitigation.
    critX: crit > 0 ? 1 + (critMultAgainst(src, { Physical: mitP, Magic: mitM }, amount(Effect.Deadeye)) - 1) / crit : 1,
    mitP,
    mitM,
  };
}

/**
 * One raid fight. Every fighter swings at the boss on its own timer (the matchup
 * formulas per swing: mitigation, penetration, crits, ±10% variance). Each boss attack
 * picks a living fighter weighted by threat (`threatWeight`): the more threat, the more
 * of the attacks, but anyone can be hit. It is dodged at the target's evasion. Every
 * `aoe.every` seconds hits every living fighter (no dodge), or with `aoe.split` shares its damage
 * among them. With Lunar Phases (`raid.phases`) the boss turns to its next phase every
 * `phases.every` seconds and takes that phase's armor, resistance and damage type. Heals go to the most hurt
 * living ally ("single") or are split across the living party ("all"); lifesteal and
 * regen heal yourself. The highest Frostbite chill in the party shrinks all the boss's
 * damage. Executioner, Bully, Berserker, Ambush, Riposte, Second Wind, Second Skin,
 * Stoneskin, Bulwark, Last Stand, Thornshell, Zealot's Oath, Moonlight, Waxing Moon and
 * Afterimage work as in a solo fight, and so do Phials (Warding shrinks the hits taken, Renewal heals once below half HP).
 * Follow-through does nothing here: there is no next enemy. The party wins when the boss dies, and loses when everyone is dead or at the
 * enrage timer.
 */
export function simulateRaid(setup: RaidSetup, raid: RaidDef, rng: Rng, record = true): RaidResult {
  const fighters = setup.fighters.map(f => f.stats);
  const n = fighters.length;
  // Per phase (one without phases): each fighter's offense, and their defense against the boss's attacks.
  const phases = bossPhases(raid);
  const offs = phases.map(p => fighters.map(s => offense(s, p)));
  const defenses = phases.map(p => fighters.map(s => defenseAgainst(s, p.damageType, p.level)));
  let phase = 0;
  let off = offs[0];
  let defense = defenses[0];
  const maxHp = fighters.map(s => s.maxHp);
  const hp = [...maxHp];
  const boss = raid.boss;
  let bossHp = boss.hp;
  const amount = (i: number, id: number) => effectAmount(fighters[i].effects, id);
  const ambush = fighters.map(s => (s.effects.has(Effect.Ambush) ? 5 : 1));
  const swings = fighters.map(() => 0);
  const lastDodged = fighters.map(() => false);
  const secondWind = fighters.map((_, i) => amount(i, Effect.SecondWind));
  const renewal = fighters.map(s => s.renewal ?? 0);
  const executeBelow = fighters.map((_, i) => amount(i, Effect.Executioner) * boss.hp);
  const bullyAbove = fighters.map((_, i) => (1 - amount(i, Effect.Bully)) * boss.hp);
  const shield = fighters.map((s, i) => amount(i, Effect.SecondSkin) * s.maxHp);
  const chill = Math.max(0, ...fighters.map(s => s.chill));
  const bossPeriod = 1 / boss.speed;
  const bossHit = (boss.dps / boss.speed) * (1 - chill);
  const weight = fighters.map(s => threatWeight(s.threat));
  const aoeMit = fighters.map(s => defenseAgainst(s, raid.aoe.damageType, boss.level).mitigation);
  const aoeHit = raid.aoe.damage * (1 - chill);
  // First swings land at a random point of their first period (half a period on average).
  const first = (period: number) => (Number.isFinite(period) ? rng() * period : Infinity);
  const next = off.map(o => first(o.period));
  let nextBoss = first(bossPeriod);
  let nextAoe = raid.aoe.every;
  let nextPhase = raid.phases?.every ?? Infinity;
  const events: RaidEvent[] = [];
  let now = 0;
  const alive = (i: number) => hp[i] > 0;
  const done = (end: number, won: boolean, enraged = false): RaidResult => ({ events, maxHp, end, won, enraged });

  const shielded = shield.some(x => x > 0);
  /** What the last `hurt` dealt and whether Bulwark blocked it (for the event). */
  let dealt = 0;
  let blocked = false;

  /** `i` takes `damage` of `type` from the boss; Thornshell reflects some in that type. Returns whether Second Wind saved them. */
  const hurt = (i: number, damage: number, type: DamageType): boolean => {
    // A Phial of Warding, Stoneskin, Bulwark and Last Stand shrink the hit; Second Skin's shield takes it first.
    damage = Math.max(0, damage * (fighters[i].damageTaken ?? 1) - amount(i, Effect.Stoneskin) * maxHp[i]);
    const bulwark = amount(i, Effect.Bulwark);
    blocked = bulwark > 0 && rng() < bulwark;
    if (blocked) damage /= 2;
    if (hp[i] < LAST_STAND_BELOW * maxHp[i]) damage *= 1 - amount(i, Effect.LastStand);
    // Afterimage: the hit right after a dodge deals a share less.
    if (lastDodged[i]) damage *= 1 - amount(i, Effect.Afterimage);
    lastDodged[i] = false;
    dealt = damage;
    const absorbed = Math.min(shield[i], damage);
    shield[i] -= absorbed;
    damage -= absorbed;
    const thorns = amount(i, Effect.Thornshell) * damage * effectDamageMult(fighters[i].effects) * (1 - (type === 'Physical' ? off[i].mitP : off[i].mitM));
    bossHp = Math.max(0, bossHp - thorns);
    hp[i] = Math.max(0, hp[i] - damage);
    if (hp[i] > 0 && renewal[i] > 0 && hp[i] < maxHp[i] / 2) {
      hp[i] = Math.min(maxHp[i], hp[i] + renewal[i] * maxHp[i]);
      renewal[i] = 0;
    }
    if (hp[i] > 0 || secondWind[i] <= 0) return false;
    hp[i] = secondWind[i] * maxHp[i];
    secondWind[i] = 0;
    return true;
  };
  const heal = (i: number, amt: number) => {
    if (alive(i)) hp[i] = Math.min(maxHp[i], hp[i] + amt);
  };
  const push = (e: Omit<RaidEvent, 'hp' | 'bossHp'>) => {
    if (record) events.push({ ...e, hp: [...hp], bossHp, ...(shielded && { shield: [...shield] }) });
  };

  for (;;) {
    const fighterAt = Math.min(...next);
    const t = Math.min(fighterAt, nextBoss, nextAoe, nextPhase);
    if (t > raid.enrageSeconds) return done(raid.enrageSeconds, false, true);
    for (let i = 0; i < n; i++) heal(i, fighters[i].regen * (t - now));
    now = t;

    if (t === nextPhase) {
      nextPhase += raid.phases!.every;
      phase = (phase + 1) % phases.length;
      off = offs[phase];
      defense = defenses[phase];
      push({ t, by: -1, kind: 'phase', target: -1, damage: 0, phase });
    } else if (t === nextAoe) {
      nextAoe += raid.aoe.every;
      // A split AoE (Moonfall) is shared by the living: the fewer left, the harder each is hit.
      const share = raid.aoe.split ? aoeHit / hp.filter(h => h > 0).length : aoeHit;
      const saved: number[] = [];
      for (let i = 0; i < n; i++) if (alive(i) && hurt(i, share * (1 - aoeMit[i]) * (0.9 + 0.2 * rng()), raid.aoe.damageType)) saved.push(i);
      push({ t, by: -1, kind: 'aoe', target: -1, damage: share, ...(saved.length && { saved }) });
    } else if (t === nextBoss) {
      nextBoss += bossPeriod;
      // The boss picks a living fighter, weighted by threat (`threatWeight`).
      const living = hp.map((_, i) => i).filter(alive);
      let r = rng() * living.reduce((sum, i) => sum + weight[i], 0);
      const target = living.find(i => (r -= weight[i]) < 0) ?? living[living.length - 1];
      if (rng() < defense[target].evasion) {
        lastDodged[target] = true;
        // Riposte: the dodge counters for a share of an average hit.
        const counter = amount(target, Effect.Riposte) * off[target].hit * (1 + off[target].crit * (off[target].critX - 1));
        if (counter > 0) bossHp = Math.max(0, bossHp - counter);
        push({ t, by: -1, kind: 'dodge', target, damage: 0 });
      } else {
        const damage = bossHit * (1 - defense[target].mitigation) * (0.9 + 0.2 * rng());
        const saved = hurt(target, damage, phases[phase].damageType);
        push({ t, by: -1, kind: 'hit', target, damage, dealt, ...(blocked ? { blocked: true } : {}), ...(saved && { saved: [target] }) });
      }
    } else {
      const a = next.indexOf(fighterAt);
      const o = off[a];
      next[a] += o.period;
      const isCrit = rng() < o.crit;
      const critX = isCrit ? o.critX : 1;
      const doubled = bossHp < executeBelow[a] || bossHp > bullyAbove[a] ? 2 : 1;
      // Berserker: more damage the more of your max HP is missing.
      const rage = 1 + (10 * amount(a, Effect.Berserker) * (maxHp[a] - hp[a])) / maxHp[a];
      swings[a] += 1;
      // Moonlight: every 3rd swing hits twice. Waxing Moon: swing k × waxingMult(k).
      const fx = fighters[a].effects;
      const wave = fx.has(Effect.Moonlight) && swings[a] % MOONLIGHT_EVERY === 0 ? 2 : 1;
      const wax = fx.has(Effect.WaxingMoon) ? waxingMult(swings[a]) : 1;
      let damage = o.hit * critX * (0.9 + 0.2 * rng()) * doubled * ambush[a] * rage * wave * wax;
      ambush[a] = 1;
      const healed = o.heal * critX;
      // Zealot's Oath: heals also hit for a share of the heal (magic).
      damage += amount(a, Effect.ZealotsOath) * healed * effectDamageMult(fighters[a].effects) * (1 - o.mitM);
      bossHp = Math.max(0, bossHp - damage);
      if (healed > 0) {
        const living = hp.map((_, i) => i).filter(alive);
        if (o.healAll) for (const i of living) heal(i, healed / living.length);
        else heal(living.reduce((m, i) => (hp[i] / maxHp[i] < hp[m] / maxHp[m] ? i : m)), healed);
      }
      heal(a, fighters[a].lifesteal * damage);
      push({ t, by: a, kind: isCrit ? 'crit' : 'hit', target: -1, damage });
    }
    if (bossHp <= 0) return done(t, true);
    // The dead stop swinging.
    for (let i = 0; i < n; i++) if (!alive(i)) next[i] = Infinity;
    if (!hp.some(h => h > 0)) return done(t, false);
  }
}

/** Share of RAID_ODDS_SAMPLES fights with this setup the party wins. */
export function raidOdds(setup: RaidSetup, raid: RaidDef, seed: bigint): number {
  let wins = 0;
  for (let i = 0; i < RAID_ODDS_SAMPLES; i++) if (simulateRaid(setup, raid, seededRng(seed, BigInt(i), RAID_SALT), false).won) wins++;
  return wins / RAID_ODDS_SAMPLES;
}

// ---------------------------------------------------------------- hired NPCs

/** A hired NPC (raids.md): NPC_POWER × the raid's reference player, whoever is in the party. No effects, no heals. */
export function npcStats(raid: RaidDef): CombatStats {
  const r = raid.reference;
  const k = NPC_POWER;
  return {
    level: r.level,
    sources: [{
      hit: { Physical: (k * r.physicalPerSec) / r.attacksPerSec, Magic: (k * r.magicPerSec) / r.attacksPerSec },
      heal: 0,
      healAll: false,
      attacksPerSec: r.attacksPerSec,
      critChance: r.critChance,
      critMult: r.critMult,
    }],
    critDamage: 1.5,
    armorPen: r.armorPen,
    magicPen: r.magicPen,
    maxHp: k * r.maxHp,
    regen: k * r.regen,
    armor: k * r.armor,
    resistance: k * r.resistance,
    evasionRating: k * r.evasionRating,
    accuracy: accuracyAtLevel(r.level),
    lifesteal: 0,
    threat: k * r.threat,
    itemFind: 0,
    goldFind: 0,
    xpGain: 0,
    walkTime: 0,
    offlineHours: 0,
    chill: 0,
    effects: new Map(),
  };
}

// ---------------------------------------------------------------- storage

/** `setup` as a string for the party row (bigints and the effects map don't survive JSON on their own). */
export function encodeSetup(setup: RaidSetup): string {
  return JSON.stringify({
    raidId: setup.raidId,
    fighters: setup.fighters.map(f => ({ ...f, characterId: String(f.characterId), stats: { ...f.stats, effects: [...f.stats.effects] } })),
  });
}

export function decodeSetup(json: string): RaidSetup {
  const raw = JSON.parse(json) as { raidId: number; fighters: { characterId: string; name: string; phialId?: number; stats: CombatStats & { effects: [number, number][] } }[] };
  return {
    raidId: raw.raidId,
    fighters: raw.fighters.map(f => ({ ...f, characterId: BigInt(f.characterId), stats: { ...f.stats, effects: new Map(f.stats.effects) } })),
  };
}

// ---------------------------------------------------------------- rewards

/**
 * One fighter's item for a rewarded kill: Epic or better of the raid's tier, a Unique from the raid's own pool.
 * An Epic or Legendary has every affix at the top affix tier (the raid's tier).
 * An Epic or Legendary is one of the raid's own bases `ownBaseShare` of the time, else any zone base.
 */
export function rollRaidItem(rng: Rng, raid: RaidDef): NewItem {
  const r = rng();
  const uniques = raidUniques(raid.id);
  if (r < RAID_RARITY_ODDS.Unique && uniques.length) return makeUnique(rng, uniques[Math.floor(rng() * uniques.length)]);
  const rarity = r < RAID_RARITY_ODDS.Unique + RAID_RARITY_ODDS.Legendary ? 'Legendary' : 'Epic';
  const own = raid.boss.drops.filter(id => base(id).raidId === raid.id);
  const drops = own.length && rng() < raid.ownBaseShare ? own : raid.boss.drops.filter(id => base(id).raidId === undefined);
  return makeItem(rng, drops[Math.floor(rng() * drops.length)], raid.tier, rarity, raid.tier);
}

export const raidLootRng = (partyId: bigint, startMicros: bigint, characterId: bigint): Rng => seededRng(partyId, startMicros, characterId, RAID_LOOT_SALT);

const DAY_MICROS = 86_400_000_000n;
/** Raid rewards are `clearsPerDay` wins per character per raid per day: the current day started here (00:00 UTC). */
export const lockoutStart = (nowMicros: bigint): bigint => nowMicros - (nowMicros % DAY_MICROS);
/** When the current lockout ends. */
export const lockoutEnd = (nowMicros: bigint): bigint => lockoutStart(nowMicros) + DAY_MICROS;

/** Rewarded clears of `raidId` today, from a character's raid logs. */
export const clearsToday = (logs: Iterable<{ raidId: number; rewarded: boolean; startedAt: { microsSinceUnixEpoch: bigint } }>, raidId: number, nowMicros: bigint): number => {
  const since = lockoutStart(nowMicros);
  let n = 0;
  for (const l of logs) if (l.raidId === raidId && l.rewarded && l.startedAt.microsSinceUnixEpoch >= since) n++;
  return n;
};
