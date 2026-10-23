// The Shifting Rift (docs/design/shifting-rift.md). Online only, never settled offline. Each
// reducer loads the run into a `RunState`, applies one action (riftRun.ts `apply`, the same
// rules the client and the bots use) and writes it back; the battles it played are stored on
// the run for the client to replay. A solo run is a party of one; co-op (R6) adds the lobby.
import { SenderError, t } from 'spacetimedb/server';
import type { Infer } from 'spacetimedb';
import { riftItem, riftMember, riftRun, spacetimedb } from '../schema';
import { LOADOUT_COUNT, addXp } from '../game';
import { MAX_LEVEL } from '../combat';
import { FLOORS, RIFT_MIN_TIER, RIFT_UNLOCK_ZONE } from '../data/rift';
import { ZONES, ZONES_BY_ID, bossOf } from '../data/zones';
import { encodeBuild } from '../abyss';
import { rewardOwed, riftWeek, runSeed, weeklyMutation } from '../rift';
import { RiftError, apply, encodeFights, encodeRift, startRun, type MemberState, type RiftAction, type RiftItem, type RunState } from '../riftRun';
import { byJoin, itemOf, stateFromRows } from '../riftRows';
import { SLOT_COUNT } from '../data/bases';
import { addMaterials, addSupply, grantCosmetics, hasKilledBoss, requireActive, settle, type Character, type Ctx } from '../helpers';
import type { NewItem } from '../loot';

type RunRow = Infer<typeof riftRun.rowType>;
type MemberRow = Infer<typeof riftMember.rowType>;
type ItemRow = Infer<typeof riftItem.rowType>;

/** Runs kept in a character's history. */
const RIFT_LOG_KEEP = 10;
// ---------------------------------------------------------------- rows ↔ state

function itemRow(runId: bigint, characterId: bigint, slot: number, it: RiftItem): ItemRow {
  const h = it.headlines;
  return {
    id: 0n, runId, characterId, slot,
    baseId: it.baseId, tier: it.tier, rarity: it.rarity as ItemRow['rarity'], implicits: it.implicits, affixes: it.affixes, legendary: it.legendary,
    uniqueId: it.uniqueId, weapon: it.weapon as ItemRow['weapon'], effects: it.effects, temper: it.temper, boundAffix: it.boundAffix, corruption: it.corruption,
    headlines: h && { riftEffect: h.riftEffect ?? 0, mark: h.mark ?? 0, growth: !!h.growth, trophies: h.trophies ?? [], echo: h.echo ?? 0 },
    guaranteed: it.guaranteed === 'trophy' ? 1 : it.guaranteed === 'echo' ? 2 : 0,
  };
}

const membersOf = (ctx: Ctx, runId: bigint) => byJoin([...ctx.db.riftMember.runId.filter(runId)]);

const loadState = (ctx: Ctx, run: RunRow): RunState => stateFromRows(run, membersOf(ctx, run.id), [...ctx.db.riftItem.runId.filter(run.id)]);

/** Writes `state` back over `run`'s rows: the run, each member, their worn items; members gone are removed. */
function saveState(ctx: Ctx, run: RunRow, state: RunState, fights: string) {
  ctx.db.riftRun.id.update({
    ...run, floor: state.floor, row: state.row, col: state.col, cleared: state.cleared,
    leaderId: state.members.some(m => m.characterId === run.leaderId) ? run.leaderId : (state.members[0]?.characterId ?? run.leaderId),
    fights, actedAt: ctx.timestamp,
  });
  const keep = new Set(state.members.map(m => m.characterId));
  for (const r of membersOf(ctx, run.id)) if (!keep.has(r.characterId)) removeMember(ctx, run, r, state);
  for (const it of [...ctx.db.riftItem.runId.filter(run.id)]) ctx.db.riftItem.id.delete(it.id);
  for (const m of state.members) {
    const row = ctx.db.riftMember.characterId.find(m.characterId)!;
    ctx.db.riftMember.characterId.update({
      ...row, hp: m.hp, motes: m.motes, boons: m.boons, curses: m.curses, marks: m.marks, thickBlood: m.thickBlood, secondWind: m.secondWind,
      holdTheLine: m.holdTheLine, won: m.won, downed: m.downed, ready: m.ready, pending: encodeRift(m.pending), skipBoon: m.skipBoon,
      freeRare: m.freeRare, spent: m.spent,
    });
    m.gear.forEach((it, slot) => it && ctx.db.riftItem.insert(itemRow(run.id, m.characterId, slot, it)));
    recordCodex(ctx, m);
  }
}

// ---------------------------------------------------------------- the Codex, rewards, the end

function recordCodex(ctx: Ctx, m: MemberState) {
  const seen = new Set([...ctx.db.riftCodex.characterId.filter(m.characterId)].map(c => c.kind * 100_000 + c.entryId));
  const add = (kind: number, entryId: number) => {
    if (seen.has(kind * 100_000 + entryId)) return;
    seen.add(kind * 100_000 + entryId);
    ctx.db.riftCodex.insert({ id: 0n, characterId: m.characterId, kind, entryId });
  };
  const ethereal: RiftItem[] = m.gear.filter((it): it is RiftItem => !!it?.headlines);
  for (const p of m.pending) {
    if (p.kind === 'boons') p.choices.forEach(c => add(1, c.id));
    if (p.kind === 'item') ethereal.push(p.item);
    if (p.kind === 'items') ethereal.push(...p.items);
  }
  m.boons.forEach(b => add(1, b.id));
  for (const it of ethereal) {
    add(2, it.baseId);
    if (it.headlines?.riftEffect) add(3, it.headlines.riftEffect);
  }
}

/** Pays every member floor `floor`'s weekly reward, if they haven't cleared it this week. */
function payFloor(ctx: Ctx, run: RunRow, floor: number) {
  for (const row of membersOf(ctx, run.id)) {
    const week = ctx.db.riftWeek.characterId.find(row.characterId);
    const paid = week && week.week === run.week ? [...week.paid] : new Array<number>(FLOORS).fill(0);
    const owed = rewardOwed(floor, run.tier, paid[floor - 1], run.week);
    if (!owed) continue;
    paid[floor - 1] = run.tier;
    if (week) ctx.db.riftWeek.characterId.update({ characterId: row.characterId, week: run.week, paid });
    else ctx.db.riftWeek.insert({ characterId: row.characterId, week: run.week, paid });
    const before = ctx.db.character.id.find(row.characterId);
    if (!before) continue;
    let ch = settle(ctx, before);
    const { level, xp } = addXp(ch.level, ch.xp, owed.xp);
    ch = { ...ch, level, xp, gold: ch.gold + owed.gold, dust: ch.dust + owed.dust };
    ctx.db.character.id.update(ch);
    const materials = owed.materials.map(([materialId, count]) => ({ materialId, count }));
    addMaterials(ctx, ch.id, materials);
    for (const e of owed.elixirs) addSupply(ctx, ch.id, e, 1);
    grantCosmetics(ctx, ch.id, ch.level);
    const totals = new Map(row.paidMaterials.map(m => [m.materialId, m.count]));
    for (const m of materials) totals.set(m.materialId, (totals.get(m.materialId) ?? 0) + m.count);
    const current = ctx.db.riftMember.characterId.find(row.characterId)!;
    ctx.db.riftMember.characterId.update({
      ...current, paidGold: current.paidGold + owed.gold, paidXp: current.paidXp + (before.level < MAX_LEVEL ? owed.xp : 0n), paidDust: current.paidDust + owed.dust,
      paidMaterials: [...totals].map(([materialId, count]) => ({ materialId, count })),
    });
  }
}

/** A member's run is over for them: their history row, then their rows go. */
function removeMember(ctx: Ctx, run: RunRow, row: MemberRow, state: RunState) {
  const gear: (NewItem | undefined)[] = new Array(SLOT_COUNT).fill(undefined);
  for (const it of ctx.db.riftItem.characterId.filter(row.characterId)) if (it.runId === run.id) gear[it.slot] = itemOf(it);
  ctx.db.riftLog.insert({
    id: 0n, characterId: row.characterId, startedAt: run.startedAt, endedAt: ctx.timestamp, tier: run.tier, mutation: run.mutation, level: row.level,
    floor: state.floor, cleared: state.cleared, end: state.end ?? 'left', boons: row.boons, build: encodeBuild(gear),
    gold: row.paidGold, xp: row.paidXp, dust: row.paidDust, materials: row.paidMaterials,
  });
  const logs = [...ctx.db.riftLog.characterId.filter(row.characterId)].sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const l of logs.slice(0, Math.max(0, logs.length - RIFT_LOG_KEEP))) ctx.db.riftLog.id.delete(l.id);
  for (const it of [...ctx.db.riftItem.characterId.filter(row.characterId)]) if (it.runId === run.id) ctx.db.riftItem.id.delete(it.id);
  ctx.db.riftMember.characterId.delete(row.characterId);
}

/** Ends `run` for everyone: history rows, then every row of it goes. */
function endRun(ctx: Ctx, run: RunRow, state: RunState) {
  for (const r of membersOf(ctx, run.id)) removeMember(ctx, run, r, state);
  ctx.db.riftRun.id.delete(run.id);
}

// ---------------------------------------------------------------- calls

/** The caller's character and their run, ending it first if its week is over (`run` undefined then). */
function myRun(ctx: Ctx): { ch: Character; run?: RunRow } {
  const { ch } = requireActive(ctx);
  const member = ctx.db.riftMember.characterId.find(ch.id);
  const run = member && ctx.db.riftRun.id.find(member.runId);
  if (!run) return { ch };
  if (run.week !== riftWeek(ctx.timestamp.microsSinceUnixEpoch)) {
    // The weekly reset: what its cleared floors paid stays paid.
    const state = loadState(ctx, run);
    endRun(ctx, run, { ...state, phase: 'ended', end: 'week' });
    return { ch };
  }
  return { ch, run };
}

/** Applies `action` to the caller's run and stores the outcome: rewards for a cleared floor, the end of the run. */
function act(ctx: Ctx, action: (ch: Character, run: RunRow) => RiftAction, leaderOnly = false) {
  const { ch, run } = myRun(ctx);
  if (!run) return; // ended by the weekly reset: nothing left to act on
  if (leaderOnly && run.leaderId !== ch.id) throw new SenderError('Only the party leader can do that');
  const state = loadState(ctx, run);
  let result;
  try {
    result = apply(state, action(ch, run));
  } catch (e) {
    if (e instanceof RiftError) throw new SenderError(e.message);
    throw e;
  }
  saveState(ctx, run, result.state, result.fights.length ? encodeFights(result.fights) : '');
  const updated = ctx.db.riftRun.id.find(run.id)!;
  if (result.cleared !== undefined) payFloor(ctx, updated, result.cleared);
  if (result.state.phase === 'ended') endRun(ctx, updated, result.state);
}

/** Members who must be ready before the party moves on: those online. */
const online = (ctx: Ctx, run: RunRow) => membersOf(ctx, run.id).filter(m => ctx.db.presence.characterId.find(m.characterId)).map(m => m.characterId);

/**
 * Starts a solo run at tier `tier` (T5 or higher, its zone boss killed) with a locked copy of
 * loadout `loadout` at the character's level. Ends a run from an earlier week first. Opens
 * with the T5 boss's first kill.
 */
export const riftStart = spacetimedb.reducer({ loadout: t.u8(), tier: t.u8() }, (ctx, { loadout, tier }) => {
  const { ch: row, run: current } = myRun(ctx);
  if (current) throw new SenderError('Already in a Rift run');
  if (!hasKilledBoss(ctx, row.id, RIFT_UNLOCK_ZONE)) {
    const zone = ZONES_BY_ID.get(RIFT_UNLOCK_ZONE);
    throw new SenderError(`Defeat ${(zone && bossOf(zone)?.name) ?? 'the zone boss'} to open the Shifting Rift`);
  }
  const zone = ZONES.find(z => z.tier === tier);
  if (tier < RIFT_MIN_TIER || !zone) throw new SenderError('No such tier');
  if (!hasKilledBoss(ctx, row.id, zone.id)) throw new SenderError(`Defeat ${bossOf(zone)?.name ?? 'the zone boss'} to open this tier`);
  if (loadout >= LOADOUT_COUNT) throw new SenderError('No such loadout');
  const lo = [...ctx.db.loadout.characterId.filter(row.id)].find(l => l.index === loadout);
  if (!lo) throw new SenderError('No such loadout');
  const gear = lo.slots.map(id => (id === 0n ? undefined : (ctx.db.item.id.find(id) ?? undefined)));
  if (!gear.some(Boolean)) throw new SenderError('That loadout is empty');
  const ch = settle(ctx, row);
  ctx.db.character.id.update(ch);

  const now = ctx.timestamp.microsSinceUnixEpoch;
  const week = riftWeek(now);
  const mutation = weeklyMutation(week);
  const inserted = ctx.db.riftRun.insert({
    id: 0n, seed: 0n, week, tier, mutation, floor: 1, row: -1, col: 0, leaderId: ch.id, cleared: 0, startedAt: ctx.timestamp, fights: '', actedAt: ctx.timestamp,
  });
  const seed = runSeed(inserted.id, now);
  // The locked copy: the items' stored stats and effects, literally.
  const copy: (NewItem | undefined)[] = gear.map(it => {
    if (!it) return undefined;
    const { id: _i, characterId: _c, locked: _l, createdAt: _t, ...rest } = it;
    return { ...rest, effects: [...rest.effects] } as NewItem;
  });
  const state = startRun(seed, tier, mutation, [{ characterId: ch.id, level: ch.level, gear: copy }]);
  const m = state.members[0];
  ctx.db.riftMember.insert({
    characterId: ch.id, runId: inserted.id, name: ch.name, joinedAt: ctx.timestamp, level: ch.level, hp: m.hp, motes: 0, boons: [], curses: [], marks: [],
    thickBlood: false, secondWind: m.secondWind, holdTheLine: true, won: 0, downed: false, ready: false, pending: '', skipBoon: false, freeRare: false, spent: 0,
    paidGold: 0n, paidXp: 0n, paidDust: 0n, paidMaterials: [],
  });
  const run = { ...inserted, seed };
  ctx.db.riftRun.id.update(run);
  saveState(ctx, run, state, '');
});

/** The leader moves the party to node `node` of the next row; a fight there is played at once. */
export const riftMove = spacetimedb.reducer({ node: t.u8() }, (ctx, { node }) => {
  act(ctx, (_ch, run) => ({ type: 'move', node, online: online(ctx, run) }), true);
});

/** The leader fights floor boss option `option` (after the last row). */
export const riftBoss = spacetimedb.reducer({ option: t.u8() }, (ctx, { option }) => {
  act(ctx, (_ch, run) => ({ type: 'boss', option, online: online(ctx, run) }), true);
});

/**
 * Answers the caller's first waiting choice (riftRun.ts `choose`): a gift, a boon (−1: none),
 * wear (1) or discard (0), a Vault item, a shop offer (−1 leave, −2 reroll), an event choice.
 * `target`: a slot, boon or curse ID (−1: none); `theme`: a theme (0: none).
 */
export const riftChoose = spacetimedb.reducer({ choice: t.i16(), target: t.i32(), theme: t.u8() }, (ctx, { choice, target, theme }) => {
  act(ctx, ch => ({ type: 'choose', member: ch.id, choice, ...(target >= 0 && { target }), ...(theme > 0 && { theme }) }));
});

/** The caller is ready for the party to move on (a party; solo, moving is being ready). */
export const riftReady = spacetimedb.reducer(ctx => {
  act(ctx, ch => ({ type: 'ready', member: ch.id }));
});

/** The caller leaves their run; floors already cleared stay paid. The last one out ends it. */
export const riftLeave = spacetimedb.reducer(ctx => {
  act(ctx, ch => ({ type: 'leave', member: ch.id }));
});
