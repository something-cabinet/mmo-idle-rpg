# The Moonwell Deep (endless delve)

*First version built* (seasons later; titles in cosmetics.md; code: `spacetimedb/src/data/abyss.ts`, `abyss.ts`, `reducers/abyss.ts`, `src/ui/views/AbyssView.tsx`, checks in `npm run test:abyss`). An endless solo gauntlet, deeper floor by deeper floor, with
enemies that keep getting stronger and a leaderboard for the deepest floor. It exists to
**stress-test a build**: a fight that doesn't stop at the content's ceiling. Numbers are
*illustrative*.

## Name

Working name **The Moonwell Deep**. Selvara pulled the moon down into her moonwell, and
her power alone kept the well shut. With the queen dead, nothing holds it: past its flooded
heart, where Umbriel still breathes (The Drowned Moon raid), is the dark the moon fell
through, with no end anyone has found. The Deep and the raid open together.

| Option | Feel |
|---|---|
| **The Moonwell Deep** (recommended) | Ties into T4 and Selvara's moonwell; "Deep 37" reads well on a leaderboard |
| The Lightless Descent | Grim, generic |
| Umbral Depths | Ties to the Umbral bases from the raid |
| The Drowned Abyss | Plain and clear |

Floors are called **depths** ("Depth 37").

## Rules at a glance

- **Unlocks** for a character once it has **killed Selvara, the Moonless Queen** (T4 boss)
  once, the same kill that opens The Drowned Moon raid. No raid win needed.
- **Solo and online only**, like raids: never settled offline, never a farming target.
  **Farming continues** during a descent.
- **Every depth is the same shape: a basic enemy, then an Elite, then the boss**, fought back
  to back as one fight. HP carries over between them, with no walk and no heal in between.
  Win, and the depth is cleared: rewards, then the next depth opens. Lose, and nothing is
  lost: try again.
- **Progress is kept.** You always start at your deepest depth + 1, never from depth 1 again.
- Enemy HP and damage come from **one formula with no upper bound**.
- A **leaderboard** ranks the deepest depth cleared.

## The fight

One seeded fight per start, played in full by the server and replayed by the client from
the stored setup, like a raid (raids.md, "The fight"). The server's outcome is final. No
closed form is needed, since it's never settled offline. That leaves room for mechanics
the zones can't have.

- **Order:** basic, Elite, boss. Each is a normal solo fight (`simulateFight` in fight.ts),
  except that it **starts at the HP you had when the last one died**. Swing timers restart
  for each enemy.
- **Between enemies:** nothing. Regen, lifesteal and heals work only inside fights, as
  usual. A build with no sustain gets worn down; that's the test.
- **Effects** (legendary.md) **per enemy:** Ambush (first swing), Executioner, Zealot's Oath
  and Thornshell work against each enemy as usual.
  **Per depth:** Second Wind triggers once per depth, not once per enemy, otherwise it would
  be a free heal between fights.
- **Buffs:** none. Elixirs and meals are for farming only (life-skills.md, "Buff rules"):
  the active ones neither apply nor use charges in the Deep, so a depth checks gear alone.
- **Time limit: 4:00 per depth**, then the depth is lost. Without one, a healer or regen
  build that can't die but can't kill would stall forever. With it, a depth checks damage as
  well as survival.
- **Loadout:** pick **any of your 4 loadouts** for the attempt. The active (farming) loadout
  isn't touched, so you can keep a dedicated Deep build. Taken at the start, after a settle.

### Who you fight

| Slot | Picked from | HP × | DPS × | Share of the depth's HP |
|---|---|---|---|---|
| Basic | 1 of 8 pool enemies | 1 | 1 | ~13% |
| **Elite** | another of the 8 + 1 Elite affix (of 6) | 2.5 | 1.3 | ~33% |
| **Boss** | The Deep Warden, always, + its Boss affixes | 4 | 1.6 | ~53% |

Multipliers are on top of the depth's numbers (Scaling).

**Why this shape: it's easy to balance.** Every depth has the same three fights in the same
order, so difficulty moves smoothly with depth: no spike depths, no ranks bunching up below
a wall. The pieces can be tuned one by one: the formula sets the baseline, the Elite and the
boss their multipliers, and each affix is checked on its own. Variety comes from which basic,
which Elite with which affix, and which Boss affixes: 8 × 7 × 6 Elite line-ups before
counting the boss.

**Line-ups are fixed per depth and the same for everyone**, picked from a seed of (season,
depth). Everyone faces the same Depth 37, so the leaderboard is fair and players can talk
about "the Depth 37 Vampiric Moonguard into a Mirrored Warden". Only the fight's own
rolls (crits, dodges, variance) are seeded per character and start time.

Before starting, the player sees the depth's line-up: names, damage types, defense profiles,
traits, affixes, HP and DPS at this depth.

### Win odds

The page shows **no win odds**: you find out by descending. `depthOdds` (the share of 200
simulated depths a build wins) stays for balancing in `test:abyss` only.

## Scaling

A depth's enemies follow the **zone curve, continued forever** (zones.md, "Enemy stats").
Depth 1 is a T4 enemy, and every 10 depths is one tier:

```
tier(d)   = 4 + (d − 1) / 10                    // depth 1 = T4, 11 = T5, 51 = T9
level(d)  = min(100, 40 + (d − 1))              // capped: see below
HP(d)     = 915  × 1.06^(min(d, 101) − 1) × 1.09^max(0, d − 101) × ease(d) × kind.hp × slot.hp
DPS(d)    = 53   × 1.04^(min(d, 101) − 1) × 1.06^max(0, d − 101) × ease(d) × kind.dps × slot.dps × GAUNTLET
ease(d)   = min(1, 0.6 + 0.08 × (d − 1))         // depth 1 at 0.6, full from depth 6
armor/res = 2.5 × level(d) × profile             // as zones
GAUNTLET  = 0.2                                  // 3 fights (7.5 basics of HP) on one HP bar
```

- `915` and `53` are the T4 average enemy's HP and DPS. `kind` is the pool enemy's own
  shape (table below), `slot` the basic / Elite / boss multiplier (above).
- **1.06 and 1.04** fit the zone table from T4 to T9 (HP × 19.7 and DPS × 7.4 over 5 tiers),
  so depth 51 lines up with T9, and past that the curve just keeps going.
- **Difficulty per depth ≈ 1.06 × 1.04 ≈ 1.10, so it doubles about every 7 depths.** The
  leaderboard therefore reads on a log scale: a build twice as strong goes ~7 depths deeper,
  not twice as deep. Gaps at the top stay readable instead of exploding.
- **Faster from depth 101: HP × 1.09 and DPS × 1.06 per depth, ≈ 1.155, doubling about
  every 5 depths.** Depth 51 is T9 strength, the top gear tier; past it, gear stops
  growing and only its quality counts. Depths 51–100 keep the normal rate, so very good
  T9 builds have 50 depths to spread out over (difficulty × ~128 by depth 101). Only the
  strongest builds get past 100. From there, the old rate would mean a long, slow slog of
  depths for the few at the top. The faster rate makes each depth past 100 a real step, and
  the board still separates them: twice as strong is ~5 depths deeper.
- **A gentle start (`ease`).** Depth 1 is on the easy side of T4: HP and DPS × 0.6 (about
  0.36× the difficulty), back to the full curve by depth 6. Anyone who beat Selvara gets a
  few free depths and a feel for the format before it bites. The ease only touches the start,
  so depth 51 still lines up with T9.
- **GAUNTLET** keeps a depth at about one hard fight's worth of damage taken. Target: a
  reference player at the unlock (Lv 48, random T4 Rare+ gear, as in `test:raid`) clears
  depths 1–5 comfortably and walls around depth 8–12. Tuned in a
  `npm run test:abyss` like `test:raid`. A depth takes ~1:30 for that player at depth 1.
- **Level cap 100.** Your armor, resistance and evasion scale with the attacker's level
  (combat.md). An uncapped enemy level would make every defense decay on top of the HP/DPS
  growth, a hidden second curve. Capped at 100 (depth 61), only HP and DPS keep growing.

| Depth | Like | Level | HP × | DPS × | Boss affixes |
|---|---|---|---|---|---|
| 1 | easy T4 | 40 | 0.6 | 0.6 | 1 |
| 6 | T4+ | 45 | 1.34 | 1.22 | 1 |
| 11 | T5 | 50 | 1.8 | 1.5 | 1 |
| 21 | T6 | 60 | 3.2 | 2.2 | 1 |
| 31 | T7 | 70 | 5.7 | 3.2 | 1 |
| 51 | T9 | 90 | 18.4 | 7.1 | 2 |
| 101 | past T9 | 100 | 339 | 50.5 | 2 |
| 111 | past T9 (faster) | 100 | 803 | 90.4 | 2 |
| 121 | past T9 (faster) | 100 | 1,900 | 162 | 2 |

Zones only go to T4 for now, so today the wall sits a few depths past T4 gear. Each new tier
pushes everyone deeper, which is one reason for seasons (below).

## Enemies

### Basic and Elite pool

**8 abyss enemies**, built from the existing toolbox (damage type, defense profile, evasion
and regen traits paid for with HP, zones.md "Enemy traits"), so a random line-up asks for a
rounded build. Any of them can be the basic or the Elite of a depth (never both). Names and
numbers are *illustrative*.

| Enemy | Damage | Defense | Speed | HP × / DPS × | Twist |
|---|---|---|---|---|---|
| Moonless Shade | Magic | Balanced | 1.2/s | 0.9 / 1.0 | Evasive (hard to hit) |
| Drowned Acolyte | Magic | Warded | 0.9/s | 1.0 / 1.1 | Plain caster: a resistance check |
| Tidebound Husk | Phys | Armored | 0.5/s | 1.4 / 0.9 | Regen: punishes low burst |
| Voidling Swarm | Phys | Balanced | 1.8/s | 0.7 / 1.1 | Very fast small hits |
| Fallen Moonguard | Phys | Armored | 0.7/s | 1.2 / 1.0 | An armor-pen check |
| Starless Lamprey | Phys | Balanced | 1.0/s | 1.0 / 1.0 | **Drains:** heals itself for 50% of the damage it deals |
| Hollow Choir | Magic | Warded | 0.6/s | 1.1 / 1.2 | Big slow hits |
| Eclipse Moth | Magic | Balanced | 1.4/s | 0.8 / 1.0 | **Veil:** first 5 s immune (punishes slow starters, not Ambush) |

### Elite affixes

The Elite is a pool enemy with HP × 2.5, DPS × 1.3 and **one Elite affix**. One twist per
Elite is easy to read and to balance on its own.

| Affix | Effect |
|---|---|
| Vampiric | Heals itself for 50% of the damage it deals |
| Warded Shell | Takes the defense profile that resists your larger damage type |
| Swift | Attack speed +50%, damage per hit −25% |
| Thorned | Reflects 15% of the damage it takes, as physical |
| Unyielding | Regenerates 2% max HP per second |
| Ravenous | Its damage grows +5% every 5 s of its fight |

### The boss: the Deep Warden

**One boss, every depth.** It's fought on every single depth, so it gets a plain, common
name rather than a grand one: the thing that guards each way further down. HP × 4, DPS × 1.6,
magic damage, Balanced defenses. On its own it is a plain stat check; its **Boss affixes**
make each depth's version different, and the UI names it by them ("Mirrored Deep Warden",
"Hungering, Starless Deep Warden").

- **1 affix at depths 1–50, 2 from depth 51 on**, forever. Picked by the depth's seed, no
  repeats on one boss. The second affix lands around T9 strength, where deep runs would
  otherwise become just bigger numbers.
- **Sprite: one Deep Warden, with a variant per first affix** (7 variants, one per Boss
  affix: e.g. Hungering gaunt with a gaping maw, Mirrored with a glassy silver sheen,
  Eclipse half swallowed by shadow). The player fights it every depth, so the variant keeps
  it from being the same sprite each time, and it shows the main affix at a glance. The
  second affix (from depth 51) doesn't change the sprite.
- Boss affixes are bigger than Elite affixes: each is a mechanic the build has to answer.
- Each is tuned on its own in `test:abyss` (win odds with and without it), and an affix
  that swings the odds far more than the others gets toned down.

| Boss affix | Effect | Tests |
|---|---|---|
| **Hungering** | Its damage grows +10% every 10 s of its fight | Damage (a soft enrage) |
| **Mirrored** | Takes the defense profile that resists your larger damage type, and deals the type you defend worse against | Holes in the build |
| **Moonfall** | Every 12 s, a magic burst of 3× its hit that can't be dodged | Raw HP and resistance |
| **Starless** | Your heals −50% during its fight (heal weapons, regen, lifesteal) | Sustain vs HP pool |
| **Tidal** | Each attack deals half physical, half magic | Both defenses |
| **Veiled** | Evasion rating as the Shade's | Accuracy |
| **Eclipse** | Every 20 s, 4 s in which it can't be damaged | Damage over the whole fight, not burst |

Since everything here is online only, the pool enemies' twists, the Elite affixes and the
Boss affixes need no closed form (combat.md, "Rule for new mechanics" applies only to
farmable enemies).

## Rewards

**First clear of each depth only** (per season). Re-clearing gives nothing. No farming
loop, so the Deep can never out-earn zone farming and the server cost stays one start per
attempt.

| What | When | Notes |
|---|---|---|
| Gold + XP | Every depth | ~30 min of farming at the depth's tier (`tier(d)`, rounded down to an existing zone) |
| Dust + materials | Every depth | Materials of the depth's tier, all kinds |
| **Voidglass** | Every depth: 3, and 18 on every 10th | The Deep's own material, for Phials (phials.md). The main source: first clears pay once, so they pay big (~450 for depths 1–100). Raids, zone bosses, unique salvage and Mining pay a slow trickle |
| A power elixir of the depth's grade + 1 rare herb | Every 5 depths | Fuel for farming |
| Essences | Every 10 depths | **Once Essence drops ship**: left out until then; rare Essences from depth 30 |
| **Title** | Depths 10, 25, 50, 75, 100 | Cosmetic (cosmetics.md); a name effect at 50 and 100, a nameplate at 25 and 75 |

**Past depth 100: formula only.** From depth 101 there are no more milestones: no titles,
elixirs or Essences on set depths. Every depth gives the same bundle from one formula,
growing slowly with depth:

```
g(d)       = 1.03^(d − 101)
gold, XP   = 30 min of T9 farming × g(d)
Dust       = 30 min of T9 salvage × g(d)
materials  = T9 materials, all kinds, 30 min's worth × g(d)
Voidglass  = 6 + 2 × floor((d − 101) / 10)
```

The few players this deep play for the leaderboard, not for one-off prizes, and an endless
list of handmade rewards would never end either. The rewards still grow (× 1.03 a depth),
but far slower than the difficulty (× 1.155), so they never become a reason to grind.

- **Rank gives no power, only titles.** Rewards come from depths reached, never from
  leaderboard position, so a top rank can't snowball and the board stays bragging only.
- Items ignore the bag limit, like raid items.

### Titles

Built as part of cosmetics (cosmetics.md): *"of the Deep"* (10), *"Moonless"* (25),
*"Lightless"* (50), *"Voidborn"* (75), *"Who Fell With the Moon"* (100, the last one), plus
name effects and nameplates. Later, once seasons are on: the season's top 10 get a gold
title and plate for the next season.

## Leaderboard

- **Ranks the deepest depth cleared.** Ties go to whoever cleared it **first** (stored time),
  so pushing early is rewarded and nobody gets passed by an equal score.
- **Two tabs:**
  - **Global:** the top 100 of all characters, plus your own rank pinned at the bottom if
    you're not in it.
  - **Friends:** you and your friend list, ranked the same way.
- Each entry keeps a **snapshot of the build** that set it: level, the loadout's items and
  the clear time. Clicking an entry inspects it like a friend's gear. That's half the fun of a
  stress-test board: see what the top builds wear. Snapshots are taken at the record, so a
  player can't hide a build by changing gear afterwards.
- **Seasons** (not at launch; the tables carry a `season` column, always 1 for now, so
  turning them on needs no migration): every ~8 weeks the board resets and depth
  rewards can be earned again. To skip the boring part, the new season starts each player at
  **half their last season's best** (rewards for the skipped depths are not paid). New tiers
  shipping mid-season shift everyone up, and a season reset keeps the board fresh.

## Cost (SpacetimeDB)

- One reducer call per attempt; the server plays one 3-fight gauntlet (well under 1 ms, as
  for raids). The client replays it from the stored setup. No tick, no schedule.
- **Attempts are free**, with a **10 s wait after a loss, in the client only** (the server
  doesn't enforce it). Fight rolls are seeded by start time, so a player can re-roll a
  close depth; that's accepted. Outcomes are mostly decided by the stats, and each attempt is one cheap reducer call.
- The leaderboard is **one public row per character** (`abyss_record`), updated only on a
  new best, so subscribing to the top 100 is cheap.

## Implementation sketch

| Piece | What |
|---|---|
| `data/abyss.ts` | Pool enemies and the boss (permanent IDs, 9100+), Elite and Boss affixes, `GAUNTLET`, slot multipliers, growth factors, reward table |
| `abyss.ts` (pure, shared) | `depthLineup(season, depth)` (basic, Elite + affix, Boss affixes), `depthStats(depth, kind, slot)`, `simulateDepth(stats, lineup, seed)`: `simulateFight` with a starting HP, per-depth Second Wind and the affix hooks |
| `fight.ts` | `simulateFight` takes a starting HP (default: max) and returns the HP left |
| Tables | `abyss_record` (public, one row per character: deepest depth this season, clearedAt, level, build snapshot as JSON; it is both the progress and the leaderboard), `abyss_log` (private, view `my_abyss_log`: the latest attempt only, with the stats fought with, for the replay, and the reward). The unlock reads `boss_kill` (zone 4), like the raid unlock |
| Reducer | `descend(loadout)`: unlocked, settle, simulate, pay on a win. The dev cheat "Unlock all zones" also opens the Deep |
| Client | A **Moonwell Deep** page under Adventure next to Raids: the next depth's line-up and affixes, loadout picker, replay, leaderboard |
| Check | `npm run test:abyss`: the reference player's wall depth, GAUNTLET tuning, win odds per Elite and Boss affix, every depth's line-up is valid |

## Open questions

- **Name.** The Moonwell Deep or another. The boss: Deep Warden, or another plain one
  (Well Keeper, Depth Guardian, Gatekeeper).
- **When to start seasons:** later, once the board stagnates.
- **GAUNTLET, Elite and boss multipliers, affix strength:** tuned with `test:abyss`.
- **Voidglass:** crafts Phials (phials.md), which also lists its other sources.
- **Party mode later?** A 4-player Deep with its own board would reuse the raid fight;
  out of scope for the first version.
