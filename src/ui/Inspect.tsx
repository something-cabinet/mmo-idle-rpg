// Inspecting another player from the online list: their worn gear and stat sheet.
// The server sends the inspected character through the `inspected_*` views (reducers/inspect.ts).

import { useEffect, useMemo, useState } from 'react';
import { DuelPanel, type Duelist } from './Duel';
import type { DbConnection } from '../module_bindings';
import { combatStats } from '../../spacetimedb/src/combat';
import { ENEMIES_BY_ID } from '../../spacetimedb/src/data/zones';
import { SKILLS_BY_ID } from '../../spacetimedb/src/data/skills';
import { call } from '../store';
import { Icon } from './Icon';
import { PlayerName } from './PlayerName';
import { ItemCard } from './items';
import { CardHead, EffectsCard, Modal, StatBoard } from './shared';
import { gearFor } from './snapshot';
import { statSheet } from './statSheet';
import { SLOT_GRID, SlotCell } from './views/EquipmentView';

export type InspectTab = 'gear' | 'duel';

export function InspectPopup({ conn, characterId, version, me, tab: initialTab = 'gear', onClose }: {
  conn: DbConnection;
  characterId: bigint;
  version: number;
  /** You, for a duel. */
  me: Duelist;
  tab?: InspectTab;
  onClose: () => void;
}) {
  const [openSlot, setOpenSlot] = useState<number>();
  // Duels are with friends only.
  const friend = [...conn.db.myFriends.iter()].some(f => f.friendId === characterId);
  const [tab, setTab] = useState<InspectTab>(friend ? initialTab : 'gear');
  useEffect(() => {
    call(conn.reducers.inspectCharacter({ characterId }));
    return () => call(conn.reducers.inspectCharacter({ characterId: 0n }));
  }, [conn, characterId]);

  const view = useMemo(() => {
    const ch = [...conn.db.inspectedCharacter.iter()][0];
    // Until the server answers, the views still hold the previous character (or nothing).
    if (!ch || ch.id !== characterId) return undefined;
    const lo = [...conn.db.inspectedLoadout.iter()][0];
    const items = new Map([...conn.db.inspectedItems.iter()].map(i => [i.id, i]));
    const gear = gearFor(lo?.slots ?? [], items);
    const stats = combatStats(ch.level, gear);
    return { ch, gear, stats, sheet: statSheet(ch.level, gear, stats) };
  }, [conn, characterId, version]);

  const name = view?.ch.name ?? [...conn.db.presence.iter()].find(p => p.characterId === characterId)?.characterName ?? 'Player';
  const target = view && ENEMIES_BY_ID.get(view.ch.targetEnemyId);
  const skill = view && SKILLS_BY_ID.get(view.ch.activitySkill);
  const opened = openSlot !== undefined ? view?.gear[openSlot] : undefined;

  return (
    <Modal onClose={onClose} className="item-popup inspect-popup">
      <CardHead title={<><PlayerName conn={conn} id={characterId} name={name} />{view && ` · Lv ${view.ch.level}`}</>}>
        <button className="btn" onClick={onClose}>
          <Icon name="x" />
          Close
        </button>
      </CardHead>
      {!view ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <p className="muted">{skill ? `Skilling: ${skill.name}` : target ? `Fighting ${target.zone.name} › ${target.enemy.name}` : 'Idle'}</p>
          {friend && (
            <div className="seg">
              <button className={`seg-btn${tab === 'gear' ? ' active' : ''}`} onClick={() => setTab('gear')}>Gear</button>
              <button className={`seg-btn${tab === 'duel' ? ' active' : ''}`} onClick={() => setTab('duel')}>
                <Icon name="swords" />Duel
              </button>
            </div>
          )}
          {tab === 'duel' ? (
            <DuelPanel conn={conn} me={me} foe={{ id: characterId, name, level: view.ch.level, stats: view.stats }} />
          ) : (
          <>
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
          <p className="muted hint">
            Click a slot to see its item. Evasion and DPS are against an average enemy of their level (Lv {view.ch.level}).
          </p>
          </>
          )}
        </>
      )}
    </Modal>
  );
}
