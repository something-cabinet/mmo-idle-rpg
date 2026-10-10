import { ScheduleAt, SenderError, t } from 'spacetimedb/server';
import { Rarity, settleTimer, spacetimedb } from '../schema';
import { ONLINE_SETTLE_MICROS } from '../game';
import { STATS } from '../data/stats';
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
 * Sets the loot filter: drops below `minRarity` are salvaged unless they carry one
 * of `keepAffixes` (stat IDs). Settles first, so earlier drops use the old filter.
 */
export const setLootFilter = spacetimedb.reducer(
  { minRarity: Rarity, keepAffixes: t.array(t.u16()) },
  (ctx, { minRarity, keepAffixes }) => {
    const { ch } = requireActive(ctx);
    const unique = [...new Set(keepAffixes)];
    if (unique.some(id => STATS[id as keyof typeof STATS]?.ref === undefined)) throw new SenderError('Unknown affix');
    ctx.db.character.id.update(settle(ctx, ch));
    ctx.db.lootFilter.characterId.update({ characterId: ch.id, minRarity, keepAffixes: unique });
  }
);
