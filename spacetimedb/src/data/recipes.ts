// Production recipes (life-skills.md, "Production"): what Smithing and Alchemy make,
// from what, and how long it takes. Pure data, shared.
//
// A recipe's ID is stored in `character.activityRecipe` while it runs and in settle logs;
// never renumber them. Per skill:
//   Smithing: forge a base = baseId × 10 + tier; upgrade a tool = 1000 + skill × 10 + tier;
//     smelt Ore = 60000 + tier; smelt scrap = 61000 + the material ID it makes. (Tempering is
//     instant, not a recipe: `temperCost`.)
//   Alchemy: the elixir's supply ID (data/supplies.ts).

import { ZONE_BASES, base, type BaseDef } from './bases';
import { MATERIALS, MATERIALS_BY_ID, materialAt, materialOf, type MaterialKind } from './materials';
import { GATHERING_SKILLS, SkillId, productionXpPerAction } from './skills';
import { SUPPLIES, SUPPLY_TIERS } from './supplies';

export interface MaterialCost {
  materialId: number;
  count: number;
}

export type RecipeOutput =
  | { kind: 'item'; baseId: number }
  | { kind: 'tool'; skillId: number }
  | { kind: 'supply'; supplyId: number }
  /** `count` of a material per action (smelting Ore). */
  | { kind: 'material'; materialId: number; count: number }
  /** A material from its scrap (that material's scrap counters, highest rarity first): SCRAP_YIELD per action. */
  | { kind: 'scrap'; materialId: number };

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

export const FORGE_SECONDS = 120;
export const TOOL_SECONDS = 1800;
export const ELIXIR_SECONDS = 450;
export const SMELT_SECONDS = 12;
export const SCRAP_SECONDS = 30;
/** Tempering step k is instant but gives the Smithing XP of TEMPER_XP_SECONDS × k of work. */
export const TEMPER_XP_SECONDS = 180;

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
export const smeltRecipeId = (tier: number) => 60000 + tier;
export const scrapRecipeId = (materialId: number) => 61000 + materialId;

/** The material an item scraps into: its base family's main material, but Metal for jewelry (Gems stay scarce). */
export const scrapKind = (b: BaseDef): MaterialKind => (b.kind === 'jewelry' ? 'Metal' : forgeKinds(b)[0]);
/** The material ID of the scrap of `baseId` at `tier`; undefined for tiers without materials yet. */
export const scrapMaterialId = (baseId: number, tier: number): number | undefined => materialAt(tier, scrapKind(base(baseId)))?.id;
/** The kinds scrap comes in. */
export const SCRAP_KINDS: readonly MaterialKind[] = [...new Set(ZONE_BASES.map(scrapKind))];

/** Materials one smelt of scrap makes, by the scrapped item's rarity. */
export const SCRAP_YIELD = { Common: 2, Magic: 3, Rare: 5, Epic: 15, Legendary: 40 } as const;
export type ScrapRarity = keyof typeof SCRAP_YIELD;
/** Scrap rarities in the order they smelt (highest first). */
export const SCRAP_ORDER: readonly ScrapRarity[] = ['Legendary', 'Epic', 'Rare', 'Magic', 'Common'];
export const isScrapRarity = (r: string): r is ScrapRarity => r in SCRAP_YIELD;

/** Highest temper level. */
export const MAX_TEMPER = 10;

export interface TemperCost {
  /** Its base family's main material, tier of the item. */
  material: MaterialCost;
  gold: bigint;
  /** Smithing XP (and as much character XP) it gives. */
  xp: bigint;
}

/**
 * Tempering `it` one level (life-skills.md, "Smithing: temper an item"), an instant action:
 * step k costs 10 × k of its base family's main material and 0.05 × k hours of farming
 * gold, and gives the Smithing XP of 3 × k min of work. Undefined for tiers without
 * materials yet (raid and dev items above the zones' tiers).
 */
export function temperCost(it: { baseId: number; tier: number; temper: number }): TemperCost | undefined {
  const k = it.temper + 1;
  const main = materialAt(it.tier, forgeKinds(base(it.baseId))[0]);
  if (!main) return undefined;
  return {
    material: { materialId: main.id, count: 10 * k },
    // craft.ts `craftCost` gold: 1,200 per hour of farming × 2.9^(T−1).
    gold: BigInt(Math.round(1200 * 0.05 * k * 2.9 ** (it.tier - 1))),
    xp: productionXpPerAction(it.tier, TEMPER_XP_SECONDS * k),
  };
}

export const RECIPES: Recipe[] = [
  // Forge any base that drops in zones (raid variants only drop).
  ...SUPPLY_TIERS.flatMap(tier => ZONE_BASES.map(b => forgeRecipe(b, tier))),
  // Every character starts with tier 1 tools. Tier T is made from tier T−1 materials, so
  // it can be made before farming tier T.
  ...SUPPLY_TIERS.filter(t => t > 1).flatMap(tier =>
    GATHERING_SKILLS.map(sk => ({
      id: toolRecipeId(sk.id, tier),
      skillId: SkillId.Smithing,
      tier,
      name: `Tier ${tier} ${sk.tool}`,
      seconds: TOOL_SECONDS,
      inputs: [
        { materialId: materialOf(tier - 1, 'Metal').id, count: 100 },
        { materialId: materialOf(tier - 1, 'Wood').id, count: 50 },
      ],
      output: { kind: 'tool' as const, skillId: sk.id },
      max: 1,
    }))
  ),
  // Ore → Metal bars, one for one.
  ...SUPPLY_TIERS.map(tier => ({
    id: smeltRecipeId(tier),
    skillId: SkillId.Smithing,
    tier,
    name: `Smelt ${materialOf(tier, 'Ore').name}`,
    seconds: SMELT_SECONDS,
    inputs: [{ materialId: materialOf(tier, 'Ore').id, count: 1 }],
    output: { kind: 'material' as const, materialId: materialOf(tier, 'Metal').id, count: 1 },
    max: MAX_QUEUE,
  })),
  // Scrap → materials of its kind and tier.
  ...MATERIALS.filter(m => SCRAP_KINDS.includes(m.kind)).map(m => ({
    id: scrapRecipeId(m.id),
    skillId: SkillId.Smithing,
    tier: m.tier,
    name: `Smelt scrap into ${m.name}`,
    seconds: SCRAP_SECONDS,
    inputs: [],
    output: { kind: 'scrap' as const, materialId: m.id },
    max: MAX_QUEUE,
  })),
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

/** What production can spend. */
export interface Stock {
  /** Material ID → count held. */
  have: (materialId: number) => number;
  /** Scrap held that smelts into a material (every rarity). */
  scrap?: (materialId: number) => number;
}

/** How many actions of `r` the stock pays for (a scrap recipe: one per scrap). */
export function affordable(r: Recipe, s: Stock): number {
  const out = r.output;
  const counts = r.inputs.map(i => Math.floor(s.have(i.materialId) / i.count));
  if (out.kind === 'scrap') counts.push(s.scrap?.(out.materialId) ?? 0);
  return counts.length ? Math.min(...counts) : Infinity;
}

/** The material a smelting recipe (Ore or scrap) makes, or undefined. */
export const smeltedMaterial = (r: Recipe) =>
  r.output.kind === 'material' || r.output.kind === 'scrap' ? MATERIALS_BY_ID.get(r.output.materialId) : undefined;
