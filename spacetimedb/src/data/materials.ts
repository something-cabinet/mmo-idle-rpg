// Crafting materials dropped by enemies (zones.md, "Materials"). Pure data, shared.
//
// Three kinds, one of each per tier: Metal (ingots, bars), Hide (skins, hides,
// scales) and Core (hearts, cores; magical creatures only). An enemy drops the
// kinds it lists, always of its zone's tier.
//
// PERMANENT IDS: material IDs are stored in `material` rows and settle logs; never
// reuse or renumber them. IDs are tier × 10 + kind (1 Metal, 2 Hide, 3 Core).

export const MATERIAL_KINDS = ['Metal', 'Hide', 'Core'] as const;
export type MaterialKind = (typeof MATERIAL_KINDS)[number];

/** Mean drops per kill of each kind the enemy lists, × its reward scale (zones.ts `rewardScale`). */
export const MATERIAL_CHANCE: Record<MaterialKind, number> = { Metal: 0.3, Hide: 0.3, Core: 0.1 };

export interface MaterialDef {
  id: number;
  tier: number;
  kind: MaterialKind;
  name: string;
}

/** Names per tier, in MATERIAL_KINDS order. */
const NAMES: Record<number, [string, string, string]> = {
  1: ['Copper Ingot', 'Rough Hide', 'Faint Core'],
  2: ['Bog Iron Bar', 'Thick Hide', 'Thorn Heart'],
  3: ['Dwarven Steel Ingot', 'Frostfur Hide', 'Rime Core'],
};

export const MATERIALS: MaterialDef[] = Object.entries(NAMES).flatMap(([tier, names]) =>
  MATERIAL_KINDS.map((kind, k) => ({ id: Number(tier) * 10 + k + 1, tier: Number(tier), kind, name: names[k] }))
);

export const MATERIALS_BY_ID: ReadonlyMap<number, MaterialDef> = new Map(MATERIALS.map(m => [m.id, m]));

/** The tier-`tier` material of `kind`. */
export const materialOf = (tier: number, kind: MaterialKind): MaterialDef =>
  MATERIALS_BY_ID.get(tier * 10 + MATERIAL_KINDS.indexOf(kind) + 1)!;
