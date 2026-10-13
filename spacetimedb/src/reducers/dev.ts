// Dev cheats for local testing, shown in the client's Settings only in dev builds.
// Every reducer here refuses unless the database's DEV_CHEATS environment value is "1",
// which only the local publish sets, so they do nothing on Maincloud.
import { SenderError, t } from 'spacetimedb/server';
import { spacetimedb } from '../schema';
import { BASE_LIST } from '../data/bases';
import { MAX_TIER } from '../data/stats';
import { UNIQUES, UNIQUES_BY_ID } from '../data/uniques';
import { ZONES } from '../data/zones';
import { RARITIES, makeItem, makeUnique, seededRng, type RarityName } from '../loot';
import { discover, requireActive, type Character, type Ctx } from '../helpers';

function requireCheats(ctx: Ctx) {
  if (ctx.env.DEV_CHEATS !== '1') throw new SenderError('Cheats are off');
  return requireActive(ctx);
}

/** At least `n` lifetime kills of `enemyId` (never lowers a count). */
function atLeastKills(ctx: Ctx, characterId: bigint, enemyId: number, n: number) {
  const row = [...ctx.db.enemyKill.characterId.filter(characterId)].find(k => k.enemyId === enemyId);
  if (!row) ctx.db.enemyKill.insert({ id: 0n, characterId, enemyId, kills: BigInt(n) });
  else if (row.kills < BigInt(n)) ctx.db.enemyKill.id.update({ ...row, kills: BigInt(n) });
}

/**
 * Reveals everything: every base at every tier and every unique in the Item Index, and
 * every enemy, area and secret area on the maps (by raising kill counts to 1, and a
 * secret's trigger enemy to its threshold). Zones stay locked (see devUnlockZones).
 */
export const devRevealAll = spacetimedb.reducer(ctx => {
  const { ch } = requireCheats(ctx);
  for (let tier = 1; tier <= MAX_TIER; tier++) discover(ctx, ch.id, tier, BASE_LIST.map(b => ({ baseId: b.id })));
  for (const u of UNIQUES) discover(ctx, ch.id, u.tier, [{ baseId: u.baseId, uniqueId: u.id }]);
  for (const zone of ZONES) {
    for (const e of zone.enemies) atLeastKills(ctx, ch.id, e.id, 1);
    for (const a of zone.areas) if (a.secret) atLeastKills(ctx, ch.id, a.secret.enemyId, a.secret.kills);
  }
});

/** Opens every zone by recording its boss as killed (without the first-kill reward). */
export const devUnlockZones = spacetimedb.reducer(ctx => {
  const { ch } = requireCheats(ctx);
  const killed = new Set([...ctx.db.bossKill.characterId.filter(ch.id)].map(k => k.zoneId));
  for (const zone of ZONES) if (!killed.has(zone.id)) ctx.db.bossKill.insert({ id: 0n, characterId: ch.id, zoneId: zone.id, killedAt: ctx.timestamp });
});

/** Adds gold and Dust. */
export const devGrant = spacetimedb.reducer({ gold: t.u64(), dust: t.u64() }, (ctx, { gold, dust }) => {
  const { ch } = requireCheats(ctx);
  ctx.db.character.id.update({ ...ch, gold: ch.gold + gold, dust: ch.dust + dust });
});

function giveItem(ctx: Ctx, ch: Character, item: ReturnType<typeof makeItem>) {
  ctx.db.item.insert({ ...item, id: 0n, characterId: ch.id, locked: false, createdAt: ctx.timestamp });
  discover(ctx, ch.id, item.tier, [{ baseId: item.baseId, uniqueId: item.uniqueId }]);
}

/** Puts a freshly rolled item into the bag (ignoring the bag limit). */
export const devGiveItem = spacetimedb.reducer({ baseId: t.u16(), tier: t.u8(), rarity: t.string() }, (ctx, { baseId, tier, rarity }) => {
  const { ch } = requireCheats(ctx);
  if (!BASE_LIST.some(b => b.id === baseId)) throw new SenderError('No such base');
  if (tier < 1 || tier > MAX_TIER) throw new SenderError('Bad tier');
  if (!RARITIES.includes(rarity as RarityName) || rarity === 'Unique') throw new SenderError('Bad rarity');
  giveItem(ctx, ch, makeItem(seededRng(ch.id, ctx.timestamp.microsSinceUnixEpoch), baseId, tier, rarity as RarityName));
});

/** Puts a freshly rolled unique into the bag (ignoring the bag limit). */
export const devGiveUnique = spacetimedb.reducer({ uniqueId: t.u16() }, (ctx, { uniqueId }) => {
  const { ch } = requireCheats(ctx);
  const u = UNIQUES_BY_ID.get(uniqueId);
  if (!u) throw new SenderError('No such unique');
  giveItem(ctx, ch, makeUnique(seededRng(ch.id, ctx.timestamp.microsSinceUnixEpoch), u));
});
