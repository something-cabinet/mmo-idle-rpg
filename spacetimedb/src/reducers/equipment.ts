import { SenderError, t } from 'spacetimedb/server';
import { EquipProfile, spacetimedb } from '../schema';
import { LOADOUT_COUNT } from '../game';
import { SLOT_COUNT } from '../data/bases';
import { autoEquip as bestSlots, placeItem } from '../equip';
import { salvageValue } from '../loot';
import { requireActive, settle, type Character, type Ctx, type Item } from '../helpers';

const MAX_LOADOUT_NAME = 20;

function requireLoadout(ctx: Ctx, ch: Character, index: number) {
  if (index >= LOADOUT_COUNT) throw new SenderError('No such loadout');
  const lo = [...ctx.db.loadout.characterId.filter(ch.id)].find(l => l.index === index);
  if (!lo) throw new SenderError('No such loadout');
  return lo;
}

function requireItem(ctx: Ctx, ch: Character, itemId: bigint): Item {
  const it = ctx.db.item.id.find(itemId);
  if (!it || it.characterId !== ch.id) throw new SenderError('No such item');
  return it;
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

export const renameLoadout = spacetimedb.reducer({ loadout: t.u8(), name: t.string() }, (ctx, { loadout, name }) => {
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

/** Equips the best owned items for the loadout's profile, scored against the reference dummy. */
export const autoEquip = spacetimedb.reducer({ loadout: t.u8() }, (ctx, { loadout }) => {
  const { ch } = requireActive(ctx);
  const lo = requireLoadout(ctx, ch, loadout);
  settleIfActive(ctx, ch, loadout); // may level up, which changes the scores
  const level = ctx.db.character.id.find(ch.id)!.level;
  const items = [...ctx.db.item.characterId.filter(ch.id)];
  const slots = bestSlots(level, items, lo.slots, lo.profile.tag);
  if (slots.join() !== lo.slots.join()) ctx.db.loadout.id.update({ ...lo, slots });
});

/** Locked items can't be salvaged. */
export const lockItem = spacetimedb.reducer({ itemId: t.u64(), locked: t.bool() }, (ctx, { itemId, locked }) => {
  const { ch } = requireActive(ctx);
  ctx.db.item.id.update({ ...requireItem(ctx, ch, itemId), locked });
});

/** Turns bag items into Essence. Locked items and items in any loadout are refused. */
export const salvage = spacetimedb.reducer({ itemIds: t.array(t.u64()) }, (ctx, { itemIds }) => {
  const { ch } = requireActive(ctx);
  const equipped = new Set([...ctx.db.loadout.characterId.filter(ch.id)].flatMap(l => l.slots));
  let essence = 0n;
  for (const id of new Set(itemIds)) {
    const it = requireItem(ctx, ch, id);
    if (it.locked) throw new SenderError('Item is locked');
    if (equipped.has(id)) throw new SenderError('Item is in a loadout');
    essence += salvageValue(it.rarity.tag, it.tier);
    ctx.db.item.id.delete(id);
  }
  ctx.db.character.id.update({ ...ch, essence: ch.essence + essence });
});
