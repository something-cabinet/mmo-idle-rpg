// Item art (pixel art icons) over the line glyphs of Icon.tsx. One image per item name:
//   core base: b-<baseId>-t<tier>   (its name changes every tier)
//   variant:   b-<baseId>           (one fixed name)
//   unique:    u-<uniqueId>
// One 144 px file (a 48 px pixel grid), <key>.webp, for tiles and lists alike. Made from
// the masters in art-src/items/ by `npm run art:build`; `npm run art:list` lists what
// is missing. Missing art shows the glyph, so gaps stay visible.

import { useState } from 'react';
import { base } from '../../spacetimedb/src/data/bases';
import { Icon } from './Icon';
import { itemIconName } from './items';

const FILES = import.meta.glob<string>('../assets/items/*.webp', { eager: true, query: '?no-inline', import: 'default' });
const URLS = new Map(Object.entries(FILES).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1, -'.webp'.length), url]));

type ArtItem = { baseId: number; tier: number; uniqueId?: number };

/** File name (no extension) of an item's art. */
function itemArtKey(it: ArtItem): string {
  if (it.uniqueId !== undefined) return `u-${it.uniqueId}`;
  return base(it.baseId).typeId === it.baseId ? `b-${it.baseId}-t${it.tier}` : `b-${it.baseId}`;
}

const ART_KEY = 'itemArt';
/** Settings › Item art (off: line icons). */
export function itemArtOn() {
  try {
    return localStorage.getItem(ART_KEY) !== 'off';
  } catch {
    return true;
  }
}
export function setItemArt(on: boolean) {
  try {
    localStorage.setItem(ART_KEY, on ? 'on' : 'off');
  } catch {
    // storage blocked: the setting lasts for this page only
  }
}

/** URL of an item's art, or undefined when art is off or missing. */
export function itemArtUrl(it: ArtItem): string | undefined {
  return itemArtOn() ? URLS.get(itemArtKey(it)) : undefined;
}

/** An item's art, or its glyph when art is off or missing. */
export function ItemIcon({ it, className = '' }: { it: ArtItem; className?: string }) {
  const url = itemArtUrl(it);
  const [broken, setBroken] = useState<string>();
  if (!url || url === broken) return <Icon name={itemIconName(it)} className={className} />;
  return <img className={`ico item-art ${className}`} src={url} alt="" loading="lazy" draggable={false} onError={() => setBroken(url)} />;
}

/** An item's art alone (item card): nothing when art is off or missing. */
export function ItemArt({ it, className = '' }: { it: ArtItem; className?: string }) {
  const url = itemArtUrl(it);
  const [broken, setBroken] = useState<string>();
  if (!url || url === broken) return null;
  return <img className={`item-art ${className}`} src={url} alt="" draggable={false} onError={() => setBroken(url)} />;
}
