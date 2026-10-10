// Consistency checks for the static game data (spacetimedb/src/data). No server needed:
//   npm run test:data
import { BASE_LIST, base, implicitValue, weaponValues } from '../spacetimedb/src/data/bases';
import { LEGENDARIES } from '../spacetimedb/src/data/legendary';
import { STATS, Stat, affixRef } from '../spacetimedb/src/data/stats';
import { ENEMIES_BY_ID, ZONES } from '../spacetimedb/src/data/zones';

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
check('legendary IDs unique', unique(LEGENDARIES.map(l => l.id)));
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
check('T1 sword name', base(1).name(1) === 'Copper Sword');
check('T2 leather chest name', base(35).name(2) === 'Tanned Vest');
check('T4 ruby ring name', base(50).name(4) === 'Rough Bloodstone Ring');
check('T9 amber amulet name', base(57).name(9) === 'Flawless Dawnheart Amulet');
check('T9 sword hit ≈ 3,782', near(Math.round(weaponValues(base(1).weapon!, 9).hit), 3782));
check('T1 healing staff heal 7.5', near(weaponValues(base(10).weapon!, 1).heal, 7.5));
const breastplateT5 = base(39).implicits.map(i => [i.stat, implicitValue(i, 5)] as const);
const v = (s: number) => breastplateT5.find(([id]) => id === s)?.[1] ?? NaN;
check('T5 breastplate armor 60', near(v(Stat.Armor), 60));
check('T5 breastplate Vitality ≈ 10.67', near(v(Stat.Vitality), 40 * 0.4 * (8 / 12)));
check('T5 breastplate attack speed −3.2%', near(v(Stat.AttackSpeedPct), -3.2));
check('max HP affix ref at T5 ≈ 131', near(Math.round(affixRef(Stat.MaxHp, 5)), 131));
check('phys % affix ref at T1 = 10%', near(affixRef(Stat.PhysDamagePct, 1), 10));

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
