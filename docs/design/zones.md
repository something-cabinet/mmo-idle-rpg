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
  Paths usually branch, so the map has more than one way through; a zone can instead
  be a single route when the place calls for it (T5's mine shaft).
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
  `rareDropMult` on Rare and better drops (Unique included), and an optional
  `uniqueDropMult` on Unique alone (both secret enemies: 0.5).

| Zone | Secret area | Found by | Hint | Enemy | Unique |
|---|---|---|---|---|---|
| Greenhollow | Sunken Chapel | 1,000 Bog Wisp kills (≈ 4 h on Wisps) | 500 | Drowned Bellringer (Lv 22, T2 strength, Magic, Armored) | The Drowned Hymnal |
| Moonveil Vale | Moonlight Garden | 1,000 Moonmoth Swarm kills | 500 | Moonlit Champion (Lv 52, T5 strength, Magic, Balanced) | Moonlight Greatsword |

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
offense(T)   = 2.1^(T−1) to T3, then 4.41 × 1.6^(T−3)   // weapon damage curve
playerHP(T)  = 250 × 1.42^(T−1)          // level HP + gear HP (×1.6) + HP %
playerMitigation ≈ 30%, playerEvasion ≈ 10%
```

## Enemy stats

For the zone's average enemy (o = 0):

```
enemyHP(T)     = 70 × offense(T) × m(T) × climb(T)  // ≈ 10 s × climb(T) vs 33% mitigation
enemyDPS(T)    = 16 × 1.42^(T−1)        × climb(T)  // ≈ 25 s ÷ climb(T) vs 30% mitigation and 10% evasion
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

### Enemy traits

An enemy type can carry a trait that gives it character (`EnemyDef` in zones.ts):

| Trait | Effect |
|---|---|
| Evasion | An evasion rating: each of your attacks misses at `dodge(rating, your accuracy)`, the same rule as your evasion (attributes.md, "Evasion"). Heals still land, lifesteal doesn't. Your DPS × (1 − dodge). |
| Regen | The enemy heals this many HP per second during a fight, up to its max. Time to kill = HP ÷ (your DPS − regen); never killed if regen ≥ DPS. |

A trait is **paid for with HP**, so the enemy stays on its curve for the reference player
(a same-level player without accuracy gear: accuracy `10 × level × (1 + 0.25% × level)`
from the level's Might):

```
effectiveHp = HP / (1 − dodge vs reference accuracy) + regen × 10 s     // = the curve's HP × 1.08^o
```

Evasion is countered by accuracy: affixes, crossbows, Might and levels make
an evasive enemy dodge less, and it adds variance and weakens on-hit sustain. Regen
favours strong builds and punishes weak ones, since it takes the same HP per second off
any DPS. T4 has the first ones (zone-content.md).

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
| 2 | 20 | 27 | 355 | 201 | 23.9 | 58 | 14 |
| 3 | 30 | 64 | 504 | 493 | 35.6 | 168 | 42 |
| 4 | 40 | 113 | 716 | 915 | 53.0 | 488 | 122 |
| 5 | 50 | 198 | 1,016 | 1,849 | 87.0 | 1,415 | 354 |
| 6 | 60 | 343 | 1,443 | 3,373 | 129.7 | 4,102 | 1,026 |
| 7 | 70 | 592 | 2,050 | 6,114 | 193.4 | 11,896 | 2,974 |
| 8 | 80 | 1,017 | 2,910 | 11,022 | 288.3 | 34,500 | 8,625 |
| 9 | 90 | 1,739 | 4,133 | 19,780 | 429.9 | 100,000 | 25,000 |

Enemy HP and DPS include `climb(T)` (below); player numbers are the reference player.

### Difficulty climb

Every tier is harder than the last. Enemy HP and DPS outgrow the reference player's
curve by **× 1.05 a tier, compounding** (`CLIMB_FACTOR` in zones.ts), plus a one-time
**× 1.1 step at T5** carried into every tier above (`TIER_STEP`, `STEP_FROM_TIER`). T1 is
the tutorial and sits on the curve.

```
climb(T) = 1.05^(T−1) × (T ≥ 5 ? 1.1 : 1)   // T2 1.05, T3 1.10, T4 1.16, T5 1.34, T7 1.47, T9 1.63
```

| Tier | climb | Felt difficulty vs reference* | Reference player vs average enemy (kill / die) |
|---|---|---|---|
| 2 | 1.05 | 1.10× | 10.5 s / 23.8 s |
| 3 | 1.10 | 1.22× | 11.0 s / 22.7 s |
| 4 | 1.16 | 1.34× | 11.6 s / 21.6 s |
| 5 | 1.34 | 1.79× | 13.4 s / 18.7 s |
| 7 | 1.47 | 2.17× | 14.7 s / 17.0 s |
| 9 | 1.63 | 2.64× | 16.3 s / 15.4 s |

\* HP and DPS both scale, so difficulty moves with `climb²`.

- The point: enemies grow a little faster than weapon base damage, so average gear picked
  up along the way falls further behind each tier. Rolled affixes, rerolls, tempering and
  a planned build have to make up the gap, more and more the higher the player climbs.
- **The T5 step** (2026-10-20): T5 opens the Shifting Rift and is the first tier that should
  feel like a wall. Simulated (random farming gear, Magic to Epic, at level 10T, auto-equipped):
  the zone's hardest regular enemy goes from 84% won at T4 to 22% at T5; players 8 levels
  over the zone in Rare to Legendary gear beat Selvara 25% of the time and Durgrim 4%.
- From T5, average gear is not enough: by T7 a reference player only just beats the average
  enemy, and at T9 it loses (kill 16.3 s, die 15.4 s). Farming T8–T9 needs a real build.
  Revisit when T6+ is built.
- Rewards stay on the reward curve; a harder tier pays the same per kill but kills are
  slower, so pushing gear before moving on pays off.
- Replaces the 2026-10-12 sawtooth (× 1.1 on odd tiers from 3). T3 lands almost where it
  was (1.1025 vs 1.1).

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
