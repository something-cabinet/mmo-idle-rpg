// Live combat (combat.md): fights played hit by hit while the player is online. Pure
// and deterministic, so the server (settling) and the client (animating) run the very
// same fights: each fight's rolls come from a generator seeded by the character and
// the fight's start time. Offline time still uses the expected-value `project`.

import { MAX_LEVEL, combatStats, matchup, type CombatStats, type Matchup } from './combat';
import { Effect, LAST_STAND_BELOW, effectAmount } from './data/legendary';
import type { EnemyDef } from './data/zones';
import { ElixirTracker, xpToNext, type Activity, type Progress, type Settled } from './game';
import { seededRng, type Rng } from './loot';

/** A fight not over after this long is a stalemate: time passes with no effect. */
export const MAX_FIGHT_SECONDS = 600;

/** Mixed into fight seeds, so they never reuse a drop roll's seed. */
const FIGHT_SALT = 0x6669676874n; // "fight"
/** Mixed into Savor's per-kill roll, so it never changes a fight's own rolls. */
const SAVOR_SALT = 0x7361766f72n; // "savor"

export const fightRng = (characterId: bigint, startMicros: bigint): Rng => seededRng(characterId, startMicros, FIGHT_SALT);

export interface FightEvent {
  /** Seconds since the fight started (walk included). */
  t: number;
  /** Who acted: your swing hits the enemy (and heals you); the enemy's hits you. */
  by: 'you' | 'enemy';
  kind: 'hit' | 'crit' | 'dodge';
  /** Damage dealt (0 for a dodge). */
  damage: number;
  /** HP you got back with this event: heal, lifesteal and regen since the previous event. */
  healed: number;
  youHp: number;
  foeHp: number;
  /** Second Wind saved you from this hit. */
  secondWind?: boolean;
  /** Second Skin's shield left after this event, while it lasts. */
  shield?: number;
  /** Follow-through: the previous kill's overkill landing as the fight starts. */
  carried?: boolean;
  /** Bulwark blocked half of this hit. */
  blocked?: boolean;
}

export interface Fight {
  stats: CombatStats;
  matchup: Matchup;
  enemy: EnemyDef;
  /** Seconds of walking before the first swing. */
  walk: number;
  events: FightEvent[];
  /** Seconds from the fight's start to its end (the kill, the defeat or the stalemate). */
  end: number;
  outcome: 'kill' | 'defeat' | 'stalemate';
}

/**
 * One fight: a walk, then both sides swing on their own timers until one drops.
 * Per swing, the averages are `matchup`'s: your hit is its DPS split over your
 * attacks and crits, heals its HPS per attack, the enemy's hit its DPS after your
 * mitigation, dodged at your evasion; regen ticks between events. Swing timers start
 * half a period in, so on average a fight lasts what the formulas say. Unlike the
 * formulas, HP can't go above max (overhealing is lost) and damage varies ±10%.
 * Executioner doubles your hits once the enemy is below its threshold; Second Wind
 * turns the first killing blow into a drop to its share of max HP; Ambush makes your
 * first swing 5×; Frostbite's chill shrinks the enemy's hits. Bully doubles your hits
 * while the enemy is above its threshold; Berserker scales them with your missing HP;
 * Follow-through lands the average overkill as the fight starts (so each fight stays
 * on its own). Second Skin's shield takes hits first; Bulwark halves some hits; Last
 * Stand shrinks hits while you are below its threshold. New effects draw from the
 * generator only when worn, so fights without them replay as before.
 */
export function simulateFight(s: CombatStats, m: Matchup, enemy: EnemyDef, rng: Rng): Fight {
  const src = s.sources[0];
  const walk = s.walkTime;
  const yourPeriod = src && m.dps > 0 ? 1 / src.attacksPerSec : Infinity;
  const foePeriod = 1 / enemy.speed;
  const crit = Math.min(1, src?.critChance ?? 0);
  // Your average hit without a crit, and a crit's multiplier, so hit × speed × critMult = DPS.
  const hit = src && m.dps > 0 ? m.dps / src.attacksPerSec / m.critMult : 0;
  const critX = crit > 0 && src ? 1 + (m.critMult - 1) / crit : 1;
  const healPerSwing = src && m.hps > 0 ? m.hps / src.attacksPerSec : 0;
  const enemyHit = m.enemyHit;
  const amount = (id: number) => effectAmount(s.effects, id);
  let ambush = s.effects.has(Effect.Ambush) ? 5 : 1;
  const executeBelow = amount(Effect.Executioner) * enemy.hp;
  const bullyAbove = (1 - amount(Effect.Bully)) * enemy.hp;
  const berserk = 10 * amount(Effect.Berserker);
  const bulwark = amount(Effect.Bulwark);
  const lastStand = amount(Effect.LastStand);
  const lowHp = LAST_STAND_BELOW * s.maxHp;
  let secondWind = amount(Effect.SecondWind);
  let shield = m.shield;

  let youHp = s.maxHp;
  let foeHp = enemy.hp;
  let now = walk;
  let nextYou = walk + yourPeriod / 2;
  let nextFoe = walk + foePeriod / 2;
  const events: FightEvent[] = [];
  const done = (end: number, outcome: Fight['outcome']): Fight => ({ stats: s, matchup: m, enemy, walk, events, end, outcome });
  const shieldNote = () => (m.shield > 0 ? { shield } : {});

  // Follow-through: half an average hit of overkill, a share of it carried in.
  const carried = (amount(Effect.FollowThrough) / 2) * hit * m.critMult;
  if (carried > 0) {
    foeHp = Math.max(0, foeHp - carried);
    events.push({ t: walk, by: 'you', kind: 'hit', damage: carried, healed: 0, youHp, foeHp, carried: true, ...shieldNote() });
    if (foeHp <= 0) return done(walk, 'kill');
  }

  for (;;) {
    const t = Math.min(nextYou, nextFoe);
    if (t > walk + MAX_FIGHT_SECONDS) return done(walk + MAX_FIGHT_SECONDS, 'stalemate');
    const before = youHp;
    youHp = Math.min(s.maxHp, youHp + s.regen * (t - now));
    now = t;
    if (nextYou <= nextFoe) {
      nextYou += yourPeriod;
      const isCrit = rng() < crit;
      const doubled = foeHp < executeBelow || foeHp > bullyAbove ? 2 : 1;
      const rage = berserk > 0 ? 1 + (berserk * (s.maxHp - youHp)) / s.maxHp : 1;
      const damage = hit * (isCrit ? critX : 1) * (0.9 + 0.2 * rng()) * doubled * ambush * rage;
      ambush = 1;
      foeHp = Math.max(0, foeHp - damage);
      youHp = Math.min(s.maxHp, youHp + healPerSwing + s.lifesteal * damage);
      events.push({ t, by: 'you', kind: isCrit ? 'crit' : 'hit', damage, healed: youHp - before, youHp, foeHp, ...shieldNote() });
      if (foeHp <= 0) return done(t, 'kill');
    } else {
      nextFoe += foePeriod;
      const dodged = rng() < m.evasion;
      let damage = dodged ? 0 : enemyHit * (0.9 + 0.2 * rng());
      const blocked = !dodged && bulwark > 0 && rng() < bulwark;
      if (blocked) damage /= 2;
      if (lastStand > 0 && youHp < lowHp) damage *= 1 - lastStand;
      const healed = youHp - before;
      const absorbed = Math.min(shield, damage);
      shield -= absorbed;
      youHp = Math.max(0, youHp - (damage - absorbed));
      const saved = youHp <= 0 && secondWind > 0;
      if (saved) {
        youHp = secondWind * s.maxHp;
        secondWind = 0;
      }
      events.push({ t, by: 'enemy', kind: dodged ? 'dodge' : 'hit', damage, healed, youHp, foeHp,
        ...(saved && { secondWind: true }), ...(blocked && { blocked: true }), ...shieldNote() });
      if (youHp <= 0) return done(t, 'defeat');
    }
  }
}

export interface Simulated extends Settled {
  /**
   * The latest fight and when it started: the one in progress at `nowMicros`, or the
   * one that just ended in a defeat or a stalemate. Undefined when idle.
   */
  current?: { startMicros: bigint; fight: Fight };
}

/**
 * Online progress (the live counterpart of `project`): plays the fights since
 * `p.settledMicros` back to back. Each kill grants its XP and gold (batched per
 * level, like `project`); stats are recomputed per fight, so a level-up applies from
 * the next one. Only finished fights are settled: the one in progress stays open and
 * replays identically from its start next time. A defeat or a stalemate settles up
 * to now; a defeat also returns `defeatedAt`. An elixir active when a fight starts
 * applies to the whole fight; each kill uses one charge.
 */
export function simulate(p: Progress, a: Activity, nowMicros: bigint, characterId: bigint): Simulated {
  let { level, xp, gold } = p;
  let start = p.settledMicros;
  let total = 0;
  let xpGained = 0n;
  // Kills at the current level not yet turned into XP and gold.
  let batch = 0;
  let m: Matchup | undefined;
  const savor = effectAmount(combatStats(level, a.gear).effects, Effect.Savor);
  const elixir = new ElixirTracker(a.elixir, savor);
  const commit = () => {
    if (!m || batch === 0) return;
    if (level < MAX_LEVEL) {
      const gained = BigInt(Math.floor(batch * m.xpPerKill));
      xp += gained;
      xpGained += gained;
    }
    gold += BigInt(Math.floor(batch * m.goldPerKill));
    batch = 0;
    for (let need = xpToNext(level); level < MAX_LEVEL && xp >= need; need = xpToNext(level)) {
      xp -= need;
      level += 1;
    }
    if (level >= MAX_LEVEL) xp = 0n;
  };
  const result = (settledMicros: bigint, extra: Partial<Simulated> = {}): Simulated => {
    commit();
    return { level, xp, gold, settledMicros, kills: total, xpGained, elixir: elixir.left, ...extra };
  };

  if (!a.enemy || nowMicros <= start) return result(nowMicros > start ? nowMicros : start);
  for (;;) {
    const stats = combatStats(level, a.gear, elixir.buffs);
    const fm = matchup(stats, a.enemy);
    // Rewards changed (a level-up, an elixir running out): close the batch at the old rate.
    if (m && (fm.xpPerKill !== m.xpPerKill || fm.goldPerKill !== m.goldPerKill)) commit();
    m = fm;
    const fight = simulateFight(stats, fm, a.enemy, fightRng(characterId, start));
    const end = start + BigInt(Math.ceil(fight.end * 1e6));
    if (end > nowMicros) return result(start, { current: { startMicros: start, fight } });
    const current = { startMicros: start, fight };
    if (fight.outcome === 'defeat') return result(nowMicros, { defeatedAt: end, current });
    if (fight.outcome === 'stalemate') return result(nowMicros, { current });
    total += 1;
    batch += 1;
    // Savor: this kill may keep its charge.
    elixir.use(1, savor > 0 && seededRng(characterId, start, SAVOR_SALT)() < savor ? 0 : 1);
    // Level up as soon as this kill's XP gets there: the next fight uses the new stats.
    if (level < MAX_LEVEL && xp + BigInt(Math.floor(batch * fm.xpPerKill)) >= xpToNext(level)) commit();
    start = end;
  }
}
