// Zones and enemies (docs/design/zones.md, zone-content.md). Pure data, shared.
//
// PERMANENT IDS: zone and enemy IDs are stored on characters (current zone and
// target) and in boss kills; never reuse or renumber them. Enemy IDs are
// zoneId × 100 + n.

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
  boss?: boolean;
}

export interface ZoneDef {
  id: number;
  tier: number;
  name: string;
  blurb: string;
  enemies: EnemyDef[];
}

/** Respawn time between fights, seconds. */
export const RESPAWN_SECONDS = 5;

/** Per-kill drop chance by rarity (zones.md). */
export const DROP_CHANCE = {
  Common: 0.03,
  Magic: 0.015,
  Rare: 0.005,
  Epic: 0.001,
  Legendary: 0.0001,
  Unique: 0.00002,
} as const;

// Base IDs (bases.ts): weapons 1-10, shield 20, tome 21, cloth 30-33, leather 34-37,
// plate 38-41 (head, chest, hands, feet), rings 50-53 and amulets 54-57
// (Might/Ruby, Finesse/Emerald, Mind/Sapphire, Vitality/Amber).
const T1_DROPS = {
  rat: [2, 5, 34, 33, 40, 51, 57],
  boar: [3, 8, 38, 37, 31, 20, 50],
  scout: [1, 6, 36, 30, 56, 55],
  wisp: [9, 10, 21, 32, 52, 54],
  brute: [7, 4, 39, 41, 35, 53],
};
const T2_DROPS = {
  spider: [2, 8, 32, 37, 38, 51, 56],
  cutthroat: [1, 6, 34, 35, 33, 50, 55],
  shaman: [5, 9, 21, 30, 31, 52],
  treant: [7, 10, 39, 41, 20, 53],
  wolf: [3, 4, 36, 40, 54, 57],
};
const all = (d: Record<string, number[]>) => Object.values(d).flat();

export const ZONES: ZoneDef[] = [
  {
    id: 1,
    tier: 1,
    name: 'Greenhollow',
    blurb: 'Farmland and woods at the edge of the starting village.',
    enemies: [
      { id: 101, name: 'Field Rat', level: 1, damageType: 'Physical', defense: 'Balanced', speed: 1.5, hp: 23, dps: 4.5, armor: 2.5, resistance: 2.5, xp: 7, gold: 2, drops: T1_DROPS.rat },
      { id: 102, name: 'Wild Boar', level: 4, damageType: 'Physical', defense: 'Armored', speed: 0.8, hp: 35, dps: 6.9, armor: 24, resistance: 4, xp: 10, gold: 3, drops: T1_DROPS.boar },
      { id: 103, name: 'Goblin Scout', level: 7, damageType: 'Physical', defense: 'Balanced', speed: 1.2, hp: 53, dps: 10.5, armor: 17.5, resistance: 17.5, xp: 14, gold: 4, drops: T1_DROPS.scout },
      { id: 104, name: 'Bog Wisp', level: 10, damageType: 'Magic', defense: 'Warded', speed: 1.0, hp: 80, dps: 16, armor: 10, resistance: 60, xp: 20, gold: 5, drops: T1_DROPS.wisp },
      { id: 105, name: 'Goblin Brute', level: 13, damageType: 'Physical', defense: 'Armored', speed: 0.7, hp: 101, dps: 20.2, armor: 78, resistance: 13, xp: 28, gold: 7, drops: T1_DROPS.brute },
      { id: 106, name: 'Grubnak, Goblin Chief', level: 15, damageType: 'Physical', defense: 'Balanced', speed: 0.9, hp: 138, dps: 27.4, armor: 37.5, resistance: 37.5, xp: 44, gold: 11, drops: all(T1_DROPS), boss: true },
    ],
  },
  {
    id: 2,
    tier: 2,
    name: 'Thornwood',
    blurb: 'A dark, overgrown forest where bandits and beasts hide.',
    enemies: [
      { id: 201, name: 'Thornback Spider', level: 16, damageType: 'Physical', defense: 'Balanced', speed: 1.5, hp: 140, dps: 16.7, armor: 40, resistance: 40, xp: 37, gold: 9, drops: T2_DROPS.spider },
      { id: 202, name: 'Bandit Cutthroat', level: 18, damageType: 'Physical', defense: 'Balanced', speed: 1.3, hp: 164, dps: 19.5, armor: 45, resistance: 45, xp: 46, gold: 12, drops: T2_DROPS.cutthroat },
      { id: 203, name: 'Briar Shaman', level: 20, damageType: 'Magic', defense: 'Warded', speed: 0.9, hp: 191, dps: 22.7, armor: 20, resistance: 120, xp: 58, gold: 14, drops: T2_DROPS.shaman },
      { id: 204, name: 'Ironbark Treant', level: 22, damageType: 'Physical', defense: 'Armored', speed: 0.6, hp: 223, dps: 26.5, armor: 132, resistance: 22, xp: 73, gold: 18, drops: T2_DROPS.treant },
      { id: 205, name: 'Dire Wolf', level: 24, damageType: 'Physical', defense: 'Balanced', speed: 1.4, hp: 260, dps: 30.9, armor: 60, resistance: 60, xp: 91, gold: 23, drops: T2_DROPS.wolf },
      { id: 206, name: 'Morgra, the Thorn Witch', level: 25, damageType: 'Magic', defense: 'Warded', speed: 0.8, hp: 328, dps: 38.9, armor: 25, resistance: 150, xp: 128, gold: 32, drops: all(T2_DROPS), boss: true },
    ],
  },
];

export const ZONES_BY_ID: ReadonlyMap<number, ZoneDef> = new Map(ZONES.map(z => [z.id, z]));
export const ENEMIES_BY_ID: ReadonlyMap<number, { zone: ZoneDef; enemy: EnemyDef }> = new Map(
  ZONES.flatMap(zone => zone.enemies.map(enemy => [enemy.id, { zone, enemy }] as const))
);

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
