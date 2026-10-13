// Discovery: enemies, item names (drop lists and the Item Index) and uniques show as
// ??? until the player has met them, so they find out what lives where and who drops
// what, and slowly fill out the Item Index. Enemies come from lifetime kills; items
// from the server's `discovery` table, which records every drop the character has
// seen, salvaged ones included.

import type { Matchup } from '../../spacetimedb/src/combat';
import { base } from '../../spacetimedb/src/data/bases';
import { UNIQUES_BY_ID } from '../../spacetimedb/src/data/uniques';
import { ZONES, previousZone, secretState, type AreaDef, type EnemyDef, type ZoneDef } from '../../spacetimedb/src/data/zones';
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

/** "Enemies 4/5 · Items 31/38" counts for a zone. A secret area's enemy only counts once the area is found. */
export function zoneDiscovery(s: Snapshot, z: ZoneDef) {
  const enemies = z.enemies.filter(e => !e.boss && (!e.secret || areaSecret(s, z.areas.find(a => a.enemies.includes(e.id))!) === 'found'));
  const bases = zoneBases(z);
  return {
    enemies: enemies.filter(e => enemyKnown(s, e)).length,
    enemyTotal: enemies.length,
    items: bases.filter(b => baseFound(s, b, z.tier)).length,
    itemTotal: bases.length,
  };
}

/** A secret area's state for the player (zones.ts `secretState`); other areas are 'found'. */
export const areaSecret = (s: Snapshot, a: AreaDef) => secretState(a, id => s.kills.get(id) ?? 0);

/** The previous zone's boss is dead (the first zone is always open). */
export function zoneUnlocked(s: Snapshot, z: ZoneDef) {
  const prev = previousZone(z);
  return !prev || s.killedZones.has(prev.id);
}

/**
 * The area shows on the map by name: once the player has fought there (or is heading
 * there now), and a zone's first area always. A secret area shows once found.
 */
export function areaRevealed(s: Snapshot, z: ZoneDef, a: AreaDef) {
  if (!zoneUnlocked(s, z)) return false;
  if (a.secret) return areaSecret(s, a) === 'found';
  return a === z.areas[0] || a.enemies.some(id => (s.kills.get(id) ?? 0) > 0 || s.row.targetEnemyId === id);
}

/** Every area revealed to the player, in all zones. */
export const revealedAreas = (s: Snapshot): AreaDef[] => ZONES.flatMap(z => z.areas.filter(a => areaRevealed(s, z, a)));

/** Secret areas the player has heard a rumour of but not found yet. */
export const rumouredAreas = (s: Snapshot): AreaDef[] =>
  ZONES.flatMap(z => (zoneUnlocked(s, z) ? z.areas.filter(a => areaSecret(s, a) === 'rumour') : []));
