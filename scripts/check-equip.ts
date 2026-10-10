// Checks for equipping rules and auto-equip (spacetimedb/src/equip.ts). No server needed:
//   npm run test:equip
import { SLOTS } from '../spacetimedb/src/data/bases';
import { Stat, toStored } from '../spacetimedb/src/data/stats';
import { mitigation } from '../spacetimedb/src/combat';
import { autoEquip, fitsSlot, placeItem, referenceDummy, scoreGear, type OwnedItem, type Profile } from '../spacetimedb/src/equip';
import { makeItem, seededRng, type RarityName } from '../spacetimedb/src/loot';

let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed++;
}

let nextId = 1n;
const rng = seededRng(42n);
/** An owned item; `affixes` in display units replace the rolled ones when given. */
function own(baseId: number, tier = 1, rarity: RarityName = 'Rare', affixes?: [number, number][]): OwnedItem {
  const it = makeItem(rng, baseId, tier, rarity);
  return {
    ...it,
    id: nextId++,
    affixes: affixes ? affixes.map(([stat, v]) => ({ stat, tier, value: toStored(v) })) : it.affixes,
  };
}
const S = (name: (typeof SLOTS)[number]) => SLOTS.indexOf(name);
const empty = () => SLOTS.map(() => 0n);

// ---------------------------------------------------------------- slot rules

const sword = own(1);
const greatsword = own(7);
const shield = own(20);
const ring = own(50);
const items = new Map([sword, greatsword, shield, ring].map(i => [i.id, i]));
const lookup = (id: bigint) => items.get(id);
{
  check('sword fits main hand only', fitsSlot(1, S('MainHand')) && !fitsSlot(1, S('OffHand')) && !fitsSlot(1, S('Head')));
  check('rings fit either ring slot', fitsSlot(50, S('Ring1')) && fitsSlot(50, S('Ring2')) && !fitsSlot(50, S('Amulet')));
  check('wrong slot rejected', typeof placeItem(empty(), S('Head'), sword, lookup) === 'string');

  const withShield = placeItem(placeItem(empty(), S('MainHand'), sword, lookup) as bigint[], S('OffHand'), shield, lookup) as bigint[];
  check('one-hander + shield', withShield[S('MainHand')] === sword.id && withShield[S('OffHand')] === shield.id);
  const twoH = placeItem(withShield, S('MainHand'), greatsword, lookup) as bigint[];
  check('two-hander empties the off-hand', twoH[S('MainHand')] === greatsword.id && twoH[S('OffHand')] === 0n);
  check('off-hand next to a two-hander rejected', typeof placeItem(twoH, S('OffHand'), shield, lookup) === 'string');

  const r1 = placeItem(empty(), S('Ring1'), ring, lookup) as bigint[];
  const r2 = placeItem(r1, S('Ring2'), ring, lookup) as bigint[];
  check('an item moves between slots instead of filling two', r2[S('Ring1')] === 0n && r2[S('Ring2')] === ring.id);
}

// ---------------------------------------------------------------- reference dummy

{
  const d = referenceDummy(20);
  check('dummy has 33% mitigation', Math.abs(mitigation(d.armor, 0, 20) - 1 / 3) < 1e-9);
  check('dummy DPS matches the average enemy (T1 16, T2 ≈ 22.7)', Math.abs(referenceDummy(10).dps - 16) < 1e-9 && Math.abs(d.dps - 22.72) < 0.01);
  const bare = scoreGear(10, []);
  const tanky = scoreGear(10, [undefined, undefined, undefined, own(39, 1, 'Common')]);
  check('no weapon: no DPS', bare.dps === 0);
  check('plate chest raises time to die', tanky.timeToDie > bare.timeToDie);
}

// ---------------------------------------------------------------- auto-equip

/** Exhaustive search over every legal combination, for comparison. */
function bruteForce(level: number, pool: OwnedItem[], profile: Profile) {
  const fitting = (slot: number) => [undefined, ...pool.filter(i => fitsSlot(i.baseId, slot))];
  let best = -Infinity;
  const rankOf = (ids: bigint[]) => {
    const s = scoreGear(level, ids.map(id => pool.find(i => i.id === id)));
    return profile === 'Damage' ? s.dps : profile === 'Survival' ? s.timeToDie : s.dps * (1 + s.itemFind);
  };
  const walk = (slot: number, ids: bigint[]) => {
    if (slot === SLOTS.length) return void (best = Math.max(best, rankOf(ids)));
    for (const it of fitting(slot)) {
      if (it && ids.includes(it.id)) continue;
      if (slot === S('OffHand') && it && pool.find(i => i.id === ids[S('MainHand')])?.weapon?.twoHanded) continue;
      walk(slot + 1, [...ids, it?.id ?? 0n]);
    }
  };
  walk(0, []);
  return best;
}

const pool = [
  own(1, 2), own(2, 2), own(7, 2), own(5, 2), // sword, dagger, greatsword, wand
  own(20, 2), own(21, 2), // shield, tome
  own(30, 2), own(38, 2), // cloth hood, plate helm
  own(35, 2), own(39, 2), // leather vest, breastplate
  own(50, 2), own(51, 2), own(53, 2, 'Rare', [[Stat.ItemFindPct, 10]]), // rings
  own(57, 2), // amulet
];
for (const profile of ['Damage', 'Survival', 'Loot'] as Profile[]) {
  const slots = autoEquip(20, pool, empty(), profile);
  const gear = slots.map(id => pool.find(i => i.id === id));
  const s = scoreGear(20, gear);
  const got = profile === 'Damage' ? s.dps : profile === 'Survival' ? s.timeToDie : s.dps * (1 + s.itemFind);
  const best = bruteForce(20, pool, profile);
  check(`${profile}: matches the exhaustive best`, got >= best * 0.999, `${got.toFixed(2)} vs ${best.toFixed(2)}`);
  const ids = slots.filter(id => id !== 0n);
  check(`${profile}: legal loadout`, new Set(ids).size === ids.length &&
    slots.every((id, slot) => id === 0n || fitsSlot(pool.find(i => i.id === id)!.baseId, slot)) &&
    !(gear[S('MainHand')]?.weapon?.twoHanded && slots[S('OffHand')] !== 0n));
  check(`${profile}: stable when run again`, autoEquip(20, pool, slots, profile).join() === slots.join());
}
{
  const dmg = scoreGear(20, autoEquip(20, pool, empty(), 'Damage').map(id => pool.find(i => i.id === id)));
  const surv = scoreGear(20, autoEquip(20, pool, empty(), 'Survival').map(id => pool.find(i => i.id === id)));
  check('Damage out-damages Survival; Survival outlasts Damage', dmg.dps >= surv.dps && surv.timeToDie >= dmg.timeToDie,
    `dps ${dmg.dps.toFixed(1)}/${surv.dps.toFixed(1)}, ttd ${dmg.timeToDie.toFixed(1)}/${surv.timeToDie.toFixed(1)}`);
  const loot = autoEquip(20, pool, empty(), 'Loot');
  check('Loot keeps the item-find ring', loot.includes(pool[12].id));
  check('nothing to equip leaves the loadout empty', autoEquip(1, [], empty(), 'Damage').every(id => id === 0n));
  check('unknown item IDs are dropped', autoEquip(1, [], [999n, ...empty().slice(1)], 'Damage').every(id => id === 0n));
}

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
