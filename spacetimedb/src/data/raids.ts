// Raid bosses (docs/design/raids.md). Pure data, shared.
//
// PERMANENT IDS: raid IDs are stored on raid parties and raid logs, and bind the
// raid's own uniques (data/uniques.ts `raidId`). Raid boss enemy IDs are 9000 + raid
// ID, outside the zones' zoneId × 100 + n, so `setTarget` never finds them.
import { BASE_LIST } from './bases';
import type { EnemyDef } from './zones';

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
  /** Raid tokens per rewarded kill. */
  tokens: number;
  /** Gold per hired NPC seat, paid by the leader at the start. */
  hireCost: number;
}

/** Seats in a raid party: players plus hired NPCs. */
export const RAID_PARTY_SIZE = 4;
/** A hired NPC has this × the stats of the party's average player. */
export const NPC_POWER = 0.8;
/** Rarity odds of a raid kill's item (the Unique comes from the raid's own pool). */
export const RAID_RARITY_ODDS = { Epic: 0.75, Legendary: 0.22, Unique: 0.03 } as const;

// Every base: a raid can drop gear for any slot.
const ALL_BASES = BASE_LIST.map(b => b.id);

export const RAIDS: RaidDef[] = [
  {
    id: 1,
    name: 'Wyrm Hollow',
    blurb: 'Below the dwarven hold, where the frost giants feared to dig, an ancient wyrm sleeps on the hoard of a dead king.',
    tier: 3,
    unlockZoneId: 3,
    boss: {
      id: 9001, name: 'Skaldrith, the Rime Wyrm', level: 40, damageType: 'Physical', defense: 'Armored', speed: 0.7,
      hp: 20000, dps: 60, armor: 250, resistance: 100, xp: 4000, gold: 3000, drops: ALL_BASES, materials: [], boss: true,
    },
    aoe: { every: 12, damage: 45, damageType: 'Magic', name: 'Frost Breath' },
    enrageSeconds: 240,
    tokens: 10,
    hireCost: 2000,
  },
];

export const RAIDS_BY_ID: ReadonlyMap<number, RaidDef> = new Map(RAIDS.map(r => [r.id, r]));
