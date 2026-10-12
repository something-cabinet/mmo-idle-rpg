// Checks for live combat (spacetimedb/src/sim.ts): determinism, averages that match
// the formulas, and settling in pieces. No server needed:
//   npm run test:sim
import { SLOTS, type Slot } from '../spacetimedb/src/data/bases';
import { Stat, toStored } from '../spacetimedb/src/data/stats';
import { ENEMIES_BY_ID } from '../spacetimedb/src/data/zones';
import { combatStats, matchup, type GearItem } from '../spacetimedb/src/combat';
import { project, type Progress } from '../spacetimedb/src/game';
import { makeItem, seededRng } from '../spacetimedb/src/loot';
import { fightRng, simulate, simulateFight } from '../spacetimedb/src/sim';

let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed++;
}
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
const f = (n: number) => n.toFixed(2);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

function item(baseId: number, tier: number, affixes: [number, number][] = []): GearItem {
  const it = makeItem(seededRng(0n), baseId, tier, 'Common');
  return { ...it, affixes: affixes.map(([stat, v]) => ({ stat, tier, value: toStored(v) })) };
}
const gear = (bySlot: Partial<Record<Slot, GearItem>>) => SLOTS.map(s => bySlot[s]);
const enemy = (id: number) => ENEMIES_BY_ID.get(id)!.enemy;

const starter = gear({ MainHand: item(1, 1), Chest: item(35, 1), Feet: item(37, 1) });
const rat = enemy(101);
const ID = 42n;
const T0 = 1_700_000_000_000_000n;
const fresh: Progress = { level: 1, xp: 0n, gold: 0n, settledMicros: T0 };
const secs = (s: number) => BigInt(Math.round(s * 1e6));

// ---------------------------------------------------------------- one fight

{
  const s = combatStats(1, starter);
  const m = matchup(s, rat);
  const a = simulateFight(s, m, rat, fightRng(ID, T0));
  const b = simulateFight(s, m, rat, fightRng(ID, T0));
  check('same seed, same fight', JSON.stringify(a.events) === JSON.stringify(b.events) && a.end === b.end);
  const c = simulateFight(s, m, rat, fightRng(ID, T0 + 1n));
  check('another start time, another fight', JSON.stringify(a.events) !== JSON.stringify(c.events));
  check('a fight starts with the walk', a.walk === s.walkTime && a.events[0].t > a.walk);
  check('starter kit kills a rat', a.outcome === 'kill' && a.events.at(-1)!.foeHp === 0);

  const fights = Array.from({ length: 3000 }, (_, i) => simulateFight(s, m, rat, fightRng(ID, BigInt(i))));
  const ttk = mean(fights.map(x => x.end - x.walk));
  // Fights land whole swings while the formula is continuous, so allow for the overshoot of the last swing.
  check('average fight length matches the formula', near(ttk, m.timeToKill, m.timeToKill * 0.1), `${f(ttk)} s vs ${f(m.timeToKill)} s`);
  check('HP never goes above max', fights.every(x => x.events.every(e => e.youHp <= s.maxHp + 1e-9)));
  const critRate = mean(fights.flatMap(x => x.events.filter(e => e.by === 'you').map(e => (e.kind === 'crit' ? 1 : 0))));
  check('crits land at the crit chance', near(critRate, s.sources[0].critChance, 0.01), f(critRate));
}

{
  // A healing staff heals on its swings.
  const healer = gear({ MainHand: item(10, 1), Chest: item(35, 1), Feet: item(37, 1) });
  const s = combatStats(5, healer);
  const fight = simulateFight(s, matchup(s, rat), rat, fightRng(ID, T0));
  check('healing staff swings heal you', fight.events.some(e => e.by === 'you' && e.healed > 0));
}

// ---------------------------------------------------------------- settling

{
  const hour = T0 + secs(3600);
  const live = simulate(fresh, { gear: starter, enemy: rat }, hour, ID);
  const ev = project(fresh, { gear: starter, enemy: rat }, hour);
  check('an hour online kills about as many as the formula', near(live.kills, ev.kills, ev.kills * 0.06), `${live.kills} vs ${ev.kills}`);
  check('… and levels about the same', Math.abs(live.level - ev.level) <= 1, `Lv ${live.level} vs ${ev.level}`);
  check('the fight in progress stays open', live.current !== undefined && live.current.startMicros === live.settledMicros && live.settledMicros <= hour);

  // Settling every ~37 s (any cadence) gives the same fights as one settle.
  let p: Progress = fresh;
  let kills = 0;
  for (let t = T0 + secs(37); t < hour; t += secs(37)) {
    const r = simulate(p, { gear: starter, enemy: rat }, t, ID);
    kills += r.kills;
    p = r;
  }
  const last = simulate(p, { gear: starter, enemy: rat }, hour, ID);
  kills += last.kills;
  check('settling in pieces plays the same fights', kills === live.kills && last.settledMicros === live.settledMicros, `${kills} vs ${live.kills}`);
  check('… with the same level and about the same XP', last.level === live.level && near(Number(last.xp), Number(live.xp), 60), `${last.xp} vs ${live.xp}`);
  check('… and the same fight in progress', last.current?.startMicros === live.current?.startMicros);
}

{
  // A fresh level 1 against Grubnak loses.
  const boss = enemy(106);
  const r = simulate(fresh, { gear: starter, enemy: boss }, T0 + secs(600), ID);
  check('a losing fight ends in defeat', r.kills === 0 && r.defeatedAt !== undefined && r.defeatedAt > T0);
  check('… settled to now, with the lost fight to show', r.settledMicros === T0 + secs(600) && r.current?.fight.outcome === 'defeat');
  const early = simulate(fresh, { gear: starter, enemy: boss }, T0 + secs(1), ID);
  check('… and still fighting before then', early.defeatedAt === undefined && early.settledMicros === T0);
}

{
  const idle = simulate(fresh, { gear: starter, enemy: undefined }, T0 + secs(60), ID);
  check('idle: time passes with no gains', idle.kills === 0 && idle.settledMicros === T0 + secs(60) && idle.current === undefined);
  const naked = simulate(fresh, { gear: gear({}), enemy: rat }, T0 + secs(3600), ID);
  check('no weapon vs a rat: no kills', naked.kills === 0);
}

{
  // Item find doesn't change fights; gold find changes gold only.
  // On the chest: a ring's attribute implicit would change the fights.
  const rich = gear({ MainHand: item(1, 1), Chest: item(35, 1, [[Stat.GoldFindPct, 50]]), Feet: item(37, 1) });
  const a = simulate(fresh, { gear: starter, enemy: rat }, T0 + secs(600), ID);
  const b = simulate(fresh, { gear: rich, enemy: rat }, T0 + secs(600), ID);
  check('gold find: same fights, more gold', a.kills === b.kills && b.gold > a.gold, `${a.gold} → ${b.gold}`);
}

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
