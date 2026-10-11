// Consistency checks for the static game data (spacetimedb/src/data). No server needed:
//   npm run test:data
import { BASE_LIST, TRACKS, base, implicitValue, weaponValues } from '../spacetimedb/src/data/bases';
import { LEGENDARIES, UNIQUE_EFFECTS } from '../spacetimedb/src/data/legendary';
import { STATS, Stat, affixRef, roundStat } from '../spacetimedb/src/data/stats';
import { UNIQUES } from '../spacetimedb/src/data/uniques';
import { ENEMIES_BY_ID, ZONES } from '../spacetimedb/src/data/zones';
import { EFFECTS_BY_ID } from '../spacetimedb/src/data/legendary';

let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed++;
}
const unique = (xs: number[]) => new Set(xs).size === xs.length;
const near = (a: number, b: number) => Math.abs(a - b) < 0.01;

check('base IDs unique', unique(BASE_LIST.map(b => b.id)));
check('32 bases', BASE_LIST.length === 32, String(BASE_LIST.length));
check('enemy IDs unique', unique(ZONES.flatMap(z => z.enemies.map(e => e.id))));
check('legendary and unique effect IDs unique', unique([...LEGENDARIES, ...UNIQUE_EFFECTS].map(l => l.id)));
check('legendary effects stack: positive per copy, cap at least one copy', LEGENDARIES.every(l => l.perCopy > 0 && l.cap >= l.perCopy));
for (const g of ['Offense', 'Defense', 'Utility'] as const) {
  check(`${g}: at least 4 legendary effects`, LEGENDARIES.filter(l => l.group === g).length >= 4);
}
check('legendary bonus stats can roll as affixes', LEGENDARIES.every(l => STATS[l.bonusStat].ref !== undefined));
check('unique IDs unique', unique(UNIQUES.map(u => u.id)));
check('uniques: base exists, tier 1–9, effects exist and are distinct, stats can roll', UNIQUES.every(u =>
  BASE_LIST.some(b => b.id === u.baseId) && u.tier >= 1 && u.tier <= 9 && u.effects.length > 0 && unique(u.effects) &&
  u.effects.every(e => EFFECTS_BY_ID.has(e)) && u.stats.length > 0 && u.stats.every(s => STATS[s.stat].ref !== undefined)));
check('every unique-only effect is on some unique', UNIQUE_EFFECTS.every(e => UNIQUES.some(u => u.effects.includes(e.id))));
check('stat IDs match keys', Object.entries(STATS).every(([k, d]) => Number(k) === d.id));

for (const zone of ZONES) {
  const regular = zone.enemies.filter(e => !e.boss);
  const drops = regular.flatMap(e => e.drops);
  check(`${zone.name}: every base drops from exactly one enemy`, unique(drops) && drops.length === BASE_LIST.length,
    `${drops.length} drops`);
  check(`${zone.name}: one boss`, zone.enemies.filter(e => e.boss).length === 1);
  check(`${zone.name}: drop IDs exist`, drops.every(id => BASE_LIST.some(b => b.id === id)));
}
check('enemy lookup', ENEMIES_BY_ID.get(101)?.enemy.name === 'Field Rat');

// Spot checks against docs/design/bases.md and zone-content.md.
check('T1 sword name', base(1).name(1) === 'Rusted Sword');
check('T2 leather chest name', base(35).name(2) === 'Boarhide Vest');
{
  // A tier word means the same tier on every track, so names never hint at the wrong tier.
  const tierOf = new Map<string, Set<number>>();
  for (const track of Object.values(TRACKS)) track.forEach((w, i) => tierOf.set(w, (tierOf.get(w) ?? new Set()).add(i + 1)));
  check('tier words: 9 per track, each word at one tier only', Object.values(TRACKS).every(t => t.length === 9) && [...tierOf.values()].every(t => t.size === 1));
}
check('T4 ruby ring name', base(50).name(4) === 'Rough Bloodstone Ring');
check('T9 amber amulet name', base(57).name(9) === 'Flawless Dawnheart Amulet');
check('T9 sword hit ≈ 3,782', near(Math.round(weaponValues(base(1).weapon!, 9).hit), 3782));
check('T1 healing staff heal 7.5 → 8 (whole)', weaponValues(base(10).weapon!, 1).heal === 8);
check('T1 dagger hit 4.75 → 5 (whole)', weaponValues(base(2).weapon!, 1).hit === 5);
const breastplateT5 = base(39).implicits.map(i => [i.stat, implicitValue(i, 5)] as const);
const v = (s: number) => breastplateT5.find(([id]) => id === s)?.[1] ?? NaN;
check('T5 breastplate armor 60', near(v(Stat.Armor), 60));
check('T5 breastplate Vitality 10.67 → 11 (whole)', v(Stat.Vitality) === 11);
check('T5 breastplate attack speed −3.2% → −3% (whole)', v(Stat.AttackSpeedPct) === -3);
check('T1 cloth helm armor 1.2 → 1, never 0', implicitValue(base(30).implicits[0], 1) === 1);
check('item values are whole except lifesteal and HP regen',
  roundStat(Stat.MaxHp, 13.4) === 13 && roundStat(Stat.PhysDamage, 0.3) === 1 &&
  roundStat(Stat.LifestealPct, 0.137) === 0.14 && roundStat(Stat.HpRegen, 0.256) === 0.26);
check('max HP affix ref at T5 ≈ 131', near(Math.round(affixRef(Stat.MaxHp, 5)), 131));
check('phys % affix ref at T1 = 10%', near(affixRef(Stat.PhysDamagePct, 1), 10));

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
