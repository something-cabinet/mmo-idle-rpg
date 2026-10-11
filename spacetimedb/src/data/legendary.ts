// Legendary affix effects (docs/design/legendary.md). Pure data, shared.
//
// PERMANENT IDS: effect IDs are stored on items; the behaviour behind an ID is
// code, so changing it deliberately changes every item that has it.

import { Stat, type StatId } from './stats';
import type { BaseKind } from './bases';

/** Effect IDs, for the formulas that check them. */
export const Effect = {
  Overcrit: 1,
  Spellblade: 2,
  ZealotsOath: 3,
  Juggernaut: 4,
  PhantomStep: 5,
  Thornshell: 6,
  SwiftHunter: 7,
  MidasTouch: 8,
  FortunesFavor: 9,
  Voidtouched: 10,
  GlassCannon: 11,
  Spellward: 12,
  ScholarsFocus: 13,
} as const;

export type LegendaryGroup = 'Offense' | 'Defense' | 'Utility';

export interface LegendaryDef {
  id: number;
  name: string;
  group: LegendaryGroup;
  /** The small stat bonus that comes with the effect. */
  bonusStat: StatId;
  text: string;
}

export const LEGENDARIES: LegendaryDef[] = [
  { id: 1, name: 'Overcrit', group: 'Offense', bonusStat: Stat.CritChancePct, text: 'Crit chance above 100% gives +2% crit damage per 1% of excess.' },
  { id: 2, name: 'Spellblade', group: 'Offense', bonusStat: Stat.MagicDamagePct, text: 'Your damage swaps type: physical becomes magic, magic becomes physical.' },
  { id: 3, name: "Zealot's Oath", group: 'Offense', bonusStat: Stat.HealPct, text: 'Heals also damage the enemy for 50% of the heal; your damage heals you for 5%.' },
  { id: 4, name: 'Juggernaut', group: 'Defense', bonusStat: Stat.ArmorPct, text: "You can't evade, but armor also reduces magic damage." },
  { id: 5, name: 'Phantom Step', group: 'Defense', bonusStat: Stat.EvasionRatingPct, text: 'Evasion cap rises from 60% to 75%.' },
  { id: 6, name: 'Thornshell', group: 'Defense', bonusStat: Stat.MaxHpPct, text: 'Reflects 40% of the damage you take back at the enemy.' },
  { id: 7, name: 'Swift Hunter', group: 'Utility', bonusStat: Stat.AttackSpeedPct, text: 'Walk time between fights is halved.' },
  { id: 8, name: 'Midas Touch', group: 'Utility', bonusStat: Stat.GoldFindPct, text: 'Kills give no XP, but gold × 2.5.' },
  { id: 9, name: "Fortune's Favor", group: 'Utility', bonusStat: Stat.ItemFindPct, text: 'Each kept drop has a 15% chance to be upgraded one rarity.' },
  { id: 10, name: 'Voidtouched', group: 'Offense', bonusStat: Stat.PhysDamagePct, text: "Your damage ignores the enemy's armor and resistance, but deals 25% less." },
  { id: 11, name: 'Glass Cannon', group: 'Offense', bonusStat: Stat.CritDamage, text: 'All damage × 2, max HP halved.' },
  { id: 12, name: 'Spellward', group: 'Defense', bonusStat: Stat.ResistancePct, text: "You can't evade, but resistance also reduces physical damage." },
  { id: 13, name: "Scholar's Focus", group: 'Utility', bonusStat: Stat.XpGainPct, text: 'XP × 1.75, gold × 0.5.' },
];

export const LEGENDARIES_BY_ID: ReadonlyMap<number, LegendaryDef> = new Map(LEGENDARIES.map(l => [l.id, l]));

/** Which legendary group a base kind rolls from. */
export const GROUP_FOR_KIND: Record<BaseKind, LegendaryGroup> = {
  weapon: 'Offense',
  offhand: 'Offense', // tome; the shield is overridden below
  armor: 'Defense',
  jewelry: 'Utility',
};

/** Shield (base 20) rolls Defense; tome (21) rolls Offense. */
export function legendaryGroup(baseId: number, kind: BaseKind): LegendaryGroup {
  return baseId === 20 ? 'Defense' : GROUP_FOR_KIND[kind];
}
