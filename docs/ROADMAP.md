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
| 3 | Drops and the loot filter | **Next** |
| 4 | Character start: starter kit, target choice | Todo |
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
- **Client**: the Fight view's "Live progress" card and the top bar use the real
  formulas. The other screens still use `src/ui/preview-data.ts`; `src/ui/sim.ts` is
  now only an adapter that runs the shared `matchup()` on the preview player.

## Next: milestone 3, drops and the loot filter

Settlement (`project()` in `spacetimedb/src/game.ts`) grants XP and gold only. Drops
plug into the same loop: per settled segment, `kills × DROP_CHANCE × (1 + itemFind)`
(`matchup().killRate` and `combatStats().itemFind` are already there). See the notes
below.

Note: until milestone 4 gives new characters a starter weapon, their main hand is
empty, so they earn nothing.

## Later milestones (short notes)

- **3 Drops**: per settle, sample a count per rarity (Poisson/binomial, seeded by
  character + settle time), pick bases from the target's `drops`, roll affixes
  (relative slices, free pools with weights, see equipment.md), apply the loot filter,
  bag limit and the 50-item per-settle cap (salvage lowest rarity first), salvage to
  Essence (crafting.md table).
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
- **Checks**: `npm run typecheck`, `npm run test:data` and `npm run test:combat` (no
  server), `npm run test:smoke`
  (needs the local server with the module published).
- **Stopping the dev server**: stopping `npm run dev` can leave Vite's node process
  listening on 5173; kill it by port.
- **Schema changes**: until milestone 9, breaking saves is fine: change tables freely
  and publish with `npm run spacetime:publish:local:reset -- -y`. From milestone 9 on,
  new columns need `.default(...)` and removals need a migration plan.
- **Permanent IDs**: stats, bases, enemies, zones, legendaries, slot order. Add new
  IDs; never renumber.
