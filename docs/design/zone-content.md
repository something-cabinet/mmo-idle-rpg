# Zone content: tiers 1–3

Concrete zones built on the rules in zones.md. All numbers *illustrative*.

## Rules added for content

### New player start

- A new character picks a **starter weapon** (Common, T1): Rusted Sword, Driftwood Bow,
  Driftwood Wand or Driftwood Healing Staff. It is only a starting point; any gear can be
  used later.
- Everyone also gets a Common **Ratskin Vest** and **Ratskin Boots**.
- Level 1: 100 HP, 1 of each primary (attributes.md).

### Tutorial curve (T1 only)

T1 is the tutorial zone. Its enemies start at **level 1** instead of 10T − 5, and enemies
below the zone average use `1.15^o` for stats instead of `1.08^o`, so the first targets
are almost free wins. Rewards keep `1.12^o`. Other zones follow zones.md unchanged.

### Zone boss

- Each zone has a **boss**, level `10T + 5`, with stats `× 1.08^7` (≈1.7× the average
  enemy) and rewards `× 1.12^7`.
- **Challenge:** target the boss like any other enemy; the fight plays out in the fight
  view. It's the normal deterministic check (time to kill < time to die) against the
  current loadout. Losing is a defeat: the character goes idle (see combat.md) and can
  retry any time.
- **First kill** unlocks the next zone and gives a reward: one guaranteed **Rare** item of
  the zone's tier (random base from the zone) and 20× the boss's gold.
- After the first kill the boss is also a **farmable target** like any other enemy,
  dropping from all of the zone's bases.
- The boss is meant to need **better than average gear or a few extra levels**: an
  average level-10 player only just wins.

## T1: Greenhollow

Farmland and woods at the edge of the starting village. Levels 1–15.

| Enemy | Level | Damage | Defense | Speed | HP | DPS | Armor / Res | XP | Gold |
|---|---|---|---|---|---|---|---|---|---|
| Field Rat | 1 | Phys | Balanced | 1.5/s | 23 | 4.5 | 2.5 / 2.5 | 7 | 2 |
| Wild Boar | 4 | Phys | Armored | 0.8/s | 35 | 6.9 | 24 / 4 | 10 | 3 |
| Goblin Scout | 7 | Phys | Balanced | 1.2/s | 53 | 10.5 | 17.5 / 17.5 | 14 | 4 |
| Bog Wisp | 10 | **Magic** | Warded | 1.0/s | 80 | 16 | 10 / 60 | 20 | 5 |
| Goblin Brute | 13 | Phys | Armored | 0.7/s | 101 | 20 | 78 / 13 | 28 | 7 |
| **Boss: Grubnak, Goblin Chief** | 15 | Phys | Balanced | 0.9/s | 138 | 27 | 37.5 / 37.5 | 44 | 11 |
| *Secret: Drowned Bellringer* (Sunken Chapel) | 12 | **Magic** | Armored | 0.6/s | 94 | 18.7 | 72 / 12 | 30 | 8 |

**Checks** (simulated):

- Fresh level 1 with Rusted Sword + starter kit vs Field Rat: kills in ~3.0 s, would
  take ~111 s to die. About 28 rats (~4 min) to reach level 2.
- Average level-10 warrior (sword) vs Grubnak: kills in ~14.7 s, dies in ~19.7 s. Just wins.
- The Wild Boar is armored and the Bog Wisp is warded, so players meet both damage
  types and both defense profiles in the first zone.

**Drops** (each base from exactly one enemy):

| Enemy | Bases |
|---|---|
| Field Rat (7) | Rusted Dagger, Driftwood Wand, Ratskin Cap, Sackcloth Shoes, Rusted Gauntlets, Rough Emerald Ring, Rough Amber Amulet |
| Wild Boar (7) | Rusted Mace, Driftwood Bow, Rusted Helm, Ratskin Boots, Sackcloth Robe, Rusted Shield, Rough Ruby Ring |
| Goblin Scout (7) | Rusted Sword, Rusted Katana, Driftwood Crossbow, Ratskin Bracers, Sackcloth Hood, Rough Sapphire Amulet, Rough Emerald Amulet |
| Bog Wisp (6) | Driftwood Fire Staff, Driftwood Healing Staff, Tattered Tome, Sackcloth Gloves, Rough Sapphire Ring, Rough Ruby Amulet |
| Goblin Brute (6) | Rusted Greatsword, Rusted Scepter, Rusted Breastplate, Rusted Greaves, Ratskin Vest, Rough Amber Ring |
| Grubnak (boss) | Any T1 base |

**Materials:** Copper Ingot (Metal), Rough Hide (Hide), Faint Core (Core), Linen Scrap (Cloth), Driftwood Log (Wood), Bitterleaf (Reagent), Rough Gem (Gem).

| Enemy | Materials |
|---|---|
| Field Rat | Rough Hide, Bitterleaf |
| Wild Boar | Rough Hide, Driftwood Log |
| Goblin Scout | Copper Ingot, Linen Scrap |
| Bog Wisp | Faint Core, Bitterleaf |
| Goblin Brute | Copper Ingot, Rough Gem |
| Grubnak (boss) | Copper Ingot, Rough Hide, Rough Gem |

## T2: Thornwood

A dark, overgrown forest where bandits and beasts hide. Levels 16–25.

| Enemy | Level | Damage | Defense | Speed | HP | DPS | Armor / Res | XP | Gold |
|---|---|---|---|---|---|---|---|---|---|
| Thornback Spider | 16 | Phys | Balanced | 1.5/s | 140 | 16.7 | 40 / 40 | 37 | 9 |
| Bandit Cutthroat | 18 | Phys | Balanced | 1.3/s | 164 | 19.5 | 45 / 45 | 46 | 12 |
| Briar Shaman | 20 | **Magic** | Warded | 0.9/s | 191 | 22.7 | 20 / 120 | 58 | 14 |
| Ironbark Treant | 22 | Phys | Armored | 0.6/s | 223 | 26.5 | 132 / 22 | 73 | 18 |
| Dire Wolf | 24 | Phys | Balanced | 1.4/s | 260 | 30.9 | 60 / 60 | 91 | 23 |
| **Boss: Morgra, the Thorn Witch** | 25 | **Magic** | Warded | 0.8/s | 328 | 38.9 | 25 / 150 | 128 | 32 |

- The T2 boss deals magic damage and is warded, the opposite of Grubnak: a pure plate
  warrior needs some resistance (cloth pieces, sapphire jewelry) or a physical weapon
  with good damage to win. This pushes players to use more than one loadout.

**Drops:**

| Enemy | Bases |
|---|---|
| Thornback Spider (7) | Bogiron Dagger, Gnarled Bow, Homespun Gloves, Boarhide Boots, Bogiron Helm, Cut Emerald Ring, Cut Sapphire Amulet |
| Bandit Cutthroat (7) | Bogiron Sword, Bogiron Katana, Boarhide Cap, Boarhide Vest, Homespun Shoes, Cut Ruby Ring, Cut Emerald Amulet |
| Briar Shaman (6) | Gnarled Wand, Gnarled Fire Staff, Dog-eared Tome, Homespun Hood, Homespun Robe, Cut Sapphire Ring |
| Ironbark Treant (7) | Bogiron Greatsword, Gnarled Healing Staff, Gnarled Crossbow, Bogiron Breastplate, Bogiron Greaves, Bogiron Shield, Cut Amber Ring |
| Dire Wolf (6) | Bogiron Mace, Bogiron Scepter, Boarhide Bracers, Bogiron Gauntlets, Cut Ruby Amulet, Cut Amber Amulet |
| Morgra (boss) | Any T2 base |

**Materials:** Bog Iron Bar (Metal), Thick Hide (Hide), Thorn Heart (Core), Homespun Bolt (Cloth), Ironbark Plank (Wood), Nightshade (Reagent), Cut Gem (Gem).

| Enemy | Materials |
|---|---|
| Thornback Spider | Thick Hide, Homespun Bolt, Nightshade |
| Bandit Cutthroat | Bog Iron Bar, Homespun Bolt, Cut Gem |
| Briar Shaman | Thorn Heart, Nightshade |
| Ironbark Treant | Thorn Heart, Ironbark Plank |
| Dire Wolf | Thick Hide, Nightshade |
| Morgra (boss) | Thorn Heart, Nightshade, Cut Gem |

## T3: Frostmaw Pass

A snowbound mountain pass below an abandoned dwarven hold. Levels 26–35. **Wall tier**:
HP and DPS × 1.1 over the zones.md curve (zones.md, "Difficulty rhythm").

| Enemy | Level | Damage | Defense | Speed | HP | DPS | Armor / Res | XP | Gold |
|---|---|---|---|---|---|---|---|---|---|
| Ice Harpy | 26 | Phys | Balanced | 1.5/s | 362 | 26.1 | 65 / 65 | 107 | 27 |
| Kobold Tunneler | 28 | Phys | Armored | 1.1/s | 422 | 30.4 | 168 / 28 | 134 | 34 |
| Frost Wraith | 30 | **Magic** | Warded | 1.0/s | 492 | 35.5 | 30 / 180 | 168 | 42 |
| Rimebound Cultist | 32 | **Magic** | Balanced | 1.0/s | 574 | 41.4 | 80 / 80 | 211 | 53 |
| Stone Golem | 34 | Phys | Armored | 0.5/s | 670 | 48.3 | 204 / 34 | 265 | 66 |
| **Boss: Hrimvald, Frost Giant Jarl** | 35 | Phys | **Armored** | 0.6/s | 844 | 60.8 | 210 / 35 | 372 | 93 |

- Two magic enemies in a row (wraith, cultist), so the resistance picked up for Morgra
  keeps paying off.
- The boss is physical and armored, the opposite of Morgra again: plate soaks its hits,
  but physical builds need armor penetration (mace, greatsword) or a switch to magic.
- Not simulated yet (no boss check like T1 has).

**Drops:**

| Enemy | Bases |
|---|---|
| Ice Harpy (7) | Heartoak Bow, Dwarven Dagger, Wolfhide Bracers, Spidersilk Shoes, Dwarven Helm, Flawless Emerald Ring, Flawless Ruby Amulet |
| Kobold Tunneler (7) | Dwarven Mace, Dwarven Greatsword, Dwarven Breastplate, Wolfhide Boots, Spidersilk Gloves, Dwarven Shield, Flawless Amber Ring |
| Frost Wraith (6) | Heartoak Wand, Heartoak Healing Staff, Scholar's Tome, Spidersilk Hood, Flawless Sapphire Amulet, Flawless Ruby Ring |
| Rimebound Cultist (6) | Heartoak Fire Staff, Dwarven Scepter, Spidersilk Robe, Wolfhide Cap, Flawless Sapphire Ring, Flawless Amber Amulet |
| Stone Golem (7) | Dwarven Sword, Dwarven Katana, Heartoak Crossbow, Wolfhide Vest, Dwarven Gauntlets, Dwarven Greaves, Flawless Emerald Amulet |
| Hrimvald (boss) | Any T3 base |

**Materials:** Dwarven Steel Ingot (Metal), Frostfur Hide (Hide), Rime Core (Core), Spidersilk Thread (Cloth), Heartoak Timber (Wood), Frostbloom (Reagent), Flawless Gem (Gem).

| Enemy | Materials |
|---|---|
| Ice Harpy | Frostfur Hide, Frostbloom |
| Kobold Tunneler | Dwarven Steel Ingot, Heartoak Timber, Flawless Gem |
| Frost Wraith | Rime Core |
| Rimebound Cultist | Rime Core, Spidersilk Thread |
| Stone Golem | Dwarven Steel Ingot, Rime Core, Flawless Gem |
| Hrimvald (boss) | Dwarven Steel Ingot, Frostfur Hide, Flawless Gem |

## Open

- Enemy and boss art (placeholders for now).
- The T3 boss's simulated check.
