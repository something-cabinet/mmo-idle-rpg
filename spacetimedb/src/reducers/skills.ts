import { SenderError, t } from 'spacetimedb/server';
import { spacetimedb } from '../schema';
import { GATHER_NODES_BY_ID, SKILLS_BY_ID, SkillId, gatherBlocker, gatherSpotId, productionBlocker, productionXpPerAction } from '../data/skills';
import { affordable, recipeOf, temperCost, toolRecipeId } from '../data/recipes';
import { addSkillXp } from '../gather';
import { addXp } from '../game';
import { ELIXIR_KILLS, SUPPLIES_BY_ID } from '../data/supplies';
import { ABYSS_UNLOCK_ZONE } from '../data/abyss';
import { temperBlocker } from '../produce';
import {
  NO_SKILL,
  bagCount,
  hasKilledBoss,
  materialCounts,
  requireActive,
  requireItem,
  takeMaterials,
  settle,
  skillRow,
  herbCount,
  supplyCount,
  takeHerbs,
  takeSupply,
  tierUnlocked,
  toolTier,
} from '../helpers';

/**
 * Starts gathering `skillId` at `tier` (life-skills.md): instead of fighting, online and
 * offline. `node` is a special node of the skill (life-skills.md, "Special nodes"), 0 for
 * the normal one. Needs the skill level (and the node's), and the tier's zone unlocked; the
 * tool only adds speed. Settles the current activity first; the combat target is kept for
 * `stopSkill`.
 */
export const startGathering = spacetimedb.reducer({ skillId: t.u8(), tier: t.u8(), node: t.u8() }, (ctx, { skillId, tier, node }) => {
  const { ch } = requireActive(ctx);
  const def = SKILLS_BY_ID.get(skillId);
  if (!def || def.kind !== 'Gathering') throw new SenderError('No such skill');
  if (node !== 0 && GATHER_NODES_BY_ID.get(node)?.skillId !== def.id) throw new SenderError('No such node');
  const settled = settle(ctx, ch);
  const blocker = gatherBlocker({ level: skillRow(ctx, ch.id, def.id).level, tier, zoneOpen: tierUnlocked(ctx, ch.id, tier), node });
  if (blocker) throw new SenderError(blocker);
  ctx.db.character.id.update({ ...settled, ...NO_SKILL, activitySkill: def.id, activityRecipe: gatherSpotId(tier, node) });
});

/**
 * Starts a production queue (life-skills.md, "Production"): `count` actions of recipe
 * `recipe` of `skillId`, instead of fighting. It ends early when the inputs or the bag
 * run out, then the character goes back to the kept combat target. Needs the skill
 * level and zone of the recipe's tier (a Phial: the Moonwell Deep open), inputs for one action and,
 * for a base, bag room.
 */
export const startProduction = spacetimedb.reducer({ skillId: t.u8(), recipe: t.u16(), count: t.u32() }, (ctx, { skillId, recipe, count }) => {
  const { ch } = requireActive(ctx);
  const def = SKILLS_BY_ID.get(skillId);
  if (!def || def.kind !== 'Production') throw new SenderError('No such skill');
  const r = recipeOf(def.id, recipe);
  if (!r) throw new SenderError('No such recipe');
  if (count < 1 || count > r.max) throw new SenderError(r.max === 1 ? 'Make one at a time' : `Queue 1 to ${r.max}`);
  const settled = settle(ctx, ch);
  const blocker = productionBlocker({
    level: skillRow(ctx, ch.id, def.id).level, tier: r.tier, zoneOpen: tierUnlocked(ctx, ch.id, r.tier),
    needsDeep: r.needsDeep, deepOpen: !!r.needsDeep && hasKilledBoss(ctx, ch.id, ABYSS_UNLOCK_ZONE),
  });
  if (blocker) throw new SenderError(blocker);
  const out = r.output;
  if (out.kind === 'tool') throw new SenderError('Tool upgrades are instant: use Upgrade');
  if (out.kind === 'item' && settled.bagSize - bagCount(ctx, ch.id) <= 0) throw new SenderError('Your bag is full');
  const held = materialCounts(ctx, ch.id);
  if (affordable(r, { have: id => held.get(id) ?? 0 }) < 1) throw new SenderError('Not enough materials');
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

/**
 * Upgrades the tool of gathering skill `skillId` one tier (life-skills.md, "Tools"): instant,
 * like tempering, and whatever the character is doing goes on. Pays the recipe's inputs and
 * gives the Smithing XP of its `seconds` of work, and as much character XP. Needs the
 * Smithing level and zone of the new tier.
 */
export const upgradeTool = spacetimedb.reducer({ skillId: t.u8() }, (ctx, { skillId }) => {
  const { ch } = requireActive(ctx);
  const def = SKILLS_BY_ID.get(skillId);
  if (!def || def.kind !== 'Gathering') throw new SenderError('No such tool');
  const have = toolTier(ctx, ch.id, def.id);
  const r = recipeOf(SkillId.Smithing, toolRecipeId(def.id, have + 1));
  if (!r) throw new SenderError('Already the highest tier');
  const settled = settle(ctx, ch);
  const row = skillRow(ctx, ch.id, SkillId.Smithing);
  const blocker = productionBlocker({ level: row.level, tier: r.tier, zoneOpen: tierUnlocked(ctx, ch.id, r.tier) });
  if (blocker) throw new SenderError(blocker);
  const held = materialCounts(ctx, ch.id);
  if (affordable(r, { have: id => held.get(id) ?? 0 }) < 1) throw new SenderError('Not enough materials');
  takeMaterials(ctx, ch.id, r.inputs);
  const tool = [...ctx.db.tool.characterId.filter(ch.id)].find(x => x.skillId === def.id);
  if (!tool) ctx.db.tool.insert({ id: 0n, characterId: ch.id, skillId: def.id, tier: r.tier });
  else ctx.db.tool.id.update({ ...tool, tier: r.tier });
  const xp = productionXpPerAction(r.tier, r.seconds);
  ctx.db.skill.id.update({ ...row, ...addSkillXp(row.level, row.xp, xp) });
  ctx.db.character.id.update({ ...settled, ...addXp(settled.level, settled.xp, xp) });
});

/** Stops the life skill: settles, then goes back to fighting the kept target (idle without one). */
export const stopSkill = spacetimedb.reducer(ctx => {
  const { ch } = requireActive(ctx);
  if (ch.activitySkill === 0) return;
  ctx.db.character.id.update({ ...settle(ctx, ch), ...NO_SKILL });
});

/**
 * Drinks an elixir from stock (life-skills.md, "Buff rules"): it lasts ELIXIR_KILLS kills,
 * infused with a rare herb of its grade when Infuse is on and there is one. What is left
 * of the active one is discarded. Settles first, so the kills so far count with the old one.
 */
export const drinkElixir = spacetimedb.reducer({ supplyId: t.u16() }, (ctx, { supplyId }) => {
  const { ch } = requireActive(ctx);
  const sup = SUPPLIES_BY_ID.get(supplyId);
  if (!sup) throw new SenderError('No such elixir');
  const settled = settle(ctx, ch);
  if (supplyCount(ctx, ch.id, supplyId) < 1) throw new SenderError('None in stock');
  takeSupply(ctx, ch.id, supplyId, 1);
  const infused = settled.elixirInfuse && herbCount(ctx, ch.id, sup.grade) > 0;
  if (infused) takeHerbs(ctx, ch.id, sup.grade, 1);
  ctx.db.character.id.update({ ...settled, elixirId: supplyId, elixirKillsLeft: ELIXIR_KILLS, elixirInfused: infused });
});

/** Turns Infuse on or off: from the next elixir drunk or auto-renewed, use a rare herb of its grade for INFUSE_BONUS × the bonus. */
export const setElixirInfuse = spacetimedb.reducer({ on: t.bool() }, (ctx, { on }) => {
  const { ch } = requireActive(ctx);
  ctx.db.character.id.update({ ...settle(ctx, ch), elixirInfuse: on });
});

/** Turns auto-renew on or off: when the elixir runs out, take the next of the same from stock. */
export const setElixirAutoRenew = spacetimedb.reducer({ on: t.bool() }, (ctx, { on }) => {
  const { ch } = requireActive(ctx);
  ctx.db.character.id.update({ ...settle(ctx, ch), elixirAutoRenew: on });
});
