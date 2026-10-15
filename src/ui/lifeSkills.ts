// Display helpers for life skills, shared by the skill pages, the top bar and reports.

import type { Recipe } from '../../spacetimedb/src/data/recipes';
import type { SupplyDef } from '../../spacetimedb/src/data/supplies';
import { MAX_SKILL_LEVEL, SkillId, doubleYieldChance, temperRequirement, tierRequirement, type SkillDef } from '../../spacetimedb/src/data/skills';
import { MAX_TEMPER } from '../../spacetimedb/src/data/recipes';
import { materialOf } from '../../spacetimedb/src/data/materials';
import { ZONES } from '../../spacetimedb/src/data/zones';
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

/** What working tier `tier` means for `skill`. */
function tierText(skill: SkillDef, tier: number): string {
  if (skill.kind === 'Gathering') return `Gather ${materialOf(tier, skill.makes).name}`;
  if (skill.id === SkillId.Smithing) return `Forge, smelt and temper T${tier}${tier > 1 ? `, make T${tier} tools` : ''}`;
  if (skill.id === SkillId.Alchemy) return `Brew T${tier} elixirs`;
  return `Tier ${tier} recipes`;
}

/** Every level of `skill` that unlocks something, in level order. */
export function skillMilestones(skill: SkillDef): { level: number; perks: string[] }[] {
  const perks: [number, string][] = [];
  for (const tier of TIERS) perks.push([tierRequirement(tier), tierText(skill, tier)]);
  const extra = skill.kind === 'Gathering' ? 'double yield' : 'chance to keep the inputs';
  for (const lv of [50, MAX_SKILL_LEVEL]) perks.push([lv, `${pct(doubleYieldChance(lv))} ${extra}`]);
  if (skill.id === SkillId.Smithing) {
    for (let k = 1; k <= MAX_TEMPER; k++) perks.push([temperRequirement(k), `Temper up to +${k}`]);
  }
  perks.push([MAX_SKILL_LEVEL, 'Max level']);

  const byLevel = new Map<number, string[]>();
  for (const [level, text] of perks.filter(([l]) => l <= MAX_SKILL_LEVEL).sort((a, b) => a[0] - b[0])) {
    byLevel.set(level, [...(byLevel.get(level) ?? []), text]);
  }
  return [...byLevel].map(([level, list]) => ({ level, perks: list }));
}
