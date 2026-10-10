// Shared server-side helpers. Not re-exported from index.ts: the module entry
// may only export reducers/views.
import { Timestamp, type Identity } from 'spacetimedb';
import { SenderError, type Infer, type ReducerCtx } from 'spacetimedb/server';
import { account, character, item, presence, spacetimedb } from './schema';
import { DEFAULT_LOADOUT_NAMES, LOADOUT_COUNT, MAX_OFFLINE_MICROS, project } from './game';
import { SLOTS, SLOT_COUNT, STARTER_ARMOR, base } from './data/bases';
import { ENEMIES_BY_ID, previousZone, rewardScale, type ZoneDef } from './data/zones';
import { Effect } from './data/legendary';
import { combatStats, matchup } from './combat';
import { RARITIES, makeItem, rollDrops, seededRng, type DropResult } from './loot';

/** Settle log rows kept per character. */
export const SETTLE_LOG_KEEP = 30;

export type Ctx = ReducerCtx<(typeof spacetimedb)['schemaType']>;
export type Account = Infer<typeof account.rowType>;
export type Character = Infer<typeof character.rowType>;
export type Presence = Infer<typeof presence.rowType>;
export type Item = Infer<typeof item.rowType>;

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
 * Grants idle rewards earned since `lastSettledAt` (see `project`) with the
 * current gear and target: XP, gold, and drops (kept items go to the bag, the rest
 * is salvaged into Essence). Call before anything that changes gear or target.
 * `capMicros` is only passed for the login settle, which is always logged.
 */
export function settle(ctx: Ctx, ch: Character, capMicros?: bigint): Character {
  const gear = gearOf(ctx, ch);
  const target = ENEMIES_BY_ID.get(ch.targetEnemyId);
  const p = project(
    { ...ch, settledMicros: ch.lastSettledAt.microsSinceUnixEpoch },
    { gear, enemy: target?.enemy },
    ctx.timestamp.microsSinceUnixEpoch,
    capMicros
  );

  let essence = ch.essence;
  let drops: DropResult | undefined;
  const keptItemIds: bigint[] = [];
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
      filter: { minRarity: filter?.minRarity.tag ?? 'Magic', keepAffixes: filter?.keepAffixes ?? [] },
      bagFree: ch.bagSize - bagCount(ctx, ch.id),
      fortune: stats.effects.has(Effect.FortunesFavor),
    });
    for (const it of drops.kept) {
      const row = ctx.db.item.insert({ ...it, id: 0n, characterId: ch.id, uniqueId: undefined, locked: false, createdAt: ctx.timestamp });
      keptItemIds.push(row.id);
    }
    essence += drops.essence;
  }

  const offline = capMicros !== undefined;
  if (p.kills > 0 || offline) {
    const elapsed = ctx.timestamp.microsSinceUnixEpoch - ch.lastSettledAt.microsSinceUnixEpoch;
    ctx.db.settleLog.insert({
      id: 0n,
      characterId: ch.id,
      at: ctx.timestamp,
      offline,
      elapsedMicros: elapsed > 0n ? elapsed : 0n,
      capped: offline && elapsed > capMicros,
      enemyId: ch.targetEnemyId,
      viable: !!target && matchup(combatStats(ch.level, gear), target.enemy).viable,
      kills: p.kills,
      levelFrom: ch.level,
      levelTo: p.level,
      xp: p.xpGained,
      gold: p.gold - ch.gold,
      essence: essence - ch.essence,
      keptItemIds,
      salvaged: RARITIES.map(r => drops?.salvaged[r] ?? 0),
      overflow: drops?.overflow ?? 0,
    });
    pruneSettleLog(ctx, ch.id);
  }

  return {
    ...ch,
    level: p.level,
    xp: p.xp,
    gold: p.gold,
    essence,
    lastSettledAt: new Timestamp(p.settledMicros),
  };
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
    ctx.db.lootFilter.insert({ characterId, minRarity: { tag: 'Magic' }, keepAffixes: [] });
  }
}

/**
 * Gives a new character its starter kit (Common T1 weapon + Rawhide Vest and Boots)
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
      uniqueId: undefined,
      locked: false,
      createdAt: ctx.timestamp,
    });
    slots[SLOTS.indexOf(base(baseId).slots[0])] = row.id;
  }
  ctx.db.loadout.id.update({ ...lo, slots });
}

/** Deletes a character and everything it owns. */
export function deleteCharacter(ctx: Ctx, characterId: bigint) {
  ctx.db.item.characterId.delete(characterId);
  ctx.db.loadout.characterId.delete(characterId);
  ctx.db.bossKill.characterId.delete(characterId);
  ctx.db.settleLog.characterId.delete(characterId);
  ctx.db.lootFilter.characterId.delete(characterId);
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
  const settled = settle(ctx, ch, MAX_OFFLINE_MICROS);
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
}
