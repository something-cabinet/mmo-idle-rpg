import { memo, useState } from 'react';
import type { Item } from '../../module_bindings/types';
import { bagExpansionCost } from '../../../spacetimedb/src/craft';
import { SLOTS, base } from '../../../spacetimedb/src/data/bases';
import { MATERIALS, MATERIALS_BY_ID } from '../../../spacetimedb/src/data/materials';
import { fitsSlot, placeItem } from '../../../spacetimedb/src/equip';
import { BAG_MAX } from '../../../spacetimedb/src/game';
import { LISTED_RARITIES, rarityRank, salvageValue } from '../../../spacetimedb/src/loot';
import { SCRAP_YIELD, isScrapRarity, scrapMaterialId } from '../../../spacetimedb/src/data/recipes';

/** Common to Legendary items of a tier with materials can be scrapped. */
const scrappable = (it: Item) => isScrapRarity(it.rarity.tag) && scrapMaterialId(it.baseId, it.tier) !== undefined;

/** The materials scrapping `items` gives, e.g. "+6 Wolfhide, +2 Elven Ingot". */
function scrapYield(items: readonly Item[]): string {
  const counts = new Map<number, number>();
  for (const it of items) {
    if (!scrappable(it)) continue;
    const id = scrapMaterialId(it.baseId, it.tier)!;
    counts.set(id, (counts.get(id) ?? 0) + SCRAP_YIELD[it.rarity.tag as keyof typeof SCRAP_YIELD]);
  }
  return [...counts].map(([id, n]) => `+${n.toLocaleString()} ${MATERIALS_BY_ID.get(id)!.name}`).join(', ');
}
import { call, useSticky } from '../../store';
import { fmtBig } from '../format';
import { Icon } from '../Icon';
import { ItemTile, itemName, materialIconName, rarityCls } from '../items';
import { CollapsibleCard, ItemFilterCard, useItemFilter, type ItemFilter } from '../itemFilter';
import { CardHead, Modal, SLOT_LABEL, SwapPreview, ViewHeader, openCraft } from '../shared';
import type { Snapshot } from '../snapshot';

type BagSort = 'newest' | 'rarity' | 'tier' | 'slot';

/** The bag, filtered and sorted. */
function sortedBag(s: Snapshot, sort: BagSort, f: ItemFilter): Item[] {
  const items = s.bag.filter(f.matches);
  const by: Record<BagSort, (a: Item, b: Item) => number> = {
    newest: (a, b) => (a.id < b.id ? 1 : -1),
    rarity: (a, b) => rarityRank(b.rarity.tag) - rarityRank(a.rarity.tag) || b.tier - a.tier,
    tier: (a, b) => b.tier - a.tier || rarityRank(b.rarity.tag) - rarityRank(a.rarity.tag),
    slot: (a, b) => SLOTS.indexOf(base(a.baseId).slots[0]) - SLOTS.indexOf(base(b.baseId).slots[0]) || b.tier - a.tier,
  };
  return items.sort(by[sort]);
}

/** Materials held, highest tier first, untiered ones last. */
function MaterialsCard({ s }: { s: Snapshot }) {
  const held = MATERIALS.filter(m => (s.materials.get(m.id) ?? 0n) > 0n).sort((a, b) => (b.tier || -1) - (a.tier || -1));
  const kinds = held.length;
  return (
    <CollapsibleCard storageKey="bag_materials_collapsed" title="Materials" summary={kinds ? `${kinds} kinds` : undefined}>
      {kinds ? (
        <div className="chips">
          {held.map(m => (
            <span key={m.id} className="chip" title={m.tier ? `T${m.tier} ${m.kind}` : 'Untiered'}>
              <Icon name={materialIconName(m.id)} className="c-material" />{m.name}<strong>{fmtBig(s.materials.get(m.id)!)}</strong>
            </span>
          ))}
        </div>
      ) : (
        <p className="muted">None yet. Enemies drop materials of their zone's tier: metal, hides, cloth, wood, reagents, gems and (magical ones) cores.</p>
      )}
    </CollapsibleCard>
  );
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
          className="btn"
          disabled={it.locked || !scrappable(it)}
          title={it.locked ? "Locked items can't be recycled" : 'Into materials (no Dust or gold)'}
          onClick={() => call(r.scrapItems({ itemIds: [it.id] }), `Recycled: ${scrapYield([it])}`)}
        >
          Recycle
        </button>
        <button
          className="btn danger"
          disabled={it.locked}
          title={it.locked ? "Locked items can't be salvaged" : undefined}
          onClick={() => call(r.salvage({ itemIds: [it.id] }))}
        >
          Salvage → +{fmtBig(salvageValue(it.rarity.tag, it.tier).dust)} Dust, +{fmtBig(salvageValue(it.rarity.tag, it.tier).gold)} gold
        </button>
      </div>
    </Modal>
  );
}

export const BagView = memo(function BagView({ s }: { s: Snapshot }) {
  const [sort, setSort] = useSticky<BagSort>('bagSort', 'newest');
  const filter = useItemFilter('bag');
  const [selectMode, setSelectMode] = useSticky('bagSelectMode', false);
  const [sel, setSel] = useState<ReadonlySet<bigint>>(new Set());
  /** Last clicked item: the start of a shift-click range. */
  const [anchor, setAnchor] = useState<bigint>();
  const [openId, setOpenId] = useState<bigint>();
  const r = s.conn.reducers;

  const shown = sortedBag(s, sort, filter);
  // Selections and the popup drop items that left the bag.
  const selected = s.bag.filter(i => sel.has(i.id));
  const open = s.bag.find(i => i.id === openId);
  // Scrap and salvage skip locked items; they're off only when every selected item is locked.
  const unlocked = selected.filter(i => !i.locked);
  const skipped = selected.length - unlocked.length;
  const skipNote = skipped ? ` (skips ${skipped} locked)` : '';
  const allScrappable = unlocked.every(scrappable);
  const dust = unlocked.reduce((sum, i) => sum + salvageValue(i.rarity.tag, i.tier).dust, 0n);
  const salvageGold = unlocked.reduce((sum, i) => sum + salvageValue(i.rarity.tag, i.tier).gold, 0n);
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
      <MaterialsCard s={s} />
      <ItemFilterCard f={filter} storageKey="bag_filters_collapsed" rarities={LISTED_RARITIES} shown={shown.length} total={s.bag.length} />
      <div className="bag-grid">
        {shown.length ? (
          shown.map(it => <ItemTile key={String(it.id)} it={it} selected={sel.has(it.id)} onClick={ev => clickTile(ev, it.id)} />)
        ) : (
          <p className="muted">{s.bag.length ? 'No items match the filters.' : 'The bag is empty. Equipped items are on the Equipment screen.'}</p>
        )}
      </div>
      <div className={`action-bar card${selected.length ? '' : ' empty'}`}>
        <button
          className={`btn small${selectMode ? ' primary' : ''}`}
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
        <button className="btn small" onClick={() => setSel(new Set([...sel, ...shown.map(i => i.id)]))}>Select all shown</button>
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
        <button
          className="btn small"
          disabled={!unlocked.length || !allScrappable}
          title={selected.length && !unlocked.length ? "Locked items can't be recycled" : !allScrappable ? 'Only Common to Legendary items, of tiers with materials, can be recycled' : `Into materials (no Dust or gold)${skipNote}`}
          onClick={() => call(r.scrapItems({ itemIds: unlocked.map(i => i.id) }).then(() => setSel(new Set())), `Recycled: ${scrapYield(unlocked)}`)}
        >
          Recycle
        </button>
        <button
          className="btn small danger"
          disabled={!unlocked.length}
          title={selected.length && !unlocked.length ? "Locked items can't be salvaged" : skipped ? `Skips ${skipped} locked` : undefined}
          onClick={() => call(r.salvage({ itemIds: unlocked.map(i => i.id) }).then(() => setSel(new Set())))}
        >
          Salvage → +{fmtBig(dust)} Dust, +{fmtBig(salvageGold)} gold
        </button>
      </div>
      {open && <BagPopup key={String(open.id)} s={s} it={open} onClose={() => setOpenId(undefined)} />}
    </>
  );
});
