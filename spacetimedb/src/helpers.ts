// Shared server-side helpers. Not re-exported from index.ts: the module entry
// may only export reducers/views.
import { Timestamp, type Identity } from 'spacetimedb';
import { SenderError, type Infer, type ReducerCtx } from 'spacetimedb/server';
import { Encounter as EncounterType, Found as FoundType, account, character, item, mail, presence, settleLog, skill, spacetimedb } from './schema';
import { DEFAULT_LOADOUT_NAMES, LOADOUT_COUNT, addXp, offlineCapMicros, project, type ElixirLeft, type ElixirRun } from './game';
import { EncounterKind, eliteOf, rollEncounters } from './encounters';
import { SLOTS, SLOT_COUNT, STARTER_ARMOR, base } from './data/bases';
import { materialAt, untieredMaterial } from './data/materials';
import { ENEMIES_BY_ID, ZONES, previousZone, rewardScale, secretState, zoneLevel, type EnemyDef, type ZoneDef } from './data/zones';
import { GATHERING_SKILLS, SKILLS, SKILLS_BY_ID, gatherSpot, type ProductionSkillDef } from './data/skills';
import { recipeOf, scrapMaterialId, type MaterialCost, type ScrapRarity } from './data/recipes';
import { SUPPLIES_BY_ID, elixirBuffs, infuseHerbIds } from './data/supplies';
import { GATHER_SALT, gatherCharacterXp, projectGathering, rollGathering, rollGatheringActions } from './gather';
import { forged, productionCharacterXp, projectProduction, type ForgeFilter } from './produce';
import { Effect, effectAmount } from './data/legendary';
import { COSMETICS, COSMETIC_ENEMIES, type CosmeticUnlock } from './data/cosmetics';
import { MAX_LEVEL, combatStats, matchup } from './combat';
import {
  AFFIX_STAT_IDS,
  RARITIES,
  addScrap,
  firstKillReward,
  makeItem,
  rollDrops,
  rollMaterials,
  rollPool,
  salvageValue,
  salvageVoidglass,
  samplePoisson,
  scrapMaterials,
  seededRng,
  type DropResult,
  type MaterialDrop,
  type ScrapDrop,
  type SupplyDrop,
  type Seen,
} from './loot';
import { simulate } from './sim';

/** Character columns for "no life skill": fighting the target (or idle). */
export const NO_SKILL = { activitySkill: 0, activityRecipe: 0, activityCountLeft: 0 } as const;

/** Settle log rows kept per character. */
export const SETTLE_LOG_KEEP = 30;

export type Ctx = ReducerCtx<(typeof spacetimedb)['schemaType']>;
export type Account = Infer<typeof account.rowType>;
export type Character = Infer<typeof character.rowType>;
export type Presence = Infer<typeof presence.rowType>;
export type Item = Infer<typeof item.rowType>;
export type SettleLog = Infer<typeof settleLog.rowType>;
export type Found = Infer<typeof FoundType>;
export type Encounter = Infer<typeof EncounterType>;
export type SkillRow = Infer<typeof skill.rowType>;
export type Mail = Infer<typeof mail.rowType>;

/** The caller's account; throws if missing or banned. */
export function requireAccount(ctx: Ctx): Account {
  const acc = ctx.db.account.identity.find(ctx.sender);
  if (!acc) throw new SenderError('No account');
  if (acc.banned) throw new SenderError('Account is banned');
  return acc;
}

export function requireAdmin(ctx: Ctx): Account {
  const acc = requireAccount(ctx);
  if (acc.role.tag !== 'Admin') throw new SenderError('Admins only');
  return acc;
}

/** The caller's character, which must be in the world from this account. */
export function requireActive(ctx: Ctx): { acc: Account; ch: Character; pres: Presence } {
  const acc = requireAccount(ctx);
  const pres = ctx.db.presence.identity.find(ctx.sender);
  if (!pres) throw new SenderError('Not in the world');
  const ch = ctx.db.character.id.find(pres.characterId);
  if (!ch) throw new SenderError('No character');
  return { acc, ch, pres };
}

/** One of the character's items; throws if missing or someone else's. */
export function requireItem(ctx: Ctx, ch: Character, itemId: bigint): Item {
  const it = ctx.db.item.id.find(itemId);
  if (!it || it.characterId !== ch.id) throw new SenderError('No such item');
  return it;
}


/** The active loadout's items in slot order (undefined = empty slot). */
export function gearOf(ctx: Ctx, ch: Character): (Item | undefined)[] {
  const lo = [...ctx.db.loadout.characterId.filter(ch.id)].find(l => l.index === ch.activeLoadout);
  return (lo?.slots ?? []).map(id => (id === 0n ? undefined : (ctx.db.item.id.find(id) ?? undefined)));
}

/** Items in the bag: owned and not in any loadout (equipped items don't count). */
export function bagCount(ctx: Ctx, characterId: bigint): number {
  const equipped = new Set([...ctx.db.loadout.characterId.filter(characterId)].flatMap(l => l.slots));
  let n = 0;
  for (const it of ctx.db.item.characterId.filter(characterId)) if (!equipped.has(it.id)) n++;
  return n;
}

/**
 * Grants the rewards earned since `lastSettledAt` with the current gear and target:
 * XP, gold, and drops (kept items go to the bag, the rest is salvaged into Dust and gold).
 * Online time is played as live fights (sim.ts `simulate`, the fights the client
 * animates); offline time uses the expected-value formulas (game.ts `project`). A
 * boss's first kill grants its reward and unlocks the next zone (zone-content.md); a
 * lost fight in a matchup won on average costs a respawn (fight.ts), any other lost fight
 * clears the target (idle). Call before anything that changes gear or
 * target. `capMicros` is only passed for the login settle, which covers the time
 * away and is always logged, and for a Chronoshard's hours (reducers/skills.ts).
 */
export function settle(ctx: Ctx, ch: Character, capMicros?: bigint): Character {
  const out = ch.activitySkill !== 0 ? settleSkill(ctx, ch, capMicros) : settleCombat(ctx, ch, capMicros);
  // Only what a settle can change: the level, a skill level, a kill of a boss or secret enemy.
  if (out.level !== ch.level || ch.activitySkill !== 0 || COSMETIC_ENEMIES.has(ch.targetEnemyId)) grantCosmetics(ctx, out.id, out.level);
  return out;
}

function settleCombat(ctx: Ctx, ch: Character, capMicros?: bigint): Character {
  const gear = gearOf(ctx, ch);
  const target = ENEMIES_BY_ID.get(ch.targetEnemyId);
  const progress = { ...ch, settledMicros: ch.lastSettledAt.microsSinceUnixEpoch };
  // The elixir's charges run out (and auto-renew from stock) inside the settle.
  const elixir = target ? elixirRunOf(ctx, ch) : undefined;
  const buffs = elixir?.buffs;
  const activity = { gear, enemy: target?.enemy, elixir };
  const now = ctx.timestamp.microsSinceUnixEpoch;
  const p = capMicros === undefined ? simulate(progress, activity, now, ch.id) : project(progress, activity, now, capMicros);

  // Folds in the deprecated `essence` column (moved to `dust` on the next settle).
  const dustBefore = ch.dust + ch.essence;
  let dust = dustBefore;
  let drops: DropResult | undefined;
  const keptItemIds: bigint[] = [];
  const discovered: Found[] = [];
  let materials: MaterialDrop[] = [];
  let salvageGold = 0n;
  const buffedKills = p.elixir?.buffedKills ?? 0;
  if (target && p.kills > 0) {
    const filter = ctx.db.lootFilter.characterId.find(ch.id);
    const stats = combatStats(ch.level, gear);
    const amount = (id: number) => effectAmount(stats.effects, id);
    // Bounty: one Rare every 1 / a kills of this enemy, counted across settles.
    const bountyRate = amount(Effect.Bounty);
    const killedBefore = bountyRate > 0 ? Number(killsOf(ctx, ch.id, target.enemy.id)) : 0;
    const bounty = bountyRate > 0 ? Math.floor((killedBefore + p.kills) * bountyRate + 1e-9) - Math.floor(killedBefore * bountyRate + 1e-9) : 0;
    // Patience adds kills' worth of drops and materials (offline only).
    const dropKills = p.kills + (p.bonusKills ?? 0);
    // Fortune counts for the kills made with it: drops scale with (1 + item find) per kill.
    const itemFind = (stats.itemFind * (p.kills - buffedKills) + combatStats(ch.level, gear, buffs).itemFind * buffedKills) / p.kills;
    // Seeded by (character, settle start), so the result is reproducible.
    drops = rollDrops(seededRng(ch.id, ch.lastSettledAt.microsSinceUnixEpoch), {
      kills: dropKills,
      enemy: target.enemy,
      tier: target.zone.tier,
      rewardScale: rewardScale(target.zone, target.enemy),
      itemFind,
      filter: {
        minRarity: filter?.minRarity.tag ?? 'Magic',
        keepAffixes: filter?.keepAffixes ?? [],
        keepTypes: filter?.keepTypes ?? [],
        minAffixTier: filter?.minAffixTier ?? 1,
      },
      scrap: filter?.scrap ?? false,
      bagFree: ch.bagSize - bagCount(ctx, ch.id),
      fortune: amount(Effect.FortunesFavor),
      bounty,
      keenEye: amount(Effect.KeenEye),
      salvager: amount(Effect.Salvager) > 0
        ? { chance: amount(Effect.Salvager), rng: seededRng(ch.id, ch.lastSettledAt.microsSinceUnixEpoch, SALVAGER_SALT) }
        : undefined,
      discoverRng: seededRng(ch.id, ch.lastSettledAt.microsSinceUnixEpoch, DISCOVER_SALT),
    });
    discovered.push(...discover(ctx, ch.id, target.zone.tier, drops.seen));
    for (const it of drops.kept) {
      // Anomalies drop locked, so a bulk salvage of Commons can't take one.
      const row = ctx.db.item.insert({ ...it, id: 0n, characterId: ch.id, locked: it.rarity.tag === 'Anomaly', createdAt: ctx.timestamp });
      keptItemIds.push(row.id);
    }
    dust += drops.dust;
    salvageGold = drops.gold;
    // Own seed, so adding materials didn't change the item rolls above. Scrapped drops add theirs.
    materials = mergeMaterials(
      rollMaterials(seededRng(ch.id, ch.lastSettledAt.microsSinceUnixEpoch, MATERIAL_SALT), target.enemy, target.zone.tier, dropKills,
        rewardScale(target.zone, target.enemy)),
      scrapMaterials(drops.scrapped)
    );
    // Prospector: Ore, which enemies otherwise never drop.
    const ore = materialAt(target.zone.tier, 'Ore');
    const oreCount = ore && amount(Effect.Prospector) > 0
      ? samplePoisson(seededRng(ch.id, ch.lastSettledAt.microsSinceUnixEpoch, PROSPECT_SALT), dropKills * amount(Effect.Prospector))
      : 0;
    if (ore && oreCount > 0) materials = mergeMaterials(materials, [{ materialId: ore.id, count: oreCount }]);
    // Uniques salvaged for a full bag still give their Voidglass.
    const voidglass = drops.salvaged.Unique * salvageVoidglass('Unique');
    if (voidglass > 0) materials = mergeMaterials(materials, [{ materialId: untieredMaterial('Voidglass').id, count: voidglass }]);
    addMaterials(ctx, ch.id, materials);
  }

  let gold = p.gold + salvageGold;
  if (target?.enemy.boss && p.kills > 0 && !hasKilledBoss(ctx, ch.id, target.zone.id)) {
    const reward = firstKillReward(seededRng(ch.id, BigInt(target.zone.id), ctx.timestamp.microsSinceUnixEpoch), target.zone, target.enemy);
    // The guaranteed item ignores the bag limit (it only limits drops).
    const row = ctx.db.item.insert({ ...reward.item, id: 0n, characterId: ch.id, locked: false, createdAt: ctx.timestamp });
    keptItemIds.push(row.id);
    discovered.push(...discover(ctx, ch.id, target.zone.tier, [{ baseId: reward.item.baseId }]));
    ctx.db.bossKill.insert({ id: 0n, characterId: ch.id, zoneId: target.zone.id, killedAt: ctx.timestamp });
    gold += reward.gold;
  }
  if (target && p.kills > 0) addKills(ctx, ch.id, target.enemy.id, p.kills);

  // Rare encounters, with the stats reached by the end of the settle.
  let { level, xp } = p;
  let xpGained = p.xpGained;
  const encounters: Encounter[] = [];
  if (target && p.kills > 0) {
    const rolls = rollEncounters(seededRng(ch.id, ch.lastSettledAt.microsSinceUnixEpoch, ENCOUNTER_SALT), {
      kills: p.kills,
      zone: target.zone,
      enemy: target.enemy,
      stats: combatStats(p.level, gear, p.elixir && p.elixir.killsLeft > 0 ? elixirBuffs(ch.elixirId, p.elixir.infused) : undefined),
    });
    let bagFree = rolls.some(r => r.item) ? ch.bagSize - bagCount(ctx, ch.id) : 0;
    for (const r of rolls) {
      let itemId = 0n;
      if (r.item) {
        discovered.push(...discover(ctx, ch.id, target.zone.tier, [{ baseId: r.item.baseId }]));
        if (bagFree > 0) {
          itemId = ctx.db.item.insert({ ...r.item, id: 0n, characterId: ch.id, locked: false, createdAt: ctx.timestamp }).id;
          keptItemIds.push(itemId);
          bagFree--;
        } else {
          const v = salvageValue(r.item.rarity.tag, r.item.tier);
          dust += v.dust;
          gold += v.gold;
        }
      }
      if (r.xp > 0n) {
        const before = { level, xp };
        ({ level, xp } = addXp(level, xp, r.xp));
        if (before.level < MAX_LEVEL) xpGained += r.xp;
      }
      gold += r.gold;
      addMaterials(ctx, ch.id, r.materials);
      materials = mergeMaterials(materials, r.materials);
      encounters.push({ kind: r.kind, won: r.won, xp: r.xp, gold: r.gold, materials: r.materials, itemId });
    }
  }

  // The rare loot pool (data/pool.ts): the kills (Patience's extra included), then each Elite encounter beaten, at Elite rank.
  const supplies: SupplyDrop[] = [];
  if (target && p.kills > 0) {
    const rng = seededRng(ch.id, ch.lastSettledAt.microsSinceUnixEpoch, POOL_SALT);
    const eliteWins = encounters.filter(e => e.kind === EncounterKind.Elite && e.won).length;
    const rolls: [EnemyDef, number][] = [[target.enemy, p.kills + (p.bonusKills ?? 0)], [eliteOf(target.enemy), eliteWins]];
    for (const [enemy, kills] of rolls) {
      if (kills <= 0) continue;
      const pool = rollPool(rng, enemy, target.zone.tier, kills);
      addMaterials(ctx, ch.id, pool.materials);
      materials = mergeMaterials(materials, pool.materials);
      for (const s of pool.supplies) {
        addSupply(ctx, ch.id, s.supplyId, s.count);
        const row = supplies.find(x => x.supplyId === s.supplyId);
        if (row) row.count += s.count;
        else supplies.push({ ...s });
      }
    }
  }

  const elixirAfter = p.elixir ? spendElixir(ctx, ch, p.elixir) : undefined;

  const offline = capMicros !== undefined;
  const respawned = p.respawns ?? 0;
  if (p.kills > 0 || offline || p.defeatedAt !== undefined || respawned > 0) {
    const elapsed = ctx.timestamp.microsSinceUnixEpoch - ch.lastSettledAt.microsSinceUnixEpoch;
    const idle = p.defeatedAt === undefined ? 0n : ctx.timestamp.microsSinceUnixEpoch - p.defeatedAt;
    logSettle(ctx, ch, {
      offline,
      elapsedMicros: elapsed > 0n ? elapsed : 0n,
      capped: offline && elapsed > capMicros,
      viable: !!target && matchup(combatStats(ch.level, gear, buffs), target.enemy).viable,
      kills: p.kills,
      levelTo: level,
      xp: xpGained,
      gold: gold - ch.gold,
      dust: dust - dustBefore,
      keptItemIds,
      salvaged: RARITIES.map(r => drops?.salvaged[r] ?? 0),
      scrapped: scrappedPerRarity(drops?.scrapped ?? []),
      overflow: drops?.overflow ?? 0,
      materials,
      discovered,
      encounters,
      defeated: p.defeatedAt !== undefined,
      idleMicros: idle > 0n ? idle : 0n,
      elixirId: elixir ? ch.elixirId : 0,
      elixirKills: buffedKills,
      elixirsUsed: p.elixir?.renewed ?? 0,
      elixirEmpty: !!p.elixir && p.elixir.killsLeft <= 0,
      herbsUsed: p.elixir?.herbsUsed ?? 0,
      respawns: respawned,
      supplies,
    });
  }

  return {
    ...ch,
    level,
    xp,
    gold,
    dust,
    essence: 0n,
    lastSettledAt: new Timestamp(p.settledMicros),
    targetEnemyId: p.defeatedAt === undefined ? ch.targetEnemyId : 0,
    ...elixirAfter,
  };
}

/**
 * `settle` while the character works a life skill: gathering's actions since
 * `lastSettledAt`, the same online and offline (gather.ts `projectGathering`). The
 * materials go into the `material` counters, the skill's XP into its `skill` row, and
 * as much character XP to the character.
 */
function settleSkill(ctx: Ctx, ch: Character, capMicros?: bigint): Character {
  const def = SKILLS_BY_ID.get(ch.activitySkill);
  if (def?.kind === 'Production') return settleProduction(ctx, ch, def, capMicros);
  const now = ctx.timestamp.microsSinceUnixEpoch;
  const start = ch.lastSettledAt.microsSinceUnixEpoch;
  const base = { ...ch, dust: ch.dust + ch.essence, essence: 0n };
  // An unknown skill (none today) passes the time idle.
  if (!def) return { ...base, lastSettledAt: ctx.timestamp };
  const row = skillRow(ctx, ch.id, def.id);
  const { tier, node } = gatherSpot(ch.activityRecipe);
  const g = projectGathering({ ...row, settledMicros: start }, { tier, toolTier: toolTier(ctx, ch.id, def.id) }, now, capMicros);
  // Online, action by action, as the client shows them; the time away (nobody watching) in one draw.
  const offline = capMicros !== undefined;
  const { materials, gold, supplies } = offline
    ? rollGathering(seededRng(ch.id, start, GATHER_SALT), def, tier, g, node)
    : rollGatheringActions(ch.id, def, tier, g, node);
  addMaterials(ctx, ch.id, materials);
  for (const x of supplies) addSupply(ctx, ch.id, x.supplyId, x.count);
  ctx.db.skill.id.update({ ...row, level: g.level, xp: g.xp });
  // Skilling also levels the character (no drops; only Mining's Relics sell for gold).
  const charXp = gatherCharacterXp(g.actions, tier);
  const { level, xp } = addXp(ch.level, ch.xp, charXp);

  if (g.actions > 0 || offline) {
    const elapsed = now - start;
    logSettle(ctx, ch, {
      offline,
      elapsedMicros: elapsed > 0n ? elapsed : 0n,
      capped: offline && elapsed > capMicros,
      enemyId: 0,
      skillId: def.id,
      actions: g.actions,
      levelTo: level,
      xp: ch.level < MAX_LEVEL ? charXp : 0n,
      skillXp: g.xpGained,
      skillLevelFrom: row.level,
      skillLevelTo: g.level,
      materials,
      gold,
      supplies,
    });
  }
  return { ...base, level, xp, gold: base.gold + gold, lastSettledAt: new Timestamp(g.settledMicros) };
}

/**
 * `settle` while the character works a production queue (produce.ts `projectProduction`):
 * inputs are used up, items go to the bag, elixirs to the supply stock,
 * smelted materials to the counters, a tool upgrade to the `tool` row. When the queue runs out (count, inputs or bag), the rest of the time settles as
 * combat against the kept target, so an empty queue never wastes offline time.
 */
function settleProduction(ctx: Ctx, ch: Character, def: ProductionSkillDef, capMicros?: bigint): Character {
  const start = ch.lastSettledAt.microsSinceUnixEpoch;
  const backToCombat = (c: Character, cap?: bigint) => settle(ctx, { ...c, ...NO_SKILL }, cap);
  const r = recipeOf(def.id, ch.activityRecipe);
  if (!r) return backToCombat(ch, capMicros);
  const out = r.output;
  const row = skillRow(ctx, ch.id, def.id);
  const held = materialCounts(ctx, ch.id);
  const filter = forgeFilterOf(ctx, ch.id);
  const queue = {
    countLeft: ch.activityCountLeft,
    have: (id: number) => held.get(id) ?? 0,
    bagFree: ch.bagSize - bagCount(ctx, ch.id),
    keeps: (m: { at: bigint; level: number }) => forged(ch.id, r, m, filter).kept,
  };
  const pr = projectProduction({ ...row, settledMicros: start }, r, queue, ch.id, ctx.timestamp.microsSinceUnixEpoch, capMicros);
  takeMaterials(ctx, ch.id, pr.used);

  const keptItemIds: bigint[] = [];
  const discovered: Found[] = [];
  // Forged bases the keep rule turns down are salvaged (or scrapped), like drops the loot filter turns down.
  const salvaged = RARITIES.map(() => 0);
  const scrapped: ScrapDrop[] = [];
  let materials: MaterialDrop[] = [];
  let dust = 0n;
  let gold = 0n;
  if (out.kind === 'item') {
    for (const m of pr.made) {
      const { item: it, kept } = forged(ch.id, r, m, filter);
      discovered.push(...discover(ctx, ch.id, r.tier, [{ baseId: out.baseId }]));
      if (kept) {
        keptItemIds.push(ctx.db.item.insert({ ...it, id: 0n, characterId: ch.id, locked: false, createdAt: ctx.timestamp }).id);
      } else if (filter?.scrap && it.rarity.tag !== 'Anomaly' && scrapMaterialIdOf(it) !== undefined) {
        addScrap(scrapped, scrapMaterialIdOf(it)!, it.rarity.tag as ScrapRarity);
      } else {
        const v = salvageValue(it.rarity.tag, it.tier);
        dust += v.dust;
        gold += v.gold;
        salvaged[RARITIES.indexOf(it.rarity.tag)]++;
      }
    }
    materials = scrapMaterials(scrapped);
    addMaterials(ctx, ch.id, materials);
  } else if (out.kind === 'supply') {
    addSupply(ctx, ch.id, out.supplyId, pr.actions * out.count);
  } else if (out.kind === 'material') {
    if (pr.yielded > 0) materials = [{ materialId: out.materialId, count: pr.yielded }];
    addMaterials(ctx, ch.id, materials);
  } else if (pr.actions > 0) {
    const tool = [...ctx.db.tool.characterId.filter(ch.id)].find(t => t.skillId === out.skillId);
    if (!tool) ctx.db.tool.insert({ id: 0n, characterId: ch.id, skillId: out.skillId, tier: r.tier });
    else if (tool.tier < r.tier) ctx.db.tool.id.update({ ...tool, tier: r.tier });
  }
  ctx.db.skill.id.update({ ...row, level: pr.level, xp: pr.xp });
  // Skilling also levels the character (no gold or drops).
  const charXp = productionCharacterXp(pr.actions, r);
  const { level, xp } = addXp(ch.level, ch.xp, charXp);

  const offline = capMicros !== undefined;
  if (pr.actions > 0 || offline) {
    const elapsed = (pr.endedAt ?? ctx.timestamp.microsSinceUnixEpoch) - start;
    logSettle(ctx, ch, {
      offline,
      elapsedMicros: elapsed > 0n ? elapsed : 0n,
      capped: offline && pr.endedAt === undefined && elapsed > capMicros,
      enemyId: 0,
      skillId: def.id,
      recipe: r.id,
      actions: pr.actions,
      levelTo: level,
      xp: ch.level < MAX_LEVEL ? charXp : 0n,
      skillXp: pr.xpGained,
      skillLevelFrom: row.level,
      skillLevelTo: pr.level,
      used: pr.used,
      materials,
      keptItemIds,
      discovered,
      salvaged,
      scrapped: scrappedPerRarity(scrapped),
      dust,
      gold,
    });
  }
  const next = {
    ...ch,
    dust: ch.dust + ch.essence + dust,
    essence: 0n,
    gold: ch.gold + gold,
    level,
    xp,
    activityCountLeft: pr.countLeft,
    lastSettledAt: new Timestamp(pr.settledMicros),
  };
  if (pr.endedAt === undefined) return next;
  // The queue is done: the rest of the time (and of the offline cap) goes to combat.
  return backToCombat(next, capMicros === undefined ? undefined : capMicros - (pr.endedAt - start));
}

/** The character's forge keep rule (undefined: keep everything). */
export function forgeFilterOf(ctx: Ctx, characterId: bigint): ForgeFilter | undefined {
  const f = ctx.db.forgeFilter.characterId.find(characterId);
  return f ? { minRarity: f.minRarity.tag, keepAffixes: f.keepAffixes, minAffixTier: f.minAffixTier, scrap: f.scrap } : undefined;
}

/** The material an item scraps into; undefined for tiers without materials. */
export const scrapMaterialIdOf = (it: { baseId: number; tier: number }) => scrapMaterialId(it.baseId, it.tier);

/** Scrapped items per rarity, in RARITIES order (settle logs). */
function scrappedPerRarity(list: readonly ScrapDrop[]): number[] {
  return RARITIES.map(r => list.filter(x => x.rarity === r).reduce((n, x) => n + x.count, 0));
}

/** Material ID → count the character holds. */
export function materialCounts(ctx: Ctx, characterId: bigint): Map<number, number> {
  return new Map([...ctx.db.material.characterId.filter(characterId)].map(m => [m.materialId, Number(m.count)]));
}

/** Takes `costs` from the character's materials (callers check there are enough). */
export function takeMaterials(ctx: Ctx, characterId: bigint, costs: readonly MaterialCost[]) {
  if (!costs.length) return;
  const rows = [...ctx.db.material.characterId.filter(characterId)];
  for (const c of costs) {
    const row = rows.find(r => r.materialId === c.materialId);
    if (!row || row.count < BigInt(c.count)) throw new SenderError('Not enough materials');
    ctx.db.material.id.update({ ...row, count: row.count - BigInt(c.count) });
  }
}

/** How many of supply `supplyId` the character has in stock. */
export function supplyCount(ctx: Ctx, characterId: bigint, supplyId: number): number {
  return Number([...ctx.db.supply.characterId.filter(characterId)].find(r => r.supplyId === supplyId)?.count ?? 0n);
}

/**
 * The active elixir as a settle or a depth uses it (life-skills.md, "Buff rules"), or
 * undefined when the slot is empty. Auto-renew draws on the stock; Infuse on the rare
 * herbs of the elixir's grade.
 */
export function elixirRunOf(ctx: Ctx, ch: Character): ElixirRun | undefined {
  const sup = ch.elixirKillsLeft > 0 ? SUPPLIES_BY_ID.get(ch.elixirId) : undefined;
  if (!sup) return undefined;
  const plain = elixirBuffs(sup.id)!;
  const infused = elixirBuffs(sup.id, true)!;
  const stock = ch.elixirAutoRenew ? supplyCount(ctx, ch.id, sup.id) : 0;
  const herbs = ch.elixirInfuse && stock > 0 ? herbCount(ctx, ch.id, sup.grade) : 0;
  return { buffs: ch.elixirInfused ? infused : plain, killsLeft: ch.elixirKillsLeft, stock, infused: ch.elixirInfused, renew: { plain, infused, herbs } };
}

/** Takes what an elixir run used (renewed elixirs, herbs) from stock; returns the character's elixir columns after it. */
export function spendElixir(ctx: Ctx, ch: Character, left: ElixirLeft): Pick<Character, 'elixirId' | 'elixirKillsLeft' | 'elixirInfused'> {
  if (left.renewed > 0) takeSupply(ctx, ch.id, ch.elixirId, left.renewed);
  const sup = SUPPLIES_BY_ID.get(ch.elixirId);
  if (sup && left.herbsUsed > 0) takeHerbs(ctx, ch.id, sup.grade, left.herbsUsed);
  const empty = left.killsLeft <= 0;
  return { elixirId: empty ? 0 : ch.elixirId, elixirKillsLeft: Math.max(0, left.killsLeft), elixirInfused: !empty && left.infused };
}

/** Rare herbs held that can infuse an elixir of `grade`. */
export function herbCount(ctx: Ctx, characterId: bigint, grade: number): number {
  const held = materialCounts(ctx, characterId);
  return infuseHerbIds(grade).reduce((n, id) => n + (held.get(id) ?? 0), 0);
}

/** Takes `n` rare herbs that infuse `grade`, lowest tier first (callers check there are enough). */
export function takeHerbs(ctx: Ctx, characterId: bigint, grade: number, n: number) {
  const held = materialCounts(ctx, characterId);
  const costs: MaterialCost[] = [];
  for (const materialId of infuseHerbIds(grade)) {
    const count = Math.min(n, held.get(materialId) ?? 0);
    if (count > 0) costs.push({ materialId, count });
    n -= count;
  }
  if (n > 0) throw new SenderError('Not enough rare herbs');
  takeMaterials(ctx, characterId, costs);
}

/** Adds `n` of supply `supplyId` to the character's stock. */
export function addSupply(ctx: Ctx, characterId: bigint, supplyId: number, n: number) {
  if (n <= 0) return;
  const row = [...ctx.db.supply.characterId.filter(characterId)].find(r => r.supplyId === supplyId);
  if (row) ctx.db.supply.id.update({ ...row, count: row.count + BigInt(n) });
  else ctx.db.supply.insert({ id: 0n, characterId, supplyId, count: BigInt(n) });
}

/** Takes `n` of supply `supplyId` from the character's stock (callers check there are enough). */
export function takeSupply(ctx: Ctx, characterId: bigint, supplyId: number, n: number) {
  const row = [...ctx.db.supply.characterId.filter(characterId)].find(r => r.supplyId === supplyId);
  if (!row || row.count < BigInt(n)) throw new SenderError('None in stock');
  ctx.db.supply.id.update({ ...row, count: row.count - BigInt(n) });
}

/** The character's row for skill `skillId` (made at level 1 if missing). */
export function skillRow(ctx: Ctx, characterId: bigint, skillId: number): SkillRow {
  const row = [...ctx.db.skill.characterId.filter(characterId)].find(r => r.skillId === skillId);
  return row ?? ctx.db.skill.insert({ id: 0n, characterId, skillId, level: 1, xp: 0n });
}

/** The tier of the character's tool for gathering skill `skillId` (1 if it has none). */
export function toolTier(ctx: Ctx, characterId: bigint, skillId: number): number {
  return [...ctx.db.tool.characterId.filter(characterId)].find(r => r.skillId === skillId)?.tier ?? 1;
}

/** Whether a zone of tier `tier` is unlocked for `ch` (settled): life skills can't run ahead of combat. */
export function tierUnlocked(ctx: Ctx, ch: Pick<Character, 'id' | 'level'>, tier: number): boolean {
  return ZONES.some(z => z.tier === tier && zoneUnlocked(ctx, ch, z));
}

/** Logs a settle of `ch`, by default against its target and with no gains. */
function logSettle(ctx: Ctx, ch: Character, row: Partial<Omit<SettleLog, 'id' | 'characterId' | 'at'>>) {
  ctx.db.settleLog.insert({
    id: 0n,
    characterId: ch.id,
    at: ctx.timestamp,
    offline: false,
    elapsedMicros: 0n,
    capped: false,
    enemyId: ch.targetEnemyId,
    viable: false,
    kills: 0,
    levelFrom: ch.level,
    levelTo: ch.level,
    xp: 0n,
    gold: 0n,
    essence: 0n,
    dust: 0n,
    keptItemIds: [],
    salvaged: RARITIES.map(() => 0),
    scrapped: RARITIES.map(() => 0),
    overflow: 0,
    defeated: false,
    idleMicros: 0n,
    materials: [],
    discovered: [],
    encounters: [],
    skillId: 0,
    actions: 0,
    skillXp: 0n,
    skillLevelFrom: 0,
    skillLevelTo: 0,
    recipe: 0,
    used: [],
    elixirId: 0,
    elixirKills: 0,
    elixirsUsed: 0,
    elixirEmpty: false,
    herbsUsed: 0,
    respawns: 0,
    supplies: [],
    ...row,
  });
  pruneSettleLog(ctx, ch.id);
}

function pruneSettleLog(ctx: Ctx, characterId: bigint) {
  const rows = [...ctx.db.settleLog.characterId.filter(characterId)];
  if (rows.length <= SETTLE_LOG_KEEP) return;
  rows.sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const r of rows.slice(0, rows.length - SETTLE_LOG_KEEP)) ctx.db.settleLog.id.delete(r.id);
}

/** Whether `characterId` has killed the boss of zone `zoneId`. */
export function hasKilledBoss(ctx: Ctx, characterId: bigint, zoneId: number): boolean {
  return [...ctx.db.bossKill.characterId.filter(characterId)].some(k => k.zoneId === zoneId);
}

/** Whether the character has found the area holding `enemyId` (only secret areas need finding, zones.ts `secretState`). */
export function areaFound(ctx: Ctx, characterId: bigint, zone: ZoneDef, enemyId: number): boolean {
  const area = zone.areas.find(a => a.enemies.includes(enemyId));
  if (!area?.secret) return true;
  const kills = new Map([...ctx.db.enemyKill.characterId.filter(characterId)].map(k => [k.enemyId, Number(k.kills)]));
  return secretState(area, id => kills.get(id) ?? 0) === 'found';
}

/** A zone is open once the previous zone's boss is dead and `ch` (settled) has its level (the first zone always is). */
export function zoneUnlocked(ctx: Ctx, ch: Pick<Character, 'id' | 'level'>, zone: ZoneDef): boolean {
  const prev = previousZone(zone);
  return !prev || (ch.level >= zoneLevel(zone) && hasKilledBoss(ctx, ch.id, prev.id));
}

/**
 * Creates the per-character rows every character must have (loadouts, loot
 * filter). Idempotent, so it also backfills characters made before they existed.
 */
export function ensureCharacterRows(ctx: Ctx, characterId: bigint) {
  const have = new Set([...ctx.db.loadout.characterId.filter(characterId)].map(l => l.index));
  for (let i = 0; i < LOADOUT_COUNT; i++) {
    if (have.has(i)) continue;
    ctx.db.loadout.insert({
      id: 0n,
      characterId,
      index: i,
      name: DEFAULT_LOADOUT_NAMES[i],
      profile: { tag: 'Damage' },
      lockedSlots: 0,
      slots: Array.from({ length: SLOT_COUNT }, () => 0n),
    });
  }
  if (!ctx.db.lootFilter.characterId.find(characterId)) {
    ctx.db.lootFilter.insert({
      characterId,
      minRarity: { tag: 'Magic' },
      keepAffixes: [...AFFIX_STAT_IDS],
      keepBases: [],
      minAffixTier: 1,
      keepTypes: [],
      scrap: false,
    });
  }
  // Life skills start at level 1, gathering tools at tier 1.
  const skills = new Set([...ctx.db.skill.characterId.filter(characterId)].map(r => r.skillId));
  for (const sk of SKILLS) if (!skills.has(sk.id)) ctx.db.skill.insert({ id: 0n, characterId, skillId: sk.id, level: 1, xp: 0n });
  const tools = new Set([...ctx.db.tool.characterId.filter(characterId)].map(r => r.skillId));
  for (const sk of GATHERING_SKILLS) if (!tools.has(sk.id)) ctx.db.tool.insert({ id: 0n, characterId, skillId: sk.id, tier: 1 });
  // Characters from before discovery: what they own counts as found.
  if (ctx.db.discovery.characterId.filter(characterId).next().done) {
    const byTier = new Map<number, Seen[]>();
    for (const it of ctx.db.item.characterId.filter(characterId))
      byTier.set(it.tier, [...(byTier.get(it.tier) ?? []), { baseId: it.baseId, uniqueId: it.uniqueId }]);
    for (const [tier, seen] of byTier) discover(ctx, characterId, tier, seen);
  }
}

/**
 * Gives a new character its starter kit (Common T1 weapon + Ratskin Vest and Boots)
 * and equips it in loadout 0. Needs the loadouts (`ensureCharacterRows`) first.
 */
export function grantStarterKit(ctx: Ctx, characterId: bigint, weaponBaseId: number) {
  const lo = [...ctx.db.loadout.characterId.filter(characterId)].find(l => l.index === 0);
  if (!lo) throw new Error('Loadouts missing');
  const slots = [...lo.slots];
  const rng = seededRng(characterId); // Common items roll nothing; required by makeItem
  for (const baseId of [weaponBaseId, ...STARTER_ARMOR]) {
    const row = ctx.db.item.insert({
      ...makeItem(rng, baseId, 1, 'Common'),
      id: 0n,
      characterId,
      locked: false,
      createdAt: ctx.timestamp,
    });
    slots[SLOTS.indexOf(base(baseId).slots[0])] = row.id;
  }
  ctx.db.loadout.id.update({ ...lo, slots });
}

/** Adds `kills` to the character's lifetime kills of `enemyId`. */
/** Kills of `enemyId` by the character so far. */
export function killsOf(ctx: Ctx, characterId: bigint, enemyId: number): bigint {
  return [...ctx.db.enemyKill.characterId.filter(characterId)].find(k => k.enemyId === enemyId)?.kills ?? 0n;
}

export function addKills(ctx: Ctx, characterId: bigint, enemyId: number, kills: number) {
  const row = [...ctx.db.enemyKill.characterId.filter(characterId)].find(k => k.enemyId === enemyId);
  if (row) ctx.db.enemyKill.id.update({ ...row, kills: row.kills + BigInt(kills) });
  else ctx.db.enemyKill.insert({ id: 0n, characterId, enemyId, kills: BigInt(kills) });
}

/** Deletes a character and everything it owns. */
/** Most characters one friend list can hold. */
export const MAX_FRIENDS = 100;

/** Mixed into material roll seeds, so they never reuse an item roll's seed. */
const MATERIAL_SALT = 0x6d6174n; // "mat"
const DISCOVER_SALT = 0x6469736376n; // "discv"
const ENCOUNTER_SALT = 0x656e636fn; // "enco"
const POOL_SALT = 0x706f6f6cn; // "pool"
const SALVAGER_SALT = 0x73616c76n; // "salv"
const PROSPECT_SALT = 0x70726f73n; // "pros"

/** `a` plus `b`, one entry per material. */
function mergeMaterials(a: readonly MaterialDrop[], b: readonly MaterialDrop[]): MaterialDrop[] {
  const out = a.map(d => ({ ...d }));
  for (const d of b) {
    const row = out.find(o => o.materialId === d.materialId);
    if (row) row.count += d.count;
    else out.push({ ...d });
  }
  return out;
}

/** Records the drops (of `tier`) the character sees for the first time (discovery table) and returns them. */
export function discover(ctx: Ctx, characterId: bigint, tier: number, seen: readonly Seen[]): Found[] {
  const found: Found[] = [];
  if (!seen.length) return found;
  const key = (baseId: number, t: number, uniqueId: number) => `${baseId}:${t}:${uniqueId}`;
  const have = new Set([...ctx.db.discovery.characterId.filter(characterId)].map(d => key(d.baseId, d.tier, d.uniqueId)));
  for (const s of seen) {
    const k = key(s.baseId, tier, s.uniqueId ?? 0);
    if (have.has(k)) continue;
    have.add(k);
    const f = { baseId: s.baseId, tier, uniqueId: s.uniqueId ?? 0 };
    ctx.db.discovery.insert({ id: 0n, characterId, ...f });
    found.push(f);
  }
  return found;
}

/** Adds dropped materials to `characterId`'s stock. */
export function addMaterials(ctx: Ctx, characterId: bigint, drops: readonly MaterialDrop[]) {
  if (!drops.length) return;
  const rows = [...ctx.db.material.characterId.filter(characterId)];
  for (const d of drops) {
    const row = rows.find(r => r.materialId === d.materialId);
    if (row) ctx.db.material.id.update({ ...row, count: row.count + BigInt(d.count) });
    else ctx.db.material.insert({ id: 0n, characterId, materialId: d.materialId, count: BigInt(d.count) });
  }
}

/**
 * Records every cosmetic whose condition the character now meets (cosmetics.md,
 * "Granting"). `level` is passed because callers may hold a newer row than the table.
 */
export function grantCosmetics(ctx: Ctx, characterId: bigint, level: number) {
  const have = new Set([...ctx.db.cosmeticUnlock.characterId.filter(characterId)].map(u => u.cosmeticId));
  const todo = COSMETICS.filter(c => !have.has(c.id));
  if (!todo.length) return;
  // Read each table at most once, and only if a condition needs it.
  let kills: Map<number, bigint> | undefined;
  let skills: { skillId: number; level: number }[] | undefined;
  let deepest: number | undefined;
  const met = (u: CosmeticUnlock): boolean => {
    switch (u.kind) {
      case 'kill':
        kills ??= new Map([...ctx.db.enemyKill.characterId.filter(characterId)].map(k => [k.enemyId, k.kills]));
        return (kills.get(u.enemyId) ?? 0n) >= BigInt(u.count ?? 1);
      case 'level':
        return level >= u.level;
      case 'skill':
        skills ??= [...ctx.db.skill.characterId.filter(characterId)];
        return skills.some(r => (u.skillId === undefined || r.skillId === u.skillId) && r.level >= u.level);
      case 'depth':
        deepest ??= ctx.db.abyssRecord.characterId.find(characterId)?.deepest ?? 0;
        return deepest >= u.depth;
    }
  };
  for (const c of todo) if (met(c.unlock)) ctx.db.cosmeticUnlock.insert({ id: 0n, characterId, cosmeticId: c.id, unlockedAt: ctx.timestamp });
}

/** `friendId` is on `characterId`'s friend list. */
export function isFriend(ctx: Ctx, characterId: bigint, friendId: bigint): boolean {
  for (const f of ctx.db.friend.characterId.filter(characterId)) if (f.friendId === friendId) return true;
  return false;
}

/**
 * Takes `characterId` out of its raid party. The leader's seat passes to the next
 * member; an empty party is disbanded. Callers must not do this during a fight.
 */
export function leaveRaidParty(ctx: Ctx, characterId: bigint) {
  const m = ctx.db.raidMember.characterId.find(characterId);
  if (!m) return;
  ctx.db.raidMember.characterId.delete(characterId);
  const party = ctx.db.raidParty.id.find(m.partyId);
  if (!party) return;
  const rest = raidMembers(ctx, party.id);
  if (!rest.length) ctx.db.raidParty.id.delete(party.id);
  else if (party.leaderId === characterId) ctx.db.raidParty.id.update({ ...party, leaderId: rest[0].characterId });
}

/** A raid party's members in seat order (joining order). */
export function raidMembers(ctx: Ctx, partyId: bigint) {
  return [...ctx.db.raidMember.partyId.filter(partyId)].sort((a, b) => (a.joinedAt.microsSinceUnixEpoch < b.joinedAt.microsSinceUnixEpoch ? -1 : 1));
}

/** The party is in a fight that hasn't been settled yet. */
export const raidFighting = (party: { fight?: { finished: boolean } }) => !!party.fight && !party.fight.finished;

/** Deletes a mail and its unclaimed (escrowed) items. */
export function deleteMail(ctx: Ctx, m: Mail) {
  if (!m.claimed) for (const id of m.itemIds) ctx.db.item.id.delete(id);
  ctx.db.mail.id.delete(m.id);
}

/** Deletes the character's expired mail, unclaimed attachments included. */
export function purgeExpiredMail(ctx: Ctx, characterId: bigint) {
  const now = ctx.timestamp.microsSinceUnixEpoch;
  for (const m of [...ctx.db.mail.characterId.filter(characterId)]) {
    if (m.expiresAt && m.expiresAt.microsSinceUnixEpoch <= now) deleteMail(ctx, m);
  }
}

export function deleteCharacter(ctx: Ctx, characterId: bigint) {
  for (const m of [...ctx.db.mail.characterId.filter(characterId)]) deleteMail(ctx, m);
  leaveRaidParty(ctx, characterId);
  ctx.db.cosmeticUnlock.characterId.delete(characterId);
  ctx.db.look.characterId.delete(characterId);
  ctx.db.raidLog.characterId.delete(characterId);
  ctx.db.abyssLog.characterId.delete(characterId);
  ctx.db.abyssRecord.characterId.delete(characterId);
  ctx.db.item.characterId.delete(characterId);
  ctx.db.loadout.characterId.delete(characterId);
  ctx.db.bossKill.characterId.delete(characterId);
  ctx.db.enemyKill.characterId.delete(characterId);
  ctx.db.material.characterId.delete(characterId);
  ctx.db.skill.characterId.delete(characterId);
  ctx.db.tool.characterId.delete(characterId);
  ctx.db.supply.characterId.delete(characterId);
  ctx.db.forgeFilter.characterId.delete(characterId);
  ctx.db.scrap.characterId.delete(characterId);
  ctx.db.settleLog.characterId.delete(characterId);
  ctx.db.discovery.characterId.delete(characterId);
  ctx.db.lootFilter.characterId.delete(characterId);
  ctx.db.friend.characterId.delete(characterId);
  ctx.db.friend.friendId.delete(characterId);
  ctx.db.character.id.delete(characterId);
}

/**
 * Puts the caller's character into the world on this connection (taking over
 * from any other tab), granting its capped offline progress. No-op without a
 * character.
 */
export function enterWorld(ctx: Ctx) {
  const ch = ctx.db.character.owner.find(ctx.sender);
  if (!ch || !ctx.connectionId) return;
  leaveWorld(ctx, ctx.sender);
  ensureCharacterRows(ctx, ch.id);
  // The cap comes from the gear worn while away (Seasoned).
  const settled = settle(ctx, ch, offlineCapMicros(combatStats(ch.level, gearOf(ctx, ch))));
  ctx.db.character.id.update(settled);
  // Also backfills what was earned before a cosmetic existed.
  grantCosmetics(ctx, ch.id, settled.level);
  purgeExpiredMail(ctx, ch.id);
  ctx.db.presence.insert({
    identity: ctx.sender,
    connectionId: ctx.connectionId,
    characterId: ch.id,
    characterName: ch.name,
    since: ctx.timestamp,
    lastChatAt: ctx.timestamp,
  });
}

/** Takes `who` out of the world, settling the active character's online time. */
export function leaveWorld(ctx: Ctx, who: Identity) {
  const pres = ctx.db.presence.identity.find(who);
  if (!pres) return;
  const ch = ctx.db.character.id.find(pres.characterId);
  if (ch) ctx.db.character.id.update(settle(ctx, ch));
  // Raids are online only. Mid-fight the seat stays until `finishRaid`, which then drops it.
  const m = ctx.db.raidMember.characterId.find(pres.characterId);
  const party = m && ctx.db.raidParty.id.find(m.partyId);
  if (m && !(party && raidFighting(party))) leaveRaidParty(ctx, pres.characterId);
  ctx.db.presence.identity.delete(who);
  ctx.db.chatCooldown.identity.delete(who);
  ctx.db.inspect.viewer.delete(who);
}
