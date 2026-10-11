// Pieces shared by the views: headers, stat rows, loadout totals and comparisons, popups.

import { useEffect, useRef, type ReactNode } from 'react';
import type { Item } from '../module_bindings/types';
import { combatStats, defenseAgainst, matchup, type Matchup } from '../../spacetimedb/src/combat';
import type { CraftCost } from '../../spacetimedb/src/craft';
import { Effect, LEGENDARIES_BY_ID } from '../../spacetimedb/src/data/legendary';
import { placeItem } from '../../spacetimedb/src/equip';
import { setSticky } from '../store';
import { fmt, fmtBig, pct } from './format';
import { Icon } from './Icon';
import { EmptyCard, ItemCard, itemName, rarityCls } from './items';
import { gearFor, type Snapshot } from './snapshot';
import { STAT_HELP } from './statSheet';

export type Loadout = Snapshot['active'];

export const SLOT_LABEL = ['Main hand', 'Off-hand', 'Head', 'Chest', 'Hands', 'Feet', 'Ring 1', 'Ring 2', 'Amulet'];

export function ViewHeader({ title, icon, children }: { title: string; icon: string; children?: ReactNode }) {
  return (
    <div className="view-head">
      <h1>
        <Icon name={icon} />
        {title}
      </h1>
      {children}
    </div>
  );
}

// Time to kill / die and the win margin drive offline settlement only: never shown to players.
export const perHour = (m: Matchup) => m.killRate * 3600;

/** A stat name; hovering it shows `help` (what the stat does), underlined when there is some. */
export const StatLabel = ({ label, help = STAT_HELP[label] }: { label: string; help?: string }) =>
  help ? <span className="tip" title={help}>{label}</span> : <span>{label}</span>;

/** [label, value, row hover text, label hover text] rows; the label's text defaults to STAT_HELP. */
export function StatRows({ rows }: { rows: [string, ReactNode, string?, string?][] }) {
  return (
    <>
      {rows.map(([k, v, hint, help]) => (
        <div className="stat-row" title={hint || undefined} key={k}>
          <StatLabel label={k} help={help} />
          <strong>{v}</strong>
        </div>
      ))}
    </>
  );
}

export const CardHead = ({ title, children }: { title: ReactNode; children?: ReactNode }) => (
  <div className="card-head">
    <h2>{title}</h2>
    {children}
  </div>
);

/** Why a craft can't be paid for, or undefined. */
export function cantAfford(s: Snapshot, c: CraftCost): string | undefined {
  if (s.gold < c.gold) return `Need ${fmtBig(c.gold - s.gold)} more gold`;
  if (s.row.essence < c.essence) return `Need ${fmtBig(c.essence - s.row.essence)} more Essence`;
  return undefined;
}
export const costText = (c: CraftCost) => `${fmtBig(c.gold)} gold · ${fmtBig(c.essence)} Essence`;

/** "In Farm, Boss" for an item in loadouts. */
export function loadoutNote(s: Snapshot, it: Item) {
  const ls = s.inLoadouts.get(it.id);
  return ls ? `In ${ls.map(i => s.loadouts[i]?.name ?? `Set ${i + 1}`).join(', ')}` : undefined;
}

/** Opens Crafting on an item. */
export function openCraft(id: bigint) {
  setSticky('craftItem', id);
  location.hash = '#crafting';
}

export function EffectsCard({ effects }: { effects: ReadonlySet<number> }) {
  if (!effects.size) return null;
  const both = effects.has(Effect.MidasTouch) && effects.has(Effect.ScholarsFocus);
  return (
    <div className="card">
      <CardHead title="Legendary effects" />
      {[...effects].map(id => {
        const l = LEGENDARIES_BY_ID.get(id)!;
        return (
          <div className="stat-row" key={id}>
            <span>
              <Icon name="sparkles" />
              {l.name}
            </span>
            <span className="muted">{l.text}</span>
          </div>
        );
      })}
      {both && <p className="c-bad">Midas Touch and Scholar's Focus together: no XP and only × 1.25 gold.</p>}
    </div>
  );
}

// ---------------------------------------------------------------- loadout totals

export interface Total {
  label: string;
  value: number;
  show: (n: number) => string;
  lowerBetter?: boolean;
}

/** Loadout totals compared on swaps and after auto-equip (ui.md: totals, never an item score). */
export function totals(s: Snapshot, slots: readonly bigint[]): Total[] {
  const st = combatStats(s.level, gearFor(slots, s.items));
  const src = st.sources[0];
  const m = s.target && matchup(st, s.target.enemy);
  const level = s.target?.enemy.level ?? s.level;
  const p = (x: number) => pct(x, 1);
  return [
    { label: 'Hit', value: src ? src.hit.Physical + src.hit.Magic : 0, show: fmt },
    { label: 'Max HP', value: st.maxHp, show: fmt },
    { label: 'Armor', value: st.armor, show: fmt },
    { label: 'Resistance', value: st.resistance, show: fmt },
    { label: 'Evasion', value: defenseAgainst(st, 'Physical', level).evasion, show: p },
    { label: 'Item find', value: st.itemFind, show: p },
    { label: 'Gold find', value: st.goldFind, show: p },
    { label: 'XP gain', value: st.xpGain, show: p },
    ...(m ? [{ label: 'DPS', value: m.dps, show: fmt }] : []),
  ];
}

export function CompareTable({ before, after }: { before: Total[]; after: Total[] }) {
  return (
    <>
      {before.map((b, i) => {
        const a = after[i];
        const same = a.value === b.value || Math.abs(a.value - b.value) < 1e-9;
        const better = a.lowerBetter ? a.value < b.value : a.value > b.value;
        return (
          <div className={`stat-row${same ? ' dim' : ''}`} key={b.label}>
            <StatLabel label={b.label} />
            <strong>
              {b.show(b.value)}
              {!same && (
                <>
                  {' → '}
                  <span className={better ? 'c-ok' : 'c-bad'}>{a.show(a.value)}</span>
                </>
              )}
            </strong>
          </div>
        );
      })}
    </>
  );
}

export function SlotItemName({ s, id }: { s: Snapshot; id: bigint }) {
  const it = id === 0n ? undefined : s.items.get(id);
  return it ? <span className={`c-${rarityCls(it.rarity.tag)}`}>{itemName(it)}</span> : <span className="muted">Empty</span>;
}

/** `it` next to what `slot` holds now, and the loadout totals before → after putting it there. */
export function SwapPreview({ s, lo, slot, it }: { s: Snapshot; lo: Loadout; slot: number; it: Item }) {
  const cur = s.items.get(lo.slots[slot]);
  const next = placeItem(lo.slots, slot, it, id => s.items.get(id));
  const also = typeof next === 'string' ? [] : next.map((id, i) => [i, id] as const).filter(([i, id]) => i !== slot && id !== lo.slots[i]);
  return (
    <>
      <div className="compare-items">
        <div>
          <div className="slot-label">This item</div>
          <ItemCard it={it} note={loadoutNote(s, it)} />
        </div>
        <div>
          <div className="slot-label">Equipped · {SLOT_LABEL[slot]}</div>
          {cur ? <ItemCard it={cur} /> : <EmptyCard />}
        </div>
      </div>
      {also.map(([i]) => (
        <p className="muted" key={i}>
          Also empties {SLOT_LABEL[i]} (<SlotItemName s={s} id={lo.slots[i]} />).
        </p>
      ))}
      {typeof next === 'string' ? (
        <p className="c-bad">{next}</p>
      ) : (
        <>
          <CardHead title={`${lo.name} totals`}>{s.target && <span className="muted">vs {s.target.enemy.name}</span>}</CardHead>
          <CompareTable before={totals(s, lo.slots)} after={totals(s, next)} />
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------- popup

/** A dialog over the page; Esc or a click on the backdrop closes it. */
export function Modal({ onClose, className = '', children }: { onClose: () => void; className?: string; children: ReactNode }) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="modal" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={`modal-card card ${className}`} role="dialog" aria-modal="true">
        {children}
      </div>
    </div>
  );
}
