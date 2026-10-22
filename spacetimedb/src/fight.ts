// One live fight (combat.md), played hit by hit, and the offline kill rate sampled from
// such fights. Pure and deterministic: each fight's rolls come from a seeded generator.
// The back-to-back online settle (`simulate`) is in sim.ts.

import { type CombatStats, type Matchup } from './combat';
import type { EnemyDef } from './data/zones';
import { simulateBattle, type BattleEvent, type FoeSpec } from './battle';
import { seededRng, type Rng } from './loot';

/** A fight not over after this long is a stalemate: time passes with no effect. */
export const MAX_FIGHT_SECONDS = 600;

/** Mixed into fight seeds, so they never reuse a drop roll's seed. */
const FIGHT_SALT = 0x6669676874n; // "fight"

export const fightRng = (characterId: bigint, startMicros: bigint): Rng => seededRng(characterId, startMicros, FIGHT_SALT);

export interface FightEvent {
  /** Seconds since the fight started (walk included). */
  t: number;
  /** Who acted: your swing hits the enemy (and heals you); the enemy's hits you; 'none' for a regen tick. */
  by: 'you' | 'enemy' | 'none';
  /** `miss`: an evasive enemy dodged your swing; `dodge`: you dodged the enemy's; `regen`: the once-a-second regen tick. */
  kind: 'hit' | 'crit' | 'miss' | 'dodge' | 'regen';
  /** Damage dealt (0 for a miss, a dodge or a regen tick). */
  damage: number;
  /** HP you got back with this event: a swing's heal and lifesteal, or a tick's regen. */
  healed: number;
  youHp: number;
  foeHp: number;
  /** HP the enemy regenerated, on regen ticks (a regenerating enemy only). */
  foeHealed?: number;
  /** Second Wind saved you from this hit. */
  secondWind?: boolean;
  /** HP a Phial of Renewal healed after this event took you below half HP. */
  renewed?: number;
  /** Second Skin's shield left after this event, while it lasts. */
  shield?: number;
  /** Follow-through: the previous kill's overkill landing as the fight starts. */
  carried?: boolean;
  /** Bulwark blocked half of this hit. */
  blocked?: boolean;
  /** Moonlight: this swing hit twice. */
  wave?: boolean;
  /** The enemy couldn't be damaged when this swing landed (`FightMods.immuneUntil`, `eclipse`). */
  immune?: boolean;
  /** An undodgeable burst (`FightMods.burst`), not a regular swing. */
  burst?: boolean;
  /** Damage your swing reflected back at you (`FightMods.reflect`). */
  reflected?: number;
  /** Riposte: what your counter to this dodge dealt. */
  countered?: number;
  /** Thornshell: what this hit reflected back at the enemy. */
  thorns?: number;
  /** HP the enemy drained from this hit (`FightMods.drain`). */
  drained?: number;
}

/**
 * Optional changes to a fight, for Moonwell Deep fights (abyss.ts, abyss.md): where it
 * starts, and the enemy's affixes. None of them exist in zone fights.
 */
export interface FightMods {
  /** Seconds of walking before the first swing (default: the character's walk time). */
  walk?: number;
  /** HP at the start (default: max HP). */
  startHp?: number;
  /** Second Wind left, as a share of max HP (default: the worn amount): once per Deep depth, not per fight. */
  secondWind?: number;
  /** Renewal left, as a share of max HP (default: the Phial's, `CombatStats.renewal`): once per Deep depth too. */
  renewal?: number;
  /** Seconds after the walk before the fight ends as a stalemate (default MAX_FIGHT_SECONDS). */
  timeLimit?: number;
  /** The enemy heals this share of the damage it deals to your HP. */
  drain?: number;
  /** The enemy takes no damage before this many seconds after the walk. */
  immuneUntil?: number;
  /** The enemy takes no damage for `length` seconds every `every` seconds (from `every` on). */
  eclipse?: { every: number; length: number };
  /** The enemy's hits grow by `step` (+10% = 0.1) every `every` seconds. */
  ramp?: { every: number; step: number };
  /** Every `every` seconds the enemy also hits for `mult` × its hit; it can't be dodged. */
  burst?: { every: number; mult: number };
  /** × your heals, regen and lifesteal. */
  healMult?: number;
  /** Thorned: this share of each of your hits comes back at you, in the types dealt, cut by your own defense (battle.ts `thornedShare`). */
  thorned?: number;
  /** Tidal: the enemy's hits are half physical, half magic. */
  mixed?: boolean;
}

export interface Fight {
  stats: CombatStats;
  matchup: Matchup;
  enemy: EnemyDef;
  /** Seconds of walking before the first swing. */
  walk: number;
  events: FightEvent[];
  /** Seconds from the fight's start to its end (the kill, the defeat or the stalemate). */
  end: number;
  outcome: 'kill' | 'defeat' | 'stalemate';
  /** Your HP when the fight started (max HP, or `FightMods.startHp`). */
  startHp: number;
  /** Your HP when the fight ended. */
  hpLeft: number;
  /** Second Wind left after the fight (0 once it triggered). */
  secondWindLeft: number;
  /** Renewal left after the fight (0 once it triggered). */
  renewalLeft: number;
}

/** The enemy of a fight as a battle foe, with its `mods` affixes. */
export function fightFoe(enemy: EnemyDef, mods: FightMods = {}): FoeSpec {
  return {
    kind: 'foe',
    def: enemy,
    ...(mods.drain && { drain: mods.drain }),
    ...(mods.immuneUntil && { immuneUntil: mods.immuneUntil }),
    ...(mods.eclipse && { eclipse: mods.eclipse }),
    ...(mods.ramp && { ramp: mods.ramp }),
    ...(mods.burst && { special: { every: mods.burst.every, mult: mods.burst.mult, aoe: false } }),
    ...(mods.healMult !== undefined && { healMult: mods.healMult }),
    ...(mods.thorned && { thorned: mods.thorned }),
    ...(mods.mixed && { mixed: true }),
  };
}

/**
 * A battle's events as one fight's, between player `you` and foe `foe` (battle.ts actor
 * indexes), with times from `start`. Events that are neither's swing (another foe entering,
 * a fall) pass their regen and heals on to the next one shown.
 */
export function fightEvents(events: readonly BattleEvent[], you: number, foe: number, start: number, showShield: boolean, foeRegen: boolean): FightEvent[] {
  const out: FightEvent[] = [];
  let healed = 0;
  let foeHealed = 0;
  for (const e of events) {
    healed += e.healed[you];
    foeHealed += e.healed[foe];
    if (e.kind === 'regen' && (healed > 0 || foeHealed > 0)) {
      out.push({ t: e.t - start, by: 'none', kind: 'regen', damage: 0, healed, youHp: e.hp[you], foeHp: e.hp[foe], ...(foeRegen && { foeHealed }) });
      healed = 0;
      foeHealed = 0;
      continue;
    }
    if (e.by !== you && e.by !== foe) continue;
    const mine = e.by === you;
    const f: FightEvent = {
      t: e.t - start,
      by: mine ? 'you' : 'enemy',
      kind: mine ? (e.kind === 'miss' ? 'miss' : e.kind === 'crit' ? 'crit' : 'hit') : e.kind === 'miss' ? 'dodge' : 'hit',
      damage: mine ? e.damage : e.dealt ?? 0,
      healed,
      youHp: e.hp[you],
      foeHp: e.hp[foe],
    };
    healed = 0;
    if (showShield && e.shield) f.shield = e.shield[you];
    if (e.saved?.includes(you)) f.secondWind = true;
    if (e.renewed) f.renewed = e.renewed;
    if (mine) {
      if (e.kind === 'carry') f.carried = true;
      if (e.wave) f.wave = true;
      if (e.immune) f.immune = true;
      if (e.reflected) f.reflected = e.reflected;
    } else {
      if (e.kind === 'special') f.burst = true;
      if (e.blocked) f.blocked = true;
      if (foeRegen) f.foeHealed = foeHealed;
      if (e.countered) f.countered = e.countered;
      if (e.reflected) f.thorns = e.reflected;
      if (e.drained) f.drained = e.drained;
      foeHealed = 0;
    }
    out.push(f);
  }
  return out;
}

/**
 * One fight (battle.ts): a walk, then you and the enemy swing on your own timers until one
 * drops, every effect played per hit by `Fighter`. Swing timers start half a period in, so
 * on average a fight lasts what the formulas (`matchup`) say. Unlike the formulas, HP can't
 * go above max (overhealing is lost) and damage varies ±10%. Follow-through lands the average
 * overkill as the fight starts (so each fight stays on its own). `mods` (Moonwell Deep fights
 * only) change the start, the time limit and the enemy; see FightMods. `record: false` skips
 * the events (kill-rate estimates).
 */
export function simulateFight(s: CombatStats, m: Matchup, enemy: EnemyDef, rng: Rng, mods: FightMods = {}, record = true): Fight {
  const walk = mods.walk ?? s.walkTime;
  const r = simulateBattle({
    sides: [[{ kind: 'player', stats: s, start: { hp: mods.startHp, secondWind: mods.secondWind, renewal: mods.renewal } }], [fightFoe(enemy, mods)]],
    walk,
    firstSwing: 'half',
    timeLimit: mods.timeLimit ?? MAX_FIGHT_SECONDS,
    onTimeout: 'draw',
    followThrough: true,
    record,
  }, rng);
  const you = r.fighters[0]!;
  return {
    stats: s, matchup: m, enemy, walk,
    events: record ? fightEvents(r.events, 0, 1, 0, m.shield > 0, (enemy.regen ?? 0) > 0) : [],
    end: r.end,
    outcome: r.winner === 0 ? 'kill' : r.winner === 1 ? 'defeat' : 'stalemate',
    startHp: Math.min(s.maxHp, mods.startHp ?? s.maxHp),
    hpLeft: you.hp,
    secondWindLeft: you.secondWind,
    renewalLeft: you.renewal,
  };
}

/**
 * Seconds a character lies defeated before fighting the same target again, after losing
 * a live fight it wins on average (`matchup().viable`): bad luck costs a little time,
 * not the rest of the session (combat.md, "Defeat").
 */
export const RESPAWN_SECONDS = 30;

/** A defeat the character gets up from: a lost fight in a matchup it wins on average. */
export const respawns = (f: Fight) => f.outcome === 'defeat' && f.matchup.viable;

/** Seconds from a fight's start until the next one starts: its end, plus the respawn after a defeat that has one. */
export const fightSpan = (f: Fight) => f.end + (respawns(f) ? RESPAWN_SECONDS : 0);

/** Live fights sampled per offline estimate (`liveKillRate`). */
const ODDS_SAMPLES = 400;
const ODDS_SALT = 0x0dd5n;

/**
 * Kills per second that live fights of `stats` against `enemy` average out to, for the
 * offline settle (`project`), and the share of fights lost. Won fights take the formula's
 * time (`m.killRate`); lost ones (and stalemates) their sampled time, a defeat plus its
 * respawn (`fightSpan`). Sampled with fixed seeds, so a matchup always gets the same
 * estimate, and one that never loses settles exactly as by the formulas. Only for a
 * viable matchup: any other defeat ends farming.
 */
export function liveKillRate(stats: CombatStats, m: Matchup, enemy: EnemyDef): { killRate: number; lossShare: number } {
  if (!Number.isFinite(m.timeToDie) || m.killRate <= 0) return { killRate: m.killRate, lossShare: 0 };
  let wins = 0;
  let lostSpan = 0;
  for (let i = 0; i < ODDS_SAMPLES; i++) {
    const f = simulateFight(stats, m, enemy, seededRng(ODDS_SALT, BigInt(i)), {}, false);
    if (f.outcome === 'kill') wins++;
    else lostSpan += fightSpan(f);
  }
  if (wins === ODDS_SAMPLES) return { killRate: m.killRate, lossShare: 0 };
  return { killRate: wins / (wins / m.killRate + lostSpan), lossShare: 1 - wins / ODDS_SAMPLES };
}
