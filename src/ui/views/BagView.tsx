import { memo, useState } from 'react';
import type { Item } from '../../module_bindings/types';
import { bagExpansionCost } from '../../../spacetimedb/src/craft';
import { SLOTS, base, type Slot } from '../../../spacetimedb/src/data/bases';
import { fitsSlot, placeItem } from '../../../spacetimedb/src/equip';
import { BAG_MAX } from '../../../spacetimedb/src/game';
import { RARITIES, rarityRank, salvageValue, type RarityName } from '../../../spacetimedb/src/loot';
import { call, useSticky } from '../../store';
import { fmtBig } from '../format';
import { Icon } from '../Icon';
import { ItemTile, itemName, rarityCls } from '../items';
import { CardHead, Modal, SLOT_FILTERS, SLOT_LABEL, SwapPreview, ViewHeader, openCraft, toggle } from '../shared';
import type { Snapshot } from '../snapshot';

type BagSort = 'newest' | 'rarity' | 'tier' | 'slot';


/** The bag, filtered (an empty selection means any) and sorted. */
function sortedBag(s: Snapshot, sort: BagSort, rarities: readonly RarityName[], slots: readonly Slot[]): Item[] {
  const items = s.bag.filter(it =>
    (!rarities.length || rarities.includes(it.rarity.tag)) && (!slots.length || slots.includes(base(it.baseId).slots[0])));
  const by: Record<BagSort, (a: Item, b: Item) => number> = {
    newest: (a, b) => (a.id < b.id ? 1 : -1),
    rarity: (a, b) => rarityRank(b.rarity.tag) - rarityRank(a.rarity.tag) || b.tier - a.tier,
    tier: (a, b) => b.tier - a.tier || rarityRank(b.rarity.tag) - rarityRank(a.rarity.tag),
    slot: (a, b) => SLOTS.indexOf(base(a.baseId).slots[0]) - SLOTS.indexOf(base(b.baseId).slots[0]) || b.tier - a.tier,
  };
  return items.sort(by[sort]);
}

/** Slots of the active loadout the item can go in. */
const fittingSlots = (it: Item) => SLOTS.map((_, i) => i).filter(i => fitsSlot(it.baseId, i));

/** Popup for one bag item: its stats, the equipped item it would replace, totals before → after, and actions. */
function BagPopup({ s, it, onClose }: { s: Snapshot; it: Item; onClose: () => void }) {
  const lo = s.active;
  const r = s.conn.reducers;
  const slots = fittingSlots(it);
  const [chosen, setChosen] = useState<number>();
  const slot = chosen !== undefined && slots.includes(chosen) ? chosen : (slots.find(i => lo.slots[i] === 0n) ?? slots[0]);
  const blocked = typeof placeItem(lo.slots, slot, it, id => s.items.get(id)) === 'string';
  return (
    <Modal onClose={onClose} className="item-popup">
      <CardHead title={<span className={`c-${rarityCls(it.rarity.tag)}`}>{itemName(it)}</span>}>
        <button className="btn" onClick={onClose}><Icon name="x" />Close</button>
      </CardHead>
      {slots.length > 1 && (
        <div className="seg">
          {slots.map(i => (
            <button key={i} className={`seg-btn${i === slot ? ' active' : ''}`} onClick={() => setChosen(i)}>
              {SLOT_LABEL[i]}
            </button>
          ))}
        </div>
      )}
      <SwapPreview s={s} lo={lo} slot={slot} it={it} changedOnly />
      <div className="popup-actions">
        <button className="btn primary" disabled={blocked} onClick={() => call(r.equip({ loadout: lo.index, slot, itemId: it.id }))}>
          <Icon name="shield" />Equip
        </button>
        <button className="btn" onClick={() => call(r.lockItem({ itemId: it.id, locked: !it.locked }))}>
          <Icon name="lock" />{it.locked ? 'Unlock' : 'Lock'}
        </button>
        <button className="btn" onClick={() => openCraft(it.id)}><Icon name="hammer" />Craft</button>
        <button
          className="btn danger"
          disabled={it.locked}
          title={it.locked ? "Locked items can't be salvaged" : undefined}
          onClick={() => call(r.salvage({ itemIds: [it.id] }))}
        >
          Salvage → +{fmtBig(salvageValue(it.rarity.tag, it.tier))} Essence
        </button>
      </div>
    </Modal>
  );
}

export const BagView = memo(function BagView({ s }: { s: Snapshot }) {
  const [sort, setSort] = useSticky<BagSort>('bagSort', 'newest');
  const [rarities, setRarities] = useSticky<readonly RarityName[]>('bagRarities', []);
  const [slotFilter, setSlotFilter] = useSticky<readonly Slot[]>('bagSlots', []);
  const [selectMode, setSelectMode] = useSticky('bagSelectMode', false);
  const [sel, setSel] = useState<ReadonlySet<bigint>>(new Set());
  /** Last clicked item: the start of a shift-click range. */
  const [anchor, setAnchor] = useState<bigint>();
  const [openId, setOpenId] = useState<bigint>();
  const r = s.conn.reducers;

  const shown = sortedBag(s, sort, rarities, slotFilter);
  // Selections and the popup drop items that left the bag.
  const selected = s.bag.filter(i => sel.has(i.id));
  const open = s.bag.find(i => i.id === openId);
  const anyLocked = selected.some(i => i.locked);
  const essence = selected.reduce((sum, i) => sum + salvageValue(i.rarity.tag, i.tier), 0n);
  const cost = bagExpansionCost(s.row.bagSize);

  function clickTile(ev: React.MouseEvent, id: bigint) {
    const order = shown.map(i => i.id);
    const [from, to] = [order.indexOf(anchor ?? -1n), order.indexOf(id)];
    if (ev.shiftKey && from >= 0 && to >= 0) {
      setSel(new Set([...sel, ...order.slice(Math.min(from, to), Math.max(from, to) + 1)]));
    } else if (ev.ctrlKey || ev.metaKey || selectMode) {
      const next = new Set(sel);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setSel(next);
      setAnchor(id);
    } else {
      setOpenId(id);
      setAnchor(id);
    }
  }

  return (
    <>
      <ViewHeader title="Bag" icon="bag" />
      <div className="toolbar card">
        <span className="toolbar-label">Bag <strong>{s.bag.length}</strong> / {s.row.bagSize}</span>
        {cost === undefined ? (
          <span className="muted">Maximum size ({BAG_MAX})</span>
        ) : (
          <button
            className="btn small ghost"
            disabled={s.gold < cost}
            title={s.gold < cost ? `Need ${fmtBig(cost - s.gold)} more gold` : undefined}
            onClick={() => call(r.expandBag({}), 'Bag expanded by 25 slots')}
          >
            +25 slots · {fmtBig(cost)} gold
          </button>
        )}
        <span className="spacer" />
        <select value={sort} onChange={e => setSort(e.target.value as BagSort)}>
          <option value="newest">Sort: Newest</option>
          <option value="rarity">Sort: Rarity</option>
          <option value="tier">Sort: Tier</option>
          <option value="slot">Sort: Slot</option>
        </select>
      </div>
      <div className="bag-filters card">
        <span className="toolbar-label">Rarity</span>
        <div className="seg wrap">
          {RARITIES.map(r => (
            <button key={r} className={`seg-btn c-${rarityCls(r)}${rarities.includes(r) ? ' active' : ''}`} onClick={() => setRarities(toggle(rarities, r))}>
              {r}
            </button>
          ))}
        </div>
        <span className="toolbar-label">Slot</span>
        <div className="seg wrap">
          {SLOT_FILTERS.map(([slot, label]) => (
            <button key={slot} className={`seg-btn${slotFilter.includes(slot) ? ' active' : ''}`} onClick={() => setSlotFilter(toggle(slotFilter, slot))}>
              {label}
            </button>
          ))}
        </div>
        <span className="bag-filters-foot">
          <span className="muted">{shown.length === s.bag.length ? 'Showing all' : `Showing ${shown.length} of ${s.bag.length}`}</span>
          {(rarities.length > 0 || slotFilter.length > 0) && (
            <button className="btn small ghost" onClick={() => { setRarities([]); setSlotFilter([]); }}>Clear filters</button>
          )}
        </span>
      </div>
      <div className="bag-grid">
        {shown.length ? (
          shown.map(it => <ItemTile key={String(it.id)} it={it} selected={sel.has(it.id)} onClick={ev => clickTile(ev, it.id)} />)
        ) : (
          <p className="muted">{s.bag.length ? 'No items match the filters.' : 'The bag is empty. Equipped items are on the Equipment screen.'}</p>
        )}
      </div>
      <div className={`action-bar card${selected.length ? '' : ' empty'}`}>
        <button
          className={`btn small${selectMode ? ' primary' : ' ghost'}`}
          onClick={() => {
            setSelectMode(!selectMode);
            if (selectMode) setSel(new Set());
          }}
        >
          Select
        </button>
        <span>
          {selected.length ? (
            <><strong>{selected.length}</strong> selected</>
          ) : selectMode ? (
            'Click items to select them'
          ) : (
            <span className="action-hint">Click to inspect · Ctrl-click to select · Shift-click for a range</span>
          )}
        </span>
        {selected.length > 0 && <button className="btn small ghost" onClick={() => setSel(new Set())}>Clear</button>}
        <button className="btn small ghost" onClick={() => setSel(new Set([...sel, ...shown.map(i => i.id)]))}>Select all shown</button>
        <span className="spacer" />
        <button
          className="btn small"
          disabled={!selected.length}
          onClick={() => {
            const locked = !selected.every(i => i.locked);
            for (const it of selected) call(r.lockItem({ itemId: it.id, locked }));
          }}
        >
          <Icon name="lock" />{selected.length && selected.every(i => i.locked) ? 'Unlock' : 'Lock'}
        </button>
        <button className="btn small" disabled={selected.length !== 1} onClick={() => openCraft(selected[0].id)}>
          <Icon name="hammer" />Craft
        </button>
        <button
          className="btn small danger"
          disabled={!selected.length || anyLocked}
          title={anyLocked ? "Locked items can't be salvaged" : undefined}
          onClick={() => call(r.salvage({ itemIds: selected.map(i => i.id) }).then(() => setSel(new Set())))}
        >
          Salvage → +{fmtBig(essence)} Essence
        </button>
      </div>
      {open && <BagPopup key={String(open.id)} s={s} it={open} onClose={() => setOpenId(undefined)} />}
    </>
  );
});
