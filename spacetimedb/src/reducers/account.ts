import { SenderError, t } from 'spacetimedb/server';
import { account, spacetimedb } from '../schema';
import { ADMIN_IDENTITIES, ADMIN_SUBJECTS, OIDC_CLIENT_IDS, SPACETIMEAUTH_ISSUER } from '../config';
import { LINK_OFFER_TTL_MICROS } from '../game';
import { deleteCharacter, enterWorld, leaveWorld, requireAccount, requireAdmin, type Account, type Ctx } from '../helpers';
import { runMigrations } from '../migrate';

/**
 * Every connection is either a guest (any token not issued by our
 * SpacetimeAuth project, including SpacetimeDB's anonymous tokens) or a
 * registered user. Throwing here rejects the connection. A connecting
 * account with a character enters the world right away.
 */
export const onConnect = spacetimedb.clientConnected(ctx => {
  runMigrations(ctx);
  const jwt = ctx.senderAuth.jwt;
  let kind: Account['kind'] = { tag: 'Guest' };
  let role: Account['role'] = { tag: 'Player' };
  let email: string | undefined;
  let emailVerified = false;

  if (jwt?.issuer === SPACETIMEAUTH_ISSUER) {
    if (!jwt.audience.some(aud => OIDC_CLIENT_IDS.includes(aud))) {
      throw new SenderError('Login token was not issued for this game');
    }
    kind = { tag: 'Registered' };
    if (ADMIN_SUBJECTS.includes(jwt.subject)) role = { tag: 'Admin' };
    const claim = jwt.fullPayload['email'];
    if (typeof claim === 'string') email = claim;
    emailVerified = jwt.fullPayload['email_verified'] === true;
  }
  if (ADMIN_IDENTITIES.includes(ctx.sender.toHexString())) role = { tag: 'Admin' };

  const existing = ctx.db.account.identity.find(ctx.sender);
  if (existing?.banned) throw new SenderError('Account is banned');
  if (kind.tag === 'Registered' && email && emailVerified && !ctx.db.character.owner.find(ctx.sender)) {
    followEmail(ctx, email);
  }
  if (existing) {
    ctx.db.account.identity.update({
      ...existing,
      kind,
      role,
      email: email ?? existing.email,
      lastLoginAt: ctx.timestamp,
    });
  } else {
    ctx.db.account.insert({
      identity: ctx.sender,
      kind,
      role,
      banned: false,
      email,
      createdAt: ctx.timestamp,
      lastLoginAt: ctx.timestamp,
      changelogSeen: '',
    });
  }
  enterWorld(ctx);
});

/**
 * SpacetimeAuth can move a player to a new identity when they sign in with a
 * second method on the same email. When the caller has no character, takes
 * over the character of another registered account with that email and
 * deletes the old account. A ban on any account with that email rejects the
 * connection, so switching login method doesn't get around it. Players with a
 * character on both identities still need `transferCharacter`.
 */
function followEmail(ctx: Ctx, email: string) {
  const key = email.toLowerCase();
  const others = [...ctx.db.account.iter()].filter(
    a => a.kind.tag === 'Registered' && !a.identity.isEqual(ctx.sender) && a.email?.toLowerCase() === key
  );
  if (others.some(a => a.banned)) throw new SenderError('Account is banned');
  const old = others.find(a => ctx.db.character.owner.find(a.identity));
  if (!old) return;

  leaveWorld(ctx, old.identity);
  // Leaving settles the character, so read it after.
  const ch = ctx.db.character.owner.find(old.identity)!;
  ctx.db.character.id.update({ ...ch, owner: ctx.sender });
  for (const offer of [...ctx.db.linkOffer.iter()]) {
    if (offer.guest.isEqual(old.identity) || offer.target.isEqual(old.identity)) {
      ctx.db.linkOffer.guest.delete(offer.guest);
    }
  }
  ctx.db.account.identity.delete(old.identity);
}

export const onDisconnect = spacetimedb.clientDisconnected(ctx => {
  // Only leave the world if this connection is the one playing; another tab
  // of the same account may still be in game.
  const pres = ctx.db.presence.identity.find(ctx.sender);
  if (pres && ctx.connectionId && pres.connectionId.isEqual(ctx.connectionId)) {
    leaveWorld(ctx, ctx.sender);
  }
});

/** The caller's own account row (the table itself is private). */
export const my_account = spacetimedb.view(
  { name: 'my_account', public: true },
  account.rowType.optional(),
  ctx => ctx.db.account.identity.find(ctx.sender) ?? undefined
);

/**
 * Guest → registered account linking, in two steps so both sides prove
 * ownership with their own connection:
 *   1. the guest connection calls `offerLink(target)`;
 *   2. the registered connection calls `acceptLink(guest)`.
 * The guest's character moves to the account and the guest account is deleted.
 */
export const offerLink = spacetimedb.reducer({ target: t.identity() }, (ctx, { target }) => {
  const acc = requireAccount(ctx);
  if (acc.kind.tag !== 'Guest') throw new SenderError('Only guests can offer a link');
  const offer = { guest: ctx.sender, target, createdAt: ctx.timestamp };
  if (ctx.db.linkOffer.guest.find(ctx.sender)) ctx.db.linkOffer.guest.update(offer);
  else ctx.db.linkOffer.insert(offer);
});

/**
 * If both the guest and the account have a character, only one can be kept:
 * the call fails unless `discardGuestCharacter` confirms the guest's goes.
 */
export const acceptLink = spacetimedb.reducer(
  { guest: t.identity(), discardGuestCharacter: t.bool() },
  (ctx, { guest, discardGuestCharacter }) => {
    const acc = requireAccount(ctx);
    if (acc.kind.tag !== 'Registered') throw new SenderError('Log in first');

    const offer = ctx.db.linkOffer.guest.find(guest);
    if (!offer || !offer.target.isEqual(ctx.sender)) throw new SenderError('No link offer');
    const age = ctx.timestamp.microsSinceUnixEpoch - offer.createdAt.microsSinceUnixEpoch;
    if (age > LINK_OFFER_TTL_MICROS) throw new SenderError('Link offer expired');
    const guestAcc = ctx.db.account.identity.find(guest);
    if (!guestAcc || guestAcc.kind.tag !== 'Guest') throw new SenderError('Not a guest account');

    const guestChar = ctx.db.character.owner.find(guest);
    const mine = ctx.db.character.owner.find(ctx.sender);
    if (guestChar && mine && !discardGuestCharacter) {
      throw new SenderError('Both the guest and this account have a character');
    }

    leaveWorld(ctx, guest);
    if (guestChar) {
      if (mine) deleteCharacter(ctx, guestChar.id);
      else ctx.db.character.id.update({ ...guestChar, owner: ctx.sender });
    }
    ctx.db.linkOffer.guest.delete(guest);
    ctx.db.account.identity.delete(guest);
    enterWorld(ctx);
  }
);

/**
 * Records the newest changelog entry the player has read. The changelog ships with the
 * client, so the server takes the version as given.
 */
export const seeChangelog = spacetimedb.reducer({ version: t.string() }, (ctx, { version }) => {
  const acc = requireAccount(ctx);
  if (version.length > 16) throw new SenderError('Bad version');
  ctx.db.account.identity.update({ ...acc, changelogSeen: version });
});

export const setBanned = spacetimedb.reducer(
  { target: t.identity(), banned: t.bool() },
  (ctx, { target, banned }) => {
    requireAdmin(ctx);
    const acc = ctx.db.account.identity.find(target);
    if (!acc) throw new SenderError('No such account');
    ctx.db.account.identity.update({ ...acc, banned });
    if (banned) leaveWorld(ctx, target);
  }
);

/**
 * Gives the character named `name` to the account `to`. If `to` already has a
 * character, the two swap owners, so nothing is deleted and it can be undone.
 * For when the login provider moves a player to a new identity.
 */
export const transferCharacter = spacetimedb.reducer(
  { name: t.string(), to: t.identity() },
  (ctx, { name, to }) => {
    requireAdmin(ctx);
    const found = ctx.db.character.nameKey.find(name.toLowerCase());
    if (!found) throw new SenderError('No such character');
    if (found.owner.isEqual(to)) return;
    if (!ctx.db.account.identity.find(to)) throw new SenderError('No such account');

    const from = found.owner;
    // Leaving settles both characters, so read them after.
    leaveWorld(ctx, from);
    leaveWorld(ctx, to);
    const ch = ctx.db.character.id.find(found.id)!;
    const theirs = ctx.db.character.owner.find(to);
    // `owner` is unique: park the target's character on the module identity first.
    if (theirs) ctx.db.character.id.update({ ...theirs, owner: ctx.identity });
    ctx.db.character.id.update({ ...ch, owner: to });
    if (theirs) ctx.db.character.id.update({ ...theirs, owner: from });
  }
);
