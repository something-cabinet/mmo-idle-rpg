// The server's clock as seen from the client, for projecting idle progress to now.

import type { Presence } from '../module_bindings/types';

/** serverTime ≈ clientTime + clockOffset (micros). */
let clockOffset = 0n;
let offsetFrom: bigint | null = null;
export const nowMicros = () => BigInt(Date.now()) * 1000n + clockOffset;

/**
 * `since` is the server's clock at the moment we entered the world. Use it to correct
 * the local clock, so we never show gold the server doesn't think we have yet (latency
 * only makes this err on the low side).
 */
export function syncClock(pres: Presence) {
  if (offsetFrom === pres.since.microsSinceUnixEpoch) return;
  offsetFrom = pres.since.microsSinceUnixEpoch;
  clockOffset = offsetFrom - BigInt(Date.now()) * 1000n;
}
