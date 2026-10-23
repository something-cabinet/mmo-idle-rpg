# The Shifting Rift: build plan

How to build [design/shifting-rift.md](design/shifting-rift.md), co-op included. Draft,
2026-10-23. Milestones R0–R7, each one commit (or a few), in order; every milestone leaves
`main` working, and the Rift stays hidden in the client until R5.

## Status and handoff (2026-10-23)

**Start the next session here.** Read this section, then the milestone you're on.

| # | Milestone | State |
|-|-|-|
| R0 | Decisions | **Done** |
| R1 | Data and generation | **Done** (`npm run test:rift` passes, with every other check) |
| R2 | Engine hooks | **Done** (`npm run test:combat` has a check per hook; old fights unchanged) |
| R3 | A node, a run, the bots | **Next** |
| R4 | Schema and solo reducers | — |
| R5 | Client, solo | — |
| R6 | Co-op | — |
| R7 | After launch | — |

**What R1 left in the code:**

- `spacetimedb/src/data/rift.ts`: all Rift content as data.
- `spacetimedb/src/rift.ts`: everything a run rolls.
- `scripts/check-rift.ts`, as `npm run test:rift` in package.json.
- Riftstone: material ID 1400 (`data/materials.ts`).
- `withEliteAffix` (abyss.ts): the Elite affixes, shared by the Deep and the Rift.
- In `data/zones.ts`: `farmingReward(tier, hours, mult)` (the Deep's `depthReward` uses it,
  same numbers), `averageEnemyHp` / `averageEnemyDps` and `offenseCurve`.

**Decisions taken in R0** (the user's answers; the full text is in shifting-rift.md, "Decided"):

- Boons that can't go higher are left out of offers and the shop's upgrade.
- Leech raises the lifesteal cap too.
- Wildcard counts for set bonuses only, not the main theme.
- Static's shock lands on a miss.
- Mirror Mail works like Thornshell; the Aegis 5-set reflects the whole hit.
- Warded Shell Trophy: the higher of armor and resistance.
- Rift Anchor raises affixes only.
- Thief's Glove (Motes) and First Blood stay.
- Stat boons go into `combatStats`; combat boons, rift effects and Trophies into `Fighter`.
- A floor pays when its boss falls. Weeks start Monday 00:00 UTC.
- Co-op: everyone presses Ready before the party moves on; offline members count as ready.
  Event fights are personal. Online = the `presence` table. A Rift party and a raid party
  can coexist. A downed member returns at 50% of max HP.
- A Rift item has the same columns as `item`, plus run, owner, worn slot and headlines.
- The mutation doubles on the Rift Heart (Storm Front +60%, Glass World × 4).
- Re-clearing a floor at a higher tier pays the gold, XP and Dust difference, plus the
  higher tier's materials in full (2026-10-23).

**Decisions taken in R1** (reviewed by the user 2026-10-23: Haggler Common-only, echoes at average strength and offers always showing an upgrade are confirmed; the rest are numbers for R3 to tune):

- **IDs**: boons `300 + theme × 10 + n` (Wildcard 380), rift effects 201–214, Trophies
  `250 + Elite affix`, curses 401–403, Rift Heart enemy 9200. They share one space with the
  legendary and unique effects (1–99), so R2 can put them all in `CombatStats.effects`.
- **Haggler** is Common-only: the design gives it no values to upgrade.
- **Echoes** keep their source enemy's HP-to-DPS lean, damage type, defense and traits, but
  not its strength: every echo is as strong as the average enemy (traits still paid with HP).
- **Maps**: node kinds for nodes 2–5 weighted fight 45 / elite 15 / shop 15 / event 25,
  redrawn until valid. Links are drawn as a staircase, so they never cross. An event isn't
  repeated on a floor.
- **Fights**: 1 / 2 / 3 enemies at 45 / 35 / 20%.
- **Mutations** rotate as a seeded shuffle of all 7 per 7 weeks, never the same twice in a row.
- **Offers**: an upgrade of a held boon is always among a slot's choices, next to the new
  boons at the rolled rarity.
- **Shops**: 3 boons, an item and a heal, then what applies of an upgrade, attuning, curse
  removal and boon removal, topped up with boons and items.
- **Motes**: fight 45, Elite fight 75, boss 60, a floor paying about 150–250.
- **`RIFT_HP` 1 / `RIFT_DPS` 0.25**: placeholders for R3 to tune.

**Open questions:**

- **What Riftstone crafts.** Not needed until after launch.
- **The 9 new events** are written in the design (Thane's Vault … Runecarver, 20 in all),
  not yet in `data/rift.ts` `EVENTS`. Add them with R3's event outcomes.
- **Two-handed weapons** (design, "The Rift loadout"): a two-handed weapon discards the
  weapon and the off-hand; a one-handed weapon discards a two-handed one; an off-hand can
  be worn only with a one-handed weapon equipped. The card warns. For R3's `take`.
- **Riftstone icon** (`m-riftstone`): needed by R5.

**What R2 left in the code** (every check passes; a snapshot of ~300 seeded zone, Deep, raid
and duel fights replayed identically before and after):

- `combatStats(level, gear, buffs, rift?)` with `RiftBuild` (data/rift.ts): boons, curses,
  marks, mutation, Motes, fights won this floor, Thick Blood. `riftEffects` puts each boon in
  `CombatStats.effects` at rarity + 1 copies (`boonAmount` reads the value back), plus curses
  and the set bonuses reached (`setBonusId`: 300 + theme × 10 + 7 / 8).
- New stats: `evadeChance` (flat, capped), `block` (on top of Bulwark), `blockShare`;
  `evasionCap(s)`.
- `Fighter` (fighter.ts): every combat boon, rift effect and Trophy. `FighterStart` takes
  `holdTheLine` and `phoenix` (still available); after a battle read `holdTheLine`,
  `phoenix`, `burned` (delete the Plume's item) and `secondWind` from `result.fighters`.
- battle.ts: Phantom, Smoke, Slip Away, blocks (Shield Bash, Steady Guard, the Aegis 5-set),
  Blood Price, Clotting, kill heals, the Bastion 5-set and Wither Aura (on the regen tick).
- rift.ts: `mutatedEnemy` (before `withEliteAffix`), then `riftFoe` (Blood Moon's drain, the
  Rift Heart's Shift from a generator you pass).
- Checks: a Rift section in `check-combat` (one per hook).

**For R3's `memberStats`:** rift effects, Trophies and an Echo's unique effects go in the
Ethereal item's `effects` (the stat build reads them like a unique's); marks go in
`RiftBuild.marks`; leave an Unravelled boon out of `boons`.

**Decisions taken in R2** (my reading of the design where it was open; for the user to review):

- **Percent boons** are "more" multipliers, except Cruel, which adds to crit damage like the
  stat. Sunder multiplies what penetration leaves, past the 75% cap.
- **Evade chance** from Fleetfoot, the Mist 3-set and Smoke stays under the evasion cap (Phantom
  Step raises it; Juggernaut and Spellward stop it).
- **Voidheart** makes armor penetration count as magic penetration, like Moonlight.
- **Hexed** cuts heals, regen and lifesteal. Unyielding's regen is 0 under Frozen Blood or
  Bloodbound. Vampiric adds 50% lifesteal past every cap, even under Frozen Blood.
- **Overclock's** HP cost never kills (it skips at 1% HP or less).
- **Echo Strike** doubles every 4th swing that lands (no roll of its own). **Static's** shock
  is the value × your plain hit on that enemy. **The Storm 5-set's** chained damage waits for
  the next swing that lands.
- **The Mist 5-set with Glimmerguard:** parried crits × (1 + 0.5 / crit damage).
- **Kill heals** (Transfusion, the Blood 5-set): every member still up, whoever killed it.
- **Wither Aura** ticks with regen, per wearer, and can kill.
- **Shield Bash and the Aegis 5-set** show as `reflected`. **Bracing** counts specials too.
  **Braced** counts Elite and Boss ranks.
- **The Rift Heart's Shift:** 12 shifts rolled in advance for the 3:00. The doubled mutation
  is on the Heart's side only (the player's own Storm Front or Glass World stays single).
- **Blood Moon's** drain adds to Vampiric's. **Iron Week** applies before Elite affixes, so
  a Warded Shell Elite still picks its profile.

**R3 next:** `memberStats`, `simulateNode`, `apply` and the bots (below).

## Shape

The design already says how the Rift fits the code, and the plan holds to it:

- **One pure run state machine, shared.** `rift.ts` holds a `RunState` (the run plus its
  members) and `apply(state, action, rng)` for every action: move, pick, buy, take, event
  choice, leave. The reducers load the rows into a `RunState`, call `apply`, and write it
  back. The `test:rift` bots call the same `apply`. So the bots test the real rules, and
  the reducers are thin.
- **A solo run is a party of one** from the first schema (`rift_run` + `rift_member`).
  Co-op (R6) adds the lobby, leader handover and the party UI, not a second data model.
- **Every fight is a battle** (battle.ts). A node is a chained battle of its enemies
  against every member who's still up. Boons and rift effects are effects in `Fighter` and
  `combatStats`, so they also work in co-op without extra work.
- **The server settles and the client replays**, like the Deep: the node's fight is played
  in the reducer call, its inputs are stored on the run, and the client replays them with
  the same code.
- **Nothing equippable crosses the boundary**: Ethereal items and locked copies live in
  `rift_item`, never in `item`.

## R0: decisions (done, 2026-10-23)

The review notes are closed and folded into design/shifting-rift.md ("Decided"). Still open:
what Riftstone crafts (the material is added in R1 anyway).

## R1: data and generation (pure, no server) — done, 2026-10-23

Built as below, with these differences: the helpers are `withEliteAffix` (abyss.ts) and
`farmingReward` (data/zones.ts, next to the new `averageEnemyHp` / `averageEnemyDps`);
events are the design's 11 (the other ~9 are content still to write); floor 5's Essences
and Greater meal wait until those exist; echoes keep their source's HP-to-DPS lean but not
its strength. Event outcomes are R3 (`apply`).

- **`data/rift.ts`**: themes; 44 boons (43 + Wildcard) with permanent IDs, rarity values,
  stat gates and keystone flags; set bonuses; curses; 14 rift effects; 6 Trophies; ~20
  events (the 11 in the design + ~9 more); 7 mutations; 6 gifts; shop prices; floor
  multipliers; `RIFT_HP` / `RIFT_DPS` (placeholders, tuned in R3); the reward table; the
  Rift Heart.
- **`rift.ts`**, generation only:
  - `riftWeek(micros)`, `weeklyMutation(week)`;
  - `runSeed(runId, startMicros)`, and a per-member generator
    `memberRng(seed, characterId, floor, node, purpose)` so nobody shares another's luck;
  - `floorMap(seed, floor)`: rows of 2–4 nodes, links to 1–2 nodes, under the 4 generator
    rules (node 1 is a fight, a shop in nodes 2–5, an Elite-free path, 2+ fights on every
    path);
  - `nodeLineup(seed, floor, node)`: 1–3 echo kinds from every zone enemy and boss, the
    Elite and its affix, the boss options;
  - `riftEnemy(tier, floor, kind, slot, partySize)`: the HP and DPS formulas; armor and
    the other stats at the tier's values;
  - offers (the 3 slots, Second Look, stat gates, rarity odds per floor), shop stock, gift
    rolls, event rolls;
  - `rollEthereal(rng, tier, source)`: a base of the run's tier via `makeItem` with affix
    tier ≥ T − 2, plus the 5 independent headlines and the guarantee from the source.
- Move the Elite-affix block out of `abyss.ts depthFoes` into a shared
  `applyEliteAffix(enemy, affix, stats)`, so the Rift and the Deep use the same affixes.
- Extract the hours-to-reward math in `depthReward` (1,200 gold / 4,800 XP / 15 Dust an
  hour × 2.9^(T−1)) into `hoursReward(tier, hours)`, and add `floorReward(floor, tier)`.
- **Check** `scripts/check-rift.ts` (`npm run test:rift`): 10,000 maps follow every rule;
  the headline odds match the design's table; the same seed gives the same run.

## R2: engine hooks (battle.ts, fighter.ts, combat.ts) — done, 2026-10-23

Every existing fight has to replay exactly as before: an empty effect map must change
nothing, and must draw nothing from the generator. `check-sim` and `check-abyss` already
compare runs by seed, so they catch any drift.

- **Stat build**: `combatStats(level, gear, buffs, rift?)`. Applies Keen, Fleetfoot, Raised
  Shield, Sunder, Iron Hide, Thick Skin, Red Tithe, Quickened, Cruel, Fortress / Shieldwall
  speed, Glass Heart, Overclock speed, Voidheart (last in the type order), Rift Conduit,
  Hoarder's Band, Bloodrush (from the run's counters), curses, the set bonuses, Rift Anchor
  (+20% affixes) and Frozen Blood vs Bloodbound. Then Glimmerguard's crit-to-evasion
  conversion runs **after** all of this.
- **Block becomes a stat**: today only Bulwark blocks (its amount is the chance, a block halves the hit). Generalize it to a block chance
  (Bulwark + Raised Shield + the Aegis 3-set), a blocked share (Deep Guard, Shieldwall) and
  Bracing's always-block hits.
- **`Fighter` hooks**, grouped by trigger:
  - **fight start**: the shield pool (Second Skin + Stubborn), Smoke, Opening Salvo,
    Tailwind;
  - **swing**: Static, Echo Strike, Gambler's Edge, Overclock's HP cost, Thunderhead,
    Opening, First Blood and the Fury 5-set per enemy, Coup de Grâce, Frenzy, the Ravenous
    Trophy ramp, Storm 5-set chain;
  - **dodge**: Counterstep, Slip Away, Mist 5-set; **block**: Shield Bash, Steady Guard,
    Aegis 5-set reflect;
  - **hit taken**: Phantom's double evade check, Braced (Elites and bosses), Hold the Line,
    Mirror Mail, Thorned Trophy;
  - **heal**: Blood Price overflow into the shield, the lifesteal cap (Blood 3-set,
    Bloodbound, Leech), the Vampiric Trophy past the cap, Clotting;
  - **kill**: Transfusion, Blood 5-set; **every 10 s**: the Bastion 5-set shield;
  - **killing blow**: Phoenix Plume after Second Wind (it reports that it burned, so the run
    can delete the item).
- **Foe traits**: the Rift Heart's Shift (Lunar Phases with a seeded random order and the
  mutation applied twice); foe lifesteal for Blood Moon (as `drain`); Wither Aura on the
  regen tick (once a second, now that regen ticks); the Storm Front / Glass World / Iron Week
  multipliers on both sides.
- **Checks** in `check-combat`: one targeted check per hook (like the existing Moonlight and
  Parry checks), and no change at all without rift effects.

## R3: a node, a run, the bots

- `memberStats(member)`: locked copies + worn Ethereal items + boons (minus an Unravelled one)
  + curses + mutation, at the locked level, with no consumables (`renewal` 0).
- `simulateNode(run, members)`: one chained battle, every member who's up against the node's
  enemies, with their carried HP, the shield, Second Wind left for the floor, the 3:00
  limit, and enemy HP × the party factor (1 / 1.8 / 2.5 / 3.2). Each member's part comes back
  as fights (like `fightEvents` per player).
- `apply(state, action, rng)`: the whole run logic: Threshold, moves, node outcomes (Motes,
  boon offers, Ethereal drops), shops, events, wear or discard, Growth on a boss clear, the
  50%-of-missing boss heal, floor clears, death, the end of the run.
- **Bots** in `test:rift`: random picks and a greedy theme builder, for a reference T5–T7
  player. Tune `RIFT_HP` / `RIFT_DPS` (and only those) until random clears floors 1–2,
  greedy clears floor 5 about half the time, and a full run plays ~25 fights. Also: a party
  of 2–4 bots with the factors, and the reducer call stays well under 1 ms per node.

## R4: schema and solo reducers

- **Tables** (new columns get defaults; nothing existing changes):
  - `rift_run` (public, so a party can see it): seed, week, tier, mutation, floor, row,
    position, leader, phase (`lobby`, `threshold`, `map`, `boss`, `ended`), party size,
    `lastFight` (the inputs the client needs to replay it: member stats encoded with abyss.ts
    `encodeStats`, start HP, Second Wind, the Unravelled boon, the start time);
  - `rift_member` (public with the run): HP, Motes, boons, curses, marks, locked level,
    Second Wind left, Hold the Line used, nodes won this floor, pending choices, downed,
    joined at;
  - `rift_item` (private, a view per run): the locked copies and Ethereal items;
  - `rift_week` (private): week, best tier paid per floor;
  - `rift_log` (private, last 10): floor reached, boons, final build, rewards;
  - `rift_codex` (private): boons, Ethereal bases and rift effects seen.
- **Reducers**: **leader** `riftStart(loadout, tier)`, `riftMove(node)`, `riftBoss(option)`;
  **each member** `riftPick(option)`, `riftBuy(offer)`, `riftTake(wear)`, `riftReady()`,
  `riftLeave()`. All of them go through `apply`. Solo, moving counts as ready. The first call in a new week ends the old run.
- **Unlock**: the T5 boss kill (`hasKilledBoss`), and a tier only if its boss is dead.
- **Smoke test**: a scripted solo run on the local server through Threshold, a fight, a
  pick, a shop and a leave, with the Ethereal rows deleted at the end.

## R5: client, solo

A **Shifting Rift** page under Adventure (the Deep's place in the nav):

- the start: the tier picker, the loadout picker, this week's mutation, the floors paid this
  week;
- the Threshold: 3 gift cards;
- the floor map, with the reachable nodes highlighted, and the boss pick with each boss's
  mechanic;
- the replay: the existing fight scene in chain mode (as AbyssView) with 2× / 4× / Skip,
  and party bars ready for R6;
- boon offers, boons with set progress (3 / 5), curses;
- the Rift loadout: wear or discard with a compare, the override warnings (Spellblade,
  Frozen Blood…), the Ethereal color and the "Rift only" tag;
- the shop and event dialogs; the run history; the Codex;
- a changelog entry (a `new` line).

## R6: co-op

Nothing in the run logic changes here. It's the party around it:

- **Lobby**: `riftCreateParty(tier?)`, `riftJoin(runId)` / invite through friends,
  `riftKick(characterId)`, the leader's `riftStart` moving the lobby to the Threshold. The
  tier is capped by the lowest member's unlock. Every member locks their own loadout when
  they join (`riftReady(loadout)`).
- **Leader handover**: `riftMove` and `riftBoss` accept the leader, or, while the leader is
  offline, the first online member in join order. Leadership returns when the leader is
  back.
- **Offline members** keep fighting as their stored member row; nothing is needed, since
  stats come from the row. Kicking requires the member to be offline for 10+ minutes.
- **Leave and kick**: the member's row and items are deleted; the party size, and the enemy
  scaling with it, change from the next node.
- **Death**: a downed member sits out until the floor boss falls, then comes back at 50% HP.
  The run ends when everyone is down.
- **Ready**: offers, shops and events are personal (from `memberRng`), and so are event
  fights; the map and the node fights are shared. After each node every member answers
  their choices and presses Ready; `riftMove` / `riftBoss` refuse until every online member
  is ready. Offline members count as ready, their choices waiting.
- **UI**: the party list with HP, ready or not, and who leads; the replay with every
  member's bar (RaidsView already draws a party).
- **Checks**: a 2-player run in the smoke test (two connections, one leaves mid-floor);
  `test:rift` parties of 2–4.

## R7: after launch

Rift Ranks 1–10, the rank board, what Riftstone crafts, more events.

## Risks

- **Replay drift**: the client must replay with the server's exact inputs. Store them
  (`lastFight`) instead of re-deriving them, as the Deep does with `encodeStats`.
- **R2 touches every fight**: hooks must draw no generator values unless their effect is
  present, or old seeds replay differently. The seeded checks catch it; run them all after
  each hook.
- **R1 and R2 are the bulk** (~44 boons + 14 effects + 6 Trophies + ~20 events, each a
  small hook with its own check). R4–R6 are mostly plumbing on top of existing patterns
  (the Deep's settle and replay, the raid party).
