import { SenderError, t } from 'spacetimedb/server';
import { spacetimedb } from '../schema';
import { SKILLS_BY_ID, gatherBlocker, productionBlocker } from '../data/skills';
import { affordable, recipeOf } from '../data/recipes';
import { ELIXIR_KILLS, SUPPLIES_BY_ID } from '../data/supplies';
import {
  NO_SKILL,
  bagCount,
  materialCounts,
  requireActive,
  settle,
  skillRow,
  supplyCount,
  takeSupply,
  tierUnlocked,
  toolTier,
} from '../helpers';

/**
 * Starts gathering `skillId` at `tier` (life-skills.md): instead of fighting, online and
 * offline. Needs the skill level, a tool of that tier and the tier's zone unlocked.
 * Settles the current activity first; the combat target is kept for `stopSkill`.
 */
export const startGathering = spacetimedb.reducer({ skillId: t.u8(), tier: t.u8() }, (ctx, { skillId, tier }) => {
  const { ch } = requireActive(ctx);
  const def = SKILLS_BY_ID.get(skillId);
  if (!def || def.kind !== 'Gathering') throw new SenderError('No such skill');
  const settled = settle(ctx, ch);
  const blocker = gatherBlocker({
    level: skillRow(ctx, ch.id, def.id).level,
    tier,
    toolTier: toolTier(ctx, ch.id, def.id),
    zoneOpen: tierUnlocked(ctx, ch.id, tier),
    tool: def.tool,
  });
  if (blocker) throw new SenderError(blocker);
  ctx.db.character.id.update({ ...settled, ...NO_SKILL, activitySkill: def.id, activityRecipe: tier });
});

/**
 * Starts a production queue (life-skills.md, "Production"): `count` actions of recipe
 * `recipe` of `skillId`, instead of fighting. It ends early when the inputs or the bag
 * run out, then the character goes back to the kept combat target. Needs the skill
 * level and zone of the recipe's tier, inputs for one action and, for a base, bag room.
 */
export const startProduction = spacetimedb.reducer({ skillId: t.u8(), recipe: t.u16(), count: t.u32() }, (ctx, { skillId, recipe, count }) => {
  const { ch } = requireActive(ctx);
  const def = SKILLS_BY_ID.get(skillId);
  if (!def || def.kind !== 'Production') throw new SenderError('No such skill');
  const r = recipeOf(def.id, recipe);
  if (!r) throw new SenderError('No such recipe');
  if (count < 1 || count > r.max) throw new SenderError(r.max === 1 ? 'Make one at a time' : `Queue 1 to ${r.max}`);
  const settled = settle(ctx, ch);
  const blocker = productionBlocker({ level: skillRow(ctx, ch.id, def.id).level, tier: r.tier, zoneOpen: tierUnlocked(ctx, ch.id, r.tier) });
  if (blocker) throw new SenderError(blocker);
  const out = r.output;
  if (out.kind === 'tool') {
    const have = toolTier(ctx, ch.id, out.skillId);
    if (have >= r.tier) throw new SenderError('You already have this tool');
    if (have < r.tier - 1) throw new SenderError(`Upgrade to tier ${r.tier - 1} first`);
  }
  if (out.kind === 'item' && settled.bagSize - bagCount(ctx, ch.id) <= 0) throw new SenderError('Your bag is full');
  const held = materialCounts(ctx, ch.id);
  if (affordable(r, id => held.get(id) ?? 0) < 1) throw new SenderError('Not enough materials');
  ctx.db.character.id.update({ ...settled, activitySkill: def.id, activityRecipe: r.id, activityCountLeft: count });
});

/** Stops the life skill: settles, then goes back to fighting the kept target (idle without one). */
export const stopSkill = spacetimedb.reducer(ctx => {
  const { ch } = requireActive(ctx);
  if (ch.activitySkill === 0) return;
  ctx.db.character.id.update({ ...settle(ctx, ch), ...NO_SKILL });
});

/**
 * Drinks an elixir from stock (life-skills.md, "Buff rules"): it lasts ELIXIR_KILLS kills.
 * What is left of the active one is discarded. Settles first, so the kills so far count
 * with the old one.
 */
export const drinkElixir = spacetimedb.reducer({ supplyId: t.u16() }, (ctx, { supplyId }) => {
  const { ch } = requireActive(ctx);
  if (!SUPPLIES_BY_ID.has(supplyId)) throw new SenderError('No such elixir');
  const settled = settle(ctx, ch);
  if (supplyCount(ctx, ch.id, supplyId) < 1) throw new SenderError('None in stock');
  takeSupply(ctx, ch.id, supplyId, 1);
  ctx.db.character.id.update({ ...settled, elixirId: supplyId, elixirKillsLeft: ELIXIR_KILLS });
});

/** Turns auto-renew on or off: when the elixir runs out, take the next of the same from stock. */
export const setElixirAutoRenew = spacetimedb.reducer({ on: t.bool() }, (ctx, { on }) => {
  const { ch } = requireActive(ctx);
  ctx.db.character.id.update({ ...settle(ctx, ch), elixirAutoRenew: on });
});
