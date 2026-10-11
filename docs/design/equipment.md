# Equipment

## Slots

Main hand, off-hand, head, chest, hands, feet, **two rings**, amulet: 9 slots, so up to
27 affixes on a full set.

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

Every item has a **base** with fixed characteristics, including trade-offs. Concrete
templates and names per tier are in bases.md.

### Balancing principle: same budget, different shape

At the same item tier, every weapon family should have about the same expected DPS,
distributed differently. Families then win in different situations (armored zones favor
penetration, evasive builds favor fast hits) rather than one being strictly best.
*Example (T1):* sword 10 × 1.0/s = 10 DPS; dagger 4.75 × 2.0/s = 9.5 DPS plus crit;
greatsword 23.75 × 0.55/s ≈ 13 DPS (two-handed) plus armor penetration.

### Weapons

A weapon's base defines **what one attack does**: a list of effects (damage of a type,
heal with a target, threat multiplier), plus attack speed and a trait.
*Illustrative:*

| Family | Hands | Type | Damage | Speed | Base crit | Trait |
|---|---|---|---|---|---|---|
| Dagger | 1H | Phys | Low | Very fast | 8% | +Increased crit chance |
| Sword | 1H | Phys | Mid | Mid | 5% | Balanced |
| Mace | 1H | Phys | Mid | Slow | 5% | +Armor penetration |
| Katana | 2H | Phys | Mid | Fast | 10% | +Crit damage |
| Greatsword | 2H | Phys | Very high | Very slow | 5% | +Armor penetration |
| Bow | 2H | Phys | High | Mid | 6% | +Evasion rating |
| Wand | 1H | Magic | Low | Fast | 6% | +Magic penetration |
| Fire staff | 2H | Magic | Very high | Slow | 5% | Pure damage |
| Healing staff | 2H | Magic | Low | Mid | 5% | Heal, all allies |
| Holy mace | 1H | Phys | Mid-low | Slow | 5% | Heal, single target |

Base crit is stored on the weapon like attack speed (see crit in attributes.md).

### Armor weights

Head, chest, hands and feet each come in three weights. Each piece carries its own
trade-off, so mixing weights is a build choice.

| Weight | Defense | Bonus | Penalty |
|---|---|---|---|
| Cloth | Low armor, high resistance | +Mind | none |
| Leather | Mid armor and resistance | +Finesse, +evasion rating | none |
| Plate | High armor, low resistance | +Vitality, +threat | −Attack speed % per piece |

### Jewelry

Ring and amulet have no weight. Each **gem is its own base**, with 4 gems, one per
primary attribute (Might, Finesse, Mind, Vitality). The gem's name changes every 3
tiers (Ruby → Bloodstone → Magmaheart). Values and names are in bases.md.

### Item tier

Items come in **9 tiers**, tier 1 weakest, tier 9 strongest. The tier comes from the zone
the item dropped in. Base values follow the curves in attributes.md:
`baseValue = familyTemplate × curve(T)`.

- **Numbers start small**, in the spirit of Diablo 2 and Path of Exile 2: a level-1
  character has 100 HP, a T1 sword hits for 10, a T1 enemy has ~80 HP.
- **Damage grows ×2.1 per tier, HP ×1.6** (gear) — damage outgrows HP, as in those games.
  A sword hits 10 → 21 → 44 → 93 → 194 → 408 → 858 → 1,801 → 3,782 across the tiers.
- **Endgame:** an average T9 damage build hits ~8.5k (crits ~13k); with Rare/Epic gear
  hits reach ~10–20k. Players have ~4k HP at T9.
- Each new tier is a clear jump (×2.1 damage), so upgrades feel meaningful.

## Storage (literal)

- When an item drops, its final values are computed from the family template and item
  level and **saved on the item**: weapon effects, attack speed, base crit and every stat as
  `(statId, value)`.
- Rebalancing templates therefore changes **only new drops**; owned items never change.
- Values are **signed integers** (plate's attack-speed penalty is negative), in fixed
  units so no floating point is stored. *Proposed:* percentages in basis points
  (1 = 0.01%).
- Stat IDs follow the permanence rules in attributes.md.

## Rarity

Item stats = base stats (base type × tier) + affixes. Rarity never changes the base and
never limits affix tiers; it only sets **how many affixes** an item has. Every regular
affix rolls tier 1 to N (N = item tier, 1–9).

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
  effect that is the same at every tier. Legendary effects have no downside and stack
  up to a cap. The list, slot pools and formulas are in legendary.md.
- **Uniques** can be anything (many stats, several effects); they only have to fit the
  combat formulas.
- **Effects are stored as an effect ID plus its numbers.** The numbers are literal; the
  behaviour behind an effect ID is code, so effect IDs are permanent and changing an
  effect's logic deliberately affects items already owned. Uniques use the same effect
  library, plus unique-only effects that may carry a trade-off and don't stack.

## Random affixes

- **Free pools:** any affix can roll on any item, and the **same affix can roll more than
  once** on one item. Wild combinations are intended.
- **Weights:** each affix has a drop weight (*illustrative:* default 100). A low weight
  makes an affix rare without removing it from any pool (lifesteal: 10).
- **Affix tiers match item tiers:** 1–9. A tier-N item rolls affix tiers 1..N.
- **Tier pick:** uniform over 1 to N.
- **Value:** affix tier k has the **same range on every item tier**, and rolls uniformly
  in it (the exact value is saved). How the range is set depends on the stat's curve:
  - Evenly growing stats (`linear`, `percent`: primaries, %-stats, armor, resistance,
    evasion rating) split the T9 range `[0, ref(9)]` into 9 equal slices:
    tier k rolls in `[ref(9) × (k−1)/9, ref(9) × k/9]`. Finesse T1 is +1–4 on any item.
  - Fast-growing stats (`offense`, `life`, `heal`: flat damage, max HP, regen, heal)
    follow their curve: tier k rolls in `[ref(k−1), ref(k)]`, with `ref(0) = 0`.
    Flat physical damage T1 is +1–2, T3 is +4–9.
- **Reference table:** every stat has a reference value `ref(stat, N)`, the best possible
  roll on a tier-N item, following that stat's curve (attributes.md). Affixes scale from
  this table, not from the item, so stats a base doesn't have still get a sensible
  value. Bases with an extreme trait (a katana's crit) deliberately exceed the reference.
- **Power budget:** best roll `ref(N)` for fast-growing stats, `ref(9) × N/9` for evenly
  growing ones; the average is the mean of tiers 1..N's midpoints, so low-tier items
  carry weak affixes and higher item tiers raise the ceiling. Kept low because an item
  can carry 3 affixes and duplicates are allowed.
- Affix tier is global: "T3 Finesse" is the same range on a T3 and a T9 item. Fast-growing
  stats follow their curve so their low tiers stay sensible next to low-tier bases.

  Example, max HP (life curve, `ref(k) = 20 × 1.6^(k−1)`): T1 rolls 0–20, T2 20–32,
  T3 32–51, T4 51–82, T5 82–131. On a T5 item the average is ≈ 50.
  Example, physical damage % (`ref(9) = 30%`): every tier is a 3.3% slice, T1 0–3.3%,
  …, T9 26.7–30%. A T3 item rolls 0–10% (average 5%), a T9 item 0–30% (average 15%).
- Every affix needs a **stable ID**, under the same permanence rules as stat IDs, so
  saved loot-filter rules keep working.

## Loadouts

Players save **4 gear sets** and switch between them (e.g. a farming set and a raid
set). Switching settles progress first, at the old stats.

- A loadout references items, so **one item can be in several loadouts**.
- Items in any loadout don't count toward the bag limit.

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
- **Bag limit:** 200, expandable to 400 with gold (crafting.md). When the bag is full,
  further kept drops are salvaged.
- **Salvage** turns items into Essence (values in crafting.md).
- **Per-settle cap** on kept items (*illustrative:* 50), applied after the filter; when
  it overflows, the lowest rarities are salvaged first, so a cap never eats an Epic.
- Rough budget: 10,000 players × 200 items ≈ 2M rows ≈ 200 MB (400 MB if everyone
  maxes the bag), within the free tier's 1 GB.

## Equipping

- Equipping is always a **manual, online action** in the equipment view.
- The equipment view has **one button** to equip upgrades for the current loadout. The
  player has to click it; it never runs automatically.
- **No auto-equip during offline progress.** A loadout's stats never change while the
  player is away.

### Auto-equip profiles

The button equips the best items from the bag for the loadout's **profile**. It never
looks at the current zone or target enemy, so its result only depends on the items.

- **Profiles** (picked next to the button, saved per loadout):
  - **Damage:** maximize DPS, with time to die as the tie-breaker.
  - **Survival:** maximize time to die, with DPS as the tie-breaker.
  - **Loot:** maximize DPS × (1 + item find%), with gold find, XP gain and time to die
    as tie-breakers.
- **Near ties.** Values within 1% of each other count as tied, so the next value
  decides: a sliver of DPS from a few Finesse doesn't beat a big survival gain. A strict
  search first finds the best goal value, and the result never ends more than 1% below
  it, so small trades can't add up.
- **Reference dummy.** DPS and time to die are computed with the normal combat formulas
  against a fixed dummy instead of a real enemy:
  - level = the character's level;
  - Balanced defenses (`2.5 × level` armor and resistance, so 33% mitigation);
  - the average enemy's DPS for that level, `16 × 1.42^(level/10 − 1)` (zones.md);
  - deals 50% physical and 50% magic damage, so armor and resistance count equally.
- **Search:** go slot by slot and try every bag item that fits; keep the best; repeat
  until nothing improves (2–3 passes). Hands are tried as whole options: one two-hander,
  or a one-hander plus an off-hand. With 200 items this is a few thousand formula
  evaluations, cheap enough for a reducer.
- **Equips directly** on click, then shows what changed (items swapped and the totals
  before and after). It shows loadout totals only, never a score per item, in line with
  "no upgrade score on items".
- Like any equip, it settles progress first at the old stats.
- It can pick a build that can't beat the player's current target. The player sees that
  in the zone view (the normal viability check) and picks a different target or profile.
