# Roadmap

Where the project stands and what to build next. Game design lives in
[design/](design/README.md); this file is the build plan. Update it as milestones land.

## Status (2026-10-11, branch `game-design`)

| # | Milestone | State |
|---|---|---|
| — | Design docs (docs/design) | Done |
| — | Client layout: shell, dark/light theme, all screens with preview data | Done |
| 1 | Data model: game data as code, item/loadout/filter/boss tables, views | **Done** |
| 2 | Combat and settlement | **Next** |
| 3 | Drops and the loot filter | Todo |
| 4 | Character start: starter kit, target choice | Todo |
| 5 | Equipment: equip, loadouts, auto-equip, lock | Todo |
| 6 | Bosses and zone unlocks | Todo |
| 7 | Crafting: reroll, rarity upgrade, bag expansion | Todo |
| 8 | Legendary effects in the formulas | Todo |
| 9 | UI on real data + away report | Todo |
| 10 | Tests for all of the above | Ongoing |

The server still runs the scaffold's prototype loop (`power` → gold/s and xp/s in
`spacetimedb/src/game.ts`). Milestone 2 replaces it.

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
- **Client preview**: `src/ui/preview-data.ts` (fake gear, T1–T2 zones) and
  `src/ui/sim.ts` (a client copy of the combat formulas). Both are temporary.

## Next: milestone 2, combat and settlement

Goal: idle progress comes from fighting the target enemy with the active loadout's
stats, using the closed-form formulas in `docs/design/combat.md`.

1. **Stat aggregation** (pure, in `spacetimedb/src/game.ts` or a new `src/combat.ts`):
   - Inputs: character level, the active loadout's item rows.
   - Base: level-1 = 100 HP + 10/level, primaries = level (attributes.md).
   - Sum implicits + affixes + legendary bonus into flat and percent buckets by stat
     ID; apply primaries (per-point values in attributes.md); apply caps.
   - Output: a `CombatStats` object (hit, speed, crit chance/damage, damage type,
     penetration, HP, regen, armor, resistance, evasion rating, heal, item/gold/xp find).
   - An empty main hand is allowed (0 damage → the build loses).
2. **Matchup** (pure): `CombatStats` × `EnemyDef` → time to kill, time to die, viable,
   kills per second. Port and replace `src/ui/sim.ts`. Mitigation `d/(d + 5·level)`,
   evasion `r/(r + 10·level)` cap 60%, crit uncapped but rolls use `min(1, chance)`,
   flat added damage normalised by weapon speed.
3. **Settlement**: replace `project()`:
   - kills = elapsed × killRate (0 if not viable); XP and gold from the enemy row ×
     find bonuses; level-ups with the new XP curve `xpToNext(L) = 166 × 1.19^L`
     (attributes.md), max level 100.
   - Keep fractional kills/progress carry-over the way `project()` keeps leftover
     seconds today.
   - The client keeps calling the same function on a timer for display.
   - Settle before anything that changes stats or target (equip, loadout switch,
     target change, level-up is inside the formula).
4. **Remove the prototype**: drop `power`, `buyUpgrade`, `upgradeCost`, the old XP curve
   and the "Prototype progress" card in `src/ui/views.ts`. Removing the `power` column
   is a breaking schema change: publish with `--delete-data` (local) or keep the
   column unused.
5. **Reducer** `setTarget(enemyId)`: must be in an unlocked zone; settles first.
6. **Tests**: unit-style checks in a new script (like `scripts/check-data.ts`) for the
   formulas, e.g. the T1 warrior from `docs/design/zone-content.md` kills a Field Rat
   in ~3.4 s; smoke test: target change settles and changes rates.

Drops are milestone 3: settlement in milestone 2 grants only XP and gold.

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
- **Checks**: `npm run typecheck`, `npm run test:data` (no server), `npm run test:smoke`
  (needs the local server with the module published).
- **Stopping the dev server**: stopping `npm run dev` can leave Vite's node process
  listening on 5173; kill it by port.
- **Schema changes**: new columns need `.default(...)` to migrate existing rows.
  Removing or retyping columns needs `--delete-data` locally.
- **Permanent IDs**: stats, bases, enemies, zones, legendaries, slot order. Add new
  IDs; never renumber.
