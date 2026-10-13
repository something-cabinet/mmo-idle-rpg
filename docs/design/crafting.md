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

## Bag expansion

- Bag starts at **200** slots. Each expansion adds **25**, up to **400** (storage budget,
  equipment.md).
- Cost doubles as a late gold sink: `50,000 × 4^n` gold for the n-th expansion
  (n = 0..7): 50k, 200k, 800k, 3.2M, 12.8M, 51M, 205M, 819M.

## Open

- Whether reroll costs should rise with each reroll of the same item (stronger sink,
  stops endless rerolling).
- Other sinks later: raid entry, cosmetics.
