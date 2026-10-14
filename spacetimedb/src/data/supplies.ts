// Supplies (life-skills.md): consumables made by production skills and kept as counts in
// `supply` rows, not bag items. Only Alchemy's elixirs so far. Pure data, shared.
//
// PERMANENT IDS: supply IDs are stored in `supply` rows, `character.elixirId` and settle
// logs; never reuse or renumber them. Elixirs are 100 + kind × 10 + tier.

import { MATERIALS } from './materials';

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
  /** Full effect, in zones of the elixir's tier or lower. */
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

export interface SupplyDef {
  id: number;
  tier: number;
  /** e.g. "Elixir of Wrath"; the tier is shown next to it. */
  name: string;
  elixir: ElixirDef;
}

/** Tiers with materials: recipes need them. */
export const SUPPLY_TIERS = [...new Set(MATERIALS.map(m => m.tier))].sort((a, b) => a - b);

export const elixirSupplyId = (kind: number, tier: number) => 100 + kind * 10 + tier;

export const SUPPLIES: SupplyDef[] = SUPPLY_TIERS.flatMap(tier =>
  ELIXIRS.map(e => ({ id: elixirSupplyId(e.kind, tier), tier, name: `Elixir of ${e.name}`, elixir: e }))
);
export const SUPPLIES_BY_ID: ReadonlyMap<number, SupplyDef> = new Map(SUPPLIES.map(s => [s.id, s]));

/** An elixir's multiplier in a zone of `zoneTier`: full up to its tier, half above. */
export const elixirMult = (s: SupplyDef, zoneTier: number) => (zoneTier <= s.tier ? s.elixir.mult : 1 + (s.elixir.mult - 1) / 2);

/** The buffs elixir `supplyId` gives in a zone of `zoneTier` (undefined for no elixir). */
export function elixirBuffs(supplyId: number, zoneTier: number): Buffs | undefined {
  const s = SUPPLIES_BY_ID.get(supplyId);
  if (!s) return undefined;
  return { damage: 1, attackSpeed: 1, xp: 1, gold: 1, itemFind: 1, [s.elixir.stat]: elixirMult(s, zoneTier) };
}
