import { SenderError, t } from 'spacetimedb/server';
import { account, spacetimedb } from '../schema';
import { ADMIN_SUBJECTS, OIDC_CLIENT_IDS, SPACETIMEAUTH_ISSUER } from '../config';
import { LINK_OFFER_TTL_MICROS } from '../game';
import { deleteCharacter, enterWorld, leaveWorld, requireAccount, requireAdmin, type Account } from '../helpers';

/**
 * Every connection is either a guest (any token not issued by our
 * SpacetimeAuth project, including SpacetimeDB's anonymous tokens) or a
 * registered user. Throwing here rejects the connection. A connecting
 * account with a character enters the world right away.
 */
export const onConnect = spacetimedb.clientConnected(ctx => {
  const jwt = ctx.senderAuth.jwt;
  let kind: Account['kind'] = { tag: 'Guest' };
  let role: Account['role'] = { tag: 'Player' };
  let email: string | undefined;

  if (jwt?.issuer === SPACETIMEAUTH_ISSUER) {
    if (!jwt.audience.some(aud => OIDC_CLIENT_IDS.includes(aud))) {
      throw new SenderError('Login token was not issued for this game');
    }
    kind = { tag: 'Registered' };
    if (ADMIN_SUBJECTS.includes(jwt.subject)) role = { tag: 'Admin' };
    const claim = jwt.fullPayload['email'];
    if (typeof claim === 'string') email = claim;
  }

  const existing = ctx.db.account.identity.find(ctx.sender);
  if (existing) {
    if (existing.banned) throw new SenderError('Account is banned');
    ctx.db.account.identity.update({
      ...existing,
      kind,
      role,
      email: email ?? existing.email,
      lastLoginAt: ctx.timestamp,
    });
    enterWorld(ctx);
    return;
  }

  ctx.db.account.insert({
    identity: ctx.sender,
    kind,
    role,
    banned: false,
    email,
    createdAt: ctx.timestamp,
    lastLoginAt: ctx.timestamp,
  });
});

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
