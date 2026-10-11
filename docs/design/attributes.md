# Attributes

Two layers: four **primary attributes** that grow with level, and **combat stats** that
the formulas in combat.md use. Most power comes from gear.

## Leveling

**Max level 100.** The XP curve is built from time targets: a reference player farming
the matching tier (zones.md) should need about `0.1 h × 1.07^L` for level L.

```
xpToNext(L) = 166 × 1.19^L          // *illustrative*
```

- Where 1.19 ≈ 1.07 (time growth) × 2.9^(1/10) (XP per kill ×2.9 per 10 levels).
- XP needed reaches billions near the cap: store XP as a 64-bit integer.

| Level | XP to next | Hours for this level | Total time (24/7 farming) |
|---|---|---|---|
| 1 | 198 | 2 min | — |
| 10 | 945 | 12 min | 1 h |
| 20 | 5,383 | 23 min | 4 h |
| 30 | 30,656 | 45 min | 10 h |
| 40 | 174,577 | 1.5 h | 21 h |
| 50 | 994,160 | 3 h | 1.8 days |
| 60 | 5.7M | 6 h | 3.6 days |
| 70 | 32M | 11 h | 7 days |
| 80 | 184M | 22 h | 14 days |
| 90 | 1.05B | 44 h | 28 days |
| 95 | 2.5B | 4.3 days | 44 days |
| 99 | 5.0B | 8.7 days | 71 days |

- Players aren't online or offline-capped 24/7: with ~3 check-ins a day, real time is
  about 1.3× longer, so **level 90 in ~5 weeks, level 100 in ~3 months**.
- Better gear and stronger targets are faster than the reference player.
- **Levels 90–100 are a long chase:** there is no tier 10, so XP per hour stops
  growing while XP needed keeps rising. Intended as an endgame goal; a tier 10 later
  would shorten it.

## Primary attributes

A level-1 character has **100 HP and 1 of each primary**. Every level-up gives **+1 to
all four primaries** and **+10 max HP** (level 10: 190 HP, level 100: 1,090 HP before
gear). There is no point allocation. Gear can also add primaries, which
is where they differ between builds.

Each point is a percentage bonus, so primaries stay relevant as gear grows. Each
primary is a bundle of percent bonuses. Per-point values are set so a best-roll primary
affix (40 points, see the reference table) is worth about **1.2 affixes**: a bundle is
worth a little more than one affix because a build rarely uses every stat in it.
*Illustrative values:*

| Primary | Per point | At 40 points |
|---|---|---|
| **Might** | +0.5% physical damage, +0.2% max HP | +20% phys, +8% HP |
| **Finesse** | +0.1% attack speed, +0.4% increased crit chance, +0.25% evasion rating | +4% AS, +16% crit, +10% eva |
| **Mind** | +0.45% magic damage, +0.45% heal | +18% magic, +18% heal |
| **Vitality** | +0.25% max HP, +1% HP regen, +0.25% threat | +10% HP, +40% regen, +10% threat |

All primary bonuses go into the **percent** sums of their stats (see combat.md
aggregation). Finesse's crit and evasion bonuses are *increased* modifiers like every
other crit/evasion percent, not chance.

At level 100 the level-up primaries alone give every character e.g. +50% physical
damage and +20% max HP from Might. Enemy curves must account for this.

## Crit

PoE2-style: crit chance starts from the **weapon's base crit chance** and is scaled by
"increased crit chance" modifiers.

```
critChance(source) = source.weapon.baseCrit × (1 + Σ increased crit chance%)     // uncapped
critDamage         = 150% + Σ crit damage
```

- Base crit is part of the weapon family (equipment.md), e.g. sword 5%, dagger 8%,
  katana 10%.
- Increased crit chance from all sources (affixes, Finesse, bases) stacks
  **additively**: +20% and +30% give +50%, so a 10% base becomes 15%.
- **No cap.** Crit chance is shown and stored above 100%, but the hit roll uses at most
  100%, so the excess does nothing for now. It is reserved for future legendary
  affixes that scale with it (e.g. excess crit chance turned into crit damage).
- Crit chance is per attack source, since each source has its own weapon.
- Crits apply to heals too.

## Evasion

Evasion is a **rating** with diminishing returns against the attacker's level, like
armor:

```
evasion = min(60%, r / (r + 10 × enemyLevel))     r = final evasion rating
```

The constant is twice armor's (5) because evasion avoids every damage type. The 60%
cap is hard.

## Combat stats

Gear rolls these directly, in **flat** and/or **percent** form.

**Draft IDs.** Once the first item is saved, IDs are permanent: new stats get new IDs,
and existing IDs are never reused, renumbered or redefined.

| ID | Stat | Form | Cap / base | Used for |
|---|---|---|---|---|
| 1 | Physical damage | flat | | Kill speed |
| 2 | Physical damage | % | | Kill speed |
| 3 | Magic damage | flat | | Kill speed |
| 4 | Magic damage | % | | Kill speed |
| 5 | Attack speed | % | floor 25% of weapon | Kill speed |
| 6 | Crit chance | % increased | base from weapon, no cap (excess over 100% unused) | Kill speed, heals |
| 7 | Crit damage | % points | base 150% | Kill speed, heals |
| 8 | Armor penetration | % | cap 75% | Kill speed vs Armor |
| 9 | Magic penetration | % | cap 75% | Kill speed vs Resistance |
| 10 | Max HP | flat | | Survival |
| 11 | Max HP | % | | Survival |
| 12 | Armor | flat | | Survival vs physical |
| 13 | Armor | % | | Survival vs physical |
| 14 | Resistance | flat | | Survival vs magic |
| 15 | Resistance | % | | Survival vs magic |
| 16 | Evasion rating | flat | final chance cap 60% | Survival |
| 17 | HP regen | flat /s | | Survival |
| 18 | Lifesteal | % | cap 3%, rare affix | Survival |
| 19 | Heal | flat | | Heal power |
| 20 | Heal | % | | Heal power |
| 21 | Threat | % | | Raid tanking |
| 22 | Item find | % | | Drop chance |
| 23 | Gold find | % | | Gold |
| 24 | XP gain | % | | XP |
| 25 | Might | flat | | Primary |
| 26 | Finesse | flat | | Primary |
| 27 | Mind | flat | | Primary |
| 28 | Vitality | flat | | Primary |
| 29 | Evasion rating | % | | Survival |

- **Flat added damage and heal (1, 3, 19)** are worth the same DPS on every weapon:
  per hit they add `value × 1.0 / weapon base speed` (combat.md), so a 2.0/s dagger
  adds half per hit and a 0.55/s greatsword adds ~1.8×.
- **Heal (19, 20)** only scales heal effects on a weapon. A weapon without a heal
  effect gets nothing from it.
- **Lifesteal** is deliberately tiny and rare: low affix values, low drop weight and a
  3% cap, so it can't make every zone viable on its own.
- **Penetration cap (75%)** is needed because percent affixes can stack across ~27
  affix slots.

## Affix reference table

Items and affixes have **9 tiers**. Every stat has a reference value `ref(stat, N)`: the
best possible roll on a tier-N item (rolling rules in equipment.md).

Numbers start small and grow on **separate curves**, like Diablo 2 and Path of Exile 2,
where damage grows far more than HP:

| Curve | Per tier | T1 → T9 | Used by |
|---|---|---|---|
| **Offense** | ×2.1 | ×378 | Weapon damage, flat added damage, enemy HP |
| **Life** | ×1.6 | ×43 | Gear HP, HP regen |
| **Heal** | ×1.33 | ×10 | Weapon heal, flat added heal |
| **Linear** | ×T | ×9 | Armor, resistance, evasion rating (their formulas use level, which is linear) |
| **Percent** | `(N + 3) / 12` | ×3 | Percent stats and primaries |

- Percent stats grow slowly because they multiply flat values that already grow.
- Heal grows slower than enemy damage because the heal multiplier (Mind, heal %) keeps
  growing with level and gear; the net keeps healers at ~70–85% coverage (bases.md).

### Flat stats (*illustrative*)

Item tier N matches enemy level `10 × N` on average (zones.md).

| Stat | ref at T1 | Curve | ref at T9 | Notes |
|---|---|---|---|---|
| Physical damage (added) | 2 | Offense | 756 | Straight bonus per hit: worth more on fast weapons |
| Magic damage (added) | 2 | Offense | 756 | Same |
| Max HP | 20 | Life | 860 | |
| HP regen (/s) | 0.5 | Life | 21 | |
| Heal (added) | 2 | Heal | 20 | Straight bonus per hit: worth more on fast weapons |
| Armor | 5 | Linear | 45 | One best roll ≈ 9% mitigation vs a matching enemy |
| Resistance | 5 | Linear | 45 | Same as armor |
| Evasion rating | 5 | Linear | 45 | One best roll ≈ 5% evasion vs a matching enemy |

**Item values are whole numbers.** Every rolled or computed value on an item (affixes,
implicits, legendary bonuses, weapon hit and heal) is rounded to the nearest whole
number, and never below 1 (a T1 flat damage roll is 1 or 2). Only the very small stats
keep two decimals: **lifesteal** (best T1 roll ≈ 0.17%) and **HP regen** (best T1 roll
0.5/s). Values are still stored in hundredths, so those two fit the same column.

### Percent stats (*illustrative*)

Anchor: the best roll of a build's main stat adds roughly 10–20% to that build's
output, after the bonus from level primaries.

| Stat | T9 best roll P | Notes |
|---|---|---|
| Physical / magic damage % | 30% | |
| Attack speed % | 10% | Scales damage and heals, so lower |
| Increased crit chance % | 40% | 5% base → 7% |
| Crit damage | +30 points | 150% → 180% |
| Armor / magic penetration % | 15% | Cap 75% |
| Max HP % | 15% | |
| Armor / resistance / evasion % | 25% | |
| Heal % | 30% | |
| Threat % | 30% | |
| Lifesteal % | 0.5% | Weight 10 (rare), cap 3% |
| Item find % | 15% | |
| Gold find % | 20% | |
| XP gain % | 10% | |
| Might / Finesse / Mind / Vitality | 40 points | ≈ 1.2 affixes, see primaries |

## Roles

Roles emerge from weapon choice plus where gear puts stats:

| Role | Weapon | Stats |
|---|---|---|
| DPS | Damage-focused weapon | Offense |
| Tank | Shield or plate-friendly weapon | Armor, Resistance, HP, Threat |
| Healer | Heal weapon (e.g. healing staff) | Heal, Mind |
| Farmer | Any viable weapon | Item find, Gold find, XP gain |

Heal and Threat matter mainly in raids. Solo, heals land on yourself, so healers can
still farm: they kill slowly but sustain through zones a glass cannon can't survive.
Players switch between farming and raid builds with loadouts.
