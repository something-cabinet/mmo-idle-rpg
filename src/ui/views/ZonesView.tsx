import { Fragment, memo, useState } from 'react';
import { matchup } from '../../../spacetimedb/src/combat';
import { ZONES, ZONES_BY_ID, bossOf, previousZone, type ZoneDef } from '../../../spacetimedb/src/data/zones';
import { call, useSticky } from '../../store';
import { fmt } from '../format';
import { Icon } from '../Icon';
import { DmgTag, EnemyDetail } from '../enemy';
import { ViewHeader } from '../shared';
import { UNKNOWN, enemyKnown, threat, zoneDiscovery } from '../discovery';
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
  const found = zoneDiscovery(s, z);

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
            {unlocked && (
              <p className="muted discovered" title="Enemies are revealed by killing them, items by seeing them drop (salvaged drops count)">
                Discovered: enemies {found.enemies}/{found.enemyTotal} · items {found.items}/{found.itemTotal}
              </p>
            )}
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
                <th className="num" title="Enemy damage per second, before your armor, resistance and evasion">DPS</th><th className="num" title="Lifetime kills, online and offline">Kills</th><th />
              </tr>
            </thead>
            <tbody>
              {z.enemies.map(e => {
                const m = matchup(s.stats, e);
                const active = s.row.targetEnemyId === e.id;
                const challenge = e.boss && !bossDown;
                const action = !unlocked ? (
                  <span className="muted"><Icon name="lock" /></span>
                ) : active ? (
                  <span className="btn small fighting">Fighting</span>
                ) : (
                  <button
                    className={`btn small${challenge ? ' danger' : ''}`}
                    onClick={() => call(r.setTarget({ enemyId: e.id }).then(() => void (location.hash = '#combat')))}
                  >
                    {challenge ? 'Challenge' : 'Fight'}
                  </button>
                );
                const expanded = open === e.id;
                const known = unlocked && enemyKnown(s, e);
                const look = threat(m);
                return (
                  <Fragment key={e.id}>
                    <tr
                      data-row
                      className={`${active ? 'active' : ''}${e.boss ? ' boss' : ''}${expanded ? ' expanded' : ''}`}
                      onClick={ev => !(ev.target as HTMLElement).closest('button') && setOpen(expanded ? undefined : e.id)}
                    >
                      <td className="name">
                        <span className="caret">▸</span>{e.boss && <Icon name="skull" className="boss" />}
                        {known ? e.name : <span className="muted">{UNKNOWN}</span>}
                        {!known && unlocked && <span className={`unknown-threat ${look.cls}`} title="How it looks against your active loadout">{look.label}</span>}
                      </td>
                      <td>{e.level}</td>
                      <td>{known ? <DmgTag magic={e.damageType === 'Magic'} /> : <span className="muted">?</span>}</td>
                      <td>{known ? e.defense : <span className="muted">?</span>}</td>
                      <td className="num">{known ? fmt(e.hp) : <span className="muted">?</span>}</td>
                      <td className="num">{known ? fmt(e.dps) : <span className="muted">?</span>}</td>
                      <td className="num">{fmt(s.kills.get(e.id) ?? 0)}</td>
                      <td className="actions">{action}</td>
                    </tr>
                    {expanded && (
                      <tr className="detail-row">
                        <td colSpan={8}><EnemyDetail s={s} z={z} e={e} m={m} /></td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="muted hint">Unknown enemies (???) reveal themselves once you fight them. Click an enemy for its rewards and drops. Numbers use your active loadout ({s.active.name}).</p>
      </div>
    </>
  );
});
