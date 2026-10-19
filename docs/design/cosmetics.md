# Cosmetics: titles, name effects, nameplates

*First version.* Code: `spacetimedb/src/data/cosmetics.ts` (the list and its unlock
conditions), `helpers.ts` `grantCosmetics` (granting), `reducers/cosmetics.ts` (`setLook`),
`src/ui/PlayerName.tsx` (how a name is drawn), `src/ui/views/LookCard.tsx` (the Character
page's Customize tab), styles under "cosmetics" in `src/style.css`. Checks in `npm run test:smoke`; the dev
cheat "Unlock all cosmetics" unlocks everything to try on.

Cosmetics give **no power**. They show what a character has done. All are **earned**:
none can be bought (a raid token or Voidglass shop may sell some later).

## Three slots

| Slot | What it is | Example |
|---|---|---|
| **Title** | A short phrase in small text above the name; too long for the space, it ends in "…" (full text on hover) | "Moonless" over "Lam" |
| **Name effect** | How the name text is drawn: a fixed colour and effect pair | Moonlight: silver shimmer |
| **Nameplate** | A background plate behind the name and title | Moonwell: deep blue, silver rim |

Each slot is chosen on its own from the ones unlocked, or left empty (plain name). An effect
is one colour with one effect, not a colour picker plus an effect picker.

- **No theme versions.** A plate looks the same in light and dark mode, and any effect can
  sit on any plate. Players pick what they wear; an unreadable mix is their choice.
- **Motion:** shimmer, flicker, glow and pulse are CSS animations. Under
  `prefers-reduced-motion` they stop and the name keeps its colour.

## Where names show it

One component draws every player name (`PlayerName`). Two sizes:

- **Full** (effect, title and plate): the top bar, the Character page, inspect, the friend
  and online lists, raid seats and the raid fight, duels, the Moonwell leaderboard.
- **Inline** (effect only: no title, no plate, no animation): chat lines. A plate and an
  animation on every line would be noise.

The look is always the character's current one (one public `look` row per character),
including on old chat messages: a message stores who sent it, not how they looked.

## Unlocks

Unlocks are **milestones that are never lost**, all from progress the game already
records. Nothing needs being online: no counts of clears, no streaks. The zone boss
titles take **5,000 kills** of the boss (`BOSS_TITLE_KILLS`), a farming goal that offline
kills count toward like any other.
Seasonal and top-10 rewards come when seasons are turned on (abyss.md).

### Titles

| ID | Title | How |
|---|---|---|
| 1 | Goblin Bane | Defeat Grubnak, Goblin Chief (T1 boss) 5,000 times |
| 2 | Thornbreaker | Defeat Morgra, the Thorn Witch (T2 boss) 5,000 times |
| 3 | Jarlslayer | Defeat Hrimvald, Frost Giant Jarl (T3 boss) 5,000 times |
| 4 | Queenslayer | Defeat Selvara, the Moonless Queen (T4 boss) 5,000 times |
| 5 | Bellringer | Defeat the Drowned Bellringer (T1 secret) |
| 6 | Moonlit | Defeat the Moonlit Champion (T4 secret) |
| 7 | Wyrmslayer | Win Wyrm Hollow |
| 8 | Eclipsed | Win The Drowned Moon |
| 9 | Deepdiver | Clear Moonwell depth 10 |
| 10 | Moonless | Clear depth 25 |
| 11 | Lightless | Clear depth 50 |
| 12 | Voidborn | Clear depth 75 |
| 13 | Moonfallen | Clear depth 100 |
| 14 | Centurion | Reach level 100 |
| 20–24 | Master Miner, Master Woodcutter, Master Forager, Master Smith, Master Alchemist | That life skill at 99 (life-skills.md) |

### Name effects

| ID | Effect | Look | How |
|---|---|---|---|
| 1001 | Rime | Ice blue, soft frost glow | Win Wyrm Hollow |
| 1002 | Moonlight | Silver, a shimmer sweeping across | Win The Drowned Moon |
| 1003 | Voidflicker | Violet, flickers like a failing light | Clear depth 50 |
| 1004 | Eclipse | Black with a pulsing gold corona | Clear depth 100 |
| 1005 | Ember | Orange, a warm flickering glow | Reach level 100 |
| 1006 | Gilded | Gold, a slow shimmer | Any life skill at 99 |

### Nameplates

| ID | Plate | Look | How |
|---|---|---|---|
| 2001 | Moonwell | Deep blue, silver rim | Clear depth 25 |
| 2002 | Starless | Black, faint stars | Clear depth 75 |
| 2003 | Moon Garden | Pale silver-green, leaf border | Defeat the Moonlit Champion |
| 2004 | Veteran | Dark leather, gold border | Reach level 100 |

IDs are permanent (stored in unlock and look rows): never reuse or renumber. Titles
1–999, name effects 1001–1999, plates 2001–2999.

### Granting

Each cosmetic has a condition over data the game already keeps: an enemy's lifetime
kills (`enemy_kill`, online and offline: zone bosses, secret enemies, and raid bosses, whose
kill a raid win records), the character's level, a skill level, the deepest Moonwell
depth. `grantCosmetics` checks the ones not unlocked yet and records the new ones
(`cosmetic_unlock`). It runs:

- on entering the world (this also backfills everything earned before cosmetics existed,
  and any cosmetic added later, with no migration);
- after a settle that could have changed a condition (a level-up, skilling, a boss or
  secret enemy as the target);
- after a raid win (every member) and a Moonwell clear.

A new unlock shows a toast. Cosmetics stay when the condition later changes (a season
reset of the Deep).

## Data

| Part | What |
|---|---|
| `cosmetic_unlock` (private, view `my_cosmetics`) | One row per unlock: character, cosmetic ID, when |
| `look` (public, everyone subscribes) | One row per character that wears anything: title, effect (`visualId`) and plate IDs (0 = none). Deleted when all three are empty. Changes only on `setLook` |
| `chat_message.characterId` | The sender, to find its look (0 on messages from before) |
| `setLook(titleId, visualId, plateId)` | Each must be 0 or an unlocked cosmetic of that slot |

## Character page

The page has two tabs: **Status** (level, stats, effects) and **Customize**. Customize
shows a preview of the name as others see it (full size) and one picker per slot with
only the cosmetics unlocked so far, each drawn in its own look. Picking one wears it at
once. Locked ones are hidden unless **Show locked** is ticked: then they show greyed out, with
how to unlock them, and each slot shows how many of its cosmetics are unlocked.

## Later

- Seasonal Deep rewards: the season's top 10 get a gold title and plate for the next
  season (abyss.md).
- A shop for some plates (raid tokens, Voidglass).
- Chaos Dungeon Rank 10 title (chaos-dungeon.md).
