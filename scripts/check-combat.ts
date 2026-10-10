// Checks for the combat formulas and settlement (spacetimedb/src/combat.ts, game.ts).
// No server needed:
//   npm run test:combat
import { SLOTS, STARTER_ARMOR, STARTER_WEAPONS, base, weaponValues, type Slot } from '../spacetimedb/src/data/bases';
import { Stat, toStored } from '../spacetimedb/src/data/stats';
import { ENEMIES_BY_ID } from '../spacetimedb/src/data/zones';
import { MAX_LEVEL, combatStats, matchup, type GearItem } from '../spacetimedb/src/combat';
import { project, xpToNext, type Progress } from '../spacetimedb/src/game';
import { makeItem, seededRng } from '../spacetimedb/src/loot';

let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed++;
}
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
const f = (n: number) => n.toFixed(2);

/** A Common item of `baseId` at `tier` with the given affixes (display units). */
function item(baseId: number, tier: number, affixes: [number, number][] = []): GearItem {
  const it = makeItem(seededRng(0n), baseId, tier, 'Common');
  return { ...it, affixes: affixes.map(([stat, v]) => ({ stat, tier, value: toStored(v) })) };
}
function gear(bySlot: Partial<Record<Slot, GearItem>>) {
  return SLOTS.map(s => bySlot[s]);
}
const enemy = (id: number) => ENEMIES_BY_ID.get(id)!.enemy;

// ---------------------------------------------------------------- reference fights (zone-content.md)

const starter = gear({ MainHand: item(1, 1), Chest: item(35, 1), Feet: item(37, 1) });
{
  const s = combatStats(1, starter);
  check('level 1 has 100 HP (+0.45% from 1 Might and 1 Vitality)', near(s.maxHp, 100.45, 0.01), f(s.maxHp));
  const m = matchup(s, enemy(101));
  check('fresh level 1 + starter kit kills a Field Rat in ~3.4 s', near(m.timeToKill, 3.4, 0.15), f(m.timeToKill));
  check('… and would take ~106 s to die', near(m.timeToDie, 106, 4), f(m.timeToDie));
  check('… so the fight is viable', m.viable && m.killRate > 0);
}

for (const id of STARTER_WEAPONS) {
  const kit = gear({ MainHand: item(id, 1), Chest: item(STARTER_ARMOR[0], 1), Feet: item(STARTER_ARMOR[1], 1) });
  const m = matchup(combatStats(1, kit), enemy(101));
  check(`starter ${base(id).name(1)} beats a Field Rat at level 1`, m.viable && m.timeToKill < 10,
    `kill ${f(m.timeToKill)} s, die ${f(m.timeToDie)} s`);
}

// The average level-10 warrior in T1 Magic gear (preview-data.ts EQUIPPED).
const warrior = gear({
  MainHand: item(1, 1, [[Stat.PhysDamage, 1]]),
  OffHand: item(20, 1, [[Stat.MaxHp, 10]]),
  Head: item(38, 1, [[Stat.MaxHp, 10]]),
  Chest: item(39, 1, [[Stat.Armor, 2.5], [Stat.MaxHp, 14]]),
  Hands: item(40, 1, [[Stat.PhysDamagePct, 5]]),
  Feet: item(41, 1, [[Stat.MaxHp, 10]]),
  Ring1: item(50, 1, [[Stat.CritChancePct, 6.67]]),
  Ring2: item(50, 1, [[Stat.PhysDamagePct, 5]]),
  Amulet: item(57, 1, [[Stat.Might, 6.67], [Stat.MaxHp, 12], [Stat.ItemFindPct, 4]]),
});
{
  const m = matchup(combatStats(10, warrior), enemy(106));
  check('average level-10 warrior kills Grubnak in ~15.7 s', near(m.timeToKill, 15.7, 1.5), f(m.timeToKill));
  // 287 HP with the Might/Vitality HP% rules (zone-content.md).
  check('… and dies in ~19 s', near(m.timeToDie, 19, 1), f(m.timeToDie));
  check('… just wins', m.viable && m.timeToDie / m.timeToKill < 1.3);
  check('a fresh level-1 starter loses to Grubnak', !matchup(combatStats(1, starter), enemy(106)).viable);
}

// ---------------------------------------------------------------- formula details

{
  const naked = matchup(combatStats(1, gear({})), enemy(101));
  check('empty main hand deals no damage and is not viable', naked.dps === 0 && !naked.viable && naked.killRate === 0);

  const dagger = combatStats(1, gear({ MainHand: item(2, 1, [[Stat.PhysDamage, 2]]) }));
  const sword = combatStats(1, gear({ MainHand: item(1, 1, [[Stat.PhysDamage, 2]]) }));
  const addedDps = (s: typeof sword, hit: number) => (s.sources[0].hit.Physical - hit) * s.sources[0].attacksPerSec;
  const daggerHit = weaponValues(base(2).weapon!, 1).hit * (1 + 0.005);
  const swordHit = weaponValues(base(1).weapon!, 1).hit * (1 + 0.005);
  check('flat added damage gives the same DPS on fast and slow weapons',
    near(addedDps(dagger, daggerHit), addedDps(sword, swordHit), 1e-9));

  const plated = combatStats(1, gear({ MainHand: item(1, 1, [[Stat.AttackSpeedPct, -500]]) }));
  check('attack speed floors at 25% of the weapon', near(plated.sources[0].attacksPerSec, 0.25, 1e-9));

  const crit = combatStats(1, gear({ MainHand: item(1, 1, [[Stat.CritChancePct, 5000]]) }));
  check('crit chance is uncapped but rolls use at most 100%',
    crit.sources[0].critChance > 1 && near(crit.sources[0].critMult, 1.5, 1e-9));

  const pen = combatStats(1, gear({ MainHand: item(1, 1, [[Stat.ArmorPenPct, 90]]) }));
  check('armor penetration caps at 75%', pen.armorPen === 0.75);

  const evasive = combatStats(1, gear({ Chest: item(35, 1, [[Stat.EvasionRating, 1e6]]) }));
  check('evasion caps at 60%', matchup(evasive, enemy(101)).evasion === 0.6);

  const healer = combatStats(1, gear({ MainHand: item(10, 1) }));
  check('healing staff heals itself', matchup(healer, enemy(101)).hps > 0);
  check('heal stats do nothing on a weapon without heal',
    combatStats(1, gear({ MainHand: item(1, 1, [[Stat.Heal, 50]]) })).sources[0].heal === 0);
}

// ---------------------------------------------------------------- XP curve and settlement

check('xpToNext(1) = 198', xpToNext(1) === 198n, String(xpToNext(1)));
check('xpToNext(10) = 945', xpToNext(10) === 945n, String(xpToNext(10)));
check('xpToNext(50) ≈ 994k', near(Number(xpToNext(50)), 994_160, 200), String(xpToNext(50)));

const S = 1_000_000n;
const start: Progress = { level: 1, xp: 0n, gold: 0n, settledMicros: 0n };
const rats = { gear: starter, enemy: enemy(101) };
{
  const m = matchup(combatStats(1, starter), enemy(101));
  const p = project(start, rats, 60n * S);
  const kills = Math.floor(60 * m.killRate);
  check('60 s on rats grants whole kills of XP and gold', p.xp === BigInt(kills * 7) && p.gold === BigInt(kills * 2),
    `kills=${kills} xp=${p.xp} gold=${p.gold}`);
  check('leftover time toward the next kill carries over', p.settledMicros < 60n * S && p.settledMicros > 50n * S,
    `settled at ${Number(p.settledMicros) / 1e6} s`);

  let q = start;
  for (let t = 1n; t <= 600n; t++) q = project(q, rats, t * S);
  const once = project(start, rats, 600n * S);
  check('settling every second matches one settle', q.xp === once.xp && q.gold === once.gold && q.level === once.level,
    `${q.xp}/${q.gold} vs ${once.xp}/${once.gold}`);

  const lvl = project(start, rats, 3600n * S);
  check('an hour on rats levels up past level 2', lvl.level >= 2, `level ${lvl.level}`);
  check('… with XP below the next threshold', lvl.xp < xpToNext(lvl.level));

  const naked = project(start, { gear: gear({}), enemy: enemy(101) }, 3600n * S);
  check('a losing fight grants nothing and discards the time',
    naked.xp === 0n && naked.gold === 0n && naked.settledMicros === 3600n * S);
  const noTarget = project(start, { gear: starter, enemy: undefined }, 60n * S);
  check('no target grants nothing', noTarget.gold === 0n && noTarget.settledMicros === 60n * S);

  const capped = project(start, rats, 100n * 3600n * S, 3600n * S);
  check('offline cap limits rewards to the cap', capped.gold === lvl.gold && capped.settledMicros === 100n * 3600n * S,
    `${capped.gold} vs ${lvl.gold}`);

  const maxed = project({ ...start, level: MAX_LEVEL }, rats, 600n * S);
  check('max level earns gold but no XP', maxed.level === MAX_LEVEL && maxed.xp === 0n && maxed.gold > 0n);

  const rich = project(start, { gear: gear({ ...Object.fromEntries(SLOTS.map((s, i) => [s, starter[i]])), Amulet: item(57, 1, [[Stat.GoldFindPct, 100]]) }), enemy: enemy(101) }, 600n * S);
  check('gold find multiplies gold', rich.gold > once.gold, `${rich.gold} vs ${once.gold}`);
}

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
