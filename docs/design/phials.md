# Phials

Designed and built 2026-10-19. Numbers are *illustrative* until there's play data.

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
  nothing to put on and take off. You choose at the moment you use it. The pick is
  remembered for the next attempt (in the raid party, until you change it); with none left
  in stock you fight without one, and a raid start never waits on it.
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
| **Wrath** | × 1.08 damage | |
| **Haste** | × 1.06 attack speed | |
| **Warding** | × 0.92 damage taken | Applied after armor, resistance and evasion |
| **Renewal** | Once per fight, at 50% HP, heal 30% of max HP | In the Deep, once per depth, like Second Wind |

**A Phial is the last little push, not a requirement.** It should turn a fight you lose
narrowly into a win, not make a fight you lose badly winnable. If it were bigger, every
Deep depth and raid would be balanced around having one, and going without would feel
like a penalty. So Wrath, Haste and Warding stay below elixirs (× 1.08 against × 1.2).
Renewal is the exception: a heal once per fight only matters when a fight is close.

### Grades

The same grades as elixirs (supplies.ts `GRADES`), set by the tier of the herb and
reagent used: Phial (T1–T3), Greater (T4–T6), Divine (T7–T9) at 1× / 1.5× / 2× the bonus.
Greater Phial of Wrath is × 1.12 damage. Warding scales on the reduction (8% → 12% → 16%
less), Renewal on the heal (30% → 45% → 60%).

| Kind | Phial | Greater | Divine |
|-|-|-|-|
| Wrath | × 1.08 damage | × 1.12 | × 1.16 |
| Haste | × 1.06 attack speed | × 1.09 | × 1.12 |
| Warding | 8% less damage taken | 12% | 16% |
| Renewal | Heal 30% max HP at 50% HP | 45% | 60% | No Infuse: the herb is already part of
the recipe.

### Recipe (Alchemy)

| Input | Count |
|-|-|
| Voidglass | 5 / 4 / 3 by the tier's place in its grade |
| Rare herb of the tier | 1 |
| Reagent of the tier | 10 |

| Material tier | Makes | Voidglass |
|-|-|-|
| T1 / T2 / T3 | Phial | 5 / 4 / 3 |
| T4 / T5 / T6 | Greater Phial | 5 / 4 / 3 |
| T7 / T8 / T9 | Divine Phial | 5 / 4 / 3 |

- Makes **1 Phial**, takes **2 min**, gives Alchemy XP like a brew of the tier.
- **Higher tiers stretch Voidglass, not the effect.** Elixirs reward the top tier of a
  grade with more per brew (2 / 3 / 4). For Phials, Voidglass is the scarce input, so the
  top tier costs less of it: a T6 brew makes the same Greater Phial as T4 with 3 Voidglass
  instead of 5, ~67% more Phials from the same Voidglass. Levelling Alchemy and gathering
  higher herbs pays off, and Phials stay a small push.
- Needs the Alchemy level for the tier (10(T−1)+1) and **the Moonwell Deep opened**
  (Selvara killed), so it shows up together with Voidglass.
- Runs in the production queue like brews.

## Where Voidglass comes from

**The Deep's first clears are the main source**, raised on 2026-10-19 because they pay
only once: **3 per depth and 18 on every 10th** (was 1 and 6), ~450 for depths 1–100 in a
season, enough for 90–150 Phials (5 to 3 Voidglass each). Past depth 100: 6 + 2 × floor((d − 101) / 10) (was
3 + floor(…)).

Four slow sources keep Phials coming after a push. They're kept small on purpose: the
Deep pays the bulk, and these stay a trickle.

### 1. Raid clears

- Each rewarded clear (up to 3 per raid per day, as now) pays Voidglass along with the
  tokens: **Wyrm Hollow 2, The Drowned Moon 4**, then +2 per later raid.
- Up to **18 a day** with both raids. That's the largest source, which fits: raids use
  Phials, and their clears are already capped per day.
- This is the "precious material" raids.md planned, so that note becomes Voidglass.

### 2. Zone bosses

- Only **zone bosses** drop it, not regular enemies or secret-area bosses: **0.2% per
  boss kill** in **T4+ zones**, × (T − 3) (T4 0.2%, T9 1.2%).
- Rolled in the settle like rare encounters: online it's seeded, offline it's one Poisson
  draw. Closed form stays intact.
- Very rare: about one per 500 boss kills at T4. Farming the boss pays a little Voidglass
  on top of its own loot, a reason to farm it after the first kill.
- Works offline. Shown in the settle log and the away report with the other materials.

### 3. Salvaging uniques

- Salvaging a **Unique of any tier** gives **2 Voidglass**, on top of its Dust and gold.
  Legendaries give none.
- Uniques are always kept by the loot filter, so this is manual salvage only.
- At ~1.3 uniques a day, **up to ~2.5 a day**. It gives duplicate uniques a use.
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

Phials counted at 5 Voidglass (T4 brews); T6 brews make ~67% more.

| Player | Raids | Boss | Salvage | Geodes | Per day | Phials |
|-|-|-|-|-|-|-|
| Idle T4 farmer, no raids | 0 | 0–1 | ~2.5 | 0 | ~3 | ~0.5 |
| Idle T4 miner, no raids | 0 | 0 | 0 | ~10 | ~10 | ~2 |
| Raider who farms T4 | 18 | 0–1 | ~2.5 | 0 | ~21 | ~4 |

On top of that, the Deep's first clears: ~450 over depths 1–100, in bursts while pushing.

### Not doing

- **A daily Deep re-clear for Voidglass.** It's a daily chore that pulls people online.
- **Buying it with gold, or turning lower materials into it.** Anyone could grind for it,
  so it would stop being scarce.

## Data and code notes

- **Supply IDs:** Phials are `400 + kind × 10 + grade` in the `supply` table, next to
  elixirs (`300 + …`); recipes are `600 + kind × 10 + tier` (data/recipes.ts
  `phialRecipeId`, `needsDeep`). These IDs are permanent. Named Warding, not Bulwark: that's
  a legendary affix.
- **Buffs:** `Buffs` gained `damageTaken` and `renewal`, and `CombatStats` carries them
  (absent on older logs = no Phial). Warding is applied after mitigation in `matchup` and
  the raid fight; Renewal in `simulateFight` (carried through a depth like Second Wind) and
  the raid fight.
- **Deep:** `descend({ loadout, phial })` (0 = none). The stats logged with the attempt
  (`encodeStats`) include the Phial, so the replay matches; `abyss_log.phial` shows it.
- **Raids:** `setRaidPhial` sets `raid_member.phialId`; `startRaid` takes one from stock per
  member who has one and puts it in the setup (`RaidFighter.phialId`). `raid_log` records
  `phialId` and `voidglass`.
- **Voidglass sources:** zone bosses through `materialMeans` (loot.ts; the settle, the Forager's
  Stash encounter and the drop list use it), `salvageVoidglass` (the salvage reducer and a full
  bag's overflow), the Void Geode in `RARE_FINDS` (data/skills.ts) and `RaidDef.voidglass`.

## Open questions

- **Haste and Renewal in raids:** Renewal on a tank may be stronger than a healer's NPC
  hire. Check it against raid odds.
- **Cost of 5 / 4 / 3 Voidglass:** check it against how many attempts a Deep push really takes.
- **A Phial for the Chaos Dungeon** if it's ever built (chaos-dungeon.md keeps elixirs and
  meals out; Phials could stay out too, so the run is self-contained).
