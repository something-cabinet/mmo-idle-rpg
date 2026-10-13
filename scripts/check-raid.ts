// Checks for raid fights (spacetimedb/src/raid.ts) and the raid boss's balance. No server needed:
//   npm run test:raid
import { BASE_LIST, SLOTS } from '../spacetimedb/src/data/bases';
import { combatStats, matchup, type CombatStats } from '../spacetimedb/src/combat';
import { autoEquip, type OwnedItem, type Profile } from '../spacetimedb/src/equip';
import { NPC_POWER, RAIDS_BY_ID, RAID_RARITY_ODDS } from '../spacetimedb/src/data/raids';
import { raidUniques } from '../spacetimedb/src/data/uniques';
import { makeItem, seededRng, type RarityName } from '../spacetimedb/src/loot';
import { decodeSetup, encodeSetup, lockoutEnd, lockoutStart, npcStats, raidOdds, raidRng, rollRaidItem, simulateRaid, type RaidSetup } from '../spacetimedb/src/raid';

let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed++;
}

const raid = RAIDS_BY_ID.get(1)!;
const LEVEL = 38;
const MAIN = SLOTS.indexOf('MainHand');

/**
 * A character who has just cleared T3: level 38, the best of a bag of 60 random T3
 * items (Rare 60%, Epic 30%, Legendary 10%) for its role. A healer must wield a
 * Healing Staff; the others pick any weapon.
 */
function character(seed: number, role: 'tank' | 'healer' | 'dps'): CombatStats {
  const rng = seededRng(BigInt(seed), 77n);
  const items: OwnedItem[] = Array.from({ length: 60 }, (_, i) => {
    const r = rng();
    const rarity: RarityName = r < 0.6 ? 'Rare' : r < 0.9 ? 'Epic' : 'Legendary';
    const b = BASE_LIST[Math.floor(rng() * BASE_LIST.length)];
    const baseId = role === 'healer' && b.weapon ? 10 : b.id;
    return { ...makeItem(rng, baseId, 3, rarity), id: BigInt(i + 1) };
  });
  const profile: Profile = role === 'tank' ? 'Survival' : 'Damage';
  const slots = autoEquip(LEVEL, items, SLOTS.map(() => 0n), profile);
  const gear = slots.map(id => items.find(i => i.id === id));
  if (role === 'healer' && gear[MAIN]?.baseId !== 10) throw new Error('healer without a staff');
  return combatStats(LEVEL, gear);
}

const party = (stats: CombatStats[], npcs = 0): RaidSetup => {
  const fighters = stats.map((s, i) => ({ characterId: BigInt(i + 1), name: `P${i + 1}`, stats: s }));
  const npc = npcStats(stats, raid);
  for (let i = 0; i < npcs; i++) fighters.push({ characterId: 0n, name: `NPC ${i + 1}`, stats: npc });
  return { raidId: raid.id, fighters };
};

// ---------------------------------------------------------------- mechanics

const tank = character(1, 'tank');
const healer = character(2, 'healer');
const dps1 = character(3, 'dps');
const dps2 = character(4, 'dps');
const four = party([tank, healer, dps1, dps2]);

const one = simulateRaid(four, raid, raidRng(5n, 1000n));
const again = simulateRaid(four, raid, raidRng(5n, 1000n));
check('same seed, same fight', one.end === again.end && one.won === again.won && one.events.length === again.events.length);
const decoded = simulateRaid(decodeSetup(encodeSetup(four)), raid, raidRng(5n, 1000n));
check('a stored setup replays the same fight', decoded.end === one.end && decoded.won === one.won && decoded.events.length === one.events.length &&
  decoded.events.every((e, i) => e.bossHp === one.events[i].bossHp));
const many = Array.from({ length: 100 }, (_, i) => simulateRaid(four, raid, raidRng(6n, BigInt(i))));
check(`every fight ends by the enrage (${raid.enrageSeconds} s)`, many.every(r => r.end <= raid.enrageSeconds));
check('HP stays within 0 and max', many.every(r => r.events.every(e => e.bossHp >= 0 && e.hp.every((h, i) => h >= 0 && h <= r.maxHp[i] + 1e-6))));
check('a win ends with the boss dead', many.filter(r => r.won).every(r => r.events.at(-1)!.bossHp <= 0));
check('a loss ends with everyone dead, or at the enrage', many.filter(r => !r.won).every(r => r.enraged || r.events.at(-1)!.hp.every(h => h <= 0)));
check('the dead never swing', many.every(r => r.events.every((e, k) => e.by < 0 || k === 0 || r.events[k - 1].hp[e.by] > 0)));
const bossHits = one.events.filter(e => e.by === -1 && e.kind !== 'aoe');
const topThreat = four.fighters.reduce((m, f, i) => (f.stats.threat > four.fighters[m].stats.threat ? i : m), 0);
check('the boss hits the most threatening fighter while it lives', bossHits.every((e, k) => e.target === topThreat || (one.events.find(x => x.t <= e.t && x.hp[topThreat] <= 0) !== undefined)),
  `fighter ${topThreat}`);

const npc = npcStats([tank, healer, dps1, dps2], raid);
const avg = (f: (s: CombatStats) => number) => [tank, healer, dps1, dps2].reduce((a, s) => a + f(s), 0) / 4;
/** Weapon DPS against the boss: no effect damage (an NPC has no effects). */
const dpsOf = (s: CombatStats) => {
  const x = s.sources[0];
  if (!x) return 0;
  const mit = matchup(s, { ...raid.boss, dps: 0 }).enemyMitigation;
  return (x.hit.Physical * (1 - mit.Physical) + x.hit.Magic * (1 - mit.Magic)) * x.attacksPerSec * x.critMult;
};
check(`an NPC has ${NPC_POWER}× the average max HP`, Math.abs(npc.maxHp - NPC_POWER * avg(s => s.maxHp)) < 1e-6);
check(`an NPC has ${NPC_POWER}× the average DPS against the boss`, Math.abs(dpsOf(npc) / avg(dpsOf) - NPC_POWER) < 0.01,
  `${dpsOf(npc).toFixed(1)} vs avg ${avg(dpsOf).toFixed(1)}`);
check('an NPC from no weapons has no attack', npcStats([combatStats(LEVEL, [])], raid).sources.length === 0);

// ---------------------------------------------------------------- loot

const loot = Array.from({ length: 4000 }, (_, i) => rollRaidItem(seededRng(BigInt(i), 9n), raid));
const share = (r: string) => loot.filter(it => it.rarity.tag === r).length / loot.length;
check('raid items are Epic or better, at the raid tier', loot.every(it => ['Epic', 'Legendary', 'Unique'].includes(it.rarity.tag) && it.tier === raid.tier));
check('rarity odds as configured', Math.abs(share('Epic') - RAID_RARITY_ODDS.Epic) < 0.03 && Math.abs(share('Legendary') - RAID_RARITY_ODDS.Legendary) < 0.03 &&
  Math.abs(share('Unique') - RAID_RARITY_ODDS.Unique) < 0.01, `${share('Epic').toFixed(3)} / ${share('Legendary').toFixed(3)} / ${share('Unique').toFixed(3)}`);
const own = new Set(raidUniques(raid.id).map(u => u.id));
check('uniques come from the raid\'s own pool, all of it', loot.filter(it => it.uniqueId).every(it => own.has(it.uniqueId!)) &&
  [...own].every(id => loot.some(it => it.uniqueId === id)));
const day = 86_400_000_000n;
check('lockout: a UTC day', lockoutStart(5n * day + 123n) === 5n * day && lockoutEnd(5n * day) === 6n * day);

// ---------------------------------------------------------------- balance

const roles: ('tank' | 'healer' | 'dps')[] = ['tank', 'healer', 'dps', 'dps'];
const parties = Array.from({ length: 12 }, (_, p) => roles.map((r, i) => character(100 + p * 4 + i, r)));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const odds = (setups: RaidSetup[]) => mean(setups.map((s, i) => raidOdds(s, raid, BigInt(i))));
const full = odds(parties.map(p => party(p)));
const short = odds(parties.map(p => party(p.slice(0, 3))));
const shortHired = odds(parties.map(p => party(p.slice(0, 3), 1)));
const pair = odds(parties.map(p => party(p.slice(0, 2))));
const pairHired = odds(parties.map(p => party(p.slice(0, 2), 2)));
const p0 = parties[0].map(s => ({ dps: dpsOf(s).toFixed(0), hp: s.maxHp.toFixed(0), threat: s.threat.toFixed(2) }));
console.log(`  party 0: ${JSON.stringify(p0)}`);
console.log(`  win odds: 4 players ${full.toFixed(2)} · 3 ${short.toFixed(2)} · 3 + NPC ${shortHired.toFixed(2)} · 2 ${pair.toFixed(2)} · 2 + 2 NPCs ${pairHired.toFixed(2)}`);
check('a full party of T3-cleared players usually wins', full >= 0.45 && full <= 0.95, full.toFixed(2));
check('a party one short mostly loses', short < 0.5, short.toFixed(2));
check('two players alone never win', pair < 0.05, pair.toFixed(2));
check('hiring NPCs into empty seats helps', shortHired > short && pairHired > pair);

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
