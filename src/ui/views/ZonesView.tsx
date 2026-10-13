import { memo, useRef, useState, type RefObject } from 'react';
import { matchup } from '../../../spacetimedb/src/combat';
import { ENEMIES_BY_ID, ZONES, ZONES_BY_ID, areaIndexOf, bossOf, previousZone, type AreaDef, type EnemyDef, type ZoneDef } from '../../../spacetimedb/src/data/zones';
import { call, useSticky } from '../../store';
import { fmt, pct } from '../format';
import { Icon } from '../Icon';
import { EnemyDetail } from '../enemy';
import { ViewHeader } from '../shared';
import { UNKNOWN, areaRevealed, enemyKnown, exploration, threat, zoneDiscovery, zoneUnlocked } from '../discovery';
import type { Snapshot } from '../snapshot';

const levels = (es: EnemyDef[]) => {
  const lo = Math.min(...es.map(e => e.level));
  const hi = Math.max(...es.map(e => e.level));
  return lo === hi ? `Lv ${lo}` : `Lv ${lo}–${hi}`;
};
const enemiesOf = (a: AreaDef) => a.enemies.map(id => ENEMIES_BY_ID.get(id)!.enemy);

/** Map glyphs by area ID (placeholders, Icon.tsx). */
const AREA_ICONS: Record<number, string> = {
  11: 'a-field', 12: 'a-mill', 13: 'a-tent',
  21: 'a-road', 22: 'a-tree', 23: 'a-den',
  31: 'a-mountain', 32: 'a-shrine', 33: 'a-gate',
};

/**
 * A zone as a map (zones.md, "Zone map"): areas joined by paths, shown as ??? until the
 * zone's kills reveal them or the player fights there. Every area of an open zone can
 * be fought in. Tapping an area opens its panel with the enemies.
 */
export const ZonesView = memo(function ZonesView({ s }: { s: Snapshot }) {
  const [zoneId, setZoneId] = useSticky<number | undefined>('zoneId', undefined);
  const [picked, setPicked] = useState<number>();
  const [open, setOpen] = useState<number>();
  const panel = useRef<HTMLDivElement>(null);
  const z = ZONES_BY_ID.get(zoneId ?? s.row.zoneId) ?? ZONES[0];
  const unlocked = zoneUnlocked(s, z);
  const prev = previousZone(z);
  const prevBoss = prev && bossOf(prev);
  const found = zoneDiscovery(s, z);
  const explored = exploration(s, z);
  const here = s.target?.zone === z ? z.areas[areaIndexOf(z, s.target.enemy.id)] : undefined;
  const area = z.areas.find(a => a.id === picked) ?? here ?? z.areas[0];
  const revealed = new Set(z.areas.filter(a => areaRevealed(s, z, a)).map(a => a.id));
  const byId = new Map(z.areas.map(a => [a.id, a]));

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
              setPicked(undefined);
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
          </div>
          {!unlocked && (
            <div className="lock-note"><Icon name="lock" />Defeat {prevBoss?.name ?? 'the previous boss'} to unlock</div>
          )}
        </div>
        {unlocked && (
          <div className="explore" title="Every kill in the zone explores it and reveals more of the map. Fighting in an area reveals it at once.">
            <div className="explore-text">
              <span>Explored <strong>{pct(explored.share)}</strong></span>
              <span className="muted">{explored.toNext !== undefined ? `next area in ${fmt(explored.toNext)} kills` : 'map complete'}</span>
            </div>
            <div className="explore-bar"><div style={{ width: `${explored.share * 100}%` }} /></div>
            <p className="muted discovered">Discovered: areas {revealed.size}/{z.areas.length} · enemies {found.enemies}/{found.enemyTotal} · items {found.items}/{found.itemTotal}</p>
          </div>
        )}
        <div className="zones-layout">
          <div className={`zmap zmap-${z.id}${unlocked ? '' : ' locked'}`}>
            <svg className="zmap-paths" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {z.links.map(([from, to]) => {
                const a = byId.get(from)!;
                const b = byId.get(to)!;
                const known = revealed.has(from) && revealed.has(to);
                return <line key={`${from}-${to}`} className={known ? 'known' : ''} x1={a.x} y1={a.y} x2={b.x} y2={b.y} vectorEffect="non-scaling-stroke" />;
              })}
            </svg>
            {z.areas.map(a => {
              const known = revealed.has(a.id);
              const lair = a.enemies.some(id => ENEMIES_BY_ID.get(id)!.enemy.boss);
              const cls = ['spot', known ? 'known' : 'fog', lair && 'lair', a === here && 'here', a === area && 'picked'].filter(Boolean).join(' ');
              return (
                <button
                  key={a.id}
                  className={cls}
                  style={{ left: `${a.x}%`, top: `${a.y}%` }}
                  aria-pressed={a === area}
                  onClick={() => {
                    setPicked(a.id);
                    setOpen(undefined);
                    // On a phone the panel sits below the map: bring it into view.
                    if (matchMedia('(max-width: 900px)').matches) requestAnimationFrame(() => panel.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
                  }}
                >
                  <span className="spot-mark">
                    {a === here ? <Icon name="pin" /> : lair ? <Icon name="skull" /> : known ? <Icon name={AREA_ICONS[a.id] ?? 'map'} /> : '?'}
                  </span>
                  <span className="spot-label">
                    {known ? a.name : UNKNOWN}
                    <small>{levels(enemiesOf(a))}</small>
                  </span>
                </button>
              );
            })}
          </div>
          <AreaPanel panelRef={panel} s={s} z={z} a={area} known={revealed.has(area.id)} here={area === here} unlocked={unlocked} open={open} setOpen={setOpen} />
        </div>
        <p className="muted hint">
          Tap an area on the map, then an enemy for its rewards and drops. ??? areas and enemies can still be fought: that reveals them. Threat and numbers use your active loadout ({s.active.name}).
        </p>
      </div>
    </>
  );
});

function AreaPanel({ panelRef, s, z, a, known, here, unlocked, open, setOpen }: {
  panelRef: RefObject<HTMLDivElement | null>;
  s: Snapshot;
  z: ZoneDef;
  a: AreaDef;
  known: boolean;
  here: boolean;
  unlocked: boolean;
  open: number | undefined;
  setOpen: (id: number | undefined) => void;
}) {
  const enemies = enemiesOf(a);
  const boss = enemies.find(e => e.boss);
  return (
    <div className="area-panel" ref={panelRef}>
      <div className="area-title">
        <h3>{known ? a.name : UNKNOWN}</h3>
        {here && <span className="here-tag">You are here</span>}
        <span className="area-levels muted">{levels(enemies)}</span>
      </div>
      <p className="area-blurb muted">
        {known ? a.blurb : boss ? `Lair of ${boss.name}. Explore the zone to learn more.` : 'Unexplored. Keep fighting in the zone to map it, or go and see.'}
      </p>
      {unlocked ? (
        <ul className="foes">
          {enemies.map(e => (
            <Foe key={e.id} s={s} z={z} e={e} open={open === e.id} toggle={() => setOpen(open === e.id ? undefined : e.id)} />
          ))}
        </ul>
      ) : (
        <p className="muted">This zone is still locked.</p>
      )}
    </div>
  );
}

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
