# UI and layout

Desktop first, mostly text and icons, placeholder art. Only the fight view animates.

## Principles

- **Numbers are the content.** Show kill time, survival, rates and item stats clearly;
  this is how players make decisions in a stat-check game.
- **Always show progress.** The current activity (target, rates, XP bar) is visible on
  every screen.
- **No upgrade scores on items** (equipment.md). Comparisons show both items and how the
  character's totals would change, never a single "better/worse" number.
- **Placeholders:** icons from an icon set (e.g. game-icons.net, CC BY 3.0) or simple
  glyphs; replaceable later without layout changes.
- **Dark theme** by default.

### Rarity colors

| Common | Magic | Rare | Epic | Legendary | Unique |
|---|---|---|---|---|---|
| Grey | Blue | Yellow | Purple | Orange | Gold-brown |

Used for item names, icon borders and loot log lines.

## Frame

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ ⚔ Aria  Lv 14 [██████████░░░░ 62%]   ● 1,234 gold   ◆ 87 essence   👥 312  ⚙ │  top bar
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

- **Top bar:** name, level and XP bar, gold, Essence, players online, settings/account.
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
│ Kill 9.1 s · Die 29 s · Respawn 5 s · Win 3.2×      │
│ Per hour: 254 kills · 7.1k XP · 1.8k gold · 12 drops│
├─────────────────────────────────────────────────────┤
│ Loot log                                            │
│  Rare  Copper Breastplate of the Bear      kept     │
│  Magic Rawhide Vest                        salvaged │
└─────────────────────────────────────────────────────┘
```

- Two portraits (placeholder icons), HP bars, attack timer bars.
- **Floating numbers:** white = hit, large yellow with "!" = crit, grey "Dodge" = evaded,
  green "+n" = heal, red = damage you take.
- The animation uses the client's seeded random generator and is presentation only
  (combat.md); the stat lines below it are the real expected values.
- Loot log shows kept items (clickable) and salvaged ones (dimmed).

### Zones

```
┌─────────────────────────────────────────────────────────────────┐
│ [T1 Greenhollow ✔] [T2 Thornwood] [T3 🔒] …                      │
├─────────────────────────────────────────────────────────────────┤
│ Enemy           Lv  Type  Def   Result      XP/h   Gold/h  Drops│
│ Field Rat        1  Phys  Bal   Win 31×     3.1k   780     7 ▸  │
│ Wild Boar        4  Phys  Arm   Win 9.0×    3.8k   1.1k    7 ▸  │
│ Goblin Scout     7  Phys  Bal   Win 5.2×    4.4k   1.3k    6 ▸  │
│ Bog Wisp        10  Magic War   Win 1.8×    5.0k   1.4k    6 ▸  │
│ Goblin Brute    13  Phys  Arm   Lose ✖      —      —       6 ▸  │
│ ★ Grubnak       15  Phys  Bal   Lose ✖                [Challenge]│
├─────────────────────────────────────────────────────────────────┤
│ Selected: Bog Wisp — drops: Gnarled Fire Staff, Worn Tome, …    │
│                                              [ Fight this ]     │
└─────────────────────────────────────────────────────────────────┘
```

- Every row runs the real formulas against the **current loadout**: Win/Lose with the
  survival margin, and the rates the player would get.
- **Drops ▸** expands the enemy's base list (for target farming).
- Locked zones show what unlocks them ("Defeat Grubnak").
- The boss row has **Challenge** instead of Fight until first kill.

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
│ Selected 3   [Salvage → +11 essence]  [Lock] [Craft…]       │
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
│ Item: [Rare Copper Breastplate ▾]                           │
│ [ Reroll affix ] [ Upgrade rarity ]                         │
├─────────────────────────────────────────────────────────────┤
│ ( ) +18 max HP           T5                                 │
│ (•) +2.1% attack speed   T1   ← reroll this                 │
│                                                             │
│ Cost: 600 gold · 8 essence             [ Reroll ]           │
└─────────────────────────────────────────────────────────────┘
```

- Upgrade tab shows the step (Rare → Epic) and its cost. For Epic → Legendary the
  player picks the affix to remove.
- Costs from crafting.md; buttons disabled with the reason when unaffordable.

### Loot filter

- Rarity threshold dropdown: "Keep Rare and above".
- Affix whitelist: searchable checkbox list of affixes ("+crit chance", "+item find", …).
- Preview from the last session: "Last 8 h: 95 drops, 12 kept, 83 salvaged (+210
  essence)".

### Away report

Shown once on login after offline time.

```
┌──────────────── While you were away (7h 42m) ───────────────┐
│ Goblin Brute × 1,812 kills                                  │
│ +128,400 XP   Level 14 → 16                                 │
│ +12,700 gold   +210 essence                                 │
│ Items kept (12):  Rare Copper Greaves …   [View in bag]     │
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
