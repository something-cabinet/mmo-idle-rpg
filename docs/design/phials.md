# Phials

Designed 2026-10-19, not built. Numbers are *illustrative* until there's play data.

Phials are one-fight consumables for the **Moonwell Deep** (abyss.md) and **raids**
(raids.md). Elixirs are for farming only (life-skills.md, "Buff rules"), so Phials give the
modes that ignore elixirs an Alchemy item of their own. They're made from **Voidglass**,
which gives the Deep's material its first use and makes this file its second subject:
where Voidglass comes from.

## Phials

### Rules

- **One fight, one Phial.** A Deep depth is one fight (one HP bar for all three enemies).
  A raid attempt is one fight.
- **Picked per attempt.** The Descend button and the raid party screen each have a Phial
  picker (None, or a Phial in stock with its count). There's no slot that stays filled, and
  nothing to put on and take off. You choose at the moment you use it.
- **Used up win or lose.** It's taken from stock when the fight starts. Otherwise every
  attempt would bring one for free.
- **Raids:** each player picks their own, and it only changes that player's stats. A
  player with no clears left today can still bring one to help.
- **Never in farming.** Settles, the zone list and the away report never see Phials, and
  the elixir slot doesn't apply where Phials do. Each mode has one consumable.
- **Separate "more" multiplier** after gear, like elixirs, so "+30% damage" means the same
  with any gear.

### Kinds

Fight effects only: no gold, XP or item find, since those are farming stats.

| Kind | Effect (grade 1) | Notes |
|-|-|-|
| **Wrath** | × 1.3 damage | |
| **Haste** | × 1.2 attack speed | |
| **Bulwark** | × 0.75 damage taken | Applied after armor, resistance and evasion |
| **Renewal** | Once per fight, at 50% HP, heal 30% of max HP | In the Deep, once per depth, like Second Wind |

Phials are stronger than elixirs (× 1.3 against × 1.2) because each lasts a single fight
and costs Voidglass.

### Grades

The same grades as elixirs (supplies.ts `GRADES`), set by the tier of the herb and
reagent used: Phial (T1–T3), Greater (T4–T6), Divine (T7–T9) at 1× / 1.5× / 2× the bonus.
Greater Phial of Wrath is × 1.45 damage. Bulwark scales on the reduction (25% → 37.5% →
50% less), Renewal on the heal (30% → 45% → 60%). No Infuse: the herb is already part of
the recipe.

### Recipe (Alchemy)

| Input | Count |
|-|-|
| Voidglass | 5 |
| Rare herb of the tier | 1 |
| Reagent of the tier | 10 |

- Makes **1 Phial**, takes **2 min**, gives Alchemy XP like a brew of the tier.
- Needs the Alchemy level for the tier (10(T−1)+1) and **the Moonwell Deep opened**
  (Selvara killed), so it shows up together with Voidglass.
- Runs in the production queue like brews.

## Where Voidglass comes from

Today Voidglass only comes from first clears in the Deep: 1 per depth and 6 on every 10th,
~150 for depths 1–100 in a season. That's enough for ~30 Phials a season. Four sources are
added, all gated at **T4+** (where the Deep opens), so early content stays as it is.

Target: a dedicated endgame player makes **3–5 Phials a day** (15–25 Voidglass).

### 1. Raid clears

- Each rewarded clear (up to 3 per raid per day, as now) pays Voidglass along with the
  tokens: **Wyrm Hollow 2, The Drowned Moon 4**, then +2 per later raid.
- Up to **18 a day** with both raids. That's the largest source, which fits: raids use
  Phials, and their clears are already capped per day.
- This is the "precious material" raids.md planned, so that note becomes Voidglass.

### 2. Rare find while farming

- Each kill in a **T4+ zone** has a **0.1% × (T − 3)** chance to drop 1 Voidglass: T4
  0.1%, T9 0.6%. Bosses count like other kills.
- Rolled in the settle like rare encounters: online it's seeded, offline it's one Poisson
  draw. Closed form stays intact.
- At ~240 kills an hour: **~0.24 an hour at T4** (~4 from a day of farming), ~1.4 an hour at T9.
- Works offline, so it rewards idle farming, not being online. It's a slow, steady trickle.
- Shown in the settle log and the away report with the other materials.

### 3. Salvaging legendaries and uniques

- Salvaging a **T4+** Legendary gives **2 Voidglass** and a Unique gives **3**, on top of
  its Dust and gold.
- Works the same for manual salvage and the loot filter's auto-salvage, so a long offline
  session pays it too.
- At current drop rates (~1.3 legendaries and ~1.3 uniques a day), salvaging what you don't
  keep comes to **up to ~6 a day**. It gives duplicate legendaries and uniques a use.
- Recycle (materials) stays as it is: only Salvage pays Voidglass.

### 4. Void Geode (Mining rare find)

- A new rare find on **T4+ Mining nodes**: **0.1% × (T − 3)** per action, × (1 + level / 99)
  like other rare finds. It's never stored. It cracks on the spot into **2 Voidglass**, the
  way a Relic turns into gold.
- At ~300 actions an hour: ~0.6 Voidglass an hour at T4 and level 1, ~1.2 at level 99.
  A bit more than farming the same tier, which gives Mining an endgame reason to exist.
- The Ruins Dig Site special node doesn't raise it (its ×3 applies to Meteor Fragments).
- A row in life-skills.md "Rare finds".

### Totals

| Player | Raids | Farming | Salvage | Geodes | Per day | Phials |
|-|-|-|-|-|-|-|
| Idle T4 farmer, no raids | 0 | ~4 | ~4 | 0 | ~8 | ~1.5 |
| Idle T4 miner, no raids | 0 | 0 | 0 | ~10 | ~10 | ~2 |
| Raider who farms T4 | 18 | ~4 | ~4 | 0 | ~26 | ~5 |

Plus Deep first clears, which come in bursts while pushing.

### Not doing

- **A daily Deep re-clear for Voidglass.** It's a daily chore that pulls people online.
- **Buying it with gold, or turning lower materials into it.** Anyone could grind for it,
  so it would stop being scarce.

## Data and code notes

- **Supply IDs:** Phials are `400 + kind × 10 + grade` in the `supply` table, next to
  elixirs (`300 + …`). These IDs are permanent.
- **Deep:** `descend` gets a `phial: u16` (0 = none). The Phial's buffs go into
  `combatStats`, so the stats logged with the attempt (`encodeStats`) already include them
  and the replay matches. `abyss_log` gets a `phial` column for the replay screen.
- **Raids:** each party member sets a `phialId` while waiting. It's taken from stock when
  the fight starts, and the fight's stats include it. `raid_log` records it.
- **Renewal** is an effect in the fight sims (`simulateDepth`, raid fight), not a
  multiplier. It works like Second Wind but triggers at 50% HP.
- **Voidglass sources:** a T4+ Voidglass roll in the settle's loot step, a Voidglass amount
  in salvage values for T4+ Legendary and Unique, and a Void Geode roll in gathering.
  Raid rewards get a `voidglass` count per raid.

## Open questions

- **Haste and Renewal in raids:** Renewal on a tank may be stronger than a healer's NPC
  hire. Check it against raid odds once built.
- **Cost of 5 Voidglass:** check it against how many attempts a Deep push really takes.
- **A Phial for the Chaos Dungeon** if it's ever built (chaos-dungeon.md keeps elixirs and
  meals out; Phials could stay out too, so the run is self-contained).
