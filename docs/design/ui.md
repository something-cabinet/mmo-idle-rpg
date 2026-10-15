# UI and layout

Desktop first, mostly text and icons, placeholder art. Only the fight view animates.

## Principles

- **Numbers are the content.** Show kill time, survival, rates and item stats clearly;
  this is how players make decisions in a stat-check game.
- **Always show progress.** The current activity (target, rates, XP bar) is visible on
  every screen.
- **No upgrade scores on items** (equipment.md). Comparisons show both items and how the
  character's totals would change, never a single "better/worse" number.
- **Item art:** one pixel art image per item name: a core base per tier, a variant, a
  unique (src/ui/itemArt.tsx; generated one by one from a tier look plus a type look, see scripts/item-art.ts). One image on a 48 px pixel grid, shown in
  tiles and lists with a rim in the rarity color. Missing art, or Settings › Item art
  off, shows the line glyph (src/ui/Icon.tsx).
- **Dark theme** by default.

### Rarity colors

| Common | Magic | Rare | Epic | Legendary | Unique |
|---|---|---|---|---|---|
| Grey | Blue | Yellow | Purple | Orange | Magenta |

Used for item names, icon borders and loot log lines.

## Frame

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ ⚔ Aria  Lv 14 [██████████░░░░ 62%]   ● 1,234 gold   ◆ 87 dust   👥 312  ⚙ │  top bar
├────────┬─────────────────────────────────────────────────────┬────────────────┤
│ ⚔ Fight│ ACTIVITY: Greenhollow › Goblin Brute   9.1s / kill   │ Chat           │
│ 🗺 Zones│ 254 kills/h · 7.1k XP/h · 1.8k gold/h · Win ✔ 3.2×  │ [Global|Online]│
│ 👤 Char ├─────────────────────────────────────────────────────┤                │
│ 🛡 Equip│                                                     │ Bob: gz!       │
│ 🎒 Bag  │                 (current screen)                    │ Kai: boss tips?│
│ 🔨 Craft│                                                     │                │
│ ⚙ Filter│                                                     │                │
│        │                                                     │ [type…]  Send  │
└────────┴─────────────────────────────────────────────────────┴────────────────┘
```

- **Top bar:** name, level and XP bar, gold, Dust, players online, settings/account.
- **Left nav:** icon + label for each screen.
- **Activity strip:** current zone and target, time per kill, rates, and the survival
  margin (time to die ÷ time to kill). Shows **Lose ✖** in red if the build can't beat
  the target (zero gains).
- **Right column:** chat with Global and Online tabs. Collapsible.

## Screens

### Fight (home)

```
┌─────────────────────────────────────────────────────┐
│  Greenhollow — Goblin Brute (Lv 13, Phys, Armored)  │
│                                                     │
│    [ YOU ]                         [ BRUTE ]        │
│    HP ████████░░ 212/257           HP ███░░░ 38/101 │
│    ▸ swing ▓▓▓▓░                   ▸ swing ▓▓░░░    │
│              14     27!     Dodge                   │
│                    -9                               │
├─────────────────────────────────────────────────────┤
│ Kill 9.1 s · Die 29 s · Walk 5 s · Win 3.2×      │
│ Per hour: 254 kills · 7.1k XP · 1.8k gold · 12 drops│
├─────────────────────────────────────────────────────┤
│ Loot log                                            │
│  Rare  Rusted Breastplate of the Bear      kept     │
│  Magic Ratskin Vest                        salvaged │
└─────────────────────────────────────────────────────┘
```

- Two portraits (placeholder icons), HP bars, attack timer bars.
- **Floating numbers:** white = hit, large yellow with "!" = crit, grey "Dodge" = evaded,
  green "+n" = heal, red = damage you take.
- The animation replays the live fights the server settles (combat.md, `sim.ts`): what
  you see is what you get. The per-hour rates below it are expected values.
- Loot log shows kept items (clickable) and salvaged ones (dimmed).

### Zones

A zone is a 2D map of areas (zones.md, "Zone map"). On a phone the area panel sits
under the map (tapping a spot scrolls to it); on a desktop it sits beside the map.

```
[T1 Greenhollow ✔] [T2 Thornwood] [🔒 T3 Frostmaw Pass]
Greenhollow  Lv 1–15
Discovered: areas 2/4 · enemies 3/5 · items 12/33
┌──────────────────────────────┐
│     (?)┄┄┄┄┄┄┄┄┄┄(☠)         │
│     ??? Lv 13    ??? Lv 15   │
│      ┆    ╲                  │
│      ┆     (📍)Old Mill       │
│      ┆    ╱                  │
│  (🌾)Village Fields           │
└──────────────────────────────┘
Old Mill  YOU ARE HERE                          Lv 7–10
  › Goblin Scout  EVEN   Lv 7 · Phys · Balanced …  [Fighting]
  › ???           RISKY  Lv 10                     [ Fight  ]
```

- The map always fits the screen, with no panning (panning fights page scrolling on
  phones and hides spots). Spots are placed on an inset stage, so markers and labels
  never clip; below 380 px wide, markers and labels shrink a little.
- Spots: a glyph for revealed areas, `?` for unrevealed ones (dashed), a pin where the
  character is fighting, a skull for the lair. The picked spot gets a ring. Paths are
  solid between two revealed areas, dashed otherwise.
- Each enemy is a card row: name (??? until known), a threat read against the active
  loadout (Easy / Even / Risky / Deadly), level, damage type, defense, HP, DPS and
  lifetime kills. Tap a row for its rewards and drops; the button fights it at once.
- The boss row says **Challenge** instead of Fight until its first kill.
- Locked zones show a greyed map and what unlocks them ("Defeat Grubnak").

### Character

```
┌──────────────────────────────┬──────────────────────────────┐
│ Primaries                    │ Offense                      │
│  Might     30   (10 lvl+20)  │  Hit        13.8 phys        │
│  Finesse   10                │  Speed      0.93 /s          │
│  Mind      10                │  Crit       5.5% × 150%      │
│  Vitality  33                │  Armor pen  0%               │
├──────────────────────────────┤ Defense                      │
│ Utility                      │  HP 257 · Regen 0/s          │
│  Item find  +0%              │  Armor 40 (45% vs Lv 10)     │
│  Gold find  +0%              │  Resist 6 (11% vs Lv 10)     │
│  XP gain    +0%              │  Evasion 0%                  │
└──────────────────────────────┴──────────────────────────────┘
```

- Hovering a stat shows its breakdown (base, flat sum, % sum, source items).
- Mitigation and evasion percentages are shown against the current target's level.

### Equipment and loadouts

```
┌─────────────────────────────────────────────────────────────┐
│ Loadouts: [1 Set 1 ✔] [2 Set 2] [3 —] [4 —]        ✎ rename   │
│ Profile: [Damage ▾]   [ Auto-equip ]                        │
├─────────────────────────────────────────────────────────────┤
│        [Head]                    [Amulet]                   │
│ [Main] [Chest] [Off]             [Ring 1] [Ring 2]          │
│        [Hands]                                              │
│        [Feet]                                               │
├─────────────────────────────────────────────────────────────┤
│ Totals: Hit 13.8 · HP 257 · Armor 40 · Kill 9.1 s · Die 29 s│
└─────────────────────────────────────────────────────────────┘
```

- Click a slot: a picker opens with bag items that fit, sorted by tier then rarity.
- **Comparison tooltip:** the equipped item and the hovered item side by side, plus how
  the loadout totals (hit, HP, armor, kill time, die time) would change. No per-item
  score.
- **Auto-equip** applies the profile, then shows a summary: items swapped and totals
  before → after (equipment.md).
- Switching loadout settles progress first (one click, no confirm).

### Bag

```
┌─────────────────────────────────────────────────────────────┐
│ Bag 143 / 200  [+25 slots: 50k gold]                        │
│ Sort: [Newest ▾]  Filter: [All slots ▾] [All rarities ▾]    │
├─────────────────────────────────────────────────────────────┤
│ ▢▢▢▢▢▢▢▢▢▢▢▢                                                │
│ ▢▢▢▢▢▢▢▢▢▢▢▢   (icons with rarity-colored borders,         │
│ ▢▢▢▢▢▢▢▢▢▢▢▢    tier number in the corner, 🔒 if locked)    │
├─────────────────────────────────────────────────────────────┤
│ Selected 3   [Salvage → +11 dust]  [Lock] [Craft…]       │
└─────────────────────────────────────────────────────────────┘
```

- **Item tooltip:** name in rarity color, tier, base, implicit stats, then affixes with
  their affix tier (e.g. `+8.4% phys damage  T3`).
- **Lock** protects an item from manual salvage. Locked and loadout items are never
  salvaged.
- Multi-select with shift/ctrl for bulk salvage.

### Crafting

```
┌─────────────────────────────────────────────────────────────┐
│ Item: [Rare Rusted Breastplate ▾]                           │
│ [ Reroll affix ] [ Upgrade rarity ]                         │
├─────────────────────────────────────────────────────────────┤
│ ( ) +18 max HP           T5                                 │
│ (•) +2.1% attack speed   T1   ← reroll this                 │
│                                                             │
│ Cost: 300 gold · 4 dust             [ Reroll ]           │
└─────────────────────────────────────────────────────────────┘
```

- Upgrade tab shows the step (Rare → Epic) and its cost. For Epic → Legendary the
  player picks the affix to remove.
- Costs from crafting.md; buttons disabled with the reason when unaffordable.

### Loot filter

- Rarity threshold dropdown: "Keep Rare and above".
- Affix whitelist: searchable checkbox list of affixes ("+crit chance", "+item find", …).
- Preview from the last session: "Last 8 h: 95 drops, 12 kept, 83 salvaged (+210
  dust)".

### Away report

Shown once on login after offline time.

```
┌──────────────── While you were away (7h 42m) ───────────────┐
│ Goblin Brute × 1,812 kills                                  │
│ +128,400 XP   Level 14 → 16                                 │
│ +12,700 gold   +210 dust                                 │
│ Items kept (12):  1× Epic, 11× Rare      [View in bag]     │
│ Salvaged: 57 Common, 26 Magic                               │
│ ⚠ Bag is full: 4 items were salvaged                         │
│                                                  [ OK ]     │
└─────────────────────────────────────────────────────────────┘
```

- If away longer than the cap: "Offline progress is capped at 8 h".
- A defeat shows "Goblin Brute killed you. You spent the last 7h 52m idle", so the
  wasted time isn't a mystery. Defeats while playing get their own "Defeated" popup.

### Account and settings

- Guest players see a persistent "Save your progress: log in" button (guest linking
  already exists).
- Settings: number format (1,234 / 1.2k), floating numbers on/off, log out.

## Open

- Mobile layout (later): left nav becomes a bottom tab bar, chat becomes a tab.
- Whether the comparison tooltip should also show per-stat differences.
