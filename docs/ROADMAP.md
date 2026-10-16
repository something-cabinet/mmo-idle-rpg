# Roadmap

Where the project stands and what to build next. Game design lives in
[design/](design/README.md); this file is the build plan. Update it as milestones land.

## Status (2026-10-11, branch `main`)

| # | Milestone | State |
|---|---|---|
| — | Design docs (docs/design) | Done |
| — | Client layout: shell, dark/light theme, all screens with preview data | Done |
| 1 | Data model: game data as code, item/loadout/filter/boss tables, views | **Done** |
| 2 | Combat and settlement | **Done** |
| 3 | Drops and the loot filter | **Done** |
| 4 | Character start: starter kit, target choice | **Done** |
| 5 | Equipment: equip, loadouts, auto-equip, lock | **Done** |
| 6 | Bosses and zone unlocks | **Done** |
| 7 | Crafting: reroll, rarity upgrade, bag expansion | **Done** |
| 8 | Legendary effects in the formulas | **Done** |
| 9 | UI on real data + away report | **Done** |
| 10 | Tests for all of the above | Ongoing |

The scaffold's prototype loop (`power`, `buyUpgrade`) is gone: idle progress comes from
fighting the target enemy with the active loadout.

## What exists now

- **Static data** with permanent IDs in `spacetimedb/src/data/` (shared by server and client):
  - `stats.ts`: 29 stat IDs, growth curves, affix reference values, caps. Stored values
    are integers in hundredths of the display unit (`toStored` / `fromStored`).
  - `bases.ts`: 32 bases (IDs 1–10 weapons, 20 shield, 21 tome, 30–41 armor,
    50–57 jewelry), names per tier, implicits, weapon templates. `SLOTS` order is stored
    in loadouts: never reorder.
  - `zones.ts`: zones 1–2, enemies 101–106 and 201–206 (zoneId × 100 + n), drop lists,
    `DROP_CHANCE`, `WALK_SECONDS`.
  - `legendary.ts`: legendary effects (rollable, stacking: `perCopy`, `cap`) and unique
    effects (never roll, no stacking), groups, which base kinds roll which group.
- **Tables** (`spacetimedb/src/schema.ts`): `item`, `loadout` (4 per character, 9 slots,
  0 = empty), `loot_filter`, `boss_kill`; new `character` columns `dust`, `bagSize`,
  `activeLoadout`, `zoneId`, `targetEnemyId` (with defaults for migration).
- **Views** (`spacetimedb/src/reducers/views.ts`): `my_items`, `my_loadouts`,
  `my_loot_filter`, `my_boss_kills`. The client subscribes to them in `src/net.ts`.
- **Lifecycle** (`spacetimedb/src/helpers.ts`): `ensureCharacterRows` (creates loadouts
  and filter; also backfills old characters on `enterWorld`), `deleteCharacter`.
- **Combat** (`spacetimedb/src/combat.ts`, pure, shared): `combatStats(level, gear)`
  aggregates base + primaries + implicits/affixes/legendary bonus into `CombatStats`
  (attack sources, HP, defenses, find bonuses, caps); `matchup(stats, enemy)` gives
  time to kill/die, viability, kill rate and rewards per kill.
- **Settlement** (`project()` in `game.ts`): whole kills only, time toward the next
  kill carries over, stats recomputed at each level-up, XP curve
  `xpToNext(L) = round(166 × 1.19^L)`, max level 100. Server `settle(ctx, ch)` in
  `helpers.ts` resolves the active loadout's items (`gearOf`).
- **Reducer** `setTarget(enemyId)`: zone must be unlocked (`zoneUnlocked`: previous
  zone's boss killed), bosses need their own first kill; settles first.
- **Drops** (`spacetimedb/src/loot.ts`, pure, shared): per settle, a Poisson count per
  rarity from `kills × DROP_CHANCE × rewardScale × (1 + itemFind)` (`rewardScale` =
  the enemy's `1.12^o`, from its XP vs the zone average; Unique chance rolls a global
  unique of tier ≤ zone tier, uniques.md). Bases uniform from the enemy's `drops`, tier = zone tier;
  `makeItem` rolls affixes (weighted free pool, tier 1..N, value in its slice) and
  legendaries (group by base kind, bonus 0.25–0.5 × ref). Then the loot filter
  (rarity threshold or whitelisted affix), then the bag limit: kept drops fill the
  free slots, lowest rarity salvaged first, and salvage to Dust. Seeded by (character
  ID, settle start), so a settle is reproducible.
- **Server**: `settle` inserts kept items and adds Dust; `bagCount` counts items
  not in any loadout. `setLootFilter(minRarity, keepAffixes)` settles first. A
  scheduled reducer `settleOnline` (table `settle_timer`, 60 s interval, inserted by
  `init`) settles everyone in the world so drops arrive while playing.
- **Character start**: `createCharacter(name, starterWeapon)` takes a base ID from
  `STARTER_WEAPONS` (sword, bow, wand, healing staff; all beat the Field Rat at
  level 1) and `grantStarterKit` adds it plus a Common Ratskin Vest and Boots,
  equipped in loadout 0. The create screen has the weapon picker. Target choice is
  the `setTarget` reducer (milestone 2); the Zones screen still uses preview data
  (milestone 9).
- **Equipment** (`spacetimedb/src/equip.ts`, pure, shared): `placeItem` (slot fits the
  base, an item moves instead of filling two slots, a two-hander empties the off-hand,
  no off-hand next to a two-hander); `scoreGear` against `referenceDummy(level)`
  (33% mitigation, average enemy DPS for the level, half physical/half magic);
  `autoEquip` (coordinate search over owned items, hands as whole options; matches
  an exhaustive search in `test:equip`; ~40 ms for 200 items).
- **Reducers** (`reducers/equipment.ts`): `equip`, `unequip`, `switchLoadout`,
  `renameLoadout`, `setProfile`, `autoEquip`, `lockItem`, `salvage`. Changes to the
  active loadout settle first. Salvage refuses locked items and items in any loadout.
- **Bosses** (`reducers/boss.ts`): `challengeBoss(zoneId)` settles, then runs the
  normal check with the active loadout. A loss fails with the numbers ("… wins: you
  need 19.9 s to kill it but die in 10.8 s") and costs nothing. The first win inserts
  `boss_kill` (unlocks the next zone, makes the boss a farmable target) and gives
  `firstKillReward` (loot.ts): 20× the boss's gold and a Rare of the zone's tier,
  outside the bag limit. A win can't be reached in the smoke test yet (starter gear
  loses); the reward is covered in `test:loot`.
- **Crafting** (`spacetimedb/src/craft.ts`, pure, shared): `craftCost(hours, T)`
  (`hours × 1,200 × 2.9^(T−1)` gold, `× 15` Dust, rounded), `rerollCost` /
  `upgradeCost` from the hours tables in crafting.md, `rerollAffix` and
  `upgradeRarity` (reuse `rollAffix` / `rollLegendary`; return an error string on a
  refusal), `bagExpansionCost(bagSize)` (`50,000 × 4^n`, +25 slots up to 400).
- **Reducers** (`reducers/crafting.ts`): `rerollAffix(itemId, affixIndex)`,
  `upgradeRarity(itemId, removeAffix?)` (`removeAffix` is required for Epic →
  Legendary), `expandBag()`. All settle first (idle gold counts, and an equipped
  item's stats change at that point), then charge. Seeded by (character, item,
  timestamp). Crafting works on equipped and locked items; uniques are refused. Like
  boss wins, a successful craft can't be reached in the smoke test (starter gold);
  it checks the refusals, and `test:craft` covers costs and rolls.
  `requireItem` moved to `helpers.ts`.
- **Legendary effects** (`Effect` IDs in data/legendary.ts): `combatStats` counts
  worn copies per effect into `CombatStats.effects`; `effectAmount` gives a legendary
  effect's stacked amount (`min(cap, perCopy × copies)`), unique effects only check
  presence. (Redesigned later: positive-only legendaries that stack, trade-offs moved
  to unique effects; see legendary.md.) Damage-side effects are in `combatStats`
  (Spellblade, Overcrit, Glass Cannon, Voidtouched's ×0.75), enemy-side ones in
  `matchup` (Voidtouched's zero mitigation, Zealot's Oath, Thornshell, Swift Hunter,
  Midas Touch, Scholar's Focus) and `defenseAgainst` (Juggernaut, Spellward, Phantom
  Step). Zealot and Thornshell damage count as your damage: enemy mitigation
  (none with Voidtouched) and the Glass Cannon / Voidtouched multipliers apply. `scoreGear` is now the average of a
  physical and a magic dummy matchup (same numbers as before), so auto-equip sees
  every effect. Fortune's Favor: `rollDrops({ fortune })` raises each kept drop with
  15% chance via `raiseRarity` (loot.ts, shared with crafting's `upgradeRarity`),
  after the filter and before the bag limit; Epic → Legendary removes a random
  affix.
- **Settle log** (table `settle_log`, view `my_settle_log`): one row per settle with
  kills and per login settle (`offline`): elapsed time, cap hit, enemy, viable,
  kills, levels, XP / gold / Dust gained (`project` now returns `xpGained`), kept
  item IDs, salvaged counts per rarity, overflow. The newest 30 per character are
  kept (`SETTLE_LOG_KEEP`). Feeds the loot log, the away report and the filter's
  "last 8 hours".
- **Client** (all screens on real data; `preview-data.ts` and `sim.ts` are gone):
  - `snapshot.ts` gathers the player's rows once per render (projected level/XP/gold,
    items, loadouts, bag, filter, boss kills, logs, stats and the target matchup).
    The client is React (TSX). `Game.tsx` redraws the top bar every tick but the
    current view only when server data changes (`version` in `store.ts`, bumped from
    main.tsx) or the view changes; views are memoized on that snapshot. The fight
    scene (`fight.ts`, imperative) restarts only when the fight's numbers change.
  - Views (`ui/views/*.tsx`): Fight (animation from the real stats, KPIs, loot log),
    Zones (results vs the active loadout, Fight → `setTarget`, Challenge →
    `challengeBoss`, locked zones, drops), Character (stats, mitigation vs target,
    worn legendary effects, Midas + Scholar warning), Equipment (loadout tabs, use,
    rename, profile, auto-equip; 3×3 slot tiles, a slot popup with Change equipment:
    tiles with DPS ▲/▼ vs the target and a before → after comparison), Bag (icon
    tiles, item popup with comparison and Equip, sort/filter, ctrl/shift or Select
    mode for bulk lock / salvage / craft), Crafting
    (all items, reroll / upgrade with real costs, disabled with the reason when
    unaffordable, Epic → Legendary picks the affix), Loot filter (rarity, affix
    whitelist, last 8 hours). Item text and cards in `items.tsx`, shared pieces in `shared.tsx`, formatting in `format.ts`.
  - Away report (`AwayReport.tsx`): modal on login from the login settle's log row, when
    away for over a minute.
  - `net.ts` now also listens to `onUpdate`: rows with a primary key (views included)
    change in place, which the client previously missed.
  - Equipment: hovering an item in the slot picker shows it next to the equipped
    one with the loadout totals before → after (hit, HP, armor, resistance, evasion,
    find bonuses, DPS / kill / die vs the target; no item score), and any other slot
    the swap empties. Auto-equip shows the swapped slots and the same totals.
  - Bag: click selects one, Ctrl/⌘-click toggles, Shift-click selects a range,
    "Select all shown".
  - Character: every stat row's tooltip lists its base, primary bonuses, caps,
    active legendary effects and the items that add to it.
  - Settings: number format, short (1.2k) or full (1,234), in `format.ts`.
- **Raids** (raids.md): `data/raids.ts` (Wyrm Hollow, T3), `raid.ts` (pure: `simulateRaid`,
  `npcStats`, `raidOdds`, `rollRaidItem`, lockout), tables `raid_party` / `raid_member`
  (public), `raid_log` (private, view `my_raid_log`), `raid_timer` (scheduled `finishRaid`),
  `character.raidTokens`; views `raid_party_characters` / `_loadouts` / `_items` for the
  party's stats. Reducers `createRaidParty`, `joinRaidParty`, `leaveRaid`, `kickFromRaid`,
  `setRaidHires`, `startRaid`. Raids page (`RaidsView.tsx`). Checks: `npm run test:raid`, and
  a raid flow in the smoke test.
- **Not yet** (ui.md): mobile layout.
  The loot log and the away report's item lines were checked in code and the smoke
  test, but not seen in the browser with real drops (they're rare early on).

## Next

The planned milestones are done. Candidates, to pick with the user:

- Mobile layout (ui.md "Open").
- More content: zones 3+ (zone-content.md), uniques for T3+.
- Trading: market and friend gifts, fully designed in docs/design/trading.md. Settle
  its open questions (bound items, a cap on gifts received) before building.
- The dev reducer question below, so the smoke test can cover boss wins and crafting.
- Schema changes must migrate from now on (see Working notes).

### Open questions for the next session

- **Dev reducer for tests?** A boss win and crafting can't be reached in the smoke test
  with starter gear. Option: a dev-only reducer that grants items / sets level (admin
  only, or removed before milestone 9). Not decided.
- **Reroll cost growth** (crafting.md "Open"): rerolls cost the same every time for now.

## Working notes

- **Run locally**: `npm run spacetime:start` (own terminal), then
  `npm run spacetime:publish:local -- -y` (the prompt needs `-y` when the schema
  changes), `npm run spacetime:generate` after schema changes, `npm run dev`.
- **Checks**: `npm run typecheck`, `npm run test:data`, `test:combat`, `test:loot`,
  `test:equip`, `test:craft`, `test:raid`
  (no server), `npm run test:smoke`
  (needs the local server with the module published).
- **Stopping the dev server**: stopping `npm run dev` can leave Vite's node process
  listening on 5173; kill it by port.
- **Schema changes**: until milestone 9, breaking saves is fine: change tables freely
  and publish with `npm run spacetime:publish:local:reset -- -y`. From milestone 9 on,
  new columns need `.default(...)` and removals need a migration plan.
- **Permanent IDs**: stats, bases, enemies, zones, legendaries, slot order. Add new
  IDs; never renumber.
