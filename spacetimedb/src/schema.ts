import { schema, table, t } from 'spacetimedb/server';

export const AccountKind = t.enum('AccountKind', {
  /** Anonymous SpacetimeDB identity; lives only in one browser's storage. */
  Guest: t.unit(),
  /** Logged in through SpacetimeAuth; same identity on every device. */
  Registered: t.unit(),
});

export const Role = t.enum('Role', {
  Player: t.unit(),
  Admin: t.unit(),
});

/**
 * One row per identity (= login). Private: holds email and moderation state.
 * Clients read their own row through the `my_account` view.
 */
export const account = table(
  { name: 'account' },
  {
    identity: t.identity().primaryKey(),
    kind: AccountKind,
    role: Role,
    banned: t.bool(),
    email: t.string().optional(),
    createdAt: t.timestamp(),
    lastLoginAt: t.timestamp(),
  }
);

/**
 * The account's one character (one per account by design: alts would just be
 * extra idle farms). Progress is a snapshot as of `lastSettledAt`; idle gains
 * after that are computed with `project()` from game.ts.
 */
export const character = table(
  { name: 'character', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    owner: t.identity().unique(),
    name: t.string(),
    /** Lowercased name, for case-insensitive uniqueness. */
    nameKey: t.string().unique(),
    level: t.u32(),
    xp: t.u64(),
    gold: t.u64(),
    power: t.u32(),
    lastSettledAt: t.timestamp(),
    createdAt: t.timestamp(),
  }
);

/**
 * Who is in the world right now. A row exists while the account is connected
 * and has a character.
 */
export const presence = table(
  { name: 'presence', public: true },
  {
    identity: t.identity().primaryKey(),
    /** The connection that is playing (an account may have several tabs open). */
    connectionId: t.connectionId(),
    characterId: t.u64().unique(),
    characterName: t.string(),
    since: t.timestamp(),
    lastChatAt: t.timestamp(),
  }
);

/** A guest consenting to have its character moved into a registered account. */
export const linkOffer = table(
  { name: 'link_offer' },
  {
    guest: t.identity().primaryKey(),
    target: t.identity(),
    createdAt: t.timestamp(),
  }
);

export const chatMessage = table(
  { name: 'chat_message', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    sender: t.identity(),
    /** Snapshot, so history still reads right after a character is deleted. */
    characterName: t.string(),
    text: t.string(),
    sentAt: t.timestamp(),
  }
);

export const spacetimedb = schema({
  account,
  character,
  presence,
  linkOffer,
  chatMessage,
});
