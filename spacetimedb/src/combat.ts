// Combat formulas (docs/design/combat.md, attributes.md): stat aggregation and the
// closed-form matchup against one enemy. Pure: no SpacetimeDB imports, so the client
// shows exactly what the server settles.
//
// Combat math runs in floats and display units (1 HP, 1 = 100%); items store
// hundredths, converted with `fromStored`.

import { SLOTS } from './data/bases';
import { CAPS, Stat, fromStored } from './data/stats';
import { RESPAWN_SECONDS, type EnemyDef } from './data/zones';
import type { DamageType } from './data/bases';

export const MAX_LEVEL = 100;

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
  legendary?: GearStat;
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
}

/** Final combat stats of a character at `level` wearing `gear`. */
export function combatStats(level: number, gear: Gear): CombatStats {
  const sum = new Map<number, number>();
  const add = (s: GearStat) => sum.set(s.stat, (sum.get(s.stat) ?? 0) + fromStored(s.value));
  for (const item of gear) {
    if (!item) continue;
    item.implicits.forEach(add);
    item.affixes.forEach(add);
    if (item.legendary) add(item.legendary);
  }
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
      const base = w.damageType.tag === t ? fromStored(w.hit) : 0;
      // Flat added damage is defined per hit at 1.0/s, so it is worth the same DPS on any weapon.
      hit[t] = (base + addedFlat[t] / baseSpeed) * (1 + damagePct[t]);
    }
    const baseHeal = fromStored(w.heal);
    const heal = baseHeal > 0 ? (baseHeal + flat(Stat.Heal) / baseSpeed) * (1 + healPct) : 0;
    const critChance = (w.baseCritBp / 10_000) * (1 + critIncreased);
    sources.push({
      hit,
      heal,
      attacksPerSec: Math.max(baseSpeed * (1 + attackSpeedPct), 0.25 * baseSpeed) * speedFactor,
      critChance,
      critMult: 1 + Math.min(1, critChance) * (critDamage - 1),
    });
  }

  return {
    level,
    sources,
    critDamage,
    armorPen: Math.min(CAPS.penetration / 100, pct(Stat.ArmorPenPct)),
    magicPen: Math.min(CAPS.penetration / 100, pct(Stat.MagicPenPct)),
    maxHp:
      (100 + 10 * (level - 1) + flat(Stat.MaxHp)) *
      (1 + pct(Stat.MaxHpPct) + 0.002 * might + 0.0025 * vitality),
    regen: flat(Stat.HpRegen) * (1 + 0.01 * vitality),
    armor: flat(Stat.Armor) * (1 + pct(Stat.ArmorPct)),
    resistance: flat(Stat.Resistance) * (1 + pct(Stat.ResistancePct)),
    evasionRating: flat(Stat.EvasionRating) * (1 + pct(Stat.EvasionRatingPct) + 0.0025 * finesse),
    lifesteal: Math.min(CAPS.lifesteal / 100, pct(Stat.LifestealPct)),
    threat: pct(Stat.ThreatPct) + 0.0025 * vitality,
    itemFind: pct(Stat.ItemFindPct),
    goldFind: pct(Stat.GoldFindPct),
    xpGain: pct(Stat.XpGainPct),
  };
}

/** Damage reduction from armor or resistance `def` (after penetration) at `level`. */
export function mitigation(def: number, pen: number, level: number): number {
  const d = def * (1 - pen);
  return d <= 0 ? 0 : Math.min(0.85, d / (d + 5 * level));
}

/** Chance to avoid an attack from an enemy of `enemyLevel`. */
export function evasionChance(rating: number, enemyLevel: number): number {
  return rating <= 0 ? 0 : Math.min(CAPS.evasion / 100, rating / (rating + 10 * enemyLevel));
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
  /** Kills per second including respawn; 0 if not viable. */
  killRate: number;
  xpPerKill: number;
  goldPerKill: number;
}

export function matchup(s: CombatStats, e: EnemyDef): Matchup {
  const enemyMitigation = {
    Physical: mitigation(e.armor, s.armorPen, e.level),
    Magic: mitigation(e.resistance, s.magicPen, e.level),
  };
  let dps = 0;
  let hps = 0;
  for (const src of s.sources) {
    const perHit = src.hit.Physical * (1 - enemyMitigation.Physical) + src.hit.Magic * (1 - enemyMitigation.Magic);
    dps += perHit * src.attacksPerSec * src.critMult;
    hps += src.heal * src.attacksPerSec * src.critMult; // solo: heals land on yourself
  }

  const playerMitigation = mitigation(e.damageType === 'Physical' ? s.armor : s.resistance, 0, s.level);
  const evasion = evasionChance(s.evasionRating, e.level);
  const incoming = e.dps * (1 - playerMitigation) * (1 - evasion);
  const netIncoming = incoming - s.regen - s.lifesteal * dps - hps;

  const timeToKill = dps > 0 ? e.hp / dps : Infinity;
  const timeToDie = netIncoming <= 0 ? Infinity : s.maxHp / netIncoming;
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
    killRate: viable ? 1 / (timeToKill + RESPAWN_SECONDS) : 0,
    xpPerKill: e.xp * (1 + s.xpGain),
    goldPerKill: e.gold * (1 + s.goldFind),
  };
}
