# Zones and enemies

## Zones

- **One zone per tier** for now: 9 zones, zone T drops tier-T items. The design keeps
  room for several zones per tier later, so nothing should assume zone = tier. A zone
  stores its tier as data.
- **5 enemy types per zone** (*illustrative*), at level offsets −4, −2, 0, +2, +4 from
  the zone's average.

## Enemy level

- Enemies in a tier-T zone average **level 10 × T**.
- Each enemy type has a fixed level `10T + o`, with offset `o` in **−5 to +5**, so some
  are weaker and some stronger than average. The zones' ranges sit end to end
  (T1: 5–15, T2: 15–25, …, T9: 85–95).
- Enemy level feeds the mitigation and evasion formulas (combat.md).

## Target enemy

- The player **picks one enemy type** in the zone to fight. Settlement, the viability
  check and kill rate all use that enemy only (combat.md).
- Progression inside a zone: farm the weaker enemies first, then move to the stronger
  ones.
- Changing target settles progress first, like changing zone.

## Design targets

Curves are built backwards from a **reference player**: level 10T wearing average
tier-T gear, fighting the zone's average enemy (o = 0).

| Target | Value |
|---|---|
| Time to kill | ~10 s |
| Time to die | ~25 s (2.5× time to kill) |
| Respawn time | 5 s, so ~15 s per kill and ~1,900 kills per 8 h offline |

**Reference player** (*illustrative*; checked with a simulated warrior and healer in
average Magic gear, see bases.md):

```
m(T) = 1 + 0.15T                          // damage multiplier growth (level + gear %)

playerDPS(T) = 10 × 2.1^(T−1) × m(T)     // before enemy mitigation
playerHP(T)  = 250 × 1.42^(T−1)          // level HP + gear HP (×1.6) + HP %
playerMitigation ≈ 30%, playerEvasion ≈ 10%
```

## Enemy stats

For the zone's average enemy (o = 0):

```
enemyHP(T)     = 70 × 2.1^(T−1) × m(T)   // ≈ 10 s vs 33% mitigation
enemyDPS(T)    = 16 × 1.42^(T−1)         // ≈ 25 s vs 30% mitigation and 10% evasion
enemyArmor     = 2.5 × level × profile.armor
enemyResist    = 2.5 × level × profile.resist
```

- `2.5 × level` gives 33% mitigation at every level (formula in combat.md).
- **Damage per hit** = `enemyDPS / enemy attack speed`. Speed is per enemy type
  (*illustrative:* 0.5–1.5 /s); it only changes how hits look, not the outcome.
- **Damage type:** each enemy type deals Physical or Magic.
- **Defense profile** per enemy type, so penetration and the choice of damage type
  matter:

| Profile | Armor × | Resistance × | Mitigation (phys / magic) |
|---|---|---|---|
| Balanced | 1 | 1 | 33% / 33% |
| Armored | 2.4 | 0.4 | 55% / 17% |
| Warded | 0.4 | 2.4 | 17% / 55% |

### Weaker and stronger enemies

A fixed ±5 levels is a big gap at T1 (5 vs 15) but a small one at T9 (85 vs 95), so
strength comes from the **offset**, not the raw level:

```
stats(o)   = average-enemy stats × 1.08^o        // HP and DPS
rewards(o) = average-enemy rewards × 1.12^o      // XP, gold, drop chance
```

| Offset | Stats | Rewards | Reward per second* |
|---|---|---|---|
| −4 | 0.74× | 0.64× | 0.86× |
| −2 | 0.86× | 0.80× | 0.93× |
| 0 | 1× | 1× | 1× |
| +2 | 1.17× | 1.25× | 1.08× |
| +4 | 1.36× | 1.57× | 1.16× |

\* Ignoring respawn. The fixed respawn time widens the gap further, since it is a larger
share of the cycle against weak enemies.

- Because both HP and damage scale, a stronger enemy is harder by about `1.08^(2o)`:
  at +4 the reference player's time to kill is ~85% of their time to die, so they only
  just survive. Comfortable +4 farming needs better than average gear.
- Rewards grow faster than stats, so stronger targets always pay more per second.

### Tables (o = 0, *illustrative*)

| Tier | Level | Player DPS | Player HP | Enemy HP | Enemy DPS | XP / kill | Gold / kill |
|---|---|---|---|---|---|---|---|
| 1 | 10 | 12 | 250 | 80 | 16 | 20 | 5 |
| 2 | 20 | 27 | 355 | 191 | 23 | 58 | 14 |
| 3 | 30 | 64 | 504 | 448 | 32 | 168 | 42 |
| 4 | 40 | 148 | 716 | 1,037 | 46 | 488 | 122 |
| 5 | 50 | 340 | 1,016 | 2,382 | 65 | 1,415 | 354 |
| 6 | 60 | 776 | 1,443 | 5,432 | 92 | 4,102 | 1,026 |
| 7 | 70 | 1,758 | 2,050 | 12,307 | 131 | 11,896 | 2,974 |
| 8 | 80 | 3,962 | 2,910 | 27,737 | 186 | 34,500 | 8,625 |
| 9 | 90 | 8,888 | 4,133 | 62,219 | 265 | 100,000 | 25,000 |

## Enemy rewards

```
xp(T)   = 20 × 2.9^(T−1)     × 1.12^o      // T1: 20,  T9: 100,000
gold(T) = 5  × 2.9^(T−1)     × 1.12^o      // T1: 5,   T9: 25,000
```

- Steep on purpose so tier 9 feels like endgame: a T9 kill is worth ~5,000 T1 kills.
  T9 gold per kill ranges from ~16k (o = −4) to ~39k (o = +4).
- Kill time is ~constant across tiers for a matching player, so XP and gold per hour
  also grow ×2.9 per tier, and farming a lower tier quickly stops being worth it. The
  XP-per-level curve should be built on this.
- Each enemy type has its own XP, gold and loot table, so players can target-farm.

### Loot table

Kill counts are large: ~1,900 per 8 h offline session against the average enemy, and
a player who checks in about 3 times a day gets ~5,700 kills/day. Drop chances are set
from **targets per session**, not per kill.

Each rarity has its own chance per kill, scaled by `1.12^o` and `(1 + item find%)`
(*illustrative*):

| Rarity | Chance per kill | Per 8 h session | Per day (3 sessions) |
|---|---|---|---|
| Common | 3% | ~57 | ~170 |
| Magic | 1.5% | ~29 | ~85 |
| Rare | 0.5% | ~10 | ~29 |
| Epic | 0.1% | ~2 | ~6 |
| Legendary | 0.01% | ~0.2 | ~0.6 (one every ~2 days) |
| Unique | 0.002% | ~0.04 | ~0.1 (one every ~9 days) |

- ~95 drops per session in total; with a typical filter (keep Rare+) about 12 are kept
  and the rest become materials.
- Settlement samples a count per rarity from these chances (one draw per rarity, not
  one per kill), so cost doesn't grow with kills.

- **Uniques:** a unique drop picks from the uniques assigned to that enemy. An enemy
  with none rolls Legendary instead.
- Dropped items are always the zone's tier.

### Base distribution

Every base drops from **exactly one enemy per zone**, and bases are dealt out
**equally** across the zone's enemies:

- Bases: 10 weapon families, 12 armor bases (4 slots × 3 weights), shield, tome,
  4 ring gems, 4 amulet gems = 32 (bases.md). With 5 enemies: two enemies get 7, the
  others 6.
- The assignment is **shuffled per zone** (fixed in the zone's data), so each enemy has a
  mix of slots, and the base held by the hardest enemy changes from zone to zone.
- Within an enemy, its bases drop with equal weight.
- Adding bases later: deal them to the enemies with the fewest bases.

## Open

- Check the reference player's curves against the gear curves in detail (base
  templates per family, affix averages, level primaries).
