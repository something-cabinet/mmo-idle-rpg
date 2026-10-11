// Checks for drops, affix rolls, the loot filter and salvage (spacetimedb/src/loot.ts).
// No server needed:
//   npm run test:loot
import { BASE_LIST, base, implicitValue } from '../spacetimedb/src/data/bases';
import { LEGENDARIES_BY_ID } from '../spacetimedb/src/data/legendary';
import { STATS, Stat, affixRange, affixRef, toStored } from '../spacetimedb/src/data/stats';
import { ENEMIES_BY_ID, ZONES_BY_ID, bossOf, rewardScale } from '../spacetimedb/src/data/zones';
import {
  FORTUNE_CHANCE,
  AFFIX_STAT_IDS,
  FIRST_KILL_GOLD_MULT,
  KEEP_CAP_PER_SETTLE,
  firstKillReward,
  RARITIES,
  REGULAR_AFFIXES,
  makeItem,
  rarityRank,
  rollAffix,
  rollDrops,
  salvageValue,
  samplePoisson,
  seededRng,
  type DropInput,
} from '../spacetimedb/src/loot';

let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed++;
}
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

// ---------------------------------------------------------------- random

{
  const a = seededRng(7n, 123n);
  const b = seededRng(7n, 123n);
  const c = seededRng(7n, 124n);
  const xs = Array.from({ length: 1000 }, a);
  check('same seed, same sequence', xs.slice(0, 10).every(x => x === b()));
  check('different seed, different sequence', Array.from({ length: 10 }, c).some((x, i) => x !== xs[i]));
  check('values in [0, 1) with mean ~0.5', xs.every(x => x >= 0 && x < 1) && near(mean(xs), 0.5, 0.03), mean(xs).toFixed(3));

  const rng = seededRng(1n);
  for (const m of [0.2, 3, 170, 2000]) {
    const got = mean(Array.from({ length: 2000 }, () => samplePoisson(rng, m)));
    check(`Poisson mean ${m}`, near(got, m, Math.max(0.05, m * 0.03)), got.toFixed(2));
  }
  check('Poisson of mean 0 is 0', samplePoisson(rng, 0) === 0);
}

// ---------------------------------------------------------------- affixes and items

{
  const rng = seededRng(2n);
  const rolls = Array.from({ length: 20_000 }, () => rollAffix(rng, 5));
  check('affix tiers are 1..N', rolls.every(r => r.tier >= 1 && r.tier <= 5));
  check('affix values fall in their tier range (± rounding)', rolls.every(r => {
    const [lo, hi] = affixRange(r.stat as keyof typeof STATS, r.tier);
    const v = Number(r.value) / 100;
    return (v >= lo - 0.5 || v === 1) && v <= Math.max(1, hi + 0.5);
  }));
  check('Finesse T1 is 0–4.44 on any item (even slices of the T9 range)',
    affixRange(Stat.Finesse, 1).every((x, i) => near(x, [0, 40 / 9][i], 1e-9)));
  check('Finesse T9 is 35.6–40', near(affixRange(Stat.Finesse, 9)[0], 320 / 9, 1e-9) && near(affixRange(Stat.Finesse, 9)[1], 40, 1e-9));
  check('phys damage T3 follows the curve: ref(T2)–ref(T3)',
    near(affixRange(Stat.PhysDamage, 3)[0], affixRef(Stat.PhysDamage, 2), 1e-9) && near(affixRange(Stat.PhysDamage, 3)[1], affixRef(Stat.PhysDamage, 3), 1e-9));
  check('phys damage T1 is 0–2', near(affixRange(Stat.PhysDamage, 1)[0], 0, 1e-9) && near(affixRange(Stat.PhysDamage, 1)[1], 2, 1e-9));
  const t1 = Array.from({ length: 2000 }, () => rollAffix(rng, 1));
  check('a T1 item only rolls T1 affixes', t1.every(r => r.tier === 1));
  check('affix values are whole except lifesteal and HP regen', rolls.every(r =>
    STATS[r.stat as keyof typeof STATS].decimals || (r.value % 100n === 0n && r.value >= 100n)));
  check('lifesteal keeps decimals', rolls.some(r => r.stat === Stat.LifestealPct && r.value % 100n !== 0n));
  const hp = rolls.filter(r => r.stat === Stat.MaxHp).map(r => Number(r.value) / 100);
  // Uniform over tiers 1..5: the mean of each tier's midpoint.
  const hpMean = [1, 2, 3, 4, 5].reduce((sum, k) => sum + (affixRange(Stat.MaxHp, k)[0] + affixRange(Stat.MaxHp, k)[1]) / 2, 0) / 5;
  check(`max HP on T5 averages ≈ ${hpMean.toFixed(0)}`, near(mean(hp), hpMean, 4), mean(hp).toFixed(1));
  const lifesteal = rolls.filter(r => r.stat === Stat.LifestealPct).length;
  check('lifesteal is rare (weight 10)', lifesteal > 0 && lifesteal < hp.length / 4, `${lifesteal} vs ${hp.length} max HP`);
  check('same affix can roll on every stat', new Set(rolls.map(r => r.stat)).size === Object.keys(STATS).length);

  for (const rarity of RARITIES.filter(r => r !== 'Unique')) {
    const it = makeItem(rng, 1, 3, rarity);
    check(`${rarity} has ${REGULAR_AFFIXES[rarity]} affixes${rarity === 'Legendary' ? ' + legendary' : ''}`,
      it.affixes.length === REGULAR_AFFIXES[rarity] && (rarity === 'Legendary') === !!it.legendary);
  }

  const sword = makeItem(rng, 1, 2, 'Common');
  check('T2 sword stores hit 21, 1.0/s, 5% crit', sword.weapon?.hit === 2100n && sword.weapon.speedMilli === 1000 && sword.weapon.baseCritBp === 500);
  const plate = makeItem(rng, 39, 5, 'Common');
  check('implicits are stored literally', plate.implicits.every((imp, i) => imp.value === toStored(implicitValue(base(39).implicits[i], 5))));
  check('armor has no weapon', plate.weapon === undefined);

  const groupOf = (baseId: number) => {
    const it = makeItem(rng, baseId, 4, 'Legendary');
    const def = LEGENDARIES_BY_ID.get(it.legendary!.effect)!;
    const ref = affixRef(def.bonusStat, 4);
    const v = Number(it.legendary!.value) / 100;
    const tol = STATS[def.bonusStat].decimals ? 0.01 : 0.5;
    return { group: def.group, inRange: it.legendary!.stat === def.bonusStat && (v >= ref * 0.25 - tol || v === 1) && v <= Math.max(1, ref * 0.5 + tol) };
  };
  const sample = (id: number) => Array.from({ length: 30 }, () => groupOf(id));
  check('weapons and tome roll Offense legendaries', [1, 21].flatMap(sample).every(g => g.group === 'Offense'));
  check('armor and shield roll Defense legendaries', [35, 20].flatMap(sample).every(g => g.group === 'Defense'));
  check('jewelry rolls Utility legendaries', [50, 57].flatMap(sample).every(g => g.group === 'Utility'));
  check('legendary bonus is 0.25–0.5 × ref', [1, 35, 50].flatMap(sample).every(g => g.inRange));
  check('every base can be made', BASE_LIST.every(b => makeItem(rng, b.id, 9, 'Epic').baseId === b.id));
}

// ---------------------------------------------------------------- drops, filter, salvage

check('salvage: Rare T1 = 5 Essence', salvageValue('Rare', 1) === 5n);
check('salvage: Epic T2 = 58 Essence', salvageValue('Epic', 2) === 58n);

const wisp = ENEMIES_BY_ID.get(104)!;
const rat = ENEMIES_BY_ID.get(101)!;
check('reward scale: average enemy 1, Field Rat 0.35, boss ≈ 1.12^7',
  near(rewardScale(wisp.zone, wisp.enemy), 1, 1e-9) && near(rewardScale(rat.zone, rat.enemy), 0.35, 1e-9) &&
  near(rewardScale(wisp.zone, ENEMIES_BY_ID.get(106)!.enemy), 1.12 ** 7, 0.02));

const session = (over: Partial<DropInput> = {}): DropInput => ({
  kills: 1900, // ~8 h against the average enemy (zones.md)
  enemy: wisp.enemy,
  tier: 1,
  rewardScale: 1,
  itemFind: 0,
  filter: { minRarity: 'Rare', keepAffixes: [], keepBases: [], minAffixTier: 1 },
  bagFree: 200,
  ...over,
});
const total = (r: ReturnType<typeof rollDrops>) => r.kept.length + Object.values(r.salvaged).reduce((a, b) => a + b, 0);
{
  const runs = Array.from({ length: 200 }, (_, i) => rollDrops(seededRng(BigInt(i)), session()));
  const drops = mean(runs.map(total));
  const kept = mean(runs.map(r => r.kept.length));
  check('8 h on the average enemy: ~145 drops', near(drops, 145, 7), drops.toFixed(1));
  check('… keeping Rare+: ~17 kept', near(kept, 17, 2), kept.toFixed(1));
  check('kept items pass the filter', runs.every(r => r.kept.every(it => rarityRank(it.rarity.tag) >= rarityRank('Rare'))));
  check('drops come from the enemy\'s bases at the zone tier', runs.every(r => r.kept.every(it => wisp.enemy.drops.includes(it.baseId) && it.tier === 1)));
  check('Essence is the sum of salvage values', runs.every(r =>
    r.essence === RARITIES.reduce((sum, rar) => sum + BigInt(r.salvaged[rar]) * salvageValue(rar, 1), 0n)));
  check('no uniques yet', runs.every(r => r.salvaged.Unique === 0 && r.kept.every(it => it.rarity.tag !== 'Unique')));

  const again = rollDrops(seededRng(5n), session());
  check('drops are reproducible from the seed', JSON.stringify(again, (_k, v) => typeof v === 'bigint' ? String(v) : v) ===
    JSON.stringify(runs[5], (_k, v) => typeof v === 'bigint' ? String(v) : v));

  const found = mean(Array.from({ length: 200 }, (_, i) => total(rollDrops(seededRng(BigInt(i)), session({ itemFind: 1 })))));
  check('+100% item find doubles drops', near(found, 290, 14), found.toFixed(1));
  const rats = mean(Array.from({ length: 200 }, (_, i) => total(rollDrops(seededRng(BigInt(i)), session({ rewardScale: 0.35 })))));
  check('weaker enemies drop less (reward scale)', near(rats, 145 * 0.35, 4), rats.toFixed(1));

  const wl = rollDrops(seededRng(9n), session({ kills: 2000, filter: { minRarity: 'Magic', keepAffixes: [Stat.ItemFindPct], keepBases: [], minAffixTier: 1 } }));
  check('affix filter keeps only drops with a checked affix',
    wl.kept.length > 0 && wl.kept.every(it => it.rarity.tag !== 'Common' && it.affixes.some(a => a.stat === Stat.ItemFindPct)),
    `${wl.kept.length} kept`);
  const allAffixes = rollDrops(seededRng(9n), session({ kills: 2000, filter: { minRarity: 'Magic', keepAffixes: AFFIX_STAT_IDS, keepBases: [], minAffixTier: 1 } }));
  const noAffixes = rollDrops(seededRng(9n), session({ kills: 2000, filter: { minRarity: 'Magic', keepAffixes: [], keepBases: [], minAffixTier: 1 } }));
  check('all affixes checked or none: no affix restriction',
    allAffixes.kept.length > wl.kept.length && allAffixes.kept.length === noAffixes.kept.length && allAffixes.salvaged.Magic === noAffixes.salvaged.Magic,
    `${allAffixes.kept.length} / ${noAffixes.kept.length} kept`);

  const family = wisp.enemy.drops[0];
  const oneFamily = rollDrops(seededRng(9n), session({ kills: 2000, filter: { minRarity: 'Magic', keepAffixes: [], keepBases: [family], minAffixTier: 1 } }));
  check('family filter keeps only checked families',
    oneFamily.kept.length > 0 && oneFamily.kept.length < noAffixes.kept.length && oneFamily.kept.every(it => it.baseId === family),
    `${oneFamily.kept.length} kept`);
  const allBases = rollDrops(seededRng(9n), session({ kills: 2000, filter: { minRarity: 'Magic', keepAffixes: [], keepBases: BASE_LIST.map(b => b.id), minAffixTier: 1 } }));
  check('all families checked: no family restriction', allBases.kept.length === noAffixes.kept.length, `${allBases.kept.length} kept`);
  const t3 = rollDrops(seededRng(9n), session({ tier: 5, kills: 2000, filter: { minRarity: 'Magic', keepAffixes: [], keepBases: [], minAffixTier: 3 } }));
  const t3all = rollDrops(seededRng(9n), session({ tier: 5, kills: 2000, filter: { minRarity: 'Magic', keepAffixes: [], keepBases: [], minAffixTier: 1 } }));
  check('minimum affix tier keeps only drops with an affix that high',
    t3.kept.length > 0 && t3.kept.length < t3all.kept.length && t3.kept.every(it => it.affixes.some(a => a.tier >= 3)),
    `${t3.kept.length} of ${t3all.kept.length} kept`);

  const flood = rollDrops(seededRng(3n), session({ kills: 20_000, filter: { minRarity: 'Common', keepAffixes: [], keepBases: [], minAffixTier: 1 } }));
  check(`per-settle cap keeps ${KEEP_CAP_PER_SETTLE}`, flood.kept.length === KEEP_CAP_PER_SETTLE && flood.overflow > 0, `overflow ${flood.overflow}`);
  check('… salvaging the lowest rarities first', flood.salvaged.Epic === 0 && flood.salvaged.Legendary === 0 &&
    flood.kept.every((it, i, xs) => i === 0 || rarityRank(xs[i - 1].rarity.tag) >= rarityRank(it.rarity.tag)));
  const full = rollDrops(seededRng(4n), session({ bagFree: 0 }));
  check('full bag salvages every kept drop', full.kept.length === 0 && full.overflow > 0);
  const none = rollDrops(seededRng(4n), session({ kills: 0 }));
  check('no kills, no drops', total(none) === 0 && none.essence === 0n);
}

// ---------------------------------------------------------------- Fortune's Favor

{
  // The upgrade rolls come after every drop roll, so the same seed keeps the same drops.
  const pairs = Array.from({ length: 300 }, (_, i) => [
    rollDrops(seededRng(BigInt(i)), session({ filter: { minRarity: 'Common', keepAffixes: [], keepBases: [], minAffixTier: 1 }, kills: 600 })),
    rollDrops(seededRng(BigInt(i)), session({ filter: { minRarity: 'Common', keepAffixes: [], keepBases: [], minAffixTier: 1 }, kills: 600, fortune: true })),
  ]);
  let eligible = 0;
  let raised = 0;
  let wellFormed = true;
  for (const [plain, lucky] of pairs) {
    const before = plain.kept.map(it => it.rarity.tag).sort();
    const after = lucky.kept.map(it => it.rarity.tag);
    wellFormed &&= plain.kept.length === lucky.kept.length && lucky.essence === plain.essence;
    for (const it of lucky.kept) {
      wellFormed &&= it.affixes.length === REGULAR_AFFIXES[it.rarity.tag] && (it.rarity.tag === 'Legendary') === !!it.legendary;
    }
    eligible += before.filter(r => r !== 'Legendary').length;
    raised += after.reduce((n, r) => n + rarityRank(r), 0) - before.reduce((n, r) => n + rarityRank(r), 0);
  }
  check("Fortune's Favor keeps the same drops and Essence", wellFormed);
  check(`… and raises ~${FORTUNE_CHANCE * 100}% of kept drops one rarity`, near(raised / eligible, FORTUNE_CHANCE, 0.015),
    `${raised} of ${eligible}`);
}

// ---------------------------------------------------------------- boss first kill

for (const zone of ZONES_BY_ID.values()) {
  const boss = bossOf(zone)!;
  const rewards = Array.from({ length: 50 }, (_, i) => firstKillReward(seededRng(BigInt(i)), zone, boss));
  check(`${zone.name}: first kill gives ${FIRST_KILL_GOLD_MULT}× gold and a Rare of tier ${zone.tier} from the zone`,
    rewards.every(r => r.gold === BigInt(boss.gold * FIRST_KILL_GOLD_MULT) && r.item.rarity.tag === 'Rare' &&
      r.item.tier === zone.tier && r.item.affixes.length === 2 && boss.drops.includes(r.item.baseId)) &&
    new Set(rewards.map(r => r.item.baseId)).size > 10);
}

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
