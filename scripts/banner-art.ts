// Raid banner pipeline (src/ui/enemyArt.tsx `RaidBanner`): one wide scene per raid, keyed
// raid-<raidId> (raid IDs are permanent): the boss in its lair, from the same region and look
// as its sprite (RAID_REGIONS and LOOKS in scripts/enemy-art.ts), so banner and sprite match.
// A scene is not cut: the whole picture is kept, cropped to 4:1 (Nano Banana draws 4:1 itself,
// 2064 x 512). The pipeline is scripts/art-lib.ts:
//
//   npm run art:banner:list   writes art-src/banner-art.csv (every banner the game expects, committed)
//   npm run art:banner:gen -- [raids|key ...] [--cut] [--dry-run] [--model <id>] [--ref <key>[,<key>]]
//                             --ref takes banner keys (raid-1); defaults to BANNER_STYLE_REF in .env
//   npm run art:banner:cut    crops raw images into masters, art-src/banners/preview.html
//   npm run art:banner:build -- [raids|key ...]
//                             src/assets/banners/<key>.webp (as drawn, about 2064 x 512)
// art-src/banners/ is not in git; art-src/banner-art.csv is.
//
// Resolution: kept as the model draws it (about 2064 x 512, art pixels about 5 px wide), never
// resized: the model's pixel blocks don't sit on any grid of ours, and resampling them blurs.
// The Raids list shows it as a thin strip across the page (the middle band of a 4:1 picture),
// so the prompt keeps the boss inside that band.
import { RAIDS, raidBosses } from '../spacetimedb/src/data/raids';
import { runArt, type Art } from './art-lib';
import { LOOKS, RAID_REGIONS } from './enemy-art';

const ASPECT = 4;

const STYLE =
  'pixel art boss battle scene, 16-bit era (like SNES JRPG boss battle backdrops in Final Fantasy VI or Chrono Trigger), ' +
  `drawn on a 400 by ${400 / ASPECT} pixel grid, every pixel a large clean square block, no anti-aliasing, no blur, no smooth gradients ` +
  '(ordered dithering is fine), a limited palette of about 48 colors, flat cel shading, depth shown by layers of color that fade ' +
  'toward the back, a 1-pixel dark outline on the boss so it stands out from the lair, no purple or violet unless the region asks for it';
const RULES =
  'A wide panoramic banner. The boss large in the center-right, three-quarter view facing left, its head and body inside the ' +
  'middle band of the image, away from every edge (the banner is shown as a thinner strip, so the top and bottom get cropped); its lair around and behind it; the left side more open and darker, ' +
  'like the way in where the party arrives. The scene fills the whole image edge to edge. ' +
  'No text, title, logo, labels, numbers, health bars or UI, no border or frame, no heroes or other characters.';

function arts(): { arts: Art[]; missing: string[] } {
  const out: Art[] = [];
  const missing: string[] = [];
  for (const r of RAIDS) {
    const region = RAID_REGIONS[r.id];
    // A duo raid: both brothers, side by side.
    const bosses = raidBosses(r);
    const looks = bosses.map(b => LOOKS[b.id]);
    if (!region) { missing.push(`raid-${r.id} ${r.name}: no RAID_REGIONS entry`); continue; }
    if (looks.some(l => !l)) { missing.push(`raid-${r.id} ${r.name}: no LOOKS entry for a boss (${bosses.map(b => `e-${b.id}`).join(', ')})`); continue; }
    out.push({
      key: `raid-${r.id}`,
      name: r.name,
      group: 'raids',
      tier: r.tier,
      subject: bosses.length > 1
        ? `One raid banner: the raid ${r.name}, its two bosses side by side in their lair.\nStory: ${r.blurb}\n` +
          bosses.map((b, i) => `Boss ${i + 1}: ${looks[i]}.`).join('\n') +
          `\nLair: ${region.setting}.\nPalette: ${region.palette}.\nMotif: ${region.motif}.\nMood: ${region.menace}.`
        : `One raid banner: the raid ${r.name}, its boss ${r.boss.name} waiting in its lair.\nStory: ${r.blurb}\n` +
          `Boss: ${looks[0]}.\nLair: ${region.setting}.\nPalette: ${region.palette}.\nMotif: ${region.motif}.\nMood: ${region.menace}.`,
    });
  }
  return { arts: out, missing };
}

await runArt(
  {
    title: 'Raid banners',
    src: 'art-src/banners',
    csv: '../banner-art.csv',
    out: 'src/assets/banners',
    shape: { kind: 'scene', aspect: ASPECT },
    colors: 256,
    arts,
    common: `Style: ${STYLE}. ${RULES}`,
    refRules:
      'The attached images are finished raid banners from the same game: match their art style exactly (pixel size and density, ' +
      'palette range, shading, dithering, composition and framing). Do not copy their bosses or lairs: draw only the raid described below.',
    refEnv: 'BANNER_STYLE_REF',
  },
  'scripts/banner-art.ts'
);
