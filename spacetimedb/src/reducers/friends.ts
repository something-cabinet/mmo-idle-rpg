import { SenderError, t } from 'spacetimedb/server';
import { spacetimedb } from '../schema';
import { MAX_FRIENDS, isFriend, requireActive } from '../helpers';

/** Adds the character named `name` (any case) to the caller's friend list. */
export const addFriend = spacetimedb.reducer({ name: t.string() }, (ctx, { name }) => {
  const { ch } = requireActive(ctx);
  const target = ctx.db.character.nameKey.find(name.trim().toLowerCase());
  if (!target) throw new SenderError(`No character named "${name.trim()}"`);
  if (target.id === ch.id) throw new SenderError("You can't add yourself");
  if (isFriend(ctx, ch.id, target.id)) throw new SenderError(`${target.name} is already on your friend list`);
  if ([...ctx.db.friend.characterId.filter(ch.id)].length >= MAX_FRIENDS) throw new SenderError(`Friend list is full (${MAX_FRIENDS})`);
  ctx.db.friend.insert({ id: 0n, characterId: ch.id, friendId: target.id, addedAt: ctx.timestamp });
});

/** Removes a character from the caller's friend list. */
export const removeFriend = spacetimedb.reducer({ friendId: t.u64() }, (ctx, { friendId }) => {
  const { ch } = requireActive(ctx);
  for (const f of ctx.db.friend.characterId.filter(ch.id)) if (f.friendId === friendId) ctx.db.friend.id.delete(f.id);
});
