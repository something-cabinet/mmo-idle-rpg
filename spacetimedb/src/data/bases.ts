// Item types and bases (docs/design/bases.md). Pure data, shared by server and client.
//
// A type is a category (Sword, Plate · Chest): slot, glyph, legendary group, loot-filter
// entry. A base is a variant of a type with its own name and stats. An item is
// (base, tier). Every type has a core base with the same ID that drops in every zone;
// any other base of the type (a variant) has a source instead, e.g. a raid.
//
// PERMANENT IDS: base IDs are stored on items and in loot tables, type IDs in loot
// filters; never reuse or renumber them. Names and templates may change (they only
// affect new drops).

import type { LegendaryGroup } from './legendary';
import { MAX_TIER, Stat, curve, roundStat, wholeValue, type Curve, type StatId } from './stats';

/** Equipment slots, in loadout order. Stored as indexes: never reorder. */
export const SLOTS = ['MainHand', 'OffHand', 'Head', 'Chest', 'Hands', 'Feet', 'Ring1', 'Ring2', 'Amulet'] as const;
export type Slot = (typeof SLOTS)[number];
export const SLOT_COUNT = SLOTS.length;

export type DamageType = 'Physical' | 'Magic';
/** What a weapon's hit deals: one damage type, or Split, half physical and half magic (bases.md). */
export type WeaponDamage = DamageType | 'Split';
export type HealTarget = 'Single' | 'All';
export type BaseKind = 'weapon' | 'offhand' | 'armor' | 'jewelry';

/** A stat given by the base itself. `value` is T1 for flat curves, T9 (P) for 'percent'; `fixed` ignores tier. */
export interface Implicit {
  stat: StatId;
  value: number;
  curve: Curve | 'fixed';
}

export interface WeaponTemplate {
  damageType: WeaponDamage;
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
  /** Attacks from a distance (bows, wands, staves); melee otherwise. */
  ranged: boolean;
}

export interface TypeDef {
  id: number;
  kind: BaseKind;
  /** Display name, e.g. "Sword", "Plate · Chest". */
  name: string;
  slots: readonly Slot[];
  /** Item glyph: src/ui/Icon.tsx `i-<icon>`, shown when the item has no art (src/ui/itemArt.tsx). */
  icon: string;
  /** The legendary group its items roll from (legendary.md). */
  group: LegendaryGroup;
}

export interface BaseDef {
  id: number;
  /** Its type (`TYPES`); kind and slots are the type's, and family too apart from jewelry variants. */
  typeId: number;
  kind: BaseKind;
  /** The type's name, e.g. "Sword", "Plate · Chest". */
  family: string;
  slots: readonly Slot[];
  /** Name for tier t (1..9). */
  name: (t: number) => string;
  implicits: Implicit[];
  weapon?: WeaponTemplate;
  /** Drops only from this raid (data/raids.ts), at the raid's tier; never from zone enemies. */
  raidId?: number;
}

// ------------------------------------------------------------------ names

/** Tier name tracks: T1–T2 sound cheap, T3 solid, T4 a little fancy, T5+ legendary materials. */
export const TRACKS = {
  metal: ['Rusted', 'Bogiron', 'Dwarven', 'Elven', 'Brightsteel', 'Verdite', 'Runic', 'Dragonbone', 'Celestial'],
  wood: ['Driftwood', 'Gnarled', 'Heartoak', 'Silverbark', 'Ironwood', 'Elderwood', 'Ghostwood', 'Dragonwood', 'Worldroot'],
  cloth: ['Sackcloth', 'Homespun', 'Spidersilk', 'Mageweave', 'Runeweave', 'Moonsilk', 'Spellsilk', 'Voidweave', 'Starweave'],
  leather: ['Ratskin', 'Boarhide', 'Wolfhide', 'Owlbear', 'Drakehide', 'Shadowhide', 'Wyrmscale', 'Phoenixhide', 'Starhide'],
  tome: ['Tattered', 'Dog-eared', "Scholar's", 'Gilded', "Arcanist's", "Archmage's", 'Runebound', 'Astral', 'Celestial'],
} as const;

const tracked = (track: keyof typeof TRACKS, piece: string) => (t: number) => `${TRACKS[track][t - 1]} ${piece}`;

/** A new gem every 3 tiers, with a quality prefix inside each band. */
export const GEMS = {
  Might: ['Ruby', 'Bloodstone', 'Magmaheart'],
  Finesse: ['Emerald', 'Windstone', 'Tempest Eye'],
  Mind: ['Sapphire', 'Moonstone', 'Astral Shard'],
  Vitality: ['Amber', 'Sunstone', 'Dawnheart'],
} as const;
export const QUALITY = ['Rough', 'Cut', 'Flawless'] as const;
const gemName = (primary: keyof typeof GEMS, piece: string) => (t: number) =>
  `${QUALITY[(t - 1) % 3]} ${GEMS[primary][Math.floor((t - 1) / 3)]} ${piece}`;

// ------------------------------------------------------------------ bases

const pct = (stat: StatId, p: number): Implicit => ({ stat, value: p, curve: 'percent' });
const lin = (stat: StatId, v: number): Implicit => ({ stat, value: v, curve: 'linear' });

/** A type and its core base in one: the core base takes the type's ID. */
type CoreDef = Omit<BaseDef, 'typeId'> & { icon?: string; group?: LegendaryGroup };

const KIND_GROUP: Record<BaseKind, LegendaryGroup> = { weapon: 'Offense', offhand: 'Offense', armor: 'Defense', jewelry: 'Utility' };

function weapon(
  id: number,
  family: string,
  track: keyof typeof TRACKS,
  w: WeaponTemplate,
  implicits: Implicit[] = []
): CoreDef {
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
    pct(Stat.ThreatPct, 25),
    { stat: Stat.AttackSpeedPct, value: -8, curve: 'fixed' },
  ],
};
const ARMOR_TRACK = { cloth: 'cloth', leather: 'leather', plate: 'metal' } as const;
const ARMOR_FIRST_ID = { cloth: 30, leather: 34, plate: 38 } as const;

function armorBases(): CoreDef[] {
  return (Object.keys(ARMOR_PIECES) as (keyof typeof ARMOR_PIECES)[]).flatMap(weight =>
    ARMOR_SLOTS.map((slot, i) => ({
      id: ARMOR_FIRST_ID[weight] + i,
      kind: 'armor' as const,
      family: `${weight[0].toUpperCase()}${weight.slice(1)} · ${slot}`,
      slots: [slot],
      name: tracked(ARMOR_TRACK[weight], ARMOR_PIECES[weight][i]),
      icon: slot.toLowerCase(),
      implicits: ARMOR_SETS[weight].map(imp => ({ ...imp, value: imp.value * SHARE[i] })),
    }))
  );
}

const PRIMARY_STAT = { Might: Stat.Might, Finesse: Stat.Finesse, Mind: Stat.Mind, Vitality: Stat.Vitality } as const;

function jewelryBases(): CoreDef[] {
  return (Object.keys(GEMS) as (keyof typeof GEMS)[]).flatMap((primary, i) => [
    {
      id: 50 + i,
      kind: 'jewelry' as const,
      family: `Ring · ${GEMS[primary][0]}`,
      slots: ['Ring1', 'Ring2'] as const,
      name: gemName(primary, 'Ring'),
      icon: 'ring',
      implicits: [pct(PRIMARY_STAT[primary], 20)],
    },
    {
      id: 54 + i,
      kind: 'jewelry' as const,
      family: `Amulet · ${GEMS[primary][0]}`,
      slots: ['Amulet'] as const,
      name: gemName(primary, 'Amulet'),
      icon: 'amulet',
      implicits: [pct(PRIMARY_STAT[primary], 30)],
    },
  ]);
}

const CORE: CoreDef[] = [
  weapon(1, 'Sword', 'metal', { damageType: 'Physical', hit: 10, speed: 1.0, baseCrit: 5, twoHanded: false, ranged: false }, [pct(Stat.Might, 60)]),
  weapon(2, 'Dagger', 'metal', { damageType: 'Physical', hit: 4.75, speed: 2.0, baseCrit: 8, twoHanded: false, ranged: false }, [pct(Stat.CritChancePct, 30)]),
  weapon(3, 'Mace', 'metal', { damageType: 'Physical', hit: 11.75, speed: 0.8, baseCrit: 5, twoHanded: false, ranged: false }, [pct(Stat.ArmorPenPct, 15)]),
  weapon(4, 'Scepter', 'metal', { damageType: 'Physical', hit: 7.5, speed: 0.8, baseCrit: 5, heal: 10, healTarget: 'Single', twoHanded: false, ranged: false }),
  weapon(5, 'Wand', 'wood', { damageType: 'Magic', hit: 6.25, speed: 1.5, baseCrit: 6, twoHanded: false, ranged: true }, [pct(Stat.MagicPenPct, 15)]),
  weapon(6, 'Katana', 'metal', { damageType: 'Physical', hit: 9.5, speed: 1.4, baseCrit: 10, twoHanded: true, ranged: false }, [pct(Stat.CritDamage, 40)]),
  weapon(7, 'Greatsword', 'metal', { damageType: 'Physical', hit: 23.75, speed: 0.55, baseCrit: 5, twoHanded: true, ranged: false }, [pct(Stat.ArmorPenPct, 25)]),
  weapon(8, 'Bow', 'wood', { damageType: 'Physical', hit: 13.25, speed: 1.0, baseCrit: 6, twoHanded: true, ranged: true }, [lin(Stat.EvasionRating, 1.5)]),
  weapon(11, 'Crossbow', 'wood', { damageType: 'Physical', hit: 18, speed: 0.7, baseCrit: 12, twoHanded: true, ranged: true }, [pct(Stat.CritDamage, 40), lin(Stat.Accuracy, 10)]),
  weapon(9, 'Fire Staff', 'wood', { damageType: 'Magic', hit: 18.75, speed: 0.8, baseCrit: 5, twoHanded: true, ranged: true }),
  weapon(10, 'Healing Staff', 'wood', { damageType: 'Magic', hit: 5, speed: 1.0, baseCrit: 5, heal: 7.5, healTarget: 'All', twoHanded: true, ranged: true }),
  {
    id: 20,
    kind: 'offhand',
    family: 'Shield',
    slots: ['OffHand'],
    name: tracked('metal', 'Shield'),
    group: 'Defense',
    implicits: [lin(Stat.Armor, 8), { stat: Stat.MaxHp, value: 5, curve: 'life' }, pct(Stat.ThreatPct, 15)],
  },
  {
    id: 22,
    kind: 'offhand',
    family: 'Greatshield',
    slots: ['OffHand'],
    name: tracked('metal', 'Greatshield'),
    group: 'Defense',
    implicits: [
      lin(Stat.Armor, 10),
      { stat: Stat.MaxHp, value: 7, curve: 'life' },
      pct(Stat.ThreatPct, 25),
      { stat: Stat.AttackSpeedPct, value: -10, curve: 'fixed' },
    ],
  },
  {
    id: 21,
    kind: 'offhand',
    family: 'Tome',
    slots: ['OffHand'],
    name: tracked('tome', 'Tome'),
    implicits: [pct(Stat.Mind, 30), pct(Stat.MagicDamagePct, 15)],
  },
  // The Tome's counterparts for physical builds: a primary attribute and something it wants.
  {
    id: 23,
    kind: 'offhand',
    family: 'War Horn',
    slots: ['OffHand'],
    name: tracked('metal', 'War Horn'),
    implicits: [pct(Stat.Might, 30), pct(Stat.AttackSpeedPct, 12)],
  },
  {
    id: 24,
    kind: 'offhand',
    family: 'Main Gauche',
    slots: ['OffHand'],
    name: tracked('metal', 'Main Gauche'),
    implicits: [pct(Stat.Finesse, 30), lin(Stat.EvasionRating, 6)],
  },
  ...armorBases(),
  ...jewelryBases(),
];

export const TYPE_LIST: TypeDef[] = CORE.map(c => ({
  id: c.id,
  kind: c.kind,
  name: c.family,
  slots: c.slots,
  icon: c.icon ?? c.family.toLowerCase().replace(/ /g, '-'),
  group: c.group ?? KIND_GROUP[c.kind],
}));
export const TYPES: ReadonlyMap<number, TypeDef> = new Map(TYPE_LIST.map(t => [t.id, t]));

/**
 * A variant family: the type's name, but a jewelry variant drops the gem ("Ring · Amber" → "Ring"),
 * since it trades away the gem's primary stat.
 */
export const variantFamily = (t: TypeDef) => (t.kind === 'jewelry' ? t.name.split(' · ')[0] : t.name);

/** A variant of type `typeId`: kind and slots copy the type's, family per `variantFamily`. */
function variant(id: number, typeId: number, v: Pick<BaseDef, 'name' | 'implicits' | 'weapon' | 'raidId'>): BaseDef {
  const t = TYPES.get(typeId)!;
  return { id, typeId, kind: t.kind, family: variantFamily(t), slots: t.slots, ...v };
}

/**
 * Variants: bases of an existing type with their own name and stats, never dropped in
 * zones, so each needs a source (`raidId`). IDs from 1000.
 */
const VARIANTS: BaseDef[] = [
  // Wyrm Hollow (raid 1, T3): a dagger from one of the Rime Wyrm's teeth. Its frost cuts as magic: quick, frost-hardened.
  // Raid variants are named Rime <type>, apart from the Wyrmscale leather track and the Wyrmscale Aegis.
  variant(1000, 2, {
    name: () => 'Rime Dagger',
    weapon: { damageType: 'Magic', hit: 4.75, speed: 2.2, baseCrit: 5, twoHanded: false, ranged: false },
    implicits: [lin(Stat.Resistance, 4)],
    raidId: 1,
  }),
  // Wyrm Hollow's other variants: each trades something of its type for resistance against the Frost Breath.
  // Less damage and no armor pen, for Vitality.
  variant(1001, 7, {
    name: () => 'Rime Greatsword',
    weapon: { damageType: 'Physical', hit: 20, speed: 0.6, baseCrit: 5, twoHanded: true, ranged: false },
    implicits: [pct(Stat.Vitality, 40), lin(Stat.Resistance, 4)],
    raidId: 1,
  }),
  // Heals one ally, harder and a little faster, instead of all.
  variant(1002, 10, {
    name: () => 'Rime Healing Staff',
    weapon: { damageType: 'Magic', hit: 5, speed: 1.1, baseCrit: 5, heal: 11.25, healTarget: 'Single', twoHanded: true, ranged: true },
    implicits: [lin(Stat.Resistance, 4)],
    raidId: 1,
  }),
  // Magic arrows: good against armor, poor against wards; no evasion.
  variant(1003, 8, {
    name: () => 'Rime Bow',
    weapon: { damageType: 'Magic', hit: 12.5, speed: 1.0, baseCrit: 6, twoHanded: true, ranged: true },
    implicits: [lin(Stat.Resistance, 4)],
    raidId: 1,
  }),
  // Half the armor, moved to resistance; same HP and threat.
  variant(1004, 20, {
    name: () => 'Rime Shield',
    implicits: [lin(Stat.Armor, 4), lin(Stat.Resistance, 8), { stat: Stat.MaxHp, value: 5, curve: 'life' }, pct(Stat.ThreatPct, 15)],
    raidId: 1,
  }),
  // An Amber ring with resistance instead of Vitality.
  variant(1005, 53, {
    name: () => 'Rime Ring',
    implicits: [pct(Stat.ResistancePct, 20)],
    raidId: 1,
  }),
  // A Sapphire amulet with magic damage and resistance instead of Mind.
  variant(1006, 56, {
    name: () => 'Rime Amulet',
    implicits: [pct(Stat.MagicDamagePct, 20), pct(Stat.ResistancePct, 20)],
    raidId: 1,
  }),
  // The Drowned Moon (raid 2, T4): named Umbral <type>, half silver and half void like Umbriel.
  // The weapons are their type with a Split hit (half physical, half magic): half of every swing lands on
  // the soft side of either Lunar Phase, but against a one-weakness enemy half always lands on its strong side.
  // Each is also a little quicker (+0.1 attacks/s) and adds accuracy (15T; the crossbow 25T instead of 10T).
  variant(1007, 6, {
    name: () => 'Umbral Katana',
    weapon: { damageType: 'Split', hit: 9.5, speed: 1.5, baseCrit: 10, twoHanded: true, ranged: false },
    implicits: [pct(Stat.CritDamage, 40), lin(Stat.Accuracy, 15)],
    raidId: 2,
  }),
  variant(1008, 9, {
    name: () => 'Umbral Fire Staff',
    weapon: { damageType: 'Split', hit: 18.75, speed: 0.9, baseCrit: 5, twoHanded: true, ranged: true },
    implicits: [lin(Stat.Accuracy, 15), pct(Stat.Mind, 15)],
    raidId: 2,
  }),
  // The scepter trades heal for damage: T4 hit 64 (32 + 32), heal 16.
  variant(1009, 4, {
    name: () => 'Umbral Scepter',
    weapon: { damageType: 'Split', hit: 9.1, speed: 0.9, baseCrit: 5, heal: 6.8, healTarget: 'Single', twoHanded: false, ranged: false },
    implicits: [lin(Stat.Accuracy, 15)],
    raidId: 2,
  }),
  variant(1010, 11, {
    name: () => 'Umbral Crossbow',
    weapon: { damageType: 'Split', hit: 18, speed: 0.8, baseCrit: 12, twoHanded: true, ranged: true },
    implicits: [pct(Stat.CritDamage, 40), lin(Stat.Accuracy, 25)],
    raidId: 2,
  }),
  // The armor split evenly with resistance; same HP, threat and attack speed cost.
  variant(1011, 22, {
    name: () => 'Umbral Greatshield',
    implicits: [
      lin(Stat.Armor, 6),
      lin(Stat.Resistance, 6),
      { stat: Stat.MaxHp, value: 7, curve: 'life' },
      pct(Stat.ThreatPct, 25),
      { stat: Stat.AttackSpeedPct, value: -10, curve: 'fixed' },
    ],
    raidId: 2,
  }),
  // An Amber ring with armor and resistance instead of Vitality.
  variant(1012, 53, {
    name: () => 'Umbral Ring',
    implicits: [pct(Stat.ArmorPct, 10), pct(Stat.ResistancePct, 10)],
    raidId: 2,
  }),
  // A Ruby amulet with both damage types instead of Might: made for a Split weapon.
  variant(1013, 54, {
    name: () => 'Umbral Amulet',
    implicits: [pct(Stat.PhysDamagePct, 15), pct(Stat.MagicDamagePct, 15)],
    raidId: 2,
  }),
];

export const BASE_LIST: BaseDef[] = [...CORE.map(({ icon: _icon, group: _group, ...c }) => ({ ...c, typeId: c.id })), ...VARIANTS];

/** Starter weapons a new character picks from (zone-content.md): sword, bow, wand, healing staff. */
export const STARTER_WEAPONS = [1, 8, 5, 10] as const;
/** Every new character also gets these, Common T1: Ratskin Vest and Ratskin Boots. */
export const STARTER_ARMOR = [35, 37] as const;

/** Bases that drop from zone enemies: the core bases, one per type. */
export const ZONE_BASES = BASE_LIST.filter(b => b.id === b.typeId);

export const BASES: ReadonlyMap<number, BaseDef> = new Map(BASE_LIST.map(b => [b.id, b]));

export function base(id: number): BaseDef {
  const b = BASES.get(id);
  if (!b) throw new Error(`Unknown base ${id}`);
  return b;
}

/** The type of base `baseId`. */
export function baseType(baseId: number): TypeDef {
  return TYPES.get(base(baseId).typeId)!;
}

// ------------------------------------------------------------------ values at a tier

/** An implicit's value at tier t, rounded like every item value (`roundStat`). */
export function implicitValue(imp: Implicit, t: number): number {
  return roundStat(imp.stat, imp.curve === 'fixed' ? imp.value : imp.value * curve(imp.curve, t));
}

export interface WeaponValues {
  damageType: WeaponDamage;
  hit: number;
  speed: number;
  baseCrit: number;
  heal: number;
  healTarget?: HealTarget;
  twoHanded: boolean;
  ranged: boolean;
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
    ranged: w.ranged,
  };
}

export function assertTier(t: number) {
  if (!Number.isInteger(t) || t < 1 || t > MAX_TIER) throw new Error(`Bad tier ${t}`);
}
