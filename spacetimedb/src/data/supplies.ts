// Supplies (life-skills.md): consumables made by production skills and kept as counts in
// `supply` rows, not bag items. Alchemy's elixirs (farming) and Phials (one fight in the
// Moonwell Deep or a raid, phials.md). Pure data, shared.
//
// PERMANENT IDS: supply IDs are stored in `supply` rows, `character.elixirId`,
// `raid_member.phialId`, settle and Abyss logs; never reuse or renumber them. Elixirs are
// 300 + kind × 10 + grade, Phials 400 + kind × 10 + grade, Chronoshards 500 + grade, Chisels 700 + kind. Before
// 2026-10-19 elixirs were tiered: 100 + kind × 10 + tier, Greater (rare herb) 200 + kind
// × 10 + tier; migrate.ts turned those into graded ones (`legacyElixir`).

import { MATERIALS, materialOf } from './materials';

/**
 * "More" multipliers on top of all gear (1 = none): the same +20% with any gear
 * (life-skills.md, "Buff rules"). Phials add the last two (phials.md).
 */
export interface Buffs {
  damage: number;
  attackSpeed: number;
  xp: number;
  gold: number;
  itemFind: number;
  /** × the damage you take, after mitigation (Phial of Warding). */
  damageTaken?: number;
  /** Once per fight, at half HP, heal this share of max HP (Phial of Renewal). */
  renewal?: number;
}
export type BuffStat = Exclude<keyof Buffs, 'damageTaken' | 'renewal'>;

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

// ---------------------------------------------------------------- Phials (phials.md)

export interface PhialKindDef {
  /** 1-based; part of the supply ID. */
  kind: number;
  name: string;
  /** The plain Phial's bonus (grade 1): +8% damage is 0.08, Warding's 8% less damage taken too. */
  bonus: number;
  /** What it does with `bonus` (0.08) as a "more" multiplier or a heal. */
  buffs: (bonus: number) => Partial<Buffs>;
  /** What it does, for the client ("+8% damage"). */
  text: (bonus: number) => string;
}

const pctText = (x: number) => `${Number((x * 100).toFixed(1))}%`;

/** Small on purpose: a Phial is the last little push, not a requirement (phials.md, "Kinds"). */
export const PHIAL_KINDS: PhialKindDef[] = [
  { kind: 1, name: 'Wrath', bonus: 0.08, buffs: b => ({ damage: 1 + b }), text: b => `+${pctText(b)} damage` },
  { kind: 2, name: 'Haste', bonus: 0.06, buffs: b => ({ attackSpeed: 1 + b }), text: b => `+${pctText(b)} attack speed` },
  { kind: 3, name: 'Warding', bonus: 0.08, buffs: b => ({ damageTaken: 1 - b }), text: b => `${pctText(b)} less damage taken` },
  { kind: 4, name: 'Renewal', bonus: 0.3, buffs: b => ({ renewal: b }), text: b => `once a fight, at half HP, heal ${pctText(b)} of max HP` },
];

export interface PhialDef {
  id: number;
  grade: number;
  /** e.g. "Greater Phial of Wrath". */
  name: string;
  phial: PhialKindDef;
  /** The bonus at this grade (× the grade's bonus). */
  bonus: number;
}

export const phialSupplyId = (kind: number, grade: number) => 400 + kind * 10 + grade;

export const PHIALS: PhialDef[] = SUPPLY_GRADES.flatMap(grade => {
  const g = GRADES[grade - 1];
  return PHIAL_KINDS.map(p => ({ id: phialSupplyId(p.kind, grade), grade, name: `${g.prefix}Phial of ${p.name}`, phial: p, bonus: p.bonus * g.bonus }));
});
export const PHIALS_BY_ID: ReadonlyMap<number, PhialDef> = new Map(PHIALS.map(p => [p.id, p]));

/** What Phial `p` does, for the client. */
export const phialText = (p: PhialDef) => p.phial.text(p.bonus);

/** The buffs Phial `supplyId` gives for one fight (undefined for none). */
export function phialBuffs(supplyId: number): Buffs | undefined {
  const p = PHIALS_BY_ID.get(supplyId);
  if (!p) return undefined;
  return { damage: 1, attackSpeed: 1, xp: 1, gold: 1, itemFind: 1, ...p.phial.buffs(p.bonus) };
}

/** Voidglass one Phial brew costs, by the material tier's place in its grade (T1/T4/T7 → 5, T3/T6/T9 → 3). */
export const PHIAL_VOIDGLASS = [5, 4, 3];
export const phialVoidglass = (tier: number) => PHIAL_VOIDGLASS[(tier - 1) % TIERS_PER_GRADE];

// Voidglass sources beyond the Deep's first clears (phials.md, "Where Voidglass comes from").

/** The rare loot pool (data/pool.ts) and Mining nodes pay Voidglass from this tier (where the Deep opens). */
export const VOIDGLASS_FROM_TIER = 4;
/** Voidglass per Unique salvaged, any tier. */
export const UNIQUE_SALVAGE_VOIDGLASS = 2;
/** Voidglass one Void Geode (Mining rare find) cracks into. */
export const GEODE_VOIDGLASS = 2;

// ---------------------------------------------------------------- Chronoshards

/**
 * Using one plays `minutes` of the current activity at once, the way time away does
 * (offline formulas, not counted against the offline cap). Not crafted: System gifts
 * (mail `supply:` tokens) and the rare loot pool (data/pool.ts).
 */
export interface ChronoshardDef {
  id: number;
  grade: number;
  /** e.g. "Greater Chronoshard". */
  name: string;
  minutes: number;
}

export const chronoshardSupplyId = (grade: number) => 500 + grade;

/** Minutes fast-forwarded, by grade. */
export const CHRONOSHARD_MINUTES = [30, 60, 120];

export const CHRONOSHARDS: ChronoshardDef[] = GRADES.map(g => ({
  id: chronoshardSupplyId(g.grade),
  grade: g.grade,
  name: `${g.prefix}Chronoshard`,
  minutes: CHRONOSHARD_MINUTES[g.grade - 1],
}));
export const CHRONOSHARDS_BY_ID: ReadonlyMap<number, ChronoshardDef> = new Map(CHRONOSHARDS.map(c => [c.id, c]));

// ---------------------------------------------------------------- Chisels

/** PERMANENT: part of the supply ID. */
export const ChiselKind = { Recalibration: 1, Chaos: 2, Binding: 3, Improvement: 4, Corruption: 5 } as const;
export type ChiselKind = (typeof ChiselKind)[keyof typeof ChiselKind];

/**
 * Crafting consumables (chisel.ts): each does one thing gold crafting can't. Untiered: any
 * item tier. Not crafted: the rare loot pool (data/pool.ts) and System gifts.
 */
export interface ChiselDef {
  id: number;
  kind: ChiselKind;
  /** e.g. "Chaos Chisel". */
  name: string;
  /** What it does, for the client. */
  text: string;
  /** The player picks an affix: a regular one, or (Binding) the legendary one too. */
  target?: 'affix' | 'affixOrLegendary';
}

export const chiselSupplyId = (kind: ChiselKind) => 700 + kind;

export const CHISELS: ChiselDef[] = [
  { id: chiselSupplyId(ChiselKind.Recalibration), kind: ChiselKind.Recalibration, name: 'Recalibration Chisel',
    text: 'Rerolls the value of every affix within its tier, the legendary bonus too. Works on Uniques.' },
  { id: chiselSupplyId(ChiselKind.Chaos), kind: ChiselKind.Chaos, name: 'Chaos Chisel',
    text: 'Rerolls every affix as new random ones, the legendary affix included.' },
  { id: chiselSupplyId(ChiselKind.Binding), kind: ChiselKind.Binding, name: 'Binding Chisel', target: 'affixOrLegendary',
    text: 'Binds one affix for good: nothing changes it any more. One per item.' },
  { id: chiselSupplyId(ChiselKind.Improvement), kind: ChiselKind.Improvement, name: 'Improvement Chisel', target: 'affix',
    text: "Raises one affix a tier, up to the item's tier." },
  { id: chiselSupplyId(ChiselKind.Corruption), kind: ChiselKind.Corruption, name: 'Corruption Chisel',
    text: 'Corrupts the item with one random outcome: add or remove an affix, raise or lower an affix tier (past the usual limits), reroll every value, or nothing. It can never be modified again.' },
];
export const CHISELS_BY_ID: ReadonlyMap<number, ChiselDef> = new Map(CHISELS.map(c => [c.id, c]));

/** How often each chisel is the one found, against the others: Chaos and Corruption twice as often, as in the rare loot pool. */
export const CHISEL_WEIGHT: Record<ChiselKind, number> = {
  [ChiselKind.Recalibration]: 1,
  [ChiselKind.Chaos]: 2,
  [ChiselKind.Binding]: 1,
  [ChiselKind.Improvement]: 1,
  [ChiselKind.Corruption]: 2,
};
const CHISEL_WEIGHT_TOTAL = CHISELS.reduce((sum, c) => sum + CHISEL_WEIGHT[c.kind], 0);

/** A chisel picked by CHISEL_WEIGHT, from a roll in [0, 1). */
export function pickChisel(roll: number): ChiselDef {
  let r = roll * CHISEL_WEIGHT_TOTAL;
  return CHISELS.find(c => (r -= CHISEL_WEIGHT[c.kind]) < 0) ?? CHISELS[CHISELS.length - 1];
}

/** Any supply's name: elixir, Phial, Chronoshard or Chisel. */
export const supplyName = (id: number) =>
  SUPPLIES_BY_ID.get(id)?.name ?? PHIALS_BY_ID.get(id)?.name ?? CHRONOSHARDS_BY_ID.get(id)?.name ?? CHISELS_BY_ID.get(id)?.name ?? `Supply ${id}`;

/** Whether `id` is a supply of any kind. */
export const isSupplyId = (id: number) => SUPPLIES_BY_ID.has(id) || PHIALS_BY_ID.has(id) || CHRONOSHARDS_BY_ID.has(id) || CHISELS_BY_ID.has(id);

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
