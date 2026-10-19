// The Moonwell Deep (docs/design/abyss.md): the next depth's line-up, your odds with a
// chosen loadout, the attempt replayed from the log row (abyss.ts), and the leaderboard.
// Solo and online only.

import { memo, useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { AbyssLog, AbyssRecord, Item } from '../../module_bindings/types';
import type { DbConnection } from '../../module_bindings';
import { combatStats, type CombatStats } from '../../../spacetimedb/src/combat';
import {
  ABYSS_SEASON, ABYSS_UNLOCK_ZONE,BOSS_AFFIXES_BY_ID, DEPTH_TIME_LIMIT, ELITE_AFFIXES_BY_ID, ABYSS_KINDS_BY_ID, DEEP_WARDEN, FAST_FROM,
  SECOND_BOSS_AFFIX_FROM, depthLineup, depthReward, depthTier, wardenArtId,
} from '../../../spacetimedb/src/data/abyss';
import { ZONES_BY_ID, bossOf } from '../../../spacetimedb/src/data/zones';
import { SUPPLIES_BY_ID, elixirBuffs } from '../../../spacetimedb/src/data/supplies';
import { elixirText } from '../lifeSkills';
import { decodeBuild, decodeStats, depthFoes, depthRng, simulateDepth, type DepthFoe, type DepthResult } from '../../../spacetimedb/src/abyss';
import { call, useSticky, useTick } from '../../store';
import { startFight, stopFight } from '../fight';
import { FightStage } from '../FightStage';
import { nowMicros } from '../clock';
import { DefTag, DmgTag } from '../enemy';
import { EnemyArt } from '../enemyArt';
import { fmt, fmtBig } from '../format';
import { Icon } from '../Icon';
import { PlayerName } from '../PlayerName';
import { ItemCard, materialIconName, materialName } from '../items';
import { untieredMaterial } from '../../../spacetimedb/src/data/materials';
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
  const zone = ZONES_BY_ID.get(ABYSS_UNLOCK_ZONE)!;
  const unlocked = s.killedZones.has(zone.id);
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
        With Selvara dead, nothing holds her moonwell shut. Past its flooded heart, the dark the moon fell through has no bottom. Each depth is
        a basic enemy, an Elite and the Deep Warden, fought back to back on one HP bar. Clear it to go deeper. Solo, online only; farming
        carries on meanwhile.
      </p>
      {!unlocked ? (
        <div className="lock-note"><Icon name="lock" />Defeat {bossOf(zone)?.name} in {zone.name} to open the Moonwell Deep</div>
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
  // As the server takes it: your level, the loadout, the active elixir.
  const buffs = s.elixir && elixirBuffs(s.elixir.supply.id, s.elixir.infused);
  const stats = useMemo(() => combatStats(s.level, gear, buffs), [s.level, gear.map(i => String(i?.id ?? 0n)).join(), buffs?.damage, buffs?.attackSpeed]); // eslint-disable-line react-hooks/exhaustive-deps
  const lineup = depthLineup(depth);
  const foes = useMemo(() => depthFoes(stats, lineup), [stats, depth]); // eslint-disable-line react-hooks/exhaustive-deps
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
  // Attempts whose replay has reached its result (skipped or played out): the wait after a loss starts then.
  const [ended, setEnded] = useState<{ id: bigint; at: bigint }[]>([]);
  const endedAt = (id: bigint) => ended.find(e => e.id === id)?.at;
  const latestLength = useMemo(() => (latest && !latest.won ? replayLength(latest) : 0), [latest?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // The wait runs from when the loss was seen: its replay's result, or (not watched here) when the replay would have ended.
  const lossSeen = latest && !latest.won && (endedAt(latest.id) ?? latest.startedAt.microsSinceUnixEpoch + BigInt(Math.ceil(latestLength * 1e6)));
  const waitLeft = lossSeen ? LOSS_WAIT - Number(now - lossSeen) / 1e6 : 0;
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
            {s.elixir && (
              <div className="deep-facts">
                <div title="Your elixir applies to every fight and uses a charge per kill"><span>Elixir</span><strong>{s.elixir.infused ? 'Infused ' : ''}{s.elixir.supply.name}</strong></div>
              </div>
            )}
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
      {supply && <span><Icon name="flask" className="c-magic" />{supply.name}</span>}
      <span className="muted">{mats.map(m => `${m.count} ${materialName(m.materialId)}`).join(' · ')}</span>
    </div>
  );
}

/**
 * A cleared depth's reward on one line (wrapping on narrow screens): an icon and an amount
 * per gain, popping in one after another; Voidglass and elixirs shine.
 */
function DeepLoot({ log }: { log: AbyssLog }) {
  const supply = SUPPLIES_BY_ID.get(log.elixir);
  const voidglass = untieredMaterial('Voidglass').id;
  const gains: { key: string; icon: string; cls: string; text: string; title: string; special?: boolean }[] = [
    { key: 'gold', icon: 'coins', cls: 'c-gold', text: `+${fmtBig(log.gold)} gold`, title: 'Gold' },
    ...(log.xp > 0n ? [{ key: 'xp', icon: 'star', cls: 'c-ok', text: `+${fmtBig(log.xp)} XP`, title: 'Experience' }] : []),
    { key: 'dust', icon: 'gem', cls: 'c-dust', text: `+${fmtBig(log.dust)} Dust`, title: 'Dust' },
    ...(supply ? [{ key: 'elixir', icon: 'flask', cls: 'c-voidglass', text: supply.name, title: `${supply.name}: ${elixirText(supply)}`, special: true }] : []),
    // Voidglass first among the materials: it only comes from the Deep.
    ...[...log.materials].sort((x, y) => Number(y.materialId === voidglass) - Number(x.materialId === voidglass)).map(m => ({
      key: `m${m.materialId}`, icon: materialIconName(m.materialId), cls: m.materialId === voidglass ? 'c-voidglass' : 'c-material',
      text: `+${fmt(m.count)} ${materialName(m.materialId)}`, title: materialName(m.materialId), special: m.materialId === voidglass,
    })),
  ];
  return (
    <div className="deep-loot">
      <div className="raid-loot-head">Your reward</div>
      <div className="deep-loot-line">
        {gains.map((g, i) => (
          <span key={g.key} className={`${g.cls}${g.special ? ' special' : ''}`} title={g.title} style={{ '--delay': `${0.25 + i * 0.07}s` } as CSSProperties}>
            <Icon name={g.icon} />
            {g.text}
          </span>
        ))}
      </div>
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
  const lost = result.foes[result.fights.length - 1];

  return (
    <section className={`card deep-replay${live ? '' : result.won ? ' won' : ' lost'}`}>
      <CardHead title={`Depth ${log.depth}`}>
        <span className={`tag${DEPTH_TIME_LIMIT - at < 30 ? ' c-bad' : ''}`} title="Time left for the depth">{clock(Math.max(0, DEPTH_TIME_LIMIT - at))}</span>
      </CardHead>
      {/* The three enemies in order: beaten ones crossed out and dimmed, the current one glowing. */}
      <ol className="deep-trail">
        {result.foes.map((f, i) => (
          <li key={f.slot} className={i < k || (!live && i === k && result.won) ? 'done' : i === k ? 'now' : ''} title={SLOT_LABEL[f.slot]}>
            {f.enemy.name}
          </li>
        ))}
      </ol>
      {!skipped && <DeepScene key={k} s={s} result={result} k={k} origin={origin} />}
      {live ? (
        <div className="row deep-replay-actions">
          <button className="btn small ghost" onClick={() => setSkipped(true)}>Skip</button>
        </div>
      ) : (
        <>
          <div className={`raid-result deep-result ${result.won ? 'victory' : 'defeat'}`}>
            <div className="raid-result-title">{result.won ? `Depth ${log.depth} cleared!` : 'Defeat'}</div>
            <div className="raid-result-sub">
              {result.won ? `Cleared in ${clock(result.end)}`
                : result.timedOut ? `Out of time against ${lost.enemy.name}`
                  : `${lost.enemy.name} brings you down at ${clock(result.end)}`}
            </div>
          </div>
          {log.won && <DeepLoot log={log} />}
          <div className="row deep-replay-actions center">
            <button className="btn" onClick={onClose}>Continue</button>
          </div>
        </>
      )}
    </section>
  );
}

/** What the enemy on screen does differently: its affixes, or a basic's twist (the scene's caption). */
function foeCaption(foe: DepthFoe): string {
  if (!foe.affixes.length) return ABYSS_KINDS_BY_ID.get(foe.kindId)?.twist ?? '';
  const table = foe.slot === 'boss' ? BOSS_AFFIXES_BY_ID : ELITE_AFFIXES_BY_ID;
  return foe.affixes.map(a => `${table.get(a)!.name}: ${table.get(a)!.text}`).join(' · ');
}

/**
 * Fight `k` of a depth on the Combat page's stage (fight.ts): you on the left, the enemy on
 * the right, attack-speed bars and floating numbers, in step with the replay's clock. Keyed
 * by `k`, so each enemy gets its own stage; no respawn after the last fight.
 */
const DeepScene = memo(
  function DeepScene({ s, result, k, origin }: { s: Snapshot; result: DepthResult; k: number; origin: number }) {
    const foe = result.foes[k];
    const fight = result.fights[k];
    useEffect(() => {
      const cur = { startMicros: BigInt(origin) + BigInt(Math.round(result.starts[k] * 1e6)), fight };
      startFight(cur, () => undefined, () => foeCaption(foe), { noRespawn: true, stalemate: 'Out of time' });
      return stopFight;
    }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once per fight (keyed by the parent)
    return (
      <FightStage
        you={{ portrait: <Icon name="user" />, name: <>{s.row.name} <span className="muted">Lv {fight.stats.level}</span></> }}
        enemy={{ portrait: <FoeArt foe={foe} />, name: <>{foe.enemy.name} <span className="muted">Lv {foe.enemy.level}</span></> }}
      />
    );
  },
  () => true,
);

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
      <span className="deep-name"><PlayerName conn={conn} id={r.characterId} name={r.name} /></span>
      <span className="muted deep-level">{r.level}</span>
      <strong className="deep-depth">{r.deepest}</strong>
      <button className="btn small deep-view-build" disabled={!r.build} onClick={() => setOpen(r)}>View build</button>
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
          <li className="deep-ranks-head" aria-hidden="true">
            <span>#</span>
            <span>Player</span>
            <span className="deep-level">Level</span>
            <span className="deep-depth" title="Deepest depth cleared">Depth</span>
            <span />
          </li>
          {rows.map(row)}
          {pinned && <li className="deep-gap" aria-hidden="true">…</li>}
          {pinned && row(pinned)}
        </ol>
      ) : (
        <p className="muted">{tab === 'friends' ? 'No friend has cleared a depth yet.' : 'Nobody has cleared a depth yet.'}</p>
      )}
      {open && <BuildPopup conn={conn} record={open} rank={rank.get(open.characterId)} onClose={() => setOpen(undefined)} />}
    </section>
  );
}

/** The build that set a leaderboard entry, as it was at the clear. */
function BuildPopup({ conn, record, rank, onClose }: { conn: DbConnection; record: AbyssRecord; rank?: number; onClose: () => void }) {
  const [openSlot, setOpenSlot] = useState<number>();
  const view = useMemo(() => {
    const gear = decodeBuild<Item>(record.build);
    const stats: CombatStats = combatStats(record.level, gear);
    return { gear, stats, sheet: statSheet(record.level, gear, stats) };
  }, [record.build, record.level]);
  const opened = openSlot !== undefined ? view.gear[openSlot] : undefined;
  return (
    <Modal onClose={onClose} className="item-popup inspect-popup">
      <CardHead title={<><PlayerName conn={conn} id={record.characterId} name={record.name} /> · Lv {record.level}</>}>
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
