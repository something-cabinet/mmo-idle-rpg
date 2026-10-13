import type { Identity } from 'spacetimedb';
import { DbConnection, tables, type ErrorContext } from './module_bindings';

const HOST = import.meta.env.VITE_SPACETIMEDB_HOST ?? 'ws://localhost:3000';
const DB_NAME = import.meta.env.VITE_SPACETIMEDB_DB_NAME ?? 'mmo-idle-rpg';
// A guest's token *is* the guest account: losing it loses the characters.
const GUEST_TOKEN_KEY = `stdb_guest_token:${HOST}:${DB_NAME}`;

export const serverLabel = `${DB_NAME} @ ${HOST}`;

export const guestToken = {
  load(): string | undefined {
    try {
      return localStorage.getItem(GUEST_TOKEN_KEY) ?? undefined;
    } catch {
      return undefined;
    }
  },
  save(token: string) {
    try {
      localStorage.setItem(GUEST_TOKEN_KEY, token);
    } catch {
      // Storage blocked: the guest just won't survive a reload.
    }
  },
  clear() {
    try {
      localStorage.removeItem(GUEST_TOKEN_KEY);
    } catch {
      // ignore
    }
  },
};

export interface ConnectHandlers {
  onConnect(conn: DbConnection, identity: Identity, token: string): void;
  onDisconnect(error?: Error): void;
  onConnectError(error: Error): void;
}

export function openConnection(token: string | undefined, h: ConnectHandlers): DbConnection {
  return DbConnection.builder()
    .withUri(HOST)
    .withDatabaseName(DB_NAME)
    .withToken(token)
    .onConnect(h.onConnect)
    .onDisconnect((_ctx, error) => h.onDisconnect(error))
    .onConnectError((_ctx: ErrorContext, error: Error) => h.onConnectError(error))
    .build();
}

/** Subscribes to everything the client needs; `onReady` fires once the data is in. */
export function subscribeAll(conn: DbConnection, me: Identity, onReady: () => void) {
  conn
    .subscriptionBuilder()
    .onApplied(onReady)
    .subscribe([
      tables.myAccount,
      tables.character.where(r => r.owner.eq(me)),
      tables.presence,
      tables.chatMessage,
      tables.myItems,
      tables.myMaterials,
      tables.myLoadouts,
      tables.myLootFilter,
      tables.myBossKills,
      tables.myEnemyKills,
      tables.myDiscoveries,
      tables.mySettleLog,
      tables.inspectedCharacter,
      tables.inspectedLoadout,
      tables.inspectedItems,
      tables.myFriends,
      tables.myFriendCharacters,
      tables.raidParty,
      tables.raidMember,
      tables.myRaidLog,
      tables.raidPartyCharacters,
      tables.raidPartyLoadouts,
      tables.raidPartyItems,
    ]);
}

/** Calls `onChange` on any change to subscribed rows. */
export function watchAll(conn: DbConnection, onChange: () => void) {
  const { myAccount, character, presence, chatMessage, myItems, myMaterials, myLoadouts, myLootFilter, myBossKills, myEnemyKills, myDiscoveries, mySettleLog } = conn.db;
  const { inspectedCharacter, inspectedLoadout, inspectedItems, myFriends, myFriendCharacters } = conn.db;
  const { raidParty, raidMember, myRaidLog, raidPartyCharacters, raidPartyLoadouts, raidPartyItems } = conn.db;
  for (const table of [myAccount, character, presence, chatMessage, myItems, myMaterials, myLoadouts, myLootFilter, myBossKills, myEnemyKills, myDiscoveries, mySettleLog,
    inspectedCharacter, inspectedLoadout, inspectedItems, myFriends, myFriendCharacters, raidParty, raidMember, myRaidLog, raidPartyCharacters, raidPartyLoadouts, raidPartyItems]) {
    table.onInsert(onChange);
    table.onDelete(onChange);
  }
  // Rows with a primary key (views included) change in place.
  for (const table of [character, presence, myItems, myMaterials, myLoadouts, myLootFilter, myEnemyKills, inspectedCharacter, inspectedLoadout, inspectedItems,
    myFriendCharacters, raidParty, raidMember, myRaidLog, raidPartyCharacters, raidPartyLoadouts, raidPartyItems])
    table.onUpdate(onChange);
}

/**
 * `who`'s character from the client cache. (Not `character.owner.find`: the
 * SDK builds a unique index at runtime but types it as a range index.)
 */
export function characterOf(conn: DbConnection, who: Identity) {
  for (const ch of conn.db.character.iter()) if (ch.owner.isEqual(who)) return ch;
  return undefined;
}

export type LinkResult = 'none' | 'moved' | 'discarded' | 'kept';

/**
 * Merges the guest stored in this browser into the logged-in account `conn`
 * (whose subscription must already be applied). Opens a short-lived second
 * connection as the guest to give consent (`offerLink`), then accepts it from
 * the account (`acceptLink`). If both have a character, `confirmDiscard`
 * decides; declining keeps the guest token so the guest can still be played
 * after logging out.
 */
export async function linkStoredGuest(
  conn: DbConnection,
  me: Identity,
  confirmDiscard: (guestCharacterName: string) => boolean
): Promise<LinkResult> {
  const token = guestToken.load();
  if (!token) return 'none';

  const guestConn = await new Promise<{ c: DbConnection; guest: Identity }>((resolve, reject) => {
    openConnection(token, {
      onConnect(c, guest) {
        c.subscriptionBuilder()
          .onApplied(() => resolve({ c, guest }))
          .subscribe(tables.character.where(r => r.owner.eq(guest)));
      },
      onDisconnect() {},
      onConnectError: reject,
    });
  });

  let result: LinkResult;
  try {
    const guestChar = characterOf(guestConn.c, guestConn.guest);
    const mine = characterOf(conn, me);
    const discard = Boolean(guestChar && mine);
    if (discard && !confirmDiscard(guestChar!.name)) return 'kept';
    await guestConn.c.reducers.offerLink({ target: me });
    result = !guestChar ? 'none' : discard ? 'discarded' : 'moved';
  } finally {
    guestConn.c.disconnect();
  }

  await conn.reducers.acceptLink({ guest: guestConn.guest, discardGuestCharacter: result === 'discarded' });
  guestToken.clear();
  return result;
}
