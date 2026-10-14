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
  type SkillDef,
} from './data/skills';
import { materialOf } from './data/materials';
import { samplePoisson, type MaterialDrop, type Rng } from './loot';

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
  if (elapsed <= 0n) return { ...p, actions: 0, xpGained: 0n, doubleMean: 0 };
  const capped = capMicros !== undefined && elapsed > capMicros;
  if (capped) elapsed = capMicros!;

  const perAction = gatherXpPerAction(g.tier);
  let { level, xp } = p;
  let actions = 0;
  let xpGained = 0n;
  let doubleMean = 0;
  let left = elapsed;
  for (;;) {
    const step = gatherActionMicros(level, g.tier, g.toolTier);
    const available = Number(left / step);
    if (available <= 0) break;
    // Stop at the next level-up: the speed changes there.
    const maxed = level >= MAX_SKILL_LEVEL;
    const n = maxed ? available : Math.min(available, Math.ceil(Number(skillXpToNext(level) - xp) / perAction));
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
  return { level, xp, settledMicros, actions, xpGained, doubleMean };
}

/** Character XP for `actions` gathering actions at `tier` (also at the max skill level). */
export const gatherCharacterXp = (actions: number, tier: number): bigint => BigInt(Math.floor(actions * gatherCharacterXpPerAction(tier)));

/** The materials `g`'s actions of `skill` at `tier` yield: one each, plus double yields and Mining's Gems (Poisson draws). */
export function rollGathering(rng: Rng, skill: SkillDef, tier: number, g: Pick<Gathered, 'actions' | 'doubleMean'>): MaterialDrop[] {
  if (g.actions <= 0) return [];
  const out: MaterialDrop[] = [{ materialId: materialOf(tier, skill.makes).id, count: g.actions + samplePoisson(rng, g.doubleMean) }];
  if (skill.id === SkillId.Mining) {
    const gems = samplePoisson(rng, g.actions * GEM_CHANCE);
    if (gems > 0) out.push({ materialId: materialOf(tier, 'Gem').id, count: gems });
  }
  return out;
}
