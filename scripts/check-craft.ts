// Checks for crafting costs and rolls (spacetimedb/src/craft.ts). No server needed:
//   npm run test:craft
import { LEGENDARIES_BY_ID } from '../spacetimedb/src/data/legendary';
import { BAG_MAX, BAG_START } from '../spacetimedb/src/game';
import { makeItem, seededRng, type NewItem } from '../spacetimedb/src/loot';
import {
  BAG_STEP,
  bagExpansionCost,
  craftCost,
  rerollAffix,
  rerollCost,
  REROLL_COST_MULT,
  REROLL_HOURS,
  upgradeCost,
  upgradeRarity,
} from '../spacetimedb/src/craft';

let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed++;
}
const fmt = (c: { gold: bigint; dust: bigint } | undefined) => (c ? `${c.gold} gold, ${c.dust} Dust` : 'none');
const isItem = (x: NewItem | string): x is NewItem => typeof x !== 'string';

// ---------------------------------------------------------------- costs (crafting.md tables)

{
  const t1 = (rarity: NewItem['rarity']['tag']) => makeItem(seededRng(1n), 1, 1, rarity);
  const t9 = (rarity: NewItem['rarity']['tag']) => makeItem(seededRng(1n), 1, 9, rarity);
  const same = (c: { gold: bigint; dust: bigint } | undefined, gold: bigint, dust: bigint) =>
    c?.gold === gold && c.dust === dust;
  const roughly = (c: { gold: bigint; dust: bigint } | undefined, gold: number, dust: number) =>
    !!c && Math.abs(Number(c.gold) / gold - 1) < 0.01 && Math.abs(Number(c.dust) / dust - 1) < 0.01;

  // Reroll expectations follow REROLL_HOURS × REROLL_COST_MULT, so tuning them doesn't break these checks.
  for (const r of ['Magic', 'Rare', 'Epic', 'Legendary'] as const) {
    const h = REROLL_HOURS[r]! * REROLL_COST_MULT;
    const gold = BigInt(Math.round(1200 * h));
    const dust = BigInt(Math.round(15 * h));
    check(`reroll ${r} T1: ${gold} gold, ${dust} Dust`, same(rerollCost(t1(r)), gold, dust), fmt(rerollCost(t1(r))));
  }
  const legT9 = REROLL_HOURS.Legendary! * REROLL_COST_MULT * 2.9 ** 8;
  check('reroll Legendary T9: × 2.9^8', roughly(rerollCost(t9('Legendary')), 1200 * legT9, 15 * legT9), fmt(rerollCost(t9('Legendary'))));
  check('Common and Unique have no reroll cost', rerollCost(t1('Common')) === undefined && rerollCost({ ...t1('Common'), rarity: { tag: 'Unique' } }) === undefined);

  check('upgrade Common T1: 300 gold, 4 Dust', same(upgradeCost(t1('Common')), 300n, 4n));
  check('upgrade Magic T1: 1,200 gold, 15 Dust', same(upgradeCost(t1('Magic')), 1200n, 15n));
  check('upgrade Rare T1: 4,800 gold, 60 Dust', same(upgradeCost(t1('Rare')), 4800n, 60n));
  check('upgrade Epic T1: 28,800 gold, 360 Dust', same(upgradeCost(t1('Epic')), 28_800n, 360n));
  check('upgrade Epic T9: ~144M gold, ~1.8M Dust', roughly(upgradeCost(t9('Epic')), 144.07e6, 1.8009e6), fmt(upgradeCost(t9('Epic'))));
  check('Legendary has no upgrade cost', upgradeCost(t1('Legendary')) === undefined);
  check('cost grows ×2.9 per tier', craftCost(1, 2).gold === 3480n && craftCost(1, 3).gold === 10_092n);
}

// ---------------------------------------------------------------- reroll

{
  const rng = seededRng(2n);
  const rare = makeItem(rng, 1, 4, 'Rare');
  const results = Array.from({ length: 200 }, () => rerollAffix(rng, rare, 1));
  check('reroll replaces only the chosen affix', results.every(r =>
    isItem(r) && r.affixes.length === 2 && r.affixes[0] === rare.affixes[0] && r.rarity.tag === 'Rare' && r.baseId === 1));
  check('reroll rolls like a drop (tier 1..N)', results.every(r => isItem(r) && r.affixes[1].tier >= 1 && r.affixes[1].tier <= 4));
  check('reroll gives new affixes', new Set(results.map(r => isItem(r) && r.affixes[1].stat)).size > 10);
  check('reroll leaves the input unchanged', rare.affixes.length === 2 && results.some(r => isItem(r) && r.affixes[1] !== rare.affixes[1]));

  const leg = makeItem(rng, 50, 3, 'Legendary');
  const r = rerollAffix(rng, leg, 0);
  check('reroll on a Legendary keeps the legendary affix', isItem(r) && r.legendary === leg.legendary);
  check('legendary affix index is not a regular affix', rerollAffix(rng, leg, 2) === 'No such affix');
  check('Common has no affix to reroll', rerollAffix(rng, makeItem(rng, 1, 1, 'Common'), 0) === 'No such affix');
  check("Uniques can't be rerolled", rerollAffix(rng, { ...leg, rarity: { tag: 'Unique' } }, 0) === "Uniques can't be crafted");
}

// ---------------------------------------------------------------- upgrade

{
  const rng = seededRng(3n);
  let it: NewItem | string = makeItem(rng, 35, 2, 'Common');
  for (const expect of ['Magic', 'Rare', 'Epic'] as const) {
    const before: NewItem = it as NewItem;
    it = upgradeRarity(rng, before);
    check(`upgrade ${before.rarity.tag} → ${expect} adds one affix and keeps the rest`, isItem(it) && it.rarity.tag === expect &&
      it.affixes.length === before.affixes.length + 1 && before.affixes.every((a, i) => (it as NewItem).affixes[i] === a) &&
      it.baseId === 35 && it.tier === 2 && it.implicits === before.implicits);
  }
  const epic = it as NewItem;
  check('Epic → Legendary needs an affix to remove', upgradeRarity(rng, epic) === 'Pick an affix to remove' &&
    upgradeRarity(rng, epic, 3) === 'Pick an affix to remove');
  const legs = Array.from({ length: 50 }, () => upgradeRarity(rng, epic, 1)).filter(isItem);
  check('Epic → Legendary removes the chosen affix', legs.length === 50 && legs.every(l =>
    l.rarity.tag === 'Legendary' && l.affixes.length === 2 && l.affixes[0] === epic.affixes[0] && l.affixes[1] === epic.affixes[2]));
  check('… and adds a legendary from the base\'s group (armor: Defense)',
    legs.every(l => LEGENDARIES_BY_ID.get(l.legendary!.effect)?.group === 'Defense'));
  check('Legendary is the top craftable rarity', upgradeRarity(rng, legs[0], 0) === 'Legendary is the highest craftable rarity');
  check("Uniques can't be upgraded", upgradeRarity(rng, { ...epic, rarity: { tag: 'Unique' } }) === "Uniques can't be crafted");
}

// ---------------------------------------------------------------- bag

{
  const costs: bigint[] = [];
  for (let size = BAG_START; size < BAG_MAX; size += BAG_STEP) costs.push(bagExpansionCost(size)!);
  check('8 expansions from 200 to 400', costs.length === 8);
  check('bag costs 50k × 4^n', costs.join() === '50000,200000,800000,3200000,12800000,51200000,204800000,819200000', costs.join());
  check('no expansion past 400', bagExpansionCost(BAG_MAX) === undefined);
}

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
