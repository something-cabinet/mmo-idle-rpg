// Life skills (life-skills.md): non-combat skills with their own XP and levels. Pure
// data, shared. Rollout phase 1: Mining, Woodcutting, Foraging (gathering), Smithing and
// Alchemy (production, recipes in data/recipes.ts).
//
// PERMANENT IDS: skill IDs are stored in `skill` and `tool` rows, the character's
// activity and settle logs; never reuse or renumber them. 0 is never a skill (it means
// combat in `character.activitySkill`).

import type { MaterialKind } from './materials';

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

/** Why gathering tier `tier` isn't allowed, or undefined if it is. */
export function gatherBlocker(g: { level: number; tier: number; zoneOpen: boolean }): string | undefined {
  if (!g.zoneOpen) return `Unlock the tier ${g.tier} zone first`;
  if (g.level < tierRequirement(g.tier)) return `Needs level ${tierRequirement(g.tier)}`;
  return undefined;
}

/** Why production at tier `tier` isn't allowed, or undefined if it is. */
export function productionBlocker(p: { level: number; tier: number; zoneOpen: boolean }): string | undefined {
  if (!p.zoneOpen) return `Unlock the tier ${p.tier} zone first`;
  if (p.level < tierRequirement(p.tier)) return `Needs level ${tierRequirement(p.tier)}`;
  return undefined;
}
