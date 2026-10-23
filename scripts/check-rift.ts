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
  memberRng, nodeLineup, rewardOwed, riftEnemy, riftWeek, rollEthereal, rollHeadlines, runRng, runSeed, shopStock, thresholdGifts, weekStartMicros,
  weeklyMutation, type HeldBoon, type OfferContext,
} from '../spacetimedb/src/rift';
import { makeItem, seededRng } from '../spacetimedb/src/loot';
import { ZONE_BASES } from '../spacetimedb/src/data/bases';
import { Stat, toStored } from '../spacetimedb/src/data/stats';
import { EVENTS, MOTES, RiftEffect } from '../spacetimedb/src/data/rift';
import { DISCARD, RiftError, apply, memberStats, startRun, wearPlan, type MemberState, type RunState } from '../spacetimedb/src/riftRun';
import { playRun, referencePlayer, type Bot, type BotRun } from './rift-bots';

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
  check('floor 5 is × 1.6^4 HP and DPS', near(f5.hp / f1.hp, floorMult(5), 1e-9) && near(f5.dps / f1.dps, 1.6 ** 4, 1e-9));
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

{
  const week = 3000;
  const full = floorReward(2, 5, week);
  check('a first clear owes the whole floor reward', JSON.stringify(rewardOwed(2, 5, 0, week), (_, v) => (typeof v === 'bigint' ? `${v}` : v)) === JSON.stringify(full, (_, v) => (typeof v === 'bigint' ? `${v}` : v)));
  check('… a clear at the tier already paid owes nothing', rewardOwed(2, 5, 5, week) === undefined && rewardOwed(2, 5, 6, week) === undefined);
  const up = rewardOwed(2, 6, 5, week)!;
  const six = floorReward(2, 6, week);
  check('… a higher tier owes the gold, XP and Dust above, its materials in full, Riftstone once',
    up.gold === six.gold - full.gold && up.xp === six.xp - full.xp && up.dust === six.dust - full.dust &&
    !up.materials.some(([id]) => id === untieredMaterial('Riftstone').id) && six.materials.some(([id]) => id === untieredMaterial('Riftstone').id));
}

// ---------------------------------------------------------------- a run (riftRun.ts)

{
  const show = (s: RunState) => JSON.stringify(s, (_, v) => (typeof v === 'bigint' ? `${v}n` : v));
  const ref = referencePlayer(5, 3);
  const solo = () => startRun(99n, 5, 0, [{ characterId: 1n, ...ref }]);
  const s0 = solo();
  const m0 = s0.members[0];
  check('a run starts at full HP with 3 gifts to pick', near(m0.hp, memberStats(s0, m0).maxHp, 1e-12) && m0.pending[0]?.kind === 'gifts' &&
    (m0.pending[0] as { gifts: unknown[] }).gifts.length === 3);
  const refused = (f: () => unknown, msg: RegExp) => {
    try {
      f();
      return false;
    } catch (e) {
      return e instanceof RiftError && msg.test(e.message);
    }
  };
  check('… and nobody moves before picking', refused(() => apply(s0, { type: 'move', node: 0 }), /Waiting/));
  const purse = (s0.members[0].pending[0] as { gifts: { gift: number }[] }).gifts.findIndex(g => g.gift !== Gift.MarkedPath);
  const s1 = apply(s0, { type: 'choose', member: 1n, choice: purse, theme: Theme.Fury }).state;
  check('apply leaves the state it was given alone', show(s0) === show(solo()));
  const s1b = s1.members[0].pending.length ? apply(s1, { type: 'choose', member: 1n, choice: DISCARD }).state : s1;
  const r = apply(s1b, { type: 'move', node: 0 });
  check('node 1 is a fight, played in the move', r.fights.length === 1 && r.fights[0].kind === 'node');
  const m1 = r.state.members[0];
  check('… a win pays Motes and offers boons', r.state.phase === 'ended' || (m1.motes >= MOTES.fight && m1.pending.some(p => p.kind === 'boons')),
    `${m1.motes} Motes`);
  check('the same actions play the same run', show(apply(s1b, { type: 'move', node: 0 }).state) === show(r.state));
  check("a node out of reach can't be moved to", refused(() => apply(s1b, { type: 'move', node: 9 }), /reach/));

  // The loadout's hand rules.
  const twoHand = ZONE_BASES.find(b => b.weapon?.twoHanded)!;
  const oneHand = ZONE_BASES.find(b => b.weapon && !b.weapon.twoHanded)!;
  const shield = ZONE_BASES.find(b => b.slots.includes('OffHand') && !b.weapon)!;
  const eth = (baseId: number, headlines = {}) => ({ ...makeItem(seededRng(1n), baseId, 5, 'Ethereal'), headlines });
  const MAIN = 0;
  const OFF = 1;
  const armed = { ...m0, gear: m0.gear.map((it, i) => (i === MAIN ? eth(oneHand.id) : i === OFF ? eth(shield.id) : it)) };
  const plan2h = wearPlan(armed, eth(twoHand.id));
  check('a two-handed weapon also discards the off-hand', typeof plan2h !== 'string' && plan2h.discards.includes(OFF) && plan2h.discards.includes(MAIN));
  check('an off-hand needs a one-handed weapon', wearPlan({ ...armed, gear: armed.gear.map((it, i) => (i === MAIN ? eth(twoHand.id) : i === OFF ? undefined : it)) }, eth(shield.id)) === 'Needs a one-handed weapon');
  check("a Rift Anchor's slot can't be replaced", /Anchor/.test(String(wearPlan({ ...armed, gear: armed.gear.map((it, i) => (i === OFF ? eth(shield.id, { riftEffect: RiftEffect.RiftAnchor }) : it)) }, eth(twoHand.id)))));

  // A shop and events, answered from a waiting choice.
  const with1 = (s: RunState, f: (m: MemberState) => void): RunState => {
    const c = { ...s, members: s.members.map(m => ({ ...m, boons: [...m.boons], pending: [...m.pending] })) };
    f(c.members[0]);
    return c;
  };
  const max = memberStats(s1b, s1b.members[0]).maxHp;
  const hurt = with1(s1b, m => {
    m.hp = max / 2;
    m.motes = 200;
    m.pending = [{ kind: 'shop', stock: [{ kind: 'heal', price: PRICE.heal }], sold: [false], rerolls: 0 }];
  });
  const healed = apply(hurt, { type: 'choose', member: 1n, choice: 0 }).state.members[0];
  check('a shop heal: 30% of max HP for 50 Motes', near(healed.hp, 0.8 * max, 1e-9) && healed.motes === 150 && healed.pending[0].kind === 'shop');
  check('… sold once', refused(() => apply(with1(hurt, m => (m.pending = healed.pending)), { type: 'choose', member: 1n, choice: 0 }), /Sold/));
  const event = (id: number, choice: number, extra = {}) => apply(with1(hurt, m => (m.pending = [{ kind: 'event', event: id, used: [] }])), { type: 'choose', member: 1n, choice, ...extra }).state.members[0];
  check('Lost Satchel: 60 Motes', event(10, 0).motes === 260);
  const statue = event(17, 0);
  check('Weeping Statue: heals to full, and the next fight gives no pick', near(statue.hp, max, 1e-9) && statue.skipBoon);
  const vault = event(12, 0);
  check("Thane's Vault: 15% of current HP, then 1 of 3 items", near(vault.hp, 0.85 * max / 2, 1e-9) && vault.pending[0].kind === 'items');
  check('an event never kills with its HP cost', event(1, 0).hp > 0);
  check('a choice that can\'t apply is refused (attune with nothing Ethereal worn)', refused(() => event(7, 1, { target: 0 }), /Ethereal/));
  check('every event can be left or answered', EVENTS.length === 20 && EVENTS.every(e => e.choices.length >= 2));

  // A floor boss: an overwhelming build clears it.
  const god = with1(s1b, m => {
    m.gear = m.gear.map((it, i) => (i === MAIN ? { ...makeItem(seededRng(2n), oneHand.id, 5, 'Rare'), affixes: [{ stat: Stat.PhysDamage, tier: 5, value: toStored(1e6) }] } : it));
    m.hp = max / 2;
    m.won = 3;
    m.secondWind = 0;
  });
  const atBoss = { ...god, row: ROWS - 1 };
  const b = apply(atBoss, { type: 'boss', option: 0 });
  const after = b.state.members[0];
  const maxAfter = memberStats(b.state, after).maxHp;
  check('a floor boss win clears the floor and opens the next', b.cleared === 1 && b.state.floor === 2 && b.state.row === -1 && after.won === 0);
  check('… heals half of the missing HP', near(after.hp, b.fights[0].result.hp[0] + 0.5 * (maxAfter - b.fights[0].result.hp[0]), 1e-6));
  check('… and drops an Ethereal item with an Echo', after.pending.some(p => p.kind === 'item' && p.item.headlines.echo !== undefined));

  // A party.
  const duo = startRun(5n, 5, 0, [{ characterId: 1n, ...ref }, { characterId: 2n, ...referencePlayer(5, 4) }]);
  const picked = [1n, 2n].reduce((s, id) => {
    let x = apply(s, { type: 'choose', member: id, choice: 1, theme: Theme.Fury }).state;
    while (x.members.find(m => m.characterId === id)!.pending.length) x = apply(x, { type: 'choose', member: id, choice: DISCARD }).state;
    return x;
  }, duo);
  check('a party waits for everyone to press Ready', refused(() => apply(picked, { type: 'move', node: 0 }), /Waiting/));
  check('… except members offline', apply(apply(picked, { type: 'ready', member: 1n }).state, { type: 'move', node: 0, online: [1n] }).fights.length === 1);
  const downed = with1({ ...picked, row: ROWS - 1 }, m => {
    m.downed = true;
    m.hp = 0;
  });
  const godDuo = { ...downed, members: [downed.members[0], { ...god.members[0], characterId: 2n }] };
  const rb = apply(godDuo, { type: 'boss', option: 0, online: [] });
  check('a downed member comes back at half HP when the boss falls', !rb.state.members[0].downed && near(rb.state.members[0].hp, 0.5 * memberStats(rb.state, rb.state.members[0]).maxHp, 1e-9));
  check('leaving takes a member out; the last one out ends the run', apply(picked, { type: 'leave', member: 2n }).state.members.length === 1 &&
    apply(apply(picked, { type: 'leave', member: 2n }).state, { type: 'leave', member: 1n }).state.end === 'left');
}

// ---------------------------------------------------------------- the bots (tuning RIFT_HP and RIFT_DPS)

{
  const N = 200;
  const runs = (bots: Bot[], tier = 5) => Array.from({ length: N / (bots.length > 1 ? 4 : 1) }, (_, i) => playRun(i + 1, tier, bots));
  const share = (rs: BotRun[], f: (r: BotRun) => boolean) => rs.filter(f).length / rs.length;
  const random = runs(['random']);
  const greedy = runs(['greedy']);
  const full = (rs: BotRun[]) => share(rs, r => r.cleared === 5);
  check('random picks at T5: a full clear about 1 run in 10 (5–25%)', full(random) >= 0.05 && full(random) <= 0.25, pct(full(random)));
  check('… most runs end on floors 2–4', share(random, r => r.cleared >= 1 && r.cleared <= 3) >= 0.5, pct(share(random, r => r.cleared >= 1 && r.cleared <= 3)));
  check('… and few on floor 1', share(random, r => r.cleared === 0) <= 0.1, pct(share(random, r => r.cleared === 0)));
  check('a greedy theme builder at T5: a full clear about half the time (35–65%)', full(greedy) >= 0.35 && full(greedy) <= 0.65, pct(full(greedy)));
  const fullRuns = greedy.filter(r => r.cleared === 5);
  const fights = fullRuns.reduce((a, r) => a + r.fights, 0) / fullRuns.length;
  check('a full run plays ~20–25 fights', fights >= 18 && fights <= 27, fights.toFixed(1));
  const all = [...random, ...greedy];
  const ms = all.reduce((a, r) => a + r.msPerFight * r.fights, 0) / all.reduce((a, r) => a + r.fights, 0);
  check('a node fight takes well under 1 ms to settle', ms < 0.5, `${ms.toFixed(2)} ms on average`);
  for (const size of [2, 3, 4]) {
    const party = runs(Array.from({ length: size }, (_, i) => (i % 2 ? 'random' : 'greedy') as Bot));
    check(`a party of ${size} (greedy and random) plays through, enemy HP × ${PARTY_HP[size - 1]}`, party.every(r => r.end !== undefined) && full(party) > 0,
      `full clears ${pct(full(party))}`);
  }
}

console.log(failed ? `\n${failed} failed` : '\nall passed');
if (failed) process.exitCode = 1;
