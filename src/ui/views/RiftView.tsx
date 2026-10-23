// The Shifting Rift (docs/design/shifting-rift.md): the start (tier, loadout, this week's
// mutation and floors paid), then the run: the Threshold's gifts, the floor map and its boss,
// each node's fight replayed (riftRun.ts `replayFight`, the battle the server settled), boon
// offers, wear or discard, shops and events, the Rift loadout and boons; and the history
// and Codex. A party forms first (create, join from the list, the leader sets off), then
// shows its members, who is ready, and every member's HP in the replay. The client builds the same run state as the server (riftRows.ts) and checks
// each choice with the same rules (`apply`), so what can't apply is greyed out with why.

import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { Item, RiftLog, RiftMember, RiftRun } from '../../module_bindings/types';
import { combatStats, type CombatStats } from '../../../spacetimedb/src/combat';
import type { PlayerSpec } from '../../../spacetimedb/src/battle';
import { ELITE_AFFIXES_BY_ID } from '../../../spacetimedb/src/data/abyss';
import { UNIQUES_BY_ID } from '../../../spacetimedb/src/data/uniques';
import { ZONES, ZONES_BY_ID, ENEMIES_BY_ID, bossOf } from '../../../spacetimedb/src/data/zones';
import {
  BOONS_BY_ID, BOON_RARITIES, CURSES_BY_ID, EVENTS_BY_ID, FLOORS, FLOOR_REWARDS, GIFTS_BY_ID, Gift, MUTATIONS_BY_ID, NODE_TIME_LIMIT, RIFT_EFFECTS,
  RIFT_EFFECTS_BY_ID, RIFT_HEART, RIFT_KICK_OFFLINE_MINUTES, RIFT_PARTY_SIZE, PARTY_HP, RiftEffect, RIFT_MIN_TIER, RIFT_UNLOCK_ZONE, ROWS, SET_AT, THEMES, THEMES_BY_ID, TROPHIES_BY_ID, boonText,
  type BoonDef,
} from '../../../spacetimedb/src/data/rift';
import {
  ECHOES_BY_ID, bossOptions, floorMap, floorReward, headlineCount, lineupSlot, nodeLineup, riftWeek, themeCounts, weeklyMutation,
  type BoonChoice, type EtherealItem, type FloorMap, type Headlines,
} from '../../../spacetimedb/src/rift';
import {
  DISCARD, RiftError, SHOP_LEAVE, SHOP_REROLL, SKIP, WEAR, apply, decodeRift, fightParts, isReady, memberMarks, memberStats, reachable, replayFight,
  rerollCost, unravelled, wearPlan, type MemberState, type Pending, type RiftAction, type RiftItem, type RunState, type StoredFight,
} from '../../../spacetimedb/src/riftRun';
import { byJoin, stateFromRows } from '../../../spacetimedb/src/riftRows';
import { decodeBuild } from '../../../spacetimedb/src/abyss';
import { base } from '../../../spacetimedb/src/data/bases';
import { EFFECTS_BY_ID, Effect, LEGENDARIES_BY_ID } from '../../../spacetimedb/src/data/legendary';
import { call, useSticky } from '../../store';
import { startFight, stopFight } from '../fight';
import { FightStage } from '../FightStage';
import { nowMicros } from '../clock';
import { EnemyArt } from '../enemyArt';
import { fmt, fmtBig } from '../format';
import { Icon } from '../Icon';
import { ItemCard, itemName, materialName } from '../items';
import { CardHead, EffectsCard, Modal, StatBoard, ViewHeader, SLOT_LABEL } from '../shared';
import { gearFor, type Snapshot } from '../snapshot';
import { statSheet } from '../statSheet';
import { SLOT_GRID, SlotCell } from './EquipmentView';

const KIND_ICON = { fight: 'swords', elite: 'skull', shop: 'coins', event: 'book' } as const;
const KIND_LABEL = { fight: 'Fight', elite: 'Elite fight', shop: 'Shop', event: 'Event' } as const;
const END_TEXT: Record<string, string> = {
  cleared: 'The Rift Heart falls: the run is cleared',
  dead: 'Fallen in the Rift',
  timeout: 'Out of time: the node was lost',
  left: 'Left the run',
  week: 'The week ended',
};
/** A fresh action's fights play at once if seen within this long. */
const FRESH_MICROS = 15_000_000n;

/** The Rift item as the item cards take it (it has the same columns). */
const asItem = (it: RiftItem | undefined) => it as unknown as Item | undefined;
const themeName = (t: number) => THEMES_BY_ID.get(t as never)?.name ?? '?';
const enemyName = (id: number) => (id === RIFT_HEART.id ? RIFT_HEART.name : (ECHOES_BY_ID.get(id)?.enemy.name ?? `Enemy ${id}`));
const boonLabel = (def: BoonDef) => `${def.name}${def.theme ? ` · ${themeName(def.theme)}` : ''}`;

/** What applying `action` would refuse with, or undefined if it applies. */
function refusal(state: RunState, action: RiftAction): string | undefined {
  try {
    apply(state, action);
    return undefined;
  } catch (e) {
    if (e instanceof RiftError) return e.message;
    throw e;
  }
}

const isOnline = (s: Snapshot, characterId: bigint) => [...s.conn.db.presence.iter()].some(p => p.characterId === characterId);

/** Who leads now: the leader, or while they're offline the first online member (reducers/rift.ts `actingLeader`). */
function actingLeader(s: Snapshot, run: RiftRun, members: readonly RiftMember[]): bigint {
  if (isOnline(s, run.leaderId)) return run.leaderId;
  return byJoin(members).find(m => isOnline(s, m.characterId))?.characterId ?? run.leaderId;
}

export const RiftView = memo(function RiftView({ s }: { s: Snapshot }) {
  const conn = s.conn;
  const zone = ZONES_BY_ID.get(RIFT_UNLOCK_ZONE)!;
  const unlocked = s.killedZones.has(zone.id);
  const member = conn.db.riftMember.characterId.find(s.row.id);
  const run = member ? conn.db.riftRun.id.find(member.runId) : undefined;

  return (
    <>
      <ViewHeader title="Shifting Rift" icon="sparkles" />
      <p className="muted deep-blurb">
        The Last Thane's seal is broken, and beneath Brightvein Hold the rift shifts every time you enter: pieces of every zone, echoes of old
        enemies, gear made of rift-stuff that falls apart when you leave. Five floors, a new layout every run. Each floor pays once a week.
        Online only; farming carries on meanwhile.
      </p>
      {!unlocked ? (
        <div className="lock-note"><Icon name="lock" />Defeat {bossOf(zone)?.name} in {zone.name} to open the Shifting Rift</div>
      ) : run && member && run.lobby ? (
        <Lobby s={s} run={run} />
      ) : run && member ? (
        <Run s={s} run={run} />
      ) : (
        <Start s={s} />
      )}
      <History s={s} />
      <Codex s={s} />
    </>
  );
});

// ---------------------------------------------------------------- the start

function Start({ s }: { s: Snapshot }) {
  const conn = s.conn;
  const week = riftWeek(nowMicros());
  const mutation = MUTATIONS_BY_ID.get(weeklyMutation(week))!;
  const tiers = ZONES.filter(z => z.tier >= RIFT_MIN_TIER && s.killedZones.has(z.id)).map(z => z.tier);
  const [tier, setTier] = useSticky<number>('riftTier', Math.max(...tiers));
  const [loadout, setLoadout] = useSticky<number>('riftLoadout', s.row.activeLoadout);
  const lo = s.loadouts.find(l => l.index === loadout) ?? s.active;
  const gear = gearFor(lo?.slots ?? [], s.items);
  const paidRow = conn.db.myRiftWeek.iter().next().value;
  const paid = paidRow && paidRow.week === week ? paidRow.paid : [];
  const [busy, setBusy] = useState(false);
  const empty = !gear.some(Boolean);
  const latest = [...conn.db.myRiftLog.iter()].sort((a, b) => (a.id < b.id ? 1 : -1))[0];
  const [seenLog, setSeenLog] = useSticky<string>('riftSeenLog', '');
  const fresh = latest && String(latest.id) !== seenLog && nowMicros() - latest.endedAt.microsSinceUnixEpoch < 600_000_000n;

  return (
    <>
      {fresh && <RunOver log={latest} onClose={() => setSeenLog(String(latest.id))} />}
      <section className="card rift-start">
        <CardHead title="Enter the Rift">
          <span className="tag rift-mutation" title={mutation.text}><Icon name="sparkles" />{mutation.name}</span>
        </CardHead>
        <p className="muted hint">This week: <strong>{mutation.name}</strong>. {mutation.text}.</p>
        <div className="deep-launch">
          <div className="deep-loadouts">
            <span className="muted">Tier</span>
            <div className="seg">
              {tiers.map(t => (
                <button key={t} className={`seg-btn${t === tier ? ' active' : ''}`} onClick={() => setTier(t)}>T{t}</button>
              ))}
            </div>
          </div>
          <div className="deep-loadouts">
            <span className="muted">Lock in</span>
            <div className="seg">
              {s.loadouts.map(l => (
                <button key={l.index} className={`seg-btn${l.index === lo?.index ? ' active' : ''}`} onClick={() => setLoadout(l.index)}>
                  {l.name || `Loadout ${l.index + 1}`}
                </button>
              ))}
            </div>
          </div>
          <p className="muted hint">
            Your gear and level are copied in at the start; your real items stay free. Elixirs, meals and Phials don't come along.
          </p>
          <div className="row">
            <button className="btn primary deep-go" disabled={busy || empty} onClick={() => {
              setBusy(true);
              const p = conn.reducers.riftStart({ loadout: lo?.index ?? 0, tier });
              p.finally(() => setBusy(false));
              call(p);
            }}>
              <Icon name="sparkles" />
              {empty ? 'That loadout is empty' : busy ? 'Entering…' : `Enter alone at T${tier}`}
            </button>
            <button className="btn" disabled={busy || empty} onClick={() => call(conn.reducers.riftCreateParty({ loadout: lo?.index ?? 0, tier }))}>
              <Icon name="users" />Form a party
            </button>
          </div>
        </div>
        <OpenParties s={s} loadout={lo?.index ?? 0} tiers={tiers} empty={empty} />
        <FloorRewards tier={tier} week={week} paid={paid} />
      </section>
    </>
  );
}

/** Parties still forming, to join with loadout `loadout`. */
function OpenParties({ s, loadout, tiers, empty }: { s: Snapshot; loadout: number; tiers: number[]; empty: boolean }) {
  const conn = s.conn;
  const lobbies = [...conn.db.riftRun.iter()].filter(r => r.lobby);
  return (
    <div className="rift-open">
      <h3>Parties <span className="muted">2–{RIFT_PARTY_SIZE} players; the path is shared, everything else is your own</span></h3>
      {lobbies.length ? (
        <ul className="rift-party">
          {lobbies.map(r => {
            const members = byJoin([...conn.db.riftMember.runId.filter(r.id)]);
            const leader = members.find(m => m.characterId === r.leaderId);
            const full = members.length >= RIFT_PARTY_SIZE;
            const open = tiers.includes(r.tier);
            return (
              <li key={String(r.id)}>
                <span className="tag">T{r.tier}</span>
                <strong>{leader?.name ?? '?'}</strong>
                <span className="muted">{members.length} / {RIFT_PARTY_SIZE}{members.length > 1 ? ` · ${members.filter(m => m.characterId !== r.leaderId).map(m => m.name).join(', ')}` : ''}</span>
                <button className="btn small" disabled={full || !open || empty} title={!open ? `T${r.tier} isn't open to you yet` : undefined}
                  onClick={() => call(conn.reducers.riftJoin({ runId: r.id, loadout }))}>
                  {full ? 'Full' : 'Join'}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted hint">No party is forming. Form one, and others can join it from this page.</p>
      )}
    </div>
  );
}

/** A party forming: its members, the leader's Set off and kicks, Leave. */
function Lobby({ s, run }: { s: Snapshot; run: RiftRun }) {
  const conn = s.conn;
  const members = byJoin([...conn.db.riftMember.runId.filter(run.id)]);
  const leads = run.leaderId === s.row.id;
  const leader = members.find(m => m.characterId === run.leaderId);
  return (
    <section className="card rift-lobby">
      <CardHead title="Rift party">
        <span className="muted"><span className="tag">T{run.tier}</span> {members.length} / {RIFT_PARTY_SIZE}</span>
      </CardHead>
      <ul className="rift-party">
        {members.map(m => (
          <li key={String(m.characterId)} className={m.characterId === s.row.id ? 'me' : ''}>
            {m.characterId === run.leaderId ? <Icon name="crown" className="c-gold" /> : <Icon name="user" />}
            <strong>{m.name}</strong>
            <span className="muted">Lv {m.level}</span>
            {leads && m.characterId !== s.row.id && (
              <button className="btn small ghost" onClick={() => call(conn.reducers.riftKick({ characterId: m.characterId }))}>Kick</button>
            )}
          </li>
        ))}
      </ul>
      <p className="muted hint">
        Each loadout was locked when its owner joined. The leader picks the path and the bosses, and everyone fights every node together; boons,
        shops, events and Ethereal gear are your own. Enemy HP × {PARTY_HP[members.length - 1]} for {members.length === 1 ? 'one' : members.length}.
        Leaving the world leaves the party until it sets off.
      </p>
      <div className="row">
        {leads ? (
          <button className="btn primary" onClick={() => call(conn.reducers.riftSetOff({}))}><Icon name="sparkles" />Set off</button>
        ) : (
          <span className="muted">Waiting for {leader?.name ?? 'the leader'} to set off</span>
        )}
        <button className="btn ghost" onClick={() => call(conn.reducers.riftLeave({}))}>Leave the party</button>
      </div>
    </section>
  );
}

/** Each floor's weekly reward at `tier`, and the floors already paid this week. */
function FloorRewards({ tier, week, paid }: { tier: number; week: number; paid: ArrayLike<number> }) {
  return (
    <div className="deep-reward">
      <h3>This week <span className="muted">each floor pays once, at the tier of its first clear</span></h3>
      <ol className="rift-floors">
        {FLOOR_REWARDS.map((def, i) => {
          const r = floorReward(i + 1, tier, week);
          const riftstone = r.materials.find(([id]) => materialName(id) === 'Riftstone')?.[1];
          return (
            <li key={i} className={paid[i] ? 'paid' : ''}>
              <span className="rift-floor-n">Floor {i + 1}</span>
              {paid[i] ? (
                <span className="c-ok"><Icon name="star" />Paid at T{paid[i]}</span>
              ) : (
                <span className="muted">
                  {fmtBig(r.gold)} gold · {fmtBig(r.xp)} XP · {fmtBig(r.dust)} Dust · {def.hours} h of materials
                  {riftstone ? ` · ${riftstone} Riftstone` : ''}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** How the last run ended, with its final build. */
function RunOver({ log, onClose }: { log: RiftLog; onClose: () => void }) {
  const won = log.end === 'cleared';
  return (
    <section className={`card deep-replay ${won ? 'won' : 'lost'}`}>
      <div className={`raid-result deep-result ${won ? 'victory' : 'defeat'}`}>
        <div className="raid-result-title">{END_TEXT[log.end] ?? 'The run is over'}</div>
        <div className="raid-result-sub">Floor {log.floor} · {log.cleared} of {FLOORS} cleared · T{log.tier}</div>
      </div>
      {(log.gold > 0n || log.materials.length > 0) && (
        <div className="deep-gains">
          <span><Icon name="coins" className="c-gold" />{fmtBig(log.gold)} gold</span>
          {log.xp > 0n && <span><Icon name="star" className="c-ok" />{fmtBig(log.xp)} XP</span>}
          <span><Icon name="gem" className="c-dust" />{fmtBig(log.dust)} Dust</span>
          <span className="muted">{log.materials.map(m => `${m.count} ${materialName(m.materialId)}`).join(' · ')}</span>
        </div>
      )}
      <div className="row deep-replay-actions center">
        <BuildButton log={log} />
        <button className="btn" onClick={onClose}>Continue</button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- the run

function Run({ s, run }: { s: Snapshot; run: RiftRun }) {
  const conn = s.conn;
  const members = [...conn.db.riftMember.runId.filter(run.id)];
  const items = [...conn.db.myRiftItems.iter()].filter(i => i.runId === run.id);
  const state = useMemo(() => stateFromRows(run, members, items), [run, members.map(m => `${m.characterId}${m.pending}${m.hp}${m.motes}${m.ready}${m.downed}`).join(), items.length, items.map(i => String(i.id)).join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const me = state.members.find(m => m.characterId === s.row.id)!;
  const stats = useMemo(() => memberStats(state, me), [state, me]);
  // Another member's event fight is theirs to watch.
  const fights = (run.fights ? decodeRift<StoredFight[]>(run.fights) : []).filter(f => f.kind !== 'event' || f.characterId === s.row.id);
  const key = String(run.actedAt.microsSinceUnixEpoch);
  const [watched, setWatched] = useSticky<string>('riftWatched', '');
  const fresh = fights.length > 0 && watched !== key && nowMicros() - run.actedAt.microsSinceUnixEpoch < FRESH_MICROS;
  const [watching, setWatching] = useState(false);
  useEffect(() => {
    if (fresh) setWatching(true);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const choose = (choice: number, target?: number, theme?: number) =>
    call(conn.reducers.riftChoose({ choice, target: target ?? -1, theme: theme ?? 0 }));
  const check = (choice: number, target?: number, theme?: number) =>
    refusal(state, { type: 'choose', member: me.characterId, choice, ...(target !== undefined && { target }), ...(theme !== undefined && { theme }) });
  const ctx: ChoiceCtx = { s, state, me, stats, choose, check };
  const p = me.pending[0];
  const party = state.members.length > 1;
  const leadId = actingLeader(s, run, members);
  const waiting = state.members.filter(m => isOnline(s, m.characterId) && !isReady(state, m));
  const nameOf = (id: bigint) => members.find(m => m.characterId === id)?.name ?? '?';
  const moveNote = !party ? undefined : leadId !== s.row.id ? `${nameOf(leadId)} picks the path` :
    waiting.length ? `Waiting for ${waiting.map(m => (m.characterId === s.row.id ? 'you' : nameOf(m.characterId))).join(', ')}` : undefined;

  // While the fights replay, the bar shows the HP from before them, not their outcome.
  const before = watching ? fights.find(f => f.fighters.includes(me.characterId)) : undefined;
  const hpBefore = (before?.setup.sides[0][before.fighters.indexOf(me.characterId)] as PlayerSpec | undefined)?.start?.hp;

  return (
    <>
      <RunBar s={s} run={run} state={state} me={me} stats={stats} hpBefore={hpBefore} />
      {/* During a replay the party's bars are in it; the list would show the outcome. */}
      {party && !(watching && fights.length) && <PartyCard s={s} run={run} state={state} members={members} leadId={leadId} />}
      {watching && fights.length ? (
        <Replay s={s} run={run} fights={fights} onClose={() => {
          setWatched(key);
          setWatching(false);
        }} />
      ) : p ? (
        <Choice ctx={ctx} p={p} />
      ) : (
        <FloorMapCard s={s} state={state} me={me} canMove={leadId === s.row.id && !waiting.length} note={moveNote} />
      )}
      {!watching && fights.length > 0 && !p && (
        <div className="row rift-rewatch"><button className="btn small ghost" onClick={() => setWatching(true)}><Icon name="swords" />Watch the last fight again</button></div>
      )}
      <div className="rift-side">
        <BoonsCard me={me} />
        <LoadoutCard me={me} stats={stats} />
      </div>
    </>
  );
}

/** A party's members: HP, who leads, who is ready, choosing, down or offline; your Ready; the leader's kicks. */
function PartyCard({ s, run, state, members, leadId }: { s: Snapshot; run: RiftRun; state: RunState; members: readonly RiftMember[]; leadId: bigint }) {
  const conn = s.conn;
  const me = state.members.find(m => m.characterId === s.row.id)!;
  const leads = leadId === s.row.id;
  const now = nowMicros();
  const away = BigInt(RIFT_KICK_OFFLINE_MINUTES) * 60_000_000n;
  return (
    <section className="card rift-party-card">
      <CardHead title="Party">
        {!me.downed && !me.pending.length && (me.ready ? (
          <span className="tag c-ok">Ready</span>
        ) : (
          <button className="btn small primary" onClick={() => call(conn.reducers.riftReady({}))}>Ready</button>
        ))}
      </CardHead>
      <ul className="rift-party">
        {byJoin(members).map(row => {
          const m = state.members.find(x => x.characterId === row.characterId);
          if (!m) return null;
          const online = isOnline(s, row.characterId);
          const max = Math.max(1, row.maxHp);
          const status = m.downed ? 'Down' : !online ? 'Offline' : isReady(state, m) ? 'Ready' : m.pending.length ? 'Choosing' : 'Not ready';
          const kickable = leads && row.characterId !== s.row.id && !online && row.offlineSince > 0n && now - row.offlineSince >= away;
          return (
            <li key={String(row.characterId)} className={`${row.characterId === s.row.id ? 'me' : ''}${m.downed ? ' downed' : ''}`}>
              {row.characterId === leadId ? <Icon name="crown" className="c-gold" /> : <Icon name="user" />}
              <strong title={row.characterId === run.leaderId ? 'Leader' : row.characterId === leadId ? 'Leading while the leader is away' : undefined}>{row.name}</strong>
              <div className="hpbar rift-party-hp"><div className="hp-fill" style={{ width: `${Math.max(0, Math.min(1, m.hp / max)) * 100}%` }} /><span className="hp-text">{fmt(Math.max(0, m.hp))} / {fmt(max)}</span></div>
              <span className={`tag${status === 'Ready' ? ' c-ok' : status === 'Down' ? ' c-bad' : ''}`}>{status}</span>
              {kickable && <button className="btn small ghost" onClick={() => call(conn.reducers.riftKick({ characterId: row.characterId }))}>Kick</button>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The run's state at a glance: floor, tier, mutation, HP, Motes, and leaving. */
function RunBar({ s, run, state, me, stats, hpBefore }: { s: Snapshot; run: RiftRun; state: RunState; me: MemberState; stats: CombatStats; hpBefore?: number }) {
  const mutation = MUTATIONS_BY_ID.get(run.mutation);
  const [leaving, setLeaving] = useState(false);
  const hp = Math.max(0, Math.min(hpBefore ?? me.hp, stats.maxHp));
  return (
    <section className="card rift-bar">
      <div className="rift-bar-top">
        <strong>Floor {state.floor} / {FLOORS}</strong>
        <span className="tag">T{run.tier}</span>
        {mutation && <span className="tag rift-mutation" title={mutation.text}><Icon name="sparkles" />{mutation.name}</span>}
        <span className="chip stat" title="Motes: the run's currency, spent in shops"><Icon name="sparkles" className="c-rift" /><strong>{me.motes}</strong> Motes</span>
        {me.secondWind > 0 && <span className="tag c-ok" title="Second Wind is still there for this floor">Second Wind</span>}
        <button className="btn small ghost rift-leave" onClick={() => setLeaving(true)}>Leave</button>
      </div>
      <div className="hpbar rift-hp" title="HP carries over between nodes">
        <div className="hp-fill" style={{ width: `${(hp / stats.maxHp) * 100}%` }} />
        <span className="hp-text">{fmt(hp)} / {fmt(stats.maxHp)}</span>
      </div>
      {leaving && (
        <Modal onClose={() => setLeaving(false)} className="confirm-popup">
          <CardHead title="Leave the run?" />
          <p>The run ends. Floors you cleared stay paid; Motes and Ethereal items are lost.</p>
          <div className="row">
            <button className="btn danger" onClick={() => {
              setLeaving(false);
              call(s.conn.reducers.riftLeave({}));
            }}>Leave</button>
            <button className="btn" onClick={() => setLeaving(false)}>Stay</button>
          </div>
        </Modal>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- the map

function FloorMapCard({ s, state, me, canMove = true, note }: { s: Snapshot; state: RunState; me: MemberState; canMove?: boolean; note?: string }) {
  const conn = s.conn;
  const map = useMemo(() => floorMap(state.seed, state.floor), [state.seed, state.floor]);
  const open = reachable(state);
  const atBoss = state.row === ROWS - 1;
  const wrap = useRef<HTMLDivElement>(null);
  const nodes = useRef(new Map<string, HTMLButtonElement>());
  const links = useMapLinks(wrap, nodes, map, state);
  return (
    <section className="card rift-map-card">
      <CardHead title={`Floor ${state.floor}`}>
        <span className="muted">{note ?? (atBoss ? 'Pick the floor boss' : state.row < 0 ? 'Pick where to start' : 'Pick the next node')}</span>
      </CardHead>
      <div className="rift-map-wrap" ref={wrap}>
      <svg className="rift-links" aria-hidden="true">
        {links.map((l, i) => <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} className={l.cls} />)}
      </svg>
      <ol className="rift-map">
        {map.rows.map((row, r) => (
          <li key={r} className="rift-row">
            {row.map((node, c) => {
              const here = r === state.row && c === state.col;
              const next = r === state.row + 1 && open.includes(c);
              const past = r <= state.row && !here;
              const lineup = node.kind === 'fight' || node.kind === 'elite' ? nodeLineup(state.seed, state.floor, r, c, node.kind, state.mutation) : undefined;
              const title = [
                KIND_LABEL[node.kind],
                ...(lineup?.enemies.map((id, i) => `${enemyName(id)}${lineupSlot(lineup, i) === 'elite' ? ` (Elite: ${lineup.elite!.affixes.map(a => ELITE_AFFIXES_BY_ID.get(a)?.name).join(', ')})` : ''}`) ?? []),
                ...(node.event ? [EVENTS_BY_ID.get(node.event)?.name ?? ''] : []),
              ].join('\n');
              return (
                <button key={c} ref={el => { if (el) nodes.current.set(`${r}.${c}`, el); else nodes.current.delete(`${r}.${c}`); }}
                  className={`rift-node ${node.kind}${here ? ' here' : ''}${next ? ' next' : ''}${past ? ' past' : ''}`} title={title}
                  disabled={!next || !canMove} onClick={() => call(conn.reducers.riftMove({ node: c }))}>
                  <Icon name={KIND_ICON[node.kind]} />
                  <span>{node.kind === 'event' && next ? EVENTS_BY_ID.get(node.event!)?.name : KIND_LABEL[node.kind]}</span>
                </button>
              );
            })}
          </li>
        ))}
      </ol>
      </div>
      <Bosses s={s} state={state} me={me} open={atBoss && canMove} />
      <p className="muted hint">Fights: 1–3 enemies back to back on one HP bar, {Math.round(NODE_TIME_LIMIT / 60)}:00 for the node. HP carries over; no rest nodes.</p>
    </section>
  );
}

interface MapLink { x1: number; y1: number; x2: number; y2: number; cls: string }

/** The map's links, measured from the node buttons: from a node's bottom to the top of each node it leads to. */
function useMapLinks(wrap: RefObject<HTMLDivElement | null>, nodes: RefObject<Map<string, HTMLButtonElement>>, map: FloorMap, state: RunState): MapLink[] {
  const [links, setLinks] = useState<MapLink[]>([]);
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => {
      const box = el.getBoundingClientRect();
      const out: MapLink[] = [];
      map.rows.forEach((row, r) => row.forEach((node, c) => node.links.forEach(j => {
        const a = nodes.current.get(`${r}.${c}`)?.getBoundingClientRect();
        const b = nodes.current.get(`${r + 1}.${j}`)?.getBoundingClientRect();
        if (!a || !b) return;
        const cls = r === state.row && c === state.col ? 'open' : r < state.row ? 'past' : '';
        out.push({ x1: a.left + a.width / 2 - box.left, y1: a.bottom - box.top, x2: b.left + b.width / 2 - box.left, y2: b.top - box.top, cls });
      })));
      setLinks(out);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [wrap, nodes, map, state.row, state.col]);
  return links;
}

function Bosses({ s, state, me, open }: { s: Snapshot; state: RunState; me: MemberState; open: boolean }) {
  const options = bossOptions(state.seed, state.floor);
  const heart = options[0]?.enemyId === RIFT_HEART.id;
  const off = heart ? unravelled(state, me) : undefined;
  return (
    <div className="rift-bosses">
      <h3><Icon name="crown" />{heart ? 'The Rift Heart' : 'Floor boss'} <span className="muted">{heart ? '' : 'pick 1 of 2'}</span></h3>
      <div className="rift-boss-list">
        {options.map((o, i) => {
          const src = ENEMIES_BY_ID.get(o.enemyId);
          return (
            <button key={i} className="rift-boss" disabled={!open} onClick={() => call(s.conn.reducers.riftBoss({ option: i }))}>
              <EnemyArt enemyId={o.enemyId} className="rift-boss-art" fallback={<Icon name="skull" />} />
              <span className="rift-boss-info">
                <strong>{enemyName(o.enemyId)}</strong>
                <span className="muted">{heart ? 'Shifts damage type and defense every 15 s; Unravels one of your boons' : `Echo from ${src?.zone.name ?? 'the zones'}`}</span>
                {o.affixes.map(a => <span key={a} className="deep-affix"><strong>{ELITE_AFFIXES_BY_ID.get(a)?.name}</strong> {ELITE_AFFIXES_BY_ID.get(a)?.text}</span>)}
                {off !== undefined && <span className="c-bad">Unravels: {BOONS_BY_ID.get(off)?.name}</span>}
              </span>
            </button>
          );
        })}
      </div>
      {open && <p className="muted hint">Win: the floor is cleared (its weekly reward), an Ethereal item with an Echo, and you heal half your missing HP.</p>}
    </div>
  );
}

// ---------------------------------------------------------------- the replay

/** A replay clock at 1×, 2× or 4×, in microseconds of fight time. */
class ReplayClock {
  private realAt = performance.now();
  private at = 0;
  speed = 1;
  now = () => BigInt(Math.round(this.seconds() * 1e6));
  seconds = () => this.at + ((performance.now() - this.realAt) / 1000) * this.speed;
  setSpeed(x: number) {
    this.at = this.seconds();
    this.realAt = performance.now();
    this.speed = x;
  }
  jump(seconds: number) {
    this.at = seconds;
    this.realAt = performance.now();
  }
}

/** The last action's fights, played again on the fight stage, one after another. */
function Replay({ s, run, fights, onClose }: { s: Snapshot; run: RiftRun; fights: StoredFight[]; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const f = fights[index];
  const result = useMemo(() => replayFight(run.seed, f), [run.seed, f]);
  const seat = Math.max(0, f.fighters.indexOf(s.row.id));
  const parts = useMemo(() => fightParts(f.setup, result, seat), [f, result, seat]);
  const clock = useRef(new ReplayClock());
  const [t, setT] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [skipped, setSkipped] = useState(!parts);
  useEffect(() => {
    clock.current = new ReplayClock();
    clock.current.setSpeed(speed);
    setT(0);
    setSkipped(!parts);
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (skipped) return;
    const timer = window.setInterval(() => setT(clock.current.seconds()), 100);
    return () => window.clearInterval(timer);
  }, [skipped, index]);
  const live = !skipped && t < result.end;
  let k = 0;
  if (parts) while (k + 1 < parts.starts.length && parts.starts[k + 1] <= t) k++;
  const won = result.winner === 0;
  const title = f.kind === 'boss' ? 'Floor boss' : f.kind === 'event' ? 'Event fight' : 'Fight';

  return (
    <section className={`card deep-replay${live ? '' : won ? ' won' : ' lost'}`}>
      <CardHead title={title}>
        {fights.length > 1 && <span className="tag">{index + 1} / {fights.length}</span>}
        <span className="tag">{clockText(Math.max(0, f.setup.timeLimit - (live ? t : result.end)))}</span>
      </CardHead>
      {parts && (
        <ol className="deep-trail">
          {parts.foes.map((foe, i) => (
            <li key={i} className={i < k || (!live && i === k && won) ? 'done' : i === k ? 'now' : ''}>
              {(f.setup.sides[1][foe] as { def: { name: string } }).def.name}
            </li>
          ))}
        </ol>
      )}
      {parts && !skipped && <ReplayScene key={`${index}-${k}`} s={s} parts={parts} k={k} clock={clock.current} />}
      {f.fighters.length > 1 && <ReplayParty s={s} f={f} result={result} t={live ? t : Infinity} />}
      {live ? (
        <div className="row deep-replay-actions">
          <div className="seg">
            {[1, 2, 4].map(x => (
              <button key={x} className={`seg-btn${speed === x ? ' active' : ''}`} onClick={() => {
                clock.current.setSpeed(x);
                setSpeed(x);
              }}>{x}×</button>
            ))}
          </div>
          <button className="btn small ghost" onClick={() => setSkipped(true)}>Skip</button>
        </div>
      ) : (
        <>
          <div className={`raid-result deep-result ${won ? 'victory' : 'defeat'}`}>
            <div className="raid-result-title">{won ? (f.kind === 'boss' ? 'Floor cleared!' : 'Victory') : result.timedOut ? 'Out of time' : 'Defeat'}</div>
            <div className="raid-result-sub">{won ? `Won in ${clockText(result.end)}` : `At ${clockText(result.end)}`}</div>
          </div>
          <div className="row deep-replay-actions center">
            {index + 1 < fights.length ? (
              <button className="btn" onClick={() => setIndex(index + 1)}>Next fight</button>
            ) : (
              <button className="btn" onClick={onClose}>Continue</button>
            )}
          </div>
        </>
      )}
    </section>
  );
}

/** Every member's HP at replay time `t` (Infinity: the end), from the battle's events. */
function ReplayParty({ s, f, result, t }: { s: Snapshot; f: StoredFight; result: ReturnType<typeof replayFight>; t: number }) {
  let hp = f.setup.sides[0].map(c => (c as PlayerSpec).start?.hp ?? (c as PlayerSpec).stats.maxHp);
  if (t === Infinity) hp = result.hp.slice(0, hp.length);
  else for (const e of result.events) {
    if (e.t > t) break;
    hp = e.hp.slice(0, hp.length);
  }
  return (
    <ul className="rift-party rift-replay-party">
      {f.fighters.map((id, i) => {
        const max = result.maxHp[i] || 1;
        return (
          <li key={String(id)} className={id === s.row.id ? 'me' : ''}>
            <strong>{s.conn.db.riftMember.characterId.find(id)?.name ?? '?'}</strong>
            <div className="hpbar rift-party-hp"><div className="hp-fill" style={{ width: `${Math.max(0, Math.min(1, hp[i] / max)) * 100}%` }} /><span className="hp-text">{fmt(Math.max(0, hp[i]))} / {fmt(max)}</span></div>
          </li>
        );
      })}
    </ul>
  );
}

const clockText = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

const ReplayScene = memo(
  function ReplayScene({ s, parts, k, clock }: { s: Snapshot; parts: NonNullable<ReturnType<typeof fightParts>>; k: number; clock: ReplayClock }) {
    const fight = parts.fights[k];
    useEffect(() => {
      startFight({ startMicros: BigInt(Math.round(parts.starts[k] * 1e6)), fight }, () => undefined, () => undefined, { noRespawn: true, stalemate: 'Out of time', clock: clock.now });
      return stopFight;
    }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once per fight (keyed by the parent)
    return (
      <FightStage
        you={{ portrait: <Icon name="user" />, name: <>{s.row.name} <span className="muted">Lv {fight.stats.level}</span></> }}
        enemy={{ portrait: <EnemyArt enemyId={fight.enemy.id} fallback={<Icon name="skull" />} />, name: <>{fight.enemy.name} <span className="muted">Lv {fight.enemy.level}</span></> }}
      />
    );
  },
  () => true,
);

// ---------------------------------------------------------------- choices

interface ChoiceCtx {
  s: Snapshot;
  state: RunState;
  me: MemberState;
  stats: CombatStats;
  choose: (choice: number, target?: number, theme?: number) => void;
  /** Why a choice would be refused (undefined: it applies). */
  check: (choice: number, target?: number, theme?: number) => string | undefined;
}

function Choice({ ctx, p }: { ctx: ChoiceCtx; p: Pending }) {
  if (p.kind === 'gifts') return <Gifts ctx={ctx} p={p} />;
  if (p.kind === 'boons') return <BoonOffer ctx={ctx} choices={p.choices} />;
  if (p.kind === 'item') return <WearOrDiscard ctx={ctx} item={p.item} />;
  if (p.kind === 'items') return <VaultPick ctx={ctx} items={p.items} />;
  if (p.kind === 'shop') return <Shop ctx={ctx} p={p} />;
  return <EventCard ctx={ctx} p={p} />;
}

function ThemePicker({ value, onChange }: { value: number; onChange: (t: number) => void }) {
  return (
    <div className="seg rift-themes">
      {THEMES.map(t => (
        <button key={t.id} className={`seg-btn${value === t.id ? ' active' : ''}`} title={`${t.leansOn}. Sets: ${t.set3} / ${t.set5}`} onClick={() => onChange(t.id)}>{t.name}</button>
      ))}
    </div>
  );
}

function Gifts({ ctx, p }: { ctx: ChoiceCtx; p: Extract<Pending, { kind: 'gifts' }> }) {
  const [theme, setTheme] = useState<number>(THEMES[0].id);
  return (
    <section className="card rift-choice">
      <CardHead title="The Threshold"><span className="muted">Pick 1 of 3 gifts</span></CardHead>
      <div className="rift-cards">
        {p.gifts.map((g, i) => {
          const def = GIFTS_BY_ID.get(g.gift)!;
          return (
            <div key={i} className="rift-card gift">
              <strong>{def.name}</strong>
              <span className="muted">{def.text}</span>
              {g.boon && <BoonLine id={g.boon.id} rarity={g.boon.rarity} />}
              {g.curse && <span className="c-bad">Curse: {CURSES_BY_ID.get(g.curse)?.name} ({CURSES_BY_ID.get(g.curse)?.text})</span>}
              {g.item && <RiftItemCard it={g.item} />}
              {g.gift === Gift.MarkedPath && <ThemePicker value={theme} onChange={setTheme} />}
              <button className="btn primary" onClick={() => ctx.choose(i, undefined, theme)}>Take</button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function BoonLine({ id, rarity, upgrade }: { id: number; rarity: number; upgrade?: boolean }) {
  const def = BOONS_BY_ID.get(id)!;
  return (
    <span className={`rift-boon r${rarity}`} title={boonText(def, rarity as 0)}>
      <strong>{def.name}</strong> <span className="muted">{BOON_RARITIES[rarity]}{upgrade ? ' · upgrade' : ''}{def.keystone ? ' · keystone' : ''}</span>
      <span className="rift-boon-text">{boonText(def, rarity as 0)}</span>
    </span>
  );
}

function BoonOffer({ ctx, choices }: { ctx: ChoiceCtx; choices: BoonChoice[] }) {
  return (
    <section className="card rift-choice">
      <CardHead title="Pick a boon">
        <button className="btn small ghost" onClick={() => ctx.choose(SKIP)}>Take none</button>
      </CardHead>
      <div className="rift-cards">
        {choices.map((c, i) => {
          const def = BOONS_BY_ID.get(c.id)!;
          return (
            <button key={i} className={`rift-card boon r${c.rarity}`} onClick={() => ctx.choose(i)}>
              <span className="rift-card-theme">{def.theme ? themeName(def.theme) : 'Any theme'}</span>
              <strong>{def.name}</strong>
              <span className="muted">{BOON_RARITIES[c.rarity]}{c.upgrade ? ' · upgrade' : ''}{def.keystone ? ' · keystone' : ''}</span>
              <span>{boonText(def, c.rarity)}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** An item from the Rift, with its headlines. */
function RiftItemCard({ it }: { it: RiftItem }) {
  return (
    <div className="rift-item">
      <ItemCard it={asItem(it)!} compact note={it.headlines ? 'Rift only' : 'Locked copy'} extra={it.headlines && <HeadlineBlocks h={it.headlines} />} />
    </div>
  );
}

/** An Ethereal item's headlines, as effect blocks inside its card (like a legendary's). */
function HeadlineBlocks({ h }: { h: Headlines }) {
  const lines: { name: string; text?: string; sub?: { name: string; text: string; unique: boolean }[] }[] = [];
  if (h.riftEffect) {
    const e = RIFT_EFFECTS_BY_ID.get(h.riftEffect);
    if (e) lines.push({ name: e.name, text: e.text });
  }
  if (h.mark) lines.push({ name: `${themeName(h.mark)}-marked`, text: `Counts as a ${themeName(h.mark)} boon for set bonuses` });
  if (h.growth) lines.push({ name: 'Growth', text: 'Each floor boss cleared while worn raises its affixes one tier' });
  for (const t of h.trophies ?? []) {
    const def = TROPHIES_BY_ID.get(t);
    if (def) lines.push({ name: `${def.name} Trophy`, text: def.text });
  }
  if (h.echo) {
    const u = UNIQUES_BY_ID.get(h.echo);
    if (u) {
      lines.push({
        name: `Echo of ${u.name}`,
        // Coloured as on any item: legendary effects (orange) and unique-only ones (magenta).
        sub: u.effects.flatMap(id => {
          const e = EFFECTS_BY_ID.get(id);
          return e ? [{ name: e.name, text: e.text, unique: !LEGENDARIES_BY_ID.has(id) }] : [];
        }),
      });
    }
  }
  return (
    <>
      {lines.map(l => (
        <div key={l.name} className="item-legendary ethereal">
          <strong><Icon name="sparkles" />{l.name}</strong>
          {l.text && <span>{l.text}</span>}
          {l.sub?.map(x => <span key={x.name} className={`ethereal-sub${x.unique ? ' unique' : ''}`}><strong>{x.name}</strong> {x.text}</span>)}
        </div>
      ))}
    </>
  );
}

/** A few stats before and after wearing an item. */
function StatDelta({ before, after }: { before: CombatStats; after: CombatStats }) {
  const hit = (x: CombatStats) => (x.sources[0] ? (x.sources[0].hit.Physical + x.sources[0].hit.Magic) * x.sources[0].attacksPerSec * x.sources[0].critMult : 0);
  const rows: [string, number, number][] = [
    ['Damage / s (before defenses)', hit(before), hit(after)],
    ['Max HP', before.maxHp, after.maxHp],
    ['Armor', before.armor, after.armor],
    ['Resistance', before.resistance, after.resistance],
    ['Evasion rating', before.evasionRating, after.evasionRating],
  ];
  return (
    <table className="rift-delta">
      <tbody>
        {rows.filter(([, a, b]) => Math.abs(a - b) > 0.05).map(([label, a, b]) => (
          <tr key={label}>
            <td>{label}</td>
            <td className="muted">{fmt(a)}</td>
            <td className={b > a ? 'c-ok' : 'c-bad'}>{fmt(b)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function WearOrDiscard({ ctx, item }: { ctx: ChoiceCtx; item: EtherealItem }) {
  const rings = base(item.baseId).slots.length > 1;
  const slots = rings ? [6, 7] : [undefined];
  const [ring, setRing] = useState<number | undefined>(rings ? (ctx.me.gear[6] ? (ctx.me.gear[7] ? 6 : 7) : 6) : undefined);
  const plan = wearPlan(ctx.me, item, ring);
  const after = useMemo(() => {
    if (typeof plan === 'string') return undefined;
    try {
      const next = apply(ctx.state, { type: 'choose', member: ctx.me.characterId, choice: WEAR, ...(ring !== undefined && { target: ring }) }).state;
      return memberStats(next, next.members.find(m => m.characterId === ctx.me.characterId)!);
    } catch {
      return undefined;
    }
  }, [ctx.state, ring]); // eslint-disable-line react-hooks/exhaustive-deps
  const overrides = overrideWarnings(ctx.stats, item);
  return (
    <section className="card rift-choice">
      <CardHead title="Wear or discard"><span className="muted">Wearing replaces for good; nothing is kept</span></CardHead>
      <div className="rift-wear">
        <RiftItemCard it={item} />
        <div className="rift-wear-side">
          {rings && (
            <div className="seg">
              {slots.map(r => <button key={r} className={`seg-btn${ring === r ? ' active' : ''}`} onClick={() => setRing(r)}>{SLOT_LABEL[r!]}</button>)}
            </div>
          )}
          {typeof plan === 'string' ? (
            <p className="c-bad">{plan}</p>
          ) : (
            <>
              {plan.discards.map(sl => ctx.me.gear[sl] && <p key={sl} className="muted">Replaces your {itemName(asItem(ctx.me.gear[sl])!)} ({SLOT_LABEL[sl]})</p>)}
              {overrides.map(w => <p key={w} className="c-bad">{w}</p>)}
              {after && <StatDelta before={ctx.stats} after={after} />}
            </>
          )}
          <div className="row">
            <button className="btn primary" disabled={typeof plan === 'string'} onClick={() => ctx.choose(WEAR, ring)}>Wear</button>
            <button className="btn" onClick={() => ctx.choose(DISCARD)}>Discard</button>
          </div>
        </div>
      </div>
    </section>
  );
}

/** "Overrides your …" warnings for a rift effect that cancels something you have (shifting-rift.md, "When effects meet"). */
function overrideWarnings(s: CombatStats, item: EtherealItem): string[] {
  const e = item.headlines.riftEffect;
  const out: string[] = [];
  const has = (id: number) => s.effects.has(id);
  if (e === RiftEffect.Voidheart) {
    if (has(Effect.Spellblade)) out.push('Overrides your Spellblade (all damage becomes magic)');
    if (has(Effect.Moonlight)) out.push("Overrides Moonlight's conversion (its double hit stays)");
  }
  if (e === RiftEffect.Bloodbound) {
    if (has(Effect.FrozenBlood)) out.push('Frozen Blood still stops your lifesteal');
    if (has(Effect.Bloodthirst)) out.push('Overrides your Bloodthirst (no cap left to raise)');
    if (s.regen > 0) out.push('Your regen becomes 0');
  }
  return out;
}

function VaultPick({ ctx, items }: { ctx: ChoiceCtx; items: EtherealItem[] }) {
  return (
    <section className="card rift-choice">
      <CardHead title="Thane's Vault"><span className="muted">Pick 1 of 3</span></CardHead>
      <div className="rift-cards">
        {items.map((it, i) => (
          <div key={i} className="rift-card">
            <RiftItemCard it={it} />
            <button className="btn primary" onClick={() => ctx.choose(i)}>Take</button>
          </div>
        ))}
      </div>
    </section>
  );
}

/** What a choice can be aimed at: worn Ethereal items, held boons, curses. */
function targetOptions(me: MemberState): { value: number; label: string }[] {
  return [
    ...me.gear.flatMap((it, i) => (it?.headlines ? [{ value: i, label: `${SLOT_LABEL[i]}: ${itemName(asItem(it)!)}` }] : [])),
    ...me.boons.map(b => ({ value: b.id, label: `${BOONS_BY_ID.get(b.id)?.name} (${BOON_RARITIES[b.rarity]})` })),
    ...me.curses.map(c => ({ value: c, label: `Curse: ${CURSES_BY_ID.get(c)?.name}` })),
  ];
}

/** A choice button that may need a target: the targets it applies to, else greyed out with why. */
function TargetedChoice({ ctx, choice, label, cls = '', theme }: { ctx: ChoiceCtx; choice: number; label: string; cls?: string; theme?: number }) {
  const plain = ctx.check(choice, undefined, theme);
  const targets = plain === undefined ? [] : targetOptions(ctx.me).filter(t => ctx.check(choice, t.value, theme) === undefined);
  const [target, setTarget] = useState<number>();
  const chosen = targets.find(t => t.value === target) ?? targets[0];
  const why = plain !== undefined && !targets.length ? plain : undefined;
  return (
    <div className={`rift-choice-row ${cls}`}>
      <button className="btn" disabled={!!why} title={why} onClick={() => ctx.choose(choice, plain === undefined ? undefined : chosen?.value, theme)}>{label}</button>
      {plain !== undefined && targets.length > 0 && (
        <select value={chosen?.value} onChange={e => setTarget(Number(e.target.value))}>
          {targets.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      )}
      {why && <span className="muted">{why}</span>}
    </div>
  );
}

function Shop({ ctx, p }: { ctx: ChoiceCtx; p: Extract<Pending, { kind: 'shop' }> }) {
  const offerText = (o: (typeof p.stock)[number]) => {
    if (o.kind === 'boon') return `${BOONS_BY_ID.get(o.boon.id)?.name} (${BOON_RARITIES[o.boon.rarity]}): ${boonText(BOONS_BY_ID.get(o.boon.id)!, o.boon.rarity)}`;
    if (o.kind === 'upgrade') return `Upgrade ${BOONS_BY_ID.get(o.boonId)?.name} one rarity`;
    if (o.kind === 'item') return `${itemName(asItem(o.item)!)} (Ethereal, ${headlineCount(o.item.headlines)} headline${headlineCount(o.item.headlines) === 1 ? '' : 's'})`;
    if (o.kind === 'heal') return 'Heal 30% of max HP';
    if (o.kind === 'attune') return 'Attune an Ethereal item: every affix one tier higher';
    if (o.kind === 'removeCurse') return 'Remove a curse';
    return 'Remove a boon';
  };
  const reroll = rerollCost(ctx.state, ctx.me, p.rerolls);
  return (
    <section className="card rift-choice">
      <CardHead title="Shop"><span className="chip stat"><Icon name="sparkles" className="c-rift" /><strong>{ctx.me.motes}</strong> Motes</span></CardHead>
      <ul className="rift-shop">
        {p.stock.map((o, i) => (
          <li key={i} className={p.sold[i] ? 'sold' : ''}>
            <span className="rift-price">{p.sold[i] ? 'Sold' : o.price ? `${o.price}` : 'Free'}</span>
            <span className="rift-offer">{offerText(o)}{o.kind === 'item' && <span className="rift-shop-headlines"><HeadlineBlocks h={o.item.headlines} /></span>}</span>
            {!p.sold[i] && <TargetedChoice ctx={ctx} choice={i} label="Buy" />}
          </li>
        ))}
      </ul>
      <div className="row">
        <button className="btn" disabled={reroll > ctx.me.motes} onClick={() => ctx.choose(SHOP_REROLL)}>Reroll ({reroll})</button>
        <button className="btn primary" onClick={() => ctx.choose(SHOP_LEAVE)}>Leave the shop</button>
      </div>
    </section>
  );
}

function EventCard({ ctx, p }: { ctx: ChoiceCtx; p: Extract<Pending, { kind: 'event' }> }) {
  const def = EVENTS_BY_ID.get(p.event)!;
  const [theme, setTheme] = useState<number>(THEMES[0].id);
  const needsTheme = p.event === 20;
  return (
    <section className="card rift-choice">
      <CardHead title={def.name}><span className="muted">Event</span></CardHead>
      {needsTheme && <ThemePicker value={theme} onChange={setTheme} />}
      <div className="rift-event">
        {def.choices.map((text, i) => (p.used.includes(i) ? (
          <div key={i} className="rift-choice-row"><button className="btn" disabled>{text}</button><span className="muted">Done</span></div>
        ) : (
          <TargetedChoice key={i} ctx={ctx} choice={i} label={text} theme={needsTheme ? theme : undefined} cls={text === 'Leave' || text === 'Sneak past' ? 'leave' : ''} />
        )))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- boons and the loadout

function BoonsCard({ me }: { me: MemberState }) {
  const counts = themeCounts(me.boons, memberMarks(me));
  const wild = me.boons.some(b => BOONS_BY_ID.get(b.id)?.theme === 0) ? 1 : 0;
  return (
    <section className="card rift-boons">
      <CardHead title="Boons"><span className="muted">{me.boons.length} held</span></CardHead>
      <div className="rift-sets">
        {THEMES.map(t => {
          const n = (counts.get(t.id) ?? 0) + wild;
          if (!n) return null;
          return (
            <span key={t.id} className={`tag${n >= SET_AT[0] ? ' c-ok' : ''}`} title={`${t.set3} (3) · ${t.set5} (5)`}>
              {t.name} {n}/{n >= SET_AT[0] ? SET_AT[1] : SET_AT[0]}
            </span>
          );
        })}
      </div>
      {me.boons.length ? (
        <div className="rift-boon-list">
          {me.boons.map(b => <BoonLine key={b.id} id={b.id} rarity={b.rarity} />)}
        </div>
      ) : (
        <p className="muted">None yet: win a fight to pick one.</p>
      )}
      {me.curses.length > 0 && (
        <div className="rift-curses">
          {me.curses.map(c => <span key={c} className="tag c-bad" title={CURSES_BY_ID.get(c)?.text}>{CURSES_BY_ID.get(c)?.name}: {CURSES_BY_ID.get(c)?.text}</span>)}
        </div>
      )}
    </section>
  );
}

function LoadoutCard({ me, stats }: { me: MemberState; stats: CombatStats }) {
  const [open, setOpen] = useState<number>();
  const gear = me.gear.map(asItem);
  const opened = open !== undefined ? me.gear[open] : undefined;
  return (
    <section className="card rift-loadout">
      <CardHead title="Rift loadout"><span className="muted">Level {me.level}, locked</span></CardHead>
      <div className="equip-slots">
        {SLOT_GRID.map(i => <SlotCell key={i} gear={gear} i={i} selected={open === i} onOpen={() => setOpen(open === i ? undefined : i)} />)}
      </div>
      {opened && <RiftItemCard it={opened} />}
      <EffectsCard effects={new Map([...stats.effects].filter(([id]) => id < 200))} />
    </section>
  );
}

// ---------------------------------------------------------------- history and the Codex

function BuildButton({ log }: { log: RiftLog }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn" onClick={() => setOpen(true)}>View build</button>
      {open && <BuildPopup log={log} onClose={() => setOpen(false)} />}
    </>
  );
}

/** A finished run's final Rift loadout and boons. */
function BuildPopup({ log, onClose }: { log: RiftLog; onClose: () => void }) {
  const [openSlot, setOpenSlot] = useState<number>();
  const gear = useMemo(() => decodeBuild<RiftItem>(log.build), [log.build]);
  const items = gear.map(asItem);
  const stats = useMemo(() => combatStats(log.level, items), [items, log.level]);
  const opened = openSlot !== undefined ? gear[openSlot] : undefined;
  return (
    <Modal onClose={onClose} className="item-popup inspect-popup">
      <CardHead title={`T${log.tier} run · floor ${log.floor} · Lv ${log.level}`}>
        <button className="btn" onClick={onClose}><Icon name="x" />Close</button>
      </CardHead>
      <p className="muted">{END_TEXT[log.end] ?? ''} · {log.cleared} of {FLOORS} floors cleared</p>
      <div className="equip-layout">
        <div className="card equip-slots">
          {SLOT_GRID.map(i => <SlotCell key={i} gear={items} i={i} selected={openSlot === i} onOpen={() => setOpenSlot(openSlot === i ? undefined : i)} />)}
        </div>
        <StatBoard sheet={statSheet(log.level, items, stats)} className="stat-board" />
      </div>
      {opened && <RiftItemCard it={opened} />}
      <div className="rift-boon-list">
        {log.boons.map(b => <BoonLine key={b.id} id={b.id} rarity={b.rarity} />)}
      </div>
    </Modal>
  );
}

function History({ s }: { s: Snapshot }) {
  const logs = [...s.conn.db.myRiftLog.iter()].sort((a, b) => (a.id < b.id ? 1 : -1));
  if (!logs.length) return null;
  return (
    <section className="card rift-history">
      <CardHead title="Run history" />
      <ol className="rift-runs">
        {logs.map(l => (
          <li key={String(l.id)}>
            <span className="muted">{new Date(Number(l.endedAt.microsSinceUnixEpoch / 1000n)).toLocaleDateString()}</span>
            <span className="tag">T{l.tier}</span>
            <span>{MUTATIONS_BY_ID.get(l.mutation)?.name}</span>
            <strong>{l.cleared}/{FLOORS}</strong>
            <span className="muted">{END_TEXT[l.end] ?? l.end}</span>
            <span className="muted">{l.boons.length} boons</span>
            <BuildButton log={l} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function Codex({ s }: { s: Snapshot }) {
  const rows = [...s.conn.db.myRiftCodex.iter()];
  if (!rows.length) return null;
  const of = (kind: number) => rows.filter(r => r.kind === kind).map(r => r.entryId);
  const boons = of(1).map(id => BOONS_BY_ID.get(id)).filter(Boolean) as BoonDef[];
  const effects = of(3).map(id => RIFT_EFFECTS_BY_ID.get(id)).filter(Boolean);
  const bases = of(2);
  return (
    <section className="card rift-codex">
      <CardHead title="Rift Codex"><span className="muted">What you've seen in the Rift</span></CardHead>
      <h3>Boons <span className="muted">{boons.length} / {BOONS_BY_ID.size}</span></h3>
      <div className="rift-chips">{boons.sort((a, b) => a.id - b.id).map(b => <span key={b.id} className="tag" title={boonText(b)}>{boonLabel(b)}</span>)}</div>
      <h3>Rift effects <span className="muted">{effects.length} / {RIFT_EFFECTS.length}</span></h3>
      <div className="rift-chips">{effects.map(e => <span key={e!.id} className="tag c-rift" title={e!.text}>{e!.name}</span>)}</div>
      <h3>Ethereal bases <span className="muted">{bases.length}</span></h3>
      <div className="rift-chips">{bases.map(id => <span key={id} className="tag">{base(id).name(5)}</span>)}</div>
    </section>
  );
}
