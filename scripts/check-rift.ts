// Checks for the Shifting Rift's generation (spacetimedb/src/rift.ts, data/rift.ts): weeks
// and mutations, floor maps, enemies, offers, shops, gifts, Ethereal items and rewards.
// No server needed:
//   npm run test:rift
import { BASE_DPS, BASE_HP, ELITE_AFFIXES, depthReward } from '../spacetimedb/src/data/abyss';
import { untieredMaterial } from '../spacetimedb/src/data/materials';
import {
  BOONS, BOONS_BY_ID, Boon, FLOORS, FLOOR_REWARDS, GIFTS, Gift, HEADLINE_CHANCE, KEYSTONE_FLOOR, MUTATIONS, Mutation, PARTY_HP, PRICE,
  RIFT_DPS, RIFT_HEART, RIFT_HP, ROWS, SHOP_MAX, SHOP_MIN, Theme, canUpgrade, floorMult, type BoonRarity,
} from '../spacetimedb/src/data/rift';
import { averageEnemyDps, averageEnemyHp, effectiveHp, farmingReward } from '../spacetimedb/src/data/zones';
import {
  RIFT_BOSS_ECHOES, RIFT_ECHOES, bossOptions, boonOffer, floorMap, floorReward, headlineCount, lineupSlot, mainTheme, mapProblems,
  memberRng, nodeLineup, riftEnemy, riftWeek, rollEthereal, rollHeadlines, runRng, runSeed, shopStock, thresholdGifts, weekStartMicros,
  weeklyMutation, type HeldBoon, type OfferContext,
} from '../spacetimedb/src/rift';
import { seededRng } from '../spacetimedb/src/loot';

let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed++;
}
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol * Math.abs(b);
const pct = (x: number) => `${(100 * x).toFixed(1)}%`;

// ---------------------------------------------------------------- weeks and mutations

{
  const at = (iso: string) => BigInt(Date.parse(iso)) * 1000n;
  const monday = at('2026-10-19T00:00:00Z');
  check('a week starts on Monday 00:00 UTC', riftWeek(monday) === riftWeek(at('2026-10-25T23:59:59Z')) && riftWeek(monday) === riftWeek(at('2026-10-18T23:59:59Z')) + 1);
  check('weekStartMicros is the Monday', weekStartMicros(riftWeek(at('2026-10-22T12:00:00Z'))) === monday);
  const weeks = Array.from({ length: 2000 }, (_, w) => weeklyMutation(3000 + w));
  check('never the same mutation two weeks running', weeks.every((m, i) => i === 0 || m !== weeks[i - 1]));
  check('every mutation once per 7-week stretch', Array.from({ length: 50 }, (_, b) => new Set(Array.from({ length: 7 }, (_, k) => weeklyMutation(7 * (b + 500) + k))).size === MUTATIONS.length).every(Boolean));
  check('mutation IDs are known', weeks.every(m => MUTATIONS.some(x => x.id === m)));
}

// ---------------------------------------------------------------- maps

{
  const seeds = Array.from({ length: 2000 }, (_, i) => runSeed(BigInt(i + 1), 1_760_000_000_000_000n + BigInt(i)));
  const maps = seeds.flatMap(seed => Array.from({ length: FLOORS }, (_, f) => floorMap(seed, f + 1)));
  const bad = maps.map(mapProblems).filter(p => p.length);
  check(`${maps.length} floor maps follow every rule`, bad.length === 0, bad[0]?.join('; '));
  check('the same seed gives the same map', JSON.stringify(floorMap(seeds[7], 3)) === JSON.stringify(floorMap(seeds[7], 3)));
  check('another floor, another map', JSON.stringify(floorMap(seeds[7], 3).rows) !== JSON.stringify(floorMap(seeds[7], 4).rows));
  const nodes = maps.flatMap(m => m.rows.slice(1).flat());
  const share = (k: string) => nodes.filter(n => n.kind === k).length / nodes.length;
  console.log(`      nodes 2–5: fight ${pct(share('fight'))}, elite ${pct(share('elite'))}, shop ${pct(share('shop'))}, event ${pct(share('event'))}; ${(maps.reduce((s, m) => s + m.rows.flat().length, 0) / maps.length).toFixed(1)} nodes a floor`);
  // The rule checker itself: a broken map is caught.
  const m = floorMap(seeds[0], 1);
  const broken = { ...m, rows: m.rows.map(r => r.map(n => ({ ...n, kind: n.kind === 'shop' ? 'event' as const : n.kind, ...(n.kind === 'shop' && { event: 1 }) }))) };
  check('a map without a shop is refused', mapProblems(broken).includes('no shop'));
  const allElite = { ...m, rows: m.rows.map((r, i) => (i === 2 ? r.map(n => ({ ...n, kind: 'elite' as const, event: undefined })) : r)) };
  check('a map where every path meets an Elite is refused', mapProblems(allElite).includes('every path meets an Elite'));
}

// ---------------------------------------------------------------- enemies

{
  check('the average enemy formula matches the Deep (T4: 915 HP, 53 DPS)', near(averageEnemyHp(4), BASE_HP, 0.01) && near(averageEnemyDps(4), BASE_DPS, 0.01),
    `${averageEnemyHp(4).toFixed(0)} HP, ${averageEnemyDps(4).toFixed(1)} DPS`);
  const base = averageEnemyHp(5) * averageEnemyDps(5) * RIFT_HP * RIFT_DPS;
  const strength = (id: number) => {
    const e = riftEnemy(5, 1, id, 'fight1');
    return (effectiveHp(e) * e.dps) / base;
  };
  const all = [...RIFT_ECHOES, ...RIFT_BOSS_ECHOES];
  check(`every echo (${RIFT_ECHOES.length} enemies, ${RIFT_BOSS_ECHOES.length} bosses) is as strong as the average, its lean kept`, all.every(k => near(strength(k.enemy.id), 1, 1e-6)));
  const wisp = RIFT_ECHOES.find(k => k.enemy.evasionRating)!;
  check('an evasive echo stays evasive', !!riftEnemy(5, 1, wisp.enemy.id, 'fight1').evasionRating);
  const regen = RIFT_ECHOES.find(k => k.enemy.regen)!;
  const r = riftEnemy(5, 1, regen.enemy.id, 'fight1');
  check('a regenerating echo keeps its share of HP per second', near(r.regen! / r.hp, regen.enemy.regen! / regen.enemy.hp, 1e-9));
  const id = RIFT_ECHOES[0].enemy.id;
  const f1 = riftEnemy(5, 1, id, 'fight1');
  const f5 = riftEnemy(5, 5, id, 'fight1');
  check('floor 5 is × 1.25^4 HP and DPS', near(f5.hp / f1.hp, floorMult(5), 1e-9) && near(f5.dps / f1.dps, 2.44140625, 1e-9));
  check('levels: a T5 run is 50 → 58', f1.level === 50 && f5.level === 58);
  check('armor and resistance follow the level, not the floor', near(f5.armor / f1.armor, 58 / 50, 1e-9));
  check('party HP: × 1 / 1.8 / 2.5 / 3.2, damage unchanged',
    [1, 2, 3, 4].every(n => near(riftEnemy(5, 1, id, 'fight1', n).hp / f1.hp, PARTY_HP[n - 1], 1e-9) && riftEnemy(5, 1, id, 'fight1', n).dps === f1.dps));
  const heart = riftEnemy(5, 5, RIFT_HEART.id, 'heart');
  check('the Rift Heart is HP × 7, DPS × 1.7 of the floor', near(heart.hp / (averageEnemyHp(5) * floorMult(5) * RIFT_HP), 7, 1e-9) && near(heart.dps / (averageEnemyDps(5) * floorMult(5) * RIFT_DPS), 1.7, 1e-9) && !!heart.boss);

  const seed = runSeed(42n, 1n);
  const lineups = Array.from({ length: 3000 }, (_, i) => nodeLineup(seed, 1 + (i % 5), i % 5, i, i % 2 ? 'elite' : 'fight'));
  check('a fight is 1–3 distinct enemies', lineups.every(l => l.enemies.length >= 1 && l.enemies.length <= 3 && new Set(l.enemies).size === l.enemies.length));
  check('an Elite only on Elite nodes, one affix', lineups.every((l, i) => (i % 2 ? l.elite?.affixes.length === 1 && l.elite.index < l.enemies.length : !l.elite)));
  check('slots: the Elite is the Elite, the others share the fight', lineups.every(l => l.enemies.every((_, k) => lineupSlot(l, k) === (l.elite?.index === k ? 'elite' : `fight${l.enemies.length}`))));
  const deep = nodeLineup(seed, 2, 1, 0, 'elite', Mutation.EchoesOfTheDeep);
  check('Echoes of the Deep: the Elite has 2 affixes', deep.elite?.affixes.length === 2 && deep.elite.affixes[0] !== deep.elite.affixes[1]);
  const options = Array.from({ length: 4 }, (_, f) => bossOptions(seed, f + 1));
  check('floors 1–4 offer 2 different zone bosses, each with an Elite affix',
    options.every(o => o.length === 2 && o[0].enemyId !== o[1].enemyId && o.every(b => RIFT_BOSS_ECHOES.some(k => k.enemy.id === b.enemyId) && b.affixes.length === 1)));
  check('floor 5 is the Rift Heart', bossOptions(seed, 5).length === 1 && bossOptions(seed, 5)[0].enemyId === RIFT_HEART.id);
}

// ---------------------------------------------------------------- boon offers

/** A random build: up to 12 boons at random rarities (fixed-rarity boons at theirs). */
function randomHeld(rng: () => number): HeldBoon[] {
  const n = Math.floor(rng() * 13);
  const ids = [...BOONS].sort(() => rng() - 0.5).slice(0, n);
  return ids.map(b => ({ id: b.id, rarity: (b.only ?? Math.floor(rng() * 3)) as BoonRarity }));
}

{
  const rng = seededRng(99n);
  const problems: string[] = [];
  let sizes = 0;
  let mainHits = 0;
  let mainSlots = 0;
  for (let i = 0; i < 20000; i++) {
    const held = randomHeld(rng);
    const ctx: OfferContext = {
      floor: 1 + Math.floor(rng() * 5), held, marks: rng() < 0.2 ? [1 + Math.floor(rng() * 7)] : [],
      has: { crit: rng() < 0.5, evasion: rng() < 0.3, block: rng() < 0.2 }, mutation: rng() < 0.3 ? 1 + Math.floor(rng() * 7) : 0,
    };
    const offer = boonOffer(memberRng(7n, 1n, 5, i), ctx);
    sizes += offer.length;
    const heldBy = new Map(held.map(h => [h.id, h.rarity]));
    const has = (g: string) => ctx.has?.[g as 'crit'] || held.some(h => BOONS_BY_ID.get(h.id)!.grants === g);
    if (new Set(offer.map(o => o.id)).size !== offer.length) problems.push('a boon twice in one offer');
    for (const o of offer) {
      const def = BOONS_BY_ID.get(o.id)!;
      const h = heldBy.get(o.id);
      if (h !== undefined && (!o.upgrade || o.rarity !== h + 1 || !canUpgrade(def, h))) problems.push(`${def.name}: held boon offered wrong`);
      if (h === undefined && o.upgrade) problems.push(`${def.name}: upgrade of a boon not held`);
      if (h === undefined && def.only !== undefined && o.rarity !== def.only) problems.push(`${def.name}: offered at the wrong rarity`);
      if (h === undefined && def.keystone && ctx.floor < KEYSTONE_FLOOR && ctx.mutation !== Mutation.WildMagic) problems.push(`${def.name}: keystone before floor ${KEYSTONE_FLOOR}`);
      if (h === undefined && def.needs && !has(def.needs)) problems.push(`${def.name}: offered without ${def.needs}`);
    }
    const main = mainTheme(held, ctx.marks);
    if (main !== undefined && offer.length) {
      mainSlots++;
      if (BOONS_BY_ID.get(offer[0].id)!.theme === main) mainHits++;
    }
    if (ctx.mutation === Mutation.BloodMoon && offer[2] && BOONS_BY_ID.get(offer[2].id)!.theme !== Theme.Blood && hasBloodLeft(ctx)) problems.push('Blood Moon: slot 3 not Blood');
    if (ctx.mutation === Mutation.WildMagic && offer[2] && offer[2].rarity !== 2 && !offer[2].upgrade) problems.push('Wild Magic: slot 3 not Epic');
    if (held.some(h => h.id === Boon.SecondLook) && offer.length < 4 && offer.length === 3 && BOONS.length - held.length > 10) problems.push('Second Look: 3 choices');
  }
  check('20,000 offers follow the rules', problems.length === 0, [...new Set(problems)].slice(0, 3).join('; '));
  check('offers show 3 choices (4 with Second Look)', sizes / 20000 >= 3, (sizes / 20000).toFixed(2));
  check('slot 1 is the main theme when you hold one', mainHits / mainSlots > 0.95, pct(mainHits / mainSlots));
  const fresh = boonOffer(seededRng(3n), { floor: 1, held: [] });
  check('nothing held: 3 choices of any theme, no keystones on floor 1', fresh.length === 3 && fresh.every(o => !BOONS_BY_ID.get(o.id)!.keystone));
}

/** Whether Blood still has a new or upgradable boon to offer in `ctx`. */
function hasBloodLeft(ctx: OfferContext): boolean {
  const held = new Map(ctx.held.map(h => [h.id, h.rarity]));
  return BOONS.some(b => b.theme === Theme.Blood && (held.has(b.id) ? canUpgrade(b, held.get(b.id)!) : !b.keystone && b.only === undefined));
}

// ---------------------------------------------------------------- shops and gifts

{
  const problems: string[] = [];
  for (let i = 0; i < 3000; i++) {
    const held = randomHeld(seededRng(BigInt(i), 5n));
    const stock = shopStock(memberRng(9n, 2n, 6, i), { floor: 1 + (i % 5), held, tier: 5, hasEthereal: i % 2 === 0, cursed: i % 3 === 0 });
    if (stock.length < SHOP_MIN || stock.length > SHOP_MAX) problems.push(`${stock.length} offers`);
    const heldIds = new Set(held.map(h => h.id));
    for (const o of stock) {
      if (o.kind === 'boon' && (heldIds.has(o.boon.id) || o.price !== PRICE.boon[o.boon.rarity])) problems.push('a boon offer is held or mispriced');
      if (o.kind === 'upgrade') {
        const h = held.find(x => x.id === o.boonId);
        if (!h || !canUpgrade(BOONS_BY_ID.get(h.id)!, h.rarity)) problems.push('an upgrade that can\'t happen');
      }
      if (o.kind === 'attune' && i % 2 !== 0) problems.push('attune without an Ethereal item');
      if (o.kind === 'removeCurse' && i % 3 !== 0) problems.push('curse removal without a curse');
      if (o.kind === 'item' && o.item.rarity.tag !== 'Ethereal') problems.push('a shop item is not Ethereal');
    }
    if (!stock.some(o => o.kind === 'heal')) problems.push('no heal');
  }
  check('3,000 shops: 6–8 offers, priced, only what applies', problems.length === 0, [...new Set(problems)].slice(0, 3).join('; '));

  const gifts = Array.from({ length: 2000 }, (_, i) => thresholdGifts(memberRng(11n, 3n, 4, i), 5, { floor: 1, held: [] }));
  check('the Threshold offers 3 different gifts', gifts.every(g => g.length === 3 && new Set(g.map(x => x.gift)).size === 3));
  const all = gifts.flat();
  check('Ember of Will: an Epic boon', all.filter(g => g.gift === Gift.EmberOfWill).every(g => g.boon?.rarity === 2));
  check('Bargain in the Dark: a keystone and a curse', all.filter(g => g.gift === Gift.BargainInTheDark).every(g => BOONS_BY_ID.get(g.boon!.id)!.keystone && g.curse !== undefined));
  check('Shard of Rift-stuff: at least one headline', all.filter(g => g.gift === Gift.ShardOfRiftStuff).every(g => headlineCount(g.item!.headlines) >= 1));
  check('every gift shows up', GIFTS.every(d => all.some(g => g.gift === d.id)));
}

// ---------------------------------------------------------------- Ethereal items

{
  const items = Array.from({ length: 2000 }, (_, i) => rollEthereal(seededRng(BigInt(i), 13n), 5));
  check('Ethereal items: 3 affixes at affix tier 3–5', items.every(it => it.rarity.tag === 'Ethereal' && it.affixes.length === 3 && it.affixes.every(a => a.tier >= 3 && a.tier <= 5)));
  check('Ethereal items carry no legendary affix', items.every(it => !it.legendary));

  const N = 1_000_000;
  const rng = seededRng(17n);
  const seen = { riftEffect: 0, mark: 0, growth: 0, trophy: 0, echo: 0 };
  for (let i = 0; i < N; i++) {
    const h = rollHeadlines(rng);
    if (h.riftEffect !== undefined) seen.riftEffect++;
    if (h.mark !== undefined) seen.mark++;
    if (h.growth) seen.growth++;
    if (h.trophies) seen.trophy++;
    if (h.echo !== undefined) seen.echo++;
  }
  const kinds = Object.keys(seen) as (keyof typeof seen)[];
  check('each headline rolls at its chance', kinds.every(k => near(seen[k] / N, HEADLINE_CHANCE[k], 0.02)), kinds.map(k => `${k} ${pct(seen[k] / N)}`).join(', '));

  const c = HEADLINE_CHANCE;
  const all5 = c.riftEffect * c.mark * c.growth * c.trophy * c.echo;
  check('all 5 headlines: 1 in ~18,500 / ~1,850 (Elite) / ~1,100 (boss)',
    near(1 / all5, 18500, 0.01) && near(c.trophy / all5, 1850, 0.01) && near(c.echo / all5, 1100, 0.02),
    `${(1 / all5).toFixed(0)} / ${(c.trophy / all5).toFixed(0)} / ${(c.echo / all5).toFixed(0)}`);

  const elite = rollHeadlines(seededRng(1n), { eliteAffixes: [ELITE_AFFIXES[2].id] });
  const boss = rollHeadlines(seededRng(1n), { echo: 5 });
  check('an Elite drop has its Trophy, a boss drop an Echo', elite.trophies?.length === 1 && boss.echo !== undefined);
  const sensed = Array.from({ length: 50000 }, (_, i) => headlineCount(rollHeadlines(seededRng(BigInt(i), 19n), { mult: 3 })));
  const plain = Array.from({ length: 50000 }, (_, i) => headlineCount(rollHeadlines(seededRng(BigInt(i), 19n))));
  check('Treasure Sense × 3 finds more headlines', sensed.reduce((a, b) => a + b) > 2.5 * plain.reduce((a, b) => a + b));

  // The design's "best item of a run": 5 Elite drops, 5 boss drops, 3 from shops and events.
  const runs = 100000;
  const best = [0, 0, 0, 0, 0, 0];
  const r = seededRng(23n);
  for (let k = 0; k < runs; k++) {
    let top = 0;
    for (let i = 0; i < 13; i++) {
      const o = i < 5 ? { eliteAffixes: [1] } : i < 10 ? { echo: 'any' as const } : {};
      top = Math.max(top, headlineCount(rollHeadlines(r, o)));
    }
    best[top]++;
  }
  const atLeast = (n: number) => best.slice(n).reduce((a, b) => a + b, 0) / runs;
  console.log(`      best item of a run: 2+ ${pct(atLeast(2))}, 3+ ${pct(atLeast(3))}, 4+ ${pct(atLeast(4))}, all 5 1 in ${(1 / atLeast(5)).toFixed(0)}`);
  check('best item of a run: 2+ headlines nearly always', atLeast(2) > 0.99);
}

// ---------------------------------------------------------------- rewards

{
  const tier = 5;
  const week = 3000;
  const floors = FLOOR_REWARDS.map((_, f) => floorReward(f + 1, tier, week));
  const sum = (k: 'gold' | 'xp' | 'dust') => floors.reduce((s, f) => s + f[k], 0n);
  const eight = farmingReward(tier, { gold: 8, xp: 8, dust: 8 });
  const close = (a: bigint, b: bigint) => Math.abs(Number(a - b)) <= 5;
  check('a full clear pays 8 h of gold, XP and Dust', close(sum('gold'), eight.gold) && close(sum('xp'), eight.xp) && close(sum('dust'), eight.dust),
    `${sum('gold')} gold, ${sum('xp')} XP, ${sum('dust')} Dust`);
  const riftstone = untieredMaterial('Riftstone').id;
  check('and 19 Riftstone', floors.reduce((s, f) => s + (f.materials.find(([id]) => id === riftstone)?.[1] ?? 0), 0) === 19);
  check('floor 3: 2 elixirs; floor 4: 2 rare herbs', floors[2].elixirs.length === 2 && floors[3].materials.some(([id]) => Math.floor(id / 100) === 10));
  check('a higher tier pays more', floorReward(1, 6, week).gold > floors[0].gold);
  // depthReward moved onto farmingReward: same numbers as the old formula.
  const old = (d: number, tier4: number, g: number) => BigInt(Math.round(1200 * 2.5 * (2.9 ** (tier4 - 1) * g)));
  check('the Deep pays as before', depthReward(1).gold === old(1, 4, 1) && depthReward(150).gold === old(150, 5, 1.03 ** 49));
}

console.log(failed ? `\n${failed} failed` : '\nall passed');
if (failed) process.exitCode = 1;
