// Checks for life skills: gathering (spacetimedb/src/gather.ts, data/skills.ts), production
// (produce.ts, data/recipes.ts), elixirs in combat (data/supplies.ts, game.ts, sim.ts), and
// Phials and the Voidglass sources (phials.md).
// No server needed:
//   npm run test:skills
import {
  GATHER_SECONDS,
  MAX_SKILL_LEVEL,
  SKILLS,
  SKILLS_BY_ID,
  SkillId,
  GATHER_NODES,
  findChances,
  findLevelMult,
  gatherActionMicros,
  productionBlocker,
  gatherBlocker,
  gatherSpot,
  gatherSpotId,
  skillXpToNext,
  temperCap,
  tierRequirement,
} from '../spacetimedb/src/data/skills';
import { materialOf, untieredMaterial } from '../spacetimedb/src/data/materials';
import { makeItem, materialMeans, rollDrops, rollPool, salvageVoidglass, scrapMaterials, seededRng } from '../spacetimedb/src/loot';
import { addSkillXp, gatherCharacterXp, projectGathering, relicGold, rollGathering, rollGatheringActions } from '../spacetimedb/src/gather';
import {
  RECIPES,
  affordable,
  elixirRecipeId,
  forgeRecipeOf,
  phialRecipeId,
  recipeOf,
  scrapMaterialId,
  smeltRecipeId,
  temperCost,
  toolRecipeId,
} from '../spacetimedb/src/data/recipes';
import { poolMeans, poolMult } from '../spacetimedb/src/data/pool';
import { eliteOf } from '../spacetimedb/src/encounters';
import { CHRONOSHARDS, ELIXIR_KILLS, chronoshardSupplyId, PHIALS, SUPPLIES, brewYield, elixirBuffs, elixirSupplyId, gradeOf, infuseHerbIds, legacyElixir, phialBuffs, phialSupplyId } from '../spacetimedb/src/data/supplies';
import { RAIDS } from '../spacetimedb/src/data/raids';
import { simulateDepth } from '../spacetimedb/src/abyss';
import { forgeItem, forged, productionCharacterXp, projectProduction, temperBlocker } from '../spacetimedb/src/produce';
import { SLOTS } from '../spacetimedb/src/data/bases';
import { ENEMIES_BY_ID, ZONES } from '../spacetimedb/src/data/zones';
import { combatStats, matchup, tempered } from '../spacetimedb/src/combat';
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
check('base action is 12 s', gatherActionMicros(1) === BigInt(GATHER_SECONDS * 1e6));
check('tool speed: +10% per tier above T1', gatherActionMicros(2) === BigInt(Math.round(12e6 / 1.1)) && gatherActionMicros(3) === 10_000_000n);
check('blocked by level', gatherBlocker({ level: 10, tier: 2, zoneOpen: true }) === 'Needs level 11');
check('blocked by zone', gatherBlocker({ level: 11, tier: 2, zoneOpen: false }) !== undefined);
check('a T1 tool gathers any tier', gatherBlocker({ level: 11, tier: 2, zoneOpen: true }) === undefined);

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
  check('max level still gathers, no faster', g.actions === 300 && g.xpGained === 0n, `${g.actions}`);
  check('max level: 10% double yield', Math.abs(g.doubleMean - 30) < 1e-9, `${g.doubleMean}`);
}

// ---------------------------------------------------------------- yields

{
  const mining = SKILLS_BY_ID.get(SkillId.Mining)!;
  const drops = rollGathering(seededRng(1n), mining, 2, { actions: 3000, doubleMean: 0 }).materials;
  const ore = drops.find(d => d.materialId === materialOf(2, 'Ore').id)?.count ?? 0;
  const gems = drops.find(d => d.materialId === materialOf(2, 'Gem').id)?.count ?? 0;
  check('mining: one Ore per action, never Metal', ore === 3000 && !drops.some(d => d.materialId === materialOf(2, 'Metal').id), `${ore}`);
  check('~5% gems', gems > 100 && gems < 200, `${gems}`);
  const wood = rollGathering(seededRng(1n), SKILLS_BY_ID.get(SkillId.Woodcutting)!, 1, { actions: 1000, doubleMean: 100 }).materials;
  check('woodcutting: wood only, double yields added', wood.length === 1 && wood[0].count > 1050 && wood[0].count < 1150, `${wood[0]?.count}`);
  check('no actions, no drops', rollGathering(seededRng(1n), mining, 1, { actions: 0, doubleMean: 0 }).materials.length === 0);
}
{
  // Online, rolled action by action: settling in pieces (what the client shows between settles) gives the same.
  const mining = SKILLS_BY_ID.get(SkillId.Mining)!;
  const total = new Map<number, number>();
  let p = fresh;
  for (let t = 37_000_000n; t <= 5n * HOUR; t += 37_000_000n) {
    const g = projectGathering(p, { tier: 1, toolTier: 1 }, t);
    for (const d of rollGatheringActions(7n, mining, 1, g).materials) total.set(d.materialId, (total.get(d.materialId) ?? 0) + d.count);
    p = g;
  }
  const once = projectGathering(fresh, { tier: 1, toolTier: 1 }, p.settledMicros);
  const onceDrops = rollGatheringActions(7n, mining, 1, once).materials;
  const metal = materialOf(1, 'Ore').id;
  const gem = materialOf(1, 'Gem').id;
  const count = (id: number) => onceDrops.find(d => d.materialId === id)?.count ?? 0;
  check('per-action rolls: in pieces match one settle', total.get(metal) === count(metal) && (total.get(gem) ?? 0) === count(gem),
    `${total.get(metal)} vs ${count(metal)}, gems ${total.get(gem)} vs ${count(gem)}`);
  check('per-action rolls: one metal per action plus double yields', count(metal) >= once.actions && count(metal) - once.actions < once.actions * 0.2,
    `${count(metal)} for ${once.actions} actions, ~${once.doubleMean.toFixed(0)} doubles expected`);
  check('per-action rolls: ~5% gems', Math.abs(count(gem) - once.actions * 0.05) < once.actions * 0.03, `${count(gem)}`);
  check('per-action rolls: the runs cover every action', once.runs.reduce((n, r) => n + r.n, 0) === once.actions);
  const maxed = projectGathering({ level: MAX_SKILL_LEVEL, xp: 0n, settledMicros: 0n }, { tier: 1, toolTier: 1 }, 10n * HOUR);
  const wood = rollGatheringActions(7n, SKILLS_BY_ID.get(SkillId.Woodcutting)!, 1, maxed).materials[0].count - maxed.actions;
  check('per-action rolls: ~10% double yields at max level', Math.abs(wood - maxed.doubleMean) < maxed.doubleMean * 0.15, `${wood} vs ~${maxed.doubleMean}`);
}

// ---------------------------------------------------------------- rare finds and special nodes

{
  const mining = SKILLS_BY_ID.get(SkillId.Mining)!;
  const forage = SKILLS_BY_ID.get(SkillId.Foraging)!;
  const wood = SKILLS_BY_ID.get(SkillId.Woodcutting)!;
  check('node IDs unique, nonzero and below 100', new Set(GATHER_NODES.map(n => n.id)).size === GATHER_NODES.length && GATHER_NODES.every(n => n.id > 0 && n.id < 100));
  check('spot ID round-trips', gatherSpot(gatherSpotId(3, 2)).tier === 3 && gatherSpot(gatherSpotId(3, 2)).node === 2 && gatherSpotId(2, 0) === 2);
  check('node blocked below its unlock level', gatherBlocker({ level: 29, tier: 1, zoneOpen: true, node: 1 }) === 'Needs level 30');
  check('node open at its unlock level', gatherBlocker({ level: 30, tier: 1, zoneOpen: true, node: 1 }) === undefined);
  check('rare finds double at 99', findLevelMult(MAX_SKILL_LEVEL) === 2);
  const relic = findChances(SkillId.Mining, 2, 0, 0).find(f => f.materialId === undefined)!;
  const ruins = findChances(SkillId.Mining, 2, 2, 0).find(f => f.materialId === undefined)!;
  check('Ruins Dig Site: Relics ×3', Math.abs(ruins.chance - 3 * relic.chance) < 1e-12, `${relic.chance} → ${ruins.chance}`);
  const tear = findChances(SkillId.Woodcutting, 3, 0, 0)[0];
  check("Dryad's Tear is untiered and comes faster from higher tiers",
    tear.materialId === untieredMaterial('Tear').id && Math.abs(tear.chance - 3 * findChances(SkillId.Woodcutting, 1, 0, 0)[0].chance) < 1e-12);
  check('rare herbs are tiered', findChances(SkillId.Foraging, 2, 0, 1)[0].materialId === materialOf(2, 'Herb').id);

  // Online rolls: in pieces match one settle, finds included.
  const runs = (skillTier: number, hours: bigint) => projectGathering({ level: 60, xp: 0n, settledMicros: 0n }, { tier: skillTier, toolTier: 1 }, hours * HOUR);
  const g = runs(2, 100n);
  const once = rollGatheringActions(7n, mining, 2, g, 2);
  let p = { level: 60, xp: 0n, settledMicros: 0n };
  const parts = { relics: 0, ore: 0 };
  for (let t = 997_000_000n; t <= 100n * HOUR + 997_000_000n; t += 997_000_000n) {
    const step = projectGathering(p, { tier: 2, toolTier: 1 }, t > 100n * HOUR ? 100n * HOUR : t);
    const y = rollGatheringActions(7n, mining, 2, step, 2);
    parts.relics += y.relics;
    parts.ore += y.materials.find(d => d.materialId === materialOf(2, 'Ore').id)?.count ?? 0;
    p = step;
  }
  const ore = once.materials.find(d => d.materialId === materialOf(2, 'Ore').id)?.count ?? 0;
  check('node rolls: in pieces match one settle', parts.relics === once.relics && parts.ore === ore, `${parts.relics}/${once.relics}, ${parts.ore}/${ore}`);
  check('Ruins Dig Site: about half the Ore', Math.abs(ore - g.actions * 0.5) < g.actions * 0.05, `${ore} of ${g.actions}`);
  const relicMean = g.actions * 0.02 * findLevelMult(60) * 3;
  check('Ruins Dig Site: ~6% × level Relics, sold for gold', Math.abs(once.relics - relicMean) < relicMean * 0.15 && once.gold === BigInt(once.relics) * relicGold(2),
    `${once.relics} vs ~${relicMean.toFixed(0)}, ${once.gold} gold`);
  check('a Relic sells for 0.15 h of farming gold', relicGold(1) === 180n, `${relicGold(1)}`);

  const pocket = rollGatheringActions(7n, mining, 1, runs(1, 20n), 1);
  const gems = pocket.materials.find(d => d.materialId === materialOf(1, 'Gem').id)?.count ?? 0;
  check('Gem Pocket: no Ore, ~20% Gems', !pocket.materials.some(d => d.materialId === materialOf(1, 'Ore').id) && Math.abs(gems - runs(1, 20n).actions * 0.2) < runs(1, 20n).actions * 0.03, `${gems}`);

  // The login settle's one draw agrees with the action rolls on average.
  const glade = runs(1, 200n);
  const herbs = (y: { materials: { materialId: number; count: number }[] }) => y.materials.find(d => d.materialId === materialOf(1, 'Herb').id)?.count ?? 0;
  const herbMean = glade.actions * 0.01 * findLevelMult(60) * 3;
  const drawn = rollGathering(seededRng(3n), forage, 1, glade, 4);
  check('Shaded Glade: rare herbs ×3, one draw', Math.abs(herbs(drawn) - herbMean) < herbMean * 0.1, `${herbs(drawn)} vs ~${herbMean.toFixed(0)}`);
  const reagent = drawn.materials.find(d => d.materialId === materialOf(1, 'Reagent').id)?.count ?? 0;
  check('Shaded Glade: about half the Reagent, one draw', Math.abs(reagent - glade.actions * 0.5) < glade.actions * 0.05, `${reagent} of ${glade.actions}`);
  const tears = rollGathering(seededRng(4n), wood, 3, runs(3, 200n), 0).materials.find(d => d.materialId === untieredMaterial('Tear').id)?.count ?? 0;
  check("Dryad's Tears from a T3 node", tears > 0, `${tears}`);
  check('normal nodes yield no Relic gold outside Mining', rollGathering(seededRng(5n), wood, 1, runs(1, 50n)).gold === 0n);
}

// ---------------------------------------------------------------- recipes

{
  check('recipe keys are unique', new Set(RECIPES.map(r => `${r.skillId}:${r.id}`)).size === RECIPES.length);
  const cost = (r: ReturnType<typeof recipeOf>) => r!.inputs.map(i => `${i.count} ${i.materialId}`).join(' + ');
  check('sword: 30 Metal + 10 Wood', cost(forgeRecipeOf(1, 2)) === '30 102 + 10 502', cost(forgeRecipeOf(1, 2)));
  check('bow: 30 Wood + 10 Metal', cost(forgeRecipeOf(8, 1)) === '30 501 + 10 101', cost(forgeRecipeOf(8, 1)));
  check('leather: 30 Hide + 10 Cloth', cost(forgeRecipeOf(35, 1)) === '30 201 + 10 401');
  check('cloth and tomes: 30 Cloth + 10 Hide', cost(forgeRecipeOf(31, 1)) === '30 401 + 10 201' && cost(forgeRecipeOf(21, 1)) === '30 401 + 10 201');
  check('rings: 5 Gem + 10 Metal', cost(forgeRecipeOf(50, 3)) === '5 703 + 10 103');
  check('raid variants are not forged', RECIPES.every(r => r.output.kind !== 'item' || r.output.baseId < 1000));
  const pick = recipeOf(SkillId.Smithing, toolRecipeId(SkillId.Mining, 2))!;
  check('pickaxe T2: 100 T1 Metal + 50 T1 Wood, one at a time', cost(pick) === '100 101 + 50 501' && pick.max === 1 && pick.seconds === 1800);
  check('no T1 tool recipe', !recipeOf(SkillId.Smithing, toolRecipeId(SkillId.Mining, 1)));
  const wrath = recipeOf(SkillId.Alchemy, elixirRecipeId(1, 1))!;
  check('elixir: 10 Reagent + 1 Core, 7.5 min', cost(wrath) === '10 601 + 1 301' && wrath.seconds === 450);
  check('brews yield 2 / 3 / 4 by tier in the grade', [1, 2, 3, 4, 5, 6, 7].map(brewYield).join() === '2,3,4,2,3,4,2' &&
    wrath.output.kind === 'supply' && wrath.output.count === 2 && wrath.output.supplyId === elixirSupplyId(1, 1));
  const t4 = recipeOf(SkillId.Alchemy, elixirRecipeId(1, 4))!;
  check('T4 materials brew Greater elixirs', t4.output.kind === 'supply' && t4.output.supplyId === elixirSupplyId(1, 2) && cost(t4) === '10 604 + 1 304');
  check('no herb in any elixir brew', RECIPES.filter(r => r.skillId === SkillId.Alchemy && r.output.kind === 'supply' && SUPPLIES.some(s => s.id === (r.output as { supplyId: number }).supplyId)).every(r => r.inputs.length === 2));
  check('affordable counts whole actions', affordable(wrath, { have: id => (id === 601 ? 95 : 4) }) === 4 && affordable(wrath, { have: () => 9 }) === 0);

  const smelt = recipeOf(SkillId.Smithing, smeltRecipeId(2))!;
  check('smelt T2: 1 Ore → 1 Metal, 12 s', cost(smelt) === '1 902' && smelt.output.kind === 'material' && smelt.output.materialId === 102 && smelt.seconds === 12);
  check('scrap kinds: armor → its main material, jewelry → Metal',
    scrapMaterialId(35, 1) === 201 && scrapMaterialId(31, 2) === 402 && scrapMaterialId(8, 1) === 501 && scrapMaterialId(50, 3) === 103 && scrapMaterialId(1, 1) === 101);
  check('no scrap smelting recipes (scrap is instant)', !RECIPES.some(r => r.id >= 61000 && r.id < 62000));
  check('scrap yields 1 / 2 / 3 / 8 / 20 by rarity, merged per material',
    JSON.stringify(scrapMaterials([
      { materialId: 101, rarity: 'Common', count: 3 },
      { materialId: 101, rarity: 'Legendary', count: 1 },
      { materialId: 201, rarity: 'Magic', count: 1 },
      { materialId: 201, rarity: 'Rare', count: 1 },
      { materialId: 201, rarity: 'Epic', count: 1 },
    ])) === JSON.stringify([{ materialId: 101, count: 23 }, { materialId: 201, count: 13 }]));

  const t = temperCost({ baseId: 1, tier: 2, temper: 2 })!;
  check('temper step 3 on a T2 sword: 30 T2 Metal, 0.15 h of gold, 9 min of XP',
    t.material.materialId === 102 && t.material.count === 30 && t.gold === BigInt(Math.round(1200 * 0.15 * 2.9)) && t.xp === BigInt(Math.floor(600 * 2.9 * 540 / 3600)),
    JSON.stringify(t, (_, v) => (typeof v === 'bigint' ? String(v) : v)));
  check('temper: leather uses Hide', temperCost({ baseId: 35, tier: 1, temper: 0 })?.material.materialId === 201);
  const full = Array.from({ length: 10 }, (_, k) => temperCost({ baseId: 1, tier: 1, temper: k })!);
  check('+0 → +10: 550 material', full.reduce((n, c) => n + c.material.count, 0) === 550);
}

// ---------------------------------------------------------------- tempering

{
  check('temper cap: +1 per 10 levels, +10 at 99', [1, 9, 10, 55, 90, 98, 99].map(temperCap).join() === '0,0,1,5,9,9,10');
  const common = { baseId: 1, rarity: { tag: 'Common' as const }, tier: 1, temper: 0 };
  check('no temper cost above the material tiers', temperCost({ baseId: 1, tier: 5, temper: 0 }) === undefined &&
    temperBlocker({ ...common, tier: 5 }, 99, true) === 'No tier 5 materials yet');
  check('no scrap above the material tiers', scrapMaterialId(1, 5) === undefined);
  check('temper blocked below level 10', temperBlocker(common, 9, true) === '+1 needs level 10');
  check('temper allowed at level 10', temperBlocker(common, 10, true) === undefined);
  check('temper +10 needs level 99', temperBlocker({ ...common, temper: 9 }, 98, true) === '+10 needs level 99' && temperBlocker({ ...common, temper: 9 }, 99, true) === undefined);
  check('fully tempered at +10', temperBlocker({ ...common, temper: 10 }, 99, true) === 'Fully tempered');
  check('no tier level rule: a T3 item tempers at level 10', temperBlocker({ ...common, tier: 3 }, 10, true) === undefined);
  check("uniques and anomalies can't be tempered",
    temperBlocker({ ...common, rarity: { tag: 'Unique' } }, 99, true) !== undefined && temperBlocker({ ...common, rarity: { tag: 'Anomaly' } }, 99, true) !== undefined);

  const sword = makeItem(seededRng(3n), 1, 5, 'Rare');
  const plate = makeItem(seededRng(3n), 39, 5, 'Magic');
  const t10 = tempered({ ...sword, temper: 10 });
  check('+10: weapon hit ×1.2, rounded to a whole hit', Number(t10.weapon!.hit) === Math.round((Number(sword.weapon!.hit) / 100) * 1.2) * 100,
    `${sword.weapon!.hit} → ${t10.weapon!.hit}`);
  check('affixes unchanged by temper', t10.affixes === sword.affixes);
  const p5 = tempered({ ...plate, temper: 5 });
  check('+5: implicits ×1.1', p5.implicits.every((imp, i) => Math.abs(Number(imp.value) - Number(plate.implicits[i].value) * 1.1) <= 100),
    `${plate.implicits.map(i => i.value)} → ${p5.implicits.map(i => i.value)}`);
  check('+0 changes nothing', tempered(sword) === sword);
  const gear = SLOTS.map(sl => (sl === 'MainHand' ? sword : sl === 'Chest' ? plate : undefined));
  const gearT = SLOTS.map(sl => (sl === 'MainHand' ? { ...sword, temper: 10 } : sl === 'Chest' ? { ...plate, temper: 10 } : undefined));
  const a = combatStats(50, gear);
  const b = combatStats(50, gearT);
  check('tempered gear: more damage and armor in combat', b.sources[0].hit.Physical > a.sources[0].hit.Physical * 1.15 && b.armor > a.armor,
    `${a.sources[0].hit.Physical.toFixed(0)} → ${b.sources[0].hit.Physical.toFixed(0)}, armor ${a.armor.toFixed(0)} → ${b.armor.toFixed(0)}`);
}

// ---------------------------------------------------------------- production

{
  const wrath = recipeOf(SkillId.Alchemy, elixirRecipeId(1, 1))!;
  const plenty = { countLeft: 1000, have: () => 1e6, bagFree: 0 };
  const pr = projectProduction(fresh, wrath, plenty, 1n, HOUR);
  check('8 elixirs an hour at level 1 (bag room not needed)', pr.actions === 8 && pr.endedAt === undefined, `${pr.actions}`);
  check('75 XP each at T1', pr.xpGained === 600n && productionCharacterXp(8, wrath) === 600n, `${pr.xpGained}`);
  check('inputs used', pr.used.map(u => `${u.count} ${u.materialId}`).join() === '80 601,8 301');
  check('a running queue settles at its last action', pr.settledMicros === pr.made[7].at && HOUR - pr.settledMicros < 450_000_000n);

  const short = projectProduction(fresh, wrath, { countLeft: 1000, have: id => (id === 601 ? 25 : 10), bagFree: 0 }, 1n, HOUR);
  check('runs out of inputs: ends after the last action', short.actions === 2 && short.endedAt === 900_000_000n && short.settledMicros === 900_000_000n,
    `${short.actions} ${short.endedAt}`);
  const counted = projectProduction(fresh, wrath, { ...plenty, countLeft: 3 }, 1n, HOUR);
  check('stops at its count', counted.actions === 3 && counted.countLeft === 0 && counted.endedAt === counted.made[2].at);
  const none = projectProduction(fresh, wrath, { ...plenty, have: () => 0 }, 1n, HOUR);
  check('nothing to make: ends at once', none.actions === 0 && none.endedAt === 0n);

  const sword = forgeRecipeOf(1, 1)!;
  const bag = projectProduction(fresh, sword, { countLeft: 100, have: () => 1e6, bagFree: 2 }, 1n, HOUR);
  check('forging stops when the bag is full', bag.actions === 2 && bag.endedAt === bag.made[1].at);

  // The keep rule: salvaged bases take no bag slot.
  const magicPlus = { minRarity: 'Magic' as const, keepAffixes: [], minAffixTier: 1 };
  const keeps = (m: { at: bigint; level: number }) => forged(1n, sword, m, magicPlus).kept;
  const ruled = projectProduction(fresh, sword, { countLeft: 30, have: () => 1e6, bagFree: 2, keeps }, 1n, HOUR);
  const kept = ruled.made.filter(m => m.kept).length;
  check('the keep rule spares bag slots: forging goes on past 2 until 2 are kept', kept === 2 && ruled.actions > 2 && ruled.made.at(-1)!.kept,
    `${ruled.actions} made, ${kept} kept`);
  check('kept means Magic or better', ruled.made.every(m => m.kept === (forged(1n, sword, m).item.rarity.tag !== 'Common')));
  check('no rule keeps everything', forged(1n, sword, { at: 5n, level: 1 }).kept);

  // Per-minute settles give the same as one (keep-inputs rolls are seeded per action).
  const lv60 = { level: 60, xp: 0n, settledMicros: 0n };
  let p = { ...lv60 };
  let actions = 0;
  let used = 0;
  let left = 1000;
  for (let t = 60_000_000n; t <= 8n * HOUR; t += 60_000_000n) {
    const step = projectProduction(p, wrath, { ...plenty, countLeft: left }, 7n, t);
    actions += step.actions;
    used += step.used.find(u => u.materialId === 601)?.count ?? 0;
    left = step.countLeft;
    p = step;
  }
  const once = projectProduction(lv60, wrath, plenty, 7n, 8n * HOUR);
  const onceUsed = once.used.find(u => u.materialId === 601)?.count ?? 0;
  check('per-minute settles match one settle', actions === once.actions && used === onceUsed && p.level === once.level,
    `${actions}/${once.actions} used ${used}/${onceUsed}`);
  check('level 60 is no faster and sometimes keeps its inputs', once.actions === 64 && onceUsed < once.actions * 10, `${once.actions}, ${onceUsed}`);
  const capped = projectProduction(fresh, wrath, plenty, 1n, 10n * HOUR, HOUR);
  check('capped settle counts only the cap and ends now', capped.actions === 8 && capped.settledMicros === 10n * HOUR);
}

// ---------------------------------------------------------------- smelting

{
  const ore = recipeOf(SkillId.Smithing, smeltRecipeId(1))!;
  const pr = projectProduction(fresh, ore, { countLeft: 1000, have: () => 1e6, bagFree: 0 }, 1n, HOUR);
  check('Ore: ~300 bars an hour, one per action', pr.actions >= 300 && pr.actions <= 320 && pr.yielded === pr.actions, `${pr.actions} ${pr.yielded}`);
  check('Ore: 2 XP each at T1', pr.xpGained === BigInt(pr.actions * 2), `${pr.xpGained}`);
  const short = projectProduction(fresh, ore, { countLeft: 1000, have: () => 5, bagFree: 0 }, 1n, HOUR);
  check('Ore runs out', short.actions === 5 && short.endedAt !== undefined && short.used[0].count === 5);
}

// ---------------------------------------------------------------- scrap from drops

{
  const rat = ENEMIES_BY_ID.get(101)!.enemy;
  const input = {
    kills: 20_000,
    enemy: rat,
    tier: 1,
    rewardScale: 1,
    itemFind: 0,
    filter: { minRarity: 'Rare' as const, keepAffixes: [], keepTypes: [], minAffixTier: 1 },
    bagFree: 1000,
    discoverRng: seededRng(9n, 1n),
  };
  const salvaged = rollDrops(seededRng(9n), { ...input, discoverRng: seededRng(9n, 1n) });
  const scrapped = rollDrops(seededRng(9n), { ...input, discoverRng: seededRng(9n, 1n), scrap: true });
  const nSalvaged = salvaged.salvaged.Common + salvaged.salvaged.Magic;
  const nScrapped = scrapped.scrapped.reduce((n, x) => n + x.count, 0);
  check('scrap mode: rejected drops become scrap, no Dust or gold', nSalvaged > 0 && nScrapped === nSalvaged && scrapped.dust === 0n && scrapped.gold === 0n,
    `${nSalvaged} salvaged vs ${nScrapped} scrapped, ${scrapped.dust} Dust`);
  check('scrap mode: kept drops unchanged', scrapped.kept.length === salvaged.kept.length && scrapped.seen.length === salvaged.seen.length);
  check('scrap is of the drops\' kinds at the zone tier', scrapped.scrapped.every(x => x.materialId % 100 === 1 && (x.rarity === 'Common' || x.rarity === 'Magic')));
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
  let minTier = 9;
  for (let i = 0; i < 300; i++) for (const a of forgeItem(seededRng(BigInt(i)), 1, 3, 99).affixes) minTier = Math.min(minTier, a.tier);
  check('forged affixes roll from tier 1 at any level, like drops', minTier === 1, `${minTier}`);

  // Dryad's Tear: at least Magic, one affix of the item's tier.
  let common = 0;
  let topped = 0;
  for (let i = 0; i < 1000; i++) {
    const it = forgeItem(seededRng(BigInt(i)), 1, 3, 21, true);
    if (it.rarity.tag === 'Common') common++;
    if (it.affixes[0]?.tier === 3) topped++;
  }
  check("empowered forge: never Common, first affix at the item's tier", common === 0 && topped === 1000, `${common} Common, ${topped} topped`);
  const plain = forgeRecipeOf(1, 2)!;
  const tear = forgeRecipeOf(1, 2, true)!;
  check("empowered forge costs one Dryad's Tear more", tear.id !== plain.id && tear.inputs.length === plain.inputs.length + 1 &&
    tear.inputs.some(i => i.materialId === untieredMaterial('Tear').id && i.count === 1));
  check('empowered forge: same rarity roll otherwise (Rare stays Rare)', (() => {
    for (let i = 0; i < 2000; i++) if (forgeItem(seededRng(BigInt(i)), 1, 1, 1).rarity.tag === 'Rare' && forgeItem(seededRng(BigInt(i)), 1, 1, 1, true).rarity.tag !== 'Rare') return false;
    return true;
  })());
}

// ---------------------------------------------------------------- elixirs in combat

{
  const starter = SLOTS.map(s => (s === 'MainHand' ? { ...forgeItem(seededRng(0n), 1, 1, 1), affixes: [] } : undefined));
  const rat = ENEMIES_BY_ID.get(101)!.enemy;
  const wrath = elixirBuffs(elixirSupplyId(1, 1))!;
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
  check('Wrath ×1.2, infused ×1.3', wrath.damage === 1.2 && near(elixirBuffs(elixirSupplyId(1, 1), true)!.damage, 1.3));
  check('Greater Wrath ×1.3, infused ×1.45', near(elixirBuffs(elixirSupplyId(1, 2))!.damage, 1.3) && near(elixirBuffs(elixirSupplyId(1, 2), true)!.damage, 1.45));
  check('Greater Haste ×1.225', near(elixirBuffs(elixirSupplyId(2, 2))!.attackSpeed, 1.225));
  check('grades: T1–T3 → 1, T4 → 2', [1, 2, 3, 4].map(gradeOf).join() === '1,1,1,2' && SUPPLIES.length === 10);
  check('grade 1 infuses with any of the T1–T3 herbs, lowest first', infuseHerbIds(1).join() === [1, 2, 3].map(t => materialOf(t, 'Herb').id).join());
  check('old elixirs map to their grade (Greater gives back its herb)',
    JSON.stringify([legacyElixir(113), legacyElixir(214), legacyElixir(301)]) === JSON.stringify([{ supplyId: 311 }, { supplyId: 312, herbTier: 4 }, undefined]));
  const plain = matchup(combatStats(1, starter), rat);
  const buffed = matchup(combatStats(1, starter, wrath), rat);
  check('Wrath multiplies DPS', Math.abs(buffed.dps / plain.dps - 1.2) < 1e-9, `${buffed.dps / plain.dps}`);
  const wisdom = elixirBuffs(elixirSupplyId(3, 1))!;
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

  // Infuse: each renewal takes a herb while there are any, then runs plain.
  const strong = elixirBuffs(elixirSupplyId(1, 1), true)!;
  const inf = project(start, { gear: starter, enemy: rat, elixir: { ...run, stock: 3, renew: { plain: wrath, infused: strong, herbs: 2 } } }, T0 + 8n * HOUR);
  check('Infuse: renewals use herbs, then go plain', inf.elixir!.renewed === 3 && inf.elixir!.herbsUsed === 2 && inf.elixir!.infused === false, JSON.stringify(inf.elixir));
  const inf1 = project(start, { gear: starter, enemy: rat, elixir: { ...run, stock: 1, renew: { plain: wrath, infused: strong, herbs: 5 } } }, T0 + 8n * HOUR);
  check('… and the last one is infused while herbs last', inf1.elixir!.herbsUsed === 1 && inf1.elixir!.infused === true, JSON.stringify(inf1.elixir));
}

// ---------------------------------------------------------------- Phials and Voidglass (phials.md)

{
  const glass = untieredMaterial('Voidglass').id;
  check('Phials: 4 kinds a grade, IDs apart from elixirs', PHIALS.length === 8 && PHIALS.every(p => p.id > 400 && !SUPPLIES.some(s => s.id === p.id)));
  const near = (a: number | undefined, b: number) => a !== undefined && Math.abs(a - b) < 1e-9;
  check('Wrath × 1.08, Greater × 1.12', near(phialBuffs(phialSupplyId(1, 1))!.damage, 1.08) && near(phialBuffs(phialSupplyId(1, 2))!.damage, 1.12));
  check('Warding 8% / 12% less damage taken', near(phialBuffs(phialSupplyId(3, 1))!.damageTaken, 0.92) && near(phialBuffs(phialSupplyId(3, 2))!.damageTaken, 0.88));
  check('Renewal heals 30% / 45%', near(phialBuffs(phialSupplyId(4, 1))!.renewal, 0.3) && near(phialBuffs(phialSupplyId(4, 2))!.renewal, 0.45));
  const glassOf = (tier: number) => recipeOf(SkillId.Alchemy, phialRecipeId(1, tier))!.inputs.find(i => i.materialId === glass)?.count;
  check('Voidglass per brew: 5 / 4 / 3 in a grade', [1, 2, 3, 4].map(glassOf).join() === '5,4,3,5');
  const t4 = recipeOf(SkillId.Alchemy, phialRecipeId(4, 4))!;
  check('a brew: 1 Phial from Voidglass, a herb and 10 reagents', t4.output.kind === 'supply' && t4.output.count === 1 && t4.output.supplyId === phialSupplyId(4, 2) &&
    t4.inputs.some(i => i.materialId === materialOf(4, 'Herb').id && i.count === 1) && t4.inputs.some(i => i.materialId === materialOf(4, 'Reagent').id && i.count === 10));
  check('Phials need the Deep open', !!t4.needsDeep && productionBlocker({ level: 99, tier: 4, zoneOpen: true, needsDeep: true, deepOpen: false }) !== undefined &&
    productionBlocker({ level: 99, tier: 4, zoneOpen: true, needsDeep: true, deepOpen: true }) === undefined);

  const gear = SLOTS.map(s => (s === 'MainHand' ? { ...forgeItem(seededRng(0n), 1, 4, 1), affixes: [] } : undefined));
  const plain = combatStats(40, gear);
  const warded = combatStats(40, gear, phialBuffs(phialSupplyId(3, 2)));
  const boss = ENEMIES_BY_ID.get(406)!.enemy;
  check('Warding shrinks the enemy hit', near(matchup(warded, boss).enemyHit / matchup(plain, boss).enemyHit, 0.88));
  const renewing = combatStats(40, gear, phialBuffs(phialSupplyId(4, 2)));
  const d = simulateDepth(renewing, 3, seededRng(1n, 2n));
  const renewals = d.fights.flatMap(f => f.events).filter(e => e.renewed);
  check('Renewal heals once per depth', renewals.length === 1, `${renewals.length}`);

  const geode = (tier: number) => findChances(SkillId.Mining, tier, 0, 0).find(f => f.materialId === glass);
  check('Void Geodes: T4+ Mining only, 2 Voidglass each', !geode(3) && near(geode(4)?.chance, 0.001) && geode(4)?.count === 2);
  const g = rollGathering(seededRng(5n), SKILLS_BY_ID.get(SkillId.Mining)! as never, 4, { actions: 1_000_000, doubleMean: 0, runs: [{ start: 0n, step: 1n, n: 1_000_000, level: 0 }] });
  const got = g.materials.find(m => m.materialId === glass)?.count ?? 0;
  check('… and come in pairs', got > 0 && got % 2 === 0, `${got}`);
  const poolMean = (id: number, drop: number) => {
    const { zone, enemy } = ENEMIES_BY_ID.get(id)!;
    return poolMeans(enemy, zone.tier).find(m => (m.drop.kind === 'material' ? m.drop.materialId : m.drop.supplyId) === drop)?.mean ?? 0;
  };
  check('Voidglass moved to the rare pool: no enemy lists it as a material', ZONES.every(z => z.enemies.every(e => materialMeans(e, z.tier, 1).every(m => m.materialId !== glass))));
  check('pool Voidglass from T4: Selvara ~1 in 510 kills, a T4 Basic ~1 in 2,100, none below T4',
    near(poolMean(406, glass), 0.00196) && Math.round(1 / poolMean(403, glass)) === 2083 && poolMean(306, glass) === 0);
  check('pool rate × rank: Boss 4, Elite 2, Basic 1; an Elite encounter is Elite',
    near(poolMult({ ...ENEMIES_BY_ID.get(406)!.enemy, level: 0 }), 4) && near(poolMult({ ...eliteOf(ENEMIES_BY_ID.get(101)!.enemy), level: 0 }), 2) && near(poolMult({ ...ENEMIES_BY_ID.get(101)!.enemy, level: 0 }), 1));
  check('pool rate rises very slightly with level (+0.5% a level)', near(poolMult(ENEMIES_BY_ID.get(101)!.enemy) / poolMult({ ...ENEMIES_BY_ID.get(101)!.enemy, level: 0 }), 1.005));
  check('Chronoshards far rarer than Voidglass, and rarer by grade', [1, 2, 3].map(g => poolMean(404, chronoshardSupplyId(g))).every((m, i, ms) => m > 0 && m * 8 <= poolMean(404, glass) && (i === 0 || m < ms[i - 1])));
  check('Chronoshards drop from T1 too', poolMean(101, chronoshardSupplyId(1)) > 0);
  const pool = rollPool(seededRng(3n), ENEMIES_BY_ID.get(406)!.enemy, 4, 100_000);
  const pooled = (n: number) => pool.materials.find(m => m.materialId === glass)?.count ?? 0;
  check('rollPool: 100k Selvara kills ~196 Voidglass, some Chronoshards', pooled(0) > 150 && pooled(0) < 250 && pool.supplies.some(x => x.supplyId === chronoshardSupplyId(1)));
  check('Uniques salvage into 2 Voidglass, Legendaries none', salvageVoidglass('Unique') === 2 && salvageVoidglass('Legendary') === 0);
  check('raid clears pay Voidglass (2, then 4)', RAIDS.map(r => r.voidglass).join() === '2,4');
}

check('Chronoshards are supplies 501–503, fast-forwarding 30, 60 and 120 minutes', JSON.stringify(CHRONOSHARDS.map(c => [c.id, c.minutes, c.name])) ===
  JSON.stringify([[501, 30, 'Chronoshard'], [502, 60, 'Greater Chronoshard'], [503, 120, 'Divine Chronoshard']]));

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
