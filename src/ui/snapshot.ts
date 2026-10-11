// The player's data, gathered once per render from the client cache.

import type { DbConnection } from '../module_bindings';
import type { Character, Item, Loadout, LootFilter, SettleLog } from '../module_bindings/types';
import { combatStats, matchup, type CombatStats, type Matchup } from '../../spacetimedb/src/combat';
import { ENEMIES_BY_ID, type EnemyDef, type ZoneDef } from '../../spacetimedb/src/data/zones';
import { project } from '../../spacetimedb/src/game';

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
  /**
   * Server time the current fight cycle started: the last granted kill (projected), or
   * when a fight that grants none began. The fight animation runs from it.
   */
  fightSince: bigint;
}

export const gearFor = (slots: readonly bigint[], items: Map<bigint, Item>): (Item | undefined)[] => slots.map(id => items.get(id));

export function snapshot(conn: DbConnection, row: Character, nowMicros: bigint): Snapshot {
  const items = new Map([...conn.db.myItems.iter()].map(i => [i.id, i]));
  const loadouts = [...conn.db.myLoadouts.iter()].sort((a, b) => a.index - b.index);
  const active = loadouts.find(l => l.index === row.activeLoadout) ?? loadouts[0];
  const gear = gearFor(active?.slots ?? [], items);
  const fighting = ENEMIES_BY_ID.get(row.targetEnemyId);
  const p = project({ ...row, settledMicros: row.lastSettledAt.microsSinceUnixEpoch }, { gear, enemy: fighting?.enemy }, nowMicros);
  const defeated = p.defeatedAt !== undefined;
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
    loadouts,
    active,
    gear,
    inLoadouts,
    bag: [...items.values()].filter(i => !inLoadouts.has(i.id)),
    filter: [...conn.db.myLootFilter.iter()][0],
    killedZones,
    kills,
    logs: [...conn.db.mySettleLog.iter()].sort((a, b) => (a.id < b.id ? 1 : -1)),
    target,
    defeated,
    firstBossKill: !!target?.enemy.boss && p.kills > 0 && !killedZones.has(target.zone.id),
    stats,
    fight: target && matchup(stats, target.enemy),
    // A lost or endless fight settles nothing: it runs from the last settle.
    fightSince: p.kills > 0 ? p.settledMicros : row.lastSettledAt.microsSinceUnixEpoch,
  };
}
