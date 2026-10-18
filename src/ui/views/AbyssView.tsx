// The Moonwell Deep (docs/design/abyss.md): the next depth's line-up, your odds with a
// chosen loadout, the attempt replayed from the log row (abyss.ts), and the leaderboard.
// Solo and online only.

import { memo, useEffect, useMemo, useState } from 'react';
import type { AbyssLog, AbyssRecord, Item } from '../../module_bindings/types';
import { combatStats, type CombatStats } from '../../../spacetimedb/src/combat';
import {
  ABYSS_SEASON, ABYSS_UNLOCK_RAID, BOSS_AFFIXES_BY_ID, DEPTH_TIME_LIMIT, ELITE_AFFIXES_BY_ID, ABYSS_KINDS_BY_ID, DEEP_WARDEN, FAST_FROM,
  SECOND_BOSS_AFFIX_FROM, depthLineup, depthReward, depthTier, wardenArtId,
} from '../../../spacetimedb/src/data/abyss';
import { RAIDS_BY_ID } from '../../../spacetimedb/src/data/raids';
import { SUPPLIES_BY_ID, elixirBuffs } from '../../../spacetimedb/src/data/supplies';
import { decodeBuild, decodeStats, depthFoes, depthOdds, depthRng, simulateDepth, type DepthFoe } from '../../../spacetimedb/src/abyss';
import type { FightEvent } from '../../../spacetimedb/src/sim';
import { call, useSticky, useTick } from '../../store';
import { nowMicros } from '../clock';
import { DefTag, DmgTag } from '../enemy';
import { EnemyArt } from '../enemyArt';
import { duration, fmt, fmtBig, pct } from '../format';
import { Icon } from '../Icon';
import { ItemCard, materialName } from '../items';
import { CardHead, EffectsCard, Modal, StatBoard, ViewHeader } from '../shared';
import { gearFor, type Snapshot } from '../snapshot';
import { statSheet } from '../statSheet';
import { SLOT_GRID, SlotCell } from './EquipmentView';

/** "1:32". */
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
/** Seconds the Descend button waits after a loss (client only, abyss.md "Cost"). */
const LOSS_WAIT = 10;
/** Leaderboard rows shown on the Global tab. */
const BOARD_SIZE = 100;
const SLOT_LABEL = { basic: 'Basic', elite: 'Elite', boss: 'Boss' } as const;

/** Newest first. */
const byNewest = (a: AbyssLog, b: AbyssLog) => (a.id < b.id ? 1 : -1);

/** The sprite of a depth enemy: the Deep Warden's look follows its first Boss affix. */
function FoeArt({ foe, className }: { foe: DepthFoe; className?: string }) {
  const glyph = <Icon name={foe.slot === 'boss' ? 'skull' : 'moon'} className={`deep-foe-glyph ${foe.slot}`} />;
  if (foe.slot !== 'boss') return <EnemyArt enemyId={foe.kindId} className={className} fallback={glyph} />;
  return <EnemyArt enemyId={wardenArtId(foe.affixes[0])} className={className} fallback={<EnemyArt enemyId={DEEP_WARDEN.id} className={className} fallback={glyph} />} />;
}

export const AbyssView = memo(function AbyssView({ s }: { s: Snapshot }) {
  const conn = s.conn;
  const raid = RAIDS_BY_ID.get(ABYSS_UNLOCK_RAID)!;
  const unlocked = (s.kills.get(raid.boss.id) ?? 0) > 0 || [...conn.db.myRaidLog.iter()].some(l => l.raidId === raid.id && l.won);
  const record = [...conn.db.abyssRecord.iter()].find(r => r.characterId === s.row.id && r.season === ABYSS_SEASON);
  const deepest = record?.deepest ?? 0;

  return (
    <>
      <ViewHeader title="Moonwell Deep" icon="moon">
        <span className="chip stat" title="Deepest depth cleared this season">
          <Icon name="moon" className="c-magic" />
          Deepest <strong>{deepest}</strong>
        </span>
      </ViewHeader>
      <p className="muted deep-blurb">
        Below Selvara's moonwell, the dark the moon fell through has no bottom. Each depth is a basic enemy, an Elite and the Deep Warden,
        fought back to back on one HP bar. Clear it to go deeper. Solo, online only; farming carries on meanwhile.
      </p>
      {!unlocked ? (
        <div className="lock-note"><Icon name="lock" />Defeat {raid.boss.name} in {raid.name} to open the Moonwell Deep</div>
      ) : (
        <Descent s={s} depth={deepest + 1} />
      )}
      <Leaderboard s={s} />
    </>
  );
});

/** The next depth: line-up, loadout, odds, rewards, the attempt and its replay, and recent attempts. */
function Descent({ s, depth }: { s: Snapshot; depth: number }) {
  const conn = s.conn;
  const [loadout, setLoadout] = useSticky<number>('deepLoadout', s.row.activeLoadout);
  const lo = s.loadouts.find(l => l.index === loadout) ?? s.active;
  const gear = gearFor(lo?.slots ?? [], s.items);
  // As the server takes it: your level, the loadout, the active elixir at the depth's tier.
  const buffs = s.elixir && elixirBuffs(s.elixir.supply.id, Math.floor(depthTier(depth)));
  const stats = useMemo(() => combatStats(s.level, gear, buffs), [s.level, gear.map(i => String(i?.id ?? 0n)).join(), buffs?.damage, buffs?.attackSpeed]); // eslint-disable-line react-hooks/exhaustive-deps
  const lineup = depthLineup(depth);
  const foes = useMemo(() => depthFoes(stats, lineup), [stats, depth]); // eslint-disable-line react-hooks/exhaustive-deps
  const odds = useMemo(() => depthOdds(stats, depth), [stats, depth]);
  const reward = depthReward(depth);

  const logs = [...conn.db.myAbyssLog.iter()].sort(byNewest);
  const latest = logs[0];
  const [watching, setWatching] = useState<bigint>();
  const [pending, setPending] = useState(false);
  // The view redraws on server changes only: tick for the wait after a loss.
  useTick(1000);
  const now = nowMicros();
  // A new attempt (just started) plays at once.
  useEffect(() => {
    if (latest && now - latest.startedAt.microsSinceUnixEpoch < 5_000_000n) setWatching(latest.id);
    setPending(false);
  }, [latest?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = logs.find(l => l.id === watching);
  // Attempts whose replay has reached its result (skipped or played out): until then the outcome stays hidden.
  const [ended, setEnded] = useState<{ id: bigint; at: bigint }[]>([]);
  const endedAt = (id: bigint) => ended.find(e => e.id === id)?.at;
  const latestLength = useMemo(() => (latest && !latest.won ? replayLength(latest) : 0), [latest?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // The wait runs from when the loss was seen: its replay's result, or (not watched here) when the replay would have ended.
  const lossSeen = latest && !latest.won && (endedAt(latest.id) ?? latest.startedAt.microsSinceUnixEpoch + BigInt(Math.ceil(latestLength * 1e6)));
  const waitLeft = lossSeen ? LOSS_WAIT - Number(now - lossSeen) / 1e6 : 0;
  const hidden = (l: AbyssLog) => l.id === watching && endedAt(l.id) === undefined;
  const empty = !gear.some(Boolean);
  const block = pending ? 'Descending…' : shown ? undefined : empty ? 'That loadout is empty' : waitLeft > 0 ? `Catch your breath: ${Math.ceil(waitLeft)} s` : undefined;

  return (
    <>
      {shown ? (
        <DepthReplay key={String(shown.id)} s={s} log={shown} onClose={() => setWatching(undefined)}
          onEnd={() => endedAt(shown.id) === undefined && setEnded(e => [...e, { id: shown.id, at: nowMicros() }])} />
      ) : (
        <section className="card deep-next">
          <CardHead title={`Depth ${depth}`}>
            <span className="tag" title="The zone tier this depth is as strong as">Like T{Math.floor(depthTier(depth))}</span>
            {depth >= FAST_FROM && <span className="tag c-bad" title="Past depth 100 enemies grow faster">Fast growth</span>}
          </CardHead>
          <ol className="deep-lineup">
            {foes.map(f => <FoeCard key={f.slot} foe={f} />)}
          </ol>
          <p className="muted hint">
            One HP bar for all three: no heal between them. {clock(DEPTH_TIME_LIMIT)} for the depth.
            {depth < SECOND_BOSS_AFFIX_FROM ? ` From depth ${SECOND_BOSS_AFFIX_FROM} the Deep Warden has two affixes.` : ''}
          </p>

          <div className="deep-launch">
            <div className="deep-loadouts">
              <span className="muted">Fight with</span>
              <div className="seg">
                {s.loadouts.map(l => (
                  <button key={l.index} className={`seg-btn${l.index === lo?.index ? ' active' : ''}`} onClick={() => setLoadout(l.index)}
                    title={l.index === s.row.activeLoadout ? 'Your farming loadout' : undefined}>
                    {l.name || `Loadout ${l.index + 1}`}
                  </button>
                ))}
              </div>
            </div>
            <div className="deep-facts">
              <div title="The share of 200 depths with these stats you would win (Scout)">
                <span>Your odds</span>
                <strong className={odds >= 0.8 ? 'c-ok' : odds >= 0.4 ? '' : 'c-bad'}>{pct(odds)}</strong>
              </div>
              <div><span>HP</span><strong>{fmt(stats.maxHp)}</strong></div>
              {s.elixir && <div title="Your elixir applies to every fight and uses a charge per kill"><span>Elixir</span><strong>{s.elixir.supply.name}</strong></div>}
            </div>
            <button className="btn primary deep-go" disabled={!!block} onClick={() => {
              setPending(true);
              const p = conn.reducers.descend({ loadout: lo?.index ?? 0 });
              p.catch(() => setPending(false));
              call(p);
            }}>
              <Icon name="moon" />
              {block ?? `Descend to depth ${depth}`}
            </button>
          </div>

          <div className="deep-reward">
            <h3>First clear <span className="muted">once per depth</span></h3>
            <RewardLine gold={reward.gold} xp={reward.xp} dust={reward.dust} materials={reward.materials} elixir={reward.elixir ?? 0} />
          </div>
        </section>
      )}
      {logs.length > 0 && (
        <section className="card deep-attempts">
          <CardHead title="Recent attempts" />
          <ul>
            {logs.slice(0, 8).map(l => (
              <li key={String(l.id)}>
                {hidden(l) ? <span className="muted">Fighting…</span> : <span className={l.won ? 'c-ok' : 'c-bad'}>{l.won ? 'Cleared' : l.timedOut ? 'Out of time' : 'Fell'}</span>}
                <span>Depth {l.depth}</span>
                <span className="muted">{duration(now - l.startedAt.microsSinceUnixEpoch)} ago</span>
                <button className="btn small ghost" onClick={() => setWatching(l.id)}>Watch</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

/** Seconds an attempt's replay lasts. */
function replayLength(log: AbyssLog): number {
  return simulateDepth(decodeStats(log.stats), log.depth, depthRng(log.characterId, log.startedAt.microsSinceUnixEpoch), log.season).end;
}

function FoeCard({ foe }: { foe: DepthFoe }) {
  const e = foe.enemy;
  const kind = ABYSS_KINDS_BY_ID.get(foe.kindId);
  const affixes = foe.affixes.map(a => (foe.slot === 'boss' ? BOSS_AFFIXES_BY_ID : ELITE_AFFIXES_BY_ID).get(a)!);
  return (
    <li className={`deep-foe ${foe.slot}`}>
      <div className="deep-foe-art"><FoeArt foe={foe} className="deep-foe-sprite" /></div>
      <div className="deep-foe-info">
        <div className="deep-foe-slot">{SLOT_LABEL[foe.slot]}</div>
        <div className="deep-foe-name">{e.name}</div>
        <div className="tags">
          <span className="tag">Lv {e.level}</span>
          <DmgTag magic={e.damageType === 'Magic'} />
          <DefTag defense={e.defense} />
        </div>
        <div className="deep-foe-stats muted">HP {fmt(e.hp)} · DPS {fmt(e.dps)}</div>
        {kind && <div className="deep-foe-twist muted">{kind.twist}</div>}
        {affixes.map(a => (
          <div key={a.id} className="deep-affix"><strong>{a.name}</strong> {a.text}</div>
        ))}
      </div>
    </li>
  );
}

function RewardLine({ gold, xp, dust, materials, elixir }: { gold: bigint; xp: bigint; dust: bigint; materials: readonly (readonly [number, number])[] | readonly { materialId: number; count: number }[]; elixir: number }) {
  const mats = materials.map(m => (Array.isArray(m) ? { materialId: m[0], count: m[1] } : (m as { materialId: number; count: number })));
  const supply = SUPPLIES_BY_ID.get(elixir);
  return (
    <div className="deep-gains">
      <span><Icon name="coins" className="c-gold" />{fmtBig(gold)} gold</span>
      {xp > 0n && <span><Icon name="star" className="c-ok" />{fmtBig(xp)} XP</span>}
      <span><Icon name="gem" className="c-dust" />{fmtBig(dust)} Dust</span>
      {supply && <span><Icon name="flask" className="c-magic" />{supply.name} (T{supply.tier})</span>}
      <span className="muted">{mats.map(m => `${m.count} ${materialName(m.materialId)}`).join(' · ')}</span>
    </div>
  );
}

/** One attempt replayed in real time from its log row, then its result. */
function DepthReplay({ s, log, onClose, onEnd }: { s: Snapshot; log: AbyssLog; onClose: () => void; onEnd: () => void }) {
  const start = log.startedAt.microsSinceUnixEpoch;
  const result = useMemo(
    () => simulateDepth(decodeStats(log.stats), log.depth, depthRng(log.characterId, start), log.season),
    [log.stats, log.depth, log.characterId, start, log.season],
  );
  // A fresh attempt plays in step with the server's clock; an older one from its start.
  const [origin] = useState(() => (nowMicros() - start < 5_000_000n ? Number(start) : Number(nowMicros())));
  const [skipped, setSkipped] = useState(false);
  const [t, setT] = useState(0);
  useEffect(() => {
    if (skipped || t >= result.end) return;
    const timer = window.setInterval(() => setT(Math.max(0, (Number(nowMicros()) - origin) / 1e6)), 100);
    return () => window.clearInterval(timer);
  }, [skipped, result.end]); // eslint-disable-line react-hooks/exhaustive-deps -- runs until the end

  const live = !skipped && t < result.end;
  const at = live ? t : result.end;
  useEffect(() => {
    if (!live) onEnd();
  }, [live]); // eslint-disable-line react-hooks/exhaustive-deps
  // The fight on screen and the time into it.
  let k = 0;
  while (k + 1 < result.starts.length && result.starts[k + 1] <= at) k++;
  const fight = result.fights[k];
  const foe = result.foes[k];
  const into = at - result.starts[k];
  const shown = live ? fight.events.filter(e => e.t <= into) : fight.events;
  const last = shown.at(-1);
  const prevHp = k > 0 ? result.fights[k - 1].hpLeft : fight.stats.maxHp;
  const youHp = last?.youHp ?? prevHp;
  const foeHp = last?.foeHp ?? foe.enemy.hp;
  const maxHp = fight.stats.maxHp;
  const lost = result.foes[result.fights.length - 1];

  return (
    <section className={`card deep-replay${live ? '' : result.won ? ' won' : ' lost'}`}>
      <CardHead title={`Depth ${log.depth}`}>
        <span className="tag">{k + 1}/3 · {SLOT_LABEL[foe.slot]}</span>
        <span className={`tag${DEPTH_TIME_LIMIT - at < 30 ? ' c-bad' : ''}`} title="Time left for the depth">{clock(Math.max(0, DEPTH_TIME_LIMIT - at))}</span>
      </CardHead>
      <div className="deep-arena">
        <div className="deep-arena-foe"><FoeArt foe={foe} className="deep-replay-sprite" /></div>
        <div className="deep-arena-bars">
          <div className="duelist">
            <div className="duelist-name">{foe.enemy.name}</div>
            <div className="hpbar enemy">
              <div className="hp-fill" style={{ width: `${(foeHp / foe.enemy.hp) * 100}%` }} />
              <span className="hp-text">{fmt(foeHp)} / {fmt(foe.enemy.hp)}</span>
            </div>
          </div>
          <div className={`duelist${youHp <= 0 ? ' lost' : ''}`}>
            <div className="duelist-name">{s.row.name} (you)</div>
            <div className="hpbar">
              <div className="hp-fill" style={{ width: `${(youHp / maxHp) * 100}%` }} />
              <span className="hp-text">{fmt(youHp)} / {fmt(maxHp)}</span>
            </div>
          </div>
          <ol className="deep-steps">
            {result.foes.map((f, i) => (
              <li key={f.slot} className={i < k || (!live && i === k && result.won) ? 'done' : i === k ? 'now' : ''}>{f.enemy.name}</li>
            ))}
          </ol>
        </div>
      </div>
      {live ? (
        <>
          <ul className="duel-log">
            {shown.slice(-6).reverse().map((e, i) => (
              <li key={shown.length - i} className={`${e.by === 'you' ? 'mine' : 'theirs'}${e.kind === 'crit' ? ' crit' : ''}${e.burst ? ' aoe' : ''}`}>
                {eventLine(e, foe.enemy.name)}
              </li>
            ))}
          </ul>
          <div className="row deep-replay-actions">
            <button className="btn small ghost" onClick={() => setSkipped(true)}>Skip</button>
          </div>
        </>
      ) : (
        <>
          <div className={`raid-result ${result.won ? 'victory' : 'defeat'}`}>
            <div className="raid-result-title">{result.won ? `Depth ${log.depth} cleared!` : 'Defeat'}</div>
            <div className="raid-result-sub">
              {result.won ? `Cleared in ${clock(result.end)}`
                : result.timedOut ? `Out of time against ${lost.enemy.name}`
                  : `${lost.enemy.name} brings you down at ${clock(result.end)}`}
            </div>
          </div>
          {log.won && (
            <div className="deep-reward">
              <h3>Your reward</h3>
              <RewardLine gold={log.gold} xp={log.xp} dust={log.dust} materials={log.materials} elixir={log.elixir} />
            </div>
          )}
          <div className="row deep-replay-actions">
            <button className="btn" onClick={onClose}>Continue</button>
          </div>
        </>
      )}
    </section>
  );
}

function eventLine(e: FightEvent, foe: string): string {
  if (e.by === 'you') {
    if (e.immune) return `${foe} can't be hurt right now`;
    if (e.kind === 'miss') return `${foe} dodges`;
    return `You ${e.kind === 'crit' ? 'crit' : 'hit'} for ${fmt(e.damage)}${e.reflected ? ` (${fmt(e.reflected)} reflected)` : ''}${e.secondWind ? ' (Second Wind!)' : ''}`;
  }
  if (e.burst) return `${foe} unleashes Moonfall for ${fmt(e.damage)}!${e.secondWind ? ' (Second Wind!)' : ''}`;
  if (e.kind === 'dodge') return `You dodge ${foe}`;
  return `${foe} hits you for ${fmt(e.damage)}${e.drained ? ` and drains ${fmt(e.drained)}` : ''}${e.secondWind ? ' (Second Wind!)' : ''}`;
}

/** Deepest depth first; ties to whoever cleared it first. */
const byRank = (a: AbyssRecord, b: AbyssRecord) =>
  b.deepest - a.deepest || (a.clearedAt.microsSinceUnixEpoch < b.clearedAt.microsSinceUnixEpoch ? -1 : a.clearedAt.microsSinceUnixEpoch > b.clearedAt.microsSinceUnixEpoch ? 1 : 0);

function Leaderboard({ s }: { s: Snapshot }) {
  const conn = s.conn;
  const [tab, setTab] = useSticky<'global' | 'friends'>('deepBoard', 'global');
  const [open, setOpen] = useState<AbyssRecord>();
  const ranked = [...conn.db.abyssRecord.iter()].filter(r => r.season === ABYSS_SEASON && r.deepest > 0).sort(byRank);
  const rank = new Map(ranked.map((r, i) => [r.characterId, i + 1]));
  const friends = new Set([...conn.db.myFriends.iter()].map(f => f.friendId));
  const mine = ranked.find(r => r.characterId === s.row.id);
  const rows = tab === 'global' ? ranked.slice(0, BOARD_SIZE) : ranked.filter(r => r.characterId === s.row.id || friends.has(r.characterId));
  const pinned = tab === 'global' && mine && !rows.includes(mine) ? mine : undefined;

  const row = (r: AbyssRecord) => (
    <li key={String(r.characterId)} className={r.characterId === s.row.id ? 'me' : ''}>
      <span className="deep-rank">{rank.get(r.characterId)}</span>
      <span className="deep-name">{r.name}</span>
      <span className="muted">Lv {r.level}</span>
      <strong className="deep-depth">{r.deepest}</strong>
      <button className="btn small ghost" disabled={!r.build} onClick={() => setOpen(r)}>Build</button>
    </li>
  );
  return (
    <section className="card deep-board">
      <CardHead title="Leaderboard">
        <div className="seg">
          <button className={`seg-btn${tab === 'global' ? ' active' : ''}`} onClick={() => setTab('global')}>Global</button>
          <button className={`seg-btn${tab === 'friends' ? ' active' : ''}`} onClick={() => setTab('friends')}><Icon name="users" />Friends</button>
        </div>
      </CardHead>
      {rows.length ? (
        <ol className="deep-ranks">
          {rows.map(row)}
          {pinned && <li className="deep-gap" aria-hidden="true">…</li>}
          {pinned && row(pinned)}
        </ol>
      ) : (
        <p className="muted">{tab === 'friends' ? 'No friend has cleared a depth yet.' : 'Nobody has cleared a depth yet.'}</p>
      )}
      <p className="muted hint">Deepest depth cleared; ties go to whoever got there first. Rank gives no rewards, only bragging rights.</p>
      {open && <BuildPopup record={open} rank={rank.get(open.characterId)} onClose={() => setOpen(undefined)} />}
    </section>
  );
}

/** The build that set a leaderboard entry, as it was at the clear. */
function BuildPopup({ record, rank, onClose }: { record: AbyssRecord; rank?: number; onClose: () => void }) {
  const [openSlot, setOpenSlot] = useState<number>();
  const view = useMemo(() => {
    const gear = decodeBuild<Item>(record.build);
    const stats: CombatStats = combatStats(record.level, gear);
    return { gear, stats, sheet: statSheet(record.level, gear, stats) };
  }, [record.build, record.level]);
  const opened = openSlot !== undefined ? view.gear[openSlot] : undefined;
  return (
    <Modal onClose={onClose} className="item-popup inspect-popup">
      <CardHead title={`${record.name} · Lv ${record.level}`}>
        <button className="btn" onClick={onClose}><Icon name="x" />Close</button>
      </CardHead>
      <p className="muted">{rank ? `#${rank} · ` : ''}Depth {record.deepest}, cleared with this build.</p>
      <div className="equip-layout">
        <div className="card equip-slots">
          {SLOT_GRID.map(i => (
            <SlotCell key={i} gear={view.gear} i={i} selected={openSlot === i} onOpen={() => setOpenSlot(openSlot === i ? undefined : i)} />
          ))}
        </div>
        <StatBoard sheet={view.sheet} className="stat-board" />
      </div>
      {opened && <ItemCard it={opened} />}
      <EffectsCard effects={view.stats.effects} />
    </Modal>
  );
}
