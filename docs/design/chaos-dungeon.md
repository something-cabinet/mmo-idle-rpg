# The Chaos Dungeon (weekly roguelike)

*Brainstorm, not built.* A solo roguelike run through **5 floors**. You lock your gear in,
pick a path through each floor's map of fights, shops and events, collect **boons**
(run-long buffs) and **Ethereal** gear that exists only inside the dungeon, and finish each
floor with a boss. The rewards are big and paid **once a week**. After that, runs are just
for fun. Numbers are *illustrative*.

Next to the other endgame modes:

| Mode | Asks | Rewards |
|---|---|---|
| Raids | A party, a role, the active loadout | Daily, items + tokens |
| The Moonwell Deep (abyss.md) | How far one fixed build goes | First clear per depth, leaderboard |
| **Chaos Dungeon** | Decisions: path, boons, gear swaps, risk | **Weekly**, resources only |

It's the only mode where the player makes choices *during* the content. Everywhere else the
build is set before the fight. That gives an auto-combat game an active, replayable break
from idling, without breaking the idle pillar: nothing in here is ever settled offline.

## Name

Working name **The Chaos Dungeon**. Possible lore: a rift where pieces of every zone collide
and shift each week, with echoes of old enemies inside, and gear made of rift-stuff that
falls apart when you leave.

| Option | Feel |
|---|---|
| **The Chaos Dungeon** | Plain and clear, what the player calls it anyway |
| The Shifting Rift | Lore-friendly, fits "a new layout every week" |
| The Unmade Halls | Grim, a bit grander |
| The Kaleidoscope Vault | Playful, fits the wild gear |

## Rules at a glance

- **Unlocks** once the character has killed the **T2 boss**, so it's open before the raids.
- **Solo and online only**: never settled offline, never a farming target. **Farming
  continues** during a run, with the active loadout.
- **A run is 5 floors.** Each floor is a small branching map: ~6 rows of nodes (battles,
  Elites, shops, events, rests), then the **floor boss**.
- **Gear is locked in at the start.** You pick one of your 4 loadouts. Its items are
  **copied** into the run and can't change for the rest of it. You can still swap in
  **Ethereal** items found in the run (see "Gear").
- **HP carries over** between nodes. Dying ends the run.
- **Rewards are weekly.** Each floor cleared pays once per week (Monday 00:00 UTC).
  Later runs that week pay nothing new until they beat your best. After a full clear,
  runs are for fun.
- **Same dungeon for everyone each week:** maps, enemy line-ups and the weekly mutation come
  from a weekly seed. What's offered to you (boons, shop stock, Ethereal drops) is seeded
  per run.
- **A run can be paused.** The state is stored, so you can stop after any node and come
  back hours later. The weekly reset ends any unfinished run, and you keep what its cleared
  floors paid.

## Keeping dungeon gear apart from normal gear

This is the core rule: **nothing equippable enters or leaves the dungeon.** Only resources
come out.

| | Normal items | Ethereal items |
|---|---|---|
| Table | `item` | `chaos_item` (own table, own ID space) |
| Rarity | Common … Unique (Anomaly secret) | **Ethereal** (already reserved in the rarity enum, unused) |
| Comes from | Zones, raids, crafting | Only inside a run |
| Lives | Until salvaged, recycled or traded | **Until the run ends**, then it's deleted |
| Used in | Loadouts 1–4 | The run's **dungeon loadout** only |
| Crafting, salvage, trade, gift, loot filter | Yes | **Never** |
| Counts toward the bag | Yes | No (own small run stash) |

- **Separate table, not a flag.** Equip, salvage, reroll, trade and gift reducers all take
  `item` IDs. An Ethereal item isn't in that table, so no current or future reducer can touch
  one by mistake. Separation is a property of the schema, not something each reducer has to
  check.
- **The locked gear is a copy.** At the start, the chosen loadout's items (their stored
  stats and effects, literally) are copied into the run. The real items stay free: you can
  salvage, trade or re-equip them mid-run and the run doesn't change. Nothing has to be
  marked "in use", and no reducer needs to know about runs.
- **Your level is locked too**, taken at the start. A level-up from farming mid-run applies
  from the next run.
- **Look.** Ethereal items have their own color (a shifting pale teal, not near Rare,
  Legendary or Unique), a "Dungeon only" tag, and never show in the bag, Item Index or
  loot log. The dungeon has its own **Chaos Codex** (Discovery) for boons, Ethereal bases
  and chaos effects seen.

## A run

### The dungeon loadout

The run's own 9 slots. It starts as the locked copy of your loadout. Between nodes (never
during a fight) you can put an Ethereal item in any slot, or move the locked item back. The
locked items can't be lost or changed, only benched.

- **Run stash: 6 Ethereal items** on top of what's worn. When it's full, a new one replaces
  one you pick, or is left behind. A small stash forces choices.
- **Boons** sit next to the loadout. They aren't gear and take no slot.
- Before each fight, the client shows **Scout odds** for the next node, simulated in the
  browser like duels and the Deep: 200 fights from your current HP. It costs the server
  nothing, and the odds help you pick a path. Fight odds only. The whole run isn't
  predicted.

### Floor map

```
 row 1      [B]     [B]     [E?]
            / \      |     /
 row 2   [B]  [S]  [B]  [E?]
           \  /  \  |   /
 row 3     [EL]   [E?]  [B]
             \   /   \  |
 row 4       [R]      [EL]
               \     /
 row 5   [B]   [E?]  [S]
            \   |   /
 row 6        [B] [R]
                \ /
              [BOSS]
```

B battle · EL Elite · S shop · E? event · R rest. Each row has 2–4 nodes, and each node links
to 1–2 nodes in the next row, so a floor is ~6 choices and ~7 fights at most. Rules for the
generator:

- At least one **shop** per floor, and one **rest** in row 5 or 6.
- **Elites** never in row 1. At least one path per floor avoids every Elite.
- Rows 1–2 are mostly battles, so a run starts with a few fights to earn its first boons.
- Every path through a floor has **at least 3 fights**, so nobody can event-skip a floor.

| Node | What happens |
|---|---|
| **Battle** | One fight against 1–2 echoes in a row (HP carries). Win: **Motes**, then **pick 1 of 3 boons** |
| **Elite** | One stronger echo with an Elite affix. Win: more Motes, **1 of 3 boons (Rare or better)**, and **an Ethereal item** |
| **Shop** | Spend Motes (below) |
| **Event** | A short text scene with 2–3 choices, often a risk for a reward (below) |
| **Rest** | Pick one: **heal 35% max HP**, or **attune** one Ethereal item (+1 affix tier on every affix) |
| **Boss** | The floor boss. Win: the floor is cleared (weekly reward), a **Radiant Ethereal** item, and you heal **50% of missing HP** before the next floor |

**Motes** are the run's currency: earned from fights and events, spent in shops, gone when
the run ends. They aren't gold, so the run's economy can't leak into the real one, and a
shop price means the same thing at every tier.

### Shop

Stock rolled when you enter, 6–8 offers:

| Offer | Price (Motes) |
|---|---|
| Boon (Common / Rare / Epic) | 40 / 75 / 130 |
| Ethereal item | 90 (Radiant: 180) |
| Heal 30% max HP | 50 |
| Remove a curse | 75 |
| Remove a boon (thin a build) | 50 |
| Reroll the shop | 25, +25 each time |

A floor's fights pay ~150–250 Motes in all, so a shop stop is 2–3 purchases.

### Fights

Each fight node is one seeded fight, played in full by the server and replayed by the
client, like the Deep and raids. The server's outcome is final.

- `simulateFight` with a **starting HP** (the Deep needs the same change) and the run's
  stats: locked gear + Ethereal gear + boons + level.
- **HP carries over** between fights. Regen and lifesteal only work inside fights, as
  usual. Healing between fights comes from rests, shops, events, boons and boss kills. So
  sustain is a real build axis here, and so is plain bulk.
- **Second Wind** triggers **once per floor**, not once per fight.
- **Elixirs and meals don't apply.** The run is self-contained: a snapshot of gear and
  level, and everything else is earned inside. It also keeps the weekly reward from
  costing a stack of consumables.
- **Time limit: 3:00 per fight**, then the fight is lost. That stops stalls for unkillable
  builds that can't deal damage.
- Replays have **2× / 4× and Skip**. A run is ~35 fights, so pacing matters: the target is
  **~20–30 minutes** for a full run at 4×.

## Boons

Run-long buffs, picked 1 of 3 after battles and Elites, or bought. They're the roguelike
heart of the mode: each run builds a different character on top of the same locked gear.
They're online only, so no closed form is needed.

**Five themes.** With **3 boons of one theme** you get its set bonus, and a stronger one at
**5**. Offers lean toward themes you already have (weight × 2), so a run converges on a
plan without forcing it.

| Theme | Leans on | Set bonus (3 / 5) |
|---|---|---|
| **Fury** | Raw damage | +15% damage / your first hit on each enemy deals triple |
| **Bastion** | Mitigation, bulk | +10% max HP / every 10 s, a shield of 10% max HP |
| **Blood** | Sustain, HP as a resource | Lifesteal cap +5% / kills heal 8% max HP |
| **Storm** | Speed, crits | +15% attack speed / crits chain 30% of the hit to the next swing |
| **Fortune** | Motes, shops, events | Shops −20% / one free Rare boon per floor at its first shop |

Examples, with rarity scaling the number (Common / Rare / Epic):

| Boon | Theme | Effect |
|---|---|---|
| Sharpened Will | Fury | Damage +8 / 14 / 22% |
| Opening Salvo | Fury | First 5 s of each fight: damage +40 / 70 / 110% |
| Iron Hide | Bastion | Armor and resistance +15 / 25 / 40% |
| Stubborn | Bastion | Each fight starts with a shield of 8 / 14 / 22% max HP |
| Leech | Blood | Lifesteal +1 / 2 / 3% (cap still applies) |
| Red Tithe | Blood | Max HP −10%, damage +12 / 20 / 30% |
| Afterglow | Blood | Win a fight: heal 4 / 7 / 11% max HP |
| Quickened | Storm | Attack speed +8 / 14 / 22% |
| Keen | Storm | Crit chance +3 / 5 / 8% (flat, added after base crit) |
| Lucky Coin | Fortune | Motes +20 / 35 / 55% |
| Haggler | Fortune | One shop offer per shop is half price |
| Wildcard | none | Counts as one boon of **every** theme for set bonuses (Epic only) |

- **Boons are "more" multipliers** after gear, like elixirs, so they stay easy to read and
  to tune one at a time.
- Boon **rarity odds** go up by floor: floor 1 70 / 25 / 5%, floor 5 35 / 45 / 20%.
- **Curses** are negative boons from events (e.g. *Frail*: max HP −15%; *Hexed*: heals −30%;
  *Weighted*: attack speed −10%). They take no slot, can be removed at a shop, and some
  events pay well for taking one.

## Gear: Ethereal items

The "unusual powerful gear". An Ethereal item is a normal-looking base of the **run's tier**
with strong affixes and a **chaos effect**, an effect that doesn't exist outside the dungeon.

| Grade | From | Affixes | Chaos effects |
|---|---|---|---|
| **Ethereal** | Elites, shops, events | 3 regular, affix tier ≥ T − 2 | 1 |
| **Radiant** | Floor bosses, rare events, shops | 4 regular, affix tier ≥ T − 1 | 1, plus a 30% chance of a second |

- Stronger than most of what a player wears at the same tier, on purpose. Locked gear is
  the floor, Ethereal gear is the climb, and a run should feel like it's breaking the
  game's usual limits.
- **Bases:** any zone base of the tier, plus a few **Ethereal-only bases** that bend the
  normal slot rules. The dungeon is a safe place to try a rule before it ever reaches
  normal gear:
  - **Twin Fang** (off-hand dagger): **attacks**, at 50% of its damage. The first dual
    wield, a test for the "keep dual wield possible" design (equipment.md). Combat already
    sums over attack sources.
  - **Prism Orb** (off-hand): each of your hits rolls physical or magic at random.
  - **Hourglass** (amulet): no stats, and every fight's time limit is +60 s.
- **Chaos effects** get their own ID range (e.g. 200+), separate from the legendary and
  unique effects (1–99), so they can never be rolled outside. Like unique effects they
  don't stack and may carry a trade-off. Being online only, they can be wild.

| Chaos effect | Effect |
|---|---|
| **Glass Heart** | Damage × 2, max HP × 0.5 |
| **Echo Strike** | Every 4th attack repeats at 100% |
| **Overclock** | Attack speed × 1.6; each swing costs 1% max HP |
| **Gambler's Edge** | Each hit deals 0–300% damage at random (average ×1.5) |
| **Phoenix Plume** | Once per run, a killing blow leaves you at 40% HP instead. Then the item burns away |
| **Bloodbound** | No lifesteal cap; your regen is 0 |
| **Mirror Mail** | Reflects 60% of damage taken; you take 15% more |
| **Hoarder's Band** | +1% damage per 10 unspent Motes (max +40%) |
| **First Blood** | The first hit on each enemy deals 5× damage |
| **Voidheart** | All your damage becomes magic, +25% |
| **Chaos Conduit** | Each boon you hold gives +2% damage and +2% max HP |
| **Wither Aura** | Enemies lose 1% max HP per second |
| **Thief's Glove** | Fights pay +50% Motes |
| **Rift Anchor** | Can't be unequipped this run; all stats on your other items +20% |

## Events

Short text scenes, 2–3 choices, rolled from a pool (~20 at launch). They're where the
risk/reward choices live. Examples:

| Event | Choices |
|---|---|
| **Blood Altar** | Lose 20% max HP (current), gain an Epic Blood boon / leave |
| **Gambler** | Bet 50 Motes: 50% double, 50% lose / bet 100 / leave |
| **Wandering Smith** | Attune an Ethereal item for 40 Motes / reroll one of its affixes for 20 / leave |
| **Cursed Chest** | Open: a Radiant item and a random curse / leave |
| **Your Reflection** | Fight a copy of your current run build (reuses duels): win a free Epic boon; lose 30% HP and nothing else / leave |
| **Healing Spring** | Heal 25% / take a Rare boon of a theme you don't have |
| **Goblin in the Rift** | Chase it: a 20 s fight against a fleeing goblin that pays Motes per hit (callback to the Treasure Goblin) |
| **Shrine of Change** | Reroll all your boons into random ones of the same rarity / leave |
| **Lost Satchel** | 60 Motes / an Ethereal item |
| **Broken Mirror** | Swap a boon for a random boon one rarity higher; 25% chance it's a curse instead |

Event odds don't depend on the player: the weekly seed sets which events are on the map.
What each event rolls (which boon, which item) is seeded per run.

## Enemies

**Echoes.** The dungeon reuses every existing zone enemy and boss, rescaled to the run's
tier. Very cheap in art and data, and it fits the lore: pieces of every zone, mixed. A T4
run can face an echo of a T1 Bog Wisp with T4 numbers.

```
HP(f, slot)  = avgHP(T)  × floorMult(f) × kind.hp  × slot.hp  × CHAOS_HP
DPS(f, slot) = avgDPS(T) × floorMult(f) × kind.dps × slot.dps × CHAOS_DPS
level        = 10 × T + 2 × (f − 1)                  // T4 run: 40 → 48
floorMult    = 0.75, 0.95, 1.2, 1.5, 1.85            // floors 1–5
```

`avgHP(T)` and `avgDPS(T)` are the zone tier's average enemy (zones.md). `kind` is the
original enemy's shape (its damage type, defense profile and traits come along as they
are). `CHAOS_HP` and `CHAOS_DPS` account for HP carrying over and are tuned in
`test:chaos`.

| Slot | HP × | DPS × | Extra |
|---|---|---|---|
| Battle | 1 (or 2 × 0.6 back to back) | 1 | none |
| Elite | 2.5 | 1.3 | 1 Elite affix (the Deep's six: Vampiric, Warded Shell, Swift, Thorned, Unyielding, Ravenous) |
| Floor boss (1–4) | 5 | 1.5 | An echo of a **zone boss**, with its own mechanic plus 1 Elite affix |
| Final boss (5) | 7 | 1.7 | **The Chaos Heart**, its own boss (below) |

- **Why floors ramp faster than zones:** the player gets stronger inside the run through
  boons and Ethereal gear. Floor 1 is easy with locked gear alone; floor 5 needs the run's
  build. A run you play well is meant to end far stronger than it started.
- **Target:** a reference player for tier T (random Rare+ tier-T gear) with *random* picks
  clears floors 1–2, usually dies on 3–4, and clears 5 maybe 1 time in 10. With
  *sensible* picks, they clear 5 about half the time. `test:chaos` plays two bots (random
  picks and a greedy theme-builder) to check both.

### The Chaos Heart (final boss)

A shifting core of the rift. HP × 7, DPS × 1.7, plus:

- **Shift:** every 15 s it takes a new damage type and defense profile at random
  (phys/magic × Armored/Warded/Balanced). That tests a rounded build, and it's a
  harder-to-read version of Lunar Phases.
- **Unravel:** at 50% HP, it **turns off one of your boons** at random for the rest of the
  fight. A one-trick build gets punished, and the fight is different every run.
- The **weekly mutation** (below) applies to it twice as strongly.

## Weekly mutation

One rule for the whole week, the same for everyone, shown on the dungeon page. It changes
what's good, so even a player who replays for fun meets a new puzzle every week. Examples:

| Mutation | Effect |
|---|---|
| **Blood Moon** | All enemies have 20% lifesteal; Blood boons offered twice as often |
| **Storm Front** | Everyone (you and enemies) has +30% attack speed |
| **Iron Week** | Enemies are Armored; armor penetration counts double |
| **Bargain Bin** | Shops −30%, fights pay −30% Motes |
| **Echoes of the Deep** | Every Elite has 2 affixes; Elites drop Radiant items |
| **Wild Magic** | Every boon offer has one Wildcard-style "any theme" boon |
| **Glass World** | You and enemies deal double damage |

## Rewards

**Weekly, per floor, best tier counts.** Each floor has a weekly reward. A floor's reward is
paid the first time that week you clear it. If you later clear it on a **higher tier**, you
get the difference. Nothing else pays, so replays are free fun and the weekly total is a
hard cap.

Paid in **hours of farming at the run's tier**, so it scales like everything else
(× 2.9 per tier):

| Floor | Gold + XP | Dust | Materials | Extra |
|---|---|---|---|---|
| 1 | 0.75 h | 0.75 h | 0.75 h of the tier's materials, all kinds | none |
| 2 | 1 h | 1 h | 1 h | 2 **Riftstone** |
| 3 | 1.5 h | 1.5 h | 1.5 h | 3 Riftstone, 2 elixirs of the tier's grade |
| 4 | 2 h | 2 h | 2 h | 4 Riftstone, 2 **rare herbs** |
| 5 | 2.75 h | 2.75 h | 2.75 h | 10 Riftstone, **Essences** (once Essence drops ship), 1 Greater meal |
| **Total** | **8 h** | **8 h** | **8 h** | **19 Riftstone** |

- **"A lot", in numbers:** a full clear is ~8 h of farming in ~25 minutes, once a week.
  That's on the order of a full night's offline session. It's a strong reason to play
  weekly, but small next to a week of farming (~1/20), so it never replaces the core loop.
- **Riftstone** is a new dungeon-only **permanent** material (normal storage, unlike
  everything else from the run). What it crafts is open. Ideas: a reroll that keeps the
  affix *tier* and rerolls only the value; a reroll of a legendary affix within a
  chosen group (Offense, Defense, Utility); Hideout decorations.
- **No items come out.** Only resources. It keeps the separation rule absolute, and it
  keeps the dungeon from competing with zone drops and raid loot.
- The run tier is picked at the start, among tiers whose zone boss you've killed (default:
  the highest). A player can lower it to clear floors safely, then try higher.
- **Leftover Motes and Ethereal items are lost** when the run ends. Nothing converts, so
  there's no reason to hoard.

### Later: Chaos Rank (for the fun runs)

After a full clear on your highest tier, **Chaos Ranks 1–10** unlock: each adds a modifier
(enemies +10% HP, one fewer boon offer, shops cost more, the boss Unravels twice…). They're
for players who replay for fun and want a harder puzzle. Rank gives **no extra rewards**,
only a Codex mark and, a title (cosmetics.md), a title at Rank 10. Possibly a weekly
board for the highest rank cleared, with the build snapshot like the Deep.

## Cost (SpacetimeDB)

A run is many small decisions, so unlike a raid it's many reducer calls, all cheap:

- **~45–60 calls per run:** pick node, pick boon, buy, event choice, equip. Each fight
  node plays one fight in the call (well under 1 ms). No tick, no schedule.
- **State:** one private `chaos_run` row per character (floor, map position, HP, Motes,
  boons, curses, locked-gear copy, seeds), plus ≤ 15 `chaos_item` rows (9 worn, 6 in the stash). Both are deleted
  at the end of the run, so storage stays flat however many runs are played.
- **Weekly claims:** one `chaos_week` row per character (week, highest tier paid per
  floor).
- **Logs:** `chaos_log` keeps the last ~10 runs (floor reached, boons, final build,
  rewards) for the run history page.
- Fun runs cost the same as rewarded ones, and every call is a player action. Cost scales
  with play, as the "cheap to run" pillar wants.

## Implementation sketch

| Piece | What |
|---|---|
| `data/chaos.ts` | Boons (permanent IDs), themes and set bonuses, curses, chaos effects (200+), Ethereal-only bases, events, mutations, floor multipliers, reward table |
| `chaos.ts` (pure, shared) | `weeklyDungeon(week)` (maps, line-ups, events, mutation), `nodeEnemies(...)`, `runStats(run)` (locked gear + Ethereal + boons + level), `simulateNode(...)` (`simulateFight` with starting HP, per-floor Second Wind, effect hooks), offer rolls |
| `sim.ts` | `simulateFight` takes a starting HP (shared with the Deep) and a hook list for chaos effects and boons |
| Schema | `Ethereal` rarity (already reserved), `chaos_run`, `chaos_item`, `chaos_week`, `chaos_log`, `chaos_codex` (discovery) |
| Reducers | `chaosStart(loadoutIndex, tier)`, `chaosMove(node)`, `chaosPick(option)` (boons, events, rest), `chaosBuy(offer)`, `chaosEquip(slot, chaosItemId \| locked)`, `chaosAbandon()`; weekly reset handled lazily (a call in a new week ends the old run and pays its cleared floors) |
| Client | A **Chaos Dungeon** page under Adventure: the floor map, dungeon loadout + stash, boons with set progress, Scout odds, replays with speed controls, shop and event dialogs, run history, Codex |
| Check | `npm run test:chaos`: random and greedy bots per tier, clear rate per floor, each boon and chaos effect's swing on clear rate (outliers get toned down), every weekly map is valid |

## Open questions

- **Name:** Chaos Dungeon or a lore name.
- **Unlock:** T2 boss, or later (T3 boss, alongside Wyrm Hollow)?
- **Pacing:** is ~30 fights per run right for an idle game, or should floors be shorter
  (~4 rows) for a ~15-minute run?
- **Riftstone:** what it crafts. Could share the answer with the raid token shop and
  Voidglass (abyss.md).
- **Boon count and balance:** ~30 boons at launch; whether theme weighting makes runs too
  samey.
- **Twin Fang:** a good testbed for dual wield, or does it promise a feature too early?
- **Party mode later?** A co-op run (2 players, shared map, separate boons) would reuse the
  raid fight. Out of scope for the first version.
