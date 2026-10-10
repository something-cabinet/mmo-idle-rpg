# Roadmap

Where the project stands and what to build next. Game design lives in
[design/](design/README.md); this file is the build plan. Update it as milestones land.

## Status (2026-10-11, branch `game-design`)

| # | Milestone | State |
|---|---|---|
| — | Design docs (docs/design) | Done |
| — | Client layout: shell, dark/light theme, all screens with preview data | Done |
| 1 | Data model: game data as code, item/loadout/filter/boss tables, views | **Done** |
| 2 | Combat and settlement | **Done** |
| 3 | Drops and the loot filter | **Done** |
| 4 | Character start: starter kit, target choice | **Next** |
| 5 | Equipment: equip, loadouts, auto-equip, lock | Todo |
| 6 | Bosses and zone unlocks | Todo |
| 7 | Crafting: reroll, rarity upgrade, bag expansion | Todo |
| 8 | Legendary effects in the formulas | Todo |
| 9 | UI on real data + away report | Todo |
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
    `DROP_CHANCE`, `RESPAWN_SECONDS`.
  - `legendary.ts`: effects 1–13, groups, which base kinds roll which group.
- **Tables** (`spacetimedb/src/schema.ts`): `item`, `loadout` (4 per character, 9 slots,
  0 = empty), `loot_filter`, `boss_kill`; new `character` columns `essence`, `bagSize`,
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
  the enemy's `1.12^o`, from its XP vs the zone average; Unique chance rolls Legendary
  until uniques exist). Bases uniform from the enemy's `drops`, tier = zone tier;
  `makeItem` rolls affixes (weighted free pool, tier 1..N, value in its slice) and
  legendaries (group by base kind, bonus 0.25–0.5 × ref). Then the loot filter
  (rarity threshold or whitelisted affix), the 50-item per-settle cap and the bag
  limit (lowest rarity salvaged first), and salvage to Essence. Seeded by (character
  ID, settle start), so a settle is reproducible.
- **Server**: `settle` inserts kept items and adds Essence; `bagCount` counts items
  not in any loadout. `setLootFilter(minRarity, keepAffixes)` settles first. A
  scheduled reducer `settleOnline` (table `settle_timer`, 60 s interval, inserted by
  `init`) settles everyone in the world so drops arrive while playing.
- **Not yet**: Fortune's Favor (milestone 8); showing drops, the filter and the bag
  with real data, the loot log and the away report (milestone 9).
- **Client**: the Fight view's "Live progress" card and the top bar use the real
  formulas. The other screens still use `src/ui/preview-data.ts`; `src/ui/sim.ts` is
  now only an adapter that runs the shared `matchup()` on the preview player.

## Next: milestone 4, character start

`createCharacter` takes a starter weapon (sword, bow, wand, healing staff), gives a
Common Rawhide Vest + Boots and equips them in loadout 0. Use `makeItem` from
`spacetimedb/src/loot.ts` to build them. Until then a new character's main hand is
empty, so it earns nothing and gets no drops; with the kit, the smoke test can check
end-to-end gains and drops.

## Later milestones (short notes)

- **4 Character start**: `createCharacter` takes a starter weapon (sword, bow, wand,
  healing staff), gives Common Rawhide Vest + Boots, equips them in loadout 0.
- **5 Equipment**: `equip`, `unequip`, `switchLoadout`, `renameLoadout`,
  `setProfile`, `autoEquip` (vs the reference dummy, never the target), `lockItem`,
  `salvage`. Validate slots (two-handed empties the off-hand; rings in either ring slot).
- **6 Bosses**: `challengeBoss` (deterministic check), `boss_kill` row, first-kill
  Rare + 20× gold, zone unlock rule = previous zone's boss killed.
- **7 Crafting**: `rerollAffix`, `upgradeRarity`, `expandBag`; costs in crafting.md.
- **8 Legendary effects**: hook each effect ID into aggregation/matchup/settlement.
- **9 UI**: replace `preview-data.ts` usage screen by screen; away report on login.

## Working notes

- **Run locally**: `npm run spacetime:start` (own terminal), then
  `npm run spacetime:publish:local -- -y` (the prompt needs `-y` when the schema
  changes), `npm run spacetime:generate` after schema changes, `npm run dev`.
- **Checks**: `npm run typecheck`, `npm run test:data`, `test:combat` and `test:loot`
  (no server), `npm run test:smoke`
  (needs the local server with the module published).
- **Stopping the dev server**: stopping `npm run dev` can leave Vite's node process
  listening on 5173; kill it by port.
- **Schema changes**: until milestone 9, breaking saves is fine: change tables freely
  and publish with `npm run spacetime:publish:local:reset -- -y`. From milestone 9 on,
  new columns need `.default(...)` and removals need a migration plan.
- **Permanent IDs**: stats, bases, enemies, zones, legendaries, slot order. Add new
  IDs; never renumber.
