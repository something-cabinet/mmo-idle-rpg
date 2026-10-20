import { SenderError, t } from 'spacetimedb/server';
import { spacetimedb } from '../schema';
import { BAG_STEP, bagExpansionCost, rerollAffix as reroll, rerollCost, upgradeCost, upgradeRarity as upgrade, type CraftCost } from '../craft';
import { seededRng } from '../loot';
import { requireActive, requireItem, settle, supplyCount, takeSupply, type Character, type Ctx, type Item } from '../helpers';
import { applyChisel as chisel } from '../chisel';
import { CHISELS_BY_ID } from '../data/supplies';

/**
 * Settles (crafting may change equipped gear, and idle gold counts toward the cost),
 * checks the cost, crafts, and saves the item and the paid character.
 */
function craft(ctx: Ctx, itemId: bigint, costOf: (it: Item) => CraftCost | undefined, make: (ch: Character, it: Item) => Item | string) {
  const { ch } = requireActive(ctx);
  const it = requireItem(ctx, ch, itemId);
  const settled = settle(ctx, ch);
  const next = make(settled, it);
  if (typeof next === 'string') throw new SenderError(next);
  const cost = costOf(it)!; // `make` refuses everything without a cost
  if (settled.gold < cost.gold) throw new SenderError(`Not enough gold: costs ${cost.gold}`);
  if (settled.dust < cost.dust) throw new SenderError(`Not enough Dust: costs ${cost.dust}`);
  ctx.db.item.id.update(next);
  ctx.db.character.id.update({ ...settled, gold: settled.gold - cost.gold, dust: settled.dust - cost.dust });
}

const rngFor = (ctx: Ctx, ch: Character, it: Item) => seededRng(ch.id, it.id, ctx.timestamp.microsSinceUnixEpoch);

/** Replaces regular affix `affixIndex` with a new random one (the legendary affix can't be rerolled). */
export const rerollAffix = spacetimedb.reducer({ itemId: t.u64(), affixIndex: t.u8() }, (ctx, { itemId, affixIndex }) => {
  craft(ctx, itemId, rerollCost, (ch, it) => reroll(rngFor(ctx, ch, it), it, affixIndex));
});

/**
 * Raises the item one rarity: adds a random affix, or for Epic → Legendary removes
 * regular affix `removeAffix` and adds a random legendary affix.
 */
export const upgradeRarity = spacetimedb.reducer(
  { itemId: t.u64(), removeAffix: t.u8().optional() },
  (ctx, { itemId, removeAffix }) => {
    craft(ctx, itemId, upgradeCost, (ch, it) => upgrade(rngFor(ctx, ch, it), it, removeAffix));
  }
);

/**
 * Uses chisel `chiselId` from stock on item `itemId` (chisel.ts): `target` is the affix for
 * Binding and Improvement (BOUND_LEGENDARY for the legendary one), ignored otherwise. Settles
 * first: it may change equipped gear.
 */
export const applyChisel = spacetimedb.reducer({ itemId: t.u64(), chiselId: t.u16(), target: t.u8() }, (ctx, { itemId, chiselId, target }) => {
  const { ch } = requireActive(ctx);
  const c = CHISELS_BY_ID.get(chiselId);
  if (!c) throw new SenderError('No such chisel');
  const it = requireItem(ctx, ch, itemId);
  if (supplyCount(ctx, ch.id, chiselId) < 1) throw new SenderError('None in stock');
  const settled = settle(ctx, ch);
  const next = chisel(rngFor(ctx, settled, it), c, it, target);
  if (typeof next === 'string') throw new SenderError(next);
  takeSupply(ctx, ch.id, chiselId, 1);
  ctx.db.item.id.update(next);
  ctx.db.character.id.update(settled);
});

/** Adds 25 bag slots for `50,000 × 4^n` gold, up to 400. */
export const expandBag = spacetimedb.reducer(ctx => {
  const { ch } = requireActive(ctx);
  const cost = bagExpansionCost(ch.bagSize);
  if (cost === undefined) throw new SenderError('The bag is at its maximum size');
  const settled = settle(ctx, ch);
  if (settled.gold < cost) throw new SenderError(`Not enough gold: costs ${cost}`);
  ctx.db.character.id.update({ ...settled, gold: settled.gold - cost, bagSize: settled.bagSize + BAG_STEP });
});
