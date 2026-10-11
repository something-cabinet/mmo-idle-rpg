// Drops, affix rolls, the loot filter and salvage (equipment.md, zones.md,
// legendary.md, crafting.md). Pure: shared by server and client, and every roll
// comes from a seeded generator so a settle is reproducible.

import { base, implicitValue, weaponValues, type DamageType, type HealTarget } from './data/bases';
import { LEGENDARIES, legendaryGroup } from './data/legendary';
import { STATS, affixRange, affixRef, roundStat, toStored, type StatDef } from './data/stats';
import { DROP_CHANCE, type EnemyDef, type ZoneDef } from './data/zones';

export const RARITIES = ['Common', 'Magic', 'Rare', 'Epic', 'Legendary', 'Unique'] as const;
export type RarityName = (typeof RARITIES)[number];
export const rarityRank = (r: RarityName) => RARITIES.indexOf(r);

/** Regular affixes per rarity (equipment.md). Legendary adds one legendary affix. */
export const REGULAR_AFFIXES: Record<RarityName, number> = { Common: 0, Magic: 1, Rare: 2, Epic: 3, Legendary: 2, Unique: 0 };
/** Essence per salvaged item at T1; × 2.9^(T−1) (crafting.md). */
export const ESSENCE: Record<RarityName, number> = { Common: 1, Magic: 2, Rare: 5, Epic: 20, Legendary: 60, Unique: 60 };
/** Kept items per settle; above it the lowest rarities are salvaged. */
export const KEEP_CAP_PER_SETTLE = 50;

export function salvageValue(rarity: RarityName, tier: number): bigint {
  return BigInt(Math.round(ESSENCE[rarity] * 2.9 ** (tier - 1)));
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

/** A regular affix on a tier-`tier` item: weighted free pool, affix tier 1..N, value uniform in that tier's range (then rounded). */
export function rollAffix(rng: Rng, tier: number): NewItem['affixes'][number] {
  let r = rng() * AFFIX_WEIGHT;
  const def = AFFIX_POOL.find(d => (r -= d.weight ?? 100) < 0) ?? AFFIX_POOL[AFFIX_POOL.length - 1];
  const k = 1 + Math.floor(rng() * tier);
  const [lo, hi] = affixRange(def.id, k);
  const value = lo + (hi - lo) * rng();
  return { stat: def.id, tier: k, value: toStored(roundStat(def.id, value)) };
}

/** A legendary affix from the base's group: equal weights, bonus in [0.25, 0.5] × ref. */
export function rollLegendary(rng: Rng, baseId: number, tier: number): NonNullable<NewItem['legendary']> {
  const group = legendaryGroup(baseId, base(baseId).kind);
  const def = pick(rng, LEGENDARIES.filter(l => l.group === group));
  const value = affixRef(def.bonusStat, tier) * (0.25 + 0.25 * rng());
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
  /** Stat IDs: a drop with any of these affixes is kept below the threshold. */
  keepAffixes: readonly number[];
}

export function passesFilter(item: NewItem, f: LootFilter): boolean {
  return rarityRank(item.rarity.tag) >= rarityRank(f.minRarity) || item.affixes.some(a => f.keepAffixes.includes(a.stat));
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

/** Fortune's Favor: chance per kept drop to be raised one rarity (max Legendary). */
export const FORTUNE_CHANCE = 0.15;

export interface DropResult {
  /** Items to add to the bag, highest rarity first. */
  kept: NewItem[];
  /** Salvaged drops per rarity (filter, per-settle cap and full bag). */
  salvaged: Record<RarityName, number>;
  essence: bigint;
  /** Kept by the filter but salvaged for the cap or a full bag. */
  overflow: number;
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
  /** Fortune's Favor is worn. */
  fortune?: boolean;
}

/**
 * Samples a drop count per rarity (one draw per rarity, not per kill), rolls the
 * items, applies the loot filter, the per-settle cap and the bag limit, and
 * salvages the rest into Essence.
 */
export function rollDrops(rng: Rng, d: DropInput): DropResult {
  const salvaged = Object.fromEntries(RARITIES.map(r => [r, 0])) as Record<RarityName, number>;
  let essence = 0n;
  const salvage = (r: RarityName) => {
    salvaged[r]++;
    essence += salvageValue(r, d.tier);
  };

  const scale = d.kills * d.rewardScale * (1 + d.itemFind);
  const kept: NewItem[] = [];
  for (const rarity of RARITIES) {
    if (rarity === 'Unique') continue; // no uniques yet: their chance rolls Legendary
    const chance = DROP_CHANCE[rarity] + (rarity === 'Legendary' ? DROP_CHANCE.Unique : 0);
    const count = samplePoisson(rng, scale * chance);
    // Without a whitelist, drops below the threshold are salvaged without rolling them.
    const skip = rarityRank(rarity) < rarityRank(d.filter.minRarity) && d.filter.keepAffixes.length === 0;
    for (let i = 0; i < count; i++) {
      if (skip) {
        salvage(rarity);
        continue;
      }
      const item = makeItem(rng, pick(rng, d.enemy.drops), d.tier, rarity);
      if (passesFilter(item, d.filter)) kept.push(item);
      else salvage(rarity);
    }
  }

  // Fortune's Favor upgrades kept drops only, before the cap (an upgrade ranks higher).
  if (d.fortune) {
    for (let i = 0; i < kept.length; i++) {
      const it = kept[i];
      if (rarityRank(it.rarity.tag) >= rarityRank('Legendary') || rng() >= FORTUNE_CHANCE) continue;
      kept[i] = raiseRarity(rng, it, Math.floor(rng() * it.affixes.length));
    }
  }

  kept.sort((a, b) => rarityRank(b.rarity.tag) - rarityRank(a.rarity.tag));
  const room = Math.max(0, Math.min(KEEP_CAP_PER_SETTLE, d.bagFree));
  const over = kept.splice(room);
  over.forEach(item => salvage(item.rarity.tag));
  return { kept, salvaged, essence, overflow: over.length };
}
