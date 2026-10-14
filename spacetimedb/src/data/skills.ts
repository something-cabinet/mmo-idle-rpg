// Life skills (life-skills.md): non-combat skills with their own XP and levels. Pure
// data, shared. Only the gathering skills of rollout phase 1 exist so far.
//
// PERMANENT IDS: skill IDs are stored in `skill` and `tool` rows, the character's
// activity and settle logs; never reuse or renumber them. 0 is never a skill (it means
// combat in `character.activitySkill`).

import type { MaterialKind } from './materials';

export const SkillId = { Mining: 1, Woodcutting: 2, Foraging: 3 } as const;

export interface SkillDef {
  id: number;
  name: string;
  /** Its page in the client (`#mining`). */
  slug: string;
  kind: 'Gathering';
  /** The material kind it gathers. */
  makes: MaterialKind;
  /** Its gathering tool (one per character, by tier). */
  tool: string;
  /** Icon name (src/ui/Icon.tsx). */
  icon: string;
}

export const SKILLS: SkillDef[] = [
  { id: SkillId.Mining, name: 'Mining', slug: 'mining', kind: 'Gathering', makes: 'Metal', tool: 'Pickaxe', icon: 'm-metal' },
  { id: SkillId.Woodcutting, name: 'Woodcutting', slug: 'woodcutting', kind: 'Gathering', makes: 'Wood', tool: 'Hatchet', icon: 'm-wood' },
  { id: SkillId.Foraging, name: 'Foraging', slug: 'foraging', kind: 'Gathering', makes: 'Reagent', tool: 'Sickle', icon: 'm-reagent' },
];

export const SKILLS_BY_ID: ReadonlyMap<number, SkillDef> = new Map(SKILLS.map(s => [s.id, s]));
export const GATHERING_SKILLS = SKILLS.filter(s => s.kind === 'Gathering');

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

/** +1% action speed per level above the tier's requirement, capped at +20%. */
export const levelSpeedBonus = (level: number, tier: number) => Math.min(0.2, 0.01 * Math.max(0, level - tierRequirement(tier)));
/** +5% gathering speed per tool tier above the material tier, capped at +20%. */
export const toolSpeedBonus = (toolTier: number, tier: number) => Math.min(0.2, 0.05 * Math.max(0, toolTier - tier));

/** Microseconds per gathering action. */
export const gatherActionMicros = (level: number, tier: number, toolTier: number): bigint =>
  BigInt(Math.round((GATHER_SECONDS * 1e6) / (1 + levelSpeedBonus(level, tier) + toolSpeedBonus(toolTier, tier))));

/** Chance per gathering action of a second material: 5% from level 50, 10% at 99. */
export const doubleYieldChance = (level: number) => (level >= MAX_SKILL_LEVEL ? 0.1 : level >= 50 ? 0.05 : 0);

/** Why gathering tier `tier` isn't allowed, or undefined if it is. */
export function gatherBlocker(g: { level: number; tier: number; toolTier: number; zoneOpen: boolean; tool: string }): string | undefined {
  if (!g.zoneOpen) return `Unlock the tier ${g.tier} zone first`;
  if (g.level < tierRequirement(g.tier)) return `Needs level ${tierRequirement(g.tier)}`;
  if (g.toolTier < g.tier) return `Needs a tier ${g.tier} ${g.tool}`;
  return undefined;
}
