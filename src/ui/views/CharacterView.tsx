import { memo } from 'react';
import { defenseAgainst } from '../../../spacetimedb/src/combat';
import { Effect } from '../../../spacetimedb/src/data/legendary';
import { Stat, fromStored } from '../../../spacetimedb/src/data/stats';
import { fmt, pct } from '../format';
import { itemName, statText } from '../items';
import { CardHead, EffectsCard, StatRows, ViewHeader } from '../shared';
import type { Snapshot } from '../snapshot';

type Row = [string, string, string];

/** Every stat line on the worn gear. */
const wornStats = (s: Snapshot) =>
  s.gear.flatMap(it => (it ? [...it.implicits, ...it.affixes, ...(it.legendary ? [it.legendary] : [])].map(st => ({ it, st })) : []));

/** Summed gear values per stat (display units). */
function gearSums(s: Snapshot) {
  const sum = new Map<number, number>();
  for (const { st } of wornStats(s)) sum.set(st.stat, (sum.get(st.stat) ?? 0) + fromStored(st.value));
  return sum;
}

/** Hover text for a stat: base and primary-attribute notes, then the items that add to it. */
function breakdown(s: Snapshot, ids: readonly number[], ...notes: (string | false | undefined)[]): string {
  const gear = wornStats(s)
    .filter(({ st }) => ids.includes(st.stat))
    .map(({ it, st }) => `${itemName(it)}: ${statText(st.stat, st.value)}`);
  return [...notes.filter(Boolean), ...(gear.length ? ['From gear:', ...gear.map(l => `  ${l}`)] : ['No gear bonuses'])].join('\n');
}

const n1 = (x: number) => String(Number(x.toFixed(2)));

export const CharacterView = memo(function CharacterView({ s }: { s: Snapshot }) {
  const st = s.stats;
  const sums = gearSums(s);
  const enemyLevel = s.target?.enemy.level ?? s.level;
  const phys = defenseAgainst(st, 'Physical', enemyLevel);
  const magic = defenseAgainst(st, 'Magic', enemyLevel);
  const src = st.sources[0];
  const w = s.gear[0]?.weapon;
  const prim = (id: number) => s.level + (sums.get(id) ?? 0);
  const [might, finesse, mind, vit] = [prim(Stat.Might), prim(Stat.Finesse), prim(Stat.Mind), prim(Stat.Vitality)];
  const has = (e: number) => st.effects.has(e);
  const primary = (name: string, id: number): Row => [name, fmt(prim(id)), breakdown(s, [id], `${s.level} from levels`)];

  const offense: Row[] = src
    ? [
        ['Hit', [src.hit.Physical ? `${fmt(src.hit.Physical)} phys` : '', src.hit.Magic ? `${fmt(src.hit.Magic)} magic` : ''].filter(Boolean).join(' + ') || '0',
          breakdown(s, [Stat.PhysDamage, Stat.PhysDamagePct, Stat.MagicDamage, Stat.MagicDamagePct],
            w && `Weapon: ${n1(fromStored(w.hit))} ${w.damageType.tag.toLowerCase()} per hit`,
            `Might ${n1(might)}: +${n1(0.5 * might)}% physical damage`,
            `Mind ${n1(mind)}: +${n1(0.45 * mind)}% magic damage`,
            'Flat damage is per hit at 1.0/s, scaled by weapon speed',
            has(Effect.Spellblade) && 'Spellblade: damage type swapped, both damage-% groups apply',
            has(Effect.GlassCannon) && 'Glass Cannon: × 2',
            has(Effect.Voidtouched) && 'Voidtouched: × 0.75, ignores enemy mitigation')],
        ...(src.heal ? [['Heal', fmt(src.heal), breakdown(s, [Stat.Heal, Stat.HealPct], `Mind ${n1(mind)}: +${n1(0.45 * mind)}% heal`)] as Row] : []),
        ['Attack speed', `${src.attacksPerSec.toFixed(2)} /s`,
          breakdown(s, [Stat.AttackSpeedPct], w && `Weapon: ${w.speedMilli / 1000}/s`, `Finesse ${n1(finesse)}: +${n1(0.1 * finesse)}%`, "Floor: 25% of the weapon's speed")],
        ['Crit chance', pct(src.critChance, 1),
          breakdown(s, [Stat.CritChancePct], w && `Weapon base: ${w.baseCritBp / 100}%`, `Finesse ${n1(finesse)}: +${n1(0.4 * finesse)}% increased`, 'Rolls use at most 100%',
            has(Effect.Overcrit) && 'Overcrit: each 1% above 100% gives +2% crit damage')],
        ['Crit damage', pct(st.critDamage), breakdown(s, [Stat.CritDamage], 'Base 150%')],
        ['Armor / magic pen', `${pct(st.armorPen)} / ${pct(st.magicPen)}`, breakdown(s, [Stat.ArmorPenPct, Stat.MagicPenPct], 'Cap 75% each')],
        ['DPS vs target', s.fight ? fmt(s.fight.dps) : '—',
          ["Hit × attack speed × average crit, after the target's mitigation",
            has(Effect.Thornshell) ? 'Thornshell: + 40% of the damage you take' : '',
            has(Effect.ZealotsOath) ? "Zealot's Oath: + 50% of your heals" : ''].filter(Boolean).join('\n')],
      ]
    : [['Weapon', 'None equipped', '']];

  const defense: Row[] = [
    ['Max HP', fmt(st.maxHp), breakdown(s, [Stat.MaxHp, Stat.MaxHpPct], `Base ${100 + 10 * (s.level - 1)} (100 + 10 per level)`,
      `Might ${n1(might)}: +${n1(0.2 * might)}%`, `Vitality ${n1(vit)}: +${n1(0.25 * vit)}%`, has(Effect.GlassCannon) && 'Glass Cannon: × 0.5')],
    ['HP regen', `${fmt(st.regen)} /s`, breakdown(s, [Stat.HpRegen], `Vitality ${n1(vit)}: +${n1(vit)}%`)],
    ['Armor', `${fmt(st.armor)} (${pct(phys.mitigation)} vs phys)`, breakdown(s, [Stat.Armor, Stat.ArmorPct], `Mitigation vs Lv ${enemyLevel}: armor / (armor + ${5 * s.level}), cap 85%`,
      has(Effect.Spellward) && 'Spellward: physical uses the better of armor and resistance')],
    ['Resistance', `${fmt(st.resistance)} (${pct(magic.mitigation)} vs magic)`, breakdown(s, [Stat.Resistance, Stat.ResistancePct],
      has(Effect.Juggernaut) && 'Juggernaut: magic uses the better of armor and resistance')],
    ['Evasion', pct(phys.evasion), breakdown(s, [Stat.EvasionRating, Stat.EvasionRatingPct], `Rating ${fmt(st.evasionRating)} vs Lv ${enemyLevel}: rating / (rating + ${10 * enemyLevel})`,
      `Finesse ${n1(finesse)}: +${n1(0.25 * finesse)}% rating`, `Cap ${has(Effect.PhantomStep) ? '75% (Phantom Step)' : '60%'}`,
      (has(Effect.Juggernaut) || has(Effect.Spellward)) && "Juggernaut / Spellward: you can't evade")],
    ['Lifesteal', pct(st.lifesteal, 1), breakdown(s, [Stat.LifestealPct], 'Cap 3%')],
  ];

  const utility: Row[] = [
    ['Item find', pct(st.itemFind), breakdown(s, [Stat.ItemFindPct], has(Effect.FortunesFavor) && "Fortune's Favor: kept drops have a 15% chance to be one rarity higher")],
    ['Gold find', pct(st.goldFind), breakdown(s, [Stat.GoldFindPct], has(Effect.MidasTouch) && 'Midas Touch: gold × 2.5', has(Effect.ScholarsFocus) && "Scholar's Focus: gold × 0.5")],
    ['XP gain', pct(st.xpGain), breakdown(s, [Stat.XpGainPct], has(Effect.MidasTouch) && 'Midas Touch: no XP', has(Effect.ScholarsFocus) && "Scholar's Focus: XP × 1.75")],
    ['Threat', pct(st.threat), breakdown(s, [Stat.ThreatPct], `Vitality ${n1(vit)}: +${n1(0.25 * vit)}%`)],
  ];

  return (
    <>
      <ViewHeader title="Character" icon="user" />
      <div className="grid-4">
        <div className="card">
          <CardHead title="Primaries" />
          <StatRows rows={[primary('Might', Stat.Might), primary('Finesse', Stat.Finesse), primary('Mind', Stat.Mind), primary('Vitality', Stat.Vitality)]} />
        </div>
        <div className="card">
          <CardHead title="Offense" />
          <StatRows rows={offense} />
        </div>
        <div className="card">
          <CardHead title="Defense" />
          <StatRows rows={defense} />
        </div>
        <div className="card">
          <CardHead title="Utility" />
          <StatRows rows={utility} />
        </div>
      </div>
      <EffectsCard effects={st.effects} />
      <p className="muted hint">
        Hover a stat to see where it comes from. Mitigation and evasion are against Lv {enemyLevel}
        {s.target ? ` (${s.target.enemy.name})` : ''}.
      </p>
    </>
  );
});
