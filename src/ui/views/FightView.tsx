import { memo, useEffect } from 'react';
import type { SettleLog } from '../../module_bindings/types';
import type { Matchup } from '../../../spacetimedb/src/combat';
import { RARITIES } from '../../../spacetimedb/src/loot';
import { startFight, stopFight } from '../fight';
import { fmt, fmtBig, secs } from '../format';
import { Icon } from '../Icon';
import { itemName, rarityCls } from '../items';
import { CardHead, openCraft, perHour, result, ViewHeader } from '../shared';
import type { Snapshot } from '../snapshot';

export const DmgTag = ({ magic }: { magic: boolean }) => <span className={`tag ${magic ? 'magic' : 'phys'}`}>{magic ? 'Magic' : 'Phys'}</span>;

function LootLines({ s, logs, max = 30 }: { s: Snapshot; logs: SettleLog[]; max?: number }) {
  const lines: React.ReactNode[] = [];
  for (const log of logs) {
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
    const salvaged = RARITIES.map((r, i) => [r, log.salvaged[i] ?? 0] as const).filter(([, n]) => n > 0);
    if (salvaged.length) {
      lines.push(
        <li className="dim" key={`s${log.id}`}>
          <span>{salvaged.map(([r, n]) => `${n} ${r}`).join(', ')}</span>
          <span className="muted">salvaged +{fmtBig(log.essence)} Essence</span>
        </li>
      );
    }
    if (lines.length >= max) break;
  }
  return <>{lines.length ? lines.slice(0, max) : <li className="muted">No drops yet. Drops are rare: about 1 every 2 minutes.</li>}</>;
}

function FightKpis({ m }: { m: Matchup }) {
  return (
    <div className="kpis">
      <div className="kpi"><span>Time to kill</span><strong>{secs(m.timeToKill)}</strong></div>
      <div className="kpi"><span>Time to die</span><strong>{secs(m.timeToDie)}</strong></div>
      <div className={`kpi ${m.viable ? 'ok' : 'bad'}`}><span>Result</span><strong>{result(m)}</strong></div>
      <div className="kpi"><span>Kills / h</span><strong>{fmt(perHour(m))}</strong></div>
      <div className="kpi"><span>XP / h</span><strong>{fmt(perHour(m) * m.xpPerKill)}</strong></div>
      <div className="kpi"><span>Gold / h</span><strong>{fmt(perHour(m) * m.goldPerKill)}</strong></div>
    </div>
  );
}

const keepLabel = (s: Snapshot) => `Keeping ${s.filter?.minRarity.tag ?? 'Magic'}+${s.filter?.keepAffixes.length ? ` and ${s.filter.keepAffixes.length} affixes` : ''}`;

/**
 * The animated fight. fight.ts drives its bars and floating numbers directly, so React
 * renders it once per fight (the parent keys it) and never touches it again.
 */
const FightScene = memo(
  function FightScene({ s }: { s: Snapshot }) {
    const { enemy: e } = s.target!;
    useEffect(() => {
      startFight(s.stats, s.fight!, e);
      return stopFight;
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
        <div className="scene-status" id="scene-status" />
      </div>
    );
  },
  () => true
);

export const FightView = memo(function FightView({ s }: { s: Snapshot }) {
  if (!s.target || !s.fight) {
    return (
      <>
        <ViewHeader title="Fight" icon="swords" />
        <div className="card">
          <p className="muted">No target. Pick an enemy on the Zones screen.</p>
          <a className="btn small" href="#zones"><Icon name="map" />Zones</a>
        </div>
      </>
    );
  }
  const { zone, enemy: e } = s.target;
  const m = s.fight;
  const sceneKey = `${e.id}|${s.level}|${m.dps}|${m.timeToDie}|${s.stats.maxHp}`;
  return (
    <>
      <ViewHeader title="Fight" icon="swords" />
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
        <a className="btn small ghost" href="#zones"><Icon name="map" />Change target</a>
      </div>
      <FightScene key={sceneKey} s={s} />
      <FightKpis m={m} />
      <div className="card">
        <CardHead title="Loot log"><span className="muted">{keepLabel(s)}</span></CardHead>
        <ul className="loot-log"><LootLines s={s} logs={s.logs} /></ul>
      </div>
    </>
  );
});
