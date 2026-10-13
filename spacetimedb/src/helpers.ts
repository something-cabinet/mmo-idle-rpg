// Shared server-side helpers. Not re-exported from index.ts: the module entry
// may only export reducers/views.
import { Timestamp, type Identity } from 'spacetimedb';
import { SenderError, type Infer, type ReducerCtx } from 'spacetimedb/server';
import { Encounter as EncounterType, Found as FoundType, account, character, item, presence, settleLog, spacetimedb } from './schema';
import { DEFAULT_LOADOUT_NAMES, LOADOUT_COUNT, addXp, offlineCapMicros, project } from './game';
import { rollEncounters } from './encounters';
import { BASE_LIST, SLOTS, SLOT_COUNT, STARTER_ARMOR, base } from './data/bases';
import { ENEMIES_BY_ID, previousZone, rewardScale, type ZoneDef } from './data/zones';
import { Effect, effectAmount } from './data/legendary';
import { MAX_LEVEL, combatStats, matchup } from './combat';
import { AFFIX_STAT_IDS, RARITIES, firstKillReward, makeItem, rollDrops, rollMaterials, salvageValue, seededRng, type DropResult, type MaterialDrop, type Seen } from './loot';
import { simulate } from './sim';

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
 * XP, gold, and drops (kept items go to the bag, the rest is salvaged into Dust).
 * Online time is played as live fights (sim.ts `simulate`, the fights the client
 * animates); offline time uses the expected-value formulas (game.ts `project`). A
 * boss's first kill grants its reward and unlocks the next zone (zone-content.md); a
 * lost fight clears the target (idle). Call before anything that changes gear or
 * target. `capMicros` is only passed for the login settle, which covers the time
 * away and is always logged.
 */
export function settle(ctx: Ctx, ch: Character, capMicros?: bigint): Character {
  const gear = gearOf(ctx, ch);
  const target = ENEMIES_BY_ID.get(ch.targetEnemyId);
  const progress = { ...ch, settledMicros: ch.lastSettledAt.microsSinceUnixEpoch };
  const activity = { gear, enemy: target?.enemy };
  const now = ctx.timestamp.microsSinceUnixEpoch;
  const p = capMicros === undefined ? simulate(progress, activity, now, ch.id) : project(progress, activity, now, capMicros);

  // Folds in the deprecated `essence` column (moved to `dust` on the next settle).
  const dustBefore = ch.dust + ch.essence;
  let dust = dustBefore;
  let drops: DropResult | undefined;
  const keptItemIds: bigint[] = [];
  const discovered: Found[] = [];
  let materials: MaterialDrop[] = [];
  if (target && p.kills > 0) {
    const filter = ctx.db.lootFilter.characterId.find(ch.id);
    const stats = combatStats(ch.level, gear);
    // Seeded by (character, settle start), so the result is reproducible.
    drops = rollDrops(seededRng(ch.id, ch.lastSettledAt.microsSinceUnixEpoch), {
      kills: p.kills,
      enemy: target.enemy,
      tier: target.zone.tier,
      rewardScale: rewardScale(target.zone, target.enemy),
      itemFind: stats.itemFind,
      filter: {
        minRarity: filter?.minRarity.tag ?? 'Magic',
        keepAffixes: filter?.keepAffixes ?? [],
        keepBases: filter?.keepBases ?? [],
        minAffixTier: filter?.minAffixTier ?? 1,
      },
      bagFree: ch.bagSize - bagCount(ctx, ch.id),
      fortune: effectAmount(stats.effects, Effect.FortunesFavor),
      discoverRng: seededRng(ch.id, ch.lastSettledAt.microsSinceUnixEpoch, DISCOVER_SALT),
    });
    discovered.push(...discover(ctx, ch.id, target.zone.tier, drops.seen));
    for (const it of drops.kept) {
      const row = ctx.db.item.insert({ ...it, id: 0n, characterId: ch.id, locked: false, createdAt: ctx.timestamp });
      keptItemIds.push(row.id);
    }
    dust += drops.dust;
    // Own seed, so adding materials didn't change the item rolls above.
    materials = rollMaterials(seededRng(ch.id, ch.lastSettledAt.microsSinceUnixEpoch, MATERIAL_SALT), target.enemy, target.zone.tier, p.kills,
      rewardScale(target.zone, target.enemy));
    addMaterials(ctx, ch.id, materials);
  }

  let gold = p.gold;
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
      stats: combatStats(p.level, gear),
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
          dust += salvageValue(r.item.rarity.tag, r.item.tier);
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

  const offline = capMicros !== undefined;
  if (p.kills > 0 || offline || p.defeatedAt !== undefined) {
    const elapsed = ctx.timestamp.microsSinceUnixEpoch - ch.lastSettledAt.microsSinceUnixEpoch;
    const idle = p.defeatedAt === undefined ? 0n : ctx.timestamp.microsSinceUnixEpoch - p.defeatedAt;
    logSettle(ctx, ch, {
      offline,
      elapsedMicros: elapsed > 0n ? elapsed : 0n,
      capped: offline && elapsed > capMicros,
      viable: !!target && matchup(combatStats(ch.level, gear), target.enemy).viable,
      kills: p.kills,
      levelTo: level,
      xp: xpGained,
      gold: gold - ch.gold,
      dust: dust - dustBefore,
      keptItemIds,
      salvaged: RARITIES.map(r => drops?.salvaged[r] ?? 0),
      overflow: drops?.overflow ?? 0,
      materials,
      discovered,
      encounters,
      defeated: p.defeatedAt !== undefined,
      idleMicros: idle > 0n ? idle : 0n,
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
  };
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
    overflow: 0,
    defeated: false,
    idleMicros: 0n,
    materials: [],
    discovered: [],
    encounters: [],
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

/** A zone is open once the previous zone's boss is dead (the first zone always is). */
export function zoneUnlocked(ctx: Ctx, characterId: bigint, zone: ZoneDef): boolean {
  const prev = previousZone(zone);
  return !prev || hasKilledBoss(ctx, characterId, prev.id);
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
      slots: Array.from({ length: SLOT_COUNT }, () => 0n),
    });
  }
  if (!ctx.db.lootFilter.characterId.find(characterId)) {
    ctx.db.lootFilter.insert({
      characterId,
      minRarity: { tag: 'Magic' },
      keepAffixes: [...AFFIX_STAT_IDS],
      keepBases: BASE_LIST.map(b => b.id),
      minAffixTier: 1,
    });
  }
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

/** `friendId` is on `characterId`'s friend list. */
export function isFriend(ctx: Ctx, characterId: bigint, friendId: bigint): boolean {
  for (const f of ctx.db.friend.characterId.filter(characterId)) if (f.friendId === friendId) return true;
  return false;
}

export function deleteCharacter(ctx: Ctx, characterId: bigint) {
  ctx.db.item.characterId.delete(characterId);
  ctx.db.loadout.characterId.delete(characterId);
  ctx.db.bossKill.characterId.delete(characterId);
  ctx.db.enemyKill.characterId.delete(characterId);
  ctx.db.material.characterId.delete(characterId);
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
  ctx.db.presence.identity.delete(who);
  ctx.db.chatCooldown.identity.delete(who);
  ctx.db.inspect.viewer.delete(who);
}
