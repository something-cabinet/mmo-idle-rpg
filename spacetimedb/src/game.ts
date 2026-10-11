// Pure game rules and balance formulas. No SpacetimeDB imports here, so the
// client can import this file too and show/validate exactly what the server does.

import { BASE_OFFLINE_HOURS, MAX_LEVEL, combatStats, matchup, type CombatStats, type Gear } from './combat';
import type { EnemyDef } from './data/zones';

/** Offline progress is capped so a player can't come back to infinite loot. */
export const MAX_OFFLINE_MICROS = BigInt(BASE_OFFLINE_HOURS) * 60n * 60n * 1_000_000n;
/** The offline cap with `s`'s gear (Seasoned raises it). */
export const offlineCapMicros = (s: CombatStats): bigint => BigInt(Math.round(s.offlineHours * 3600)) * 1_000_000n;
/** Online characters are settled this often, so their drops show up while playing. */
export const ONLINE_SETTLE_MICROS = 60n * 1_000_000n;

export const MAX_CHAT_LENGTH = 200;
export const CHAT_COOLDOWN_MICROS = 1_000_000n;
/** Only the newest N chat messages are kept. */
export const CHAT_HISTORY = 200n;
/** A guest's offer to merge into a logged-in account expires after this. */
export const LINK_OFFER_TTL_MICROS = 10n * 60n * 1_000_000n;

/** Saved gear sets per character. */
export const LOADOUT_COUNT = 4;
export const DEFAULT_LOADOUT_NAMES = Array.from({ length: LOADOUT_COUNT }, (_, i) => `Set ${i + 1}`);
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

export interface Settled extends Progress {
  /** Whole kills granted; drops are rolled from this. */
  kills: number;
  /** XP granted (across level-ups). */
  xpGained: bigint;
  /**
   * The enemy killed the character at this time (micros): it is idle from then on
   * and the caller must clear the target. Undefined if still alive.
   */
  defeatedAt?: bigint;
}

/** What the character is doing: fighting `enemy` with `gear` (undefined = idle). */
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
 * the remaining time is discarded.
 *
 * A losing fight (not viable) kills the character `timeToDie` after it started
 * (`defeatedAt`); until then nothing is settled, so the fight's clock keeps running
 * across settles. If neither side can ever win, time passes with no effect.
 */
export function project(p: Progress, a: Activity, nowMicros: bigint, capMicros?: bigint): Settled {
  let elapsed = nowMicros - p.settledMicros;
  if (elapsed <= 0n) return { ...p, kills: 0, xpGained: 0n };
  const start = p.settledMicros;
  const capped = capMicros !== undefined && elapsed > capMicros;
  if (capped) elapsed = capMicros!;

  let { level, xp, gold } = p;
  let total = 0;
  let xpGained = 0n;
  let defeatedAt: bigint | undefined;
  let left = elapsed;
  while (left > 0n) {
    const m = a.enemy ? matchup(combatStats(level, a.gear), a.enemy) : undefined;
    if (!m || (!m.viable && !Number.isFinite(m.timeToDie))) {
      left = 0n; // idle, or a stalemate
      break;
    }
    if (!m.viable) {
      // Stats can turn a fight into a loss at a level-up (mitigation scales with level).
      const fightStart = start + elapsed - left;
      const dieAt = fightStart + BigInt(Math.ceil(m.timeToDie * 1e6));
      if (dieAt <= fightStart + left) {
        defeatedAt = dieAt;
        left = 0n;
      }
      break; // still fighting: `left` stays unsettled
    }
    const available = Math.floor((Number(left) / 1e6) * m.killRate);
    if (available <= 0) break;
    // Stop at the next level-up: stats change there.
    const maxed = level >= MAX_LEVEL;
    let kills = available;
    if (!maxed && m.xpPerKill > 0) {
      kills = Math.min(kills, Math.ceil(Number(xpToNext(level) - xp) / m.xpPerKill));
    }
    total += kills;
    if (!maxed) {
      const gained = BigInt(Math.floor(kills * m.xpPerKill));
      xp += gained;
      xpGained += gained;
    }
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

  const settledMicros = capped ? nowMicros : start + elapsed - left;
  return { level, xp, gold, settledMicros, kills: total, xpGained, defeatedAt };
}
