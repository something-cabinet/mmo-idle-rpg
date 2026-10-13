import { SenderError, t } from 'spacetimedb/server';
import { spacetimedb } from '../schema';
import { CHAT_COOLDOWN_MICROS, CHAT_HISTORY, MAX_CHAT_LENGTH } from '../game';
import { requireActive } from '../helpers';

export const sendChat = spacetimedb.reducer({ text: t.string() }, (ctx, { text }) => {
  const { pres } = requireActive(ctx);
  const trimmed = text.trim();
  if (!trimmed) throw new SenderError('Message must not be empty');
  if (trimmed.length > MAX_CHAT_LENGTH) throw new SenderError('Message is too long');
  // The cooldown lives in a private table: `presence` is public, so writing it there
  // sent every chat message to every client twice.
  const last = ctx.db.chatCooldown.identity.find(ctx.sender);
  if (last && ctx.timestamp.microsSinceUnixEpoch - last.lastChatAt.microsSinceUnixEpoch < CHAT_COOLDOWN_MICROS)
    throw new SenderError('Slow down');
  if (last) ctx.db.chatCooldown.identity.update({ identity: ctx.sender, lastChatAt: ctx.timestamp });
  else ctx.db.chatCooldown.insert({ identity: ctx.sender, lastChatAt: ctx.timestamp });

  const msg = ctx.db.chatMessage.insert({
    id: 0n,
    sender: ctx.sender,
    characterName: pres.characterName,
    text: trimmed,
    sentAt: ctx.timestamp,
  });
  // Keep only the newest CHAT_HISTORY messages (ids are increasing). A loop, not a
  // single delete, so lowering CHAT_HISTORY also clears the older backlog.
  const oldest = msg.id - CHAT_HISTORY;
  const stale = [...ctx.db.chatMessage.iter()].filter(m => m.id <= oldest);
  for (const m of stale) ctx.db.chatMessage.id.delete(m.id);
});
