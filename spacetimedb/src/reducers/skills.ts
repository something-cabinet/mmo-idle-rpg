import { SenderError, t } from 'spacetimedb/server';
import { spacetimedb } from '../schema';
import { SKILLS_BY_ID, SkillId, gatherBlocker, productionBlocker } from '../data/skills';
import { affordable, recipeOf, temperCost } from '../data/recipes';
import { addSkillXp } from '../gather';
import { addXp } from '../game';
import { ELIXIR_KILLS, SUPPLIES_BY_ID } from '../data/supplies';
import { temperBlocker } from '../produce';
import {
  NO_SKILL,
  bagCount,
  materialCounts,
  requireActive,
  requireItem,
  scrapHeld,
  takeMaterials,
  settle,
  skillRow,
  supplyCount,
  takeSupply,
  tierUnlocked,
  toolTier,
} from '../helpers';

/**
 * Starts gathering `skillId` at `tier` (life-skills.md): instead of fighting, online and
 * offline. Needs the skill level and the tier's zone unlocked; the tool only adds speed.
 * Settles the current activity first; the combat target is kept for `stopSkill`.
 */
export const startGathering = spacetimedb.reducer({ skillId: t.u8(), tier: t.u8() }, (ctx, { skillId, tier }) => {
  const { ch } = requireActive(ctx);
  const def = SKILLS_BY_ID.get(skillId);
  if (!def || def.kind !== 'Gathering') throw new SenderError('No such skill');
  const settled = settle(ctx, ch);
  const blocker = gatherBlocker({ level: skillRow(ctx, ch.id, def.id).level, tier, zoneOpen: tierUnlocked(ctx, ch.id, tier) });
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
  const scrap = out.kind === 'scrap' ? scrapHeld(ctx, ch.id, out.materialId) : {};
  const stock = { have: (id: number) => held.get(id) ?? 0, scrap: () => Object.values(scrap).reduce((a, b) => a + b, 0) };
  if (affordable(r, stock) < 1) throw new SenderError(out.kind === 'scrap' ? 'No scrap to smelt' : 'Not enough materials');
  ctx.db.character.id.update({ ...settled, ...NO_SKILL, activitySkill: def.id, activityRecipe: r.id, activityCountLeft: count });
});

/**
 * Tempers item `itemId` one level (life-skills.md, "Smithing: temper an item"): instant, and
 * whatever the character is doing goes on. Pays the main material and gold, and gives
 * Smithing XP and as much character XP. The item may be in the bag or equipped. Needs the
 * tier rule and the temper cap of the Smithing level. Settles first: gear stats change.
 */
export const temperItem = spacetimedb.reducer({ itemId: t.u64() }, (ctx, { itemId }) => {
  const { ch } = requireActive(ctx);
  const it = requireItem(ctx, ch, itemId);
  const settled = settle(ctx, ch);
  const row = skillRow(ctx, ch.id, SkillId.Smithing);
  const blocker = temperBlocker(it, row.level, tierUnlocked(ctx, ch.id, it.tier));
  if (blocker) throw new SenderError(blocker);
  const cost = temperCost(it)!; // temperBlocker refuses tiers without materials
  if ((materialCounts(ctx, ch.id).get(cost.material.materialId) ?? 0) < cost.material.count) throw new SenderError('Not enough materials');
  if (settled.gold < cost.gold) throw new SenderError(`Not enough gold: costs ${cost.gold}`);
  takeMaterials(ctx, ch.id, [cost.material]);
  ctx.db.item.id.update({ ...it, temper: it.temper + 1 });
  ctx.db.skill.id.update({ ...row, ...addSkillXp(row.level, row.xp, cost.xp) });
  ctx.db.character.id.update({ ...settled, ...addXp(settled.level, settled.xp, cost.xp), gold: settled.gold - cost.gold });
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
