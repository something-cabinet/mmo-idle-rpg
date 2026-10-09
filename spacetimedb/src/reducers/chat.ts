import { SenderError, t } from 'spacetimedb/server';
import { spacetimedb } from '../schema';
import { CHAT_COOLDOWN_MICROS, CHAT_HISTORY, MAX_CHAT_LENGTH } from '../game';
import { requireActive } from '../helpers';

export const sendChat = spacetimedb.reducer({ text: t.string() }, (ctx, { text }) => {
  const { pres } = requireActive(ctx);
  const trimmed = text.trim();
  if (!trimmed) throw new SenderError('Message must not be empty');
  if (trimmed.length > MAX_CHAT_LENGTH) throw new SenderError('Message is too long');
  const sinceLast = ctx.timestamp.microsSinceUnixEpoch - pres.lastChatAt.microsSinceUnixEpoch;
  if (sinceLast < CHAT_COOLDOWN_MICROS) throw new SenderError('Slow down');

  ctx.db.presence.identity.update({ ...pres, lastChatAt: ctx.timestamp });
  const msg = ctx.db.chatMessage.insert({
    id: 0n,
    sender: ctx.sender,
    characterName: pres.characterName,
    text: trimmed,
    sentAt: ctx.timestamp,
  });
  // Keep only the newest CHAT_HISTORY messages (ids are increasing).
  if (msg.id >= CHAT_HISTORY) ctx.db.chatMessage.id.delete(msg.id - CHAT_HISTORY);
});
