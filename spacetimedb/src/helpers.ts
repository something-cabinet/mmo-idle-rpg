// Shared server-side helpers. Not re-exported from index.ts: the module entry
// may only export reducers/views.
import { Timestamp, type Identity } from 'spacetimedb';
import { SenderError, type Infer, type ReducerCtx } from 'spacetimedb/server';
import { account, character, presence, spacetimedb } from './schema';
import { DEFAULT_LOADOUT_NAMES, LOADOUT_COUNT, MAX_OFFLINE_MICROS, project } from './game';
import { SLOT_COUNT } from './data/bases';

export type Ctx = ReducerCtx<(typeof spacetimedb)['schemaType']>;
export type Account = Infer<typeof account.rowType>;
export type Character = Infer<typeof character.rowType>;
export type Presence = Infer<typeof presence.rowType>;

/** The caller's account; throws if missing or banned. */
export function requireAccount(ctx: Ctx): Account {
  const acc = ctx.db.account.identity.find(ctx.sender);
  if (!acc) throw new SenderError('No account');
  if (acc.banned) throw new SenderError('Account is banned');
  return acc;
}

export function requireAdmin(ctx: Ctx): Account {
  const acc = requireAccount(ctx);
  if (acc.role.tag !== 'Admin') throw new SenderError('Admins only');
  return acc;
}

/** The caller's character, which must be in the world from this account. */
export function requireActive(ctx: Ctx): { acc: Account; ch: Character; pres: Presence } {
  const acc = requireAccount(ctx);
  const pres = ctx.db.presence.identity.find(ctx.sender);
  if (!pres) throw new SenderError('Not in the world');
  const ch = ctx.db.character.id.find(pres.characterId);
  if (!ch) throw new SenderError('No character');
  return { acc, ch, pres };
}

/** Grants idle rewards earned since `lastSettledAt` (see `project`). */
export function settle(ch: Character, now: Timestamp, capMicros?: bigint): Character {
  const p = project(
    { ...ch, settledMicros: ch.lastSettledAt.microsSinceUnixEpoch },
    now.microsSinceUnixEpoch,
    capMicros
  );
  return {
    ...ch,
    level: p.level,
    xp: p.xp,
    gold: p.gold,
    lastSettledAt: new Timestamp(p.settledMicros),
  };
}

/**
 * Creates the per-character rows every character must have (loadouts, loot
 * filter). Idempotent, so it also backfills characters made before they existed.
 */
export function ensureCharacterRows(ctx: Ctx, characterId: bigint) {
  const have = new Set([...ctx.db.loadout.characterId.filter(characterId)].map(l => l.index));
  for (let i = 0; i < LOADOUT_COUNT; i++) {
    if (have.has(i)) continue;
    ctx.db.loadout.insert({
      id: 0n,
      characterId,
      index: i,
      name: DEFAULT_LOADOUT_NAMES[i],
      profile: { tag: 'Damage' },
      slots: Array.from({ length: SLOT_COUNT }, () => 0n),
    });
  }
  if (!ctx.db.lootFilter.characterId.find(characterId)) {
    ctx.db.lootFilter.insert({ characterId, minRarity: { tag: 'Magic' }, keepAffixes: [] });
  }
}

/** Deletes a character and everything it owns. */
export function deleteCharacter(ctx: Ctx, characterId: bigint) {
  ctx.db.item.characterId.delete(characterId);
  ctx.db.loadout.characterId.delete(characterId);
  ctx.db.bossKill.characterId.delete(characterId);
  ctx.db.lootFilter.characterId.delete(characterId);
  ctx.db.character.id.delete(characterId);
}

/**
 * Puts the caller's character into the world on this connection (taking over
 * from any other tab), granting its capped offline progress. No-op without a
 * character.
 */
export function enterWorld(ctx: Ctx) {
  const ch = ctx.db.character.owner.find(ctx.sender);
  if (!ch || !ctx.connectionId) return;
  leaveWorld(ctx, ctx.sender);
  ensureCharacterRows(ctx, ch.id);
  const settled = settle(ch, ctx.timestamp, MAX_OFFLINE_MICROS);
  ctx.db.character.id.update(settled);
  ctx.db.presence.insert({
    identity: ctx.sender,
    connectionId: ctx.connectionId,
    characterId: ch.id,
    characterName: ch.name,
    since: ctx.timestamp,
    lastChatAt: ctx.timestamp,
  });
}

/** Takes `who` out of the world, settling the active character's online time. */
export function leaveWorld(ctx: Ctx, who: Identity) {
  const pres = ctx.db.presence.identity.find(who);
  if (!pres) return;
  const ch = ctx.db.character.id.find(pres.characterId);
  if (ch) ctx.db.character.id.update(settle(ch, ctx.timestamp));
  ctx.db.presence.identity.delete(who);
}
