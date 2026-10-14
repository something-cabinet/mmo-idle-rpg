# Zones and enemies

## Zones

- **One zone per tier** for now: 9 zones, zone T drops tier-T items. The design keeps
  room for several zones per tier later, so nothing should assume zone = tier. A zone
  stores its tier as data.
- **5 enemy types per zone** (*illustrative*), at level offsets −4, −2, 0, +2, +4 from
  the zone's average.

## Zone map

A zone is a small map of **areas** joined by paths, not a flat enemy list and not a
fixed route (data/zones.ts `areas`, `links`).

- **4 areas per zone:** the enemies grouped by place (e.g. Greenhollow: Village
  Fields, Old Mill, Goblin Camp, Chieftain's Tent), the last being the boss's lair.
  Paths branch, so the map has more than one way through.
- **Nothing inside an open zone is locked.** Any enemy can be fought at any time; the
  real limit is gear, not a grind gate, and an idle player never has to switch
  targets to make progress.
- **Areas are revealed by visiting:** an area shows by name on the map once the
  player has a kill there, and while they are fighting there. A zone's first area is
  always shown. No progress bar or
  thresholds: a first try with zone-wide kill thresholds felt like a chore.
- Unrevealed areas show as `???` with their level range and can still be fought; the
  lair always names its boss (bosses are the zone's goal). The client toasts "New
  area found" when its projection reveals one.
- **Cost: none.** Revealing is derived on the client from `enemy_kill`; the server
  doesn't know about areas.
- Area IDs are `zoneId × 10 + n` and permanent; map positions are presentation only,
  as % of an inset stage that always leaves room for a spot's marker and label.
  Hidden areas (exploration-todo.md) can hang off the same map later.
- Walk flavour lines come from the zone's general lines plus the target's area.

## Secret areas

Areas that aren't on the map at first (`AreaDef.secret`), found by an obsession: lots
of kills of one of the zone's regular enemies.

- **Hidden** until `hint` kills of that enemy: nothing on the map, only a flavour line
  in a nearby area hints at it.
- **Rumoured** from `hint` kills: a shimmering ✦ spot appears on a path from the nearby
  area, with a rumour line ("Bells ring somewhere beneath the bog water…") and which
  enemy seems drawn to it. Its enemies aren't listed. The client toasts the rumour.
- **Found** at `kills`: the spot is named and marked Secret, its enemies can be fought,
  and the client toasts "Secret found".
- The server enforces it: `setTarget` answers "No such enemy" for a secret enemy until
  its area is found, so the secret doesn't leak. Derived from `enemy_kill`; no new table.
- A secret enemy (`secret: true`) stays out of the zone's base deal (every base from
  exactly one regular enemy), the zone's level range, and its discovery counts until
  found. It can have its own unique (uniques.md, "Enemy-bound uniques").
- A secret enemy can be much stronger than its zone (the Bellringer is T2 strength in
  T1), paid for with higher XP and gold, which raise its drop rate too, and an optional
  `rareDropMult` on Rare and better drops (Unique included).

| Zone | Secret area | Found by | Hint | Enemy | Unique |
|---|---|---|---|---|---|
| Greenhollow | Sunken Chapel | 1,000 Bog Wisp kills (≈ 4 h on Wisps) | 500 | Drowned Bellringer (Lv 22, T2 strength, Magic, Armored) | The Drowned Hymnal |

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
| Walk time | 5 s, so ~15 s per kill and ~1,900 kills per 8 h offline |

**Reference player** (*illustrative*; checked with a simulated warrior and healer in
average Magic gear, see bases.md):

```
m(T) = 1 + 0.15T                          // damage multiplier growth (level + gear %)

playerDPS(T) = 10 × offense(T) × m(T)    // before enemy mitigation
offense(T)   = 2.1^(T−1) to T3, then 44.1 × 1.6^(T−3)   // weapon damage curve
playerHP(T)  = 250 × 1.42^(T−1)          // level HP + gear HP (×1.6) + HP %
playerMitigation ≈ 30%, playerEvasion ≈ 10%
```

## Enemy stats

For the zone's average enemy (o = 0):

```
enemyHP(T)     = 70 × offense(T) × m(T)  // ≈ 10 s vs 33% mitigation
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

\* Ignoring walk time. The fixed walk time widens the gap further, since it is a larger
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
| 3 | 30 | 64 | 504 | 492 † | 35 † | 168 | 42 |
| 4 | 40 | 148 | 716 | 1,037 | 46 | 488 | 122 |
| 5 | 50 | 340 | 1,016 | 2,620 † | 72 † | 1,415 | 354 |
| 6 | 60 | 776 | 1,443 | 5,432 | 92 | 4,102 | 1,026 |
| 7 | 70 | 1,758 | 2,050 | 13,538 † | 144 † | 11,896 | 2,974 |
| 8 | 80 | 3,962 | 2,910 | 27,737 | 186 | 34,500 | 8,625 |
| 9 | 90 | 8,888 | 4,133 | 68,441 † | 292 † | 100,000 | 25,000 |

† Wall tier: × 1.1 (see below).

### Difficulty rhythm

Difficulty doesn't rise evenly. **Wall tiers** (odd tiers from 3: T3, T5, T7, T9) get
enemy HP and DPS **× 1.1** on top of the curve above (`WALL_FACTOR` in zones.ts); other
tiers sit on the curve. T1 is the tutorial and is never a wall.

```
wall(T) = 1.1 if T ≥ 3 and T is odd, else 1
enemyHP(T)  = 70 × offense(T) × m(T) × wall(T)
enemyDPS(T) = 16 × 1.42^(T−1)       × wall(T)
```

| Step | Extra HP and DPS vs the curve | Felt difficulty* |
|---|---|---|
| T1 → T2 | × 1 | normal |
| T2 → T3, T4 → T5, T6 → T7, T8 → T9 | × 1.1 | ~1.21× harder than a normal step |
| T3 → T4, T5 → T6, T7 → T8 | × 1/1.1 | ~0.83×, a breather |

\* HP and DPS both scale, so difficulty moves with `wall²`.

- It's a sawtooth, not a compounding curve: walls don't stack, so T9 is only 1.1×
  above the reference player, not 1.1⁴×.
- On a wall tier the reference player kills in ~11 s and dies in ~22.7 s (vs 10 s / 25 s),
  so the average enemy is closer to an o = +1 target. The boss (× 1.08^7 on top) needs
  clearly better than average gear or extra levels.
- Rewards stay on the reward curve; a wall pays the same per kill but kills are slower,
  so pushing gear before moving on pays off.

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
| Common | 6.75% | ~128 | ~385 |
| Magic | 3.375% | ~64 | ~192 |
| Rare | 1.125% | ~21 | ~64 |
| Epic | 0.225% | ~4 | ~13 |
| Legendary | 0.0225% | ~0.4 | ~1.3 (about one a day) |
| Unique | 0.0225% | ~0.4 | ~1.3 (about one a day) |

- ~218 drops per session in total; with a typical filter (keep Rare+) about 26 are kept
  and the rest become materials.
- Tuned in `zones.ts` as base chances × `DROP_RATE_MULT` (1.5), Unique also × `UNIQUE_RATE_MULT` (5).
- Settlement samples a count per rarity from these chances (one draw per rarity, not
  one per kill), so cost doesn't grow with kills.

- **Uniques** drop globally, not per enemy: in a tier-N zone, any unique of tier N or
  below, weighted toward tier N (uniques.md). They keep their own tier and are always kept.
- Other dropped items are always the zone's tier.

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

### Materials

Enemies also drop crafting **materials**, stacked as counts (not bag items), for
future crafting, potions and hideout upgrades. There are seven generic kinds, one of
each per tier, and an enemy drops only its zone's tier:

| Kind | What it is | Future use | Dropped by | Mean per kill | Per 8 h session |
|---|---|---|---|---|---|
| Metal | Ingots, bars | Plate, metal weapons | Armed or armored enemies | 0.3 | ~570 |
| Hide | Skins, hides, scales | Leather | Beasts | 0.3 | ~570 |
| Cloth | Thread, linen, silk | Cloth armor, bandages | Robed humanoids, spiders | 0.3 | ~570 |
| Wood | Logs, planks, timber | Bows, staves, wands; hideout building | Treants, beasts of the woods, miners | 0.3 | ~570 |
| Reagent | Herbs, venom, fangs, feathers | Potions | Beasts, wisps, shamans | 0.3 | ~570 |
| Core | Hearts, cores | Magic gear | **Magical creatures only** | 0.1 | ~190 |
| Gem | Rough, cut, flawless stones | Jewelry, top hideout levels | Goblins, bandits, kobolds, golems, bosses | 0.05 | ~95 |

- An enemy lists one to three kinds (bosses three); each is rolled separately. Means
  are scaled by `1.12^o` like XP and gold, but **not** by item find.
- Deliberately generic: no enemy has its own unique material. Special materials are
  added by hand where wanted.
- Names per tier and the per-enemy lists are in zone-content.md
  (data/materials.ts, data/zones.ts).
- Used by life skills (life-skills.md), which also add Fish (kind 8) and Ore (kind 9,
  smelted into Metal), and gather Wood, Reagent and Gem directly.

## Open

- Whether item find should raise material drops.
- Check the reference player's curves against the gear curves in detail (base
  templates per family, affix averages, level primaries).
