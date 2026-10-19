// Supplies (life-skills.md): consumables made by production skills and kept as counts in
// `supply` rows, not bag items. Only Alchemy's elixirs so far. Pure data, shared.
//
// PERMANENT IDS: supply IDs are stored in `supply` rows, `character.elixirId`, settle and
// Abyss logs; never reuse or renumber them. Elixirs are 300 + kind × 10 + grade. Before
// 2026-10-19 elixirs were tiered: 100 + kind × 10 + tier, Greater (rare herb) 200 + kind
// × 10 + tier; migrate.ts turned those into graded ones (`legacyElixir`).

import { MATERIALS, materialOf } from './materials';

/**
 * "More" multipliers on top of all gear (1 = none): the same +20% with any gear
 * (life-skills.md, "Buff rules").
 */
export interface Buffs {
  damage: number;
  attackSpeed: number;
  xp: number;
  gold: number;
  itemFind: number;
}
export type BuffStat = keyof Buffs;

export interface ElixirDef {
  /** 1-based; part of the supply ID. */
  kind: number;
  name: string;
  /** Power and profit elixirs share the one elixir slot. */
  group: 'Power' | 'Profit';
  stat: BuffStat;
  /** The plain Elixir's multiplier (grade 1, not infused). */
  mult: number;
  /** What it raises, for the client. */
  text: string;
}

export const ELIXIRS: ElixirDef[] = [
  { kind: 1, name: 'Wrath', group: 'Power', stat: 'damage', mult: 1.2, text: 'damage' },
  { kind: 2, name: 'Haste', group: 'Power', stat: 'attackSpeed', mult: 1.15, text: 'attack speed' },
  { kind: 3, name: 'Wisdom', group: 'Profit', stat: 'xp', mult: 1.2, text: 'XP' },
  { kind: 4, name: 'Greed', group: 'Profit', stat: 'gold', mult: 1.2, text: 'gold' },
  { kind: 5, name: 'Fortune', group: 'Profit', stat: 'itemFind', mult: 1.2, text: 'item find' },
];

/** Kills one elixir lasts (~1 h of reference farming, zones.md). Losing fights and walking use none. */
export const ELIXIR_KILLS = 240;

/** Material tiers per grade: grade 1 is T1–T3, grade 2 T4–T6, grade 3 T7–T9. */
export const TIERS_PER_GRADE = 3;

export interface GradeDef {
  grade: number;
  /** Prefix of the elixir's name ("" for the first grade). */
  prefix: string;
  /** × the plain Elixir's bonus (Wrath +20% → +30% → +40%). */
  bonus: number;
}

export const GRADES: GradeDef[] = [
  { grade: 1, prefix: '', bonus: 1 },
  { grade: 2, prefix: 'Greater ', bonus: 1.5 },
  { grade: 3, prefix: 'Divine ', bonus: 2 },
];

/** The elixir grade tier-`tier` materials brew. */
export const gradeOf = (tier: number) => Math.ceil(tier / TIERS_PER_GRADE);

/** The material tiers of `grade`. */
export const gradeTiers = (grade: number) => Array.from({ length: TIERS_PER_GRADE }, (_, i) => (grade - 1) * TIERS_PER_GRADE + i + 1);

/** Elixirs one brew makes, by the material tier's place in its grade (T1/T4/T7 → 2, T3/T6/T9 → 4). */
export const BREW_YIELD = [2, 3, 4];
export const brewYield = (tier: number) => BREW_YIELD[(tier - 1) % TIERS_PER_GRADE];

/** Infusing (one rare herb of the elixir's grade, any tier) gives INFUSE_BONUS × the bonus. */
export const INFUSE_BONUS = 1.5;

export interface SupplyDef {
  id: number;
  grade: number;
  /** e.g. "Greater Elixir of Wrath". */
  name: string;
  elixir: ElixirDef;
  /** Multiplier, not infused. */
  mult: number;
  /** Multiplier when infused. */
  infusedMult: number;
}

/** Tiers with materials: recipes need them (untiered materials are tier 0). */
export const SUPPLY_TIERS = [...new Set(MATERIALS.map(m => m.tier))].filter(t => t > 0).sort((a, b) => a - b);

/** Grades with at least one tier of materials. */
export const SUPPLY_GRADES = [...new Set(SUPPLY_TIERS.map(gradeOf))];

export const elixirSupplyId = (kind: number, grade: number) => 300 + kind * 10 + grade;

const bonusMult = (e: ElixirDef, times: number) => 1 + (e.mult - 1) * times;

export const SUPPLIES: SupplyDef[] = SUPPLY_GRADES.flatMap(grade => {
  const g = GRADES[grade - 1];
  return ELIXIRS.map(e => ({
    id: elixirSupplyId(e.kind, grade),
    grade,
    name: `${g.prefix}Elixir of ${e.name}`,
    elixir: e,
    mult: bonusMult(e, g.bonus),
    infusedMult: bonusMult(e, g.bonus * INFUSE_BONUS),
  }));
});
export const SUPPLIES_BY_ID: ReadonlyMap<number, SupplyDef> = new Map(SUPPLIES.map(s => [s.id, s]));

/** The rare herbs that can infuse an elixir of `grade`, lowest tier first. */
export const infuseHerbIds = (grade: number) => gradeTiers(grade).filter(t => SUPPLY_TIERS.includes(t)).map(t => materialOf(t, 'Herb').id);

/** The buffs elixir `supplyId` gives (undefined for no elixir). */
export function elixirBuffs(supplyId: number, infused = false): Buffs | undefined {
  const s = SUPPLIES_BY_ID.get(supplyId);
  if (!s) return undefined;
  return { damage: 1, attackSpeed: 1, xp: 1, gold: 1, itemFind: 1, [s.elixir.stat]: infused ? s.infusedMult : s.mult };
}

/**
 * A pre-2026-10-19 elixir ID (100 + kind × 10 + tier, Greater 200 + …): the graded
 * elixir it became and the tier of the herb a Greater one used. Undefined for other IDs.
 */
export function legacyElixir(id: number): { supplyId: number; herbTier?: number } | undefined {
  if (id < 100 || id >= 300) return undefined;
  const kind = Math.floor((id % 100) / 10);
  const tier = id % 10;
  if (!ELIXIRS.some(e => e.kind === kind) || tier < 1) return undefined;
  return { supplyId: elixirSupplyId(kind, gradeOf(tier)), ...(id >= 200 && { herbTier: tier }) };
}
