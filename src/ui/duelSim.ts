// Friendly duels (docs/design/duels.md): your character against a friend's, as of their
// last settle. Client only: no reward and nothing stored, so there is nothing to trust
// the server with. Like fight.ts `simulateFight`, but both sides are players: each swings
// on its own timer with the matchup formulas of combat.ts applied player against player
// (penetration, evasion, crits, heals, lifesteal, regen and the effects).

import { critMultAgainst, defenseAgainst, effectDamageMult, mitigation, type CombatStats } from '../../spacetimedb/src/combat';
import { Effect, LAST_STAND_BELOW, MOONLIGHT_EVERY, MOONSHADOW_AFTER_DODGE, MOONSHADOW_TAKEN, effectAmount, waxingMult } from '../../spacetimedb/src/data/legendary';
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
  if (!src) return { period: Infinity, hit: 0, heal: 0, crit: 0, critX: 1, evasion: 0, mitP, mitM };
  const crit = Math.min(1, src.critChance);
  const type = src.hit.Physical >= src.hit.Magic ? 'Physical' : 'Magic';
  return {
    period: 1 / src.attacksPerSec,
    // Frostbite on `b` chills `a`'s hits.
    hit: (src.hit.Physical * (1 - mitP) + src.hit.Magic * (1 - mitM)) * (1 - b.chill),
    heal: src.heal,
    crit,
    // Deadeye: crits ignore a share of `b`'s mitigation.
    critX: crit > 0 ? 1 + (critMultAgainst(src, { Physical: mitP, Magic: mitM }, amount(Effect.Deadeye)) - 1) / crit : 1,
    evasion: defenseAgainst(b, type, a.level, a.accuracy).evasion,
    mitP,
    mitM,
  };
}

/** One duel between `sides[0]` and `sides[1]`. */
export function simulateDuel(sides: [CombatStats, CombatStats], rng: Rng): Duel {
  const off = [offense(sides[0], sides[1]), offense(sides[1], sides[0])] as const;
  const maxHp: [number, number] = [sides[0].maxHp, sides[1].maxHp];
  const hp: [number, number] = [...maxHp];
  const amount = (i: number, id: number) => effectAmount(sides[i].effects, id);
  const ambush = [sides[0].effects.has(Effect.Ambush) ? 5 : 1, sides[1].effects.has(Effect.Ambush) ? 5 : 1];
  const secondWind = [amount(0, Effect.SecondWind), amount(1, Effect.SecondWind)];
  const shield = [amount(0, Effect.SecondSkin) * maxHp[0], amount(1, Effect.SecondSkin) * maxHp[1]];
  const swings = [0, 0];
  const lastDodged = [false, false];
  // Each side's first swing lands at a random point of its first period (half a period on
  // average, like `simulateFight`), so neither seat always strikes first.
  const first = (period: number) => (Number.isFinite(period) ? rng() * period : Infinity);
  const next = [first(off[0].period), first(off[1].period)];
  const events: DuelEvent[] = [];
  let now = 0;

  /** `i` takes `damage`; Second Wind may save them. Returns whether it did. */
  const hurt = (i: number, damage: number) => {
    // Stoneskin, Bulwark and Last Stand shrink the hit; Second Skin's shield takes it first.
    damage = Math.max(0, damage - amount(i, Effect.Stoneskin) * maxHp[i]);
    const bulwark = amount(i, Effect.Bulwark);
    if (bulwark > 0 && rng() < bulwark) damage /= 2;
    if (hp[i] < LAST_STAND_BELOW * maxHp[i]) damage *= 1 - amount(i, Effect.LastStand);
    // Moonshadow: halved right after a dodge, × 1.1 otherwise.
    if (sides[i].effects.has(Effect.Moonshadow)) damage *= (lastDodged[i] ? MOONSHADOW_AFTER_DODGE : 1) * MOONSHADOW_TAKEN;
    lastDodged[i] = false;
    const absorbed = Math.min(shield[i], damage);
    shield[i] -= absorbed;
    hp[i] = Math.max(0, hp[i] - (damage - absorbed));
    if (hp[i] > 0 || secondWind[i] <= 0) return false;
    hp[i] = secondWind[i] * maxHp[i];
    secondWind[i] = 0;
    return true;
  };
  const done = (end: number, winner: Duel['winner'], by: Duel['by']): Duel => ({ events, maxHp, end, winner, by });

  for (;;) {
    const t = Math.min(next[0], next[1]);
    if (t > DUEL_SECONDS) {
      const share = [hp[0] / maxHp[0], hp[1] / maxHp[1]];
      return done(DUEL_SECONDS, Math.abs(share[0] - share[1]) < 0.001 ? -1 : share[0] > share[1] ? 0 : 1, 'points');
    }
    for (const i of [0, 1]) hp[i] = Math.min(maxHp[i], hp[i] + sides[i].regen * (t - now));
    now = t;
    const a = (next[0] <= next[1] ? 0 : 1) as 0 | 1;
    const b = (1 - a) as 0 | 1;
    const o = off[a];
    next[a] += o.period;
    swings[a] += 1;
    if (rng() < o.evasion) {
      ambush[a] = 1;
      lastDodged[b] = true;
      // Riposte: `b` counters for a share of an average hit.
      const counter = amount(b, Effect.Riposte) * off[b].hit * (1 + off[b].crit * (off[b].critX - 1));
      const saved = counter > 0 && hurt(a, counter);
      events.push({ t, by: a, kind: 'dodge', damage: 0, hp: [...hp], ...(saved && { secondWind: true }) });
      if (hp[a] <= 0) return done(t, b, 'ko');
      continue;
    }
    const isCrit = rng() < o.crit;
    const critX = isCrit ? o.critX : 1;
    // Executioner and Bully: double damage below / above their thresholds. Berserker: more the more HP `a` is missing.
    const execute = hp[b] < amount(a, Effect.Executioner) * maxHp[b] || hp[b] > (1 - amount(a, Effect.Bully)) * maxHp[b] ? 2 : 1;
    const rage = 1 + (10 * amount(a, Effect.Berserker) * (maxHp[a] - hp[a])) / maxHp[a];
    // Moonlight: every 3rd swing hits twice. Waxing Moon: swing k × waxingMult(k).
    const fx = sides[a].effects;
    const wave = fx.has(Effect.Moonlight) && swings[a] % MOONLIGHT_EVERY === 0 ? 2 : 1;
    const wax = fx.has(Effect.WaxingMoon) ? waxingMult(swings[a]) : 1;
    let damage = o.hit * critX * (0.9 + 0.2 * rng()) * execute * ambush[a] * rage * wave * wax;
    ambush[a] = 1;
    const heal = o.heal * critX;
    // Zealot's Oath: heals also hit for a share of the heal (magic).
    damage += amount(a, Effect.ZealotsOath) * heal * effectDamageMult(sides[a].effects) * (1 - o.mitM);
    const saved = hurt(b, damage);
    hp[a] = Math.min(maxHp[a], hp[a] + heal + sides[a].lifesteal * damage);
    // Thornshell on the target reflects a share of what it took, as physical damage.
    const thorns = amount(b, Effect.Thornshell) * damage * effectDamageMult(sides[b].effects) * (1 - off[b].mitP);
    const savedA = thorns > 0 && hurt(a, thorns);
    events.push({ t, by: a, kind: isCrit ? 'crit' : 'hit', damage, hp: [...hp], ...((saved || savedA) && { secondWind: true }) });
    if (hp[b] <= 0) return done(t, a, 'ko');
    if (hp[a] <= 0) return done(t, b, 'ko');
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
