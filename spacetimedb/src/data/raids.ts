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
  /** Every `every` seconds the boss hits every living fighter for `damage` (before their mitigation). It can't be dodged. */
  aoe: { every: number; damage: number; damageType: 'Physical' | 'Magic'; name: string };
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
      hp: 18000, dps: 72, armor: 250, resistance: 100, xp: 4000, gold: 3000, drops: raidDrops(1), materials: [], boss: true,
    },
    aoe: { every: 12, damage: 40, damageType: 'Magic', name: 'Frost Breath' },
    enrageSeconds: 240,
    clearsPerDay: 3,
    itemsPerClear: 3,
    ownBaseShare: 1 / 2,
    tokens: 10,
    hireCost: 2000,
    // The average of level-38 characters with random T3 gear (Rare to Legendary), tanks, healers and damage dealers (test:raid).
    reference: {
      level: 38, maxHp: 640, regen: 0.8, armor: 55, resistance: 65, evasionRating: 22, threat: 0.23,
      attacksPerSec: 1.25, physicalPerSec: 54, magicPerSec: 42, critChance: 0.09, critMult: 1.05, armorPen: 0.02, magicPen: 0.02,
    },
  },
];

export const RAIDS_BY_ID: ReadonlyMap<number, RaidDef> = new Map(RAIDS.map(r => [r.id, r]));
