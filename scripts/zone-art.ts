// Zone map backdrops (src/ui/enemyArt.tsx `zoneArtUrl`, behind the Zones map): one overworld
// scene per zone, keyed zone-<zoneId> (zone IDs are permanent), in the region's setting and
// palette (REGIONS in scripts/enemy-art.ts), so map and enemies match. Each area's landmark is
// painted about where its spot sits on the map (AreaDef x, y); secret areas are left out, so the
// art gives none away. A scene is not cut: the whole picture is kept, cropped square. The
// pipeline is scripts/art-lib.ts:
//
//   npm run art:zone:list    writes art-src/zone-art.csv (every backdrop the game expects, committed)
//   npm run art:zone:gen -- [zones|key ...] [--cut] [--dry-run] [--model <id>] [--ref <key>[,<key>]]
//                            --ref takes zone keys (zone-1); defaults to ZONE_STYLE_REF in .env
//   npm run art:zone:cut     crops raw images into masters, art-src/zones/preview.html
//   npm run art:zone:build -- [zones|key ...]
//                            src/assets/zones/<key>.webp (as drawn, about 1024 x 1024)
// art-src/zones/ is not in git; art-src/zone-art.csv is. Adding a zone, step by step: docs/zone-art.md.
//
// Resolution: kept as the model draws it, never resized (resampling its pixel blocks blurs them).
// The map shows it with `cover`, so on a wide map the top and bottom get cropped a little.
import { ENEMIES_BY_ID, ZONES } from '../spacetimedb/src/data/zones';
import { runArt, type Art } from './art-lib';
import { REGIONS } from './enemy-art';

const STYLE =
  'pixel art overworld map, 16-bit era (like the SNES JRPG world maps of Final Fantasy VI or Chrono Trigger), seen from high ' +
  'above at a slight tilt, drawn on a 256 by 256 pixel grid, every pixel a large clean square block, no anti-aliasing, no blur, ' +
  'no smooth gradients (ordered dithering is fine), a limited palette of about 48 colors, flat cel shading, lit from the top left';
const RULES =
  'A game map backdrop: round markers and labels are drawn on top of it, so keep it calm and readable: mid-to-dark values, ' +
  'soft contrast, no bright or busy patch at a landmark itself (each landmark sits just beside its spot), open ground between landmarks. ' +
  'The scene fills the whole square edge to edge. No grid lines, tile seams or checkerboard pattern. No text, names, labels, letters, numbers, map pins, icons, compass, legend, ' +
  'border, frame, parchment or UI; no characters, creatures or monsters.';

/** Where an area sits on the map (x, y in 0–100 from the top left), in words. */
const where = (x: number, y: number) => {
  const v = y < 34 ? 'top' : y > 66 ? 'bottom' : 'middle';
  const h = x < 34 ? 'left' : x > 66 ? 'right' : 'center';
  return v === 'middle' && h === 'center' ? 'center' : v === 'middle' ? `${h} edge, halfway down` : `${v} ${h}`;
};

function arts(): { arts: Art[]; missing: string[] } {
  const out: Art[] = [];
  const missing: string[] = [];
  for (const z of ZONES) {
    const region = REGIONS[z.id];
    if (!region) { missing.push(`zone-${z.id} ${z.name}: no REGIONS entry`); continue; }
    const areas = z.areas.filter(a => !a.secret);
    // Landmarks by number, never by name: given a name, the model writes it on the map.
    const num = new Map(areas.map((a, i) => [a.id, i + 1]));
    const lair = areas.find(a => a.enemies.some(id => ENEMIES_BY_ID.get(id)?.enemy.boss));
    const roads = z.links.filter(([a, b]) => num.has(a) && num.has(b)).map(([a, b]) => `${num.get(a)} and ${num.get(b)}`);
    const place = region.map ?? region.setting;
    const setting = place.startsWith(`${z.name}, `) ? place.slice(z.name.length + 2) : place;
    out.push({
      key: `zone-${z.id}`,
      name: z.name,
      group: 'zones',
      tier: z.tier,
      subject:
        `One zone map. Setting: ${setting}.\nPalette: ${region.palette}.\n` +
        `Landmarks, each small and placed where given:\n${areas.map(a => `${num.get(a.id)}. ${where(a.x, a.y)}: ${a.blurb}`).join('\n')}\n` +
        `Faint dirt trails join landmarks ${roads.join('; ')}.\n` +
        (lair ? `The land grows darker and wilder toward landmark ${num.get(lair.id)}, where the boss waits.\n` : '') +
        'The landmarks are unnamed: write nothing anywhere on the map.',
    });
  }
  return { arts: out, missing };
}

await runArt(
  {
    title: 'Zone maps',
    src: 'art-src/zones',
    csv: '../zone-art.csv',
    out: 'src/assets/zones',
    shape: { kind: 'scene', aspect: 1 },
    colors: 256,
    arts,
    common: `Style: ${STYLE}. ${RULES}`,
    refRules:
      'The attached images are finished zone maps from the same game: match their art style exactly (pixel size and density, ' +
      'palette range, shading, dithering, viewpoint and how calm they are). Do not copy their places: draw only the zone described below.',
    refEnv: 'ZONE_STYLE_REF',
  },
  'scripts/zone-art.ts'
);
