import { memo, useRef, useState, type RefObject } from 'react';
import { matchup } from '../../../spacetimedb/src/combat';
import { ENEMIES_BY_ID, ZONES, ZONES_BY_ID, areaIndexOf, bossOf, previousZone, zoneLevel, type AreaDef, type EnemyDef, type ZoneDef } from '../../../spacetimedb/src/data/zones';
import { call, useSticky } from '../../store';
import { fmt } from '../format';
import { Icon } from '../Icon';
import { DefTag, DmgTag, EnemyDetail } from '../enemy';
import { EnemyArt, zoneArtUrl } from '../enemyArt';
import { ViewHeader } from '../shared';
import { UNKNOWN, areaRevealed, areaSecret, enemyKnown, threat, zoneDiscovery, zoneUnlocked } from '../discovery';
import { statsIn, type Snapshot } from '../snapshot';

const levels = (es: EnemyDef[]) => {
  const lo = Math.min(...es.map(e => e.level));
  const hi = Math.max(...es.map(e => e.level));
  return lo === hi ? `Lv ${lo}` : `Lv ${lo}–${hi}`;
};
const enemiesOf = (a: AreaDef) => a.enemies.map(id => ENEMIES_BY_ID.get(id)!.enemy);

/** Map glyphs by area ID (placeholders, Icon.tsx). */
const AREA_ICONS: Record<number, string> = {
  11: 'a-field', 12: 'a-mill', 13: 'a-tent',
  15: 'a-bell',
  21: 'a-road', 22: 'a-tree', 23: 'a-den',
  31: 'a-mountain', 32: 'a-shrine', 33: 'a-gate',
  41: 'a-glade', 42: 'a-well', 43: 'a-dome',
  45: 'a-flower',
};

/**
 * A zone as a map (zones.md, "Zone map"): areas joined by paths, shown as ??? until the
 * player fights there. Every area of an open zone can
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
  const here = s.target?.zone === z ? z.areas[areaIndexOf(z, s.target.enemy.id)] : undefined;
  // Secret areas stay off the map until rumoured.
  const shown = z.areas.filter(a => !a.secret || (unlocked && areaSecret(s, a) !== 'hidden'));
  const area = shown.find(a => a.id === picked) ?? here ?? z.areas[0];
  const revealed = new Set(z.areas.filter(a => areaRevealed(s, z, a)).map(a => a.id));
  const rumour = (a: AreaDef) => !!a.secret && !revealed.has(a.id);
  const byId = new Map(shown.map(a => [a.id, a]));
  const art = zoneArtUrl(z.id);

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
            <h2>{z.name} <span className="muted">{levels(z.enemies.filter(e => !e.secret))}</span></h2>
            <p className="muted">{z.blurb}</p>
            {s.killedZones.has(z.id) && <p className="muted"><em>{z.bossLine}</em></p>}
          </div>
          {!unlocked && (
            <div className="lock-note">
              <Icon name="lock" />
              {[
                ...(prev && !s.killedZones.has(prev.id) ? [`Defeat ${prevBoss?.name ?? 'the previous boss'}`] : []),
                ...(s.level < zoneLevel(z) ? [`reach level ${zoneLevel(z)}`] : []),
              ].join(' and ').replace(/^./, c => c.toUpperCase())} to unlock
            </div>
          )}
        </div>
        {unlocked && (
          <p className="muted discovered" title="Areas are revealed by fighting in them, enemies by killing them, items by seeing them drop (salvaged drops count)">
            Discovered: areas {revealed.size}/{z.areas.filter(a => !a.secret || revealed.has(a.id)).length} · enemies {found.enemies}/{found.enemyTotal} · items {found.items}/{found.itemTotal}
          </p>
        )}
        <div className="zones-layout">
          <div className={`zmap zmap-${z.id}${art ? ' has-art' : ''}${unlocked ? '' : ' locked'}`} style={art ? { backgroundImage: `url(${art})` } : undefined}>
            {/* Spots sit on an inset stage, so a marker and its label always fit inside the map. */}
            <div className="zmap-stage">
              <svg className="zmap-paths" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                {z.links.filter(([from, to]) => byId.has(from) && byId.has(to)).map(([from, to]) => {
                  const a = byId.get(from)!;
                  const b = byId.get(to)!;
                  const known = revealed.has(from) && revealed.has(to);
                  return <line key={`${from}-${to}`} className={known ? 'known' : ''} x1={a.x} y1={a.y} x2={b.x} y2={b.y} vectorEffect="non-scaling-stroke" />;
                })}
              </svg>
              {shown.map(a => {
                const known = revealed.has(a.id);
                const lair = a.enemies.some(id => ENEMIES_BY_ID.get(id)!.enemy.boss);
                const cls = ['spot', known ? 'known' : rumour(a) ? 'rumour' : 'fog', a.secret && 'secret', lair && 'lair', a === here && 'here', a === area && 'picked']
                  .filter(Boolean).join(' ');
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
                      {a === here ? <Icon name="pin" /> : lair ? <Icon name="skull" /> : rumour(a) ? <Icon name="sparkles" /> : known ? <Icon name={AREA_ICONS[a.id] ?? 'map'} /> : '?'}
                    </span>
                    <span className="spot-label">
                      {known ? a.name : UNKNOWN}
                      {!rumour(a) && <small>{levels(enemiesOf(a))}</small>}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          {rumour(area) ? (
            <div className="area-panel" ref={panel}>
              <div className="area-title"><h3>{UNKNOWN}</h3><span className="secret-tag"><Icon name="sparkles" />Rumour</span></div>
              <p className="area-blurb rumour-text">{area.secret!.rumour}</p>
              <p className="muted">Something is hidden here. The {ENEMIES_BY_ID.get(area.secret!.enemyId)!.enemy.name}s seem drawn to it.</p>
            </div>
          ) : (
            <AreaPanel panelRef={panel} s={s} z={z} a={area} known={revealed.has(area.id)} here={area === here} unlocked={unlocked} open={open} setOpen={setOpen} />
          )}
        </div>
        <p className="muted hint">
          Tap an area on the map, then an enemy for its rewards and drops. Fight in a ??? area or enemy to discover it. Threat and numbers use your active loadout ({s.active.name}).
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
        {a.secret && <span className="secret-tag"><Icon name="sparkles" />Secret</span>}
        {here && <span className="here-tag">You are here</span>}
        <span className="area-levels muted">{levels(enemies)}</span>
      </div>
      <p className="area-blurb muted">
        {known ? a.blurb : boss ? `Lair of ${boss.name}.` : 'Unexplored. Fight here to discover it.'}
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
  const m = matchup(statsIn(s), e);
  const active = !s.skilling && s.row.targetEnemyId === e.id;
  const challenge = e.boss && !s.killedZones.has(z.id);
  const known = enemyKnown(s, e);
  const look = threat(m);
  const kills = s.kills.get(e.id) ?? 0;
  return (
    <li className={`foe${active ? ' active' : ''}${e.boss ? ' boss' : ''}${open ? ' open' : ''}`}>
      <div className="foe-row" onClick={ev => !(ev.target as HTMLElement).closest('button') && toggle()}>
        <Icon name="chevron" className="caret" />
        {known && <EnemyArt enemyId={e.id} className="foe-art" />}
        <div className="foe-info">
          <div className="foe-name">
            {e.boss && <Icon name="skull" className="boss" />}
            {known ? e.name : <span className="muted">{UNKNOWN}</span>}
            <span className={`threat ${look.cls}`} title="How it looks against your active loadout">{look.label}</span>
          </div>
          <div className="tags foe-tags">
            <span className="tag">Lv {e.level}</span>
            {known ? (
              <>
                <DmgTag magic={e.damageType === 'Magic'} />
                <DefTag defense={e.defense} />
              </>
            ) : (
              <span className="tag" title="Damage and defense: fight it to find out">?</span>
            )}
          </div>
          {(known || kills > 0) && (
            <div className="foe-meta muted">
              {known && `HP ${fmt(e.hp)} · DPS ${fmt(e.dps)}`}
              {known && kills > 0 && ' · '}
              {kills > 0 && <span title="Lifetime kills, online and offline">{fmt(kills)} kills</span>}
            </div>
          )}
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
