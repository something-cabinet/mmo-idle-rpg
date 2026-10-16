// Checks for the combat formulas and settlement (spacetimedb/src/combat.ts, game.ts).
// No server needed:
//   npm run test:combat
import { SLOTS, STARTER_ARMOR, STARTER_WEAPONS, base, weaponValues, type Slot } from '../spacetimedb/src/data/bases';
import { Stat, toStored } from '../spacetimedb/src/data/stats';
import { ENEMIES_BY_ID, WALK_SECONDS } from '../spacetimedb/src/data/zones';
import { Effect, LEGENDARIES_BY_ID } from '../spacetimedb/src/data/legendary';
import { simulateFight } from '../spacetimedb/src/sim';
import { MAX_LEVEL, bonusHp, combatStats, matchup, type GearItem } from '../spacetimedb/src/combat';
import { scoreGear } from '../spacetimedb/src/equip';
import { MAX_OFFLINE_MICROS, offlineCapMicros, project, xpToNext, type Progress } from '../spacetimedb/src/game';
import { makeItem, seededRng } from '../spacetimedb/src/loot';

let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed++;
}
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
const f = (n: number) => n.toFixed(2);

/** A Common item of `baseId` at `tier` with the given affixes (display units). */
function item(baseId: number, tier: number, affixes: [number, number][] = []): GearItem {
  const it = makeItem(seededRng(0n), baseId, tier, 'Common');
  return { ...it, affixes: affixes.map(([stat, v]) => ({ stat, tier, value: toStored(v) })) };
}
function gear(bySlot: Partial<Record<Slot, GearItem>>) {
  return SLOTS.map(s => bySlot[s]);
}
const enemy = (id: number) => ENEMIES_BY_ID.get(id)!.enemy;

// ---------------------------------------------------------------- reference fights (zone-content.md)

const starter = gear({ MainHand: item(1, 1), Chest: item(35, 1), Feet: item(37, 1) });
{
  const s = combatStats(1, starter);
  check('level 1 has 100 HP (+4.45% from 21 Might, 20 from the sword, and 1 Vitality)', near(s.maxHp, 104.45, 0.01), f(s.maxHp));
  const m = matchup(s, enemy(101));
  check('fresh level 1 + starter kit kills a Field Rat in ~3.0 s', near(m.timeToKill, 3.0, 0.15), f(m.timeToKill));
  check('… and would take ~111 s to die', near(m.timeToDie, 111, 4), f(m.timeToDie));
  check('… so the fight is viable', m.viable && m.killRate > 0);
}

for (const id of STARTER_WEAPONS) {
  const kit = gear({ MainHand: item(id, 1), Chest: item(STARTER_ARMOR[0], 1), Feet: item(STARTER_ARMOR[1], 1) });
  const m = matchup(combatStats(1, kit), enemy(101));
  check(`starter ${base(id).name(1)} beats a Field Rat at level 1`, m.viable && m.timeToKill < 10,
    `kill ${f(m.timeToKill)} s, die ${f(m.timeToDie)} s`);
}

// The average level-10 warrior in T1 Magic gear (preview-data.ts EQUIPPED).
const warrior = gear({
  MainHand: item(1, 1, [[Stat.PhysDamage, 1]]),
  OffHand: item(20, 1, [[Stat.MaxHp, 10]]),
  Head: item(38, 1, [[Stat.MaxHp, 10]]),
  Chest: item(39, 1, [[Stat.Armor, 2.5], [Stat.MaxHp, 14]]),
  Hands: item(40, 1, [[Stat.PhysDamagePct, 5]]),
  Feet: item(41, 1, [[Stat.MaxHp, 10]]),
  Ring1: item(50, 1, [[Stat.CritChancePct, 6.67]]),
  Ring2: item(50, 1, [[Stat.PhysDamagePct, 5]]),
  Amulet: item(57, 1, [[Stat.Might, 6.67], [Stat.MaxHp, 12], [Stat.ItemFindPct, 4]]),
});
{
  const m = matchup(combatStats(10, warrior), enemy(106));
  check('average level-10 warrior kills Grubnak in ~14.7 s', near(m.timeToKill, 14.7, 1.5), f(m.timeToKill));
  // 287 HP with the Might/Vitality HP% rules (zone-content.md).
  check("… and dies in ~16.7 s (armor counts against the boss's level 15)", near(m.timeToDie, 16.7, 1), f(m.timeToDie));
  check('… just wins', m.viable && m.timeToDie / m.timeToKill < 1.4);
  check('a fresh level-1 starter loses to Grubnak', !matchup(combatStats(1, starter), enemy(106)).viable);
}

// ---------------------------------------------------------------- formula details

{
  const naked = matchup(combatStats(1, gear({})), enemy(101));
  check('empty main hand deals no damage and is not viable', naked.dps === 0 && !naked.viable && naked.killRate === 0);

  const dagger = combatStats(1, gear({ MainHand: item(2, 1, [[Stat.PhysDamage, 2]]) }));
  const sword = combatStats(1, gear({ MainHand: item(1, 1, [[Stat.PhysDamage, 2]]) }));
  const addedDps = (s: typeof sword, hit: number) => (s.sources[0].hit.Physical - hit) * s.sources[0].attacksPerSec;
  const daggerHit = weaponValues(base(2).weapon!, 1).hit * (1 + 0.005);
  const swordHit = weaponValues(base(1).weapon!, 1).hit * (1 + 0.005 * 21); // the sword's 20 Might
  check('flat added damage is a straight bonus per hit',
    near(dagger.sources[0].hit.Physical - daggerHit, 2 * 1.005, 1e-9) && near(sword.sources[0].hit.Physical - swordHit, 2 * 1.105, 1e-9));
  check('… so fast weapons get more DPS from it', addedDps(dagger, daggerHit) > addedDps(sword, swordHit));

  const plated = combatStats(1, gear({ MainHand: item(1, 1, [[Stat.AttackSpeedPct, -500]]) }));
  check('attack speed floors at 25% of the weapon', near(plated.sources[0].attacksPerSec, 0.25, 1e-9));

  const crit = combatStats(1, gear({ MainHand: item(1, 1, [[Stat.CritChancePct, 5000]]) }));
  check('crit chance is uncapped but rolls use at most 100%',
    crit.sources[0].critChance > 1 && near(crit.sources[0].critMult, crit.critDamage, 1e-9));

  const pen = combatStats(1, gear({ MainHand: item(1, 1, [[Stat.ArmorPenPct, 90]]) }));
  check('armor penetration caps at 75%', pen.armorPen === 0.75);

  const evasive = combatStats(1, gear({ Chest: item(35, 1, [[Stat.EvasionRating, 1e6]]) }));
  check('evasion caps at 60%', matchup(evasive, enemy(101)).evasion === 0.6);

  const healer = combatStats(1, gear({ MainHand: item(10, 1) }));
  check('healing staff heals itself', matchup(healer, enemy(101)).hps > 0);
  const staffHeal = (extra: number) => combatStats(1, gear({ MainHand: item(10, 1, [[Stat.Heal, extra]]) })).sources[0].heal;
  check('flat added heal is a straight bonus per hit', near(staffHeal(2) - staffHeal(0), 2 * (1 + 0.0045), 1e-9));
  check('heal stats do nothing on a weapon without heal',
    combatStats(1, gear({ MainHand: item(1, 1, [[Stat.Heal, 50]]) })).sources[0].heal === 0);
}

// ---------------------------------------------------------------- legendary effects (legendary.md)

/** `it` with legendary or unique effect `effect` and a zero stat bonus, so only the effect counts. */
function withEffect(it: GearItem, effect: number): GearItem {
  return { ...it, legendary: { effect, stat: LEGENDARIES_BY_ID.get(effect)?.bonusStat ?? Stat.MaxHp, value: 0n } };
}
{
  const kit = (main: GearItem, extra: Partial<Record<Slot, GearItem>> = {}) =>
    gear({ MainHand: main, Chest: item(35, 1), Feet: item(37, 1), ...extra });
  const sword = item(1, 1, [[Stat.PhysDamagePct, 50], [Stat.MagicDamagePct, 30]]);
  const plain = combatStats(10, kit(sword));
  const rat = enemy(101);
  const magicRat = { ...rat, damageType: 'Magic' as const };
  const ring = (effect: number) => withEffect(item(50, 1), effect);

  const sb = combatStats(10, kit(withEffect(sword, Effect.Spellblade)));
  const both = 1 + 0.5 + 0.3 + 0.005 * 30 + 0.0045 * 10; // Might: level 10 + the sword's 20
  check('Spellblade: a sword deals magic damage with both damage-% groups',
    sb.sources[0].hit.Physical === 0 && near(sb.sources[0].hit.Magic, 10 * both, 1e-9), f(sb.sources[0].hit.Magic));
  const wand = combatStats(10, kit(withEffect(item(5, 1), Effect.Spellblade)));
  check('Spellblade: a wand deals physical damage', wand.sources[0].hit.Magic === 0 && wand.sources[0].hit.Physical > 0);

  const crit = item(1, 1, [[Stat.CritChancePct, 5000]]);
  const cd = combatStats(10, kit(crit)).critDamage; // 150% + Mind's
  const cc = combatStats(10, kit(crit)).sources[0];
  const oc = combatStats(10, kit(withEffect(crit, Effect.Overcrit))).sources[0];
  check('Overcrit: excess crit chance becomes +2× crit damage', near(oc.critMult, cd + 2 * (oc.critChance - 1), 1e-9) &&
    near(cc.critMult, cd, 1e-9), `${f(cc.critMult)} → ${f(oc.critMult)}`);
  const oc2 = combatStats(10, kit(withEffect(crit, Effect.Overcrit), { OffHand: withEffect(item(21, 1), Effect.Overcrit) })).sources[0];
  check('Overcrit ×2 (weapon + tome): +4× crit damage', near(oc2.critMult, combatStats(10, kit(crit, { OffHand: item(21, 1) })).critDamage + 4 * (oc2.critChance - 1), 1e-9));

  const gc = combatStats(10, kit(withEffect(sword, Effect.GlassCannon)));
  check('Glass Cannon: damage × 2, max HP × 0.5',
    near(gc.sources[0].hit.Physical, 2 * plain.sources[0].hit.Physical, 1e-9) && near(gc.maxHp, plain.maxHp / 2, 1e-9));

  const armored = { ...rat, armor: 500, resistance: 500 };
  const vt = matchup(combatStats(10, kit(withEffect(sword, Effect.Voidtouched))), armored);
  const raw = plain.sources[0].hit.Physical * plain.sources[0].attacksPerSec * plain.sources[0].critMult;
  check('Voidtouched: ignores enemy mitigation for 25% less damage',
    vt.enemyMitigation.Physical === 0 && near(vt.dps, raw * 0.75, 1e-9) && vt.dps > matchup(plain, armored).dps);

  const staff = item(10, 1);
  const heal = matchup(combatStats(10, kit(staff)), rat);
  const zh = matchup(combatStats(10, kit(withEffect(staff, Effect.ZealotsOath))), rat);
  check("Zealot's Oath on a healer: heals hit for 50%, healing unchanged",
    near(zh.dps, heal.dps + 0.5 * heal.hps * (1 - heal.enemyMitigation.Magic), 1e-9) && near(zh.hps, heal.hps, 1e-12), `dps ${f(heal.dps)} → ${f(zh.dps)}`);
  const zs = matchup(combatStats(10, kit(withEffect(sword, Effect.ZealotsOath))), rat);
  check("Zealot's Oath on a sword: no heals, no effect", zs.hps === 0 && near(zs.dps, matchup(plain, rat).dps, 1e-12));

  const tank = (effect?: number) => {
    const chest = item(39, 1, [[Stat.Armor, 200], [Stat.EvasionRating, 50]]);
    return combatStats(10, kit(sword, { Chest: effect ? withEffect(chest, effect) : chest }));
  };
  const jug = matchup(tank(Effect.Juggernaut), magicRat);
  const noJug = matchup(tank(), magicRat);
  check('Juggernaut: armor reduces magic damage, no evasion',
    jug.evasion === 0 && noJug.evasion > 0 && jug.playerMitigation > noJug.playerMitigation, `${f(noJug.playerMitigation)} → ${f(jug.playerMitigation)}`);
  check('Juggernaut: physical damage is unchanged apart from evasion',
    near(matchup(tank(Effect.Juggernaut), rat).playerMitigation, matchup(tank(), rat).playerMitigation, 1e-12));
  const spellChest = withEffect(item(30, 1, [[Stat.Resistance, 200]]), Effect.Spellward);
  const sw = matchup(combatStats(10, kit(sword, { Chest: spellChest })), rat);
  check('Spellward: resistance reduces physical damage, no evasion', sw.evasion === 0 && sw.playerMitigation > 0.5, f(sw.playerMitigation));

  const dodgy = (effect?: number) => {
    const chest = item(35, 1, [[Stat.EvasionRating, 1e6]]);
    return matchup(combatStats(10, kit(sword, { Chest: effect ? withEffect(chest, effect) : chest })), rat).evasion;
  };
  check('Phantom Step: evasion cap 60% → 75%', dodgy() === 0.6 && near(dodgy(Effect.PhantomStep), 0.75, 1e-12));
  const dodgyN = (n: number) => {
    const ps = (baseId: number) => withEffect(item(baseId, 1), Effect.PhantomStep);
    const slots: Partial<Record<Slot, GearItem>> = { Chest: item(35, 1, [[Stat.EvasionRating, 1e6]]) };
    ([['Head', 34], ['Hands', 36], ['Feet', 37]] as const).slice(0, n).forEach(([slot, id]) => (slots[slot] = ps(id)));
    return matchup(combatStats(10, kit(sword, slots)), rat).evasion;
  };
  check('Phantom Step ×2 reaches the 85% cap; ×3 is wasted', near(dodgyN(2), 0.85, 1e-12) && near(dodgyN(3), 0.85, 1e-12));

  const ts = matchup(combatStats(10, kit(sword, { Chest: withEffect(item(35, 1), Effect.Thornshell) })), rat);
  const base = matchup(plain, rat);
  check('Thornshell: reflects 40% of damage taken (physical)',
    near(ts.dps, base.dps + 0.4 * base.incoming * (1 - base.enemyMitigation.Physical), 1e-9));
  const reflect = (effect: number, enemyDef: typeof rat) => {
    const chest = withEffect(item(35, 1), Effect.Thornshell);
    const without = matchup(combatStats(10, kit(withEffect(sword, effect))), enemyDef);
    const withT = matchup(combatStats(10, kit(withEffect(sword, effect), { Chest: chest })), enemyDef);
    return { reflected: withT.dps - without.dps, incoming: withT.incoming, mit: withT.enemyMitigation.Physical };
  };
  const gcR = reflect(Effect.GlassCannon, armored);
  check('Thornshell + Glass Cannon: reflected damage × 2', near(gcR.reflected, 0.4 * gcR.incoming * 2 * (1 - gcR.mit), 1e-9));
  const vtR = reflect(Effect.Voidtouched, armored);
  check('Thornshell + Voidtouched: reflected damage ignores armor for 25% less',
    vtR.mit === 0 && near(vtR.reflected, 0.4 * vtR.incoming * 0.75, 1e-9));

  /** Leather chest, head and hands, the first `n` with `effect`. */
  const armorN = (effect: number, n: number): Partial<Record<Slot, GearItem>> => {
    const pieces = [['Chest', 35], ['Head', 34], ['Hands', 36]] as const;
    return Object.fromEntries(pieces.map(([slot, id], i) => [slot, i < n ? withEffect(item(id, 1), effect) : item(id, 1)]));
  };
  const ts0 = matchup(combatStats(10, kit(sword, armorN(Effect.Thornshell, 0))), rat);
  const ts3 = matchup(combatStats(10, kit(sword, armorN(Effect.Thornshell, 3))), rat);
  check('Thornshell ×3: reflects 100% (capped)', near(ts3.dps, ts0.dps + ts0.incoming * (1 - ts0.enemyMitigation.Physical), 1e-9));

  const sh = matchup(combatStats(10, kit(sword, { Ring1: ring(Effect.SwiftHunter) })), rat);
  check('Swift Hunter: walk time −40%', near(sh.killRate, 1 / (sh.timeToKill + WALK_SECONDS * 0.6), 1e-12) && sh.killRate > base.killRate);
  const walk = (n: number) => combatStats(10, kit(sword, { Ring1: ring(Effect.SwiftHunter), ...(n > 1 && { Ring2: ring(Effect.SwiftHunter) }),
    ...(n > 2 && { Amulet: withEffect(item(57, 1), Effect.SwiftHunter) }) })).walkTime;
  check('Swift Hunter ×2: −80% (cap); ×3 is wasted', near(walk(2), WALK_SECONDS * 0.2, 1e-12) && near(walk(3), WALK_SECONDS * 0.2, 1e-12));

  const ex = matchup(combatStats(10, kit(withEffect(sword, Effect.Executioner))), rat);
  check('Executioner: the last 30% of enemy HP goes twice as fast (TTK × 0.85)', near(ex.timeToKill, base.timeToKill * 0.85, 1e-9) && near(ex.dps, base.dps, 1e-12));
  const ex2 = matchup(combatStats(10, kit(withEffect(sword, Effect.Executioner), { OffHand: withEffect(item(21, 1), Effect.Executioner) })), rat);
  // Against the same kit without the effect: the tome's Mind raises crit damage.
  const tomed = matchup(combatStats(10, kit(sword, { OffHand: item(21, 1) })), rat);
  check('Executioner ×2: threshold capped at 50% (TTK × 0.75)', near(ex2.timeToKill, tomed.timeToKill * 0.75, 1e-9));

  const rd = matchup(combatStats(10, kit(withEffect(sword, Effect.Rending))), armored);
  const rdBase = matchup(plain, armored);
  check('Rending: ignores 40% of the enemy\'s physical mitigation, not magic',
    near(rd.enemyMitigation.Physical, rdBase.enemyMitigation.Physical * 0.6, 1e-12) && rd.enemyMitigation.Magic === rdBase.enemyMitigation.Magic);
  const rd2 = matchup(combatStats(10, kit(withEffect(sword, Effect.Rending), { OffHand: withEffect(item(21, 1), Effect.Rending) })), armored);
  check('Rending ×2: capped at 70%', near(rd2.enemyMitigation.Physical, rdBase.enemyMitigation.Physical * 0.3, 1e-12));
  const sbk = matchup(combatStats(10, kit(withEffect(sword, Effect.Spellbreaker))), armored);
  check('Spellbreaker: ignores 40% of the enemy\'s magic mitigation, not physical',
    near(sbk.enemyMitigation.Magic, rdBase.enemyMitigation.Magic * 0.6, 1e-12) && sbk.enemyMitigation.Physical === rdBase.enemyMitigation.Physical);

  const weak = combatStats(10, kit(item(1, 1)));
  const ogre = { ...rat, dps: 1000, hp: 1e9 };
  const swS = combatStats(10, kit(item(1, 1), { Chest: withEffect(item(35, 1), Effect.SecondWind) }));
  check('Second Wind: time to die × 1.5', near(matchup(swS, ogre).timeToDie, matchup(weak, ogre).timeToDie * 1.5, 1e-9));
  const sw0 = combatStats(10, kit(item(1, 1), armorN(Effect.SecondWind, 0)));
  const sw3 = combatStats(10, kit(item(1, 1), armorN(Effect.SecondWind, 3)));
  check('Second Wind ×3: capped at 100% (time to die × 2)', near(matchup(sw3, ogre).timeToDie, matchup(sw0, ogre).timeToDie * 2, 1e-9));
  const swFight = simulateFight(swS, matchup(swS, ogre), ogre, seededRng(1n));
  const saved = swFight.events.filter(e => e.secondWind);
  check('Second Wind in a live fight: saved once, at 50% HP', saved.length === 1 && near(saved[0].youHp, swS.maxHp / 2, 1e-9) && swFight.outcome === 'defeat');

  const bow = item(8, 1, [[Stat.CritChancePct, 200]]);
  const frost = combatStats(10, kit(withEffect(bow, Effect.Frostbite)));
  const bowS = combatStats(10, kit(bow));
  const frostCrit = Math.min(1, frost.sources[0].critChance);
  check('Frostbite: crits deal no extra damage', frost.sources[0].critMult === 1 && bowS.sources[0].critMult > 1);
  check('Frostbite: enemy damage × (1 − 0.5 × crit chance)', near(frost.chill, 0.5 * frostCrit, 1e-12) && frost.chill > 0 &&
    near(matchup(frost, rat).incoming, matchup(bowS, rat).incoming * (1 - 0.5 * frostCrit), 1e-9), `chill ${f(frost.chill)}`);
  const frostFight = simulateFight(frost, matchup(frost, ogre), ogre, seededRng(2n));
  const foeHits = frostFight.events.filter(e => e.by === 'enemy' && e.kind === 'hit');
  const plainHit = (ogre.dps / ogre.speed) * (1 - matchup(frost, ogre).playerMitigation);
  check('Frostbite in a live fight: enemy hits are chilled', foeHits.every(e => e.damage <= plainHit * (1 - frost.chill) * 1.1 + 1e-9));

  const fbChest = (fx?: number) => {
    const chest = item(39, 1, [[Stat.Armor, 50], [Stat.HpRegen, 5], [Stat.LifestealPct, 2]]);
    return combatStats(10, kit(sword, { Chest: fx ? withEffect(chest, fx) : chest }));
  };
  const fb = fbChest(Effect.FrozenBlood);
  const noFb = fbChest();
  const fbBonus = bonusHp(10, fb.maxHp, false);
  check('Frozen Blood: +bonus HP / 10 armor and resistance', fbBonus > 0 && near(fb.armor, noFb.armor + fbBonus / 10, 1e-9) &&
    near(fb.resistance, noFb.resistance + fbBonus / 10, 1e-9), `+${f(fbBonus / 10)}`);
  check('Frozen Blood: no gear HP, no bonus', bonusHp(10, combatStats(10, gear({})).maxHp, false) === 0);
  check('Frozen Blood: attack speed × 0.8', near(fb.sources[0].attacksPerSec, noFb.sources[0].attacksPerSec * 0.8, 1e-12));
  check('Frozen Blood: no regen, no lifesteal', fb.regen === 0 && fb.lifesteal === 0 && noFb.regen > 0 && noFb.lifesteal > 0);

  const amb = combatStats(10, kit(withEffect(item(9, 1), Effect.Ambush)));
  const noAmb = combatStats(10, kit(item(9, 1)));
  check('Ambush: attack speed × 0.7', near(amb.sources[0].attacksPerSec, noAmb.sources[0].attacksPerSec * 0.7, 1e-12));
  const sponge = { ...rat, hp: 2000, dps: 0.01 };
  const ambM = matchup(amb, sponge);
  const period = 1 / amb.sources[0].attacksPerSec;
  check('Ambush: time to kill − 4 swings', near(ambM.timeToKill, sponge.hp / ambM.dps - 4 * period, 1e-9), f(ambM.timeToKill));
  check('Ambush: a one-shot ends at the first swing', near(matchup(amb, { ...rat, dps: 0.01 }).timeToKill, period / 2, 1e-9));
  const ambFights = Array.from({ length: 400 }, (_, i) => simulateFight(amb, ambM, sponge, seededRng(BigInt(i))));
  const avgLen = ambFights.reduce((a, x) => a + x.end - x.walk, 0) / ambFights.length;
  check('Ambush in live fights: average length matches the formula', near(avgLen, ambM.timeToKill, ambM.timeToKill * 0.05),
    `${f(avgLen)} s vs ${f(ambM.timeToKill)} s`);
  const first = ambFights[0].events.find(e => e.by === 'you')!;
  check('Ambush in a live fight: the first swing is 5×', first.damage > 5 * 0.9 * ambM.dps * period / amb.sources[0].critMult - 1e-9);

  // Moonlight: all damage magic (flat phys too), magic % only, armor pen → magic pen, every 3rd swing twice.
  const gs = item(7, 1, [[Stat.PhysDamage, 10], [Stat.PhysDamagePct, 50], [Stat.MagicDamagePct, 20]]);
  const ml = combatStats(10, kit(withEffect(gs, Effect.Moonlight)));
  const noMl = combatStats(10, kit(gs));
  const gsHit = Number(gs.weapon!.hit) / 100;
  check('Moonlight: no physical damage', ml.sources[0].hit.Physical === 0 && noMl.sources[0].hit.Physical > 0);
  check('Moonlight: (weapon + flat phys) × magic % only', near(ml.sources[0].hit.Magic, (gsHit + 10) * (1 + 0.2 + 0.0045 * 10), 1e-6),
    f(ml.sources[0].hit.Magic));
  check('Moonlight: armor pen counts as magic pen', near(ml.magicPen, noMl.magicPen + noMl.armorPen, 1e-12) && ml.armorPen > 0);
  const voidRat = { ...rat, armor: 0, resistance: 0 };
  check('Moonlight: × 4/3 average damage', near(matchup(ml, voidRat).dps, ml.sources[0].hit.Magic * ml.sources[0].attacksPerSec * ml.sources[0].critMult * 4 / 3, 1e-6));
  const mlSponge = { ...voidRat, hp: 3000, dps: 0.01 };
  const mlM = matchup(ml, mlSponge);
  const mlFights = Array.from({ length: 300 }, (_, i) => simulateFight(ml, mlM, mlSponge, seededRng(BigInt(i))));
  const mlLen = mlFights.reduce((a, x) => a + x.end - x.walk, 0) / mlFights.length;
  check('Moonlight in live fights: average length matches the formula', near(mlLen, mlM.timeToKill, mlM.timeToKill * 0.05), `${f(mlLen)} s vs ${f(mlM.timeToKill)} s`);
  check('Moonlight in a live fight: every 3rd swing is a wave', mlFights[0].events.filter(e => e.by === 'you').every((e, i) => !!e.wave === ((i + 1) % 3 === 0)));

  // Waxing Moon: × 0.75 over 4 attacks, × 1.6 in the long run; live fights match.
  const wx = combatStats(10, kit(withEffect(item(6, 1), Effect.WaxingMoon)));
  const noWx = combatStats(10, kit(item(6, 1)));
  const wxPeriod = 1 / wx.sources[0].attacksPerSec;
  const short = { ...voidRat, hp: matchup(noWx, voidRat).dps * wxPeriod * 3, dps: 0.01 }; // 3 full hits: 4 waxing attacks (0.6+0.7+0.8+0.9)
  check('Waxing Moon: a 3-hit enemy takes 4 attacks', near(matchup(wx, short).timeToKill, 4 * wxPeriod, 1e-9), f(matchup(wx, short).timeToKill / wxPeriod));
  const longFoe = { ...voidRat, hp: matchup(noWx, voidRat).dps * wxPeriod * 1000, dps: 0.01 };
  check('Waxing Moon: long fights approach × 1.6', near(matchup(wx, longFoe).waxing, 1000 / (11 + (1000 - 12.1) / 1.6), 1e-9) && matchup(wx, longFoe).waxing > 1.55);
  const wxFoe = { ...voidRat, hp: matchup(noWx, voidRat).dps * wxPeriod * 20, dps: 0.01 };
  const wxM = matchup(wx, wxFoe);
  const wxFights = Array.from({ length: 300 }, (_, i) => simulateFight(wx, wxM, wxFoe, seededRng(BigInt(i))));
  const wxLen = wxFights.reduce((a, x) => a + x.end - x.walk, 0) / wxFights.length;
  check('Waxing Moon in live fights: average length matches the formula', near(wxLen, wxM.timeToKill, wxM.timeToKill * 0.06), `${f(wxLen)} s vs ${f(wxM.timeToKill)} s`);

  // Moonshadow: incoming × (1 − 0.5 × evasion) × 1.1.
  const evChest = item(35, 1, [[Stat.EvasionRating, 400]]);
  const msh = combatStats(10, kit(sword, { Chest: withEffect(evChest, Effect.Moonshadow) }));
  const noMsh = combatStats(10, kit(sword, { Chest: evChest }));
  const mshFoe = { ...rat, dps: 3, hp: 1e9 };
  const mshM = matchup(msh, mshFoe);
  check('Moonshadow: incoming × (1 − 0.5 × evasion) × 1.1', mshM.evasion > 0.2 && near(mshM.incoming, matchup(noMsh, mshFoe).incoming * (1 - 0.5 * mshM.evasion) * 1.1, 1e-9),
    `evasion ${f(mshM.evasion)}`);
  const mshFight = simulateFight(msh, mshM, mshFoe, seededRng(5n)).events.filter(e => e.by === 'enemy');
  const afterDodge = mshFight.filter((e, i) => i > 0 && e.kind === 'hit' && mshFight[i - 1].kind === 'dodge');
  check('Moonshadow in a live fight: the hit after a dodge is halved', afterDodge.length > 0 &&
    afterDodge.every(e => e.damage <= mshM.enemyHit * 1.1 * 0.5 * 1.1 + 1e-9));

  // Lunar Insight: Might gives nothing; Mind gives max HP and resistance.
  const amulet = item(56, 1, [[Stat.Mind, 40], [Stat.Might, 40], [Stat.Resistance, 100]]);
  const li = combatStats(10, kit(sword, { Amulet: withEffect(amulet, Effect.LunarInsight) }));
  const noLi = combatStats(10, kit(sword, { Amulet: amulet }));
  check('Lunar Insight: more resistance from Mind', li.resistance > noLi.resistance);
  check('Lunar Insight: Might adds no physical damage', li.sources[0].hit.Physical < noLi.sources[0].hit.Physical);

  const ac = (effect: number) => combatStats(10, kit(sword, { Chest: withEffect(item(39, 1, [[Stat.Armor, 200], [Stat.Resistance, 100]]), effect) }));
  const acBase = combatStats(10, kit(sword, { Chest: item(39, 1, [[Stat.Armor, 200], [Stat.Resistance, 100]]) }));
  const ic = ac(Effect.Ironclad);
  check('Ironclad: 30% of armor is added to resistance', near(ic.resistance, acBase.resistance + 0.3 * acBase.armor, 1e-9) && ic.armor === acBase.armor);
  const rg = ac(Effect.Runeguard);
  check('Runeguard: 30% of resistance is added to armor', near(rg.armor, acBase.armor + 0.3 * acBase.resistance, 1e-9) && rg.resistance === acBase.resistance);
  const icRg = combatStats(10, kit(sword, { Chest: withEffect(item(39, 1, [[Stat.Armor, 200], [Stat.Resistance, 100]]), Effect.Ironclad),
    Head: withEffect(item(38, 1), Effect.Runeguard) }));
  const bothBase = combatStats(10, kit(sword, { Chest: item(39, 1, [[Stat.Armor, 200], [Stat.Resistance, 100]]), Head: item(38, 1) }));
  check('Ironclad + Runeguard convert from the unconverted values (no loop)',
    near(icRg.resistance, bothBase.resistance + 0.3 * bothBase.armor, 1e-9) && near(icRg.armor, bothBase.armor + 0.3 * bothBase.resistance, 1e-9));

  const pr = matchup(combatStats(10, kit(sword, { Ring1: ring(Effect.Prosperity) })), rat);
  const pr3 = matchup(combatStats(10, kit(sword, { Ring1: ring(Effect.Prosperity), Ring2: ring(Effect.Prosperity), Amulet: withEffect(item(57, 1), Effect.Prosperity) })), rat);
  check('Prosperity: gold × 1.4; ×3 capped at × 1.6', near(pr.goldPerKill, base.goldPerKill * 1.4, 1e-9) && near(pr3.goldPerKill, base.goldPerKill * 1.6, 1e-9));

  const sea = (n: number) => offlineCapMicros(combatStats(10, kit(sword, { Ring1: ring(Effect.Seasoned), ...(n > 1 && { Ring2: ring(Effect.Seasoned) }),
    ...(n > 2 && { Amulet: withEffect(item(57, 1), Effect.Seasoned) }) })));
  const H = 3600n * 1_000_000n;
  check('Seasoned: offline cap 8h → 12h; ×2 16h (cap); ×3 wasted',
    offlineCapMicros(plain) === MAX_OFFLINE_MICROS && sea(1) === 12n * H && sea(2) === 16n * H && sea(3) === 16n * H);

  const mid = matchup(combatStats(10, kit(sword, { Ring1: ring(Effect.MidasTouch) })), rat);
  const sch = matchup(combatStats(10, kit(sword, { Ring1: ring(Effect.ScholarsFocus) })), rat);
  const mixed = matchup(combatStats(10, kit(sword, { Ring1: ring(Effect.MidasTouch), Amulet: withEffect(item(57, 1), Effect.ScholarsFocus) })), rat);
  check('Midas Touch: no XP, gold × 2.5', mid.xpPerKill === 0 && near(mid.goldPerKill, base.goldPerKill * 2.5, 1e-9));
  check("Scholar's Focus: XP × 1.75, gold × 0.5", near(sch.xpPerKill, base.xpPerKill * 1.75, 1e-9) && near(sch.goldPerKill, base.goldPerKill / 2, 1e-9));
  check('Midas + Scholar: no XP, gold × 1.25', mixed.xpPerKill === 0 && near(mixed.goldPerKill, base.goldPerKill * 1.25, 1e-9));
  const twice = combatStats(10, kit(sword, { Ring1: ring(Effect.MidasTouch), Ring2: ring(Effect.MidasTouch) }));
  check('the same effect twice applies once', twice.effects.size === 1 && near(matchup(twice, rat).goldPerKill, mid.goldPerKill, 1e-9));

  const midasGear = kit(item(1, 1), { Ring1: ring(Effect.MidasTouch) });
  const p = project({ level: 1, xp: 0n, gold: 0n, settledMicros: 0n }, { gear: midasGear, enemy: rat }, 3_600_000_000n);
  check('settling with Midas Touch earns gold but no XP', p.xp === 0n && p.level === 1 && p.gold > 0n && p.kills > 0);

  const uniqueChest = { ...item(35, 1), effects: [Effect.Thornshell, Effect.Juggernaut] };
  const ue = combatStats(10, kit(sword, { Chest: uniqueChest, Head: withEffect(item(34, 1), Effect.Thornshell) }));
  check("a unique's effects count: its legendary effect as one copy", ue.effects.get(Effect.Thornshell) === 2 && ue.effects.has(Effect.Juggernaut));

  check('auto-equip scoring sees effects (Glass Cannon doubles dummy DPS)',
    near(scoreGear(10, kit(withEffect(sword, Effect.GlassCannon))).dps, 2 * scoreGear(10, kit(sword)).dps, 1e-9));
}

// ---------------------------------------------------------------- XP curve and settlement

check('xpToNext(1) = 198', xpToNext(1) === 198n, String(xpToNext(1)));
check('xpToNext(10) = 945', xpToNext(10) === 945n, String(xpToNext(10)));
check('xpToNext(50) ≈ 994k', near(Number(xpToNext(50)), 994_160, 200), String(xpToNext(50)));

const S = 1_000_000n;
const start: Progress = { level: 1, xp: 0n, gold: 0n, settledMicros: 0n };
const rats = { gear: starter, enemy: enemy(101) };
{
  const m = matchup(combatStats(1, starter), enemy(101));
  const p = project(start, rats, 60n * S);
  const kills = Math.floor(60 * m.killRate);
  check('60 s on rats grants whole kills of XP and gold', p.xp === BigInt(kills * 7) && p.gold === BigInt(kills * 2),
    `kills=${kills} xp=${p.xp} gold=${p.gold}`);
  check('leftover time toward the next kill carries over', p.settledMicros < 60n * S && p.settledMicros > 50n * S,
    `settled at ${Number(p.settledMicros) / 1e6} s`);

  let q = start;
  for (let t = 1n; t <= 600n; t++) q = project(q, rats, t * S);
  const once = project(start, rats, 600n * S);
  check('settling every second matches one settle', q.xp === once.xp && q.gold === once.gold && q.level === once.level,
    `${q.xp}/${q.gold} vs ${once.xp}/${once.gold}`);

  const lvl = project(start, rats, 3600n * S);
  check('an hour on rats levels up past level 2', lvl.level >= 2, `level ${lvl.level}`);
  check('… with XP below the next threshold', lvl.xp < xpToNext(lvl.level));
  let spent = 0n;
  for (let l = 1; l < lvl.level; l++) spent += xpToNext(l);
  check('xpGained counts XP across level-ups', lvl.xpGained === spent + lvl.xp, `${lvl.xpGained} vs ${spent + lvl.xp}`);

  const nakedFight = { gear: gear({}), enemy: enemy(101) };
  const ttd = matchup(combatStats(1, nakedFight.gear), enemy(101)).timeToDie;
  const naked = project(start, nakedFight, 3600n * S);
  check('a losing fight ends in a defeat at time to die, with nothing gained',
    naked.xp === 0n && naked.gold === 0n && naked.settledMicros === 3600n * S && naked.defeatedAt === BigInt(Math.ceil(ttd * 1e6)),
    `defeated at ${naked.defeatedAt}, ttd ${ttd}`);
  const early = project(start, nakedFight, BigInt(Math.floor(ttd / 2 * 1e6)));
  check('… before that the fight goes on unsettled', early.defeatedAt === undefined && early.settledMicros === 0n);
  let r = start;
  for (let t = 1n; t <= 600n && r.defeatedAt === undefined; t++) r = project(r, nakedFight, t * S);
  check('… and settling every second still dies on time', r.defeatedAt === naked.defeatedAt, `${r.defeatedAt}`);
  check('the starter kit beats rats, so no defeat there', once.defeatedAt === undefined);
  const noTarget = project(start, { gear: starter, enemy: undefined }, 60n * S);
  check('no target grants nothing', noTarget.gold === 0n && noTarget.settledMicros === 60n * S);

  const capped = project(start, rats, 100n * 3600n * S, 3600n * S);
  check('offline cap limits rewards to the cap', capped.gold === lvl.gold && capped.settledMicros === 100n * 3600n * S,
    `${capped.gold} vs ${lvl.gold}`);

  const maxed = project({ ...start, level: MAX_LEVEL }, rats, 600n * S);
  check('max level earns gold but no XP', maxed.level === MAX_LEVEL && maxed.xp === 0n && maxed.gold > 0n);

  const rich = project(start, { gear: gear({ ...Object.fromEntries(SLOTS.map((s, i) => [s, starter[i]])), Amulet: item(57, 1, [[Stat.GoldFindPct, 100]]) }), enemy: enemy(101) }, 600n * S);
  check('gold find multiplies gold', rich.gold > once.gold, `${rich.gold} vs ${once.gold}`);
}

// ---------------------------------------------------------------- floors (Anomaly affixes can be very negative)

{
  const cursed = item(1, 1, [
    [Stat.PhysDamage, -756], [Stat.MaxHp, -20000], [Stat.CritDamage, -500], [Stat.BaseCritChance, -5], [Stat.HpRegen, -500],
    [Stat.LifestealPct, -10], [Stat.HealPct, -500], [Stat.ItemFindPct, -500], [Stat.GoldFindPct, -500], [Stat.XpGainPct, -500],
  ]);
  const s = combatStats(1, gear({ MainHand: cursed }));
  const src = s.sources[0];
  check('negative stats floor: HP ≥ 1, hits and crits never below 0, no negative regen, lifesteal or finds',
    s.maxHp >= 1 && src.hit.Physical === 0 && src.critChance >= 0 && src.critMult >= 1 && s.regen === 0 && s.lifesteal === 0 &&
    s.itemFind === -1 && s.goldFind === -1 && s.xpGain === -1);
  const m = matchup(s, enemy(101));
  check('… and a fight still works out (no NaN, no negative gold or XP)', !Number.isNaN(m.timeToDie) && m.goldPerKill >= 0 && m.xpPerKill >= 0,
    `ttd ${f(m.timeToDie)}, gold ${m.goldPerKill}, xp ${m.xpPerKill}`);
}

// ---------------------------------------------------------------- accuracy

{
  // Accuracy: 10 per level, flat gear, then × (1 + accuracy % + 0.25% per Might).
  const bare = combatStats(10, gear({ MainHand: item(2, 1) })); // a dagger: no accuracy implicit
  check('accuracy: 10 per level, raised by the level\'s Might', near(bare.accuracy, 100 * (1 + 0.0025 * 10), 1e-9), f(bare.accuracy));
  const geared = combatStats(10, gear({ MainHand: item(2, 1, [[Stat.Accuracy, 20], [Stat.AccuracyPct, 10]]) }));
  check('… plus flat and % accuracy', near(geared.accuracy, 120 * (1 + 0.1 + 0.0025 * 10), 1e-9), f(geared.accuracy));
  check('crossbows carry flat accuracy', near(combatStats(10, gear({ MainHand: item(11, 1) })).accuracy, 110 * (1 + 0.0025 * 10), 1e-9));
  // A sword has no flat accuracy: its Might implicit raises accuracy instead.
  const sword = combatStats(10, gear({ MainHand: item(1, 1) }));
  check('… swords raise it through their Might', sword.accuracy > bare.accuracy && near(sword.accuracy, 100 * (1 + 0.0025 * (10 + 20)), 1e-9), f(sword.accuracy));
  check('Mind adds 0.25% crit damage per point', near(bare.critDamage, 1.5 + 0.0025 * 10, 1e-9), f(bare.critDamage));

  // Enemies dodge by the same rule as players: evasion rating / (rating + attacker accuracy).
  const moth = enemy(401);
  const lv36 = combatStats(36, gear({ MainHand: item(2, 4) }));
  const m = matchup(lv36, moth);
  check('an evasive enemy dodges at rating / (rating + your accuracy)', near(m.enemyEvasion, moth.evasionRating! / (moth.evasionRating! + lv36.accuracy), 1e-9), f(m.enemyEvasion));
  check('… about 35% for a same-level player without accuracy gear', near(m.enemyEvasion, 0.35, 0.005), f(m.enemyEvasion));
  const sharp = combatStats(36, gear({ MainHand: item(1, 4, [[Stat.Accuracy, 40], [Stat.AccuracyPct, 17]]) }));
  check('… and accuracy gear makes it dodge less', matchup(sharp, moth).enemyEvasion < m.enemyEvasion - 0.05, f(matchup(sharp, moth).enemyEvasion));
  check('enemies without evasion never dodge', matchup(bare, enemy(101)).enemyEvasion === 0);
  // Your evasion is against the enemy's accuracy, its level's: 10 × level.
  const dodgy = combatStats(10, gear({ MainHand: item(2, 1), Chest: item(35, 1, [[Stat.EvasionRating, 50]]) }));
  const brute = enemy(105);
  const ev = matchup(dodgy, brute).evasion;
  check('your evasion is against the enemy\'s level accuracy', ev < 0.6 && near(ev, dodgy.evasionRating / (dodgy.evasionRating + 10 * brute.level), 1e-9), f(ev));
}

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
