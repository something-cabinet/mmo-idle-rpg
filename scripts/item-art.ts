// Item art pipeline (src/ui/itemArt.tsx): one image per item name, each generated alone from
// a prompt joined from a tier's look and a type's (TIERS + TYPES below), so items come out alike.
// The pipeline itself (gen, cut, build) is scripts/art-lib.ts:
//
//   npm run art:list   writes art-src/item-art.csv (every image the game expects, committed)
//   npm run art:gen -- [group|key ...] [--cut] [--dry-run] [--model <id>] [--ref <key>[,<key>]]
//                      a group (sword, plate-chest, uniques, ...) or an item key (b-2-t5, u-3);
//                      --ref defaults to ART_STYLE_REF in .env
//   npm run art:cut    raw images into masters, art-src/items/preview.html
//   npm run art:build -- [group|key ...]
//                      src/assets/items/<key>.webp (48 px grid, 144 px file)
// art-src/items/ is not in git; art-src/item-art.csv is.
import { BASE_LIST, GEMS, QUALITY, TRACKS } from '../spacetimedb/src/data/bases';
import { MAX_TIER } from '../spacetimedb/src/data/stats';
import { RAIDS_BY_ID } from '../spacetimedb/src/data/raids';
import { UNIQUES } from '../spacetimedb/src/data/uniques';
import { runArt, type Art } from './art-lib';

/** Pixel art grid: a master is pixelized onto PIXELS x PIXELS, then scaled up 3 times with hard edges. */
const PIXELS = 48;

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
type TierWord = (typeof TRACKS)[keyof typeof TRACKS][number] | (typeof GEMS)[keyof typeof GEMS][number] | 'Rime' | 'Umbral' | 'Forgefire';

/** A tier's main colors (most of the item first, then trim and accents) and its material. */
interface Look { colors: string; look: string }

/** Typed, so a new tier word in bases.ts fails to compile until it has a look. */
const TIERS: Record<TierWord, Look> = {
  // metal: swords, daggers, maces, scepters, katanas, greatswords, shields, plate
  Rusted: { colors: 'rust orange, dull dark brown, grey iron', look: 'pitted iron covered in flaking rust, chipped edges, crude and battered' },
  Bogiron: { colors: 'blackish brown, dark slate grey, dull bronze', look: 'rough bog iron, unevenly hammered, dull, plain' },
  Dwarven: { colors: 'steel grey, warm bronze, dark brown leather', look: 'thick polished steel, blocky and sturdy, geometric knotwork' },
  Elven: { colors: 'pale silver, leaf green, white', look: 'bright steel in slender flowing curves, leaf engraving' },
  Brightsteel: { colors: 'silver-white, cool light blue, sapphire blue', look: 'gleaming brightsteel with a blue sheen, sleek, small sapphires' },
  Verdite: { colors: 'deep green, black-green, dark gold', look: 'verdite, massive and angular, faceted planes' },
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
  Umbral: { colors: 'bright silver, jet black, deep indigo', look: 'split down the middle: polished moon-silver on one side, starry black void on the other, a thin eclipse ring inlaid where they meet' },
  Forgefire: { colors: 'blackened iron, glowing ember orange, warm bronze', look: 'hammered blackened iron with glowing ember-orange seams like metal fresh from the forge, heavy bronze rivets and dwarven runes' },
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
  'War Horn': 'a curved war horn (a large animal horn) with metal bands and a mouthpiece, hung on a short strap',
  'Main Gauche': 'a parrying dagger (main gauche) with a straight slim blade and a large curved hand guard, held point up',
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
  /** In place of UNIQUE_DETAIL, for a unique whose look breaks its "no oversized parts" rule on purpose. */
  detail?: string;
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
  15: {
    type: 'a huge two-handed greatsword, held point up, diagonal with the handle at the bottom left and the point at the top right',
    colors: 'pale moonlight blue, silver, white',
    look: 'a long straight blade of translucent pale blue crystal, bright white at its core like moonlight on ice, small engraved runes of moon phases ' +
      'down its center, a simple elegant silver crossguard and a long silver-wrapped grip',
  },
  16: {
    type: 'a two-handed katana with a long slightly curved blade, diagonal with the handle at the bottom left and the point at the top right',
    colors: 'silver, deep night blue, pale gold',
    look: 'a polished silver blade with a pale gold crescent-moon hamon along the edge, a round guard shaped like a waxing crescent, ' +
      'a night blue wrapped grip',
  },
  17: {
    type: 'a sleeveless leather jerkin, front view',
    colors: 'charcoal grey, midnight blue, silver',
    look: 'soft dark leather with layered owl-feather shapes at the shoulders, faint silver crescent stitching, ' +
      'the edges fading into wisps of shadow',
  },
  18: {
    type: 'a pendant hanging straight down, facing the viewer: a short chain in a V at the top, the pendant centered below',
    colors: 'silver, pale blue moonstone, white',
    look: 'a teardrop-shaped milky moonstone with a pale blue sheen and a bright white highlight, held in a fine silver setting shaped like a thin crescent moon',
  },
  19: {
    type: 'a ring standing upright, seen from the front: a band below and a set stone on top facing the viewer',
    colors: 'tarnished silver, milky moonstone, sickly green',
    look: 'a crooked twisted silver band, a cracked moonstone with a swirl of sickly green madness inside, ' +
      'tiny dice and crescent moons engraved around the setting',
  },
  // The Drowned Moon (raid): pieces of Umbriel, the abyssal angler (enemy-art.ts LOOKS[9002]), each
  // half silver Full Moon, half void New Moon like it.
  // Its gill plate, the eclipse its armored eye. Set apart from the plain Umbral Greatshield (a
  // flat split tower shield): its own curved shape, rich ornament and a jewel of an eye.
  20: {
    type: 'a large tall greatshield, front view, shaped like a huge curved fish gill plate: a rounded top, ' +
      'the sides sweeping down and in to a pointed base, slightly convex, with huge fins flaring out from both sides; ' +
      'the shield and its fins together fill the icon, the fins as wide as the shield body',
    colors: 'bright silver, jet black, dark teal, white',
    look: 'the face split down the middle, overlapping polished moonstone scales on the left and smooth black void skin ' +
      'scattered with tiny white stars on the right; curved gill ridges of engraved silver filigree sweeping across both halves; ' +
      'a raised rim of fine silver crescent moons all the way around, a row of short curved silver needle fangs set along ' +
      'the lower edge like a jaw; ' +
      'huge webbed dark teal fins sweeping out and back from both sides and over the top like torn crescent sails, ' +
      'each fin with long silver ribs fanning through solid dark teal webbing, ragged trailing edges; ' +
      'big layered gill flaps of silver scale overlapping down the shield face, ' +
      'in the center a large round eclipse boss like an armored eye: a polished black pearl dome ringed by a thick bright silver corona ' +
      'with fine engraved rays, a thin white crescent highlight on the pearl',
    // The unique detail, with its "no oversized flared parts" turned around for the fins.
    detail: 'a named one-of-a-kind masterwork, as fine as tier 8 of 9 gear: superb materials and finish, fine engraving and filigree, ' +
      'crisp polished highlights and the full palette; the huge fins are its signature and meant to be oversized and dramatic',
  },
  // Its lure: the stolen moon on the end of its stalk.
  21: {
    type: 'a tall healing staff standing straight up: a long shaft that curves over at the top like a fishing rod, a lantern hanging from the tip',
    colors: 'pale silver, white moonlight, dark teal',
    look: "the shaft is the angler's own lure stalk: dark teal, fleshy ridged segments wet with water drops, curving over at the top; " +
      'a small silver cage lantern hanging from its tip, a bright white cracked sliver of the moon trapped inside it',
  },
  // One of its fangs, finned and gilled like the Eclipse Aegis.
  22: {
    type: 'a two-handed katana with a long slightly curved blade, diagonal with the handle at the bottom left and the point at the top right',
    colors: 'bright silver, jet black, dark teal, white',
    look: 'the blade one long curved needle-like fang, bright silver along the edge and black void with tiny white stars along the spine, ' +
      'tapering to a needle point; a low webbed dorsal fin of dark teal with fine silver ribs running along the back of the blade ' +
      'from the guard to halfway up, its trailing edge ragged like a torn crescent sail; ' +
      'a round guard shaped like an eclipse: a black disc ringed by a thin silver corona, flanked on both sides by layered silver gill flaps ' +
      'and two small swept-back dark teal fins; a grip wrapped in dark scaled fish skin',
  },
  // The Brothers' Forge (raid 3, T5): the smith brothers Brokk (hammer) and Sindri (bellows and fire).
  28: {
    type: 'a pair of heavy plate sabatons (armored boots) side by side, front three-quarter view',
    colors: 'blackened iron, glowing ember orange, polished brightsteel',
    look: 'thick overlapping plates of blackened iron, the left boot with a small anvil-shaped knee guard, the right with a bellows-shaped one, ' +
      'glowing ember-orange seams between the plates, heavy bronze rivets',
  },
  29: {
    type: 'a one-handed scepter standing upright, the head at the top',
    colors: 'warm bronze, glowing ember orange, soot black',
    look: 'the head a small ornate forge bellows of bronze and dark leather, glowing embers drifting from its nozzle, a slim bronze haft wrapped in soot-dark leather',
  },
  30: {
    type: 'a huge two-handed greatsword, held point up, diagonal with the handle at the bottom left and the point at the top right',
    colors: 'blackened iron, glowing ember orange and yellow, dark bronze',
    look: 'a broad heavy blade of blackened iron with a single glowing ember-orange crack running down its middle like a coal that never cooled, ' +
      'a hammer-head crossguard, a dark bronze grip wrapped in leather',
  },
  // T5: Brightvein Hold, a dwarven mine whose ore veins glow from a fallen shard.
  23: {
    type: 'a one-handed war mace, diagonal with the handle at the bottom left and the head at the top right, the head large and blocky',
    colors: 'bright silver-blue brightsteel, dark iron, warm forge bronze',
    look: 'a massive head shaped like a small heater shield, its face toward the viewer: a thick slab of brightsteel with a flat top, ' +
      'tapering to a blunt point, its face clad in overlapping armor plates riveted with bronze, a raised bronze rim around its edge, ' +
      'a bronze boss at its center, thin silver-blue veins in the steel between the plates; ' +
      'a short thick haft sheathed in iron bands and plate collars, a heavy bronze rune ring where head meets haft, ' +
      'a grip of worn leather, a blocky bronze pommel weight',
    detail: 'a named one-of-a-kind masterwork, as fine as tier 7 to 8 of 9 gear: deliberately chunky and overbuilt, a shield-shaped head ' +
      'nearly as wide as the haft is long, thick armor plating and heavy rivets, a solid heavy silhouette with no thin parts; ' +
      'superb materials, crisp polished highlights and the full palette; no wings, no spikes',
  },
  24: {
    type: 'a crossbow, front three-quarter view, the stock at the bottom left and the bow arms across the top right',
    colors: 'dark polished ironwood, bright silver-blue brightsteel, brass',
    look: 'a sturdy dwarven crossbow of dark ironwood with brightsteel bow arms, a small brass sighting scope with a silver-blue lens on top, ' +
      'a loaded bolt with a glowing silver-blue brightsteel head, fine brass rune inlay along the stock',
  },
  25: {
    type: 'a ring standing upright, seen from the front: a band below and a set stone on top facing the viewer',
    colors: 'warm gold, pale white shard, soft silver-blue',
    look: 'a heavy gold band etched with tiny dwarven runes, set with a jagged splinter of pale white stone like a broken piece of the moon, ' +
      'thin silver-blue cracks of light spreading from it into the gold',
  },
  // The horn of the hold's last muster: grand, but cracked and worn, its breath running out.
  26: {
    type: 'a large curved war horn (a great animal horn) seen from the side, the wide bell at the top right and the mouthpiece at the bottom left, hung on a short strap',
    colors: 'aged ivory, bright silver-blue brightsteel, warm bronze, dark brown leather',
    look: 'a long ridged ivory horn yellowed with age, bound by three brightsteel bands engraved with dwarven muster runes, ' +
      'a wide brightsteel bell rim shaped like a thane\'s crown, a bronze mouthpiece; a long crack running down the ivory ' +
      'with a faint silver-blue glow fading out along it, the runes bright near the mouthpiece and dimming toward the bell, ' +
      'a frayed dark leather strap',
  },
  // A parrying blade that catches the vein-light: its wide guard flashes like a mirror.
  27: {
    type: 'a parrying dagger (main gauche) held point up: a straight slim blade and a large curved shell hand guard',
    colors: 'bright silver-blue brightsteel, polished white silver, dark blue leather, warm gold',
    look: 'a narrow brightsteel blade with a fine silver-blue glowing vein down its center, a wide polished shell guard ' +
      'curving around the grip like a mirror, a bright white glint flashing on it, small gold rune studs around its rim, ' +
      'a short notched catching tine on each side of the guard for trapping blades, a dark blue leather grip and a round gold pommel',
  },
};

// ------------------------------------------------------------------ items

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
    out.push({ key: `u-${u.id}`, name: u.name, group: 'uniques', tier: u.tier, subject: prompt(u.name, look.type, look, look.detail ?? UNIQUE_DETAIL) });
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


/** One image per name: two images sharing a name, or a variant whose name changes by tier, break the rule. */
function check(all: Art[]): string[] {
  const out: string[] = [];
  const byName = new Map<string, string[]>();
  for (const a of all) byName.set(a.name, [...(byName.get(a.name) ?? []), a.key]);
  for (const [name, keys] of byName) if (keys.length > 1) out.push(`SAME NAME  ${name}: ${keys.join(', ')}`);
  for (const b of BASE_LIST) {
    if (b.typeId !== b.id && new Set(Array.from({ length: MAX_TIER }, (_, i) => b.name(i + 1))).size > 1) out.push(`VARIANT NAME CHANGES BY TIER  b-${b.id}`);
  }
  return out;
}

await runArt(
  {
    title: 'Item art',
    src: 'art-src/items',
    csv: '../item-art.csv',
    out: 'src/assets/items',
    shape: { kind: 'sprite', pixels: PIXELS, fill: 0.84, scale: 3 },
    colors: 24,
    arts,
    check,
    common: `Style: ${STYLE}. ${RULES}`,
    refRules:
      'The attached images are finished items from the same game: match their art style exactly (pixel size and density, ' +
      'outline, palette, shading, lighting, viewing angle, how much of the image the item fills, background). ' +
      'Do not copy the items themselves or their level of detail: draw only the item described below, ' +
      'as plain or as ornate as its Detail line says.',
    refEnv: 'ART_STYLE_REF',
  },
  'scripts/item-art.ts'
);
