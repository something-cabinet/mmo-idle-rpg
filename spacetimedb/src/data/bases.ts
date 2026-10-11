// Item bases (docs/design/bases.md). A base is a family; an item is (base, tier).
// Pure data, shared by server and client.
//
// PERMANENT IDS: base IDs are stored on items and in loot tables; never reuse or
// renumber them. Names and templates may change (they only affect new drops).

import { MAX_TIER, Stat, curve, roundStat, wholeValue, type Curve, type StatId } from './stats';

/** Equipment slots, in loadout order. Stored as indexes: never reorder. */
export const SLOTS = ['MainHand', 'OffHand', 'Head', 'Chest', 'Hands', 'Feet', 'Ring1', 'Ring2', 'Amulet'] as const;
export type Slot = (typeof SLOTS)[number];
export const SLOT_COUNT = SLOTS.length;

export type DamageType = 'Physical' | 'Magic';
export type HealTarget = 'Single' | 'All';
export type BaseKind = 'weapon' | 'offhand' | 'armor' | 'jewelry';

/** A stat given by the base itself. `value` is T1 for flat curves, T9 (P) for 'percent'; `fixed` ignores tier. */
export interface Implicit {
  stat: StatId;
  value: number;
  curve: Curve | 'fixed';
}

export interface WeaponTemplate {
  damageType: DamageType;
  /** T1 hit, offense curve. */
  hit: number;
  /** Attacks per second (doesn't scale). */
  speed: number;
  /** Base crit chance in % (doesn't scale). */
  baseCrit: number;
  /** T1 heal per hit, heal curve. */
  heal?: number;
  healTarget?: HealTarget;
  twoHanded: boolean;
}

export interface BaseDef {
  id: number;
  kind: BaseKind;
  /** Display family, e.g. "Sword", "Plate · Chest". */
  family: string;
  slots: readonly Slot[];
  /** Name for tier t (1..9). */
  name: (t: number) => string;
  implicits: Implicit[];
  weapon?: WeaponTemplate;
}

// ------------------------------------------------------------------ names

/** Tier name tracks: T1–T2 sound cheap, T3 solid, T4 a little fancy, T5+ legendary materials. */
export const TRACKS = {
  metal: ['Rusted', 'Bogiron', 'Dwarven', 'Elven', 'Mithril', 'Adamant', 'Runic', 'Dragonbone', 'Celestial'],
  wood: ['Driftwood', 'Gnarled', 'Heartoak', 'Silverbark', 'Ironwood', 'Elderwood', 'Ghostwood', 'Dragonwood', 'Worldroot'],
  cloth: ['Sackcloth', 'Homespun', 'Spidersilk', 'Mageweave', 'Runeweave', 'Moonsilk', 'Spellsilk', 'Voidweave', 'Starweave'],
  leather: ['Ratskin', 'Boarhide', 'Wolfhide', 'Owlbear', 'Drakehide', 'Shadowhide', 'Wyrmscale', 'Phoenixhide', 'Starhide'],
  tome: ['Tattered', 'Dog-eared', "Scholar's", 'Gilded', "Arcanist's", "Archmage's", 'Runebound', 'Astral', 'Celestial'],
} as const;

const tracked = (track: keyof typeof TRACKS, piece: string) => (t: number) => `${TRACKS[track][t - 1]} ${piece}`;

/** A new gem every 3 tiers, with a quality prefix inside each band. */
const GEMS = {
  Might: ['Ruby', 'Bloodstone', 'Magmaheart'],
  Finesse: ['Emerald', 'Windstone', 'Tempest Eye'],
  Mind: ['Sapphire', 'Moonstone', 'Astral Shard'],
  Vitality: ['Amber', 'Sunstone', 'Dawnheart'],
} as const;
const QUALITY = ['Rough', 'Cut', 'Flawless'] as const;
const gemName = (primary: keyof typeof GEMS, piece: string) => (t: number) =>
  `${QUALITY[(t - 1) % 3]} ${GEMS[primary][Math.floor((t - 1) / 3)]} ${piece}`;

// ------------------------------------------------------------------ bases

const pct = (stat: StatId, p: number): Implicit => ({ stat, value: p, curve: 'percent' });
const lin = (stat: StatId, v: number): Implicit => ({ stat, value: v, curve: 'linear' });

function weapon(
  id: number,
  family: string,
  track: keyof typeof TRACKS,
  w: WeaponTemplate,
  implicits: Implicit[] = []
): BaseDef {
  return { id, kind: 'weapon', family, slots: ['MainHand'], name: tracked(track, family), implicits, weapon: w };
}

const ARMOR_PIECES = {
  cloth: ['Hood', 'Robe', 'Gloves', 'Shoes'],
  leather: ['Cap', 'Vest', 'Bracers', 'Boots'],
  plate: ['Helm', 'Breastplate', 'Gauntlets', 'Greaves'],
} as const;
const ARMOR_SLOTS = ['Head', 'Chest', 'Hands', 'Feet'] as const;
/** Chest carries 40% of a weight's set budget, the other pieces 20%. */
const SHARE = [0.2, 0.4, 0.2, 0.2];

/** Full-set implicits per weight (docs/design/bases.md). */
const ARMOR_SETS: Record<keyof typeof ARMOR_PIECES, Implicit[]> = {
  cloth: [lin(Stat.Armor, 6), lin(Stat.Resistance, 30), pct(Stat.Mind, 40)],
  leather: [lin(Stat.Armor, 15), lin(Stat.Resistance, 15), lin(Stat.EvasionRating, 12), pct(Stat.Finesse, 40)],
  plate: [
    lin(Stat.Armor, 30),
    lin(Stat.Resistance, 6),
    pct(Stat.Vitality, 40),
    pct(Stat.ThreatPct, 20),
    { stat: Stat.AttackSpeedPct, value: -8, curve: 'fixed' },
  ],
};
const ARMOR_TRACK = { cloth: 'cloth', leather: 'leather', plate: 'metal' } as const;
const ARMOR_FIRST_ID = { cloth: 30, leather: 34, plate: 38 } as const;

function armorBases(): BaseDef[] {
  return (Object.keys(ARMOR_PIECES) as (keyof typeof ARMOR_PIECES)[]).flatMap(weight =>
    ARMOR_SLOTS.map((slot, i) => ({
      id: ARMOR_FIRST_ID[weight] + i,
      kind: 'armor' as const,
      family: `${weight[0].toUpperCase()}${weight.slice(1)} · ${slot}`,
      slots: [slot],
      name: tracked(ARMOR_TRACK[weight], ARMOR_PIECES[weight][i]),
      implicits: ARMOR_SETS[weight].map(imp => ({ ...imp, value: imp.value * SHARE[i] })),
    }))
  );
}

const PRIMARY_STAT = { Might: Stat.Might, Finesse: Stat.Finesse, Mind: Stat.Mind, Vitality: Stat.Vitality } as const;

function jewelryBases(): BaseDef[] {
  return (Object.keys(GEMS) as (keyof typeof GEMS)[]).flatMap((primary, i) => [
    {
      id: 50 + i,
      kind: 'jewelry' as const,
      family: `Ring · ${GEMS[primary][0]}`,
      slots: ['Ring1', 'Ring2'] as const,
      name: gemName(primary, 'Ring'),
      implicits: [pct(PRIMARY_STAT[primary], 20)],
    },
    {
      id: 54 + i,
      kind: 'jewelry' as const,
      family: `Amulet · ${GEMS[primary][0]}`,
      slots: ['Amulet'] as const,
      name: gemName(primary, 'Amulet'),
      implicits: [pct(PRIMARY_STAT[primary], 30)],
    },
  ]);
}

export const BASE_LIST: BaseDef[] = [
  weapon(1, 'Sword', 'metal', { damageType: 'Physical', hit: 10, speed: 1.0, baseCrit: 5, twoHanded: false }),
  weapon(2, 'Dagger', 'metal', { damageType: 'Physical', hit: 4.75, speed: 2.0, baseCrit: 8, twoHanded: false }, [pct(Stat.CritChancePct, 30)]),
  weapon(3, 'Mace', 'metal', { damageType: 'Physical', hit: 11.75, speed: 0.8, baseCrit: 5, twoHanded: false }, [pct(Stat.ArmorPenPct, 15)]),
  weapon(4, 'Scepter', 'metal', { damageType: 'Physical', hit: 7.5, speed: 0.8, baseCrit: 5, heal: 10, healTarget: 'Single', twoHanded: false }),
  weapon(5, 'Wand', 'wood', { damageType: 'Magic', hit: 6.25, speed: 1.5, baseCrit: 6, twoHanded: false }, [pct(Stat.MagicPenPct, 15)]),
  weapon(6, 'Katana', 'metal', { damageType: 'Physical', hit: 9.5, speed: 1.4, baseCrit: 10, twoHanded: true }, [pct(Stat.CritDamage, 40)]),
  weapon(7, 'Greatsword', 'metal', { damageType: 'Physical', hit: 23.75, speed: 0.55, baseCrit: 5, twoHanded: true }, [pct(Stat.ArmorPenPct, 25)]),
  weapon(8, 'Bow', 'wood', { damageType: 'Physical', hit: 13.25, speed: 1.0, baseCrit: 6, twoHanded: true }, [lin(Stat.EvasionRating, 1.5)]),
  weapon(9, 'Fire Staff', 'wood', { damageType: 'Magic', hit: 18.75, speed: 0.8, baseCrit: 5, twoHanded: true }),
  weapon(10, 'Healing Staff', 'wood', { damageType: 'Magic', hit: 5, speed: 1.0, baseCrit: 5, heal: 7.5, healTarget: 'All', twoHanded: true }),
  {
    id: 20,
    kind: 'offhand',
    family: 'Shield',
    slots: ['OffHand'],
    name: tracked('metal', 'Shield'),
    implicits: [lin(Stat.Armor, 8), { stat: Stat.MaxHp, value: 5, curve: 'life' }, pct(Stat.ThreatPct, 10)],
  },
  {
    id: 21,
    kind: 'offhand',
    family: 'Tome',
    slots: ['OffHand'],
    name: tracked('tome', 'Tome'),
    implicits: [pct(Stat.Mind, 30), pct(Stat.MagicDamagePct, 15)],
  },
  ...armorBases(),
  ...jewelryBases(),
];

/** Starter weapons a new character picks from (zone-content.md): sword, bow, wand, healing staff. */
export const STARTER_WEAPONS = [1, 8, 5, 10] as const;
/** Every new character also gets these, Common T1: Ratskin Vest and Ratskin Boots. */
export const STARTER_ARMOR = [35, 37] as const;

export const BASES: ReadonlyMap<number, BaseDef> = new Map(BASE_LIST.map(b => [b.id, b]));

export function base(id: number): BaseDef {
  const b = BASES.get(id);
  if (!b) throw new Error(`Unknown base ${id}`);
  return b;
}

// ------------------------------------------------------------------ values at a tier

/** An implicit's value at tier t, rounded like every item value (`roundStat`). */
export function implicitValue(imp: Implicit, t: number): number {
  return roundStat(imp.stat, imp.curve === 'fixed' ? imp.value : imp.value * curve(imp.curve, t));
}

export interface WeaponValues {
  damageType: DamageType;
  hit: number;
  speed: number;
  baseCrit: number;
  heal: number;
  healTarget?: HealTarget;
  twoHanded: boolean;
}

export function weaponValues(w: WeaponTemplate, t: number): WeaponValues {
  return {
    damageType: w.damageType,
    hit: wholeValue(w.hit * curve('offense', t)),
    speed: w.speed,
    baseCrit: w.baseCrit,
    heal: wholeValue((w.heal ?? 0) * curve('heal', t)),
    healTarget: w.healTarget,
    twoHanded: w.twoHanded,
  };
}

export function assertTier(t: number) {
  if (!Number.isInteger(t) || t < 1 || t > MAX_TIER) throw new Error(`Bad tier ${t}`);
}
