// Zones and enemies (docs/design/zones.md, zone-content.md). Pure data, shared.
//
// PERMANENT IDS: zone and enemy IDs are stored on characters (current zone and
// target) and in boss kills; never reuse or renumber them. Enemy IDs are
// zoneId × 100 + n, area IDs zoneId × 10 + n.
import type { MaterialKind } from './materials';
import { MIGHT_ACCURACY, accuracyAtLevel, dodgeChance } from './stats';

export type Defense = 'Balanced' | 'Armored' | 'Warded';

export interface EnemyDef {
  id: number;
  name: string;
  level: number;
  damageType: 'Physical' | 'Magic';
  defense: Defense;
  /** Attacks per second (presentation only; DPS decides the outcome). */
  speed: number;
  hp: number;
  dps: number;
  armor: number;
  resistance: number;
  xp: number;
  gold: number;
  /** Base IDs this enemy drops. Bosses drop every base of the zone. */
  drops: number[];
  /** Material kinds this enemy drops (1–3), of the zone's tier (data/materials.ts). Core only from magical creatures. */
  materials: MaterialKind[];
  boss?: boolean;
  /** Lives in a secret area (`AreaDef.secret`): fightable once that area is found. */
  secret?: boolean;
  /** × the chance of Rare and better drops (Unique included), on top of `rewardScale`. Default 1. */
  rareDropMult?: number;
  /**
   * Trait: evasion rating, dodging your attacks at `dodgeChance` against your accuracy (an
   * enemy's own accuracy is its level's). Paid for with HP (`effectiveHp`).
   */
  evasionRating?: number;
  /** Trait: HP the enemy heals per second in a fight. Paid for with HP (`effectiveHp`). */
  regen?: number;
}

/** An area on the zone's map (zones.md, "Zone map"). Every area can be fought in; it shows as ??? until visited. */
export interface AreaDef {
  id: number;
  name: string;
  blurb: string;
  /** Enemy IDs, weakest first. */
  enemies: number[];
  /**
   * A secret area: off the map until `hint` kills of `enemyId` (a rumour spot), found at
   * `kills`. Only then can its enemies be fought (zones.md, "Secret areas").
   */
  secret?: { enemyId: number; kills: number; hint: number; rumour: string };
  /** Position on the zone map's stage, % of its width and height (presentation only; the stage leaves room for labels). */
  x: number;
  y: number;
}

export interface ZoneDef {
  id: number;
  tier: number;
  name: string;
  blurb: string;
  enemies: EnemyDef[];
  /** Every enemy is in exactly one area; one is the boss's lair. */
  areas: AreaDef[];
  /** Paths drawn between areas on the map, as pairs of area IDs. */
  links: [number, number][];
}

/** Base walk time between fights, seconds (combat.ts `walkTime`). */
export const WALK_SECONDS = 5;

/** Tuning knobs for loot: every rarity's chance × DROP_RATE_MULT, Unique also × UNIQUE_RATE_MULT. */
export const DROP_RATE_MULT = 1.5;
export const UNIQUE_RATE_MULT = 5;

/** Per-kill drop chance by rarity before the multipliers. */
const BASE_DROP_CHANCE = {
  Common: 0.045,
  Magic: 0.0225,
  Rare: 0.0075,
  Epic: 0.0015,
  Legendary: 0.00015,
  Unique: 0.00003,
} as const;

/** Per-kill drop chance by rarity (zones.md). */
export const DROP_CHANCE = {
  Common: BASE_DROP_CHANCE.Common * DROP_RATE_MULT,
  Magic: BASE_DROP_CHANCE.Magic * DROP_RATE_MULT,
  Rare: BASE_DROP_CHANCE.Rare * DROP_RATE_MULT,
  Epic: BASE_DROP_CHANCE.Epic * DROP_RATE_MULT,
  Legendary: BASE_DROP_CHANCE.Legendary * DROP_RATE_MULT,
  Unique: BASE_DROP_CHANCE.Unique * DROP_RATE_MULT * UNIQUE_RATE_MULT,
} as const;

// Base IDs (bases.ts): weapons 1-11, shield 20, tome 21, greatshield 22, cloth 30-33, leather 34-37,
// plate 38-41 (head, chest, hands, feet), rings 50-53 and amulets 54-57
// (Might/Ruby, Finesse/Emerald, Mind/Sapphire, Vitality/Amber).
const T1_DROPS = {
  rat: [2, 5, 34, 33, 40, 51, 57],
  boar: [3, 8, 38, 37, 31, 20, 50],
  scout: [1, 6, 11, 36, 30, 56, 55],
  wisp: [9, 10, 21, 32, 52, 54],
  brute: [7, 4, 39, 41, 35, 22, 53],
};
const T2_DROPS = {
  spider: [2, 8, 32, 37, 38, 51, 56],
  cutthroat: [1, 6, 34, 35, 33, 50, 55],
  shaman: [5, 9, 21, 30, 31, 52],
  treant: [7, 10, 11, 39, 41, 20, 53],
  wolf: [3, 4, 36, 40, 22, 54, 57],
};
const T3_DROPS = {
  harpy: [8, 2, 36, 33, 38, 51, 54],
  kobold: [3, 7, 39, 37, 32, 20, 53],
  wraith: [5, 10, 21, 30, 56, 50],
  cultist: [9, 4, 31, 34, 22, 52, 57],
  golem: [1, 6, 11, 35, 40, 41, 55],
};
const T4_DROPS = {
  moth: [2, 5, 30, 32, 36, 22, 52],
  owlbear: [3, 8, 35, 38, 41, 53, 54],
  dryad: [9, 10, 11, 33, 34, 51],
  sentinel: [1, 7, 39, 37, 20, 50, 55],
  spellweaver: [4, 6, 21, 31, 40, 56, 57],
};
const all = (d: Record<string, number[]>) => Object.values(d).flat();

export const ZONES: ZoneDef[] = [
  {
    id: 1,
    tier: 1,
    name: 'Greenhollow',
    blurb: 'Farmland and woods at the edge of the starting village.',
    enemies: [
      { id: 101, name: 'Field Rat', level: 1, damageType: 'Physical', defense: 'Balanced', speed: 1.5, hp: 23, dps: 4.5, armor: 2.5, resistance: 2.5, xp: 7, gold: 2, drops: T1_DROPS.rat, materials: ['Hide', 'Reagent'] },
      { id: 102, name: 'Wild Boar', level: 4, damageType: 'Physical', defense: 'Armored', speed: 0.8, hp: 35, dps: 6.9, armor: 24, resistance: 4, xp: 10, gold: 3, drops: T1_DROPS.boar, materials: ['Hide', 'Wood'] },
      { id: 103, name: 'Goblin Scout', level: 7, damageType: 'Physical', defense: 'Balanced', speed: 1.2, hp: 53, dps: 10.5, armor: 17.5, resistance: 17.5, xp: 14, gold: 4, drops: T1_DROPS.scout, materials: ['Metal', 'Cloth'] },
      { id: 104, name: 'Bog Wisp', level: 10, damageType: 'Magic', defense: 'Warded', speed: 1.0, hp: 80, dps: 16, armor: 10, resistance: 60, xp: 20, gold: 5, drops: T1_DROPS.wisp, materials: ['Core', 'Reagent'] },
      { id: 105, name: 'Goblin Brute', level: 13, damageType: 'Physical', defense: 'Armored', speed: 0.7, hp: 101, dps: 20.2, armor: 78, resistance: 13, xp: 28, gold: 7, drops: T1_DROPS.brute, materials: ['Metal', 'Gem'] },
      { id: 106, name: 'Grubnak, Goblin Chief', level: 15, damageType: 'Physical', defense: 'Balanced', speed: 0.9, hp: 138, dps: 27.4, armor: 37.5, resistance: 37.5, xp: 44, gold: 11, drops: all(T1_DROPS), materials: ['Metal', 'Hide', 'Gem'], boss: true },
      // Secret (Sunken Chapel): a T2-strength enemy (Ironbark Treant's level, HP and DPS) hidden in T1,
      // magic damage behind armor. Pays far above T1: XP and gold past a strong T2 enemy, so
      // ~4.5× the drops (`rewardScale`), and Rare and better × 2.5 on top.
      { id: 107, name: 'Drowned Bellringer', level: 22, damageType: 'Magic', defense: 'Armored', speed: 0.6, hp: 261, dps: 31.1, armor: 132, resistance: 22, xp: 100, gold: 27, drops: [21, 5, 9, 33, 40, 52], materials: ['Core', 'Metal'], secret: true, rareDropMult: 2.5 },
    ],
    areas: [
      { id: 11, name: 'Village Fields', blurb: 'Trampled wheat and gnawed fences just past the last houses.', enemies: [101, 102], x: 8, y: 90 },
      { id: 12, name: 'Old Mill', blurb: 'A silent mill where the fields sink into bog.', enemies: [103, 104], x: 92, y: 64 },
      { id: 13, name: 'Goblin Camp', blurb: 'Palisades and cookfires hidden in the woods.', enemies: [105], x: 14, y: 30 },
      { id: 14, name: "Chieftain's Tent", blurb: 'Grubnak holds court among his stolen treasures.', enemies: [106], x: 86, y: 6 },
      { id: 15, name: 'Sunken Chapel', blurb: 'A chapel swallowed by the bog. Its bell still tolls for a drowned choir.', enemies: [107], x: 62, y: 96,
        secret: { enemyId: 104, kills: 1000, hint: 500, rumour: 'Bells ring somewhere beneath the bog water…' } },
    ],
    links: [[11, 12], [11, 13], [12, 13], [13, 14], [12, 15]],
  },
  {
    id: 2,
    tier: 2,
    name: 'Thornwood',
    blurb: 'A dark, overgrown forest where bandits and beasts hide.',
    enemies: [
      { id: 201, name: 'Thornback Spider', level: 16, damageType: 'Physical', defense: 'Balanced', speed: 1.5, hp: 147, dps: 17.5, armor: 40, resistance: 40, xp: 37, gold: 9, drops: T2_DROPS.spider, materials: ['Hide', 'Cloth', 'Reagent'] },
      { id: 202, name: 'Bandit Cutthroat', level: 18, damageType: 'Physical', defense: 'Balanced', speed: 1.3, hp: 178, dps: 21.2, armor: 45, resistance: 45, xp: 48, gold: 12, drops: T2_DROPS.cutthroat, materials: ['Metal', 'Cloth', 'Gem'] },
      { id: 203, name: 'Briar Shaman', level: 20, damageType: 'Magic', defense: 'Warded', speed: 0.9, hp: 216, dps: 25.7, armor: 20, resistance: 120, xp: 62, gold: 16, drops: T2_DROPS.shaman, materials: ['Core', 'Reagent'] },
      { id: 204, name: 'Ironbark Treant', level: 22, damageType: 'Physical', defense: 'Armored', speed: 0.6, hp: 261, dps: 31.1, armor: 132, resistance: 22, xp: 81, gold: 20, drops: T2_DROPS.treant, materials: ['Core', 'Wood'] },
      { id: 205, name: 'Dire Wolf', level: 24, damageType: 'Physical', defense: 'Balanced', speed: 1.4, hp: 316, dps: 37.6, armor: 60, resistance: 60, xp: 105, gold: 26, drops: T2_DROPS.wolf, materials: ['Hide', 'Reagent'] },
      { id: 206, name: 'Morgra, the Thorn Witch', level: 25, damageType: 'Magic', defense: 'Warded', speed: 0.8, hp: 463, dps: 50, armor: 25, resistance: 150, xp: 156, gold: 39, drops: all(T2_DROPS), materials: ['Core', 'Reagent', 'Gem'], boss: true },
    ],
    areas: [
      { id: 21, name: 'Webbed Road', blurb: 'The forest road, strung with webs and watched by bandits.', enemies: [201, 202], x: 50, y: 94 },
      { id: 22, name: 'Briar Grove', blurb: 'Ancient trees where shamans tend their thorns.', enemies: [203, 204], x: 6, y: 46 },
      { id: 23, name: 'Wolf Hollow', blurb: 'A den in the deep woods, littered with bones.', enemies: [205], x: 94, y: 52 },
      { id: 24, name: "Witch's Glade", blurb: "A ring of thorns around Morgra's hut.", enemies: [206], x: 50, y: 4 },
    ],
    links: [[21, 22], [21, 23], [22, 24], [23, 24]],
  },
  {
    id: 3,
    tier: 3,
    name: 'Frostmaw Pass',
    blurb: 'A snowbound mountain pass below an abandoned dwarven hold.',
    enemies: [
      { id: 301, name: 'Ice Harpy', level: 26, damageType: 'Physical', defense: 'Balanced', speed: 1.5, hp: 363, dps: 26.1, armor: 65, resistance: 65, xp: 107, gold: 27, drops: T3_DROPS.harpy, materials: ['Hide', 'Reagent'] },
      { id: 302, name: 'Kobold Tunneler', level: 28, damageType: 'Physical', defense: 'Armored', speed: 1.1, hp: 439, dps: 31.6, armor: 168, resistance: 28, xp: 139, gold: 35, drops: T3_DROPS.kobold, materials: ['Metal', 'Wood', 'Gem'] },
      { id: 303, name: 'Frost Wraith', level: 30, damageType: 'Magic', defense: 'Warded', speed: 1.0, hp: 531, dps: 38.3, armor: 30, resistance: 180, xp: 181, gold: 45, drops: T3_DROPS.wraith, materials: ['Core'] },
      { id: 304, name: 'Rimebound Cultist', level: 32, damageType: 'Magic', defense: 'Balanced', speed: 1.0, hp: 643, dps: 46.3, armor: 80, resistance: 80, xp: 235, gold: 59, drops: T3_DROPS.cultist, materials: ['Core', 'Cloth'] },
      { id: 305, name: 'Stone Golem', level: 34, damageType: 'Physical', defense: 'Armored', speed: 0.5, hp: 778, dps: 56, armor: 204, resistance: 34, xp: 305, gold: 76, drops: T3_DROPS.golem, materials: ['Metal', 'Core', 'Gem'] },
      { id: 306, name: 'Hrimvald, Frost Giant Jarl', level: 35, damageType: 'Physical', defense: 'Armored', speed: 0.6, hp: 1242, dps: 74.6, armor: 210, resistance: 35, xp: 452, gold: 113, drops: all(T3_DROPS), materials: ['Metal', 'Hide', 'Gem'], boss: true },
    ],
    areas: [
      { id: 31, name: 'Switchbacks', blurb: 'The trail climbs past harpy nests and kobold tunnels.', enemies: [301, 302], x: 10, y: 92 },
      { id: 32, name: 'Rime Shrine', blurb: 'A frozen shrine where cultists call up the cold dead.', enemies: [303, 304], x: 90, y: 66 },
      { id: 33, name: 'Dwarven Gate', blurb: 'The broken door of the old hold, guarded by stone.', enemies: [305], x: 14, y: 34 },
      { id: 34, name: "Jarl's Hall", blurb: "The giant's seat in the hold's great hall.", enemies: [306], x: 84, y: 4 },
    ],
    links: [[31, 32], [31, 33], [32, 34], [33, 34]],
  },
  {
    // First zone with the full boss HP bonus (bossHpFactor).
    id: 4,
    tier: 4,
    name: 'Moonveil Vale',
    blurb: 'A hidden elven valley of silver woods and moonlit ruins, under a moon gone dark.',
    enemies: [
      { id: 401, name: 'Moonmoth Swarm', level: 36, damageType: 'Magic', defense: 'Balanced', speed: 1.5, hp: 437, evasionRating: 211, dps: 39, armor: 90, resistance: 90, xp: 310, gold: 77, drops: T4_DROPS.moth, materials: ['Cloth', 'Reagent'] },
      { id: 402, name: 'Owlbear', level: 38, damageType: 'Physical', defense: 'Balanced', speed: 0.7, hp: 814, dps: 47.2, armor: 95, resistance: 95, xp: 403, gold: 101, drops: T4_DROPS.owlbear, materials: ['Hide', 'Reagent'] },
      { id: 403, name: 'Silverbark Dryad', level: 40, damageType: 'Magic', defense: 'Warded', speed: 0.9, hp: 735, regen: 25, dps: 57.1, armor: 40, resistance: 240, xp: 524, gold: 131, drops: T4_DROPS.dryad, materials: ['Core', 'Wood'] },
      { id: 404, name: 'Hollow Sentinel', level: 42, damageType: 'Physical', defense: 'Armored', speed: 0.6, hp: 1191, dps: 69.1, armor: 252, resistance: 42, xp: 680, gold: 170, drops: T4_DROPS.sentinel, materials: ['Metal', 'Core', 'Gem'] },
      { id: 405, name: 'Lunar Spellweaver', level: 44, damageType: 'Magic', defense: 'Balanced', speed: 1.0, hp: 1441, dps: 83.6, armor: 110, resistance: 110, xp: 884, gold: 221, drops: T4_DROPS.spellweaver, materials: ['Core', 'Cloth', 'Gem'] },
      { id: 406, name: 'Selvara, the Moonless Queen', level: 45, damageType: 'Magic', defense: 'Armored', speed: 0.8, hp: 2494, dps: 111.2, armor: 270, resistance: 45, xp: 1310, gold: 328, drops: all(T4_DROPS), materials: ['Gem'], boss: true },
      // Secret (Moonlight Garden): T5 strength (a T5 +2 enemy, about as tough as Selvara) hidden in T4.
      // Pays like the Bellringer: ~4.5× the drops (`rewardScale`), and Rare and better × 2.5 on top.
      { id: 407, name: 'Moonlit Champion', level: 52, damageType: 'Magic', defense: 'Balanced', speed: 0.5, hp: 2189, dps: 103, armor: 130, resistance: 130, xp: 2435, gold: 651, drops: [1, 7, 5, 31, 39, 56], materials: ['Core', 'Metal'], secret: true, rareDropMult: 2.5 },
    ],
    areas: [
      { id: 41, name: 'Silverbark Glade', blurb: "Pale trees glow under a moon that isn't there.", enemies: [401, 402], x: 10, y: 90 },
      { id: 42, name: 'Moonwell Ruins', blurb: 'Dry moonwells among fallen arches, still guarded.', enemies: [403, 404], x: 90, y: 62 },
      { id: 43, name: 'Starlit Conservatory', blurb: "A glass dome where the queen's mages still chant to the dark sky.", enemies: [405], x: 12, y: 32 },
      { id: 44, name: 'Moonless Throne', blurb: 'The queen waits on her throne beneath a black moon.', enemies: [406], x: 84, y: 6 },
      { id: 45, name: 'Moonlight Garden', blurb: "A hidden garden where the moon still shines, guarded by the queen's last knight.", enemies: [407], x: 52, y: 96,
        secret: { enemyId: 401, kills: 1000, hint: 500, rumour: "The moths all drift the same way at night, toward a light that isn't the moon…" } },
    ],
    links: [[41, 42], [41, 43], [42, 44], [43, 44], [41, 45]],
  },
];

export const ZONES_BY_ID: ReadonlyMap<number, ZoneDef> = new Map(ZONES.map(z => [z.id, z]));
export const ENEMIES_BY_ID: ReadonlyMap<number, { zone: ZoneDef; enemy: EnemyDef }> = new Map(
  ZONES.flatMap(zone => zone.enemies.map(enemy => [enemy.id, { zone, enemy }] as const))
);

/** Whether a secret area is found (or only rumoured), from lifetime kills by enemy ID. Areas that aren't secret are always found. */
export function secretState(area: AreaDef, kills: (enemyId: number) => number): 'found' | 'rumour' | 'hidden' {
  if (!area.secret) return 'found';
  const n = kills(area.secret.enemyId);
  return n >= area.secret.kills ? 'found' : n >= area.secret.hint ? 'rumour' : 'hidden';
}

/** The index of the area holding `enemy` in `zone.areas`. */
export const areaIndexOf = (zone: ZoneDef, enemyId: number) => zone.areas.findIndex(a => a.enemies.includes(enemyId));

/**
 * Enemy HP and DPS multiplier at `tier`, compounding: enemies outgrow the weapon curve by
 * × CLIMB_FACTOR a tier, so every tier is harder than the last and gear building matters
 * more the higher you go (zones.md, "Difficulty climb"). Content numbers are
 * precomputed; this documents the factor used.
 */
export const CLIMB_FACTOR = 1.05;
export const climb = (tier: number) => CLIMB_FACTOR ** (tier - 1);

/**
 * An enemy's HP and DPS against the zone's average-enemy curve at level offset `o`
 * (level − 10T; the boss counts as BOSS_OFFSET): × OFFSET_STEP a level from the weakest
 * enemy (OFFSET_ANCHOR), which stays where the old `1.08^o` put it, so every enemy above it
 * is harder and the order you fight them in matters (zones.md, "Level offsets"). T2 on;
 * T1 is the hand-tuned tutorial. Rewards climb the same way by OFFSET_REWARD_STEP.
 * Content numbers are precomputed; this documents the factors used.
 */
export const OFFSET_STEP = 1.1;
export const OFFSET_REWARD_STEP = 1.14;
export const OFFSET_ANCHOR = -4;
export const BOSS_OFFSET = 7;
export const offsetStats = (o: number) => 1.08 ** OFFSET_ANCHOR * OFFSET_STEP ** (o - OFFSET_ANCHOR);
export const offsetRewards = (o: number) => 1.12 ** OFFSET_ANCHOR * OFFSET_REWARD_STEP ** (o - OFFSET_ANCHOR);

/** The reference player's time to kill (zones.md, "Design targets"), which prices the regen trait. */
export const REFERENCE_KILL_SECONDS = 10;

/** Accuracy of a player of `level` with no accuracy gear: the level's, raised by the level's own Might. */
export const referenceAccuracy = (level: number) => accuracyAtLevel(level) * (1 + MIGHT_ACCURACY * level);

/**
 * An enemy's HP as the reference player feels it: evasion (against a same-level player's
 * `referenceAccuracy`) stretches it by 1 / (1 − dodge chance), regen adds what it heals over
 * a reference kill. Traits are paid for with HP, so this stays on the curve (zones.md,
 * "Enemy traits"); accuracy gear then beats the curve.
 */
export const effectiveHp = (e: EnemyDef): number =>
  e.hp / (1 - dodgeChance(e.evasionRating ?? 0, referenceAccuracy(e.level))) + (e.regen ?? 0) * REFERENCE_KILL_SECONDS;

/**
 * A boss's HP is × `bossHpFactor(tier)` on top of `1.08^7`, rewards unchanged: ramps from 1
 * at T1 to BOSS_HP_FACTOR at BOSS_HP_FROM_TIER and stays there, so from T4 the boss pays
 * less per hour than the zone's strongest enemies and they stay the farming targets
 * (zone-content.md, "Zone boss").
 */
export const BOSS_HP_FACTOR = 1.3;
export const BOSS_HP_FROM_TIER = 4;
export const bossHpFactor = (tier: number) =>
  1 + (BOSS_HP_FACTOR - 1) * Math.min(1, (tier - 1) / (BOSS_HP_FROM_TIER - 1));

export const STARTING_ZONE = 1;
export const STARTING_TARGET = 101;

/** The zone whose boss must be beaten to unlock `zone`, or undefined for the first zone. */
export function previousZone(zone: ZoneDef): ZoneDef | undefined {
  return ZONES.find(z => z.tier === zone.tier - 1);
}

/**
 * The enemy's reward multiplier `1.12^o` against the zone's average enemy
 * (XP 20 × 2.9^(T−1), zones.md). Scales drop chances like XP and gold.
 */
export function rewardScale(zone: ZoneDef, enemy: EnemyDef): number {
  return enemy.xp / (20 * 2.9 ** (zone.tier - 1));
}

export const bossOf = (zone: ZoneDef) => zone.enemies.find(e => e.boss);
