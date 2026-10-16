// Enemy art pipeline (src/ui/enemyArt.tsx): one portrait per enemy, keyed e-<enemyId> (enemy IDs
// are permanent). Each prompt joins its region's theme (REGIONS: setting, palette, motif, how
// fierce the tier looks) with the enemy's own look (LOOKS) and its role (normal, secret, boss),
// then the style every enemy shares, so a zone's enemies read as one family and every zone as
// one game. The pipeline itself (gen, cut, build) is scripts/art-lib.ts:
//
//   npm run art:enemy:list   writes art-src/enemy-art.csv (every portrait the game expects, committed)
//   npm run art:enemy:gen -- [group|key ...] [--cut] [--dry-run] [--model <id>] [--ref <key>[,<key>]]
//                            a group (greenhollow, thornwood, ..., raid-wyrm-hollow) or a key (e-101);
//                            --ref defaults to ENEMY_STYLE_REF in .env
//   npm run art:enemy:cut    raw images into masters, art-src/enemies/preview.html
//   npm run art:enemy:build -- [group|key ...]
//                            src/assets/enemies/<key>.webp (64 px grid, 192 px file)
// art-src/enemies/ is not in git; art-src/enemy-art.csv is.
//
// Resolution: a 64 px pixel grid, every pixel 3x3 in a 192 px file. Items use 48 px; a creature
// needs more pixels than an item for a face and a pose. The fight scene shows it at 96 px
// (crisp on 2x screens), Zones lists at 44 px; pixelated scaling keeps the blocks hard at any size.
import { ZONES } from '../spacetimedb/src/data/zones';
import { RAIDS } from '../spacetimedb/src/data/raids';
import { runArt, type Art } from './art-lib';

const PIXELS = 64;

// ------------------------------------------------------------------ prompts
// No purple, violet or pink anywhere: the cutter keys the magenta background by hue, and those
// take a creature's edge with it. Indigo, teal and crimson are safe.

const STYLE =
  'pixel art RPG battle sprite of an enemy, 16-bit era (like SNES JRPG enemy sprites in Final Fantasy VI or Chrono Trigger), ' +
  `drawn on a ${PIXELS} by ${PIXELS} pixel grid with the creature about ${Math.round(PIXELS * 0.88)} pixels across, ` +
  'every pixel a large clean square block, no anti-aliasing, no blur, no gradients, a 1-pixel dark outline around the whole creature, ' +
  'a limited palette of about 24 to 32 colors, cel shading with 2 to 4 flat tones per material, lit from the top left, ' +
  'three-quarter view facing left (toward the hero, who stands on the left), full body visible, in a ready-to-fight pose, ' +
  'a bold silhouette that reads at a small size, an expressive face, no magenta, hot pink, purple or violet in the creature. ' +
  'No glow, halo, aura, bloom, light rays, sparkles, particles, smoke or magic effects floating around it, even for spirits and mages: ' +
  'show their magic through color, material and markings inside the dark outline, and nothing outside the outline';
const RULES =
  'One creature only (a swarm is one tight clump), whole, centered, filling about 85% of the image, not touching the image edge. ' +
  'No text, labels, numbers, health bars or UI. No ground, floor, scenery, cast shadows or frame. ' +
  'Solid flat magenta background (#FF00FF) everywhere, no gradient.';

/** A region's shared look: every enemy of the zone takes all of it, so the zone reads as one family. */
interface Region {
  /** Where it lives and what the place feels like. */
  setting: string;
  /** The region's colors, used across every enemy (each adds its own on top). */
  palette: string;
  /** One recurring visual motif every enemy of the region carries somewhere. */
  motif: string;
  /** How fierce and detailed enemies look at this tier: humble at T1, grand at the top. */
  menace: string;
}

/** By zone ID (data/zones.ts). Typed by ID, so a new zone fails `art:enemy:list` until it has one. */
const REGIONS: Record<number, Region> = {
  1: {
    setting: 'Greenhollow, sunny farmland, woods and a creeping bog at the edge of the starting village',
    palette: 'warm grass green, wheat gold, earthy brown, muddy olive',
    motif: 'scrappy and homemade: patched cloth, rope, rusty scavenged scraps, bits of straw and mud',
    menace: 'tier 1 of 9, the first enemies of the game: simple shapes, a little comical and scruffy, more pest than nightmare',
  },
  2: {
    setting: 'Thornwood, a dark overgrown forest of brambles and ancient trees where bandits and beasts hide',
    palette: 'deep forest green, dark bark brown, moss green, blood red accents',
    motif: 'thorns and brambles: thorny vines, briars or barbs woven into or growing from every enemy',
    menace: 'tier 2 of 9: wild and threatening, feral eyes, sharper shapes, still grounded and natural',
  },
  3: {
    setting: 'Frostmaw Pass, a snowbound mountain pass below an abandoned dwarven hold',
    palette: 'ice blue, snow white, slate grey, dwarven bronze',
    motif: 'frost and rime: icicles, frosted edges and snow caught on every enemy; dwarven bronze and runes where it fits',
    menace: 'tier 3 of 9: hardy and dangerous, heavier builds, cold harsh expressions',
  },
  4: {
    setting: 'Moonveil Vale, a fallen elven valley of silver woods and moonlit ruins under a moon gone dark',
    palette: 'moonlight silver, pale blue, midnight blue, dark teal accents',
    motif: 'crescent moons: crescent shapes, elegant flowing elven lines and silver filigree on every enemy, beautiful but corrupted and sorrowful',
    menace: 'tier 4 of 9: graceful and eerie, refined detail, the fallen splendor of an elven realm',
  },
};

/** By raid ID (data/raids.ts): a raid boss takes its own region. */
const RAID_REGIONS: Record<number, Region> = {
  1: {
    setting: 'Wyrm Hollow, a frozen cavern below the dwarven hold, heaped with the hoard of a dead dwarf king',
    palette: 'glacier blue, frost white, deep slate, hoard gold',
    motif: 'frost and treasure: ice crusted on scales and horns, gold coins and a dwarven crown caught in the ice',
    menace: 'a raid boss for a party of four: ancient, colossal and awe-inspiring, the most detailed sprite of its tier',
  },
};

/** What each enemy is, by enemy ID: the free part of the prompt. */
const LOOKS: Record<number, string> = {
  // Greenhollow
  101: 'a fat oversized field rat with mangy brown fur, beady red eyes, a long bald tail and a wheat stalk in its teeth',
  102: 'a bristly dark brown wild boar with curved yellowed tusks, head lowered to charge, mud caked on its legs',
  103: 'a skinny green goblin scout with long pointed ears, a ragged hooded cloak, crouched low with a rusty knife, a sling at its belt',
  104: 'a floating bog wisp: a teardrop flame of pale green and swamp yellow with a small hollow face, its tail trailing into a curl of bog water',
  105: 'a hulking goblin brute in mismatched scrap-iron armor and a dented cooking pot helmet, a big spiked wooden club over its shoulder',
  106: 'Grubnak the goblin chief: fat and broad, a crown made from a bent iron pot and bones, a fur cape over stolen armor, gold trinkets, ' +
    'gripping a huge rusted cleaver with a boar tusk and a small skull charm lashed below the blade',
  107: 'the drowned bellringer: a bloated drowned monk with pale blue-green skin, sodden tattered robes, seaweed in its hair, ' +
    'swinging a barnacled bronze bell on a rotten rope',
  // Thornwood
  201: 'a huge hairy forest spider, dark green-brown, its back bristling with bramble thorns, eight red eyes and hooked fangs',
  202: 'a lean human bandit cutthroat, hooded, a cloth mask over the lower face, a patched leather jerkin, a curved dagger in each hand',
  203: 'a hunched forest shaman in a cloak of woven briars and leaves, an antler and skull mask, a gnarled staff wrapped in thorny vines',
  204: 'a walking treant with bark dark and hard like iron, moss on its shoulders, amber eyes in a knotted face, heavy branch arms ending in thorny claws',
  205: 'a huge dire wolf with black-grey fur, a bristling mane, bared fangs, old scars, thorny burrs tangled in its fur',
  206: 'Morgra the thorn witch: a gaunt old crone with a crown of black brambles, a cloak of black roses and thorns, long green-tinged fingers, ' +
    'a crooked staff topped with a skull wrapped in thorny vines',
  // Frostmaw Pass
  301: 'an ice harpy: a shrieking bird-woman with frost-white feathered wings, pale blue skin, icy hair and sharp black talons',
  302: 'a small reptilian kobold tunneler with rust-orange scales, a dented dwarven mining helmet with a candle, a fur scarf and a pickaxe',
  303: 'a frost wraith: a hooded spectre of ragged ice-blue cloth with no legs, skeletal hands of ice, the face hidden in the dark hood except two pale eyes',
  304: 'a human cultist in fur-lined ice-blue robes stitched with frost runes, a mask of carved ice, holding up a frozen skull',
  305: 'a blocky dwarven stone golem of grey granite, bronze runic bands at its joints, snow piled on its shoulders, huge square fists',
  306: 'Hrimvald the frost giant jarl: a towering blue-grey giant with a braided ice-white beard full of icicles, an iron crown, a fur mantle, ' +
    'a huge frost-rimed war axe',
  // Moonveil Vale
  401: 'a moonmoth swarm: five or six large pale silver-blue moths in one tight overlapping clump, a dark crescent mark on every wing',
  402: 'an owlbear: a hulking bear with the head of an owl, silver-grey feathers over brown fur, a hooked beak, huge claws raised',
  403: 'a silverbark dryad: a sorrowful tree spirit woman with pale silver bark for skin, long hair of pale leaves, branch fingers',
  404: 'a hollow sentinel: an animated suit of slender elven plate armor, empty and dark where the face should be, crescent moon engravings, ' +
    'a tall elven glaive',
  405: 'a lunar spellweaver: an elven mage in midnight blue robes with silver moon embroidery, a silver half-mask, ' +
    'long silver threads strung between its raised hands like a loom',
  406: 'Selvara the moonless queen: a tall cold elven queen with pale skin and long silver hair, a black and silver gown, ' +
    'a crown shaped like an eclipsed black crescent moon, holding a black moon orb',
  407: 'the moonlit champion: the queen\'s last elven knight in pale silver-blue plate and a long cape, ' +
    'wielding a huge greatsword with a translucent pale blue crystal blade',
  // Raids
  9001: 'Skaldrith the rime wyrm: an ancient coiled ice dragon with pale blue-white scales, long frost-crusted horns, ' +
    'jagged icicle spines, half-folded wings, crouched over a heap of gold coins',
};

/** Normal enemies, the zone's boss, its secret enemy. */
const ROLES = {
  normal: 'a regular enemy of the region',
  boss: "the region's boss and ruler: an imposing named villain, a commanding pose, the finest gear and the most detail in the region, " +
    'clearly the strongest of its kind',
  secret: 'a rare secret enemy hidden in the region, stronger than anything else there: eerie and distinct from the others, ' +
    'yet still part of the region',
};

// ------------------------------------------------------------------ enemies

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Every portrait the game expects, keyed as enemyArtKey() does; `missing` lists enemies without a look. */
function arts(): { arts: Art[]; missing: string[] } {
  const out: Art[] = [];
  const missing: string[] = [];
  const add = (id: number, name: string, place: string, group: string, tier: number, region: Region | undefined, role: keyof typeof ROLES) => {
    const look = LOOKS[id];
    if (!region) return void missing.push(`e-${id} ${name}: no REGIONS entry for ${place}`);
    if (!look) return void missing.push(`e-${id} ${name}: no LOOKS entry`);
    out.push({
      key: `e-${id}`,
      name,
      group,
      tier,
      subject:
        `One game enemy: ${name}, from ${place}.\nRegion: ${region.setting}.\nRegion palette: ${region.palette} (shared by every enemy here; ` +
        `the creature adds its own colors).\nRegion motif: ${region.motif}.\nCreature: ${look}.\nRole: ${ROLES[role]}.\nMenace: ${region.menace}.`,
    });
  };
  for (const z of ZONES) {
    for (const e of z.enemies) {
      const area = z.areas.find(a => a.enemies.includes(e.id));
      add(e.id, e.name, `${z.name}, ${area?.name ?? 'unknown area'}`, slug(z.name), z.tier, REGIONS[z.id], e.boss ? 'boss' : e.secret ? 'secret' : 'normal');
    }
  }
  for (const r of RAIDS) add(r.boss.id, r.boss.name, `the raid ${r.name}`, `raid-${slug(r.name)}`, r.tier, RAID_REGIONS[r.id], 'boss');
  return { arts: out, missing };
}

await runArt(
  {
    title: 'Enemy art',
    src: 'art-src/enemies',
    csv: '../enemy-art.csv',
    out: 'src/assets/enemies',
    pixels: PIXELS,
    scale: 3,
    colors: 32,
    fill: 0.88,
    arts,
    common: `Style: ${STYLE}. ${RULES}`,
    refRules:
      'The attached images are finished enemies from the same game: match their art style exactly (pixel size and density, ' +
      'outline, palette range, shading, lighting, viewing angle, how much of the image the creature fills, background). ' +
      'Do not copy the creatures themselves: draw only the enemy described below, in its own region\'s palette and motif.',
    refEnv: 'ENEMY_STYLE_REF',
  },
  'scripts/enemy-art.ts'
);
