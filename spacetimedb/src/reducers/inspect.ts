import { SenderError, t } from 'spacetimedb/server';
import { spacetimedb } from '../schema';
import { requireActive } from '../helpers';

/** Starts inspecting an online character's gear and stats; 0 stops. */
export const inspectCharacter = spacetimedb.reducer({ characterId: t.u64() }, (ctx, { characterId }) => {
  requireActive(ctx);
  const cur = ctx.db.inspect.viewer.find(ctx.sender);
  if (characterId === 0n) {
    if (cur) ctx.db.inspect.viewer.delete(ctx.sender);
    return;
  }
  if (!ctx.db.presence.characterId.find(characterId)) throw new SenderError('That player is not online');
  if (cur) ctx.db.inspect.viewer.update({ ...cur, characterId });
  else ctx.db.inspect.insert({ viewer: ctx.sender, characterId });
});
