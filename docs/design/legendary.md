# Legendary and unique affixes

A Legendary item has 2 regular affixes + 1 **legendary affix** (equipment.md). A legendary
affix is:

- a **small stat bonus** that scales with item tier, and
- a **build-changing effect** that is the same at every tier.

Effects come in two kinds:

| | Legendary effect | Unique effect |
|---|---|---|
| Downside | **None**: only positive | May cost something (a trade-off) |
| Where | Rolls on Legendary items (and crafting, Fortune's Favor) | Handcrafted uniques only; never rolls |
| Stacking | **Stacks** up to a cap | **Doesn't stack**: applies once |

## Rules

- **Three groups, chosen by equip type:**

  | Equip type | Rolls from | Copies you can wear |
  |---|---|---|
  | Weapons and tome | **Offense** | 2 (main hand + tome) |
  | Armor (head, chest, hands, feet) and shield | **Defense** | 5 |
  | Rings and amulet | **Utility** | 3 |

  Within its group, an item rolls any legendary effect with equal weight. Which effect
  lands on which item is deliberately unpredictable.
- **Every effect works on any build** in its group, so no roll is dead. Where an effect
  would only suit one damage or defense type, it has a counterpart (Rending /
  Spellbreaker, Ironclad / Runeguard).
- **One copy is already worth it.** Stacking is an option, not the plan: each copy adds
  the per-copy amount again, up to a **cap**; copies past the cap are wasted (the UI
  says so). `amount = min(cap, perCopy × copies)`.
- **Effect IDs are permanent**, like stat IDs: the effect's behaviour is code, so
  changing it deliberately changes every item that has it.
- **Small stat bonus:** rolls uniformly in `[0.25, 0.5] × ref(stat, N)` (attributes.md),
  i.e. up to half a regular affix's best roll. Bonuses always add up.
- **Closed form:** every effect changes a term in the combat formulas (combat.md), so
  settlement stays exact online and offline.
- **Epic → Legendary crafting** (crafting.md) rolls from the same group.

## Offense (weapons, tome)

| ID | Name | Stat bonus | Per copy | Cap |
|---|---|---|---|---|
| 1 | **Overcrit** | Increased crit chance % | Each 1% of crit chance above 100% gives **+2% crit damage** | none |
| 3 | **Zealot's Oath** | Heal % | Your heals also damage the enemy for **50%** of the heal (magic) | none |
| 14 | **Executioner** | Physical damage % | Enemies below **30%** HP take double damage | 50% |
| 15 | **Rending** | Armor penetration % | Your physical damage ignores **40%** of the enemy's armor mitigation left after penetration | 70% |
| 21 | **Spellbreaker** | Magic penetration % | Your magic damage ignores **40%** of the enemy's resistance mitigation left after penetration | 70% |

```
Overcrit:     critDamage += a × max(0, critChance − 1)            a = 2 per copy
Zealot:       DPS_you += a × HPS_self      (magic, uses enemy resistance)
Executioner:  timeToKill × (1 − a / 2)     (the last a of the HP goes twice as fast)
Rending:      enemy mitigation vs physical × (1 − a)
Spellbreaker: enemy mitigation vs magic × (1 − a)
```

- Zealot's Oath runs one way only (heal → damage), so it can't loop.
- Executioner doesn't change DPS: live fights double each hit once the enemy is below the
  threshold.

## Defense (armor, shield)

| ID | Name | Stat bonus | Per copy | Cap |
|---|---|---|---|---|
| 5 | **Phantom Step** | Evasion rating % | Evasion cap **+15%** (60% → 75%) | +25% (85%) |
| 6 | **Thornshell** | Max HP % | Reflects **40%** of the damage you take (after mitigation) | 100% |
| 16 | **Second Wind** | HP regen | Once per fight, a killing blow leaves you at **50%** HP instead | 100% |
| 17 | **Ironclad** | Armor % | **30%** of your armor is added to your resistance | 100% |
| 18 | **Runeguard** | Resistance % | **30%** of your resistance is added to your armor | 100% |

```
Phantom Step: evasion = min(0.60 + a, r / (r + 10 × enemyLevel))
Thornshell:   DPS_you += a × DPS_enemy_after_mitigation   (physical, uses enemy armor)
Second Wind:  timeToDie = maxHp × (1 + a) / netIncoming
Ironclad:     resistance += a × armor        (both from the values before conversion,
Runeguard:    armor      += a × resistance    so wearing both doesn't loop)
```

## Utility (rings, amulet)

| ID | Name | Stat bonus | Per copy | Cap |
|---|---|---|---|---|
| 7 | **Swift Hunter** | Attack speed % | Walk time **−40%** | −80% |
| 9 | **Fortune's Favor** | Item find % | Each **kept** drop has a **15%** chance to be upgraded one rarity (max Legendary) | 30% |
| 19 | **Seasoned** | XP gain % | Offline progress cap **+4h** (8h → 12h) | +8h (16h) |
| 20 | **Prosperity** | Gold find % | Gold **× 1.4** | × 1.6 |

```
Swift Hunter:    killRate = 1 / (timeToKill + walkTime × (1 − a))
Fortune's Favor: after the loot filter, each kept item rolls a: rarity + 1
                 (an upgrade to Magic/Rare/Epic adds one random affix; to Legendary
                 removes one random regular affix and adds a legendary affix)
Seasoned:        offline cap = 8h + a      (the gear worn at login decides)
Prosperity:      gold × (1 + a)
```

- Fortune's Favor upgrades only kept items, so it costs the server a few rolls per
  settle, not one per kill.

## Unique effects

Handcrafted uniques (uniques.md) carry these. They never roll on Legendary items and
apply **once** however many items carry them. Legendary items that rolled them before
this split keep working.

| ID | Name | Effect |
|---|---|---|
| 2 | **Spellblade** | Your damage **swaps type**: physical becomes magic, magic becomes physical. Both damage-% groups apply. |
| 4 | **Juggernaut** | You can't evade, but **armor also reduces magic damage**. |
| 8 | **Midas Touch** | Kills give **no XP**, but gold × 2.5. |
| 10 | **Voidtouched** | Your damage **ignores the enemy's armor and resistance**, but deals 25% less. |
| 11 | **Glass Cannon** | **All damage ×2, max HP halved.** |
| 12 | **Spellward** | You can't evade, but **resistance also reduces physical damage**. |
| 13 | **Scholar's Focus** | XP × 1.75, gold × 0.5. |

```
Spellblade:   each damage term moves to the other type; damage multiplier =
              (1 + phys% + magic% + Might and Mind bonuses)
Juggernaut:   evasion = 0;  mitigation vs magic    = mitigation(max(armor, resistance))
Spellward:    evasion = 0;  mitigation vs physical = mitigation(max(armor, resistance))
              (both together: both damage types use the better of the two)
Midas Touch:  xp = 0;  gold × 2.5
Voidtouched:  enemy mitigation = 0;  damage × 0.75
Glass Cannon: damage × 2;  maxHP × 0.5
Scholar's:    xp × 1.75;  gold × 0.5
```

- Damage from Zealot's Oath and Thornshell counts as your damage: Glass Cannon's ×2
  and Voidtouched (no enemy mitigation, ×0.75) apply to it too.
- Midas Touch + Scholar's Focus together: both apply (xp × 0 = 0, gold × 1.25). The
  effects card points this out.

## Open

- Per-copy amounts and caps are starting values to tune with simulation.
