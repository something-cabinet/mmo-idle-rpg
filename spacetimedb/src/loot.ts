// Drops, affix rolls, the loot filter and salvage (equipment.md, zones.md,
// legendary.md, crafting.md). Pure: shared by server and client, and every roll
// comes from a seeded generator so a settle is reproducible.

import { BASE_LIST, base, implicitValue, weaponValues, type DamageType, type HealTarget } from './data/bases';
import { LEGENDARIES, legendaryGroup } from './data/legendary';
import { STATS, affixRange, affixRef, roundStat, toStored, type StatDef } from './data/stats';
import { UNIQUE_ROLL_MAX, UNIQUE_ROLL_MIN, uniquePool, type UniqueDef } from './data/uniques';
import { MATERIAL_CHANCE, materialOf } from './data/materials';
import { DROP_CHANCE, type EnemyDef, type ZoneDef } from './data/zones';

export const RARITIES = ['Common', 'Magic', 'Rare', 'Epic', 'Legendary', 'Unique'] as const;
export type RarityName = (typeof RARITIES)[number];
export const rarityRank = (r: RarityName) => RARITIES.indexOf(r);

/** Regular affixes per rarity (equipment.md). Legendary adds one legendary affix. */
export const REGULAR_AFFIXES: Record<RarityName, number> = { Common: 0, Magic: 1, Rare: 2, Epic: 3, Legendary: 2, Unique: 0 };
/** Dust per salvaged item at T1; × 2.9^(T−1) (crafting.md). */
export const DUST: Record<RarityName, number> = { Common: 1, Magic: 2, Rare: 5, Epic: 20, Legendary: 60, Unique: 60 };

export function salvageValue(rarity: RarityName, tier: number): bigint {
  return BigInt(Math.round(DUST[rarity] * 2.9 ** (tier - 1)));
}

// ---------------------------------------------------------------- random

/** Uniform in [0, 1). */
export type Rng = () => number;

const M64 = (1n << 64n) - 1n;
function mix64(z: bigint): bigint {
  z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & M64;
  z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & M64;
  return z ^ (z >> 31n);
}

/** SplitMix64 seeded from `parts` (e.g. character ID and settle time). */
export function seededRng(...parts: bigint[]): Rng {
  let state = parts.reduce((h, p) => mix64((h ^ (p & M64)) + 0x9e3779b97f4a7c15n) & M64, 0n);
  return () => {
    state = (state + 0x9e3779b97f4a7c15n) & M64;
    return Number(mix64(state) >> 11n) / 2 ** 53;
  };
}

/** A Poisson-distributed count with the given mean (drop counts per rarity). */
export function samplePoisson(rng: Rng, mean: number): number {
  if (mean <= 0) return 0;
  if (mean > 500) {
    // Normal approximation; exp(−mean) would underflow the inversion below.
    const gauss = Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
    return Math.max(0, Math.round(mean + Math.sqrt(mean) * gauss));
  }
  const u = rng();
  let k = 0;
  let p = Math.exp(-mean);
  let cdf = p;
  while (u > cdf && p > 0) {
    k++;
    p *= mean / k;
    cdf += p;
  }
  return k;
}

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)];

// ---------------------------------------------------------------- items

/** A rolled item, shaped like an `item` row without its ID, owner and bookkeeping. */
export interface NewItem {
  baseId: number;
  tier: number;
  rarity: { tag: RarityName };
  implicits: { stat: number; value: bigint }[];
  affixes: { stat: number; tier: number; value: bigint }[];
  legendary: { effect: number; stat: number; value: bigint } | undefined;
  /** Set on uniques (data/uniques.ts). */
  uniqueId: number | undefined;
  /** A unique's effect IDs; empty otherwise. */
  effects: number[];
  weapon:
    | {
        damageType: { tag: DamageType };
        hit: bigint;
        speedMilli: number;
        baseCritBp: number;
        heal: bigint;
        healTarget: { tag: HealTarget } | undefined;
        twoHanded: boolean;
      }
    | undefined;
}

const AFFIX_POOL: StatDef[] = Object.values(STATS).filter(d => d.ref !== undefined);
const AFFIX_WEIGHT = AFFIX_POOL.reduce((sum, d) => sum + (d.weight ?? 100), 0);
/** Stat IDs of every regular affix: the loot filter's default (keep any affix). */
export const AFFIX_STAT_IDS: readonly number[] = AFFIX_POOL.map(d => d.id);

/** A regular affix on a tier-`tier` item: weighted free pool, affix tier 1..N, value uniform in that tier's range (then rounded). */
export function rollAffix(rng: Rng, tier: number): NewItem['affixes'][number] {
  let r = rng() * AFFIX_WEIGHT;
  const def = AFFIX_POOL.find(d => (r -= d.weight ?? 100) < 0) ?? AFFIX_POOL[AFFIX_POOL.length - 1];
  const k = 1 + Math.floor(rng() * tier);
  const [lo, hi] = affixRange(def.id, k);
  const value = lo + (hi - lo) * rng();
  return { stat: def.id, tier: k, value: toStored(roundStat(def.id, value)) };
}

/** A legendary affix from the base's group: equal weights, bonus is half a regular affix roll of the item's top affix tier. */
export function rollLegendary(rng: Rng, baseId: number, tier: number): NonNullable<NewItem['legendary']> {
  const group = legendaryGroup(baseId, base(baseId).kind);
  const def = pick(rng, LEGENDARIES.filter(l => l.group === group));
  const [lo, hi] = affixRange(def.bonusStat, tier);
  const value = (lo + (hi - lo) * rng()) / 2;
  return { effect: def.id, stat: def.bonusStat, value: toStored(roundStat(def.bonusStat, value)) };
}

/** An item of `baseId` at `tier`: base values computed and stored literally, affixes rolled. */
export function makeItem(rng: Rng, baseId: number, tier: number, rarity: RarityName): NewItem {
  const b = base(baseId);
  const w = b.weapon && weaponValues(b.weapon, tier);
  return {
    baseId,
    tier,
    rarity: { tag: rarity },
    implicits: b.implicits.map(i => ({ stat: i.stat, value: toStored(implicitValue(i, tier)) })),
    affixes: Array.from({ length: REGULAR_AFFIXES[rarity] }, () => rollAffix(rng, tier)),
    legendary: rarity === 'Legendary' ? rollLegendary(rng, baseId, tier) : undefined,
    uniqueId: undefined,
    effects: [],
    weapon: w && {
      damageType: { tag: w.damageType },
      hit: toStored(w.hit),
      speedMilli: Math.round(w.speed * 1000),
      baseCritBp: Math.round(w.baseCrit * 100),
      heal: toStored(w.heal),
      healTarget: w.healTarget && { tag: w.healTarget },
      twoHanded: w.twoHanded,
    },
  };
}

/**
 * Unique `u`: its base at its tier, its stats rolled in [UNIQUE_ROLL_MIN, UNIQUE_ROLL_MAX] × value
 * and stored as affixes of tier 0 (not a regular affix tier), its effects.
 */
export function makeUnique(rng: Rng, u: UniqueDef): NewItem {
  return {
    ...makeItem(rng, u.baseId, u.tier, 'Unique'),
    affixes: u.stats.map(s => {
      const value = affixRef(s.stat, u.tier) * (s.x ?? 1) * (UNIQUE_ROLL_MIN + (UNIQUE_ROLL_MAX - UNIQUE_ROLL_MIN) * rng());
      return { stat: s.stat, tier: 0, value: toStored(roundStat(s.stat, value)) };
    }),
    uniqueId: u.id,
    effects: [...u.effects],
  };
}

/** A unique that `enemyId` can drop in a tier-`zoneTier` zone (data/uniques.ts `uniquePool`); undefined if none. */
export function pickUnique(rng: Rng, zoneTier: number, enemyId?: number): UniqueDef | undefined {
  const pool = uniquePool(zoneTier, enemyId);
  let r = rng() * pool.reduce((sum, x) => sum + x.weight, 0);
  return (pool.find(x => (r -= x.weight) < 0) ?? pool[pool.length - 1])?.u;
}

/** Whether `enemyId` can drop any unique in a tier-`zoneTier` zone (if not, the Unique chance rolls Legendary). */
export const hasUniques = (zoneTier: number, enemyId?: number) => uniquePool(zoneTier, enemyId).length > 0;

/** What a rarity step needs from an item: an `item` row or a `NewItem`. */
export type RaisableItem = Pick<NewItem, 'baseId' | 'tier' | 'rarity' | 'affixes' | 'legendary'>;

/**
 * `it` one rarity higher (crafting and Fortune's Favor): up to Epic it gains a random
 * affix; Epic → Legendary drops regular affix `removeIndex` and gains a legendary
 * affix. Only for Common to Epic items.
 */
export function raiseRarity<T extends RaisableItem>(rng: Rng, it: T, removeIndex: number): T {
  const rarity = { tag: RARITIES[rarityRank(it.rarity.tag) + 1] };
  if (it.rarity.tag !== 'Epic') return { ...it, rarity, affixes: [...it.affixes, rollAffix(rng, it.tier)] };
  return {
    ...it,
    rarity,
    affixes: it.affixes.filter((_, i) => i !== removeIndex),
    legendary: rollLegendary(rng, it.baseId, it.tier),
  };
}

// ---------------------------------------------------------------- drops

export interface LootFilter {
  minRarity: RarityName;
  /**
   * Stat IDs (distinct): a drop at or above the threshold is kept only with one of
   * these affixes. Empty or every affix means no affix restriction.
   */
  keepAffixes: readonly number[];
  /** Base IDs (distinct): drops are kept only of these families. Empty or every base means any. */
  keepBases: readonly number[];
  /** Drops are kept only with a regular affix of at least this tier; 1 means any. */
  minAffixTier: number;
}

/** The filter restricts affixes: some, but not all, are selected. */
export const restrictsAffixes = (f: Pick<LootFilter, 'keepAffixes'>) => f.keepAffixes.length > 0 && f.keepAffixes.length < AFFIX_STAT_IDS.length;
/** The filter restricts families: some, but not all, are selected. */
export const restrictsBases = (f: Pick<LootFilter, 'keepBases'>) => f.keepBases.length > 0 && f.keepBases.length < BASE_LIST.length;

export function passesFilter(item: NewItem, f: LootFilter): boolean {
  if (rarityRank(item.rarity.tag) < rarityRank(f.minRarity)) return false;
  if (restrictsBases(f) && !f.keepBases.includes(item.baseId)) return false;
  if (f.minAffixTier > 1 && !item.affixes.some(a => a.tier >= f.minAffixTier)) return false;
  return !restrictsAffixes(f) || item.affixes.some(a => f.keepAffixes.includes(a.stat));
}

/** First kill of a zone boss: 20× its gold (zone-content.md). */
export const FIRST_KILL_GOLD_MULT = 20;

/** First-kill reward: 20× the boss's gold and a guaranteed Rare of the zone's tier from any of its bases. */
export function firstKillReward(rng: Rng, zone: ZoneDef, boss: EnemyDef): { gold: bigint; item: NewItem } {
  return {
    gold: BigInt(Math.round(boss.gold * FIRST_KILL_GOLD_MULT)),
    item: makeItem(rng, pick(rng, boss.drops), zone.tier, 'Rare'),
  };
}

export interface DropResult {
  /** Items to add to the bag, highest rarity first. */
  kept: NewItem[];
  /** Salvaged drops per rarity (filter and full bag). */
  salvaged: Record<RarityName, number>;
  dust: bigint;
  /** Kept by the filter but salvaged for a full bag. */
  overflow: number;
  /** Every drop, salvaged ones included (discovery). Drops salvaged unrolled only with `discoverRng`. */
  seen: Seen[];
}

/** A drop's identity for discovery: its base, and its unique if it is one. */
export interface Seen {
  baseId: number;
  uniqueId?: number;
}

export interface DropInput {
  kills: number;
  enemy: EnemyDef;
  /** Zone tier: drops are always the zone's tier. */
  tier: number;
  /** `1.12^o` reward scale of the enemy (zones.ts `rewardScale`). */
  rewardScale: number;
  itemFind: number;
  filter: LootFilter;
  /** Free bag slots. */
  bagFree: number;
  /** Fortune's Favor: chance per kept drop to be raised one rarity (max Legendary). */
  fortune?: number;
  /**
   * Picks the bases of drops salvaged without rolling them, for `seen`. Its own
   * generator, so discovery doesn't change the item rolls.
   */
  discoverRng?: Rng;
}

/**
 * Samples a drop count per rarity (one draw per rarity, not per kill), rolls the
 * items, applies the loot filter, fills the free bag slots (highest
 * rarity first), and salvages the rest into Dust.
 */
export function rollDrops(rng: Rng, d: DropInput): DropResult {
  const salvaged = Object.fromEntries(RARITIES.map(r => [r, 0])) as Record<RarityName, number>;
  let dust = 0n;
  const salvage = (r: RarityName, tier = d.tier) => {
    salvaged[r]++;
    dust += salvageValue(r, tier);
  };

  const scale = d.kills * d.rewardScale * (1 + d.itemFind);
  const kept: NewItem[] = [];
  const seen: Seen[] = [];
  const uniques = hasUniques(d.tier, d.enemy.id);
  for (const rarity of RARITIES) {
    if (rarity === 'Unique') {
      // Uniques drop from any enemy: every unique of the zone's tier and below, or the enemy's own. Always kept.
      if (!uniques) continue;
      const count = samplePoisson(rng, scale * DROP_CHANCE.Unique);
      for (let i = 0; i < count; i++) {
        const u = makeUnique(rng, pickUnique(rng, d.tier, d.enemy.id)!);
        kept.push(u);
        seen.push({ baseId: u.baseId, uniqueId: u.uniqueId });
      }
      continue;
    }
    // With no unique to drop yet, the Unique chance rolls Legendary.
    const chance = DROP_CHANCE[rarity] + (rarity === 'Legendary' && !uniques ? DROP_CHANCE.Unique : 0);
    const count = samplePoisson(rng, scale * chance);
    // Drops below the threshold are salvaged without rolling them.
    const skip = rarityRank(rarity) < rarityRank(d.filter.minRarity);
    for (let i = 0; i < count; i++) {
      if (skip) {
        salvage(rarity);
        if (d.discoverRng) seen.push({ baseId: pick(d.discoverRng, d.enemy.drops) });
        continue;
      }
      const item = makeItem(rng, pick(rng, d.enemy.drops), d.tier, rarity);
      seen.push({ baseId: item.baseId });
      if (passesFilter(item, d.filter)) kept.push(item);
      else salvage(rarity);
    }
  }

  // Fortune's Favor upgrades kept drops only, before the bag limit (an upgrade ranks higher).
  if (d.fortune) {
    const chance = d.fortune;
    for (let i = 0; i < kept.length; i++) {
      const it = kept[i];
      if (rarityRank(it.rarity.tag) >= rarityRank('Legendary') || rng() >= chance) continue;
      kept[i] = raiseRarity(rng, it, Math.floor(rng() * it.affixes.length));
    }
  }

  kept.sort((a, b) => rarityRank(b.rarity.tag) - rarityRank(a.rarity.tag));
  const room = Math.max(0, d.bagFree);
  const over = kept.splice(room);
  over.forEach(item => salvage(item.rarity.tag, item.tier));
  return { kept, salvaged, dust, overflow: over.length, seen };
}

// ---------------------------------------------------------------- materials

export interface MaterialDrop {
  materialId: number;
  count: number;
}

/** Mean material drops per kill of `enemy`, per material it drops (as `rollMaterials` samples). */
export function materialMeans(enemy: EnemyDef, tier: number, rewardScale: number): { materialId: number; mean: number }[] {
  return enemy.materials.map(kind => ({ materialId: materialOf(tier, kind).id, mean: rewardScale * MATERIAL_CHANCE[kind] }));
}

/**
 * Materials from `kills` of `enemy` (zones.md, "Materials"): one Poisson draw per
 * kind it drops, of the zone's tier. Item find doesn't apply. Only nonzero counts.
 */
export function rollMaterials(rng: Rng, enemy: EnemyDef, tier: number, kills: number, rewardScale: number): MaterialDrop[] {
  return materialMeans(enemy, tier, rewardScale)
    .map(({ materialId, mean }) => ({ materialId, count: samplePoisson(rng, kills * mean) }))
    .filter(d => d.count > 0);
}
