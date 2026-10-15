// The item filter shared by Bag and Crafting: search, rarity, slot, affixes and minimum affix tier.

import { useState, type ReactNode } from 'react';
import type { Item } from '../module_bindings/types';
import { base, type Slot } from '../../spacetimedb/src/data/bases';
import { MAX_TIER } from '../../spacetimedb/src/data/stats';
import { AFFIX_STAT_IDS, type RarityName } from '../../spacetimedb/src/loot';
import { useSticky } from '../store';
import { Icon } from './Icon';
import { affixLabel, itemName, rarityCls, rarityLabel, statText } from './items';
import { SLOT_FILTERS, toggle } from './shared';

const AFFIX_OPTIONS = AFFIX_STAT_IDS.map(id => ({ id, label: affixLabel(id) })).sort((a, b) => a.label.localeCompare(b.label));

/** Lowercased text the search matches: name, family, rarity and every stat line. */
const searchText = (it: Item) =>
  [itemName(it), base(it.baseId).family, rarityLabel(it.rarity.tag), ...[...it.implicits, ...it.affixes].map(a => statText(a.stat, a.value))].join(' ').toLowerCase();

/** The item has every chosen affix at the minimum tier, or (none chosen) any affix at it. */
function matchesAffixes(it: Item, affixes: readonly number[], minTier: number): boolean {
  if (!affixes.length) return minTier <= 1 || it.affixes.some(a => a.tier >= minTier);
  return affixes.every(stat => it.affixes.some(a => a.stat === stat && a.tier >= minTier));
}

/** One view's filter selections (an empty selection means any), kept while the view is away. */
export function useItemFilter(prefix: string) {
  const [search, setSearch] = useSticky(`${prefix}Search`, '');
  const [rarities, setRarities] = useSticky<readonly RarityName[]>(`${prefix}Rarities`, []);
  const [slots, setSlots] = useSticky<readonly Slot[]>(`${prefix}Slots`, []);
  const [affixes, setAffixes] = useSticky<readonly number[]>(`${prefix}Affixes`, []);
  const [minAffixTier, setMinAffixTier] = useSticky(`${prefix}MinAffixTier`, 1);
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  return {
    search, setSearch, rarities, setRarities, slots, setSlots, affixes, setAffixes, minAffixTier, setMinAffixTier,
    /** How many filters are on (each selected button counts). */
    active: (words.length ? 1 : 0) + rarities.length + slots.length + affixes.length + (minAffixTier > 1 ? 1 : 0),
    matches: (it: Item) =>
      // An Anomaly passes for a Common.
      (!rarities.length || rarities.includes(it.rarity.tag === 'Anomaly' ? 'Common' : it.rarity.tag)) &&
      (!slots.length || slots.includes(base(it.baseId).slots[0])) &&
      matchesAffixes(it, affixes, minAffixTier) &&
      (!words.length || (t => words.every(w => t.includes(w)))(searchText(it))),
    clear: () => {
      setSearch('');
      setRarities([]);
      setSlots([]);
      setAffixes([]);
      setMinAffixTier(1);
    },
  };
}
export type ItemFilter = ReturnType<typeof useItemFilter>;

/** Open/closed state of a collapsible card, remembered on this device. */
function useCollapsed(key: string, initial = false): [boolean, (v: boolean) => void] {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const v = localStorage.getItem(key);
      return v === null ? initial : v === '1';
    } catch {
      return initial;
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
export function CollapsibleCard({ storageKey, title, summary, className = '', defaultCollapsed = false, children }: {
  storageKey: string;
  title: string;
  summary?: ReactNode;
  className?: string;
  /** Collapsed until the player opens it the first time. */
  defaultCollapsed?: boolean;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useCollapsed(storageKey, defaultCollapsed);
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

/** The collapsible Filters card. `extra` adds view-specific rows; `foot` sits right of the count (e.g. a sort select). */
export function ItemFilterCard({ f, storageKey, rarities, shown, total, extra, extraActive = 0, onClear, foot }: {
  f: ItemFilter;
  storageKey: string;
  /** Rarity buttons to offer. */
  rarities: readonly RarityName[];
  shown: number;
  total: number;
  extra?: ReactNode;
  /** Filters on in `extra`, counted with the rest. */
  extraActive?: number;
  /** Also clears the `extra` filters. */
  onClear?: () => void;
  foot?: ReactNode;
}) {
  const active = f.active + extraActive;
  return (
    <CollapsibleCard
      storageKey={storageKey}
      title="Filters"
      className="bag-filters-card"
      summary={active ? `${active} active · showing ${shown} of ${total}` : undefined}
    >
      <div className="bag-filters">
        <span className="toolbar-label">Search</span>
        <input type="search" placeholder="Name, family or affix, e.g. crit, ring, plate…" value={f.search} onChange={e => f.setSearch(e.target.value)} />
        <span className="toolbar-label">Rarity</span>
        <div className="seg wrap">
          {rarities.map(r => (
            <button key={r} className={`seg-btn c-${rarityCls(r)}${f.rarities.includes(r) ? ' active' : ''}`} onClick={() => f.setRarities(toggle(f.rarities, r))}>
              {r}
            </button>
          ))}
        </div>
        <span className="toolbar-label">Slot</span>
        <div className="seg wrap">
          {SLOT_FILTERS.map(([slot, label]) => (
            <button key={slot} className={`seg-btn${f.slots.includes(slot) ? ' active' : ''}`} onClick={() => f.setSlots(toggle(f.slots, slot))}>
              {label}
            </button>
          ))}
        </div>
        <span className="toolbar-label">Affix</span>
        <div className="bag-affixes">
          {f.affixes.length > 0 && (
            <div className="seg wrap">
              {f.affixes.map(id => (
                <button key={id} className="seg-btn active" title="Remove" onClick={() => f.setAffixes(toggle(f.affixes, id))}>
                  {affixLabel(id)} <Icon name="x" />
                </button>
              ))}
            </div>
          )}
          <select value="" onChange={e => f.setAffixes([...f.affixes, Number(e.target.value)])}>
            <option value="">{f.affixes.length ? 'And affix…' : 'Any affix…'}</option>
            {AFFIX_OPTIONS.filter(o => !f.affixes.includes(o.id)).map(o => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </div>
        <span className="toolbar-label">Affix tier</span>
        <div className="seg wrap">
          {Array.from({ length: MAX_TIER }, (_, i) => i + 1).map(t => (
            <button key={t} className={`seg-btn${t === f.minAffixTier ? ' active' : ''}`} onClick={() => f.setMinAffixTier(t)}>
              {t === 1 ? 'Any' : `T${t}+`}
            </button>
          ))}
        </div>
        {extra}
        <span className="bag-filters-foot">
          <span className="muted">{shown === total ? 'Showing all' : `Showing ${shown} of ${total}`}</span>
          {active > 0 && (
            <button className="btn small ghost" onClick={() => { f.clear(); onClear?.(); }}>Clear filters</button>
          )}
          {foot && <><span className="spacer" />{foot}</>}
        </span>
      </div>
    </CollapsibleCard>
  );
}
