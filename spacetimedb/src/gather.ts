// Gathering settlement (life-skills.md, "Settlement"): whole actions in the elapsed
// time, in closed form like `project()`. Pure: the client projects with it too.

import {
  MAX_SKILL_LEVEL,
  RELIC_HOURS,
  SkillId,
  doubleYieldChance,
  findChances,
  gemChance,
  mainChance,
  gatherActionMicros,
  gatherCharacterXpPerAction,
  gatherXpPerAction,
  skillXpToNext,
  type GatheringSkillDef,
} from './data/skills';
import { materialOf } from './data/materials';
import { craftCost } from './craft';
import { samplePoisson, seededRng, type MaterialDrop, type Rng } from './loot';

export interface SkillProgress {
  level: number;
  /** XP toward the next level. */
  xp: bigint;
  /** Micros since Unix epoch up to which actions have been granted. */
  settledMicros: bigint;
}

export interface Gathered extends SkillProgress {
  /** Whole actions granted. */
  actions: number;
  xpGained: bigint;
  /** Expected extra main materials from double yield (its chance changes with level), before the node's main chance. */
  doubleMean: number;
  /** The actions as runs at one level (one per level-up): `n` actions of `step`, the first ending at `start + step`. */
  runs: { start: bigint; step: bigint; n: number; level: number }[];
}

/** `level` and `xp` after gaining `gain` skill XP, with level-ups (none at max level). */
export function addSkillXp(level: number, xp: bigint, gain: bigint): { level: number; xp: bigint } {
  if (level >= MAX_SKILL_LEVEL) return { level, xp: 0n };
  xp += gain;
  for (let need = skillXpToNext(level); level < MAX_SKILL_LEVEL && xp >= need; need = skillXpToNext(level)) {
    xp -= need;
    level += 1;
  }
  return { level, xp: level >= MAX_SKILL_LEVEL ? 0n : xp };
}

/**
 * Gathering at `tier` with a tool of `toolTier` from `p.settledMicros` to `nowMicros`.
 * Only whole actions are granted; the time toward the next one carries over. The
 * action speed is recomputed at each level-up. If `capMicros` is hit, the remaining
 * time is discarded.
 */
export function projectGathering(p: SkillProgress, g: { tier: number; toolTier: number }, nowMicros: bigint, capMicros?: bigint): Gathered {
  let elapsed = nowMicros - p.settledMicros;
  if (elapsed <= 0n) return { ...p, actions: 0, xpGained: 0n, doubleMean: 0, runs: [] };
  const capped = capMicros !== undefined && elapsed > capMicros;
  if (capped) elapsed = capMicros!;

  const perAction = gatherXpPerAction(g.tier);
  let { level, xp } = p;
  let actions = 0;
  let xpGained = 0n;
  let doubleMean = 0;
  const runs: Gathered['runs'] = [];
  let left = elapsed;
  for (;;) {
    const step = gatherActionMicros(g.toolTier);
    const available = Number(left / step);
    if (available <= 0) break;
    // Stop at the next level-up: the speed changes there.
    const maxed = level >= MAX_SKILL_LEVEL;
    const n = maxed ? available : Math.min(available, Math.ceil(Number(skillXpToNext(level) - xp) / perAction));
    runs.push({ start: p.settledMicros + elapsed - left, step, n, level });
    actions += n;
    doubleMean += n * doubleYieldChance(level);
    left -= BigInt(n) * step;
    if (!maxed) {
      const gained = BigInt(Math.floor(n * perAction));
      xpGained += gained;
      ({ level, xp } = addSkillXp(level, xp, gained));
    }
    if (n === available) break;
  }
  const settledMicros = capped ? nowMicros : p.settledMicros + elapsed - left;
  return { level, xp, settledMicros, actions, xpGained, doubleMean, runs };
}

/** Character XP for `actions` gathering actions at `tier` (also at the max skill level). */
export const gatherCharacterXp = (actions: number, tier: number): bigint => BigInt(Math.floor(actions * gatherCharacterXpPerAction(tier)));

/** Mixed into gathering seeds. */
export const GATHER_SALT = 0x676174686572n; // "gather"

/** What gathering actions yield: materials (the main one, Mining's Gems, rare finds) and Relics, sold on the spot. */
export interface GatherYield {
  materials: MaterialDrop[];
  relics: number;
  /** What the Relics sold for. */
  gold: bigint;
}

/** Gold one Relic of `tier` sells for (life-skills.md, "Mining: Relics"). */
export const relicGold = (tier: number): bigint => craftCost(RELIC_HOURS, tier).gold;

/**
 * What `g`'s actions of `skill` at `tier` and `node` (0: the normal node) yield, action by
 * action: the main material (with double yield), Mining's Gem and the rare finds rolled
 * per action, seeded by its end time. So settling in steps gives the same result as
 * settling once, and the client shows each action's yield as it ends. Online settles use
 * this; the login settle rolls `rollGathering`.
 */
export function rollGatheringActions(characterId: bigint, skill: GatheringSkillDef, tier: number, g: Pick<Gathered, 'runs'>, node = 0): GatherYield {
  const main = mainChance(node);
  const gem = gemChance(node);
  let made = 0;
  let gems = 0;
  const found = new Map<number | undefined, number>();
  for (const run of g.runs) {
    const double = doubleYieldChance(run.level);
    const finds = findChances(skill.id, tier, node, run.level);
    for (let i = 1; i <= run.n; i++) {
      const rng = seededRng(characterId, run.start + BigInt(i) * run.step, GATHER_SALT);
      // The normal node's rolls come first, in their old order.
      const twice = rng() < double;
      if (skill.id === SkillId.Mining && rng() < gem) gems++;
      if (main >= 1 || rng() < main) made += twice ? 2 : 1;
      for (const f of finds) if (rng() < f.chance) found.set(f.materialId, (found.get(f.materialId) ?? 0) + f.count);
    }
  }
  return gatheredYield(skill, tier, made, gems, found);
}

function gatheredYield(skill: GatheringSkillDef, tier: number, made: number, gems: number, found: Map<number | undefined, number>): GatherYield {
  const materials: MaterialDrop[] = [];
  if (made > 0) materials.push({ materialId: materialOf(tier, skill.makes).id, count: made });
  if (gems > 0) materials.push({ materialId: materialOf(tier, 'Gem').id, count: gems });
  let relics = 0;
  for (const [materialId, count] of found) {
    if (count <= 0) continue;
    if (materialId === undefined) relics += count;
    else materials.push({ materialId, count });
  }
  return { materials, relics, gold: BigInt(relics) * relicGold(tier) };
}

/**
 * What `g`'s actions of `skill` at `tier` and `node` yield in one draw: the main material
 * plus double yields, Mining's Gems and the rare finds (Poisson draws).
 */
export function rollGathering(
  rng: Rng,
  skill: GatheringSkillDef,
  tier: number,
  g: Pick<Gathered, 'actions' | 'doubleMean'> & Partial<Pick<Gathered, 'runs'>>,
  node = 0
): GatherYield {
  const found = new Map<number | undefined, number>();
  if (g.actions <= 0) return gatheredYield(skill, tier, 0, 0, found);
  const main = mainChance(node);
  const made = main >= 1 ? g.actions + samplePoisson(rng, g.doubleMean) : samplePoisson(rng, main * (g.actions + g.doubleMean));
  const gems = skill.id === SkillId.Mining ? samplePoisson(rng, g.actions * gemChance(node)) : 0;
  // Finds, then the materials each gives (a Void Geode cracks into several).
  const means = new Map<number | undefined, { mean: number; count: number }>();
  for (const run of g.runs ?? [])
    for (const f of findChances(skill.id, tier, node, run.level))
      means.set(f.materialId, { mean: (means.get(f.materialId)?.mean ?? 0) + run.n * f.chance, count: f.count });
  for (const [id, { mean, count }] of means) found.set(id, samplePoisson(rng, mean) * count);
  return gatheredYield(skill, tier, made, gems, found);
}
