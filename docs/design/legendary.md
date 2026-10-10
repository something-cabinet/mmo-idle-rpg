# Legendary affixes

A Legendary item has 2 regular affixes + 1 **legendary affix** (equipment.md). A legendary
affix is:

- a **small stat bonus** that scales with item tier, and
- a **build-changing effect** that is the same at every tier.

Uniques reuse the same effect library.

## Rules

- **Three groups, chosen by equip type:**

  | Equip type | Rolls from |
  |---|---|
  | Weapons and tome | **Offense** |
  | Armor (head, chest, hands, feet) and shield | **Defense** |
  | Rings and amulet | **Utility** |

  Within its group, an item rolls any legendary affix with equal weight. Which effect
  lands on which item is deliberately unpredictable.
- **Every effect works on any build** in its group, so no roll is dead (e.g. Spellblade
  swaps damage type both ways, so it does something on a sword and on a wand).
- **Effect IDs are permanent**, like stat IDs: the effect's behaviour is code, so
  changing it deliberately changes every item that has it.
- **Small stat bonus:** rolls uniformly in `[0.25, 0.5] × ref(stat, N)` (attributes.md),
  i.e. up to half a regular affix's best roll.
- **Effects don't stack:** wearing the same legendary affix twice applies the effect
  **once**; the small stat bonuses still add up.
- **Closed form:** every effect changes a term in the combat formulas (combat.md), so
  settlement stays exact online and offline.
- **Epic → Legendary crafting** (crafting.md) rolls from the same group.

## Offense (weapons, tome)

| ID | Name | Stat bonus | Effect |
|---|---|---|---|
| 1 | **Overcrit** | Increased crit chance % | Crit chance above 100% isn't wasted: each 1% of excess gives +2% crit damage. |
| 2 | **Spellblade** | Magic damage % | Your damage **swaps type**: physical becomes magic, magic becomes physical. Both damage-% groups apply. |
| 3 | **Zealot's Oath** | Heal % | Your heals also damage the enemy for 50% of the heal amount, and your damage heals you for 5% of the damage dealt. |
| 10 | **Voidtouched** | Physical damage % | Your damage **ignores the enemy's armor and resistance**, but deals 25% less. |
| 11 | **Glass Cannon** | Crit damage | **All damage ×2, max HP halved.** |

```
Overcrit:     critDamage += 2 × max(0, critChance − 1)
Spellblade:   each damage term moves to the other type; damage multiplier =
              (1 + phys% + magic% + Might and Mind bonuses)
Zealot:       DPS_you += 0.5 × HPS_self      (magic, uses enemy resistance)
              HPS_self += 0.05 × DPS_you     (after enemy mitigation)
Voidtouched:  enemy mitigation = 0;  damage × 0.75
Glass Cannon: damage × 2;  maxHP × 0.5
```

- Zealot's Oath is a healer's damage boost on a heal weapon and a 5% lifesteal on
  anything else (above the 3% lifesteal cap for affixes; legendary effects may exceed
  affix caps).
- Glass Cannon is the riskiest effect; −50% HP is a starting value to tune with
  simulation.

## Defense (armor, shield)

| ID | Name | Stat bonus | Effect |
|---|---|---|---|
| 4 | **Juggernaut** | Armor % | You can't evade, but **armor also reduces magic damage**. |
| 12 | **Spellward** | Resistance % | You can't evade, but **resistance also reduces physical damage**. |
| 5 | **Phantom Step** | Evasion rating % | Evasion cap rises from 60% to **75%**. |
| 6 | **Thornshell** | Max HP % | Reflects 40% of the damage you take (after mitigation) back at the enemy. |

```
Juggernaut:   evasion = 0;  mitigation vs magic    = mitigation(max(armor, resistance))
Spellward:    evasion = 0;  mitigation vs physical = mitigation(max(armor, resistance))
              (both together: both damage types use the better of the two)
Phantom Step: evasion = min(0.75, r / (r + 10 × enemyLevel))
Thornshell:   DPS_you += 0.4 × DPS_enemy_after_mitigation   (physical, uses enemy armor)
```

- Juggernaut + Spellward together is allowed: both cost evasion, and a character
  rarely has high armor and high resistance at once.

## Utility (rings, amulet)

| ID | Name | Stat bonus | Effect |
|---|---|---|---|
| 7 | **Swift Hunter** | Attack speed % | Respawn time is halved (5 s → 2.5 s). |
| 8 | **Midas Touch** | Gold find % | Kills give **no XP**, but gold × 2.5. |
| 13 | **Scholar's Focus** | XP gain % | XP × 1.75, gold × 0.5. |
| 9 | **Fortune's Favor** | Item find % | Each **kept** drop has a 15% chance to be upgraded one rarity (max Legendary). |

```
Swift Hunter:    killRate = 1 / (timeToKill + respawnTime × 0.5)
Midas Touch:     xp = 0;  gold × 2.5
Scholar's Focus: xp × 1.75;  gold × 0.5
Fortune's Favor: after the loot filter, each kept item rolls 15%: rarity + 1
                 (an upgrade to Magic/Rare/Epic adds one random affix; to Legendary
                 removes one random regular affix and adds a legendary affix)
```

- Midas Touch + Scholar's Focus together: both apply (xp × 0 = 0, gold × 1.25). Wearing
  both is a mistake the item view should point out.
- Fortune's Favor upgrades only kept items, so it costs the server a few rolls per
  settle, not one per kill.

## Open

- Spare ideas: Second Wind (once per fight, survive a killing blow at 50% HP),
  Executioner (enemies below 30% HP take double damage), Scavenger (salvage gives
  double Essence).
