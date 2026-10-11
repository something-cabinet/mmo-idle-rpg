# Combat

## Model

- **Auto-combat, pure stat check.** The character fights automatically; there are no
  active abilities. The player's decisions are gear, loadout and zone.
- **One enemy at a time.** Each fight starts at full HP; recovering between fights is
  part of the respawn time.
- **One model, two evaluations:**
  - The **server** settles rewards with the expected-value formulas below, both online
    and offline. It never simulates individual fights.
  - The **client** animates fights for the online view (swings, crits, dodges, damage
    numbers) using a seeded random generator. This is presentation only and never
    affects rewards.
- **Consequence:** viability is deterministic. There are no unlucky online deaths, and
  offline results always match online.
- **Defeat:** a fight that isn't viable kills the character `timeToDie` after it starts,
  online or offline. The character then goes **idle** (no target, no gains) until the
  player picks a new target, so a bad pick before logging off wastes the time away.
  Players can also go idle on purpose with **Flee**.
- Time to kill, time to die and the win margin are internal: the UI never shows them.

### Legendary effects

Legendary affixes (legendary.md) plug into the formulas below by changing one term each
(damage type, crit damage, evasion cap, extra DPS, respawn time, rewards). Each effect
applies at most once per character.

### Rule for new mechanics

Every mechanic needs a closed-form expected value. Avoid chained procs, on-kill
stacking buffs and conditional triggers unless they have an averaged formula.

## Stat aggregation

```
final(stat) = (base + Σ flat) × (1 + Σ percent)      then apply caps
```

`base` comes from the level and the weapon. Gear and primary attributes add to the
flat and percent sums (see attributes.md).

## Formulas

```
mitigation(def, pen, level) = min(0.85, d / (d + 5 × level))   where d = def × (1 − pen)

evasion  = min(0.60, r / (r + 10 × enemyLevel))                  // r = evasion rating

// Crit is per source: base crit comes from the weapon (attributes.md).
critChance(s) = s.weapon.baseCrit × (1 + Σ increasedCrit%)        // uncapped
critMult(s)   = 1 + min(1, critChance(s)) × (critDamage − 1)      // excess over 100% unused              // damage and heals

// Attack sources: each equipped weapon that attacks, with a speed factor.
// Today: sources = [ { weapon: mainHand, speedFactor: 1 } ]
attacksPerSec(s) = max(s.weapon.speed × (1 + attackSpeed%), 0.25 × s.weapon.speed)
                   × s.speedFactor

DPS_you  = Σ sources s   Σ damage types t
             s.weapon.damage_t × scale_t × (1 − mitigation(enemyDef_t, pen_t, enemyLevel))
             × attacksPerSec(s) × critMult(s)

HPS_self = Σ sources s   s.weapon.heal × healScale × attacksPerSec(s) × critMult(s)
                                                       // solo: heals land on yourself

DPS_enemy   = enemyDamage × enemySpeed
              × (1 − mitigation(yourDef_{enemyType}, 0, yourLevel)) × (1 − evasion)
netIncoming = DPS_enemy − hpRegen − lifesteal × DPS_you − HPS_self   // lifesteal cap 3%

timeToKill = enemyHP / DPS_you
timeToDie  = netIncoming ≤ 0 ? ∞ : maxHP / netIncoming

viable   = timeToKill < timeToDie          // otherwise: defeat at timeToDie, then idle
killRate = 1 / (timeToKill + respawnTime)
```

- `s.weapon.damage_t` = the weapon's base hit + `addedFlat_t`. Flat added damage is a
  straight bonus per hit, so fast weapons get more DPS from it. Flat heal works the same way.
- `scale_t` is the final multiplier from damage-% stats of that type; `healScale` from heal-% stats.
- Two damage types, **Physical** (vs Armor) and **Magic** (vs Resistance).
- **Attack sources.** Today only the main-hand weapon attacks; off-hands (shield, focus)
  contribute stats only. The formulas sum over sources so other attackers can be added
  later without changing them, e.g. an off-hand weapon as
  `{ weapon: offHand, speedFactor: 0.5 }`. Code should follow the same shape: build a
  list of sources, then sum over it, rather than reading the main hand directly.
- The 25% floor stops attack-speed penalties (e.g. plate) from reducing a build to
  almost no attacks.

## Rewards and settlement

```
kills  = elapsed × killRate
xp     = kills × enemyXp × (1 + xpGain%)
gold   = kills × enemyGold × (1 + goldFind%)
drops  = per rarity: sample(kills × dropChance[rarity] × (1 + itemFind%))
         // each drop: base picked from the enemy's base weights, tier = zone tier
```

- Settlement follows the existing `project()` pattern: state is a snapshot as of
  `lastSettledAt`, and gains are computed from elapsed time.
- The player fights one chosen **target enemy** (zones.md). `enemyXp`, `enemyGold`
  and `dropChance` come from that enemy.
- **Anything that changes stats or the target settles first** at the old values:
  equipping, switching loadouts, changing zone or target enemy, leveling.
- Offline time is capped (8h today).
- Drop sampling uses a seed derived from (character, settle time), so the server's
  result is reproducible.

## Raids (online only)

Multiplayer raid bosses cannot be farmed offline. Draft rules:

- The boss attacks whoever has the highest threat.
- Heals target allies: "all" heals spread across the party; "single" heals go to the
  most injured ally.
- Party size, boss mechanics and rewards are open.
