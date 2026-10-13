// Raid fights (docs/design/raids.md): a party of up to RAID_PARTY_SIZE against a raid
// boss, online only. Pure and deterministic, like sim.ts: the server plays the whole
// fight when the leader starts it (that decides the outcome), and every client in the
// party replays the very same fight from the stored setup and seed to animate it.

import { defenseAgainst, effectDamageMult, mitigation, type AttackSource, type CombatStats } from './combat';
import { Effect, effectAmount } from './data/legendary';
import { NPC_POWER, RAID_RARITY_ODDS, type RaidDef } from './data/raids';
import { raidUniques } from './data/uniques';
import { makeItem, makeUnique, seededRng, type NewItem, type Rng } from './loot';

const RAID_SALT = 0x72616964n; // "raid"
const RAID_LOOT_SALT = 0x726c6f6f74n; // "rloot"
/** Raids behind the odds estimate. */
export const RAID_ODDS_SAMPLES = 200;

export interface RaidFighter {
  /** 0 for a hired NPC. */
  characterId: bigint;
  name: string;
  stats: CombatStats;
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
  kind: 'hit' | 'crit' | 'dodge' | 'aoe';
  /** The boss's target (fighter index); -1 when a fighter hits the boss or for the boss's AoE. */
  target: number;
  /** Damage dealt (to the boss by a fighter; to the target, or to each fighter for an AoE, before their own mitigation is shown). */
  damage: number;
  /** Every fighter's HP after the event. */
  hp: number[];
  bossHp: number;
  /** Fighters Second Wind saved in this event. */
  saved?: number[];
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

/** What one fighter's swings do to the boss, per swing before crits, variance and effects that need HP. */
function offense(s: CombatStats, raid: RaidDef) {
  const src = s.sources[0];
  const amount = (id: number) => effectAmount(s.effects, id);
  const boss = raid.boss;
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
    critX: crit > 0 ? 1 + (src.critMult - 1) / crit : 1,
    mitP,
    mitM,
  };
}

/**
 * One raid fight. Every fighter swings at the boss on its own timer (the matchup
 * formulas per swing: mitigation, penetration, crits, ±10% variance). The boss hits
 * the living fighter with the most threat, dodged at that fighter's evasion, and every
 * `aoe.every` seconds hits every living fighter (no dodge). Heals go to the most hurt
 * living ally ("single") or are split across the living party ("all"); lifesteal and
 * regen heal yourself. The highest Frostbite chill in the party shrinks all the boss's
 * damage. Executioner, Ambush, Second Wind, Thornshell and Zealot's Oath work as in a
 * duel. The party wins when the boss dies, and loses when everyone is dead or at the
 * enrage timer.
 */
export function simulateRaid(setup: RaidSetup, raid: RaidDef, rng: Rng, record = true): RaidResult {
  const fighters = setup.fighters.map(f => f.stats);
  const n = fighters.length;
  const off = fighters.map(s => offense(s, raid));
  const maxHp = fighters.map(s => s.maxHp);
  const hp = [...maxHp];
  const boss = raid.boss;
  let bossHp = boss.hp;
  const amount = (i: number, id: number) => effectAmount(fighters[i].effects, id);
  const ambush = fighters.map(s => (s.effects.has(Effect.Ambush) ? 5 : 1));
  const secondWind = fighters.map((_, i) => amount(i, Effect.SecondWind));
  const executeBelow = fighters.map((_, i) => amount(i, Effect.Executioner) * boss.hp);
  const chill = Math.max(0, ...fighters.map(s => s.chill));
  const bossPeriod = 1 / boss.speed;
  const bossHit = (boss.dps / boss.speed) * (1 - chill);
  const defense = fighters.map(s => defenseAgainst(s, boss.damageType, boss.level));
  const aoeMit = fighters.map(s => defenseAgainst(s, raid.aoe.damageType, boss.level).mitigation);
  const aoeHit = raid.aoe.damage * (1 - chill);
  // First swings land at a random point of their first period (half a period on average).
  const first = (period: number) => (Number.isFinite(period) ? rng() * period : Infinity);
  const next = off.map(o => first(o.period));
  let nextBoss = first(bossPeriod);
  let nextAoe = raid.aoe.every;
  const events: RaidEvent[] = [];
  let now = 0;
  const alive = (i: number) => hp[i] > 0;
  const done = (end: number, won: boolean, enraged = false): RaidResult => ({ events, maxHp, end, won, enraged });

  /** `i` takes `damage` from the boss; Thornshell reflects some. Returns whether Second Wind saved them. */
  const hurt = (i: number, damage: number): boolean => {
    const thorns = amount(i, Effect.Thornshell) * damage * effectDamageMult(fighters[i].effects) * (1 - off[i].mitP);
    bossHp = Math.max(0, bossHp - thorns);
    hp[i] = Math.max(0, hp[i] - damage);
    if (hp[i] > 0 || secondWind[i] <= 0) return false;
    hp[i] = secondWind[i] * maxHp[i];
    secondWind[i] = 0;
    return true;
  };
  const heal = (i: number, amt: number) => {
    if (alive(i)) hp[i] = Math.min(maxHp[i], hp[i] + amt);
  };
  const push = (e: Omit<RaidEvent, 'hp' | 'bossHp'>) => {
    if (record) events.push({ ...e, hp: [...hp], bossHp });
  };

  for (;;) {
    const fighterAt = Math.min(...next);
    const t = Math.min(fighterAt, nextBoss, nextAoe);
    if (t > raid.enrageSeconds) return done(raid.enrageSeconds, false, true);
    for (let i = 0; i < n; i++) heal(i, fighters[i].regen * (t - now));
    now = t;

    if (t === nextAoe) {
      nextAoe += raid.aoe.every;
      const saved: number[] = [];
      for (let i = 0; i < n; i++) if (alive(i) && hurt(i, aoeHit * (1 - aoeMit[i]) * (0.9 + 0.2 * rng()))) saved.push(i);
      push({ t, by: -1, kind: 'aoe', target: -1, damage: aoeHit, ...(saved.length && { saved }) });
    } else if (t === nextBoss) {
      nextBoss += bossPeriod;
      // The boss attacks the living fighter with the most threat (the first one on a tie).
      let target = -1;
      for (let i = 0; i < n; i++) if (alive(i) && (target < 0 || fighters[i].threat > fighters[target].threat)) target = i;
      if (rng() < defense[target].evasion) {
        push({ t, by: -1, kind: 'dodge', target, damage: 0 });
      } else {
        const damage = bossHit * (1 - defense[target].mitigation) * (0.9 + 0.2 * rng());
        const saved = hurt(target, damage);
        push({ t, by: -1, kind: 'hit', target, damage, ...(saved && { saved: [target] }) });
      }
    } else {
      const a = next.indexOf(fighterAt);
      const o = off[a];
      next[a] += o.period;
      const isCrit = rng() < o.crit;
      const critX = isCrit ? o.critX : 1;
      let damage = o.hit * critX * (0.9 + 0.2 * rng()) * (bossHp < executeBelow[a] ? 2 : 1) * ambush[a];
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

/**
 * A hired NPC: NPC_POWER × the party's average player (raids.md). Its DPS against the
 * boss (by damage type), heal per second, max HP, regen, armor, resistance, evasion and
 * threat are that share of the players' averages; its attack speed, crits and
 * penetration are the averages. No effects; its heals are split across the party.
 */
export function npcStats(players: readonly CombatStats[], raid: RaidDef): CombatStats {
  const avg = (f: (s: CombatStats) => number) => players.reduce((sum, s) => sum + f(s), 0) / Math.max(1, players.length);
  const src = (s: CombatStats): AttackSource | undefined => s.sources[0];
  // Speed and crits average over the armed players only.
  const armed = players.flatMap(s => s.sources.slice(0, 1));
  const avgArmed = (f: (x: AttackSource) => number, none: number) => (armed.length ? armed.reduce((sum, x) => sum + f(x), 0) / armed.length : none);
  const aps = avgArmed(x => x.attacksPerSec, 0);
  const critChance = avgArmed(x => x.critChance, 0);
  const critMult = avgArmed(x => x.critMult, 1);
  const armorPen = avg(s => s.armorPen);
  const magicPen = avg(s => s.magicPen);
  // Each player's damage per second against the boss by type (as `offense` swings it), and heal per second.
  const perSec = (s: CombatStats, f: (x: AttackSource, o: ReturnType<typeof offense>) => number) => {
    const x = src(s);
    return x ? f(x, offense(s, raid)) * x.attacksPerSec * x.critMult : 0;
  };
  // The NPC's swing that deals NPC_POWER × those averages through the boss's mitigation at the NPC's penetration.
  const npc = { ...offense({ ...players[0], armorPen, magicPen, effects: new Map() }, raid) };
  const swing = aps * critMult;
  const sources: AttackSource[] = swing > 0
    ? [{
        hit: {
          Physical: (NPC_POWER * avg(s => perSec(s, (x, o) => x.hit.Physical * (1 - o.mitP)))) / swing / Math.max(1e-9, 1 - npc.mitP),
          Magic: (NPC_POWER * avg(s => perSec(s, (x, o) => x.hit.Magic * (1 - o.mitM)))) / swing / Math.max(1e-9, 1 - npc.mitM),
        },
        heal: (NPC_POWER * avg(s => perSec(s, x => x.heal))) / swing,
        healAll: true,
        attacksPerSec: aps,
        critChance,
        critMult,
      }]
    : [];
  return {
    level: Math.round(avg(s => s.level)),
    sources,
    critDamage: avg(s => s.critDamage),
    armorPen,
    magicPen,
    maxHp: NPC_POWER * avg(s => s.maxHp),
    regen: NPC_POWER * avg(s => s.regen),
    armor: NPC_POWER * avg(s => s.armor),
    resistance: NPC_POWER * avg(s => s.resistance),
    evasionRating: NPC_POWER * avg(s => s.evasionRating),
    lifesteal: 0,
    threat: NPC_POWER * avg(s => s.threat),
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
  const raw = JSON.parse(json) as { raidId: number; fighters: { characterId: string; name: string; stats: CombatStats & { effects: [number, number][] } }[] };
  return {
    raidId: raw.raidId,
    fighters: raw.fighters.map(f => ({ ...f, characterId: BigInt(f.characterId), stats: { ...f.stats, effects: new Map(f.stats.effects) } })),
  };
}

// ---------------------------------------------------------------- rewards

/** One fighter's item for a rewarded kill: Epic or better of the raid's tier, a Unique from the raid's own pool. */
export function rollRaidItem(rng: Rng, raid: RaidDef): NewItem {
  const r = rng();
  const uniques = raidUniques(raid.id);
  if (r < RAID_RARITY_ODDS.Unique && uniques.length) return makeUnique(rng, uniques[Math.floor(rng() * uniques.length)]);
  const rarity = r < RAID_RARITY_ODDS.Unique + RAID_RARITY_ODDS.Legendary ? 'Legendary' : 'Epic';
  const drops = raid.boss.drops;
  return makeItem(rng, drops[Math.floor(rng() * drops.length)], raid.tier, rarity);
}

export const raidLootRng = (partyId: bigint, startMicros: bigint, characterId: bigint): Rng => seededRng(partyId, startMicros, characterId, RAID_LOOT_SALT);

const DAY_MICROS = 86_400_000_000n;
/** Raid rewards are once per character per raid per day: the current day started here (00:00 UTC). */
export const lockoutStart = (nowMicros: bigint): bigint => nowMicros - (nowMicros % DAY_MICROS);
/** When the current lockout ends. */
export const lockoutEnd = (nowMicros: bigint): bigint => lockoutStart(nowMicros) + DAY_MICROS;
