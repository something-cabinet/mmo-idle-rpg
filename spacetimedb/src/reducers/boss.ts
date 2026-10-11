import { SenderError, t } from 'spacetimedb/server';
import { spacetimedb } from '../schema';
import { combatStats, matchup } from '../combat';
import { ZONES_BY_ID, bossOf } from '../data/zones';
import { firstKillReward, seededRng } from '../loot';
import { gearOf, hasKilledBoss, requireActive, settle, zoneUnlocked } from '../helpers';

/**
 * Challenges a zone's boss with the active loadout (zone-content.md): the normal
 * deterministic check, time to kill < time to die. Losing costs nothing; the error
 * leaves out the numbers, which players never see. The first win unlocks the next
 * zone, makes the boss farmable and gives 20× its gold plus a guaranteed Rare of the
 * zone's tier.
 */
export const challengeBoss = spacetimedb.reducer({ zoneId: t.u16() }, (ctx, { zoneId }) => {
  const { ch } = requireActive(ctx);
  const zone = ZONES_BY_ID.get(zoneId);
  const boss = zone && bossOf(zone);
  if (!zone || !boss) throw new SenderError('No such zone');
  if (!zoneUnlocked(ctx, ch.id, zone)) throw new SenderError('Zone is locked');
  if (hasKilledBoss(ctx, ch.id, zone.id)) throw new SenderError(`${boss.name} is already defeated: farm it as a target`);

  const settled = settle(ctx, ch);
  const m = matchup(combatStats(settled.level, gearOf(ctx, settled)), boss);
  if (!m.viable) {
    throw new SenderError(`${boss.name} is too strong for your gear`);
  }

  const reward = firstKillReward(seededRng(ch.id, BigInt(zone.id), ctx.timestamp.microsSinceUnixEpoch), zone, boss);
  // The guaranteed item ignores the bag limit (it only limits drops).
  ctx.db.item.insert({ ...reward.item, id: 0n, characterId: ch.id, uniqueId: undefined, locked: false, createdAt: ctx.timestamp });
  ctx.db.bossKill.insert({ id: 0n, characterId: ch.id, zoneId: zone.id, killedAt: ctx.timestamp });
  ctx.db.character.id.update({ ...settled, gold: settled.gold + reward.gold });
});
