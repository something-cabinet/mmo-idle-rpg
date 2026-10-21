// Friendly duels (docs/design/duels.md): your character against a friend's, as of their
// last settle. Client only: no reward and nothing stored, so there is nothing to trust
// the server with. Like fight.ts `simulateFight`, but both sides are players: each swings
// on its own timer with the matchup formulas of combat.ts applied player against player
// (penetration, evasion, crits, heals, lifesteal, regen and the effects).

import { critMultAgainst, defenseAgainst, mitigation, parrySource, type CombatStats } from '../../spacetimedb/src/combat';
import { Effect, effectAmount } from '../../spacetimedb/src/data/legendary';
import { Fighter } from '../../spacetimedb/src/fighter';
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

/** What `a`'s swings do to `b`, per swing before crits, variance and effects that need HP. */
function offense(a: CombatStats, b: CombatStats) {
  const src = a.sources[0];
  const amount = (id: number) => effectAmount(a.effects, id);
  // `b`'s defenses as in `defenseAgainst` (Juggernaut, Spellward), with `a`'s penetration.
  const best = Math.max(b.armor, b.resistance);
  const physDef = b.effects.has(Effect.Spellward) ? best : b.armor;
  const magicDef = b.effects.has(Effect.Juggernaut) ? best : b.resistance;
  const voidtouched = a.effects.has(Effect.Voidtouched);
  // A player's armor and resistance scale with the attacker's level (`defenseAgainst`).
  const mitP = voidtouched ? 0 : mitigation(physDef, a.armorPen, a.level) * (1 - amount(Effect.Rending));
  const mitM = voidtouched ? 0 : mitigation(magicDef, a.magicPen, a.level) * (1 - amount(Effect.Spellbreaker));
  if (!src) return { period: Infinity, hit: 0, physShare: 1, heal: 0, crit: 0, critX: 1, evasion: 0, mitP, mitM };
  const phys = src.hit.Physical * (1 - mitP);
  const magic = src.hit.Magic * (1 - mitM);
  const crit = Math.min(1, src.critChance);
  const type = src.hit.Physical >= src.hit.Magic ? 'Physical' : 'Magic';
  return {
    period: 1 / src.attacksPerSec,
    // Frostbite on `b` chills `a`'s hits.
    hit: (phys + magic) * (1 - b.chill),
    /** The physical part of `hit` (Thornshell reflects each part in its own type). */
    physShare: phys + magic > 0 ? phys / (phys + magic) : 1,
    heal: src.heal,
    crit,
    // Deadeye: crits ignore a share of `b`'s mitigation. Parry and Thrust: a parried swing's crit.
    critX: a.effects.has(Effect.ParryAndThrust)
      ? critMultAgainst(parrySource(src, a.critDamage), { Physical: mitP, Magic: mitM }, amount(Effect.Deadeye))
      : crit > 0 ? 1 + (critMultAgainst(src, { Physical: mitP, Magic: mitM }, amount(Effect.Deadeye)) - 1) / crit : 1,
    // True Shot: `a` never misses.
    evasion: a.effects.has(Effect.TrueShot) ? 0 : defenseAgainst(b, type, a.level, a.accuracy).evasion,
    mitP,
    mitM,
  };
}

/** One duel between `sides[0]` and `sides[1]`. */
export function simulateDuel(sides: [CombatStats, CombatStats], rng: Rng): Duel {
  const off = [offense(sides[0], sides[1]), offense(sides[1], sides[0])] as const;
  const maxHp: [number, number] = [sides[0].maxHp, sides[1].maxHp];
  const duelists = [new Fighter(sides[0]), new Fighter(sides[1])] as const;
  const hp = (): [number, number] => [duelists[0].hp, duelists[1].hp];
  // Each side's first swing lands at a random point of its first period (half a period on
  // average, like `simulateFight`), so neither seat always strikes first.
  const first = (period: number) => (Number.isFinite(period) ? rng() * period : Infinity);
  const next = [first(duelists[0].firstPeriod(off[0].period)), first(duelists[1].firstPeriod(off[1].period))];
  const events: DuelEvent[] = [];
  let now = 0;

  const done = (end: number, winner: Duel['winner'], by: Duel['by']): Duel => ({ events, maxHp, end, winner, by });

  for (;;) {
    const t = Math.min(next[0], next[1]);
    if (t > DUEL_SECONDS) {
      const share = [duelists[0].hp / maxHp[0], duelists[1].hp / maxHp[1]];
      return done(DUEL_SECONDS, Math.abs(share[0] - share[1]) < 0.001 ? -1 : share[0] > share[1] ? 0 : 1, 'points');
    }
    for (const d of duelists) d.hp = Math.min(d.maxHp, d.hp + d.stats.regen * (t - now));
    now = t;
    const a = (next[0] <= next[1] ? 0 : 1) as 0 | 1;
    const b = (1 - a) as 0 | 1;
    const o = off[a];
    const you = duelists[a];
    const foe = duelists[b];
    next[a] += you.nextPeriod(o.period);
    if (rng() < o.evasion) {
      you.rollCrit(o.crit, rng, true);
      you.ambush = 1;
      foe.dodge();
      // Riposte: `b` counters for a share of an average hit.
      const counter = foe.riposte(off[b].hit, off[b].crit, off[b].critX);
      const saved = counter > 0 && you.takeDirect(counter);
      events.push({ t, by: a, kind: 'dodge', damage: 0, hp: hp(), ...(saved && { secondWind: true }) });
      if (you.hp <= 0) return done(t, b, 'ko');
      continue;
    }
    const isCrit = you.rollCrit(o.crit, rng);
    const critX = isCrit ? o.critX : 1;
    const weapon = you.swingDamage(o.hit * critX * (0.9 + 0.2 * rng()), foe.hp, foe.maxHp);
    you.ambush = 1;
    const heal = o.heal * critX;
    // Zealot's Oath: heals also hit for a share of the heal (magic).
    const damage = weapon + you.zealot(heal, o.mitM);
    const taken = foe.absorb(foe.shrink(damage, rng));
    const saved = foe.take(taken);
    you.hp = Math.min(you.maxHp, you.hp + heal + sides[a].lifesteal * damage);
    // Thornshell on the target reflects a share of what reached it, each part in the type it was dealt in.
    const phys = damage > 0 ? (weapon * o.physShare) / damage : 0;
    const thorns = foe.thorns(taken * phys, 1 - off[b].mitP) + foe.thorns(taken * (1 - phys), 1 - off[b].mitM);
    const savedA = thorns > 0 && you.takeDirect(thorns);
    events.push({ t, by: a, kind: isCrit ? 'crit' : 'hit', damage, hp: hp(), ...((saved || savedA) && { secondWind: true }) });
    if (foe.hp <= 0) return done(t, a, 'ko');
    if (you.hp <= 0) return done(t, b, 'ko');
  }
}

/** The generator for duel `round` between two characters (same inputs, same duel). */
export const duelRng = (meId: bigint, foeId: bigint, round: number) => seededRng(meId, foeId, BigInt(round), DUEL_SALT);

/** Share of DUEL_SAMPLES duels side 0 wins (draws count half). */
export function winRate(sides: [CombatStats, CombatStats], meId: bigint, foeId: bigint): number {
  let wins = 0;
  for (let i = 0; i < DUEL_SAMPLES; i++) {
    const { winner } = simulateDuel(sides, seededRng(meId, foeId, BigInt(i), DUEL_SALT, 1n));
    wins += winner === 0 ? 1 : winner === -1 ? 0.5 : 0;
  }
  return wins / DUEL_SAMPLES;
}
