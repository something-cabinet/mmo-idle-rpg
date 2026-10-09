import { SenderError, t } from 'spacetimedb/server';
import { spacetimedb } from '../schema';
import { upgradeCost, validateCharacterName } from '../game';
import { enterWorld, requireAccount, requireActive, settle } from '../helpers';

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
    power: 1,
    lastSettledAt: ctx.timestamp,
    createdAt: ctx.timestamp,
  });
  enterWorld(ctx);
});

/** Plays on this connection, taking over from another open tab. */
export const playHere = spacetimedb.reducer(ctx => {
  requireAccount(ctx);
  if (!ctx.db.character.owner.find(ctx.sender)) throw new SenderError('No character');
  enterWorld(ctx);
});

export const buyUpgrade = spacetimedb.reducer(ctx => {
  const { ch } = requireActive(ctx);
  // Settle first so gold earned since the last snapshot is spendable.
  const settled = settle(ch, ctx.timestamp);
  const cost = upgradeCost(settled.power);
  if (settled.gold < cost) throw new SenderError('Not enough gold');
  ctx.db.character.id.update({ ...settled, gold: settled.gold - cost, power: settled.power + 1 });
});
