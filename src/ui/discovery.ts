// Discovery: enemies, item names (drop lists and the Item Index) and uniques show as
// ??? until the player has met them, so they find out what lives where and who drops
// what, and slowly fill out the Item Index. Enemies come from lifetime kills; items
// from the server's `discovery` table, which records every drop the character has
// seen, salvaged ones included.

import type { Matchup } from '../../spacetimedb/src/combat';
import { base } from '../../spacetimedb/src/data/bases';
import { UNIQUES_BY_ID } from '../../spacetimedb/src/data/uniques';
import { ZONES, previousZone, type AreaDef, type EnemyDef, type ZoneDef } from '../../spacetimedb/src/data/zones';
import type { Snapshot } from './snapshot';

export const UNKNOWN = '???';

export const foundKey = (baseId: number, tier: number, uniqueId = 0) => `${baseId}:${tier}:${uniqueId}`;

/** The base has dropped for the player at `tier`. */
export const baseFound = (s: Snapshot, baseId: number, tier: number) => s.found.has(foundKey(baseId, tier));
export const uniqueFound = (s: Snapshot, u: { id: number; baseId: number; tier: number }) => s.found.has(foundKey(u.baseId, u.tier, u.id));

/** A discovery's display name: the unique's, or the base's at its tier. */
export const foundName = (f: { baseId: number; tier: number; uniqueId: number }) =>
  (f.uniqueId !== 0 && UNIQUES_BY_ID.get(f.uniqueId)?.name) || base(f.baseId).name(f.tier);

/** Killed at least once, or being fought now. Bosses are always known: they're the zone's goal. */
export const enemyKnown = (s: Snapshot, e: EnemyDef) => !!e.boss || (s.kills.get(e.id) ?? 0) > 0 || s.row.targetEnemyId === e.id;

/** How an unknown enemy looks from afar, from the real matchup. */
export function threat(m: Matchup): { label: string; cls: string } {
  if (!m.viable) return { label: 'Deadly', cls: 'c-bad' };
  const r = m.timeToKill / m.timeToDie;
  return r < 0.4 ? { label: 'Easy', cls: 'c-ok' } : r < 0.8 ? { label: 'Even', cls: 'muted' } : { label: 'Risky', cls: 'c-gold' };
}

/** Distinct bases the zone's enemies drop. */
export const zoneBases = (z: ZoneDef) => [...new Set(z.enemies.flatMap(e => e.drops))];

/** "Enemies 4/5 · Items 31/38" counts for a zone. */
export function zoneDiscovery(s: Snapshot, z: ZoneDef) {
  const enemies = z.enemies.filter(e => !e.boss);
  const bases = zoneBases(z);
  return {
    enemies: enemies.filter(e => enemyKnown(s, e)).length,
    enemyTotal: enemies.length,
    items: bases.filter(b => baseFound(s, b, z.tier)).length,
    itemTotal: bases.length,
  };
}

/** The previous zone's boss is dead (the first zone is always open). */
export function zoneUnlocked(s: Snapshot, z: ZoneDef) {
  const prev = previousZone(z);
  return !prev || s.killedZones.has(prev.id);
}

/** Lifetime kills of all the zone's enemies: they explore it (zones.md, "Zone map"). */
export const zoneKills = (s: Snapshot, z: ZoneDef) => z.enemies.reduce((sum, e) => sum + (s.kills.get(e.id) ?? 0), 0);

/** The area shows on the map by name: the zone's kills reached its threshold, or the player fought there. */
export const areaRevealed = (s: Snapshot, z: ZoneDef, a: AreaDef) =>
  zoneUnlocked(s, z) && (zoneKills(s, z) >= a.reveal || a.enemies.some(id => (s.kills.get(id) ?? 0) > 0 || s.row.targetEnemyId === id));

/** How far the zone is explored: 0–1 of the kills that reveal its last area, and the kills to the next reveal. */
export function exploration(s: Snapshot, z: ZoneDef) {
  const kills = zoneKills(s, z);
  const full = Math.max(...z.areas.map(a => a.reveal));
  const next = z.areas.filter(a => a.reveal > kills && !areaRevealed(s, z, a)).sort((a, b) => a.reveal - b.reveal)[0];
  return { share: full ? Math.min(1, kills / full) : 1, toNext: next && next.reveal - kills };
}

/** Every area revealed to the player, in all zones. */
export const revealedAreas = (s: Snapshot): AreaDef[] => ZONES.flatMap(z => z.areas.filter(a => areaRevealed(s, z, a)));
