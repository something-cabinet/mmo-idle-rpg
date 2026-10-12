import { SenderError, t } from 'spacetimedb/server';
import { spacetimedb } from '../schema';
import { isFriend, requireActive } from '../helpers';

/** Starts inspecting a character's gear and stats (online, or a friend's at any time); 0 stops. */
export const inspectCharacter = spacetimedb.reducer({ characterId: t.u64() }, (ctx, { characterId }) => {
  const { ch } = requireActive(ctx);
  const cur = ctx.db.inspect.viewer.find(ctx.sender);
  if (characterId === 0n) {
    if (cur) ctx.db.inspect.viewer.delete(ctx.sender);
    return;
  }
  if (!ctx.db.presence.characterId.find(characterId) && !isFriend(ctx, ch.id, characterId))
    throw new SenderError('That player is not online and not on your friend list');
  if (cur) ctx.db.inspect.viewer.update({ ...cur, characterId });
  else ctx.db.inspect.insert({ viewer: ctx.sender, characterId });
});
