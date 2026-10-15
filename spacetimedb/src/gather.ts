// Gathering settlement (life-skills.md, "Settlement"): whole actions in the elapsed
// time, in closed form like `project()`. Pure: the client projects with it too.

import {
  GEM_CHANCE,
  MAX_SKILL_LEVEL,
  SkillId,
  doubleYieldChance,
  gatherActionMicros,
  gatherCharacterXpPerAction,
  gatherXpPerAction,
  skillXpToNext,
  type GatheringSkillDef,
} from './data/skills';
import { materialOf } from './data/materials';
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
  /** Expected extra materials from double yield (its chance changes with level). */
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
    const step = gatherActionMicros(level, g.tier, g.toolTier);
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

/**
 * The materials `g`'s actions of `skill` at `tier` yield, action by action: one each, a
 * double yield and Mining's Gem rolled per action, seeded by its end time. So settling in
 * steps gives the same result as settling once, and the client shows each action's
 * yield as it ends. Online settles use this; the login settle rolls `rollGathering`.
 */
export function rollGatheringActions(characterId: bigint, skill: GatheringSkillDef, tier: number, g: Pick<Gathered, 'runs'>): MaterialDrop[] {
  let made = 0;
  let gems = 0;
  for (const run of g.runs) {
    const double = doubleYieldChance(run.level);
    for (let i = 1; i <= run.n; i++) {
      const rng = seededRng(characterId, run.start + BigInt(i) * run.step, GATHER_SALT);
      made += rng() < double ? 2 : 1;
      if (skill.id === SkillId.Mining && rng() < GEM_CHANCE) gems++;
    }
  }
  return gatheredDrops(skill, tier, made, gems);
}

function gatheredDrops(skill: GatheringSkillDef, tier: number, made: number, gems: number): MaterialDrop[] {
  if (made <= 0) return [];
  const out: MaterialDrop[] = [{ materialId: materialOf(tier, skill.makes).id, count: made }];
  if (gems > 0) out.push({ materialId: materialOf(tier, 'Gem').id, count: gems });
  return out;
}

/** The materials `g`'s actions of `skill` at `tier` yield in one draw: one each, plus double yields and Mining's Gems (Poisson draws). */
export function rollGathering(rng: Rng, skill: GatheringSkillDef, tier: number, g: Pick<Gathered, 'actions' | 'doubleMean'>): MaterialDrop[] {
  if (g.actions <= 0) return [];
  const made = g.actions + samplePoisson(rng, g.doubleMean);
  return gatheredDrops(skill, tier, made, skill.id === SkillId.Mining ? samplePoisson(rng, g.actions * GEM_CHANCE) : 0);
}
