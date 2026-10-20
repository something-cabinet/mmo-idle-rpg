// Enemy art pipeline (src/ui/enemyArt.tsx): one portrait per enemy, keyed e-<enemyId> (enemy IDs
// are permanent). Each prompt joins its region's theme (REGIONS: setting, palette, motif, how
// fierce the tier looks) with the enemy's own look (LOOKS) and its role (normal, secret, boss),
// then the style every enemy shares, so a zone's enemies read as one family and every zone as
// one game. The pipeline itself (gen, cut, build) is scripts/art-lib.ts:
//
// Raid banners (wide scenes of a raid boss in its lair) reuse RAID_REGIONS and LOOKS: scripts/banner-art.ts.
// Zone map backdrops reuse REGIONS: scripts/zone-art.ts.
//
//   npm run art:enemy:list   writes art-src/enemy-art.csv (every portrait the game expects, committed)
//   npm run art:enemy:gen -- [group|key ...] [--cut] [--dry-run] [--model <id>] [--ref <key>[,<key>]]
//                            a group (greenhollow, thornwood, ..., raid-wyrm-hollow) or a key (e-101);
//                            --ref defaults to ENEMY_STYLE_REF in .env
//   npm run art:enemy:cut    raw images into masters, art-src/enemies/preview.html
//   npm run art:enemy:build -- [group|key ...]
//                            src/assets/enemies/<key>.webp (as drawn, 384 px file)
// art-src/enemies/ is not in git; art-src/enemy-art.csv is.
//
// Resolution: kept as the model draws it (its own pixel blocks, about 8 px in a 1024 px image),
// never put on a grid of ours: that resamples the blocks off their grid and blurs them. Only
// shrunk once to a 384 px file, at least twice the largest size the game shows (the raid card's
// 168 px; the fight scene 96, Zones 44), so the browser only ever shrinks it further.
// The prompt still asks for a 64 px grid: it sets how chunky the model draws.
import { ZONES } from '../spacetimedb/src/data/zones';
import { empoweredArtId, empoweredBoss, raidBosses, RAIDS } from '../spacetimedb/src/data/raids';
import { ABYSS_KINDS, BOSS_AFFIXES, DEEP_WARDEN, wardenArtId } from '../spacetimedb/src/data/abyss';
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
export interface Region {
  /** Where it lives and what the place feels like. */
  setting: string;
  /** The zone map's own setting, when the map should show the place differently (zone-art.ts); else `setting`. */
  map?: string;
  /** The region's colors, used across every enemy (each adds its own on top). */
  palette: string;
  /** One recurring visual motif every enemy of the region carries somewhere. */
  motif: string;
  /** How fierce and detailed enemies look at this tier: humble at T1, grand at the top. */
  menace: string;
}

/** By zone ID (data/zones.ts). Typed by ID, so a new zone fails `art:enemy:list` until it has one. */
export const REGIONS: Record<number, Region> = {
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
  5: {
    setting: 'Brightvein Hold, a silent dwarven mining hold deep in a mountain, its tunnels lit by glowing silver-blue ore veins, a cold broken forge and a rune-sealed breach',
    map: 'Brightvein Hold, a vast terraced dwarven mine pit cut into a dark mountain, seen from above: the rim at the top of the map, ' +
      'stepped stone terraces and ramps winding down in one switchback road, glowing silver-blue ore veins in the rock walls, growing deeper and darker toward the bottom of the map, where a glowing rift breaks open at the lowest point',
    palette: 'dark slate and granite grey, glowing silver-blue vein light, warm forge bronze, soot black',
    motif: 'glowing veins: cracks of silver-blue light running through stone, metal and skin, with heavy dwarven runes and bronze where it fits',
    menace: 'tier 5 of 9: grim and powerful, heavy rune-carved detail, a mighty dwarven realm gone wrong',
  },
};

/** By raid ID (data/raids.ts): a raid boss takes its own region. */
export const RAID_REGIONS: Record<number, Region> = {
  1: {
    setting: 'Wyrm Hollow, a frozen cavern below the dwarven hold, heaped with the hoard of a dead dwarf king',
    palette: 'glacier blue, frost white, deep slate, hoard gold',
    motif: 'frost and treasure: ice crusted on scales and horns, gold coins and a dwarven crown caught in the ice',
    menace: 'a raid boss for a party of four: ancient, colossal and awe-inspiring, the most detailed art of its tier',
  },
  // Umbriel turns between Full Moon (silver, armored) and New Moon (void, warded): the art is split the same way.
  2: {
    setting: 'The Drowned Moon, the flooded heart of the great moonwell beneath the Moonless Throne: pale elven stairs and broken ' +
      'silver arches sinking into black still water, a narrow shaft far above open to a starless sky',
    palette: 'moonlight silver, pale blue-white, abyssal black-blue, dark teal',
    motif: 'eclipse: everything split between bright silver moonlight and a starry black void, water dripping and running off ' +
      'every surface, the crescent and elven filigree of Moonveil Vale',
    menace: 'a raid boss for a party of four: ancient, colossal and awe-inspiring, the most detailed art of its tier',
  },
  // Two smith brothers, hammer and fire: the art is one forge with both sides.
  3: {
    setting: "The Brothers' Forge, the great dwarven forge deep beneath Brightvein Hold: a cavernous hall of black stone, " +
      'a colossal anvil and a cold furnace the size of a house, chains and bellows hanging from the dark, glowing silver-blue ore veins in the walls',
    palette: 'soot black, blackened iron, glowing ember orange, warm bronze, faint silver-blue vein light',
    motif: 'hammer and fire: forge embers, glowing seams in hammered iron, dwarven runes, the silver-blue glow of brightsteel',
    menace: 'a raid boss for a party of four: mighty and grim, the most detailed art of its tier',
  },
};

/** The Moonwell Deep (data/abyss.ts): its pool enemies and the Deep Warden. */
const DEEP_REGION: Region = {
  setting: 'The Moonwell Deep, the endless dark below the flooded moonwell where the moon fell through: drowned elven stairs ' +
    'and halls sinking into a black starless void with no bottom',
  palette: 'abyssal black-blue, tarnished moonlight silver, cold dark teal, pale drowned blue-white',
  motif: 'drowned and swallowed: wet surfaces with water running off them, tarnished silver and elven crescent filigree ' +
    'half eaten by black void speckled with tiny white stars',
  menace: 'endless-delve enemies that keep growing past tier 4: eerie, otherworldly and wrong, things from below the world',
};

/** What each enemy is, by enemy ID: the free part of the prompt. */
export const LOOKS: Record<number, string> = {
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
  // Brightvein Hold
  501: 'a glowvein crawler: a big armored tunnel beetle with slate-grey plates cracked by glowing silver-blue veins, ' +
    'many sharp legs, bright silver-blue mandibles',
  502: 'a tunnel drake: a lean wingless drake with dusty brown-grey scales, a long neck and tail, ember-orange eyes, ' +
    'heavy digging claws crusted with rock dust',
  503: 'a runeweave warder: a stern old dwarf rune-caster in heavy layered robes stitched with glowing silver-blue runes, ' +
    'a long braided white beard, a rune-carved staff',
  504: 'a brightsteel golem: a massive forge construct of silver-blue metal plates and bronze bolts, bright silver-blue veins at every seam, ' +
    'an open furnace grate in its chest showing ember orange inside',
  505: 'a hollowed delver: a gaunt dwarf miner in a dented helmet and torn leathers, bright silver-blue cracks across its grey skin, ' +
    'pale empty eyes, a pickaxe with a silver-blue head',
  506: 'Durgrim the Last Thane: an old dwarf king in heavy rune-carved silver-blue plate, a braided iron-grey beard, a stone crown, ' +
    'a huge war hammer, a jagged pale white shard fused into the middle of his chest, silver-blue cracks spreading from it',
  // The Brothers' Forge (raid 3): two dwarven smith brothers, each with an empowered form (DUO_VARIANTS).
  9003: 'Brokk the Hammer: a huge broad dwarf smith in a heavy leather apron over brightsteel plate, a braided iron-grey beard, ' +
    'bare scarred forearms, a massive two-handed forge hammer raised over one shoulder',
  9203: 'Sindri the Bellows: a lean quick dwarf in soot-stained robes and bronze bracers, a long braided red beard, ' +
    'a great leather bellows strapped to his back, a short fire-tongs blade glowing at the tip in each hand',
  // The Moonwell Deep
  9101: 'a moonless shade: a thin hunched elven silhouette of solid black-blue shadow with no legs, its body tapering into ' +
    'ragged tatters, long clawed fingers, two pale silver pinprick eyes and nothing else on its face',
  9102: 'a drowned acolyte: a drowned elven priestess in sodden silver-blue robes, pale grey-blue skin, wet black hair plastered ' +
    'over her face, holding up a cracked silver crescent censer with water pouring from it',
  9103: 'a tidebound husk: a hulking bloated drowned corpse crusted all over with barnacles, shells and black kelp, ' +
    'rusted silver chains wrapped around it, one huge swollen arm hanging to the ground',
  9104: 'a voidling swarm: six or seven small imps in one tight clump climbing over each other, black skin speckled with tiny white stars, ' +
    'blank white eyes, needle teeth and little hooked claws',
  9105: 'a fallen moonguard: an elven palace guard in dented water-stained silver plate streaked with dark teal algae, ' +
    'a cracked crescent-crested helm with only darkness inside, a long spear and a tall crescent tower shield',
  9106: 'a starless lamprey: a long eel-like lamprey reared up in an S-curve, slick black-blue skin with no stars at all, ' +
    'a round open sucker mouth lined with rings of hooked silver teeth, small pale gill slits along its neck',
  9107: 'a hollow choir: three elven choir singers fused into one figure of pale cracked stone, one robe shared below the waist, ' +
    'three heads with empty black eyes and mouths wide open mid-song, hands clasped',
  9108: 'an eclipse moth: one huge moth with its wings split, the upper pair bright moonlight silver, the lower pair black ' +
    'speckled with white stars, a black disc ringed by a thin silver line on each upper wing, furry silver body and feathered antennae',
  9150: 'the deep warden: a towering faceless guardian of black moonstone and tarnished silver plates, hunched under a heavy ' +
    'hood of wet dark stone, a single pale silver crescent for an eye in its blank face, holding a huge ancient silver key ' +
    'like a mace, its bow shaped like an elven crescent',
  // Raids
  9001: 'Skaldrith the rime wyrm: an ancient coiled ice dragon with pale blue-white scales, long frost-crusted horns, ' +
    'jagged icicle spines, half-folded wings, crouched over a heap of gold coins',
  // An abyssal angler that took the moon for its lure: the night it fell into the moonwell, the moon went out.
  // Its uniques are pieces of it (item-art.ts UNIQUE_LOOKS 20-22): the gill plate and eclipse eye (Eclipse
  // Aegis), the lure (Lantern of the Drowned Moon), a fang (Umbriel's Edge).
  9002: 'Umbriel the eclipse: a colossal abyssal anglerfish leviathan rearing up out of the deep, jaws wide open, ' +
    'its body split down the middle: the front and left side armored in bright silver-white moonstone scales (full moon), ' +
    'the back and right side smooth black void skin speckled with tiny white stars (new moon); ' +
    'a huge underbite of long curved needle-like silver fangs, one great round eye like an eclipse: a black disc ringed by a thin silver corona, ' +
    'a broad armored silver gill plate with curved ridges behind its jaw, ' +
    'long webbed fins like torn crescent sails, a thick tail coiling below it; ' +
    'from its brow a long fleshy ridged dark teal stalk curves forward and dangles its lure: a bright white cracked shard of the stolen moon, ' +
    'water streaming from its jaws and fins',
};

/**
 * The Deep Warden's variant per Boss affix (abyss.md, "The boss"), by affix ID: added to its
 * own look, so every variant is the same Warden. Generate e-9150 first and --ref it for these.
 */
const WARDEN_VARIANTS: Record<number, string> = {
  1: 'Hungering: gaunt and starved, its stone cracked thin over jutting ribs, its blank face split open down the middle into ' +
    'a huge gaping maw lined with silver teeth',
  2: 'Mirrored: its whole body polished to a glassy mirror-like silver sheen, flat bright facets like cut glass, ' +
    'its key and crescent eye bright silver too',
  4: 'Moonfall: chunks of pale cracked moon rock embedded across its shoulders and chest, its key raised high overhead in both hands ' +
    'for a crushing blow',
  5: 'Starless: every bit of silver gone dull black, its body pure lightless black-blue with no stars, the crescent eye dark grey ' +
    'and dead, black roots reaching out of its open hands',
  6: 'Tidal: one half armored in silver plate, the other half a body of dark teal water, kelp and barnacles, ' +
    'water pouring off it in sheets',
  7: 'Veiled: wrapped head to foot in long tattered dark teal shroud veils, its shape blurred under them, ' +
    'only the crescent eye and the key showing',
  8: 'Eclipse: split down the middle, the left half bright silver moonlight, the right half swallowed by black void speckled with stars, ' +
    'its eye a black disc ringed by a thin silver corona',
};

/**
 * A duo raid brother's empowered form (raids.md, "Raid 3"), by his enemy ID: added to his own
 * look, so it reads as the same dwarf, changed. Generate his base sprite first and --ref it.
 */
const DUO_VARIANTS: Record<number, string> = {
  9003: 'Molten Hammer: he has absorbed his brother\'s fire: his hammer head glows molten orange and drips like lava, ' +
    'cracks of fire run up his arms and through his beard, embers in his eyes',
  9203: 'Anvil Hide: he has absorbed his brother\'s iron: his skin turned to dark cold iron like an anvil, brightsteel plates ' +
    'fused onto his shoulders, arms and chest, heavier and harder, his bellows now banded with iron',
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
  const add = (id: number, name: string, place: string, group: string, tier: number, region: Region | undefined, role: keyof typeof ROLES,
    look = LOOKS[id]) => {
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
  for (const r of RAIDS) {
    // A duo: both brothers, and each one's empowered form.
    for (const e of raidBosses(r)) add(e.id, e.name, `the raid ${r.name}`, `raid-${slug(r.name)}`, r.tier, RAID_REGIONS[r.id], 'boss');
    for (const b of r.duo?.bosses ?? []) {
      const v = DUO_VARIANTS[b.enemy.id];
      add(empoweredArtId(b.enemy.id), empoweredBoss(b).name, `the raid ${r.name}`, `raid-${slug(r.name)}`, r.tier, RAID_REGIONS[r.id], 'boss',
        v && LOOKS[b.enemy.id] && `${LOOKS[b.enemy.id]}. This one is ${v}`);
    }
  }
  for (const k of ABYSS_KINDS) add(k.id, k.name, 'the Moonwell Deep', 'moonwell-deep', 4, DEEP_REGION, 'normal');
  add(DEEP_WARDEN.id, DEEP_WARDEN.name, 'the Moonwell Deep', 'moonwell-deep-warden', 4, DEEP_REGION, 'boss');
  for (const a of BOSS_AFFIXES) {
    const v = WARDEN_VARIANTS[a.id];
    add(wardenArtId(a.id), `${a.name} ${DEEP_WARDEN.name}`, 'the Moonwell Deep', 'moonwell-deep-warden', 4, DEEP_REGION, 'boss',
      v && LOOKS[DEEP_WARDEN.id] && `${LOOKS[DEEP_WARDEN.id]}. This one is ${v}`);
  }
  return { arts: out, missing };
}

// Run only as the script: banner-art.ts imports the regions and looks.
if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/enemy-art.ts')) await runArt(
  {
    title: 'Enemy art',
    src: 'art-src/enemies',
    csv: '../enemy-art.csv',
    out: 'src/assets/enemies',
    shape: { kind: 'cutout', fill: 0.88, size: 384 },
    colors: 32,
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
