// Crafting materials dropped by enemies (zones.md, "Materials"). Pure data, shared.
//
// Generic kinds, one of each per tier, for future crafting, potions and hideout
// upgrades: Metal (ingots, bars), Hide (skins, hides, scales), Core (hearts, cores;
// magical creatures only), Cloth (thread, silk), Wood (logs, planks), Reagent (herbs,
// venom, fangs: potions) and Gem (rough to flawless stones; rare). An enemy drops the
// kinds it lists, always of its zone's tier.
//
// PERMANENT IDS: material IDs are stored in `material` rows and settle logs; never
// reuse or renumber them. IDs are tier × 10 + kind (1-based MATERIAL_KINDS index), so
// new kinds go at the end of MATERIAL_KINDS (up to 9).

export const MATERIAL_KINDS = ['Metal', 'Hide', 'Core', 'Cloth', 'Wood', 'Reagent', 'Gem'] as const;
export type MaterialKind = (typeof MATERIAL_KINDS)[number];

/** Mean drops per kill of each kind the enemy lists, × its reward scale (zones.ts `rewardScale`). */
export const MATERIAL_CHANCE: Record<MaterialKind, number> = { Metal: 0.3, Hide: 0.3, Core: 0.1, Cloth: 0.3, Wood: 0.3, Reagent: 0.3, Gem: 0.05 };

export interface MaterialDef {
  id: number;
  tier: number;
  kind: MaterialKind;
  name: string;
}

/** Names per tier and kind. */
const NAMES: Record<number, Record<MaterialKind, string>> = {
  1: { Metal: 'Copper Ingot', Hide: 'Rough Hide', Core: 'Faint Core', Cloth: 'Linen Scrap', Wood: 'Driftwood Log', Reagent: 'Bitterleaf', Gem: 'Rough Gem' },
  2: { Metal: 'Bog Iron Bar', Hide: 'Thick Hide', Core: 'Thorn Heart', Cloth: 'Homespun Bolt', Wood: 'Ironbark Plank', Reagent: 'Nightshade', Gem: 'Cut Gem' },
  3: { Metal: 'Dwarven Steel Ingot', Hide: 'Frostfur Hide', Core: 'Rime Core', Cloth: 'Spidersilk Thread', Wood: 'Heartoak Timber', Reagent: 'Frostbloom', Gem: 'Flawless Gem' },
};

export const MATERIALS: MaterialDef[] = Object.entries(NAMES).flatMap(([tier, names]) =>
  MATERIAL_KINDS.map((kind, k) => ({ id: Number(tier) * 10 + k + 1, tier: Number(tier), kind, name: names[kind] }))
);

export const MATERIALS_BY_ID: ReadonlyMap<number, MaterialDef> = new Map(MATERIALS.map(m => [m.id, m]));

/** The tier-`tier` material of `kind`. */
export const materialOf = (tier: number, kind: MaterialKind): MaterialDef =>
  MATERIALS_BY_ID.get(tier * 10 + MATERIAL_KINDS.indexOf(kind) + 1)!;
