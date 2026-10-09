# Equipment

## Slots

Main hand, off-hand, head, chest, hands, feet, ring, amulet. (Ring count is open.)

### Hands

- **Two-handed weapon:** bigger base values and its own trait; the off-hand stays empty.
- **One-handed weapon + off-hand**, where the off-hand is:
  - **Shield:** armor, HP, threat. No block.
  - **Focus / tome:** Mind, magic damage % or heal %.
- **No dual wield** for now: an off-hand is never a weapon. The main-hand weapon is the
  only source of attacks.

### Keeping dual wield possible later

Nothing should assume "weapon ⇒ main hand":

- **Allowed slots are data on the item base** (e.g. dagger: `[MainHand]`). Enabling dual
  wield later means adding `OffHand` to one-handed bases, not changing item storage.
- **Weapon effects are stored on the item regardless of slot**, so an off-hand weapon
  already carries everything combat needs.
- **Combat sums over attack sources** (combat.md), so an off-hand weapon is one more
  source with its own speed factor.

## Base characteristics

Every item has a **base** with fixed characteristics, including trade-offs.

### Balancing principle: same budget, different shape

At the same item level, every weapon family should have about the same expected DPS,
distributed differently. Families then win in different situations (armored zones favor
penetration, evasive builds favor fast hits) rather than one being strictly best.
*Example:* dagger 15 × 2.0/s = 30 DPS plus crit; greatsword 55 × 0.55/s ≈ 30 DPS plus
armor penetration.

### Weapons

A weapon's base defines **what one attack does**: a list of effects (damage of a type,
heal with a target, threat multiplier), plus attack speed and a trait.
*Illustrative:*

| Family | Hands | Type | Damage | Speed | Trait |
|---|---|---|---|---|---|
| Dagger | 1H | Phys | Low | Very fast | +Crit chance |
| Sword | 1H | Phys | Mid | Mid | Balanced |
| Mace | 1H | Phys | Mid | Slow | +Armor penetration |
| Katana | 2H | Phys | Mid | Fast | High crit chance and crit damage |
| Greatsword | 2H | Phys | Very high | Very slow | +Armor penetration |
| Bow | 2H | Phys | High | Mid | +Evasion |
| Wand | 1H | Magic | Low | Fast | +Magic penetration |
| Fire staff | 2H | Magic | Very high | Slow | Pure damage |
| Healing staff | 2H | Magic | Low | Mid | Heal, all allies |
| Holy mace | 1H | Phys | Mid-low | Slow | Heal, single target |

### Armor weights

Head, chest, hands and feet each come in three weights. Each piece carries its own
trade-off, so mixing weights is a build choice.

| Weight | Defense | Bonus | Penalty |
|---|---|---|---|
| Cloth | Low armor, high resistance | +Mind | none |
| Leather | Mid armor and resistance | +Finesse, +evasion | none |
| Plate | High armor, low resistance | +Vitality, +threat | −Attack speed % per piece |

### Jewelry

Ring and amulet have no weight. Their base is a small fixed bonus by type
(*illustrative:* ruby → HP, sapphire → resistance).

### Item level

Base values scale with item level, which comes from the zone the item dropped in:
`baseValue = familyTemplate × scale(itemLevel)`. The curve is open.

## Storage (literal)

- When an item drops, its final values are computed from the family template and item
  level and **saved on the item**: weapon effects, attack speed and every stat as
  `(statId, value)`.
- Rebalancing templates therefore changes **only new drops**; owned items never change.
- Values are **signed integers** (plate's attack-speed penalty is negative), in fixed
  units so no floating point is stored. *Proposed:* percentages in basis points
  (1 = 0.01%).
- Stat IDs follow the permanence rules in attributes.md.

## Rarity

Item stats = base stats (base type × tier) + affixes. Rarity never changes the base and
never limits affix tiers; it only sets **how many affixes** an item has. Every regular
affix rolls tier 1 to N (N = item tier).

| Rarity | Affixes |
|---|---|
| Common | 0 |
| Magic | 1 regular |
| Rare | 2 regular |
| Epic | 3 regular |
| Legendary | 2 regular + 1 legendary |
| Unique | Handcrafted; exists at one tier only, no scaling |

- Legendary is not strictly better than Epic: it trades one regular affix for a
  legendary affix. Intended.
- **Legendary affix:** a small stat bonus that scales with tier, plus a build-changing
  effect that is the same at every tier.
- **Uniques** can be anything (many stats, several effects); they only have to fit the
  combat formulas.
- **Effects are stored as an effect ID plus its numbers.** The numbers are literal; the
  behaviour behind an effect ID is code, so effect IDs are permanent and changing an
  effect's logic deliberately affects items already owned. Uniques reuse the same effect
  library as legendary affixes.

## Random affixes

- **Free pools:** any affix can roll on any item, and the **same affix can roll more than
  once** on one item. Wild combinations are intended.
- **Tier pick:** uniform over 1 to N.
- **Value:** each affix tier is a value **range**; the exact value is rolled and saved.
- **Growth:** linear per tier, the same curve as base stats.
- **Reference table:** every stat has a reference value per tier, `ref(stat, tier)`
  (e.g. tier-5 reference HP = 200). Affixes scale from this table, not from the item, so
  stats a base doesn't have still get a sensible value. Bases with an extreme trait (a
  katana's crit) deliberately exceed the reference.
- **Power budget:** averaged over all affixes that drop, an affix is worth **half** of
  `ref(stat, N)`; the best possible roll is **1×** `ref(stat, N)`. Kept low because an item
  can carry 3 affixes and duplicates are allowed.
- **Affix value formula:** affix tier k rolls uniformly in `[ref(k−1), ref(k)]`, with
  `ref(k) = c × k` (so `ref(0) = 0`). The bands sit end to end; the top of tier N is
  exactly `ref(N)`, and with uniform tier picks over 1..N the average is exactly
  `ref(N) / 2`. (Exact only while `ref` has no starting offset.)

  Example, HP with `ref = 40 × tier`, tier-5 item: tier 1 rolls 0–40, tier 2 40–80, …,
  tier 5 160–200. Best roll 200, average 100.
- Every affix needs a **stable ID**, under the same permanence rules as stat IDs, so
  saved filter rules keep working. Constraint from the
loot filter below: every affix needs a **stable ID**, under the same permanence rules as
stat IDs, so saved filter rules keep working.

## Loadouts

Players save several gear sets and switch between them (e.g. a farming set and a raid
set). Switching settles progress first, at the old stats. Loadout count, and whether one
item can be in several loadouts, are open.

## Loot filter and drop volume

An 8-hour offline session can produce hundreds of drops. Most must never become rows,
and the player shouldn't have to review them.

- **Per-player loot filter**, applied by the server when progress is settled:
  - **Rarity threshold:** drops below the chosen rarity are auto-salvaged.
  - **Affix whitelist:** drops carrying any of the chosen affixes are kept, even below
    the threshold.
  - Kept = rarity ≥ threshold **or** has a whitelisted affix. Everything else is
    salvaged straight into material counters.
- Players compare kept items themselves; the game does **not** grade items with an
  upgrade score.
- **Bag limit** (*illustrative:* 100) bounds storage. When the bag is full, further kept
  drops are salvaged.
- **Per-settle cap** on generated items (*illustrative:* 50); overflow is salvaged.
- Rough budget: 10,000 players × 100 items ≈ 1M rows ≈ 100 MB, within the free tier's 1 GB.

## Equipping

- Equipping is always a **manual, online action** in the equipment view.
- The equipment view has **one button** to equip upgrades for the current loadout. The
  player has to click it; it never runs automatically.
- **No auto-equip during offline progress.** A loadout's stats never change while the
  player is away.
