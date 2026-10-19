// Pure game rules and balance formulas. No SpacetimeDB imports here, so the
// client can import this file too and show/validate exactly what the server does.

import { BASE_OFFLINE_HOURS, MAX_LEVEL, combatStats, matchup, type CombatStats, type Gear } from './combat';
import { Effect, PATIENCE_HOURS, effectAmount } from './data/legendary';
import type { EnemyDef } from './data/zones';
import { ELIXIR_KILLS, type Buffs } from './data/supplies';
import { liveKillRate } from './fight';

/** Offline progress is capped so a player can't come back to infinite loot. */
export const MAX_OFFLINE_MICROS = BigInt(BASE_OFFLINE_HOURS) * 60n * 60n * 1_000_000n;
/** The offline cap with `s`'s gear (Seasoned raises it). */
export const offlineCapMicros = (s: CombatStats): bigint => BigInt(Math.round(s.offlineHours * 3600)) * 1_000_000n;
/** Online characters are settled this often, so their drops show up while playing. */
export const ONLINE_SETTLE_MICROS = 60n * 1_000_000n;

export const MAX_CHAT_LENGTH = 200;
export const CHAT_COOLDOWN_MICROS = 1_000_000n;
/** Only the newest N chat messages are kept (the client shows 50; every joining client downloads all of them). */
export const CHAT_HISTORY = 50n;
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

/** `level` and `xp` after gaining `gain` XP, with level-ups (none at max level). */
export function addXp(level: number, xp: bigint, gain: bigint): { level: number; xp: bigint } {
  if (level >= MAX_LEVEL) return { level, xp: 0n };
  xp += gain;
  for (let need = xpToNext(level); level < MAX_LEVEL && xp >= need; need = xpToNext(level)) {
    xp -= need;
    level += 1;
  }
  return { level, xp: level >= MAX_LEVEL ? 0n : xp };
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
  /** The elixir after this time; set when the activity had one. */
  elixir?: ElixirLeft;
  /** Patience: extra kills' worth of drops and materials (fractional; offline only). */
  bonusKills?: number;
  /** Lost fights the character got up from (fight.ts `respawns`), each followed by a respawn; offline, the expected number. */
  respawns?: number;
}

/**
 * An active elixir (life-skills.md, "Buff rules"): its buffs now, the kills it has left,
 * and how many more of it auto-renew can take from stock. `renew`: the buffs a renewed
 * one gets plain and infused, and the rare herbs Infuse can still use (one per renewal);
 * without it a renewed elixir keeps `buffs`.
 */
export interface ElixirRun {
  buffs: Buffs;
  killsLeft: number;
  stock: number;
  /** The active one is infused. */
  infused?: boolean;
  renew?: { plain: Buffs; infused: Buffs; herbs: number };
}

export interface ElixirLeft {
  killsLeft: number;
  /** Elixirs taken from stock by auto-renew. */
  renewed: number;
  /** Rare herbs those renewals infused with. */
  herbsUsed: number;
  /** Whether the elixir now active is infused (the last renewal's, or as it started). */
  infused: boolean;
  /** Kills made with the elixir active. */
  buffedKills: number;
}

/** What the character is doing: fighting `enemy` with `gear` (undefined = idle), with an elixir or not. */
export interface Activity {
  gear: Gear;
  enemy: EnemyDef | undefined;
  elixir?: ElixirRun;
}

/**
 * Tracks an elixir's charges through a settle: one per kill, renewed from stock when
 * spent. Savor (`savor`, legendary.md) gives each kill a chance not to use a charge.
 */
export class ElixirTracker {
  killsLeft: number;
  stock: number;
  renewed = 0;
  herbsUsed = 0;
  buffedKills = 0;
  private current: Buffs | undefined;
  private infused: boolean;
  private run: ElixirRun | undefined;
  private savor: number;
  constructor(run: ElixirRun | undefined, savor = 0) {
    this.run = run;
    this.current = run?.buffs;
    this.infused = run?.infused ?? false;
    this.killsLeft = run?.killsLeft ?? 0;
    this.stock = run?.stock ?? 0;
    this.savor = savor;
  }
  /** The buffs now, or undefined once spent. */
  get buffs(): Buffs | undefined {
    return this.killsLeft > 0 ? this.current : undefined;
  }
  /** Kills the charges left last for, on average. */
  get killsCovered(): number {
    return this.savor > 0 ? Math.floor(this.killsLeft / (1 - this.savor)) : this.killsLeft;
  }
  /**
   * Makes `kills` kills (at most `killsCovered`) with the buff, using `spent` charges:
   * by default the average share Savor leaves (online fights roll each kill instead).
   */
  use(kills: number, spent = this.savor > 0 ? Math.round(kills * (1 - this.savor)) : kills) {
    if (!this.buffs) return;
    this.buffedKills += kills;
    this.killsLeft -= spent;
    if (this.killsLeft <= 0 && this.stock > 0) {
      this.stock -= 1;
      this.renewed += 1;
      this.killsLeft = ELIXIR_KILLS;
      const renew = this.run!.renew;
      if (renew) {
        this.infused = this.herbsUsed < renew.herbs;
        if (this.infused) this.herbsUsed += 1;
        this.current = this.infused ? renew.infused : renew.plain;
      }
    }
  }
  get left(): ElixirLeft | undefined {
    return this.run && { killsLeft: this.killsLeft, renewed: this.renewed, herbsUsed: this.herbsUsed, infused: this.infused, buffedKills: this.buffedKills };
  }
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
 * across settles. If neither side can ever win, time passes with no effect. A viable
 * matchup still loses some live fights to bad luck, each costing a respawn: the kill
 * rate is what live fights average out to (fight.ts `liveKillRate`), so online and
 * offline earn the same.
 *
 * An elixir's charges cap kills like a level-up does: the matchup is recomputed when it
 * runs out (renewed from stock, or none).
 */
export function project(p: Progress, a: Activity, nowMicros: bigint, capMicros?: bigint): Settled {
  let elapsed = nowMicros - p.settledMicros;
  const effects = combatStats(p.level, a.gear).effects;
  const elixir = new ElixirTracker(a.elixir, effectAmount(effects, Effect.Savor));
  // Patience: offline fighting after PATIENCE_HOURS earns more (the login settle only).
  const patience = capMicros !== undefined ? effectAmount(effects, Effect.Patience) : 0;
  const patientFrom = BigInt(PATIENCE_HOURS * 3600) * 1_000_000n;
  let bonusKills = 0;
  let respawned = 0;
  if (elapsed <= 0n) return { ...p, kills: 0, xpGained: 0n, elixir: elixir.left };
  const start = p.settledMicros;
  const capped = capMicros !== undefined && elapsed > capMicros;
  if (capped) elapsed = capMicros!;

  let { level, xp, gold } = p;
  let total = 0;
  let xpGained = 0n;
  let defeatedAt: bigint | undefined;
  let left = elapsed;
  while (left > 0n) {
    const buffs = elixir.buffs;
    const m = a.enemy ? matchup(combatStats(level, a.gear, buffs), a.enemy) : undefined;
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
    const { killRate, lossShare } = liveKillRate(combatStats(level, a.gear, buffs), m, a.enemy!);
    if (killRate <= 0) {
      left = 0n; // every live fight lost: the time goes by in respawns
      break;
    }
    const available = Math.floor((Number(left) / 1e6) * killRate);
    if (available <= 0) break;
    const at = elapsed - left;
    const patient = patience > 0 && at >= patientFrom;
    const reward = patient ? 1 + patience : 1;
    const xpPerKill = m.xpPerKill * reward;
    // Stop at the next level-up: stats change there.
    const maxed = level >= MAX_LEVEL;
    let kills = available;
    if (!maxed && xpPerKill > 0) {
      kills = Math.min(kills, Math.ceil(Number(xpToNext(level) - xp) / xpPerKill));
    }
    // And at the elixir's last charge: the buffs change there.
    if (buffs) kills = Math.min(kills, Math.max(1, elixir.killsCovered));
    // And where Patience starts.
    if (patience > 0 && !patient) kills = Math.min(kills, Math.max(1, Math.ceil((Number(patientFrom - at) / 1e6) * killRate)));
    elixir.use(kills);
    total += kills;
    respawned += (kills * lossShare) / (1 - lossShare);
    if (patient) bonusKills += kills * patience;
    if (!maxed) {
      const gained = BigInt(Math.floor(kills * xpPerKill));
      xp += gained;
      xpGained += gained;
    }
    gold += BigInt(Math.floor(kills * m.goldPerKill * reward));
    left -= BigInt(Math.ceil((kills / killRate) * 1e6));
    if (left < 0n) left = 0n;
    for (let need = xpToNext(level); level < MAX_LEVEL && xp >= need; need = xpToNext(level)) {
      xp -= need;
      level += 1;
    }
    if (level >= MAX_LEVEL) xp = 0n;
    if (kills === available) break;
  }

  const settledMicros = capped ? nowMicros : start + elapsed - left;
  const respawns = Math.round(respawned);
  return { level, xp, gold, settledMicros, kills: total, xpGained, defeatedAt, elixir: elixir.left, ...(bonusKills > 0 && { bonusKills }), ...(respawns > 0 && { respawns }) };
}
