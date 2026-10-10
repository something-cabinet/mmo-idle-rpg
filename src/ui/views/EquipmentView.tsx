import { memo, useState } from 'react';
import type { Item } from '../../module_bindings/types';
import { combatStats, matchup } from '../../../spacetimedb/src/combat';
import { SLOTS } from '../../../spacetimedb/src/data/bases';
import { fitsSlot, placeItem } from '../../../spacetimedb/src/equip';
import { rarityRank } from '../../../spacetimedb/src/loot';
import { call, useSticky } from '../../store';
import { fmt } from '../format';
import { Icon } from '../Icon';
import { EmptyCard, ItemCard, ItemTile, itemName, rarityCls } from '../items';
import {
  CardHead, CompareTable, EffectsCard, Modal, SLOT_LABEL, SlotItemName, StatRows, SwapPreview, ViewHeader,
  fightLine, loadoutNote, openCraft, totals, type Loadout,
} from '../shared';
import { gearFor, type Snapshot } from '../snapshot';

interface Candidate {
  it: Item;
  /** The loadout's slots after the swap, or why it can't happen. */
  next: bigint[] | string;
  /** DPS change against the target; undefined without one. */
  delta?: number;
}

/** Items that can replace `slot`, best DPS gain against the target first. */
function candidates(s: Snapshot, lo: Loadout, slot: number): Candidate[] {
  const enemy = s.target?.enemy;
  const now = enemy && matchup(combatStats(s.level, gearFor(lo.slots, s.items)), enemy);
  return [...s.items.values()]
    .filter(it => fitsSlot(it.baseId, slot) && it.id !== lo.slots[slot])
    .map(it => {
      const next = placeItem(lo.slots, slot, it, id => s.items.get(id));
      const m = enemy && typeof next !== 'string' ? matchup(combatStats(s.level, gearFor(next, s.items)), enemy) : undefined;
      return { it, next, delta: m && now ? m.dps - now.dps : undefined };
    })
    .sort((a, b) => (b.delta ?? -1e18) - (a.delta ?? -1e18) || b.it.tier - a.it.tier || rarityRank(b.it.rarity.tag) - rarityRank(a.it.rarity.tag));
}

function DeltaBadge({ c }: { c: Candidate }) {
  if (typeof c.next === 'string') return <span className="tile-badge muted">✖</span>;
  if (c.delta === undefined || Math.abs(c.delta) < 1e-6) return null;
  return c.delta > 0 ? <span className="tile-badge c-ok">▲</span> : <span className="tile-badge c-bad">▼</span>;
}

/** Popup for an equipment slot: the equipped item, or (after "Change equipment") the items that can replace it. */
function SlotPopup({ s, lo, slot, onClose }: { s: Snapshot; lo: Loadout; slot: number; onClose: () => void }) {
  const [changing, setChanging] = useState(false);
  const [pickId, setPickId] = useState<bigint>();
  const r = s.conn.reducers;
  const cur = s.items.get(lo.slots[slot]);

  let body: React.ReactNode;
  if (!changing) {
    body = (
      <>
        {cur ? <ItemCard it={cur} note={loadoutNote(s, cur)} /> : <EmptyCard text="Nothing equipped" />}
        <div className="popup-actions">
          <button className="btn primary" onClick={() => setChanging(true)}>Change equipment</button>
          {cur && (
            <>
              <button className="btn small" onClick={() => call(r.unequip({ loadout: lo.index, slot }))}>Unequip</button>
              <button className="btn small" onClick={() => openCraft(cur.id)}><Icon name="hammer" />Craft…</button>
            </>
          )}
        </div>
      </>
    );
  } else {
    const list = candidates(s, lo, slot);
    const pick = list.find(c => c.it.id === pickId) ?? list.find(c => typeof c.next !== 'string') ?? list[0];
    body = (
      <>
        <div className="picker-tiles">
          {list.length ? (
            list.map(c => (
              <ItemTile
                key={String(c.it.id)}
                it={c.it}
                selected={c === pick}
                badge={<DeltaBadge c={c} />}
                title={`${c.it.rarity.tag} ${itemName(c.it)}${typeof c.next === 'string' ? ` · ${c.next}` : c.delta !== undefined ? ` · DPS ${c.delta >= 0 ? '+' : ''}${fmt(c.delta)}` : ''}`}
                onClick={() => setPickId(c.it.id)}
              />
            ))
          ) : (
            <p className="muted">No other items fit this slot.</p>
          )}
        </div>
        {pick && <SwapPreview s={s} lo={lo} slot={slot} it={pick.it} />}
        <div className="popup-actions">
          <button className="btn small ghost" onClick={() => setChanging(false)}>Back</button>
          <span className="spacer" />
          {pick && (
            <button
              className="btn primary"
              disabled={typeof pick.next === 'string'}
              onClick={() => {
                call(r.equip({ loadout: lo.index, slot, itemId: pick.it.id }));
                setChanging(false);
                setPickId(undefined);
              }}
            >
              <Icon name="shield" />Equip
            </button>
          )}
        </div>
        {s.target && <p className="muted hint">▲ / ▼: DPS against {s.target.enemy.name} goes up / down with {lo.name}.</p>}
      </>
    );
  }
  return (
    <Modal onClose={onClose} className="item-popup">
      <CardHead title={`${SLOT_LABEL[slot]}${changing ? ' · Change equipment' : ''}`}>
        <button className="btn small ghost" onClick={onClose}>Close</button>
      </CardHead>
      {body}
    </Modal>
  );
}

/** Faded glyph shown in an empty slot. */
const SLOT_ICON = ['i-sword', 'i-shield', 'i-head', 'i-chest', 'i-hands', 'i-feet', 'i-ring', 'i-ring', 'i-amulet'];

function SlotCell({ gear, i, selected, onOpen }: { gear: (Item | undefined)[]; i: number; selected: boolean; onOpen: () => void }) {
  const it = gear[i];
  const blocked = !it && i === 1 && gear[0]?.weapon?.twoHanded;
  return (
    <div className="slot-cell">
      <div className="slot-label">{SLOT_LABEL[i]}</div>
      {it ? (
        <ItemTile it={it} selected={selected} onClick={onOpen} />
      ) : (
        <button className={`item-tile empty${selected ? ' selected' : ''}`} title={`${SLOT_LABEL[i]}: empty`} onClick={onOpen}>
          <Icon name={SLOT_ICON[i]} className="tile-ico" />
        </button>
      )}
      <div className="slot-name">
        {it ? <span className={`c-${rarityCls(it.rarity.tag)}`}>{itemName(it)}</span> : <span className="muted">{blocked ? 'Two-handed' : 'Empty'}</span>}
      </div>
    </div>
  );
}

function AutoSummary({ s, lo, before, onClose }: { s: Snapshot; lo: Loadout; before: bigint[]; onClose: () => void }) {
  const changes = lo.slots.map((id, i) => [i, before[i] ?? 0n, id] as const).filter(([, b, n]) => b !== n);
  return (
    <div className="card" id="auto-summary">
      <CardHead title={`Auto-equip · ${lo.profile.tag}`}>
        <button className="btn small ghost" onClick={onClose}>Dismiss</button>
      </CardHead>
      {changes.length ? (
        <>
          {changes.map(([i, b, n]) => (
            <div className="stat-row" key={i}>
              <span>{SLOT_LABEL[i]}</span>
              <strong><SlotItemName s={s} id={b} /> → <SlotItemName s={s} id={n} /></strong>
            </div>
          ))}
          <div className="card-head" style={{ marginTop: 12 }}>
            <h2>Totals before → after</h2>
            {s.target && <span className="muted">vs {s.target.enemy.name}</span>}
          </div>
          <CompareTable before={totals(s, before)} after={totals(s, lo.slots)} />
        </>
      ) : (
        <p className="muted">Already the best gear you own for this profile: nothing changed.</p>
      )}
    </div>
  );
}

export const EquipmentView = memo(function EquipmentView({ s }: { s: Snapshot }) {
  const [loadoutIdx, setLoadoutIdx] = useSticky<number | undefined>('equipLoadout', undefined);
  const [openSlot, setOpenSlot] = useState<number>();
  const [summary, setSummary] = useState<{ loadout: number; before: bigint[] }>();
  const r = s.conn.reducers;
  const lo = s.loadouts.find(l => l.index === (loadoutIdx ?? s.row.activeLoadout)) ?? s.active;
  const gear = gearFor(lo.slots, s.items);
  const stats = combatStats(s.level, gear);
  const m = s.target && matchup(stats, s.target.enemy);
  const isActive = lo.index === s.row.activeLoadout;

  return (
    <>
      <ViewHeader title="Equipment" icon="shield" />
      <div className="toolbar card">
        <span className="toolbar-label">Loadout</span>
        <div className="seg">
          {s.loadouts.map(l => (
            <button
              key={l.index}
              className={`seg-btn${l.index === lo.index ? ' active' : ''}`}
              onClick={() => {
                setLoadoutIdx(l.index);
                setOpenSlot(undefined);
                setSummary(undefined);
              }}
            >
              {l.index + 1} {l.name}
              {l.index === s.row.activeLoadout ? ' ✔' : ''}
            </button>
          ))}
        </div>
        {isActive ? (
          <span className="tag ok">In use</span>
        ) : (
          <button className="btn small" onClick={() => call(r.switchLoadout({ loadout: lo.index }))}>Use this loadout</button>
        )}
        <button
          className="btn small ghost"
          onClick={() => {
            const name = prompt('Loadout name', lo.name);
            if (name !== null) call(r.renameLoadout({ loadout: lo.index, name }));
          }}
        >
          Rename
        </button>
        <span className="spacer" />
        <span className="toolbar-label">Profile</span>
        <select value={lo.profile.tag} onChange={e => call(r.setProfile({ loadout: lo.index, profile: { tag: e.target.value as 'Damage' | 'Survival' | 'Loot' } }))}>
          {['Damage', 'Survival', 'Loot'].map(p => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <button
          className="btn primary small"
          onClick={() => {
            const before = [...lo.slots];
            setOpenSlot(undefined);
            call(r.autoEquip({ loadout: lo.index }).then(() => setSummary({ loadout: lo.index, before })));
          }}
        >
          <Icon name="zap" />Auto-equip
        </button>
      </div>
      <div className="equip-layout">
        <div className="card equip-slots">
          {SLOTS.map((_, i) => (
            <SlotCell key={i} gear={gear} i={i} selected={openSlot === i} onOpen={() => setOpenSlot(i)} />
          ))}
        </div>
        <div className="card">
          <CardHead title="Totals">{s.target && <span className="muted">vs {s.target.enemy.name}</span>}</CardHead>
          <StatRows rows={totals(s, lo.slots).map(t => [t.label, t.show(t.value)])} />
          <p className={m?.viable ? 'c-ok' : 'c-bad'}>{fightLine(m)}</p>
        </div>
      </div>
      {summary && summary.loadout === lo.index && <AutoSummary s={s} lo={lo} before={summary.before} onClose={() => setSummary(undefined)} />}
      <EffectsCard effects={stats.effects} />
      <p className="muted hint">Click a slot to see its item or change it. Auto-equip scores against a reference enemy of your level, not your target.</p>
      {openSlot !== undefined && <SlotPopup key={`${lo.index}:${openSlot}`} s={s} lo={lo} slot={openSlot} onClose={() => setOpenSlot(undefined)} />}
    </>
  );
});
