// Pure game rules and balance formulas. No SpacetimeDB imports here, so the
// client can import this file too and show/validate exactly what the server does.

import { MAX_LEVEL, combatStats, matchup, type Gear } from './combat';
import type { EnemyDef } from './data/zones';

/** Offline progress is capped so a player can't come back to infinite loot. */
export const MAX_OFFLINE_MICROS = 8n * 60n * 60n * 1_000_000n; // 8 hours

export const MAX_CHAT_LENGTH = 200;
export const CHAT_COOLDOWN_MICROS = 1_000_000n;
/** Only the newest N chat messages are kept. */
export const CHAT_HISTORY = 200n;
/** A guest's offer to merge into a logged-in account expires after this. */
export const LINK_OFFER_TTL_MICROS = 10n * 60n * 1_000_000n;

/** Saved gear sets per character. */
export const LOADOUT_COUNT = 4;
export const DEFAULT_LOADOUT_NAMES = ['Farm', 'Boss', 'Set 3', 'Set 4'];
/** Bag slots: starts at 200, expands by 25 up to 400 (crafting.md). */
export const BAG_START = 200;
export const BAG_MAX = 400;

const CHARACTER_NAME = /^[A-Za-z][A-Za-z0-9_]{2,15}$/;

/** Returns an error message, or null if the name is allowed. */
export function validateCharacterName(name: string): string | null {
  return CHARACTER_NAME.test(name)
    ? null
    : 'Name must be 3-16 characters: letters, digits, _; starting with a letter';
}

/** XP needed to go from `level` to the next (attributes.md). */
export function xpToNext(level: number): bigint {
  return BigInt(Math.round(166 * 1.19 ** level));
}

export interface Progress {
  level: number;
  xp: bigint;
  gold: bigint;
  /** Micros since Unix epoch up to which rewards have been granted. */
  settledMicros: bigint;
}

/** What the character is doing: fighting `enemy` with `gear` (undefined = no target). */
export interface Activity {
  gear: Gear;
  enemy: EnemyDef | undefined;
}

/**
 * Idle rewards are never ticked; they're computed from elapsed time with the
 * expected-value combat formulas (combat.md). The server calls this when it must
 * know the exact state (connect, disconnect, before anything that changes stats or
 * target); the client calls it on a timer for display.
 *
 * Only whole kills are granted; the time toward the next kill carries over. Stats
 * are recomputed at each level-up inside the elapsed time. If `capMicros` is hit,
 * or the fight isn't viable, the remaining time is discarded.
 */
export function project(p: Progress, a: Activity, nowMicros: bigint, capMicros?: bigint): Progress {
  let elapsed = nowMicros - p.settledMicros;
  if (elapsed <= 0n) return p;
  const capped = capMicros !== undefined && elapsed > capMicros;
  if (capped) elapsed = capMicros!;

  let { level, xp, gold } = p;
  let left = elapsed;
  while (left > 0n) {
    const m = a.enemy ? matchup(combatStats(level, a.gear), a.enemy) : undefined;
    if (!m || m.killRate <= 0) {
      left = 0n;
      break;
    }
    const available = Math.floor((Number(left) / 1e6) * m.killRate);
    if (available <= 0) break;
    // Stop at the next level-up: stats change there.
    const maxed = level >= MAX_LEVEL;
    let kills = available;
    if (!maxed && m.xpPerKill > 0) {
      kills = Math.min(kills, Math.ceil(Number(xpToNext(level) - xp) / m.xpPerKill));
    }
    if (!maxed) xp += BigInt(Math.floor(kills * m.xpPerKill));
    gold += BigInt(Math.floor(kills * m.goldPerKill));
    left -= BigInt(Math.ceil((kills / m.killRate) * 1e6));
    if (left < 0n) left = 0n;
    for (let need = xpToNext(level); level < MAX_LEVEL && xp >= need; need = xpToNext(level)) {
      xp -= need;
      level += 1;
    }
    if (level >= MAX_LEVEL) xp = 0n;
    if (kills === available) break;
  }

  const settledMicros = capped ? nowMicros : p.settledMicros + elapsed - left;
  return { level, xp, gold, settledMicros };
}
