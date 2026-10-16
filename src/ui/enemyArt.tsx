// Enemy art (pixel art portraits) over the line glyphs of Icon.tsx. One image per enemy,
// e-<enemyId>.webp: a 192 px file (a 64 px pixel grid). Made from the masters in
// art-src/enemies/ by `npm run art:enemy:build`; `npm run art:enemy:list` lists what is
// missing. Missing art shows the glyph, so gaps stay visible.

import { useState, type ReactNode } from 'react';

const FILES = import.meta.glob<string>('../assets/enemies/*.webp', { eager: true, query: '?no-inline', import: 'default' });
const URLS = new Map(Object.entries(FILES).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1, -'.webp'.length), url]));

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

/** An enemy's art, or `fallback` (its glyph, or nothing) when art is off or missing. */
export function EnemyArt({ enemyId, fallback = null, className = '' }: { enemyId: number; fallback?: ReactNode; className?: string }) {
  const url = enemyArtUrl(enemyId);
  const [broken, setBroken] = useState<string>();
  if (!url || url === broken) return <>{fallback}</>;
  return <img className={`enemy-art ${className}`} src={url} alt="" loading="lazy" draggable={false} onError={() => setBroken(url)} />;
}
