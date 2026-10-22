// The one combat engine (combat.md): two sides of combatants, players or foes, N against M.
// Zone fights (fight.ts), Moonwell Deep depths (abyss.ts), raids (raid.ts) and duels
// (src/ui/duelSim.ts) are all battles; their modules only set one up and read the result in
// the shape their screens use. A combatant's effects live in `Fighter` (fighter.ts); a foe's
// mechanics (Deep affixes, raid boss signatures, Lunar Phases, a duo's bond) are `FoeSpec`
// traits. Pure and deterministic: the same setup and generator always play the same battle.

import { critMultAgainst, defenseAgainst, mitigation, parrySource, type CombatStats } from './combat';
import { DRAWING_FIRE, Effect, TWIN_FLAME, effectAmount } from './data/legendary';
import { THREAT_FOCUS, empoweredSignature, type DuoDef } from './data/raids';
import type { DamageType } from './data/bases';
import { dodgeChance } from './data/stats';
import type { EnemyDef } from './data/zones';
import { Fighter, type FighterStart } from './fighter';
import type { Rng } from './loot';

/** How much of an enemy's attention a player with `threat` draws (THREAT_FOCUS). */
export const threatWeight = (threat: number) => Math.exp(THREAT_FOCUS * threat);

/** A player, or a hired NPC, in a battle. */
export interface PlayerSpec {
  kind: 'player';
  stats: CombatStats;
  /** HP, Second Wind and Renewal carried in (a Deep depth's next fight, a Rift node). */
  start?: FighterStart;
  /** The opponent (index on the other side) it attacks while that one stands: a duo raid's assignment. */
  target?: number;
}

/**
 * A timed attack that can't be dodged: a raid's AoE or a duo brother's signature (`damage`
 * of its own type), or a Moonwell Deep burst (`mult` × the foe's own hit). It hits one
 * opponent picked by threat, or every living one (`aoe`; `split` shares `damage` among them).
 */
export interface FoeSpecial {
  every: number;
  aoe: boolean;
  split?: boolean;
  damage?: number;
  damageType?: DamageType;
  mult?: number;
}

/** An enemy in a battle, with its mechanics. Times count from when it enters. */
export interface FoeSpec {
  kind: 'foe';
  def: EnemyDef;
  /** Heals this share of the damage it deals to an opponent's HP (Vampiric, the Deep's draining kinds). */
  drain?: number;
  /** Takes no damage before this many seconds. */
  immuneUntil?: number;
  /** Takes no damage for `length` seconds every `every` seconds (from `every` on). */
  eclipse?: { every: number; length: number };
  /** Its hits grow by `step` (+10% = 0.1) every `every` seconds. */
  ramp?: { every: number; step: number };
  special?: FoeSpecial;
  /** Lunar Phases: every `every` seconds it turns to the next of `list` (defenses and damage type), from the first. */
  phases?: { every: number; list: EnemyDef[] };
  /** Its hits are half physical, half magic (Tidal). */
  mixed?: boolean;
  /** Reflects this share of each hit it takes, in the types dealt, cut by the attacker's own defense (Thorned). */
  thorned?: number;
  /** × the heals, regen and lifesteal of everyone fighting it (Starless). */
  healMult?: number;
}

export type Combatant = PlayerSpec | FoeSpec;

export interface BattleSetup {
  /** Side 0 and side 1. Players may be on either side (a duel); foes only fight players. */
  sides: [Combatant[], Combatant[]];
  /** Side 1 fights one at a time, the next entering as one falls (a Deep depth, a Rift node), all one fight for the players: what lasts one fight (Ambush, Waxing Moon, the shield…) carries on. */
  chain?: boolean;
  /** Seconds before anyone swings (a zone fight's walk). */
  walk?: number;
  /** First swings come half a period in ('half', zone and Deep fights) or at a random point of the first period. */
  firstSwing?: 'half' | 'random';
  /** Seconds after the walk the battle may last. */
  timeLimit: number;
  /** At the limit: a draw (a zone stalemate), a loss for side 0 (a raid's enrage), or the larger share of HP left wins (a duel). */
  onTimeout: 'draw' | 'lose' | 'points';
  /** Follow-through: each foe takes the average overkill as it enters (zone and Deep fights). */
  followThrough?: boolean;
  /** A duo raid: side 1's two foes are its brothers (bond, absorption, empowering). */
  duo?: DuoDef;
  /** Keep the events (default true): off for odds and kill rates. */
  record?: boolean;
}

export interface BattleEvent {
  t: number;
  /** Who acted (index in the battle's actors: side 0, then side 1), or -1 for a timed mechanic (a phase change, empowering). */
  by: number;
  /** Who was hit or entered; -1 for every opponent (an AoE) or none. */
  target: number;
  /**
   * 'miss': the swing or attack didn't land (the target dodged it). 'special': a timed attack
   * on one target; 'aoe': on every opponent. 'carry': Follow-through landing as a foe enters.
   */
  kind: 'hit' | 'crit' | 'miss' | 'special' | 'aoe' | 'carry' | 'phase' | 'fall' | 'empower' | 'enter';
  /**
   * A player's swing: its damage, Zealot's Oath included. A foe's attack: the rolled hit after
   * the target's mitigation, before its other defenses (an AoE: the share before mitigation).
   */
  damage: number;
  /** A foe's hit on one target: what got through Warding, Stoneskin, Bulwark, Last Stand and Afterimage (the shield's share included). */
  dealt?: number;
  /** Bulwark blocked half of it. */
  blocked?: boolean;
  /** Moonlight: the swing hit twice. */
  wave?: boolean;
  /** The target couldn't be damaged. */
  immune?: boolean;
  /** What came back at the attacker: a Thorned foe's reflect, or the target's Thornshell. */
  reflected?: number;
  /** Riposte: the target's counter to a dodge. */
  countered?: number;
  /** HP the attacking foe drained. */
  drained?: number;
  /** HP a Phial of Renewal gave back this event. */
  renewed?: number;
  /** Actors Second Wind saved this event. */
  saved?: number[];
  /** A phase change: the phase it turned to. */
  phase?: number;
  /** Every actor's HP after the event. */
  hp: number[];
  /** HP every actor got back since the previous event: heals, lifesteal and regen. */
  healed: number[];
  /** Every actor's Second Skin shield after the event, when a player started with one. */
  shield?: number[];
}

/** One foe of a chain, as its part of the battle went (a Deep depth's fights). */
export interface ChainSegment {
  /** Actor index of the foe. */
  foe: number;
  start: number;
  end: number;
  /** Every actor's HP at the end, and side 0's first player's Second Wind and Renewal left. */
  hp: number[];
  secondWind: number;
  renewal: number;
}

export interface BattleResult {
  events: BattleEvent[];
  /** Seconds from the start to the end (the last fall, or the time limit). */
  end: number;
  /** The side left standing; -1 for a draw. */
  winner: 0 | 1 | -1;
  timedOut: boolean;
  /** Every actor's HP at the end. */
  hp: number[];
  maxHp: number[];
  /** Each player's Fighter at the end (Second Wind and Renewal left); undefined for foes. */
  fighters: (Fighter | undefined)[];
  /** A chain: the foes that entered, in order. */
  segments: ChainSegment[];
}

/** What a player's swings do to one opponent, per swing before crits, variance and effects that need HP. */
export interface Offense {
  period: number;
  hit: number;
  /** The physical part of `hit`. */
  physShare: number;
  heal: number;
  healAll: boolean;
  crit: number;
  /** × a crit's damage (Deadeye included). */
  critX: number;
  /** × a crit's heal: your crit damage only (Frostbite: none). */
  healCritX: number;
  /** Chance the opponent dodges each swing. */
  evade: number;
  mitP: number;
  mitM: number;
}

/** The damage type `s` deals most of (physical when equal, e.g. a pure healer). */
const mainType = (s: CombatStats): DamageType => (s.sources[0] && s.sources[0].hit.Magic > s.sources[0].hit.Physical ? 'Magic' : 'Physical');

/**
 * `a`'s offense against a foe or a player. A foe's mitigation scales with its own level; a
 * player's armor and resistance with the attacker's (`defenseAgainst`). Rending and
 * Spellbreaker ignore a share of what's left after penetration; Voidtouched ignores all of it.
 * Deadeye's crits ignore more; Parry and Thrust's crits come from dodging; True Shot never misses.
 */
export function offense(a: CombatStats, target: { kind: 'foe'; def: EnemyDef } | { kind: 'player'; stats: CombatStats }): Offense {
  const src = a.sources[0];
  const amount = (id: number) => effectAmount(a.effects, id);
  const voidtouched = a.effects.has(Effect.Voidtouched);
  let mitP: number;
  let mitM: number;
  let evade: number;
  let chill = 0;
  if (target.kind === 'foe') {
    const e = target.def;
    mitP = voidtouched ? 0 : mitigation(e.armor, a.armorPen, e.level) * (1 - amount(Effect.Rending));
    mitM = voidtouched ? 0 : mitigation(e.resistance, a.magicPen, e.level) * (1 - amount(Effect.Spellbreaker));
    evade = a.effects.has(Effect.TrueShot) ? 0 : dodgeChance(e.evasionRating ?? 0, a.accuracy);
  } else {
    const b = target.stats;
    // Juggernaut and Spellward defend with the better of armor and resistance.
    const best = Math.max(b.armor, b.resistance);
    const physDef = b.effects.has(Effect.Spellward) ? best : b.armor;
    const magicDef = b.effects.has(Effect.Juggernaut) ? best : b.resistance;
    mitP = voidtouched ? 0 : mitigation(physDef, a.armorPen, a.level) * (1 - amount(Effect.Rending));
    mitM = voidtouched ? 0 : mitigation(magicDef, a.magicPen, a.level) * (1 - amount(Effect.Spellbreaker));
    evade = a.effects.has(Effect.TrueShot) ? 0 : defenseAgainst(b, mainType(a), a.level, a.accuracy).evasion;
    // Frostbite on the target chills your hits.
    chill = b.chill;
  }
  if (!src) return { period: Infinity, hit: 0, physShare: 1, heal: 0, healAll: false, crit: 0, critX: 1, healCritX: 1, evade, mitP, mitM };
  const phys = src.hit.Physical * (1 - mitP);
  const magic = src.hit.Magic * (1 - mitM);
  const crit = Math.min(1, src.critChance);
  const mits = { Physical: mitP, Magic: mitM };
  return {
    period: 1 / src.attacksPerSec,
    hit: (phys + magic) * (1 - chill),
    physShare: phys + magic > 0 ? phys / (phys + magic) : 1,
    heal: src.heal,
    healAll: src.healAll,
    crit,
    critX: a.effects.has(Effect.ParryAndThrust)
      ? critMultAgainst(parrySource(src, a.critDamage), mits, amount(Effect.Deadeye))
      : crit > 0 ? 1 + (critMultAgainst(src, mits, amount(Effect.Deadeye)) - 1) / crit : 1,
    healCritX: a.effects.has(Effect.ParryAndThrust) ? Math.max(1, a.critDamage) : crit > 0 ? 1 + (src.critMult - 1) / crit : 1,
    evade,
    mitP,
    mitM,
  };
}

/** Thorned's reflect against `s`: `share` of each hit, split by the types `s` deals to `e`, each cut by `s`'s own defense. */
export function thornedShare(s: CombatStats, e: EnemyDef, share: number): number {
  const o = offense(s, { kind: 'foe', def: e });
  const src = s.sources[0];
  const phys = src ? src.hit.Physical * (1 - o.mitP) : 0;
  const magic = src ? src.hit.Magic * (1 - o.mitM) : 0;
  const physShare = phys + magic > 0 ? phys / (phys + magic) : 1;
  return share * (physShare * (1 - defenseAgainst(s, 'Physical', e.level).mitigation) + (1 - physShare) * (1 - defenseAgainst(s, 'Magic', e.level).mitigation));
}

interface PlayerActor {
  kind: 'player';
  side: 0 | 1;
  spec: PlayerSpec;
  f: Fighter;
  /** The opponent it swings at (actor index), -1 for none. */
  target: number;
  next: number;
}

interface FoeActor {
  kind: 'foe';
  side: 0 | 1;
  spec: FoeSpec;
  /** As it is now (its phase, or empowered). */
  def: EnemyDef;
  hp: number;
  maxHp: number;
  /** In the battle (a chain's later foes wait), and when it entered. */
  active: boolean;
  start: number;
  next: number;
  special?: FoeSpecial;
  nextSpecial: number;
  phase: number;
  nextPhase: number;
  fallen: boolean;
  empowered: boolean;
}

type Actor = PlayerActor | FoeActor;

const hpOf = (a: Actor) => (a.kind === 'player' ? a.f.hp : a.hp);

export function simulateBattle(setup: BattleSetup, rng: Rng): BattleResult {
  const record = setup.record !== false;
  const walk = setup.walk ?? 0;
  const limitAt = walk + setup.timeLimit;
  const half = setup.firstSwing === 'half';
  const first = (period: number) => (!Number.isFinite(period) ? Infinity : half ? period / 2 : rng() * period);
  const duo = setup.duo;

  const actors: Actor[] = [];
  setup.sides.forEach((list, side) => {
    for (const spec of list) {
      if (spec.kind === 'player') {
        actors.push({ kind: 'player', side: side as 0 | 1, spec, f: new Fighter(spec.stats, spec.start), target: -1, next: Infinity });
      } else {
        actors.push({
          kind: 'foe', side: side as 0 | 1, spec, def: spec.def, hp: spec.def.hp, maxHp: spec.def.hp, active: false, start: 0, next: Infinity,
          special: spec.special, nextSpecial: Infinity, phase: 0, nextPhase: Infinity, fallen: false, empowered: false,
        });
      }
    }
  });
  const n = actors.length;
  const maxHp = actors.map(a => (a.kind === 'player' ? a.f.maxHp : a.maxHp));
  const gained = new Array<number>(n).fill(0);
  const shielded = actors.some(a => a.kind === 'player' && a.f.shield > 0);
  const events: BattleEvent[] = [];
  const segments: ChainSegment[] = [];
  // Frostbite: the highest chill on a side shrinks every foe's hits on it.
  const chill = [0, 1].map(side => Math.max(0, ...actors.map(a => (a.kind === 'player' && a.side === side ? a.f.stats.chill : 0))));
  const sideIndex = actors.map((a, i) => i - (a.side === 0 ? 0 : setup.sides[0].length));

  // Offense per (player, opponent), recomputed when the opponent changes (a phase, empowering).
  const offCache: (Offense | undefined)[] = new Array(n * n);
  const off = (a: number, b: number): Offense => {
    const key = a * n + b;
    let o = offCache[key];
    if (!o) {
      const x = actors[a] as PlayerActor;
      const y = actors[b];
      o = offCache[key] = offense(x.f.stats, y.kind === 'foe' ? { kind: 'foe', def: y.def } : { kind: 'player', stats: y.f.stats });
    }
    return o;
  };
  const changed = (b: number) => {
    for (let a = 0; a < n; a++) offCache[a * n + b] = undefined;
    foeHitCache[b] = undefined;
  };
  // A foe's hit on each player before variance, ramp and the bond: its DPS per attack, after Frostbite and the player's mitigation.
  const foeHitCache: ({ hit: number[]; evasion: number[] } | undefined)[] = new Array(n);
  const foeHit = (f: number) => {
    let c = foeHitCache[f];
    if (!c) {
      const x = actors[f] as FoeActor;
      const e = x.def;
      const per = (e.dps / e.speed) * (1 - chill[1 - x.side]);
      c = { hit: [], evasion: [] };
      for (let p = 0; p < n; p++) {
        const y = actors[p];
        if (y.kind !== 'player' || y.side === x.side) continue;
        const s = y.f.stats;
        const through = x.spec.mixed
          ? (2 - defenseAgainst(s, 'Physical', e.level).mitigation - defenseAgainst(s, 'Magic', e.level).mitigation) / 2
          : 1 - defenseAgainst(s, e.damageType, e.level).mitigation;
        c.hit[p] = per * through;
        c.evasion[p] = defenseAgainst(s, e.damageType, e.level).evasion;
      }
      foeHitCache[f] = c;
    }
    return c;
  };
  // What a player's Thornshell gets through a foe's mitigation, in the foe's damage type(s).
  const thornsThrough = (p: number, f: number) => {
    const o = off(p, f);
    const x = actors[f] as FoeActor;
    return x.spec.mixed ? (2 - o.mitP - o.mitM) / 2 : 1 - (x.def.damageType === 'Physical' ? o.mitP : o.mitM);
  };
  const thornedCache: (number | undefined)[] = new Array(n * n);
  const thorned = (p: number, f: number) => {
    const x = actors[f] as FoeActor;
    if (!x.spec.thorned) return 0;
    const key = p * n + f;
    return thornedCache[key] ?? (thornedCache[key] = thornedShare((actors[p] as PlayerActor).f.stats, x.def, x.spec.thorned));
  };

  const inPlay = (i: number) => {
    const a = actors[i];
    return a.kind === 'player' ? a.f.hp > 0 : a.active && a.hp > 0;
  };
  const opponents = (i: number) => {
    const list: number[] = [];
    for (let j = 0; j < n; j++) if (actors[j].side !== actors[i].side && inPlay(j)) list.push(j);
    return list;
  };
  const allies = (i: number) => {
    const list: number[] = [];
    for (let j = 0; j < n; j++) if (actors[j].side === actors[i].side && inPlay(j)) list.push(j);
    return list;
  };
  const fallen = () => {
    let k = 0;
    for (const a of actors) if (a.kind === 'player' ? a.f.hp <= 0 : a.fallen) k++;
    return k;
  };
  /** × each player's heals, regen and lifesteal: Starless foes in play halve them. Updated as foes enter and fall. */
  const hm = new Array<number>(n).fill(1);
  const updateHealMult = () => {
    for (let p = 0; p < n; p++) {
      if (actors[p].kind !== 'player') continue;
      let m = 1;
      for (let j = 0; j < n; j++) {
        const y = actors[j];
        if (y.kind === 'foe' && y.side !== actors[p].side && y.spec.healMult !== undefined && inPlay(j)) m *= y.spec.healMult;
      }
      hm[p] = m;
    }
  };
  const heal = (i: number, amount: number) => {
    const a = actors[i];
    if (a.kind === 'player') {
      const before = a.f.hp;
      a.f.heal(amount);
      gained[i] += a.f.hp - before;
    } else if (a.hp > 0) {
      const before = a.hp;
      a.hp = Math.min(a.maxHp, a.hp + amount);
      gained[i] += a.hp - before;
    }
  };
  const into = (x: FoeActor, t: number) => t - x.start;
  const immune = (f: number, t: number) => {
    const x = actors[f];
    if (x.kind !== 'foe') return false;
    const s = x.spec;
    const k = into(x, t);
    return k < (s.immuneUntil ?? 0) || (!!s.eclipse && k >= s.eclipse.every && k % s.eclipse.every < s.eclipse.length);
  };
  const ramp = (x: FoeActor, t: number) => (x.spec.ramp ? 1 + x.spec.ramp.step * Math.floor(into(x, t) / x.spec.ramp.every) : 1);
  /** A duo: × brother `f`'s damage while both stand (`together`); alone, full strength, more once empowered. */
  const bond = (f: number) => {
    if (!duo) return 1;
    const x = actors[f] as FoeActor;
    const both = actors.every(y => y.kind !== 'foe' || y.hp > 0);
    return both ? duo.together : x.empowered ? duo.absorbed : 1;
  };
  /** A player's threat against foe `f`: a duo adds focus against the brother it attacks, Drawing Fire multiplies it against the other. */
  const threat = (p: number, f: number) => {
    const s = (actors[p] as PlayerActor).f.stats;
    if (!duo) return s.threat;
    return (actors[p] as PlayerActor).target === f ? s.threat + duo.focusThreat : s.threat * (s.effects.has(Effect.DrawingFire) ? DRAWING_FIRE : 1);
  };
  /** A living opponent picked by foe `f`, weighted by threat. */
  const pickTarget = (f: number) => {
    let only = -1;
    let count = 0;
    for (let j = 0; j < n; j++) {
      if (actors[j].side !== actors[f].side && inPlay(j)) {
        only = j;
        count++;
      }
    }
    if (count <= 1) return only;
    const living = opponents(f);
    const w = (i: number) => threatWeight(threat(i, f));
    let r = rng() * living.reduce((sum, i) => sum + w(i), 0);
    return living.find(i => (r -= w(i)) < 0) ?? living[living.length - 1];
  };

  /** Records `e` with everyone's HP (callers check `record` first, so nothing is built for nothing). */
  const push = (e: Omit<BattleEvent, 'hp' | 'healed' | 'shield'>) => {
    const ev = e as BattleEvent;
    ev.hp = actors.map(hpOf);
    ev.healed = gained.slice();
    if (shielded) ev.shield = actors.map(a => (a.kind === 'player' ? a.f.shield : 0));
    events.push(ev);
    gained.fill(0);
  };

  /** A player picks its opponent: its assignment while that one is in play, else the first in play. */
  const retarget = (p: number) => {
    const x = actors[p] as PlayerActor;
    const assigned = x.spec.target;
    const other = setup.sides[1 - x.side];
    const base = x.side === 0 ? setup.sides[0].length : 0;
    if (assigned !== undefined && assigned < other.length && inPlay(base + assigned) && x.target === -1) x.target = base + assigned;
    if (x.target < 0 || !inPlay(x.target)) x.target = opponents(p)[0] ?? -1;
  };

  /** Foe `f` enters at `t`: its timers start, and every player facing it starts its swing timer against it. */
  const enter = (f: number, t: number, initial: boolean) => {
    const x = actors[f] as FoeActor;
    x.active = true;
    x.start = t;
    x.next = t + first(1 / x.def.speed);
    if (x.special) x.nextSpecial = t + x.special.every;
    if (x.spec.phases) x.nextPhase = t + x.spec.phases.every;
    updateHealMult();
    if (!initial && record) push({ t, by: -1, target: f, kind: 'enter', damage: 0 });
  };

  // ---------------------------------------------------------------- the start
  // Players' swing timers first, then the foes' (raid order), each drawn in actor order.
  for (let i = 0; i < n; i++) {
    const a = actors[i];
    if (a.kind === 'foe' && (!setup.chain || setup.sides[a.side].findIndex(c => c.kind === 'foe') === sideIndex[i])) a.active = true;
  }
  for (let i = 0; i < n; i++) {
    const a = actors[i];
    if (a.kind !== 'player') continue;
    retarget(i);
    a.next = a.target < 0 ? Infinity : walk + first(a.f.firstPeriod(off(i, a.target).period));
  }
  for (let i = 0; i < n; i++) {
    const a = actors[i];
    if (a.kind === 'foe' && a.active) enter(i, walk, true);
  }
  // Follow-through: a share of the average overkill lands as a foe enters.
  const carry = (f: number, t: number) => {
    if (!setup.followThrough || immune(f, t)) return;
    const x = actors[f] as FoeActor;
    for (let p = 0; p < n; p++) {
      const y = actors[p];
      if (y.kind !== 'player' || y.target !== f || y.f.hp <= 0) continue;
      const o = off(p, f);
      const carried = (y.f.amount(Effect.FollowThrough) / 2) * o.hit * (1 + o.crit * (o.critX - 1));
      if (carried <= 0) continue;
      x.hp = Math.max(0, x.hp - carried);
      if (record) push({ t, by: p, target: f, kind: 'carry', damage: carried });
    }
  };

  let now = 0;
  let absorbing: { foe: number; until: number } | undefined;
  let acted = 0 as 0 | 1;

  const result = (end: number, winner: 0 | 1 | -1, timedOut: boolean): BattleResult => {
    closeSegment(end);
    return {
      events, end, winner, timedOut, hp: actors.map(hpOf), maxHp,
      fighters: actors.map(a => (a.kind === 'player' ? a.f : undefined)), segments,
    };
  };
  let segmentFoe = -1;
  let segmentStart = walk;
  const firstPlayer = actors.find(a => a.kind === 'player' && a.side === 0) as PlayerActor | undefined;
  const closeSegment = (end: number) => {
    if (!setup.chain || segmentFoe < 0) return;
    segments.push({ foe: segmentFoe, start: segmentStart, end, hp: actors.map(hpOf), secondWind: firstPlayer?.f.secondWind ?? 0, renewal: firstPlayer?.f.renewal ?? 0 });
    segmentFoe = -1;
  };
  if (setup.chain) segmentFoe = actors.findIndex(a => a.kind === 'foe' && a.active);

  // A player takes a foe's hit (an attack or a special): their defenses, Thornshell back, the foe's drain.
  const hurt = (p: number, raw: number, f: number, t: number) => {
    const y = actors[p] as PlayerActor;
    const x = actors[f] as FoeActor;
    const dealt = y.f.shrink(raw, rng);
    const blocked = y.f.blocked;
    const hpDamage = y.f.absorb(dealt);
    const reflected = immune(f, t) ? 0 : y.f.thorns(hpDamage, thornsThrough(p, f));
    x.hp = Math.max(0, x.hp - reflected);
    const hpBefore = y.f.hp;
    const saved = y.f.take(hpDamage);
    const drained = x.spec.drain && x.hp > 0 ? Math.min(x.maxHp - x.hp, x.spec.drain * Math.min(hpBefore, hpDamage)) : 0;
    x.hp += drained;
    return { dealt, blocked, reflected, saved, drained, renewed: y.f.renewed };
  };

  /** After anything that can drop a foe or a player: falls, a chain's next foe, a duo's absorbing; the result once a side is down. */
  const settle = (t: number): BattleResult | undefined => {
    // Foes that just fell: a chain sends in the next, a duo's survivor starts absorbing.
    for (let f = 0; f < n; f++) {
      const x = actors[f];
      if (x.kind !== 'foe' || !x.active || x.hp > 0 || x.fallen) continue;
      x.fallen = true;
      x.next = Infinity;
      x.nextSpecial = Infinity;
      x.nextPhase = Infinity;
      if (absorbing?.foe === f) absorbing = undefined;
      updateHealMult();
      if (record) push({ t, by: -1, target: f, kind: 'fall', damage: 0 });
      const nextFoe = actors.findIndex((y, j) => y.kind === 'foe' && y.side === x.side && !y.active && j > f);
      if (setup.chain && nextFoe >= 0) {
        closeSegment(t);
        segmentFoe = nextFoe;
        segmentStart = t;
        enter(nextFoe, t, false);
        for (let p = 0; p < n; p++) {
          const y = actors[p];
          if (y.kind !== 'player' || y.side === x.side || y.f.hp <= 0) continue;
          y.target = nextFoe;
          y.next = t + y.f.periodNow(off(p, nextFoe).period);
        }
        carry(nextFoe, t);
        continue;
      }
      // Its players turn on another foe, their next swing on its timer.
      for (let p = 0; p < n; p++) {
        const y = actors[p];
        if (y.kind !== 'player' || y.target !== f) continue;
        y.target = -1;
        retarget(p);
        if (y.target >= 0 && Number.isFinite(y.next)) y.next = t + y.f.periodNow(off(p, y.target).period);
      }
      const other = actors.findIndex((y, j) => j !== f && y.kind === 'foe' && y.side === x.side && y.hp > 0);
      if (duo && other >= 0 && !(actors[other] as FoeActor).empowered) absorbing = { foe: other, until: t + duo.absorbSeconds };
    }
    // The dead stop swinging; a battle ends when a side is down (both: the side that acted wins).
    let up0 = false;
    let up1 = false;
    for (const a of actors) {
      if (hpOf(a) <= 0) continue;
      if (a.side === 0) up0 = true;
      else up1 = true;
    }
    return !up0 || !up1 ? result(t, !up0 && !up1 ? acted : up0 ? 0 : 1, false) : undefined;
  };

  for (let i = 0; i < n; i++) if (actors[i].kind === 'foe' && (actors[i] as FoeActor).active) carry(i, walk);
  {
    const over = settle(walk);
    if (over) return over;
  }

  // ---------------------------------------------------------------- the loop
  for (;;) {
    // The next thing to happen: timed mechanics first, then swings in actor order.
    let t = absorbing?.until ?? Infinity;
    for (const a of actors) {
      if (a.kind === 'foe') {
        if (!a.active || a.hp <= 0) continue;
        t = Math.min(t, a.nextPhase, a.nextSpecial, a.next);
      } else if (a.f.hp > 0) t = Math.min(t, a.next);
    }
    if (t > limitAt || !Number.isFinite(t)) {
      if (setup.onTimeout === 'lose') return result(limitAt, 1, true);
      if (setup.onTimeout === 'draw') return result(limitAt, -1, true);
      const share = [0, 1].map(side => {
        let hp = 0;
        let max = 0;
        actors.forEach((a, i) => {
          if (a.side === side) {
            hp += hpOf(a);
            max += maxHp[i];
          }
        });
        return hp / max;
      });
      return result(limitAt, Math.abs(share[0] - share[1]) < 0.001 ? -1 : share[0] > share[1] ? 0 : 1, true);
    }
    for (let i = 0; i < n; i++) {
      const a = actors[i];
      if (a.kind === 'player') {
        if (a.f.stats.regen > 0) heal(i, a.f.stats.regen * hm[i] * (t - now));
      } else if (a.active && a.def.regen) heal(i, a.def.regen * (t - now));
    }
    now = t;

    let phaseFoe = -1;
    let specialFoe = -1;
    for (let j = 0; j < n; j++) {
      const a = actors[j];
      if (a.kind !== 'foe' || !a.active || a.hp <= 0) continue;
      if (phaseFoe < 0 && a.nextPhase === t) phaseFoe = j;
      if (specialFoe < 0 && a.nextSpecial === t) specialFoe = j;
    }
    if (phaseFoe >= 0) {
      const x = actors[phaseFoe] as FoeActor;
      const list = x.spec.phases!.list;
      x.nextPhase += x.spec.phases!.every;
      x.phase = (x.phase + 1) % list.length;
      x.def = list[x.phase];
      changed(phaseFoe);
      if (record) push({ t, by: -1, target: phaseFoe, kind: 'phase', damage: 0, phase: x.phase });
      continue;
    }
    if (absorbing && t === absorbing.until) {
      // A duo: the survivor finishes absorbing his brother and empowers.
      const f = absorbing.foe;
      absorbing = undefined;
      const x = actors[f] as FoeActor;
      const d = duo!.bosses[sideIndex[f]];
      x.def = { ...x.def, ...(d.empowered.armor !== undefined && { armor: d.empowered.armor }), ...(d.empowered.resistance !== undefined && { resistance: d.empowered.resistance }) };
      changed(f);
      const sig = empoweredSignature(d);
      x.special = { every: sig.every, damage: sig.damage, damageType: sig.damageType, aoe: sig.aoe };
      x.nextSpecial = t + sig.every;
      x.hp = Math.min(x.maxHp, x.hp + (d.empowered.heal ?? 0) * x.maxHp);
      x.empowered = true;
      if (record) push({ t, by: -1, target: f, kind: 'empower', damage: 0 });
      continue;
    }

    if (specialFoe >= 0) {
      const f = specialFoe;
      const x = actors[f] as FoeActor;
      acted = x.side;
      const sp = x.special!;
      x.nextSpecial += sp.every;
      const targets = sp.aoe ? opponents(f) : [pickTarget(f)].filter(p => p >= 0);
      let saved: number[] | undefined;
      let renewed = 0;
      // A share of `damage` (split among the living), or `mult` × its own hit on each target.
      const flat = sp.damage !== undefined ? (sp.damage * (1 - chill[1 - x.side]) * bond(f)) / (sp.split ? targets.length : 1) : 0;
      let last: ReturnType<typeof hurt> | undefined;
      let rolled = 0;
      for (const p of targets) {
        rolled = sp.mult !== undefined
          ? sp.mult * foeHit(f).hit[p] * bond(f) * ramp(x, t) * (0.9 + 0.2 * rng())
          : flat * (1 - defenseAgainst((actors[p] as PlayerActor).f.stats, sp.damageType ?? x.def.damageType, x.def.level).mitigation) * (0.9 + 0.2 * rng());
        last = hurt(p, rolled, f, t);
        if (last.saved) (saved ??= []).push(p);
        renewed += last.renewed;
      }
      if (sp.aoe && record) push({ t, by: f, target: -1, kind: 'aoe', damage: flat, ...(saved && { saved }), ...(renewed > 0 && { renewed }) });
      else if (last) {
        if (record) push({ t, by: f, target: targets[0], kind: 'special', damage: rolled, dealt: last.dealt, ...(last.blocked && { blocked: true }),
          ...(last.reflected > 0 && { reflected: last.reflected }), ...(last.drained > 0 && { drained: last.drained }),
          ...(saved && { saved }), ...(renewed > 0 && { renewed }) });
      }
    } else {
      let i = -1;
      for (let j = 0; j < n; j++) {
        const a = actors[j];
        if (a.next === t && (a.kind === 'player' ? a.f.hp > 0 : a.active && a.hp > 0)) {
          i = j;
          break;
        }
      }
      const a = actors[i];
      acted = a.side;
      if (a.kind === 'foe') {
        // A foe attacks a living opponent picked by threat.
        a.next += 1 / a.def.speed;
        const p = pickTarget(i);
        if (p < 0) continue;
        const y = actors[p] as PlayerActor;
        if (rng() < foeHit(i).evasion[p]) {
          y.f.dodge();
          // Riposte: the dodge counters for a share of an average hit.
          const o = off(p, i);
          const countered = immune(i, t) ? 0 : y.f.riposte(o.hit, o.crit, o.critX);
          a.hp = Math.max(0, a.hp - countered);
          if (record) push({ t, by: i, target: p, kind: 'miss', damage: 0, ...(countered > 0 && { countered }) });
        } else {
          const damage = foeHit(i).hit[p] * bond(i) * (0.9 + 0.2 * rng()) * ramp(a, t);
          const h = hurt(p, damage, i, t);
          if (record) push({ t, by: i, target: p, kind: 'hit', damage, dealt: h.dealt, ...(h.blocked && { blocked: true }), ...(h.reflected > 0 && { reflected: h.reflected }),
            ...(h.drained > 0 && { drained: h.drained }), ...(h.saved && { saved: [p] }), ...(h.renewed > 0 && { renewed: h.renewed }) });
        }
      } else {
        // A player swings at its opponent.
        retarget(i);
        const b = a.target;
        if (b < 0) {
          a.next = Infinity;
          continue;
        }
        const p = a.f;
        const o = off(i, b);
        a.next += p.nextPeriod(o.period);
        const missed = o.evade > 0 && rng() < o.evade;
        const isCrit = p.rollCrit(o.crit, rng, missed);
        const wave = p.isWave();
        const shieldedFoe = !missed && immune(b, t);
        const critX = isCrit ? o.critX : 1;
        const y = actors[b];
        const weapon = missed || shieldedFoe ? 0 : p.swingDamage(o.hit * critX * (0.9 + 0.2 * rng()), hpOf(y), maxHp[b]) * (p.has(Effect.StokeTheFire) ? p.stokeMult(fallen()) : 1);
        if (!shieldedFoe) p.ambush = 1;
        // Heals land even when the swing misses; Zealot's Oath hits with them.
        const healed = o.heal * (isCrit ? o.healCritX : 1);
        const damage = weapon + (shieldedFoe ? 0 : p.zealot(healed, o.mitM));
        let reflected = 0;
        let countered = 0;
        let saved: number[] | undefined;
        let renewed = 0;
        if (y.kind === 'foe') {
          y.hp = Math.max(0, y.hp - damage);
          reflected = thorned(i, b) * damage;
        } else if (missed) {
          y.f.dodge();
          // Riposte: the target counters for a share of its average hit.
          const c = off(b, i);
          countered = y.f.riposte(c.hit, c.crit, c.critX);
        } else {
          const taken = y.f.absorb(y.f.shrink(damage, rng));
          if (y.f.take(taken)) (saved ??= []).push(b);
          renewed += y.f.renewed;
          // Thornshell on the target reflects a share of what reached it, each part in the type it was dealt in.
          const c = off(b, i);
          const phys = damage > 0 ? (weapon * o.physShare) / damage : 0;
          reflected = y.f.thorns(taken * phys, 1 - c.mitP) + y.f.thorns(taken * (1 - phys), 1 - c.mitM);
        }
        if (healed > 0) {
          const living = allies(i);
          if (o.healAll) for (const k of living) heal(k, (healed * hm[k]) / living.length);
          else {
            const hurtFirst = [...living].sort((u, v) => hpOf(actors[u]) / maxHp[u] - hpOf(actors[v]) / maxHp[v]);
            heal(hurtFirst[0], healed * hm[hurtFirst[0]]);
            // Twin Flame: the next most hurt ally gets a share too.
            if (p.has(Effect.TwinFlame) && hurtFirst[1] !== undefined) heal(hurtFirst[1], TWIN_FLAME * healed * hm[hurtFirst[1]]);
          }
        }
        heal(i, p.stats.lifesteal * hm[i] * damage);
        if (reflected + countered > 0 && p.takeDirect(reflected + countered)) (saved ??= []).push(i);
        renewed += reflected + countered > 0 ? p.renewed : 0;
        if (record) push({ t, by: i, target: b, kind: missed || shieldedFoe ? 'miss' : isCrit ? 'crit' : 'hit', damage,
          ...(wave && !missed && !shieldedFoe && { wave: true }), ...(shieldedFoe && { immune: true }), ...(reflected > 0 && { reflected }),
          ...(countered > 0 && { countered }), ...(saved && { saved }), ...(renewed > 0 && { renewed }) });
      }
    }

    const over = settle(t);
    if (over) return over;
  }
}
