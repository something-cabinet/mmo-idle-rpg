# Uniques

Handcrafted items, the rarest drops. Data in `spacetimedb/src/data/uniques.ts`.

## Rules

- **Handcrafted, no fixed shape:** any stats, any number of effects. The only rule is
  that they fit the combat formulas (closed form, so offline settles stay exact).
- **One tier only:** each unique exists at one tier and doesn't scale.
- **Built on a normal base:** a unique is a base (e.g. a Greatsword) at its tier. Weapon
  values and implicits come from the base, as on any item.
- **Stats roll in a wide range** at drop time: each stat rolls in `[0.8, 1.4] × value`,
  where `value = x × ref(stat, tier)` (attributes.md; `x` defaults to 1, the best regular
  affix roll), so a great roll beats any regular affix. 3–4 such stats make a unique about
  as strong as an Epic's best rolls on average, before its effects.
- **Stored like any item:** the rolled stats are saved on the item (in `affixes`, with
  affix tier 0), so rebalancing only changes new drops. `uniqueId` gives the name.
- **Effects:** stored as a list of effect IDs on the item (`effects`). A unique can carry
  unique-only effects (legendary.md "Unique effects": may have a trade-off, apply once)
  and legendary effects. A legendary effect on a unique counts as **one copy** toward
  stacking.
- **Can't be crafted.** Salvage gives 60 Dust × 2.9^(T−1) at the unique's tier.

## Drops

- Every kill rolls the Unique chance (zones.md: 0.0225%, scaled by `1.12^o` and item find).
- **Global, not per enemy:** in a tier-N zone, any unique of **tier N or below** can drop,
  from any enemy. Lower tiers are less likely: each tier below N halves the weight.

  ```
  weight(u) = 0.5^(N − u.tier)      for u.tier ≤ N, else 0
  ```

- A dropped unique keeps its own tier (a T1 unique dropped in T3 is T1).
- **Always kept:** the loot filter never salvages a unique; they go first into
  free bag slots. Only a full bag salvages one.
- If no unique exists at tier N or below, the Unique chance rolls Legendary instead.
- **Enemy-bound uniques** (`enemyId`): a secret area's enemy (zones.md, "Secret areas")
  can have its own unique. It drops only from that enemy, at the usual Unique chance
  (raised like any drop by the enemy's `rewardScale` and `rareDropMult`),
  and that enemy drops no other unique, so it can be target-farmed. Bound uniques
  never join the global pool.

## List

| ID | Tier | Name | Base | Effects | Stats |
|---|---|---|---|---|---|
| 1 | T1 | **Grubnak's Cleaver** | Greatsword | Glass Cannon | Physical damage %, crit damage, armor pen % |
| 2 | T1 | **Gilded Signet** | Emerald ring | Midas Touch | Gold find %, item find %, Finesse |
| 3 | T1 | **Tutor's Pendant** | Sapphire amulet | Scholar's Focus | XP gain %, Mind, max HP % |
| 11 | T1 | **The Drowned Hymnal** | Tome | Zealot's Oath, Spellward | Heal %, magic damage %, resistance %. *Only from the Drowned Bellringer (Sunken Chapel).* |
| 4 | T2 | **Hexblade** | Sword | Spellblade | Physical damage %, magic damage %, attack speed % |
| 5 | T2 | **Bulwark of the Hollow** | Plate chest | Juggernaut, Thornshell | Armor %, max HP, HP regen |
| 6 | T2 | **Veil of Whispers** | Cloth chest | Spellward, Second Wind | Resistance %, Mind, max HP % |
| 7 | T2 | **Voidfang** | Dagger | Voidtouched, Executioner | Increased crit chance %, crit damage, attack speed % |
| 8 | T3 | **Rimewind Longbow** | Bow | Frostbite | Increased crit chance %, evasion rating %, attack speed % |
| 9 | T3 | **Glacier Heart** | Amber amulet | Frozen Blood | Max HP %, Vitality, resistance % |
| 10 | T3 | **Avalanche Staff** | Fire Staff | Ambush | Magic damage %, crit damage, max HP |
| 12 | T3 | **Wyrmscale Aegis** | Shield | Ironclad, Second Wind | Threat % (×1.5), armor %, max HP %. *Raid only: Wyrm Hollow (raids.md).* |
| 13 | T3 | **Hoardkeeper's Censer** | Healing Staff | Zealot's Oath, Runeguard | Heal % (×1.25), Mind, resistance %. *Raid only: Wyrm Hollow.* |
| 14 | T3 | **Skaldrith's Fang** | Dagger | Executioner, Rending | Crit damage, physical damage %, attack speed %. *Raid only: Wyrm Hollow.* |
| 15 | T4 | **Moonlight Greatsword** | Greatsword | Moonlight | Magic damage %, Mind, crit damage. *Only from the Moonlit Champion (Moonlight Garden).* |
| 16 | T4 | **Waxing Crescent** | Katana | Waxing Moon | Physical damage %, attack speed %, crit damage |
| 17 | T4 | **Moonshadow Jerkin** | Leather chest | Moonshadow | Evasion rating %, Finesse, max HP % |
| 18 | T4 | **Tear of the Moon** | Sapphire (Moonstone) amulet | Lunar Insight | Mind, magic damage %, resistance % |
| 19 | T4 | **Lunatic's Wager** | Sapphire (Moonstone) ring | None | Max HP %, attack speed %, item find %, resistance %, each rolled **−1.4 to +1.4** × value |

Unique IDs are permanent, like effect IDs.

### T4 uniques

Moonveil Vale's uniques: four with a new unique-only effect (legendary.md, IDs 45–48),
one per build style, and Lunatic's Wager with none:

- **Moonlight Greatsword** (enemy-bound, zone-content.md "Moonlight Garden"): a greatsword
  for a Mind build. All your damage becomes magic; every 3rd attack hits twice.
- **Waxing Crescent** (physical, katana): grows through each fight like the moon. Weak for
  the first few swings, strong in long fights: a boss and hard-target weapon, poor for
  over-farming easy enemies.
- **Moonshadow Jerkin** (evasion, leather): every dodge softens the next hit that lands.
  Pays off for real evasion builds, a small loss below ~20% evasion.
- **Tear of the Moon** (caster defence, amulet): Mind also gives max HP and resistance;
  Might gives nothing. Pairs with the Moonlight Greatsword.

### Lunatic's Wager

A ring touched by moon-madness, after Ventor's Gamble (PoE). No effect: just four stats
that can each land anywhere from a curse to a blessing.

- **Base:** Rough Moonstone Ring (T4). Its implicit (+13 Mind) is the one stable part.
- **Stats:** each rolls uniform in **[−1.4, +1.4] × value**, where value is the usual
  `ref(stat, T4)`; the top end is the best roll any unique gets (`UNIQUE_ROLL_MAX`).

  | Stat | Range (T4) | Why it's here |
  |---|---|---|
  | Max HP % | −14% to +14% | Defence for every build |
  | Attack speed % | −9% to +9% | Offence for every build, either damage type |
  | Item find % | −14% to +14% | The gambler's stat (Ventor's rarity) |
  | Resistance % | −23% to +23% | The other defence, a nod to Ventor's resistances |

- **Every stat matters to every build**, so no roll is just "dead": a bad roll costs you,
  a good one helps, whatever you play.
- **Odds** (independent rolls):

  | Outcome | Chance |
  |---|---|
  | A given stat positive | 50% |
  | All four positive | 6.3% (1 in 16) |
  | A given stat ≥ +1.0 × value (as good as a top regular affix) | 14.3% |
  | All four ≥ +0.8 × value (a normal unique's floor) | 0.21% (≈ 1 in 480) |
  | All four ≥ +1.2 × value (the god roll) | 0.003% (≈ 1 in 38,000) |

- **Average is zero, the chase is the point:** a typical copy has two good stats and two
  bad ones and is worse than a Rare ring; a god roll is four best-in-slot stats on one
  ring, more than any other unique's three. Players keep farming T4 for a better copy,
  and every drop is worth looking at.
- **Can't be crafted or rerolled**, like every unique: each drop is a new wager. Always
  kept (uniques skip the loot filter), so bad copies salvage for Dust like any unique.
- **Global T4 pool**, so it drops from any T4+ zone enemy at the normal weight
  (1 of 4 global T4 uniques).
- **Safe negatives:** the existing combat floors already cover it (Anomaly, equipment.md):
  max HP ≥ 1, attack speed ≥ 25% of the weapon's, item find ≥ −100%. Resistance % only
  scales your own resistance, so it can't go below 0 from this ring alone.
- **Display:** negative stats in red. The card shows each stat's place in its range (e.g.
  "+11% attack speed (top 10%)") so players can judge a copy at a glance.

**Data:** `UniqueStat` gets an optional roll range in place of the fixed
`[UNIQUE_ROLL_MIN, UNIQUE_ROLL_MAX]`:

```
{ stat: Stat.AttackSpeedPct, roll: [-1.4, 1.4] }      // default [0.8, 1.4]
value = ref(stat, tier) × x × (roll[0] + (roll[1] − roll[0]) × rng())
```

## Open

- Tune stat multipliers (`x`) with simulation once players use them.
- Uniques for T5+ as zones are added.
