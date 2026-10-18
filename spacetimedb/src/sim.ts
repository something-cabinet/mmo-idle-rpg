// Live combat (combat.md): fights played hit by hit while the player is online. Pure
// and deterministic, so the server (settling) and the client (animating) run the very
// same fights: each fight's rolls come from a generator seeded by the character and
// the fight's start time. Offline time still uses the expected-value `project`.

import { MAX_LEVEL, combatStats, matchup, type CombatStats, type Matchup } from './combat';
import { Effect, LAST_STAND_BELOW, MOONLIGHT_EVERY, MOONLIGHT_MULT, effectAmount, waxingMult } from './data/legendary';
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
  /** `miss`: an evasive enemy dodged your swing; `dodge`: you dodged the enemy's. */
  kind: 'hit' | 'crit' | 'miss' | 'dodge';
  /** Damage dealt (0 for a miss or a dodge). */
  damage: number;
  /** HP you got back with this event: heal, lifesteal and regen since the previous event. */
  healed: number;
  youHp: number;
  foeHp: number;
  /** HP the enemy regenerated since its previous swing, on its swings (a regenerating enemy only). */
  foeHealed?: number;
  /** Second Wind saved you from this hit. */
  secondWind?: boolean;
  /** Second Skin's shield left after this event, while it lasts. */
  shield?: number;
  /** Follow-through: the previous kill's overkill landing as the fight starts. */
  carried?: boolean;
  /** Bulwark blocked half of this hit. */
  blocked?: boolean;
  /** Moonlight: this swing hit twice. */
  wave?: boolean;
  /** The enemy couldn't be damaged when this swing landed (`FightMods.immuneUntil`, `eclipse`). */
  immune?: boolean;
  /** An undodgeable burst (`FightMods.burst`), not a regular swing. */
  burst?: boolean;
  /** Damage your swing reflected back at you (`FightMods.reflect`). */
  reflected?: number;
  /** HP the enemy drained from this hit (`FightMods.drain`). */
  drained?: number;
}

/**
 * Optional changes to a fight, for Moonwell Deep fights (abyss.ts, abyss.md). None of them
 * exist in zone fights, so without mods a fight replays exactly as before.
 */
export interface FightMods {
  /** Seconds of walking before the first swing (default: the character's walk time). */
  walk?: number;
  /** HP at the start (default: max HP). */
  startHp?: number;
  /** Second Wind left, as a share of max HP (default: the worn amount): once per Deep depth, not per fight. */
  secondWind?: number;
  /** Seconds after the walk before the fight ends as a stalemate (default MAX_FIGHT_SECONDS). */
  timeLimit?: number;
  /** The enemy heals this share of the damage it deals to your HP. */
  drain?: number;
  /** The enemy takes no damage before this many seconds after the walk. */
  immuneUntil?: number;
  /** The enemy takes no damage for `length` seconds every `every` seconds (from `every` on). */
  eclipse?: { every: number; length: number };
  /** The enemy's hits grow by `step` (+10% = 0.1) every `every` seconds. */
  ramp?: { every: number; step: number };
  /** Every `every` seconds the enemy also hits for `mult` × its hit; it can't be dodged. */
  burst?: { every: number; mult: number };
  /** × your heals, regen and lifesteal. */
  healMult?: number;
  /** Share of each of your hits that comes back to you as damage (after your mitigation). */
  reflect?: number;
  /** The enemy turns to the next matchup in `list` every `every` seconds, from the first (= the fight's `m`). */
  phases?: { every: number; list: Matchup[] };
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
  /** Your HP when the fight ended. */
  hpLeft: number;
  /** Second Wind left after the fight (0 once it triggered). */
  secondWindLeft: number;
}

/**
 * One fight: a walk, then both sides swing on their own timers until one drops.
 * Per swing, the averages are `matchup`'s: your hit is its DPS split over your
 * attacks and crits, heals its HPS per attack, the enemy's hit its DPS after your
 * mitigation, dodged at your evasion; regen (yours and the enemy's) ticks between
 * events, and an evasive enemy dodges your swings (heals still land). Swing timers start
 * half a period in, so on average a fight lasts what the formulas say. Unlike the
 * formulas, HP can't go above max (overhealing is lost) and damage varies ±10%.
 * Executioner doubles your hits once the enemy is below its threshold; Second Wind
 * turns the first killing blow into a drop to its share of max HP; Ambush makes your
 * first swing 5×; Frostbite's chill shrinks the enemy's hits. Bully doubles your hits
 * while the enemy is above its threshold; Berserker scales them with your missing HP;
 * Follow-through lands the average overkill as the fight starts (so each fight stays
 * on its own). Second Skin's shield takes hits first; Bulwark halves some hits; Last
 * Stand shrinks hits while you are below its threshold. Moonlight doubles every 3rd
 * swing; Waxing Moon scales swing k by `waxingMult(k)`; Afterimage shrinks the enemy's
 * hit after a dodge. New effects draw from the
 * generator only when worn, so fights without them replay as before. `mods` (Moonwell Deep
 * fights only) change the start, the time limit and the enemy; see FightMods.
 */
export function simulateFight(s: CombatStats, m: Matchup, enemy: EnemyDef, rng: Rng, mods: FightMods = {}): Fight {
  const src = s.sources[0];
  const walk = mods.walk ?? s.walkTime;
  const yourPeriod = src && m.dps > 0 ? 1 / src.attacksPerSec : Infinity;
  const foePeriod = 1 / enemy.speed;
  const crit = Math.min(1, src?.critChance ?? 0);
  const foeRegen = enemy.regen ?? 0;
  // Your average hit without a crit, and a crit's multiplier, so hit × speed × critMult = DPS.
  // Moonlight's wave, Waxing Moon's average and the enemy's evasion are in `m.dps`; take
  // them out, then apply them per swing. Recomputed when the enemy changes phase.
  const moonlight = s.effects.has(Effect.Moonlight);
  const waxing = s.effects.has(Effect.WaxingMoon);
  const healMult = mods.healMult ?? 1;
  const regen = s.regen * healMult;
  const lifesteal = s.lifesteal * healMult;
  let cur = m;
  let evade = 0;
  let hit = 0;
  let critX = 1;
  let healPerSwing = 0;
  let enemyHit = 0;
  const face = (x: Matchup) => {
    cur = x;
    evade = x.enemyEvasion;
    hit = src && x.dps > 0 ? x.dps / (1 - evade) / src.attacksPerSec / x.critMult / x.waxing / (moonlight ? MOONLIGHT_MULT : 1) : 0;
    critX = crit > 0 && src ? 1 + (x.critMult - 1) / crit : 1;
    healPerSwing = src && x.hps > 0 ? (x.hps / src.attacksPerSec) * healMult : 0;
    enemyHit = x.enemyHit;
  };
  face(m);
  const amount = (id: number) => effectAmount(s.effects, id);
  let ambush = s.effects.has(Effect.Ambush) ? 5 : 1;
  const executeBelow = amount(Effect.Executioner) * enemy.hp;
  const bullyAbove = (1 - amount(Effect.Bully)) * enemy.hp;
  const berserk = 10 * amount(Effect.Berserker);
  const bulwark = amount(Effect.Bulwark);
  const lastStand = amount(Effect.LastStand);
  const lowHp = LAST_STAND_BELOW * s.maxHp;
  let secondWind = mods.secondWind ?? amount(Effect.SecondWind);
  let shield = m.shield;
  const afterimage = amount(Effect.Afterimage);
  let lastDodged = false;
  /** Enemy regen since its last swing, shown on its next one. */
  let foeRegained = 0;
  let swings = 0;
  const limit = mods.timeLimit ?? MAX_FIGHT_SECONDS;
  const drain = mods.drain ?? 0;
  const reflect = mods.reflect ?? 0;
  /** Seconds into the fight (after the walk) at `t`. */
  const into = (t: number) => t - walk;
  const immune = (t: number) =>
    into(t) < (mods.immuneUntil ?? 0) || (!!mods.eclipse && into(t) >= mods.eclipse.every && into(t) % mods.eclipse.every < mods.eclipse.length);
  const ramp = (t: number) => (mods.ramp ? 1 + mods.ramp.step * Math.floor(into(t) / mods.ramp.every) : 1);

  let youHp = Math.min(s.maxHp, mods.startHp ?? s.maxHp);
  let foeHp = enemy.hp;
  let now = walk;
  let nextYou = walk + yourPeriod / 2;
  let nextFoe = walk + foePeriod / 2;
  let nextBurst = mods.burst ? walk + mods.burst.every : Infinity;
  let phase = 0;
  let nextPhase = mods.phases ? walk + mods.phases.every : Infinity;
  const events: FightEvent[] = [];
  const done = (end: number, outcome: Fight['outcome']): Fight =>
    ({ stats: s, matchup: m, enemy, walk, events, end, outcome, hpLeft: youHp, secondWindLeft: secondWind });
  const shieldNote = () => (m.shield > 0 ? { shield } : {});
  /** You take `damage` (after the shield); Second Wind may save you. Returns whether it did. */
  const take = (damage: number): boolean => {
    youHp = Math.max(0, youHp - damage);
    if (youHp > 0 || secondWind <= 0) return false;
    youHp = secondWind * s.maxHp;
    secondWind = 0;
    return true;
  };

  // Follow-through: half an average hit of overkill, a share of it carried in.
  const carried = immune(walk) ? 0 : (amount(Effect.FollowThrough) / 2) * hit * m.critMult;
  if (carried > 0) {
    foeHp = Math.max(0, foeHp - carried);
    events.push({ t: walk, by: 'you', kind: 'hit', damage: carried, healed: 0, youHp, foeHp, carried: true, ...shieldNote() });
    if (foeHp <= 0) return done(walk, 'kill');
  }

  for (;;) {
    const t = Math.min(nextYou, nextFoe, nextBurst, nextPhase);
    if (t > walk + limit) return done(walk + limit, 'stalemate');
    const before = youHp;
    youHp = Math.min(s.maxHp, youHp + regen * (t - now));
    const foeBefore = foeHp;
    foeHp = Math.min(enemy.hp, foeHp + foeRegen * (t - now));
    foeRegained += foeHp - foeBefore;
    now = t;
    if (t === nextPhase) {
      const list = mods.phases!.list;
      nextPhase += mods.phases!.every;
      phase = (phase + 1) % list.length;
      face(list[phase]);
    } else if (t === nextBurst) {
      nextBurst += mods.burst!.every;
      // Can't be dodged or blocked; the shield still takes it first.
      const damage = mods.burst!.mult * enemyHit * ramp(t) * (0.9 + 0.2 * rng());
      const healed = youHp - before;
      const absorbed = Math.min(shield, damage);
      shield -= absorbed;
      const saved = take(damage - absorbed);
      events.push({ t, by: 'enemy', kind: 'hit', damage, healed, youHp, foeHp, burst: true, ...(saved && { secondWind: true }), ...shieldNote() });
      if (youHp <= 0) return done(t, 'defeat');
    } else if (nextYou <= nextFoe) {
      nextYou += yourPeriod;
      // Rolled only against an evasive enemy, so other fights replay as before.
      const missed = evade > 0 && rng() < evade;
      const isCrit = !missed && rng() < crit;
      const doubled = foeHp < executeBelow || foeHp > bullyAbove ? 2 : 1;
      const rage = berserk > 0 ? 1 + (berserk * (s.maxHp - youHp)) / s.maxHp : 1;
      swings += 1;
      const wave = moonlight && swings % MOONLIGHT_EVERY === 0;
      const shielded = !missed && immune(t);
      const damage = missed || shielded ? 0 : hit * (isCrit ? critX : 1) * (0.9 + 0.2 * rng()) * doubled * ambush * rage * (wave ? 2 : 1) * (waxing ? waxingMult(swings) : 1);
      // Ambush is spent on the first swing that can land.
      if (!shielded) ambush = 1;
      foeHp = Math.max(0, foeHp - damage);
      youHp = Math.min(s.maxHp, youHp + healPerSwing + lifesteal * damage);
      const reflected = reflect * damage;
      const saved = reflected > 0 && take(reflected);
      events.push({ t, by: 'you', kind: missed || shielded ? 'miss' : isCrit ? 'crit' : 'hit', damage, healed: youHp - before, youHp, foeHp,
        ...(wave && !missed && !shielded && { wave: true }), ...(shielded && { immune: true }), ...(reflected > 0 && { reflected }),
        ...(saved && { secondWind: true }), ...shieldNote() });
      if (foeHp <= 0) return done(t, 'kill');
      if (youHp <= 0) return done(t, 'defeat');
    } else {
      nextFoe += foePeriod;
      const dodged = rng() < cur.evasion;
      let damage = dodged ? 0 : enemyHit * (0.9 + 0.2 * rng()) * ramp(t);
      const blocked = !dodged && bulwark > 0 && rng() < bulwark;
      if (blocked) damage /= 2;
      if (lastStand > 0 && youHp < lowHp) damage *= 1 - lastStand;
      if (lastDodged) damage *= 1 - afterimage;
      lastDodged = dodged;
      const healed = youHp - before;
      const absorbed = Math.min(shield, damage);
      shield -= absorbed;
      const hpBefore = youHp;
      const saved = take(damage - absorbed);
      // Drain: the enemy heals a share of what reached your HP.
      const drained = drain > 0 ? Math.min(enemy.hp - foeHp, drain * Math.min(hpBefore, damage - absorbed)) : 0;
      foeHp += drained;
      events.push({ t, by: 'enemy', kind: dodged ? 'dodge' : 'hit', damage, healed, youHp, foeHp,
        ...(saved && { secondWind: true }), ...(blocked && { blocked: true }), ...(foeRegen > 0 && { foeHealed: foeRegained }),
        ...(drained > 0 && { drained }), ...shieldNote() });
      foeRegained = 0;
      if (youHp <= 0) return done(t, 'defeat');
    }
  }
}

/**
 * Seconds a character lies defeated before fighting the same target again, after losing
 * a live fight it wins on average (`matchup().viable`): bad luck costs a little time,
 * not the rest of the session (combat.md, "Defeat").
 */
export const RESPAWN_SECONDS = 30;

/** A defeat the character gets up from: a lost fight in a matchup it wins on average. */
export const respawns = (f: Fight) => f.outcome === 'defeat' && f.matchup.viable;

/** Seconds from a fight's start until the next one starts: its end, plus the respawn after a defeat that has one. */
export const fightSpan = (f: Fight) => f.end + (respawns(f) ? RESPAWN_SECONDS : 0);

/** Live fights sampled per offline estimate (`liveKillRate`). */
const ODDS_SAMPLES = 400;
const ODDS_SALT = 0x0dd5n;

/**
 * Kills per second that live fights of `stats` against `enemy` average out to, for the
 * offline settle (`project`), and the share of fights lost. Won fights take the formula's
 * time (`m.killRate`); lost ones (and stalemates) their sampled time, a defeat plus its
 * respawn (`fightSpan`). Sampled with fixed seeds, so a matchup always gets the same
 * estimate, and one that never loses settles exactly as by the formulas. Only for a
 * viable matchup: any other defeat ends farming.
 */
export function liveKillRate(stats: CombatStats, m: Matchup, enemy: EnemyDef): { killRate: number; lossShare: number } {
  if (!Number.isFinite(m.timeToDie) || m.killRate <= 0) return { killRate: m.killRate, lossShare: 0 };
  let wins = 0;
  let lostSpan = 0;
  for (let i = 0; i < ODDS_SAMPLES; i++) {
    const f = simulateFight(stats, m, enemy, seededRng(ODDS_SALT, BigInt(i)));
    if (f.outcome === 'kill') wins++;
    else lostSpan += fightSpan(f);
  }
  if (wins === ODDS_SAMPLES) return { killRate: m.killRate, lossShare: 0 };
  return { killRate: wins / (wins / m.killRate + lostSpan), lossShare: 1 - wins / ODDS_SAMPLES };
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
 * replays identically from its start next time. A defeat in a matchup the character
 * wins on average is followed by RESPAWN_SECONDS, then the next fight (`respawns`);
 * until the respawn is over the lost fight counts as in progress. Any other defeat, or
 * a stalemate, settles up to now; such a defeat also returns `defeatedAt`. An elixir active when a fight starts
 * applies to the whole fight; each kill uses one charge.
 */
export function simulate(p: Progress, a: Activity, nowMicros: bigint, characterId: bigint): Simulated {
  let { level, xp, gold } = p;
  let start = p.settledMicros;
  let total = 0;
  let xpGained = 0n;
  let respawned = 0;
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
    return { level, xp, gold, settledMicros, kills: total, xpGained, elixir: elixir.left, ...(respawned > 0 && { respawns: respawned }), ...extra };
  };

  if (!a.enemy || nowMicros <= start) return result(nowMicros > start ? nowMicros : start);
  for (;;) {
    const stats = combatStats(level, a.gear, elixir.buffs);
    const fm = matchup(stats, a.enemy);
    // Rewards changed (a level-up, an elixir running out): close the batch at the old rate.
    if (m && (fm.xpPerKill !== m.xpPerKill || fm.goldPerKill !== m.goldPerKill)) commit();
    m = fm;
    const fight = simulateFight(stats, fm, a.enemy, fightRng(characterId, start));
    const end = start + BigInt(Math.ceil(fightSpan(fight) * 1e6));
    if (end > nowMicros) return result(start, { current: { startMicros: start, fight } });
    const current = { startMicros: start, fight };
    if (respawns(fight)) {
      respawned += 1;
      start = end;
      continue;
    }
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
