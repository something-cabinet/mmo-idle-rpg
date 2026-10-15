// Equipping rules and auto-equip (equipment.md). Pure: shared by server and client.

import { SLOTS, base } from './data/bases';
import { combatStats, matchup, tempered, type CombatStats, type GearItem, type GearWeapon } from './combat';
import type { DamageType } from './data/bases';
import { MAX_TIER, STATS, Stat, affixRef, curve, fromStored, type StatId } from './data/stats';
import type { EnemyDef } from './data/zones';

/** An owned item: what equipping and scoring need from an `item` row. */
export interface OwnedItem extends GearItem {
  id: bigint;
  baseId: number;
  weapon?: GearWeapon & { twoHanded: boolean };
}

/**
 * Auto-equip profiles, in menu order (equipment.md). Damage and Survival are the physical
 * ones (their stored name in `loadout.profile`); DamageAll and SurvivalAll count both
 * damage types and are only picked client-side (passed to the autoEquip reducer).
 */
export const PROFILES = [
  'DamageAll', 'Damage', 'DamageMagic', 'Healing', 'SurvivalAll', 'Survival', 'SurvivalMagic',
  'Custom1', 'Custom2', 'Custom3',
] as const;
export type Profile = (typeof PROFILES)[number];
export const isProfile = (s: string): s is Profile => (PROFILES as readonly string[]).includes(s);
export const PROFILE_LABEL: Record<Profile, string> = {
  DamageAll: 'Damage',
  SurvivalAll: 'Survival',
  Damage: 'Damage (phys)',
  DamageMagic: 'Damage (magic)',
  Healing: 'Healing',
  Survival: 'Survival (phys)',
  SurvivalMagic: 'Survival (magic)',
  Custom1: 'Custom 1',
  Custom2: 'Custom 2',
  Custom3: 'Custom 3',
};
/** Profiles the player sets up in Settings: a weight per `CUSTOM_OUTCOMES` and `CUSTOM_GEAR_STATS` value. */
export const CUSTOM_PROFILES = ['Custom1', 'Custom2', 'Custom3'] as const satisfies readonly Profile[];
export type CustomProfile = (typeof CUSTOM_PROFILES)[number];
export const isCustomProfile = (p: Profile): p is CustomProfile => (CUSTOM_PROFILES as readonly Profile[]).includes(p);
/** A stored profile tag as a profile: the retired Loot profile auto-equips as Damage. */
export const asProfile = (tag: Profile | 'Loot'): Profile => (tag === 'Loot' ? 'Damage' : tag);

const MAIN = SLOTS.indexOf('MainHand');
const OFF = SLOTS.indexOf('OffHand');

export const fitsSlot = (baseId: number, slot: number) => base(baseId).slots.includes(SLOTS[slot]);
const twoHanded = (it: OwnedItem | undefined) => !!it?.weapon?.twoHanded;

/**
 * `slots` with `item` put into `slot`, or an error message. The item leaves any other
 * slot of the loadout (so one ring can't fill both ring slots); a two-handed main
 * hand empties the off-hand, and an off-hand can't go next to one.
 */
export function placeItem(
  slots: readonly bigint[],
  slot: number,
  item: OwnedItem,
  lookup: (id: bigint) => OwnedItem | undefined
): bigint[] | string {
  if (!fitsSlot(item.baseId, slot)) return "That item doesn't fit this slot";
  const next = slots.map(id => (id === item.id ? 0n : id));
  if (slot === OFF && twoHanded(lookup(next[MAIN]))) return 'Unequip the two-handed weapon first';
  next[slot] = item.id;
  if (slot === MAIN && twoHanded(item)) next[OFF] = 0n;
  return next;
}

// ---------------------------------------------------------------- reference dummy

/**
 * The fixed opponent auto-equip scores against (equipment.md): the character's level,
 * Balanced defenses (2.5 × level armor and resistance = 33% mitigation), and the
 * average enemy's DPS for that level (zones.md), half physical and half magic.
 */
export function referenceDummy(level: number): EnemyDef {
  return {
    id: 0,
    name: 'Reference dummy',
    level,
    damageType: 'Physical',
    defense: 'Balanced',
    speed: 1,
    hp: 1,
    dps: 16 * 1.42 ** (level / 10 - 1),
    armor: 2.5 * level,
    resistance: 2.5 * level,
    xp: 0,
    gold: 0,
    drops: [],
    materials: [],
  };
}

export interface LoadoutScore {
  /** DPS against the dummy (its two halves averaged). */
  dps: number;
  /** DPS from physical / magic damage only. */
  physicalDps: number;
  magicDps: number;
  /** Your heals per second (solo, they land on yourself). */
  hps: number;
  /** Seconds the dummy needs to kill you; Infinity if you out-sustain it. */
  timeToDie: number;
  /** … if all its damage were physical / magic. */
  timeToDiePhysical: number;
  timeToDieMagic: number;
  /** Bonus fractions (0.2 = +20%). */
  itemFind: number;
  goldFind: number;
  xpGain: number;
  /** `gearStatRolls`, for the custom profiles. */
  gearStats: number[];
}

/** Combat outcomes a custom profile weighs, in gauge order (their weights come first). */
export const CUSTOM_OUTCOMES = [
  { key: 'dps', label: 'Damage' },
  { key: 'physicalDps', label: 'Damage (phys)' },
  { key: 'magicDps', label: 'Damage (magic)' },
  { key: 'hps', label: 'Healing' },
  { key: 'timeToDie', label: 'Survival' },
  { key: 'timeToDiePhysical', label: 'Survival (phys)' },
  { key: 'timeToDieMagic', label: 'Survival (magic)' },
  { key: 'itemFind', label: 'Item find' },
  { key: 'goldFind', label: 'Gold find' },
  { key: 'xpGain', label: 'XP gain' },
] as const satisfies readonly { key: keyof LoadoutScore; label: string }[];

export type GearStatGroup = 'Weapon' | 'Offense' | 'Defense' | 'Primary' | 'Utility';
/**
 * Gear stats a custom profile weighs, in gauge order (their weights follow the outcomes').
 * `stat` = summed from implicits, affixes and legendary stats; without one, a value of the
 * main-hand weapon's base (which no stat sees): its damage or heal per second, or its crit.
 */
export const CUSTOM_GEAR_STATS: readonly { key: string; label: string; group: GearStatGroup; stat?: StatId }[] = [
  { key: 'weaponDamage', label: 'Weapon damage / sec', group: 'Weapon' },
  { key: 'weaponHeal', label: 'Weapon heal / sec', group: 'Weapon' },
  { key: 'weaponCrit', label: 'Weapon crit chance', group: 'Weapon' },
  ...(
    [
      ['Offense', [Stat.PhysDamage, Stat.PhysDamagePct, Stat.MagicDamage, Stat.MagicDamagePct, Stat.AttackSpeedPct, Stat.BaseCritChance,
        Stat.CritChancePct, Stat.CritDamage, Stat.ArmorPenPct, Stat.MagicPenPct]],
      ['Defense', [Stat.MaxHp, Stat.MaxHpPct, Stat.Armor, Stat.ArmorPct, Stat.Resistance, Stat.ResistancePct, Stat.EvasionRating,
        Stat.EvasionRatingPct, Stat.HpRegen, Stat.LifestealPct]],
      ['Primary', [Stat.Might, Stat.Finesse, Stat.Mind, Stat.Vitality]],
      ['Utility', [Stat.Heal, Stat.HealPct, Stat.ThreatPct, Stat.ItemFindPct, Stat.GoldFindPct, Stat.XpGainPct]],
    ] as const
  ).flatMap(([group, ids]) =>
    ids.map(id => ({ key: `stat${id}`, label: STATS[id].name + (STATS[id].percent ? ' %' : ''), group, stat: id }))
  ),
];

export const MAX_CUSTOM_WEIGHT = 10;
/** Gear stats can also count against: down to −MAX. */
export const MIN_GEAR_STAT_WEIGHT = -MAX_CUSTOM_WEIGHT;
export const CUSTOM_WEIGHT_COUNT = CUSTOM_OUTCOMES.length + CUSTOM_GEAR_STATS.length;
/** A fresh custom profile: Damage and Survival weighed equally, no gear stats. */
export const DEFAULT_CUSTOM_WEIGHTS: readonly number[] = [
  ...CUSTOM_OUTCOMES.map(c => (c.key === 'dps' || c.key === 'timeToDie' ? 5 : 0)),
  ...CUSTOM_GEAR_STATS.map(() => 0),
];

/** Whether `w` is a usable set of custom weights: one per value, in range, not all zero. */
export const validCustomWeights = (w: readonly number[]) =>
  w.length === CUSTOM_WEIGHT_COUNT &&
  w.every((x, i) => Number.isFinite(x) && x >= (i < CUSTOM_OUTCOMES.length ? 0 : MIN_GEAR_STAT_WEIGHT) && x <= MAX_CUSTOM_WEIGHT) &&
  w.some(x => x !== 0);

/** Time to die counts as at most an hour: past that you're as good as immortal. */
const TTD_CAP = 3600;
/** Scales gear-stat terms so one top roll at weight w is worth about +10% of an outcome at weight w. */
const GEAR_STAT_SCALE = 0.15;

/** The tier whose items a character of `level` wears (zones: tier T ≈ level 10 × T), unrounded. */
const gearTier = (level: number) => Math.min(MAX_TIER, Math.max(1, level / 10));

/**
 * Each `CUSTOM_GEAR_STATS` value of `gear` in top rolls at the character's tier (a stat's
 * best affix roll; a T-tier Sword for the weapon values), so every stat has the same unit.
 */
export function gearStatRolls(level: number, gear: readonly (GearItem | undefined)[]): number[] {
  const sum = new Map<number, number>();
  const add = (g: { stat: number; value: bigint }) => sum.set(g.stat, (sum.get(g.stat) ?? 0) + fromStored(g.value));
  gear = gear.map(it => it && tempered(it));
  for (const it of gear) {
    if (!it) continue;
    it.implicits.forEach(add);
    it.affixes.forEach(add);
    if (it.legendary) add(it.legendary);
  }
  const tier = gearTier(level);
  const w = gear[MAIN]?.weapon;
  const speed = (w?.speedMilli ?? 0) / 1000;
  return CUSTOM_GEAR_STATS.map(({ key, stat }) => {
    if (stat !== undefined) return (sum.get(stat) ?? 0) / affixRef(stat, tier);
    if (!w) return 0;
    // The reference weapon: a Sword (10 hit, 1/s, 5% crit at T1) and a Scepter's 10 heal.
    if (key === 'weaponDamage') return (fromStored(w.hit) * speed) / (10 * curve('offense', tier));
    if (key === 'weaponHeal') return (fromStored(w.heal) * speed) / (10 * curve('heal', tier));
    return w.baseCritBp / 500;
  });
}

/** ln(1 + |x|) with x's sign: grows like a log both ways, and a negative total stays finite. */
const signedLog = (x: number) => Math.sign(x) * Math.log1p(Math.abs(x));

/**
 * A custom profile's score. Outcomes: Σ weight × ln(1 + value). Logs make the weights
 * scale-free: with equal weights, +10% DPS counts as much as +10% time to die (the find
 * and XP bonuses are fractions, so ln(1 + bonus) is the log of their multiplier). Gear
 * stats: Σ weight × 0.15 × signedLog(top rolls), so stacking one stat pays less and less.
 */
export function customScore(s: LoadoutScore, weights: readonly number[]): number {
  let total = 0;
  CUSTOM_OUTCOMES.forEach(({ key }, i) => {
    const w = weights[i] ?? 0;
    const v = key.startsWith('timeToDie') ? Math.min(s[key], TTD_CAP) : s[key];
    if (w > 0) total += w * Math.log1p(Math.max(0, v));
  });
  s.gearStats.forEach((rolls, i) => {
    const w = weights[CUSTOM_OUTCOMES.length + i] ?? 0;
    if (w !== 0) total += w * GEAR_STAT_SCALE * signedLog(rolls);
  });
  return total;
}

/** `s` with its attacks dealing only `type` damage (a magic-only build keeps its heals, for Zealot's Oath). */
function onlyDamage(s: CombatStats, type: DamageType): CombatStats {
  const sources = s.sources.map(src => ({
    ...src,
    hit: { Physical: type === 'Physical' ? src.hit.Physical : 0, Magic: type === 'Magic' ? src.hit.Magic : 0 },
    heal: type === 'Magic' ? src.heal : 0,
  }));
  return { ...s, sources };
}

export function scoreGear(level: number, gear: readonly (GearItem | undefined)[]): LoadoutScore {
  const s = combatStats(level, gear);
  const dummy = referenceDummy(level);
  const magicDummy = { ...dummy, damageType: 'Magic' as const };
  // Half the dummy's damage is physical, half magic: the average of the two fights
  // (everything in a matchup is linear in the incoming damage).
  const phys = matchup(s, dummy);
  const magic = matchup(s, magicDummy);
  const net = (phys.netIncoming + magic.netIncoming) / 2;
  const ttd = (n: number) => (n <= 0 ? Infinity : s.maxHp / n);
  const dpsOf = (only: CombatStats) => (matchup(only, dummy).dps + matchup(only, magicDummy).dps) / 2;
  return {
    dps: (phys.dps + magic.dps) / 2,
    physicalDps: dpsOf(onlyDamage(s, 'Physical')),
    magicDps: dpsOf(onlyDamage(s, 'Magic')),
    hps: phys.hps,
    timeToDie: ttd(net),
    timeToDiePhysical: phys.timeToDie,
    timeToDieMagic: magic.timeToDie,
    itemFind: s.itemFind,
    goldFind: s.goldFind,
    xpGain: s.xpGain,
    gearStats: gearStatRolls(level, gear),
  };
}

/** Values compared in order: the profile's goal, then tie-breakers. `weights` are for the custom profiles. */
export function ranking(p: Profile, s: LoadoutScore, weights: readonly number[] = DEFAULT_CUSTOM_WEIGHTS): number[] {
  switch (p) {
    case 'Custom1':
    case 'Custom2':
    case 'Custom3':
      return [customScore(s, weights)];
    case 'DamageAll':
      return [s.dps, s.timeToDie];
    case 'SurvivalAll':
      return [s.timeToDie, s.dps];
    case 'Damage':
      return [s.physicalDps, s.timeToDie];
    case 'DamageMagic':
      return [s.magicDps, s.timeToDie];
    case 'Healing':
      return [s.hps, s.timeToDie, s.dps];
    case 'Survival':
      return [s.timeToDiePhysical, s.dps];
    case 'SurvivalMagic':
      return [s.timeToDieMagic, s.dps];
  }
}

/** Values within this fraction of each other tie, so the next value decides. */
const NEAR_TIE = 0.01;

/**
 * Whether `a` ranks above `b`. With `nearTie`, a gap under 1% in a value is a tie and
 * falls through to the next one, so a sliver of DPS can't outweigh a big survival gain.
 * The last value decides on any real difference.
 */
function better(a: number[], b: number[], nearTie: boolean): boolean {
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    const tol = (nearTie && i < a.length - 1 ? NEAR_TIE : 1e-9) * Math.max(Math.abs(a[i]), Math.abs(b[i]));
    if (Number.isFinite(tol) && Math.abs(a[i] - b[i]) <= tol) continue;
    return a[i] > b[i];
  }
  return false;
}

// ---------------------------------------------------------------- auto-equip

/** Whether slot `slot` is locked in a loadout's `lockedSlots` bitmask. */
export const slotLocked = (lockedSlots: number, slot: number) => ((lockedSlots >> slot) & 1) === 1;

/**
 * Best slots for `profile` from `items`, starting from `slots` (equipment.md): slot by
 * slot, try every item that fits (or empty) and keep the best, until a pass changes
 * nothing. Hands are tried as whole options: a two-hander alone, or a one-hander
 * with each off-hand. Never looks at the target enemy. Slots locked in `lockedSlots`
 * (bit i = slot i) keep what they hold, and their items aren't used elsewhere.
 *
 * Two searches: a strict one finds the best goal value, then a near-tie one trades
 * slivers of the goal for the tie-breakers, never ending more than 1% below that best
 * (so small trades can't add up).
 */
export function autoEquip(
  level: number,
  items: readonly OwnedItem[],
  slots: readonly bigint[],
  profile: Profile,
  lockedSlots = 0,
  weights: readonly number[] = DEFAULT_CUSTOM_WEIGHTS
): bigint[] {
  const byId = new Map(items.map(i => [i.id, i]));
  const gearOf = (ids: readonly bigint[]) => ids.map(id => byId.get(id));
  const rank = (ids: readonly bigint[]) => ranking(profile, scoreGear(level, gearOf(ids)), weights);
  const locked = (slot: number) => slotLocked(lockedSlots, slot);
  const start = slots.map(id => (byId.has(id) ? id : 0n));
  const held = new Set(start.filter((id, slot) => id !== 0n && locked(slot)));
  const fitting = (slot: number) => items.filter(i => !held.has(i.id) && fitsSlot(i.baseId, slot));
  const mains = locked(MAIN) ? [byId.get(start[MAIN])] : [undefined, ...fitting(MAIN)];
  const offHands = locked(OFF) ? [byId.get(start[OFF])] : [undefined, ...fitting(OFF)];

  const search = (start: bigint[], nearTie: boolean, floor: number): bigint[] => {
    let best = start;
    let bestRank = rank(best);
    const consider = (ids: bigint[]) => {
      const r = rank(ids);
      if (r[0] >= floor && better(r, bestRank, nearTie)) {
        best = ids;
        bestRank = r;
      }
    };
    for (let pass = 0; pass < 4; pass++) {
      const before = best.join();
      // Hands as whole options.
      for (const main of mains) {
        for (const off of offHands) {
          if (off && twoHanded(main)) continue;
          const ids = best.map(id => (id === main?.id || id === off?.id ? 0n : id));
          ids[MAIN] = main?.id ?? 0n;
          ids[OFF] = off?.id ?? 0n;
          consider(ids);
        }
      }
      // Every other slot on its own.
      for (let slot = 0; slot < SLOTS.length; slot++) {
        if (slot === MAIN || slot === OFF || locked(slot)) continue;
        for (const it of [undefined, ...fitting(slot)]) {
          const ids = best.map(id => (id === it?.id ? 0n : id));
          ids[slot] = it?.id ?? 0n;
          consider(ids);
        }
      }
      if (best.join() === before) break;
    }
    return best;
  };

  const strict = search(start, false, -Infinity);
  const goal = rank(strict)[0];
  return search(strict, true, Number.isFinite(goal) ? goal * (1 - NEAR_TIE) : goal);
}
