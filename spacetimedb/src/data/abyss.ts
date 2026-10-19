// The Moonwell Deep (docs/design/abyss.md): an endless solo gauntlet, a basic enemy, an
// Elite and the Deep Warden per depth on one HP bar. Pure data and formulas, shared.
//
// PERMANENT IDS: pool enemy IDs (9101–9108), the Deep Warden (9150), Elite affix IDs and
// Boss affix IDs are stored in Deep logs; never reuse or renumber them. Enemy IDs sit
// above the raid bosses' 9000 + raid ID, outside the zones' zoneId × 100 + n.

import { MATERIAL_KINDS, materialAt, untieredMaterial, type MaterialKind } from './materials';
import { ELIXIRS, SUPPLY_TIERS, elixirSupplyId, gradeOf } from './supplies';
import { ZONES, referenceAccuracy, type Defense, type EnemyDef } from './zones';
import { seededRng } from '../loot';

/** The current season (abyss.md, "Leaderboard"): always 1 until seasons are turned on. */
export const ABYSS_SEASON = 1;
/** The zone whose boss's first kill opens the Deep (Moonveil Vale: Selvara). */
export const ABYSS_UNLOCK_ZONE = 4;

// ---------------------------------------------------------------- scaling

/** The T4 average enemy (zones.md): depth 1's numbers before `ease`. */
export const BASE_HP = 915;
export const BASE_DPS = 53;
/** Growth per depth up to FAST_FROM (the zone curve from T4 to T9), then faster. */
export const HP_GROWTH = 1.06;
export const DPS_GROWTH = 1.04;
export const FAST_FROM = 101;
export const FAST_HP_GROWTH = 1.09;
export const FAST_DPS_GROWTH = 1.06;
/** × every enemy's DPS: three fights on one HP bar. */
export const GAUNTLET = 0.2;
/** Seconds per depth; past it the depth is lost. */
export const DEPTH_TIME_LIMIT = 240;
/** From this depth the Deep Warden has a second Boss affix. */
export const SECOND_BOSS_AFFIX_FROM = 51;

/** The zone tier a depth is as strong as: depth 1 = T4, every 10 depths a tier. */
export const depthTier = (d: number) => 4 + (d - 1) / 10;
/** Enemy level, capped at 100 so your defenses (scaled by the attacker's level) don't decay too. */
export const depthLevel = (d: number) => Math.min(100, 40 + (d - 1));
/** A gentle start: × 0.6 at depth 1, full from depth 6. */
export const ease = (d: number) => Math.min(1, 0.6 + 0.08 * (d - 1));
const grow = (d: number, slow: number, fast: number) => slow ** (Math.min(d, FAST_FROM) - 1) * fast ** Math.max(0, d - FAST_FROM);
/** × BASE_HP at depth `d`. */
export const depthHpMult = (d: number) => grow(d, HP_GROWTH, FAST_HP_GROWTH) * ease(d);
/** × BASE_DPS at depth `d` (before GAUNTLET). */
export const depthDpsMult = (d: number) => grow(d, DPS_GROWTH, FAST_DPS_GROWTH) * ease(d);

// ---------------------------------------------------------------- enemies

export type DepthSlot = 'basic' | 'elite' | 'boss';
/** × the depth's HP and DPS by slot. */
export const SLOT_MULT: Record<DepthSlot, { hp: number; dps: number }> = {
  basic: { hp: 1, dps: 1 },
  elite: { hp: 2.5, dps: 1.3 },
  boss: { hp: 4, dps: 1.6 },
};

/** Armor and resistance × 2.5 × level by defense profile (zones.md). */
export const PROFILE: Record<Defense, { armor: number; resistance: number }> = {
  Balanced: { armor: 1, resistance: 1 },
  Armored: { armor: 2.4, resistance: 0.4 },
  Warded: { armor: 0.4, resistance: 2.4 },
};

/** An evasive enemy dodges a same-level player without accuracy gear this often. */
export const EVASIVE_DODGE = 0.35;
/** The evasion rating of an evasive enemy at `level`. */
export const evasiveRating = (level: number) => (EVASIVE_DODGE / (1 - EVASIVE_DODGE)) * referenceAccuracy(level);

export interface AbyssKind {
  id: number;
  name: string;
  damageType: 'Physical' | 'Magic';
  defense: Defense;
  /** Attacks per second. */
  speed: number;
  /** × the depth's HP and DPS. */
  hp: number;
  dps: number;
  /** Evasive (dodges like an evasive zone enemy), regenerates (share of max HP per second), drains or veils. */
  evasive?: boolean;
  regen?: number;
  /** Heals this share of the damage it deals. */
  drain?: number;
  /** Can't be damaged for this many seconds from the start of its fight. */
  veil?: number;
  twist: string;
}

/** The basic and Elite pool. */
export const ABYSS_KINDS: AbyssKind[] = [
  { id: 9101, name: 'Moonless Shade', damageType: 'Magic', defense: 'Balanced', speed: 1.2, hp: 0.9, dps: 1, evasive: true, twist: 'Hard to hit' },
  { id: 9102, name: 'Drowned Acolyte', damageType: 'Magic', defense: 'Warded', speed: 0.9, hp: 1, dps: 1.1, twist: 'A resistance check' },
  { id: 9103, name: 'Tidebound Husk', damageType: 'Physical', defense: 'Armored', speed: 0.5, hp: 1.4, dps: 0.9, regen: 0.015, twist: 'Regenerates' },
  { id: 9104, name: 'Voidling Swarm', damageType: 'Physical', defense: 'Balanced', speed: 1.8, hp: 0.7, dps: 1.1, twist: 'Very fast small hits' },
  { id: 9105, name: 'Fallen Moonguard', damageType: 'Physical', defense: 'Armored', speed: 0.7, hp: 1.2, dps: 1, twist: 'An armor check' },
  { id: 9106, name: 'Starless Lamprey', damageType: 'Physical', defense: 'Balanced', speed: 1, hp: 1, dps: 1, drain: 0.5, twist: 'Heals from the damage it deals' },
  { id: 9107, name: 'Hollow Choir', damageType: 'Magic', defense: 'Warded', speed: 0.6, hp: 1.1, dps: 1.2, twist: 'Big slow hits' },
  { id: 9108, name: 'Eclipse Moth', damageType: 'Magic', defense: 'Balanced', speed: 1.4, hp: 0.8, dps: 1, veil: 5, twist: "Can't be hurt for its first 5 s" },
];
export const ABYSS_KINDS_BY_ID: ReadonlyMap<number, AbyssKind> = new Map(ABYSS_KINDS.map(k => [k.id, k]));

/** The boss of every depth. */
export const DEEP_WARDEN: AbyssKind = {
  id: 9150, name: 'Deep Warden', damageType: 'Magic', defense: 'Balanced', speed: 0.8, hp: 1, dps: 1, twist: 'Guards each way further down',
};

/**
 * Art ID of the Deep Warden's look for its first Boss affix (abyss.md, "The boss"): one
 * variant per affix, `e-<id>.webp` like enemy art (91501–91508, 91503 unused); the plain Deep Warden
 * (9150) stands in while a variant is missing.
 */
export const wardenArtId = (firstAffix: number) => DEEP_WARDEN.id * 10 + firstAffix;

export const EliteAffix = { Vampiric: 1, WardedShell: 2, Swift: 3, Thorned: 4, Unyielding: 5, Ravenous: 6 } as const;
/** Boss affix IDs; 3 (Lunar Phases) was removed and stays retired. */
export const BossAffix = { Hungering: 1, Mirrored: 2, Moonfall: 4, Starless: 5, Tidal: 6, Veiled: 7, Eclipse: 8 } as const;

export interface AffixDef {
  id: number;
  name: string;
  text: string;
}

export const ELITE_AFFIXES: AffixDef[] = [
  { id: EliteAffix.Vampiric, name: 'Vampiric', text: 'Heals itself for 50% of the damage it deals' },
  { id: EliteAffix.WardedShell, name: 'Warded Shell', text: 'Takes the defenses that resist your main damage type' },
  { id: EliteAffix.Swift, name: 'Swift', text: 'Attacks 50% faster, each hit 25% weaker' },
  { id: EliteAffix.Thorned, name: 'Thorned', text: 'Reflects 10% of the damage it takes, in the same damage types' },
  { id: EliteAffix.Unyielding, name: 'Unyielding', text: 'Regenerates 2% of its max HP per second' },
  { id: EliteAffix.Ravenous, name: 'Ravenous', text: 'Its damage grows 5% every 5 s' },
];
export const BOSS_AFFIXES: AffixDef[] = [
  { id: BossAffix.Hungering, name: 'Hungering', text: 'Its damage grows 10% every 10 s' },
  { id: BossAffix.Mirrored, name: 'Mirrored', text: 'Resists your main damage type and attacks your weaker defense' },
  { id: BossAffix.Moonfall, name: 'Moonfall', text: "Every 12 s, a burst of 3× its hit that can't be dodged" },
  { id: BossAffix.Starless, name: 'Starless', text: 'Your heals, regen and lifesteal are halved' },
  { id: BossAffix.Tidal, name: 'Tidal', text: 'Each attack is half physical, half magic' },
  { id: BossAffix.Veiled, name: 'Veiled', text: 'Hard to hit' },
  { id: BossAffix.Eclipse, name: 'Eclipse', text: "Every 20 s, 4 s in which it can't be damaged" },
];
export const ELITE_AFFIXES_BY_ID: ReadonlyMap<number, AffixDef> = new Map(ELITE_AFFIXES.map(a => [a.id, a]));
export const BOSS_AFFIXES_BY_ID: ReadonlyMap<number, AffixDef> = new Map(BOSS_AFFIXES.map(a => [a.id, a]));

/** Boss affixes that can't share a boss: both set its damage type. */
const CLASHES: [number, number][] = [
  [BossAffix.Mirrored, BossAffix.Tidal],
];
export const bossAffixesClash = (a: number, b: number) => CLASHES.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

/** A depth's line-up: the same for everyone in a season (abyss.md, "Who you fight"). */
export interface DepthLineup {
  depth: number;
  basic: number;
  elite: number;
  eliteAffix: number;
  /** 1 Boss affix, 2 from SECOND_BOSS_AFFIX_FROM; the first picks the Deep Warden's look. */
  bossAffixes: number[];
}

const LINEUP_SALT = 0x61627973n; // "abys"

export function depthLineup(depth: number, season = ABYSS_SEASON): DepthLineup {
  const rng = seededRng(BigInt(season), BigInt(depth), LINEUP_SALT);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rng() * xs.length)];
  const basic = pick(ABYSS_KINDS).id;
  const elite = pick(ABYSS_KINDS.filter(k => k.id !== basic)).id;
  const eliteAffix = pick(ELITE_AFFIXES).id;
  const bossAffixes = [pick(BOSS_AFFIXES).id];
  if (depth >= SECOND_BOSS_AFFIX_FROM) {
    bossAffixes.push(pick(BOSS_AFFIXES.filter(a => a.id !== bossAffixes[0] && !bossAffixesClash(a.id, bossAffixes[0]))).id);
  }
  return { depth, basic, elite, eliteAffix, bossAffixes };
}

/**
 * A depth enemy before the affixes that depend on who fights it (abyss.ts `depthFoes`):
 * the depth's numbers × the kind's × the slot's. No XP, gold or drops: rewards are per depth.
 */
export function depthEnemy(depth: number, kind: AbyssKind, slot: DepthSlot, name = kind.name): EnemyDef {
  const level = depthLevel(depth);
  const hp = BASE_HP * depthHpMult(depth) * kind.hp * SLOT_MULT[slot].hp;
  return {
    id: kind.id,
    name,
    level,
    damageType: kind.damageType,
    defense: kind.defense,
    speed: kind.speed,
    hp,
    dps: BASE_DPS * depthDpsMult(depth) * kind.dps * SLOT_MULT[slot].dps * GAUNTLET,
    armor: 2.5 * level * PROFILE[kind.defense].armor,
    resistance: 2.5 * level * PROFILE[kind.defense].resistance,
    xp: 0,
    gold: 0,
    drops: [],
    materials: [],
    ...(slot === 'boss' && { boss: true }),
    ...(kind.evasive && { evasionRating: evasiveRating(level) }),
    ...(kind.regen && { regen: kind.regen * hp }),
  };
}

/** The Elite's name: "Vampiric Fallen Moonguard". */
export const eliteName = (kind: AbyssKind, affix: number) => `${ELITE_AFFIXES_BY_ID.get(affix)!.name} ${kind.name}`;
/** The boss's name: "Hungering, Starless Deep Warden". */
export const bossName = (affixes: readonly number[]) => `${affixes.map(a => BOSS_AFFIXES_BY_ID.get(a)!.name).join(', ')} ${DEEP_WARDEN.name}`;

// ---------------------------------------------------------------- rewards

/** Up to depth 100 milestones: a power elixir and a rare herb every ELIXIR_EVERY depths, a bigger Voidglass batch every 10. */
export const ELIXIR_EVERY = 5;
export const VOIDGLASS_BATCH_EVERY = 10;
/** Past depth 100 the rewards grow × REWARD_GROWTH a depth, far slower than the difficulty. */
export const REWARD_GROWTH = 1.03;

export interface DepthReward {
  gold: bigint;
  xp: bigint;
  dust: bigint;
  /** [material ID, count]. Voidglass included. */
  materials: [number, number][];
  /** A power elixir's supply ID (of the reward tier's grade), on milestone depths; a rare herb comes with it in `materials`. */
  elixir?: number;
}

/** Highest tier with a zone. */
const MAX_ZONE_TIER = Math.max(...ZONES.map(z => z.tier));
const MAX_MATERIAL_TIER = Math.max(...SUPPLY_TIERS);
/** The tier a depth's rewards are paid at: its own, rounded down to a zone that exists, T9 at most. */
export const rewardTier = (d: number) => Math.min(9, MAX_ZONE_TIER, Math.floor(depthTier(d)));

/** Hours of farming at the reward tier that a depth's first clear pays, per currency. */
const GOLD_HOURS = 2.5;
const DUST_HOURS = 2.5;
const XP_HOURS = 1;
/** Each material kind's count per depth: about 30 min of farming. */
const MATERIAL_COUNTS: Partial<Record<MaterialKind, number>> = { Metal: 10, Hide: 10, Cloth: 10, Wood: 10, Reagent: 10, Core: 4, Gem: 2 };
const REWARD_SALT = 0x6465657072n; // "deepr"

/**
 * The first-clear reward of depth `d` (abyss.md, "Rewards"): GOLD_HOURS, XP_HOURS and
 * DUST_HOURS of farming at its tier (1,200 gold, 4,800 XP and 15 Dust an hour × 2.9^(T−1),
 * crafting.md), 30 min of its tier's materials, Voidglass, and up to depth 100 a power elixir and a rare herb every ELIXIR_EVERY depths.
 * Past depth 100 only the formula, × REWARD_GROWTH a depth.
 */
export function depthReward(d: number, season = ABYSS_SEASON): DepthReward {
  const tier = rewardTier(d);
  const past = d >= FAST_FROM;
  const g = past ? REWARD_GROWTH ** (d - FAST_FROM) : 1;
  const scale = 2.9 ** (tier - 1) * g;
  const matTier = Math.min(tier, MAX_MATERIAL_TIER);
  const materials: [number, number][] = [];
  for (const kind of MATERIAL_KINDS) {
    const n = MATERIAL_COUNTS[kind];
    const m = materialAt(matTier, kind);
    if (n && m) materials.push([m.id, Math.round(n * g)]);
  }
  const voidglass = past ? 6 + 2 * Math.floor((d - FAST_FROM) / 10) : 3 + (d % VOIDGLASS_BATCH_EVERY === 0 ? 15 : 0);
  materials.push([untieredMaterial('Voidglass').id, voidglass]);
  let elixir: number | undefined;
  if (!past && d % ELIXIR_EVERY === 0) {
    const power = ELIXIRS.filter(e => e.group === 'Power');
    const kind = power[Math.floor(seededRng(BigInt(season), BigInt(d), REWARD_SALT)() * power.length)];
    elixir = elixirSupplyId(kind.kind, gradeOf(matTier));
    const herb = materialAt(matTier, 'Herb');
    if (herb) materials.push([herb.id, 1]);
  }
  return {
    gold: BigInt(Math.round(1200 * GOLD_HOURS * scale)),
    xp: BigInt(Math.round(4800 * XP_HOURS * scale)),
    dust: BigInt(Math.round(15 * DUST_HOURS * scale)),
    materials,
    ...(elixir !== undefined && { elixir }),
  };
}
