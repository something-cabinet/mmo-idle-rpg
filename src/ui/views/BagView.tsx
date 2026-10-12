import { memo, useState, type ReactNode } from 'react';
import type { Item } from '../../module_bindings/types';
import { bagExpansionCost } from '../../../spacetimedb/src/craft';
import { SLOTS, base, type Slot } from '../../../spacetimedb/src/data/bases';
import { MATERIALS } from '../../../spacetimedb/src/data/materials';
import { MAX_TIER } from '../../../spacetimedb/src/data/stats';
import { fitsSlot, placeItem } from '../../../spacetimedb/src/equip';
import { BAG_MAX } from '../../../spacetimedb/src/game';
import { AFFIX_STAT_IDS, RARITIES, rarityRank, salvageValue, type RarityName } from '../../../spacetimedb/src/loot';
import { call, useSticky } from '../../store';
import { fmtBig } from '../format';
import { Icon } from '../Icon';
import { ItemTile, affixLabel, itemName, materialIconName, rarityCls } from '../items';
import { CardHead, Modal, SLOT_FILTERS, SLOT_LABEL, SwapPreview, ViewHeader, openCraft, toggle } from '../shared';
import type { Snapshot } from '../snapshot';

type BagSort = 'newest' | 'rarity' | 'tier' | 'slot';

interface BagFilter {
  rarities: readonly RarityName[];
  slots: readonly Slot[];
  affixes: readonly number[];
  /** Minimum affix tier: applies to every chosen affix, or to any affix when none is chosen. 1 means any. */
  minAffixTier: number;
}

const AFFIX_OPTIONS = AFFIX_STAT_IDS.map(id => ({ id, label: affixLabel(id) })).sort((a, b) => a.label.localeCompare(b.label));

/** The item has every chosen affix at the minimum tier, or (none chosen) any affix at it. */
function matchesAffixes(it: Item, affixes: readonly number[], minTier: number): boolean {
  if (!affixes.length) return minTier <= 1 || it.affixes.some(a => a.tier >= minTier);
  return affixes.every(stat => it.affixes.some(a => a.stat === stat && a.tier >= minTier));
}

/** The bag, filtered (an empty selection means any) and sorted. */
function sortedBag(s: Snapshot, sort: BagSort, f: BagFilter): Item[] {
  const items = s.bag.filter(it =>
    (!f.rarities.length || f.rarities.includes(it.rarity.tag)) &&
    (!f.slots.length || f.slots.includes(base(it.baseId).slots[0])) &&
    matchesAffixes(it, f.affixes, f.minAffixTier));
  const by: Record<BagSort, (a: Item, b: Item) => number> = {
    newest: (a, b) => (a.id < b.id ? 1 : -1),
    rarity: (a, b) => rarityRank(b.rarity.tag) - rarityRank(a.rarity.tag) || b.tier - a.tier,
    tier: (a, b) => b.tier - a.tier || rarityRank(b.rarity.tag) - rarityRank(a.rarity.tag),
    slot: (a, b) => SLOTS.indexOf(base(a.baseId).slots[0]) - SLOTS.indexOf(base(b.baseId).slots[0]) || b.tier - a.tier,
  };
  return items.sort(by[sort]);
}

/** Open/closed state of a collapsible card, remembered on this device. */
function useCollapsed(key: string): [boolean, (v: boolean) => void] {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  });
  return [
    collapsed,
    v => {
      setCollapsed(v);
      try {
        localStorage.setItem(key, v ? '1' : '0');
      } catch {
        // Not remembered; fine.
      }
    },
  ];
}

/** A card whose header toggles its body; `summary` stays visible beside the title when collapsed. */
function CollapsibleCard({ storageKey, title, summary, className = '', children }: {
  storageKey: string;
  title: string;
  summary?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useCollapsed(storageKey);
  return (
    <div className={`card collapsible${collapsed ? ' collapsed' : ''} ${className}`}>
      <button className="collapse-head" aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}>
        <Icon name="chevron" className="collapse-chevron" />
        <h2>{title}</h2>
        {summary && <span className="muted">{summary}</span>}
      </button>
      {!collapsed && <div className="collapse-body">{children}</div>}
    </div>
  );
}

/** Materials held, highest tier first. */
function MaterialsCard({ s }: { s: Snapshot }) {
  const held = MATERIALS.filter(m => (s.materials.get(m.id) ?? 0n) > 0n).sort((a, b) => b.tier - a.tier);
  return (
    <CollapsibleCard storageKey="bag_materials_collapsed" title="Materials" summary={held.length ? `${held.length} kinds` : undefined}>
      {held.length ? (
        <div className="chips">
          {held.map(m => (
            <span key={m.id} className="chip" title={`T${m.tier} ${m.kind}`}>
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
  const [affixFilter, setAffixFilter] = useSticky<readonly number[]>('bagAffixes', []);
  const [minAffixTier, setMinAffixTier] = useSticky('bagMinAffixTier', 1);
  const [selectMode, setSelectMode] = useSticky('bagSelectMode', false);
  const [sel, setSel] = useState<ReadonlySet<bigint>>(new Set());
  /** Last clicked item: the start of a shift-click range. */
  const [anchor, setAnchor] = useState<bigint>();
  const [openId, setOpenId] = useState<bigint>();
  const r = s.conn.reducers;

  const shown = sortedBag(s, sort, { rarities, slots: slotFilter, affixes: affixFilter, minAffixTier });
  const activeFilters = rarities.length + slotFilter.length + affixFilter.length + (minAffixTier > 1 ? 1 : 0);
  const clearFilters = () => {
    setRarities([]);
    setSlotFilter([]);
    setAffixFilter([]);
    setMinAffixTier(1);
  };
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
      <MaterialsCard s={s} />
      <CollapsibleCard
        storageKey="bag_filters_collapsed"
        title="Filters"
        className="bag-filters-card"
        summary={activeFilters ? `${activeFilters} active · showing ${shown.length} of ${s.bag.length}` : undefined}
      >
        <div className="bag-filters">
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
          <span className="toolbar-label">Affix</span>
          <div className="bag-affixes">
            {affixFilter.length > 0 && (
              <div className="seg wrap">
                {affixFilter.map(id => (
                  <button key={id} className="seg-btn active" title="Remove" onClick={() => setAffixFilter(toggle(affixFilter, id))}>
                    {affixLabel(id)} <Icon name="x" />
                  </button>
                ))}
              </div>
            )}
            <select value="" onChange={e => setAffixFilter([...affixFilter, Number(e.target.value)])}>
              <option value="">{affixFilter.length ? 'And affix…' : 'Any affix…'}</option>
              {AFFIX_OPTIONS.filter(o => !affixFilter.includes(o.id)).map(o => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </div>
          <span className="toolbar-label">Affix tier</span>
          <div className="seg wrap">
            {Array.from({ length: MAX_TIER }, (_, i) => i + 1).map(t => (
              <button key={t} className={`seg-btn${t === minAffixTier ? ' active' : ''}`} onClick={() => setMinAffixTier(t)}>
                {t === 1 ? 'Any' : `T${t}+`}
              </button>
            ))}
          </div>
          <span className="bag-filters-foot">
            <span className="muted">{shown.length === s.bag.length ? 'Showing all' : `Showing ${shown.length} of ${s.bag.length}`}</span>
            {activeFilters > 0 && <button className="btn small ghost" onClick={clearFilters}>Clear filters</button>}
          </span>
        </div>
      </CollapsibleCard>
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
