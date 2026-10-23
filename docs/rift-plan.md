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
| R3 | A node, a run, the bots | **Done** (`npm run test:rift` plays bot runs) |
| R4 | Schema and solo reducers | **Done** (smoke test: a solo run on the local server) |
| R5 | Client, solo | **Done** (seen in a browser, desktop and phone width) |
| R6 | Co-op | **Done** (smoke test: a 2-player run; seen in a browser with two players) |
| R7 | After launch | **Next** |

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
- A floor pays once a week, at the tier of its first clear; a re-clear pays nothing, at any
  tier (2026-10-23, replacing "a higher tier pays the difference").

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
- ~~**Riftstone icon**~~: done in R5 (`m-riftstone`, a cracked stone, like the other material glyphs).

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

**Decisions taken in R2** (reviewed by the user 2026-10-23: all confirmed except Vampiric, which Frozen Blood now stops too):

- **Percent boons** are "more" multipliers, except Cruel, which adds to crit damage like the
  stat. Sunder multiplies what penetration leaves, past the 75% cap.
- **Evade chance** from Fleetfoot, the Mist 3-set and Smoke stays under the evasion cap (Phantom
  Step raises it; Juggernaut and Spellward stop it).
- **Voidheart** makes armor penetration count as magic penetration, like Moonlight.
- **Hexed** cuts heals, regen and lifesteal. Unyielding's regen is 0 under Frozen Blood or
  Bloodbound. Vampiric adds 50% lifesteal past every cap, but not under Frozen Blood (changed in
  review: Frozen Blood stops all lifesteal).
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

**What R3 left in the code:**

- `spacetimedb/src/riftRun.ts` (the run, apart from rift.ts's generation): `RunState` /
  `MemberState` / `Pending`, `startRun`, `apply(state, action, record?)` returning the new
  state, the battles it played (`RiftFight`: setup + result, for the replay) and a cleared
  floor. Actions: `move`, `boss` (leader), `choose` (a member's first pending choice: gift,
  boon, wear or discard, Vault item, shop buy / reroll / leave, event choice; `target` is a
  slot, boon or curse, `theme` a theme), `ready`, `leave`. Refusals throw `RiftError`.
  Also `memberStats`, `nodeSetup`, `wearPlan`, `unravelled`, `reachable`, `raiseAffixes`.
- All 20 events, with outcomes (data/rift.ts `EVENTS`, `EVENT_NUM`).
- `scripts/rift-bots.ts`: the reference player, a random and a greedy bot; `test:rift`
  checks the rules above and the bots' clear rates.
- Tuned: `RIFT_HP` 0.85, `RIFT_DPS` 0.15, and `FLOOR_STEP` 1.6 (was 1.25; see below).

At T5 (200 runs each): random picks clear floor 5 in 14% of runs, 71% end on floors 2–4, 4%
on floor 1; the greedy builder clears 45%. A full run is ~23 fights; a node settles in
~0.4 ms. T6–T7 come out harder for the same reference player (greedy 34% / 26%).

**Decisions taken in R3** (reviewed by the user 2026-10-23: all confirmed; party tuning stays for R6):

- **Floor scaling × 1.6, not × 1.25** (a "Decided" number). With × 1.25 no `RIFT_HP` /
  `RIFT_DPS` hits the target: the build outgrows the floors, so runs die on floor 1 or clear
  everything (random 25%+ full clears and ~15–20% floor-1 deaths; greedy ~70%).
- **A node that runs out of time ends the run** (`end: 'timeout'`), like a death. ~15% of
  bot runs end this way, mostly low-damage builds against Unyielding Elites and bosses.
- **Parties are much easier**: a greedy + random duo clears 76%, a party of 4 92%, with
  PARTY_HP 1.8 / 2.5 / 3.2. Left for R6 to tune.
- **Max HP gained comes with as much HP** (a Thick Skin pick heals its share); max HP lost
  trims HP.
- **Lucky Coin** raises every Mote earned (events too); Thief's Glove and Bargain Bin only
  fights' (bosses included). Gambler's winnings aren't "earned".
- **Kills and wins:** Bloodrush counts fight nodes won (Elites too). Afterglow heals after
  every fight node won. Bosses pay Motes but no boon pick.
- **Event specifics:** Your Reflection duels your build from your current HP, and a win costs
  nothing. The Goblin pays 2 Motes a hit. The Wandering Smith rerolls a random affix. Shrine
  of Change keeps a boon it can't replace. A Lurking Echo fight lost to time gives nothing.
  Curses never repeat.
- **Unravel** picks from your boons when the Rift Heart is fought (`unravelled`, also for
  the client to show it first).
- **Phases:** the run has only `map` and `ended`; the Threshold is the gift choice waiting.
  R4's `phase` column can derive `threshold` and `boss` from the state.

**Open for later:** the zone bosses' own mechanics on their echoes (the design's "its own
mechanic"); today a boss echo has its shape and an Elite affix only.

**What R4 left in the code:**

- Tables (schema.ts): `rift_run` and `rift_member` (public), `rift_item`, `rift_week`,
  `rift_log` (last 10), `rift_codex` (private, read through `my_rift_items`, `my_rift_week`,
  `my_rift_log`, `my_rift_codex`). A member's waiting choices and the last action's battles
  are JSON (riftRun.ts `encodeRift`, `encodeFights`), like the Deep's `encodeStats`.
- Reducers (reducers/rift.ts): `riftStart(loadout, tier)`, `riftMove(node)` and
  `riftBoss(option)` (leader), `riftChoose(choice, target, theme)`, `riftReady()`,
  `riftLeave()`. Each loads the run, calls `apply`, writes it back; a cleared floor pays every
  member from their `rift_week`; an ended run writes each member's log and deletes its rows.
- The client replays a stored battle with `replayFight(run.seed, fight)` (riftRun.ts).
- rift.ts `rewardOwed`: what a clear owes (the whole reward if the floor isn't cleared this week).
- Smoke test: start, the refusals, a gift, node 1 and its replay matching the server's HP, a
  boon, a shop heal, leaving (rows gone, log kept). Not covered live: a floor boss's payout
  (`rewardOwed` is checked offline in `test:rift`).

**Decisions taken in R4** (reviewed by the user 2026-10-23: one `riftChoose` and paying downed members confirmed; the re-clear rule changed, below):

- **One `riftChoose` reducer** answers every waiting choice (gift, boon, wear or discard,
  shop, event), in place of `riftPick` / `riftBuy` / `riftTake`.
- **The phase isn't stored:** the client derives the Threshold (a gift waiting) and the boss
  (the last row reached) from the run.
- **A floor pays once a week**, at its first clear's tier; a re-clear pays nothing, at any
  tier (`rewardOwed`).
- **Every member is paid** when a floor boss falls, downed ones included.
- **The weekly reset** ends a run on its next call (`end: 'week'`); what it paid stays paid.
- **The Codex** records boons offered or held, and the bases and rift effects of Ethereal
  items seen (offered or worn).

**Local server note:** publishing to the local server needed a confirmation for breaking
changes that were already in the code before R4 (item and raid columns, views), so
`npm run spacetime:publish:local` needs a `y` once. The smoke test's port: the local server
here runs on 3001 (`SPACETIMEDB_HOST=ws://localhost:3001 npm run test:smoke`). The smoke test
has a failure from before R4: "a tool upgrade is not queued" (and, now and then, "… with as
much character XP as skill XP").

**What R5 left in the code** (done 2026-10-23):

- `src/ui/views/RiftView.tsx`, under Adventure as **Rift** (`#rift`): the start (tier, loadout,
  the week's mutation, each floor's reward and the floors paid), the Threshold, the floor map
  with its links (measured from the node buttons; the current node's links lit) and each
  fight node's line-up in its tooltip, the boss pick (affix, echo's zone, the Rift Heart's
  Unravel), the last action's fights replayed on the fight stage (1× / 2× / 4×, Skip, one
  after another; the bar shows the HP from before them until the replay ends), boon offers,
  wear or discard (ring slot, what it replaces, override warnings, a stat compare), Thane's
  Vault, the shop (targets for attune and removals, reroll price), events (choices that can't
  apply greyed out with why, checked with `apply`), boons with set progress, curses, the Rift
  loadout with headlines, the run's end (summary and build), the run history with each run's
  final build, the Codex.
- Shared: `riftRows.ts` (rows to `RunState`, for the reducers and the client),
  riftRun.ts `fightParts` (a node's battle split per enemy for the stage), `shopDiscount`,
  `rerollCost`, `RiftFight.fighters` (who fought, by seat, for R6).
- `rift_log` keeps the final build and the locked level (no fight replay, by the user's
  call: the build is kept to show later, not the run's fights).
- Ethereal colour (`--r-ethereal`), the page's styles, the Riftstone icon; the client
  subscribes to the Rift tables (net.ts); the fight scene takes a `clock` (replay speed).
- Review (2026-10-23): Frozen Blood stops the Vampiric Trophy (combat.ts, a check in
  `test:combat`); the other R2 and R3 readings confirmed.
- Seen in a browser (desktop and 390 px) against the local server, 6 runs driven through the
  SDK with the page open: the start, the Threshold, the map, replays, boons, wear or discard,
  shops, 8 events, boss picks, a full clear, deaths, a timeout, the run's end, the build, the
  history, the Codex. Not seen: Thane's Vault (event 12 never came up; its card shows 3 item cards
  with a Take button each, the same item card as wear or discard). Driving it: a guest with the dev cheats (`devUnlockZones`, `devSetLevel`,
  T5 gear), its token in localStorage, one tab only (a second tab takes over the character),
  the dev server with `VITE_SPACETIMEDB_HOST=ws://localhost:3001`.

**What R6 left in the code** (2026-10-23):

- Schema: `rift_run.lobby` (a party still forming), `rift_member.maxHp` (for the party list:
  other members' items are private) and `rift_member.offlineSince` (set when a member leaves
  the world, for the kick).
- Reducers (reducers/rift.ts): `riftCreateParty(loadout, tier)`, `riftJoin(runId, loadout)`,
  `riftSetOff()` (the leader: seed, week and mutation are set now, every member to their
  Threshold), `riftKick(characterId)`; `riftStart` is a party of one that sets off at once;
  `riftLeave` also leaves a forming party. `actingLeader`: the leader, or while they're
  offline the first online member in join order, for `riftMove`, `riftBoss` and kicks.
  helpers.ts `leaveRiftLobby`, called from `leaveWorld` too.
- riftRun.ts `isReady`: a downed member never holds the party up.
- The page: "Enter alone" / "Form a party", the parties forming (Join with your selected
  loadout), the lobby (members, kick, Set off, Leave), in a run the party card (HP, who
  leads, Ready / Choosing / Down / Offline, your Ready, the kick once allowed), the map and
  bosses for the acting leader only ("X picks the path", "Waiting for …"), and every
  member's HP bar under the replay.
- Checks: `test:rift` (nobody waits for a downed member); the smoke test plays a 2-player
  run (the lobby and its refusals, Ready, a node fought by both, Bob's choice keeping the
  replay, Bob leaving mid-floor, the last one out ending it).
- Not covered live: leader handover and kicking a member offline 10+ minutes (no check
  drives a second client offline yet).

**Decisions taken in R6** (my reading where the plan was open; for the user to review):

- **Names:** `riftSetOff` sets off, not `riftStart` (which stays the solo start); each
  loadout is locked when its owner joins (`riftJoin`), so there is no `riftReady(loadout)`.
- **Finding a party:** a list of the parties forming on the Rift page, like raid parties;
  no invites through friends.
- **Tier:** the creator picks it; joining needs that tier open (instead of capping it by the
  lowest member). Only T5 exists so far.
- **A forming party is online only**, like a raid party: leaving the world leaves it. The
  leader can kick there at any time.
- **Kicked from a run:** their history row says "Left the run".
- **Replays in a party:** a member's own choice keeps the node fight stored (others may
  still be watching); a move or a boss replaces it; another member's event fight isn't shown.
- **Party scaling** stays at PARTY_HP 1.8 / 2.5 / 3.2 (a duo clears ~76%, 4 players ~92% in
  the bots); tune after people play it.

**R7 next:** after launch (below).

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

## R3: a node, a run, the bots — done, 2026-10-23

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

## R4: schema and solo reducers — done, 2026-10-23

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

More events, if wanted (the 20 at launch are written). No Rift Ranks or rank board (cut,
2026-10-23).

## Risks

- **Replay drift**: the client must replay with the server's exact inputs. Store them
  (`lastFight`) instead of re-deriving them, as the Deep does with `encodeStats`.
- **R2 touches every fight**: hooks must draw no generator values unless their effect is
  present, or old seeds replay differently. The seeded checks catch it; run them all after
  each hook.
- **R1 and R2 are the bulk** (~44 boons + 14 effects + 6 Trophies + ~20 events, each a
  small hook with its own check). R4–R6 are mostly plumbing on top of existing patterns
  (the Deep's settle and replay, the raid party).
