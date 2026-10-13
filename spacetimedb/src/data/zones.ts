// Zones and enemies (docs/design/zones.md, zone-content.md). Pure data, shared.
//
// PERMANENT IDS: zone and enemy IDs are stored on characters (current zone and
// target) and in boss kills; never reuse or renumber them. Enemy IDs are
// zoneId × 100 + n, area IDs zoneId × 10 + n.
import type { MaterialKind } from './materials';

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

// Base IDs (bases.ts): weapons 1-11, shield 20, tome 21, cloth 30-33, leather 34-37,
// plate 38-41 (head, chest, hands, feet), rings 50-53 and amulets 54-57
// (Might/Ruby, Finesse/Emerald, Mind/Sapphire, Vitality/Amber).
const T1_DROPS = {
  rat: [2, 5, 34, 33, 40, 51, 57],
  boar: [3, 8, 38, 37, 31, 20, 50],
  scout: [1, 6, 11, 36, 30, 56, 55],
  wisp: [9, 10, 21, 32, 52, 54],
  brute: [7, 4, 39, 41, 35, 53],
};
const T2_DROPS = {
  spider: [2, 8, 32, 37, 38, 51, 56],
  cutthroat: [1, 6, 34, 35, 33, 50, 55],
  shaman: [5, 9, 21, 30, 31, 52],
  treant: [7, 10, 11, 39, 41, 20, 53],
  wolf: [3, 4, 36, 40, 54, 57],
};
const T3_DROPS = {
  harpy: [8, 2, 36, 33, 38, 51, 54],
  kobold: [3, 7, 39, 37, 32, 20, 53],
  wraith: [5, 10, 21, 30, 56, 50],
  cultist: [9, 4, 31, 34, 52, 57],
  golem: [1, 6, 11, 35, 40, 41, 55],
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
      // Secret (Sunken Chapel): magic damage behind armor, a mix no other T1 enemy has.
      { id: 107, name: 'Drowned Bellringer', level: 12, damageType: 'Magic', defense: 'Armored', speed: 0.6, hp: 94, dps: 18.7, armor: 72, resistance: 12, xp: 30, gold: 8, drops: [21, 5, 9, 33, 40, 52], materials: ['Core', 'Metal'], secret: true },
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
      { id: 201, name: 'Thornback Spider', level: 16, damageType: 'Physical', defense: 'Balanced', speed: 1.5, hp: 140, dps: 16.7, armor: 40, resistance: 40, xp: 37, gold: 9, drops: T2_DROPS.spider, materials: ['Hide', 'Cloth', 'Reagent'] },
      { id: 202, name: 'Bandit Cutthroat', level: 18, damageType: 'Physical', defense: 'Balanced', speed: 1.3, hp: 164, dps: 19.5, armor: 45, resistance: 45, xp: 46, gold: 12, drops: T2_DROPS.cutthroat, materials: ['Metal', 'Cloth', 'Gem'] },
      { id: 203, name: 'Briar Shaman', level: 20, damageType: 'Magic', defense: 'Warded', speed: 0.9, hp: 191, dps: 22.7, armor: 20, resistance: 120, xp: 58, gold: 14, drops: T2_DROPS.shaman, materials: ['Core', 'Reagent'] },
      { id: 204, name: 'Ironbark Treant', level: 22, damageType: 'Physical', defense: 'Armored', speed: 0.6, hp: 223, dps: 26.5, armor: 132, resistance: 22, xp: 73, gold: 18, drops: T2_DROPS.treant, materials: ['Core', 'Wood'] },
      { id: 205, name: 'Dire Wolf', level: 24, damageType: 'Physical', defense: 'Balanced', speed: 1.4, hp: 260, dps: 30.9, armor: 60, resistance: 60, xp: 91, gold: 23, drops: T2_DROPS.wolf, materials: ['Hide', 'Reagent'] },
      { id: 206, name: 'Morgra, the Thorn Witch', level: 25, damageType: 'Magic', defense: 'Warded', speed: 0.8, hp: 328, dps: 38.9, armor: 25, resistance: 150, xp: 128, gold: 32, drops: all(T2_DROPS), materials: ['Core', 'Reagent', 'Gem'], boss: true },
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
    // Wall tier: HP and DPS × WALL_FACTOR (zones.md, "Difficulty rhythm").
    id: 3,
    tier: 3,
    name: 'Frostmaw Pass',
    blurb: 'A snowbound mountain pass below an abandoned dwarven hold.',
    enemies: [
      { id: 301, name: 'Ice Harpy', level: 26, damageType: 'Physical', defense: 'Balanced', speed: 1.5, hp: 362, dps: 26.1, armor: 65, resistance: 65, xp: 107, gold: 27, drops: T3_DROPS.harpy, materials: ['Hide', 'Reagent'] },
      { id: 302, name: 'Kobold Tunneler', level: 28, damageType: 'Physical', defense: 'Armored', speed: 1.1, hp: 422, dps: 30.4, armor: 168, resistance: 28, xp: 134, gold: 34, drops: T3_DROPS.kobold, materials: ['Metal', 'Wood', 'Gem'] },
      { id: 303, name: 'Frost Wraith', level: 30, damageType: 'Magic', defense: 'Warded', speed: 1.0, hp: 492, dps: 35.5, armor: 30, resistance: 180, xp: 168, gold: 42, drops: T3_DROPS.wraith, materials: ['Core'] },
      { id: 304, name: 'Rimebound Cultist', level: 32, damageType: 'Magic', defense: 'Balanced', speed: 1.0, hp: 574, dps: 41.4, armor: 80, resistance: 80, xp: 211, gold: 53, drops: T3_DROPS.cultist, materials: ['Core', 'Cloth'] },
      { id: 305, name: 'Stone Golem', level: 34, damageType: 'Physical', defense: 'Armored', speed: 0.5, hp: 670, dps: 48.3, armor: 204, resistance: 34, xp: 265, gold: 66, drops: T3_DROPS.golem, materials: ['Metal', 'Core', 'Gem'] },
      { id: 306, name: 'Hrimvald, Frost Giant Jarl', level: 35, damageType: 'Physical', defense: 'Armored', speed: 0.6, hp: 844, dps: 60.8, armor: 210, resistance: 35, xp: 372, gold: 93, drops: all(T3_DROPS), materials: ['Metal', 'Hide', 'Gem'], boss: true },
    ],
    areas: [
      { id: 31, name: 'Switchbacks', blurb: 'The trail climbs past harpy nests and kobold tunnels.', enemies: [301, 302], x: 10, y: 92 },
      { id: 32, name: 'Rime Shrine', blurb: 'A frozen shrine where cultists call up the cold dead.', enemies: [303, 304], x: 90, y: 66 },
      { id: 33, name: 'Dwarven Gate', blurb: 'The broken door of the old hold, guarded by stone.', enemies: [305], x: 14, y: 34 },
      { id: 34, name: "Jarl's Hall", blurb: "The giant's seat in the hold's great hall.", enemies: [306], x: 84, y: 4 },
    ],
    links: [[31, 32], [31, 33], [32, 34], [33, 34]],
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
 * Enemy HP and DPS multiplier on wall tiers: odd tiers from 3 (zones.md, "Difficulty
 * rhythm"). Steps into a wall tier (2→3, 4→5, …) are harder than the steps out of one.
 * Content numbers are precomputed; this documents the factor used.
 */
export const WALL_FACTOR = 1.1;
export const isWallTier = (tier: number) => tier >= 3 && tier % 2 === 1;

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
