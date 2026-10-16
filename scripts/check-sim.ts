// Checks for live combat (spacetimedb/src/sim.ts): determinism, averages that match
// the formulas, and settling in pieces. No server needed:
//   npm run test:sim
import { SLOTS, type Slot } from '../spacetimedb/src/data/bases';
import { Stat, toStored } from '../spacetimedb/src/data/stats';
import { ENEMIES_BY_ID } from '../spacetimedb/src/data/zones';
import { combatStats, matchup, type GearItem } from '../spacetimedb/src/combat';
import { project, type Progress } from '../spacetimedb/src/game';
import { makeItem, seededRng } from '../spacetimedb/src/loot';
import { RESPAWN_SECONDS, fightRng, simulate, simulateFight } from '../spacetimedb/src/sim';
import { Effect, LEGENDARIES_BY_ID, copiesToCap } from '../spacetimedb/src/data/legendary';

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
  // A close matchup won on average (time to die 1.1× time to kill): bad luck loses some
  // fights, each costing a respawn, never the target.
  const rat = enemy(101);
  const m0 = matchup(combatStats(1, starter), rat);
  const close = { ...rat, dps: (rat.dps * m0.timeToDie) / (1.1 * m0.timeToKill), xp: 0 };
  check('a close matchup is still won on average', matchup(combatStats(1, starter), close).viable);
  const r = simulate(fresh, { gear: starter, enemy: close }, T0 + secs(3600), ID);
  check('lost fights in a winnable matchup respawn instead of ending the session',
    r.defeatedAt === undefined && (r.respawns ?? 0) > 0 && r.kills > 0, `${r.kills} kills, ${r.respawns} respawns`);
  // Cut the hour into settles: the same fights, kills and respawns.
  let p: Progress = fresh;
  let kills = 0;
  let respawned = 0;
  for (let t = T0 + secs(97); t < T0 + secs(3600); t += secs(97)) {
    const x = simulate(p, { gear: starter, enemy: close }, t, ID);
    kills += x.kills;
    respawned += x.respawns ?? 0;
    p = x;
  }
  const last = simulate(p, { gear: starter, enemy: close }, T0 + secs(3600), ID);
  check('… and settling in pieces plays the same fights and respawns',
    kills + last.kills === r.kills && respawned + (last.respawns ?? 0) === r.respawns && last.settledMicros === r.settledMicros,
    `${kills + last.kills} vs ${r.kills}, ${respawned + (last.respawns ?? 0)} vs ${r.respawns}`);
  // Replayed by hand (no XP, so no level-ups): each lost fight is followed by RESPAWN_SECONDS.
  const stats = combatStats(1, starter);
  const mc = matchup(stats, close);
  let start = T0;
  let won = 0;
  let lost = 0;
  for (;;) {
    const f = simulateFight(stats, mc, close, fightRng(ID, start));
    const next = start + BigInt(Math.ceil((f.end + (f.outcome === 'defeat' ? RESPAWN_SECONDS : 0)) * 1e6));
    if (next > T0 + secs(3600)) break;
    if (f.outcome === 'kill') won++;
    else lost++;
    start = next;
  }
  check(`… each lost fight followed by ${RESPAWN_SECONDS} s`, won === r.kills && lost === r.respawns && start === r.settledMicros, `${won} / ${lost}`);
  // Offline earns what live fights average out to, losses and respawns included.
  const day = T0 + secs(8 * 3600);
  const live = simulate(fresh, { gear: starter, enemy: close }, day, ID);
  const away = project(fresh, { gear: starter, enemy: close }, day);
  check('offline settles a close matchup like live fights: about the same kills',
    near(away.kills, live.kills, 0.1 * live.kills) && away.defeatedAt === undefined, `${away.kills} vs ${live.kills}`);
  check('… and about the same respawns', near(away.respawns ?? 0, live.respawns ?? 0, 0.1 * (live.respawns ?? 0)), `${away.respawns} vs ${live.respawns}`);
  check('… where the formulas alone would grant far more', away.kills < 0.7 * Math.floor(8 * 3600 * mc.killRate), `${Math.floor(8 * 3600 * mc.killRate)}`);
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

// ---------------------------------------------------------------- new legendary effects

{
  // Each effect at its cap: live fights average what the formulas say, and the effect
  // never makes a matchup worse (legendary effects have no downside).
  const main = item(1, 1, [[Stat.PhysDamage, 3], [Stat.CritChancePct, 100], [Stat.EvasionRating, 40]]);
  const chest = item(35, 1, [[Stat.HpRegen, 0.5]]);
  const COPY_SLOTS: Slot[] = ['Head', 'Hands', 'Neck', 'Ring1', 'Ring2'];
  const kit = (effect: number | undefined, base: Partial<Record<Slot, GearItem>>) => {
    const l = effect === undefined ? undefined : LEGENDARIES_BY_ID.get(effect)!;
    const copies = l ? Math.min(COPY_SLOTS.length, copiesToCap(l)) : 0;
    const extra: Partial<Record<Slot, GearItem>> = {};
    COPY_SLOTS.forEach((slot, i) => {
      const it = item(slot === 'Neck' || slot.startsWith('Ring') ? 50 : 36, 1);
      extra[slot] = l && i < copies ? { ...it, legendary: { effect: l.id, stat: l.bonusStat, value: 0n } } : it;
    });
    return gear({ ...base, ...extra });
  };
  const fightKit = { MainHand: main, Chest: chest, Feet: item(37, 1) };
  const COMBAT = [Effect.FollowThrough, Effect.Riposte, Effect.Deadeye, Effect.Bully, Effect.HonedEdge, Effect.Discipline, Effect.Berserker];
  const DEFENSE = [Effect.Stoneskin, Effect.LastStand, Effect.Bulwark, Effect.SecondSkin];
  for (const id of [104, 201]) {
    const e = enemy(id);
    const base = matchup(combatStats(5, kit(undefined, fightKit)), e);
    for (const fx of COMBAT) {
      const s = combatStats(5, kit(fx, fightKit));
      const m = matchup(s, e);
      const wins = Array.from({ length: 2000 }, (_, i) => simulateFight(s, m, e, fightRng(ID, BigInt(i * 7919)))).filter(x => x.outcome === 'kill');
      const ttk = mean(wins.map(x => x.end - x.walk));
      const name = LEGENDARIES_BY_ID.get(fx)!.name;
      check(`${name} vs ${e.name}: live fight length matches the formula`, near(ttk, m.timeToKill, m.timeToKill * 0.12), `${f(ttk)} s vs ${f(m.timeToKill)} s`);
      check(`… and fights are shorter than without it`, m.timeToKill < base.timeToKill, `${f(m.timeToKill)} vs ${f(base.timeToKill)}`);
    }
  }
  // Defense: no weapon, so every fight ends in a defeat; compare the time to die.
  const e = enemy(201);
  const unarmed = { MainHand: item(1, 1, [[Stat.EvasionRating, 40]]), Chest: chest, Feet: item(37, 1) };
  const ttdOf = (fx: number | undefined) => {
    const s = { ...combatStats(5, kit(fx, unarmed)), sources: [] };
    const m = matchup(s, e);
    const fights = Array.from({ length: 2000 }, (_, i) => simulateFight(s, m, e, fightRng(ID, BigInt(i * 104729))));
    return { m, live: mean(fights.filter(x => x.outcome === 'defeat').map(x => x.end - x.walk)) };
  };
  const bare = ttdOf(undefined);
  for (const fx of DEFENSE) {
    const { m, live } = ttdOf(fx);
    const name = LEGENDARIES_BY_ID.get(fx)!.name;
    check(`${name}: live time to die matches the formula`, near(live, m.timeToDie, m.timeToDie * 0.05), `${f(live)} s vs ${f(m.timeToDie)} s`);
    check(`… and is longer than without it`, m.timeToDie > bare.m.timeToDie, `${f(m.timeToDie)} vs ${f(bare.m.timeToDie)}`);
  }
  {
    const s = { ...combatStats(5, kit(Effect.SecondSkin, unarmed)), sources: [] };
    const m = matchup(s, e);
    const fight = simulateFight(s, m, e, fightRng(ID, T0));
    const first = fight.events.find(x => x.by === 'enemy' && x.kind === 'hit')!;
    check('Second Skin: the shield takes the first hit', first.youHp === s.maxHp && first.shield! < m.shield);
  }
  {
    // Unbreakable: raises the mitigation cap once armor reaches it.
    const tank = gear({ Chest: item(35, 1, [[Stat.Armor, 5000]]) });
    const capped = matchup(combatStats(5, tank), e);
    const s = combatStats(5, gear({ Chest: item(35, 1, [[Stat.Armor, 5000]]), Head: { ...item(36, 1), legendary: { effect: Effect.Unbreakable, stat: Stat.Resistance, value: 0n } } }));
    check('Unbreakable: mitigation cap 85% + 2% per copy', near(capped.playerMitigation, 0.85, 1e-12) && near(matchup(s, e).playerMitigation, 0.87, 1e-12));
  }
  {
    // Bloodthirst raises the lifesteal cap; Honed Edge never deepens a negative flat roll.
    const leech = (fx?: number) => combatStats(5, gear({
      MainHand: item(1, 1, [[Stat.LifestealPct, 20]]),
      Head: fx ? { ...item(36, 1), legendary: { effect: fx, stat: Stat.LifestealPct, value: 0n } } : item(36, 1),
    }));
    check('Bloodthirst: lifesteal cap 5% → 8%', near(leech().lifesteal, 0.05, 1e-12) && near(leech(Effect.Bloodthirst).lifesteal, 0.08, 1e-12));
    const cursed = (fx?: number) => combatStats(5, gear({
      MainHand: fx ? { ...item(1, 1, [[Stat.PhysDamage, -2]]), legendary: { effect: fx, stat: Stat.AttackSpeedPct, value: 0n } } : item(1, 1, [[Stat.PhysDamage, -2]]),
    })).sources[0].hit.Physical;
    check('Honed Edge: a negative flat roll stays as it is', near(cursed(Effect.HonedEdge), cursed(), 1e-12));
  }
}

{
  // Savor: some kills keep their charge, online and offline.
  const elixir = { buffs: { damage: 1.2 }, killsLeft: 240, stock: 0 };
  const savor = gear({ MainHand: item(1, 1), Chest: item(35, 1), Feet: item(37, 1), Ring1: { ...item(50, 1), legendary: { effect: Effect.Savor, stat: Stat.MaxHpPct, value: 0n } } });
  const hour = T0 + secs(3600);
  const plain = project(fresh, { gear: starter, enemy: rat, elixir }, hour);
  const off = project(fresh, { gear: savor, enemy: rat, elixir }, hour);
  const on = simulate(fresh, { gear: savor, enemy: rat, elixir }, hour, ID);
  const usedPlain = 240 - plain.elixir!.killsLeft;
  const usedOff = 240 - off.elixir!.killsLeft;
  const usedOn = 240 - on.elixir!.killsLeft;
  check('Savor: offline, 15% of kills keep their charge', near(usedOff / off.elixir!.buffedKills, 0.85, 0.01), `${usedOff} charges for ${off.elixir!.buffedKills} kills (${usedPlain} without)`);
  check('… online about the same', near(usedOn / on.elixir!.buffedKills, 0.85, 0.05), `${usedOn} charges for ${on.elixir!.buffedKills} kills`);
}

{
  // Patience: offline kills after 4 h earn 15% more XP and gold and extra drop kills; before, nothing changes.
  const patient = gear({ MainHand: item(1, 1), Chest: item(35, 1), Feet: item(37, 1), Ring1: { ...item(50, 1), legendary: { effect: Effect.Patience, stat: Stat.XpGainPct, value: 0n } } });
  const plainRing = gear({ MainHand: item(1, 1), Chest: item(35, 1), Feet: item(37, 1), Ring1: item(50, 1) });
  const lvl = { ...fresh, level: 30 };
  const at = (h: number) => T0 + secs(h * 3600);
  const cap = secs(8 * 3600);
  const a3 = project(lvl, { gear: plainRing, enemy: rat }, at(3), cap);
  const b3 = project(lvl, { gear: patient, enemy: rat }, at(3), cap);
  check('Patience: no change in the first 4 h', a3.gold === b3.gold && a3.kills === b3.kills && b3.bonusKills === undefined);
  const a8 = project(lvl, { gear: plainRing, enemy: rat }, at(8), cap);
  const b8 = project(lvl, { gear: patient, enemy: rat }, at(8), cap);
  const late = a8.kills / 2;
  check('… then +15% gold and drops', b8.kills === a8.kills && near(Number(b8.gold - a8.gold) / Number(a8.gold / 2n), 0.15, 0.01) && near(b8.bonusKills!, late * 0.15, 2),
    `gold ${a8.gold} → ${b8.gold}, bonus kills ${f(b8.bonusKills!)}`);
  const online = project(lvl, { gear: patient, enemy: rat }, at(8));
  check('… offline only', online.bonusKills === undefined);
}

// ---------------------------------------------------------------- enemy traits

{
  // Moonmoth Swarm dodges your attacks; Silverbark Dryad regenerates.
  const t4 = gear({ MainHand: item(1, 4), Chest: item(35, 4, [[Stat.MaxHp, 2000]]), Feet: item(37, 4) });
  const s = combatStats(40, t4);
  for (const id of [401, 403]) {
    const e = enemy(id);
    const m = matchup(s, e);
    const fights = Array.from({ length: 2000 }, (_, i) => simulateFight(s, m, e, fightRng(ID, BigInt(i * 7919))));
    const wins = fights.filter(x => x.outcome === 'kill');
    const ttk = mean(wins.map(x => x.end - x.walk));
    check(`${e.name}: live fight length matches the formula`, wins.length > 1900 && near(ttk, m.timeToKill, m.timeToKill * 0.1), `${f(ttk)} s vs ${f(m.timeToKill)} s`);
    const swings = fights.flatMap(x => x.events.filter(ev => ev.by === 'you' && !ev.carried));
    const missRate = mean(swings.map(ev => (ev.kind === 'miss' ? 1 : 0)));
    check(`${e.name}: your swings miss at its evasion`, near(missRate, m.enemyEvasion, 0.01), f(missRate));
  }
  const dryad = enemy(403);
  const healed = simulateFight(s, matchup(s, dryad), dryad, fightRng(ID, T0)).events.some((ev, i, all) => i > 0 && ev.foeHp > all[i - 1].foeHp);
  check('Silverbark Dryad heals between hits', healed);
  const noRegen = matchup(s, { ...dryad, regen: 0 });
  check('… and takes longer to kill than without its regen', matchup(s, dryad).timeToKill > noRegen.timeToKill);
  check('an enemy out-healing your damage is never killed', matchup(s, { ...dryad, regen: 1e6 }).timeToKill === Infinity);
}

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
