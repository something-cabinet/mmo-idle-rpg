// The character stat sheet: each stat's value, where it comes from (gear, primaries, effects)
// and what it does. Used by Character (active loadout) and Equipment (any loadout).

import type { Item } from '../module_bindings/types';
import { defenseAgainst, type CombatStats } from '../../spacetimedb/src/combat';
import { Effect } from '../../spacetimedb/src/data/legendary';
import { Stat, fromStored } from '../../spacetimedb/src/data/stats';
import { fmt, pct } from './format';
import { itemName, statText } from './items';

/** [label, value, where it comes from, what it does]. */
export type StatRow = [string, string, string?, string?];

/** What each stat does, by row label. */
export const STAT_HELP: Record<string, string> = {
  Might: 'Each point: +0.5% physical damage, +0.2% max HP.\nYou gain 1 per level.',
  Finesse: 'Each point: +0.1% attack speed, +0.4% increased crit chance, +0.25% evasion rating.\nYou gain 1 per level.',
  Mind: 'Each point: +0.45% magic damage, +0.45% heal.\nYou gain 1 per level.',
  Vitality: 'Each point: +0.25% max HP, +1% HP regen, +0.25% threat.\nYou gain 1 per level.',
  Damage: "Damage per attack, before the enemy's armor (physical) or resistance (magic).",
  Heal: 'HP restored per attack. Solo, heals land on yourself.',
  'Attack speed': 'Attacks per second.',
  'Crit chance': 'Chance for an attack to be a critical hit, which deals crit damage instead of normal damage.',
  'Crit damage': 'Damage of a critical hit, as a share of a normal hit.',
  'Armor / magic pen': "Ignores this share of the enemy's armor (physical) and resistance (magic).",
  'DPS vs target': 'Average damage per second against your target, after its mitigation and with crits.',
  DPS: 'Average damage per second against a reference enemy of your level (average armor and resistance), with crits.',
  'Max HP': 'Damage you can take before dying.',
  'HP regen': 'HP restored per second.',
  Armor: 'Reduces physical damage taken. You need more as you level; reduction caps at 85%.',
  Resistance: 'Reduces magic damage taken. You need more as you level; reduction caps at 85%.',
  Evasion: "Chance to avoid an enemy's attack entirely. Higher-level enemies are harder to evade.",
  Lifesteal: 'Heals you for this share of the damage you deal.',
  'Item find': 'Raises the chance for enemies to drop items.',
  'Gold find': 'More gold per kill.',
  'XP gain': 'More XP per kill.',
  Threat: 'Draws enemy attacks to you in raids. Does nothing solo.',
};

const n1 = (x: number) => String(Number(x.toFixed(2)));

/** Every stat line on `gear`. */
const gearStats = (gear: readonly (Item | undefined)[]) =>
  gear.flatMap(it => (it ? [...it.implicits, ...it.affixes, ...(it.legendary ? [it.legendary] : [])].map(st => ({ it, st })) : []));

export interface Sheet {
  primaries: StatRow[];
  offense: StatRow[];
  defense: StatRow[];
  utility: StatRow[];
}

/**
 * The stat sheet of a character at `level` wearing `gear` (with `st = combatStats(level, gear)`).
 * Mitigation and evasion are shown against `enemyLevel`; `dps` is against the target, if any.
 */
export function statSheet(level: number, gear: readonly (Item | undefined)[], st: CombatStats, enemyLevel: number, dps: number | undefined): Sheet {
  const worn = gearStats(gear);
  const sums = new Map<number, number>();
  for (const { st: g } of worn) sums.set(g.stat, (sums.get(g.stat) ?? 0) + fromStored(g.value));

  /** Base and primary-attribute notes, then the items that add to it. */
  const from = (ids: readonly number[], ...notes: (string | false | undefined)[]): string => {
    const lines = worn.filter(({ st: g }) => ids.includes(g.stat)).map(({ it, st: g }) => `  ${itemName(it)}: ${statText(g.stat, g.value)}`);
    return [...notes.filter(Boolean), ...(lines.length ? ['From gear:', ...lines] : ['No gear bonuses'])].join('\n');
  };
  const row = (label: string, value: string, source?: string): StatRow => [label, value, source, STAT_HELP[label]];

  const phys = defenseAgainst(st, 'Physical', enemyLevel);
  const magic = defenseAgainst(st, 'Magic', enemyLevel);
  const src = st.sources[0];
  const w = gear[0]?.weapon;
  const prim = (id: number) => level + (sums.get(id) ?? 0);
  const [might, finesse, mind, vit] = [prim(Stat.Might), prim(Stat.Finesse), prim(Stat.Mind), prim(Stat.Vitality)];
  const has = (e: number) => st.effects.has(e);
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
            has(Effect.GlassCannon) && 'Glass Cannon: × 2',
            has(Effect.Voidtouched) && 'Voidtouched: × 0.75, ignores enemy mitigation')),
        ...(src.heal ? [row('Heal', fmt(src.heal), from([Stat.Heal, Stat.HealPct], `Mind ${n1(mind)}: +${n1(0.45 * mind)}% heal`, 'Flat added heal is per hit: fast weapons get more from it'))] : []),
        row('Attack speed', `${src.attacksPerSec.toFixed(2)} /s`,
          from([Stat.AttackSpeedPct], w && `Weapon: ${w.speedMilli / 1000}/s`, `Finesse ${n1(finesse)}: +${n1(0.1 * finesse)}%`, "Floor: 25% of the weapon's speed")),
        row('Crit chance', pct(src.critChance, 1),
          from([Stat.CritChancePct], w && `Weapon base: ${w.baseCritBp / 100}%`, `Finesse ${n1(finesse)}: +${n1(0.4 * finesse)}% increased`, 'Rolls use at most 100%',
            has(Effect.Overcrit) && 'Overcrit: each 1% above 100% gives +2% crit damage')),
        row('Crit damage', pct(st.critDamage), from([Stat.CritDamage], 'Base 150%')),
        row('Armor / magic pen', `${pct(st.armorPen)} / ${pct(st.magicPen)}`, from([Stat.ArmorPenPct, Stat.MagicPenPct], 'Cap 75% each')),
        row('DPS vs target', dps !== undefined ? fmt(dps) : '—',
          ["Damage × attack speed × average crit, after the target's mitigation",
            has(Effect.Thornshell) && 'Thornshell: + 40% of the damage you take',
            has(Effect.ZealotsOath) && "Zealot's Oath: + 50% of your heals"].filter(Boolean).join('\n')),
      ]
    : [['Weapon', 'None equipped']];

  const defense: StatRow[] = [
    row('Max HP', fmt(st.maxHp), from([Stat.MaxHp, Stat.MaxHpPct], `Base ${100 + 10 * (level - 1)} (100 + 10 per level)`,
      `Might ${n1(might)}: +${n1(0.2 * might)}%`, `Vitality ${n1(vit)}: +${n1(0.25 * vit)}%`, has(Effect.GlassCannon) && 'Glass Cannon: × 0.5')),
    row('HP regen', `${fmt(st.regen)} /s`, from([Stat.HpRegen], `Vitality ${n1(vit)}: +${n1(vit)}%`)),
    row('Armor', `${fmt(st.armor)} (${pct(phys.mitigation)} vs phys)`, from([Stat.Armor, Stat.ArmorPct], `Reduction: armor / (armor + ${5 * level}), cap 85%`,
      has(Effect.Spellward) && 'Spellward: physical uses the better of armor and resistance')),
    row('Resistance', `${fmt(st.resistance)} (${pct(magic.mitigation)} vs magic)`, from([Stat.Resistance, Stat.ResistancePct],
      `Reduction: resistance / (resistance + ${5 * level}), cap 85%`,
      has(Effect.Juggernaut) && 'Juggernaut: magic uses the better of armor and resistance')),
    row('Evasion', pct(phys.evasion), from([Stat.EvasionRating, Stat.EvasionRatingPct], `Rating ${fmt(st.evasionRating)} vs Lv ${enemyLevel}: rating / (rating + ${10 * enemyLevel})`,
      `Finesse ${n1(finesse)}: +${n1(0.25 * finesse)}% rating`, `Cap ${has(Effect.PhantomStep) ? '75% (Phantom Step)' : '60%'}`,
      (has(Effect.Juggernaut) || has(Effect.Spellward)) && "Juggernaut / Spellward: you can't evade")),
    row('Lifesteal', pct(st.lifesteal, 1), from([Stat.LifestealPct], 'Cap 3%')),
  ];

  const utility: StatRow[] = [
    row('Item find', pct(st.itemFind), from([Stat.ItemFindPct], has(Effect.FortunesFavor) && "Fortune's Favor: kept drops have a 15% chance to be one rarity higher")),
    row('Gold find', pct(st.goldFind), from([Stat.GoldFindPct], has(Effect.MidasTouch) && 'Midas Touch: gold × 2.5', has(Effect.ScholarsFocus) && "Scholar's Focus: gold × 0.5")),
    row('XP gain', pct(st.xpGain), from([Stat.XpGainPct], has(Effect.MidasTouch) && 'Midas Touch: no XP', has(Effect.ScholarsFocus) && "Scholar's Focus: XP × 1.75")),
    row('Threat', pct(st.threat), from([Stat.ThreatPct], `Vitality ${n1(vit)}: +${n1(0.25 * vit)}%`)),
  ];

  return {
    primaries: [primary('Might', Stat.Might), primary('Finesse', Stat.Finesse), primary('Mind', Stat.Mind), primary('Vitality', Stat.Vitality)],
    offense,
    defense,
    utility,
  };
}

/** Where each stat comes from, by row label (for tables that show a subset of the sheet). */
export function sourcesByLabel(sheet: Sheet): Map<string, string> {
  const m = new Map<string, string>();
  for (const [label, , source] of [...sheet.primaries, ...sheet.offense, ...sheet.defense, ...sheet.utility]) if (source) m.set(label, source);
  m.set('DPS', [
    "Damage × attack speed × average crit, after a reference enemy's mitigation",
    '(armor and resistance 2.5 × your level, half its damage physical, half magic)',
  ].join('\n'));
  return m;
}
