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
}

/** Each stat rolls in [UNIQUE_ROLL_MIN, UNIQUE_ROLL_MAX] × its value (uniques.md). */
export const UNIQUE_ROLL_MIN = 0.8;
export const UNIQUE_ROLL_MAX = 1.4;

export const UNIQUES: UniqueDef[] = [
  // T1
  { id: 1, name: "Grubnak's Cleaver", tier: 1, baseId: 7, effects: [Effect.GlassCannon],
    stats: [{ stat: Stat.PhysDamagePct }, { stat: Stat.CritDamage }, { stat: Stat.ArmorPenPct }] },
  { id: 2, name: 'Gilded Signet', tier: 1, baseId: 51, effects: [Effect.MidasTouch],
    stats: [{ stat: Stat.GoldFindPct }, { stat: Stat.ItemFindPct }, { stat: Stat.Finesse }] },
  { id: 3, name: "Tutor's Pendant", tier: 1, baseId: 56, effects: [Effect.ScholarsFocus],
    stats: [{ stat: Stat.XpGainPct }, { stat: Stat.Mind }, { stat: Stat.MaxHpPct }] },
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
];

export const UNIQUES_BY_ID: ReadonlyMap<number, UniqueDef> = new Map(UNIQUES.map(u => [u.id, u]));

/**
 * Drop weight of a unique in a tier-`zoneTier` zone: every unique of that tier and
 * below can drop, current-tier ones most (each tier lower halves the weight).
 */
export const uniqueWeight = (u: UniqueDef, zoneTier: number): number => (u.tier > zoneTier ? 0 : 0.5 ** (zoneTier - u.tier));
