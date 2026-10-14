// Production recipes (life-skills.md, "Production"): what Smithing and Alchemy make,
// from what, and how long it takes. Pure data, shared.
//
// A recipe's ID is stored in `character.activityRecipe` while it runs and in settle logs;
// never renumber them. Per skill:
//   Smithing: forge a base = baseId × 10 + tier; upgrade a tool = 1000 + skill × 10 + tier.
//   Alchemy: the elixir's supply ID (data/supplies.ts).

import { ZONE_BASES, base, type BaseDef } from './bases';
import { materialOf, type MaterialKind } from './materials';
import { GATHERING_SKILLS, SkillId } from './skills';
import { SUPPLIES, SUPPLY_TIERS } from './supplies';

export interface MaterialCost {
  materialId: number;
  count: number;
}

export type RecipeOutput =
  | { kind: 'item'; baseId: number }
  | { kind: 'tool'; skillId: number }
  | { kind: 'supply'; supplyId: number };

export interface Recipe {
  id: number;
  skillId: number;
  tier: number;
  name: string;
  /** Seconds per action at base speed. */
  seconds: number;
  inputs: MaterialCost[];
  output: RecipeOutput;
  /** Most actions one queue can hold (a tool upgrade is one). */
  max: number;
}

/** Actions one queue can hold at most. */
export const MAX_QUEUE = 1000;

export const FORGE_SECONDS = 60;
export const TOOL_SECONDS = 1800;
export const ELIXIR_SECONDS = 450;

/** Main and secondary material of a forged base (life-skills.md, "Smithing"). */
export function forgeKinds(b: BaseDef): [MaterialKind, MaterialKind] {
  if (b.kind === 'weapon') return b.weapon?.ranged ? ['Wood', 'Metal'] : ['Metal', 'Wood'];
  if (b.kind === 'jewelry') return ['Gem', 'Metal'];
  if (b.family === 'Tome' || b.family.startsWith('Cloth')) return ['Cloth', 'Hide'];
  if (b.family.startsWith('Leather')) return ['Hide', 'Cloth'];
  return ['Metal', 'Wood']; // plate and shields
}

function forgeRecipe(b: BaseDef, tier: number): Recipe {
  const [main, second] = forgeKinds(b);
  return {
    id: b.id * 10 + tier,
    skillId: SkillId.Smithing,
    tier,
    name: b.name(tier),
    seconds: FORGE_SECONDS,
    inputs: [
      { materialId: materialOf(tier, main).id, count: main === 'Gem' ? 5 : 30 },
      { materialId: materialOf(tier, second).id, count: 10 },
    ],
    output: { kind: 'item', baseId: b.id },
    max: MAX_QUEUE,
  };
}

export const toolRecipeId = (skillId: number, tier: number) => 1000 + skillId * 10 + tier;

export const RECIPES: Recipe[] = [
  // Forge any base that drops in zones (raid variants only drop).
  ...SUPPLY_TIERS.flatMap(tier => ZONE_BASES.map(b => forgeRecipe(b, tier))),
  // Every character starts with tier 1 tools.
  ...SUPPLY_TIERS.filter(t => t > 1).flatMap(tier =>
    GATHERING_SKILLS.map(sk => ({
      id: toolRecipeId(sk.id, tier),
      skillId: SkillId.Smithing,
      tier,
      name: `Tier ${tier} ${sk.tool}`,
      seconds: TOOL_SECONDS,
      inputs: [
        { materialId: materialOf(tier, 'Metal').id, count: 100 },
        { materialId: materialOf(tier, 'Wood').id, count: 50 },
      ],
      output: { kind: 'tool' as const, skillId: sk.id },
      max: 1,
    }))
  ),
  ...SUPPLIES.map(s => ({
    id: s.id,
    skillId: SkillId.Alchemy,
    tier: s.tier,
    name: s.name,
    seconds: ELIXIR_SECONDS,
    inputs: [
      { materialId: materialOf(s.tier, 'Reagent').id, count: 10 },
      { materialId: materialOf(s.tier, 'Core').id, count: 1 },
    ],
    output: { kind: 'supply' as const, supplyId: s.id },
    max: MAX_QUEUE,
  })),
];

const BY_KEY = new Map(RECIPES.map(r => [`${r.skillId}:${r.id}`, r]));

/** Recipe `id` of skill `skillId`, or undefined. */
export const recipeOf = (skillId: number, id: number): Recipe | undefined => BY_KEY.get(`${skillId}:${id}`);

/** The forge recipe for `baseId` at `tier`. */
export const forgeRecipeOf = (baseId: number, tier: number) => recipeOf(SkillId.Smithing, base(baseId).id * 10 + tier);

/** How many actions of `r` the materials in `have` pay for. */
export function affordable(r: Recipe, have: (materialId: number) => number): number {
  return Math.min(...r.inputs.map(i => Math.floor(have(i.materialId) / i.count)));
}
