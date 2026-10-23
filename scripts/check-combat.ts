// Checks for the combat formulas and settlement (spacetimedb/src/combat.ts, game.ts).
// No server needed:
//   npm run test:combat
import { SLOTS, STARTER_ARMOR, STARTER_WEAPONS, base, weaponValues, type Slot } from '../spacetimedb/src/data/bases';
import { MIGHT_ACCURACY, Stat, accuracyAtLevel, fromStored, toStored } from '../spacetimedb/src/data/stats';
import { ENEMIES_BY_ID, WALK_SECONDS } from '../spacetimedb/src/data/zones';
import { ANVIL_ARMOR, ANVIL_SPEED, Effect, LEGENDARIES_BY_ID, PARRY_RATING, RESONANCE, TRUE_SHOT } from '../spacetimedb/src/data/legendary';
import { simulateFight } from '../spacetimedb/src/fight';
import { MAX_LEVEL, bonusHp, combatStats, defenseAgainst, matchup, mitigation, type CombatStats, type GearItem } from '../spacetimedb/src/combat';
import { Fighter, type FighterStart, type SwingContext } from '../spacetimedb/src/fighter';
import { simulateBattle, type FoeSpec } from '../spacetimedb/src/battle';
import { encodeStats } from '../spacetimedb/src/abyss';
import { EliteAffix } from '../spacetimedb/src/data/abyss';
import { Boon, Curse, Mutation, RIFT_HEART, RiftEffect, Theme, setBonusId, trophyId, type BoonRarity, type RiftBuild } from '../spacetimedb/src/data/rift';
import { RIFT_ECHOES, mutatedEnemy, riftEnemy, riftFoe } from '../spacetimedb/src/rift';
import type { EnemyDef } from '../spacetimedb/src/data/zones';
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
  const caster = { ...armored, resistance: 0, damageType: 'Magic' as const };
  const plainR = reflect(Effect.Thornshell, caster);
  const casterMit = matchup(plain, caster).enemyMitigation;
  check('Thornshell: magic hits are reflected as magic (enemy resistance)', casterMit.Magic === 0 && casterMit.Physical > 0 &&
    near(plainR.reflected, 0.4 * plainR.incoming * (1 - casterMit.Magic), 1e-9));
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

  // Moonshadow: armor and resistance become evasion rating.
  const acChest = item(35, 1, [[Stat.Armor, 200], [Stat.Resistance, 100], [Stat.EvasionRating, 50]]);
  const msh = combatStats(10, kit(sword, { Chest: withEffect(acChest, Effect.Moonshadow) }));
  const noMsh = combatStats(10, kit(sword, { Chest: acChest }));
  check('Moonshadow: no armor or resistance left', msh.armor === 0 && msh.resistance === 0);
  check('Moonshadow: evasion rating + armor + resistance', near(msh.evasionRating, noMsh.evasionRating + noMsh.armor + noMsh.resistance, 1e-9),
    `${f(msh.evasionRating)} vs ${f(noMsh.evasionRating)} + ${f(noMsh.armor)} + ${f(noMsh.resistance)}`);

  // Afterimage: incoming × (1 − a × evasion); the hit after a dodge is cut by a.
  const evChest = item(35, 1, [[Stat.EvasionRating, 400]]);
  const aim = combatStats(10, kit(sword, { Chest: withEffect(evChest, Effect.Afterimage) }));
  const noAim = combatStats(10, kit(sword, { Chest: evChest }));
  const aimFoe = { ...rat, dps: 3, hp: 1e9 };
  const aimM = matchup(aim, aimFoe);
  check('Afterimage: incoming × (1 − 0.5 × evasion)', aimM.evasion > 0.2 && near(aimM.incoming, matchup(noAim, aimFoe).incoming * (1 - 0.5 * aimM.evasion), 1e-9),
    `evasion ${f(aimM.evasion)}`);
  const aimFight = simulateFight(aim, aimM, aimFoe, seededRng(5n)).events.filter(e => e.by === 'enemy');
  const afterDodge = aimFight.filter((e, i) => i > 0 && e.kind === 'hit' && aimFight[i - 1].kind === 'dodge');
  check('Afterimage in a live fight: the hit after a dodge is halved', afterDodge.length > 0 &&
    afterDodge.every(e => e.damage <= aimM.enemyHit * 1.1 * 0.5 + 1e-9));

  // Lunar Insight: Might gives nothing; Mind gives max HP and resistance.
  const amulet = item(56, 1, [[Stat.Mind, 40], [Stat.Might, 40], [Stat.Resistance, 100]]);
  const li = combatStats(10, kit(sword, { Amulet: withEffect(amulet, Effect.LunarInsight) }));
  const noLi = combatStats(10, kit(sword, { Amulet: amulet }));
  check('Lunar Insight: more resistance from Mind', li.resistance > noLi.resistance);
  check('Lunar Insight: Might adds no physical damage', li.sources[0].hit.Physical < noLi.sources[0].hit.Physical);

  // Base damage %: scales the weapon's own hit, not flat added damage.
  const bd = (affixes: [number, number][]) => combatStats(1, gear({ MainHand: item(1, 1, affixes) })).sources[0].hit.Physical;
  check('Base damage %: +50% on the weapon hit only', near(bd([[Stat.BaseDamagePct, 50], [Stat.PhysDamage, 10]]) - bd([[Stat.PhysDamage, 10]]),
    bd([[Stat.BaseDamagePct, 50]]) - bd([]), 1e-9) && bd([[Stat.BaseDamagePct, 50]]) > bd([]));

  // Moonlit Vigil: Finesse gives nothing; Mind gives attack speed and armor.
  const hymnAmulet = item(56, 1, [[Stat.Mind, 40], [Stat.Finesse, 40], [Stat.Armor, 100]]);
  const dh = combatStats(10, kit(sword, { Amulet: withEffect(hymnAmulet, Effect.MoonlitVigil) }));
  const noDh = combatStats(10, kit(sword, { Amulet: hymnAmulet }));
  check('Moonlit Vigil: more armor from Mind', dh.armor > noDh.armor);
  check('Moonlit Vigil: Finesse adds no crit chance', dh.sources[0].critChance < noDh.sources[0].critChance);

  // Anvil Strength (T5): + armor / ANVIL_ARMOR flat physical per hit (scaled like any flat damage), attack speed × ANVIL_SPEED.
  const mace = item(3, 1);
  const plate = item(39, 1, [[Stat.Armor, 200]]);
  const anv = combatStats(10, kit(withEffect(mace, Effect.AnvilStrength), { Chest: plate }));
  const noAnv = combatStats(10, kit(mace, { Chest: plate }));
  const scale = noAnv.sources[0].hit.Physical / fromStored(mace.weapon!.hit);
  check(`Anvil Strength: + armor / ${ANVIL_ARMOR} physical per hit`, near(anv.sources[0].hit.Physical, noAnv.sources[0].hit.Physical + (noAnv.armor / ANVIL_ARMOR) * scale, 1e-9),
    `${f(noAnv.sources[0].hit.Physical)} → ${f(anv.sources[0].hit.Physical)}, armor ${f(noAnv.armor)}`);
  check('Anvil Strength: 25% less attack speed', near(anv.sources[0].attacksPerSec, noAnv.sources[0].attacksPerSec * ANVIL_SPEED, 1e-9));
  const anvMsh = combatStats(10, kit(withEffect(mace, Effect.AnvilStrength), { Chest: withEffect(plate, Effect.Moonshadow) }));
  check('Anvil Strength: no armor left under Moonshadow, no bonus', near(anvMsh.sources[0].hit.Physical, noAnv.sources[0].hit.Physical, 1e-9));

  // True Shot (T5): never misses; damage × (1 + accuracy over the level's own, with the level's Might).
  const xbow = item(11, 1, [[Stat.Accuracy, 200]]);
  const tsh = combatStats(10, kit(withEffect(xbow, Effect.TrueShot)));
  const noTs = combatStats(10, kit(xbow));
  const levelAcc = accuracyAtLevel(10) * (1 + MIGHT_ACCURACY * 10);
  check("True Shot: damage × accuracy over the level's own", near(tsh.sources[0].hit.Physical, noTs.sources[0].hit.Physical * (1 + TRUE_SHOT * (noTs.accuracy / levelAcc - 1)), 1e-9),
    `accuracy ${f(noTs.accuracy)} vs ${f(levelAcc)}`);
  const plainTs = combatStats(10, kit(withEffect(item(11, 1), Effect.TrueShot)));
  check('True Shot: no bonus without accuracy gear, never less', near(plainTs.sources[0].hit.Physical, combatStats(10, kit(item(11, 1))).sources[0].hit.Physical * (1 + TRUE_SHOT * (plainTs.accuracy / levelAcc - 1)), 1e-9) &&
    plainTs.sources[0].hit.Physical >= combatStats(10, kit(item(11, 1))).sources[0].hit.Physical);
  const moth = { ...enemy(401), hp: 1e6, dps: 0.1 };
  const tshM = matchup(tsh, moth);
  check('True Shot: an evasive enemy never dodges', tshM.enemyEvasion === 0 && matchup(noTs, moth).enemyEvasion > 0.1);
  const tshFight = simulateFight(tsh, tshM, moth, seededRng(3n), { timeLimit: 60 });
  check('True Shot in a live fight: no misses', tshFight.events.some(e => e.by === 'you') && tshFight.events.every(e => !(e.by === 'you' && e.kind === 'miss')));

  // Resonance (T5): × (1 + RESONANCE) damage and max HP per other unique worn.
  const asUnique = (it: GearItem, id: number): GearItem => ({ ...it, uniqueId: id });
  const band = asUnique(withEffect(item(53, 1), Effect.Resonance), 25);
  const res = (extra: Partial<Record<Slot, GearItem>>) => combatStats(10, kit(sword, { Ring1: band, ...extra }));
  const res0 = res({});
  const res2 = res({ Head: asUnique(item(38, 1), 5), Amulet: asUnique(item(57, 1), 9) });
  const plain2 = combatStats(10, kit(sword, { Ring1: item(53, 1), Head: item(38, 1), Amulet: item(57, 1) }));
  check('Resonance: alone, nothing more', near(res0.sources[0].hit.Physical, combatStats(10, kit(sword, { Ring1: item(53, 1) })).sources[0].hit.Physical, 1e-9));
  check('Resonance: 2 other uniques, 16% more damage and max HP', near(res2.sources[0].hit.Physical, plain2.sources[0].hit.Physical * (1 + 2 * RESONANCE), 1e-9) &&
    near(res2.maxHp, plain2.maxHp * (1 + 2 * RESONANCE), 1e-9), `${f(plain2.maxHp)} → ${f(res2.maxHp)}`);

  // Fading Rally (T5): attack k at max(0.8, 1.5 − 0.1 (k − 1)) × attack speed.
  const fr = combatStats(10, kit(sword, { OffHand: withEffect(item(23, 1), Effect.FadingRally) }));
  const noFr = combatStats(10, kit(sword, { OffHand: item(23, 1) }));
  const frPeriod = 1 / fr.sources[0].attacksPerSec;
  const frHits = (n: number) => ({ ...voidRat, hp: matchup(noFr, voidRat).dps * frPeriod * n, dps: 0.01 });
  check('Fading Rally: 3 attacks take 1/1.5 + 1/1.4 + 1/1.3 periods', near(matchup(fr, frHits(3)).timeToKill, (1 / 1.5 + 1 / 1.4 + 1 / 1.3) * frPeriod, 1e-9),
    f(matchup(fr, frHits(3)).timeToKill / frPeriod));
  check('Fading Rally: break-even near 11 attacks, long fights approach × 0.8',
    near(matchup(fr, frHits(11)).rally, 1, 0.01) && near(matchup(fr, frHits(1000)).rally, 0.8, 0.01), f(matchup(fr, frHits(11)).rally));
  const frFoe = frHits(20);
  const frM = matchup(fr, frFoe);
  const frFights = Array.from({ length: 300 }, (_, i) => simulateFight(fr, frM, frFoe, seededRng(BigInt(i))));
  const frLen = frFights.reduce((a, x) => a + x.end - x.walk, 0) / frFights.length;
  check('Fading Rally in live fights: average length matches the formula', near(frLen, frM.timeToKill, frM.timeToKill * 0.06), `${f(frLen)} s vs ${f(frM.timeToKill)} s`);
  const frSwings = frFights[0].events.filter(e => e.by === 'you').map(e => e.t);
  check('Fading Rally in a live fight: swings 1→2 at 1/1.4 period, 11→12 at 1/0.8 periods',
    near(frSwings[1] - frSwings[0], frPeriod / 1.4, 1e-9) && near(frSwings[11] - frSwings[10], frPeriod / 0.8, 1e-9));

  // Parry and Thrust (T5): crit chance becomes evasion rating; an attack after a dodge crits.
  const pt = combatStats(10, kit(sword, { OffHand: withEffect(item(24, 1), Effect.ParryAndThrust), Chest: item(35, 1, [[Stat.EvasionRating, 100]]) }));
  const noPt = combatStats(10, kit(sword, { OffHand: item(24, 1), Chest: item(35, 1, [[Stat.EvasionRating, 100]]) }));
  check('Parry and Thrust: no normal crits, + PARRY_RATING evasion rating per 1% crit',
    pt.sources[0].critChance === 0 && near(pt.evasionRating, noPt.evasionRating + PARRY_RATING * 100 * noPt.sources[0].critChance, 1e-9),
    `${f(noPt.evasionRating)} → ${f(pt.evasionRating)}`);
  const ptFoe = { ...voidRat, hp: 1e4, dps: 0.5 };
  const ptM = matchup(pt, ptFoe);
  const ptP = 1 - (1 - ptM.evasion) ** (ptFoe.speed / pt.sources[0].attacksPerSec);
  check('Parry and Thrust: crit chance per attack = 1 − (1 − evasion)^(enemy attacks per attack)',
    near(ptM.parry, ptP, 1e-9) && near(ptM.critMult, 1 + ptP * (pt.critDamage - 1), 1e-9), `${f(100 * ptM.parry)}% crits at ${f(100 * ptM.evasion)}% evasion`);
  const ptFight = simulateFight(pt, ptM, ptFoe, seededRng(5n), { timeLimit: 120 });
  let dodgedSince = false;
  let ptOk = true;
  for (const e of ptFight.events) {
    if (e.by === 'enemy') dodgedSince ||= e.kind === 'dodge';
    else {
      if ((e.kind === 'crit') !== dodgedSince) ptOk = false;
      dodgedSince = false;
    }
  }
  check('Parry and Thrust in a live fight: crits exactly after a dodge', ptOk && ptFight.events.some(e => e.kind === 'crit'));
  const ptFoe2 = { ...ptFoe, hp: matchup(pt, ptFoe).dps * 30 };
  const ptM2 = matchup(pt, ptFoe2);
  const ptFights = Array.from({ length: 300 }, (_, i) => simulateFight(pt, ptM2, ptFoe2, seededRng(BigInt(i))));
  const ptLen = ptFights.reduce((a, x) => a + x.end - x.walk, 0) / ptFights.length;
  check('Parry and Thrust in live fights: average length matches the formula', near(ptLen, ptM2.timeToKill, ptM2.timeToKill * 0.06), `${f(ptLen)} s vs ${f(ptM2.timeToKill)} s`);

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

// ---------------------------------------------------------------- the Shifting Rift (shifting-rift.md, "Where a boon works")

{
  const L = 50;
  /** A T5 kit with rift effects or Trophies `fx` on the sword (as an Ethereal item carries them) and an optional ring. */
  const kit = (fx: number[] = [], ring: [number, number][] = []) => gear({
    MainHand: { ...item(1, 5, [[Stat.PhysDamagePct, 40], [Stat.MaxHp, 200], [Stat.Armor, 100]]), effects: fx },
    Chest: item(35, 5, [[Stat.Resistance, 80]]),
    Feet: item(37, 5),
    Ring1: item(50, 5, ring),
  });
  const plain = combatStats(L, kit());
  const rift = (boons: [number, BoonRarity][], o: Partial<RiftBuild> = {}, fx: number[] = [], ring: [number, number][] = []) =>
    combatStats(L, kit(fx, ring), undefined, { boons: boons.map(([id, rarity]) => ({ id, rarity })), ...o });
  const withFx = (...fx: number[]) => combatStats(L, kit(fx));
  const hit = (s: CombatStats) => s.sources[0].hit.Physical + s.sources[0].hit.Magic;
  const speed = (s: CombatStats) => s.sources[0].attacksPerSec;
  const rel = (a: number, b: number, k: number) => near(a, b * k, 1e-9 * Math.max(1, b));
  const B = Boon;

  // ---- the stat build
  check('Rift: an empty build changes nothing', encodeStats(rift([])) === encodeStats(plain));
  check('Sharpened Will: damage × (1 + value)', rel(hit(rift([[B.SharpenedWill, 1]])), hit(plain), 1.14));
  {
    const s = rift([[B.RedTithe, 0]]);
    check('Red Tithe: max HP × 0.9, damage × 1.12', rel(s.maxHp, plain.maxHp, 0.9) && rel(hit(s), hit(plain), 1.12));
  }
  check('Thick Skin: max HP × (1 + value)', rel(rift([[B.ThickSkin, 2]]).maxHp, plain.maxHp, 1.22));
  {
    const fury = rift([[B.Sunder, 0], [B.Bloodrush, 0], [B.CoupDeGrace, 0]]);
    check('three Fury boons: the 3-set (+15% damage)', fury.effects.has(setBonusId(Theme.Fury, 3)) && !fury.effects.has(setBonusId(Theme.Fury, 5)) &&
      rel(hit(fury), hit(plain), 1.15));
    check('… Wildcard counts as one of every theme', rift([[B.Sunder, 0], [B.CoupDeGrace, 0], [B.Wildcard, 2]]).effects.has(setBonusId(Theme.Fury, 3)));
    check('… and so does a theme mark', rift([[B.Sunder, 0], [B.CoupDeGrace, 0]], { marks: [Theme.Fury] }).effects.has(setBonusId(Theme.Fury, 3)));
    check('… two boons and no mark: no set', !rift([[B.Sunder, 0], [B.CoupDeGrace, 0]]).effects.has(setBonusId(Theme.Fury, 3)));
    check('five Fury boons: both sets', rift([[B.Sunder, 0], [B.Bloodrush, 0], [B.CoupDeGrace, 0], [B.SharpenedWill, 0], [B.OpeningSalvo, 0]])
      .effects.has(setBonusId(Theme.Fury, 5)));
  }
  check('Bloodrush: + value per fight won this floor', rel(hit(rift([[B.Bloodrush, 2]], { won: 3 })), hit(plain), 1.12));
  check('Quickened: attack speed × (1 + value)', rel(speed(rift([[B.Quickened, 0]])), speed(plain), 1.08));
  {
    const s = rift([[B.Fortress, 2]]);
    check('Fortress: 25% less damage taken, 15% less attack speed', s.damageTaken === 0.75 && rel(speed(s), speed(plain), 0.85));
    const w = rift([[B.RaisedShield, 0], [B.Shieldwall, 2]]);
    check('Shieldwall: blocks stop the whole hit, 20% less attack speed', w.blockShare === 1 && rel(speed(w), speed(plain), 0.8));
  }
  check('Keen: flat crit chance after the increase', near(rift([[B.Keen, 2]]).sources[0].critChance, plain.sources[0].critChance + 0.08, 1e-12));
  check('Cruel: + crit damage', near(rift([[B.Cruel, 1]]).critDamage, plain.critDamage + 0.25, 1e-12));
  {
    const glim = withFx(Effect.ParryAndThrust);
    const keen = rift([[B.Keen, 2]], {}, [Effect.ParryAndThrust]);
    check('Glimmerguard converts crit chance after Keen', near(keen.evasionRating - glim.evasionRating, PARRY_RATING * 100 * 0.08, 1e-6),
      f(keen.evasionRating - glim.evasionRating));
  }
  check('Sunder: ignores a share of armor and resistance', near(rift([[B.Sunder, 0]]).armorPen, 0.1, 1e-12) && near(rift([[B.Sunder, 0]]).magicPen, 0.1, 1e-12));
  {
    const pen = (s: CombatStats) => s.armorPen;
    const ring: [number, number][] = [[Stat.ArmorPenPct, 20]];
    check('… on top of capped penetration', near(pen(rift([[B.Sunder, 2]], {}, [], [[Stat.ArmorPenPct, 90]])), 1 - 0.25 * 0.72, 1e-12));
    check('Iron Week: armor penetration counts double', near(pen(rift([], { mutation: Mutation.IronWeek }, [], ring)), 0.4, 1e-12));
  }
  check('Iron Hide: armor and resistance × (1 + value)', rel(rift([[B.IronHide, 0]]).armor, plain.armor, 1.15) && rel(rift([[B.IronHide, 0]]).resistance, plain.resistance, 1.15));
  {
    const s = rift([[B.Fleetfoot, 1]]);
    const base = defenseAgainst(plain, 'Physical', L).evasion;
    check('Fleetfoot: flat evade chance after rating', near(defenseAgainst(s, 'Physical', L).evasion, base + 0.07, 1e-12));
    const mist = rift([[B.Fleetfoot, 0], [B.Smoke, 0], [B.Counterstep, 0]]);
    check('… the Mist 3-set adds 6%', near(mist.evadeChance!, 0.1, 1e-12));
    check('… up to the evasion cap', defenseAgainst(rift([[B.Fleetfoot, 2]], {}, [], [[Stat.EvasionRating, 5000]]), 'Physical', L).evasion === 0.6);
    check('… none under Juggernaut', defenseAgainst(rift([[B.Fleetfoot, 2]], {}, [Effect.Juggernaut]), 'Physical', L).evasion === 0);
  }
  check('Raised Shield: block chance', rift([[B.RaisedShield, 0]]).block === 0.06);
  check('… the Aegis 3-set adds 8%', near(rift([[B.RaisedShield, 0], [B.Bracing, 0], [B.ShieldBash, 0]]).block!, 0.14, 1e-12));
  check('Deep Guard: the share a block stops', rift([[B.DeepGuard, 2]]).blockShare === 0.8);
  {
    const ls: [number, number][] = [[Stat.LifestealPct, 20]];
    check('Leech: lifesteal and its cap rise', near(rift([[B.Leech, 2]]).lifesteal, 0.03, 1e-12) && near(rift([[B.Leech, 2]], {}, [], ls).lifesteal, 0.13, 1e-12));
    check('the Blood 3-set raises the cap 5%', near(rift([[B.Leech, 0], [B.Afterglow, 0], [B.Clotting, 0]], {}, [], ls).lifesteal, 0.16, 1e-12));
    const bb = rift([], {}, [RiftEffect.Bloodbound], [...ls, [Stat.HpRegen, 10]]);
    check('Bloodbound: no lifesteal cap, no regen', near(bb.lifesteal, 0.2, 1e-12) && bb.regen === 0);
    check('… with Frozen Blood, lifesteal still does nothing', rift([], {}, [RiftEffect.Bloodbound, Effect.FrozenBlood], ls).lifesteal === 0);
    check('Vampiric (Trophy): heals 50% past the cap', near(rift([], {}, [trophyId(EliteAffix.Vampiric)], ls).lifesteal, 0.6, 1e-12));
    check('… but not with Frozen Blood', rift([], {}, [trophyId(EliteAffix.Vampiric), Effect.FrozenBlood], ls).lifesteal === 0);
    check('Hexed: heals −30%', near(rift([], { curses: [Curse.Hexed] }, [], ls).lifesteal, 0.07, 1e-12));
  }
  check('Glass Heart: damage × 2, max HP × 0.5', rel(hit(withFx(RiftEffect.GlassHeart)), hit(plain), 2) && rel(withFx(RiftEffect.GlassHeart).maxHp, plain.maxHp, 0.5));
  {
    const v = withFx(RiftEffect.Voidheart);
    check('Voidheart: all damage magic, × 1.25', v.sources[0].hit.Physical === 0 && rel(v.sources[0].hit.Magic, hit(plain), 1.25));
    const sb = withFx(Effect.Spellblade, RiftEffect.Voidheart);
    check('… over Spellblade too', sb.sources[0].hit.Physical === 0 && sb.sources[0].hit.Magic > 0);
  }
  {
    const a = withFx(RiftEffect.RiftAnchor);
    check('Rift Anchor: the affixes on your other items × 1.2', near(a.resistance - plain.resistance, 16, 1e-9) && near(hit(a), hit(plain), 1e-9),
      f(a.resistance - plain.resistance));
  }
  {
    const three: [number, BoonRarity][] = [[B.LuckyCoin, 0], [B.Interest, 0], [B.SecondLook, 1]];
    const c = rift(three, {}, [RiftEffect.RiftConduit]);
    check('Rift Conduit: +2% damage and max HP per boon', rel(hit(c), hit(rift(three)), 1.06) && rel(c.maxHp, rift(three).maxHp, 1.06));
    check("Hoarder's Band: +1% damage per 10 Motes, up to +40%", rel(hit(rift([], { motes: 255 }, [RiftEffect.HoardersBand])), hit(plain), 1.25) &&
      rel(hit(rift([], { motes: 9000 }, [RiftEffect.HoardersBand])), hit(plain), 1.4));
  }
  check('Storm Front: attack speed × 1.3', rel(speed(rift([], { mutation: Mutation.StormFront })), speed(plain), 1.3));
  check('Glass World: damage × 2', rel(hit(rift([], { mutation: Mutation.GlassWorld })), hit(plain), 2));
  check('Frail and Weighted: max HP × 0.85, attack speed × 0.9', rel(rift([], { curses: [Curse.Frail, Curse.Weighted] }).maxHp, plain.maxHp, 0.85) &&
    rel(speed(rift([], { curses: [Curse.Frail, Curse.Weighted] })), speed(plain), 0.9));
  check('Thick Blood: max HP × 1.15', rel(rift([], { thickBlood: true }).maxHp, plain.maxHp, 1.15));
  check('Phantom: max HP × 0.8', rel(rift([[B.Phantom, 2]]).maxHp, plain.maxHp, 0.8));
  check('Thorned (Trophy): max HP × 0.7', rel(withFx(trophyId(EliteAffix.Thorned)).maxHp, plain.maxHp, 0.7));
  {
    const s = withFx(trophyId(EliteAffix.Swift));
    check('Swift (Trophy): 50% faster, hits 25% weaker', rel(speed(s), speed(plain), 1.5) && rel(hit(s), hit(plain), 0.75));
  }
  check('Overclock: attack speed × 1.6', rel(speed(withFx(RiftEffect.Overclock)), speed(plain), 1.6));
  check('Unyielding (Trophy): regen 1.5% of max HP', near(withFx(trophyId(EliteAffix.Unyielding)).regen, 0.015 * plain.maxHp, 1e-9));
  check('Mirror Mail: 15% more damage taken', withFx(RiftEffect.MirrorMail).damageTaken === 1.15);
  {
    const w = withFx(trophyId(EliteAffix.WardedShell));
    const best = mitigation(Math.max(w.armor, w.resistance), 0, L);
    check('Warded Shell (Trophy): the better of armor and resistance against both', near(defenseAgainst(w, 'Physical', L).mitigation, best, 1e-12) &&
      near(defenseAgainst(w, 'Magic', L).mitigation, best, 1e-12));
  }

  // ---- in a fight (fighter.ts)
  const never: () => number = () => { throw new Error('drew from the generator'); };
  const zero = () => 0;
  const fighter = (boons: [number, BoonRarity][], fx: number[] = [], start: FighterStart = {}, ring: [number, number][] = []) =>
    new Fighter(rift(boons, {}, fx, ring), start);
  const ctx = (o: Partial<SwingContext> = {}): SwingContext => ({ target: 9, foeHp: 100, foeMaxHp: 100, at: 10, crit: false, hit: 50, immune: false, ...o });
  /** A swing's damage through `riftSwing`, after counting the swing. */
  const swing = (x: Fighter, damage: number, o: Partial<SwingContext> = {}, rng: () => number = never) => {
    x.nextPeriod(1);
    return x.riftSwing(damage, ctx(o), rng);
  };
  check('Rift: nothing held draws nothing and changes no swing', (() => {
    const x = new Fighter(plain);
    return !x.riftSwings && x.shrink(100, zero) === 100 && x.periodNow(1) === 1 && x.evade(0.2, 1) === 0.2;
  })());
  check('Stubborn: each fight starts with a shield', near(fighter([[B.Stubborn, 1]]).shield, 0.14 * plain.maxHp, 1e-9));
  {
    const x = fighter([[B.Bracing, 1]]);
    const hits = [x.shrink(100, never), x.shrink(100, never), x.shrink(100, zero)];
    check('Bracing: the first hits are always blocked, drawing nothing', hits[0] === 50 && hits[1] === 50 && hits[2] === 100, hits.join(' / '));
  }
  check('Braced: less damage from Elites and bosses only', fighter([[B.Braced, 2]]).shrink(100, zero, true) === 76 && fighter([[B.Braced, 2]]).shrink(100, zero) === 100);
  check('Deep Guard: a block stops its share', near(fighter([[B.RaisedShield, 0], [B.DeepGuard, 2]]).shrink(100, zero), 20, 1e-9));
  check('Raised Shield blocks at its chance', fighter([[B.RaisedShield, 0]]).shrink(100, () => 0.059) === 50 && fighter([[B.RaisedShield, 0]]).shrink(100, () => 0.061) === 100);
  check('Smoke: evade chance up for the first 5 s, up to the cap', fighter([[B.Smoke, 2]]).evade(0.2, 1) === 0.6 && fighter([[B.Smoke, 0]]).evade(0.2, 4.9) === 0.4 &&
    fighter([[B.Smoke, 2]]).evade(0.2, 5) === 0.2);
  {
    const x = fighter([[B.Opening, 0], [B.Fleetfoot, 0]]);
    x.dodge();
    check('Opening: the swing after an evade deals more', near(swing(x, 100), 115, 1e-9) && swing(x, 100) === 100);
  }
  check('Opening Salvo: more damage for the first 5 s', near(swing(fighter([[B.OpeningSalvo, 2]]), 100, { at: 1 }), 210, 1e-9) &&
    swing(fighter([[B.OpeningSalvo, 2]]), 100, { at: 6 }) === 100);
  check('Coup de Grâce: more damage below 30% HP', near(swing(fighter([[B.CoupDeGrace, 0]]), 100, { foeHp: 20 }), 120, 1e-9) &&
    swing(fighter([[B.CoupDeGrace, 0]]), 100, { foeHp: 50 }) === 100);
  {
    const x = fighter([[B.Frenzy, 2]]);
    x.hp = 0.25 * x.maxHp;
    check("Frenzy: +1% damage per 1% HP missing", near(swing(x, 100), 175, 1e-9));
  }
  check('Ravenous (Trophy): +5% damage every 5 s', near(swing(fighter([], [trophyId(EliteAffix.Ravenous)]), 100, { at: 12 }), 110, 1e-9));
  {
    const x = fighter([[B.Sunder, 0], [B.Bloodrush, 0], [B.CoupDeGrace, 0], [B.SharpenedWill, 0], [B.OpeningSalvo, 0]], [RiftEffect.FirstBlood]);
    const d = [swing(x, 100, { target: 7 }), swing(x, 100, { target: 7 }), swing(x, 0, { target: 8 }), swing(x, 100, { target: 8 })];
    check('First Blood and the Fury 5-set: the first hit on each enemy × 5 × 3 (a miss doesn\'t count)', d[0] === 1500 && d[1] === 100 && d[2] === 0 && d[3] === 1500,
      d.join(' / '));
  }
  {
    const x = fighter([], [RiftEffect.GamblersEdge]);
    const r = seededRng(3n);
    const d = Array.from({ length: 20000 }, () => swing(x, 100, {}, r));
    const avg = d.reduce((a, b) => a + b, 0) / d.length;
    check("Gambler's Edge: 0–300%, × 1.5 on average", near(avg, 150, 3) && Math.min(...d) >= 0 && Math.max(...d) <= 300, f(avg));
    check('… a miss draws nothing', swing(x, 0, {}, never) === 0);
  }
  {
    const x = fighter([], [RiftEffect.EchoStrike]);
    const d = Array.from({ length: 8 }, () => swing(x, 100));
    check('Echo Strike: every 4th attack repeats', d.join() === '100,100,100,200,100,100,100,200');
  }
  {
    const x = fighter([[B.Static, 0]]);
    const d = Array.from({ length: 5 }, () => swing(x, 0));
    check("Static: every 5th swing shocks, even a miss", d.join() === '0,0,0,0,50');
    const y = fighter([[B.Static, 0]]);
    for (let i = 0; i < 4; i++) swing(y, 0);
    check('… but not an enemy that can\'t be damaged', swing(y, 0, { immune: true }) === 0);
  }
  {
    const x = fighter([[B.Quickened, 0], [B.Keen, 0], [B.Cruel, 0], [B.Static, 0], [B.Tailwind, 0]]);
    const d = [swing(x, 100, { crit: true }), swing(x, 0), swing(x, 100)];
    check('the Storm 5-set: a crit chains 30% to the next swing that lands', d.join() === '100,0,130', d.join(' / '));
  }
  {
    const x = fighter([[B.Tailwind, 0]]);
    const first = x.firstPeriod(1);
    x.nextPeriod(1);
    x.nextPeriod(1);
    check('Tailwind: the first 3 attacks are faster', near(first, 1 / 1.5, 1e-12) && near(x.periodNow(1), 1 / 1.5, 1e-12) && (x.nextPeriod(1), x.periodNow(1) === 1));
  }
  {
    const x = fighter([[B.Keen, 0], [B.Thunderhead, 2]]);
    for (let i = 0; i < 4; i++) swing(x, 100, { crit: true });
    const four = x.periodNow(1);
    for (let i = 0; i < 20; i++) swing(x, 100, { crit: true });
    check('Thunderhead: +3% attack speed a crit, up to +30%', near(four, 1 / 1.12, 1e-12) && near(x.periodNow(1), 1 / 1.3, 1e-12));
  }
  {
    const x = fighter([], [RiftEffect.Overclock]);
    swing(x, 100);
    const after = x.hp;
    x.hp = 0.005 * x.maxHp;
    swing(x, 0);
    check('Overclock: each swing costs 1% max HP, never the last of it', near(after, 0.99 * x.maxHp, 1e-9) && x.hp === 0.005 * x.maxHp);
  }
  check('Counterstep: an evade counters for a share of your average hit', fighter([[B.Counterstep, 0], [B.Fleetfoot, 0]]).riposte(100, 0, 1) === 30);
  check('Slip Away: an evade heals', near(fighter([[B.SlipAway, 2], [B.Fleetfoot, 0]]).dodge(), 0.025 * plain.maxHp, 1e-9));
  {
    const x = fighter([[B.Fleetfoot, 0], [B.Smoke, 0], [B.Counterstep, 0], [B.SlipAway, 0], [B.Opening, 0]]);
    x.nextPeriod(1);
    const plainCrit = x.rollCrit(0, zero);
    x.dodge();
    x.nextPeriod(1);
    check('the Mist 5-set: the swing after an evade crits', !plainCrit && x.rollCrit(0, never));
  }
  {
    const x = fighter([[B.Bracing, 0], [B.ShieldBash, 0], [B.SteadyGuard, 0], [B.RaisedShield, 0], [B.DeepGuard, 0]]);
    const dealt = x.shrink(100, never);
    const b = x.onBlock(50, 0.5);
    check('Shield Bash, Steady Guard and the Aegis 5-set on a block', near(dealt, 40, 1e-9) && near(b.back, 0.4 * 50 + 0.5 * 100 * 0.5, 1e-9) && near(b.heal, 0.01 * x.maxHp, 1e-9),
      `${f(b.back)} / ${f(b.heal)}`);
    x.shrink(100, () => 0.99);
    check('… nothing without a block', x.onBlock(50, 0.5).back === 0);
  }
  {
    const x = fighter([[B.HoldTheLine, 0]]);
    x.take(0.6 * x.maxHp);
    const before = x.shield;
    x.take(0.2 * x.maxHp);
    const once = x.shield;
    x.absorb(once);
    x.heal(x.maxHp);
    x.take(0.8 * x.maxHp);
    check('Hold the Line: the first drop below 30% shields, once', before === 0 && near(once, 0.2 * x.maxHp, 1e-9) && x.shield === 0 && !x.holdTheLine);
    const spent = fighter([[B.HoldTheLine, 0]], [], { holdTheLine: false });
    spent.take(0.8 * spent.maxHp);
    check('… once per floor (spent in an earlier node)', spent.shield === 0);
  }
  check('Mirror Mail and the Thorned Trophy reflect like Thornshell', near(fighter([], [RiftEffect.MirrorMail, trophyId(EliteAffix.Thorned)]).thorns(100, 1), 70, 1e-9));
  {
    const x = fighter([[B.BloodPrice, 2]]);
    x.hp = x.maxHp - 10;
    const before = x.hp;
    x.heal(30);
    x.overflow(30, before);
    const first = x.shield;
    x.overflow(1e9, x.maxHp);
    check('Blood Price: lifesteal past full HP becomes shield, up to 20% max HP', near(first, 20, 1e-9) && near(x.shield, 0.2 * x.maxHp, 1e-9));
  }
  {
    const x = fighter([[B.Clotting, 0]], [], {}, [[Stat.HpRegen, 10]]);
    const full = x.regenNow();
    x.hp = 0.4 * x.maxHp;
    check('Clotting: regen up below half HP', full === x.stats.regen && near(x.regenNow(), 1.5 * x.stats.regen, 1e-9));
  }
  check('Transfusion and the Blood 5-set: a kill heals', near(fighter([[B.Transfusion, 0], [B.Leech, 0], [B.RedTithe, 0], [B.Afterglow, 0], [B.Clotting, 0]]).killHealing(),
    0.11 * rift([[B.Transfusion, 0], [B.Leech, 0], [B.RedTithe, 0], [B.Afterglow, 0], [B.Clotting, 0]]).maxHp, 1e-9));
  {
    const x = fighter([[B.IronHide, 0], [B.ThickSkin, 0], [B.Stubborn, 0], [B.Braced, 0], [B.HoldTheLine, 0]]);
    const start = x.shield;
    check('the Bastion 5-set: a shield every 10 s', !x.bastionTick(5) && x.bastionTick(10) && near(x.shield - start, 0.1 * x.maxHp, 1e-9));
  }
  {
    const x = fighter([], [RiftEffect.PhoenixPlume], { secondWind: 0.2 });
    const wind = x.take(1e9);
    const atWind = x.hp;
    const plume = x.take(1e9);
    check('Phoenix Plume: after Second Wind, a killing blow leaves you at 40%', wind && near(atWind, 0.2 * x.maxHp, 1e-9) && plume && x.burned &&
      near(x.hp, 0.4 * x.maxHp, 1e-9) && !x.take(1e9) && x.hp === 0);
  }

  // ---- in a battle (battle.ts)
  const dummy = (o: Partial<EnemyDef> = {}): EnemyDef => ({ ...enemy(105), level: L, hp: 1e6, dps: 1, speed: 1, armor: 0, resistance: 0, ...o });
  const duel = (s: CombatStats, foes: FoeSpec[], seconds: number, chain = false) => simulateBattle({
    sides: [[{ kind: 'player', stats: s }], foes], chain, firstSwing: 'half', timeLimit: seconds, onTimeout: 'draw',
  }, seededRng(11n));
  {
    const s = { ...withFx(RiftEffect.WitherAura), sources: [] };
    const r = duel(s, [{ kind: 'foe', def: dummy({ hp: 1000 }) }], 10.5);
    check('Wither Aura: enemies lose 1% max HP a second', near(r.hp[1], 900, 1e-9), f(r.hp[1]));
    const k = duel(s, [{ kind: 'foe', def: dummy({ hp: 1000 }) }], 120);
    check('… and can kill', k.winner === 0 && near(k.end, 100, 1e-9), f(k.end));
  }
  {
    const s = rift([[B.Phantom, 2], [B.Fleetfoot, 2]], {}, [], [[Stat.EvasionRating, 300]]);
    const r = duel({ ...s, sources: [] }, [{ kind: 'foe', def: dummy({ speed: 5 }) }], 1000);
    const foeSwings = r.events.filter(e => e.by === 1);
    const dodged = foeSwings.filter(e => e.kind === 'miss').length / foeSwings.length;
    const ev = defenseAgainst(s, 'Physical', L).evasion;
    check('Phantom: an enemy hit must pass the evade check twice', near(dodged, 1 - (1 - ev) ** 2, 0.02), `${f(dodged)} vs ${f(1 - (1 - ev) ** 2)}`);
  }
  {
    const s = rift([[B.RaisedShield, 2], [B.Bracing, 0], [B.ShieldBash, 2], [B.SteadyGuard, 0], [B.DeepGuard, 0]]);
    const r = duel({ ...s, sources: [] }, [{ kind: 'foe', def: dummy({ dps: 50 }) }], 20);
    const blocked = r.events.filter(e => e.blocked);
    check('a battle: blocks reflect the Aegis 5-set (no weapon, so no Shield Bash) and heal', blocked.length > 0 && blocked.every(e => (e.reflected ?? 0) > 0 && e.healed[0] > 0),
      JSON.stringify(blocked.find(e => !((e.reflected ?? 0) > 0 && e.healed[0] > 0))));
  }
  {
    const s = rift([[B.Transfusion, 2]]);
    const hurtFirst = { kind: 'player' as const, stats: s, start: { hp: s.maxHp / 2 } };
    const r = simulateBattle({ sides: [[hurtFirst], [{ kind: 'foe', def: dummy({ hp: 50 }) }, { kind: 'foe', def: dummy({ hp: 50 }) }]], chain: true, firstSwing: 'half', timeLimit: 60, onTimeout: 'draw' }, seededRng(2n));
    const falls = r.events.filter(e => e.kind === 'fall');
    check('a battle: Transfusion heals on each kill', falls.length === 2 && falls.every(e => near(e.healed[0], 0.08 * s.maxHp, 1e-6)));
  }

  // ---- the foe side (rift.ts)
  const heart = riftEnemy(5, 5, RIFT_HEART.id, 'heart');
  const echo = riftEnemy(5, 1, RIFT_ECHOES[0].enemy.id, 'fight1');
  check('Blood Moon: enemies drain 20% (the Rift Heart 40%)', riftFoe(echo, Mutation.BloodMoon).drain === 0.2 && riftFoe(heart, Mutation.BloodMoon).drain === 0.4);
  check('… on top of Vampiric', riftFoe(echo, Mutation.BloodMoon, { drain: 0.5 }).drain === 0.7);
  check('Storm Front: enemies 30% faster (the Rift Heart 60%)', near(mutatedEnemy(echo, Mutation.StormFront).speed, echo.speed * 1.3, 1e-12) &&
    near(mutatedEnemy(heart, Mutation.StormFront).dps, heart.dps * 1.6, 1e-9));
  check('Glass World: enemies deal × 2 (the Rift Heart × 4)', near(mutatedEnemy(echo, Mutation.GlassWorld).dps, echo.dps * 2, 1e-9) &&
    near(mutatedEnemy(heart, Mutation.GlassWorld).dps, heart.dps * 4, 1e-9));
  check('Iron Week: enemies are Armored', mutatedEnemy(echo, Mutation.IronWeek).defense === 'Armored');
  {
    const foe = riftFoe(heart, 0, {}, seededRng(4n));
    const list = foe.phases!.list;
    check('the Rift Heart shifts every 15 s for the whole node, never the same twice running', foe.phases!.every === 15 && list.length === 12 &&
      list.every((d, i) => i === 0 || d.damageType !== list[i - 1].damageType || d.defense !== list[i - 1].defense) && foe.def === list[0] &&
      new Set(list.map(d => d.damageType + d.defense)).size > 2);
    check('… seeded', JSON.stringify(riftFoe(heart, 0, {}, seededRng(4n)).phases) === JSON.stringify(foe.phases));
    check('… Armored all through Iron Week', riftFoe(heart, Mutation.IronWeek, {}, seededRng(4n)).phases!.list.every(d => d.defense === 'Armored'));
  }
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
