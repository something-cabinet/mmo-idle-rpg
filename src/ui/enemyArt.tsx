// Enemy art (pixel art portraits) over the line glyphs of Icon.tsx. One image per enemy,
// e-<enemyId>.webp: a 384 px file, as the model drew it. Made from the masters in
// art-src/enemies/ by `npm run art:enemy:build`; `npm run art:enemy:list` lists what is
// missing. Missing art shows the glyph, so gaps stay visible.
// Raid banners (a wide scene of the boss in its lair), raid-<raidId>.webp in assets/banners:
// a 1280 x 400 file (a 320 x 100 grid), from `npm run art:banner:build`. Same setting as enemy art.
// Zone maps (an overworld scene behind the Zones map), zone-<zoneId>.webp in assets/zones: about
// 1024 px square, from `npm run art:zone:build`. Same setting too.

import { useState, type ReactNode } from 'react';

const FILES = import.meta.glob<string>('../assets/enemies/*.webp', { eager: true, query: '?no-inline', import: 'default' });
const BANNERS = import.meta.glob<string>('../assets/banners/*.webp', { eager: true, query: '?no-inline', import: 'default' });
const ZONE_MAPS = import.meta.glob<string>('../assets/zones/*.webp', { eager: true, query: '?no-inline', import: 'default' });
const byKey = (files: Record<string, string>) =>
  new Map(Object.entries(files).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1, -'.webp'.length), url]));
const URLS = byKey(FILES);
const BANNER_URLS = byKey(BANNERS);
const ZONE_URLS = byKey(ZONE_MAPS);

const ART_KEY = 'enemyArt';
/** Settings › Enemy art (off: line icons). */
export function enemyArtOn() {
  try {
    return localStorage.getItem(ART_KEY) !== 'off';
  } catch {
    return true;
  }
}
export function setEnemyArt(on: boolean) {
  try {
    localStorage.setItem(ART_KEY, on ? 'on' : 'off');
  } catch {
    // storage blocked: the setting lasts for this page only
  }
}

/** URL of an enemy's art, or undefined when art is off or missing. */
export function enemyArtUrl(enemyId: number): string | undefined {
  return enemyArtOn() ? URLS.get(`e-${enemyId}`) : undefined;
}

const ZONE_ART_KEY = 'zoneArt';
/** Settings › Zone art (off: the map's plain colors). */
export function zoneArtOn() {
  try {
    return localStorage.getItem(ZONE_ART_KEY) !== 'off';
  } catch {
    return true;
  }
}
export function setZoneArt(on: boolean) {
  try {
    localStorage.setItem(ZONE_ART_KEY, on ? 'on' : 'off');
  } catch {
    // storage blocked: the setting lasts for this page only
  }
}

/** URL of a zone's map backdrop, or undefined when zone art is off or missing (the map keeps its plain colors). */
export function zoneArtUrl(zoneId: number): string | undefined {
  return zoneArtOn() ? ZONE_URLS.get(`zone-${zoneId}`) : undefined;
}

/** An enemy's art, or `fallback` (its glyph, or nothing) when art is off or missing. */
export function EnemyArt({ enemyId, fallback = null, className = '' }: { enemyId: number; fallback?: ReactNode; className?: string }) {
  const url = enemyArtUrl(enemyId);
  const [broken, setBroken] = useState<string>();
  if (!url || url === broken) return <>{fallback}</>;
  return <img className={`enemy-art ${className}`} src={url} alt="" loading="lazy" draggable={false} onError={() => setBroken(url)} />;
}

/** A raid's banner across its card, or `fallback` (the boss's sprite) when art is off or missing. */
export function RaidBanner({ raidId, fallback = null }: { raidId: number; fallback?: ReactNode }) {
  const url = enemyArtOn() ? BANNER_URLS.get(`raid-${raidId}`) : undefined;
  const [broken, setBroken] = useState<string>();
  if (!url || url === broken) return <>{fallback}</>;
  return <img className="raid-banner" src={url} alt="" loading="lazy" draggable={false} onError={() => setBroken(url)} />;
}
