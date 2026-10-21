# Zone content: tiers 1–5

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
- A zone of tier T also needs character level `10·(T−1)` (T2: 10, T3: 20, ...); until then
  it stays locked even with the previous boss dead. Life skills' tiers follow the zone.
- After the first kill the boss is also a **farmable target** like any other enemy,
  dropping from all of the zone's bases.
- The boss is meant to need **better than average gear or a few extra levels**: an
  average level-10 player only just wins.
- **Boss HP bonus, ramping up:** HP × 1.1 at T2, × 1.2 at T3 and × 1.3 from T4 on, on top
  of `1.08^7` (`bossHpFactor` in zones.ts); T1 stays the tutorial. DPS and rewards
  unchanged. At T4 that's ~1.64× the HP and ~1.26× the DPS of the +4 enemy, for 1.4× its
  rewards, so the boss gives fewer kills and less XP and gold per hour than the zone's
  strongest enemy. It stays worth farming for its full base table, but the regular
  enemies are the main farm.

  | T4 target, same gear* | Cycle | Kills / h | Reward / h |
  |---|---|---|---|
  | Average (o = 0) | 16.6 s | ~217 | 1.00× |
  | +2 | 18.5 s | ~195 | 1.12× |
  | +4 | 20.8 s | ~173 | 1.26× |
  | Boss | 30.8 s | ~117 | 1.19× |

  \* Reference-player kill times plus the 5 s walk; the ratios hold for any gear that wins.
- The first kill is a gear check that grows each tier: a reference player needs about
  1.2× (T1), 1.4× (T2), 1.7× (T3) and 2.05× (T4) their damage × survivability to win.

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
| *Secret: Drowned Bellringer* (Sunken Chapel) | 22 | **Magic** | Armored | 0.6/s | 234 | 27.8 | 132 / 22 | 90 | 24 |

The Bellringer is a T2-strength enemy hidden in T1 (Ironbark Treant's level, HP and
DPS). Its XP and gold beat a strong T2 enemy, which also makes its drops ~4.5× a normal
T1 enemy's (`rewardScale`), and Rare and better are × 2.5 more (`rareDropMult`): per
kill ~12.7% Rare, ~2.5% Epic, ~0.25% Legendary and ~0.125% The Drowned Hymnal (`uniqueDropMult` 0.5), before
item find. *Illustrative.*

**Checks** (simulated):

- Fresh level 1 with Rusted Sword + starter kit vs Field Rat: kills in ~3.0 s, would
  take ~111 s to die. About 28 rats (~4 min) to reach level 2.
- Average level-10 warrior (sword) vs Grubnak: kills in ~14.7 s, dies in ~16.7 s (its armor counts against Grubnak's level 15). Just wins.
- The Wild Boar is armored and the Bog Wisp is warded, so players meet both damage
  types and both defense profiles in the first zone.

**Drops** (each base from exactly one enemy):

| Enemy | Bases |
|---|---|
| Field Rat (7) | Rusted Dagger, Driftwood Wand, Ratskin Cap, Sackcloth Shoes, Rusted Gauntlets, Rough Emerald Ring, Rough Amber Amulet |
| Wild Boar (7) | Rusted Mace, Driftwood Bow, Rusted Helm, Ratskin Boots, Sackcloth Robe, Rusted Shield, Rough Ruby Ring |
| Goblin Scout (7) | Rusted Sword, Rusted Katana, Driftwood Crossbow, Ratskin Bracers, Sackcloth Hood, Rough Sapphire Amulet, Rough Emerald Amulet |
| Bog Wisp (6) | Driftwood Fire Staff, Driftwood Healing Staff, Tattered Tome, Sackcloth Gloves, Rough Sapphire Ring, Rough Ruby Amulet |
| Goblin Brute (7) | Rusted Greatsword, Rusted Scepter, Rusted Breastplate, Rusted Greaves, Ratskin Vest, Rusted Greatshield, Rough Amber Ring |
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
| Thornback Spider | 16 | Phys | Balanced | 1.5/s | 147 | 17.5 | 40 / 40 | 37 | 9 |
| Bandit Cutthroat | 18 | Phys | Balanced | 1.3/s | 172 | 20.5 | 45 / 45 | 46 | 12 |
| Briar Shaman | 20 | **Magic** | Warded | 0.9/s | 201 | 23.9 | 20 / 120 | 58 | 14 |
| Ironbark Treant | 22 | Phys | Armored | 0.6/s | 234 | 27.8 | 132 / 22 | 73 | 18 |
| Dire Wolf | 24 | Phys | Balanced | 1.4/s | 273 | 32.5 | 60 / 60 | 91 | 23 |
| **Boss: Morgra, the Thorn Witch** | 25 | **Magic** | Warded | 0.8/s | 378 | 40.9 | 25 / 150 | 128 | 32 |

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
| Dire Wolf (7) | Bogiron Mace, Bogiron Scepter, Boarhide Bracers, Bogiron Gauntlets, Bogiron Greatshield, Cut Ruby Amulet, Cut Amber Amulet |
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

A snowbound mountain pass below an abandoned dwarven hold. Levels 26–35.

| Enemy | Level | Damage | Defense | Speed | HP | DPS | Armor / Res | XP | Gold |
|---|---|---|---|---|---|---|---|---|---|
| Ice Harpy | 26 | Phys | Balanced | 1.5/s | 363 | 26.1 | 65 / 65 | 107 | 27 |
| Kobold Tunneler | 28 | Phys | Armored | 1.1/s | 423 | 30.5 | 168 / 28 | 134 | 34 |
| Frost Wraith | 30 | **Magic** | Warded | 1.0/s | 493 | 35.6 | 30 / 180 | 168 | 42 |
| Rimebound Cultist | 32 | **Magic** | Balanced | 1.0/s | 576 | 41.5 | 80 / 80 | 211 | 53 |
| Stone Golem | 34 | Phys | Armored | 0.5/s | 671 | 48.4 | 204 / 34 | 265 | 66 |
| **Boss: Hrimvald, Frost Giant Jarl** | 35 | Phys | **Armored** | 0.6/s | 1,015 | 61.0 | 210 / 35 | 372 | 93 |

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
| Rimebound Cultist (7) | Heartoak Fire Staff, Dwarven Scepter, Spidersilk Robe, Wolfhide Cap, Dwarven Greatshield, Flawless Sapphire Ring, Flawless Amber Amulet |
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

## T4: Moonveil Vale

A hidden elven valley below the far side of Frostmaw Pass: silver-barked woods, moonwells
and the marble ruins of a moon-worshipping city, beautiful and empty. Its queen tried to
hold the moon over her city forever; it went dark instead, and her court still walks
under it. Levels 36–45. HP and DPS × 1.16 over the reference curve (zones.md, "Difficulty
climb"), with the boss at its full HP bonus (× 1.3, see "Zone boss").

| Enemy | Level | Damage | Defense | Speed | HP | DPS | Armor / Res | XP | Gold |
|---|---|---|---|---|---|---|---|---|---|
| Moonmoth Swarm | 36 | **Magic** | Balanced | 1.5/s | 437 | 39.0 | 90 / 90 | 310 | 78 |
| Owlbear | 38 | Phys | Balanced | 0.7/s | 784 | 45.5 | 95 / 95 | 389 | 97 |
| Silverbark Dryad | 40 | **Magic** | Warded | 0.9/s | 665 | 53.0 | 40 / 240 | 488 | 122 |
| Hollow Sentinel | 42 | Phys | Armored | 0.6/s | 1,067 | 61.9 | 252 / 42 | 612 | 153 |
| Lunar Spellweaver | 44 | **Magic** | Balanced | 1.0/s | 1,245 | 72.2 | 110 / 110 | 768 | 192 |
| **Boss: Selvara, the Moonless Queen** | 45 | **Magic** | **Armored** | 0.8/s | 2,038 | 90.9 | 270 / 45 | 1,078 | 270 |

- **Traits** (zones.md, "Enemy traits"), each paid for with HP: the **Moonmoth Swarm** is
  hard to hit (**evasion rating 211**: 35% dodge against a same-level player without
  accuracy gear, HP 672 → 437) and the **Silverbark Dryad** regenerates (**25 HP/s**,
  HP 915 → 665). The swarm makes fights swingy and starves on-hit sustain (lifesteal);
  crossbows, Might and accuracy gear cut its dodge; the dryad rewards burst: strong builds kill it faster than before, weak
  ones (or magic damage into its Warded resistance) slower.

- Three magic enemies of five, so the resistance picked up for Morgra and the T3
  casters matters most here.
- The boss is a new mix: **magic damage behind armor**, in moon-silver elven plate. Plate
  alone won't save you (she hits resistance), and physical builds need armor penetration
  or a switch to magic. Every boss so far has asked for a different answer:
  Grubnak (phys, balanced), Morgra (magic, warded), Hrimvald (phys, armored), Selvara
  (magic, armored).
- The Hollow Sentinel (animated armor of the queen's guard) is the zone's armored check
  before the boss.
- Selvara has ~1.64× the Spellweaver's HP: beating her once unlocks T5 and her full base
  table, but the Spellweaver and Sentinel are the better hourly farm.
- Not simulated yet.

**Areas:**

| Area | Enemies | Blurb |
|---|---|---|
| Silverbark Glade | Moonmoth Swarm, Owlbear | Pale trees glow under a moon that isn't there. |
| Moonwell Ruins | Silverbark Dryad, Hollow Sentinel | Dry moonwells among fallen arches, still guarded. |
| Starlit Conservatory | Lunar Spellweaver | A glass dome where the queen's mages still chant to the dark sky. |
| Moonless Throne (lair) | Selvara | The queen waits on her throne beneath a black moon. |

**Drops:**

| Enemy | Bases |
|---|---|
| Moonmoth Swarm (7) | Elven Dagger, Silverbark Wand, Mageweave Hood, Mageweave Gloves, Owlbear Bracers, Elven Greatshield, Rough Moonstone Ring |
| Owlbear (7) | Elven Mace, Silverbark Bow, Owlbear Vest, Elven Helm, Elven Greaves, Rough Sunstone Ring, Rough Bloodstone Amulet |
| Silverbark Dryad (6) | Silverbark Fire Staff, Silverbark Healing Staff, Silverbark Crossbow, Mageweave Shoes, Owlbear Cap, Rough Windstone Ring |
| Hollow Sentinel (7) | Elven Sword, Elven Greatsword, Elven Breastplate, Owlbear Boots, Elven Shield, Rough Bloodstone Ring, Rough Windstone Amulet |
| Lunar Spellweaver (7) | Elven Scepter, Elven Katana, Gilded Tome, Mageweave Robe, Elven Gauntlets, Rough Moonstone Amulet, Rough Sunstone Amulet |
| Selvara (boss) | Any T4 base |

Base IDs for zones.ts `T4_DROPS`: moth [2, 5, 30, 32, 36, 22, 52], owlbear [3, 8, 35, 38, 41, 53, 54],
dryad [9, 10, 11, 33, 34, 51], sentinel [1, 7, 39, 37, 20, 50, 55], spellweaver [4, 6, 21, 31, 40, 56, 57].

**Materials:** Moonsteel Ingot (Metal), Owlbear Pelt (Hide), Lunar Core (Core), Mageweave Bolt (Cloth), Silverbark Bough (Wood), Moonpetal (Reagent), Moonlit Gem (Gem). Gathering only: Moonsteel Ore (Mining), Moonshade (rare herb, Foraging).

| Enemy | Materials |
|---|---|
| Moonmoth Swarm | Mageweave Bolt, Moonpetal |
| Owlbear | Owlbear Pelt, Moonpetal |
| Silverbark Dryad | Lunar Core, Silverbark Bough |
| Hollow Sentinel | Moonsteel Ingot, Lunar Core, Moonlit Gem |
| Lunar Spellweaver | Lunar Core, Mageweave Bolt, Moonlit Gem |
| Selvara (boss) | Moonlit Gem |

### Secret area: Moonlight Garden

A walled garden behind the Silverbark Glade where the moon still shines: white flowers
open at night, a fountain holds a reflection of a moon that is gone from the sky. When the
moon went dark, the queen's champion sealed himself in here with the last of its light,
bound into his greatsword.

- **Found by:** 1,000 Moonmoth Swarm kills (hint at 500), like the Sunken Chapel. The
  moths are drawn to the garden's light; the zone's weakest enemy, so it's farmed early
  anyway and the secret turns up naturally.
- **Rumour** (in Silverbark Glade): *"The moths all drift the same way at night, toward a
  light that isn't the moon…"*
- **Map:** a ✦ spot on a path off Silverbark Glade (area 45).
- **Blurb:** *"A hidden garden where the moon still shines, guarded by the queen's last
  knight."*

| Enemy | Level | Damage | Defense | Speed | HP | DPS | Armor / Res | XP | Gold |
|---|---|---|---|---|---|---|---|---|---|
| *Secret: the Moonlit Champion* | 52 | **Magic** | Balanced | 0.5/s | 1,961 | 92.3 | 130 / 130 | 2,190 | 585 |

- **T5 strength in T4**, like the Bellringer is T2 strength in T1: the stats of a T5 +2
  enemy, about as tough as Selvara (2,038 HP, 90.9 DPS). Slow, heavy greatsword swings
  thrown as moonlight, so magic damage.
- **Pays like the Bellringer:** XP and gold ~1.23× / ~1.32× a T5 +2 enemy, so
  `rewardScale` ≈ 4.5 and drops ~4.5× a normal T4 enemy's, plus `rareDropMult` 2.5.
  With `uniqueDropMult` 0.5, per kill ~0.125% for the Moonlight Greatsword before item find.
- **Bases** (6, still T4): Elven Sword, Elven Greatsword, Silverbark Wand, Mageweave Robe,
  Elven Breastplate, Rough Moonstone Amulet. IDs [1, 7, 5, 31, 39, 56].
- **Materials:** Lunar Core, Moonsteel Ingot.

**Unique: Moonlight Greatsword** (T4, Elven Greatsword; only from the Moonlit Champion)

A greatsword for a Mind build: it swings like a greatsword but cuts with moonlight.

- **New unique effect, Moonlight:** **all your damage is magic**: the weapon's hit and
  flat added physical damage convert, and only the magic %-group applies (magic damage %,
  Mind). Armor penetration counts as magic penetration. **Every 3rd attack releases a
  moonlight wave** that deals the hit again (×2 on that attack: ×1.33 damage on
  average, closed form for the settle).

  ```
  hit_magic = (weaponBase + flat_phys + flat_magic) × (1 + pct_magic) × … × (1 + 1/3)
  hit_phys  = 0
  magicPen  = min(cap, magicPen% + armorPen%)
  ```
- **Stats:** Magic damage %, Mind, crit damage.
- **The trade-off is the build:** physical damage % and Might's damage bonus do nothing
  (Might still gives max HP), so it wants magic damage gear on a heavy, slow 2H base. Two-handed means no shield or
  tome, which is the cost a caster pays for the bigger hit.
- **Versus Spellblade** (Hexblade, T2): Spellblade swaps any damage's type and keeps both
  %-groups (and doesn't swap penetration). Moonlight is magic only, so it doesn't use
  physical %, but flat physical still counts, it has the wave, and armor pen becomes
  magic pen. Hexblade fits any gear; Moonlight rewards a full Mind / magic build.

*Walk lines (flavor.ts):* "White petals drift past, though nothing here is in bloom." ·
"Your shadow falls the wrong way, toward a moon that isn't there." · "The fountain shows
a full moon. The sky above it is empty."

## T5: Brightvein Hold

A dwarven hold in the mountain the largest moon shard fell through (story.md). Its light
got into the stone and the veins began to glow: **brightsteel**, the T5 metal. The dwarves
dug after it until the mine broke into the rift; their last thane sealed the breach and
bound himself to the shard to hold it. Levels 46–55. Boss at the full HP bonus (× 1.3).

**The T5 step:** HP and DPS × 1.34 over the reference curve, not × 1.22: the climb's
usual × 1.05 plus a one-time × 1.1 (zones.md, "Difficulty climb"). The tier that opens
the Shifting Rift is the first wall.

| Enemy | Level | Damage | Defense | Speed | HP | DPS | Armor / Res | XP | Gold |
|---|---|---|---|---|---|---|---|---|---|
| Glowvein Crawler | 46 | Phys | Armored | 1.4/s | 883 | 63.9 | 276 / 46 | 899 | 225 |
| Tunnel Drake | 48 | Phys | Balanced | 1.0/s | 1,645 | 77.4 | 120 / 120 | 1,168 | 292 |
| Runeweave Warder | 50 | **Magic** | Warded | 0.9/s | 1,990 | 93.6 | 50 / 300 | 1,518 | 380 |
| Brightsteel Golem | 52 | Phys | Armored | 0.5/s | 1,808 | 113.3 | 312 / 52 | 1,973 | 493 |
| Hollowed Delver | 54 | **Magic** | Balanced | 1.1/s | 2,913 | 137 | 135 / 135 | 2,564 | 641 |
| **Boss: Durgrim, the Last Thane** | 55 | Phys | **Warded** | 0.7/s | 5,041 | 182.4 | 55 / 330 | 3,799 | 950 |

- **Traits**, each paid for with HP: the **Glowvein Crawler** is hard to hit (**evasion
  rating 277**: 35% dodge against a same-level player without accuracy gear, HP 1,360 →
  883) behind armor, so physical builds need accuracy *and* armor penetration, or magic.
  The **Brightsteel Golem** regenerates (**60 HP/s**, HP 2,408 → 1,808) behind armor: the
  zone's burst check.
- **The boss is the last mix: physical damage behind Warded defense**, a runeforged
  king in runed brightsteel plate. Plate soaks his hits; magic builds hit
  his resistance and need magic penetration or a switch to physical. All four
  combinations are now used: Grubnak (phys, balanced), Morgra (magic, warded), Hrimvald
  (phys, armored), Selvara (magic, armored), Durgrim (phys, warded).
- Physical-leaning zone (4 of 6 physical) after T4's three casters, so armor matters again.
- **First kill** unlocks the next tier and, once built, **the Shifting Rift**
  (shifting-rift.md): the seal breaks and the rift opens.
- **Bases are dealt by theme** rather than shuffled: the Golem drops plate and shields,
  the Warder Runeweave and the tome, the Drake Drakehide, the Delver weapons.
- No secret area yet. T5 uniques: Forgefather's Maul, Veinseeker, Shardbound Band
  (uniques.md), plus T1–T4 uniques at lower weight.
- **Simulated** (200 random characters, auto-equipped, 20 fights each; T4 in brackets).
  Farming gear (Magic 50%, Rare 40%, Epic 10%) at level 50: Warder 88%, Golem 49%, Delver
  22% won (Spellweaver 84%). Players at level 58 in Rare/Epic/Legendary gear beat Durgrim
  4% of the time, physical builds 7% and magic 0% (Selvara 25%). He's the gear check
  before the Shifting Rift: tempering, rerolls and a planned physical build.

**Areas:**

**Map:** a terraced mine pit seen from above, unlike the climbs before it: one road down
from the tunnels at the rim (top left), across to the forge ruins (right), back to the
rune gate (left) and down to the glowing rift at the bottom. No branches: the only zone so
far with a single route. Spots are placed beside the landmarks of the map art.

| Area | Enemies | Blurb |
|---|---|---|
| Brightsteel Lode | Glowvein Crawler, Tunnel Drake | Glowing veins light the upper tunnels, and things crawl toward the light. |
| Collapsed Forge | Runeweave Warder, Brightsteel Golem | The great forge lies cold and broken. Its rune-keepers still tend it. |
| Runebound Gate | Hollowed Delver | Rune-carved doors to the lowest shafts, and the miners who never came back up. |
| Sealed Breach (lair) | Durgrim | The Last Thane stands fused to the seal, the shard blazing in his chest. |

**Drops:**

| Enemy | Bases |
|---|---|
| Glowvein Crawler (8) | Brightsteel Dagger, Ironwood Bow, Drakehide Bracers, Runeweave Shoes, Brightsteel Greaves, Brightsteel Main Gauche, Cut Windstone Ring, Cut Windstone Amulet |
| Tunnel Drake (7) | Brightsteel Mace, Ironwood Crossbow, Drakehide Vest, Drakehide Cap, Brightsteel Gauntlets, Cut Bloodstone Ring, Cut Bloodstone Amulet |
| Runeweave Warder (7) | Ironwood Wand, Ironwood Healing Staff, Arcanist's Tome, Runeweave Hood, Runeweave Robe, Cut Moonstone Ring, Cut Moonstone Amulet |
| Brightsteel Golem (7) | Brightsteel Greatsword, Brightsteel Shield, Brightsteel Greatshield, Brightsteel Helm, Brightsteel Breastplate, Drakehide Boots, Cut Sunstone Ring |
| Hollowed Delver (7) | Brightsteel Sword, Brightsteel Scepter, Brightsteel Katana, Ironwood Fire Staff, Brightsteel War Horn, Runeweave Gloves, Cut Sunstone Amulet |
| Durgrim (boss) | Any T5 base |

Base IDs for zones.ts `T5_DROPS`: crawler [2, 8, 36, 33, 41, 24, 51, 55], drake [3, 11, 35, 34, 40, 50, 54],
warder [5, 10, 21, 30, 31, 52, 56], golem [7, 20, 22, 38, 39, 37, 53], delver [1, 4, 6, 9, 23, 32, 57].

**Materials:** Brightsteel Ingot (Metal), Drake Scale (Hide), Glowvein Core (Core), Runeweave Bolt (Cloth), Ironwood Beam (Wood), Glowcap (Reagent), Radiant Gem (Gem). Gathering only: Brightsteel Ore (Mining), Lanternroot (rare herb, Foraging).

| Enemy | Materials |
|---|---|
| Glowvein Crawler | Drake Scale, Glowcap |
| Tunnel Drake | Drake Scale, Glowcap |
| Runeweave Warder | Runeweave Bolt, Glowvein Core, Radiant Gem |
| Brightsteel Golem | Brightsteel Ingot, Glowvein Core, Radiant Gem |
| Hollowed Delver | Brightsteel Ingot, Ironwood Beam, Runeweave Bolt |
| Durgrim (boss) | Brightsteel Ingot |

*Walk lines (flavor.ts):* "The veins in the walls glow brighter the deeper you go." ·
"Somewhere far below, a hammer strikes once. Then silence." · "The shards in your pack
pull downward, through the stone."

## Open

- Enemy and boss art (placeholders for now).
- The T3 and T4 bosses' simulated checks.
- T4 uniques: drafted in uniques.md (Moonlight Greatsword, Waxing Crescent, Moonshadow
  Jerkin, Tear of the Moon, Lunatic's Wager).
- Moonlight Garden: tune the Champion and the wave (×2 every 3rd attack) by simulation.
- Whether the Rimebound Cultists of T3 are what's left of whatever darkened the moon.
