# Item bases

Concrete templates for every base. Rules for how bases work are in equipment.md.

## Rules

- **One base per family per tier** for now. A base is (family, tier); more than one base
  per family and tier can be added later without changing storage, since every item
  stores its final values.
- **Each tier renames the base** from the family's name track (Rusted Sword → Bogiron
  Sword). The name is data on the base, never computed from a formula, so any name can
  be changed or overridden per family.
- **Scaling** uses the curves in attributes.md:
  - damage: `template × 2.1^(T−1)`; HP: `× 1.6^(T−1)`; heal: `× 1.33^(T−1)`;
  - armor, resistance, evasion rating: `template × T`;
  - percent values and primaries: `P × (T + 3) / 12` (P/3 at T1, P at T9);
  - attack speed, base crit and plate's attack-speed penalty don't scale.
- Templates below are **T1 values**.
- 32 bases per tier: 10 weapons, 12 armor (4 slots × 3 weights), shield, tome, 4 ring
  gems, 4 amulet gems.

## Name tracks

| Tier | Metal | Wood | Cloth | Leather | Tome |
|---|---|---|---|---|---|
| 1 | Rusted | Driftwood | Sackcloth | Ratskin | Tattered |
| 2 | Bogiron | Gnarled | Homespun | Boarhide | Dog-eared |
| 3 | Dwarven | Heartoak | Spidersilk | Wolfhide | Scholar's |
| 4 | Elven | Silverbark | Mageweave | Owlbear | Gilded |
| 5 | Mithril | Ironwood | Runeweave | Drakehide | Arcanist's |
| 6 | Adamant | Elderwood | Moonsilk | Shadowhide | Archmage's |
| 7 | Runic | Ghostwood | Spellsilk | Wyrmscale | Runebound |
| 8 | Dragonbone | Dragonwood | Voidweave | Phoenixhide | Astral |
| 9 | Celestial | Worldroot | Starweave | Starhide | Celestial |

- **Metal:** sword, dagger, mace, scepter (holy mace), katana, greatsword, shield, plate.
- **Wood:** bow, wand, fire staff, healing staff.
- Item name = `<track> <piece>`, e.g. Dwarven Greatsword, Heartoak Bow, Spidersilk Robe,
  Wolfhide Vest, Gilded Tome.
- **Tone by tier:** T1–T2 sound cheap or crude, T3 solid and ordinary, T4 a little fancy,
  T5+ legendary materials. A word means the same tier on every track.

**Armor pieces:**

| Weight | Head | Chest | Hands | Feet |
|---|---|---|---|---|
| Cloth | Hood | Robe | Gloves | Shoes |
| Leather | Cap | Vest | Bracers | Boots |
| Plate | Helm | Breastplate | Gauntlets | Greaves |

### Gems

A new gem every 3 tiers, with a quality prefix inside each band:

| Primary | T1–3 | T4–6 | T7–9 |
|---|---|---|---|
| Might | Ruby | Bloodstone | Magmaheart |
| Finesse | Emerald | Windstone | Tempest Eye |
| Mind | Sapphire | Moonstone | Astral Shard |
| Vitality | Amber | Sunstone | Dawnheart |

Quality: **Rough** (1st tier of the band), **Cut** (2nd), **Flawless** (3rd).
E.g. T1 Rough Ruby Ring, T3 Flawless Ruby Ring, T4 Rough Bloodstone Ring,
T9 Flawless Magmaheart Amulet.

## Weapons (*illustrative*)

T1 values; damage ×2.1 per tier, heal ×1.33 per tier. 1H weapons deal ~10 DPS at T1;
2H deal ~14 (×1.4), because a 1H build also gets an off-hand.

| Family | Hands | Type | Hit (T1) | Speed | DPS (T1) | Hit (T9) | Base crit | Trait (implicit) |
|---|---|---|---|---|---|---|---|---|
| Sword | 1H | Phys | 10 | 1.0 | 10 | 3,782 | 5% | +60 Might (T1: 20) |
| Dagger | 1H | Phys | 4.75 | 2.0 | 9.5 | 1,797 | 8% | +30% increased crit chance |
| Mace | 1H | Phys | 11.75 | 0.8 | 9.4 | 4,444 | 5% | +15% armor penetration |
| Scepter (holy mace) | 1H | Phys | 7.5 | 0.8 | 6 | 2,837 | 5% | Heal 10 per hit (T9: 98), single target |
| Wand | 1H | Magic | 6.25 | 1.5 | 9.4 | 2,364 | 6% | +15% magic penetration |
| Katana | 2H | Phys | 9.5 | 1.4 | 13.3 | 3,593 | 10% | +40 crit damage |
| Greatsword | 2H | Phys | 23.75 | 0.55 | 13.1 | 8,983 | 5% | +25% armor penetration |
| Bow | 2H | Phys | 13.25 | 1.0 | 13.25 | 5,012 | 6% | +1.5T evasion rating |
| Fire staff | 2H | Magic | 18.75 | 0.8 | 15 | 7,092 | 5% | — (pure damage) |
| Healing staff | 2H | Magic | 5 | 1.0 | 5 | 1,891 | 5% | Heal 7.5 per hit (T9: 73), all allies |

- **Ranged** weapons (Bow, Wand, Fire staff, Healing staff) attack from a distance; the
  rest are melee. No mechanics hang off the tag yet.
- Weapons with a trait give up a little DPS for it; trait percents scale like percent
  stats (the table shows T9 values).
- Heal weapons trade most of their damage for healing. Solo, a healer should heal
  back **most but not all** of the incoming damage: slow kills, long survival, but
  still able to die.

### Healing staff by tier

Reference healer (level 10T, only level Mind applied: +4.5T% magic damage and heal),
against the zone's average enemy:

| Tier | Damage / hit | Heal / hit | With level Mind (dmg / heal) | Incoming DPS* | Healed | Time to kill |
|---|---|---|---|---|---|---|
| 1 | 5.0 | 7.5 | 5.2 / 7.8 | 10 | 78% | 23 s |
| 2 | 10 | 10 | 11 / 11 | 14 | 76% | 25 s |
| 3 | 22 | 13 | 25 / 15 | 20 | 74% | 27 s |
| 4 | 46 | 18 | 55 / 21 | 29 | 72% | 28 s |
| 5 | 97 | 23 | 119 / 29 | 41 | 70% | 30 s |
| 6 | 204 | 31 | 259 / 40 | 58 | 68% | 31 s |
| 7 | 429 | 42 | 564 / 55 | 83 | 66% | 33 s |
| 8 | 901 | 55 | 1,225 / 75 | 117 | 64% | 34 s |
| 9 | 1,891 | 73 | 2,657 / 103 | 167 | 62% | 35 s |

\* After the reference player's 30% mitigation and 10% evasion. Speed 1.0/s, so per hit
= per second. With average Magic gear (heal %, flat heal, Mind) coverage is ~85–90% at
every tier, still below 100%.

## Off-hands (*illustrative*)

| Base | Implicit |
|---|---|
| Shield | 8T armor, 5 max HP (life curve, T9: 215), +10% threat (P) |
| Tome | +30 Mind (P), +15% magic damage (P) |

## Armor (*illustrative*)

Full-set totals per weight. The chest carries **40%**, head, hands and feet **20%**
each.

| Weight | Armor | Resistance | Bonus | Penalty |
|---|---|---|---|---|
| Cloth | 6T | 30T | +40 Mind (P) | — |
| Leather | 15T | 15T | +12T evasion rating, +40 Finesse (P) | — |
| Plate | 30T | 6T | +40 Vitality (P), +20% threat (P) | −8% attack speed (fixed) |

Check against a matching enemy (level 10T, armor formula `d / (d + 5 × level)`):

| Full set | Phys mitigation | Magic mitigation | Evasion |
|---|---|---|---|
| Cloth | 11% | 38% | — |
| Leather | 23% | 23% | 11% |
| Plate | 38% | 11% | — |

Example: a plate breastplate (40%) at T5 has 60 armor, 12 resistance, +11 Vitality
(40 × 0.4 × 8/12), +5.3% threat and −3.2% attack speed.

## Jewelry (*illustrative*)

Each gem gives its primary. Values are P (T9); they scale with `(T + 3) / 12`.

| Base | Primary |
|---|---|
| Ring | +20 of its gem's primary |
| Amulet | +30 of its gem's primary |

## Open

- Check a full reference-player set against the reference HP and DPS in zones.md.
