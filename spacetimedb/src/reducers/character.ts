import { SenderError, t } from 'spacetimedb/server';
import { spacetimedb } from '../schema';
import { BAG_START, validateCharacterName } from '../game';
import { ENEMIES_BY_ID, STARTING_TARGET, STARTING_ZONE } from '../data/zones';
import { STARTER_WEAPONS } from '../data/bases';
import {
  areaFound,
  ensureCharacterRows,
  enterWorld,
  grantStarterKit,
  NO_SKILL,
  requireAccount,
  requireActive,
  settle,
  zoneUnlocked,
} from '../helpers';

/**
 * Creates the account's one character with its starter kit (`starterWeapon` is a
 * base ID from STARTER_WEAPONS) and enters the world with it.
 */
export const createCharacter = spacetimedb.reducer({ name: t.string(), starterWeapon: t.u16() }, (ctx, { name, starterWeapon }) => {
  requireAccount(ctx);
  if (!(STARTER_WEAPONS as readonly number[]).includes(starterWeapon)) throw new SenderError('Pick a starter weapon');
  if (ctx.db.character.owner.find(ctx.sender)) throw new SenderError('You already have a character');
  const trimmed = name.trim();
  const invalid = validateCharacterName(trimmed);
  if (invalid) throw new SenderError(invalid);
  const nameKey = trimmed.toLowerCase();
  if (ctx.db.character.nameKey.find(nameKey)) throw new SenderError('Name is taken');

  const ch = ctx.db.character.insert({
    id: 0n,
    owner: ctx.sender,
    name: trimmed,
    nameKey,
    level: 1,
    xp: 0n,
    gold: 0n,
    lastSettledAt: ctx.timestamp,
    createdAt: ctx.timestamp,
    essence: 0n,
    dust: 0n,
    raidTokens: 0n,
    bagSize: BAG_START,
    activeLoadout: 0,
    zoneId: STARTING_ZONE,
    targetEnemyId: STARTING_TARGET,
    ...NO_SKILL,
    elixirId: 0,
    elixirKillsLeft: 0,
    elixirAutoRenew: true,
    elixirInfused: false,
    elixirInfuse: true,
    activityItemId: 0n,
  });
  ensureCharacterRows(ctx, ch.id);
  grantStarterKit(ctx, ch.id, starterWeapon);
  enterWorld(ctx);
});

/** Plays on this connection, taking over from another open tab. */
export const playHere = spacetimedb.reducer(ctx => {
  requireAccount(ctx);
  if (!ctx.db.character.owner.find(ctx.sender)) throw new SenderError('No character');
  enterWorld(ctx);
});

/**
 * Chooses the enemy to fight. Its zone must be unlocked, and a secret area's enemy
 * found (it is "No such enemy" until then, so the secret doesn't leak). Any enemy can be picked,
 * bosses included (a challenge until the first kill); a losing fight ends in a
 * defeat. Settles at the old target first; stops any life skill (one activity at a time).
 */
export const setTarget = spacetimedb.reducer({ enemyId: t.u16() }, (ctx, { enemyId }) => {
  const { ch } = requireActive(ctx);
  const found = ENEMIES_BY_ID.get(enemyId);
  if (!found) throw new SenderError('No such enemy');
  const { zone, enemy } = found;
  if (!zoneUnlocked(ctx, ch.id, zone)) throw new SenderError('Zone is locked');
  // Settle first, so kills up to now count toward finding a secret area.
  const settled = settle(ctx, ch);
  if (!areaFound(ctx, ch.id, zone, enemy.id)) throw new SenderError('No such enemy');
  ctx.db.character.id.update({ ...settled, zoneId: zone.id, targetEnemyId: enemy.id, ...NO_SKILL });
});

/** Stops fighting (or a life skill): settles, then goes idle (no target, no gains). */
export const flee = spacetimedb.reducer(ctx => {
  const { ch } = requireActive(ctx);
  ctx.db.character.id.update({ ...settle(ctx, ch), targetEnemyId: 0, ...NO_SKILL });
});

/**
 * Settles now. The client calls it when its projection shows a defeat, so the
 * server records it (and the client gets the report) without waiting for the timer.
 */
export const settleNow = spacetimedb.reducer(ctx => {
  const { ch } = requireActive(ctx);
  ctx.db.character.id.update(settle(ctx, ch));
});
