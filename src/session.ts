// Gains this play session, for the Combat view. A session starts on entering the world
// and again on every target change. The server only keeps the newest few settle logs,
// so each one is recorded here as it arrives.

import type { DbConnection } from './module_bindings';
import type { SettleLog } from './module_bindings/types';
import { ZONES_BY_ID, bossOf } from '../spacetimedb/src/data/zones';
import { COSMETICS_BY_ID } from '../spacetimedb/src/data/cosmetics';
import { toast } from './store';
import { encounterText } from './ui/encounters';

/** Online settles (not the login one, which is time away), by ID. */
const settles = new Map<bigint, SettleLog>();
/** Server time of the last target change seen (setTarget settles then). */
let targetChangedAt = 0n;

export function trackSettles(conn: DbConnection) {
  conn.db.mySettleLog.onInsert((ctx, log) => {
    if (!log.offline) settles.set(log.id, log);
    // Encounters met while online pop up; the away report covers the offline ones.
    if (ctx.event.tag === 'SubscribeApplied' || log.offline) return;
    for (const e of log.encounters) toast(encounterText(e, log.enemyId, id => conn.db.myItems.id.find(id) ?? undefined), 'info');
  });
  // A boss's first kill (not the rows loaded on connect) unlocks the next zone.
  conn.db.myBossKills.onInsert((ctx, kill) => {
    if (ctx.event.tag === 'SubscribeApplied') return;
    const zone = ZONES_BY_ID.get(kill.zoneId);
    const boss = zone && bossOf(zone);
    if (boss) toast(`${boss.name} defeated! The next zone is open.`, 'info');
  });
  // A new cosmetic (cosmetics.md): not the ones loaded on connect, nor the backfill on entering the world.
  const SLOT_NAME = { title: 'Title', visual: 'Name effect', plate: 'Nameplate' } as const;
  conn.db.myCosmetics.onInsert((ctx, u) => {
    if (ctx.event.tag === 'SubscribeApplied') return;
    const c = COSMETICS_BY_ID.get(u.cosmeticId);
    if (c) toast(`${SLOT_NAME[c.slot]} unlocked: ${c.name}. Wear it on the Character page.`, 'info');
  });
  // We only subscribe to our own character row.
  conn.db.character.onUpdate((_ctx, old, row) => {
    if (old.targetEnemyId !== row.targetEnemyId || old.activitySkill !== row.activitySkill) targetChangedAt = row.lastSettledAt.microsSinceUnixEpoch;
  });
}

/** Settle logs for the current target since it was chosen (all of them if it hasn't changed since loading). */
export const sinceTargetChange = (logs: readonly SettleLog[], enemyId: number) =>
  logs.filter(l => l.enemyId === enemyId && l.at.microsSinceUnixEpoch >= targetChangedAt);

/** When the current session started: entering the world (`enteredAt`) or the last target change. */
export const sessionStart = (enteredAt: bigint) => (targetChangedAt > enteredAt ? targetChangedAt : enteredAt);

export interface SessionTotals {
  kills: number;
  xp: bigint;
  gold: bigint;
  kept: number;
  salvaged: number;
}

/** Totals of the settles against `enemyId` at or after `sinceMicros` (server time). */
export function sessionTotals(sinceMicros: bigint, enemyId: number): SessionTotals {
  const t: SessionTotals = { kills: 0, xp: 0n, gold: 0n, kept: 0, salvaged: 0 };
  for (const log of settles.values()) {
    // The settle on a target change is at about the same time but for the old enemy.
    if (log.at.microsSinceUnixEpoch < sinceMicros || log.enemyId !== enemyId) continue;
    t.kills += log.kills;
    t.xp += log.xp;
    t.gold += log.gold;
    t.kept += log.keptItemIds.length;
    t.salvaged += log.salvaged.reduce((a, b) => a + b, 0);
  }
  return t;
}
