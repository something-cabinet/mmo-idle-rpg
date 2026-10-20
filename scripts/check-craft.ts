// Checks for crafting costs and rolls (spacetimedb/src/craft.ts). No server needed:
//   npm run test:craft
import { LEGENDARIES_BY_ID } from '../spacetimedb/src/data/legendary';
import { BAG_MAX, BAG_START } from '../spacetimedb/src/game';
import { makeItem, makeUnique, seededRng, uniqueStatRange, type NewItem } from '../spacetimedb/src/loot';
import { BOUND_LEGENDARY, Corruption, applyChisel, chiselBlocker } from '../spacetimedb/src/chisel';
import { CHISELS_BY_ID, ChiselKind, chiselSupplyId } from '../spacetimedb/src/data/supplies';
import { UNIQUES } from '../spacetimedb/src/data/uniques';
import { affixRange, fromStored, roundStat, type StatId } from '../spacetimedb/src/data/stats';
import {
  BAG_STEP,
  bagExpansionCost,
  CORRUPTED,
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

// ---------------------------------------------------------------- chisels (chisel.ts)

{
  const chisel = (k: ChiselKind) => CHISELS_BY_ID.get(chiselSupplyId(k))!;
  const [recal, chaos, bind, improve] = [ChiselKind.Recalibration, ChiselKind.Chaos, ChiselKind.Binding, ChiselKind.Improvement].map(chisel);
  const rng = seededRng(42n);
  const leg = makeItem(seededRng(5n), 1, 6, 'Legendary');
  const inRange = (a: NewItem['affixes'][number]) => {
    // Values round to the stat's display step, so the bounds round too.
    const [lo, hi] = affixRange(a.stat as StatId, a.tier).map(x => roundStat(a.stat as StatId, x));
    const v = fromStored(a.value);
    return v >= lo - 0.011 && v <= hi + 0.011;
  };
  const json = (x: unknown) => JSON.stringify(x, (_, v) => (typeof v === 'bigint' ? String(v) : v));
  const same = (a: unknown, b: unknown) => json(a) === json(b);

  const r = applyChisel(rng, recal, leg);
  check('Recalibration: same stats and tiers, values within the tier, same legendary effect', isItem(r) &&
    r.affixes.every((a, i) => a.stat === leg.affixes[i].stat && a.tier === leg.affixes[i].tier && inRange(a)) &&
    r.legendary!.effect === leg.legendary!.effect && !same(r.affixes, leg.affixes));
  const u = UNIQUES[0];
  const uniq = makeUnique(seededRng(9n), u);
  const ru = applyChisel(rng, recal, uniq);
  check('Recalibration works on Uniques, within their roll range', isItem(ru) && ru.affixes.every((a, i) => {
    const [lo, hi] = uniqueStatRange(u, u.stats[i]);
    const v = fromStored(a.value);
    return a.stat === uniq.affixes[i].stat && a.tier === 0 && v >= Math.min(lo, hi) - 0.011 && v <= Math.max(lo, hi) + 0.011;
  }));
  check('Uniques take no other chisel', [chaos, bind, improve].every(c => chiselBlocker(c, uniq, 0) === 'Uniques take only the Recalibration Chisel'));
  check('Anomalies take no chisel', [recal, chaos, bind, improve].every(c => chiselBlocker(c, makeItem(seededRng(3n), 1, 3, 'Anomaly'), 0) !== undefined));
  check('Commons have nothing to chisel', chiselBlocker(chaos, makeItem(seededRng(3n), 1, 3, 'Common')) === 'No affixes to reroll');

  const c = applyChisel(rng, chaos, leg);
  check('Chaos: as many affixes, all rerolled, a new legendary affix', isItem(c) && c.affixes.length === leg.affixes.length &&
    !same(c.affixes, leg.affixes) && c.legendary !== undefined && c.affixes.every(inRange));

  const b = applyChisel(rng, bind, leg, 1);
  check('Binding: binds the chosen affix; only one per item', isItem(b) && b.boundAffix === 2 && chiselBlocker(bind, b, 0) === 'It already has a bound affix');
  const bl = applyChisel(rng, bind, leg, BOUND_LEGENDARY);
  check('Binding can bind the legendary affix', isItem(bl) && bl.boundAffix === BOUND_LEGENDARY);
  if (isItem(b) && isItem(bl)) {
    const cb = applyChisel(rng, chaos, b);
    const rb = applyChisel(rng, recal, b);
    check('Chaos and Recalibration leave the bound affix', isItem(cb) && isItem(rb) && same(cb.affixes[1], leg.affixes[1]) && same(rb.affixes[1], leg.affixes[1]));
    const cl = applyChisel(rng, chaos, bl);
    check('Chaos leaves a bound legendary affix', isItem(cl) && same(cl.legendary, leg.legendary));
    check('gold reroll refuses the bound affix', rerollAffix(rng, b, 1) === "A bound affix can't be rerolled" && isItem(rerollAffix(rng, b, 0)));
  }
  const epic = { ...makeItem(seededRng(8n), 1, 6, 'Epic'), boundAffix: 3 };
  const up = upgradeRarity(rng, epic, 0);
  check('Epic → Legendary: the bound affix moves down with the others; removing it is refused',
    isItem(up) && up.boundAffix === 2 && same(up.affixes[1], epic.affixes[2]) && upgradeRarity(rng, epic, 2) === "A bound affix can't be removed");

  const low = { ...leg, affixes: leg.affixes.map(a => ({ ...a, tier: 2 })) };
  const im = applyChisel(rng, improve, low, 0);
  check('Improvement: one tier up, the rest unchanged', isItem(im) && im.affixes[0].tier === 3 && im.affixes[0].stat === low.affixes[0].stat &&
    inRange(im.affixes[0]) && same(im.affixes.slice(1), low.affixes.slice(1)));
  const top = { ...leg, affixes: leg.affixes.map(a => ({ ...a, tier: 6 })) };
  check('Improvement refuses a bound affix', chiselBlocker(improve, { ...low, boundAffix: 1 }, 0) === "A bound affix can't be improved" &&
    chiselBlocker(improve, { ...low, boundAffix: 1 }, 1) === undefined);
  // Corruption: 4 outcomes while there are no corrupted affixes, then no more crafting.
  const corruptC = chisel(ChiselKind.Corruption);
  // Every affix at T9, so a raised one goes past the item's tier.
  const t9 = { ...makeItem(seededRng(11n), 1, 9, 'Epic', 9), boundAffix: 2 };
  const counts = new Map<number, number>();
  let boundKept = true;
  let tiersOk = true;
  let reachedT10 = false;
  const N = 8000;
  for (let n = 0; n < N; n++) {
    const out = applyChisel(seededRng(BigInt(n), 77n), corruptC, t9);
    if (!isItem(out)) { tiersOk = false; continue; }
    counts.set(out.corruption, (counts.get(out.corruption) ?? 0) + 1);
    const b = out.affixes[out.boundAffix - 1];
    if (!same(b, t9.affixes[1])) boundKept = false;
    if (out.affixes.some(a => a.tier < 1 || a.tier > 10 || !inRange(a))) tiersOk = false;
    if (out.affixes.some(a => a.tier === 10)) reachedT10 = true;
  }
  const share = (...ks: Corruption[]) => ks.reduce((sum, k) => sum + (counts.get(k) ?? 0), 0) / N;
  check('Corruption: count, tier, nothing and reroll ~25% each (no corrupted affixes yet)',
    [share(Corruption.AddedAffix, Corruption.RemovedAffix), share(Corruption.RaisedTier, Corruption.LoweredTier), share(Corruption.Nothing), share(Corruption.Rerolled)]
      .every(x => Math.abs(x - 0.25) < 0.03) && share(Corruption.CorruptedAffix) === 0,
    [...counts].sort().map(([k, n]) => `${k}:${n}`).join(' '));
  check('Corruption: tiers 1–10, a T9 item can reach T10, values in range', tiersOk && reachedT10);
  check('Corruption never changes or removes a bound affix', boundKept);
  const added = [...Array(50).keys()].map(n => applyChisel(seededRng(BigInt(n), 5n), corruptC, t9)).find(x => isItem(x) && x.corruption === Corruption.AddedAffix);
  check('Corruption can add an affix past the usual count', isItem(added!) && (added as NewItem).affixes.length === t9.affixes.length + 1);
  const corrupted = { ...t9, corruption: Corruption.Nothing };
  check('a corrupted item takes no chisel, reroll or upgrade', [recal, chaos, bind, improve, corruptC].every(c => chiselBlocker(c, corrupted, 0) === CORRUPTED) &&
    rerollAffix(rng, corrupted, 0) === CORRUPTED && upgradeRarity(rng, corrupted, 0) === CORRUPTED);
  check('Uniques take no Corruption Chisel', chiselBlocker(corruptC, uniq) === 'Uniques take only the Recalibration Chisel');
  check("Improvement stops at the item's tier", chiselBlocker(improve, top, 0) === "Already at the item's tier (T6)");
}

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
