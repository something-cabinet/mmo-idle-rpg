// Display helpers for life skills, shared by the skill pages, the top bar and reports.

import type { Recipe } from '../../spacetimedb/src/data/recipes';
import type { SupplyDef } from '../../spacetimedb/src/data/supplies';
import { MAX_SKILL_LEVEL, SkillId, doubleYieldChance, tierRequirement, type SkillDef } from '../../spacetimedb/src/data/skills';
import { materialOf } from '../../spacetimedb/src/data/materials';
import { ZONES } from '../../spacetimedb/src/data/zones';
import { masterworkTier } from '../../spacetimedb/src/produce';
import { pct } from './format';

/** A recipe's name for lists and logs: elixirs carry their tier, bases and tools have it in their name. */
export const recipeLabel = (r: Recipe) => (r.output.kind === 'supply' ? `${r.name} T${r.tier}` : r.name);

/** An elixir's effect: full up to its tier, half above. */
export const elixirText = (sup: SupplyDef) => {
  const e = sup.elixir;
  return `×${e.mult} ${e.text} (×${Number((1 + (e.mult - 1) / 2).toFixed(3))} above T${sup.tier} zones)`;
};

// Milestones (life-skills.md, "Levels and gating"), from the same formulas the server uses.

const TIERS = [...new Set(ZONES.map(z => z.tier))].sort((a, b) => a - b);
/** Levels above a tier's requirement for the full +20% speed there (levelSpeedBonus). */
const SPEED_LEVELS = 20;

/** What working tier `tier` means for `skill`. */
function tierText(skill: SkillDef, tier: number): string {
  if (skill.kind === 'Gathering') return `Gather ${materialOf(tier, skill.makes).name} (needs a T${tier} ${skill.tool})`;
  if (skill.id === SkillId.Smithing) return tier > 1 ? `Forge T${tier} gear, make T${tier} tools` : `Forge T${tier} gear`;
  if (skill.id === SkillId.Alchemy) return `Brew T${tier} elixirs`;
  return `Tier ${tier} recipes`;
}

/** Every level of `skill` that unlocks something, in level order. */
export function skillMilestones(skill: SkillDef): { level: number; perks: string[] }[] {
  const perks: [number, string][] = [];
  for (const tier of TIERS) perks.push([tierRequirement(tier), tierText(skill, tier)]);
  for (const tier of TIERS) perks.push([tierRequirement(tier) + SPEED_LEVELS, `Max speed at T${tier} (+20%)`]);
  if (skill.id === SkillId.Smithing) {
    for (const tier of TIERS) {
      for (let lv = tierRequirement(tier); lv <= MAX_SKILL_LEVEL; lv++) {
        const floor = masterworkTier(lv, tier);
        if (floor > masterworkTier(lv - 1, tier)) perks.push([lv, `Masterwork: T${tier} forges roll ${floor === tier ? `only tier ${floor}` : `tier ${floor}+`} affixes`]);
      }
    }
  }
  const extra = skill.kind === 'Gathering' ? 'double yield' : 'chance to keep the inputs';
  for (const lv of [50, MAX_SKILL_LEVEL]) perks.push([lv, `${pct(doubleYieldChance(lv))} ${extra}`]);
  perks.push([MAX_SKILL_LEVEL, 'Max level']);

  const byLevel = new Map<number, string[]>();
  for (const [level, text] of perks.filter(([l]) => l <= MAX_SKILL_LEVEL).sort((a, b) => a[0] - b[0])) {
    byLevel.set(level, [...(byLevel.get(level) ?? []), text]);
  }
  return [...byLevel].map(([level, list]) => ({ level, perks: list }));
}
