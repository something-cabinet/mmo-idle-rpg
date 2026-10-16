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
| 1 | Mining | Gathering | Ore, chance of Gem | — |
| 2 | Woodcutting | Gathering | Wood | — |
| 3 | Foraging | Gathering | Reagent | — |
| 4 | Fishing | Gathering | Fish (new material kind) | — |
| 11 | Smithing | Production | Gear bases of your choice, tool upgrades, tempering, smelting | Ore, Metal, Wood, Hide, Cloth, Gem, scrap |
| 12 | Alchemy | Production | Elixirs | Reagent, Core |
| 13 | Cooking | Production | Meals | Fish, Reagent |
| 14 | Enchanting | Production | Essences | Core, Gem, Dust |
| 15 | Construction | Production | Hideout station levels | Wood, Metal, Gem, gold |

- **PERMANENT IDS:** skill IDs are stored in rows; never reuse or renumber them.
- Smithing covers all gear (metal, leather, cloth, wood, jewelry) for now. It can split
  into Tailoring and Leatherworking later.
- **Hide, Cloth and Core stay combat-only**, so the choice of target still matters for
  crafters and the two activities feed each other.
- **Fish** is material kind 8 (IDs 801, 802, 803; material IDs are `kind × 100 + tier`,
  data/materials.ts): T1 Pond Perch, T2 Bog Eel, T3 Icefin Trout.
- **Ore** is material kind 9 (IDs 901, 902, 903 …): T1 Copper Ore, T2 Bog Iron Ore, T3
  Dwarven Steel Ore. Only Mining gives it, and only Smithing uses it (smelted into Metal,
  below). Combat still drops Metal (bars) directly.

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

### Yield perks

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
- Mining gives **only Ore**, never Metal. Ore has to be smelted (Smithing) before use.
- Counts go into the existing `material` counters.

### Rare finds

Each gathering skill rolls a rare find per action, on top of its material. Rare finds are
what only that skill gives, and each feeds something different. Numbers are illustrative.

| Skill | Find | Tier | Chance per action | Use |
|-|-|-|-|-|
| Mining | **Relic** (old coins, idols, tablets) | Tier of the node | 2% | Sold on the spot for gold |
| Mining | **Ancient Meteor Fragment** | Untiered | 0.1% × node tier | None yet (kept for a later sink) |
| Woodcutting | **Dryad's Tear** (amber sap of the oldest trees) | Untiered | 0.1% × node tier | Smithing: an empowered forge |
| Foraging | **Rare herb** (Bloodcap, Wraithbloom, Rimepetal …) | Tier of the node | 1% | Alchemy: Greater elixirs |

- Materials: rare herbs are kind 10 (`1000 + tier`), Meteor Fragment kind 11 and Dryad's
  Tear kind 12, both untiered (tier 0: IDs 1100 and 1200). Relics are never stored.

- **Level raises the chance:** `× (1 + level / 99)`, so double at 99. Gathering levels
  pay off on top of the double yield.
- **Untiered finds come faster from higher nodes** (`0.1% × T`: 0.3 per hour at T1,
  2.7 per hour at T9 at base speed), so moving up a tier is worth it even for them.
- All rolls are per action, like the Gem roll: seeded online, one Poisson draw each at the
  login settle. Closed form stays intact.

#### Mining: Relics (gold)

- A Relic is never stored: it's converted to gold when found, worth **0.15 h of farming
  gold at its tier** (`craftCost`). The away report and the gathering log show the gold.
- At level 50 (3% per action, ~9 per hour) that is ~1.35 h of farming gold per hour of
  Mining, on top of the Ore. Mining is the gathering skill that makes gold.

#### Woodcutting: Dryad's Tear (empowered forge)

- A forge (Smithing) can spend **1 Dryad's Tear** on top of its normal cost. The item is
  **at least Magic** (a Common roll becomes Magic) and **its first affix rolls at the max
  tier** (the item's tier N). The Rare chance is unchanged.
- Untiered, so a Tear saved from a low node still works on a top-tier forge. Its rarity is
  the limit, not its tier.
- The empowered forge is its own recipe (the forge's "Dryad's Tear" toggle, off by
  default): the Tear is one more input, so the queue ends when Tears run out and keep
  inputs can save one. The forge keep rule still applies.

#### Foraging: Greater elixirs

- **Greater** variant of each elixir: the normal recipe + **1 rare herb** of tier T. Its
  bonus is **1.5× the normal one** (Wrath ×1.3, Haste ×1.225, Wisdom ×1.3 …), same
  240 charges, same tier rule.
- This breaks the ×1.10–×1.25 farming buff guideline on purpose: Greater elixirs are the
  wall-pushers, limited by herb supply (~3 per hour of Foraging at level 1, ~6 at 99).

### Special nodes

Skill levels unlock special nodes: other targets inside a tier that trade the main
material for a focus. The player picks one like a recipe (skill, tier, node), so a
gathering level unlocks choices, not just speed.

| Skill | Node | Unlock | Trade-off |
|-|-|-|-|
| Mining | **Gem Pocket** | Level 30 | No Ore; Gem chance 5% → 20% |
| Mining | **Ruins Dig Site** | Level 60 | Half the Ore; Relic chance ×3 (gold) |
| Woodcutting | **Ancient Grove** | Level 60 | Half the Wood; Dryad's Tear chance ×3 |
| Foraging | **Shaded Glade** | Level 30 | Half the Reagent; rare herb chance ×3 |

- A node at tier T needs both its unlock level and the tier's normal requirement
  (level `10·(T−1) + 1`, zone T).
- Same action time, skill XP and character XP as the normal node. Double yield applies to
  the main material only; the level multiplier on rare finds applies on top of ×3.
- "Half the material" is a 50% chance per action of the material, so settlement stays a
  Poisson draw per output, like the rest.
- Other rare finds still roll at their normal chance on a special node (a Ruins Dig Site
  still drops Meteor Fragments).
- **PERMANENT IDS:** node IDs are stored in `activityRecipe` (gathering:
  `node × 100 + tier`, node 0 = the normal node); never reuse or renumber them.

## Tools

One tool per gathering skill: **Pickaxe** (Mining), **Hatchet** (Woodcutting),
**Sickle** (Foraging), **Rod** (Fishing).

- Tools are a **tier per character per kind** (`tool` rows), not bag items. They're
  cheap to store and can't be dropped or salvaged. Every character starts with T1 tools.
- **Tools only speed gathering up; they never gate it.** Gathering tier T needs only the
  skill level and the zone.
- **+10% gathering speed per tool tier above T1** (T3: +20%), whatever tier is gathered.
  An old tool never slows gathering.
- Upgrading a tool to tier T is a Smithing recipe: 100 Metal + 50 Wood of tier T−1 (so it
  can be made before farming tier T), 30 min.
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
- Forged items follow the normal bag limit. A full bag refuses the queue to start.
- **Keep rule** (separate from the loot filter): a minimum rarity (Common, Magic or Rare),
  a minimum affix tier and an affix list. Forged bases that fail it are salvaged into Dust
  and gold like filtered drops and take no bag slot, so a big queue can fish for one roll.
  No rule keeps everything.

### Smithing: temper an item

Forging alone gives Smithing nothing useful to do once the player has the bases they
want. Tempering is the steady goal: it makes gear the player already owns better.

- **Each temper level adds +2% to the item's base stats and implicits** (weapon hit,
  armor, evasion rating, resistance, the base's trait). Affixes, legendary affixes and
  unique effects are not changed.
- The bonus is a multiplier on the base part, `× (1 + 0.02 × temper)`, applied when stats
  are computed and rounded once like any other stat (attributes.md). The item stores only
  its `temper` level (0–10), so the original values stay intact.
- **10 temper levels. The max depends on Smithing level:** +1 per 10 levels (+1 at 10 …
  +9 at 90) and +10 at 99 (+20%). The item's tier needs no Smithing level, only an
  unlocked zone of that tier.
- **Each step is instant** on a bag or equipped item, from the Smithing page or the
  crafting workshop. It doesn't stop what the character is doing. Going from `k−1` to `k`
  costs:

| | Cost for step k on a tier-T item |
|-|-|
| Main material of the base family (table above), tier T | `10 × k` |
| Gold | `0.05 × k` hours of farming (`craftCost`) |
| Smithing XP gained | that of `3 × k` min of work (and as much character XP) |

- Full +0 → +10 on one item: 550 material, ~2.75 h of farming gold, the XP of 2.75 h of
  Smithing. Ten slots per tier is ~27 h worth of Smithing XP, a long-term XP source. Early
  steps are cheap, so every item is worth a few levels; the last ones are the goal.
- The name shows the level (`Wolfhide Cap +3`) and the tooltip marks the tempered
  stats. Salvaging a tempered item gives nothing extra: the temper is lost.
- Balance note: +20% weapon hit is close to +20% attack DPS, like a permanent Wrath
  elixir. If it turns out too strong, lower the per-level value or the cap, not the
  cost.

### Smithing: smelting

Smelting is Smithing's steady XP recipe: nothing it makes is thrown away. It has two
inputs, Ore from Mining and scrap from combat.

#### Ore into bars

- **1 Ore → 1 Metal of the same tier, 12 s per action** (300 per hour at base speed,
  the same pace as Mining). Tier T needs Smithing level `10·(T−1) + 1`, like any recipe.
- Normal skill XP for tier T, and as much character XP. The usual perks apply (speed
  per level, keep inputs from level 50).
- Mining and Smithing level together: an hour of Mining feeds an hour of smelting. 300
  Metal from Ore takes 2 h in total (Mining, then smelting): 150 per hour, still about
  twice combat's ~70, and the second hour is Smithing XP, not waste.
- Forging stays the way to pick a base; smelting is the cheap XP. A player leveling
  Smithing mines, smelts, then spends the bars on tools, forging and tempering.

#### Scrap into materials

Scrap turns unwanted drops into materials and Smithing XP instead of Dust and gold.

- **Scrap instead of salvage.** The loot filter (and the forge keep rule) gets a choice
  for items it rejects: **Salvage** (Dust and gold, as now) or **Scrap**. Scrapped items
  take no bag slot; they go into scrap counters and **give no Dust or gold**. Bag items
  can be scrapped by hand too.
- An item's scrap kind is its base family's main material (table above), except rings
  and amulets, which give Metal (Gems stay scarce).
- **Smelting scrap** is a production recipe per (kind, tier): 1 scrap → materials of that kind
  and tier, **30 s** per action, with the normal skill XP for tier T.

| Item rarity | Materials per smelt |
|-|-|
| Common | 2 |
| Magic | 3 |
| Rare | 5 |
| Epic | 15 |
| Legendary | 40 |

- Rarity is kept in the scrap counter (kind, tier, rarity), so higher-rarity scrap
  smelts first.
- At 2–3 per 30 s, scrap smelting yields about what gathering does (300 per hour), but
  across every kind, Hide and Cloth included. Those still come only from combat drops,
  so the "Hide, Cloth and Core stay combat-only" rule holds.
- Supply: an 8 h session drops ~218 items and a keep-Rare+ filter rejects ~190 of them
  (zones.md), which is ~1.6 h of smelting. Smelting can't replace gathering or
  outpace combat.
- Trade-off: the player gives up Dust and gold (the crafting currencies) for materials
  and Smithing XP. Players saving for rerolls keep salvaging; players leveling Smithing
  or short on Hide or Cloth scrap.

### Smithing: level rewards

Smithing level improves the work in three ways:

| Level effect | What it does |
|-|-|
| Forge rarity | 20% Magic + 0.5% per level above the requirement, 2% Rare |
| Keep inputs | 5% from level 50, 10% at 99: an action uses no inputs (production's version of double yield) |
| Temper cap | +1 per 10 levels, +10 at 99 (above) |

### Enchanting: Essences

- **Essence of <stat>**, tier T: 2 Core + 1 Gem of tier T + Dust worth 0.25 h of
  farming (`0.25 × 15 × 2.9^(T−1)`). Takes **15 min**.
- **Enchanting level gates the Essence tier, not the stat.** Making *or using* a tier-T
  Essence needs level `10·(T−1) + 1` (the general tier rule). Using it is gated too
  because Essences can also drop from enemies (below), so a high-tier drop still needs the
  skill to apply.
- **Craftable stats:** every craftable stat is available from level 1. The rare stats
  **lifesteal, item find and gold find** have no Essence recipe; their Essences only drop.
- Using an Essence is a normal reroll (crafting.md) that **guarantees the stat**. It
  still pays the normal reroll gold and Dust.
- **Level raises the affix tier floor.** The forced affix rolls its tier in `[floor, N]`
  (N = item tier), with `floor = 1 + floor(level / 20)` capped at N: tier 1 below level
  20, up to tier 5 from level 80. **A tier-T Essence works on items of tier ≤ T**, so
  higher-tier gear needs a higher Enchanting level.
- **Essence drops (planned):** enemies rarely drop Essences of their zone's tier, for any
  stat including the rare ones. They are stored with crafted ones and follow the same
  rules for use.
- **Rare Essences (planned, drop-only):** stronger variants with an extra effect on top
  of the guaranteed stat. One example: a higher affix tier floor such as "tier 8 or
  higher" (the higher of this and the level floor applies). Other effects and the exact
  list are still to be designed.

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
  skill level-up, the same way `project()` handles character level-ups. Online, each
  action rolls its Gem and double yield, seeded by its end time, so the client shows
  each action's exact yield as it ends and the server settles only on its minute timer.
  The login settle (time away) draws them in one Poisson draw each.
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
| `item` column | `temper` (0–10) |
| `scrap` table | (characterId, kind, tier, rarity, count): items scrapped for smelting |
| `character` columns | `activitySkill` (0 = combat), `activityRecipe` (gathering: `node × 100 + tier`, node 0 = normal; production: the recipe ID), `activityCountLeft`, `elixirId`, `elixirKillsLeft`, `elixirAutoRenew`; later `mealId`, `mealKillsLeft`, `mealAutoRenew` |
| `skill` table | (characterId, skillId, level, xp) |
| `tool` table | (characterId, skillId, tier) |
| `station` table | (characterId, stationId, level) (phase 2) |
| `supply` table | (characterId, supplyId, count): elixirs; later meals, essences, parts |
| `material` | Fish is new material kind 8, Ore kind 9, rare herbs 10, Meteor Fragment 11 and Dryad's Tear 12 (untiered) |
| `data/skills.ts` | Skills, levels, speeds, permanent skill IDs |
| `data/recipes.ts` | Production recipes. IDs: forge = baseId × 10 + tier, empowered forge = 30000 + baseId × 10 + tier, tool = 1000 + skill × 10 + tier, elixir = its supply ID; temper and smelt are proposed, IDs TBD |
| `data/supplies.ts` | Elixirs and their buffs. Permanent supply IDs: elixirs 100 + kind × 10 + tier, Greater elixirs 200 + kind × 10 + tier |
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

- Whether uniques can be tempered (only their base part would change; uniques can't be
  crafted today).
- Whether temper should carry over when an item is replaced (e.g. transfer at a cost).
- Whether item find (or a new "gathering find" stat) should raise gathering yield.
- Whether forged bases should be marked as forged (inspect flair, or excluded from
  future leaderboards).
- A use for Ancient Meteor Fragments (Mining's untiered rare find).
- Fishing's rare finds (pearls, sunken chests) when Fishing is built.
- Recipe and buff numbers need a pass against real play data.
