// The global rare loot pool: drops any overworld enemy can give on top of its own drops and
// materials, so rare things needn't be listed on every enemy. Each entry is its own Poisson
// draw per kill (loot.ts `rollPool`), × the enemy's rank and, very slightly, its level.
// Item find and `rewardScale` don't apply. Pure data, shared.

import { untieredMaterial } from './materials';
import { ChiselKind, VOIDGLASS_FROM_TIER, chiselSupplyId, chronoshardSupplyId } from './supplies';
import type { EnemyDef, EnemyRank } from './zones';

export type PoolDrop = { kind: 'material'; materialId: number } | { kind: 'supply'; supplyId: number };

export interface PoolEntry {
  drop: PoolDrop;
  /** Chance per kill of a level-0 Basic enemy, before `poolMult`. */
  chance: number;
  /** Only enemies of zones of this tier and up. */
  minTier?: number;
}

/** × the pool's chances by enemy rank. An Elite encounter counts as Elite. */
export const POOL_RANK_MULT: Record<EnemyRank, number> = { Basic: 1, Elite: 2, Boss: 4 };

/** + this share of the chances per enemy level (level 45: × 1.225). */
export const POOL_LEVEL_STEP = 0.005;

/** × the pool's chances for a kill of `enemy`. */
export const poolMult = (enemy: EnemyDef) => POOL_RANK_MULT[enemy.rank ?? 'Basic'] * (1 + POOL_LEVEL_STEP * enemy.level);

export const RARE_POOL: PoolEntry[] = [
  // Voidglass (phials.md): from where the Deep opens. Selvara (Boss, level 45) ~1 in 510 kills, a T4 Basic ~1 in 2,100.
  { drop: { kind: 'material', materialId: untieredMaterial('Voidglass').id }, chance: 0.0004, minTier: VOIDGLASS_FROM_TIER },
  // Chronoshards: a bonus, not progress, so far rarer than Voidglass. Any tier.
  { drop: { kind: 'supply', supplyId: chronoshardSupplyId(1) }, chance: 1 / 20_000 },
  { drop: { kind: 'supply', supplyId: chronoshardSupplyId(2) }, chance: 1 / 60_000 },
  { drop: { kind: 'supply', supplyId: chronoshardSupplyId(3) }, chance: 1 / 200_000 },
  // Chisels (chisel.ts): any tier, between Voidglass and Chronoshards. A T4 Basic: a Chaos ~1 in 2,100 kills.
  { drop: { kind: 'supply', supplyId: chiselSupplyId(ChiselKind.Chaos) }, chance: 1 / 2_500 },
  { drop: { kind: 'supply', supplyId: chiselSupplyId(ChiselKind.Binding) }, chance: 1 / 5_000 },
  { drop: { kind: 'supply', supplyId: chiselSupplyId(ChiselKind.Recalibration) }, chance: 1 / 5_000 },
  { drop: { kind: 'supply', supplyId: chiselSupplyId(ChiselKind.Improvement) }, chance: 1 / 5_000 },
  { drop: { kind: 'supply', supplyId: chiselSupplyId(ChiselKind.Corruption) }, chance: 1 / 2_500 },
];

/** Mean drops per kill of `enemy` in a zone of `tier`, per pool entry it can give. */
export const poolMeans = (enemy: EnemyDef, tier: number): { drop: PoolDrop; mean: number }[] =>
  RARE_POOL.filter(p => tier >= (p.minTier ?? 0)).map(p => ({ drop: p.drop, mean: p.chance * poolMult(enemy) }));
