// Per-player views over private tables: each client sees only its own rows.
import { t } from 'spacetimedb/server';
import { bossKill, enemyKill, item, loadout, lootFilter, settleLog, spacetimedb } from '../schema';

export const my_items = spacetimedb.view({ name: 'my_items', public: true }, t.array(item.rowType), ctx => {
  const ch = ctx.db.character.owner.find(ctx.sender);
  return ch ? [...ctx.db.item.characterId.filter(ch.id)] : [];
});

export const my_loadouts = spacetimedb.view({ name: 'my_loadouts', public: true }, t.array(loadout.rowType), ctx => {
  const ch = ctx.db.character.owner.find(ctx.sender);
  return ch ? [...ctx.db.loadout.characterId.filter(ch.id)] : [];
});

export const my_loot_filter = spacetimedb.view(
  { name: 'my_loot_filter', public: true },
  lootFilter.rowType.optional(),
  ctx => {
    const ch = ctx.db.character.owner.find(ctx.sender);
    return (ch && ctx.db.lootFilter.characterId.find(ch.id)) ?? undefined;
  }
);

export const my_boss_kills = spacetimedb.view({ name: 'my_boss_kills', public: true }, t.array(bossKill.rowType), ctx => {
  const ch = ctx.db.character.owner.find(ctx.sender);
  return ch ? [...ctx.db.bossKill.characterId.filter(ch.id)] : [];
});

export const my_enemy_kills = spacetimedb.view({ name: 'my_enemy_kills', public: true }, t.array(enemyKill.rowType), ctx => {
  const ch = ctx.db.character.owner.find(ctx.sender);
  return ch ? [...ctx.db.enemyKill.characterId.filter(ch.id)] : [];
});

export const my_settle_log = spacetimedb.view({ name: 'my_settle_log', public: true }, t.array(settleLog.rowType), ctx => {
  const ch = ctx.db.character.owner.find(ctx.sender);
  return ch ? [...ctx.db.settleLog.characterId.filter(ch.id)] : [];
});
