// Checks for Moonwell Deep fights (spacetimedb/src/abyss.ts) and their balance. No server needed:
//   npm run test:abyss
import { SLOTS, ZONE_BASES } from '../spacetimedb/src/data/bases';
import { combatStats, matchup, type CombatStats } from '../spacetimedb/src/combat';
import { autoEquip, type OwnedItem, type Profile } from '../spacetimedb/src/equip';
import {
  ABYSS_KINDS, BOSS_AFFIXES, BossAffix, DEPTH_TIME_LIMIT, ELITE_AFFIXES, EliteAffix, FAST_FROM, SECOND_BOSS_AFFIX_FROM, bossAffixesClash,
  depthEnemy, depthHpMult, depthDpsMult, depthLineup, depthReward, DEEP_WARDEN, type DepthLineup,
} from '../spacetimedb/src/data/abyss';
import { untieredMaterial } from '../spacetimedb/src/data/materials';
import { SUPPLIES_BY_ID } from '../spacetimedb/src/data/supplies';
import { makeItem, seededRng, type RarityName } from '../spacetimedb/src/loot';
import { decodeStats, depthFoes, depthOdds, depthRng, encodeStats, mainDamageType, simulateDepth, weakerDefense } from '../spacetimedb/src/abyss';
import { simulateFight } from '../spacetimedb/src/sim';

let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed++;
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** The reference player at the unlock (abyss.md): level 48, the best of 60 random T4 items (Rare 60%, Epic 30%, Legendary 10%). */
const LEVEL = 48;
const PROFILES: Profile[] = ['Damage', 'DamageMagic', 'Survival', 'Healing'];
function character(seed: number, profile: Profile = PROFILES[seed % 2]): CombatStats {
  const rng = seededRng(BigInt(seed), 1717n);
  const items: OwnedItem[] = Array.from({ length: 60 }, (_, i) => {
    const x = rng();
    const rarity: RarityName = x < 0.6 ? 'Rare' : x < 0.9 ? 'Epic' : 'Legendary';
    const b = ZONE_BASES[Math.floor(rng() * ZONE_BASES.length)];
    return { ...makeItem(rng, b.id, 4, rarity), id: BigInt(i + 1) };
  });
  const slots = autoEquip(LEVEL, items, SLOTS.map(() => 0n), profile);
  return combatStats(LEVEL, slots.map(id => items.find(i => i.id === id)));
}

// ---------------------------------------------------------------- scaling and line-ups

check('depth 1 is eased to 0.6× the T4 average enemy, full from depth 6',
  Math.abs(depthHpMult(1) - 0.6) < 1e-9 && Math.abs(depthDpsMult(1) - 0.6) < 1e-9 && Math.abs(depthHpMult(6) - 1.06 ** 5) < 1e-9);
check('depth 51 is about T9 (HP × ~18.4, DPS × ~7.1)', Math.abs(depthHpMult(51) - 18.42) < 0.05 && Math.abs(depthDpsMult(51) - 7.11) < 0.05,
  `${depthHpMult(51).toFixed(2)} / ${depthDpsMult(51).toFixed(2)}`);
check(`faster growth from depth ${FAST_FROM}`, Math.abs(depthHpMult(FAST_FROM + 1) / depthHpMult(FAST_FROM) - 1.09) < 1e-9 &&
  Math.abs(depthHpMult(FAST_FROM) / depthHpMult(FAST_FROM - 1) - 1.06) < 1e-9);
check('the curve never stops', Number.isFinite(depthHpMult(1000)) && depthHpMult(1000) > depthHpMult(999));

const lineups = Array.from({ length: 300 }, (_, i) => depthLineup(i + 1));
check('line-ups are fixed per depth', JSON.stringify(depthLineup(37)) === JSON.stringify(depthLineup(37)));
check('seasons change the line-ups', lineups.slice(0, 20).some(l => JSON.stringify(l) !== JSON.stringify(depthLineup(l.depth, 2))));
check('the basic and the Elite are different pool enemies', lineups.every(l => l.basic !== l.elite));
check(`1 Boss affix up to depth ${SECOND_BOSS_AFFIX_FROM - 1}, 2 from ${SECOND_BOSS_AFFIX_FROM}`,
  lineups.every(l => l.bossAffixes.length === (l.depth < SECOND_BOSS_AFFIX_FROM ? 1 : 2)));
check('two Boss affixes never repeat or clash', lineups.every(l => l.bossAffixes.length < 2 ||
  (l.bossAffixes[0] !== l.bossAffixes[1] && !bossAffixesClash(l.bossAffixes[0], l.bossAffixes[1]))));
check('every pool enemy, Elite affix and Boss affix shows up in 300 depths',
  ABYSS_KINDS.every(k => lineups.some(l => l.basic === k.id) && lineups.some(l => l.elite === k.id)) &&
  ELITE_AFFIXES.every(a => lineups.some(l => l.eliteAffix === a.id)) && BOSS_AFFIXES.every(a => lineups.some(l => l.bossAffixes[0] === a.id)));

// ---------------------------------------------------------------- the fight

const hero = character(1, 'Damage');
const mage = character(2, 'DamageMagic');
const tank = character(4, 'Survival');
/** No gear and no weapon: deals nothing, so fights last until it dies (for the timed mechanics). */
const dummy = combatStats(LEVEL, []);
{
  const a = simulateDepth(hero, 7, depthRng(5n, 1000n));
  const b = simulateDepth(decodeStats(encodeStats(hero)), 7, depthRng(5n, 1000n));
  check('same seed and stored stats, same depth', a.won === b.won && a.end === b.end && a.fights.length === b.fights.length &&
    a.fights.every((f, i) => f.events.length === b.fights[i].events.length && f.end === b.fights[i].end));
  const runs = Array.from({ length: 200 }, (_, i) => simulateDepth(hero, 1 + (i % 30), depthRng(6n, BigInt(i))));
  // On a fight whose first event is your swing, the HP it started at is that event's HP minus what it healed.
  const carried = runs.flatMap(r => r.fights.flatMap((f, i) => {
    const e = f.events[0];
    return i > 0 && e?.by === 'you' && !e.reflected ? [Math.abs(e.youHp - e.healed - r.fights[i - 1].hpLeft)] : [];
  }));
  check('HP carries over: each fight starts at the HP the last one left', carried.length > 20 && carried.every(x => x < 1e-6), `${carried.length} fights`);
  check('a won depth is three kills', runs.filter(r => r.won).every(r => r.fights.length === 3 && r.fights.every(f => f.outcome === 'kill')));
  check('a lost depth ends on a defeat or the time limit', runs.filter(r => !r.won).every(r => r.timedOut ? r.end <= DEPTH_TIME_LIMIT + 1e-6 : r.fights.at(-1)!.outcome === 'defeat'));
  check(`every depth ends by ${DEPTH_TIME_LIMIT} s`, runs.every(r => r.end <= DEPTH_TIME_LIMIT + 1e-6));
  check('order: basic, Elite, boss', runs.every(r => r.foes.map(f => f.slot).join() === 'basic,elite,boss'));
  check('no walk between enemies', runs.every(r => r.fights.every(f => f.walk === 0)));
}
{
  // A full depth from full HP, then the same three fights each from full HP: carrying HP makes it harder.
  const odds = (d: number) => mean(Array.from({ length: 200 }, (_, i) => (simulateDepth(hero, d, depthRng(9n, BigInt(i))).won ? 1 : 0)));
  const fresh = (d: number) => mean(Array.from({ length: 200 }, (_, i) => {
    const rng = depthRng(9n, BigInt(i));
    return depthFoes(hero, depthLineup(d)).every(f => simulateFight(hero, f.matchup, f.enemy, rng, { ...f.mods, walk: 0 }).outcome === 'kill') ? 1 : 0;
  }));
  const d = 12;
  check('one HP bar for the depth is harder than a fresh start per enemy', odds(d) <= fresh(d), `${odds(d).toFixed(2)} vs ${fresh(d).toFixed(2)}`);
}

/** A line-up with the given affixes, the rest fixed. */
const lineup = (depth: number, eliteAffix: number, bossAffixes: number[], basic = ABYSS_KINDS[1].id, elite = ABYSS_KINDS[4].id): DepthLineup =>
  ({ depth, basic, elite, eliteAffix, bossAffixes });
const fightFoe = (s: CombatStats, l: DepthLineup, slot: number, seed = 1n) => {
  const f = depthFoes(s, l)[slot];
  return { foe: f, fight: simulateFight(s, f.matchup, f.enemy, seededRng(seed), { ...f.mods, walk: 0, timeLimit: 600 }) };
};
{
  const { fight } = fightFoe(hero, lineup(5, EliteAffix.Vampiric, [BossAffix.Hungering]), 1);
  check('Vampiric: the Elite heals from the damage it deals', fight.events.some(e => (e.drained ?? 0) > 0));
  const shell = depthFoes(hero, lineup(5, EliteAffix.WardedShell, [BossAffix.Hungering]))[1].enemy;
  const shellM = depthFoes(mage, lineup(5, EliteAffix.WardedShell, [BossAffix.Hungering]))[1].enemy;
  check('Warded Shell: Armored against a physical build, Warded against magic', mainDamageType(hero) === 'Physical' && shell.defense === 'Armored' &&
    mainDamageType(mage) === 'Magic' && shellM.defense === 'Warded');
  const swift = depthFoes(hero, lineup(5, EliteAffix.Swift, [BossAffix.Hungering]))[1].enemy;
  const plain = depthEnemy(5, ABYSS_KINDS[4], 'elite');
  check('Swift: 1.5× the attacks, each 0.75× the hit', Math.abs(swift.speed / plain.speed - 1.5) < 1e-9 && Math.abs(swift.dps / swift.speed / (plain.dps / plain.speed) - 0.75) < 1e-9);
  const thorned = fightFoe(hero, lineup(5, EliteAffix.Thorned, [BossAffix.Hungering]), 1).fight;
  check('Thorned: your hits come back at you', thorned.events.some(e => e.by === 'you' && (e.reflected ?? 0) > 0));
  const unyielding = depthFoes(hero, lineup(5, EliteAffix.Unyielding, [BossAffix.Hungering]))[1].enemy;
  check('Unyielding: regenerates 2% of max HP a second', Math.abs((unyielding.regen ?? 0) - 0.02 * unyielding.hp) < 1e-6);
  const rav = fightFoe(dummy, lineup(5, EliteAffix.Ravenous, [BossAffix.Hungering]), 1, 3n).fight;
  const early = mean(rav.events.filter(e => e.by === 'enemy' && e.kind === 'hit' && e.t < 5).map(e => e.damage));
  const late = mean(rav.events.filter(e => e.by === 'enemy' && e.kind === 'hit' && e.t >= 25).map(e => e.damage));
  check('Ravenous: its hits grow through the fight', late > early * 1.15, `${early.toFixed(1)} → ${late.toFixed(1)}`);
}
{
  const boss = (s: CombatStats, affixes: number[], depth = 60) => fightFoe(s, lineup(depth, EliteAffix.Swift, affixes), 2, 4n);
  const hung = boss(dummy, [BossAffix.Hungering], 3).fight.events.filter(e => e.by === 'enemy' && e.kind === 'hit');
  check('Hungering: hits after 20 s are bigger', mean(hung.filter(e => e.t >= 20).map(e => e.damage)) > 1.15 * mean(hung.filter(e => e.t < 10).map(e => e.damage)));
  const mir = boss(hero, [BossAffix.Mirrored]).foe.enemy;
  check('Mirrored: resists your main damage, attacks your weaker defense', mir.defense === 'Armored' && mir.damageType === weakerDefense(hero, mir.level));
  const fall = boss(dummy, [BossAffix.Moonfall], 3).fight.events.filter(e => e.burst);
  check('Moonfall: an undodgeable burst every 12 s', fall.length > 0 && fall.every(e => Math.abs(e.t / 12 - Math.round(e.t / 12)) < 1e-9 && e.kind === 'hit'));
  const healerStats = character(3, 'Healing');
  const star = boss(healerStats, [BossAffix.Starless]).fight.events.filter(e => e.by === 'you');
  const bright = boss(healerStats, [BossAffix.Hungering]).fight.events.filter(e => e.by === 'you');
  check('Starless: your heals are halved', mean(star.map(e => e.healed)) < 0.6 * mean(bright.map(e => e.healed)) + 1e-9);
  const tidal = boss(hero, [BossAffix.Tidal]).foe.matchup.enemyHit;
  const phys = matchup(hero, { ...depthEnemy(60, DEEP_WARDEN, 'boss'), damageType: 'Physical' }).enemyHit;
  const mag = matchup(hero, { ...depthEnemy(60, DEEP_WARDEN, 'boss'), damageType: 'Magic' }).enemyHit;
  check('Tidal: its hit is half physical, half magic', Math.abs(tidal - (phys + mag) / 2) < 1e-9);
  check('Veiled: hard to hit', boss(hero, [BossAffix.Veiled]).foe.matchup.enemyEvasion > 0.2);
  const ecl = boss(tank, [BossAffix.Eclipse], 1).fight.events.filter(e => e.by === 'you');
  check("Eclipse: 4 s every 20 s it can't be damaged", ecl.some(e => e.immune) &&
    ecl.every(e => !!e.immune === (e.t >= 20 && e.t % 20 < 4)), `${ecl.length} swings, last at ${ecl.at(-1)?.t.toFixed(0)} s`);
  const moth = fightFoe(hero, lineup(5, EliteAffix.Swift, [BossAffix.Hungering], ABYSS_KINDS[7].id), 0).fight.events.filter(e => e.by === 'you');
  check("Eclipse Moth: can't be hurt for its first 5 s", moth.filter(e => e.t < 5).every(e => e.immune && e.damage === 0) && moth.some(e => e.t >= 5 && e.damage > 0));
}

// ---------------------------------------------------------------- rewards

{
  const r1 = depthReward(1);
  const r10 = depthReward(10);
  const r101 = depthReward(101);
  const r111 = depthReward(111);
  const voidglass = (r: ReturnType<typeof depthReward>) => r.materials.find(([id]) => id === untieredMaterial('Voidglass').id)?.[1] ?? 0;
  check('every depth pays gold, XP, Dust, materials and Voidglass', [r1, r10, r101].every(r => r.gold > 0n && r.xp > 0n && r.dust > 0n && r.materials.length > 1 && voidglass(r) > 0));
  check('a bigger Voidglass batch every 10 depths', voidglass(r10) > voidglass(depthReward(9)));
  check('a Greater power elixir every 5 depths up to 100', [5, 10, 95, 100].every(d => SUPPLIES_BY_ID.get(depthReward(d).elixir ?? 0)?.greater === true) &&
    [4, 6, 101, 105].every(d => depthReward(d).elixir === undefined));
  check('past depth 100 rewards only grow by the formula (× 1.03 a depth)', Math.abs(Number(r111.gold) / Number(r101.gold) - 1.03 ** 10) < 0.01 && voidglass(r111) === 4);
}

// ---------------------------------------------------------------- balance

{
  const chars = Array.from({ length: 24 }, (_, i) => character(100 + i, PROFILES[i % 4]));
  const depths = [1, 3, 5, 6, 8, 10, 12, 15, 20];
  const table = depths.map(d => ({ d, odds: mean(chars.map(c => depthOdds(c, d, 60))) }));
  console.log(`  reference win odds by depth (24 characters, Lv ${LEVEL}, random T4 Rare+ gear, 4 profiles):`);
  console.log('  ' + table.map(r => `${r.d}: ${r.odds.toFixed(2)}`).join(' · '));
  const wallOf = (c: CombatStats) => { for (let d = 1; d < 200; d++) if (depthOdds(c, d, 30) < 0.5) return d; return 200; };
  const walls = chars.map(wallOf).sort((a, b) => a - b);
  console.log(`  wall depth (odds < 50%): median ${walls[walls.length >> 1]}, range ${walls[0]}–${walls.at(-1)}`);
  const at = (d: number) => table.find(r => r.d === d)!.odds;
  check('the reference player clears depths 1–5 comfortably', at(1) >= 0.95 && at(5) >= 0.85, `${at(1).toFixed(2)} / ${at(5).toFixed(2)}`);
  const median = walls[walls.length >> 1];
  check('the reference player walls around depth 8–12', median >= 8 && median <= 12, `median ${median}`);
}

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
