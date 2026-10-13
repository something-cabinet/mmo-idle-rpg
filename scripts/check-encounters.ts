// Checks for rare encounters (spacetimedb/src/encounters.ts). No server needed:
//   npm run test:encounters
import { SLOTS, type Slot } from '../spacetimedb/src/data/bases';
import { ENEMIES_BY_ID, ZONES_BY_ID } from '../spacetimedb/src/data/zones';
import { combatStats, matchup, type GearItem } from '../spacetimedb/src/combat';
import { addXp, xpToNext } from '../spacetimedb/src/game';
import { ENCOUNTER_CHANCE, EncounterKind, eliteOf, rollEncounters, type EncounterInput } from '../spacetimedb/src/encounters';
import { makeItem, rarityRank, seededRng } from '../spacetimedb/src/loot';

let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed++;
}
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

const item = (baseId: number, tier: number): GearItem => makeItem(seededRng(0n), baseId, tier, 'Common');
const gear = (bySlot: Partial<Record<Slot, GearItem>>) => SLOTS.map(s => bySlot[s]);
const starter = gear({ MainHand: item(1, 1), Chest: item(35, 1), Feet: item(37, 1) });
const greenhollow = ZONES_BY_ID.get(1)!;
const enemy = (id: number) => ENEMIES_BY_ID.get(id)!.enemy;
const input = (over: Partial<EncounterInput> = {}): EncounterInput => ({
  kills: 1900, // ~8 h at the design pace
  zone: greenhollow,
  enemy: enemy(104),
  stats: combatStats(12, starter),
  ...over,
});

{
  const runs = Array.from({ length: 300 }, (_, i) => rollEncounters(seededRng(BigInt(i)), input()));
  const n = mean(runs.map(r => r.length));
  const expected = 1900 * ENCOUNTER_CHANCE;
  check(`~${expected.toFixed(1)} encounters in 1,900 kills`, near(n, expected, expected * 0.08), n.toFixed(2));
  const all = runs.flat();
  const share = (k: number) => all.filter(e => e.kind === k).length / all.length;
  check('every kind shows up', [1, 2, 3, 4].every(k => share(k) > 0.05), [1, 2, 3, 4].map(k => share(k).toFixed(2)).join(' / '));
  check('reproducible from the seed', JSON.stringify(rollEncounters(seededRng(7n), input()), (_k, v) => (typeof v === 'bigint' ? String(v) : v)) ===
    JSON.stringify(runs[7], (_k, v) => (typeof v === 'bigint' ? String(v) : v)));

  const zoneBases = new Set(greenhollow.enemies.flatMap(e => e.drops));
  const caches = all.filter(e => e.kind === EncounterKind.Cache);
  check('caches give one Rare+ item of the zone tier from its bases',
    caches.every(e => e.item && rarityRank(e.item.rarity.tag) >= rarityRank('Rare') && e.item.tier === 1 && zoneBases.has(e.item.baseId)));
  const m = matchup(input().stats, enemy(104));
  check('treasure goblins give 30 kills of gold',
    all.filter(e => e.kind === EncounterKind.TreasureGoblin).every(e => e.gold === BigInt(Math.round(30 * m.goldPerKill))));
  check('stashes give at least 1 of each material the enemy drops',
    all.filter(e => e.kind === EncounterKind.Stash).every(e => e.materials.length === enemy(104).materials.length && e.materials.every(x => x.count >= 1)));
}

{
  const boss = enemy(106);
  const kinds = Array.from({ length: 100 }, (_, i) => rollEncounters(seededRng(BigInt(i)), input({ enemy: boss }))).flat().map(e => e.kind);
  check('no elites while farming a boss', kinds.length > 0 && !kinds.includes(EncounterKind.Elite), `${kinds.length} encounters`);

  const weak = combatStats(1, starter);
  const strong = combatStats(40, starter);
  check('elite is tougher than its enemy', eliteOf(enemy(105)).hp > enemy(105).hp && eliteOf(enemy(105)).dps > enemy(105).dps);
  const elites = (stats: typeof weak, enemyId: number) =>
    Array.from({ length: 200 }, (_, i) => rollEncounters(seededRng(BigInt(i)), input({ enemy: enemy(enemyId), stats }))).flat().filter(e => e.kind === EncounterKind.Elite);
  const lost = elites(weak, 105);
  const won = elites(strong, 101);
  check('a weak character flees an Elite Goblin Brute, with no rewards', lost.length > 0 && lost.every(e => !e.won && e.xp === 0n && e.gold === 0n), `${lost.length} elites`);
  check('a level-40 character beats Elite Field Rats for XP and gold', won.length > 0 && won.every(e => e.won && e.xp > 0n && e.gold > 0n), `${won.length} elites`);
}

{
  const need = xpToNext(5);
  check('addXp levels up', addXp(5, need - 1n, 2n).level === 6 && addXp(5, need - 1n, 2n).xp === 1n);
  check('addXp does nothing at max level', addXp(100, 0n, 1000n).level === 100 && addXp(100, 0n, 1000n).xp === 0n);
}

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
