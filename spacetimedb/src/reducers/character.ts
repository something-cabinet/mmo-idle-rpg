import { SenderError, t } from 'spacetimedb/server';
import { spacetimedb } from '../schema';
import { BAG_START, validateCharacterName } from '../game';
import { ENEMIES_BY_ID, STARTING_TARGET, STARTING_ZONE } from '../data/zones';
import { enterWorld, hasKilledBoss, requireAccount, requireActive, settle, zoneUnlocked } from '../helpers';

/** Creates the account's one character and enters the world with it. */
export const createCharacter = spacetimedb.reducer({ name: t.string() }, (ctx, { name }) => {
  requireAccount(ctx);
  if (ctx.db.character.owner.find(ctx.sender)) throw new SenderError('You already have a character');
  const trimmed = name.trim();
  const invalid = validateCharacterName(trimmed);
  if (invalid) throw new SenderError(invalid);
  const nameKey = trimmed.toLowerCase();
  if (ctx.db.character.nameKey.find(nameKey)) throw new SenderError('Name is taken');

  ctx.db.character.insert({
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
    bagSize: BAG_START,
    activeLoadout: 0,
    zoneId: STARTING_ZONE,
    targetEnemyId: STARTING_TARGET,
  });
  enterWorld(ctx); // also creates loadouts and the loot filter
});

/** Plays on this connection, taking over from another open tab. */
export const playHere = spacetimedb.reducer(ctx => {
  requireAccount(ctx);
  if (!ctx.db.character.owner.find(ctx.sender)) throw new SenderError('No character');
  enterWorld(ctx);
});

/**
 * Chooses the enemy to farm. Its zone must be unlocked; a boss becomes farmable
 * after its first kill (challenged separately). Settles at the old target first.
 */
export const setTarget = spacetimedb.reducer({ enemyId: t.u16() }, (ctx, { enemyId }) => {
  const { ch } = requireActive(ctx);
  const found = ENEMIES_BY_ID.get(enemyId);
  if (!found) throw new SenderError('No such enemy');
  const { zone, enemy } = found;
  if (!zoneUnlocked(ctx, ch.id, zone)) throw new SenderError('Zone is locked');
  if (enemy.boss && !hasKilledBoss(ctx, ch.id, zone.id)) throw new SenderError('Defeat the boss first');
  ctx.db.character.id.update({ ...settle(ctx, ch), zoneId: zone.id, targetEnemyId: enemy.id });
});
