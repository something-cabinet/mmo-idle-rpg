# Shifting Rift: review notes

Findings from a review of shifting-rift.md against the fight engine (fight.ts, combat.ts),
2026-10-21. Balance is out of scope (the Rift has no balance goal); these are build cost,
ambiguity and low-value content only. Work through them, then fold the answers into
shifting-rift.md and delete this file.

## Hard to build as written

- [ ] **Your Reflection (event).** The doc says it "reuses duels", but no duel system
  exists. `simulateFight` only fights a player against an `EnemyDef`; a true mirror would
  need shields, blocks, Parry and rift effects on the enemy side.
  **Suggested:** build an `EnemyDef` from your run stats (HP = your max HP, DPS = your
  matchup DPS, your damage type, your armor/resistance as its defense). No new engine.
- [ ] **Unravel (Rift Heart turns a boon off at 50% HP).** Boons feed `CombatStats` (max
  HP, crit, block, lifesteal), and `simulateFight` keeps `s` fixed for the whole fight
  (`face()` only swaps the matchup). Doing it mid-fight means splitting the fight at 50%,
  which needs:
  - a new "enemy starting HP" mod;
  - a rule for your current HP when the boon turned off is Thick Skin (or any max-HP boon);
  - a rule for state that resets at the split (Thunderhead stacks, shields, swing timers,
    Opening Salvo's 5 s window).

  **Suggested:** turn the random boon off for the whole boss fight, shown before the fight
  starts. Same punishment for one-trick builds, no engine work.
- [ ] **Phoenix Plume.** "Then the item burns away" happens on a killing blow, so the slot
  would empty mid-fight: the same stat-change problem as Unravel.
  **Suggested:** the item burns when the node ends; its stats last until then. Also state
  that its other headlines burn with it.

## Needs a rule in the doc (cheap once decided)

- [ ] **"Each fight" vs "fight node".** A node is 1–3 enemies in a row. Opening Salvo,
  Stubborn, Smoke, Tailwind, Bracing and Bloodrush ("per fight won") depend on which one
  "fight" means. Each enemy is its own `simulateFight` call, so "per enemy" is the natural
  reading. Say it once.
- [ ] **Shields.** Five sources: Stubborn, Hold the Line, Blood Price, the Bastion 5-set
  and Second Skin. The engine has one `shield` value. Decide whether they share one pool
  that adds up, and whether the Bastion 5-set's shield refreshes or stacks.
- [ ] **Echoes of two-effect uniques.** 13 of the 30 uniques have two effects; the doc
  says "a unique's effect". With one effect only, Drawing Fire and Twin Flame become
  guaranteed boss headlines that do nothing.
  **Suggested:** an Echo copies the whole unique. Both party-only effects sit on uniques
  with a second effect (Twinstep Sabatons: Bulwark; Sindri's Bellows: Zealot's Oath), so
  no Echo is ever a dud.
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
  armor and resistance".
- [ ] **Wildcard.** Say whether it counts toward your main theme for offer slot 1. Theme
  marks explicitly do; if Wildcard did, every theme would tie.
- [ ] **Static.** Does the shock land when the 5th swing misses an evasive enemy? It
  should, or "can't be dodged" means nothing.
- [ ] **Reflects.** Mirror Mail: before or after mitigation and block? "Works like
  Thornshell" settles it. Aegis 5-set: the whole hit, or just the blocked part?
- [ ] **Rift Anchor.** "All stats on your other items +20%": affixes only, or base
  damage, armor and legendary effect amounts too? Affixes only is the easiest to build
  and to read.

## Architecture

- [ ] **Boons go into the stat build, not on top of it.** The doc says "Boons are 'more'
  multipliers after gear", but several boons can't work that way:
  - Keen, Fleetfoot and Raised Shield add flat chances;
  - Sunder and Iron Hide change armor and resistance before mitigation;
  - Glimmerguard's crit-to-evasion conversion must run after boons, and it happens inside
    the stat build (combat.ts, the `parryRating` lines in `combatStats`).

  So boons must be passed into `combatStats` and the matchup. Moderate work, but it shapes
  how `runStats` is built: decide it first. Update the "more multipliers" line in the doc.

## Low value as separate content

- [ ] **Thief's Glove.** A money effect on a 30% combat headline. It overlaps Lucky Coin
  and does nothing late in the run, when Motes stop mattering ("often useless").
  **Suggested:** swap it for a combat effect.
- [ ] **First Blood.** Exactly Ambush (5× first swing, per enemy). Fine as a stacking
  copy and cheap, but nothing new to discover. Keep or replace.
- Near copies that are fine as they are, since they reuse existing code: **Frenzy**
  (Berserker), **Coup de Grâce** (Executioner), **Echo Strike** (Moonlight's double hit).

## Cheap, no action needed

Small hooks in `simulateFight`: Gambler's Edge, Overclock, Wither Aura, Phantom, Deep
Guard, Shieldwall, Thunderhead, Tailwind, Counterstep, Bracing, the Fortune boons, the
weekly mutations, Goblin in the Rift, and the Rift Heart's Shift (can follow the raids'
Lunar Phases).
