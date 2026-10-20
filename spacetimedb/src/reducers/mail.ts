// Mailbox: messages with attachments. Only the game sends mail for now: admins call
// `sendMail` / `recallMail` from the CLI (README.md, "Mail"). Players read, claim and
// delete. The `sender` column leaves room for player gifts later (trading.md).
import { Timestamp } from 'spacetimedb';
import { SenderError, t } from 'spacetimedb/server';
import { spacetimedb } from '../schema';
import { UNIQUES_BY_ID } from '../data/uniques';
import { makeItem, makeUnique, seededRng } from '../loot';
import { DAY_MICROS, MAIL_ESCROW, MAX_MAIL_BODY, MAX_MAIL_SUBJECT, SYSTEM_SENDER_NAME, hasAttachments, parseGift } from '../mail';
import { addMaterials, addSupply, bagCount, deleteMail, discover, requireActive, requireAdmin, type Character, type Ctx, type Mail } from '../helpers';

/**
 * Sends a mail from the game to the characters named in `to` (any case), or to every
 * character when `to` is empty. `gift` lists the attachments (mail.ts `parseGift`, '' for
 * none); each recipient gets their own freshly rolled items. `days` > 0: the mail and its
 * unclaimed attachments are deleted that many days after sending; 0 keeps it until the
 * player deletes it. All or nothing: one unknown name fails the whole send.
 */
export const sendMail = spacetimedb.reducer(
  { to: t.array(t.string()), subject: t.string(), body: t.string(), gift: t.string(), days: t.u32() },
  (ctx, { to, subject, body, gift, days }) => {
    requireAdmin(ctx);
    subject = subject.trim();
    body = body.trim();
    if (!subject) throw new SenderError('Subject must not be empty');
    if (subject.length > MAX_MAIL_SUBJECT) throw new SenderError(`Subject is longer than ${MAX_MAIL_SUBJECT}`);
    if (body.length > MAX_MAIL_BODY) throw new SenderError(`Body is longer than ${MAX_MAIL_BODY}`);
    let g;
    try {
      g = parseGift(gift);
    } catch (e) {
      throw new SenderError(e instanceof Error ? e.message : String(e));
    }

    const names = [...new Set(to.map(n => n.trim().toLowerCase()).filter(Boolean))];
    let recipients: Character[];
    if (names.length) {
      const found = names.map(n => ctx.db.character.nameKey.find(n));
      const missing = names.filter((_, i) => !found[i]);
      if (missing.length) throw new SenderError(`No such character: ${missing.join(', ')}`);
      recipients = found as Character[];
    } else {
      recipients = [...ctx.db.character.iter()];
    }

    const sent = ctx.db.sentMail.insert({
      id: 0n,
      sentBy: ctx.sender,
      subject,
      gift,
      to,
      recipients: recipients.length,
      sentAt: ctx.timestamp,
      recalled: 0,
    });
    const expiresAt = days > 0 ? new Timestamp(ctx.timestamp.microsSinceUnixEpoch + BigInt(days) * DAY_MICROS) : undefined;
    for (const ch of recipients) {
      const rng = seededRng(ch.id, sent.id, ctx.timestamp.microsSinceUnixEpoch);
      const itemIds = g.items.map(gi => {
        const rolled = 'uniqueId' in gi ? makeUnique(rng, UNIQUES_BY_ID.get(gi.uniqueId)!) : makeItem(rng, gi.baseId, gi.tier, gi.rarity);
        return ctx.db.item.insert({ ...rolled, id: 0n, characterId: MAIL_ESCROW, locked: false, createdAt: ctx.timestamp }).id;
      });
      ctx.db.mail.insert({
        id: 0n,
        characterId: ch.id,
        sentMailId: sent.id,
        sender: { tag: 'System' },
        senderName: SYSTEM_SENDER_NAME,
        subject,
        body,
        sentAt: ctx.timestamp,
        expiresAt,
        read: false,
        claimed: false,
        gold: g.gold,
        dust: g.dust,
        raidTokens: g.raidTokens,
        materials: g.materials,
        supplies: g.supplies,
        cosmetics: g.cosmetics,
        itemIds,
      });
    }
    console.info(`sent mail ${sent.id}: "${subject}" to ${recipients.length} character(s)`);
  }
);

/** Takes back every unclaimed copy of a `sendMail` (its `sent_mail` ID). Claimed copies stay with their owners. */
export const recallMail = spacetimedb.reducer({ sentMailId: t.u64() }, (ctx, { sentMailId }) => {
  requireAdmin(ctx);
  const sent = ctx.db.sentMail.id.find(sentMailId);
  if (!sent) throw new SenderError('No such sent mail');
  let n = 0;
  for (const m of [...ctx.db.mail.sentMailId.filter(sentMailId)]) {
    if (m.claimed) continue;
    deleteMail(ctx, m);
    n++;
  }
  ctx.db.sentMail.id.update({ ...sent, recalled: sent.recalled + n });
  console.info(`sent mail ${sentMailId}: recalled ${n}`);
});

/** One of the caller's mails; throws if missing, someone else's or expired. */
function requireMail(ctx: Ctx, ch: Character, mailId: bigint): Mail {
  const m = ctx.db.mail.id.find(mailId);
  if (!m || m.characterId !== ch.id) throw new SenderError('No such mail');
  if (m.expiresAt && m.expiresAt.microsSinceUnixEpoch <= ctx.timestamp.microsSinceUnixEpoch) throw new SenderError('This mail has expired');
  return m;
}

export const readMail = spacetimedb.reducer({ mailId: t.u64() }, (ctx, { mailId }) => {
  const { ch } = requireActive(ctx);
  const m = requireMail(ctx, ch, mailId);
  if (!m.read) ctx.db.mail.id.update({ ...m, read: true });
});

/** Takes everything attached to a mail. Fails, taking nothing, if the bag lacks room for its items. */
export const claimMail = spacetimedb.reducer({ mailId: t.u64() }, (ctx, { mailId }) => {
  const { ch } = requireActive(ctx);
  const m = requireMail(ctx, ch, mailId);
  if (m.claimed) throw new SenderError('Already claimed');
  const free = ch.bagSize - bagCount(ctx, ch.id);
  if (m.itemIds.length > free) throw new SenderError(`Your bag needs ${m.itemIds.length} free slots`);

  ctx.db.character.id.update({ ...ch, gold: ch.gold + m.gold, dust: ch.dust + m.dust, raidTokens: ch.raidTokens + m.raidTokens });
  addMaterials(ctx, ch.id, m.materials);
  for (const s of m.supplies) addSupply(ctx, ch.id, s.supplyId, s.count);
  const have = new Set([...ctx.db.cosmeticUnlock.characterId.filter(ch.id)].map(u => u.cosmeticId));
  for (const id of m.cosmetics) {
    if (!have.has(id)) ctx.db.cosmeticUnlock.insert({ id: 0n, characterId: ch.id, cosmeticId: id, unlockedAt: ctx.timestamp });
  }
  for (const id of m.itemIds) {
    const it = ctx.db.item.id.find(id);
    if (!it || it.characterId !== MAIL_ESCROW) continue;
    ctx.db.item.id.update({ ...it, characterId: ch.id });
    discover(ctx, ch.id, it.tier, [{ baseId: it.baseId, uniqueId: it.uniqueId }]);
  }
  ctx.db.mail.id.update({ ...m, read: true, claimed: true });
});

/** Deletes a mail; one with unclaimed attachments must be claimed first, so nothing is thrown away by accident. */
export const deleteMailMessage = spacetimedb.reducer({ mailId: t.u64() }, (ctx, { mailId }) => {
  const { ch } = requireActive(ctx);
  const m = requireMail(ctx, ch, mailId);
  if (hasAttachments(m)) throw new SenderError('Claim the attachments first');
  deleteMail(ctx, m);
});

/** Deletes every read mail with nothing left to claim. */
export const deleteReadMail = spacetimedb.reducer(ctx => {
  const { ch } = requireActive(ctx);
  for (const m of [...ctx.db.mail.characterId.filter(ch.id)]) {
    if (m.read && !hasAttachments(m)) deleteMail(ctx, m);
  }
});
