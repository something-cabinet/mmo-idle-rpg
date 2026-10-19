// Moonwell Deep fights (docs/design/abyss.md): a basic enemy, an Elite and the Deep Warden,
// fought back to back on one HP bar. Pure and deterministic, like raid.ts: the server plays
// the whole depth when the player starts it (that decides the outcome), and the client
// replays the very same depth from the stored stats and seed to animate it. Each enemy is a
// solo fight (fight.ts `simulateFight`) with `FightMods` for the HP carried in and the affixes.

import { defenseAgainst, matchup, type CombatStats, type Matchup } from './combat';
import {
  ABYSS_KINDS_BY_ID, ABYSS_SEASON, BossAffix, DEEP_WARDEN, DEPTH_TIME_LIMIT, EliteAffix, PROFILE, bossName, depthEnemy, depthLineup,
  eliteName, evasiveRating, type DepthLineup, type DepthSlot,
} from './data/abyss';
import { Effect, effectAmount } from './data/legendary';
import type { Defense, EnemyDef } from './data/zones';
import { seededRng, type Rng } from './loot';
import { simulateFight, type Fight, type FightMods } from './fight';

const ABYSS_SALT = 0x64656570n; // "deep"
/** Depths behind the Scout odds. */
export const DEPTH_ODDS_SAMPLES = 200;

export const depthRng = (characterId: bigint, startMicros: bigint): Rng => seededRng(characterId, startMicros, ABYSS_SALT);

/** One enemy of a depth, as `stats` will fight it: its affixes resolved against that build. */
export interface DepthFoe {
  slot: DepthSlot;
  /** Pool kind ID, or the Deep Warden's. */
  kindId: number;
  /** The Elite's one affix, or the boss's Boss affixes; none for the basic. */
  affixes: number[];
  enemy: EnemyDef;
  /** Your matchup against it. */
  matchup: Matchup;
  mods: FightMods;
}

/** The damage type `s` deals most of (physical when equal, e.g. a pure healer). */
export function mainDamageType(s: CombatStats): 'Physical' | 'Magic' {
  const src = s.sources[0];
  return src && src.hit.Magic > src.hit.Physical ? 'Magic' : 'Physical';
}

/**
 * Thorned's reflect (abyss.md, "Elite affixes"): `share` of each hit comes back in the
 * damage types it was dealt in, each cut by your own defense against that type. The split is
 * your damage against `m`'s enemy, after its mitigation.
 */
function thornedReflect(s: CombatStats, m: Matchup, level: number, share: number): number {
  let phys = 0;
  let magic = 0;
  for (const src of s.sources) {
    phys += src.hit.Physical * (1 - m.enemyMitigation.Physical) * src.attacksPerSec;
    magic += src.hit.Magic * (1 - m.enemyMitigation.Magic) * src.attacksPerSec;
  }
  const physShare = phys + magic > 0 ? phys / (phys + magic) : 1;
  return share * (physShare * (1 - defenseAgainst(s, 'Physical', level).mitigation) + (1 - physShare) * (1 - defenseAgainst(s, 'Magic', level).mitigation));
}

/** The defense profile that resists `s`'s main damage type: Armored against physical, Warded against magic. */
export const resistingProfile = (s: CombatStats): Defense => (mainDamageType(s) === 'Physical' ? 'Armored' : 'Warded');

/** The damage type `s` mitigates less of from an attacker of `level`. */
export function weakerDefense(s: CombatStats, level: number): 'Physical' | 'Magic' {
  return defenseAgainst(s, 'Physical', level).mitigation <= defenseAgainst(s, 'Magic', level).mitigation ? 'Physical' : 'Magic';
}

const withProfile = (e: EnemyDef, defense: Defense): EnemyDef => ({
  ...e,
  defense,
  armor: 2.5 * e.level * PROFILE[defense].armor,
  resistance: 2.5 * e.level * PROFILE[defense].resistance,
});

/** Your matchup against `e` when its attacks are half physical, half magic (Tidal): the average hit, and half of Thornshell's reflect in each type. */
function tidalMatchup(s: CombatStats, e: EnemyDef): Matchup {
  const p = matchup(s, { ...e, damageType: 'Physical' });
  const m = matchup(s, { ...e, damageType: 'Magic' });
  return { ...p, enemyHit: (p.enemyHit + m.enemyHit) / 2, incoming: (p.incoming + m.incoming) / 2, dps: (p.dps + m.dps) / 2 };
}

/** The three enemies of `lineup` as `s` fights them (abyss.md, "Enemies"). */
export function depthFoes(s: CombatStats, lineup: DepthLineup): DepthFoe[] {
  const d = lineup.depth;
  const foes: DepthFoe[] = [];

  const kindMods = (kindId: number): FightMods => {
    const k = ABYSS_KINDS_BY_ID.get(kindId)!;
    return { ...(k.drain && { drain: k.drain }), ...(k.veil && { immuneUntil: k.veil }) };
  };

  // Basic: the kind as it is.
  {
    const kind = ABYSS_KINDS_BY_ID.get(lineup.basic)!;
    const enemy = depthEnemy(d, kind, 'basic');
    foes.push({ slot: 'basic', kindId: kind.id, affixes: [], enemy, matchup: matchup(s, enemy), mods: kindMods(kind.id) });
  }

  // Elite: the kind with one Elite affix.
  {
    const kind = ABYSS_KINDS_BY_ID.get(lineup.elite)!;
    const a = lineup.eliteAffix;
    let enemy = depthEnemy(d, kind, 'elite', eliteName(kind, a));
    const mods = kindMods(kind.id);
    if (a === EliteAffix.Vampiric) mods.drain = Math.max(mods.drain ?? 0, 0.5);
    if (a === EliteAffix.WardedShell) enemy = withProfile(enemy, resistingProfile(s));
    if (a === EliteAffix.Swift) enemy = { ...enemy, speed: enemy.speed * 1.5, dps: enemy.dps * 1.5 * 0.75 };
    if (a === EliteAffix.Unyielding) enemy = { ...enemy, regen: (enemy.regen ?? 0) + 0.02 * enemy.hp };
    if (a === EliteAffix.Ravenous) mods.ramp = { every: 5, step: 0.05 };
    const m = matchup(s, enemy);
    if (a === EliteAffix.Thorned) mods.reflect = thornedReflect(s, m, enemy.level, 0.1);
    foes.push({ slot: 'elite', kindId: kind.id, affixes: [a], enemy, matchup: m, mods });
  }

  // Boss: the Deep Warden with its Boss affixes.
  {
    const affixes = lineup.bossAffixes;
    const has = (a: number) => affixes.includes(a);
    let enemy = depthEnemy(d, DEEP_WARDEN, 'boss', bossName(affixes));
    const mods: FightMods = {};
    if (has(BossAffix.Hungering)) mods.ramp = { every: 10, step: 0.1 };
    if (has(BossAffix.Mirrored)) enemy = { ...withProfile(enemy, resistingProfile(s)), damageType: weakerDefense(s, enemy.level) };
    if (has(BossAffix.Moonfall)) mods.burst = { every: 12, mult: 3 };
    if (has(BossAffix.Starless)) mods.healMult = 0.5;
    if (has(BossAffix.Veiled)) enemy = { ...enemy, evasionRating: evasiveRating(enemy.level) };
    if (has(BossAffix.Eclipse)) mods.eclipse = { every: 20, length: 4 };
    const m = has(BossAffix.Tidal) ? tidalMatchup(s, enemy) : matchup(s, enemy);
    foes.push({ slot: 'boss', kindId: DEEP_WARDEN.id, affixes: [...affixes], enemy, matchup: m, mods });
  }
  return foes;
}

export interface DepthResult {
  foes: DepthFoe[];
  /** The fights played, in order; the last is the one that ended the depth. */
  fights: Fight[];
  /** Seconds each fight started at, from the depth's start. */
  starts: number[];
  won: boolean;
  /** Lost to DEPTH_TIME_LIMIT. */
  timedOut: boolean;
  /** Seconds from the start to the last fight's end. */
  end: number;
}

/**
 * One depth: its three enemies back to back, starting at full HP. Each fight starts at the
 * HP the last one left, with no walk; Second Wind and a Phial of Renewal trigger once per depth; the depth is lost
 * at DEPTH_TIME_LIMIT.
 */
export function simulateDepth(s: CombatStats, depth: number, rng: Rng, season = ABYSS_SEASON): DepthResult {
  const foes = depthFoes(s, depthLineup(depth, season));
  const fights: Fight[] = [];
  const starts: number[] = [];
  let hp = s.maxHp;
  let secondWind = effectAmount(s.effects, Effect.SecondWind);
  let renewal = s.renewal ?? 0;
  let elapsed = 0;
  for (const foe of foes) {
    const f = simulateFight(s, foe.matchup, foe.enemy, rng, {
      ...foe.mods, walk: 0, startHp: hp, secondWind, renewal, timeLimit: DEPTH_TIME_LIMIT - elapsed,
    });
    fights.push(f);
    starts.push(elapsed);
    elapsed += f.end;
    hp = f.hpLeft;
    secondWind = f.secondWindLeft;
    renewal = f.renewalLeft;
    if (f.outcome !== 'kill') return { foes, fights, starts, won: false, timedOut: f.outcome === 'stalemate', end: elapsed };
  }
  return { foes, fights, starts, won: true, timedOut: false, end: elapsed };
}

/** Share of DEPTH_ODDS_SAMPLES depths `s` wins at `depth` (the Scout odds), with fixed seeds. */
export function depthOdds(s: CombatStats, depth: number, samples = DEPTH_ODDS_SAMPLES, season = ABYSS_SEASON): number {
  let wins = 0;
  for (let i = 0; i < samples; i++) if (simulateDepth(s, depth, seededRng(ABYSS_SALT, BigInt(depth), BigInt(i)), season).won) wins++;
  return wins / samples;
}

// ---------------------------------------------------------------- storage

/** JSON with bigints kept as "123n" strings. */
const bigReplacer = (_k: string, v: unknown) => (typeof v === 'bigint' ? `${v}n` : v);
const bigReviver = (_k: string, v: unknown) => (typeof v === 'string' && /^-?\d+n$/.test(v) ? BigInt(v.slice(0, -1)) : v);

/**
 * A loadout as stored on the leaderboard (`abyss_record.build`): its items in slot order
 * (null = empty), without row bookkeeping (owner, lock, creation time).
 */
export function encodeBuild<T extends object>(gear: readonly (T | undefined)[]): string {
  return JSON.stringify(gear.map(it => {
    if (!it) return null;
    const { characterId: _c, locked: _l, createdAt: _t, ...rest } = it as Record<string, unknown>;
    return rest;
  }), bigReplacer);
}

/** The items of an `encodeBuild` string, in slot order (undefined = empty). */
export function decodeBuild<T>(json: string): (T | undefined)[] {
  if (!json) return [];
  return (JSON.parse(json, bigReviver) as (T | null)[]).map(it => it ?? undefined);
}

/** `stats` as a string for the Deep log (the effects map doesn't survive JSON on its own). */
export const encodeStats = (s: CombatStats): string => JSON.stringify({ ...s, effects: [...s.effects] });

export function decodeStats(json: string): CombatStats {
  const raw = JSON.parse(json) as CombatStats & { effects: [number, number][] };
  return { ...raw, effects: new Map(raw.effects) };
}
