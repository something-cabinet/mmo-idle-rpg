// Per-player views over private tables: each client sees only its own rows.
import { t } from 'spacetimedb/server';
import { bossKill, character, discovery, enemyKill, friend, item, loadout, lootFilter, material, raidLog, settleLog, spacetimedb } from '../schema';

export const my_items = spacetimedb.view({ name: 'my_items', public: true }, t.array(item.rowType), ctx => {
  const ch = ctx.db.character.owner.find(ctx.sender);
  return ch ? [...ctx.db.item.characterId.filter(ch.id)] : [];
});

export const my_materials = spacetimedb.view({ name: 'my_materials', public: true }, t.array(material.rowType), ctx => {
  const ch = ctx.db.character.owner.find(ctx.sender);
  return ch ? [...ctx.db.material.characterId.filter(ch.id)] : [];
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

export const my_discoveries = spacetimedb.view({ name: 'my_discoveries', public: true }, t.array(discovery.rowType), ctx => {
  const ch = ctx.db.character.owner.find(ctx.sender);
  return ch ? [...ctx.db.discovery.characterId.filter(ch.id)] : [];
});

export const my_settle_log = spacetimedb.view({ name: 'my_settle_log', public: true }, t.array(settleLog.rowType), ctx => {
  const ch = ctx.db.character.owner.find(ctx.sender);
  return ch ? [...ctx.db.settleLog.characterId.filter(ch.id)] : [];
});

export const my_friends = spacetimedb.view({ name: 'my_friends', public: true }, t.array(friend.rowType), ctx => {
  const ch = ctx.db.character.owner.find(ctx.sender);
  return ch ? [...ctx.db.friend.characterId.filter(ch.id)] : [];
});

/** The characters on the caller's friend list, for names and levels (presence says who is online). */
export const my_friend_characters = spacetimedb.view({ name: 'my_friend_characters', public: true }, t.array(character.rowType), ctx => {
  const ch = ctx.db.character.owner.find(ctx.sender);
  if (!ch) return [];
  return [...ctx.db.friend.characterId.filter(ch.id)].flatMap(f => {
    const c = ctx.db.character.id.find(f.friendId);
    return c ? [c] : [];
  });
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

export const my_raid_log = spacetimedb.view({ name: 'my_raid_log', public: true }, t.array(raidLog.rowType), ctx => {
  const ch = ctx.db.character.owner.find(ctx.sender);
  return ch ? [...ctx.db.raidLog.characterId.filter(ch.id)] : [];
});

// The caller's raid party (reducers/raid.ts): its members' rows, active loadouts and the items in them,
// so the client can show their stats and the party's odds.

type ViewCtx = Parameters<Parameters<typeof spacetimedb.view>[2]>[0];

/** The characters in the caller's raid party, the caller included. */
function raidPartyCharacters(ctx: ViewCtx) {
  const ch = ctx.db.character.owner.find(ctx.sender);
  const m = ch && ctx.db.raidMember.characterId.find(ch.id);
  if (!m) return [];
  return [...ctx.db.raidMember.partyId.filter(m.partyId)].flatMap(x => {
    const c = ctx.db.character.id.find(x.characterId);
    return c ? [c] : [];
  });
}

export const raid_party_characters = spacetimedb.view({ name: 'raid_party_characters', public: true }, t.array(character.rowType), ctx => raidPartyCharacters(ctx));

export const raid_party_loadouts = spacetimedb.view({ name: 'raid_party_loadouts', public: true }, t.array(loadout.rowType), ctx =>
  raidPartyCharacters(ctx).flatMap(c => [...ctx.db.loadout.characterId.filter(c.id)].filter(l => l.index === c.activeLoadout))
);

export const raid_party_items = spacetimedb.view({ name: 'raid_party_items', public: true }, t.array(item.rowType), ctx =>
  raidPartyCharacters(ctx).flatMap(c => {
    const lo = [...ctx.db.loadout.characterId.filter(c.id)].find(l => l.index === c.activeLoadout);
    return (lo?.slots ?? []).flatMap(id => {
      const it = id === 0n ? undefined : ctx.db.item.id.find(id);
      return it ? [it] : [];
    });
  })
);
