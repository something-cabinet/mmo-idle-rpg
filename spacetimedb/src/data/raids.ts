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

/**
 * A boss's special attack: every `every` seconds, `damage` (before mitigation) to every living
 * fighter (`aoe`), or to one fighter picked by threat. It can't be dodged. `icon` names its UI icon.
 */
export interface RaidSignature {
  name: string;
  icon: string;
  every: number;
  damage: number;
  damageType: 'Physical' | 'Magic';
  aoe: boolean;
}

/**
 * One brother of a duo raid (raids.md, "Raid 3"). When the other falls, this one absorbs him for
 * `DuoDef.absorbSeconds`; if it's still standing then, it becomes `empowered`: one twist.
 */
export interface DuoBoss {
  enemy: EnemyDef;
  signature: RaidSignature;
  empowered: {
    name: string;
    /** What changes, for the Raids page. */
    text: string;
    signature?: Partial<RaidSignature>;
    /** Share of his max HP he heals as he empowers. */
    heal?: number;
    armor?: number;
    resistance?: number;
  };
}

/** Two bosses at once: each fighter attacks the one the leader assigned (`RaidFighter.target`). */
export interface DuoDef {
  bosses: [DuoBoss, DuoBoss];
  /** Seconds the survivor spends absorbing his fallen brother: kill him in time and he never empowers. */
  absorbSeconds: number;
  /** Threat added against the brother a fighter attacks (you hit him, he hits back). */
  focusThreat: number;
  /** × each brother's damage (attacks and signature) while the other still stands: alone, he hits at full strength. */
  together: number;
  /** × the survivor's damage once he empowers: he has absorbed his brother's power. */
  absorbed: number;
}

export interface RaidDef {
  id: number;
  name: string;
  blurb: string;
  /** Gear tier of its drops. */
  tier: number;
  /** Open to characters who have killed this zone's boss. */
  unlockZoneId: number;
  /** Its `drops` are the bases its Epic and Legendary drops pick from. XP and gold are per kill. A duo's first brother. */
  boss: EnemyDef;
  /** A duo raid: two bosses at once (`boss` is the first's enemy); `aoe` and `phases` are unused. */
  duo?: DuoDef;
  /**
   * Every `every` seconds the boss hits every living fighter for `damage` (before their mitigation), or with
   * `split`, `damage` shared evenly by the living. It can't be dodged. `icon` names its UI icon.
   * A duo raid has none: each brother has its own signature.
   */
  aoe?: { every: number; damage: number; damageType: 'Physical' | 'Magic'; name: string; icon: string; split?: boolean };
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

/** A duo raid's second brother has enemy ID 9200 + raid ID (the first is 9000 + raid ID, like every raid boss). */
const BROKK: EnemyDef = {
  id: 9003, name: 'Brokk, the Hammer', level: 60, damageType: 'Physical', defense: 'Armored', speed: 0.35,
  hp: 44000, dps: 105, armor: 380, resistance: 70, xp: 300000, gold: 220000, drops: raidDrops(3), materials: [], boss: true,
};
const SINDRI: EnemyDef = {
  id: 9203, name: 'Sindri, the Bellows', level: 60, damageType: 'Magic', defense: 'Warded', speed: 2,
  hp: 20000, dps: 175, armor: 70, resistance: 380, xp: 0, gold: 0, drops: [], materials: [], boss: true,
};

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
  {
    id: 3,
    name: "The Brothers' Forge",
    blurb: "Beneath Brightvein Hold lies the great forge where brightsteel was first smelted from the shard's light. Two dwarven smith brothers still guard it, bound by the Thane's oath.",
    tier: 5,
    unlockZoneId: 5,
    boss: BROKK,
    duo: {
      bosses: [
        {
          enemy: BROKK,
          signature: { name: 'Anvil Slam', icon: 'hammer', every: 15, damage: 800, damageType: 'Physical', aoe: false },
          // A tank-buster becomes a raid-wide nuke, but slower.
          empowered: {
            name: 'Molten Hammer',
            text: 'Anvil Slam hits every living fighter, every 25 s instead of 15',
            signature: { name: 'Molten Hammer', every: 25, aoe: true, icon: 'flame', damage: 560 },
          },
        },
        {
          enemy: SINDRI,
          signature: { name: 'Fire Bellows', icon: 'flame', every: 12, damage: 168, damageType: 'Magic', aoe: true },
          // No weak side left: a penetration and damage race.
          empowered: { name: 'Anvil Hide', text: 'He becomes Armored as well as Warded: high armor and high resistance', armor: 900, resistance: 900 },
        },
      ],
      absorbSeconds: 5,
      focusThreat: 0.2,
      together: 0.75,
      absorbed: 1.75,
    },
    enrageSeconds: 115,
    clearsPerDay: 3,
    itemsPerClear: 3,
    ownBaseShare: 1 / 2,
    tokens: 20,
    voidglass: 6,
    hireCost: 12000,
    // The average of level-58 characters with T5 gear (Epic or better, each affix rerolled once toward their role),
    // tanks, healers and damage dealers (test:raid).
    reference: {
      level: 58, maxHp: 1020, regen: 9.5, armor: 83, resistance: 103, evasionRating: 40, threat: 0.33,
      attacksPerSec: 1.32, physicalPerSec: 226, magicPerSec: 202, critChance: 0.11, critMult: 1.12, armorPen: 0.07, magicPen: 0.07,
    },
  },
];

export const RAIDS_BY_ID: ReadonlyMap<number, RaidDef> = new Map(RAIDS.map(r => [r.id, r]));

/** The phase the boss is in at `t` seconds (its index in `phases.list`); 0 without phases or before the fight. */
export const phaseAt = (raid: RaidDef, t: number): number =>
  raid.phases ? Math.floor(Math.max(0, t) / raid.phases.every) % raid.phases.list.length : 0;

/** Every boss of a raid: the duo's two brothers, or just `boss`. */
export const raidBosses = (raid: RaidDef): EnemyDef[] => (raid.duo ? raid.duo.bosses.map(b => b.enemy) : [raid.boss]);

/** A duo brother as he is once empowered (its sprite and stats). */
export const empoweredBoss = (b: DuoBoss): EnemyDef => ({ ...b.enemy, id: empoweredArtId(b.enemy.id), name: `${b.enemy.name.split(',')[0]}, ${b.empowered.name}`,
  ...(b.empowered.armor !== undefined && { armor: b.empowered.armor }), ...(b.empowered.resistance !== undefined && { resistance: b.empowered.resistance }) });

/** The sprite key of a duo brother's empowered form: its enemy ID × 10 + 1 (like the Deep Warden's variants). */
export const empoweredArtId = (enemyId: number) => enemyId * 10 + 1;

/** A duo brother's signature once empowered. */
export const empoweredSignature = (b: DuoBoss): RaidSignature => ({ ...b.signature, ...b.empowered.signature });

/** The boss as it is in each phase (just `boss` without phases): what DPS against it is measured on. */
export const bossPhases = (raid: RaidDef): EnemyDef[] =>
  raid.phases ? raid.phases.list.map(({ name: _name, ...p }) => ({ ...raid.boss, ...p })) : [raid.boss];
