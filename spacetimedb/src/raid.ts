// Raid fights (docs/design/raids.md): a party of up to RAID_PARTY_SIZE against a raid
// boss, online only. Pure and deterministic, like sim.ts: the server plays the whole
// fight when the leader starts it (that decides the outcome), and every client in the
// party replays the very same fight from the stored setup and seed to animate it.

import { critMultAgainst, defenseAgainst, effectDamageMult, matchup, mitigation, parrySource, type CombatStats } from './combat';
import { DRAWING_FIRE, Effect, LAST_STAND_BELOW, MOONLIGHT_EVERY, STOKE, TWIN_FLAME, effectAmount, rallyMult, waxingMult } from './data/legendary';
import { NPC_POWER, RAID_RARITY_ODDS, THREAT_FOCUS, bossPhases, empoweredSignature, raidBosses, type RaidDef, type RaidSignature } from './data/raids';
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
  /** A duo raid: the brother this fighter attacks (index in `raidBosses`), as the leader assigned. */
  target?: number;
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
  /**
   * 'phase': the boss turns to its next Lunar Phase (`phase`). 'special': a boss's single-target
   * signature (Anvil Slam). 'fall': a duo brother falls (the other starts absorbing him).
   * 'empower': the survivor finished absorbing and empowers.
   */
  kind: 'hit' | 'crit' | 'dodge' | 'aoe' | 'special' | 'phase' | 'fall' | 'empower';
  /** The boss's target (fighter index); -1 when a fighter hits the boss, for the boss's AoE and a phase change. */
  target: number;
  /** The boss it's about (index in `raidBosses`): the one hit, attacking, falling or empowering. */
  boss?: number;
  /** Damage dealt (to the boss by a fighter; to the target, or to each fighter for an AoE, before their own mitigation is shown). */
  damage: number;
  /** Every fighter's HP after the event. */
  hp: number[];
  /** Every boss's HP after the event (`raidBosses` order). */
  bossHp: number[];
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

type Offense = ReturnType<typeof offense>;

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
    // Deadeye: crits ignore a share of the boss's mitigation. Parry and Thrust: a parried swing's crit.
    critX: s.effects.has(Effect.ParryAndThrust)
      ? critMultAgainst(parrySource(src, s.critDamage), { Physical: mitP, Magic: mitM }, amount(Effect.Deadeye))
      : crit > 0 ? 1 + (critMultAgainst(src, { Physical: mitP, Magic: mitM }, amount(Effect.Deadeye)) - 1) / crit : 1,
    mitP,
    mitM,
  };
}

/** A boss's special attack as the fight plays it: a duo brother's signature, or a raid's `aoe` (split or not). */
type Special = RaidSignature & { split?: boolean };

/** One boss in a fight: as it is now (its phase or empowered form), its HP and its timers. */
interface BossState {
  def: EnemyDef;
  maxHp: number;
  hp: number;
  /** Fighters' offense against it, and their defense against its attacks, per fighter. */
  off: Offense[];
  defense: { mitigation: number; evasion: number }[];
  special?: Special;
  /** Fighters' mitigation against its special attack. */
  specialMit: number[];
  nextAttack: number;
  nextSpecial: number;
}

/** Each boss of a raid with its special: a duo's brothers with their signatures, or the boss with the raid's `aoe`. */
export function raidSpecials(raid: RaidDef): { def: EnemyDef; special?: Special }[] {
  if (raid.duo) return raid.duo.bosses.map(b => ({ def: b.enemy, special: b.signature }));
  const a = raid.aoe;
  return [{ def: raid.boss, special: a && { name: a.name, icon: a.icon, every: a.every, damage: a.damage, damageType: a.damageType, aoe: true, split: a.split } }];
}

/**
 * Threat a fighter has against boss `b` of a duo: +`focusThreat` against the brother it attacks,
 * and Drawing Fire's × DRAWING_FIRE against the one it doesn't. One boss: just its threat.
 */
export function duoThreat(raid: RaidDef, s: CombatStats, target: number, b: number): number {
  if (!raid.duo) return s.threat;
  return target === b ? s.threat + raid.duo.focusThreat : s.threat * (s.effects.has(Effect.DrawingFire) ? DRAWING_FIRE : 1);
}

/**
 * One raid fight. Every fighter swings at its boss on its own timer (the matchup formulas per
 * swing: mitigation, penetration, crits, ±10% variance). Each boss attack picks a living
 * fighter weighted by threat (`threatWeight`, `duoThreat`): the more threat, the more of the
 * attacks, but anyone can be hit. It is dodged at the target's evasion. A boss's special
 * (a raid's `aoe`, a duo brother's signature) hits every living fighter, shares its damage
 * (`split`), or hits one fighter picked by threat, every `every` seconds; it can't be dodged.
 * With Lunar Phases (`raid.phases`) the boss turns to its next phase every `phases.every`
 * seconds and takes that phase's armor, resistance and damage type.
 *
 * A duo (`raid.duo`): each fighter attacks the brother it was assigned (`RaidFighter.target`),
 * and the other when its own falls. When one falls the survivor absorbs him for
 * `absorbSeconds`; still standing then, he empowers (his `empowered` twist).
 *
 * Heals go to the most hurt living ally ("single", and Twin Flame's share to the next) or
 * are split across the living party ("all"); lifesteal and regen heal yourself. The highest
 * Frostbite chill in the party shrinks all the bosses' damage. Executioner, Bully,
 * Berserker, Ambush, Riposte, Second Wind, Second Skin, Stoneskin, Bulwark, Last Stand,
 * Thornshell, Zealot's Oath, Moonlight, Waxing Moon, Fading Rally (the wearer's swings
 * only), Parry and Thrust and Afterimage work as in a solo fight, and so do Phials (Warding
 * shrinks the hits taken, Renewal heals once below half HP). Stoke the Fire counts every
 * fallen fighter and boss. Follow-through does nothing here: there is no next enemy. The
 * party wins when every boss is dead, and loses when everyone is dead or at the enrage timer.
 */
export function simulateRaid(setup: RaidSetup, raid: RaidDef, rng: Rng, record = true): RaidResult {
  const fighters = setup.fighters.map(f => f.stats);
  const n = fighters.length;
  const duo = raid.duo;
  // Lunar Phases (one boss only): each fighter's offense and defense per phase.
  const phases = bossPhases(raid);
  const offs = phases.map(p => fighters.map(s => offense(s, p)));
  const defenses = phases.map(p => fighters.map(s => defenseAgainst(s, p.damageType, p.level)));
  let phase = 0;
  const maxHp = fighters.map(s => s.maxHp);
  const hp = [...maxHp];
  const chill = Math.max(0, ...fighters.map(s => s.chill));
  const specialMit = (special: Special | undefined, level: number) =>
    fighters.map(s => (special ? defenseAgainst(s, special.damageType, level).mitigation : 0));
  const bosses: BossState[] = raidSpecials(raid).map(({ def, special }) => ({
    def,
    maxHp: def.hp,
    hp: def.hp,
    off: duo ? fighters.map(s => offense(s, def)) : offs[0],
    defense: duo ? fighters.map(s => defenseAgainst(s, def.damageType, def.level)) : defenses[0],
    special,
    specialMit: specialMit(special, def.level),
    nextAttack: Infinity,
    nextSpecial: special?.every ?? Infinity,
  }));
  const bossAlive = (b: number) => bosses[b].hp > 0;
  // Each fighter's boss: its assignment (one boss: 0).
  const target = setup.fighters.map(f => (duo ? Math.max(0, Math.min(bosses.length - 1, f.target ?? 0)) : 0));
  const amount = (i: number, id: number) => effectAmount(fighters[i].effects, id);
  const ambush = fighters.map(s => (s.effects.has(Effect.Ambush) ? 5 : 1));
  const swings = fighters.map(() => 0);
  const lastDodged = fighters.map(() => false);
  // Parry and Thrust: dodged since their last swing.
  const parried = fighters.map(() => false);
  const rally = fighters.map(s => s.effects.has(Effect.FadingRally));
  const secondWind = fighters.map((_, i) => amount(i, Effect.SecondWind));
  const renewal = fighters.map(s => s.renewal ?? 0);
  const shield = fighters.map((s, i) => amount(i, Effect.SecondSkin) * s.maxHp);
  // First swings land at a random point of their first period (half a period on average).
  const first = (period: number) => (Number.isFinite(period) ? rng() * period : Infinity);
  const next = fighters.map((_, i) => first(bosses[target[i]].off[i].period / (rally[i] ? rallyMult(1) : 1)));
  for (const b of bosses) b.nextAttack = first(1 / b.def.speed);
  let nextPhase = raid.phases?.every ?? Infinity;
  /** A duo: the survivor absorbing his fallen brother, until when. */
  let absorbing: { boss: number; until: number } | undefined;
  const empowered = bosses.map(() => false);
  const events: RaidEvent[] = [];
  let now = 0;
  const alive = (i: number) => hp[i] > 0;
  const done = (end: number, won: boolean, enraged = false): RaidResult => ({ events, maxHp, end, won, enraged });

  const shielded = shield.some(x => x > 0);
  /** What the last `hurt` dealt and whether Bulwark blocked it (for the event). */
  let dealt = 0;
  let blocked = false;

  /** `i` takes `damage` of `type` from boss `b`; Thornshell reflects some in that type. Returns whether Second Wind saved them. */
  const hurt = (i: number, damage: number, type: DamageType, b: number): boolean => {
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
    const o = bosses[b].off[i];
    const thorns = amount(i, Effect.Thornshell) * damage * effectDamageMult(fighters[i].effects) * (1 - (type === 'Physical' ? o.mitP : o.mitM));
    bosses[b].hp = Math.max(0, bosses[b].hp - thorns);
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
    if (record) events.push({ ...e, hp: [...hp], bossHp: bosses.map(x => x.hp), ...(shielded && { shield: [...shield] }) });
  };
  /** A living fighter picked by boss `b`, weighted by threat. */
  const pickTarget = (b: number) => {
    const living = hp.map((_, i) => i).filter(alive);
    const w = (i: number) => threatWeight(duoThreat(raid, fighters[i], target[i], b));
    let r = rng() * living.reduce((sum, i) => sum + w(i), 0);
    return living.find(i => (r -= w(i)) < 0) ?? living[living.length - 1];
  };
  /** A duo: × brother `b`'s damage while both stand (`together`); alone, full strength, more once empowered (`absorbed`). */
  const bond = (b: number) => (!duo ? 1 : bosses.every(x => x.hp > 0) ? duo.together : empowered[b] ? duo.absorbed : 1);
  /** A duo brother's twist, once he has absorbed the other. */
  const empower = (b: number, t: number) => {
    const d = duo!.bosses[b];
    const x = bosses[b];
    x.def = { ...x.def, ...(d.empowered.armor !== undefined && { armor: d.empowered.armor }), ...(d.empowered.resistance !== undefined && { resistance: d.empowered.resistance }) };
    x.off = fighters.map(s => offense(s, x.def));
    x.special = empoweredSignature(d);
    x.specialMit = specialMit(x.special, x.def.level);
    x.nextSpecial = t + x.special.every;
    x.hp = Math.min(x.maxHp, x.hp + (d.empowered.heal ?? 0) * x.maxHp);
    empowered[b] = true;
  };

  for (;;) {
    const fighterAt = Math.min(...next);
    const t = Math.min(fighterAt, nextPhase, absorbing?.until ?? Infinity, ...bosses.map(b => Math.min(b.nextSpecial, b.nextAttack)));
    if (t > raid.enrageSeconds) return done(raid.enrageSeconds, false, true);
    for (let i = 0; i < n; i++) heal(i, fighters[i].regen * (t - now));
    now = t;
    const specialBoss = bosses.findIndex(b => b.nextSpecial === t);
    const attackBoss = bosses.findIndex(b => b.nextAttack === t);

    if (t === nextPhase) {
      nextPhase += raid.phases!.every;
      phase = (phase + 1) % phases.length;
      bosses[0].def = phases[phase];
      bosses[0].off = offs[phase];
      bosses[0].defense = defenses[phase];
      push({ t, by: -1, kind: 'phase', target: -1, damage: 0, phase });
    } else if (absorbing && t === absorbing.until) {
      // Absorption done: the survivor empowers.
      const b = absorbing.boss;
      absorbing = undefined;
      empower(b, t);
      push({ t, by: -1, kind: 'empower', target: -1, damage: 0, boss: b });
    } else if (specialBoss >= 0) {
      const b = specialBoss;
      const x = bosses[b];
      const sp = x.special!;
      x.nextSpecial += sp.every;
      const hit = sp.damage * (1 - chill) * bond(b);
      const saved: number[] = [];
      if (sp.aoe) {
        // A split AoE (Moonfall) is shared by the living: the fewer left, the harder each is hit.
        const share = sp.split ? hit / hp.filter(h => h > 0).length : hit;
        for (let i = 0; i < n; i++) if (alive(i) && hurt(i, share * (1 - x.specialMit[i]) * (0.9 + 0.2 * rng()), sp.damageType, b)) saved.push(i);
        push({ t, by: -1, kind: 'aoe', target: -1, damage: share, boss: b, ...(saved.length && { saved }) });
      } else {
        // One fighter, picked by threat like an attack, can't be dodged (Anvil Slam).
        const i = pickTarget(b);
        const damage = hit * (1 - x.specialMit[i]) * (0.9 + 0.2 * rng());
        if (hurt(i, damage, sp.damageType, b)) saved.push(i);
        push({ t, by: -1, kind: 'special', target: i, damage, dealt, boss: b, ...(blocked ? { blocked: true } : {}), ...(saved.length && { saved }) });
      }
    } else if (attackBoss >= 0) {
      const b = attackBoss;
      const x = bosses[b];
      x.nextAttack += 1 / x.def.speed;
      // The boss picks a living fighter, weighted by threat (`threatWeight`).
      const tgt = pickTarget(b);
      if (rng() < x.defense[tgt].evasion) {
        lastDodged[tgt] = true;
        parried[tgt] = true;
        // Riposte: the dodge counters for a share of an average hit.
        const o = x.off[tgt];
        const counter = amount(tgt, Effect.Riposte) * o.hit * (1 + o.crit * (o.critX - 1));
        if (counter > 0) x.hp = Math.max(0, x.hp - counter);
        push({ t, by: -1, kind: 'dodge', target: tgt, damage: 0, boss: b });
      } else {
        const damage = (x.def.dps / x.def.speed) * (1 - chill) * bond(b) * (1 - x.defense[tgt].mitigation) * (0.9 + 0.2 * rng());
        const saved = hurt(tgt, damage, x.def.damageType, b);
        push({ t, by: -1, kind: 'hit', target: tgt, damage, dealt, boss: b, ...(blocked ? { blocked: true } : {}), ...(saved && { saved: [tgt] }) });
      }
    } else {
      const a = next.indexOf(fighterAt);
      const b = target[a];
      const x = bosses[b];
      const o = x.off[a];
      // Fading Rally: swing k comes at rallyMult(k) × the fighter's speed.
      swings[a] += 1;
      next[a] += o.period / (rally[a] ? rallyMult(swings[a] + 1) : 1);
      const fx = fighters[a].effects;
      const isCrit = fx.has(Effect.ParryAndThrust) ? parried[a] : rng() < o.crit;
      parried[a] = false;
      const critX = isCrit ? o.critX : 1;
      const doubled = x.hp < amount(a, Effect.Executioner) * x.maxHp || x.hp > (1 - amount(a, Effect.Bully)) * x.maxHp ? 2 : 1;
      // Berserker: more damage the more of your max HP is missing.
      const rage = 1 + (10 * amount(a, Effect.Berserker) * (maxHp[a] - hp[a])) / maxHp[a];
      // Moonlight: every 3rd swing hits twice. Waxing Moon: swing k × waxingMult(k).
      const wave = fx.has(Effect.Moonlight) && swings[a] % MOONLIGHT_EVERY === 0 ? 2 : 1;
      const wax = fx.has(Effect.WaxingMoon) ? waxingMult(swings[a]) : 1;
      // Stoke the Fire: more damage for every fallen fighter and boss.
      const stoke = fx.has(Effect.StokeTheFire) ? 1 + STOKE * (hp.filter(h => h <= 0).length + bosses.filter(y => y.hp <= 0).length) : 1;
      let damage = o.hit * critX * (0.9 + 0.2 * rng()) * doubled * ambush[a] * rage * wave * wax * stoke;
      ambush[a] = 1;
      const healed = o.heal * critX;
      // Zealot's Oath: heals also hit for a share of the heal (magic).
      damage += amount(a, Effect.ZealotsOath) * healed * effectDamageMult(fighters[a].effects) * (1 - o.mitM);
      x.hp = Math.max(0, x.hp - damage);
      if (healed > 0) {
        const living = hp.map((_, i) => i).filter(alive);
        if (o.healAll) for (const i of living) heal(i, healed / living.length);
        else {
          const hurtFirst = [...living].sort((p, q) => hp[p] / maxHp[p] - hp[q] / maxHp[q]);
          heal(hurtFirst[0], healed);
          // Twin Flame: the next most hurt ally gets a share too.
          if (fx.has(Effect.TwinFlame) && hurtFirst[1] !== undefined) heal(hurtFirst[1], TWIN_FLAME * healed);
        }
      }
      heal(a, fighters[a].lifesteal * damage);
      push({ t, by: a, kind: isCrit ? 'crit' : 'hit', target: -1, damage, boss: b });
    }

    // A boss that just fell: the fight is won when every boss has; in a duo the survivor starts absorbing him.
    for (let b = 0; b < bosses.length; b++) {
      const x = bosses[b];
      if (x.hp > 0 || x.nextAttack === Infinity) continue;
      x.nextAttack = Infinity;
      x.nextSpecial = Infinity;
      if (absorbing?.boss === b) absorbing = undefined;
      const other = bosses.findIndex((_, c) => c !== b && bossAlive(c));
      if (other < 0) continue;
      for (let i = 0; i < n; i++) {
        if (target[i] !== b) continue;
        // Its fighters turn on the other brother, their next swing on his timer.
        target[i] = other;
        if (Number.isFinite(next[i])) next[i] = t + bosses[other].off[i].period / (rally[i] ? rallyMult(swings[i] + 1) : 1);
      }
      if (duo && !empowered[other]) absorbing = { boss: other, until: t + duo.absorbSeconds };
      push({ t, by: -1, kind: 'fall', target: -1, damage: 0, boss: b });
    }
    if (bosses.every(x => x.hp <= 0)) return done(t, true);
    // The dead stop swinging.
    for (let i = 0; i < n; i++) if (!alive(i)) next[i] = Infinity;
    if (!hp.some(h => h > 0)) return done(t, false);
  }
}

/**
 * Each brother's time to fall in a duo with `targets` (index per fighter), from DPS alone (no deaths,
 * switching or effects): what the Raids page shows the leader. Infinity for a brother nobody attacks.
 */
export function duoFallTimes(raid: RaidDef, stats: readonly CombatStats[], targets: readonly number[]): number[] {
  return raidBosses(raid).map((boss, b) => {
    const dps = stats.reduce((sum, s, i) => sum + (targets[i] === b ? matchup(s, boss).dps : 0), 0);
    return dps > 0 ? boss.hp / dps : Infinity;
  });
}

/**
 * A duo assignment where both brothers fall as close together as possible (fewest seconds
 * apart, from `duoFallTimes`): every split is tried. One boss: everyone on it.
 */
export function balancedTargets(raid: RaidDef, stats: readonly CombatStats[]): number[] {
  if (!raid.duo) return stats.map(() => 0);
  let best: number[] = stats.map(() => 0);
  let gap = Infinity;
  for (let mask = 0; mask < 1 << stats.length; mask++) {
    const targets = stats.map((_, i) => (mask >> i) & 1);
    const [a, b] = duoFallTimes(raid, stats, targets);
    const g = Math.abs(a - b);
    if (g < gap) [best, gap] = [targets, g];
  }
  return best;
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
