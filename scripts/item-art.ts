// Item art pipeline (src/ui/itemArt.tsx): one image per item name, each generated alone from
// a prompt joined from a tier's look and a type's (TIERS + TYPES below), so items come out alike.
//
//   npm run art:list   writes art-src/item-art.csv (every image the game expects, committed),
//                      checks every item has its looks and prints progress per group
//   npm run art:gen -- [group|key ...] [--cut] [--dry-run] [--model <id>] [--ref <key>[,<key>]]
//                      generates items through OpenRouter (OPENROUTER_API_KEY in .env;
//                      default model Nano Banana 2 Lite, google/gemini-3.1-flash-lite-image)
//                      into art-src/raw/<key>.png: no names = every item with neither a built
//                      image nor a raw one yet; a group (sword, plate-chest, uniques, ...) or
//                      an item key (b-2-t5, u-3) = those again. Replaced images move to art-src/old/.
//                      --ref (or ART_STYLE_REF in .env): send those finished items along, so
//                      the new ones match their style.
//   npm run art:cut    cuts each new raw image off its magenta background into the master
//                      art-src/<key>.png, plus art-src/preview.html to compare them by group
//   npm run art:build -- [group|key ...]
//                      pixelizes each master into src/assets/items/<key>.webp (48 px grid, 144 px file);
//                      names (like art:gen) build only those
// art-src/ is not in git, apart from item-art.csv.
import { existsSync, mkdirSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join, parse } from 'node:path';
import sharp from 'sharp';
import { BASE_LIST, GEMS, QUALITY, TRACKS } from '../spacetimedb/src/data/bases';
import { MAX_TIER } from '../spacetimedb/src/data/stats';
import { RAIDS_BY_ID } from '../spacetimedb/src/data/raids';
import { UNIQUES } from '../spacetimedb/src/data/uniques';

const SRC = 'art-src';
const RAW = `${SRC}/raw`;
const OUT = 'src/assets/items';
/** Pixel art grid: a master is pixelized onto PIXELS x PIXELS, then scaled up SCALE times with hard edges. */
const PIXELS = 48;
const SCALE = 3;
/** Most colors in one icon's palette. */
const COLORS = 24;

// ------------------------------------------------------------------ prompts
// An item's prompt joins two short looks, then the style shared by every item:
//   TIERS  what its tier line looks like, by the word its name starts with (Rusted, Bogiron, Rime, ...)
//   TYPES  what it is, by the word(s) its name ends with (Sword, Dagger, Breastplate, ...)
// "Bogiron Sword" = TIERS.Bogiron + TYPES.Sword. A tier gives the palette and the material.
// Jewelry adds its quality: "Cut Ruby Ring" = TIERS.Ruby + QUALITY_LOOKS.Cut + TYPES.Ring.
// Uniques take UNIQUE_LOOKS in place of their tier.
// No purple, violet or pink in any look: the cutter keys the magenta background by hue,
// and those take an item's edge with it. Indigo, teal and crimson are safe.

const STYLE =
  'pixel art RPG inventory icon sprite, 16-bit / 32-bit era (like SNES and PlayStation era item sprites), drawn on a ' +
  `${PIXELS} by ${PIXELS} pixel grid with the item about ${Math.round(PIXELS * 0.84)} pixels across, every pixel a large clean square block, ` +
  'no anti-aliasing, no blur, no gradients, a 1-pixel dark outline around the whole item, a limited palette of about ' +
  '16 to 24 saturated colors, cel shading with 2 to 4 flat tones per material and a few bright highlight pixels that ' +
  'show the material (metal sheen, wood grain, leather texture, cut gems), lit from the top left, ' +
  'three-quarter view, bold readable silhouette, no magenta or hot pink in the item. ' +
  'Long items (swords, maces, staves, wands, bows, crossbows) diagonal at 45 degrees, handle at the bottom left ' +
  'and tip at the top right; daggers the other way (see their type); everything else upright and facing the viewer. ' +
  'No glow, halo, aura, bloom, light rays, sparkles or particles anywhere, even on magical or holy items: ' +
  'show their power through material, color and gems inside the dark outline, and nothing outside the outline';
const RULES =
  'One item only, whole, centered, filling about 80% of the image, not touching the image edge. ' +
  'No hands, no character, no text, labels or numbers. ' +
  'Solid flat magenta background (#FF00FF) everywhere, no gradient, no floor, no cast shadows, no frame.';

/** Every word a tier's item names start with: the tier lines (bases.ts), the gems, raid variants. */
type TierWord = (typeof TRACKS)[keyof typeof TRACKS][number] | (typeof GEMS)[keyof typeof GEMS][number] | 'Rime';

/** A tier's main colors (most of the item first, then trim and accents) and its material. */
interface Look { colors: string; look: string }

/** Typed, so a new tier word in bases.ts fails to compile until it has a look. */
const TIERS: Record<TierWord, Look> = {
  // metal: swords, daggers, maces, scepters, katanas, greatswords, shields, plate
  Rusted: { colors: 'rust orange, dull dark brown, grey iron', look: 'pitted iron covered in flaking rust, chipped edges, crude and battered' },
  Bogiron: { colors: 'blackish brown, dark slate grey, dull bronze', look: 'rough bog iron, unevenly hammered, dull, plain' },
  Dwarven: { colors: 'steel grey, warm bronze, dark brown leather', look: 'thick polished steel, blocky and sturdy, geometric knotwork' },
  Elven: { colors: 'pale silver, leaf green, white', look: 'bright steel in slender flowing curves, leaf engraving' },
  Mithril: { colors: 'silver-white, cool light blue, sapphire blue', look: 'gleaming mithril with a blue sheen, sleek, small sapphires' },
  Adamant: { colors: 'deep green, black-green, dark gold', look: 'adamantine, massive and angular, faceted planes' },
  Runic: { colors: 'dark steel blue, black, bright cyan', look: 'blued steel carved with runes inlaid in cyan enamel' },
  Dragonbone: { colors: 'ivory, dark blood red, black', look: 'dragon bone and dragon scales, bone spikes, red gems' },
  Celestial: { colors: 'white, gold, deep royal blue', look: 'white gold and platinum, small sun and star motifs, blue enamel, a few diamonds' },
  // wood: wands, bows, staves, crossbows
  Driftwood: { colors: 'bleached grey, pale tan, faded brown twine', look: 'driftwood, warped and cracked, tied with frayed twine' },
  Gnarled: { colors: 'dark brown, black-brown, dull iron grey', look: 'knotted twisted wood, simple iron bands' },
  Heartoak: { colors: 'warm medium brown, honey, brass yellow', look: 'solid oak with a clear grain, brass fittings' },
  Silverbark: { colors: 'pale cream, silver grey, light green', look: 'pale wood with silvery bark, silver fittings, leaf carvings' },
  Ironwood: { colors: 'dark grey-brown, steel grey, black', look: 'very dense polished wood, steel bands' },
  Elderwood: { colors: 'red-brown, gold, emerald green', look: 'ancient wood carved with druidic spirals, gold fittings, a green gem' },
  Ghostwood: { colors: 'pale blue-white, silver, ice blue', look: 'ghostly pale wood, silver fittings, a pale blue crystal' },
  Dragonwood: { colors: 'deep crimson, black, ivory horn', look: 'scale-patterned wood, dragon claw and horn fittings, a red gem' },
  Worldroot: { colors: 'golden green, gold, bright emerald', look: 'living braided roots sprouting tiny leaves, gold fittings, a large emerald' },
  // cloth
  Sackcloth: { colors: 'dull beige, dirty tan, rope brown', look: 'coarse burlap, patched and frayed, rope ties' },
  Homespun: { colors: 'brown, oatmeal, dark leather brown', look: 'plain wool, simple stitching' },
  Spidersilk: { colors: 'pale grey, white, silver', look: 'fine silk with a subtle web pattern' },
  Mageweave: { colors: 'deep blue, gold, white', look: 'cloth with embroidered trim and arcane symbols' },
  Runeweave: { colors: 'dark indigo, silver, black', look: 'cloth woven with rows of runes' },
  Moonsilk: { colors: 'pale silver-blue, white, pearl', look: 'shimmering silk with crescent moon embroidery' },
  Spellsilk: { colors: 'rich crimson, gold, black', look: 'silk covered in embroidered sigils' },
  Voidweave: { colors: 'near-black, deep indigo, dark teal, white', look: 'cloth with deep folds and tiny embroidered stars' },
  Starweave: { colors: 'white, gold, deep blue', look: 'cloth embroidered with constellations, star clasps' },
  // leather
  Ratskin: { colors: 'grey-brown, dusty tan, dark brown', look: 'a patchwork of thin rat pelts, crude stitching' },
  Boarhide: { colors: 'dark brown, bristly black, rawhide tan', look: 'thick bristly hide laced with rawhide' },
  Wolfhide: { colors: 'grey, light grey fur, iron grey', look: 'wolf leather with fur trim, iron buckles' },
  Owlbear: { colors: 'brown, tawny orange, cream', look: 'leather with tufts of feathers and fur' },
  Drakehide: { colors: 'olive green, brown, bronze', look: 'drake scales over tough leather, bronze buckles' },
  Shadowhide: { colors: 'near-black, charcoal grey, dark steel', look: 'supple sleek leather, blackened buckles' },
  Wyrmscale: { colors: 'icy blue, white, silver', look: 'overlapping wyrm scales, silver buckles' },
  Phoenixhide: { colors: 'red-orange, gold, deep red', look: 'leather with feather-shaped scales' },
  Starhide: { colors: 'midnight blue, gold, white', look: 'leather speckled like a night sky, star studs' },
  // tomes (Celestial is shared with metal)
  Tattered: { colors: 'brown, yellowed cream, dark brown', look: 'torn leather cover, loose pages' },
  'Dog-eared': { colors: 'faded grey-blue, cream, brown', look: 'worn plain cloth binding, bent corners' },
  "Scholar's": { colors: 'dark green, brass, cream', look: 'neat leather binding, brass corners' },
  Gilded: { colors: 'deep red, gold, cream', look: 'leather with gold leaf filigree' },
  "Arcanist's": { colors: 'deep blue, silver, cream', look: 'leather with an arcane circle and a clasp' },
  "Archmage's": { colors: 'black, gold, sapphire blue', look: 'heavy leather, gold corners, a sapphire eye' },
  Runebound: { colors: 'dark brown, iron grey, bright cyan', look: 'leather bound in iron chains, carved runes' },
  Astral: { colors: 'midnight blue, silver, white', look: 'a cover set with a starfield of tiny gems' },
  // gems: a new one every 3 tiers, set in bronze, then silver, then gold. Each line keeps one stone
  // color at every tier (Ruby line red, Emerald green, Sapphire blue, Amber orange), said outright
  // in the look, so a pale gem name (Moonstone, Windstone) doesn't come out white.
  Ruby: { colors: 'deep red, bronze', look: 'a ruby set in plain bronze, the stone deep red' },
  Emerald: { colors: 'bright green, bronze', look: 'an emerald set in plain bronze, the stone bright green' },
  Sapphire: { colors: 'deep blue, bronze', look: 'a sapphire set in plain bronze, the stone deep blue' },
  Amber: { colors: 'golden orange, bronze', look: 'an amber set in plain bronze, the stone golden orange' },
  Bloodstone: { colors: 'blood red, dark crimson, silver', look: 'a bloodstone set in silver filigree, the stone blood red with dark crimson veins, not green' },
  Windstone: { colors: 'jade green, light green, silver', look: 'a stone with pale green wind swirls, set in silver filigree, the stone jade green, not white' },
  Moonstone: { colors: 'rich blue, light blue, silver', look: 'a moonstone set in silver filigree, the stone rich blue with a pale blue sheen, not white' },
  Sunstone: { colors: 'golden orange, copper, silver', look: 'a flecked sunstone set in silver filigree, the stone golden orange' },
  Magmaheart: { colors: 'fiery red, black, gold', look: 'a stone with dark cracks like cooling lava, set in ornate gold, the stone fiery red' },
  'Tempest Eye': { colors: 'vivid emerald green, white, gold', look: 'a gem with a white lightning streak inside, set in ornate gold, the stone vivid emerald green' },
  'Astral Shard': { colors: 'deep blue, white, gold', look: 'a crystal with tiny stars inside, set in ornate gold, the stone deep blue' },
  Dawnheart: { colors: 'gold-orange, amber, gold', look: 'a gem fading like sunrise, set in ornate gold, the stone gold-orange' },
  // raid variants
  Rime: { colors: 'pale ice blue, white, silver', look: 'frost-forged steel and clear ice crystal, frosted edges, icicle points' },
};

/** How much detail and ornament an item carries, by tier (1 to MAX_TIER): plain and crude at
 *  the bottom, finest at the top, but always a practical item. Joined to every look, uniques by their own tier. */
const DETAIL: string[] = [
  'tier 1 of 9, the plainest: a crude simple shape, very few details, 2 tones per material, no decoration',
  'tier 2 of 9: a plain simple shape, a few details, no decoration',
  'tier 3 of 9: a solid well-made shape, clean details, one small decorative touch',
  'tier 4 of 9: a refined shape, some engraving or trim, a small gem or fitting',
  'tier 5 of 9: a distinctive shape with flourishes, engraved patterns, contrasting trim, one or two gems',
  'tier 6 of 9: an elaborate piece, layered parts, rich engraving and inlay, several small gems, a clean practical silhouette',
  // From here up, quality shows in materials and finish, not size: wings, spikes and crowns made icons look like props.
  'tier 7 of 9: a masterwork: fine engraving or filigree on the main surfaces, one or two set gems, crisp polished ' +
    'highlights; still the practical shape of its type, no wings or added spikes',
  'tier 8 of 9: a legendary piece: superb rare materials and a flawless finish, refined inlay, a few well-placed gems; ' +
    'a usable, practical shape, no wings, spikes or oversized flared parts',
  'tier 9 of 9, the finest in the game: flawless rare materials, rich but restrained ornament, one large brilliant gem as the ' +
    'focal point, the full palette and bright highlights; it looks priceless yet usable: ' +
    'the practical shape of its type, no wings, no spikes, no crowns or oversized flared parts',
];

/** Gem quality, joined to the gem's look. */
const QUALITY_LOOKS: Record<(typeof QUALITY)[number], string> = {
  Rough: 'the stone rough, uncut and cloudy, but still strongly colored',
  Cut: 'the stone neatly faceted',
  Flawless: 'the stone large, flawless and brilliant-cut',
};

/** What each type is, by the last word(s) of its items' names. */
const TYPES: Record<string, string> = {
  // Every icon fills the same square, so sword and greatsword differ by shape, not size.
  Sword: 'a one-handed arming sword: a short, slim straight blade tapering to a point, a small simple crossguard, ' +
    'a short one-hand grip and a round pommel; compact, the blade only about three times the hilt length',
  // Pointing the other way from swords, so the two read apart at a glance.
  Dagger: 'a short dagger with a broad pointed blade, held point down: diagonal at 45 degrees with the handle at the ' +
    'top left and the point at the bottom right, the opposite way from a sword',
  Mace: 'a one-handed flanged mace',
  // Not a wand: thick, heavy and crowned, standing straight up where wands lie diagonal.
  Scepter: 'a royal holy scepter standing straight up, vertical: a short thick metal shaft with ringed bands and a ' +
    'flared foot, topped by a large wide head (an orb, a crown or a sunburst holy symbol) about half the length of ' +
    'the shaft and three times as wide; heavy and top-heavy like a symbol of rank, nothing like a slender wand',
  Wand: 'a slender magic wand with a small crystal at the tip',
  Katana: 'a katana: a long, slightly curved single-edged blade, a round guard, a long grip',
  Greatsword: 'a huge two-handed greatsword (zweihander): a very long, very wide heavy blade with a thick flat ' +
    'tip, a wide flared crossguard with side spikes, a long two-hand grip and a heavy pommel; massive and slab-like, ' +
    'the blade three times as wide as a normal sword',
  Bow: 'a strung recurve bow',
  'Fire Staff': 'a long mage staff whose head holds a red-orange fire crystal',
  'Healing Staff': 'a long cleric staff whose head is an open ring holding a white crystal',
  Crossbow: 'a crossbow with a loaded bolt',
  Shield: 'a heater shield',
  Greatshield: 'a tall rectangular tower shield',
  Tome: 'a thick closed spellbook, cover facing the viewer',
  Hood: 'a cloth hood with a short shoulder cape, empty',
  Robe: 'a long mage robe with wide sleeves, laid flat, empty',
  Gloves: 'a pair of cloth gloves, side by side',
  Shoes: 'a pair of soft cloth shoes, side by side',
  Cap: 'a close-fitting leather cap, empty',
  Vest: 'a sleeveless leather jerkin, laid flat, empty',
  Bracers: 'a pair of leather bracers, side by side',
  Boots: 'a pair of leather boots, side by side',
  Helm: 'a full plate helm with a visor, empty',
  Breastplate: 'a plate breastplate with pauldrons, empty',
  Gauntlets: 'a pair of plate gauntlets, side by side',
  Greaves: 'a pair of plate greaves with sabatons, side by side',
  // Every ring and amulet posed the same way, so a jewelry row lines up.
  Ring: 'a finger ring standing upright, seen from the front and slightly above: the band an upright oval below, ' +
    'one large stone on top of the band facing the viewer, not lying flat, not tilted sideways; ' +
    'any smaller accent gems the same color as it',
  Amulet: 'a pendant amulet hanging straight down, facing the viewer: a short chain in a V or U loop at the top, ' +
    'the pendant centered below it with one large stone in its middle, not tilted or lying flat; ' +
    'any smaller accent gems the same color as it',
};

/** A unique's art, written on its own: what it is, its colors and its look. Nothing comes from its base or tier. */
interface UniqueLook extends Look {
  /** What the item is and how it sits in the icon, like a TYPES entry. */
  type: string;
}

/** How much detail every unique carries, about tiers 7 to 8 (DETAIL): a named masterwork, still a practical item. */
const UNIQUE_DETAIL = 'a named one-of-a-kind masterwork, as fine as tier 7 to 8 of 9 gear: a memorable shape with a clear ' +
  'signature motif, superb materials and finish, fine engraving or filigree on the main surfaces, well-set gems or ' +
  'accents, crisp polished highlights and the full palette; beautiful and clearly special, yet a practical item: ' +
  'no wings, no oversized flared parts'

/** Each unique's own art (by unique ID), independent of its base and tier. */
const UNIQUE_LOOKS: Record<number, UniqueLook> = {
  1: {
    type: "a huge two-handed orc cleaver: a very broad, heavy, square-ended chopping blade on a long grip",
    colors: 'rust orange, bone white, dark brown',
    look: 'dark rusted iron with a notched edge and crude hammered runes, a thick bone handle wrapped in hide strips, ' +
      'a big boar tusk and a small skull charm lashed below the blade',
  },
  2: {
    type: 'a heavy signet ring standing upright, seen from the front: a thick band below, a wide flat signet face on top facing the viewer',
    colors: 'gold, emerald green',
    look: 'polished heavy gold, the face engraved with a crowned coin, small emeralds set around the face, a fine engraved pattern on the band',
  },
  3: {
    type: 'a pendant hanging straight down, facing the viewer: a short chain in a V at the top, the pendant centered below',
    colors: 'silver, sapphire blue',
    look: 'a silver pendant shaped like an open book with tiny engraved pages, a sapphire set on the spine, a little silver quill charm beside it',
  },
  11: {
    type: 'a thick closed hymnal book, cover facing the viewer',
    colors: 'murky blue-green, tarnished silver, sea green',
    look: 'a swollen waterlogged cover crusted with barnacles and seaweed, tarnished silver corners, ' +
      'a silver holy sigil still shining on the front, a heavy clasp',
  },
  4: {
    type: 'a one-handed straight sword with a slim blade, a crossguard and a pommel',
    colors: 'blackish brown, teal, black',
    look: 'cursed dark iron etched with crooked bright teal hex sigils along the blade, a twisted crossguard like gnarled roots, a teal gem pommel',
  },
  5: {
    type: 'a heavy plate breastplate with pauldrons, empty, facing the viewer',
    colors: 'dark iron grey, black, rust brown',
    look: 'massive dark iron shaped like gnarled bark, thorn-like spikes along the pauldrons, ' +
      'a hollow-tree emblem in the center with a dark opening',
  },
  6: {
    type: 'a long hooded robe, laid flat, empty',
    colors: 'pale grey-green, silver, white',
    look: 'ghostly layered gauzy veils fading at the hem, silver embroidered closed eyes down the front, a silver clasp at the collar',
  },
  7: {
    type: 'a short dagger, held point down, diagonal with the handle at the top left and the point at the bottom right',
    colors: 'near-black, deep indigo, teal',
    look: 'the blade a single curved black fang with a teal edge, a dark indigo leather-wrapped grip, a teal gem in the pommel',
  },
  8: {
    type: 'a strung recurve longbow',
    colors: 'frosted white, ice blue, pale wood',
    look: 'pale frosted wood, both limb tips ending in sharp ice crystals, a frost-white string, white feathers and a blue crystal at the grip',
  },
  9: {
    type: 'an amulet hanging straight down, facing the viewer: a short chain in a V at the top, the pendant centered below',
    colors: 'clear ice blue, white, silver',
    look: 'the pendant a heart-shaped chunk of clear glacier ice with a darker frozen core, held in a delicate frost-like silver frame',
  },
  10: {
    type: 'a long two-handed mage staff with a heavy head',
    colors: 'snow white, stone grey, oak brown',
    look: 'a heavy oak shaft bound in iron bands, topped with a jagged boulder of packed snow and grey stone, small icicles hanging under it',
  },
  12: {
    type: 'a heater shield, facing the viewer',
    colors: 'icy blue, white, silver',
    look: 'overlapping icy-blue wyrm scales, a snarling silver dragon-head boss in the center, a silver rim',
  },
  13: {
    type: 'a holy scepter standing straight up: a short thick shaft topped by a censer',
    colors: 'gold, ice blue, warm brown',
    look: 'an ornate gold censer hanging on short chains from the top, gold coins dangling from it, a blue crystal inside, no smoke',
  },
  14: {
    type: 'a short dagger, held point down, diagonal with the handle at the top left and the point at the bottom right',
    colors: 'icy white, pale blue, silver',
    look: 'the blade one long curved pale dragon tooth, a grip of dark wyrm leather, a silver guard shaped like small claws',
  },
};


// ------------------------------------------------------------------ items

interface Art { key: string; name: string; group: string; tier: number; subject: string }

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const TYPE_WORDS = Object.keys(TYPES).sort((a, b) => b.length - a.length);
const tiers = TIERS as Record<string, Look>;

/** An item name split into its tier ("Rough Ruby", "Rusted") and its type ("Ring", "Sword"). */
function splitName(name: string): { tier: string; type: string } | undefined {
  const type = TYPE_WORDS.find(t => name.endsWith(` ${t}`));
  return type ? { tier: name.slice(0, -type.length - 1), type } : undefined;
}

/** A tier's look: its TIERS entry, a gem's with its quality joined on. */
function tierLook(tier: string): Look | undefined {
  const [first, ...rest] = tier.split(' ');
  const quality = QUALITY_LOOKS[first as keyof typeof QUALITY_LOOKS];
  if (quality && rest.length) {
    const gem = tiers[rest.join(' ')];
    return gem && { colors: gem.colors, look: `${gem.look}, ${quality}` };
  }
  return tiers[tier];
}

/** Every image the game expects, keyed as itemArtKey() does; `missing` lists items without a look. */
function arts(): { arts: Art[]; missing: string[] } {
  const out: Art[] = [];
  const missing: string[] = [];
  /** `baseName` gives the type (and, for all but uniques, the tier). */
  const prompt = (name: string, type: string, look: Look, detail: string) =>
    `One game item icon: ${name}.\nType: ${type}.\nPalette: ${look.colors} (main colors, most of the item first).\nMaterial: ${look.look}.\nDetail: ${detail}.`;
  /** `baseName` gives the type and the tier. */
  const add = (key: string, name: string, group: string, tier: number, baseName: string) => {
    const parts = splitName(baseName);
    const look = parts && tierLook(parts.tier);
    if (!parts || !look) return void missing.push(`${key} ${name}: no ${!parts ? 'TYPES' : 'TIERS'} entry`);
    out.push({ key, name, group, tier, subject: prompt(name, TYPES[parts.type], look, DETAIL[tier - 1]) });
  };
  /** A unique: its own type, look and detail, nothing from its base or tier. */
  const addUnique = (u: (typeof UNIQUES)[number]) => {
    const look = UNIQUE_LOOKS[u.id];
    if (!look) return void missing.push(`u-${u.id} ${u.name}: no UNIQUE_LOOKS entry`);
    out.push({ key: `u-${u.id}`, name: u.name, group: 'uniques', tier: u.tier, subject: prompt(u.name, look.type, look, UNIQUE_DETAIL) });
  };
  for (const b of BASE_LIST) {
    if (b.typeId === b.id) for (let t = 1; t <= MAX_TIER; t++) add(`b-${b.id}-t${t}`, b.name(t), slug(b.family), t, b.name(t));
    else {
      const raid = b.raidId !== undefined ? RAIDS_BY_ID.get(b.raidId) : undefined;
      const t = raid?.tier ?? 1;
      add(`b-${b.id}`, b.name(t), `variants-${slug(raid?.name ?? 'none')}`, t, b.name(t));
    }
  }
  for (const u of UNIQUES) addUnique(u);
  return { arts: out, missing };
}

const COMMON = `Style: ${STYLE}. ${RULES}`;
const prompt = (a: Art) => `${a.subject}\n${COMMON}`;

const master = (key: string) => join(SRC, `${key}.png`);
const raw = (key: string) => join(RAW, `${key}.png`);
const built = (key: string) => join(OUT, `${key}.webp`);
const mtime = (f: string) => (existsSync(f) ? statSync(f).mtimeMs : 0);
const csv = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const groups = (all: Art[]) => [...new Set(all.map(a => a.group))].map(g => ({ name: g, arts: all.filter(a => a.group === g) }));

function list() {
  const { arts: all, missing } = arts();
  let bad = missing.length;
  for (const m of missing) console.log(`MISSING  ${m}`);
  // One image per name: two images sharing a name, or a variant whose name changes by tier, break the rule.
  const byName = new Map<string, string[]>();
  for (const a of all) byName.set(a.name, [...(byName.get(a.name) ?? []), a.key]);
  for (const [name, keys] of byName) if (keys.length > 1) (bad++, console.log(`SAME NAME  ${name}: ${keys.join(', ')}`));
  for (const b of BASE_LIST) {
    if (b.typeId !== b.id && new Set(Array.from({ length: MAX_TIER }, (_, i) => b.name(i + 1))).size > 1)
      (bad++, console.log(`VARIANT NAME CHANGES BY TIER  b-${b.id}`));
  }
  // Committed: it holds only what comes from the game data, never what this machine has
  // generated (that is printed below instead).
  mkdirSync(RAW, { recursive: true });
  writeFileSync(join(SRC, 'item-art.csv'), ['key,name,group,tier', ...all.map(a => [a.key, a.name, a.group, a.tier].map(csv).join(','))].join('\n') + '\n');

  // Progress on this machine: per started group, then the total.
  let done = 0;
  for (const g of groups(all)) {
    const n = g.arts.filter(a => existsSync(built(a.key))).length;
    const m = g.arts.filter(a => existsSync(master(a.key)) && mtime(master(a.key)) > mtime(built(a.key))).length;
    const r = g.arts.filter(a => existsSync(raw(a.key)) && mtime(raw(a.key)) > mtime(master(a.key))).length;
    done += n;
    if (n || m || r) console.log(`${g.name.padEnd(22)} ${n}/${g.arts.length} built${m ? `, ${m} cut not built` : ''}${r ? `, ${r} raw not cut` : ''}`);
  }
  console.log(`${done}/${all.length} images built in ${groups(all).length} groups; see ${SRC}/item-art.csv`);
  if (bad) process.exit(1);
}

// ------------------------------------------------------------------ cut

/**
 * Magenta-ness of a pixel, whatever its brightness: how far red and blue both rise over green,
 * relative to the brightest channel. Pure magenta is 1, grey, silver and white are 0. Keyed on
 * this, the background goes whole even where the model shaded or speckled it darker, and a light
 * blade is never mistaken for background.
 */
const magenta = (r: number, g: number, b: number) => {
  const max = Math.max(r, g, b);
  return max < KEY_DARK ? 0 : Math.max(0, Math.min(r, b) - g) / max;
};
/** Below this magenta-ness a pixel is item. */
const KEY_LO = 0.15;
/** At this share of the background's own magenta-ness a pixel is background. */
const KEY_HI = 0.8;
/** Pixels darker than this are item (the outline), whatever their tint. */
const KEY_DARK = 48;

interface Box { x0: number; y0: number; x1: number; y1: number; area: number }

/** Cuts one generated item off its background into a transparent square master. */
async function cutItem(file: string, out: string): Promise<boolean> {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const px = (x: number, y: number) => (y * W + x) * 4;

  // Background: the corners' color (the magenta the prompt asks for).
  const corners = [px(2, 2), px(W - 3, 2), px(2, H - 3), px(W - 3, H - 3)];
  const bg = [0, 1, 2].map(c => corners.map(i => data[i + c]).sort((a, b) => a - b)[1]);

  // How much of each pixel is item, from its magenta-ness: 0 at the background's, 1 below KEY_LO.
  const hi = KEY_HI * magenta(bg[0], bg[1], bg[2]);
  const key = new Float32Array(W * H);
  for (let p = 0; p < W * H; p++) {
    const i = p * 4;
    key[p] = Math.max(0, Math.min(1, 1 - (magenta(data[i], data[i + 1], data[i + 2]) - KEY_LO) / (hi - KEY_LO)));
  }
  // Only what joins the background without crossing an item pixel (the dark outline) is keyed:
  // inside the outline a purple gem or cloth stays solid.
  const edge = new Uint8Array(W * H);
  const queue: number[] = [];
  for (let p = 0; p < W * H; p++) if (key[p] === 0) (edge[p] = 1), queue.push(p);
  for (let k = 0; k < queue.length; k++) {
    const q = queue[k];
    const x = q % W, y = (q - x) / W;
    for (const n of [x > 0 ? q - 1 : -1, x < W - 1 ? q + 1 : -1, y > 0 ? q - W : -1, y < H - 1 ? q + W : -1]) {
      if (n >= 0 && !edge[n] && key[n] < 1) (edge[n] = 1), queue.push(n);
    }
  }
  /** 0 = background, 1 = item. */
  const alpha = new Float32Array(W * H);
  for (let p = 0; p < W * H; p++) alpha[p] = edge[p] ? key[p] : 1;

  // Shapes: connected item pixels. The item is the big ones (a pair of boots is two) and the
  // small ones close to them (a floating gem); small ones far off are noise.
  const labels = new Int32Array(W * H);
  const shapes: Box[] = [];
  const stack: number[] = [];
  for (let p = 0; p < W * H; p++) {
    if (labels[p] || alpha[p] < 0.5) continue;
    const box: Box = { x0: W, y0: H, x1: 0, y1: 0, area: 0 };
    shapes.push(box);
    labels[p] = shapes.length;
    stack.push(p);
    while (stack.length) {
      const q = stack.pop()!;
      const x = q % W, y = (q - x) / W;
      box.area++;
      box.x0 = Math.min(box.x0, x); box.x1 = Math.max(box.x1, x);
      box.y0 = Math.min(box.y0, y); box.y1 = Math.max(box.y1, y);
      for (const n of [x > 0 ? q - 1 : -1, x < W - 1 ? q + 1 : -1, y > 0 ? q - W : -1, y < H - 1 ? q + W : -1]) {
        if (n >= 0 && !labels[n] && alpha[n] >= 0.5) (labels[n] = shapes.length), stack.push(n);
      }
    }
  }
  const big = shapes.filter(s => s.area >= W * H * 0.002);
  if (!big.length) {
    console.log(`FAIL  ${file}: no item found on the background`);
    return false;
  }
  const kept = new Set<number>();
  const b = { x0: W, y0: H, x1: 0, y1: 0 };
  const near = Math.max(W, H) * 0.05;
  const dist = (s: Box) => Math.min(...big.map(h => Math.hypot(Math.max(0, s.x0 - h.x1, h.x0 - s.x1), Math.max(0, s.y0 - h.y1, h.y0 - s.y1))));
  for (const [i, s] of shapes.entries()) {
    if (!big.includes(s) && dist(s) > near) continue;
    kept.add(i + 1);
    b.x0 = Math.min(b.x0, s.x0); b.y0 = Math.min(b.y0, s.y0);
    b.x1 = Math.max(b.x1, s.x1); b.y1 = Math.max(b.y1, s.y1);
  }

  // Its own pixels only, background removed (and its tint taken back out of soft edges),
  // centered on a transparent square with some padding.
  const w = b.x1 - b.x0 + 1, h = b.y1 - b.y0 + 1;
  const side = Math.ceil(Math.max(w, h) / 0.84);
  const ox = (side - w) >> 1, oy = (side - h) >> 1;
  const img = Buffer.alloc(side * side * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (b.y0 + y) * W + b.x0 + x;
      if (labels[p] && !kept.has(labels[p])) continue; // noise
      const a = alpha[p];
      if (a <= 0) continue;
      const i = p * 4, o = ((oy + y) * side + ox + x) * 4;
      // A keyed edge loses its magenta tint: red and blue down to green, at most.
      const spill = edge[p] ? Math.max(0, Math.min(data[i], data[i + 2]) - data[i + 1]) : 0;
      img[o] = data[i] - spill;
      img[o + 1] = data[i + 1];
      img[o + 2] = data[i + 2] - spill;
      img[o + 3] = Math.round(a * 255);
    }
  }
  await sharp(img, { raw: { width: side, height: side, channels: 4 } }).png().toFile(out);
  return true;
}

async function cut() {
  const all = arts().arts;
  let n = 0, failed = 0;
  // Every raw image newer than its master: a hand-edited master is kept until its item is generated again.
  for (const a of all) {
    if (!existsSync(raw(a.key)) || mtime(raw(a.key)) <= mtime(master(a.key))) continue;
    if (await cutItem(raw(a.key), master(a.key))) n++;
    else failed++;
  }
  // Preview: every item with art, its new master or else its built image, by group on a checkerboard,
  // to check the items of a group match before building.
  const cell = (a: Art) => {
    const src = existsSync(master(a.key)) ? `${a.key}.png` : existsSync(built(a.key)) ? `../${OUT}/${a.key}.webp` : '';
    return src && `<figure><img src="${src}"><figcaption>${a.name}<br><small>${a.key}${src.endsWith('.png') ? '' : ' (built)'}</small></figcaption></figure>`;
  };
  const sections = groups(all).map(g => ({ name: g.name, cells: g.arts.map(cell).join('') })).filter(g => g.cells);
  writeFileSync(
    join(SRC, 'preview.html'),
    `<!doctype html><meta charset="utf-8"><title>Item art</title><style>
body{font:13px system-ui;background:#1a1d24;color:#ddd;margin:16px}h2{margin:24px 0 8px}
.g{display:flex;flex-wrap:wrap;gap:12px}figure{margin:0;width:140px;text-align:center}
img{width:128px;height:128px;background:conic-gradient(#333 25%,#444 0 50%,#333 0 75%,#444 0) 0 0/16px 16px;border-radius:6px}
small{color:#888}</style>${sections.map(g => `<h2>${g.name}</h2><div class="g">${g.cells}</div>`).join('')}`
  );
  console.log(`${n} items cut, ${failed} failed; check them in ${SRC}/preview.html, then npm run art:build`);
  if (failed) process.exit(1);
}

// ------------------------------------------------------------------ gen

const DEFAULT_MODEL = 'google/gemini-3.1-flash-lite-image';
const API = 'https://openrouter.ai/api/v1';
const GEN_CONCURRENCY = 4;
const GEN_TRIES = 3;
/** Errors that retrying won't fix: bad request, wrong key, no credits, unknown model. */
const FATAL = /^HTTP 4(0[01234]|22)\b/;

interface Job {
  label: string;
  prompt: string;
  out: string;
  /** Finished items (data URLs) whose style this image copies. */
  refs: string[];
}

const REF_RULES =
  'The attached images are finished items from the same game: match their art style exactly (pixel size and density, ' +
  'outline, palette, shading, lighting, viewing angle, how much of the image the item fills, background). ' +
  'Do not copy the items themselves or their level of detail: draw only the item described below, ' +
  'as plain or as ornate as its Detail line says.';

/** The request options a model takes on OpenRouter's image endpoint (`supported_parameters`). */
async function imageOptions(model: string) {
  const res = await fetch(`${API}/images/models`);
  const m = ((await res.json())?.data ?? []).find((x: any) => x.id === model);
  if (!m) throw new Error(`${model} is not an image model on OpenRouter (see ${API}/images/models)`);
  const takes = (k: string, v: string) => m.supported_parameters?.[k]?.values?.includes(v);
  return {
    ...(takes('aspect_ratio', '1:1') && { aspect_ratio: '1:1' }),
    ...(takes('resolution', '1K') && { resolution: '1K' }),
  };
}

/** Generates one image into job.out (the old one moves to art-src/old/); returns its cost in USD. */
async function generate(job: Job, model: string, options: object, apiKey: string): Promise<number> {
  for (let attempt = 1; ; attempt++) {
    let why: string;
    try {
      const res = await fetch(`${API}/images`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Title': 'mmo-idle-rpg item art' },
        body: JSON.stringify({
          model,
          prompt: job.prompt,
          n: 1,
          ...options,
          ...(job.refs.length && { input_references: job.refs.map(url => ({ type: 'image_url', image_url: { url } })) }),
        }),
        signal: AbortSignal.timeout(300_000),
      });
      const body: any = await res.json().catch(() => ({}));
      const b64: string | undefined = body?.data?.[0]?.b64_json;
      if (res.ok && b64) {
        if (existsSync(job.out)) {
          mkdirSync(`${SRC}/old`, { recursive: true });
          renameSync(job.out, `${SRC}/old/${parse(job.out).name}-${Date.now()}.png`);
        }
        mkdirSync(parse(job.out).dir, { recursive: true });
        await sharp(Buffer.from(b64, 'base64')).png().toFile(job.out);
        return Number(body?.usage?.cost ?? 0);
      }
      why = res.ok ? 'no image in the reply' : `HTTP ${res.status} ${body?.error?.message ?? ''}`;
    } catch (e) {
      why = String(e); // network error or timeout
    }
    if (FATAL.test(why) || attempt >= GEN_TRIES) throw new Error(why);
    console.log(`retry ${job.label} (${why})`);
    await new Promise(r => setTimeout(r, 5000 * attempt));
  }
}

async function gen(args: string[]) {
  const opt = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args.splice(i, 2)[1] : undefined;
  };
  const flag = (name: string) => {
    const i = args.indexOf(name);
    if (i >= 0) args.splice(i, 1);
    return i >= 0;
  };
  const model = opt('--model') ?? process.env.ART_MODEL ?? DEFAULT_MODEL;
  const dry = flag('--dry-run');
  const thenCut = flag('--cut');
  const refKeys = (opt('--ref') ?? process.env.ART_STYLE_REF ?? '').split(',').map(s => s.trim()).filter(Boolean);

  const { arts: all, missing } = arts();
  if (missing.length) throw new Error(`Items without a TIERS, TYPES or UNIQUE_LOOKS entry, see npm run art:list:\n${missing.join('\n')}`);
  const byKey = new Map(all.map(a => [a.key, a]));
  const picked = new Set<Art>();
  for (const name of args) {
    const group = all.filter(a => a.group === name);
    const art = byKey.get(name);
    if (!group.length && !art) throw new Error(`Unknown group or item key: ${name} (see ${SRC}/item-art.csv)`);
    for (const a of art ? [art] : group) picked.add(a);
  }
  // No names: every item with no art at all yet.
  if (!args.length) for (const a of all) if (!existsSync(built(a.key)) && !existsSync(raw(a.key))) picked.add(a);

  // Style references: finished items sent along, so every new item matches them (not to themselves).
  const refs: { key: string; url: string }[] = [];
  for (const key of refKeys) {
    if (!byKey.has(key)) throw new Error(`--ref ${key}: not an item key (see ${SRC}/item-art.csv)`);
    const file = [master(key), raw(key), built(key)].find(existsSync);
    if (!file) throw new Error(`--ref ${key}: no art for it yet`);
    refs.push({ key, url: `data:image/png;base64,${(await sharp(file).png().toBuffer()).toString('base64')}` });
  }
  const jobs: Job[] = [...picked].map(a => {
    const own = refs.filter(r => r.key !== a.key);
    return { label: a.key, prompt: own.length ? `${REF_RULES}\n${prompt(a)}` : prompt(a), out: raw(a.key), refs: own.map(r => r.url) };
  });

  const options = await imageOptions(model);
  console.log(`${jobs.length} images to generate with ${model} ${JSON.stringify(options)}${refs.length ? `, in the style of ${refKeys.join(', ')}` : ''}`);
  if (dry) {
    for (const j of jobs) console.log(`\n--- ${j.label} -> ${j.out}${j.refs.length ? ` (${j.refs.length} style refs)` : ''}\n${j.prompt}`);
    return;
  }
  if (!jobs.length) return;
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('Set OPENROUTER_API_KEY in .env');

  let cost = 0, failed = 0, next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      try {
        const c = await generate(job, model, options, apiKey);
        cost += c;
        console.log(`ok    ${job.label} -> ${job.out}${c ? `  ($${c.toFixed(4)})` : ''}`);
      } catch (e) {
        failed++;
        const why = e instanceof Error ? e.message : String(e);
        console.log(`FAIL  ${job.label}: ${why}`);
        if (FATAL.test(why)) next = jobs.length; // the same for every job: stop
      }
    }
  };
  await Promise.all(Array.from({ length: GEN_CONCURRENCY }, worker));
  console.log(`${jobs.length - failed} generated, ${failed} failed${cost ? `, $${cost.toFixed(4)} spent` : ''}`);
  if (thenCut) await cut();
  if (failed) process.exit(1);
}

// ------------------------------------------------------------------ build

/**
 * A master as real pixel art: averaged onto the PIXELS grid, every pixel fully opaque or fully
 * clear, a dark outline of its own colors along the edge, a COLORS palette, then each pixel a
 * SCALE x SCALE block. Whatever the model drew, every icon gets the same grid and outline.
 */
async function pixelize(file: string): Promise<Buffer> {
  const px = PIXELS;
  const s = await sharp(file).resize(px, px, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).ensureAlpha().raw().toBuffer();
  for (let i = 3; i < s.length; i += 4) s[i] = s[i] >= 128 ? 255 : 0;
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < px && y < px && s[(y * px + x) * 4 + 3] > 0;
  const edge: number[] = [];
  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) if (on(x, y) && !(on(x - 1, y) && on(x + 1, y) && on(x, y - 1) && on(x, y + 1))) edge.push((y * px + x) * 4);
  }
  for (const i of edge) for (let c = 0; c < 3; c++) s[i + c] = Math.round(s[i + c] * 0.25 + 8);
  const quantized = await sharp(s, { raw: { width: px, height: px, channels: 4 } }).png({ palette: true, colors: COLORS, dither: 0 }).toBuffer();
  return sharp(quantized).resize(px * SCALE, px * SCALE, { kernel: 'nearest' }).webp({ lossless: true }).toBuffer();
}

/** `build` with names (groups or item keys, like `gen`) only builds those. */
async function build(names: string[]) {
  mkdirSync(OUT, { recursive: true });
  const all = arts().arts;
  for (const name of names) {
    if (!all.some(a => a.group === name || a.key === name)) throw new Error(`Unknown group or item key: ${name} (see ${SRC}/item-art.csv)`);
  }
  let n = 0;
  for (const a of all) {
    if (names.length && !names.includes(a.group) && !names.includes(a.key)) continue;
    if (!existsSync(master(a.key))) continue;
    writeFileSync(built(a.key), await pixelize(master(a.key)));
    n++;
  }
  const known = new Set(all.map(a => a.key));
  for (const file of existsSync(SRC) ? readdirSync(SRC) : []) {
    const { name, ext } = parse(file);
    if (ext.toLowerCase() === '.png' && !known.has(name)) console.log(`SKIP  ${file}: not an expected key (see ${SRC}/item-art.csv)`);
  }
  console.log(`${n} images built into ${OUT}`);
}

const cmd = process.argv[2];
if (cmd === 'list') list();
else if (cmd === 'cut') await cut();
else if (cmd === 'build') await build(process.argv.slice(3));
else if (cmd === 'gen') {
  try {
    process.loadEnvFile('.env');
  } catch {
    // no .env: the key may be in the environment
  }
  await gen(process.argv.slice(3));
} else {
  console.log('usage: tsx scripts/item-art.ts list|cut|build|gen');
  process.exit(1);
}
