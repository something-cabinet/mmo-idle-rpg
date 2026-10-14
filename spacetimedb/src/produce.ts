// Production settlement (life-skills.md, "Production" and "Settlement"): a queue of one
// recipe, action by action (a few per hour), until its count, the inputs or the bag run
// out. Pure: the client projects with it too.

import { MAX_SKILL_LEVEL, doubleYieldChance, productionActionMicros, productionXpPerAction, tierRequirement } from './data/skills';
import type { MaterialCost, Recipe } from './data/recipes';
import { addSkillXp, type SkillProgress } from './gather';
import { makeItem, passesFilter, seededRng, type LootFilter, type NewItem, type RarityName, type Rng } from './loot';

export interface Queue {
  /** Actions still queued. */
  countLeft: number;
  /** Material ID → count held. */
  have: (materialId: number) => number;
  /** Free bag slots, for recipes that make items. */
  bagFree: number;
  /** Whether the item an action makes is kept (the forge keep rule); salvaged ones take no bag slot. Default: all kept. */
  keeps?: (made: { at: bigint; level: number }) => boolean;
}

export interface Produced extends SkillProgress {
  actions: number;
  xpGained: bigint;
  countLeft: number;
  /** Inputs used up (an action that keeps its inputs uses none). */
  used: MaterialCost[];
  /** Each action's end and the skill level it was made at, to seed and roll what it made; `kept` by the forge keep rule. */
  made: { at: bigint; level: number; kept: boolean }[];
  /** When the queue ran out (count, inputs or bag); undefined while it still runs. */
  endedAt?: bigint;
}

/** Mixed into keep-inputs seeds. */
const KEEP_SALT = 0x6b656570n; // "keep"

/**
 * Production of `r` from `p.settledMicros` to `nowMicros`. Only whole actions are made;
 * the time toward the next one carries over. Each action's speed and keep-inputs chance
 * use the level it starts at; whether it keeps its inputs is seeded by its end time, so
 * settling in steps gives the same result as settling once. If `capMicros` is hit, the
 * remaining time is discarded. When the queue runs out, `endedAt` is when, and
 * `settledMicros` stops there (the caller goes back to combat from that time).
 */
export function projectProduction(p: SkillProgress, r: Recipe, q: Queue, characterId: bigint, nowMicros: bigint, capMicros?: bigint): Produced {
  const start = p.settledMicros;
  const capped = capMicros !== undefined && nowMicros - start > capMicros;
  const end = capped ? start + capMicros! : nowMicros;
  const perAction = productionXpPerAction(r.tier, r.seconds);
  const stock = new Map(r.inputs.map(i => [i.materialId, q.have(i.materialId)]));
  const used = new Map(r.inputs.map(i => [i.materialId, 0]));
  const made: Produced['made'] = [];
  let { level, xp } = p;
  let xpGained = 0n;
  let countLeft = q.countLeft;
  let bagFree = r.output.kind === 'item' ? q.bagFree : Infinity;
  let t = start;
  let endedAt: bigint | undefined;
  for (;;) {
    if (countLeft <= 0 || bagFree <= 0 || r.inputs.some(i => stock.get(i.materialId)! < i.count)) {
      endedAt = t;
      break;
    }
    const step = productionActionMicros(level, r.tier, r.seconds);
    if (t + step > end) break;
    t += step;
    const kept = r.output.kind !== 'item' || (q.keeps?.({ at: t, level }) ?? true);
    made.push({ at: t, level, kept });
    countLeft--;
    if (kept) bagFree--;
    if (seededRng(characterId, t, KEEP_SALT)() >= doubleYieldChance(level)) {
      for (const i of r.inputs) {
        stock.set(i.materialId, stock.get(i.materialId)! - i.count);
        used.set(i.materialId, used.get(i.materialId)! + i.count);
      }
    }
    if (level < MAX_SKILL_LEVEL) {
      xpGained += perAction;
      ({ level, xp } = addSkillXp(level, xp, perAction));
    }
  }
  return {
    level,
    xp,
    settledMicros: endedAt ?? (capped ? nowMicros : t),
    actions: made.length,
    xpGained,
    countLeft,
    used: [...used].filter(([, n]) => n > 0).map(([materialId, count]) => ({ materialId, count })),
    made,
    endedAt,
  };
}

/** Character XP for `actions` of `r`: as much as the skill XP (also at the max skill level). */
export const productionCharacterXp = (actions: number, r: Recipe): bigint => BigInt(actions) * productionXpPerAction(r.tier, r.seconds);

/** Chance a forged base is Rare (never higher). */
export const FORGE_RARE_CHANCE = 0.02;

/** Chance a forged base is Magic: 20%, +0.5% per Smithing level above the tier's requirement. */
export const forgeMagicChance = (level: number, tier: number) => 0.2 + 0.005 * Math.max(0, level - tierRequirement(tier));

/** Masterwork: the lowest affix tier a base forged at `level` rolls, +1 per 20 levels above the requirement (capped at the item tier). */
export const masterworkTier = (level: number, tier: number) => Math.min(tier, 1 + Math.floor(Math.max(0, level - tierRequirement(tier)) / 20));

export function forgeRarity(rng: Rng, level: number, tier: number): RarityName {
  const r = rng();
  return r < FORGE_RARE_CHANCE ? 'Rare' : r < FORGE_RARE_CHANCE + forgeMagicChance(level, tier) ? 'Magic' : 'Common';
}

/** A base forged at Smithing `level` (life-skills.md, "Smithing: forge a base"). */
export function forgeItem(rng: Rng, baseId: number, tier: number, level: number): NewItem {
  return makeItem(rng, baseId, tier, forgeRarity(rng, level, tier), masterworkTier(level, tier));
}

/**
 * The forge keep rule: forged bases below `minRarity`, without one of `keepAffixes` or
 * without an affix of `minAffixTier` are salvaged (like the loot filter, without types:
 * the base is chosen). No rule keeps everything.
 */
export type ForgeFilter = Omit<LootFilter, 'keepTypes'>;

const FORGE_SALT = 0x666f726765n; // "forge"

/** What forge recipe `r` makes in the action ending at `at`, made at `level`, and whether `f` keeps it. */
export function forged(characterId: bigint, r: Recipe, made: { at: bigint; level: number }, f?: ForgeFilter): { item: NewItem; kept: boolean } {
  if (r.output.kind !== 'item') throw new Error('Not a forge recipe');
  const item = forgeItem(seededRng(characterId, made.at, FORGE_SALT), r.output.baseId, r.tier, made.level);
  return { item, kept: !f || passesFilter(item, { ...f, keepTypes: [] }) };
}
