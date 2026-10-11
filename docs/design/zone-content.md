# Zone content: tiers 1–2

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

**Checks** (simulated):

- Fresh level 1 with Rusted Sword + starter kit vs Field Rat: kills in ~3.4 s, would
  take ~106 s to die. About 28 rats (~4 min) to reach level 2.
- Average level-10 warrior (287 HP) vs Grubnak: kills in 15.7 s, dies in ~19 s. Just wins.
- The Wild Boar is armored and the Bog Wisp is warded, so players meet both damage
  types and both defense profiles in the first zone.

**Drops** (each base from exactly one enemy):

| Enemy | Bases |
|---|---|
| Field Rat (7) | Rusted Dagger, Driftwood Wand, Ratskin Cap, Sackcloth Shoes, Rusted Gauntlets, Rough Emerald Ring, Rough Amber Amulet |
| Wild Boar (7) | Rusted Mace, Driftwood Bow, Rusted Helm, Ratskin Boots, Sackcloth Robe, Rusted Shield, Rough Ruby Ring |
| Goblin Scout (6) | Rusted Sword, Rusted Katana, Ratskin Bracers, Sackcloth Hood, Rough Sapphire Amulet, Rough Emerald Amulet |
| Bog Wisp (6) | Driftwood Fire Staff, Driftwood Healing Staff, Tattered Tome, Sackcloth Gloves, Rough Sapphire Ring, Rough Ruby Amulet |
| Goblin Brute (6) | Rusted Greatsword, Rusted Scepter, Rusted Breastplate, Rusted Greaves, Ratskin Vest, Rough Amber Ring |
| Grubnak (boss) | Any T1 base |

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
| Ironbark Treant (6) | Bogiron Greatsword, Gnarled Healing Staff, Bogiron Breastplate, Bogiron Greaves, Bogiron Shield, Cut Amber Ring |
| Dire Wolf (6) | Bogiron Mace, Bogiron Scepter, Boarhide Bracers, Bogiron Gauntlets, Cut Ruby Amulet, Cut Amber Amulet |
| Morgra (boss) | Any T2 base |

## Open

- Enemy and boss art (placeholders for now).
