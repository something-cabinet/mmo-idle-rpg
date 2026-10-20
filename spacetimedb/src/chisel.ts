// Chisels (data/supplies.ts): crafting consumables, each doing one thing gold crafting
// can't. Pure: shared by server and client, so the client can say why a chisel can't be
// used. Rolls reuse the drop rolls from loot.ts.

import { CORRUPTED, craftable } from './craft';
import { ChiselKind, type ChiselDef } from './data/supplies';
import { UNIQUES_BY_ID } from './data/uniques';
import {
  legendaryBonusRange,
  rarityRank,
  rerollAffixValue,
  rollAffix,
  rollLegendary,
  rollUniqueStat,
  type NewItem,
  type Rng,
} from './loot';
import { roundStat, toStored, type StatId } from './data/stats';

/** `boundAffix` (and a chisel target) for the legendary affix. Regular affix i is i + 1 bound, i as a target. */
export const BOUND_LEGENDARY = 255;

/** What chiseling needs from an item: an `item` row or a `NewItem`. */
export type ChiselItem = Pick<NewItem, 'baseId' | 'tier' | 'rarity' | 'affixes' | 'legendary' | 'uniqueId' | 'boundAffix' | 'corruption'>;

/** Regular affix `i` is bound. */
export const isBound = (it: Pick<ChiselItem, 'boundAffix'>, i: number) => it.boundAffix === i + 1;
/** The legendary affix is bound. */
export const legendaryBound = (it: Pick<ChiselItem, 'boundAffix'>) => it.boundAffix === BOUND_LEGENDARY;

/** PERMANENT IDS: stored in `item.corruption` (0 = not corrupted). What a Corruption Chisel did. */
export const Corruption = {
  Nothing: 1,
  AddedAffix: 2,
  RemovedAffix: 3,
  RaisedTier: 4,
  LoweredTier: 5,
  Rerolled: 6,
  CorruptedAffix: 7,
} as const;
export type Corruption = (typeof Corruption)[keyof typeof Corruption];

/** What each outcome did, for the client. */
export const CORRUPTION_TEXT: Record<Corruption, string> = {
  [Corruption.Nothing]: 'nothing happened',
  [Corruption.AddedAffix]: 'it gained an affix',
  [Corruption.RemovedAffix]: 'it lost an affix',
  [Corruption.RaisedTier]: 'an affix rose a tier',
  [Corruption.LoweredTier]: 'an affix fell a tier',
  [Corruption.Rerolled]: 'every value rerolled',
  [Corruption.CorruptedAffix]: 'it gained a corrupted affix',
};

/** A corrupted affix can rise this many tiers past the item's tier (a T9 item's to T10: the stat curves go on past T9). */
export const CORRUPT_TIER_OVER = 1;

/**
 * Corrupted affixes, only from corruption. None yet (to be designed): until there are,
 * that outcome isn't rolled and the other four share its chance.
 */
export const CORRUPTED_AFFIXES: readonly number[] = [];

/**
 * Why chisel `c` can't be used on `it` (with affix `target` for Binding and Improvement),
 * or undefined. Uniques take only Recalibration; Anomalies and the like take none; nothing
 * takes a corrupted item.
 */
export function chiselBlocker(c: ChiselDef, it: ChiselItem, target?: number): string | undefined {
  const unique = it.uniqueId !== undefined;
  if (rarityRank(it.rarity.tag) > rarityRank('Unique')) return "This item can't be chiseled";
  if (it.corruption) return CORRUPTED;
  if (unique && c.kind !== ChiselKind.Recalibration) return 'Uniques take only the Recalibration Chisel';
  if (!unique && !craftable(it)) return "This item can't be chiseled";
  const free = it.affixes.some((_, i) => !isBound(it, i)) || (!!it.legendary && !legendaryBound(it));
  switch (c.kind) {
    case ChiselKind.Recalibration:
      return free ? undefined : it.affixes.length || it.legendary ? 'Its only affix is bound' : 'No affixes to recalibrate';
    case ChiselKind.Chaos:
      return free ? undefined : it.affixes.length || it.legendary ? 'Its only affix is bound' : 'No affixes to reroll';
    case ChiselKind.Binding:
      if (it.boundAffix !== 0) return 'It already has a bound affix';
      if (target === BOUND_LEGENDARY) return it.legendary ? undefined : 'No legendary affix';
      return target !== undefined && target < it.affixes.length ? undefined : it.affixes.length ? 'Pick an affix' : 'No affixes to bind';
    case ChiselKind.Improvement: {
      if (!it.affixes.length) return 'No affixes to improve';
      const a = target === undefined ? undefined : it.affixes[target];
      if (!a) return 'Pick an affix';
      if (isBound(it, target!)) return "A bound affix can't be improved";
      return a.tier >= it.tier ? `Already at the item's tier (T${it.tier})` : undefined;
    }
    case ChiselKind.Corruption:
      return undefined;
  }
}

/** Every unbound value rerolled within its tier (a Unique's within its roll range), the legendary bonus too. */
function recalibrate<T extends ChiselItem>(rng: Rng, it: T): T {
  const u = it.uniqueId === undefined ? undefined : UNIQUES_BY_ID.get(it.uniqueId);
  const affixes = it.affixes.map((a, i) => {
    if (isBound(it, i)) return a;
    if (a.tier > 0) return rerollAffixValue(rng, a);
    const s = u?.stats[i];
    return u && s && s.stat === a.stat ? rollUniqueStat(rng, u, s) : a;
  });
  const leg = it.legendary;
  if (!leg || legendaryBound(it)) return { ...it, affixes };
  const [lo, hi] = legendaryBonusRange(leg.stat, it.tier);
  return { ...it, affixes, legendary: { ...leg, value: toStored(roundStat(leg.stat as StatId, lo + (hi - lo) * rng())) } };
}

const pickOne = <T,>(rng: Rng, xs: readonly T[]) => xs[Math.floor(rng() * xs.length)];

/**
 * A Corruption Chisel: one of five outcomes, equally likely (four while CORRUPTED_AFFIXES is
 * empty), then the item is corrupted for good. An affix count or tier may go past the
 * usual limits. Bound affixes are never removed or changed: with no unbound affix, a tier
 * change does nothing and an affix count change adds one.
 */
function corrupt<T extends ChiselItem>(rng: Rng, it: T): T {
  const kinds = ['count', 'tier', 'nothing', 'reroll', ...(CORRUPTED_AFFIXES.length ? ['corrupted' as const] : [])] as const;
  const kind = pickOne(rng, kinds);
  const unbound = it.affixes.map((_, i) => i).filter(i => !isBound(it, i));
  const done = (out: T, corruption: Corruption): T => ({ ...out, corruption });
  switch (kind) {
    case 'count': {
      if (!unbound.length || rng() < 0.5) return done({ ...it, affixes: [...it.affixes, rollAffix(rng, it.tier)] }, Corruption.AddedAffix);
      const gone = pickOne(rng, unbound);
      // Later affixes move down one place, the bound one with them.
      const boundAffix = it.boundAffix > gone + 1 && it.boundAffix !== BOUND_LEGENDARY ? it.boundAffix - 1 : it.boundAffix;
      return done({ ...it, affixes: it.affixes.filter((_, i) => i !== gone), boundAffix }, Corruption.RemovedAffix);
    }
    case 'tier': {
      if (!unbound.length) return done(it, Corruption.Nothing);
      const i = pickOne(rng, unbound);
      const a = it.affixes[i];
      const canRise = a.tier < it.tier + CORRUPT_TIER_OVER;
      const rise = canRise && (a.tier <= 1 || rng() < 0.5);
      const tier = a.tier + (rise ? 1 : -1);
      const affixes = it.affixes.map((x, j) => (j === i ? rerollAffixValue(rng, { ...a, tier }) : x));
      return done({ ...it, affixes }, rise ? Corruption.RaisedTier : Corruption.LoweredTier);
    }
    case 'reroll':
      return done(recalibrate(rng, it), Corruption.Rerolled);
    case 'corrupted':
      // To be designed; not rolled while CORRUPTED_AFFIXES is empty.
      return done(it, Corruption.CorruptedAffix);
    case 'nothing':
      return done(it, Corruption.Nothing);
  }
}

/** `it` after chisel `c` (on affix `target` for Binding and Improvement), or why it can't be used. */
export function applyChisel<T extends ChiselItem>(rng: Rng, c: ChiselDef, it: T, target?: number): T | string {
  const blocked = chiselBlocker(c, it, target);
  if (blocked) return blocked;
  switch (c.kind) {
    case ChiselKind.Recalibration:
      return recalibrate(rng, it);
    case ChiselKind.Chaos:
      return {
        ...it,
        affixes: it.affixes.map((a, i) => (isBound(it, i) ? a : rollAffix(rng, it.tier))),
        legendary: !it.legendary || legendaryBound(it) ? it.legendary : rollLegendary(rng, it.baseId, it.tier),
      };
    case ChiselKind.Binding:
      return { ...it, boundAffix: target === BOUND_LEGENDARY ? BOUND_LEGENDARY : target! + 1 };
    case ChiselKind.Improvement:
      return { ...it, affixes: it.affixes.map((a, i) => (i === target ? rerollAffixValue(rng, { ...a, tier: a.tier + 1 }) : a)) };
    case ChiselKind.Corruption:
      return corrupt(rng, it);
  }
}
