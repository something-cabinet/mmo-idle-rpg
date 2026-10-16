// Life skills (life-skills.md): non-combat skills with their own XP and levels. Pure
// data, shared. Rollout phase 1: Mining, Woodcutting, Foraging (gathering), Smithing and
// Alchemy (production, recipes in data/recipes.ts).
//
// PERMANENT IDS: skill IDs are stored in `skill` and `tool` rows, the character's
// activity and settle logs; never reuse or renumber them. 0 is never a skill (it means
// combat in `character.activitySkill`).

import { materialId, type MaterialKind, type UntieredKind } from './materials';

export const SkillId = { Mining: 1, Woodcutting: 2, Foraging: 3, Smithing: 11, Alchemy: 12 } as const;

interface SkillCommon {
  id: number;
  name: string;
  /** Its page in the client (`#mining`). */
  slug: string;
  /** Icon name (src/ui/Icon.tsx). */
  icon: string;
}
export interface GatheringSkillDef extends SkillCommon {
  kind: 'Gathering';
  /** The material kind it gathers. */
  makes: MaterialKind;
  /** Its gathering tool (one per character, by tier). */
  tool: string;
}
/** Works through a queue of one recipe (data/recipes.ts), then goes back to combat. */
export interface ProductionSkillDef extends SkillCommon {
  kind: 'Production';
  /** What it makes, for the skills hub. */
  makes: string;
}
export type SkillDef = GatheringSkillDef | ProductionSkillDef;

export const SKILLS: SkillDef[] = [
  { id: SkillId.Mining, name: 'Mining', slug: 'mining', kind: 'Gathering', makes: 'Ore', tool: 'Pickaxe', icon: 'm-ore' },
  { id: SkillId.Woodcutting, name: 'Woodcutting', slug: 'woodcutting', kind: 'Gathering', makes: 'Wood', tool: 'Hatchet', icon: 'm-wood' },
  { id: SkillId.Foraging, name: 'Foraging', slug: 'foraging', kind: 'Gathering', makes: 'Reagent', tool: 'Sickle', icon: 'm-reagent' },
  { id: SkillId.Smithing, name: 'Smithing', slug: 'smithing', kind: 'Production', makes: 'Gear bases, tools, tempering, smelting', icon: 'anvil' },
  { id: SkillId.Alchemy, name: 'Alchemy', slug: 'alchemy', kind: 'Production', makes: 'Elixirs', icon: 'flask' },
];

export const SKILLS_BY_ID: ReadonlyMap<number, SkillDef> = new Map(SKILLS.map(s => [s.id, s]));
export const GATHERING_SKILLS = SKILLS.filter((s): s is GatheringSkillDef => s.kind === 'Gathering');
export const PRODUCTION_SKILLS = SKILLS.filter((s): s is ProductionSkillDef => s.kind === 'Production');

export const MAX_SKILL_LEVEL = 99;

/** Skill XP needed to go from `level` to the next. */
export const skillXpToNext = (level: number): bigint => BigInt(Math.round(100 * 1.115 ** level));

/** Skill level needed to work at tier `tier`: 1, 11, 21, … */
export const tierRequirement = (tier: number) => 10 * (tier - 1) + 1;

/** Seconds per gathering action at base speed: 300 per hour. */
export const GATHER_SECONDS = 12;
/** Mining's chance per action of a Gem of the same tier. */
export const GEM_CHANCE = 0.05;

/** Skill XP per hour at base speed at tier `tier` (× 2.9 per tier, like combat rewards). */
export const skillXpPerHour = (tier: number) => 600 * 2.9 ** (tier - 1);
/** Skill XP per gathering action at tier `tier`. */
export const gatherXpPerAction = (tier: number) => (skillXpPerHour(tier) * GATHER_SECONDS) / 3600;
/**
 * Character XP per gathering action at tier `tier`: as much as the skill XP (about a fifth
 * of farming's XP per hour), so skilling still levels the character, only slower.
 */
export const gatherCharacterXpPerAction = gatherXpPerAction;

/** Gathering speed per tool tier above T1 (life-skills.md, "Tools"): tools only speed gathering up. */
export const TOOL_SPEED_PER_TIER = 0.1;
/** +10% gathering speed per tool tier above T1, whatever tier is gathered. */
export const toolSpeedBonus = (toolTier: number) => TOOL_SPEED_PER_TIER * Math.max(0, toolTier - 1);

/** Microseconds per gathering action. */
export const gatherActionMicros = (toolTier: number): bigint =>
  BigInt(Math.round((GATHER_SECONDS * 1e6) / (1 + toolSpeedBonus(toolTier))));

/** Skill XP per production action of `seconds` at tier `tier` (whole points; as much character XP). */
export const productionXpPerAction = (tier: number, seconds: number): bigint => BigInt(Math.floor((skillXpPerHour(tier) * seconds) / 3600));

/** Microseconds per production action of `seconds` (skill level doesn't change it). */
export const productionActionMicros = (seconds: number): bigint => BigInt(Math.round(seconds * 1e6));

/**
 * Chance per gathering action of a second material, and per production action of keeping
 * its inputs: 5% from level 50, 10% at 99.
 */
export const doubleYieldChance = (level: number) => (level >= MAX_SKILL_LEVEL ? 0.1 : level >= 50 ? 0.05 : 0);

/** Highest temper level Smithing `level` allows: +1 per 10 levels, +10 at 99 (life-skills.md, "Smithing: temper an item"). */
export const temperCap = (level: number) => (level >= MAX_SKILL_LEVEL ? 10 : Math.floor(level / 10));
/** Smithing level needed to temper to `temper`. */
export const temperRequirement = (temper: number) => (temper >= 10 ? MAX_SKILL_LEVEL : 10 * temper);

// ---------------------------------------------------------------- rare finds and nodes

/**
 * A rare find (life-skills.md, "Rare finds"), rolled per gathering action on top of the
 * material: a material (tiered: of the node's tier; untiered: one material) or a Relic,
 * sold on the spot for gold.
 */
export interface RareFindDef {
  skillId: number;
  what: { kind: 'material'; material: MaterialKind | UntieredKind; untiered: boolean } | { kind: 'relic' };
  /** Chance per action at tier `tier`, before the level and node multipliers. */
  chance: (tier: number) => number;
}

export const RARE_FINDS: RareFindDef[] = [
  { skillId: SkillId.Mining, what: { kind: 'relic' }, chance: () => 0.02 },
  { skillId: SkillId.Mining, what: { kind: 'material', material: 'Meteor', untiered: true }, chance: tier => 0.001 * tier },
  { skillId: SkillId.Woodcutting, what: { kind: 'material', material: 'Tear', untiered: true }, chance: tier => 0.001 * tier },
  { skillId: SkillId.Foraging, what: { kind: 'material', material: 'Herb', untiered: false }, chance: () => 0.01 },
];

/** Rare finds come `1 + level / 99` times as often: double at 99. */
export const findLevelMult = (level: number) => 1 + level / MAX_SKILL_LEVEL;

/** A Relic sells for this many hours of farming gold at its tier (craft.ts `craftCost`). */
export const RELIC_HOURS = 0.15;

/**
 * A special node (life-skills.md, "Special nodes"): another target inside a tier that
 * trades the main material for a focus. Node 0 is the normal node of every skill.
 *
 * PERMANENT IDS: node IDs are stored in `character.activityRecipe` (`node × 100 + tier`)
 * and settle logs; never reuse or renumber them.
 */
export interface GatherNodeDef {
  id: number;
  skillId: number;
  name: string;
  /** Skill level that unlocks it (on top of the tier's requirement). */
  unlock: number;
  /** Chance per action of the main material (1 on the normal node). */
  mainChance: number;
  /** Mining's Gem chance here (GEM_CHANCE on the normal node). */
  gemChance?: number;
  /** The rare find it favours, and by how much. */
  boost?: { find: RareFindDef; mult: number };
  /** What it trades, for the client. */
  text: string;
}

const findOf = (skillId: number, kind: RareFindDef['what']['kind'], material?: string) =>
  RARE_FINDS.find(f => f.skillId === skillId && f.what.kind === kind && (!material || (f.what.kind === 'material' && f.what.material === material)))!;

export const GATHER_NODES: GatherNodeDef[] = [
  { id: 1, skillId: SkillId.Mining, name: 'Gem Pocket', unlock: 30, mainChance: 0, gemChance: 0.2, text: 'No Ore; Gem chance 20%' },
  { id: 2, skillId: SkillId.Mining, name: 'Ruins Dig Site', unlock: 60, mainChance: 0.5, boost: { find: findOf(SkillId.Mining, 'relic'), mult: 3 }, text: 'Half the Ore; Relics ×3' },
  { id: 3, skillId: SkillId.Woodcutting, name: 'Ancient Grove', unlock: 60, mainChance: 0.5, boost: { find: findOf(SkillId.Woodcutting, 'material', 'Tear'), mult: 3 }, text: "Half the Wood; Dryad's Tears ×3" },
  { id: 4, skillId: SkillId.Foraging, name: 'Shaded Glade', unlock: 30, mainChance: 0.5, boost: { find: findOf(SkillId.Foraging, 'material', 'Herb'), mult: 3 }, text: 'Half the Reagent; rare herbs ×3' },
];
export const GATHER_NODES_BY_ID: ReadonlyMap<number, GatherNodeDef> = new Map(GATHER_NODES.map(n => [n.id, n]));

/** `character.activityRecipe` while gathering: `node × 100 + tier` (node 0: the normal node). */
export const gatherSpotId = (tier: number, node: number) => node * 100 + tier;
/** The tier and node of a gathering `activityRecipe`. */
export const gatherSpot = (recipe: number) => ({ tier: recipe % 100, node: Math.floor(recipe / 100) });

/** Chance per action of the main material at `node` (0: the normal node). */
export const mainChance = (node: number) => GATHER_NODES_BY_ID.get(node)?.mainChance ?? 1;
/** Mining's Gem chance per action at `node`. */
export const gemChance = (node: number) => GATHER_NODES_BY_ID.get(node)?.gemChance ?? GEM_CHANCE;

/** Each rare find of `skillId` at `tier` and `node` with its chance per action at skill `level`, and the material it makes (undefined: a Relic). */
export function findChances(skillId: number, tier: number, node: number, level: number): { find: RareFindDef; chance: number; materialId?: number }[] {
  const boost = GATHER_NODES_BY_ID.get(node)?.boost;
  return RARE_FINDS.filter(f => f.skillId === skillId).map(f => ({
    find: f,
    chance: Math.min(1, f.chance(tier) * findLevelMult(level) * (boost?.find === f ? boost.mult : 1)),
    materialId: f.what.kind === 'material' ? materialId(f.what.untiered ? 0 : tier, f.what.material) : undefined,
  }));
}

/** Why gathering tier `tier` (at special node `node`, 0 for the normal one) isn't allowed, or undefined if it is. */
export function gatherBlocker(g: { level: number; tier: number; zoneOpen: boolean; node?: number }): string | undefined {
  if (!g.zoneOpen) return `Unlock the tier ${g.tier} zone first`;
  if (g.level < tierRequirement(g.tier)) return `Needs level ${tierRequirement(g.tier)}`;
  const n = g.node ? GATHER_NODES_BY_ID.get(g.node) : undefined;
  if (n && g.level < n.unlock) return `Needs level ${n.unlock}`;
  return undefined;
}

/** Why production at tier `tier` isn't allowed, or undefined if it is. */
export function productionBlocker(p: { level: number; tier: number; zoneOpen: boolean }): string | undefined {
  if (!p.zoneOpen) return `Unlock the tier ${p.tier} zone first`;
  if (p.level < tierRequirement(p.tier)) return `Needs level ${tierRequirement(p.tier)}`;
  return undefined;
}
