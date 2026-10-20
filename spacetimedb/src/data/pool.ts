// The global rare loot pool: drops any overworld enemy can give on top of its own drops and
// materials, so rare things needn't be listed on every enemy. Each entry is its own Poisson
// draw per kill (loot.ts `rollPool`), × the enemy's rank and, very slightly, its level.
// Item find and `rewardScale` don't apply. Pure data, shared.

import { untieredMaterial } from './materials';
import { VOIDGLASS_FROM_TIER, chronoshardSupplyId } from './supplies';
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
export const POOL_RANK_MULT: Record<EnemyRank, number> = { Basic: 1, Elite: 3, Boss: 10 };

/** + this share of the chances per enemy level (level 45: × 1.225). */
export const POOL_LEVEL_STEP = 0.005;

/** × the pool's chances for a kill of `enemy`. */
export const poolMult = (enemy: EnemyDef) => POOL_RANK_MULT[enemy.rank ?? 'Basic'] * (1 + POOL_LEVEL_STEP * enemy.level);

export const RARE_POOL: PoolEntry[] = [
  // Voidglass (phials.md): from where the Deep opens. Selvara (Boss, level 45) ~1 in 510 kills, a T4 Basic ~1 in 5,200.
  { drop: { kind: 'material', materialId: untieredMaterial('Voidglass').id }, chance: 0.00016, minTier: VOIDGLASS_FROM_TIER },
  // Chronoshards: a bonus, not progress, so far rarer than Voidglass. Any tier.
  { drop: { kind: 'supply', supplyId: chronoshardSupplyId(1) }, chance: 1 / 50_000 },
  { drop: { kind: 'supply', supplyId: chronoshardSupplyId(2) }, chance: 1 / 150_000 },
  { drop: { kind: 'supply', supplyId: chronoshardSupplyId(3) }, chance: 1 / 500_000 },
];

/** Mean drops per kill of `enemy` in a zone of `tier`, per pool entry it can give. */
export const poolMeans = (enemy: EnemyDef, tier: number): { drop: PoolDrop; mean: number }[] =>
  RARE_POOL.filter(p => tier >= (p.minTier ?? 0)).map(p => ({ drop: p.drop, mean: p.chance * poolMult(enemy) }));
