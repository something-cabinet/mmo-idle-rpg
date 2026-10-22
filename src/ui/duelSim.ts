// Friendly duels (docs/design/duels.md): your character against a friend's, as of their
// last settle. Client only: no reward and nothing stored, so there is nothing to trust
// the server with. A battle (battle.ts) like any fight, but both sides are players: each
// swings on its own timer, player against player (penetration, evasion, crits, heals,
// lifesteal, regen and the effects).

import type { CombatStats } from '../../spacetimedb/src/combat';
import { simulateBattle } from '../../spacetimedb/src/battle';
import { seededRng, type Rng } from '../../spacetimedb/src/loot';

/** A duel still going after this long is decided on points (share of HP left). */
export const DUEL_SECONDS = 90;
/** Duels behind the win-rate estimate. */
export const DUEL_SAMPLES = 500;

const DUEL_SALT = 0x6475656cn; // "duel"

export interface DuelEvent {
  t: number;
  /** Index of the side that swung. */
  by: 0 | 1;
  kind: 'hit' | 'crit' | 'dodge';
  /** Damage to the other side, effect damage included (0 for a dodge). */
  damage: number;
  /** Both sides' HP after the event. */
  hp: [number, number];
  secondWind?: boolean;
}

export interface Duel {
  events: DuelEvent[];
  maxHp: [number, number];
  end: number;
  /** Index of the winner, or -1 for a draw. */
  winner: 0 | 1 | -1;
  /** A knockout, or the time ran out and HP left decided it. */
  by: 'ko' | 'points';
}

/** One duel between `sides[0]` and `sides[1]`: a battle (battle.ts) of one player against another. `record: false` skips the events. */
export function simulateDuel(sides: [CombatStats, CombatStats], rng: Rng, record = true): Duel {
  const r = simulateBattle({
    sides: [[{ kind: 'player', stats: sides[0] }], [{ kind: 'player', stats: sides[1] }]],
    firstSwing: 'random',
    timeLimit: DUEL_SECONDS,
    onTimeout: 'points',
    record,
  }, rng);
  const events: DuelEvent[] = [];
  for (const e of r.events) {
    if (e.by !== 0 && e.by !== 1) continue;
    events.push({ t: e.t, by: e.by, kind: e.kind === 'miss' ? 'dodge' : e.kind === 'crit' ? 'crit' : 'hit', damage: e.damage, hp: [e.hp[0], e.hp[1]], ...(e.saved && { secondWind: true }) });
  }
  return { events, maxHp: [r.maxHp[0], r.maxHp[1]], end: r.end, winner: r.winner, by: r.timedOut ? 'points' : 'ko' };
}

/** The generator for duel `round` between two characters (same inputs, same duel). */
export const duelRng = (meId: bigint, foeId: bigint, round: number) => seededRng(meId, foeId, BigInt(round), DUEL_SALT);

/** Share of DUEL_SAMPLES duels side 0 wins (draws count half). */
export function winRate(sides: [CombatStats, CombatStats], meId: bigint, foeId: bigint): number {
  let wins = 0;
  for (let i = 0; i < DUEL_SAMPLES; i++) {
    const { winner } = simulateDuel(sides, seededRng(meId, foeId, BigInt(i), DUEL_SALT, 1n), false);
    wins += winner === 0 ? 1 : winner === -1 ? 0.5 : 0;
  }
  return wins / DUEL_SAMPLES;
}
