// Per-player views over private tables: each client sees only its own rows.
import { t } from 'spacetimedb/server';
import { bossKill, character, enemyKill, item, loadout, lootFilter, settleLog, spacetimedb } from '../schema';

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

// The character the caller is inspecting (reducers/inspect.ts): its row, active loadout and the items in it.

export const inspected_character = spacetimedb.view(
  { name: 'inspected_character', public: true },
  character.rowType.optional(),
  ctx => {
    const req = ctx.db.inspect.viewer.find(ctx.sender);
    return (req && ctx.db.character.id.find(req.characterId)) ?? undefined;
  }
);

export const inspected_loadout = spacetimedb.view(
  { name: 'inspected_loadout', public: true },
  loadout.rowType.optional(),
  ctx => {
    const req = ctx.db.inspect.viewer.find(ctx.sender);
    const ch = req && ctx.db.character.id.find(req.characterId);
    return (ch && [...ctx.db.loadout.characterId.filter(ch.id)].find(l => l.index === ch.activeLoadout)) ?? undefined;
  }
);

export const inspected_items = spacetimedb.view({ name: 'inspected_items', public: true }, t.array(item.rowType), ctx => {
  const req = ctx.db.inspect.viewer.find(ctx.sender);
  const ch = req && ctx.db.character.id.find(req.characterId);
  const lo = ch && [...ctx.db.loadout.characterId.filter(ch.id)].find(l => l.index === ch.activeLoadout);
  if (!lo) return [];
  return lo.slots.flatMap(id => {
    const it = id === 0n ? undefined : ctx.db.item.id.find(id);
    return it ? [it] : [];
  });
});
