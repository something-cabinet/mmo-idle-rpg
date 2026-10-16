// Crafting materials dropped by enemies (zones.md, "Materials"). Pure data, shared.
//
// Generic kinds, one of each per tier, for future crafting, potions and hideout
// upgrades: Metal (ingots, bars), Hide (skins, hides, scales), Core (hearts, cores;
// magical creatures only), Cloth (thread, silk), Wood (logs, planks), Reagent (herbs,
// venom, fangs: potions) and Gem (rough to flawless stones; rare). An enemy drops the
// kinds it lists, always of its zone's tier. Ore only comes from Mining and is smelted
// into Metal (life-skills.md); enemies never drop it, except for Prospector (legendary.md).
//
// PERMANENT IDS: material IDs are stored in `material` rows and settle logs; never
// reuse or renumber them. IDs are kind ID × 100 + tier (Copper Ingot 101, Rough Gem 701),
// with the explicit kind IDs in MATERIAL_KIND_IDS, so a new kind just takes the next
// unused kind ID (up to 655 in the u16 column) and tiers go up to 99. Before 2026-10-15
// IDs were tier × 10 + kind; migrate.ts rewrote those.

export const MATERIAL_KINDS = ['Metal', 'Hide', 'Core', 'Cloth', 'Wood', 'Reagent', 'Gem', 'Ore'] as const;
export type MaterialKind = (typeof MATERIAL_KINDS)[number];
/** The kinds enemies drop (all but Ore). */
export const DROP_KINDS: readonly MaterialKind[] = MATERIAL_KINDS.filter(k => k !== 'Ore');

/** Permanent kind IDs. Planned: Fish 8 (life-skills.md). */
export const MATERIAL_KIND_IDS: Record<MaterialKind, number> = { Metal: 1, Hide: 2, Core: 3, Cloth: 4, Wood: 5, Reagent: 6, Gem: 7, Ore: 9 };
export const MATERIAL_KINDS_BY_ID: ReadonlyMap<number, MaterialKind> = new Map(MATERIAL_KINDS.map(k => [MATERIAL_KIND_IDS[k], k]));

/** The material ID of `kind` at `tier`. */
export const materialId = (tier: number, kind: MaterialKind) => MATERIAL_KIND_IDS[kind] * 100 + tier;

/** The current ID of a material ID from before 2026-10-15 (tier × 10 + kind ID); IDs already current pass through. */
export const migrateMaterialId = (id: number) => (id < 100 ? (id % 10) * 100 + Math.floor(id / 10) : id);

/** Mean drops per kill of each kind the enemy lists, × its reward scale (zones.ts `rewardScale`). */
export const MATERIAL_CHANCE: Record<MaterialKind, number> = { Metal: 0.3, Hide: 0.3, Core: 0.1, Cloth: 0.3, Wood: 0.3, Reagent: 0.3, Gem: 0.05, Ore: 0 };

export interface MaterialDef {
  id: number;
  tier: number;
  kind: MaterialKind;
  name: string;
}

/** Names per tier and kind. */
const NAMES: Record<number, Record<MaterialKind, string>> = {
  1: { Metal: 'Copper Ingot', Hide: 'Rough Hide', Core: 'Faint Core', Cloth: 'Linen Scrap', Wood: 'Driftwood Log', Reagent: 'Bitterleaf', Gem: 'Rough Gem', Ore: 'Copper Ore' },
  2: { Metal: 'Bog Iron Bar', Hide: 'Thick Hide', Core: 'Thorn Heart', Cloth: 'Homespun Bolt', Wood: 'Ironbark Plank', Reagent: 'Nightshade', Gem: 'Cut Gem', Ore: 'Bog Iron Ore' },
  3: { Metal: 'Dwarven Steel Ingot', Hide: 'Frostfur Hide', Core: 'Rime Core', Cloth: 'Spidersilk Thread', Wood: 'Heartoak Timber', Reagent: 'Frostbloom', Gem: 'Flawless Gem', Ore: 'Dwarven Steel Ore' },
};

export const MATERIALS: MaterialDef[] = Object.entries(NAMES).flatMap(([tier, names]) =>
  MATERIAL_KINDS.map(kind => ({ id: materialId(Number(tier), kind), tier: Number(tier), kind, name: names[kind] }))
);

export const MATERIALS_BY_ID: ReadonlyMap<number, MaterialDef> = new Map(MATERIALS.map(m => [m.id, m]));

/** The tier-`tier` material of `kind` (materials exist for the zones' tiers only). */
export const materialOf = (tier: number, kind: MaterialKind): MaterialDef =>
  MATERIALS_BY_ID.get(materialId(tier, kind))!;
/** `materialOf`, or undefined for a tier without materials. */
export const materialAt = (tier: number, kind: MaterialKind): MaterialDef | undefined => MATERIALS_BY_ID.get(materialId(tier, kind));
