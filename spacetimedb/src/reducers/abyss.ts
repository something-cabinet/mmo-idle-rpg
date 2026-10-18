// The Moonwell Deep (docs/design/abyss.md). Solo and online only: each attempt is one
// reducer call that plays the whole depth (abyss.ts `simulateDepth`) and pays a win at once;
// the client replays the depth from the log row to animate it.
import { SenderError, t } from 'spacetimedb/server';
import { spacetimedb } from '../schema';
import { ElixirTracker, LOADOUT_COUNT, addXp } from '../game';
import { MAX_LEVEL, combatStats } from '../combat';
import { ABYSS_SEASON, ABYSS_UNLOCK_RAID, depthReward, depthTier } from '../data/abyss';
import { RAIDS_BY_ID } from '../data/raids';
import { elixirBuffs } from '../data/supplies';
import { depthRng, encodeBuild, encodeStats, simulateDepth } from '../abyss';
import { addMaterials, addSupply, killsOf, requireActive, settle, supplyCount, takeSupply, type Character, type Ctx } from '../helpers';

/** Deep log rows kept per character: only the latest attempt, which the client replays. */
const ABYSS_LOG_KEEP = 1;

/** The Deep opens with the first win against The Drowned Moon (a win records a kill of its boss). */
function abyssUnlocked(ctx: Ctx, characterId: bigint): boolean {
  const raid = RAIDS_BY_ID.get(ABYSS_UNLOCK_RAID);
  return !!raid && killsOf(ctx, characterId, raid.boss.id) > 0n;
}

function loadoutGear(ctx: Ctx, ch: Character, index: number) {
  const lo = [...ctx.db.loadout.characterId.filter(ch.id)].find(l => l.index === index);
  if (!lo) throw new SenderError('No such loadout');
  return lo.slots.map(id => (id === 0n ? undefined : (ctx.db.item.id.find(id) ?? undefined)));
}

/**
 * One attempt at the next depth with loadout `loadout` (any of the four; the farming
 * loadout is untouched). Settles first. The active elixir applies to the whole depth and
 * uses a charge per enemy killed. A win pays the depth's first-clear reward and records
 * the new deepest depth and the build on the leaderboard.
 */
export const descend = spacetimedb.reducer({ loadout: t.u8() }, (ctx, { loadout }) => {
  const { ch: row } = requireActive(ctx);
  if (loadout >= LOADOUT_COUNT) throw new SenderError('No such loadout');
  if (!abyssUnlocked(ctx, row.id)) throw new SenderError(`Defeat ${RAIDS_BY_ID.get(ABYSS_UNLOCK_RAID)?.boss.name ?? 'the raid boss'} to open the Moonwell Deep`);
  let ch = settle(ctx, row);

  const record = ctx.db.abyssRecord.characterId.find(ch.id);
  const deepest = record && record.season === ABYSS_SEASON ? record.deepest : 0;
  const depth = deepest + 1;
  const gear = loadoutGear(ctx, ch, loadout);
  if (!gear.some(Boolean)) throw new SenderError('That loadout is empty');

  // The elixir active now applies to every fight of the depth.
  const buffs = ch.elixirKillsLeft > 0 ? elixirBuffs(ch.elixirId, Math.floor(depthTier(depth))) : undefined;
  const elixir = buffs && new ElixirTracker({ buffs, killsLeft: ch.elixirKillsLeft, stock: ch.elixirAutoRenew ? supplyCount(ctx, ch.id, ch.elixirId) : 0 });
  const stats = combatStats(ch.level, gear, buffs);
  const start = ctx.timestamp.microsSinceUnixEpoch;
  const result = simulateDepth(stats, depth, depthRng(ch.id, start));

  if (elixir) {
    elixir.use(result.fights.filter(f => f.outcome === 'kill').length);
    if (elixir.renewed > 0) takeSupply(ctx, ch.id, ch.elixirId, elixir.renewed);
    const empty = elixir.killsLeft <= 0;
    ch = { ...ch, elixirId: empty ? 0 : ch.elixirId, elixirKillsLeft: Math.max(0, elixir.killsLeft) };
  }

  const reward = result.won ? depthReward(depth) : undefined;
  if (reward) {
    const { level, xp } = addXp(ch.level, ch.xp, reward.xp);
    ch = { ...ch, level, xp, gold: ch.gold + reward.gold, dust: ch.dust + reward.dust };
    addMaterials(ctx, ch.id, reward.materials.map(([materialId, count]) => ({ materialId, count })));
    if (reward.elixir) addSupply(ctx, ch.id, reward.elixir, 1);
    const entry = { characterId: ch.id, name: ch.name, season: ABYSS_SEASON, deepest: depth, clearedAt: ctx.timestamp, level: row.level, build: encodeBuild(gear) };
    if (record) ctx.db.abyssRecord.characterId.update(entry);
    else ctx.db.abyssRecord.insert(entry);
  } else if (!record) {
    ctx.db.abyssRecord.insert({ characterId: ch.id, name: ch.name, season: ABYSS_SEASON, deepest: 0, clearedAt: ctx.timestamp, level: ch.level, build: '' });
  }
  ctx.db.character.id.update(ch);

  ctx.db.abyssLog.insert({
    id: 0n,
    characterId: ch.id,
    season: ABYSS_SEASON,
    depth,
    startedAt: ctx.timestamp,
    loadout,
    stats: encodeStats(stats),
    won: result.won,
    timedOut: result.timedOut,
    gold: reward?.gold ?? 0n,
    xp: reward && row.level < MAX_LEVEL ? reward.xp : 0n,
    dust: reward?.dust ?? 0n,
    materials: reward?.materials.map(([materialId, count]) => ({ materialId, count })) ?? [],
    elixir: reward?.elixir ?? 0,
  });
  pruneAbyssLog(ctx, ch.id);
});

function pruneAbyssLog(ctx: Ctx, characterId: bigint) {
  const rows = [...ctx.db.abyssLog.characterId.filter(characterId)];
  if (rows.length <= ABYSS_LOG_KEEP) return;
  rows.sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const r of rows.slice(0, rows.length - ABYSS_LOG_KEEP)) ctx.db.abyssLog.id.delete(r.id);
}
