// Checks for raid fights (spacetimedb/src/raid.ts) and the raid bosses' balance. No server needed:
//   npm run test:raid
import { SLOTS, ZONE_BASES, base } from '../spacetimedb/src/data/bases';
import { combatStats, matchup, mitigation, type CombatStats } from '../spacetimedb/src/combat';
import { autoEquip, better, ranking, scoreGear, type OwnedItem, type Profile } from '../spacetimedb/src/equip';
import { rerollAffix } from '../spacetimedb/src/craft';
import { NPC_POWER, RAIDS, RAIDS_BY_ID, RAID_RARITY_ODDS, THREAT_FOCUS, bossPhases, phaseAt, type RaidDef } from '../spacetimedb/src/data/raids';
import { raidUniques } from '../spacetimedb/src/data/uniques';
import { makeItem, seededRng, type RarityName } from '../spacetimedb/src/loot';
import { Effect } from '../spacetimedb/src/data/legendary';
import { Stat } from '../spacetimedb/src/data/stats';
import { aggroShares, balancedTargets, clearsToday, decodeSetup, duoFallTimes, duoThreat, encodeSetup, lockoutEnd, lockoutStart, npcStats, raidOdds, raidRng, rollRaidItem, simulateRaid, threatWeight, type RaidFighter, type RaidSetup } from '../spacetimedb/src/raid';

let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed++;
}

const raid = RAIDS_BY_ID.get(1)!;
const moon = RAIDS_BY_ID.get(2)!;
const forge = RAIDS_BY_ID.get(3)!;
/** The level each raid is tested at: a few levels past its zone boss, a player who has just cleared the tier. */
const LEVELS: Record<number, number> = { 1: 38, 2: 48, 3: 58 };
const MAIN = SLOTS.indexOf('MainHand');

/**
 * The gear a character brings to each raid, by raid id: rarity odds of its bag, and rerolls
 * per affix. Early on, random drops (Rare to Legendary). By T5 players come prepared: Epic
 * at least, each affix rerolled toward their role.
 */
const GEAR: Record<number, { epic: number; legendary: number; rerolls: number }> = {
  1: { epic: 0.3, legendary: 0.1, rerolls: 0 },
  2: { epic: 0.3, legendary: 0.1, rerolls: 0 },
  3: { epic: 0.7, legendary: 0.3, rerolls: 1 },
};

/**
 * A character who has just cleared the raid's tier: its level (LEVELS), the best of a bag
 * of 60 random items of the tier (rarity by GEAR, the rest Rare) for its role, then each
 * equipped item's regular affixes rerolled GEAR times, a roll kept when it ranks better
 * (a tank also keeps threat).
 * A healer must wield a Healing Staff; the others pick any weapon.
 */
function character(seed: number, role: 'tank' | 'healer' | 'dps', r: RaidDef = raid): CombatStats {
  const level = LEVELS[r.id];
  const g = GEAR[r.id];
  const rng = seededRng(BigInt(seed), 77n);
  const items: OwnedItem[] = Array.from({ length: 60 }, (_, i) => {
    const x = rng();
    const rare = 1 - g.epic - g.legendary;
    const rarity: RarityName = x < rare ? 'Rare' : x < rare + g.epic ? 'Epic' : 'Legendary';
    const b = ZONE_BASES[Math.floor(rng() * ZONE_BASES.length)];
    const baseId = role === 'healer' && b.weapon ? 10 : b.id;
    return { ...makeItem(rng, baseId, r.tier, rarity), id: BigInt(i + 1) };
  });
  // Damage dealers split between physical and magic builds.
  const profile: Profile = role === 'tank' ? 'Survival' : role === 'healer' ? 'Healing' : seed % 2 ? 'DamageMagic' : 'Damage';
  const slots = autoEquip(level, items, SLOTS.map(() => 0n), profile);
  const gear = slots.map(id => items.find(i => i.id === id));
  if (role === 'healer' && gear[MAIN]?.baseId !== 10) throw new Error('healer without a staff');
  const rank = () => ranking(profile, scoreGear(level, gear));
  for (let slot = 0; slot < gear.length; slot++) {
    const it = gear[slot];
    if (!it) continue;
    for (let a = 0; a < it.affixes.length; a++) {
      for (let k = 0; k < g.rerolls; k++) {
        const kept = gear[slot]!;
        // Threat is the tank's own affix, though Survival doesn't rank it: kept, and a roll of it kept.
        const threat = (x: OwnedItem) => role === 'tank' && x.affixes[a].stat === Stat.ThreatPct;
        if (threat(kept)) break;
        const next = rerollAffix(rng, kept, a);
        if (typeof next === 'string') break;
        const before = rank();
        gear[slot] = next;
        if (!threat(next) && !better(rank(), before, false)) gear[slot] = kept;
      }
    }
  }
  return combatStats(level, gear);
}

/** A party of `stats` and `npcs` hired NPCs. A duo: assigned by `targets` (one per fighter), else balanced (`balancedTargets`). */
const party = (stats: CombatStats[], npcs = 0, r: RaidDef = raid, targets?: number[]): RaidSetup => {
  const fighters: RaidFighter[] = stats.map((s, i) => ({ characterId: BigInt(i + 1), name: `P${i + 1}`, stats: s }));
  const npc = npcStats(r);
  for (let i = 0; i < npcs; i++) fighters.push({ characterId: 0n, name: `NPC ${i + 1}`, stats: npc });
  if (r.duo) {
    const t = targets ?? balancedTargets(r, fighters.map(f => f.stats));
    fighters.forEach((f, i) => (f.target = t[i]));
  }
  return { raidId: r.id, fighters };
};

const ROLES: ('tank' | 'healer' | 'dps')[] = ['tank', 'healer', 'dps', 'dps'];
/** The four roles for raid `r`, seeds `from` to `from + 3`: from an odd seed, a magic then a physical damage dealer. */
const roles4 = (r: RaidDef, from = 1) => ROLES.map((role, i) => character(from + i, role, r));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

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
  decoded.events.every((e, i) => e.bossHp.every((h, j) => h === one.events[i].bossHp[j])));
const many = Array.from({ length: 100 }, (_, i) => simulateRaid(four, raid, raidRng(6n, BigInt(i))));
check(`every fight ends by the enrage (${raid.enrageSeconds} s)`, many.every(r => r.end <= raid.enrageSeconds));
check('HP stays within 0 and max', many.every(r => r.events.every(e => e.bossHp >= 0 && e.hp.every((h, i) => h >= 0 && h <= r.maxHp[i] + 1e-6))));
check('a win ends with the boss dead', many.filter(r => r.won).every(r => r.events.at(-1)!.bossHp.every(h => h <= 0)));
check('a loss ends with everyone dead, or at the enrage', many.filter(r => !r.won).every(r => r.enraged || r.events.at(-1)!.hp.every(h => h <= 0)));
check('the dead never swing', many.every(r => r.events.every((e, k) => e.by < 0 || k === 0 || r.events[k - 1].hp[e.by] > 0)));
// Threat: every boss attack picks a living fighter weighted by e^(THREAT_FOCUS × threat).
const shares = aggroShares(four.fighters.map(f => f.stats.threat));
const counts = four.fighters.map(() => 0);
let attacks = 0;
for (const r of many) for (const e of r.events) {
  if (e.by !== -1 || (e.kind !== 'hit' && e.kind !== 'dodge')) continue;
  // Only while everyone is alive (the event's HP is after the hit, so a killing blow still counts).
  const before = r.events[r.events.indexOf(e) - 1];
  if (before && before.hp.some(h => h <= 0)) continue;
  counts[e.target]++;
  attacks++;
}
check('the boss spreads its attacks by threat', counts.every((c, i) => Math.abs(c / attacks - shares[i]) < 0.03),
  `${counts.map(c => (c / attacks).toFixed(2)).join('/')} vs ${shares.map(x => x.toFixed(2)).join('/')}`);
check('more threat, more attacks; nobody is safe', counts.every(c => c > 0) &&
  four.fighters.every((f, i) => four.fighters.every((g, j) => f.stats.threat <= g.stats.threat + 0.02 || counts[i] > counts[j])), // near-equal threat is a coin flip
  four.fighters.map((f, i) => `${f.stats.threat.toFixed(3)}→${counts[i]}`).join(' '));
const tankShare = aggroShares([0.6, 0.15, 0.15, 0.15])[0];
check(`a tank with 60% threat among 15% fighters takes most attacks (${THREAT_FOCUS})`, tankShare > 0.5 && tankShare < 0.9, tankShare.toFixed(2));

/** Weapon DPS against the boss, averaged over its phases: no effect damage (an NPC has no effects). */
const dpsOf = (s: CombatStats, r: RaidDef = raid) => mean(bossPhases(r).map(boss => {
  const x = s.sources[0];
  if (!x) return 0;
  const mit = matchup(s, { ...boss, dps: 0 }).enemyMitigation;
  return (x.hit.Physical * (1 - mit.Physical) + x.hit.Magic * (1 - mit.Magic)) * x.attacksPerSec * x.critMult;
}));
/** The reference player's DPS against the boss, averaged over its phases. */
const refDpsOf = (r: RaidDef) => mean(bossPhases(r).map(boss => {
  const ref = r.reference;
  return (ref.physicalPerSec * (1 - mitigation(boss.armor, ref.armorPen, boss.level)) +
    ref.magicPerSec * (1 - mitigation(boss.resistance, ref.magicPen, boss.level))) * ref.critMult;
}));
for (const r of RAIDS) {
  const npc = npcStats(r);
  const ref = r.reference;
  check(`${r.name}: an NPC has ${NPC_POWER}× the reference player's max HP, defenses and threat`, [
    [npc.maxHp, ref.maxHp], [npc.armor, ref.armor], [npc.resistance, ref.resistance], [npc.threat, ref.threat]].every(([a, b]) => Math.abs(a - NPC_POWER * b) < 1e-9));
  check(`${r.name}: an NPC has ${NPC_POWER}× the reference player's DPS against the boss`, Math.abs(dpsOf(npc, r) / refDpsOf(r) - NPC_POWER) < 1e-9,
    `${dpsOf(npc, r).toFixed(1)} vs ${refDpsOf(r).toFixed(1)}`);
}
check("an NPC doesn't depend on the party", encodeSetup({ raidId: 1, fighters: [{ characterId: 0n, name: 'x', stats: npcStats(raid) }] }) ===
  encodeSetup({ raidId: 1, fighters: [{ characterId: 0n, name: 'x', stats: npcStats(raid) }] }));

// ---------------------------------------------------------------- Lunar Phases and Moonfall (The Drowned Moon)

{
  const phases = moon.phases!;
  const mp = roles4(moon);
  const fights = Array.from({ length: 60 }, (_, i) => simulateRaid(party(mp, 0, moon), moon, raidRng(7n, BigInt(i))));
  const changes = fights.flatMap(r => r.events.filter(e => e.kind === 'phase'));
  check(`the boss turns to its next phase every ${phases.every} s, in order`, changes.length > 0 &&
    changes.every(e => e.t % phases.every === 0 && e.phase === phaseAt(moon, e.t)));
  check('phases alternate Full Moon and New Moon', phases.list.length === 2 && phaseAt(moon, 0) === 0 &&
    phaseAt(moon, phases.every) === 1 && phaseAt(moon, 2 * phases.every) === 0);
  // Each damage type hits harder in the phase that is weak to it.
  const avgHit = (who: number, ph: number) => mean(fights.flatMap(r => r.events.filter(e => e.by === who && e.kind === 'hit' && phaseAt(moon, e.t) === ph).map(e => e.damage)));
  const dealer = (magic: boolean) => mp.findIndex(s => {
    const x = s.sources[0];
    return !!x && x.heal === 0 && (magic ? x.hit.Magic > x.hit.Physical : x.hit.Physical > x.hit.Magic);
  });
  const phys = dealer(false);
  const mag = dealer(true);
  check('physical damage hits harder in the New Moon (low armor)', phys >= 0 && avgHit(phys, 1) > 1.5 * avgHit(phys, 0),
    phys >= 0 ? `${avgHit(phys, 0).toFixed(0)} → ${avgHit(phys, 1).toFixed(0)}` : 'no physical dealer');
  check('magic damage hits harder in the Full Moon (low resistance)', mag >= 0 && avgHit(mag, 0) > 1.5 * avgHit(mag, 1),
    mag >= 0 ? `${avgHit(mag, 1).toFixed(0)} → ${avgHit(mag, 0).toFixed(0)}` : 'no magic dealer');
  // Moonfall is shared by the living.
  const falls = fights.flatMap(r => r.events.flatMap((e, k) => (e.kind === 'aoe' ? [{ e, before: r.events[k - 1] ?? e }] : [])));
  check('Moonfall splits its damage among the living', falls.length > 0 &&
    falls.every(({ e, before }) => Math.abs(e.damage * before.hp.filter(h => h > 0).length - moon.aoe!.damage) < 1e-6));
  const duo = simulateRaid(party(mp.slice(0, 2), 0, moon), moon, raidRng(7n, 0n)).events.find(e => e.kind === 'aoe');
  check('Moonfall hits harder the fewer are alive', duo?.damage === moon.aoe!.damage / 2);
  // Split weapons (the Umbral variants): half the hit physical, half magic; better against Umbriel than one damage type.
  const lone = (baseId: number) => {
    const gear: (OwnedItem | undefined)[] = SLOTS.map(() => undefined);
    gear[MAIN] = { ...makeItem(seededRng(1n, 2n), baseId, 4, 'Common'), id: 1n };
    return combatStats(48, gear);
  };
  const katana = lone(6).sources[0];
  const umbral = lone(1007).sources[0];
  // Each half takes its own damage % (attributes boost the two types a little differently), so compare the physical half.
  check('a Split weapon hits half physical, half magic', Math.abs(umbral.hit.Physical - katana.hit.Physical / 2) < 1e-9 &&
    umbral.hit.Magic > 0.9 * umbral.hit.Physical && katana.hit.Magic === 0);
  // Against symmetric phases a Split hit deals about the same on average (damage is linear), but steadily;
  // the Umbral katana also swings faster (1.5 vs 1.4), so compare per swing.
  const perPhase = (s: CombatStats) => bossPhases(moon).map(b => matchup(s, b).dps);
  const [k, u] = [perPhase(lone(6)), perPhase(lone(1007))];
  check('a Split katana against Umbriel: about the same average per swing, far steadier across phases',
    Math.abs(mean(u) / 1.5 / (mean(k) / 1.4) - 1) < 0.05 && Math.abs(u[0] - u[1]) < 0.2 * Math.abs(k[0] - k[1]),
    `plain ${k.map(x => x.toFixed(0)).join('/')}, split ${u.map(x => x.toFixed(0)).join('/')}`);
  check('Wyrm Hollow has no phases', !raid.phases && bossPhases(raid).length === 1 && phaseAt(raid, 100) === 0);
}


// ---------------------------------------------------------------- the duo (The Brothers' Forge)

{
  const d = forge.duo!;
  // The balance check's party 0 (seeds 100 on): a typical party, which usually brings a brother down.
  const fp = roles4(forge, 100);
  const split = balancedTargets(forge, fp);
  const fights = Array.from({ length: 80 }, (_, i) => simulateRaid(party(fp, 0, forge), forge, raidRng(11n, BigInt(i))));
  check('both brothers attack', fights.every(r => r.events.some(e => e.by === -1 && e.boss === 0) && r.events.some(e => e.by === -1 && e.boss === 1)));
  check('the balanced split puts fighters on both brothers', split.includes(0) && split.includes(1), split.join(''));
  // Every fighter hits its own brother until he falls, then the other.
  check('fighters hit their assigned brother until he falls', fights.every(r => {
    const fall = r.events.find(e => e.kind === 'fall');
    return r.events.every(e => e.by < 0 || (fall && e.t > fall.t) || e.boss === split[e.by]);
  }));
  check('…then turn on the other one', fights.every(r => {
    const fall = r.events.find(e => e.kind === 'fall');
    return !fall || r.events.every(e => e.by < 0 || e.t <= fall.t || e.boss !== fall.boss);
  }));
  // Absorption: empowered exactly absorbSeconds after the first fall, unless the survivor fell first.
  const empowers = fights.flatMap(r => {
    const fall = r.events.find(e => e.kind === 'fall');
    const emp = r.events.find(e => e.kind === 'empower');
    return fall ? [{ r, fall, emp }] : [];
  });
  check(`the survivor empowers ${d.absorbSeconds} s after his brother falls, if still standing`, empowers.length > 0 && empowers.every(({ r, fall, emp }) => {
    const second = r.events.filter(e => e.kind === 'fall')[1];
    const killedInTime = r.won && r.events.at(-1)!.t <= fall.t + d.absorbSeconds;
    return emp ? Math.abs(emp.t - fall.t - d.absorbSeconds) < 1e-9 && emp.boss !== fall.boss : killedInTime || !second || second.t <= fall.t + d.absorbSeconds || !r.won;
  }));
  // A fight forced into each empowerment: everyone on one brother, so the other empowers.
  const forced = (b: number) => Array.from({ length: 40 }, (_, i) => simulateRaid(party(fp, 0, forge, fp.map(() => b)), forge, raidRng(12n, BigInt(i))));
  const brokkLast = forced(1); // Sindri falls first: Brokk empowers (Molten Hammer)
  const sindriLast = forced(0); // Brokk falls first: Sindri empowers (Anvil Hide)
  const molten = brokkLast.flatMap(r => {
    const emp = r.events.find(e => e.kind === 'empower');
    return emp ? r.events.filter(e => e.boss === 0 && (e.kind === 'aoe' || e.kind === 'special') && e.t > emp.t).map(e => ({ e, emp })) : [];
  });
  check('Molten Hammer: Brokk\'s slam hits everyone after he empowers, on its slower timer', molten.length > 0 &&
    molten.every(({ e }) => e.kind === 'aoe') && molten.every(({ e, emp }) => { const n = (e.t - emp.t) / d.bosses[0].empowered.signature!.every!; return Math.abs(n - Math.round(n)) < 1e-6; }));
  const slams = fights.flatMap(r => r.events.filter(e => e.boss === 0 && e.kind === 'special'));
  check('Anvil Slam hits one fighter before', slams.length > 0 && slams.every(e => e.target >= 0));
  // Anvil Hide: a physical dealer hits Sindri far softer once he's armored.
  const phys = fp.findIndex(st => st.sources[0] && st.sources[0].heal === 0 && st.sources[0].hit.Physical > st.sources[0].hit.Magic);
  const hide = sindriLast.flatMap(r => {
    const emp = r.events.find(e => e.kind === 'empower');
    const fall = r.events.find(e => e.kind === 'fall');
    if (!emp || !fall) return [];
    const hits = (from: number, to: number) => r.events.filter(e => e.by === phys && e.kind === 'hit' && e.boss === 1 && e.t > from && e.t <= to).map(e => e.damage);
    return [{ before: hits(fall.t, emp.t), after: hits(emp.t, Infinity) }];
  });
  const before = mean(hide.flatMap(h => h.before));
  const after = mean(hide.flatMap(h => h.after));
  check('Anvil Hide: physical damage on Sindri drops once he empowers', phys >= 0 && after < 0.75 * before, `${before.toFixed(0)} → ${after.toFixed(0)}`);
  // Threat: attacking a brother draws his attention (focusThreat); Drawing Fire draws the other one.
  const tankStats = { ...fp[0], threat: 0.6 };
  const dps = { ...fp[2], threat: 0.15 };
  const share = (r: RaidDef, stats: CombatStats[], targets: number[], b: number) => {
    const w = stats.map((st, i) => threatWeight(duoThreat(r, st, targets[i], b)));
    return w[0] / w.reduce((a, x) => a + x, 0);
  };
  const ts = [tankStats, dps, dps, dps];
  const tg = [1, 0, 0, 1];
  const plain = share(forge, ts, tg, 0);
  const drawing = share(forge, [{ ...tankStats, effects: new Map([[Effect.DrawingFire, 1]]) }, dps, dps, dps], tg, 0);
  check('the brother a tank doesn\'t attack goes for those who do', share(forge, ts, tg, 1) > 0.8 && plain < 0.7, `${share(forge, ts, tg, 1).toFixed(2)} / ${plain.toFixed(2)}`);
  check('Drawing Fire: the tank holds the brother it isn\'t attacking', drawing > plain + 0.15, `${plain.toFixed(2)} → ${drawing.toFixed(2)}`);
  check('one boss: threat as always (no focus)', duoThreat(raid, tankStats, 0, 0) === tankStats.threat);
  // Stoke the Fire: 25% more damage per fallen fighter or boss.
  const stoker = { ...fp[2], effects: new Map([...fp[2].effects, [Effect.StokeTheFire, 1]]) };
  const sf = Array.from({ length: 30 }, (_, i) => simulateRaid(party([fp[0], fp[1], stoker, fp[3]], 0, forge), forge, raidRng(13n, BigInt(i))));
  const stokeHits = (afterFall: boolean) => mean(sf.flatMap(r => {
    const fall = r.events.find(e => e.kind === 'fall');
    if (!fall) return [];
    return r.events.filter(e => e.by === 2 && e.kind === 'hit' && e.boss === fall.boss ^ 1 && (afterFall ? e.t > fall.t && e.hp.every(h => h > 0) : e.t < fall.t)).map(e => e.damage);
  }));
  check('Stoke the Fire: more damage once a brother has fallen', stokeHits(true) > 1.1 * stokeHits(false), `${stokeHits(false).toFixed(0)} → ${stokeHits(true).toFixed(0)}`);
  check('the fall-time estimate: nobody on a brother never kills him', duoFallTimes(forge, fp, fp.map(() => 0))[1] === Infinity);
}

// ---------------------------------------------------------------- loot

for (const r of RAIDS) {
  const loot = Array.from({ length: 4000 }, (_, i) => rollRaidItem(seededRng(BigInt(i), 9n), r));
  const share = (x: string) => loot.filter(it => it.rarity.tag === x).length / loot.length;
  check(`${r.name}: raid items are Epic or better, at the raid tier`, loot.every(it => ['Epic', 'Legendary', 'Unique'].includes(it.rarity.tag) && it.tier === r.tier));
  check(`${r.name}: rarity odds as configured`, Math.abs(share('Epic') - RAID_RARITY_ODDS.Epic) < 0.03 && Math.abs(share('Legendary') - RAID_RARITY_ODDS.Legendary) < 0.03 &&
    Math.abs(share('Unique') - RAID_RARITY_ODDS.Unique) < 0.01, `${share('Epic').toFixed(3)} / ${share('Legendary').toFixed(3)} / ${share('Unique').toFixed(3)}`);
  const nonUnique = loot.filter(it => it.rarity.tag !== 'Unique');
  const ownShare = nonUnique.filter(it => base(it.baseId).raidId === r.id).length / nonUnique.length;
  check(`${r.name}: the raid's own bases drop at ownBaseShare`, Math.abs(ownShare - r.ownBaseShare) < 0.03, ownShare.toFixed(3));
  const own = new Set(raidUniques(r.id).map(u => u.id));
  check(`${r.name}: uniques come from the raid's own pool, all of it`, own.size > 0 && loot.filter(it => it.uniqueId).every(it => own.has(it.uniqueId!)) &&
    [...own].every(id => loot.some(it => it.uniqueId === id)));
}
const day = 86_400_000_000n;
check('lockout: a UTC day', lockoutStart(5n * day + 123n) === 5n * day && lockoutEnd(5n * day) === 6n * day);
{
  const log = (rewarded: boolean, at: bigint, raidId = raid.id) => ({ raidId, rewarded, startedAt: { microsSinceUnixEpoch: at } });
  const now = 5n * day + 1000n;
  const logs = [log(true, now - 10n), log(true, now - 20n), log(false, now - 30n), log(true, now - 2000n), log(true, now - 40n, 2)];
  check(`clears today count rewarded wins of this raid since 00:00 UTC (${raid.clearsPerDay} a day)`, clearsToday(logs, raid.id, now) === 2 && raid.clearsPerDay === 3);
}

// ---------------------------------------------------------------- balance

/** Win odds for `r` with its characters (LEVELS), and its reference sheet against their average. */
function balance(r: RaidDef) {
  const parties = Array.from({ length: 48 }, (_, p) => roles4(r, 100 + p * 4));
  const odds = (setups: RaidSetup[]) => mean(setups.map((s, i) => raidOdds(s, r, BigInt(i))));
  const full = odds(parties.map(p => party(p, 0, r)));
  const short = odds(parties.map(p => party(p.slice(0, 3), 0, r)));
  const shortHired = odds(parties.map(p => party(p.slice(0, 3), 1, r)));
  const pair = odds(parties.map(p => party(p.slice(0, 2), 0, r)));
  const pairHired = odds(parties.map(p => party(p.slice(0, 2), 2, r)));
  // The reference sheet must stay the average of these characters, or NPCs drift from "an average player".
  const everyone = parties.flat();
  const avg = (f: (s: CombatStats) => number) => mean(everyone.map(f));
  const ref = r.reference;
  const near = (name: string, measured: number, sheet: number) => check(`${r.name}: reference ${name} matches the average player (±10%)`,
    Math.abs(measured / sheet - 1) < 0.1, `measured ${measured.toFixed(2)}, sheet ${sheet.toFixed(2)}`);
  near('max HP', avg(s => s.maxHp), ref.maxHp);
  near('armor', avg(s => s.armor), ref.armor);
  near('resistance', avg(s => s.resistance), ref.resistance);
  near('threat', avg(s => s.threat), ref.threat);
  near('DPS vs the boss', avg(s => dpsOf(s, r)), refDpsOf(r));
  const p0 = parties[0].map(s => ({ dps: dpsOf(s, r).toFixed(0), hp: s.maxHp.toFixed(0), threat: s.threat.toFixed(2) }));
  console.log(`  ${r.name} party 0: ${JSON.stringify(p0)}`);
  const wins = parties.map((p, i) => simulateRaid(party(p, 0, r), r, raidRng(1n, BigInt(i)))).filter(x => x.won);
  console.log(`  ${r.name} win odds: 4 players ${full.toFixed(2)} · 3 ${short.toFixed(2)} · 3 + NPC ${shortHired.toFixed(2)} · 2 ${pair.toFixed(2)} · ` +
    `2 + 2 NPCs ${pairHired.toFixed(2)} · a win takes ${wins.length ? mean(wins.map(x => x.end)).toFixed(0) : '-'} s`);
  return { full, short, shortHired, pair, pairHired };
}

{
  const { full, short, shortHired, pair, pairHired } = balance(raid);
  // The T3 raid is intentionally easy (raids.md): a full party nearly always wins.
  check('a full party of T3-cleared players nearly always wins', full >= 0.9, full.toFixed(2));
  check('a party one short wins less often', short < full, `${short.toFixed(2)} vs ${full.toFixed(2)}`);
  check('two players alone rarely win', pair < 0.3, pair.toFixed(2));
  // NPCs are a last resort (NPC_POWER 0.5): a hire never hurts, but adds little.
  check('hiring NPCs into empty seats helps a little', shortHired >= short - 0.02 && pairHired > pair && pairHired < short, `${pairHired.toFixed(2)}`);
  check('an NPC is worse than a player', shortHired < full);
}
{
  // The T4 raid asks more (raids.md): random gear wins most fights, a party one short far fewer.
  const { full, short, shortHired, pair, pairHired } = balance(moon);
  check('The Drowned Moon: a full party of T4-cleared players usually wins', full >= 0.75 && full <= 0.92, full.toFixed(2));
  check('The Drowned Moon: a party one short wins far less often', short <= full - 0.2, `${short.toFixed(2)} vs ${full.toFixed(2)}`);
  check('The Drowned Moon: two players alone almost never win', pair < 0.1, pair.toFixed(2));
  check('The Drowned Moon: hiring NPCs into empty seats helps a little', shortHired >= short - 0.02 && pairHired >= pair && pairHired < short,
    `${shortHired.toFixed(2)} / ${pairHired.toFixed(2)}`);
  check('The Drowned Moon: an NPC is worse than a player', shortHired < full);
}
{
  // The T5 duo: a balanced split usually wins; all on one brother lets the other empower, and wins less.
  const { full, short, pair } = balance(forge);
  const parties = Array.from({ length: 48 }, (_, p) => roles4(forge, 100 + p * 4));
  const oneSided = (b: number) => mean(parties.map((p, i) => raidOdds(party(p, 0, forge, p.map(() => b)), forge, BigInt(i))));
  const [allBrokk, allSindri] = [oneSided(0), oneSided(1)];
  console.log(`  The Brothers' Forge, all on one brother: Brokk first ${allBrokk.toFixed(2)} · Sindri first ${allSindri.toFixed(2)}`);
  check("The Brothers' Forge: a full party on a balanced split usually wins", full >= 0.65 && full <= 0.9, full.toFixed(2));
  check("The Brothers' Forge: letting a brother empower wins less", Math.max(allBrokk, allSindri) < full - 0.1, `${allBrokk.toFixed(2)} / ${allSindri.toFixed(2)} vs ${full.toFixed(2)}`);
  check("The Brothers' Forge: a party one short wins far less often", short <= full - 0.2, `${short.toFixed(2)} vs ${full.toFixed(2)}`);
  // The 4:00 enrage lets a strong pair grind both brothers down now and then.
  check("The Brothers' Forge: two players alone rarely win", pair < 0.15, pair.toFixed(2));
}
check('every raid has a test level', RAIDS.every(r => LEVELS[r.id] !== undefined));

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
