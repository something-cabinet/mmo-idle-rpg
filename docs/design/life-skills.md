# Life skills

Non-combat skills with their own XP and levels: gathering (Mining, Woodcutting,
Foraging, Fishing) and production (Smithing, Alchemy, Cooking, Enchanting,
Construction). Numbers are *illustrative* until balanced.

## Core rule: fight or skill

- The character does **one activity** at a time: `Combat(target)` or
  `Skill(skill, recipe)`. Like most MMOs, never both.
- Switching is an online action (like `setTarget`) and settles first. The chosen
  activity runs online and offline, under the same offline cap.
- Skilling gives skill XP and as much character XP (per action, the same amount; about a
  fifth of farming's XP per hour), but no gold or item drops. Combat gives no skill XP.
- Every hour spent skilling is an hour of combat lost, so each skill must pay for itself
  with something combat **can't** give, or gives too slowly (see "Why skill").

## Why skill

| Reason | Skills | What combat can't do |
|-|-|-|
| Push walls | Alchemy, Cooking | Buffs that turn an unviable target or boss into a viable one (viability is all or nothing, so +20% can be worth far more than 20%) |
| Beat RNG | Smithing, Enchanting | Pick the base you want; force the stat you want on a reroll |
| Focused materials | Gathering | ~4× combat's rate for one kind, and Fish only comes from Fishing |
| Permanent progress | Construction, milestones | Longer offline cap, faster skilling, small permanent combat bonuses |

**Buff break-even.** Spending a share *f* of play time making a buff worth *+b* pays
off when `b > f / (1 − f)`. At the rates below, a full chain (forage, then brew) is
~14% of play time (break-even +16%), so a +20% elixir is a small net gain on its own. The big gain is
pushing a target or boss into viability.

## Skills

| ID | Skill | Type | Makes | Inputs |
|-|-|-|-|-|
| 1 | Mining | Gathering | Metal, chance of Gem | — |
| 2 | Woodcutting | Gathering | Wood | — |
| 3 | Foraging | Gathering | Reagent | — |
| 4 | Fishing | Gathering | Fish (new material kind) | — |
| 11 | Smithing | Production | Gear bases of your choice, tool upgrades | Metal, Wood, Hide, Cloth, Gem |
| 12 | Alchemy | Production | Elixirs | Reagent, Core |
| 13 | Cooking | Production | Meals | Fish, Reagent |
| 14 | Enchanting | Production | Essences | Core, Gem, Dust |
| 15 | Construction | Production | Hideout station levels | Wood, Metal, Gem, gold |

- **PERMANENT IDS:** skill IDs are stored in rows; never reuse or renumber them.
- Smithing covers all gear (metal, leather, cloth, wood, jewelry) for now. It can split
  into Tailoring and Leatherworking later.
- **Hide, Cloth and Core stay combat-only**, so the choice of target still matters for
  crafters and the two activities feed each other.
- **Fish** is material kind 8 (8th in `MATERIAL_KINDS`, IDs 18, 28, 38):
  T1 Pond Perch, T2 Bog Eel, T3 Icefin Trout.

## Levels and gating

- Levels 1–99 per skill, separate from character level.
- `skillXpToNext(L) = round(100 × 1.115^L)`.
- Working at tier T gives `600 × 2.9^(T−1)` skill XP per hour at base speed (the
  same ×2.9 per tier as combat rewards), so old tiers level slowly.
- **Tier T needs skill level `10·(T−1) + 1` and zone T unlocked.** Life skills can't
  run ahead of combat.
- Pace at the highest allowed tier: ~3 h to level 11, ~17 h to 51, ~28 h to 81
  (T9), ~40 h to 99. Maxing all 9 skills is ~360 h, against ~5 weeks for character
  level 90.

### Speed and yield perks

- **+1% action speed per level above the recipe's requirement**, cap +20%.
- **Double yield** (gathering) or **keep inputs** (production): 5% at level 50, 10% at
  level 99.
- Gathering also gets the tool bonus, and production gets its Hideout station bonus.

### Milestone bonuses (permanent, apply in combat)

Each skill grants a small combat bonus at levels 25, 50, 75 and 99 (+0.5%, +0.5%,
+0.5%, +1.5%, so +3% at 99). The bonus applies everywhere, so time spent skilling
also builds the fighter, but no single skill is required.

| Skill | Stat |
|-|-|
| Mining | Armor % |
| Woodcutting | Max life % |
| Foraging | Item find % |
| Fishing | Gold find % |
| Smithing | Physical damage % |
| Alchemy | XP gain % |
| Cooking | Resistance % |
| Enchanting | Magic damage % |
| Construction | Evasion rating % |

Total skill level (sum of all skills) is shown on inspect and the friends list.
Reaching 99 gives a title.

## Gathering

- One action every **12 s**, yielding 1 material of the chosen tier: **300 per hour**,
  against ~70 per hour of one kind from combat (zones.md). Gathering is focused and
  combat is spread out.
- Mining also rolls **5% per action for a Gem** (~15 per hour, close to the ~12 per hour
  from gem-dropping enemies).
- Counts go into the existing `material` counters.

## Tools

One tool per gathering skill: **Pickaxe** (Mining), **Hatchet** (Woodcutting),
**Sickle** (Foraging), **Rod** (Fishing).

- Tools are a **tier per character per kind** (`tool` rows), not bag items. They're
  cheap to store and can't be dropped or salvaged. Every character starts with T1 tools.
- **Gathering tier T needs a tool of tier ≥ T.** This makes Smithing part of the
  gathering chain, like a pickaxe gating ore in OSRS.
- **+5% gathering speed per tool tier above the material tier**, cap +20%.
- Upgrading a tool to tier T is a Smithing recipe: 100 Metal + 50 Wood of tier T,
  30 min.
- A tool only counts while its skill is active. It has no effect in combat.

## Production

Production runs a **queue**: one recipe, repeated until a chosen count is reached or the
inputs run out. **When the queue ends, the character falls back to its last combat
target**, so an empty queue never wastes offline time.

### Alchemy: Elixirs (combat buffs)

| Elixir | Kind | Effect |
|-|-|-|
| Wrath | Power | ×1.2 damage |
| Haste | Power | ×1.15 attack speed |
| Wisdom | Profit | ×1.2 XP |
| Greed | Profit | ×1.2 gold |
| Fortune | Profit | ×1.2 item find |

- Power and profit elixirs share **one slot**, so the player chooses between pushing
  harder targets and farming more comfortably.
- Each elixir lasts **240 kills** (~1 h of reference farming, zones.md). Recipe:
  10 Reagent + 1 Core of tier T, **7.5 min** (8 per hour of Alchemy).
- A tier-T elixir has its full effect in zones of tier ≤ T and half effect above.
- A chain example: 1 h of Foraging (300 Reagent) feeds ~3.75 h of Alchemy, which makes
  30 elixirs, or ~30 h of buffed farming. With combat's Reagent drops added, foraging is optional,
  not required.

### Cooking: Meals (survival buffs)

| Meal | Effect |
|-|-|
| Hearty Stew | ×1.2 max life |
| Ironskin Roast | ×1.2 armor and evasion rating |
| Spiced Fillet | ×1.2 resistance |

- Same structure as elixirs: 10 Fish + 2 Reagent of tier T, 7.5 min, 240 kills,
  full effect in zones of tier ≤ T.
- Meals are the main tool for wall tiers and first boss kills.

### Buff rules

- **One elixir and one meal active at a time.** Switching to a different recipe
  discards what is left of the active one.
- **Buffs last a number of kills, not time.** Each kill uses one charge. A buff is
  never used up by walking, losing fights, stalemates or skilling.
- Why kills: settlement already stops at kill counts (level-ups), so a buff end is one
  more `min()` offline. Online, the buff active at the start of a fight applies to the
  whole fight, so stats never change mid-fight. Both modes use the same rule and don't
  drift apart.
- **Separate "more" multiplier**, applied after all gear (`× 1.2`), not added to the
  gear's % stats. "+20%" means the same with any gear, which makes buffs easy to show and
  balance. Keep farming buffs within ×1.10–×1.25, because they compound with gear.
- **Auto-renew** (per slot, on by default): when a buff runs out, the next one of the
  same recipe is taken from stock. When stock runs out, the slot stays empty. Typical
  bedtime routine: stock ~2,000 kills of elixirs and meals (~8 h), then log off.
- Boss challenges and raids use the active buffs. No boss-only consumables.
- UI: two buff icons in the top bar with charges and stock (`Wrath 180 · ×12`). Hovering
  shows the tier rule. The Zones screen previews fights with and without buffs ("viable
  with Hearty Stew"). The away report lists buffs used and when a slot ran empty.

### Smithing: forge a base

- Pick any base of tier T (zone T unlocked). It costs **30 of the base's main material
  + 10 of its secondary**, takes **2 min**, and gives the item in the bag.

| Base family | Main | Secondary |
|-|-|-|
| Metal weapons, plate, shields | Metal | Wood |
| Bows, staves, wands | Wood | Metal |
| Leather armor | Hide | Cloth |
| Cloth armor, tomes | Cloth | Hide |
| Rings, amulets | Gem (5) | Metal |

- Rarity: Common, with **20% Magic + 0.5% per level above the requirement** and a
  **2% Rare** chance. Never higher: the value is the base you choose, not the rolls.
  Players finish the item with the usual gold and Dust crafting (crafting.md).
- **Masterwork**: rolled affixes on a forged item have a minimum tier of
  `1 + floor((level − requirement) / 20)` (capped at the item tier).
- Forged items follow the normal bag limit. A full bag refuses the queue to start.
- **Keep rule** (separate from the loot filter): a minimum rarity (Common, Magic or Rare),
  a minimum affix tier and an affix list. Forged bases that fail it are salvaged into Dust
  and gold like filtered drops and take no bag slot, so a big queue can fish for one roll.
  No rule keeps everything.

### Enchanting: Essences

- **Essence of <stat>**, tier T: 2 Core + 1 Gem of tier T + Dust worth 0.25 h of
  farming (`0.25 × 15 × 2.9^(T−1)`). Takes **15 min**.
- Using an Essence is a reroll (crafting.md) where the new affix is **forced to that
  stat**. It still pays the normal reroll gold and Dust. It works on items of tier ≤ T.
- The forced affix rolls its tier in `[floor, N]`, with `floor = 1 + floor(level / 20)`
  capped at N.
- Which stats are unlocked depends on Enchanting level (rollable affix stats only):

| Level | Stats |
|-|-|
| 1 | Primaries (Might, Finesse, Mind, Vitality) |
| 20 | Life and defense (flat and % life, armor, resistance, evasion, regen) |
| 40 | Flat damage and heal, threat |
| 60 | % damage and heal, attack speed, crit chance, crit damage |
| 80 | Penetration, lifesteal, item find, gold find, XP gain |

- Core is combat-only and scarce (~24 per hour from magical enemies), which limits
  Essences. That is intended: they are the strongest crafting tool.

### Construction: Hideout

Construction makes building parts (**Beams** from Wood, **Brackets** from Metal: 20 of tier
T each, 10 min). Upgrading a station to level L consumes tier-L parts and gold, and needs
Construction level `10·(L−1) + 1`.

| Station | Per level (max 9) |
|-|-|
| Forge | +5% Smithing speed |
| Alchemy Lab | +5% Alchemy speed |
| Kitchen | +5% Cooking speed |
| Enchanting Table | +5% Enchanting speed |
| Bedroom | +1 h offline cap at levels 3, 6 and 9 (stacks with Seasoned) |

- Station level L costs 20 Beams + 20 Brackets of tier L, + 2 Gems of tier L from level
  5, + gold worth `2 × L` hours of farming (`craftCost`).
- Upgrading a station is instant. Making the parts is what takes time and gives XP.

## Settlement

All of this stays in closed form (README pillar 1):

- **Gathering**: whole actions in the elapsed time. The speed is recomputed at each
  skill level-up, the same way `project()` handles character level-ups. Gem rolls and
  double yields are Poisson draws, seeded like drops.
- **Production**: `min(time / actionTime, inputs available, count left)`. When the queue
  ends, the remaining time settles as combat against the last target.
- **Combat with buffs**: each step of `project()` already caps kills at the next
  level-up; it also caps them at the charges left on each buff. At that point the matchup is recomputed (next buff from stock, or none),
  the same as at a level-up. `simulate()` checks buffs at the start of each fight and
  takes a charge on each kill.
- The away report and the settle log show skill XP, levels and items made.

## Data (sketch)

| Where | What |
|-|-|
| `character` columns | `activitySkill` (0 = combat), `activityRecipe` (gathering: the tier; production: the recipe ID), `activityCountLeft`, `elixirId`, `elixirKillsLeft`, `elixirAutoRenew`; later `mealId`, `mealKillsLeft`, `mealAutoRenew` |
| `skill` table | (characterId, skillId, level, xp) |
| `tool` table | (characterId, skillId, tier) |
| `station` table | (characterId, stationId, level) (phase 2) |
| `supply` table | (characterId, supplyId, count): elixirs; later meals, essences, parts |
| `material` | Fish is new material kind 8 |
| `data/skills.ts` | Skills, levels, speeds, permanent skill IDs |
| `data/recipes.ts` | Production recipes. IDs: forge = baseId × 10 + tier, tool = 1000 + skill × 10 + tier, elixir = its supply ID |
| `data/supplies.ts` | Elixirs and their buffs. Permanent supply IDs: elixirs 100 + kind × 10 + tier |
| `gather.ts`, `produce.ts` | Closed-form settlement, shared with the client |

## Rollout

1. **Phase 1 (built):** activity switch, `skill` table, Foraging + Alchemy (fastest combat
   value), Mining + Smithing (forge bases, tools), Woodcutting (tools need Wood).
2. **Phase 2:** Enchanting, Construction and Hideout, milestone bonuses.
3. **Phase 3:** Fishing + Cooking (Fish material).

What is left, phase 1 leftovers included, is tracked in [TODO.md](../../TODO.md) under
"Life skills".

### How phase 1 is built

- **Production** settles action by action (a few per hour), so each action uses the skill
  level it starts at. Keep-inputs rolls are seeded by the action's end time, so one settle
  and many settles give the same result.
- **Character XP**: production gives as much character XP as skill XP, like gathering.
- **Tool upgrades** go one tier at a time (tier T needs a tier T−1 tool), with a queue of one.
- **Bag**: forging stops when the bag is full, the same as running out of inputs.
- **Fortune** counts only for the kills made with it: drops use the item find averaged over
  the settle's buffed and unbuffed kills (drops scale linearly with item find).
- **Away report**: when a queue ends while offline, the login logs two settles (the queue,
  then combat) and the report shows both.

## Open

- Whether item find (or a new "gathering find" stat) should raise gathering yield.
- Whether forged bases should be marked as forged (inspect flair, or excluded from
  future leaderboards).
- A second gathering yield per skill (e.g. rare Woodcutting drops) once Core-like
  scarcity is needed elsewhere.
- Recipe and buff numbers need a pass against real play data.
