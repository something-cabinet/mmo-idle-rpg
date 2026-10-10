import { memo, useState } from 'react';
import { matchup } from '../../../spacetimedb/src/combat';
import { base } from '../../../spacetimedb/src/data/bases';
import { ZONES, ZONES_BY_ID, bossOf, previousZone, type ZoneDef } from '../../../spacetimedb/src/data/zones';
import { call, useSticky } from '../../store';
import { fmt, secs } from '../format';
import { Icon } from '../Icon';
import { CardHead, perHour, result, ViewHeader } from '../shared';
import type { Snapshot } from '../snapshot';
import { DmgTag } from './FightView';

const zoneLevels = (z: ZoneDef) => `${Math.min(...z.enemies.map(e => e.level))}–${Math.max(...z.enemies.map(e => e.level))}`;

function zoneUnlocked(s: Snapshot, z: ZoneDef) {
  const prev = previousZone(z);
  return !prev || s.killedZones.has(prev.id);
}

export const ZonesView = memo(function ZonesView({ s }: { s: Snapshot }) {
  const [zoneId, setZoneId] = useSticky<number | undefined>('zoneId', undefined);
  const [dropsOf, setDropsOf] = useState<number>();
  const z = ZONES_BY_ID.get(zoneId ?? s.row.zoneId) ?? ZONES[0];
  const unlocked = zoneUnlocked(s, z);
  const bossDown = s.killedZones.has(z.id);
  const prev = previousZone(z);
  const prevBoss = prev && bossOf(prev);
  const r = s.conn.reducers;
  const shown = z.enemies.find(e => e.id === dropsOf) ?? z.enemies.find(e => e.id === s.row.targetEnemyId) ?? z.enemies[0];

  return (
    <>
      <ViewHeader title="Zones" icon="map" />
      <div className="seg">
        {ZONES.map(zz => (
          <button
            key={zz.id}
            className={`seg-btn${zz === z ? ' active' : ''}`}
            onClick={() => {
              setZoneId(zz.id);
              setDropsOf(undefined);
            }}
          >
            {!zoneUnlocked(s, zz) && <Icon name="lock" />}T{zz.tier} {zz.name}
            {s.killedZones.has(zz.id) ? ' ✔' : ''}
          </button>
        ))}
      </div>
      <div className="card">
        <div className="zone-head">
          <div>
            <h2>{z.name} <span className="muted">Levels {zoneLevels(z)}</span></h2>
            <p className="muted">{z.blurb}</p>
          </div>
          {!unlocked && (
            <div className="lock-note"><Icon name="lock" />Defeat {prevBoss?.name ?? 'the previous boss'} to unlock</div>
          )}
        </div>
        <div className="table-wrap">
          <table className={`table${unlocked ? '' : ' locked'}`}>
            <thead>
              <tr>
                <th>Enemy</th><th>Lv</th><th>Dmg</th><th>Defense</th><th className="num">HP</th><th className="num">DPS</th>
                <th>Your result</th><th className="num">Kill</th><th className="num">XP/h</th><th className="num">Gold/h</th><th className="num">Bases</th><th />
              </tr>
            </thead>
            <tbody>
              {z.enemies.map(e => {
                const m = matchup(s.stats, e);
                const active = s.row.targetEnemyId === e.id;
                const action = !unlocked ? (
                  <span className="muted"><Icon name="lock" /></span>
                ) : e.boss && !bossDown ? (
                  <button className="btn small danger" onClick={() => call(r.challengeBoss({ zoneId: z.id }), `${bossOf(z)!.name} defeated! The next zone is open.`)}>
                    Challenge
                  </button>
                ) : active ? (
                  <span className="tag ok">Fighting</span>
                ) : (
                  <button className="btn small" onClick={() => call(r.setTarget({ enemyId: e.id }).then(() => void (location.hash = '#fight')))}>
                    Fight
                  </button>
                );
                return (
                  <tr key={e.id} className={`${active ? 'active' : ''}${e.boss ? ' boss' : ''}`} onClick={ev => !(ev.target as HTMLElement).closest('button') && setDropsOf(e.id)}>
                    <td className="name">{e.boss && <Icon name="skull" className="boss" />}{e.name}</td>
                    <td>{e.level}</td>
                    <td><DmgTag magic={e.damageType === 'Magic'} /></td>
                    <td>{e.defense}</td>
                    <td className="num">{fmt(e.hp)}</td>
                    <td className="num">{fmt(e.dps)}</td>
                    <td><span className={`result ${m.viable ? 'ok' : 'bad'}`}>{result(m)}</span></td>
                    <td className="num">{m.viable ? secs(m.timeToKill) : '—'}</td>
                    <td className="num">{m.viable ? fmt(perHour(m) * m.xpPerKill) : '—'}</td>
                    <td className="num">{m.viable ? fmt(perHour(m) * m.goldPerKill) : '—'}</td>
                    <td className="num">{e.boss ? 'All' : e.drops.length}</td>
                    <td className="actions">{action}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="muted hint">Results use your active loadout ({s.active.name}).</p>
      </div>
      <div className="card">
        <CardHead title={`${shown.name} drops`}>
          <span className="muted">{shown.boss ? 'Every base of the zone' : 'Each base drops from exactly one enemy in the zone'}</span>
        </CardHead>
        <div className="chips">
          {shown.drops.map(d => (
            <span className="chip" key={d}>{base(d).name(z.tier)}</span>
          ))}
        </div>
      </div>
    </>
  );
});
