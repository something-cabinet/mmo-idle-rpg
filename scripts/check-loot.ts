// Checks for drops, affix rolls, the loot filter and salvage (spacetimedb/src/loot.ts).
// No server needed:
//   npm run test:loot
import { BASE_LIST, base, implicitValue } from '../spacetimedb/src/data/bases';
import { LEGENDARIES, LEGENDARIES_BY_ID, UNIQUE_EFFECTS } from '../spacetimedb/src/data/legendary';
import { STATS, Stat, affixRange, affixRef, toStored } from '../spacetimedb/src/data/stats';
import { UNIQUES, UNIQUES_BY_ID, UNIQUE_ROLL_MAX, UNIQUE_ROLL_MIN, uniqueWeight } from '../spacetimedb/src/data/uniques';
import { MATERIAL_CHANCE, MATERIALS_BY_ID } from '../spacetimedb/src/data/materials';
import { DROP_CHANCE, ENEMIES_BY_ID, ZONES_BY_ID, bossOf, rewardScale } from '../spacetimedb/src/data/zones';
import {
  AFFIX_STAT_IDS,
  FIRST_KILL_GOLD_MULT,
  firstKillReward,
  dropChance,
  hasUniques,
  makeUnique,
  pickUnique,
  ANOMALY_AFFIXES,
  ANOMALY_CHANCE,
  LISTED_RARITIES,
  RARITIES,
  REGULAR_AFFIXES,
  makeAnomaly,
  makeItem,
  rarityRank,
  type RarityName,
  rollAffix,
  rollDrops,
  rollMaterials,
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
  check('base crit T1 is 0.5–1, T9 is 4.5–5', near(affixRange(Stat.BaseCritChance, 1)[0], 0.5, 1e-9) && near(affixRange(Stat.BaseCritChance, 1)[1], 1, 1e-9) &&
    near(affixRange(Stat.BaseCritChance, 9)[0], 4.5, 1e-9) && near(affixRange(Stat.BaseCritChance, 9)[1], 5, 1e-9));
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
  check('lifesteal is rare (weight 25)', lifesteal > hp.length / 8 && lifesteal < hp.length / 2, `${lifesteal} vs ${hp.length} max HP`);
  check('same affix can roll on every stat', new Set(rolls.map(r => r.stat)).size === Object.keys(STATS).length);

  for (const rarity of LISTED_RARITIES.filter(r => r !== 'Unique')) {
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
    const def = LEGENDARIES_BY_ID.get(it.legendary!.effect);
    if (!def) return { group: undefined, inRange: false }; // a unique effect: must never roll
    const [lo, hi] = affixRange(def.bonusStat, 4);
    const v = Number(it.legendary!.value) / 100;
    const tol = STATS[def.bonusStat].decimals ? 0.01 : 0.5;
    return { group: def.group, inRange: it.legendary!.stat === def.bonusStat && (v >= lo / 2 - tol || v === 1) && v <= Math.max(1, hi / 2 + tol) };
  };
  const sample = (id: number) => Array.from({ length: 30 }, () => groupOf(id));
  check('weapons and tome roll Offense legendaries', [1, 21].flatMap(sample).every(g => g.group === 'Offense'));
  check('armor and shield roll Defense legendaries', [35, 20, 22].flatMap(sample).every(g => g.group === 'Defense'));
  check('jewelry rolls Utility legendaries', [50, 57].flatMap(sample).every(g => g.group === 'Utility'));
  check('legendary bonus is half a top-affix-tier roll (and no unique effect rolls)', [1, 35, 50].flatMap(sample).every(g => g.inRange));
  const seen = new Set([1, 21, 35, 20, 50, 57].flatMap(id => Array.from({ length: 200 }, () => makeItem(rng, id, 4, 'Legendary').legendary!.effect)));
  check('every legendary effect rolls, no unique effect does',
    LEGENDARIES.every(l => seen.has(l.id)) && UNIQUE_EFFECTS.every(u => !seen.has(u.id)), `${seen.size} effects seen`);
  check('every base can be made', BASE_LIST.every(b => makeItem(rng, b.id, 9, 'Epic').baseId === b.id));
}

// ---------------------------------------------------------------- drops, filter, salvage

check('salvage: Rare T1 = 5 Dust', salvageValue('Rare', 1) === 5n);
check('salvage: Epic T2 = 58 Dust', salvageValue('Epic', 2) === 58n);

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
// Expectations follow DROP_CHANCE, so tuning the drop rates doesn't break these checks.
/** Summed per-kill chance of `min` rarity or better. */
const chanceFrom = (min: RarityName) => LISTED_RARITIES.filter(r => rarityRank(r) >= rarityRank(min)).reduce((sum, r) => sum + DROP_CHANCE[r], 0);
/** Kills that yield ~`drops` of `min` rarity or better (keeps tests clear of the bag limit). */
const killsFor = (drops: number, min: RarityName) => Math.round(drops / chanceFrom(min));
const total = (r: ReturnType<typeof rollDrops>) => r.kept.length + Object.values(r.salvaged).reduce((a, b) => a + b, 0);
{
  // An 8 h session, shortened if the drop rates would push Rare+ near the free bag slots.
  const kills = Math.min(session().kills, killsFor(40, 'Rare'));
  const runs = Array.from({ length: 200 }, (_, i) => rollDrops(seededRng(BigInt(i)), session({ kills })));
  const drops = mean(runs.map(total));
  const kept = mean(runs.map(r => r.kept.length));
  const expDrops = kills * chanceFrom('Common');
  const expKept = kills * chanceFrom('Rare');
  check(`${kills} kills on the average enemy: ~${expDrops.toFixed(0)} drops`, near(drops, expDrops, expDrops * 0.05), drops.toFixed(1));
  check(`… keeping Rare+: ~${expKept.toFixed(0)} kept`, near(kept, expKept, expKept * 0.1), kept.toFixed(1));
  check('kept items pass the filter', runs.every(r => r.kept.every(it => rarityRank(it.rarity.tag) >= rarityRank('Rare'))));
  check('drops come from the enemy\'s bases at the zone tier (uniques aside)',
    runs.every(r => r.kept.every(it => it.uniqueId !== undefined || (wisp.enemy.drops.includes(it.baseId) && it.tier === 1))));
  check('Dust is the sum of salvage values', runs.every(r =>
    r.dust === RARITIES.reduce((sum, rar) => sum + BigInt(r.salvaged[rar]) * salvageValue(rar, 1), 0n)));
  check('uniques are never salvaged by the filter', runs.every(r => r.salvaged.Unique === 0));

  const again = rollDrops(seededRng(5n), session({ kills }));
  check('drops are reproducible from the seed', JSON.stringify(again, (_k, v) => typeof v === 'bigint' ? String(v) : v) ===
    JSON.stringify(runs[5], (_k, v) => typeof v === 'bigint' ? String(v) : v));

  // Discovery: `seen` lists every drop, salvaged ones included, without changing the rolls.
  const seenRun = rollDrops(seededRng(5n), session({ kills, discoverRng: seededRng(5n, 1n) }));
  check('discovery doesn\'t change the item rolls', JSON.stringify(seenRun.kept, (_k, v) => typeof v === 'bigint' ? String(v) : v) ===
    JSON.stringify(runs[5].kept, (_k, v) => typeof v === 'bigint' ? String(v) : v));
  check('seen: one entry per drop, from the enemy\'s bases or a unique', seenRun.seen.length === total(seenRun) &&
    seenRun.seen.every(x => x.uniqueId !== undefined || wisp.enemy.drops.includes(x.baseId)), `${seenRun.seen.length} seen`);
  check('seen without discoverRng skips drops salvaged unrolled', runs[5].seen.length === total(runs[5]) - runs[5].salvaged.Common - runs[5].salvaged.Magic);

  const found = mean(Array.from({ length: 200 }, (_, i) => total(rollDrops(seededRng(BigInt(i)), session({ kills, itemFind: 1 })))));
  check('+100% item find doubles drops', near(found, expDrops * 2, expDrops * 0.1), found.toFixed(1));
  const rats = mean(Array.from({ length: 200 }, (_, i) => total(rollDrops(seededRng(BigInt(i)), session({ kills, rewardScale: 0.35 })))));
  check('weaker enemies drop less (reward scale)', near(rats, expDrops * 0.35, expDrops * 0.025), rats.toFixed(1));

  // Few enough drops to stay clear of the bag limit; uniques are always kept, so they're exempt.
  const filterKills = killsFor(45, 'Magic');
  const wl = rollDrops(seededRng(9n), session({ kills: filterKills, filter: { minRarity: 'Magic', keepAffixes: [Stat.ItemFindPct], keepBases: [], minAffixTier: 1 } }));
  check('affix filter keeps only drops with a checked affix',
    wl.kept.length > 0 && wl.kept.every(it => it.uniqueId !== undefined || it.rarity.tag !== 'Common' && it.affixes.some(a => a.stat === Stat.ItemFindPct)),
    `${wl.kept.length} kept`);
  const allAffixes = rollDrops(seededRng(9n), session({ kills: filterKills, filter: { minRarity: 'Magic', keepAffixes: AFFIX_STAT_IDS, keepBases: [], minAffixTier: 1 } }));
  const noAffixes = rollDrops(seededRng(9n), session({ kills: filterKills, filter: { minRarity: 'Magic', keepAffixes: [], keepBases: [], minAffixTier: 1 } }));
  check('all affixes checked or none: no affix restriction',
    allAffixes.kept.length > wl.kept.length && allAffixes.kept.length === noAffixes.kept.length && allAffixes.salvaged.Magic === noAffixes.salvaged.Magic,
    `${allAffixes.kept.length} / ${noAffixes.kept.length} kept`);

  const family = wisp.enemy.drops[0];
  const oneFamily = rollDrops(seededRng(9n), session({ kills: filterKills, filter: { minRarity: 'Magic', keepAffixes: [], keepBases: [family], minAffixTier: 1 } }));
  check('family filter keeps only checked families',
    oneFamily.kept.length > 0 && oneFamily.kept.length < noAffixes.kept.length && oneFamily.kept.every(it => it.uniqueId !== undefined || it.baseId === family),
    `${oneFamily.kept.length} kept`);
  const allBases = rollDrops(seededRng(9n), session({ kills: filterKills, filter: { minRarity: 'Magic', keepAffixes: [], keepBases: BASE_LIST.map(b => b.id), minAffixTier: 1 } }));
  check('all families checked: no family restriction', allBases.kept.length === noAffixes.kept.length, `${allBases.kept.length} kept`);
  const t3 = rollDrops(seededRng(9n), session({ tier: 5, kills: killsFor(35, 'Magic'), filter: { minRarity: 'Magic', keepAffixes: [], keepBases: [], minAffixTier: 3 } }));
  const t3all = rollDrops(seededRng(9n), session({ tier: 5, kills: killsFor(35, 'Magic'), filter: { minRarity: 'Magic', keepAffixes: [], keepBases: [], minAffixTier: 1 } }));
  check('minimum affix tier keeps only drops with an affix that high',
    t3.kept.length > 0 && t3.kept.length < t3all.kept.length && t3.kept.every(it => it.uniqueId !== undefined || it.affixes.some(a => a.tier >= 3)),
    `${t3.kept.length} of ${t3all.kept.length} kept`);

  // A long session fills the bag to the last free slot (no per-settle cap below that).
  const flood = rollDrops(seededRng(3n), session({ kills: killsFor(35, 'Epic'), bagFree: 50, filter: { minRarity: 'Common', keepAffixes: [], keepBases: [], minAffixTier: 1 } }));
  check('bag limit keeps exactly the free slots', flood.kept.length === 50 && flood.overflow > 0, `overflow ${flood.overflow}`);
  const roomy = rollDrops(seededRng(3n), session({ kills: 20_000, bagFree: 400, filter: { minRarity: 'Common', keepAffixes: [], keepBases: [], minAffixTier: 1 } }));
  check('a long session fills a big bag', roomy.kept.length === 400, `${roomy.kept.length} kept`);
  check('… salvaging the lowest rarities first', flood.salvaged.Epic === 0 && flood.salvaged.Legendary === 0 &&
    flood.kept.every((it, i, xs) => i === 0 || rarityRank(xs[i - 1].rarity.tag) >= rarityRank(it.rarity.tag)));
  const full = rollDrops(seededRng(4n), session({ bagFree: 0 }));
  check('full bag salvages every kept drop', full.kept.length === 0 && full.overflow > 0);
  const none = rollDrops(seededRng(4n), session({ kills: 0 }));
  check('no kills, no drops', total(none) === 0 && none.dust === 0n);
}

// ---------------------------------------------------------------- Fortune's Favor

{
  const FORTUNE = 0.15;
  // The upgrade rolls come after every drop roll, so the same seed keeps the same drops.
  const pairs = Array.from({ length: 300 }, (_, i) => [
    rollDrops(seededRng(BigInt(i)), session({ filter: { minRarity: 'Common', keepAffixes: [], keepBases: [], minAffixTier: 1 }, kills: killsFor(35, 'Common') })),
    rollDrops(seededRng(BigInt(i)), session({ filter: { minRarity: 'Common', keepAffixes: [], keepBases: [], minAffixTier: 1 }, kills: killsFor(35, 'Common'), fortune: FORTUNE })),
  ]);
  let eligible = 0;
  let raised = 0;
  let wellFormed = true;
  for (const [plain, lucky] of pairs) {
    const before = plain.kept.map(it => it.rarity.tag).sort();
    const after = lucky.kept.map(it => it.rarity.tag);
    wellFormed &&= plain.kept.length === lucky.kept.length && lucky.dust === plain.dust;
    for (const it of lucky.kept) {
      if (it.uniqueId !== undefined) continue;
      wellFormed &&= it.affixes.length === REGULAR_AFFIXES[it.rarity.tag] && (it.rarity.tag === 'Legendary') === !!it.legendary;
    }
    eligible += before.filter(r => r !== 'Legendary' && r !== 'Unique').length;
    raised += after.reduce((n, r) => n + rarityRank(r), 0) - before.reduce((n, r) => n + rarityRank(r), 0);
  }
  check("Fortune's Favor keeps the same drops and Dust", wellFormed);
  check(`… and raises ~${FORTUNE * 100}% of kept drops one rarity`, near(raised / eligible, FORTUNE, 0.015),
    `${raised} of ${eligible}`);
}

// ---------------------------------------------------------------- uniques (uniques.md)

{
  const rng = seededRng(77n);
  for (const u of UNIQUES) {
    const items = Array.from({ length: 50 }, () => makeUnique(rng, u));
    const ok = items.every(it =>
      it.rarity.tag === 'Unique' && it.uniqueId === u.id && it.tier === u.tier && it.baseId === u.baseId && !it.legendary &&
      it.effects.join() === u.effects.join() && it.affixes.length === u.stats.length &&
      it.affixes.every((a, i) => {
        const top = affixRef(u.stats[i].stat, u.tier) * (u.stats[i].x ?? 1);
        const v = Number(a.value) / 100;
        const tol = STATS[u.stats[i].stat].decimals ? 0.01 : 0.5;
        return a.tier === 0 && a.stat === u.stats[i].stat && v >= top * UNIQUE_ROLL_MIN - tol && v <= top * UNIQUE_ROLL_MAX + tol;
      }));
    check(`${u.name}: its base, tier and effects; stats in [${UNIQUE_ROLL_MIN}, ${UNIQUE_ROLL_MAX}] × value`, ok);
  }

  check('T1 zone drops only T1 uniques', Array.from({ length: 300 }, () => pickUnique(rng, 1)!).every(u => u.tier === 1));
  const t2 = Array.from({ length: 6000 }, () => pickUnique(rng, 2)!);
  const shareT1 = t2.filter(u => u.tier === 1).length / t2.length;
  // The global pool: enemy-bound uniques only drop from their enemy.
  const n1 = UNIQUES.filter(u => u.tier === 1 && u.enemyId === undefined).length;
  const n2 = UNIQUES.filter(u => u.tier === 2 && u.enemyId === undefined).length;
  check('T2 zone drops T1 and T2 uniques, lower tiers at half weight', near(shareT1, (n1 * 0.5) / (n1 * 0.5 + n2), 0.02), shareT1.toFixed(3));
  check('higher-tier uniques never drop', uniqueWeight(UNIQUES.find(u => u.tier === 2)!, 1) === 0);
  check('every zone tier with uniques has some', hasUniques(1) && hasUniques(9) && !hasUniques(0));
  const bound = UNIQUES.filter(u => u.enemyId !== undefined);
  check('enemy-bound uniques never drop from the global pool', Array.from({ length: 3000 }, () => pickUnique(rng, 9)!).every(u => u.enemyId === undefined));
  check('an enemy with its own unique drops only that one', bound.every(u =>
    Array.from({ length: 200 }, () => pickUnique(rng, u.tier, u.enemyId)!).every(x => x.id === u.id)));
  const bell = ENEMIES_BY_ID.get(107)!.enemy;
  check('rareDropMult raises Rare and better only', near(dropChance('Rare', bell), DROP_CHANCE.Rare * 2.5, 1e-12) &&
    near(dropChance('Unique', bell), DROP_CHANCE.Unique * 2.5, 1e-12) && dropChance('Magic', bell) === DROP_CHANCE.Magic &&
    dropChance('Rare', ENEMIES_BY_ID.get(101)!.enemy) === DROP_CHANCE.Rare);
  check('regular enemies drop from the global pool', pickUnique(rng, 1, 101)!.enemyId === undefined && hasUniques(1, 101));

  // A big session with a filter that keeps nothing else: every unique is kept, from any enemy.
  const keepNone = { minRarity: 'Legendary' as const, keepAffixes: [], keepBases: [], minAffixTier: 9 };
  const uniqueKills = killsFor(30, 'Legendary');
  const runs = Array.from({ length: 40 }, (_, i) => rollDrops(seededRng(BigInt(1000 + i)), session({ kills: uniqueKills, tier: 2, filter: keepNone })));
  const uniq = runs.flatMap(r => r.kept.filter(it => it.rarity.tag === 'Unique'));
  const expected = 40 * uniqueKills * DROP_CHANCE.Unique;
  check('uniques drop at the Unique chance and are always kept', near(uniq.length, expected, 4 * Math.sqrt(expected)), `${uniq.length} vs ~${expected.toFixed(0)}`);
  check('… from the T1 and T2 pool', uniq.every(it => UNIQUES_BY_ID.get(it.uniqueId!)!.tier <= 2) && new Set(uniq.map(it => it.uniqueId)).size === UNIQUES.filter(u => u.tier <= 2 && u.enemyId === undefined).length);
}

// ---------------------------------------------------------------- materials

{
  const golem = ENEMIES_BY_ID.get(305)!; // Metal, Core and Gem
  const kills = 100_000;
  const drops = rollMaterials(seededRng(7n), golem.enemy, 3, kills, 1.5);
  const count = (kind: string) => drops.find(d => MATERIALS_BY_ID.get(d.materialId)!.kind === kind)?.count ?? 0;
  check("materials: only the enemy's kinds, of the zone tier", drops.length === 3 &&
    drops.every(d => MATERIALS_BY_ID.get(d.materialId)!.tier === 3 && golem.enemy.materials.includes(MATERIALS_BY_ID.get(d.materialId)!.kind)));
  for (const kind of ['Metal', 'Core', 'Gem'] as const) {
    const expected = kills * 1.5 * MATERIAL_CHANCE[kind];
    check(`materials: ${kind} at its chance × reward scale`, near(count(kind), expected, 4 * Math.sqrt(expected)), `${count(kind)} vs ~${expected}`);
  }
  check('materials: same seed, same drops', JSON.stringify(rollMaterials(seededRng(7n), golem.enemy, 3, kills, 1.5)) === JSON.stringify(drops));
  check('materials: no kills, none', rollMaterials(seededRng(7n), golem.enemy, 3, 0, 1.5).length === 0);
}

// ---------------------------------------------------------------- anomalies

{
  const rng = seededRng(99n);
  const items = Array.from({ length: 2000 }, (_, i) => makeAnomaly(rng, BASE_LIST[i % BASE_LIST.length].id, 1 + (i % 9)));
  const counts = new Set(items.map(it => it.affixes.length));
  check(`anomalies have ${ANOMALY_AFFIXES[0]} to ${ANOMALY_AFFIXES[1]} affixes, every count seen`,
    counts.size === ANOMALY_AFFIXES[1] - ANOMALY_AFFIXES[0] + 1 && [...counts].every(n => n >= ANOMALY_AFFIXES[0] && n <= ANOMALY_AFFIXES[1]));
  const affixes = items.flatMap(it => it.affixes);
  check('anomaly affixes stay within ± the best T9 roll, any item tier', affixes.every(a => {
    const top = affixRef(a.stat as keyof typeof STATS, 9);
    return Math.abs(Number(a.value) / 100) <= top + 0.5;
  }));
  check('anomaly affixes roll both signs on every stat', Object.values(STATS).filter(d => d.ref !== undefined).every(d =>
    affixes.some(a => a.stat === d.id && a.value < 0n) && affixes.some(a => a.stat === d.id && a.value > 0n)));
  const t1 = items.filter(it => it.tier === 1).flatMap(it => it.affixes).filter(a => a.stat === Stat.PhysDamage);
  check('a T1 anomaly can roll far past T1 ranges', t1.some(a => Number(a.value) / 100 > 300) && t1.some(a => Number(a.value) / 100 < -300));
  check('anomalies can repeat a stat', items.some(it => new Set(it.affixes.map(a => a.stat)).size < it.affixes.length));
  check('anomalies: rarity Anomaly, affix tier 0, no legendary, base values like a Common', items.every(it =>
    it.rarity.tag === 'Anomaly' && it.affixes.every(a => a.tier === 0) && !it.legendary && it.uniqueId === undefined) &&
    makeItem(seededRng(1n), 1, 4, 'Common').weapon?.hit === makeAnomaly(seededRng(1n), 1, 4).weapon?.hit);

  // Strict filter and a full bag: anomalies are still kept.
  const kills = Math.round(20 / ANOMALY_CHANCE);
  const r = rollDrops(seededRng(3n), session({ kills, filter: { minRarity: 'Legendary', keepAffixes: [1], keepBases: [2], minAffixTier: 9 }, bagFree: 0 }));
  const kept = r.kept.filter(it => it.rarity.tag === 'Anomaly').length;
  check(`~20 anomalies in ${kills.toLocaleString()} kills, kept past the filter and a full bag`,
    kept === r.kept.length && kept > 5 && kept < 40 && r.salvaged.Anomaly === 0, `${kept} kept`);
  check('Ethereal and Mythic never drop', RARITIES.includes('Ethereal') && r.salvaged.Ethereal === 0 && r.salvaged.Mythic === 0);
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
