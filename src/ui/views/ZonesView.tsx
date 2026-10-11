import { Fragment, memo, useState } from 'react';
import { matchup } from '../../../spacetimedb/src/combat';
import { ZONES, ZONES_BY_ID, bossOf, previousZone, type ZoneDef } from '../../../spacetimedb/src/data/zones';
import { call, useSticky } from '../../store';
import { fmt } from '../format';
import { Icon } from '../Icon';
import { DmgTag, EnemyDetail } from '../enemy';
import { ViewHeader } from '../shared';
import type { Snapshot } from '../snapshot';

const zoneLevels = (z: ZoneDef) => `${Math.min(...z.enemies.map(e => e.level))}–${Math.max(...z.enemies.map(e => e.level))}`;

function zoneUnlocked(s: Snapshot, z: ZoneDef) {
  const prev = previousZone(z);
  return !prev || s.killedZones.has(prev.id);
}

export const ZonesView = memo(function ZonesView({ s }: { s: Snapshot }) {
  const [zoneId, setZoneId] = useSticky<number | undefined>('zoneId', undefined);
  const [open, setOpen] = useState<number>();
  const z = ZONES_BY_ID.get(zoneId ?? s.row.zoneId) ?? ZONES[0];
  const unlocked = zoneUnlocked(s, z);
  const bossDown = s.killedZones.has(z.id);
  const prev = previousZone(z);
  const prevBoss = prev && bossOf(prev);
  const r = s.conn.reducers;

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
              setOpen(undefined);
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
                <th>Enemy</th><th>Lv</th><th>Dmg</th><th>Defense</th><th className="num">HP</th>
                <th className="num" title="Enemy damage per second after your mitigation and evasion">DPS taken</th><th />
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
                  <span className="btn small fighting">Fighting</span>
                ) : (
                  <button className="btn small" onClick={() => call(r.setTarget({ enemyId: e.id }).then(() => void (location.hash = '#combat')))}>
                    Fight
                  </button>
                );
                const expanded = open === e.id;
                return (
                  <Fragment key={e.id}>
                    <tr
                      data-row
                      className={`${active ? 'active' : ''}${e.boss ? ' boss' : ''}${expanded ? ' expanded' : ''}`}
                      onClick={ev => !(ev.target as HTMLElement).closest('button') && setOpen(expanded ? undefined : e.id)}
                    >
                      <td className="name"><span className="caret">▸</span>{e.boss && <Icon name="skull" className="boss" />}{e.name}</td>
                      <td>{e.level}</td>
                      <td><DmgTag magic={e.damageType === 'Magic'} /></td>
                      <td>{e.defense}</td>
                      <td className="num">{fmt(e.hp)}</td>
                      <td className="num" title={`${fmt(e.dps)} before your defenses`}>
                        <span className={`result ${m.viable ? 'ok' : 'bad'}`}>{fmt(m.incoming)}</span>
                      </td>
                      <td className="actions">{action}</td>
                    </tr>
                    {expanded && (
                      <tr className="detail-row">
                        <td colSpan={7}><EnemyDetail s={s} z={z} e={e} m={m} /></td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="muted hint">Click an enemy for its rewards and drops. Numbers use your active loadout ({s.active.name}).</p>
      </div>
    </>
  );
});
