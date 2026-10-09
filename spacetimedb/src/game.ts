// Pure game rules and balance formulas. No SpacetimeDB imports here, so the
// client can import this file too and show/validate exactly what the server does.

/** Offline progress is capped so a player can't come back to infinite loot. */
export const MAX_OFFLINE_MICROS = 8n * 60n * 60n * 1_000_000n; // 8 hours

export const MAX_CHAT_LENGTH = 200;
export const CHAT_COOLDOWN_MICROS = 1_000_000n;
/** Only the newest N chat messages are kept. */
export const CHAT_HISTORY = 200n;
/** A guest's offer to merge into a logged-in account expires after this. */
export const LINK_OFFER_TTL_MICROS = 10n * 60n * 1_000_000n;

const CHARACTER_NAME = /^[A-Za-z][A-Za-z0-9_]{2,15}$/;

/** Returns an error message, or null if the name is allowed. */
export function validateCharacterName(name: string): string | null {
  return CHARACTER_NAME.test(name)
    ? null
    : 'Name must be 3-16 characters: letters, digits, _; starting with a letter';
}

export function xpToNextLevel(level: number): bigint {
  return BigInt(Math.floor(100 * Math.pow(level, 1.5)));
}

export function goldPerSecond(power: number): bigint {
  return BigInt(power);
}

export function xpPerSecond(power: number): bigint {
  return BigInt(power * 2);
}

export function upgradeCost(power: number): bigint {
  return BigInt(Math.floor(10 * Math.pow(1.15, power - 1)));
}

export interface Progress {
  level: number;
  xp: bigint;
  gold: bigint;
  power: number;
  /** Micros since Unix epoch up to which rewards have been granted. */
  settledMicros: bigint;
}

/**
 * Idle rewards are never ticked; they're computed from elapsed time.
 * The server calls this when it must know the exact state (connect,
 * disconnect, spending); the client calls it on a timer for display.
 *
 * Only whole seconds are granted; the leftover fraction carries over.
 * If `capMicros` is hit, the remaining time is discarded.
 */
export function project(p: Progress, nowMicros: bigint, capMicros?: bigint): Progress {
  let elapsed = nowMicros - p.settledMicros;
  const capped = capMicros !== undefined && elapsed > capMicros;
  if (capped) elapsed = capMicros!;
  const seconds = elapsed / 1_000_000n;
  if (seconds <= 0n) return p;

  let { level, xp, gold } = p;
  gold += goldPerSecond(p.power) * seconds;
  xp += xpPerSecond(p.power) * seconds;
  for (let need = xpToNextLevel(level); xp >= need; need = xpToNextLevel(level)) {
    xp -= need;
    level += 1;
  }

  const settledMicros = capped ? nowMicros : p.settledMicros + seconds * 1_000_000n;
  return { ...p, level, xp, gold, settledMicros };
}
