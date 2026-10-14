// Stat IDs, growth curves and the affix reference table (docs/design/attributes.md).
// Pure data: shared by the server module and the client.
//
// PERMANENT IDS: once an item is saved, a stat ID is never reused, renumbered or
// redefined. New stats get new IDs.
//
// Units: every stored value is a signed integer in hundredths of the display unit
// (flat: 0.01 HP; percent: 0.01%, i.e. basis points). See `toStored`.

export const Stat = {
  PhysDamage: 1,
  PhysDamagePct: 2,
  MagicDamage: 3,
  MagicDamagePct: 4,
  AttackSpeedPct: 5,
  CritChancePct: 6, // increased crit chance (scales the weapon's base crit)
  CritDamage: 7, // percentage points added to the 150% base
  ArmorPenPct: 8,
  MagicPenPct: 9,
  MaxHp: 10,
  MaxHpPct: 11,
  Armor: 12,
  ArmorPct: 13,
  Resistance: 14,
  ResistancePct: 15,
  EvasionRating: 16,
  HpRegen: 17,
  LifestealPct: 18,
  Heal: 19,
  HealPct: 20,
  ThreatPct: 21,
  ItemFindPct: 22,
  GoldFindPct: 23,
  XpGainPct: 24,
  Might: 25,
  Finesse: 26,
  Mind: 27,
  Vitality: 28,
  EvasionRatingPct: 29,
  BaseCritChance: 30, // percentage points added to the weapon's base crit, before increased
} as const;
export type StatId = (typeof Stat)[keyof typeof Stat];

/** How a value grows with tier. */
export type Curve = 'offense' | 'life' | 'heal' | 'linear' | 'percent';

/** Multiplier of a tier-1 value at tier `t` (1..9). For 'percent', the T9 value is the reference. */
export function curve(c: Curve, t: number): number {
  switch (c) {
    case 'offense':
      // ×2.1 to T3, then ×1.6 like gear HP, so last tier's weapon isn't half the new one.
      return t <= 3 ? 2.1 ** (t - 1) : 2.1 ** 2 * 1.6 ** (t - 3);
    case 'life':
      return 1.6 ** (t - 1);
    case 'heal':
      return 1.33 ** (t - 1);
    case 'linear':
      return t;
    case 'percent':
      return (t + 3) / 12;
  }
}

export const MAX_TIER = 9;

export interface StatDef {
  id: StatId;
  name: string;
  /** Shown with a % sign. */
  percent: boolean;
  curve: Curve;
  /**
   * Affix reference: for flat curves the best roll at T1; for 'percent' the best roll
   * at T9 (P). `undefined` = can't roll as a regular affix.
   */
  ref?: number;
  /** Relative drop weight as an affix (default 100). */
  weight?: number;
  /** Item values keep two decimals; every other stat is a whole number on items. */
  decimals?: boolean;
  /** 'linear'/'percent' only: lowest roll of affix tier 1 (default 0), so even the worst roll counts. */
  floor?: number;
}

const s = (id: StatId, name: string, percent: boolean, c: Curve, ref?: number, weight?: number, decimals?: boolean, floor?: number): StatDef => ({
  id,
  name,
  percent,
  curve: c,
  ref,
  weight,
  decimals,
  floor,
});

export const STATS: Record<StatId, StatDef> = {
  1: s(1, 'Physical damage', false, 'offense', 2),
  2: s(2, 'Physical damage', true, 'percent', 30),
  3: s(3, 'Magic damage', false, 'offense', 2),
  4: s(4, 'Magic damage', true, 'percent', 30),
  5: s(5, 'Attack speed', true, 'percent', 10),
  6: s(6, 'Increased crit chance', true, 'percent', 40),
  7: s(7, 'Crit damage', true, 'percent', 30),
  8: s(8, 'Armor penetration', true, 'percent', 15),
  9: s(9, 'Magic penetration', true, 'percent', 15),
  10: s(10, 'Max HP', false, 'life', 20),
  11: s(11, 'Max HP', true, 'percent', 15),
  12: s(12, 'Armor', false, 'linear', 5),
  13: s(13, 'Armor', true, 'percent', 25),
  14: s(14, 'Resistance', false, 'linear', 5),
  15: s(15, 'Resistance', true, 'percent', 25),
  16: s(16, 'Evasion rating', false, 'linear', 5),
  17: s(17, 'HP regen', false, 'life', 0.5, undefined, true),
  18: s(18, 'Lifesteal', true, 'percent', 0.5, 25, true),
  19: s(19, 'Heal', false, 'heal', 2),
  20: s(20, 'Heal', true, 'percent', 30),
  21: s(21, 'Threat', true, 'percent', 30),
  22: s(22, 'Item find', true, 'percent', 15),
  23: s(23, 'Gold find', true, 'percent', 20),
  24: s(24, 'XP gain', true, 'percent', 10),
  25: s(25, 'Might', false, 'percent', 40),
  26: s(26, 'Finesse', false, 'percent', 40),
  27: s(27, 'Mind', false, 'percent', 40),
  28: s(28, 'Vitality', false, 'percent', 40),
  29: s(29, 'Evasion rating', true, 'percent', 25),
  30: s(30, 'Base crit chance', true, 'percent', 5, 25, true, 0.5),
};

/** Caps (display units). */
export const CAPS = {
  evasion: 60,
  penetration: 75,
  lifesteal: 3,
} as const;

/**
 * Rounds a value for an item: whole numbers, at least 1 away from zero, except for
 * the very small stats marked `decimals` (lifesteal, HP regen, base crit chance), which keep hundredths.
 */
export function roundStat(stat: StatId, v: number): number {
  if (STATS[stat].decimals) return Math.round(v * 100) / 100;
  return wholeValue(v);
}

/** Nearest whole number, at least 1 away from zero (0 stays 0). */
export function wholeValue(v: number): number {
  return v === 0 ? 0 : Math.sign(v) * Math.max(1, Math.round(Math.abs(v)));
}

/** Display value → stored integer (hundredths). */
export const toStored = (v: number): bigint => BigInt(Math.round(v * 100));
/** Stored integer → display value. */
export const fromStored = (v: bigint): number => Number(v) / 100;

/** Best possible regular-affix roll of `stat` on a tier-`tier` item, in display units. */
export function affixRef(stat: StatId, tier: number): number {
  const d = STATS[stat];
  if (d.ref === undefined) throw new Error(`Stat ${stat} can't roll as an affix`);
  return d.ref * curve(d.curve, tier);
}

/**
 * Value range of affix tier `k` (1..MAX_TIER), the same on every item tier (equipment.md).
 * Evenly growing stats ('linear', 'percent') split the T9 range (from `floor`, default 0)
 * into MAX_TIER equal slices; fast-growing ones ('offense', 'life', 'heal') follow their curve: tier k rolls
 * from the best roll at tier k−1 (0 for k = 1) to the best roll at tier k.
 */
export function affixRange(stat: StatId, k: number): [number, number] {
  const d = STATS[stat];
  if (d.curve === 'linear' || d.curve === 'percent') {
    const top = affixRef(stat, MAX_TIER);
    const lo = d.floor ?? 0;
    return [lo + ((top - lo) * (k - 1)) / MAX_TIER, lo + ((top - lo) * k) / MAX_TIER];
  }
  return [k === 1 ? 0 : affixRef(stat, k - 1), affixRef(stat, k)];
}
