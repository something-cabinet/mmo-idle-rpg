// The player's data, gathered once per render from the client cache.

import type { DbConnection } from '../module_bindings';
import type { Character, Item, Loadout, LootFilter, SettleLog } from '../module_bindings/types';
import { MAX_LEVEL, combatStats, matchup, type CombatStats, type Matchup } from '../../spacetimedb/src/combat';
import { ENEMIES_BY_ID, type EnemyDef, type ZoneDef } from '../../spacetimedb/src/data/zones';
import { simulate, type Simulated } from '../../spacetimedb/src/sim';
import { SKILLS, SKILLS_BY_ID, type SkillDef } from '../../spacetimedb/src/data/skills';
import { gatherCharacterXp, projectGathering, type Gathered } from '../../spacetimedb/src/gather';
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
  /** Material ID → count held. */
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
  stats: CombatStats;
  /** Against the target; undefined without one. */
  fight: Matchup | undefined;
  /** The latest live fight (sim.ts `simulate`), which the fight scene animates; undefined when idle. */
  current: Simulated['current'];
  /** Skill ID → level and XP, projected to now. */
  skills: Map<number, { level: number; xp: bigint }>;
  /** Gathering skill ID → tool tier. */
  tools: Map<number, number>;
  /** The gathering in progress (then `target` is undefined); its projection holds the actions since the last settle. */
  gathering: { skill: SkillDef; tier: number; toolTier: number; projected: Gathered } | undefined;
}

export const gearFor = (slots: readonly bigint[], items: Map<bigint, Item>): (Item | undefined)[] => slots.map(id => items.get(id));

export function snapshot(conn: DbConnection, row: Character, nowMicros: bigint): Snapshot {
  const items = new Map([...conn.db.myItems.iter()].map(i => [i.id, i]));
  const loadouts = [...conn.db.myLoadouts.iter()].sort((a, b) => a.index - b.index);
  const active = loadouts.find(l => l.index === row.activeLoadout) ?? loadouts[0];
  const gear = gearFor(active?.slots ?? [], items);
  const skilling = SKILLS_BY_ID.get(row.activitySkill);
  // The target is kept while skilling, but not fought.
  const fighting = skilling ? undefined : ENEMIES_BY_ID.get(row.targetEnemyId);
  // We're online: progress is the live fights the server will settle (sim.ts), not the offline formulas.
  let p = simulate({ ...row, settledMicros: row.lastSettledAt.microsSinceUnixEpoch }, { gear, enemy: fighting?.enemy }, nowMicros, row.id);
  const defeated = p.defeatedAt !== undefined;
  const skills = new Map<number, { level: number; xp: bigint }>(SKILLS.map(sk => [sk.id, { level: 1, xp: 0n }]));
  for (const r of conn.db.mySkills.iter()) skills.set(r.skillId, { level: r.level, xp: r.xp });
  const tools = new Map([...conn.db.myTools.iter()].map(r => [r.skillId, r.tier]));
  let gathering: Snapshot['gathering'];
  if (skilling) {
    const at = skills.get(skilling.id)!;
    const toolTier = tools.get(skilling.id) ?? 1;
    const tier = row.activityRecipe;
    const projected = projectGathering({ ...at, settledMicros: row.lastSettledAt.microsSinceUnixEpoch }, { tier, toolTier }, nowMicros);
    skills.set(skilling.id, { level: projected.level, xp: projected.xp });
    gathering = { skill: skilling, tier, toolTier, projected };
    // Skilling's character XP (sim.ts saw no target, so `p` holds the settled values).
    const gained = gatherCharacterXp(projected.actions, tier);
    p = { ...p, ...addXp(p.level, p.xp, gained), xpGained: p.level >= MAX_LEVEL ? 0n : gained };
  }
  const target = defeated ? undefined : fighting;

  const inLoadouts = new Map<bigint, number[]>();
  for (const lo of loadouts) for (const id of lo.slots) if (id !== 0n) inLoadouts.set(id, [...(inLoadouts.get(id) ?? []), lo.index]);
  const stats = combatStats(p.level, gear);
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
    materials: new Map([...conn.db.myMaterials.iter()].map(m => [m.materialId, m.count])),
    loadouts,
    active,
    gear,
    inLoadouts,
    bag: [...items.values()].filter(i => !inLoadouts.has(i.id)),
    filter: [...conn.db.myLootFilter.iter()][0],
    killedZones,
    kills,
    found: new Set([...conn.db.myDiscoveries.iter()].map(d => foundKey(d.baseId, d.tier, d.uniqueId))),
    logs: [...conn.db.mySettleLog.iter()].sort((a, b) => (a.id < b.id ? 1 : -1)),
    target,
    defeated,
    firstBossKill: !!target?.enemy.boss && p.kills > 0 && !killedZones.has(target.zone.id),
    stats,
    fight: target && matchup(stats, target.enemy),
    current: p.current,
    skills,
    tools,
    gathering,
  };
}
