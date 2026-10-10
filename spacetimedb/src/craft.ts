// Crafting: affix reroll, rarity upgrade and bag expansion (crafting.md). Pure:
// shared by server and client, so the client can show the exact costs. Rolls reuse
// the drop rolls from loot.ts.

import { BAG_MAX, BAG_START } from './game';
import { raiseRarity, rollAffix, type RaisableItem, type RarityName, type Rng } from './loot';

/** What crafting needs from an item: an `item` row or a `NewItem`. */
export type CraftItem = RaisableItem;

export interface CraftCost {
  gold: bigint;
  essence: bigint;
}

/** Costs are hours of farming at the item's tier: 1,200 gold and 15 Essence per hour × 2.9^(T−1). */
export function craftCost(hours: number, tier: number): CraftCost {
  const scale = hours * 2.9 ** (tier - 1);
  return { gold: BigInt(Math.round(1200 * scale)), essence: BigInt(Math.round(15 * scale)) };
}

/** Hours per affix reroll, by item rarity. Common has no affixes; Unique can't be crafted. */
export const REROLL_HOURS: Partial<Record<RarityName, number>> = { Magic: 0.25, Rare: 0.5, Epic: 1, Legendary: 2 };
/** Hours to upgrade from this rarity to the next. */
export const UPGRADE_HOURS: Partial<Record<RarityName, number>> = { Common: 0.25, Magic: 1, Rare: 4, Epic: 24 };

export const rerollCost = (it: CraftItem): CraftCost | undefined => {
  const h = REROLL_HOURS[it.rarity.tag];
  return h === undefined ? undefined : craftCost(h, it.tier);
};
export const upgradeCost = (it: CraftItem): CraftCost | undefined => {
  const h = UPGRADE_HOURS[it.rarity.tag];
  return h === undefined ? undefined : craftCost(h, it.tier);
};

/** The item with regular affix `index` replaced by a fresh roll, or an error message. */
export function rerollAffix<T extends CraftItem>(rng: Rng, it: T, index: number): T | string {
  if (it.rarity.tag === 'Unique') return "Uniques can't be crafted";
  if (index >= it.affixes.length) return 'No such affix';
  return { ...it, affixes: it.affixes.map((a, i) => (i === index ? rollAffix(rng, it.tier) : a)) };
}

/**
 * The item one rarity higher, or an error message. Up to Epic it gains one random
 * affix; Epic → Legendary drops the affix at `removeIndex` and gains a legendary affix.
 */
export function upgradeRarity<T extends CraftItem>(rng: Rng, it: T, removeIndex?: number): T | string {
  if (UPGRADE_HOURS[it.rarity.tag] === undefined) {
    return it.rarity.tag === 'Unique' ? "Uniques can't be crafted" : 'Legendary is the highest craftable rarity';
  }
  if (it.rarity.tag !== 'Epic') return raiseRarity(rng, it, 0);
  if (removeIndex === undefined || removeIndex >= it.affixes.length) return 'Pick an affix to remove';
  return raiseRarity(rng, it, removeIndex);
}

/** Slots per bag expansion. */
export const BAG_STEP = 25;

/** Gold for the next expansion of a bag of `bagSize` (`50,000 × 4^n`), or undefined at the max. */
export function bagExpansionCost(bagSize: number): bigint | undefined {
  if (bagSize >= BAG_MAX) return undefined;
  const n = Math.floor((bagSize - BAG_START) / BAG_STEP);
  return 50_000n * 4n ** BigInt(n);
}
