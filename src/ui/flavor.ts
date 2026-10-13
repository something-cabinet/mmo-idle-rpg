// Flavour lines shown in the fight scene while walking to the next enemy. Client only:
// each walk's line is picked from a generator seeded by the character and the fight's
// start, so it stays the same across redraws and reopening the view.

import { seededRng } from '../../spacetimedb/src/loot';

const FLAVOR_SALT = 0x666c6176n; // "flav"

/** By zone ID. A zone without lines shows none. */
const LINES: Record<number, readonly string[]> = {
  1: [
    'You step over a broken cart, half sunk in the mud.',
    'Smoke rises from the village chimneys behind you.',
    'A scarecrow watches you pass. Its hat is new.',
    'The wheat is trampled flat in a wide circle.',
    'Somewhere a dog barks, then stops.',
    'You find goblin tracks, small and far too many.',
    'Mist curls up from the bog to the east.',
    'An old shrine by the road, its offerings long gone.',
    'The mill wheel creaks, though nobody is there to turn it.',
    'You hear squeaking in the hedgerow.',
    'A fence post is gnawed clean through.',
    'Faint green lights drift over the bog water.',
    'Someone has painted a crude goblin face on a tree.',
    'The woods grow quieter the further you go.',
    'You pass a farmer\'s boot, sitting alone in the road.',
    'Crows lift from the field all at once.',
  ],
  2: [
    'Thorns catch at your sleeves.',
    'The canopy closes overhead and the light turns green.',
    'Webs stretch between the trees, thick as rope.',
    'A bandit\'s campfire, still warm.',
    'Something large moved through here. Recently.',
    'An arrow is stuck in a tree, its fletching black.',
    'You hear howling, far off, then much closer.',
    'The bark of an old oak has been carved with runes.',
    'A wanted poster, torn and nailed to a stump.',
    'Roots twist across the path like grasping fingers.',
    'A circle of mushrooms glows faintly in the dark.',
    'The trees seem closer together than a moment ago.',
    'You find a coin purse, empty and slashed open.',
    'Something hums a tune deep in the thicket.',
    'A trail of torn cloth leads off the path.',
  ],
  3: [
    'Snow crunches under your boots.',
    'The wind howls down the pass, sharp as a blade.',
    'An avalanche rumbles somewhere above you.',
    'A frozen traveller sits by the road, still smiling.',
    'You pass a dwarven waystone, its runes worn smooth.',
    'Harpies circle high overhead.',
    'Your breath freezes in the air.',
    'Tunnels yawn in the cliffside, too small for a man.',
    'A broken dwarven door, kicked in from the inside.',
    'Icicles hang from the rocks like teeth.',
    'Drumming echoes up from deep beneath the mountain.',
    'The tracks in the snow are each the size of a shield.',
    'A cairn of stones, topped with a horned helm.',
    'Blue light flickers behind the ice of a frozen falls.',
    'The cold seeps through your armor.',
  ],
};

/** The line for the walk that starts the fight at `startMicros`, if the zone has any. */
export function walkLine(zoneId: number, characterId: bigint, startMicros: bigint): string | undefined {
  const lines = LINES[zoneId];
  if (!lines?.length) return undefined;
  return lines[Math.floor(seededRng(characterId, startMicros, FLAVOR_SALT)() * lines.length)];
}
