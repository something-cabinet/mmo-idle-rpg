import { ScheduleAt, SenderError, t } from 'spacetimedb/server';
import { Rarity, settleTimer, spacetimedb } from '../schema';
import { ONLINE_SETTLE_MICROS } from '../game';
import { TYPES } from '../data/bases';
import { MAX_TIER, STATS } from '../data/stats';
import { requireActive, settle } from '../helpers';

export const init = spacetimedb.init(ctx => {
  ctx.db.settleTimer.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.interval(ONLINE_SETTLE_MICROS) });
});

/** Settles every character in the world, so drops arrive while playing, not only on logout. */
export const settleOnline = spacetimedb.reducer({ onSchedule: settleTimer }, { timer: settleTimer.rowType }, ctx => {
  if (!ctx.sender.isEqual(ctx.identity)) throw new SenderError('Runs on a schedule only');
  for (const pres of ctx.db.presence.iter()) {
    const ch = ctx.db.character.id.find(pres.characterId);
    if (ch) ctx.db.character.id.update(settle(ctx, ch));
  }
});

/**
 * Sets the loot filter: drops below `minRarity` are salvaged, and so are drops
 * without one of `keepAffixes` (stat IDs), not of `keepTypes` (type IDs), or without
 * an affix of tier `minAffixTier` or higher. Empty or full lists mean any; a full type
 * list is stored as empty, so types added later are kept too. Settles
 * first, so earlier drops use the old filter.
 */
export const setLootFilter = spacetimedb.reducer(
  { minRarity: Rarity, keepAffixes: t.array(t.u16()), keepTypes: t.array(t.u16()), minAffixTier: t.u8() },
  (ctx, { minRarity, keepAffixes, keepTypes, minAffixTier }) => {
    const { ch } = requireActive(ctx);
    const affixes = [...new Set(keepAffixes)];
    if (affixes.some(id => STATS[id as keyof typeof STATS]?.ref === undefined)) throw new SenderError('Unknown affix');
    let types = [...new Set(keepTypes)];
    if (types.some(id => !TYPES.has(id))) throw new SenderError('Unknown item type');
    if (types.length === TYPES.size) types = [];
    if (minAffixTier < 1 || minAffixTier > MAX_TIER) throw new SenderError('Bad affix tier');
    ctx.db.character.id.update(settle(ctx, ch));
    ctx.db.lootFilter.characterId.update({ characterId: ch.id, minRarity, keepAffixes: affixes, keepBases: [], minAffixTier, keepTypes: types });
  }
);
