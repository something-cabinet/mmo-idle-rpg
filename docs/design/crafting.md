# Crafting and sinks

Gold and salvage materials pile up fast (zones.md), so they need sinks. Crafting is the
main one. All costs scale steeply with item tier and rarity.

## Materials

- **Essence** is the salvage material, stored as a counter on the character (never as rows).
- Enemies also drop tiered **Metal, Hide, Core, Cloth, Wood, Reagent and Gem** materials
  (zones.md, "Materials"). Nothing uses them yet; they are for future recipes, potions
  and hideout upgrades.
- Salvaging an item gives `essence(rarity) × 2.9^(T−1)`, the same ×2.9-per-tier growth
  as XP and gold, so old low-tier Essence barely helps with high-tier crafting.

| Rarity | Essence per salvage (× 2.9^(T−1)) |
|---|---|
| Common | 1 |
| Magic | 2 |
| Rare | 5 |
| Epic | 20 |
| Legendary | 60 |
| Unique | 60 |

A player who keeps Rare+ and salvages the rest gets ~15 Essence per hour × 2.9^(T−1)
(drop rates in zones.md).

## Cost formula

Costs are set in **hours of farming** at the item's tier, so they feel the same at
every tier:

```
goldCost    = hours × 1,200 × 2.9^(T−1)     // gold per hour at tier T
essenceCost = hours × 15    × 2.9^(T−1)     // Essence per hour at tier T
```

## Reroll an affix

- The player picks **one regular affix**. It is replaced by a new random affix rolled
  exactly like a drop (free pool with weights, tier 1..N, value in the band).
- The legendary affix can't be rerolled. Uniques can't be crafted at all.

| Item rarity | Hours | T1 cost | T9 cost |
|---|---|---|---|
| Magic | 0.25 | 300 gold, 4 Essence | 1.5M gold, 19k Essence |
| Rare | 0.5 | 600 gold, 8 Essence | 3.0M gold, 38k Essence |
| Epic | 1 | 1,200 gold, 15 Essence | 6.0M gold, 75k Essence |
| Legendary | 2 | 2,400 gold, 30 Essence | 12M gold, 150k Essence |

## Upgrade rarity

Raises an item one rarity step. Its base and existing affixes stay.

| Upgrade | Effect | Hours | T1 cost | T9 cost |
|---|---|---|---|---|
| Common → Magic | Adds 1 random affix | 0.25 | 300 gold, 4 Essence | 1.5M gold, 19k Essence |
| Magic → Rare | Adds 1 random affix | 1 | 1,200 gold, 15 Essence | 6.0M gold, 75k Essence |
| Rare → Epic | Adds 1 random affix | 4 | 4,800 gold, 60 Essence | 24M gold, 300k Essence |
| Epic → Legendary | Player removes 1 regular affix; adds 1 random legendary affix | 24 | 29k gold, 360 Essence | 144M gold, 1.8M Essence |

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
