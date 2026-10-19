// Cosmetics (docs/design/cosmetics.md): choosing what the character wears.
import { SenderError, t } from 'spacetimedb/server';
import { spacetimedb } from '../schema';
import { cosmeticOf, type CosmeticSlot } from '../data/cosmetics';
import { requireActive } from '../helpers';

/** Wears a title, name visual and nameplate (0 = none); each must be unlocked. */
export const setLook = spacetimedb.reducer(
  { titleId: t.u16(), visualId: t.u16(), plateId: t.u16() },
  (ctx, { titleId, visualId, plateId }) => {
    const { ch } = requireActive(ctx);
    const have = new Set([...ctx.db.cosmeticUnlock.characterId.filter(ch.id)].map(u => u.cosmeticId));
    const check = (id: number, slot: CosmeticSlot) => {
      if (id === 0) return;
      if (!cosmeticOf(id, slot)) throw new SenderError(`No such ${slot}`);
      if (!have.has(id)) throw new SenderError('Not unlocked yet');
    };
    check(titleId, 'title');
    check(visualId, 'visual');
    check(plateId, 'plate');
    const row = { characterId: ch.id, titleId, visualId, plateId };
    const old = ctx.db.look.characterId.find(ch.id);
    if (!titleId && !visualId && !plateId) {
      if (old) ctx.db.look.characterId.delete(ch.id);
    } else if (old) ctx.db.look.characterId.update(row);
    else ctx.db.look.insert(row);
  }
);
