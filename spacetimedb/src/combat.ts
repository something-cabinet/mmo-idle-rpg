// Combat formulas (docs/design/combat.md, attributes.md): stat aggregation and the
// closed-form matchup against one enemy. Pure: no SpacetimeDB imports, so the client
// shows exactly what the server settles.
//
// Combat math runs in floats and display units (1 HP, 1 = 100%); items store
// hundredths, converted with `fromStored`.

import { SLOTS } from './data/bases';
import { ANVIL_ARMOR, ANVIL_SPEED, Effect, LAST_STAND_BELOW, MOONLIGHT_MULT, PARRY_RATING, RESONANCE, TRUE_SHOT, effectAmount, rallyPeriods, waxingAttacks, type EffectCounts } from './data/legendary';
import { CAPS, MIGHT_ACCURACY, Stat, accuracyAtLevel, dodgeChance, fromStored, roundStat, toStored, wholeValue, type StatId } from './data/stats';
import { WALK_SECONDS, type EnemyDef } from './data/zones';
import { EliteAffix } from './data/abyss';
import {
  BOON_NUM, Boon, CURSE_NUM, Curse, MUTATION_NUM, Mutation, RIFT_NUM, RiftEffect, SET, THICK_BLOOD, TROPHY_NUM, Theme, boonAmount, riftEffects,
  setBonusId, trophyId, type RiftBuild, type ThemeId,
} from './data/rift';
import type { DamageType, WeaponDamage } from './data/bases';
import type { Buffs } from './data/supplies';

export const MAX_LEVEL = 100;
/** Offline progress cap before Seasoned, hours. */
export const BASE_OFFLINE_HOURS = 8;

// Item shape the formulas need. Both the server row type and the client bindings fit.
export interface GearStat {
  stat: number;
  value: bigint;
}
export interface GearWeapon {
  damageType: { tag: WeaponDamage };
  hit: bigint;
  speedMilli: number;
  baseCritBp: number;
  heal: bigint;
  /** Who a heal lands on in a raid; solo, heals always land on yourself. */
  healTarget?: { tag: 'Single' | 'All' };
}
export interface GearItem {
  implicits: readonly GearStat[];
  affixes: readonly GearStat[];
  legendary?: GearStat & { effect: number };
  /** A unique's effects. */
  effects?: readonly number[];
  /** Set on a unique (Resonance counts them). */
  uniqueId?: number;
  weapon?: GearWeapon;
  /** Temper level (0–10): +2% base stats each (`tempered`). */
  temper?: number;
}
/** Equipped items in SLOTS order (a loadout's slots resolved to rows). */
export type Gear = readonly (GearItem | undefined)[];

const MAIN_HAND = SLOTS.indexOf('MainHand');

/** Base stats and implicits gained per temper level (life-skills.md, "Smithing: temper an item"). */
export const TEMPER_STEP = 0.02;

/**
 * `it` with its base part (implicits, weapon hit and heal) × (1 + 0.02 × temper), rounded
 * once like a fresh roll. Affixes, legendary affixes and effects don't change. The item
 * stores only its temper, so the original values stay intact.
 */
export function tempered<T extends GearItem>(it: T): T {
  const k = it.temper ?? 0;
  if (!k) return it;
  const m = 1 + TEMPER_STEP * k;
  const w = it.weapon;
  return {
    ...it,
    implicits: it.implicits.map(i => ({ ...i, value: toStored(roundStat(i.stat as StatId, fromStored(i.value) * m)) })),
    weapon: w && { ...w, hit: toStored(wholeValue(fromStored(w.hit) * m)), heal: toStored(wholeValue(fromStored(w.heal) * m)) },
  };
}

/** One attacking weapon (combat.md "attack sources"). */
export interface AttackSource {
  /** Damage per hit by type, after flat added damage and % scaling, before mitigation. */
  hit: Record<DamageType, number>;
  /** Heal per hit after scaling; 0 for weapons without a heal effect. */
  heal: number;
  /** In a raid the heal is split across the party; otherwise it goes to the most hurt ally (raid.ts). */
  healAll: boolean;
  attacksPerSec: number;
  /** Uncapped; rolls use at most 1. */
  critChance: number;
  /** Average damage multiplier from crits (Overcrit included). */
  critMult: number;
}

export interface CombatStats {
  level: number;
  sources: AttackSource[];
  /** Multiplier, base 1.5. */
  critDamage: number;
  armorPen: number;
  magicPen: number;
  maxHp: number;
  /** HP per second. */
  regen: number;
  armor: number;
  resistance: number;
  evasionRating: number;
  /** Accuracy rating: lowers the chance your attacks are dodged (`dodgeChance`). */
  accuracy: number;
  lifesteal: number;
  threat: number;
  itemFind: number;
  goldFind: number;
  xpGain: number;
  /** Seconds between fights. */
  walkTime: number;
  /** Offline progress cap, hours (Seasoned raises it). */
  offlineHours: number;
  /** Share of the enemy's damage removed (Frostbite). */
  chill: number;
  /** × the damage you take after mitigation (a Phial of Warding; absent = 1). */
  damageTaken?: number;
  /** Once per fight, at half HP, heal this share of max HP (a Phial of Renewal; absent = 0). */
  renewal?: number;
  /** Evade chance added after rating, up to the cap (the Rift's Fleetfoot and Mist set; absent = 0). */
  evadeChance?: number;
  /** Block chance on top of Bulwark's (the Rift's Raised Shield and Aegis set; absent = 0). */
  block?: number;
  /** Share of a blocked hit stopped (Deep Guard, Shieldwall; absent = 0.5). */
  blockShare?: number;
  /** Effect IDs worn → copies. Legendary effects stack (`effectAmount`); unique effects apply once. */
  effects: EffectCounts;
}

/**
 * Multiplier on all your damage from effects: Glass Cannon × 2, Voidtouched × 0.75
 * (it ignores mitigation in `matchup`), the Rift's Glass Heart × 2. Also applies to
 * Thornshell and Zealot's Oath damage.
 */
export function effectDamageMult(effects: EffectCounts): number {
  return (effects.has(Effect.GlassCannon) ? 2 : 1) * (effects.has(Effect.Voidtouched) ? 0.75 : 1) * (effects.has(RiftEffect.GlassHeart) ? RIFT_NUM.glassHeartDamage : 1);
}

/**
 * Final combat stats of a character at `level` wearing `gear`, with `buffs` (an active
 * elixir, or a Phial for one fight, data/supplies.ts) as separate "more" multipliers
 * after everything else. In the Shifting Rift, `rift` adds the member's boons, curses, set
 * bonuses and the weekly mutation (shifting-rift.md, "Where a boon works").
 */
export function combatStats(level: number, gear: Gear, buffs?: Buffs, rift?: RiftBuild): CombatStats {
  const sum = new Map<number, number>();
  const effects = new Map<number, number>();
  const add = (s: GearStat) => sum.set(s.stat, (sum.get(s.stat) ?? 0) + fromStored(s.value));
  gear = gear.map(it => it && tempered(it));
  // Rift Anchor: the affixes on your other items × 1.2.
  const anchor = gear.findIndex(it => it?.effects?.includes(RiftEffect.RiftAnchor));
  const anchored = (s: GearStat) => sum.set(s.stat, (sum.get(s.stat) ?? 0) + fromStored(s.value) * RIFT_NUM.anchor);
  for (const [i, item] of gear.entries()) {
    if (!item) continue;
    item.implicits.forEach(add);
    item.affixes.forEach(anchor >= 0 && i !== anchor ? anchored : add);
    if (item.legendary) {
      add(item.legendary);
      effects.set(item.legendary.effect, (effects.get(item.legendary.effect) ?? 0) + 1);
    }
    // A legendary effect on a unique counts as one copy; unique-only effects apply once anyway.
    for (const e of item.effects ?? []) effects.set(e, (effects.get(e) ?? 0) + 1);
  }
  if (rift) for (const [id, n] of riftEffects(rift)) effects.set(id, n);
  const has = (e: number) => effects.has(e);
  const amount = (e: number) => effectAmount(effects, e);
  const flat = (s: number) => sum.get(s) ?? 0;
  /** Percent stat as a fraction. */
  const pct = (s: number) => flat(s) / 100;
  /** A held boon's value as a fraction (boons are percentages). */
  const boon = (id: number) => boonAmount(effects, id) / 100;
  const set = (theme: ThemeId, at: 3 | 5) => has(setBonusId(theme, at));
  const mutation = rift?.mutation ?? 0;

  // The Rift's "more" multipliers after gear, like elixirs (all 1 outside the Rift). Boons
  // and curses come with `rift`; rift effects and Trophies are on Ethereal items, so gear.
  let riftDamage = 1;
  let riftHp = 1;
  let riftSpeed = 1;
  if (rift) {
    const conduit = has(RiftEffect.RiftConduit) ? 1 + RIFT_NUM.conduit * rift.boons.length : 1;
    const hoard = has(RiftEffect.HoardersBand) ? 1 + Math.min(RIFT_NUM.hoarderMax, RIFT_NUM.hoarderPer10 * Math.floor((rift.motes ?? 0) / 10)) : 1;
    riftDamage = (1 + boon(Boon.SharpenedWill)) * (1 + boon(Boon.RedTithe)) * (1 + boon(Boon.Bloodrush) * (rift.won ?? 0)) *
      (set(Theme.Fury, 3) ? 1 + SET.fury3 : 1) * conduit * hoard * (mutation === Mutation.GlassWorld ? MUTATION_NUM.glassWorldDamage : 1);
    riftHp = (1 + boon(Boon.ThickSkin)) * (has(Boon.RedTithe) ? BOON_NUM.redTitheHp : 1) * (has(Boon.Phantom) ? BOON_NUM.phantomHp : 1) *
      (has(Curse.Frail) ? CURSE_NUM.frailHp : 1) * (set(Theme.Bastion, 3) ? 1 + SET.bastion3 : 1) * conduit * (rift.thickBlood ? THICK_BLOOD : 1);
    riftSpeed = (1 + boon(Boon.Quickened)) * (set(Theme.Storm, 3) ? 1 + SET.storm3 : 1) * (has(Boon.Fortress) ? BOON_NUM.fortressSpeed : 1) *
      (has(Boon.Shieldwall) ? BOON_NUM.shieldwallSpeed : 1) * (has(Curse.Weighted) ? CURSE_NUM.weightedSpeed : 1) *
      (mutation === Mutation.StormFront ? MUTATION_NUM.stormFrontSpeed : 1);
  }
  if (has(trophyId(EliteAffix.Swift))) {
    riftDamage *= TROPHY_NUM.swiftHit;
    riftSpeed *= TROPHY_NUM.swiftSpeed;
  }
  if (has(RiftEffect.Overclock)) riftSpeed *= RIFT_NUM.overclockSpeed;
  if (has(RiftEffect.GlassHeart)) riftHp *= RIFT_NUM.glassHeartHp;
  if (has(trophyId(EliteAffix.Thorned))) riftHp *= TROPHY_NUM.thornedHp;
  const hexed = has(Curse.Hexed) ? CURSE_NUM.hexedHeal : 1;
  const ironHide = 1 + boon(Boon.IronHide);
  const bloodbound = has(RiftEffect.Bloodbound);

  // Primaries: `level` from level-ups (1 at level 1) plus gear; each point is a
  // percent bonus to a bundle of stats (attributes.md). Lunar Insight: Might gives
  // nothing; Mind also gives max HP and resistance. Moonlit Vigil: Finesse gives nothing;
  // Mind also gives attack speed and armor.
  const lunar = has(Effect.LunarInsight);
  const hymn = has(Effect.MoonlitVigil);
  const might = lunar ? 0 : level + flat(Stat.Might);
  const finesse = hymn ? 0 : level + flat(Stat.Finesse);
  const mind = level + flat(Stat.Mind);
  const vitality = level + flat(Stat.Vitality);

  const damagePct: Record<DamageType, number> = {
    Physical: pct(Stat.PhysDamagePct) + 0.005 * might,
    Magic: pct(Stat.MagicDamagePct) + 0.0045 * mind,
  };
  // Spellblade swaps the damage type and both damage-% groups apply. Moonlight makes all
  // damage magic (it wins over Spellblade's swap).
  const spellblade = has(Effect.Spellblade);
  const moonlight = has(Effect.Moonlight);
  if (spellblade) damagePct.Physical = damagePct.Magic = damagePct.Physical + damagePct.Magic;
  const damageMult = effectDamageMult(effects);
  // Honed Edge raises flat added damage; it never deepens an Anomaly's negative roll.
  const honed = (x: number) => (x > 0 ? x * (1 + amount(Effect.HonedEdge)) : x);
  const addedFlat: Record<DamageType, number> = { Physical: honed(flat(Stat.PhysDamage)), Magic: honed(flat(Stat.MagicDamage)) };
  // Base damage %: the weapon's own hit only (either type), the counterpart of flat added damage.
  const baseDamage = 1 + pct(Stat.BaseDamagePct);
  // Discipline: a "more" multiplier from the highest primary attribute.
  const discipline = 1 + (amount(Effect.Discipline) * Math.max(0, might, finesse, mind, vitality)) / 100;
  const attackSpeedPct = pct(Stat.AttackSpeedPct) + 0.001 * finesse + (hymn ? 0.0008 * mind : 0);
  const critIncreased = pct(Stat.CritChancePct) + 0.004 * finesse;
  const critDamage = 1.5 + pct(Stat.CritDamage) + 0.0025 * mind + boon(Boon.Cruel);
  const healPct = pct(Stat.HealPct) + 0.0045 * mind;

  // Resonance: × (1 + RESONANCE) damage and max HP per other unique worn.
  const resonance = has(Effect.Resonance) ? 1 + RESONANCE * Math.max(0, gear.filter(it => it?.uniqueId).length - 1) : 1;

  const maxHp = Math.max(
    1,
    (100 + 10 * (level - 1) + flat(Stat.MaxHp)) *
    (1 + pct(Stat.MaxHpPct) + 0.002 * might + 0.0025 * vitality + (lunar ? 0.0025 * mind : 0)) *
    (has(Effect.GlassCannon) ? 0.5 : 1) *
    resonance *
    riftHp,
  );
  const frozenBlood = has(Effect.FrozenBlood);
  // Frozen Blood adds bonus HP / 10 to both. Ironclad and Runeguard convert from armor and
  // resistance before either is added, so they don't loop (max HP never depends on them).
  const fromHp = frozenBlood ? bonusHp(level, maxHp, has(Effect.GlassCannon)) / 10 : 0;
  // Iron Hide: × armor and resistance, before the conversions.
  const armor = (flat(Stat.Armor) * (1 + pct(Stat.ArmorPct) + (hymn ? 0.002 * mind : 0)) + fromHp) * ironHide;
  const resistance = (flat(Stat.Resistance) * (1 + pct(Stat.ResistancePct) + (lunar ? 0.005 * mind : 0)) + fromHp) * ironHide;
  const armorTotal = armor + amount(Effect.Runeguard) * resistance;
  const resistanceTotal = resistance + amount(Effect.Ironclad) * armor;
  // Moonshadow: every point of armor and resistance (after the conversions above) becomes evasion rating.
  const moonshadow = has(Effect.Moonshadow);

  const accuracy = (accuracyAtLevel(level) + flat(Stat.Accuracy)) * (1 + pct(Stat.AccuracyPct) + MIGHT_ACCURACY * might);
  // True Shot: × (1 + TRUE_SHOT × accuracy above your level's own, with the level's Might), never below × 1.
  const trueShot = has(Effect.TrueShot)
    ? 1 + TRUE_SHOT * Math.max(0, accuracy / (accuracyAtLevel(level) * (1 + MIGHT_ACCURACY * level)) - 1)
    : 1;
  // Anvil Strength: armor (what's left after Moonshadow) adds flat physical damage to every hit.
  if (has(Effect.AnvilStrength)) addedFlat.Physical += (moonshadow ? 0 : armorTotal) / ANVIL_ARMOR;

  // Parry and Thrust: no normal crits; crit chance becomes evasion rating (crits come from evading, `matchup`).
  const parry = has(Effect.ParryAndThrust);
  let parryRating = 0;

  // Only the main hand attacks today; off-hands add stats only.
  const sources: AttackSource[] = [];
  for (const { item, speedFactor } of [{ item: gear[MAIN_HAND], speedFactor: 1 }]) {
    const w = item?.weapon;
    if (!w) continue;
    const baseSpeed = w.speedMilli / 1000;
    const hit = { Physical: 0, Magic: 0 };
    for (const t of ['Physical', 'Magic'] as const) {
      if (moonlight) {
        // Weapon hit and every flat added damage, as magic, scaled by magic % only.
        hit[t] = t === 'Physical' ? 0 : Math.max(0, (fromStored(w.hit) * baseDamage + addedFlat.Physical + addedFlat.Magic) * (1 + damagePct.Magic) * damageMult * resonance * trueShot * discipline * (buffs?.damage ?? 1) * riftDamage);
        continue;
      }
      const from = spellblade ? (t === 'Physical' ? 'Magic' : 'Physical') : t;
      // A Split weapon's hit is half physical, half magic; each half takes its own damage % and mitigation.
      const share = w.damageType.tag === 'Split' ? 0.5 : w.damageType.tag === from ? 1 : 0;
      const base = share * fromStored(w.hit) * baseDamage;
      // Flat added damage (and heal, below) is a straight bonus per hit: fast weapons get more from it.
      // Floored at 0: an Anomaly's negative affixes never make a hit heal the enemy.
      hit[t] = Math.max(0, (base + addedFlat[from]) * (1 + damagePct[t]) * damageMult * resonance * trueShot * discipline * (buffs?.damage ?? 1) * riftDamage);
    }
    // Voidheart: all of it becomes magic, × 1.25 (after Spellblade and Moonlight: the last type change wins).
    if (has(RiftEffect.Voidheart)) {
      hit.Magic = (hit.Physical + hit.Magic) * RIFT_NUM.voidheart;
      hit.Physical = 0;
    }
    const baseHeal = fromStored(w.heal);
    const heal = baseHeal > 0 ? Math.max(0, (baseHeal + flat(Stat.Heal)) * (1 + healPct)) * hexed : 0;
    // Keen: flat crit chance after the increase, and before Glimmerguard converts it all (below).
    const critChance = Math.max(0, (w.baseCritBp / 10_000 + pct(Stat.BaseCritChance)) * (1 + critIncreased)) + boon(Boon.Keen);
    // Overcrit: each 1% of crit chance above 100% gives +2% crit damage per copy. A crit never hits softer than a normal hit.
    const critDmg = Math.max(1, critDamage + amount(Effect.Overcrit) * Math.max(0, critChance - 1));
    if (parry) parryRating = PARRY_RATING * 100 * critChance;
    sources.push({
      hit,
      heal,
      healAll: w.healTarget?.tag === 'All',
      // Ambush (× 0.7), Frozen Blood (× 0.8) and Anvil Strength (× 0.75) apply after the floor, so they always cost speed.
      attacksPerSec: Math.max(baseSpeed * (1 + attackSpeedPct), 0.25 * baseSpeed) * speedFactor * (has(Effect.Ambush) ? 0.7 : 1) * (has(Effect.FrozenBlood) ? 0.8 : 1) *
        (has(Effect.AnvilStrength) ? ANVIL_SPEED : 1) * (buffs?.attackSpeed ?? 1) * riftSpeed,
      critChance: parry ? 0 : critChance,
      // Frostbite: crits deal no extra damage (they chill instead, see `chill`).
      critMult: has(Effect.Frostbite) || parry ? 1 : 1 + Math.min(1, critChance) * (critDmg - 1),
    });
  }

  // Iron Week: armor penetration counts double. Moonlight and Voidheart: it counts as magic penetration.
  const armorPenPct = mutation === Mutation.IronWeek ? MUTATION_NUM.ironWeekPen * pct(Stat.ArmorPenPct) : pct(Stat.ArmorPenPct);
  let armorPen = Math.min(CAPS.penetration / 100, armorPenPct);
  let magicPen = Math.min(CAPS.penetration / 100, pct(Stat.MagicPenPct) + (moonlight || has(RiftEffect.Voidheart) ? armorPenPct : 0));
  // Sunder ignores a share of what's left, past the cap.
  const sunder = boon(Boon.Sunder);
  if (sunder > 0) {
    armorPen = 1 - (1 - armorPen) * (1 - sunder);
    magicPen = 1 - (1 - magicPen) * (1 - sunder);
  }
  const lifesteal = pct(Stat.LifestealPct) + boon(Boon.Leech);
  const evadeChance = boon(Boon.Fleetfoot) + (set(Theme.Mist, 3) ? SET.mist3 : 0);
  const block = boon(Boon.RaisedShield) + (set(Theme.Aegis, 3) ? SET.aegis3 : 0);
  const blockShare = has(Boon.Shieldwall) ? 1 : boon(Boon.DeepGuard);
  const taken = (has(Boon.Fortress) ? BOON_NUM.fortressTaken : 1) * (has(RiftEffect.MirrorMail) ? RIFT_NUM.mirrorTaken : 1);

  return {
    level,
    sources,
    critDamage,
    armorPen,
    magicPen,
    maxHp,
    // Frozen Blood and Bloodbound: no regen. Unyielding (a Trophy) regenerates a share of max HP.
    regen: frozenBlood || bloodbound ? 0 : Math.max(0, flat(Stat.HpRegen) * (1 + 0.005 * vitality) + (has(trophyId(EliteAffix.Unyielding)) ? TROPHY_NUM.unyielding * maxHp : 0)) * hexed,
    armor: moonshadow ? 0 : armorTotal,
    resistance: moonshadow ? 0 : resistanceTotal,
    evasionRating: flat(Stat.EvasionRating) * (1 + pct(Stat.EvasionRatingPct) + 0.0025 * finesse) + (moonshadow ? armorTotal + resistanceTotal : 0) + parryRating,
    accuracy,
    // Bloodthirst, Leech and the Blood set raise the lifesteal cap; Bloodbound removes it. Vampiric (a Trophy) heals past it.
    // Frozen Blood stops all of it, Vampiric included.
    lifesteal: frozenBlood ? 0 : (Math.max(0, bloodbound ? lifesteal : Math.min(CAPS.lifesteal / 100 + amount(Effect.Bloodthirst) + boon(Boon.Leech) + (set(Theme.Blood, 3) ? SET.blood3 : 0), lifesteal)) +
      (has(trophyId(EliteAffix.Vampiric)) ? TROPHY_NUM.vampiric : 0)) * hexed,
    threat: pct(Stat.ThreatPct) + 0.0025 * vitality,
    // At worst −100%: nothing found, never negative gold or XP. A buff multiplies the total.
    itemFind: more(Math.max(-1, pct(Stat.ItemFindPct)), buffs?.itemFind),
    goldFind: more(Math.max(-1, pct(Stat.GoldFindPct)), buffs?.gold),
    xpGain: more(Math.max(-1, pct(Stat.XpGainPct)), buffs?.xp),
    walkTime: WALK_SECONDS * (1 - amount(Effect.SwiftHunter)),
    offlineHours: BASE_OFFLINE_HOURS + amount(Effect.Seasoned),
    chill: has(Effect.Frostbite) ? 0.5 * Math.min(1, sources[0]?.critChance ?? 0) : 0,
    ...((buffs?.damageTaken !== undefined || taken !== 1) && { damageTaken: (buffs?.damageTaken ?? 1) * taken }),
    ...(buffs?.renewal && { renewal: buffs.renewal }),
    ...(evadeChance > 0 && { evadeChance }),
    ...(block > 0 && { block }),
    ...(blockShare > 0 && { blockShare }),
    effects,
  };
}

/**
 * Max HP above what `level` gives with no gear: the level base with the level's own Might
 * and Vitality, halved by Glass Cannon like max HP is. Everything else (flat and % HP,
 * gear Might and Vitality) is bonus. Frozen Blood scales with it.
 */
export function bonusHp(level: number, maxHp: number, glassCannon: boolean): number {
  const levelHp = (100 + 10 * (level - 1)) * (1 + 0.0045 * level) * (glassCannon ? 0.5 : 1);
  return Math.max(0, maxHp - levelHp);
}

/** Bonus `x` (0.5 = +50%) times a "more" multiplier `mult`, as a bonus again. */
const more = (x: number, mult = 1) => (1 + x) * mult - 1;

/** Most damage armor or resistance can remove, before Unbreakable. */
export const MITIGATION_CAP = 0.85;

/** Damage reduction from armor or resistance `def` (after penetration) at `level`, up to `cap`. */
export function mitigation(def: number, pen: number, level: number, cap = MITIGATION_CAP): number {
  const d = def * (1 - pen);
  return d <= 0 ? 0 : Math.min(cap, d / (d + 5 * level));
}

/**
 * Average damage multiplier from crits of `src` against `mit` (enemy mitigation by type),
 * with Deadeye's share `deadeye` of that mitigation ignored by crits. `src.critMult`
 * without Deadeye.
 */
export function critMultAgainst(src: AttackSource, mit: Record<DamageType, number>, deadeye: number): number {
  const c = Math.min(1, src.critChance);
  const normal = src.hit.Physical * (1 - mit.Physical) + src.hit.Magic * (1 - mit.Magic);
  if (deadeye <= 0 || c <= 0 || normal <= 0) return src.critMult;
  const pierced = src.hit.Physical * (1 - mit.Physical * (1 - deadeye)) + src.hit.Magic * (1 - mit.Magic * (1 - deadeye));
  const critDmg = 1 + (src.critMult - 1) / c;
  return 1 - c + c * critDmg * (pierced / normal);
}

/** Parry and Thrust: `src` as if every attack crit (crit damage `critDamage`), for `critMultAgainst`: a parried attack's multiplier. */
export const parrySource = (src: AttackSource, critDamage: number): AttackSource => ({ ...src, critChance: 1, critMult: Math.max(1, critDamage) });

/**
 * Your mitigation and evasion against `type` damage from an attacker of `enemyLevel`.
 * Mitigation scales with its level, evasion with its `accuracy` (an enemy's is its
 * level's, `accuracyAtLevel`; a player's comes from level, gear and Might), never with
 * yours, so levelling up never weakens your defense.
 * Juggernaut (magic) and Spellward (physical) use the better of armor and resistance
 * but stop evasion; Phantom Step raises the evasion cap.
 */
export function defenseAgainst(s: CombatStats, type: DamageType, enemyLevel: number, accuracy = accuracyAtLevel(enemyLevel)): { mitigation: number; evasion: number } {
  const juggernaut = s.effects.has(Effect.Juggernaut);
  const spellward = s.effects.has(Effect.Spellward);
  // Warded Shell (a Trophy): the better of the two against both types, evasion kept.
  const warded = s.effects.has(trophyId(EliteAffix.WardedShell));
  const best = Math.max(s.armor, s.resistance);
  const def = warded ? best : type === 'Physical' ? (spellward ? best : s.armor) : juggernaut ? best : s.resistance;
  const cap = evasionCap(s);
  return {
    mitigation: mitigation(def, 0, enemyLevel, MITIGATION_CAP + effectAmount(s.effects, Effect.Unbreakable)),
    // The Rift's flat evade chance adds after rating, up to the same cap.
    evasion: cap > 0 ? Math.min(cap, dodgeChance(s.evasionRating, accuracy, cap) + (s.evadeChance ?? 0)) : 0,
  };
}

/** The most evade chance `s` can reach: the cap, raised by Phantom Step; 0 under Juggernaut or Spellward. */
export function evasionCap(s: CombatStats): number {
  return s.effects.has(Effect.Juggernaut) || s.effects.has(Effect.Spellward) ? 0 : CAPS.evasion / 100 + effectAmount(s.effects, Effect.PhantomStep);
}

export interface Matchup {
  /** Enemy mitigation by damage type. */
  enemyMitigation: Record<DamageType, number>;
  playerMitigation: number;
  evasion: number;
  /** Chance the enemy dodges each of your attacks: its evasion rating against your accuracy. */
  enemyEvasion: number;
  /** The main weapon's average crit multiplier against this enemy (Deadeye included). */
  critMult: number;
  /** One enemy hit after your mitigation and Stoneskin, before evasion and Bulwark. */
  enemyHit: number;
  /** One enemy hit as a live fight rolls it: after your mitigation and Frostbite's chill, before a Phial of Warding, Stoneskin, evasion and Bulwark (`Fighter.shrink`). */
  foeHit: number;
  /** Share of your Thornshell reflect the enemy takes: what its mitigation in its own damage type lets through. */
  thornsThrough: number;
  /** Second Skin's shield at the start of each fight, HP. */
  shield: number;
  /** Your damage per second after the enemy's mitigation and evasion (before its regen). */
  dps: number;
  /** The part of `dps` your attacks deal themselves; live fights add Riposte, Thornshell and Zealot's Oath per event. */
  weaponDps: number;
  /** Waxing Moon's average damage multiplier over this fight (1 without it); already in `dps`. */
  waxing: number;
  /** Fading Rally's average attack speed multiplier over this fight (1 without it); already in `dps` and `hps`. */
  rally: number;
  /** Parry and Thrust: the chance each of your attacks crits, from evading since your last one (0 without it). */
  parry: number;
  /** Self-heal per second. */
  hps: number;
  /** Enemy damage per second after your mitigation and evasion. */
  incoming: number;
  /** Incoming minus regen, lifesteal and heals; ≤ 0 means you never die. */
  netIncoming: number;
  /** Seconds; Infinity if you deal no damage. */
  timeToKill: number;
  /** Seconds; Infinity if you out-sustain the enemy. */
  timeToDie: number;
  viable: boolean;
  /** Kills per second including the walk time; 0 if not viable. */
  killRate: number;
  xpPerKill: number;
  goldPerKill: number;
}

export function matchup(s: CombatStats, e: EnemyDef): Matchup {
  const has = (id: number) => s.effects.has(id);
  const amount = (id: number) => effectAmount(s.effects, id);
  // Rending and Spellbreaker ignore a share of what's left after penetration.
  const enemyMitigation = has(Effect.Voidtouched)
    ? { Physical: 0, Magic: 0 }
    : {
        Physical: mitigation(e.armor, s.armorPen, e.level) * (1 - amount(Effect.Rending)),
        Magic: mitigation(e.resistance, s.magicPen, e.level) * (1 - amount(Effect.Spellbreaker)),
      };
  let dps = 0;
  let hps = 0;
  let critMult = 1;
  const deadeye = amount(Effect.Deadeye);
  const { mitigation: playerMitigation, evasion } = defenseAgainst(s, e.damageType, e.level);
  const period = s.sources[0] ? 1 / s.sources[0].attacksPerSec : 0;
  // Parry and Thrust: an attack crits if any enemy attack was evaded since your last one.
  const parry = has(Effect.ParryAndThrust) && period > 0 ? 1 - (1 - evasion) ** (e.speed * period) : 0;
  // An evasive enemy dodges a share of your attacks; heals still land. True Shot: never.
  const enemyEvasion = has(Effect.TrueShot) ? 0 : dodgeChance(e.evasionRating ?? 0, s.accuracy);
  const sources = s.sources;
  // Moonlight: every 3rd attack hits twice.
  const wave = has(Effect.Moonlight) ? MOONLIGHT_MULT : 1;
  for (const src of sources) {
    const perHit = src.hit.Physical * (1 - enemyMitigation.Physical) + src.hit.Magic * (1 - enemyMitigation.Magic);
    const cm = has(Effect.ParryAndThrust) ? 1 + parry * (critMultAgainst(parrySource(src, s.critDamage), enemyMitigation, deadeye) - 1) : critMultAgainst(src, enemyMitigation, deadeye);
    if (src === sources[0]) critMult = cm;
    dps += perHit * src.attacksPerSec * cm * wave;
    hps += src.heal * src.attacksPerSec * (has(Effect.ParryAndThrust) ? 1 + parry * (s.critDamage - 1) : src.critMult); // solo: heals land on yourself
  }
  dps *= 1 - enemyEvasion;
  // Waxing Moon: hits grow through the fight. `x` average hits kill at full strength;
  // waxingAttacks(x) is how many it takes, so the fight's average multiplier is x / that.
  let waxing = 1;
  if (has(Effect.WaxingMoon) && dps > 0 && period > 0) {
    const x = e.hp / (dps * period);
    waxing = x / waxingAttacks(x);
    dps *= waxing;
  }
  // Fading Rally: attack speed falls through the fight. `x` attacks kill; rallyPeriods(x)
  // base periods is how long they take, so the fight's average speed multiplier is x / that.
  let rally = 1;
  if (has(Effect.FadingRally) && dps > 0 && period > 0) {
    const x = e.hp / (dps * period);
    rally = x / rallyPeriods(x);
    dps *= rally;
    hps *= rally;
  }

  const weaponDps = dps;
  // Stoneskin takes a share of max HP off each hit; Bulwark (with the Rift's block chance) blocks half (or `blockShare`) of a share of the hits.
  const stoneskin = amount(Effect.Stoneskin) * s.maxHp;
  const bulwark = Math.min(1, amount(Effect.Bulwark) + (s.block ?? 0));
  // A Phial of Warding shrinks what gets through mitigation.
  const taken = (1 - s.chill) * (s.damageTaken ?? 1);
  const enemyHit = Math.max(0, (e.dps / e.speed) * taken * (1 - playerMitigation) - stoneskin);
  const foeHit = (e.dps / e.speed) * (1 - s.chill) * (1 - playerMitigation);
  let incoming = stoneskin > 0 ? enemyHit * e.speed * (1 - evasion) : e.dps * taken * (1 - playerMitigation) * (1 - evasion);
  if (bulwark > 0) incoming *= 1 - bulwark * (s.blockShare ?? 0.5);
  // Afterimage: a hit right after a dodge (chance = evasion) deals a share less.
  incoming *= 1 - amount(Effect.Afterimage) * evasion;
  // Riposte: each evaded attack counters for a share of your average hit.
  dps += amount(Effect.Riposte) * evasion * e.speed * (dps / rally) * period;
  // Effect damage is your damage: Glass Cannon and Voidtouched apply to it too.
  const damageMult = effectDamageMult(s.effects);
  // Thornshell reflects a share of the damage taken, in the type it was dealt in.
  dps += amount(Effect.Thornshell) * incoming * damageMult * (1 - enemyMitigation[e.damageType]);
  // Zealot's Oath: heals also hit for a share of the heal (magic).
  dps += amount(Effect.ZealotsOath) * hps * damageMult * (1 - enemyMitigation.Magic);
  const netIncoming = incoming - s.regen - s.lifesteal * dps - hps;
  // Second Skin: the shield takes the first hits. HP is full meanwhile, so sustain does nothing.
  const shield = amount(Effect.SecondSkin) * s.maxHp;
  const shieldTime = shield > 0 && incoming > 0 ? shield / incoming : 0;

  // A regenerating enemy heals while you fight it: only damage above its regen counts.
  const netDps = dps - (e.regen ?? 0);
  let timeToKill = netDps > 0 ? e.hp / netDps : Infinity;
  // Berserker: damage × (1 + k × share of max HP missing). Missing HP grows at
  // `netIncoming` once the shield is gone, so the enemy's HP falls as a quadratic in time.
  const berserk = 10 * amount(Effect.Berserker);
  if (berserk > 0 && netDps > 0 && netIncoming > 0 && timeToKill > shieldTime) {
    const alpha = (berserk * netIncoming) / (2 * s.maxHp);
    const hpLeft = e.hp - netDps * shieldTime;
    timeToKill = shieldTime + (Math.sqrt(netDps ** 2 + 4 * alpha * dps * hpLeft) - netDps) / (2 * alpha * dps);
  }
  // Executioner (the last share of the enemy's HP) and Bully (the first share) take
  // double damage, so those parts go in half the time.
  const doubled = amount(Effect.Executioner) + amount(Effect.Bully);
  if (doubled > 0) timeToKill *= 1 - doubled / 2;
  // Ambush: the first swing (half a period in) deals 5 average hits, saving 4 periods;
  // a fight never ends before that first swing.
  if (has(Effect.Ambush) && dps > 0 && period > 0) timeToKill = Math.max(timeToKill - 4 * period, period / 2);
  // Follow-through: the killing hit overkills by half a hit on average; a share of that
  // lands on the next enemy as it arrives.
  const carry = amount(Effect.FollowThrough);
  if (carry > 0 && dps > 0) timeToKill = Math.max(0, timeToKill - (carry / 2) * period);

  // Second Wind: once per fight, a killing blow leaves you at a share of max HP. Last
  // Stand slows the HP below its threshold, where sustain may hold you up for good.
  const secondWind = amount(Effect.SecondWind);
  const lastStand = amount(Effect.LastStand);
  const lowNet = netIncoming - lastStand * incoming;
  const low = LAST_STAND_BELOW * s.maxHp;
  const drain = (h: number) => (lastStand > 0 ? Math.max(0, h - low) / netIncoming + Math.min(h, low) / lowNet : h / netIncoming);
  const timeToDie =
    netIncoming <= 0 || lowNet <= 0
      ? Infinity
      : lastStand > 0 || shield > 0
        ? shieldTime + drain(s.maxHp) + (secondWind > 0 ? drain(secondWind * s.maxHp) : 0)
        : (s.maxHp * (1 + secondWind)) / netIncoming;
  const viable = timeToKill < timeToDie;
  return {
    enemyMitigation,
    playerMitigation,
    evasion,
    enemyEvasion,
    critMult,
    enemyHit,
    foeHit,
    thornsThrough: 1 - enemyMitigation[e.damageType],
    shield,
    dps,
    weaponDps,
    waxing,
    rally,
    parry,
    hps,
    incoming,
    netIncoming,
    timeToKill,
    timeToDie,
    viable,
    killRate: viable ? 1 / (timeToKill + s.walkTime) : 0,
    // Midas Touch: no XP, gold × 2.5. Scholar's Focus: XP × 1.75, gold × 0.5. Both: both apply.
    xpPerKill: e.xp * (1 + s.xpGain) * (has(Effect.MidasTouch) ? 0 : has(Effect.ScholarsFocus) ? 1.75 : 1),
    goldPerKill:
      e.gold * (1 + s.goldFind) * (1 + amount(Effect.Prosperity)) * (has(Effect.MidasTouch) ? 2.5 : 1) * (has(Effect.ScholarsFocus) ? 0.5 : 1),
  };
}
