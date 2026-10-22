# Shifting Rift: review notes

Findings from a review of shifting-rift.md against the fight code, 2026-10-21, updated
2026-10-22 for the one battle engine (battle.ts: every fight is a battle; a combatant's
effects live in `Fighter`, fighter.ts; a foe's mechanics are `FoeSpec` traits). Balance is
out of scope (the Rift has no balance goal); these are build cost, ambiguity and low-value
content only. Work through them, then fold the answers into shifting-rift.md and delete
this file.

## Solved by the engine

- [x] **Your Reflection (event).** The engine fights player against player on the server
  (`simulateBattle` with a `PlayerSpec` on each side; duels already run this way). The
  event is a battle against a copy of your run build: shields, blocks, Parry and Riposte
  work on both sides. Only rift effects and boons need their hooks (see "Architecture").
- [x] **A node of 1–3 enemies.** A node is a chained battle (`chain: true`), like a Deep
  depth: enemies enter in turn, HP, Second Wind and Renewal carry over, one time limit.
- [x] **Co-op.** N players against M foes, threat targeting and party heals are in the
  engine already. Co-op needs run state and reducers, not a new sim.

## Decided (folded into shifting-rift.md)

- [x] **Unravel.** A random boon is off for the whole boss fight, shown before it starts.
  No mid-fight stat swap.
- [x] **Phoenix Plume.** Saves you like Second Wind (a `Fighter` hook next to `take`); the
  item and all its headlines burn when the node ends, its stats last until then.
- [x] **What "a fight" is.** A fight lasts until your HP is reset to full, so a node's
  enemies are one fight: no Ambush on the next enemy, Waxing Moon keeps its bonus, the
  "first 5 s / first N" boons are spent on the first enemy, Bloodrush counts nodes.
  The same holds for a Deep depth; the engine's chain does it now (no `newFight`). The
  Rift's exception: HP also carries over between nodes, but each node is a new fight.
- [x] **Shields.** Every source adds to the one `shield` pool and stacks (the Bastion
  5-set adds on top); each source's own cap holds; the pool starts fresh each node.
- [x] **Echoes.** An Echo copies every legendary and unique effect of its unique.

## Needs a rule in the doc (cheap once decided)

- [ ] **Boons that can't be upgraded.** Second Look is Rare only; keystones and Wildcard
  are Epic only. Say what happens when a held one is offered again, or comes up in the
  shop's "Upgrade a boon". Simplest: leave them out of offers. The same applies to:
  - **Broken Mirror** on an Epic boon: there's no "one rarity higher";
  - **Shrine of Change**: it could reroll into a keystone before floor 3, or into a second
    keystone of one theme.
- [ ] **Leech.** "Cap still applies" makes it do nothing for a player already at the
  lifesteal cap, which breaks the doc's "no boon dead on arrival" rule. Make it raise the
  cap too, or only offer it below the cap.
- [ ] **Warded Shell Trophy.** The Elite version gives the enemy the defense profile that
  resists you. Players have no defense profile, so "you take the defense that resists…"
  has no clear meaning.
  **Suggested:** "the defense matching the enemy's damage type uses the higher of your
  armor and resistance" (what Juggernaut and Spellward already do in `defenseAgainst`).
- [ ] **Wildcard.** Say whether it counts toward your main theme for offer slot 1. Theme
  marks explicitly do; if Wildcard did, every theme would tie.
- [ ] **Static.** Does the shock land when the 5th swing misses an evasive enemy? It
  should, or "can't be dodged" means nothing. (The engine rolls a miss only against an
  evasive target, so this is a one-line rule in the swing.)
- [ ] **Reflects.** The engine now has one reflect rule (step 1b): Thornshell reflects
  what reached your HP (after your defenses and the shield), through the attacker's
  mitigation; reflected damage at you hits your shield, then HP, and nothing else shrinks
  it (`Fighter.takeDirect`). Mirror Mail: say "works like Thornshell" and it's settled.
  Aegis 5-set: the whole hit, or just the blocked part?
- [ ] **Rift Anchor.** "All stats on your other items +20%": affixes only, or base
  damage, armor and legendary effect amounts too? Affixes only is the easiest to build
  and to read.

## Architecture

- [ ] **Where boons and rift effects go.** The doc says "Boons are 'more' multipliers after
  gear", but several can't work that way, so decide first; it shapes `runStats`:
  - **Stat boons go into the stat build** (`combatStats`): Keen, Fleetfoot and Raised
    Shield add flat chances; Sunder and Iron Hide change armor and resistance before
    mitigation; Glimmerguard's crit-to-evasion conversion must run after boons, and it
    happens inside `combatStats` (the `parryRating` lines).
  - **Combat boons and rift effects go into `Fighter`**, like any effect, so every mode
    and co-op get them for free: shields (Stubborn, Hold the Line, Blood Price), timed
    ones (Opening Salvo, Smoke, Tailwind), per-swing ones (Static, Echo Strike, Gambler's
    Edge, Overclock, Thunderhead), per-dodge and per-block ones (Counterstep, Slip Away,
    Shield Bash, Steady Guard). `Fighter` reads them from `CombatStats.effects`, so rift
    effects need IDs there (200+, as planned) and boons need a way in (their own IDs in
    the same map, or a boon list on the stats).
  - **Foe-side rules go into `FoeSpec` traits**: Wither Aura (a damage-over-time on foes),
    the weekly mutations, Elite affixes on Rift enemies (already there).

  Update the "more multipliers" line in the doc once decided.

## Low value as separate content

- [ ] **Thief's Glove.** A money effect on a 30% combat headline. It overlaps Lucky Coin
  and does nothing late in the run, when Motes stop mattering ("often useless").
  **Suggested:** swap it for a combat effect.
- [ ] **First Blood.** Exactly Ambush (5× first swing, per enemy). Fine as a stacking
  copy and cheap, but nothing new to discover. Keep or replace.
- Near copies that are fine as they are, since they reuse existing code: **Frenzy**
  (Berserker), **Coup de Grâce** (Executioner), **Echo Strike** (Moonlight's double hit).

## Cheap, no action needed

Small hooks in `Fighter` or the battle loop: Gambler's Edge, Overclock, Wither Aura,
Phantom, Deep Guard, Shieldwall, Thunderhead, Tailwind, Counterstep, Bracing, the Fortune
boons, the weekly mutations, Goblin in the Rift (a foe with a short time limit), and the
Rift Heart's Shift (a foe trait like Lunar Phases, `FoeSpec.phases`, with a random order).
