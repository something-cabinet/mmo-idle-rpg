// Combat formulas (docs/design/combat.md, attributes.md): stat aggregation and the
// closed-form matchup against one enemy. Pure: no SpacetimeDB imports, so the client
// shows exactly what the server settles.
//
// Combat math runs in floats and display units (1 HP, 1 = 100%); items store
// hundredths, converted with `fromStored`.

import { SLOTS } from './data/bases';
import { Effect, effectAmount, type EffectCounts } from './data/legendary';
import { CAPS, Stat, fromStored } from './data/stats';
import { WALK_SECONDS, type EnemyDef } from './data/zones';
import type { DamageType } from './data/bases';

export const MAX_LEVEL = 100;
/** Offline progress cap before Seasoned, hours. */
export const BASE_OFFLINE_HOURS = 8;

// Item shape the formulas need. Both the server row type and the client bindings fit.
export interface GearStat {
  stat: number;
  value: bigint;
}
export interface GearWeapon {
  damageType: { tag: DamageType };
  hit: bigint;
  speedMilli: number;
  baseCritBp: number;
  heal: bigint;
}
export interface GearItem {
  implicits: readonly GearStat[];
  affixes: readonly GearStat[];
  legendary?: GearStat & { effect: number };
  weapon?: GearWeapon;
}
/** Equipped items in SLOTS order (a loadout's slots resolved to rows). */
export type Gear = readonly (GearItem | undefined)[];

const MAIN_HAND = SLOTS.indexOf('MainHand');

/** One attacking weapon (combat.md "attack sources"). */
export interface AttackSource {
  /** Damage per hit by type, after flat added damage and % scaling, before mitigation. */
  hit: Record<DamageType, number>;
  /** Heal per hit after scaling; 0 for weapons without a heal effect. */
  heal: number;
  attacksPerSec: number;
  /** Uncapped; rolls use at most 1. */
  critChance: number;
  /** Average damage multiplier from crits (Overcrit included). */
  critMult: number;
}

export interface CombatStats {
  level: number;
  sources: AttackSource[];
  /** Multiplier, base 1.5. */
  critDamage: number;
  armorPen: number;
  magicPen: number;
  maxHp: number;
  /** HP per second. */
  regen: number;
  armor: number;
  resistance: number;
  evasionRating: number;
  lifesteal: number;
  threat: number;
  itemFind: number;
  goldFind: number;
  xpGain: number;
  /** Seconds between fights. */
  walkTime: number;
  /** Offline progress cap, hours (Seasoned raises it). */
  offlineHours: number;
  /** Effect IDs worn → copies. Legendary effects stack (`effectAmount`); unique effects apply once. */
  effects: EffectCounts;
}

/**
 * Multiplier on all your damage from effects: Glass Cannon × 2, Voidtouched × 0.75
 * (it ignores mitigation in `matchup`). Also applies to Thornshell and Zealot's Oath damage.
 */
export function effectDamageMult(effects: EffectCounts): number {
  return (effects.has(Effect.GlassCannon) ? 2 : 1) * (effects.has(Effect.Voidtouched) ? 0.75 : 1);
}

/** Final combat stats of a character at `level` wearing `gear`. */
export function combatStats(level: number, gear: Gear): CombatStats {
  const sum = new Map<number, number>();
  const effects = new Map<number, number>();
  const add = (s: GearStat) => sum.set(s.stat, (sum.get(s.stat) ?? 0) + fromStored(s.value));
  for (const item of gear) {
    if (!item) continue;
    item.implicits.forEach(add);
    item.affixes.forEach(add);
    if (item.legendary) {
      add(item.legendary);
      effects.set(item.legendary.effect, (effects.get(item.legendary.effect) ?? 0) + 1);
    }
  }
  const has = (e: number) => effects.has(e);
  const amount = (e: number) => effectAmount(effects, e);
  const flat = (s: number) => sum.get(s) ?? 0;
  /** Percent stat as a fraction. */
  const pct = (s: number) => flat(s) / 100;

  // Primaries: `level` from level-ups (1 at level 1) plus gear; each point is a
  // percent bonus to a bundle of stats (attributes.md).
  const might = level + flat(Stat.Might);
  const finesse = level + flat(Stat.Finesse);
  const mind = level + flat(Stat.Mind);
  const vitality = level + flat(Stat.Vitality);

  const damagePct: Record<DamageType, number> = {
    Physical: pct(Stat.PhysDamagePct) + 0.005 * might,
    Magic: pct(Stat.MagicDamagePct) + 0.0045 * mind,
  };
  // Spellblade swaps the damage type and both damage-% groups apply.
  const spellblade = has(Effect.Spellblade);
  if (spellblade) damagePct.Physical = damagePct.Magic = damagePct.Physical + damagePct.Magic;
  const damageMult = effectDamageMult(effects);
  const addedFlat: Record<DamageType, number> = { Physical: flat(Stat.PhysDamage), Magic: flat(Stat.MagicDamage) };
  const attackSpeedPct = pct(Stat.AttackSpeedPct) + 0.001 * finesse;
  const critIncreased = pct(Stat.CritChancePct) + 0.004 * finesse;
  const critDamage = 1.5 + pct(Stat.CritDamage);
  const healPct = pct(Stat.HealPct) + 0.0045 * mind;

  // Only the main hand attacks today; off-hands add stats only.
  const sources: AttackSource[] = [];
  for (const { item, speedFactor } of [{ item: gear[MAIN_HAND], speedFactor: 1 }]) {
    const w = item?.weapon;
    if (!w) continue;
    const baseSpeed = w.speedMilli / 1000;
    const hit = { Physical: 0, Magic: 0 };
    for (const t of ['Physical', 'Magic'] as const) {
      const from = spellblade ? (t === 'Physical' ? 'Magic' : 'Physical') : t;
      const base = w.damageType.tag === from ? fromStored(w.hit) : 0;
      // Flat added damage (and heal, below) is a straight bonus per hit: fast weapons get more from it.
      hit[t] = (base + addedFlat[from]) * (1 + damagePct[t]) * damageMult;
    }
    const baseHeal = fromStored(w.heal);
    const heal = baseHeal > 0 ? (baseHeal + flat(Stat.Heal)) * (1 + healPct) : 0;
    const critChance = (w.baseCritBp / 10_000) * (1 + critIncreased);
    // Overcrit: each 1% of crit chance above 100% gives +2% crit damage per copy.
    const critDmg = critDamage + amount(Effect.Overcrit) * Math.max(0, critChance - 1);
    sources.push({
      hit,
      heal,
      attacksPerSec: Math.max(baseSpeed * (1 + attackSpeedPct), 0.25 * baseSpeed) * speedFactor,
      critChance,
      critMult: 1 + Math.min(1, critChance) * (critDmg - 1),
    });
  }

  // Ironclad and Runeguard convert from armor and resistance before either is added, so they don't loop.
  const armor = flat(Stat.Armor) * (1 + pct(Stat.ArmorPct));
  const resistance = flat(Stat.Resistance) * (1 + pct(Stat.ResistancePct));

  return {
    level,
    sources,
    critDamage,
    armorPen: Math.min(CAPS.penetration / 100, pct(Stat.ArmorPenPct)),
    magicPen: Math.min(CAPS.penetration / 100, pct(Stat.MagicPenPct)),
    maxHp:
      (100 + 10 * (level - 1) + flat(Stat.MaxHp)) *
      (1 + pct(Stat.MaxHpPct) + 0.002 * might + 0.0025 * vitality) *
      (has(Effect.GlassCannon) ? 0.5 : 1),
    regen: flat(Stat.HpRegen) * (1 + 0.01 * vitality),
    armor: armor + amount(Effect.Runeguard) * resistance,
    resistance: resistance + amount(Effect.Ironclad) * armor,
    evasionRating: flat(Stat.EvasionRating) * (1 + pct(Stat.EvasionRatingPct) + 0.0025 * finesse),
    lifesteal: Math.min(CAPS.lifesteal / 100, pct(Stat.LifestealPct)),
    threat: pct(Stat.ThreatPct) + 0.0025 * vitality,
    itemFind: pct(Stat.ItemFindPct),
    goldFind: pct(Stat.GoldFindPct),
    xpGain: pct(Stat.XpGainPct),
    walkTime: WALK_SECONDS * (1 - amount(Effect.SwiftHunter)),
    offlineHours: BASE_OFFLINE_HOURS + amount(Effect.Seasoned),
    effects,
  };
}

/** Damage reduction from armor or resistance `def` (after penetration) at `level`. */
export function mitigation(def: number, pen: number, level: number): number {
  const d = def * (1 - pen);
  return d <= 0 ? 0 : Math.min(0.85, d / (d + 5 * level));
}

/** Chance to avoid an attack from an enemy of `enemyLevel`. */
export function evasionChance(rating: number, enemyLevel: number, cap = CAPS.evasion / 100): number {
  return rating <= 0 ? 0 : Math.min(cap, rating / (rating + 10 * enemyLevel));
}

/**
 * Your mitigation and evasion against `type` damage from an enemy of `enemyLevel`.
 * Juggernaut (magic) and Spellward (physical) use the better of armor and resistance
 * but stop evasion; Phantom Step raises the evasion cap.
 */
export function defenseAgainst(s: CombatStats, type: DamageType, enemyLevel: number): { mitigation: number; evasion: number } {
  const juggernaut = s.effects.has(Effect.Juggernaut);
  const spellward = s.effects.has(Effect.Spellward);
  const best = Math.max(s.armor, s.resistance);
  const def = type === 'Physical' ? (spellward ? best : s.armor) : juggernaut ? best : s.resistance;
  const cap = CAPS.evasion / 100 + effectAmount(s.effects, Effect.PhantomStep);
  return {
    mitigation: mitigation(def, 0, s.level),
    evasion: juggernaut || spellward ? 0 : evasionChance(s.evasionRating, enemyLevel, cap),
  };
}

export interface Matchup {
  /** Enemy mitigation by damage type. */
  enemyMitigation: Record<DamageType, number>;
  playerMitigation: number;
  evasion: number;
  /** Your damage per second after the enemy's mitigation. */
  dps: number;
  /** Self-heal per second. */
  hps: number;
  /** Enemy damage per second after your mitigation and evasion. */
  incoming: number;
  /** Incoming minus regen, lifesteal and heals; ≤ 0 means you never die. */
  netIncoming: number;
  /** Seconds; Infinity if you deal no damage. */
  timeToKill: number;
  /** Seconds; Infinity if you out-sustain the enemy. */
  timeToDie: number;
  viable: boolean;
  /** Kills per second including the walk time; 0 if not viable. */
  killRate: number;
  xpPerKill: number;
  goldPerKill: number;
}

export function matchup(s: CombatStats, e: EnemyDef): Matchup {
  const has = (id: number) => s.effects.has(id);
  const amount = (id: number) => effectAmount(s.effects, id);
  // Rending and Spellbreaker ignore a share of what's left after penetration.
  const enemyMitigation = has(Effect.Voidtouched)
    ? { Physical: 0, Magic: 0 }
    : {
        Physical: mitigation(e.armor, s.armorPen, e.level) * (1 - amount(Effect.Rending)),
        Magic: mitigation(e.resistance, s.magicPen, e.level) * (1 - amount(Effect.Spellbreaker)),
      };
  let dps = 0;
  let hps = 0;
  for (const src of s.sources) {
    const perHit = src.hit.Physical * (1 - enemyMitigation.Physical) + src.hit.Magic * (1 - enemyMitigation.Magic);
    dps += perHit * src.attacksPerSec * src.critMult;
    hps += src.heal * src.attacksPerSec * src.critMult; // solo: heals land on yourself
  }

  const { mitigation: playerMitigation, evasion } = defenseAgainst(s, e.damageType, e.level);
  const incoming = e.dps * (1 - playerMitigation) * (1 - evasion);
  // Effect damage is your damage: Glass Cannon and Voidtouched apply to it too.
  const damageMult = effectDamageMult(s.effects);
  // Thornshell reflects a share of the damage taken as physical damage.
  dps += amount(Effect.Thornshell) * incoming * damageMult * (1 - enemyMitigation.Physical);
  // Zealot's Oath: heals also hit for a share of the heal (magic).
  dps += amount(Effect.ZealotsOath) * hps * damageMult * (1 - enemyMitigation.Magic);
  const netIncoming = incoming - s.regen - s.lifesteal * dps - hps;

  // Executioner: the last `t` of the enemy's HP takes double damage, so it goes in half the time.
  const timeToKill = dps > 0 ? (e.hp / dps) * (1 - amount(Effect.Executioner) / 2) : Infinity;
  // Second Wind: once per fight, a killing blow leaves you at a share of max HP.
  const timeToDie = netIncoming <= 0 ? Infinity : (s.maxHp * (1 + amount(Effect.SecondWind))) / netIncoming;
  const viable = timeToKill < timeToDie;
  return {
    enemyMitigation,
    playerMitigation,
    evasion,
    dps,
    hps,
    incoming,
    netIncoming,
    timeToKill,
    timeToDie,
    viable,
    killRate: viable ? 1 / (timeToKill + s.walkTime) : 0,
    // Midas Touch: no XP, gold × 2.5. Scholar's Focus: XP × 1.75, gold × 0.5. Both: both apply.
    xpPerKill: e.xp * (1 + s.xpGain) * (has(Effect.MidasTouch) ? 0 : has(Effect.ScholarsFocus) ? 1.75 : 1),
    goldPerKill:
      e.gold * (1 + s.goldFind) * (1 + amount(Effect.Prosperity)) * (has(Effect.MidasTouch) ? 2.5 : 1) * (has(Effect.ScholarsFocus) ? 0.5 : 1),
  };
}
