// Gains this play session, for the Combat view. A session starts on entering the world
// and again on every target change. The server only keeps the newest few settle logs,
// so each one is recorded here as it arrives.

import type { DbConnection } from './module_bindings';
import type { SettleLog } from './module_bindings/types';

/** Online settles (not the login one, which is time away), by ID. */
const settles = new Map<bigint, SettleLog>();
/** Server time of the last target change seen (setTarget settles then). */
let targetChangedAt = 0n;

export function trackSettles(conn: DbConnection) {
  conn.db.mySettleLog.onInsert((_ctx, log) => {
    if (!log.offline) settles.set(log.id, log);
  });
  // We only subscribe to our own character row.
  conn.db.character.onUpdate((_ctx, old, row) => {
    if (old.targetEnemyId !== row.targetEnemyId) targetChangedAt = row.lastSettledAt.microsSinceUnixEpoch;
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
