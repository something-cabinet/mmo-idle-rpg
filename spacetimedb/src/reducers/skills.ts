import { SenderError, t } from 'spacetimedb/server';
import { spacetimedb } from '../schema';
import { SKILLS_BY_ID, gatherBlocker } from '../data/skills';
import { requireActive, settle, skillRow, tierUnlocked, toolTier } from '../helpers';

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
  ctx.db.character.id.update({ ...settled, activitySkill: def.id, activityRecipe: tier });
});

/** Stops the life skill: settles, then goes back to fighting the kept target (idle without one). */
export const stopSkill = spacetimedb.reducer(ctx => {
  const { ch } = requireActive(ctx);
  if (ch.activitySkill === 0) return;
  ctx.db.character.id.update({ ...settle(ctx, ch), activitySkill: 0, activityRecipe: 0 });
});
