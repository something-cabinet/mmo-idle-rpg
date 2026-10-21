// One live fight (combat.md), played hit by hit, and the offline kill rate sampled from
// such fights. Pure and deterministic: each fight's rolls come from a seeded generator.
// The back-to-back online settle (`simulate`) is in sim.ts.

import { type CombatStats, type Matchup } from './combat';
import { Effect, MOONLIGHT_MULT } from './data/legendary';
import type { EnemyDef } from './data/zones';
import { Fighter } from './fighter';
import { seededRng, type Rng } from './loot';

/** A fight not over after this long is a stalemate: time passes with no effect. */
export const MAX_FIGHT_SECONDS = 600;

/** Mixed into fight seeds, so they never reuse a drop roll's seed. */
const FIGHT_SALT = 0x6669676874n; // "fight"

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
  /** HP a Phial of Renewal healed after this event took you below half HP. */
  renewed?: number;
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
  /** Riposte: what your counter to this dodge dealt. */
  countered?: number;
  /** Thornshell: what this hit reflected back at the enemy. */
  thorns?: number;
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
  /** Renewal left, as a share of max HP (default: the Phial's, `CombatStats.renewal`): once per Deep depth too. */
  renewal?: number;
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
  /** × your hits (Stoke the Fire in the Moonwell Deep: more for each enemy already fallen this depth). */
  damageMult?: number;
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
  /** Your HP when the fight started (max HP, or `FightMods.startHp`). */
  startHp: number;
  /** Your HP when the fight ended. */
  hpLeft: number;
  /** Second Wind left after the fight (0 once it triggered). */
  secondWindLeft: number;
  /** Renewal left after the fight (0 once it triggered). */
  renewalLeft: number;
}

/**
 * One fight: a walk, then both sides swing on their own timers until one drops.
 * Per swing, the averages are `matchup`'s: your hit is its DPS split over your
 * attacks and crits, heals its HPS per attack, the enemy's hit its DPS after your
 * mitigation and Frostbite's chill, dodged at your evasion, then shrunk by a Phial of Warding,
 * Stoneskin, Bulwark, Last Stand and Afterimage like any sim's (`Fighter.shrink`); regen (yours and the enemy's) ticks between
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
 * swing; Waxing Moon scales swing k by `waxingMult(k)`; Fading Rally times swing k at
 * `rallyMult(k)` × your speed; Parry and Thrust crits the swing after a dodge (and only
 * then). Riposte counters each dodge, Thornshell reflects each hit that reaches you, and
 * Zealot's Oath hits with each heal, as events of their own. A Phial of Renewal heals once
 * when a hit leaves you below half HP. New effects draw from the
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
  // Your average hit without a crit, and a crit's multiplier, so hit × speed × critMult = your
  // weapon's DPS. Moonlight's wave, Waxing Moon's and Fading Rally's averages and the enemy's
  // evasion are in `m.weaponDps`; take them out, then apply them per swing.
  const moonlight = s.effects.has(Effect.Moonlight);
  const parry = s.effects.has(Effect.ParryAndThrust);
  const healMult = mods.healMult ?? 1;
  const regen = s.regen * healMult;
  const lifesteal = s.lifesteal * healMult;
  let cur = m;
  let evade = 0;
  let hit = 0;
  let critX = 1;
  let healPerSwing = 0;
  let zealot = 0;
  let counter = 0;
  let enemyHit = 0;
  const you = new Fighter(s, { hp: mods.startHp, secondWind: mods.secondWind, renewal: mods.renewal });
  const face = (x: Matchup) => {
    cur = x;
    evade = x.enemyEvasion;
    hit = src && x.weaponDps > 0 ? x.weaponDps / (1 - evade) / src.attacksPerSec / x.critMult / x.waxing / x.rally / (moonlight ? MOONLIGHT_MULT : 1) : 0;
    const c = parry ? x.parry : crit;
    critX = c > 0 && src ? 1 + (x.critMult - 1) / c : 1;
    const heal = src && x.hps > 0 ? x.hps / src.attacksPerSec / x.rally : 0;
    healPerSwing = heal * healMult;
    zealot = you.zealot(heal, x.enemyMitigation.Magic);
    counter = you.riposte(hit, c, critX);
    enemyHit = x.foeHit;
  };
  face(m);
  /** Enemy regen since its last swing, shown on its next one. */
  let foeRegained = 0;
  const limit = mods.timeLimit ?? MAX_FIGHT_SECONDS;
  const drain = mods.drain ?? 0;
  const reflect = mods.reflect ?? 0;
  /** Seconds into the fight (after the walk) at `t`. */
  const into = (t: number) => t - walk;
  const immune = (t: number) =>
    into(t) < (mods.immuneUntil ?? 0) || (!!mods.eclipse && into(t) >= mods.eclipse.every && into(t) % mods.eclipse.every < mods.eclipse.length);
  const ramp = (t: number) => (mods.ramp ? 1 + mods.ramp.step * Math.floor(into(t) / mods.ramp.every) : 1);

  const startHp = you.hp;
  let foeHp = enemy.hp;
  let now = walk;
  let nextYou = walk + you.firstPeriod(yourPeriod / 2);
  let nextFoe = walk + foePeriod / 2;
  let nextBurst = mods.burst ? walk + mods.burst.every : Infinity;
  const events: FightEvent[] = [];
  const done = (end: number, outcome: Fight['outcome']): Fight =>
    ({ stats: s, matchup: m, enemy, walk, events, end, outcome, startHp, hpLeft: you.hp, secondWindLeft: you.secondWind, renewalLeft: you.renewal });
  const shieldNote = () => (m.shield > 0 ? { shield: you.shield } : {});

  // Follow-through: half an average hit of overkill, a share of it carried in.
  const carried = immune(walk) ? 0 : (you.amount(Effect.FollowThrough) / 2) * hit * m.critMult;
  if (carried > 0) {
    foeHp = Math.max(0, foeHp - carried);
    events.push({ t: walk, by: 'you', kind: 'hit', damage: carried, healed: 0, youHp: you.hp, foeHp, carried: true, ...shieldNote() });
    if (foeHp <= 0) return done(walk, 'kill');
  }

  for (;;) {
    const t = Math.min(nextYou, nextFoe, nextBurst);
    if (t > walk + limit) return done(walk + limit, 'stalemate');
    const before = you.hp;
    you.hp = Math.min(s.maxHp, you.hp + regen * (t - now));
    const foeBefore = foeHp;
    foeHp = Math.min(enemy.hp, foeHp + foeRegen * (t - now));
    foeRegained += foeHp - foeBefore;
    now = t;
    if (t === nextBurst) {
      nextBurst += mods.burst!.every;
      // Can't be dodged; your other defenses and Thornshell work as on any hit.
      const damage = you.shrink(mods.burst!.mult * enemyHit * ramp(t) * (0.9 + 0.2 * rng()), rng);
      const blocked = you.blocked;
      const healed = you.hp - before;
      const hpDamage = you.absorb(damage);
      const thorns = immune(t) ? 0 : you.thorns(hpDamage, cur.thornsThrough);
      foeHp = Math.max(0, foeHp - thorns);
      const saved = you.take(hpDamage);
      events.push({ t, by: 'enemy', kind: 'hit', damage, healed, youHp: you.hp, foeHp, burst: true, ...(blocked && { blocked: true }), ...(thorns > 0 && { thorns }),
        ...(saved && { secondWind: true }), ...(you.renewed > 0 && { renewed: you.renewed }), ...shieldNote() });
      if (foeHp <= 0) return done(t, 'kill');
      if (you.hp <= 0) return done(t, 'defeat');
    } else if (nextYou <= nextFoe) {
      nextYou += you.nextPeriod(yourPeriod);
      // Rolled only against an evasive enemy, so other fights replay as before.
      const missed = evade > 0 && rng() < evade;
      const isCrit = you.rollCrit(crit, rng, missed);
      const wave = you.isWave();
      const shielded = !missed && immune(t);
      const weapon = missed || shielded ? 0 : you.swingDamage(hit * (isCrit ? critX : 1) * (0.9 + 0.2 * rng()), foeHp, enemy.hp) * (mods.damageMult ?? 1);
      // Zealot's Oath: the heal lands even on a miss, and hits with it.
      const damage = weapon + (shielded ? 0 : zealot);
      // Ambush is spent on the first swing that can land.
      if (!shielded) you.ambush = 1;
      foeHp = Math.max(0, foeHp - damage);
      you.hp = Math.min(s.maxHp, you.hp + healPerSwing + lifesteal * damage);
      const reflected = reflect * damage;
      const saved = reflected > 0 && you.takeDirect(reflected);
      events.push({ t, by: 'you', kind: missed || shielded ? 'miss' : isCrit ? 'crit' : 'hit', damage, healed: you.hp - before, youHp: you.hp, foeHp,
        ...(wave && !missed && !shielded && { wave: true }), ...(shielded && { immune: true }), ...(reflected > 0 && { reflected }),
        ...(saved && { secondWind: true }), ...(reflected > 0 && you.renewed > 0 && { renewed: you.renewed }), ...shieldNote() });
      if (foeHp <= 0) return done(t, 'kill');
      if (you.hp <= 0) return done(t, 'defeat');
    } else {
      nextFoe += foePeriod;
      const dodged = rng() < cur.evasion;
      let damage = 0;
      // Riposte: a dodge counters for a share of your average hit.
      let countered = 0;
      if (dodged) {
        you.dodge();
        countered = immune(t) ? 0 : counter;
      } else damage = you.shrink(enemyHit * (0.9 + 0.2 * rng()) * ramp(t), rng);
      const blocked = !dodged && you.blocked;
      const healed = you.hp - before;
      const hpBefore = you.hp;
      const hpDamage = you.absorb(damage);
      // Thornshell: what reached you reflects back, through the enemy's mitigation.
      const thorns = immune(t) ? 0 : you.thorns(hpDamage, cur.thornsThrough);
      foeHp = Math.max(0, foeHp - countered - thorns);
      const saved = you.take(hpDamage);
      // Drain: the enemy heals a share of what reached your HP.
      const drained = drain > 0 && foeHp > 0 ? Math.min(enemy.hp - foeHp, drain * Math.min(hpBefore, hpDamage)) : 0;
      foeHp += drained;
      events.push({ t, by: 'enemy', kind: dodged ? 'dodge' : 'hit', damage, healed, youHp: you.hp, foeHp,
        ...(saved && { secondWind: true }), ...(blocked && { blocked: true }), ...(foeRegen > 0 && { foeHealed: foeRegained }),
        ...(countered > 0 && { countered }), ...(thorns > 0 && { thorns }),
        ...(drained > 0 && { drained }), ...(you.renewed > 0 && { renewed: you.renewed }), ...shieldNote() });
      foeRegained = 0;
      if (foeHp <= 0) return done(t, 'kill');
      if (you.hp <= 0) return done(t, 'defeat');
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
