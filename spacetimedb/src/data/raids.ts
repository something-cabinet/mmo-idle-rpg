// Raid bosses (docs/design/raids.md). Pure data, shared.
//
// PERMANENT IDS: raid IDs are stored on raid parties and raid logs, and bind the
// raid's own uniques (data/uniques.ts `raidId`). Raid boss enemy IDs are 9000 + raid
// ID, outside the zones' zoneId × 100 + n, so `setTarget` never finds them.
import { BASE_LIST, ZONE_BASES } from './bases';
import type { EnemyDef } from './zones';

/**
 * The reference sheet of an average player ready for a raid (raids.md): what a hired NPC
 * is measured against. Damage is per second before mitigation and crits. No heal: hired
 * NPCs fight, they don't heal (an averaged party-wide heal made them better than players).
 */
export interface ReferencePlayer {
  level: number;
  maxHp: number;
  regen: number;
  armor: number;
  resistance: number;
  evasionRating: number;
  threat: number;
  attacksPerSec: number;
  physicalPerSec: number;
  magicPerSec: number;
  critChance: number;
  critMult: number;
  armorPen: number;
  magicPen: number;
}

/** One face of a raid boss with Lunar Phases (`RaidDef.phases`): its defenses and the damage of its attacks. */
export interface RaidPhase {
  name: string;
  armor: number;
  resistance: number;
  defense: EnemyDef['defense'];
  damageType: 'Physical' | 'Magic';
}

export interface RaidDef {
  id: number;
  name: string;
  blurb: string;
  /** Gear tier of its drops. */
  tier: number;
  /** Open to characters who have killed this zone's boss. */
  unlockZoneId: number;
  /** Its `drops` are the bases its Epic and Legendary drops pick from. XP and gold are per kill. */
  boss: EnemyDef;
  /**
   * Every `every` seconds the boss hits every living fighter for `damage` (before their mitigation), or with
   * `split`, `damage` shared evenly by the living. It can't be dodged. `icon` names its UI icon.
   */
  aoe: { every: number; damage: number; damageType: 'Physical' | 'Magic'; name: string; icon: string; split?: boolean };
  /**
   * Lunar Phases: the boss cycles through `list` from the first, `every` seconds each, and takes each phase's
   * defenses and damage type in turn (its `boss` stats are the first phase's).
   */
  phases?: { every: number; list: RaidPhase[] };
  /** The boss enrages after this many seconds: the party wipes. */
  enrageSeconds: number;
  /** Rewarded kills (clears) per character per day (raid.ts `lockoutStart`); losses don't count. */
  clearsPerDay: number;
  /** Chance an Epic or Legendary item is one of the raid's own bases (variants) instead of a zone base. */
  ownBaseShare: number;
  /** Items per rewarded kill, each rolled on its own (`RAID_RARITY_ODDS`). */
  itemsPerClear: number;
  /** Raid tokens per rewarded kill. */
  tokens: number;
  /** Voidglass per rewarded kill (phials.md). */
  voidglass: number;
  /** Gold per hired NPC seat, paid by the leader at the start. */
  hireCost: number;
  /** The average player for this raid; a hired NPC has NPC_POWER × it, whoever is in the party. */
  reference: ReferencePlayer;
}

/** Seats in a raid party: players plus hired NPCs. */
export const RAID_PARTY_SIZE = 4;
/** A hired NPC has this × the raid's reference player (`RaidDef.reference`). */
export const NPC_POWER = 0.5;
/**
 * How strongly threat draws the boss: each attack picks a living fighter with weight
 * e^(THREAT_FOCUS × threat), so more threat means more of the attacks, never all of them.
 */
export const THREAT_FOCUS = 5;
/** Rarity odds of a raid kill's item (the Unique comes from the raid's own pool). */
export const RAID_RARITY_ODDS = { Epic: 0.75, Legendary: 0.22, Unique: 0.03 } as const;

// Every zone base plus the raid's own: a raid can drop gear for any slot.
const raidDrops = (raidId: number) => [...ZONE_BASES, ...BASE_LIST.filter(b => b.raidId === raidId)].map(b => b.id);

export const RAIDS: RaidDef[] = [
  {
    id: 1,
    name: 'Wyrm Hollow',
    blurb: 'Below the dwarven hold, where the frost giants feared to dig, an ancient wyrm sleeps on the hoard of a dead king.',
    tier: 3,
    unlockZoneId: 3,
    boss: {
      id: 9001, name: 'Skaldrith, the Rime Wyrm', level: 40, damageType: 'Physical', defense: 'Armored', speed: 0.7,
      hp: 20000, dps: 72, armor: 250, resistance: 100, xp: 40000, gold: 30000, drops: raidDrops(1), materials: [], boss: true,
    },
    aoe: { every: 12, damage: 40, damageType: 'Magic', name: 'Frost Breath', icon: 'snowflake' },
    enrageSeconds: 240,
    clearsPerDay: 3,
    itemsPerClear: 3,
    ownBaseShare: 1 / 2,
    tokens: 10,
    voidglass: 2,
    hireCost: 2000,
    // The average of level-38 characters with random T3 gear (Rare to Legendary), tanks, healers and damage dealers (test:raid).
    reference: {
      level: 38, maxHp: 640, regen: 0.8, armor: 55, resistance: 65, evasionRating: 22, threat: 0.23,
      attacksPerSec: 1.25, physicalPerSec: 65, magicPerSec: 50, critChance: 0.09, critMult: 1.05, armorPen: 0.02, magicPen: 0.02,
    },
  },
  {
    id: 2,
    name: 'The Drowned Moon',
    blurb: 'Beneath the Moonless Throne the great moonwell runs deep. Something fell into it the night the moon went out, and it is still breathing.',
    tier: 4,
    unlockZoneId: 4,
    boss: {
      id: 9002, name: 'Umbriel, the Eclipse', level: 50, damageType: 'Magic', defense: 'Armored', speed: 0.8,
      hp: 37000, dps: 150, armor: 320, resistance: 60, xp: 110000, gold: 80000, drops: raidDrops(2), materials: [], boss: true,
    },
    // Moonfall: a shard of the moon shared by the living, so every death makes the next one hit harder.
    aoe: { every: 15, damage: 400, damageType: 'Magic', name: 'Moonfall', icon: 'moon', split: true },
    // Silver light behind plate, then void behind wards: a party of one damage type has a slow half of every cycle.
    phases: {
      every: 20,
      list: [
        { name: 'Full Moon', armor: 320, resistance: 60, defense: 'Armored', damageType: 'Magic' },
        { name: 'New Moon', armor: 60, resistance: 320, defense: 'Warded', damageType: 'Physical' },
      ],
    },
    enrageSeconds: 240,
    clearsPerDay: 3,
    itemsPerClear: 3,
    ownBaseShare: 1 / 2,
    tokens: 15,
    voidglass: 4,
    hireCost: 5000,
    // The average of level-48 characters with random T4 gear (Rare to Legendary), tanks, healers and damage dealers (test:raid).
    reference: {
      level: 48, maxHp: 815, regen: 2.6, armor: 72, resistance: 87, evasionRating: 31, threat: 0.28,
      attacksPerSec: 1.16, physicalPerSec: 96, magicPerSec: 96, critChance: 0.1, critMult: 1.09, armorPen: 0.06, magicPen: 0.04,
    },
  },
];

export const RAIDS_BY_ID: ReadonlyMap<number, RaidDef> = new Map(RAIDS.map(r => [r.id, r]));

/** The phase the boss is in at `t` seconds (its index in `phases.list`); 0 without phases or before the fight. */
export const phaseAt = (raid: RaidDef, t: number): number =>
  raid.phases ? Math.floor(Math.max(0, t) / raid.phases.every) % raid.phases.list.length : 0;

/** The boss as it is in each phase (just `boss` without phases): what DPS against it is measured on. */
export const bossPhases = (raid: RaidDef): EnemyDef[] =>
  raid.phases ? raid.phases.list.map(({ name: _name, ...p }) => ({ ...raid.boss, ...p })) : [raid.boss];
