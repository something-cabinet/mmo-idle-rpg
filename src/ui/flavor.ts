// Flavour lines shown in the fight scene while walking to the next enemy. Client only:
// each walk's line is picked from a generator seeded by the character and the fight's
// start, so it stays the same across redraws and reopening the view.

import { ENEMIES_BY_ID, areaIndexOf } from '../../spacetimedb/src/data/zones';
import { seededRng } from '../../spacetimedb/src/loot';

const FLAVOR_SALT = 0x666c6176n; // "flav"

/** By zone ID: lines that fit anywhere in the zone. */
const ZONE_LINES: Record<number, readonly string[]> = {
  1: [
    'Smoke rises from the village chimneys behind you.',
    'Somewhere a dog barks, then stops.',
    'An old shrine by the road, its offerings long gone.',
    'Crows lift from the field all at once.',
    'You find goblin tracks, small and far too many.',
    'A villager swears a star fell into the goblin woods.',
  ],
  2: [
    'Thorns catch at your sleeves.',
    'The canopy closes overhead and the light turns green.',
    'Something large moved through here. Recently.',
    'The trees seem closer together than a moment ago.',
    'Roots twist across the path like grasping fingers.',
    'The stone in your pack hums louder where the thorns grow thickest.',
  ],
  3: [
    'Snow crunches under your boots.',
    'The wind howls down the pass, sharp as a blade.',
    'Your breath freezes in the air.',
    'The cold seeps through your armor.',
    'An avalanche rumbles somewhere above you.',
    'The shards in your pack tug uphill, toward the pass.',
  ],
  4: [
    'Silver leaves fall, though there is no wind.',
    'The sky is clear, but there is no moon in it.',
    'An elven statue watches the path, its face worn smooth.',
    'Pale light seeps up from cracks in the old marble road.',
    'Somewhere, a harp plays three notes and stops.',
    'The shards in your pack pull toward the throne, like iron to a lodestone.',
  ],
};

/** By area ID (zones.ts `areas`): lines about that place. */
const AREA_LINES: Record<number, readonly string[]> = {
  11: [
    'You step over a broken cart, half sunk in the mud.',
    'A scarecrow watches you pass. Its hat is new.',
    'The wheat is trampled flat in a wide circle.',
    'You hear squeaking in the hedgerow.',
    'A fence post is gnawed clean through.',
    "You pass a farmer's boot, sitting alone in the road.",
  ],
  12: [
    'The mill wheel creaks, though nobody is there to turn it.',
    'Mist curls up from the bog behind the mill.',
    'Faint green lights drift over the bog water.',
    'Flour sacks lie slashed open, the flour long blown away.',
    'Reeds hiss in the wind, though the air is still.',
    'Bubbles rise from the bog in a slow, steady rhythm.',
  ],
  13: [
    'Someone has painted a crude goblin face on a tree.',
    'The woods grow quieter the further you go.',
    "A cookpot bubbles over a fire. You don't look inside.",
    'Goblin drums thump somewhere ahead.',
    'Sharpened stakes ring the clearing, pointing out.',
  ],
  14: [
    'A throne of stolen chairs, lashed together with rope.',
    'Shiny trinkets are heaped around the tent pole.',
    'The guards are gone. Only the chief remains.',
    "A pale stone glows in Grubnak's crown, brighter than any of his trinkets.",
  ],
  15: [
    'Cold water drips from the vaulted ceiling.',
    'A bell tolls, and the water trembles with it.',
    'Pews rot beneath a green, glowing tide.',
    'Hymns echo from somewhere below, sung by no one.',
  ],
  21: [
    'Webs stretch between the trees, thick as rope.',
    "A bandit's campfire, still warm.",
    'A wanted poster, torn and nailed to a stump.',
    'You find a coin purse, empty and slashed open.',
    'A trail of torn cloth leads off the path.',
  ],
  22: [
    'The bark of an old oak has been carved with runes.',
    'A circle of mushrooms glows faintly in the dark.',
    'Something hums a tune deep in the thicket.',
    'A tree groans and shifts its roots as you pass.',
  ],
  23: [
    'You hear howling, far off, then much closer.',
    'Gnawed bones crunch underfoot.',
    'Yellow eyes watch you from the undergrowth.',
    'An arrow is stuck in a tree, its fletching black.',
  ],
  24: [
    'The thorns part for you. That is not a good sign.',
    'A cauldron steams outside a crooked hut.',
    'Dolls of woven briar hang from every branch.',
    'Something pale glints at the bottom of the cauldron.',
  ],
  31: [
    'Harpies circle high overhead.',
    'Tunnels yawn in the cliffside, too small for a man.',
    'A frozen traveller sits by the road, still smiling.',
    'You pass a dwarven waystone, its runes worn smooth.',
  ],
  32: [
    'Blue light flickers behind the ice of a frozen falls.',
    'Candles burn in the snow, their flames perfectly still.',
    'Chanting drifts down from the shrine.',
    'A cairn of stones, topped with a horned helm.',
  ],
  33: [
    'A broken dwarven door, kicked in from the inside.',
    'Icicles hang from the rocks like teeth.',
    'Drumming echoes up from deep beneath the mountain.',
    'Stone fragments litter the floor, some still twitching.',
  ],
  34: [
    'The tracks in the snow are each the size of a shield.',
    'A drinking horn the size of a barrel lies on its side.',
    "The hall's great fire has burned down to blue embers.",
    "A pale shard the size of a fist hangs from a chain around the jarl's neck.",
  ],
  41: [
    'Moths drift between the pale trunks like falling snow.',
    'Deep claw marks score a silverbark tree, oozing light.',
    'A feather the size of your arm lies in the moss.',
    'The moths all drift the same way, toward the dark.',
  ],
  42: [
    'A moonwell, bone dry, its rim carved with the phases of the moon.',
    'Vines curl around a fallen arch, and one of them moves.',
    'An empty helm turns to follow you.',
    'Marble steps lead down into still, black water.',
  ],
  43: [
    'Starlight falls through the cracked glass dome.',
    'Chanting echoes beneath the glass, in a tongue long dead.',
    'Star charts cover the walls, every moon scratched out.',
  ],
  44: [
    'Silver banners hang in tatters from the throne-hall pillars.',
    'A black moon hangs above the throne. It does not shine.',
    'The court still kneels, though none of them have breathed in years.',
    "A pale shard rests in the queen's lap, cradled like a child.",
  ],
  45: [
    'White petals drift past, though nothing here is in bloom.',
    "Your shadow falls the wrong way, toward a moon that isn't there.",
    'The fountain shows a full moon. The sky above it is empty.',
  ],
};

/** The line for the walk that starts the fight at `startMicros`: from the target's area or its zone. */
export function walkLine(enemyId: number, characterId: bigint, startMicros: bigint): string | undefined {
  const found = ENEMIES_BY_ID.get(enemyId);
  if (!found) return undefined;
  const { zone } = found;
  const area = zone.areas[areaIndexOf(zone, enemyId)];
  const lines = [...(ZONE_LINES[zone.id] ?? []), ...((area && AREA_LINES[area.id]) ?? [])];
  if (!lines.length) return undefined;
  return lines[Math.floor(seededRng(characterId, startMicros, FLAVOR_SALT)() * lines.length)];
}
