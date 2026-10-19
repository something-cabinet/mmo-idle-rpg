// Legendary and unique affix effects (docs/design/legendary.md). Pure data, shared.
//
// Legendary effects have no downside, roll on Legendary items and stack: each copy
// worn adds `perCopy`, up to `cap`. Unique effects may cost something, never roll,
// and apply once however many items carry them.
//
// PERMANENT IDS: effect IDs are stored on items; the behaviour behind an ID is
// code, so changing it deliberately changes every item that has it.

import { Stat, type StatId } from './stats';

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
  FollowThrough: 25,
  Riposte: 26,
  Deadeye: 27,
  Bully: 28,
  HonedEdge: 29,
  Bloodthirst: 30,
  Discipline: 31,
  Unbreakable: 32,
  Stoneskin: 33,
  LastStand: 34,
  Berserker: 35,
  Bulwark: 36,
  SecondSkin: 37,
  Salvager: 38,
  Bounty: 39,
  Prospector: 40,
  Patience: 41,
  KeenEye: 42,
  Savor: 43,
  RaidFavor: 44,
  Moonlight: 45,
  WaxingMoon: 46,
  Moonshadow: 47,
  LunarInsight: 48,
  Afterimage: 49,
  DrownedHymn: 50,
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

/** Patience counts offline fighting after this many hours. */
export const PATIENCE_HOURS = 4;
/** Last Stand applies below this share of max HP. */
export const LAST_STAND_BELOW = 0.3;

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
    describe: a => `You deal 100% more damage to enemies below ${pc(a)} HP.` }),
  legendary({ id: 15, name: 'Rending', group: 'Offense', bonusStat: Stat.ArmorPenPct, perCopy: 0.4, cap: 0.7,
    describe: a => `Your physical damage ignores ${pc(a)} of the enemy's armor left after penetration.` }),
  legendary({ id: 21, name: 'Spellbreaker', group: 'Offense', bonusStat: Stat.MagicPenPct, perCopy: 0.4, cap: 0.7,
    describe: a => `Your magic damage ignores ${pc(a)} of the enemy's resistance left after penetration.` }),
  legendary({ id: 25, name: 'Follow-through', group: 'Offense', bonusStat: Stat.CritDamage, perCopy: 0.6, cap: 1.2,
    describe: a => `${pc(a)} of your overkill damage hits the next enemy as it arrives.` }),
  legendary({ id: 26, name: 'Riposte', group: 'Offense', bonusStat: Stat.EvasionRatingPct, perCopy: 0.5, cap: 1,
    describe: a => `Each attack you evade counters for ${pc(a)} of your average hit.` }),
  legendary({ id: 27, name: 'Deadeye', group: 'Offense', bonusStat: Stat.CritChancePct, perCopy: 0.5, cap: 1,
    describe: a => `Your crits ignore ${pc(a)} of the enemy's armor and resistance left after penetration.` }),
  legendary({ id: 28, name: 'Bully', group: 'Offense', bonusStat: Stat.MagicDamagePct, perCopy: 0.3, cap: 0.5,
    describe: a => `You deal 100% more damage to enemies above ${pc(1 - a)} HP.` }),
  legendary({ id: 29, name: 'Honed Edge', group: 'Offense', bonusStat: Stat.AttackSpeedPct, perCopy: 0.5, cap: 1,
    describe: a => `${pc(a)} more flat added damage.` }),
  legendary({ id: 30, name: 'Bloodthirst', group: 'Offense', bonusStat: Stat.LifestealPct, perCopy: 0.05, cap: 0.1,
    describe: a => `Lifesteal cap rises from 10% to ${pc(0.1 + a)}.` }),
  legendary({ id: 31, name: 'Discipline', group: 'Offense', bonusStat: Stat.AttackSpeedPct, perCopy: 0.1, cap: 0.2,
    describe: a => `${pc(a)} more damage per 100 points of your highest attribute.` }),
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
  legendary({ id: 32, name: 'Unbreakable', group: 'Defense', bonusStat: Stat.Resistance, perCopy: 0.05, cap: 0.1,
    describe: a => `Armor and resistance cap rises from 85% to ${pc(0.85 + a)} damage reduction.` }),
  legendary({ id: 33, name: 'Stoneskin', group: 'Defense', bonusStat: Stat.Armor, perCopy: 0.01, cap: 0.03,
    describe: a => `Each enemy hit deals ${pc(a)} of your max HP less (after mitigation).` }),
  legendary({ id: 34, name: 'Last Stand', group: 'Defense', bonusStat: Stat.Vitality, perCopy: 0.2, cap: 0.5,
    describe: a => `Below 30% HP, you take ${pc(a)} less damage.` }),
  legendary({ id: 35, name: 'Berserker', group: 'Defense', bonusStat: Stat.Might, perCopy: 0.03, cap: 0.09,
    describe: a => `${pc(a)} more damage per 10% of your max HP missing.` }),
  legendary({ id: 36, name: 'Bulwark', group: 'Defense', bonusStat: Stat.EvasionRating, perCopy: 0.15, cap: 0.5,
    describe: a => `${pc(a)} chance to block half of each enemy hit.` }),
  legendary({ id: 49, name: 'Afterimage', group: 'Defense', bonusStat: Stat.EvasionRating, perCopy: 0.5, cap: 0.75,
    describe: a => `After you evade, the enemy's next hit deals ${pc(a)} less.` }),
  legendary({ id: 37, name: 'Second Skin', group: 'Defense', bonusStat: Stat.MaxHp, perCopy: 0.15, cap: 0.5,
    describe: a => `Each fight starts with a shield of ${pc(a)} of your max HP.` }),
  // Utility
  legendary({ id: 7, name: 'Swift Hunter', group: 'Utility', bonusStat: Stat.AttackSpeedPct, perCopy: 0.4, cap: 0.8,
    describe: a => `Walk time between fights −${pc(a)}.` }),
  legendary({ id: 9, name: "Fortune's Favor", group: 'Utility', bonusStat: Stat.ItemFindPct, perCopy: 0.1, cap: 0.3,
    describe: a => `Each kept drop has a ${pc(a)} chance to be upgraded one rarity.` }),
  legendary({ id: 19, name: 'Seasoned', group: 'Utility', bonusStat: Stat.XpGainPct, perCopy: 4, cap: 8,
    describe: a => `Offline progress cap +${a}h.` }),
  legendary({ id: 20, name: 'Prosperity', group: 'Utility', bonusStat: Stat.GoldFindPct, perCopy: 0.4, cap: 0.6,
    describe: a => `${pc(a)} more gold.` }),
  legendary({ id: 38, name: 'Salvager', group: 'Utility', bonusStat: Stat.GoldFindPct, perCopy: 0.25, cap: 0.5,
    describe: a => `Each drop the loot filter or a full bag rejects has a ${pc(a)} chance to be salvaged or recycled twice.` }),
  legendary({ id: 39, name: 'Bounty', group: 'Utility', bonusStat: Stat.ItemFindPct, perCopy: 0.005, cap: 0.015,
    describe: a => `Every ${Math.round(1 / a)} kills of an enemy, an extra Rare drops.` }),
  legendary({ id: 40, name: 'Prospector', group: 'Utility', bonusStat: Stat.MaxHp, perCopy: 0.1, cap: 0.3,
    describe: a => `Kills drop ${Number(a.toFixed(2))} Ore of the zone's tier on average.` }),
  legendary({ id: 41, name: 'Patience', group: 'Utility', bonusStat: Stat.XpGainPct, perCopy: 0.15, cap: 0.3,
    describe: a => `Offline fighting past the first ${PATIENCE_HOURS}h earns ${pc(a)} more XP, gold, drops and materials.` }),
  legendary({ id: 42, name: 'Keen Eye', group: 'Utility', bonusStat: Stat.ItemFindPct, perCopy: 0.2, cap: 0.4,
    describe: a => `Kept Rare or better drops have a ${pc(a)} chance to raise their lowest affix to the item's top affix tier.` }),
  legendary({ id: 43, name: 'Savor', group: 'Utility', bonusStat: Stat.MaxHpPct, perCopy: 0.15, cap: 0.3,
    describe: a => `Each kill has a ${pc(a)} chance not to use a charge of your elixir.` }),
  legendary({ id: 44, name: 'Raid Favor', group: 'Utility', bonusStat: Stat.ThreatPct, perCopy: 0.15, cap: 0.3,
    describe: a => `Each rewarded raid clear has a ${pc(a)} chance to give one more item.` }),
];

/** Effects only handcrafted uniques carry: they may cost something, and don't stack. */
export const UNIQUE_EFFECTS: EffectDef[] = [
  { id: 2, name: 'Spellblade', text: 'Your damage swaps type: physical becomes magic, magic becomes physical.' },
  { id: 4, name: 'Juggernaut', text: "You can't evade, but armor also reduces magic damage." },
  { id: 8, name: 'Midas Touch', text: 'Kills give no XP, but 150% more gold.' },
  { id: 10, name: 'Voidtouched', text: "Your damage ignores the enemy's armor and resistance, but you deal 25% less damage." },
  { id: 11, name: 'Glass Cannon', text: '100% more damage, 50% less max HP.' },
  { id: 12, name: 'Spellward', text: "You can't evade, but resistance also reduces physical damage." },
  { id: 13, name: "Scholar's Focus", text: '75% more XP, 50% less gold.' },
  { id: 22, name: 'Frostbite', text: 'Your crits deal no extra damage. Instead the enemy deals 0.5% less damage per 1% crit chance (up to 50%).' },
  { id: 23, name: 'Frozen Blood', text: '+1 armor and resistance per 10 bonus max HP (from gear), but 20% less attack speed, and HP regen and lifesteal do nothing.' },
  { id: 24, name: 'Ambush', text: 'Your first attack each fight deals 5× damage, but 30% less attack speed.' },
  { id: 45, name: 'Moonlight', text: 'All your damage is magic (only magic damage % and Mind boost it; armor penetration counts as magic penetration). Every 3rd attack hits twice.' },
  { id: 46, name: 'Waxing Moon', text: 'Your hits start at 40% less damage and gain 10% more per attack, up to 60% more from the 11th attack on. Resets each fight.' },
  { id: 47, name: 'Moonshadow', text: 'All your armor and resistance become evasion rating.' },
  { id: 50, name: 'Drowned Hymn', text: 'Each point of Mind also gives +0.08% attack speed and +0.2% armor, but Finesse gives nothing.' },
  { id: 48, name: 'Lunar Insight', text: 'Each point of Mind also gives +0.25% max HP and +0.5% resistance, but Might gives nothing.' },
];

/** Moonlight: every MOONLIGHT_EVERY-th attack hits twice. */
export const MOONLIGHT_EVERY = 3;
/** Moonlight's average damage multiplier. */
export const MOONLIGHT_MULT = 1 + 1 / MOONLIGHT_EVERY;
/** Waxing Moon: attack `k` (from 1) deals × this. */
export const waxingMult = (k: number) => Math.min(1.6, 0.5 + 0.1 * k);
/**
 * Waxing Moon: attacks needed to deal `x` average hits (continuous): ×0.6 for the first,
 * +0.1 per attack, ×1.6 from the 11th. W(n) = 0.05n² + 0.55n up to n = 11 (W = 12.1).
 */
export function waxingAttacks(x: number): number {
  if (x <= 0) return 0;
  if (x <= 12.1) return (Math.sqrt(0.3025 + 0.2 * x) - 0.55) / 0.1;
  return 11 + (x - 12.1) / 1.6;
}

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
