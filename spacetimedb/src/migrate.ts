// One-off data migrations that change stored values, not the schema (README, "Deploying").
// Each runs once, the first time `runMigrations` is called after a publish, and records
// its name in the `migration` table. Called from the online settle timer and on connect,
// so it runs within seconds of a publish whether or not anyone is online.

import { addMaterials, addSupply, type Ctx } from './helpers';
import { materialOf, migrateMaterialId } from './data/materials';
import { elixirRecipeId } from './data/recipes';
import { SkillId } from './data/skills';
import { legacyElixir } from './data/supplies';

interface Counted {
  materialId: number;
  count: number;
}

/** `list` with current material IDs, merging entries that now share one. */
function renumber<T extends Counted>(list: readonly T[]): T[] {
  const out: T[] = [];
  for (const m of list) {
    const id = migrateMaterialId(m.materialId);
    const same = out.find(o => o.materialId === id);
    if (same) same.count += m.count;
    else out.push({ ...m, materialId: id });
  }
  return out;
}

const changed = (list: readonly Counted[]) => list.some(m => migrateMaterialId(m.materialId) !== m.materialId);

/**
 * 2026-10-15: material IDs went from tier × 10 + kind to kind × 100 + tier
 * (data/materials.ts). Rewrites `material` rows (merging a row a settle may have added
 * under the new ID before this ran) and the material lists in settle logs.
 */
function materialIds(ctx: Ctx) {
  const byCharacter = new Map<bigint, { id: bigint; materialId: number; count: bigint }[]>();
  for (const row of ctx.db.material.iter()) {
    const rows = byCharacter.get(row.characterId) ?? [];
    rows.push({ id: row.id, materialId: row.materialId, count: row.count });
    byCharacter.set(row.characterId, rows);
  }
  for (const rows of byCharacter.values()) {
    for (const row of rows) {
      const id = migrateMaterialId(row.materialId);
      if (id === row.materialId) continue;
      const current = rows.find(r => r.materialId === id);
      if (current) {
        current.count += row.count;
        ctx.db.material.id.update({ ...ctx.db.material.id.find(current.id)!, count: current.count });
        ctx.db.material.id.delete(row.id);
      } else {
        ctx.db.material.id.update({ ...ctx.db.material.id.find(row.id)!, materialId: id });
        row.materialId = id;
      }
    }
  }

  for (const log of ctx.db.settleLog.iter()) {
    if (!changed(log.materials) && !changed(log.used) && !log.encounters.some(e => changed(e.materials))) continue;
    ctx.db.settleLog.id.update({
      ...log,
      materials: renumber(log.materials),
      used: renumber(log.used),
      encounters: log.encounters.map(e => ({ ...e, materials: renumber(e.materials) })),
    });
  }
}

/** What one scrap smelted into before 2026-10-17, by rarity: held scrap converts at these. */
const OLD_SMELT_YIELD: Record<string, number> = { Common: 2, Magic: 3, Rare: 5, Epic: 15, Legendary: 40 };

/**
 * 2026-10-17: scrapping gives materials at once, with no smelting (life-skills.md, "Scrap
 * into materials"). Turns every held scrap counter into the materials it would have
 * smelted into, then empties the `scrap` table.
 */
function scrapToMaterials(ctx: Ctx) {
  for (const row of [...ctx.db.scrap.iter()]) {
    const count = Number(row.count) * (OLD_SMELT_YIELD[row.rarity.tag] ?? 0);
    if (count > 0) addMaterials(ctx, row.characterId, [{ materialId: row.materialId, count }]);
    ctx.db.scrap.id.delete(row.id);
  }
}

/**
 * 2026-10-19: elixirs went from 4 tiers × normal/Greater to grades (data/supplies.ts,
 * life-skills.md "Alchemy"). Each old elixir in stock becomes one of its grade, and a
 * Greater one also gives back its rare herb. The active elixir keeps its charges (a
 * Greater one stays infused); running brews, settle logs and Abyss logs get the new IDs.
 */
function elixirGrades(ctx: Ctx) {
  for (const row of [...ctx.db.supply.iter()]) {
    const old = legacyElixir(row.supplyId);
    if (!old) continue;
    ctx.db.supply.id.delete(row.id);
    addSupply(ctx, row.characterId, old.supplyId, Number(row.count));
    if (old.herbTier) addMaterials(ctx, row.characterId, [{ materialId: materialOf(old.herbTier, 'Herb').id, count: Number(row.count) }]);
  }
  for (const ch of [...ctx.db.character.iter()]) {
    const active = legacyElixir(ch.elixirId);
    const brew = ch.activitySkill === SkillId.Alchemy ? legacyElixir(ch.activityRecipe) : undefined;
    if (!active && !brew) continue;
    ctx.db.character.id.update({
      ...ch,
      ...(active && { elixirId: active.supplyId, elixirInfused: active.herbTier !== undefined }),
      ...(brew && { activityRecipe: elixirRecipeId(Math.floor((ch.activityRecipe % 100) / 10), ch.activityRecipe % 10) }),
    });
  }
  for (const log of [...ctx.db.settleLog.iter()]) {
    const elixir = legacyElixir(log.elixirId);
    const brew = log.skillId === SkillId.Alchemy ? legacyElixir(log.recipe) : undefined;
    if (!elixir && !brew) continue;
    ctx.db.settleLog.id.update({
      ...log,
      ...(elixir && { elixirId: elixir.supplyId }),
      ...(brew && { recipe: elixirRecipeId(Math.floor((log.recipe % 100) / 10), log.recipe % 10) }),
    });
  }
  for (const log of [...ctx.db.abyssLog.iter()]) {
    const old = legacyElixir(log.elixir);
    if (old) ctx.db.abyssLog.id.update({ ...log, elixir: old.supplyId });
  }
}

const MIGRATIONS: [name: string, run: (ctx: Ctx) => void][] = [
  ['material-ids-kind-major', materialIds],
  ['scrap-to-materials', scrapToMaterials],
  ['elixir-grades', elixirGrades],
];

/** Runs every migration not yet recorded in the `migration` table. */
export function runMigrations(ctx: Ctx) {
  for (const [name, run] of MIGRATIONS) {
    if (ctx.db.migration.name.find(name)) continue;
    run(ctx);
    ctx.db.migration.insert({ name, ranAt: ctx.timestamp });
  }
}
