// Consistency checks for the static game data (spacetimedb/src/data). No server needed:
//   npm run test:data
import { BASE_LIST, TYPES, TYPE_LIST, ZONE_BASES, TRACKS, base, implicitValue, weaponValues } from '../spacetimedb/src/data/bases';
import { LEGENDARIES, UNIQUE_EFFECTS } from '../spacetimedb/src/data/legendary';
import { STATS, Stat, affixRef, curve, roundStat } from '../spacetimedb/src/data/stats';
import { UNIQUES } from '../spacetimedb/src/data/uniques';
import { RAIDS, RAIDS_BY_ID } from '../spacetimedb/src/data/raids';
import { ENEMIES_BY_ID, WALL_FACTOR, ZONES, isWallTier } from '../spacetimedb/src/data/zones';
import { EFFECTS_BY_ID } from '../spacetimedb/src/data/legendary';
import { MATERIALS, MATERIAL_KINDS, materialOf } from '../spacetimedb/src/data/materials';

let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed++;
}
const unique = (xs: number[]) => new Set(xs).size === xs.length;
const near = (a: number, b: number) => Math.abs(a - b) < 0.01;

check('base IDs unique', unique(BASE_LIST.map(b => b.id)));
check('34 types', TYPE_LIST.length === 34, String(TYPE_LIST.length));
check('type IDs unique', unique(TYPE_LIST.map(t => t.id)));
check('every type has a core base of its ID; the core bases are the zone bases', TYPE_LIST.every(t => base(t.id).typeId === t.id) &&
  ZONE_BASES.length === TYPE_LIST.length);
check('bases match their type', BASE_LIST.every(b => {
  const t = TYPES.get(b.typeId);
  return !!t && t.kind === b.kind && t.name === b.family && t.slots.join() === b.slots.join();
}));
check('variants have a source', BASE_LIST.every(b => b.id === b.typeId || b.raidId !== undefined));
check('raid-only bases: their raid exists and drops them', BASE_LIST.every(b => b.raidId === undefined ||
  RAIDS_BY_ID.get(b.raidId)?.boss.drops.includes(b.id) === true));
check("raids drop no other raid's bases", RAIDS.every(r => r.boss.drops.every(id => [undefined, r.id].includes(base(id).raidId))));
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
check('enemy-bound uniques: a secret enemy of their own tier', UNIQUES.every(u => u.enemyId === undefined ||
  (ENEMIES_BY_ID.get(u.enemyId)?.enemy.secret === true && ENEMIES_BY_ID.get(u.enemyId)!.zone.tier === u.tier)));
check('every unique-only effect is on some unique', UNIQUE_EFFECTS.every(e => UNIQUES.some(u => u.effects.includes(e.id))));
check('material IDs unique and tier × 10 + kind', unique(MATERIALS.map(m => m.id)) &&
  MATERIALS.every(m => m.id === m.tier * 10 + MATERIAL_KINDS.indexOf(m.kind) + 1));
for (const zone of ZONES) {
  check(`${zone.name}: one material of each kind at tier ${zone.tier}`, MATERIAL_KINDS.every(k => materialOf(zone.tier, k)?.tier === zone.tier));
  check(`${zone.name}: every enemy drops 1–3 distinct material kinds`, zone.enemies.every(e =>
    e.materials.length >= 1 && e.materials.length <= 3 && new Set(e.materials).size === e.materials.length));
  check(`${zone.name}: every kind drops from some regular enemy`,
    MATERIAL_KINDS.every(k => zone.enemies.some(e => !e.boss && e.materials.includes(k))));
}
check('stat IDs match keys', Object.entries(STATS).every(([k, d]) => Number(k) === d.id));

for (const zone of ZONES) {
  const regular = zone.enemies.filter(e => !e.boss && !e.secret);
  const drops = regular.flatMap(e => e.drops);
  check(`${zone.name}: every zone base drops from exactly one enemy`, unique(drops) && drops.length === ZONE_BASES.length &&
    ZONE_BASES.every(b => drops.includes(b.id)),
    `${drops.length} drops`);
  check(`${zone.name}: one boss`, zone.enemies.filter(e => e.boss).length === 1);
  check(`${zone.name}: drop IDs exist`, drops.every(id => BASE_LIST.some(b => b.id === id)));
  const inAreas = zone.areas.flatMap(a => a.enemies);
  check(`${zone.name}: every enemy in exactly one area`, unique(inAreas) && inAreas.length === zone.enemies.length &&
    zone.enemies.every(e => inAreas.includes(e.id)));
  check(`${zone.name}: area IDs are zone × 10 + n`, zone.areas.every((a, i) => a.id === zone.id * 10 + i + 1));
  const lair = zone.areas.find(a => a.enemies.some(id => ENEMIES_BY_ID.get(id)!.enemy.boss));
  check(`${zone.name}: boss alone in its lair`, lair?.enemies.length === 1 && !lair.secret);
  const open = zone.areas.filter(a => !a.secret).flatMap(a => a.enemies);
  check(`${zone.name}: areas in level order`, open.every((id, i) => i === 0 ||
    ENEMIES_BY_ID.get(id)!.enemy.level > ENEMIES_BY_ID.get(open[i - 1])!.enemy.level));
  check(`${zone.name}: the first area is not secret`, !zone.areas[0].secret);
  check(`${zone.name}: secret areas hold exactly the secret enemies`, zone.areas.every(a =>
    a.enemies.every(id => !!ENEMIES_BY_ID.get(id)!.enemy.secret === !!a.secret)));
  check(`${zone.name}: secrets are found by killing a regular enemy of the zone, hinted first`, zone.areas.every(a => !a.secret ||
    (regular.some(e => e.id === a.secret!.enemyId) && a.secret.hint > 0 && a.secret.hint < a.secret.kills)));
  check(`${zone.name}: secret enemies drop existing bases`, zone.enemies.filter(e => e.secret).every(e =>
    e.drops.length > 0 && e.drops.every(id => BASE_LIST.some(b => b.id === id))));
  check(`${zone.name}: map spots inside the map`, zone.areas.every(a => a.x >= 0 && a.x <= 100 && a.y >= 0 && a.y <= 100));
  const ids = new Set(zone.areas.map(a => a.id));
  check(`${zone.name}: map paths join two of its areas`, zone.links.every(([a, b]) => a !== b && ids.has(a) && ids.has(b)));
  const seen = new Set([zone.areas[0].id]);
  for (let grew = true; grew;) {
    grew = false;
    for (const [a, b] of zone.links) if (seen.has(a) !== seen.has(b)) { seen.add(a); seen.add(b); grew = true; }
  }
  check(`${zone.name}: every area joined to the map`, seen.size === ids.size);
}
for (const zone of ZONES) {
  // Average enemy (o = 0) matches the reference curve, × WALL_FACTOR on wall tiers (zones.md).
  const avg = zone.enemies.find(e => e.level === 10 * zone.tier);
  if (!avg || zone.tier === 1) continue;
  const wall = isWallTier(zone.tier) ? WALL_FACTOR : 1;
  const hp = 70 * curve('offense', zone.tier) * (1 + 0.15 * zone.tier) * wall;
  const dps = 16 * 1.42 ** (zone.tier - 1) * wall;
  check(`${zone.name}: average enemy on curve`, Math.abs(avg.hp / hp - 1) < 0.01 && Math.abs(avg.dps / dps - 1) < 0.01,
    `hp ${avg.hp} vs ${hp.toFixed(0)}, dps ${avg.dps} vs ${dps.toFixed(1)}`);
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
check('T9 sword hit ≈ 740', near(Math.round(weaponValues(base(1).weapon!, 9).hit), 740));
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
