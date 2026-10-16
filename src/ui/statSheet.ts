// The character stat sheet: each stat's value, where it comes from (gear, primaries, effects)
// and what it does. Used by Character (active loadout) and Equipment (any loadout).
// Never against the target: stats that depend on the enemy (evasion, DPS) are against
// auto-equip's reference enemy of the character's level (equip.ts `referenceDummy`).

import type { Item } from '../module_bindings/types';
import { MITIGATION_CAP, bonusHp, defenseAgainst, tempered, type CombatStats } from '../../spacetimedb/src/combat';
import { Effect, LEGENDARIES_BY_ID, effectAmount } from '../../spacetimedb/src/data/legendary';
import { CAPS, MIGHT_ACCURACY, Stat, accuracyAtLevel, fromStored } from '../../spacetimedb/src/data/stats';
import { scoreGear } from '../../spacetimedb/src/equip';
import { WALK_SECONDS } from '../../spacetimedb/src/data/zones';
import { fmt, pct } from './format';
import { itemName, statText } from './items';

/** [label, value, where it comes from, what it does]. */
export type StatRow = [string, string, string?, string?];

/** What each stat does, by row label. */
export const STAT_HELP: Record<string, string> = {
  Might: 'Each point: +0.5% physical damage, +0.2% max HP, +0.25% accuracy rating.\nYou gain 1 per level.',
  Finesse: 'Each point: +0.1% attack speed, +0.4% increased crit chance, +0.25% evasion rating.\nYou gain 1 per level.',
  Mind: 'Each point: +0.45% magic damage, +0.45% heal, +0.25% crit damage.\nYou gain 1 per level.',
  Vitality: 'Each point: +0.25% max HP, +1% HP regen, +0.25% threat.\nYou gain 1 per level.',
  Damage: "Damage per attack, before the enemy's armor (physical) or resistance (magic).",
  Heal: 'HP restored per attack. Solo, heals land on yourself.',
  'Attack speed': 'Attacks per second.',
  'Crit chance': 'Chance for an attack to be a critical hit, which deals crit damage instead of normal damage.',
  'Crit damage': 'Damage of a critical hit, as a share of a normal hit.',
  'Armor / magic pen': "Ignores this share of the enemy's armor (physical) and resistance (magic).",
  'Armor pen': "Ignores this share of the enemy's armor (physical damage).",
  'Magic pen': "Ignores this share of the enemy's resistance (magic damage).",
  DPS: 'Average damage per second against a reference enemy of your level (average armor and resistance), with crits.',
  'Max HP': 'Damage you can take before dying.',
  'HP regen': 'HP restored per second.',
  Armor: 'Reduces physical damage taken. You need more as you level; reduction caps at 85%.',
  Resistance: 'Reduces magic damage taken. You need more as you level; reduction caps at 85%.',
  Evasion: "Chance to avoid an enemy's attack entirely, against its accuracy. Higher-level enemies are more accurate, so harder to evade.",
  Accuracy: 'Lowers the chance an evasive enemy dodges your attacks: it dodges at its evasion rating / (its rating + your accuracy).',
  Lifesteal: 'Heals you for this share of the damage you deal.',
  'Item find': 'Raises the chance for enemies to drop items.',
  'Gold find': 'More gold per kill.',
  'XP gain': 'More XP per kill.',
  'Walk time': 'Time between fights, walking to the next enemy. Recovering to full HP is part of it.',
  Threat: 'Draws enemy attacks to you in raids. Does nothing solo.',
};

const n1 = (x: number) => String(Number(x.toFixed(2)));

/** Every stat line on `gear`. */
const gearStats = (gear: readonly (Item | undefined)[]) =>
  gear.flatMap(it => (it ? [...tempered(it).implicits, ...it.affixes, ...(it.legendary ? [it.legendary] : [])].map(st => ({ it, st })) : []));

export interface Sheet {
  primaries: StatRow[];
  offense: StatRow[];
  defense: StatRow[];
  utility: StatRow[];
}

/** The stat sheet of a character at `level` wearing `gear` (with `st = combatStats(level, gear)`). */
export function statSheet(level: number, gear: readonly (Item | undefined)[], st: CombatStats): Sheet {
  const worn = gearStats(gear);
  const sums = new Map<number, number>();
  for (const { st: g } of worn) sums.set(g.stat, (sums.get(g.stat) ?? 0) + fromStored(g.value));

  /** Base and primary-attribute notes, then the items that add to it. */
  const from = (ids: readonly number[], ...notes: (string | false | undefined)[]): string => {
    const lines = worn.filter(({ st: g }) => ids.includes(g.stat)).map(({ it, st: g }) => `  ${itemName(it)}: ${statText(g.stat, g.value)}`);
    return [...notes.filter(Boolean), ...(lines.length ? ['From gear:', ...lines] : ['No gear bonuses'])].join('\n');
  };
  const row = (label: string, value: string, source?: string): StatRow => [label, value, source, STAT_HELP[label]];

  const phys = defenseAgainst(st, 'Physical', level);
  const magic = defenseAgainst(st, 'Magic', level);
  const src = st.sources[0];
  const w = gear[0]?.weapon;
  const prim = (id: number) => level + (sums.get(id) ?? 0);
  const has = (e: number) => st.effects.has(e);
  const lunar = has(Effect.LunarInsight);
  // Lunar Insight: Might gives nothing.
  const [might, finesse, mind, vit] = [lunar ? 0 : prim(Stat.Might), prim(Stat.Finesse), prim(Stat.Mind), prim(Stat.Vitality)];
  /** Frozen Blood's base: max HP above what the level gives with no gear. */
  const frozen = bonusHp(level, st.maxHp, has(Effect.GlassCannon));
  /** A worn legendary effect as a note: its name and stacked effect. */
  const leg = (e: number) => has(e) && `${LEGENDARIES_BY_ID.get(e)!.name}: ${LEGENDARIES_BY_ID.get(e)!.describe(effectAmount(st.effects, e))}`;
  const evasionCap = CAPS.evasion / 100 + effectAmount(st.effects, Effect.PhantomStep);
  const mitCap = MITIGATION_CAP + effectAmount(st.effects, Effect.Unbreakable);
  const primary = (name: string, id: number) => row(name, fmt(prim(id)), from([id], `${level} from levels`));

  const offense: StatRow[] = src
    ? [
        row('Damage', [src.hit.Physical ? `${fmt(src.hit.Physical)} phys` : '', src.hit.Magic ? `${fmt(src.hit.Magic)} magic` : ''].filter(Boolean).join(' + ') || '0',
          from([Stat.PhysDamage, Stat.PhysDamagePct, Stat.MagicDamage, Stat.MagicDamagePct],
            w && `Weapon: ${n1(fromStored(w.hit))} ${w.damageType.tag.toLowerCase()} per hit`,
            `Might ${n1(might)}: +${n1(0.5 * might)}% physical damage`,
            `Mind ${n1(mind)}: +${n1(0.45 * mind)}% magic damage`,
            'Flat added damage is per hit: fast weapons get more from it',
            has(Effect.Spellblade) && 'Spellblade: damage type swapped, both damage-% groups apply',
            has(Effect.Moonlight) && 'Moonlight: all damage magic, only magic % applies; every 3rd attack hits twice',
            has(Effect.WaxingMoon) && 'Waxing Moon: hits start at −40%, +10% per attack, up to +60% from the 11th',
            lunar && 'Lunar Insight: Might gives nothing',
            has(Effect.GlassCannon) && 'Glass Cannon: × 2',
            has(Effect.Voidtouched) && 'Voidtouched: × 0.75, ignores enemy mitigation')),
        ...(src.heal ? [row('Heal', fmt(src.heal), from([Stat.Heal, Stat.HealPct], `Mind ${n1(mind)}: +${n1(0.45 * mind)}% heal`, 'Flat added heal is per hit: fast weapons get more from it'))] : []),
        row('Attack speed', `${src.attacksPerSec.toFixed(2)} /s`,
          from([Stat.AttackSpeedPct], w && `Weapon: ${w.speedMilli / 1000}/s`, `Finesse ${n1(finesse)}: +${n1(0.1 * finesse)}%`, "Floor: 25% of the weapon's speed",
            has(Effect.Ambush) && 'Ambush: × 0.7; first attack each fight deals 5×', has(Effect.FrozenBlood) && 'Frozen Blood: × 0.8')),
        row('Crit chance', pct(src.critChance, 1),
          from([Stat.BaseCritChance, Stat.CritChancePct], w && `Weapon base: ${w.baseCritBp / 100}%`, `Finesse ${n1(finesse)}: +${n1(0.4 * finesse)}% increased`, 'Rolls use at most 100%',
            leg(Effect.Overcrit))),
        row('Crit damage', pct(st.critDamage), from([Stat.CritDamage], 'Base 150%', `Mind ${n1(mind)}: +${n1(0.25 * mind)}%`,
          has(Effect.Frostbite) && `Frostbite: crits deal no extra damage; enemy damage −${pct(st.chill)}`)),
        row('Armor / magic pen', `${pct(st.armorPen)} / ${pct(st.magicPen)}`, from([Stat.ArmorPenPct, Stat.MagicPenPct], 'Cap 75% each',
          has(Effect.Moonlight) && 'Moonlight: armor penetration also counts as magic penetration',
          leg(Effect.Rending), leg(Effect.Spellbreaker))),
        row('Accuracy', fmt(st.accuracy), from([Stat.Accuracy, Stat.AccuracyPct], `Base ${accuracyAtLevel(level)} (10 per level)`,
          `Might ${n1(might)}: +${n1(100 * MIGHT_ACCURACY * might)}% rating`, 'An evasive enemy dodges at its evasion rating / (its rating + your accuracy)')),
        row('DPS', fmt(scoreGear(level, gear).dps),
          ["Damage × attack speed × average crit, after a reference enemy's mitigation\n(armor and resistance 2.5 × your level, half its damage physical, half magic)",
            leg(Effect.Thornshell), leg(Effect.ZealotsOath),
            has(Effect.Executioner) && `${leg(Effect.Executioner)} Not in DPS: it shortens fights instead.`].filter(Boolean).join('\n')),
      ]
    : [['Weapon', 'None equipped']];

  const defense: StatRow[] = [
    row('Max HP', fmt(st.maxHp), from([Stat.MaxHp, Stat.MaxHpPct], `Base ${100 + 10 * (level - 1)} (100 + 10 per level)`,
      `Might ${n1(might)}: +${n1(0.2 * might)}%`, `Vitality ${n1(vit)}: +${n1(0.25 * vit)}%`, lunar && `Lunar Insight, Mind ${n1(mind)}: +${n1(0.25 * mind)}%`, has(Effect.GlassCannon) && 'Glass Cannon: × 0.5', leg(Effect.SecondWind))),
    row('HP regen', `${fmt(st.regen)} /s`, from([Stat.HpRegen], `Vitality ${n1(vit)}: +${n1(vit)}%`, has(Effect.FrozenBlood) && 'Frozen Blood: no regen')),
    row('Armor', `${fmt(st.armor)} (${pct(phys.mitigation)} vs phys)`, from([Stat.Armor, Stat.ArmorPct], `Reduction: armor / (armor + 5 × enemy level); vs Lv ${level}: / (armor + ${5 * level}), cap ${pct(mitCap)}`,
      leg(Effect.Runeguard), has(Effect.FrozenBlood) && `Frozen Blood: +${fmt(frozen / 10)} (bonus HP ${fmt(frozen)} / 10)`, has(Effect.Spellward) && 'Spellward: physical uses the better of armor and resistance')),
    row('Resistance', `${fmt(st.resistance)} (${pct(magic.mitigation)} vs magic)`, from([Stat.Resistance, Stat.ResistancePct],
      `Reduction: resistance / (resistance + 5 × enemy level); vs Lv ${level}: / (resistance + ${5 * level}), cap ${pct(mitCap)}`,
      leg(Effect.Ironclad), lunar && `Lunar Insight, Mind ${n1(mind)}: +${n1(0.5 * mind)}%`, has(Effect.FrozenBlood) && `Frozen Blood: +${fmt(frozen / 10)} (bonus HP ${fmt(frozen)} / 10)`, has(Effect.Juggernaut) && 'Juggernaut: magic uses the better of armor and resistance')),
    row('Evasion', pct(phys.evasion), from([Stat.EvasionRating, Stat.EvasionRatingPct], `Rating ${fmt(st.evasionRating)} vs a Lv ${level} enemy's accuracy: rating / (rating + ${accuracyAtLevel(level)})`,
      `Finesse ${n1(finesse)}: +${n1(0.25 * finesse)}% rating`, `Cap ${pct(evasionCap)}${has(Effect.PhantomStep) ? ' (Phantom Step)' : ''}`,
      (has(Effect.Juggernaut) || has(Effect.Spellward)) && "Juggernaut / Spellward: you can't evade",
      has(Effect.Moonshadow) && "Moonshadow: the enemy's hit after a dodge deals 50% less; landed hits deal 10% more")),
    row('Lifesteal', pct(st.lifesteal, 1), from([Stat.LifestealPct], `Cap ${pct(CAPS.lifesteal / 100 + effectAmount(st.effects, Effect.Bloodthirst))}`, leg(Effect.Bloodthirst), has(Effect.FrozenBlood) && 'Frozen Blood: no lifesteal')),
  ];

  const utility: StatRow[] = [
    row('Item find', pct(st.itemFind), from([Stat.ItemFindPct], leg(Effect.FortunesFavor))),
    row('Gold find', pct(st.goldFind), from([Stat.GoldFindPct], leg(Effect.Prosperity), has(Effect.MidasTouch) && 'Midas Touch: gold × 2.5', has(Effect.ScholarsFocus) && "Scholar's Focus: gold × 0.5")),
    row('XP gain', pct(st.xpGain), from([Stat.XpGainPct], has(Effect.MidasTouch) && 'Midas Touch: no XP', has(Effect.ScholarsFocus) && "Scholar's Focus: XP × 1.75")),
    row('Walk time', `${n1(st.walkTime)} s`, from([], `Base ${WALK_SECONDS} s`, leg(Effect.SwiftHunter))),
    row('Threat', pct(st.threat), from([Stat.ThreatPct], `Vitality ${n1(vit)}: +${n1(0.25 * vit)}%`)),
  ];

  return {
    primaries: [primary('Might', Stat.Might), primary('Finesse', Stat.Finesse), primary('Mind', Stat.Mind), primary('Vitality', Stat.Vitality)],
    offense,
    defense,
    utility,
  };
}
