// Raid parties and fights (docs/design/raids.md). Online only: forming a party, hiring
// NPCs into empty seats, and starting a fight need every member in the world. The
// fight is played in full when it starts (raid.ts `simulateRaid`); `finishRaid` grants
// the rewards when it ends, while the clients replay it.
import { ScheduleAt, SenderError, t } from 'spacetimedb/server';
import { Timestamp } from 'spacetimedb';
import { raidTimer, spacetimedb } from '../schema';
import { addXp } from '../game';
import { MAX_LEVEL, combatStats } from '../combat';
import { RAIDS_BY_ID, RAID_PARTY_SIZE, type RaidDef } from '../data/raids';
import { ZONES_BY_ID, bossOf } from '../data/zones';
import { clearsToday, encodeSetup, decodeSetup, npcStats, raidLootRng, raidRng, rollRaidItem, simulateRaid, type RaidFighter } from '../raid';
import { discover, gearOf, hasKilledBoss, leaveRaidParty, raidFighting, raidMembers, requireActive, settle, type Character, type Ctx } from '../helpers';

/** Raid log rows kept per character. */
const RAID_LOG_KEEP = 20;

function requireRaid(raidId: number): RaidDef {
  const raid = RAIDS_BY_ID.get(raidId);
  if (!raid) throw new SenderError('No such raid');
  return raid;
}

function requireUnlocked(ctx: Ctx, ch: Character, raid: RaidDef) {
  if (hasKilledBoss(ctx, ch.id, raid.unlockZoneId)) return;
  const zone = ZONES_BY_ID.get(raid.unlockZoneId);
  throw new SenderError(`Defeat ${(zone && bossOf(zone)?.name) ?? 'the zone boss'} to unlock ${raid.name}`);
}

/** The caller's party, which the caller must lead and which must not be fighting. */
function requireLeading(ctx: Ctx, ch: Character) {
  const m = ctx.db.raidMember.characterId.find(ch.id);
  const party = m && ctx.db.raidParty.id.find(m.partyId);
  if (!party) throw new SenderError('You are not in a raid party');
  if (party.leaderId !== ch.id) throw new SenderError('Only the party leader can do that');
  if (raidFighting(party)) throw new SenderError('The fight is on: wait for it to end');
  return party;
}

/** Forms a new party for `raidId`, led by the caller. */
export const createRaidParty = spacetimedb.reducer({ raidId: t.u16() }, (ctx, { raidId }) => {
  const { ch } = requireActive(ctx);
  const raid = requireRaid(raidId);
  requireUnlocked(ctx, ch, raid);
  if (ctx.db.raidMember.characterId.find(ch.id)) throw new SenderError('Leave your raid party first');
  const party = ctx.db.raidParty.insert({ id: 0n, raidId, leaderId: ch.id, hired: 0, createdAt: ctx.timestamp, fight: undefined });
  ctx.db.raidMember.insert({ characterId: ch.id, partyId: party.id, name: ch.name, joinedAt: ctx.timestamp });
});

/** Joins a party with a free seat (hired NPC seats count as taken). */
export const joinRaidParty = spacetimedb.reducer({ partyId: t.u64() }, (ctx, { partyId }) => {
  const { ch } = requireActive(ctx);
  if (ctx.db.raidMember.characterId.find(ch.id)) throw new SenderError('Leave your raid party first');
  const party = ctx.db.raidParty.id.find(partyId);
  if (!party) throw new SenderError('That party is gone');
  requireUnlocked(ctx, ch, requireRaid(party.raidId));
  if (raidFighting(party)) throw new SenderError('That party is fighting');
  if (raidMembers(ctx, party.id).length + party.hired >= RAID_PARTY_SIZE) throw new SenderError('That party is full');
  ctx.db.raidMember.insert({ characterId: ch.id, partyId: party.id, name: ch.name, joinedAt: ctx.timestamp });
});

/** Leaves the caller's party (not during a fight). The next member leads; an empty party disbands. */
export const leaveRaid = spacetimedb.reducer(ctx => {
  const { ch } = requireActive(ctx);
  const m = ctx.db.raidMember.characterId.find(ch.id);
  if (!m) return;
  const party = ctx.db.raidParty.id.find(m.partyId);
  if (party && raidFighting(party)) throw new SenderError('The fight is on: wait for it to end');
  leaveRaidParty(ctx, ch.id);
});

/** The leader removes a member. */
export const kickFromRaid = spacetimedb.reducer({ characterId: t.u64() }, (ctx, { characterId }) => {
  const { ch } = requireActive(ctx);
  const party = requireLeading(ctx, ch);
  if (characterId === ch.id) throw new SenderError('Leave the party instead');
  const m = ctx.db.raidMember.characterId.find(characterId);
  if (!m || m.partyId !== party.id) throw new SenderError('Not in your party');
  leaveRaidParty(ctx, characterId);
});

/** The leader sets how many empty seats NPCs fill; they are paid for at the start. */
export const setRaidHires = spacetimedb.reducer({ count: t.u8() }, (ctx, { count }) => {
  const { ch } = requireActive(ctx);
  const party = requireLeading(ctx, ch);
  if (raidMembers(ctx, party.id).length + count > RAID_PARTY_SIZE) throw new SenderError('Not enough empty seats');
  ctx.db.raidParty.id.update({ ...party, hired: count });
});

/**
 * The leader starts the fight. Every member must be online and have the raid
 * unlocked. Settles every member (their stats are taken as of now), charges the leader
 * for the hired NPCs, plays the whole fight, and schedules `finishRaid` for its end.
 */
export const startRaid = spacetimedb.reducer(ctx => {
  const { ch: leader } = requireActive(ctx);
  const party = requireLeading(ctx, leader);
  const raid = requireRaid(party.raidId);
  const members = raidMembers(ctx, party.id);
  if (members.length + party.hired > RAID_PARTY_SIZE) throw new SenderError('Too many in the party');

  const players: RaidFighter[] = [];
  let hireCost = 0n;
  for (const m of members) {
    if (!ctx.db.presence.characterId.find(m.characterId)) throw new SenderError(`${m.name} is offline`);
    const row = ctx.db.character.id.find(m.characterId);
    if (!row) throw new SenderError(`${m.name} is gone`);
    requireUnlocked(ctx, row, raid);
    // Their farming so far counts first (and their level is current).
    let ch = settle(ctx, row);
    if (ch.id === leader.id) {
      hireCost = BigInt(party.hired) * BigInt(raid.hireCost);
      if (ch.gold < hireCost) throw new SenderError(`Hiring ${party.hired} NPC${party.hired === 1 ? '' : 's'} costs ${hireCost.toLocaleString()} gold`);
      ch = { ...ch, gold: ch.gold - hireCost };
    }
    ctx.db.character.id.update(ch);
    players.push({ characterId: ch.id, name: ch.name, stats: combatStats(ch.level, gearOf(ctx, ch)) });
  }
  const npc = npcStats(raid);
  const hired = Array.from({ length: party.hired }, (_, i): RaidFighter => ({ characterId: 0n, name: `Hireling ${i + 1}`, stats: npc }));
  const setup = { raidId: raid.id, fighters: [...players, ...hired] };

  const start = ctx.timestamp.microsSinceUnixEpoch;
  const result = simulateRaid(setup, raid, raidRng(party.id, start), false);
  const endsAt = start + BigInt(Math.ceil(result.end * 1e6));
  ctx.db.raidParty.id.update({
    ...party,
    fight: { startedAt: ctx.timestamp, endsAt: new Timestamp(endsAt), setup: encodeSetup(setup), won: result.won, hireCost, finished: false },
  });
  ctx.db.raidTimer.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.time(endsAt), partyId: party.id });
});

/**
 * A fight is over: every player in it gets a log row, and on a win, unless they have
 * used up today's clears (`clearsPerDay`), an Epic or better item (outside the bag limit), raid tokens,
 * gold and XP. Members who went offline during the fight leave the party.
 */
export const finishRaid = spacetimedb.reducer({ onSchedule: raidTimer }, { timer: raidTimer.rowType }, (ctx, { timer }) => {
  if (!ctx.sender.isEqual(ctx.identity)) throw new SenderError('Runs on a schedule only');
  const party = ctx.db.raidParty.id.find(timer.partyId);
  if (!party?.fight || party.fight.finished) return;
  const fight = party.fight;
  const raid = RAIDS_BY_ID.get(party.raidId);
  if (!raid) return;
  const now = ctx.timestamp.microsSinceUnixEpoch;
  const start = fight.startedAt.microsSinceUnixEpoch;

  for (const f of decodeSetup(fight.setup).fighters) {
    if (f.characterId === 0n) continue;
    const ch = ctx.db.character.id.find(f.characterId);
    if (!ch) continue;
    const rewarded = fight.won && clearsToday(ctx.db.raidLog.characterId.filter(ch.id), raid.id, now) < raid.clearsPerDay;
    let itemId = 0n;
    if (rewarded) {
      const item = rollRaidItem(raidLootRng(party.id, start, ch.id), raid);
      itemId = ctx.db.item.insert({ ...item, id: 0n, characterId: ch.id, locked: false, createdAt: ctx.timestamp }).id;
      discover(ctx, ch.id, item.tier, [{ baseId: item.baseId, uniqueId: item.uniqueId }]);
      const { level, xp } = addXp(ch.level, ch.xp, BigInt(raid.boss.xp));
      ctx.db.character.id.update({ ...ch, level, xp, gold: ch.gold + BigInt(raid.boss.gold), raidTokens: ch.raidTokens + BigInt(raid.tokens) });
    }
    ctx.db.raidLog.insert({
      id: 0n,
      characterId: ch.id,
      raidId: raid.id,
      partyId: party.id,
      startedAt: fight.startedAt,
      won: fight.won,
      rewarded,
      itemId,
      tokens: rewarded ? BigInt(raid.tokens) : 0n,
      gold: rewarded ? BigInt(raid.boss.gold) : 0n,
      xp: rewarded && ch.level < MAX_LEVEL ? BigInt(raid.boss.xp) : 0n,
      hireCost: ch.id === party.leaderId ? fight.hireCost : 0n,
    });
    pruneRaidLog(ctx, ch.id);
  }

  ctx.db.raidParty.id.update({ ...party, fight: { ...fight, finished: true } });
  for (const m of raidMembers(ctx, party.id)) if (!ctx.db.presence.characterId.find(m.characterId)) leaveRaidParty(ctx, m.characterId);
});

function pruneRaidLog(ctx: Ctx, characterId: bigint) {
  const rows = [...ctx.db.raidLog.characterId.filter(characterId)];
  if (rows.length <= RAID_LOG_KEEP) return;
  rows.sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const r of rows.slice(0, rows.length - RAID_LOG_KEEP)) ctx.db.raidLog.id.delete(r.id);
}
