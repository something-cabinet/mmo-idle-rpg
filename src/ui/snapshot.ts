// The player's data, gathered once per render from the client cache.

import type { DbConnection } from '../module_bindings';
import type { Character, Item, Loadout, LootFilter, SettleLog } from '../module_bindings/types';
import { MAX_LEVEL, combatStats, matchup, type CombatStats, type Matchup } from '../../spacetimedb/src/combat';
import { ENEMIES_BY_ID, type EnemyDef, type ZoneDef } from '../../spacetimedb/src/data/zones';
import { simulate, type Simulated } from '../../spacetimedb/src/sim';
import { SKILLS, SKILLS_BY_ID, type GatheringSkillDef, type ProductionSkillDef, type SkillDef } from '../../spacetimedb/src/data/skills';
import { recipeOf, type Recipe } from '../../spacetimedb/src/data/recipes';
import { SUPPLIES_BY_ID, elixirBuffs, type Buffs, type SupplyDef } from '../../spacetimedb/src/data/supplies';
import { gatherCharacterXp, projectGathering, rollGatheringActions, type Gathered } from '../../spacetimedb/src/gather';
import { forged, productionCharacterXp, projectProduction, type ForgeFilter, type Produced } from '../../spacetimedb/src/produce';
import { addXp } from '../../spacetimedb/src/game';
import { foundKey } from './discovery';

export interface Snapshot {
  conn: DbConnection;
  /** The server row (settled values). */
  row: Character;
  /** Projected to now: what the player sees. */
  level: number;
  xp: bigint;
  gold: bigint;
  /** Gains since the last settle (not yet in `row` or a settle log). */
  pending: { kills: number; xp: bigint; gold: bigint };
  items: Map<bigint, Item>;
  /** Material ID → count held, with what gathering made since the last settle. */
  materials: Map<number, bigint>;
  /** By index. */
  loadouts: Loadout[];
  active: Loadout;
  /** The active loadout's items in slot order. */
  gear: (Item | undefined)[];
  /** Item ID → indexes of the loadouts it is in. */
  inLoadouts: Map<bigint, number[]>;
  /** Items in no loadout (they count against the bag size). */
  bag: Item[];
  filter: LootFilter | undefined;
  killedZones: Set<number>;
  /** Enemy ID → lifetime kills, online and offline, including `pending`. */
  kills: Map<number, number>;
  /** Bases and uniques seen dropping (`foundKey`); others show as ??? (discovery.ts). */
  found: Set<string>;
  /** Newest first. */
  logs: SettleLog[];
  /** Undefined when idle, including after a defeat the server hasn't recorded yet. */
  target: { zone: ZoneDef; enemy: EnemyDef } | undefined;
  /** The projection shows the target killed us; the server will clear it on its next settle. */
  defeated: boolean;
  /** The projection shows a boss's first kill, which the server grants on its next settle. */
  firstBossKill: boolean;
  /** From level and gear, without the elixir (it depends on the zone: `statsIn`). */
  stats: CombatStats;
  /** The active elixir's buffs in the target's zone; undefined without either. */
  buffs: Buffs | undefined;
  /** Against the target, with the elixir; undefined without a target. */
  fight: Matchup | undefined;
  /** The latest live fight (sim.ts `simulate`), which the fight scene animates; undefined when idle. */
  current: Simulated['current'];
  /** Skill ID → level and XP, projected to now. */
  skills: Map<number, { level: number; xp: bigint }>;
  /** Gathering skill ID → tool tier. */
  tools: Map<number, number>;
  /** The life skill being worked (then `target` is undefined): one of `gathering` and `production`. */
  skilling: SkillDef | undefined;
  /** The gathering in progress; its projection holds the actions since the last settle. */
  gathering: { skill: GatheringSkillDef; tier: number; toolTier: number; projected: Gathered } | undefined;
  /**
   * The production queue in progress; its projection holds the actions since the last
   * settle (`projected.endedAt`: done, the server goes back to combat on its next settle).
   */
  production: { skill: ProductionSkillDef; recipe: Recipe; projected: Produced } | undefined;
  /** Supply ID → count in stock (after auto-renew so far). */
  supplies: Map<number, number>;
  /** The forge keep rule; undefined keeps every forged base. */
  forgeFilter: ForgeFilter | undefined;
  /** The active elixir, projected to now; undefined when the slot is empty. */
  elixir: { supply: SupplyDef; killsLeft: number } | undefined;
}

/** Combat stats in a zone of `zoneTier`, with the active elixir (full effect up to its tier, half above). */
export const statsIn = (s: Snapshot, zoneTier: number): CombatStats =>
  s.elixir ? combatStats(s.level, s.gear, elixirBuffs(s.elixir.supply.id, zoneTier)) : s.stats;

export const gearFor = (slots: readonly bigint[], items: Map<bigint, Item>): (Item | undefined)[] => slots.map(id => items.get(id));

export function snapshot(conn: DbConnection, row: Character, nowMicros: bigint): Snapshot {
  const items = new Map([...conn.db.myItems.iter()].map(i => [i.id, i]));
  const loadouts = [...conn.db.myLoadouts.iter()].sort((a, b) => a.index - b.index);
  const active = loadouts.find(l => l.index === row.activeLoadout) ?? loadouts[0];
  const gear = gearFor(active?.slots ?? [], items);
  const skilling = SKILLS_BY_ID.get(row.activitySkill);
  // The target is kept while skilling, but not fought.
  const fighting = skilling ? undefined : ENEMIES_BY_ID.get(row.targetEnemyId);
  const ff = [...conn.db.myForgeFilter.iter()][0];
  const forgeFilter: ForgeFilter | undefined = ff && { minRarity: ff.minRarity.tag, keepAffixes: ff.keepAffixes, minAffixTier: ff.minAffixTier };
  const supplies = new Map([...conn.db.mySupplies.iter()].map(r => [r.supplyId, Number(r.count)]));
  const elixirSupply = row.elixirKillsLeft > 0 ? SUPPLIES_BY_ID.get(row.elixirId) : undefined;
  const buffsNow = fighting && elixirSupply && elixirBuffs(elixirSupply.id, fighting.zone.tier);
  const elixirRun = buffsNow && { buffs: buffsNow, killsLeft: row.elixirKillsLeft, stock: row.elixirAutoRenew ? supplies.get(row.elixirId) ?? 0 : 0 };
  const settledMicros = row.lastSettledAt.microsSinceUnixEpoch;
  // We're online: progress is the live fights the server will settle (sim.ts), not the offline formulas.
  let p = simulate({ ...row, settledMicros }, { gear, enemy: fighting?.enemy, elixir: elixirRun }, nowMicros, row.id);
  const defeated = p.defeatedAt !== undefined;
  // The elixir after the kills so far: auto-renew takes from stock, an empty slot stays empty.
  let elixir: Snapshot['elixir'] = elixirSupply && { supply: elixirSupply, killsLeft: row.elixirKillsLeft };
  if (elixirSupply && p.elixir) {
    supplies.set(elixirSupply.id, (supplies.get(elixirSupply.id) ?? 0) - p.elixir.renewed);
    elixir = p.elixir.killsLeft > 0 ? { supply: elixirSupply, killsLeft: p.elixir.killsLeft } : undefined;
  }
  const skills = new Map<number, { level: number; xp: bigint }>(SKILLS.map(sk => [sk.id, { level: 1, xp: 0n }]));
  for (const r of conn.db.mySkills.iter()) skills.set(r.skillId, { level: r.level, xp: r.xp });
  const tools = new Map([...conn.db.myTools.iter()].map(r => [r.skillId, r.tier]));
  const materials = new Map([...conn.db.myMaterials.iter()].map(m => [m.materialId, m.count]));
  const inLoadouts = new Map<bigint, number[]>();
  for (const lo of loadouts) for (const id of lo.slots) if (id !== 0n) inLoadouts.set(id, [...(inLoadouts.get(id) ?? []), lo.index]);
  const bag = [...items.values()].filter(i => !inLoadouts.has(i.id));
  let gathering: Snapshot['gathering'];
  let production: Snapshot['production'];
  const recipe = skilling?.kind === 'Production' ? recipeOf(skilling.id, row.activityRecipe) : undefined;
  if (skilling?.kind === 'Production' && recipe) {
    const at = skills.get(skilling.id)!;
    const queue = {
      countLeft: row.activityCountLeft,
      have: (id: number) => Number(materials.get(id) ?? 0n),
      bagFree: row.bagSize - bag.length,
      keeps: (m: { at: bigint; level: number }) => forged(row.id, recipe, m, forgeFilter).kept,
    };
    const projected = projectProduction({ ...at, settledMicros }, recipe, queue, row.id, nowMicros);
    skills.set(skilling.id, { level: projected.level, xp: projected.xp });
    production = { skill: skilling, recipe, projected };
    const gained = productionCharacterXp(projected.actions, recipe);
    p = { ...p, ...addXp(p.level, p.xp, gained), xpGained: p.level >= MAX_LEVEL ? 0n : gained };
  } else if (skilling?.kind === 'Gathering') {
    const at = skills.get(skilling.id)!;
    const toolTier = tools.get(skilling.id) ?? 1;
    const tier = row.activityRecipe;
    const projected = projectGathering({ ...at, settledMicros: row.lastSettledAt.microsSinceUnixEpoch }, { tier, toolTier }, nowMicros);
    skills.set(skilling.id, { level: projected.level, xp: projected.xp });
    gathering = { skill: skilling, tier, toolTier, projected };
    // What each action made, rolled as the server's next settle will.
    for (const d of rollGatheringActions(row.id, skilling, tier, projected)) materials.set(d.materialId, (materials.get(d.materialId) ?? 0n) + BigInt(d.count));
    // Skilling's character XP (sim.ts saw no target, so `p` holds the settled values).
    const gained = gatherCharacterXp(projected.actions, tier);
    p = { ...p, ...addXp(p.level, p.xp, gained), xpGained: p.level >= MAX_LEVEL ? 0n : gained };
  }
  const target = defeated ? undefined : fighting;
  const stats = combatStats(p.level, gear);
  const buffs = target && elixir && elixirBuffs(elixir.supply.id, target.zone.tier);
  const killedZones = new Set([...conn.db.myBossKills.iter()].map(k => k.zoneId));
  const kills = new Map([...conn.db.myEnemyKills.iter()].map(k => [k.enemyId, Number(k.kills)]));
  if (target && p.kills > 0) kills.set(target.enemy.id, (kills.get(target.enemy.id) ?? 0) + p.kills);

  return {
    conn,
    row,
    level: p.level,
    xp: p.xp,
    gold: p.gold,
    pending: { kills: p.kills, xp: p.xpGained, gold: p.gold - row.gold },
    items,
    materials,
    loadouts,
    active,
    gear,
    inLoadouts,
    bag,
    filter: [...conn.db.myLootFilter.iter()][0],
    killedZones,
    kills,
    found: new Set([...conn.db.myDiscoveries.iter()].map(d => foundKey(d.baseId, d.tier, d.uniqueId))),
    logs: [...conn.db.mySettleLog.iter()].sort((a, b) => (a.id < b.id ? 1 : -1)),
    target,
    defeated,
    firstBossKill: !!target?.enemy.boss && p.kills > 0 && !killedZones.has(target.zone.id),
    stats,
    buffs,
    fight: target && matchup(buffs ? combatStats(p.level, gear, buffs) : stats, target.enemy),
    current: p.current,
    skills,
    tools,
    skilling,
    gathering,
    production,
    supplies,
    forgeFilter,
    elixir,
  };
}
