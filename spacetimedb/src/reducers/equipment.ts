import { SenderError, t } from 'spacetimedb/server';
import { EquipProfile, spacetimedb } from '../schema';
import { LOADOUT_COUNT } from '../game';
import { SLOT_COUNT } from '../data/bases';
import { autoEquip as bestSlots, isCustomProfile, isProfile, placeItem, validCustomWeights } from '../equip';
import { addScrap, salvageValue, scrapMaterials, type ScrapDrop } from '../loot';
import { isScrapRarity } from '../data/recipes';
import { addMaterials, requireActive, requireItem, scrapMaterialIdOf, settle, type Character, type Ctx } from '../helpers';

const MAX_LOADOUT_NAME = 20;

function requireLoadout(ctx: Ctx, ch: Character, index: number) {
  if (index >= LOADOUT_COUNT) throw new SenderError('No such loadout');
  const lo = [...ctx.db.loadout.characterId.filter(ch.id)].find(l => l.index === index);
  if (!lo) throw new SenderError('No such loadout');
  return lo;
}

/** Gear changes settle first, at the old stats (only the active loadout matters). */
function settleIfActive(ctx: Ctx, ch: Character, index: number) {
  if (ch.activeLoadout === index) ctx.db.character.id.update(settle(ctx, ch));
}

/** Puts an owned item into a loadout slot (moving it if it's in another slot there). */
export const equip = spacetimedb.reducer(
  { loadout: t.u8(), slot: t.u8(), itemId: t.u64() },
  (ctx, { loadout, slot, itemId }) => {
    const { ch } = requireActive(ctx);
    const lo = requireLoadout(ctx, ch, loadout);
    if (slot >= SLOT_COUNT) throw new SenderError('No such slot');
    const it = requireItem(ctx, ch, itemId);
    const slots = placeItem(lo.slots, slot, it, id => ctx.db.item.id.find(id) ?? undefined);
    if (typeof slots === 'string') throw new SenderError(slots);
    settleIfActive(ctx, ch, loadout);
    ctx.db.loadout.id.update({ ...lo, slots });
  }
);

export const unequip = spacetimedb.reducer({ loadout: t.u8(), slot: t.u8() }, (ctx, { loadout, slot }) => {
  const { ch } = requireActive(ctx);
  const lo = requireLoadout(ctx, ch, loadout);
  if (slot >= SLOT_COUNT) throw new SenderError('No such slot');
  settleIfActive(ctx, ch, loadout);
  ctx.db.loadout.id.update({ ...lo, slots: lo.slots.map((id, i) => (i === slot ? 0n : id)) });
});

/** Fights with another loadout from now on; settles at the old one first. */
export const switchLoadout = spacetimedb.reducer({ loadout: t.u8() }, (ctx, { loadout }) => {
  const { ch } = requireActive(ctx);
  requireLoadout(ctx, ch, loadout);
  if (ch.activeLoadout === loadout) return;
  ctx.db.character.id.update({ ...settle(ctx, ch), activeLoadout: loadout });
});

/** Copies the gear of the loadout in use into another loadout (items can sit in several loadouts). */
export const copyLoadout = spacetimedb.reducer({ loadout: t.u8() }, (ctx, { loadout }) => {
  const { ch } = requireActive(ctx);
  const lo = requireLoadout(ctx, ch, loadout);
  if (ch.activeLoadout === loadout) throw new SenderError('That loadout is already in use');
  const from = requireLoadout(ctx, ch, ch.activeLoadout);
  ctx.db.loadout.id.update({ ...lo, slots: [...from.slots] });
});

export const renameLoadout =spacetimedb.reducer({ loadout: t.u8(), name: t.string() }, (ctx, { loadout, name }) => {
  const { ch } = requireActive(ctx);
  const lo = requireLoadout(ctx, ch, loadout);
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > MAX_LOADOUT_NAME) throw new SenderError(`Name must be 1-${MAX_LOADOUT_NAME} characters`);
  ctx.db.loadout.id.update({ ...lo, name: trimmed });
});

export const setProfile = spacetimedb.reducer({ loadout: t.u8(), profile: EquipProfile }, (ctx, { loadout, profile }) => {
  const { ch } = requireActive(ctx);
  ctx.db.loadout.id.update({ ...requireLoadout(ctx, ch, loadout), profile });
});

/** Locks or unlocks a loadout slot: auto-equip leaves a locked slot as it is. Manual equipping still works. */
export const lockSlot = spacetimedb.reducer({ loadout: t.u8(), slot: t.u8(), locked: t.bool() }, (ctx, { loadout, slot, locked }) => {
  const { ch } = requireActive(ctx);
  const lo = requireLoadout(ctx, ch, loadout);
  if (slot >= SLOT_COUNT) throw new SenderError('No such slot');
  const bit = 1 << slot;
  ctx.db.loadout.id.update({ ...lo, lockedSlots: locked ? lo.lockedSlots | bit : lo.lockedSlots & ~bit });
});

/** Equips the best owned items for `profile` (the client keeps each loadout's pick, and the custom profiles' `weights`), scored against the reference dummy; locked slots stay. */
export const autoEquip = spacetimedb.reducer(
  { loadout: t.u8(), profile: t.string(), weights: t.array(t.f64()) },
  (ctx, { loadout, profile, weights }) => {
    const { ch } = requireActive(ctx);
    const lo = requireLoadout(ctx, ch, loadout);
    if (!isProfile(profile)) throw new SenderError('No such profile');
    if (isCustomProfile(profile) && !validCustomWeights(weights)) throw new SenderError('Invalid profile weights');
    settleIfActive(ctx, ch, loadout); // may level up, which changes the scores
    const level = ctx.db.character.id.find(ch.id)!.level;
    const items = [...ctx.db.item.characterId.filter(ch.id)];
    const slots = bestSlots(level, items, lo.slots, profile, lo.lockedSlots, weights);
    if (slots.join() !== lo.slots.join()) ctx.db.loadout.id.update({ ...lo, slots });
  }
);

/** Locked items can't be salvaged. */
export const lockItem = spacetimedb.reducer({ itemId: t.u64(), locked: t.bool() }, (ctx, { itemId, locked }) => {
  const { ch } = requireActive(ctx);
  ctx.db.item.id.update({ ...requireItem(ctx, ch, itemId), locked });
});

/** A bag item that may be salvaged or scrapped: not locked and in no loadout. */
function requireDisposable(ctx: Ctx, ch: Character, id: bigint, equipped: Set<bigint>) {
  const it = requireItem(ctx, ch, id);
  if (it.locked) throw new SenderError('Item is locked');
  if (equipped.has(id)) throw new SenderError('Item is in a loadout');
  return it;
}

/** Turns bag items into Dust and gold. Locked items and items in any loadout are refused. */
export const salvage = spacetimedb.reducer({ itemIds: t.array(t.u64()) }, (ctx, { itemIds }) => {
  const { ch } = requireActive(ctx);
  const equipped = new Set([...ctx.db.loadout.characterId.filter(ch.id)].flatMap(l => l.slots));
  let dust = 0n;
  let gold = 0n;
  for (const id of new Set(itemIds)) {
    const it = requireDisposable(ctx, ch, id, equipped);
    const v = salvageValue(it.rarity.tag, it.tier);
    dust += v.dust;
    gold += v.gold;
    ctx.db.item.id.delete(id);
  }
  ctx.db.character.id.update({ ...ch, dust: ch.dust + dust, gold: ch.gold + gold });
});

/**
 * Scraps bag items (life-skills.md, "Recycle into materials"): straight into materials, with
 * no Dust or gold. Common to Legendary only; refused like `salvage`.
 */
export const scrapItems = spacetimedb.reducer({ itemIds: t.array(t.u64()) }, (ctx, { itemIds }) => {
  const { ch } = requireActive(ctx);
  const equipped = new Set([...ctx.db.loadout.characterId.filter(ch.id)].flatMap(l => l.slots));
  const scrapped: ScrapDrop[] = [];
  for (const id of new Set(itemIds)) {
    const it = requireDisposable(ctx, ch, id, equipped);
    const rarity = it.rarity.tag;
    if (!isScrapRarity(rarity)) throw new SenderError('Only Common to Legendary items can be scrapped');
    const materialId = scrapMaterialIdOf(it);
    if (materialId === undefined) throw new SenderError(`No tier ${it.tier} materials to scrap into yet`);
    addScrap(scrapped, materialId, rarity);
    ctx.db.item.id.delete(id);
  }
  addMaterials(ctx, ch.id, scrapMaterials(scrapped));
});
