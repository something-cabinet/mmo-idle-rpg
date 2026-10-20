# Story: The Broken Moon

*Light on purpose.* The story is a reason to move from zone to zone, not an epic: one
line per zone explains why you came and why you leave. It's told through zone blurbs,
walk lines and a line on each boss's first kill. T1–T4 exist; T5 is sketched; T6–T9 are
direction only.

## The spine

Selvara, the queen of Moonveil, tried to hold the moon over her city forever. It
**cracked**. Its shards fell across the world, and whatever takes one grows strong and
strange.

- **Every zone boss holds a shard.** That's why bosses outclass their zone, and why
  each boss's land has gone wrong: goblins raiding, a cursed forest, giants marching.
- **The shards point the way.** A shard taken from a boss hums and tugs toward the
  next one. That's the excuse for every zone change: *the shard points that way.*
- **At T5 the story turns.** The largest shard broke into the world and made a rift.
  Killing the one holding the rift shut opens it: the Chaos Dungeon is partly your
  fault, and something on the other side was waiting for the moon to break.
- **T6–T9 follow it** down into shadow, through the dead and the void, then up the
  World Tree to the sky, where you put the shards back and relight the moon.

The gear tier words already follow this path (bases.md): Brightsteel and Runeweave at
T5, Shadowhide at T6, Ghostwood and Wyrmscale at T7, Voidweave and Dragonbone at T8,
Worldroot and Starweave at T9.

**Only T4 is about the moon.** Other zones keep their own identity; the shard is just
something buried in each one.

## By tier

| Tier | Zone | Why you come | The shard | Why you leave |
|---|---|---|---|---|
| 1 | Greenhollow | Goblins raid the village. | Set in Grubnak's crown. | It tugs north, toward the forest. |
| 2 | Thornwood | The forest beyond went wild overnight. | In Morgra's cauldron: her curse was brewed from it. | Both shards pull toward the mountains. |
| 3 | Frostmaw Pass | The giants came down the pass chasing a falling star. | Hrimvald wears it. He blocks the pass. | Past the pass is a valley no map shows. |
| 4 | Moonveil Vale | Where the moon broke. | Selvara is the cause, mad under the moon she broke. | Her death shows where the largest shard fell. |
| 5 | **Brightvein Hold** | The largest shard fell through a mountain into a dwarven mine. | The Last Thane is fused to it, holding the rift shut. | His death opens the rift: **the Chaos Dungeon**. What came through went down. |
| 6 | *Shadow realm* | You follow it beneath the rift, into the moon's shadow. | | |
| 7 | *Dead empire* | Ruins of a rune-mage empire that faced this before and lost. Their ghosts know how it ends. | | |
| 8 | *Edge of the void* | A dragon graveyard where the dragons died holding it back. It eats light. | | |
| 9 | *World Tree* | You climb to the sky with every shard. | | You relight the moon. |

T6–T9 names, enemies and bosses are open; the gear words above set their look.

## T5: Brightvein Hold

A dwarven hold in a mountain the shard fell through. Its light got into the stone,
and the silver veins around it began to glow: **brightsteel**, the strongest
metal the dwarves had seen. They followed it down. The deeper they dug, the brighter
the veins and the stranger the hold, until the mine broke into the rift. The Last
Thane sealed the breach with runes and bound himself to the shard to hold it. The hold
has stood silent since.

- **Gear:** the T5 metal is named for it (Brightsteel). Runeweave works as the
  seals, Ironwood as mine timbers, and Drakehide as the drakes of the lower tunnels.
- **Areas** (sketch): Brightsteel Lode → Collapsed Forge → Runebound Gate → the
  Sealed Breach (lair).
- **Boss: the Last Thane**, a runeforged dwarf king fused to the shard. Proposed
  fight: physical damage behind **Warded** defense, the one mix no boss has used yet
  (Grubnak phys/Balanced, Morgra magic/Warded, Hrimvald phys/Armored, Selvara
  magic/Armored).
- **First kill** unlocks T6 as usual, and also **the Chaos Dungeon**
  (chaos-dungeon.md): the seal breaks and the rift opens.
- **Walk-line motif:** the veins glow brighter the deeper you go.
- Enemies, drops, materials and a secret area: to be written into zone-content.md.

## How it's told

| Where | What |
|---|---|
| Zone blurb | Why you've come (the "Why you come" column). |
| Walk lines | One or two per zone hinting at the shard ("The stone in your pack hums."). |
| Boss first kill | One line on the first-kill toast: the shard and where it points. |

Built for T1–T4: the zone blurbs, a shard walk line per zone and per lair (flavor.ts),
and the boss line (zones.ts `bossLine`), shown on the first-kill toast and under a
cleared zone's blurb on the Zones page. The lines:

- **Grubnak:** "The stone in Grubnak's crown is still warm. It tugs, faintly, north."
- **Morgra:** "Her cauldron runs dry around a shard of pale stone. Both shards pull toward the mountains."
- **Hrimvald:** "The jarl's star was a shard like yours. Beyond the pass, the shards pull toward a hidden valley."
- **Selvara:** "The moon broke here. Her shard points east, to where the largest piece fell."
- **The Last Thane** (with T5): "The seal breaks. Below, something opens its eyes."

It fits what's already there: the Moonwell Deep opens when Selvara's death unseals the
moonwell, The Drowned Moon raid and the Moonlit Champion keep the last of the moon's
light, and the Drowned Bellringer's chapel can stay its own small story.

## Open

- Whether shards show up in the UI (a collection on the Character page) or stay in text.
- T6–T9 zone names, bosses and the thing behind it all (name, and whether it's the
  T9 boss or a raid).
