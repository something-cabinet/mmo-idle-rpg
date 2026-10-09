# Attributes

Two layers: four **primary attributes** that grow with level, and **combat stats** that
the formulas in combat.md use. Most power comes from gear.

## Primary attributes

Every level-up gives **+1 to all four primaries** and a small amount of max HP
(*illustrative:* +5). There is no point allocation. Gear can also add primaries, which
is where they differ between builds.

Each point is a percentage bonus, so primaries stay relevant as gear grows.
*Illustrative values:*

| Primary | Per point |
|---|---|
| **Might** | +0.5% physical damage, +0.2% max HP |
| **Finesse** | +0.3% attack speed, +0.2% crit chance, +0.1% evasion |
| **Mind** | +0.5% magic damage, +0.5% heal |
| **Vitality** | +0.5% max HP, +0.5% HP regen, +0.3% threat |

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
| 6 | Crit chance | flat | cap 75% | Kill speed, heals |
| 7 | Crit damage | % | base 150% | Kill speed, heals |
| 8 | Armor penetration | % | | Kill speed vs Armor |
| 9 | Magic penetration | % | | Kill speed vs Resistance |
| 10 | Max HP | flat | | Survival |
| 11 | Max HP | % | | Survival |
| 12 | Armor | flat | | Survival vs physical |
| 13 | Armor | % | | Survival vs physical |
| 14 | Resistance | flat | | Survival vs magic |
| 15 | Resistance | % | | Survival vs magic |
| 16 | Evasion | flat | cap 60% | Survival |
| 17 | HP regen | flat /s | | Survival |
| 18 | Lifesteal | % | | Survival |
| 19 | Heal | flat | | Self-sustain, raid healing |
| 20 | Heal | % | | Self-sustain, raid healing |
| 21 | Threat | % | | Raid tanking |
| 22 | Item find | % | | Drop chance |
| 23 | Gold find | % | | Gold |
| 24 | XP gain | % | | XP |
| 25 | Might | flat | | Primary |
| 26 | Finesse | flat | | Primary |
| 27 | Mind | flat | | Primary |
| 28 | Vitality | flat | | Primary |

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
