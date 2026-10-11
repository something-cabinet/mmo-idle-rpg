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
  /** Newest first. */
  logs: SettleLog[];
  target: { zone: ZoneDef; enemy: EnemyDef } | undefined;
  stats: CombatStats;
  /** Against the target; undefined without one. */
  fight: Matchup | undefined;
}

export const gearFor = (slots: readonly bigint[], items: Map<bigint, Item>): (Item | undefined)[] => slots.map(id => items.get(id));

export function snapshot(conn: DbConnection, row: Character, nowMicros: bigint): Snapshot {
  const items = new Map([...conn.db.myItems.iter()].map(i => [i.id, i]));
  const loadouts = [...conn.db.myLoadouts.iter()].sort((a, b) => a.index - b.index);
  const active = loadouts.find(l => l.index === row.activeLoadout) ?? loadouts[0];
  const gear = gearFor(active?.slots ?? [], items);
  const target = ENEMIES_BY_ID.get(row.targetEnemyId);
  const p = project({ ...row, settledMicros: row.lastSettledAt.microsSinceUnixEpoch }, { gear, enemy: target?.enemy }, nowMicros);

  const inLoadouts = new Map<bigint, number[]>();
  for (const lo of loadouts) for (const id of lo.slots) if (id !== 0n) inLoadouts.set(id, [...(inLoadouts.get(id) ?? []), lo.index]);
  const stats = combatStats(p.level, gear);

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
    killedZones: new Set([...conn.db.myBossKills.iter()].map(k => k.zoneId)),
    logs: [...conn.db.mySettleLog.iter()].sort((a, b) => (a.id < b.id ? 1 : -1)),
    target,
    stats,
    fight: target && matchup(stats, target.enemy),
  };
}
