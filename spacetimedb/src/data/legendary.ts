// Legendary and unique affix effects (docs/design/legendary.md). Pure data, shared.
//
// Legendary effects have no downside, roll on Legendary items and stack: each copy
// worn adds `perCopy`, up to `cap`. Unique effects may cost something, never roll,
// and apply once however many items carry them.
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
  Executioner: 14,
  Rending: 15,
  SecondWind: 16,
  Ironclad: 17,
  Runeguard: 18,
  Seasoned: 19,
  Prosperity: 20,
  Spellbreaker: 21,
  Frostbite: 22,
  FrozenBlood: 23,
  Ambush: 24,
} as const;

export type LegendaryGroup = 'Offense' | 'Defense' | 'Utility';

export interface EffectDef {
  id: number;
  name: string;
  /** What one copy does. */
  text: string;
}

export interface LegendaryDef extends EffectDef {
  group: LegendaryGroup;
  /** The small stat bonus that comes with the effect. */
  bonusStat: StatId;
  /** Effect amount per copy worn (unit per effect, see `describe`). */
  perCopy: number;
  /** Most the amount can reach; copies past it are wasted. */
  cap: number;
  /** The effect at `amount`. */
  describe: (amount: number) => string;
}

const pc = (x: number) => `${Math.round(x * 100)}%`;

function legendary(def: Omit<LegendaryDef, 'text'>): LegendaryDef {
  return { ...def, text: def.describe(def.perCopy) };
}

/** The effects a Legendary item rolls. */
export const LEGENDARIES: LegendaryDef[] = [
  // Offense
  legendary({ id: 1, name: 'Overcrit', group: 'Offense', bonusStat: Stat.BaseCritChance, perCopy: 2, cap: Infinity,
    describe: a => `Crit chance above 100% gives +${Number(a.toFixed(2))}% crit damage per 1% of excess.` }),
  legendary({ id: 3, name: "Zealot's Oath", group: 'Offense', bonusStat: Stat.HealPct, perCopy: 0.5, cap: Infinity,
    describe: a => `Your heals also damage the enemy for ${pc(a)} of the heal (magic).` }),
  legendary({ id: 14, name: 'Executioner', group: 'Offense', bonusStat: Stat.PhysDamagePct, perCopy: 0.3, cap: 0.5,
    describe: a => `Enemies below ${pc(a)} HP take double damage.` }),
  legendary({ id: 15, name: 'Rending', group: 'Offense', bonusStat: Stat.ArmorPenPct, perCopy: 0.4, cap: 0.7,
    describe: a => `Your physical damage ignores ${pc(a)} of the enemy's armor left after penetration.` }),
  legendary({ id: 21, name: 'Spellbreaker', group: 'Offense', bonusStat: Stat.MagicPenPct, perCopy: 0.4, cap: 0.7,
    describe: a => `Your magic damage ignores ${pc(a)} of the enemy's resistance left after penetration.` }),
  // Defense
  legendary({ id: 5, name: 'Phantom Step', group: 'Defense', bonusStat: Stat.EvasionRatingPct, perCopy: 0.15, cap: 0.25,
    describe: a => `Evasion cap rises from 60% to ${pc(0.6 + a)}.` }),
  legendary({ id: 6, name: 'Thornshell', group: 'Defense', bonusStat: Stat.MaxHpPct, perCopy: 0.4, cap: 1,
    describe: a => `Reflects ${pc(a)} of the damage you take back at the enemy.` }),
  legendary({ id: 16, name: 'Second Wind', group: 'Defense', bonusStat: Stat.HpRegen, perCopy: 0.5, cap: 1,
    describe: a => `Once per fight, a killing blow leaves you at ${pc(a)} HP instead.` }),
  legendary({ id: 17, name: 'Ironclad', group: 'Defense', bonusStat: Stat.ArmorPct, perCopy: 0.3, cap: 1,
    describe: a => `${pc(a)} of your armor is added to your resistance.` }),
  legendary({ id: 18, name: 'Runeguard', group: 'Defense', bonusStat: Stat.ResistancePct, perCopy: 0.3, cap: 1,
    describe: a => `${pc(a)} of your resistance is added to your armor.` }),
  // Utility
  legendary({ id: 7, name: 'Swift Hunter', group: 'Utility', bonusStat: Stat.AttackSpeedPct, perCopy: 0.4, cap: 0.8,
    describe: a => `Walk time between fights −${pc(a)}.` }),
  legendary({ id: 9, name: "Fortune's Favor", group: 'Utility', bonusStat: Stat.ItemFindPct, perCopy: 0.15, cap: 0.3,
    describe: a => `Each kept drop has a ${pc(a)} chance to be upgraded one rarity.` }),
  legendary({ id: 19, name: 'Seasoned', group: 'Utility', bonusStat: Stat.XpGainPct, perCopy: 4, cap: 8,
    describe: a => `Offline progress cap +${a}h.` }),
  legendary({ id: 20, name: 'Prosperity', group: 'Utility', bonusStat: Stat.GoldFindPct, perCopy: 0.4, cap: 0.6,
    describe: a => `Gold × ${Number((1 + a).toFixed(2))}.` }),
];

/** Effects only handcrafted uniques carry: they may cost something, and don't stack. */
export const UNIQUE_EFFECTS: EffectDef[] = [
  { id: 2, name: 'Spellblade', text: 'Your damage swaps type: physical becomes magic, magic becomes physical.' },
  { id: 4, name: 'Juggernaut', text: "You can't evade, but armor also reduces magic damage." },
  { id: 8, name: 'Midas Touch', text: 'Kills give no XP, but gold × 2.5.' },
  { id: 10, name: 'Voidtouched', text: "Your damage ignores the enemy's armor and resistance, but deals 25% less." },
  { id: 11, name: 'Glass Cannon', text: 'All damage × 2, max HP halved.' },
  { id: 12, name: 'Spellward', text: "You can't evade, but resistance also reduces physical damage." },
  { id: 13, name: "Scholar's Focus", text: 'XP × 1.75, gold × 0.5.' },
  { id: 22, name: 'Frostbite', text: 'Your crits deal no extra damage. Instead the enemy deals 0.5% less damage per 1% crit chance (up to 50%).' },
  { id: 23, name: 'Frozen Blood', text: '+1 armor and resistance per 10 max HP, but HP regen and lifesteal do nothing.' },
  { id: 24, name: 'Ambush', text: 'Your first attack each fight deals 5× damage, but attack speed × 0.7.' },
];

export const LEGENDARIES_BY_ID: ReadonlyMap<number, LegendaryDef> = new Map(LEGENDARIES.map(l => [l.id, l]));
export const EFFECTS_BY_ID: ReadonlyMap<number, EffectDef> = new Map([...LEGENDARIES, ...UNIQUE_EFFECTS].map(e => [e.id, e]));

/** Effect ID → copies worn. */
export type EffectCounts = ReadonlyMap<number, number>;

/** A legendary effect's stacked amount: `perCopy` per copy, up to `cap`; 0 if not worn. */
export function effectAmount(effects: EffectCounts, id: number): number {
  const def = LEGENDARIES_BY_ID.get(id);
  const n = effects.get(id) ?? 0;
  return def && n > 0 ? Math.min(def.cap, def.perCopy * n) : 0;
}

/** Copies of `def` that reach its cap (Infinity if uncapped). */
export const copiesToCap = (def: LegendaryDef): number => Math.ceil(def.cap / def.perCopy - 1e-9);

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
