import { memo, useState } from 'react';
import { matchup } from '../../../spacetimedb/src/combat';
import { ENEMIES_BY_ID, PATH_KILLS, ZONES, ZONES_BY_ID, areaIndexOf, bossOf, previousZone, type EnemyDef, type ZoneDef } from '../../../spacetimedb/src/data/zones';
import { call, useSticky } from '../../store';
import { fmt } from '../format';
import { Icon } from '../Icon';
import { EnemyDetail } from '../enemy';
import { ViewHeader } from '../shared';
import { UNKNOWN, areaPaths, enemyKnown, threat, zoneDiscovery, zoneUnlocked } from '../discovery';
import type { Snapshot } from '../snapshot';

const levels = (es: EnemyDef[]) => {
  const lo = Math.min(...es.map(e => e.level));
  const hi = Math.max(...es.map(e => e.level));
  return lo === hi ? `Lv ${lo}` : `Lv ${lo}–${hi}`;
};
const enemiesOf = (ids: number[]) => ids.map(id => ENEMIES_BY_ID.get(id)!.enemy);

/**
 * A zone as a path of areas (zones.md, "Zone map"), drawn top to bottom so it reads the
 * same on a phone and a desktop: reached areas list their enemies, the next one shows
 * the kills that find it, and the rest stay ???.
 */
export const ZonesView = memo(function ZonesView({ s }: { s: Snapshot }) {
  const [zoneId, setZoneId] = useSticky<number | undefined>('zoneId', undefined);
  const [open, setOpen] = useState<number>();
  const z = ZONES_BY_ID.get(zoneId ?? s.row.zoneId) ?? ZONES[0];
  const unlocked = zoneUnlocked(s, z);
  const prevBoss = previousZone(z) && bossOf(previousZone(z)!);
  const found = zoneDiscovery(s, z);
  const paths = areaPaths(s, z);
  const here = s.target?.zone === z ? areaIndexOf(z, s.target.enemy.id) : -1;
  const boss = bossOf(z)!;

  return (
    <>
      <ViewHeader title="Zones" icon="map" />
      <div className="seg wrap">
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
            <h2>{z.name} <span className="muted">{levels(z.enemies)}</span></h2>
            <p className="muted">{z.blurb}</p>
            {unlocked && (
              <p className="muted discovered" title="Areas are found by fighting in the one before; enemies are revealed by killing them, items by seeing them drop (salvaged drops count)">
                Discovered: areas {paths.filter(p => p.reached).length}/{z.areas.length} · enemies {found.enemies}/{found.enemyTotal} · items {found.items}/{found.itemTotal}
              </p>
            )}
          </div>
          {!unlocked && (
            <div className="lock-note"><Icon name="lock" />Defeat {prevBoss?.name ?? 'the previous boss'} to unlock</div>
          )}
        </div>
        <ol className="trail">
          {z.areas.map((a, i) => {
            const reached = paths[i].reached;
            // The area being searched for: the one right after the furthest reached.
            const next = unlocked && !reached && (i === 0 || paths[i - 1].reached);
            const lair = a.enemies.includes(boss.id);
            const enemies = enemiesOf(a.enemies);
            const cls = [
              'area',
              reached ? 'reached' : next ? 'next' : 'hidden',
              i === here && 'here',
              lair && 'lair',
              paths[i + 1]?.reached && 'path-open',
            ].filter(Boolean).join(' ');
            return (
              <li key={a.id} className={cls}>
                <div className="area-mark" aria-hidden="true">
                  {i === here ? <Icon name="pin" /> : lair ? <Icon name="skull" /> : reached ? i + 1 : <Icon name="lock" />}
                </div>
                <div className="area-body">
                  <div className="area-title">
                    <h3>{reached ? a.name : UNKNOWN}</h3>
                    {i === here && <span className="here-tag">You are here</span>}
                    <span className="area-levels muted">{levels(enemies)}</span>
                  </div>
                  {reached ? (
                    <>
                      <p className="area-blurb muted">{a.blurb}</p>
                      <ul className="foes">
                        {enemies.map(e => (
                          <Foe key={e.id} s={s} z={z} e={e} open={open === e.id} toggle={() => setOpen(open === e.id ? undefined : e.id)} />
                        ))}
                      </ul>
                    </>
                  ) : next && i > 0 ? (
                    <div className="path-hint">
                      <div>Defeat {PATH_KILLS} enemies in <strong>{z.areas[i - 1].name}</strong> to find the way.</div>
                      <div className="path-progress">
                        <div className="path-bar"><div style={{ width: `${(paths[i].kills / PATH_KILLS) * 100}%` }} /></div>
                        <span className="num">{paths[i].kills}/{PATH_KILLS}</span>
                      </div>
                    </div>
                  ) : (
                    <p className="area-blurb muted">{lair ? <>Lair of {boss.name}.</> : 'Unexplored.'}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
        <p className="muted hint">
          Tap an enemy for its rewards and drops. Unknown enemies (???) reveal themselves once you fight them. Threat and numbers use your active loadout ({s.active.name}).
        </p>
      </div>
    </>
  );
});

function Foe({ s, z, e, open, toggle }: { s: Snapshot; z: ZoneDef; e: EnemyDef; open: boolean; toggle: () => void }) {
  const m = matchup(s.stats, e);
  const active = s.row.targetEnemyId === e.id;
  const challenge = e.boss && !s.killedZones.has(z.id);
  const known = enemyKnown(s, e);
  const look = threat(m);
  const kills = s.kills.get(e.id) ?? 0;
  const meta = known
    ? [`Lv ${e.level}`, e.damageType === 'Magic' ? 'Magic' : 'Phys', e.defense, `HP ${fmt(e.hp)}`, `DPS ${fmt(e.dps)}`]
    : [`Lv ${e.level}`];
  return (
    <li className={`foe${active ? ' active' : ''}${e.boss ? ' boss' : ''}${open ? ' open' : ''}`}>
      <div className="foe-row" onClick={ev => !(ev.target as HTMLElement).closest('button') && toggle()}>
        <Icon name="chevron" className="caret" />
        <div className="foe-info">
          <div className="foe-name">
            {e.boss && <Icon name="skull" className="boss" />}
            {known ? e.name : <span className="muted">{UNKNOWN}</span>}
            <span className={`threat ${look.cls}`} title="How it looks against your active loadout">{look.label}</span>
          </div>
          <div className="foe-meta muted">
            {meta.join(' · ')}
            {kills > 0 && <> · <span title="Lifetime kills, online and offline">{fmt(kills)} kills</span></>}
          </div>
        </div>
        {active ? (
          <span className="btn small fighting">Fighting</span>
        ) : (
          <button
            className={`btn small${challenge ? ' danger' : ''}`}
            onClick={() => call(s.conn.reducers.setTarget({ enemyId: e.id }).then(() => void (location.hash = '#combat')))}
          >
            {challenge ? 'Challenge' : 'Fight'}
          </button>
        )}
      </div>
      {open && (
        <div className="foe-detail">
          <EnemyDetail s={s} z={z} e={e} m={m} />
        </div>
      )}
    </li>
  );
}
