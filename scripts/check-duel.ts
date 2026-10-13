// Checks for friendly duels (src/ui/duelSim.ts). No server needed:
//   npm run test:duel
import { SLOTS, type Slot } from '../spacetimedb/src/data/bases';
import { combatStats, type GearItem } from '../spacetimedb/src/combat';
import { makeItem, seededRng } from '../spacetimedb/src/loot';
import { DUEL_SECONDS, duelRng, simulateDuel, winRate } from '../src/ui/duelSim';

let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed++;
}

const item = (baseId: number, tier: number): GearItem => makeItem(seededRng(BigInt(baseId), BigInt(tier)), baseId, tier, 'Common');
const gear = (bySlot: Partial<Record<Slot, GearItem>>) => SLOTS.map(s => bySlot[s]);
const kit = (tier: number) => gear({ MainHand: item(1, tier), Chest: item(35, tier), Feet: item(37, tier), Head: item(34, tier) });

const a = combatStats(10, kit(1));
const strong = combatStats(30, kit(3));
const unarmed = combatStats(10, gear({ Chest: item(35, 1) }));

const mirror = winRate([a, a], 1n, 2n);
check('a mirror match is about even', mirror > 0.4 && mirror < 0.6, mirror.toFixed(3));
const one = simulateDuel([a, strong], duelRng(1n, 2n, 7));
const again = simulateDuel([a, strong], duelRng(1n, 2n, 7));
check('same round, same duel', one.end === again.end && one.winner === again.winner && one.events.length === again.events.length);
check('a much stronger side wins nearly always', winRate([strong, a], 1n, 2n) > 0.95);
check('… and from either seat', winRate([a, strong], 1n, 2n) < 0.05);
const noWeapon = simulateDuel([unarmed, a], duelRng(1n, 2n, 1));
check('a side with no weapon never wins', noWeapon.winner === 1 && noWeapon.events.every(e => e.by === 1));
const many = Array.from({ length: 200 }, (_, i) => simulateDuel([a, a], duelRng(3n, 4n, i)));
check(`every duel ends by ${DUEL_SECONDS} s, a knockout or on points`, many.every(d => d.end <= DUEL_SECONDS && (d.by === 'ko' ? d.events.at(-1)!.t === d.end : d.end === DUEL_SECONDS)));
check('HP stays within 0 and max', many.every(d => d.events.every(e => e.hp.every((h, i) => h >= 0 && h <= d.maxHp[i] + 1e-9))));

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
