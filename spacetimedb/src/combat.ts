// Combat formulas (docs/design/combat.md, attributes.md): stat aggregation and the
// closed-form matchup against one enemy. Pure: no SpacetimeDB imports, so the client
// shows exactly what the server settles.
//
// Combat math runs in floats and display units (1 HP, 1 = 100%); items store
// hundredths, converted with `fromStored`.

import { SLOTS } from './data/bases';
import { Effect, LAST_STAND_BELOW, MOONLIGHT_MULT, MOONSHADOW_AFTER_DODGE, MOONSHADOW_TAKEN, effectAmount, waxingAttacks, type EffectCounts } from './data/legendary';
import { CAPS, Stat, fromStored, roundStat, toStored, wholeValue, type StatId } from './data/stats';
import { WALK_SECONDS, type EnemyDef } from './data/zones';
import type { DamageType } from './data/bases';
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
  damageType: { tag: DamageType };
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
  /** Effect IDs worn → copies. Legendary effects stack (`effectAmount`); unique effects apply once. */
  effects: EffectCounts;
}

/**
 * Multiplier on all your damage from effects: Glass Cannon × 2, Voidtouched × 0.75
 * (it ignores mitigation in `matchup`). Also applies to Thornshell and Zealot's Oath damage.
 */
export function effectDamageMult(effects: EffectCounts): number {
  return (effects.has(Effect.GlassCannon) ? 2 : 1) * (effects.has(Effect.Voidtouched) ? 0.75 : 1);
}

/**
 * Final combat stats of a character at `level` wearing `gear`, with `buffs` (an active
 * elixir, data/supplies.ts) as separate "more" multipliers after everything else.
 */
export function combatStats(level: number, gear: Gear, buffs?: Buffs): CombatStats {
  const sum = new Map<number, number>();
  const effects = new Map<number, number>();
  const add = (s: GearStat) => sum.set(s.stat, (sum.get(s.stat) ?? 0) + fromStored(s.value));
  gear = gear.map(it => it && tempered(it));
  for (const item of gear) {
    if (!item) continue;
    item.implicits.forEach(add);
    item.affixes.forEach(add);
    if (item.legendary) {
      add(item.legendary);
      effects.set(item.legendary.effect, (effects.get(item.legendary.effect) ?? 0) + 1);
    }
    // A legendary effect on a unique counts as one copy; unique-only effects apply once anyway.
    for (const e of item.effects ?? []) effects.set(e, (effects.get(e) ?? 0) + 1);
  }
  const has = (e: number) => effects.has(e);
  const amount = (e: number) => effectAmount(effects, e);
  const flat = (s: number) => sum.get(s) ?? 0;
  /** Percent stat as a fraction. */
  const pct = (s: number) => flat(s) / 100;

  // Primaries: `level` from level-ups (1 at level 1) plus gear; each point is a
  // percent bonus to a bundle of stats (attributes.md). Lunar Insight: Might gives
  // nothing; Mind also gives max HP and resistance.
  const lunar = has(Effect.LunarInsight);
  const might = lunar ? 0 : level + flat(Stat.Might);
  const finesse = level + flat(Stat.Finesse);
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
  // Discipline: a "more" multiplier from the highest primary attribute.
  const discipline = 1 + (amount(Effect.Discipline) * Math.max(0, might, finesse, mind, vitality)) / 100;
  const attackSpeedPct = pct(Stat.AttackSpeedPct) + 0.001 * finesse;
  const critIncreased = pct(Stat.CritChancePct) + 0.004 * finesse;
  const critDamage = 1.5 + pct(Stat.CritDamage);
  const healPct = pct(Stat.HealPct) + 0.0045 * mind;

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
        hit[t] = t === 'Physical' ? 0 : Math.max(0, (fromStored(w.hit) + addedFlat.Physical + addedFlat.Magic) * (1 + damagePct.Magic) * damageMult * discipline * (buffs?.damage ?? 1));
        continue;
      }
      const from = spellblade ? (t === 'Physical' ? 'Magic' : 'Physical') : t;
      const base = w.damageType.tag === from ? fromStored(w.hit) : 0;
      // Flat added damage (and heal, below) is a straight bonus per hit: fast weapons get more from it.
      // Floored at 0: an Anomaly's negative affixes never make a hit heal the enemy.
      hit[t] = Math.max(0, (base + addedFlat[from]) * (1 + damagePct[t]) * damageMult * discipline * (buffs?.damage ?? 1));
    }
    const baseHeal = fromStored(w.heal);
    const heal = baseHeal > 0 ? Math.max(0, (baseHeal + flat(Stat.Heal)) * (1 + healPct)) : 0;
    const critChance = Math.max(0, (w.baseCritBp / 10_000 + pct(Stat.BaseCritChance)) * (1 + critIncreased));
    // Overcrit: each 1% of crit chance above 100% gives +2% crit damage per copy. A crit never hits softer than a normal hit.
    const critDmg = Math.max(1, critDamage + amount(Effect.Overcrit) * Math.max(0, critChance - 1));
    sources.push({
      hit,
      heal,
      healAll: w.healTarget?.tag === 'All',
      // Ambush (× 0.7) and Frozen Blood (× 0.8) apply after the floor, so they always cost speed.
      attacksPerSec: Math.max(baseSpeed * (1 + attackSpeedPct), 0.25 * baseSpeed) * speedFactor * (has(Effect.Ambush) ? 0.7 : 1) * (has(Effect.FrozenBlood) ? 0.8 : 1) * (buffs?.attackSpeed ?? 1),
      critChance,
      // Frostbite: crits deal no extra damage (they chill instead, see `chill`).
      critMult: has(Effect.Frostbite) ? 1 : 1 + Math.min(1, critChance) * (critDmg - 1),
    });
  }

  const maxHp = Math.max(
    1,
    (100 + 10 * (level - 1) + flat(Stat.MaxHp)) *
    (1 + pct(Stat.MaxHpPct) + 0.002 * might + 0.0025 * vitality + (lunar ? 0.0025 * mind : 0)) *
    (has(Effect.GlassCannon) ? 0.5 : 1),
  );
  const frozenBlood = has(Effect.FrozenBlood);
  // Frozen Blood adds bonus HP / 10 to both. Ironclad and Runeguard convert from armor and
  // resistance before either is added, so they don't loop (max HP never depends on them).
  const fromHp = frozenBlood ? bonusHp(level, maxHp, has(Effect.GlassCannon)) / 10 : 0;
  const armor = flat(Stat.Armor) * (1 + pct(Stat.ArmorPct)) + fromHp;
  const resistance = flat(Stat.Resistance) * (1 + pct(Stat.ResistancePct) + (lunar ? 0.005 * mind : 0)) + fromHp;

  return {
    level,
    sources,
    critDamage,
    armorPen: Math.min(CAPS.penetration / 100, pct(Stat.ArmorPenPct)),
    // Moonlight: armor penetration counts as magic penetration.
    magicPen: Math.min(CAPS.penetration / 100, pct(Stat.MagicPenPct) + (moonlight ? pct(Stat.ArmorPenPct) : 0)),
    maxHp,
    regen: frozenBlood ? 0 : Math.max(0, flat(Stat.HpRegen) * (1 + 0.01 * vitality)),
    armor: armor + amount(Effect.Runeguard) * resistance,
    resistance: resistance + amount(Effect.Ironclad) * armor,
    evasionRating: flat(Stat.EvasionRating) * (1 + pct(Stat.EvasionRatingPct) + 0.0025 * finesse),
    // Bloodthirst raises the lifesteal cap.
    lifesteal: frozenBlood ? 0 : Math.max(0, Math.min(CAPS.lifesteal / 100 + amount(Effect.Bloodthirst), pct(Stat.LifestealPct))),
    threat: pct(Stat.ThreatPct) + 0.0025 * vitality,
    // At worst −100%: nothing found, never negative gold or XP. A buff multiplies the total.
    itemFind: more(Math.max(-1, pct(Stat.ItemFindPct)), buffs?.itemFind),
    goldFind: more(Math.max(-1, pct(Stat.GoldFindPct)), buffs?.gold),
    xpGain: more(Math.max(-1, pct(Stat.XpGainPct)), buffs?.xp),
    walkTime: WALK_SECONDS * (1 - amount(Effect.SwiftHunter)),
    offlineHours: BASE_OFFLINE_HOURS + amount(Effect.Seasoned),
    chill: has(Effect.Frostbite) ? 0.5 * Math.min(1, sources[0]?.critChance ?? 0) : 0,
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

/** Chance to avoid an attack from an enemy of `enemyLevel`. */
export function evasionChance(rating: number, enemyLevel: number, cap = CAPS.evasion / 100): number {
  return rating <= 0 ? 0 : Math.min(cap, rating / (rating + 10 * enemyLevel));
}

/**
 * Your mitigation and evasion against `type` damage from an enemy of `enemyLevel`. Both
 * scale with the attacker's level, not yours, so levelling up never weakens your defense.
 * Juggernaut (magic) and Spellward (physical) use the better of armor and resistance
 * but stop evasion; Phantom Step raises the evasion cap.
 */
export function defenseAgainst(s: CombatStats, type: DamageType, enemyLevel: number): { mitigation: number; evasion: number } {
  const juggernaut = s.effects.has(Effect.Juggernaut);
  const spellward = s.effects.has(Effect.Spellward);
  const best = Math.max(s.armor, s.resistance);
  const def = type === 'Physical' ? (spellward ? best : s.armor) : juggernaut ? best : s.resistance;
  const cap = CAPS.evasion / 100 + effectAmount(s.effects, Effect.PhantomStep);
  return {
    mitigation: mitigation(def, 0, enemyLevel, MITIGATION_CAP + effectAmount(s.effects, Effect.Unbreakable)),
    evasion: juggernaut || spellward ? 0 : evasionChance(s.evasionRating, enemyLevel, cap),
  };
}

export interface Matchup {
  /** Enemy mitigation by damage type. */
  enemyMitigation: Record<DamageType, number>;
  playerMitigation: number;
  evasion: number;
  /** The main weapon's average crit multiplier against this enemy (Deadeye included). */
  critMult: number;
  /** One enemy hit after your mitigation and Stoneskin, before evasion and Bulwark. */
  enemyHit: number;
  /** Second Skin's shield at the start of each fight, HP. */
  shield: number;
  /** Your damage per second after the enemy's mitigation and evasion (before its regen). */
  dps: number;
  /** Waxing Moon's average damage multiplier over this fight (1 without it); already in `dps`. */
  waxing: number;
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
  // Moonlight: every 3rd attack hits twice.
  const wave = has(Effect.Moonlight) ? MOONLIGHT_MULT : 1;
  for (const src of s.sources) {
    const perHit = src.hit.Physical * (1 - enemyMitigation.Physical) + src.hit.Magic * (1 - enemyMitigation.Magic);
    const cm = critMultAgainst(src, enemyMitigation, deadeye);
    if (src === s.sources[0]) critMult = cm;
    dps += perHit * src.attacksPerSec * cm * wave;
    hps += src.heal * src.attacksPerSec * src.critMult; // solo: heals land on yourself
  }
  // An evasive enemy dodges a share of your attacks; heals still land.
  dps *= 1 - (e.evasion ?? 0);
  const period = s.sources[0] ? 1 / s.sources[0].attacksPerSec : 0;
  // Waxing Moon: hits grow through the fight. `x` average hits kill at full strength;
  // waxingAttacks(x) is how many it takes, so the fight's average multiplier is x / that.
  let waxing = 1;
  if (has(Effect.WaxingMoon) && dps > 0 && period > 0) {
    const x = e.hp / (dps * period);
    waxing = x / waxingAttacks(x);
    dps *= waxing;
  }

  const { mitigation: playerMitigation, evasion } = defenseAgainst(s, e.damageType, e.level);
  // Stoneskin takes a share of max HP off each hit; Bulwark blocks half of a share of the hits.
  const stoneskin = amount(Effect.Stoneskin) * s.maxHp;
  const bulwark = amount(Effect.Bulwark);
  const enemyHit = Math.max(0, (e.dps / e.speed) * (1 - s.chill) * (1 - playerMitigation) - stoneskin);
  let incoming = stoneskin > 0 ? enemyHit * e.speed * (1 - evasion) : e.dps * (1 - s.chill) * (1 - playerMitigation) * (1 - evasion);
  if (bulwark > 0) incoming *= 1 - bulwark / 2;
  // Moonshadow: a hit right after a dodge (chance = evasion) is halved; landed hits × 1.1.
  if (has(Effect.Moonshadow)) incoming *= (1 - (1 - MOONSHADOW_AFTER_DODGE) * evasion) * MOONSHADOW_TAKEN;
  // Riposte: each evaded attack counters for a share of your average hit.
  dps += amount(Effect.Riposte) * evasion * e.speed * dps * period;
  // Effect damage is your damage: Glass Cannon and Voidtouched apply to it too.
  const damageMult = effectDamageMult(s.effects);
  // Thornshell reflects a share of the damage taken as physical damage.
  dps += amount(Effect.Thornshell) * incoming * damageMult * (1 - enemyMitigation.Physical);
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
    critMult,
    enemyHit,
    shield,
    dps,
    waxing,
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
