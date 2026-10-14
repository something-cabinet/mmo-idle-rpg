// Display helpers for life skills, shared by the skill pages, the top bar and reports.

import type { Recipe } from '../../spacetimedb/src/data/recipes';
import type { SupplyDef } from '../../spacetimedb/src/data/supplies';

/** A recipe's name for lists and logs: elixirs carry their tier, bases and tools have it in their name. */
export const recipeLabel = (r: Recipe) => (r.output.kind === 'supply' ? `${r.name} T${r.tier}` : r.name);

/** An elixir's effect: full up to its tier, half above. */
export const elixirText = (sup: SupplyDef) => {
  const e = sup.elixir;
  return `×${e.mult} ${e.text} (×${Number((1 + (e.mult - 1) / 2).toFixed(3))} above T${sup.tier} zones)`;
};
