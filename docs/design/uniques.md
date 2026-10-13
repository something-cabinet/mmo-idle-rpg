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

Unique IDs are permanent, like effect IDs.

## Open

- Tune stat multipliers (`x`) with simulation once players use them.
- Uniques for T4+ as zones are added.
