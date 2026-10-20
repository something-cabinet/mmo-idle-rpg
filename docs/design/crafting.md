# Crafting and sinks

Gold and salvage materials pile up fast (zones.md), so they need sinks. Crafting is the
main one. All costs scale steeply with item tier and rarity.

## Materials

- **Dust** is the salvage material, stored as a counter on the character (never as rows).
- Enemies also drop tiered **Metal, Hide, Core, Cloth, Wood, Reagent and Gem** materials
  (zones.md, "Materials"). Life skills use them: recipes, buffs, tools and the
  Hideout (life-skills.md).
- Salvaging an item gives `dust(rarity) × 2.9^(T−1)` (rounded) and `gold(rarity) ×
  2.9^(T−1)`, the same ×2.9-per-tier growth as XP and gold, so old low-tier Dust
  barely helps with high-tier crafting.

| Rarity | Dust per salvage (× 2.9^(T−1)) | Gold per salvage (× 2.9^(T−1)) |
|---|---|---|
| Common | 0.8 | 10 |
| Magic | 1.6 | 20 |
| Rare | 4 | 50 |
| Epic | 16 | 200 |
| Legendary | 50 | 600 |
| Unique | 50 | 600 |

A player who keeps Rare+ and salvages the rest gets ~12 Dust and ~150 gold per hour
× 2.9^(T−1) (drop rates in zones.md). Crafting still prices Dust at 15 per hour of
farming, so Dust is a little scarcer than gold.

## Cost formula

Costs are set in **hours of farming** at the item's tier, so they feel the same at
every tier:

```
goldCost    = hours × 1,200 × 2.9^(T−1)     // gold per hour at tier T
dustCost = hours × 15    × 2.9^(T−1)     // Dust per hour at tier T
```

## Reroll an affix

- The player picks **one regular affix**. It is replaced by a new random affix rolled
  exactly like a drop (free pool with weights, tier 1..N, value in the band).
- The legendary affix can't be rerolled. Uniques can't be crafted at all.

Hours below are after `REROLL_COST_MULT` (0.5) in `craft.ts`, which halves the base hours
(Magic 0.25, Rare 0.5, Epic 1, Legendary 2).

| Item rarity | Hours | T1 cost | T9 cost |
|---|---|---|---|
| Magic | 0.125 | 150 gold, 2 Dust | 750k gold, 9.4k Dust |
| Rare | 0.25 | 300 gold, 4 Dust | 1.5M gold, 19k Dust |
| Epic | 0.5 | 600 gold, 8 Dust | 3.0M gold, 38k Dust |
| Legendary | 1 | 1,200 gold, 15 Dust | 6.0M gold, 75k Dust |

## Upgrade rarity

Raises an item one rarity step. Its base and existing affixes stay.

| Upgrade | Effect | Hours | T1 cost | T9 cost |
|---|---|---|---|---|
| Common → Magic | Adds 1 random affix | 0.25 | 300 gold, 4 Dust | 1.5M gold, 19k Dust |
| Magic → Rare | Adds 1 random affix | 1 | 1,200 gold, 15 Dust | 6.0M gold, 75k Dust |
| Rare → Epic | Adds 1 random affix | 4 | 4,800 gold, 60 Dust | 24M gold, 300k Dust |
| Epic → Legendary | Player removes 1 regular affix; adds 1 random legendary affix | 24 | 29k gold, 360 Dust | 144M gold, 1.8M Dust |

- Legendary is the top craftable rarity; Unique can't be crafted.
- Epic → Legendary costs ~24 h, against a natural Legendary every ~40 h of farming:
  crafting is faster but expensive, and the player picks the base and keeps 2 chosen
  affixes.

## Chisels

Crafting consumables (chisel.ts), like PoE's orbs: each does one thing gold crafting can't.
Kept in the `supply` table (IDs 700 + kind), untiered: one chisel works on any item tier.
Used from the Crafting screen's Chisel tab. Uniques take only Recalibration and Corruption; Anomalies none.

| Chisel | Effect |
|-|-|
| Recalibration | Rerolls the value of every affix within its tier, and the legendary bonus. On a Unique, its stats within their roll range. |
| Chaos | Rerolls every affix as new random ones, the legendary affix (effect and bonus) included. |
| Binding | Binds one affix, regular or legendary, for good (`item.boundAffix`). One per item. |
| Improvement | Raises one regular affix a tier, up to the item's tier, and rerolls its value in the new tier's range. |
| Corruption | One random outcome, then the item is corrupted: no more crafting of any kind (rerolls, upgrades, tempering, chisels). |

- Nothing changes a bound affix: the gold reroll, Chaos, Recalibration and Improvement
  all leave it, and Epic → Legendary can't remove it.
- Sources: the rare loot pool (data/pool.ts), per Basic kill before rank and level:
  Chaos and Corruption 1 in 2,500 each; Binding, Recalibration and Improvement 1 in 5,000 each.
  Gathering finds them too: 0.07% per action, any skill and tier (× the find level
  multiplier), Chaos and Corruption twice as often as the others (`CHISEL_WEIGHT`).
  Also System mail gifts (`supply:701` to `705`).

### Corruption

Five outcomes, equally likely (chisel.ts `corrupt`); `item.corruption` records which one
happened (0 = not corrupted). Anomalies can't be corrupted. Uniques can: their stats have
no tier, so a "tier" change moves the stat past its roll range instead, by half the range's
width (`CORRUPT_UNIQUE_OVER`): a ×0.8–1.4 stat rerolls in ×1.4–1.7 or ×0.5–0.8. A Unique can
also gain a regular affix or lose one of its stats.

- **Add or remove an affix** (half each): adds a random affix even past the rarity's
  count, or removes a random unbound one.
- **Raise or lower an affix tier** (half each): a random unbound affix, value rerolled in
  its new tier. It may rise one tier past the item's tier: a T9 item can get a T10 affix,
  whose range comes from the stat's curve formula past T9 (`affixRange` already extends).
- **A corrupted affix:** exclusive to corruption (see "Corrupted affixes" below). Designed,
  not built: until then this outcome isn't rolled and the other four are 25% each.
- **Nothing.**
- **Reroll every value**, as a Recalibration Chisel does.

Bound affixes are never removed or changed. With no unbound affix, a tier change does
nothing and an affix count change adds one.

### Corrupted affixes

*Designed 2026-10-20, not built.* The one clearly good outcome of a Corruption Chisel, to
balance the bad ones (a lost affix, a lowered tier). Numbers *illustrative*.

- **Conditional "more" only:** damage or defence against a kind of content.
  Something no regular affix gives. Ruled out: plain "more damage / max HP" (boring), cap
  breakers (balance trouble) and effect-like mechanics (too close to uniques).
- **One pool for every slot:** any corrupted item, weapon, armor or jewelry, can roll any of them.
- **Tier = the item's tier:** the value scales with the item's tier like a regular affix's
  (a T9 item rolls the T9 range).
- **Its own line**, not one of the item's affix slots: shown at the bottom of the affix
  list, in red (above the card's big "Corrupted" line, not under it). One per item, never
  rerolled (the item is corrupted, so nothing changes it again).
- **Closed form:** each is a fixed multiplier for a given fight (whether it's a boss, an
  Elite, a raid or the Deep is known up front), so offline settles stay exact.
- **Odds:** the outcome joins the others at 1 in 6 (the rest drop from 25% to about 20%).

Four conditions for now, each as more damage or as less damage taken, so 8 affixes:

| Condition | Applies to | More damage, T1 → T9 | Less damage taken, T1 → T9 |
|---|---|---|---|
| Bosses | Every boss: zone bosses, raid bosses and the Deep's depth bosses (Chaos Dungeon floor bosses later). Broadest condition, so lower values | 4% → 10% | 2% → 5% |
| Elites | Elite enemies (the Moonwell Deep, the Chaos Dungeon later) | 6% → 15% | 3% → 8% |
| Raids | Raid bosses | 6% → 15% | 3% → 8% |
| The Deep | Every Moonwell Deep fight | 6% → 15% | 3% → 8% |

Conditions can overlap: a Deep Elite counts for both "Elites" and "The Deep", a Deep boss for "Bosses" and "The Deep", a raid boss for "Bosses" and "Raids".

Open: storage (a new item field `corruptedAffix` with stat and value, or a flagged affix
with tier 0 like a unique's), and exact ranges (simulate against T5–T9 bosses, the raids and the
Deep). More conditions can join later.

## Bag expansion

- Bag starts at **200** slots. Each expansion adds **25**, up to **400** (storage budget,
  equipment.md).
- Cost doubles as a late gold sink: `50,000 × 4^n` gold for the n-th expansion
  (n = 0..7): 50k, 200k, 800k, 3.2M, 12.8M, 51M, 205M, 819M.

## Open

- Whether reroll costs should rise with each reroll of the same item (stronger sink,
  stops endless rerolling).
- Other sinks later: raid entry, cosmetics.
