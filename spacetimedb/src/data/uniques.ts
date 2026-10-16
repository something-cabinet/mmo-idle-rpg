// Handcrafted uniques (docs/design/uniques.md). Pure data, shared.
//
// A unique is a normal base at a fixed tier plus hand-picked stats and effects. Its
// stats roll once at drop time in a small range and are stored on the item like any
// other stat, so rebalancing here only changes new drops.
//
// PERMANENT IDS: unique IDs are stored on items (`uniqueId`) for the name.

import { Effect } from './legendary';
import { Stat, type StatId } from './stats';

export interface UniqueStat {
  stat: StatId;
  /** × the best regular affix roll at the unique's tier (`affixRef`); default 1. */
  x?: number;
  /** Roll range × value, in place of [UNIQUE_ROLL_MIN, UNIQUE_ROLL_MAX] (Lunatic's Wager rolls [−3, 3]). */
  roll?: [number, number];
}


export interface UniqueDef {
  id: number;
  name: string;
  /** The one tier it exists at. */
  tier: number;
  baseId: number;
  /** Effect IDs (data/legendary.ts): unique-only or legendary. */
  effects: number[];
  stats: UniqueStat[];
  /** Drops only from this enemy (a secret area's), which then drops no other unique. */
  enemyId?: number;
  /** Drops only from this raid's boss (data/raids.ts), never from zone enemies. */
  raidId?: number;
}

/** Each stat rolls in [UNIQUE_ROLL_MIN, UNIQUE_ROLL_MAX] × its value (uniques.md). */
export const UNIQUE_ROLL_MIN = 0.8;
export const UNIQUE_ROLL_MAX = 1.4;
/** The range a unique stat rolls in, × its value. */
export const uniqueRoll = (s: UniqueStat): [number, number] => s.roll ?? [UNIQUE_ROLL_MIN, UNIQUE_ROLL_MAX];
/** Lunatic's Wager: anywhere from a deep curse to a blessing past any other unique's. */
const WAGER: [number, number] = [-3, 3];

export const UNIQUES: UniqueDef[] = [
  // T1
  { id: 1, name: "Grubnak's Cleaver", tier: 1, baseId: 7, effects: [Effect.GlassCannon],
    stats: [{ stat: Stat.PhysDamagePct }, { stat: Stat.CritDamage }, { stat: Stat.ArmorPenPct }] },
  { id: 2, name: 'Gilded Signet', tier: 1, baseId: 51, effects: [Effect.MidasTouch],
    stats: [{ stat: Stat.GoldFindPct }, { stat: Stat.ItemFindPct }, { stat: Stat.Finesse }] },
  { id: 3, name: "Tutor's Pendant", tier: 1, baseId: 56, effects: [Effect.ScholarsFocus],
    stats: [{ stat: Stat.XpGainPct }, { stat: Stat.Mind }, { stat: Stat.MaxHpPct }] },
  { id: 11, name: 'The Drowned Hymnal', tier: 1, baseId: 21, effects: [Effect.ZealotsOath, Effect.Spellward], enemyId: 107,
    stats: [{ stat: Stat.HealPct }, { stat: Stat.MagicDamagePct }, { stat: Stat.ResistancePct }] },
  // T2
  { id: 4, name: 'Hexblade', tier: 2, baseId: 1, effects: [Effect.Spellblade],
    stats: [{ stat: Stat.PhysDamagePct }, { stat: Stat.MagicDamagePct }, { stat: Stat.AttackSpeedPct }] },
  { id: 5, name: 'Bulwark of the Hollow', tier: 2, baseId: 39, effects: [Effect.Juggernaut, Effect.Thornshell],
    stats: [{ stat: Stat.ArmorPct }, { stat: Stat.MaxHp }, { stat: Stat.HpRegen }] },
  { id: 6, name: 'Veil of Whispers', tier: 2, baseId: 31, effects: [Effect.Spellward, Effect.SecondWind],
    stats: [{ stat: Stat.ResistancePct }, { stat: Stat.Mind }, { stat: Stat.MaxHpPct }] },
  { id: 7, name: 'Voidfang', tier: 2, baseId: 2, effects: [Effect.Voidtouched, Effect.Executioner],
    stats: [{ stat: Stat.CritChancePct }, { stat: Stat.CritDamage }, { stat: Stat.AttackSpeedPct }] },
  // T3
  { id: 8, name: 'Rimewind Longbow', tier: 3, baseId: 8, effects: [Effect.Frostbite],
    stats: [{ stat: Stat.CritChancePct }, { stat: Stat.EvasionRatingPct }, { stat: Stat.AttackSpeedPct }] },
  { id: 9, name: 'Glacier Heart', tier: 3, baseId: 57, effects: [Effect.FrozenBlood],
    stats: [{ stat: Stat.MaxHpPct }, { stat: Stat.Vitality }, { stat: Stat.ResistancePct }] },
  { id: 10, name: 'Avalanche Staff', tier: 3, baseId: 9, effects: [Effect.Ambush],
    stats: [{ stat: Stat.MagicDamagePct }, { stat: Stat.CritDamage }, { stat: Stat.MaxHp }] },
  // Raid: Wyrm Hollow (T3). One per raid role: tank, healer, damage.
  { id: 12, name: 'Wyrmscale Aegis', tier: 3, baseId: 20, effects: [Effect.Ironclad, Effect.SecondWind], raidId: 1,
    stats: [{ stat: Stat.ThreatPct, x: 1.5 }, { stat: Stat.ArmorPct }, { stat: Stat.MaxHpPct }] },
  { id: 13, name: "Hoardkeeper's Censer", tier: 3, baseId: 10, effects: [Effect.ZealotsOath, Effect.Runeguard], raidId: 1,
    stats: [{ stat: Stat.HealPct, x: 1.25 }, { stat: Stat.Mind }, { stat: Stat.ResistancePct }] },
  { id: 14, name: "Skaldrith's Fang", tier: 3, baseId: 2, effects: [Effect.Executioner, Effect.Rending], raidId: 1,
    stats: [{ stat: Stat.CritDamage }, { stat: Stat.PhysDamagePct }, { stat: Stat.AttackSpeedPct }] },
  // Raid: The Drowned Moon (T4). One per raid role, each built for both of Umbriel's phases.
  { id: 20, name: 'Eclipse Aegis', tier: 4, baseId: 22, effects: [Effect.Ironclad, Effect.Runeguard], raidId: 2,
    stats: [{ stat: Stat.ThreatPct, x: 1.5 }, { stat: Stat.ArmorPct }, { stat: Stat.ResistancePct }] },
  { id: 21, name: 'Lantern of the Drowned Moon', tier: 4, baseId: 10, effects: [Effect.SecondSkin, Effect.LunarInsight], raidId: 2,
    stats: [{ stat: Stat.HealPct, x: 1.25 }, { stat: Stat.Mind }, { stat: Stat.MaxHpPct }] },
  { id: 22, name: "Umbriel's Edge", tier: 4, baseId: 1007, effects: [Effect.Rending, Effect.Spellbreaker], raidId: 2,
    stats: [{ stat: Stat.ArmorPenPct }, { stat: Stat.MagicPenPct }, { stat: Stat.CritDamage }] },
  // T4
  { id: 15, name: 'Moonlight Greatsword', tier: 4, baseId: 7, effects: [Effect.Moonlight], enemyId: 407,
    stats: [{ stat: Stat.MagicDamagePct }, { stat: Stat.Mind }, { stat: Stat.CritDamage }] },
  { id: 16, name: 'Waxing Crescent', tier: 4, baseId: 6, effects: [Effect.WaxingMoon],
    stats: [{ stat: Stat.PhysDamagePct }, { stat: Stat.AttackSpeedPct }, { stat: Stat.CritDamage }] },
  { id: 17, name: 'Moonshadow Jerkin', tier: 4, baseId: 35, effects: [Effect.Moonshadow],
    stats: [{ stat: Stat.EvasionRatingPct }, { stat: Stat.Finesse }, { stat: Stat.MaxHpPct }] },
  { id: 18, name: 'Tear of the Moon', tier: 4, baseId: 56, effects: [Effect.LunarInsight],
    stats: [{ stat: Stat.Mind }, { stat: Stat.MagicDamagePct }, { stat: Stat.ResistancePct }] },
  // No effect: five stats that each roll anywhere from a deep curse to a huge blessing (after Ventor's Gamble).
  { id: 19, name: "Lunatic's Wager", tier: 4, baseId: 52, effects: [],
    stats: [{ stat: Stat.MaxHpPct, roll: WAGER }, { stat: Stat.AttackSpeedPct, roll: WAGER }, { stat: Stat.ItemFindPct, roll: WAGER },
      { stat: Stat.XpGainPct, roll: WAGER }, { stat: Stat.GoldFindPct, roll: WAGER }] },
];

export const UNIQUES_BY_ID: ReadonlyMap<number, UniqueDef> = new Map(UNIQUES.map(u => [u.id, u]));

/**
 * Drop weight of a unique in a tier-`zoneTier` zone: every unique of that tier and
 * below can drop, current-tier ones most (each tier lower halves the weight).
 * Enemy- and raid-bound uniques never drop this way (see `uniquePool`).
 */
export const uniqueWeight = (u: UniqueDef, zoneTier: number): number =>
  u.enemyId !== undefined || u.raidId !== undefined || u.tier > zoneTier ? 0 : 0.5 ** (zoneTier - u.tier);

/** The uniques only raid `raidId`'s boss drops. */
export const raidUniques = (raidId: number): UniqueDef[] => UNIQUES.filter(u => u.raidId === raidId);

/**
 * The uniques `enemyId` can drop in a tier-`zoneTier` zone, with weights: its own if
 * any are bound to it (equal weight), else the global pool (`uniqueWeight`).
 */
export function uniquePool(zoneTier: number, enemyId?: number): { u: UniqueDef; weight: number }[] {
  const own = UNIQUES.filter(u => enemyId !== undefined && u.enemyId === enemyId);
  if (own.length) return own.map(u => ({ u, weight: 1 }));
  return UNIQUES.map(u => ({ u, weight: uniqueWeight(u, zoneTier) })).filter(x => x.weight > 0);
}
