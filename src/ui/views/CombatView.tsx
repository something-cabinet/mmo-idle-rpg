import { memo, useEffect } from 'react';
import type { SettleLog } from '../../module_bindings/types';
import { sessionStart, sessionTotals, sinceTargetChange } from '../../session';
import { call, useTick } from '../../store';
import { MAX_LEVEL } from '../../../spacetimedb/src/combat';
import { xpToNext } from '../../../spacetimedb/src/game';
import { RARITIES, restrictsAffixes, restrictsBases } from '../../../spacetimedb/src/loot';
import { nowMicros } from '../clock';
import { DmgTag, EnemyDetail } from '../enemy';
import { startFight, stopFight } from '../fight';
import { walkLine } from '../flavor';
import { foundName } from '../discovery';
import { encounterText } from '../encounters';
import { duration, fmt, fmtBig } from '../format';
import { Icon } from '../Icon';
import { itemName, materialsText, rarityCls } from '../items';
import { CardHead, openCraft, perHour, ViewHeader } from '../shared';
import { snapshot, type Snapshot } from '../snapshot';

function LootLines({ s, logs, max = 30 }: { s: Snapshot; logs: SettleLog[]; max?: number }) {
  const lines: React.ReactNode[] = [];
  for (const log of logs) {
    log.encounters.forEach((enc, i) =>
      lines.push(
        <li key={`e${log.id}-${i}`} className="encounter">
          <span><Icon name="zap" />{encounterText(enc, log.enemyId, id => s.items.get(id))}</span>
          <span className="muted">encounter</span>
        </li>
      )
    );
    if (log.discovered.length) {
      lines.push(
        <li key={`d${log.id}`} className="discovery">
          <span><Icon name="sparkles" />New discovery: {log.discovered.map(foundName).join(', ')}</span>
          <span className="muted">found</span>
        </li>
      );
    }
    for (const id of log.keptItemIds) {
      const it = s.items.get(id);
      if (!it) continue;
      lines.push(
        <li key={`k${id}`}>
          <a
            href="#crafting"
            className={`c-${rarityCls(it.rarity.tag)}`}
            onClick={e => {
              e.preventDefault();
              openCraft(it.id);
            }}
          >
            {it.rarity.tag} {itemName(it)}
          </a>
          <span className="muted">kept</span>
        </li>
      );
    }
    if (log.materials.length) {
      lines.push(
        <li key={`m${log.id}`}>
          <span className="c-material">{materialsText(log.materials)}</span>
          <span className="muted">materials</span>
        </li>
      );
    }
    const salvaged = RARITIES.map((r, i) => [r, log.salvaged[i] ?? 0] as const).filter(([, n]) => n > 0);
    if (salvaged.length) {
      lines.push(
        <li className="dim" key={`s${log.id}`}>
          <span>{salvaged.map(([r, n]) => `${n} ${r}`).join(', ')}</span>
          <span className="muted">salvaged +{fmtBig(log.dust)} Dust</span>
        </li>
      );
    }
    if (lines.length >= max) break;
  }
  return <>{lines.length ? lines.slice(0, max) : <li className="muted">No drops yet. Drops are rare: about 1 every 2 minutes.</li>}</>;
}

/** This session's gains (since entering the world or changing target) and the current rates. Ticks on its own: views only redraw on data changes. */
function SessionCard({ s }: { s: Snapshot }) {
  useTick(1000);
  const now = nowMicros();
  const live = snapshot(s.conn, s.row, now);
  const since = sessionStart([...s.conn.db.presence.iter()].find(p => p.characterId === s.row.id)?.since.microsSinceUnixEpoch ?? now);
  const t = sessionTotals(since, s.row.targetEnemyId);
  const m = live.fight;
  const kph = m ? perHour(m) : 0;
  const xph = m ? kph * m.xpPerKill : 0;
  const nextLevel =
    live.level >= MAX_LEVEL ? 'Max level' : xph > 0 ? `~${duration(BigInt(Math.ceil((Number(xpToNext(live.level) - live.xp) / xph) * 3600e6)))}` : '—';
  const row = (label: string, session: React.ReactNode, hourly = '') => (
    <div className="stat-row session-row">
      <span>{label}</span>
      <strong>{session}</strong>
      <strong>{hourly}</strong>
    </div>
  );
  return (
    <div className="card">
      <CardHead title="Session"><span className="muted">{duration(now > since ? now - since : 0n)}</span></CardHead>
      <div className="stat-row session-row head">
        <span />
        <span>This session</span>
        <span>Per hour</span>
      </div>
      {row('Kills', fmt(t.kills + live.pending.kills), fmt(kph))}
      {row('XP', fmtBig(t.xp + live.pending.xp), fmt(xph))}
      {row('Gold', fmtBig(t.gold + live.pending.gold), fmt(m ? kph * m.goldPerKill : 0))}
      {row('Items kept', <>{fmt(t.kept)}{t.salvaged > 0 && <span className="muted"> +{fmt(t.salvaged)} salvaged</span>}</>)}
      {row('Next level', nextLevel)}
    </div>
  );
}

function keepLabel(s: Snapshot) {
  const f = s.filter;
  const limits = [
    f && restrictsAffixes(f) && `${f.keepAffixes.length} affixes`,
    f && restrictsBases(f) && `${f.keepBases.length} families`,
    f && f.minAffixTier > 1 && `T${f.minAffixTier}+ affix`,
  ].filter(Boolean);
  return `Keeping ${f?.minRarity.tag ?? 'Magic'}+${limits.length ? ` · ${limits.join(' · ')}` : ''}`;
}

/**
 * The animated fight. fight.ts drives its bars and floating numbers directly, so React
 * renders it once per fight (the parent keys it) and never touches it again.
 */
const FightScene = memo(
  function FightScene({ s }: { s: Snapshot }) {
    const { zone, enemy: e } = s.target!;
    useEffect(() => {
      // Each fight comes from a fresh projection, so it uses the latest row and gear.
      const fresh = (now: bigint) => {
        const row = s.conn.db.character.id.find(s.row.id);
        return row ? snapshot(s.conn, row, now).current : undefined;
      };
      // Right after a defeat or a target change the projection can have no fight yet
      // (the settle time is ahead of our clock): keep trying instead of never starting.
      let retry = 0;
      const begin = () => {
        const first = s.current ?? fresh(nowMicros());
        if (first) startFight(first, fresh, c => walkLine(zone.id, s.row.id, c.startMicros));
        else retry = window.setTimeout(begin, 100);
      };
      begin();
      return () => {
        window.clearTimeout(retry);
        stopFight();
      };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once per fight (keyed by the parent)
    const fighter = (who: 'you' | 'enemy', portrait: React.ReactNode, name: React.ReactNode) => (
      <div className="fighter" id={`fighter-${who}`}>
        <div className={`portrait ${who}`}>{portrait}</div>
        <div className="fighter-name">{name}</div>
        <div className={`hpbar${who === 'enemy' ? ' enemy' : ''}`}>
          <div className="hp-fill" />
          <span className="hp-text" />
        </div>
        <div className="swing">
          <div className="swing-fill" />
        </div>
        <div className="floats" />
      </div>
    );
    return (
      <div className="scene card" id="scene">
        {fighter('you', <Icon name="user" />, <>{s.row.name} <span className="muted">Lv {s.level}</span></>)}
        <div className="versus">VS</div>
        {fighter('enemy', <Icon name={e.boss ? 'skull' : 'swords'} />, <>{e.name} <span className="muted">Lv {e.level}</span></>)}
        <div className="scene-flavor" id="scene-flavor" />
        <div className="scene-status" id="scene-status" />
      </div>
    );
  },
  () => true
);

export const CombatView = memo(function CombatView({ s }: { s: Snapshot }) {
  if (!s.target || !s.fight) {
    return (
      <>
        <ViewHeader title="Combat" icon="swords" />
        <div className="card">
          <p>You're idle{s.defeated ? ': you were defeated' : ''}.</p>
          <p className="muted">No XP, gold or drops until you pick an enemy on the Zones screen.</p>
          <a className="btn small" href="#zones"><Icon name="map" />Zones</a>
        </div>
      </>
    );
  }
  const { zone, enemy: e } = s.target;
  const m = s.fight;
  const sceneKey = `${e.id}|${s.level}|${m.dps}|${m.timeToDie}|${s.stats.maxHp}|${s.stats.walkTime}`;
  return (
    <>
      <ViewHeader title="Combat" icon="swords" />
      <div className="fight-target">
        <div>
          <div className="crumb">{zone.name} <span className="muted">T{zone.tier}</span></div>
          <div className="target-name">{e.boss && <Icon name="skull" className="boss" />}{e.name}</div>
          <div className="tags">
            <span className="tag">Lv {e.level}</span>
            <DmgTag magic={e.damageType === 'Magic'} />
            <span className="tag">{e.defense}</span>
          </div>
        </div>
        <div className="row">
          <button className="btn small danger" onClick={() => call(s.conn.reducers.flee({}))}>Flee</button>
          <a className="btn small ghost" href="#zones"><Icon name="map" />Change target</a>
        </div>
      </div>
      <FightScene key={sceneKey} s={s} />
      <div className="grid-2">
        <SessionCard s={s} />
        <div className="card">
          <CardHead title="Drops"><span className="muted">{e.name}</span></CardHead>
          <EnemyDetail s={s} z={zone} e={e} m={m} />
        </div>
      </div>
      <div className="card">
        <CardHead title="Loot log"><span className="muted">{keepLabel(s)}</span></CardHead>
        <ul className="loot-log"><LootLines s={s} logs={sinceTargetChange(s.logs, e.id)} /></ul>
      </div>
    </>
  );
});
