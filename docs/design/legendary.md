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
- **Stat bonus:** half a regular affix roll of the item's top affix tier (affix tier N on
  a tier-N item, attributes.md), halved before rounding. Bonuses always add up.
- **Closed form:** every effect changes a term in the combat formulas (combat.md), so
  settlement stays exact online and offline.
- **Epic → Legendary crafting** (crafting.md) rolls from the same group.

## Offense (weapons, tome)

| ID | Name | Stat bonus | Per copy | Cap |
|---|---|---|---|---|
| 1 | **Overcrit** | Base crit chance | Each 1% of crit chance above 100% gives **+2% crit damage** | none |
| 3 | **Zealot's Oath** | Heal % | Your heals also damage the enemy for **50%** of the heal (magic) | none |
| 14 | **Executioner** | Physical damage % | You deal **100% more damage** to enemies below **30%** HP | 50% |
| 15 | **Rending** | Armor penetration % | Your physical damage ignores **40%** of the enemy's armor mitigation left after penetration | 70% |
| 21 | **Spellbreaker** | Magic penetration % | Your magic damage ignores **40%** of the enemy's resistance mitigation left after penetration | 70% |
| 25 | **Follow-through** | Crit damage | **60%** of your overkill damage hits the next enemy as it arrives | 120% |
| 26 | **Riposte** | Evasion rating % | Each attack you evade counters for **50%** of your average hit | 100% |
| 27 | **Deadeye** | Increased crit chance | Your crits ignore **50%** of the enemy's armor and resistance mitigation left after penetration | 100% |
| 28 | **Bully** | Magic damage % | You deal **100% more damage** to enemies above **70%** HP | 50% (above 50%) |
| 29 | **Honed Edge** | Attack speed % | **50% more** flat added damage (a negative flat roll is left as it is) | +100% |
| 30 | **Bloodthirst** | Lifesteal % | Lifesteal cap **+5%** (10% → 15%) | +10% (20%) |
| 31 | **Discipline** | Attack speed % | **10% more damage** per 100 points of your highest attribute | 20% per 100 |

```
Overcrit:       critDamage += a × max(0, critChance − 1)            a = 2 per copy
Zealot:         DPS_you += a × HPS_self      (magic, uses enemy resistance)
Executioner:    timeToKill × (1 − a / 2)     (the last a of the HP goes twice as fast)
Rending:        enemy mitigation vs physical × (1 − a)
Spellbreaker:   enemy mitigation vs magic × (1 − a)
Follow-through: timeToKill −= a × 0.5 / attacksPerSec   (the kill overkills by half an average hit)
Riposte:        DPS_you += a × evasion × enemySpeed × averageHit
Deadeye:        crits use enemy mitigation × (1 − a): critMult = 1 − c + c × critDamage × pierced / normal
Bully:          timeToKill × (1 − (aExecutioner + aBully) / 2)
Honed Edge:     addedFlat_t × (1 + a)        (only when addedFlat_t > 0)
Bloodthirst:    lifesteal cap = 10% + a
Discipline:     hit × (1 + a × max(Might, Finesse, Mind, Vitality) / 100)   (after damage %)
```

- Zealot's Oath runs one way only (heal → damage), so it can't loop.
- Executioner and Bully don't change DPS: live fights double each hit while the enemy is
  below (above) the threshold. Their caps keep the two ranges apart.
- Follow-through: each live fight starts with the **average** overkill landing as the
  enemy arrives (shown as a hit), so every fight stays self-contained and replays the
  same. It does nothing in raids (there is no next enemy).
- Riposte damage is your damage: like Thornshell it folds into your hits in live fights.

## Defense (armor, shield)

| ID | Name | Stat bonus | Per copy | Cap |
|---|---|---|---|---|
| 5 | **Phantom Step** | Evasion rating % | Evasion cap **+15%** (60% → 75%) | +25% (85%) |
| 6 | **Thornshell** | Max HP % | Reflects **40%** of the damage you take (after mitigation) | 100% |
| 16 | **Second Wind** | HP regen | Once per fight, a killing blow leaves you at **50%** HP instead | 100% |
| 17 | **Ironclad** | Armor % | **30%** of your armor is added to your resistance | 100% |
| 18 | **Runeguard** | Resistance % | **30%** of your resistance is added to your armor | 100% |
| 32 | **Unbreakable** | Resistance | Armor and resistance cap **+5%** (85% → 90%) | +10% (95%) |
| 33 | **Stoneskin** | Armor | Each enemy hit is reduced by a flat **1%** of your max HP (after mitigation) | 3% |
| 34 | **Last Stand** | Vitality | Below 30% HP, you take **20%** less damage | 50% |
| 35 | **Berserker** | Might | **3% more damage** per 10% of your max HP missing | +9% |
| 36 | **Bulwark** | Evasion rating | **15%** chance to block half of each enemy hit | 50% |
| 49 | **Afterimage** | Evasion rating | After you evade, the enemy's **next hit deals 50% less** | 75% |
| 37 | **Second Skin** | Max HP | Each fight starts with a shield of **15%** of your max HP | 50% |

```
Phantom Step: evasion = min(0.60 + a, r / (r + 10 × enemyLevel))
Thornshell:   DPS_you += a × DPS_enemy_after_mitigation   (in the type taken: enemy armor against physical, resistance against magic)
Second Wind:  timeToDie = maxHp × (1 + a) / netIncoming
Ironclad:     resistance += a × armor        (both from the values before conversion,
Runeguard:    armor      += a × resistance    so wearing both doesn't loop)
Unbreakable:  your mitigation = min(0.85 + a, d / (d + 5 × level))
Stoneskin:    enemyHit = max(0, hit after mitigation − a × maxHp)
Bulwark:      incoming × (1 − a / 2)
Afterimage:   incoming × (1 − a × evasion)   // P(previous attack was evaded) = evasion
Second Skin:  shield S = a × maxHp, gone after S / incoming seconds (HP stays full meanwhile,
              so sustain does nothing)
Last Stand:   below L = 30% × maxHp the drain is netLow = netIncoming − a × incoming
              drain(h) = max(0, h − L) / netIncoming + min(h, L) / netLow
              timeToDie = S / incoming + drain(maxHp) + drain(aSecondWind × maxHp)
              (∞ if netLow ≤ 0: sustain holds you below 30%)
Berserker:    damage × (1 + 10a × missing / maxHp). Missing HP grows at netIncoming after
              the shield, so enemyHP = DPS × (T + α (T − tS)²), α = 10a × netIncoming / (2 maxHp):
              timeToKill = tS + (√(1 + 4α × hpLeft / DPS) − 1) / (2α)
```

- Last Stand, Second Skin and Second Wind combine as above: the shield goes first, then
  HP, then Second Wind's second life.
- Berserker's closed form ignores Last Stand and Second Wind (live fights include them).

## Utility (rings, amulet)

| ID | Name | Stat bonus | Per copy | Cap |
|---|---|---|---|---|
| 7 | **Swift Hunter** | Attack speed % | Walk time **−40%** | −80% |
| 9 | **Fortune's Favor** | Item find % | Each **kept** drop has a **10%** chance to be upgraded one rarity (max Legendary) | 30% |
| 19 | **Seasoned** | XP gain % | Offline progress cap **+4h** (8h → 12h) | +8h (16h) |
| 20 | **Prosperity** | Gold find % | **40% more** gold | 60% more |
| 38 | **Salvager** | Gold find % | Each drop the loot filter or a full bag rejects has a **25%** chance to be salvaged (or recycled) twice | 50% |
| 39 | **Bounty** | Item find % | Every **200** kills of an enemy, an extra Rare drops | every 67 |
| 40 | **Prospector** | Max HP | Kills drop **0.1** Ore of the zone's tier on average | 0.3 |
| 41 | **Patience** | XP gain % | Offline fighting past the first 4h earns **15% more** XP, gold, drops and materials | 30% more |
| 42 | **Keen Eye** | Item find % | Kept Rare or better drops have a **20%** chance to raise their lowest affix to the item's top affix tier | 40% |
| 43 | **Savor** | Max HP % | Each kill has a **15%** chance not to use a charge of your elixir | 30% |
| 44 | **Raid Favor** | Threat % | Each rewarded raid clear has a **15%** chance to give one more item | 30% |

```
Swift Hunter:    killRate = 1 / (timeToKill + walkTime × (1 − a))
Fortune's Favor: after the loot filter, each kept item rolls a: rarity + 1
                 (an upgrade to Magic/Rare/Epic adds one random affix; to Legendary
                 removes one random regular affix and adds a legendary affix)
Seasoned:        offline cap = 8h + a      (the gear worn at login decides)
Prosperity:      gold × (1 + a)
Salvager:        each rejected drop rolls a (own generator): Dust, gold or recycled materials × 2
Bounty:          extra Rares = ⌊(before + kills) × a⌋ − ⌊before × a⌋   (before = kills of
                 this enemy so far, so the count carries across settles)
Prospector:      Ore ~ Poisson(kills × a)   (own generator; enemies otherwise never drop Ore)
Patience:        login settle only: kills after 4h of the time away earn × (1 + a) XP and
                 gold, and add a × kills to the kills drops and materials are rolled from
Keen Eye:        after Fortune's Favor, each kept Rare+ rolls a: the lowest-tier regular
                 affix moves to the item's tier, at the same place in the range
Savor:           offline: charges used = round(kills × (1 − a)); online: each kill rolls a
Raid Favor:      after the clear's items, one roll of a for one more
```

- Fortune's Favor upgrades only kept items, so it costs the server a few rolls per
  settle, not one per kill.
- These effects draw random numbers only when worn, so items,
  drops and fights without these effects come out the same as before.

## Unique effects

Handcrafted uniques (uniques.md) carry these. They never roll on Legendary items and
apply **once** however many items carry them. Legendary items that rolled them before
this split keep working.

| ID | Name | Effect |
|---|---|---|
| 2 | **Spellblade** | Your damage **swaps type**: physical becomes magic, magic becomes physical. Both damage-% groups apply. |
| 4 | **Juggernaut** | You can't evade, but **armor also reduces magic damage**. |
| 8 | **Midas Touch** | Kills give **no XP**, but **150% more gold**. |
| 10 | **Voidtouched** | Your damage **ignores the enemy's armor and resistance**, but you deal **25% less damage**. |
| 11 | **Glass Cannon** | **100% more damage, 50% less max HP.** |
| 12 | **Spellward** | You can't evade, but **resistance also reduces physical damage**. |
| 13 | **Scholar's Focus** | **75% more XP**, 50% less gold. |
| 22 | **Frostbite** | Your crits deal **no extra damage**. Instead the enemy deals 0.5% less damage per 1% crit chance: `enemyDPS × (1 − 0.5 × min(1, critChance))`. |
| 23 | **Frozen Blood** | **+1 armor and resistance per 10 bonus max HP**, but **20% less attack speed** (after the floor), and HP regen and lifesteal do nothing. Added before Ironclad / Runeguard convert. Bonus HP = max HP − what your level gives with no gear: `(100 + 10 × (level − 1)) × (1 + 0.45% × level)` (× 0.5 with Glass Cannon). |
| 24 | **Ambush** | Your **first attack each fight deals 5×** damage, but 30% less attack speed. `timeToKill = max(TTK − 4 / attacksPerSec, 0.5 / attacksPerSec)` (the first swing lands half a period in). |
| 45 | **Moonlight** | **All your damage is magic**: the weapon's hit and flat physical convert, only the magic %-group applies (magic damage %, Mind), and armor penetration counts as magic penetration. **Every 3rd attack hits twice.** |
| 46 | **Waxing Moon** | Your hits start at **40% less damage** and gain **10% more** per attack, up to **60% more** from the 11th attack on. Resets each fight. |
| 47 | **Moonshadow** | **All your armor and resistance become evasion rating.** (You keep none; each point adds 1 evasion rating.) |
| 50 | **Moonlit Vigil** | Each point of Mind also gives **+0.08% attack speed** and **+0.2% armor**, but **Finesse gives nothing**. |
| 48 | **Lunar Insight** | Each point of Mind also gives **+0.25% max HP** and **+0.5% resistance**, but **Might gives nothing**. |
| 51 | **Anvil Strength** | Your hits deal **+1 physical damage per point of armor** you have, but **25% less attack speed**. |
| 52 | **True Shot** | Your attacks **never miss**, and each **1% accuracy above your level's own** gives **1% more damage**. |
| 53 | **Resonance** | Each **other unique** you wear gives **8% more damage** and **8% more max HP**. |

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
Anvil Str.:   flat_phys += armor (after Moonshadow) / ANVIL_ARMOR (1);  attack speed × 0.75
True Shot:    enemy evasion = 0;  damage × (1 + max(0, accuracy / levelAccuracy − 1))
              levelAccuracy = 10 × level × (1 + 0.25% × level), your level's own with its Might
Resonance:    damage × (1 + 0.08 × n);  maxHP × (1 + 0.08 × n);  n = other uniques worn
Moonlight:    hit_magic = (weaponBase + flat_phys + flat_magic) × (1 + pct_magic) × … × (1 + 1/3);
              hit_phys = 0;  magicPen = min(cap, magicPen% + armorPen%)
Waxing Moon:  attack k (from 1) deals × w(k) = min(1.6, 0.5 + 0.1k);
              cumulative W(n) = 0.5n + 0.05n(n+1) for n ≤ 11, then W(11) + 1.6(n − 11)
              x = enemyHP / (weapon DPS × period);  DPS_you × x / n(x), n solving W(n) = x
              (quadratic, then linear), so timeToKill = n periods and lifesteal etc. see the average
Moonshadow:   evasionRating += armor + resistance;  armor = resistance = 0
              (final values: after their %, Frozen Blood, Ironclad and Runeguard; added after
              evasion rating % and Finesse, so they don't multiply it)
Lunar Insight: might = 0 for its bonuses;  maxHP% += 0.25% × mind;  resistance% += 0.5% × mind
Moonlit Vigil: finesse = 0 for its bonuses;  attackSpeed% += 0.08% × mind;  armor% += 0.2% × mind
```

- Damage from Zealot's Oath and Thornshell counts as your damage: Glass Cannon's ×2
  and Voidtouched (no enemy mitigation, ×0.75) apply to it too.
- **Waxing Moon** at a 1.4/s katana: a 3 s fight (4 attacks) averages × 0.75, a ~12 s
  fight (16 attacks) × 1.26, a ~30 s boss fight (42 attacks) × 1.47. Over-farming easy
  enemies loses damage; hard targets and bosses gain the most.
- **Moonlight with Spellblade:** Moonlight's all-magic wins over the swap; Spellblade still
  merges the %-groups.
- **Moonshadow** trades all mitigation for evasion: strong against many small hits, but
  every hit that lands is taken in full. Juggernaut and Spellward stop evasion, so they
  leave you with no defense at all.
- Midas Touch + Scholar's Focus together: both apply (xp × 0 = 0, gold × 1.25). The
  effects card points this out.

## Open

- Per-copy amounts and caps are starting values to tune with simulation.
