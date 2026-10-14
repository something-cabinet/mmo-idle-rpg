// Checks for life-skill gathering (spacetimedb/src/gather.ts, data/skills.ts). No server needed:
//   npm run test:skills
import {
  GATHER_SECONDS,
  MAX_SKILL_LEVEL,
  SKILLS,
  SKILLS_BY_ID,
  SkillId,
  gatherActionMicros,
  gatherBlocker,
  skillXpToNext,
  tierRequirement,
} from '../spacetimedb/src/data/skills';
import { materialOf } from '../spacetimedb/src/data/materials';
import { seededRng } from '../spacetimedb/src/loot';
import { addSkillXp, gatherCharacterXp, projectGathering, rollGathering } from '../spacetimedb/src/gather';

let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed++;
}
const HOUR = 3600n * 1_000_000n;
const fresh = { level: 1, xp: 0n, settledMicros: 0n };

// ---------------------------------------------------------------- data

check('skill IDs are unique and nonzero', new Set(SKILLS.map(s => s.id)).size === SKILLS.length && SKILLS.every(s => s.id > 0));
check('tier requirements 1, 11, 21', [1, 2, 3].map(tierRequirement).join() === '1,11,21');
check('base action is 12 s', gatherActionMicros(1, 1, 1) === BigInt(GATHER_SECONDS * 1e6));
check('level speed caps at +20%', gatherActionMicros(99, 1, 1) === 10_000_000n, `${gatherActionMicros(99, 1, 1)}`);
check('tool speed: +5% per tier above, cap +20%', gatherActionMicros(1, 1, 2) === BigInt(Math.round(12e6 / 1.05)) && gatherActionMicros(1, 1, 9) === 10_000_000n);
check('blocked by level', gatherBlocker({ level: 10, tier: 2, toolTier: 2, zoneOpen: true, tool: 'Pickaxe' }) === 'Needs level 11');
check('blocked by tool', gatherBlocker({ level: 11, tier: 2, toolTier: 1, zoneOpen: true, tool: 'Pickaxe' }) === 'Needs a tier 2 Pickaxe');
check('blocked by zone', gatherBlocker({ level: 11, tier: 2, toolTier: 2, zoneOpen: false, tool: 'Pickaxe' }) !== undefined);
check('allowed', gatherBlocker({ level: 11, tier: 2, toolTier: 2, zoneOpen: true, tool: 'Pickaxe' }) === undefined);

// ---------------------------------------------------------------- settlement

{
  const g = projectGathering(fresh, { tier: 1, toolTier: 1 }, HOUR);
  // Speed rises with level, so a little over 300.
  check('~300 actions in the first hour at T1', g.actions >= 300 && g.actions <= 310, `${g.actions}`);
  check('all XP accounted for', g.xpGained === BigInt(g.actions * 2), `${g.xpGained}`);
  check('leftover time carries over', g.settledMicros <= HOUR && HOUR - g.settledMicros < 12_000_000n);
  check('character XP matches skill XP', gatherCharacterXp(g.actions, 1) === g.xpGained, `${gatherCharacterXp(g.actions, 1)}`);
  check('character XP at T2 is floored', gatherCharacterXp(3, 2) === 17n, `${gatherCharacterXp(3, 2)}`);
}
{
  // Settling in many short steps gives the same as one long one (online every minute vs. offline).
  let p = fresh;
  let actions = 0;
  for (let t = 60_000_000n; t <= 5n * HOUR; t += 60_000_000n) {
    const g = projectGathering(p, { tier: 1, toolTier: 1 }, t);
    actions += g.actions;
    p = g;
  }
  const once = projectGathering(fresh, { tier: 1, toolTier: 1 }, 5n * HOUR);
  check('per-minute settles match one settle', actions === once.actions && p.level === once.level && p.xp === once.xp,
    `${actions} vs ${once.actions}, Lv ${p.level} vs ${once.level}`);
}
{
  const g = projectGathering(fresh, { tier: 1, toolTier: 1 }, 10n * HOUR, 8n * HOUR);
  check('capped settle ends now', g.settledMicros === 10n * HOUR);
  const uncapped = projectGathering(fresh, { tier: 1, toolTier: 1 }, 8n * HOUR);
  check('capped settle counts only the cap', g.actions === uncapped.actions);
}
{
  // Pace at the highest allowed tier (life-skills.md): ~3 h to level 11.
  const g = projectGathering(fresh, { tier: 1, toolTier: 1 }, 3n * HOUR);
  check('about level 11 after 3 h', g.level >= 10 && g.level <= 12, `Lv ${g.level}`);
}
{
  let { level, xp } = addSkillXp(1, 0n, 10n ** 12n);
  check('XP stops at the max level', level === MAX_SKILL_LEVEL && xp === 0n);
  ({ level, xp } = addSkillXp(1, 0n, skillXpToNext(1)));
  check('exact level-up', level === 2 && xp === 0n);
  const g = projectGathering({ level: MAX_SKILL_LEVEL, xp: 0n, settledMicros: 0n }, { tier: 1, toolTier: 1 }, HOUR);
  check('max level still gathers', g.actions === 360 && g.xpGained === 0n, `${g.actions}`);
  check('max level: 10% double yield', Math.abs(g.doubleMean - 36) < 1e-9, `${g.doubleMean}`);
}

// ---------------------------------------------------------------- yields

{
  const mining = SKILLS_BY_ID.get(SkillId.Mining)!;
  const drops = rollGathering(seededRng(1n), mining, 2, { actions: 3000, doubleMean: 0 });
  const metal = drops.find(d => d.materialId === materialOf(2, 'Metal').id)?.count ?? 0;
  const gems = drops.find(d => d.materialId === materialOf(2, 'Gem').id)?.count ?? 0;
  check('one metal per action', metal === 3000, `${metal}`);
  check('~5% gems', gems > 100 && gems < 200, `${gems}`);
  const wood = rollGathering(seededRng(1n), SKILLS_BY_ID.get(SkillId.Woodcutting)!, 1, { actions: 1000, doubleMean: 100 });
  check('woodcutting: wood only, double yields added', wood.length === 1 && wood[0].count > 1050 && wood[0].count < 1150, `${wood[0]?.count}`);
  check('no actions, no drops', rollGathering(seededRng(1n), mining, 1, { actions: 0, doubleMean: 0 }).length === 0);
}

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
