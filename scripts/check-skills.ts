// Checks for life skills: gathering (spacetimedb/src/gather.ts, data/skills.ts), production
// (produce.ts, data/recipes.ts) and elixirs in combat (data/supplies.ts, game.ts, sim.ts).
// No server needed:
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
import { RECIPES, affordable, forgeRecipeOf, recipeOf, toolRecipeId } from '../spacetimedb/src/data/recipes';
import { ELIXIR_KILLS, elixirBuffs, elixirSupplyId } from '../spacetimedb/src/data/supplies';
import { forgeItem, masterworkTier, productionCharacterXp, projectProduction } from '../spacetimedb/src/produce';
import { SLOTS } from '../spacetimedb/src/data/bases';
import { ENEMIES_BY_ID } from '../spacetimedb/src/data/zones';
import { combatStats, matchup } from '../spacetimedb/src/combat';
import { project } from '../spacetimedb/src/game';
import { simulate } from '../spacetimedb/src/sim';

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

// ---------------------------------------------------------------- recipes

{
  check('recipe keys are unique', new Set(RECIPES.map(r => `${r.skillId}:${r.id}`)).size === RECIPES.length);
  const cost = (r: ReturnType<typeof recipeOf>) => r!.inputs.map(i => `${i.count} ${i.materialId}`).join(' + ');
  check('sword: 30 Metal + 10 Wood', cost(forgeRecipeOf(1, 2)) === '30 21 + 10 25', cost(forgeRecipeOf(1, 2)));
  check('bow: 30 Wood + 10 Metal', cost(forgeRecipeOf(8, 1)) === '30 15 + 10 11', cost(forgeRecipeOf(8, 1)));
  check('leather: 30 Hide + 10 Cloth', cost(forgeRecipeOf(35, 1)) === '30 12 + 10 14');
  check('cloth and tomes: 30 Cloth + 10 Hide', cost(forgeRecipeOf(31, 1)) === '30 14 + 10 12' && cost(forgeRecipeOf(21, 1)) === '30 14 + 10 12');
  check('rings: 5 Gem + 10 Metal', cost(forgeRecipeOf(50, 3)) === '5 37 + 10 31');
  check('raid variants are not forged', RECIPES.every(r => r.output.kind !== 'item' || r.output.baseId < 1000));
  const pick = recipeOf(SkillId.Smithing, toolRecipeId(SkillId.Mining, 2))!;
  check('pickaxe T2: 100 Metal + 50 Wood, one at a time', cost(pick) === '100 21 + 50 25' && pick.max === 1 && pick.seconds === 1800);
  check('no T1 tool recipe', !recipeOf(SkillId.Smithing, toolRecipeId(SkillId.Mining, 1)));
  const wrath = recipeOf(SkillId.Alchemy, elixirSupplyId(1, 1))!;
  check('elixir: 10 Reagent + 1 Core, 7.5 min', cost(wrath) === '10 16 + 1 13' && wrath.seconds === 450);
  check('affordable counts whole actions', affordable(wrath, id => (id === 16 ? 95 : 4)) === 4 && affordable(wrath, () => 9) === 0);
}

// ---------------------------------------------------------------- production

{
  const wrath = recipeOf(SkillId.Alchemy, elixirSupplyId(1, 1))!;
  const plenty = { countLeft: 1000, have: () => 1e6, bagFree: 0 };
  const pr = projectProduction(fresh, wrath, plenty, 1n, HOUR);
  check('8 elixirs an hour at level 1 (bag room not needed)', pr.actions === 8 && pr.endedAt === undefined, `${pr.actions}`);
  check('75 XP each at T1', pr.xpGained === 600n && productionCharacterXp(8, wrath) === 600n, `${pr.xpGained}`);
  check('inputs used', pr.used.map(u => `${u.count} ${u.materialId}`).join() === '80 16,8 13');
  check('a running queue settles at its last action', pr.settledMicros === pr.made[7].at && HOUR - pr.settledMicros < 450_000_000n);

  const short = projectProduction(fresh, wrath, { countLeft: 1000, have: id => (id === 16 ? 25 : 10), bagFree: 0 }, 1n, HOUR);
  check('runs out of inputs: ends after the last action', short.actions === 2 && short.endedAt === 900_000_000n && short.settledMicros === 900_000_000n,
    `${short.actions} ${short.endedAt}`);
  const counted = projectProduction(fresh, wrath, { ...plenty, countLeft: 3 }, 1n, HOUR);
  check('stops at its count', counted.actions === 3 && counted.countLeft === 0 && counted.endedAt === counted.made[2].at);
  const none = projectProduction(fresh, wrath, { ...plenty, have: () => 0 }, 1n, HOUR);
  check('nothing to make: ends at once', none.actions === 0 && none.endedAt === 0n);

  const sword = forgeRecipeOf(1, 1)!;
  const bag = projectProduction(fresh, sword, { countLeft: 100, have: () => 1e6, bagFree: 2 }, 1n, HOUR);
  check('forging stops when the bag is full', bag.actions === 2 && bag.endedAt === bag.made[1].at);

  // Per-minute settles give the same as one (keep-inputs rolls are seeded per action).
  const lv60 = { level: 60, xp: 0n, settledMicros: 0n };
  let p = { ...lv60 };
  let actions = 0;
  let used = 0;
  let left = 1000;
  for (let t = 60_000_000n; t <= 8n * HOUR; t += 60_000_000n) {
    const step = projectProduction(p, wrath, { ...plenty, countLeft: left }, 7n, t);
    actions += step.actions;
    used += step.used.find(u => u.materialId === 16)?.count ?? 0;
    left = step.countLeft;
    p = step;
  }
  const once = projectProduction(lv60, wrath, plenty, 7n, 8n * HOUR);
  const onceUsed = once.used.find(u => u.materialId === 16)?.count ?? 0;
  check('per-minute settles match one settle', actions === once.actions && used === onceUsed && p.level === once.level,
    `${actions}/${once.actions} used ${used}/${onceUsed}`);
  check('level 60 is faster and sometimes keeps its inputs', once.actions > 64 && onceUsed < once.actions * 10, `${once.actions}, ${onceUsed}`);
  const capped = projectProduction(fresh, wrath, plenty, 1n, 10n * HOUR, HOUR);
  check('capped settle counts only the cap and ends now', capped.actions === 8 && capped.settledMicros === 10n * HOUR);
}

// ---------------------------------------------------------------- forging

{
  let magic = 0;
  let rare = 0;
  for (let i = 0; i < 4000; i++) {
    const it = forgeItem(seededRng(BigInt(i)), 1, 1, 1);
    if (it.rarity.tag === 'Magic') magic++;
    if (it.rarity.tag === 'Rare') rare++;
  }
  check('forged: ~20% Magic, ~2% Rare, never higher', magic > 700 && magic < 900 && rare > 50 && rare < 110, `${magic} ${rare}`);
  check('masterwork floor: +1 per 20 levels above, capped at the tier',
    masterworkTier(21, 3) === 1 && masterworkTier(41, 3) === 2 && masterworkTier(99, 3) === 3 && masterworkTier(99, 1) === 1);
  let minTier = 9;
  for (let i = 0; i < 300; i++) for (const a of forgeItem(seededRng(BigInt(i)), 1, 3, 99).affixes) minTier = Math.min(minTier, a.tier);
  check('masterwork affixes roll at the floor or higher', minTier === 3, `${minTier}`);
}

// ---------------------------------------------------------------- elixirs in combat

{
  const starter = SLOTS.map(s => (s === 'MainHand' ? { ...forgeItem(seededRng(0n), 1, 1, 1), affixes: [] } : undefined));
  const rat = ENEMIES_BY_ID.get(101)!.enemy;
  const wrath = elixirBuffs(elixirSupplyId(1, 1), 1)!;
  check('Wrath: ×1.2 damage in its tier, ×1.1 above', wrath.damage === 1.2 && elixirBuffs(elixirSupplyId(1, 1), 2)!.damage === 1.1);
  const plain = matchup(combatStats(1, starter), rat);
  const buffed = matchup(combatStats(1, starter, wrath), rat);
  check('Wrath multiplies DPS', Math.abs(buffed.dps / plain.dps - 1.2) < 1e-9, `${buffed.dps / plain.dps}`);
  const wisdom = elixirBuffs(elixirSupplyId(3, 1), 1)!;
  check('Wisdom multiplies XP per kill', Math.abs(matchup(combatStats(1, starter, wisdom), rat).xpPerKill / plain.xpPerKill - 1.2) < 1e-9);

  const T0 = 1_700_000_000_000_000n;
  const start = { level: 1, xp: 0n, gold: 0n, settledMicros: T0 };
  const run = { buffs: wrath, killsLeft: 100, stock: 2 };
  const p = project(start, { gear: starter, enemy: rat, elixir: run }, T0 + 8n * HOUR);
  check('charges cap at kills, renewing from stock', p.elixir!.renewed === 2 && p.elixir!.killsLeft === 0 && p.elixir!.buffedKills === 100 + 2 * ELIXIR_KILLS,
    JSON.stringify(p.elixir));
  const unbuffed = project(start, { gear: starter, enemy: rat }, T0 + 8n * HOUR);
  check('buffed kills come faster', p.kills > unbuffed.kills, `${p.kills} vs ${unbuffed.kills}`);
  const off = project(start, { gear: starter, enemy: rat, elixir: { ...run, stock: 0 } }, T0 + 8n * HOUR);
  check('without stock it runs out', off.elixir!.renewed === 0 && off.elixir!.buffedKills === 100 && off.elixir!.killsLeft === 0);
  const sim = simulate(start, { gear: starter, enemy: rat, elixir: { ...run, killsLeft: 5, stock: 0 } }, T0 + HOUR, 9n);
  check('live fights use a charge per kill', sim.elixir!.buffedKills === Math.min(5, sim.kills) && sim.elixir!.killsLeft === Math.max(0, 5 - sim.kills),
    `${sim.kills} kills, ${JSON.stringify(sim.elixir)}`);
}

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
