// Pieces shared by the views: headers, stat rows, loadout totals and comparisons, popups.

import { useEffect, useRef, type ReactNode } from 'react';
import type { DbConnection } from '../module_bindings';
import * as auth from '../auth';
import type { Item } from '../module_bindings/types';
import { combatStats, defenseAgainst, tempered, type Matchup } from '../../spacetimedb/src/combat';
import type { CraftCost } from '../../spacetimedb/src/craft';
import type { Slot } from '../../spacetimedb/src/data/bases';
import { EFFECTS_BY_ID, Effect, LEGENDARIES_BY_ID, copiesToCap, effectAmount, type EffectCounts } from '../../spacetimedb/src/data/legendary';
import { Stat, fromStored } from '../../spacetimedb/src/data/stats';
import { placeItem, scoreGear } from '../../spacetimedb/src/equip';
import { setSticky } from '../store';
import { fmt, fmtBig, pct } from './format';
import { Icon } from './Icon';
import { EmptyCard, ItemCard, itemName, rarityCls } from './items';
import { gearFor, type Snapshot } from './snapshot';
import { STAT_HELP, type Sheet } from './statSheet';

export type Loadout = Snapshot['active'];

export const SLOT_LABEL = ['Main hand', 'Off-hand', 'Head', 'Chest', 'Hands', 'Feet', 'Ring 1', 'Ring 2', 'Amulet'];

/** Slot filter buttons; rings go in either ring slot, so one button covers both. */
export const SLOT_FILTERS: [Slot, string][] = [
  ['MainHand', 'Main hand'], ['OffHand', 'Off-hand'], ['Head', 'Head'], ['Chest', 'Chest'],
  ['Hands', 'Hands'], ['Feet', 'Feet'], ['Ring1', 'Ring'], ['Amulet', 'Amulet'],
];

/** `list` with `x` added, or removed if it was there (multi-select filter buttons). */
export const toggle = <T,>(list: readonly T[], x: T): T[] => (list.includes(x) ? list.filter(y => y !== x) : [...list, x]);

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

/** The stat sheet as four cards: primaries, offense, defense, utility. */
export function StatBoard({ sheet, className = 'grid-4' }: { sheet: Sheet; className?: string }) {
  const sections = [['Primaries', sheet.primaries], ['Offense', sheet.offense], ['Defense', sheet.defense], ['Utility', sheet.utility]] as const;
  return (
    <div className={className}>
      {sections.map(([title, rows]) => (
        <div className="card" key={title}>
          <CardHead title={title} />
          <StatRows rows={rows} />
        </div>
      ))}
    </div>
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
  if (s.row.dust < c.dust) return `Need ${fmtBig(c.dust - s.row.dust)} more Dust`;
  return undefined;
}
export const costText = (c: CraftCost) => `${fmtBig(c.gold)} gold · ${fmtBig(c.dust)} Dust`;

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

/** What `n` worn copies of effect `id` do, and any copies wasted past the cap (legendary) or by not stacking (unique). */
function stackedEffect(effects: EffectCounts, id: number, n: number): { text: string; waste?: string } {
  const l = LEGENDARIES_BY_ID.get(id);
  if (!l) return { text: EFFECTS_BY_ID.get(id)?.text ?? '', waste: n > 1 ? `Doesn't stack: ${n - 1} wasted` : undefined };
  const full = copiesToCap(l);
  const waste = l.perCopy * n > l.cap + 1e-9 ? (n > full ? `Capped: ${n - full} wasted` : 'Capped') : undefined;
  return { text: l.describe(effectAmount(effects, id)), waste };
}

/** Worn effects: legendary affixes and unique affixes in separate cards. */
export function EffectsCard({ effects }: { effects: EffectCounts }) {
  const all = [...effects];
  const legendary = all.filter(([id]) => LEGENDARIES_BY_ID.has(id));
  const unique = all.filter(([id]) => !LEGENDARIES_BY_ID.has(id));
  const both = effects.has(Effect.MidasTouch) && effects.has(Effect.ScholarsFocus);
  const row = ([id, n]: [number, number], cls?: string) => {
    const { text, waste } = stackedEffect(effects, id, n);
    return (
      <div className="stat-row" key={id}>
        <span className={cls}>
          <Icon name="sparkles" />
          {EFFECTS_BY_ID.get(id)?.name ?? `Effect ${id}`}
          {n > 1 && ` ×${n}`}
        </span>
        <span className="muted">
          {text}
          {waste && <span className="c-bad"> {waste}.</span>}
        </span>
      </div>
    );
  };
  return (
    <>
      {legendary.length > 0 && (
        <div className="card">
          <CardHead title="Legendary affixes" />
          {legendary.map(e => row(e, 'c-legendary'))}
          {both && <p className="c-bad">Midas Touch and Scholar's Focus together: no XP and only × 1.25 gold.</p>}
        </div>
      )}
      {unique.length > 0 && (
        <div className="card">
          <CardHead title="Unique affixes" />
          {unique.map(e => row(e, 'c-unique'))}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- loadout totals

export interface Total {
  label: string;
  value: number;
  show: (n: number) => string;
  lowerBetter?: boolean;
}

/**
 * Loadout totals compared on swaps and after auto-equip (ui.md: totals, never an item score).
 * In a vacuum, not against the target: stats that depend on the enemy (evasion, DPS) are
 * against auto-equip's reference enemy of your level (equip.ts `referenceDummy`).
 */
export function totals(s: Snapshot, slots: readonly bigint[]): Total[] {
  const gear = gearFor(slots, s.items);
  const st = combatStats(s.level, gear);
  const src = st.sources[0];
  const p = (x: number) => pct(x, 1);
  /** A primary attribute: `level` from levels plus gear. */
  const primary = (id: number) =>
    s.level +
    gear.map(it => it && tempered(it)).reduce((sum, it) => sum + (it ? [...it.implicits, ...it.affixes, ...(it.legendary ? [it.legendary] : [])] : [])
      .reduce((n, g) => n + (g.stat === id ? fromStored(g.value) : 0), 0), 0);
  return [
    { label: 'Might', value: primary(Stat.Might), show: fmt },
    { label: 'Finesse', value: primary(Stat.Finesse), show: fmt },
    { label: 'Mind', value: primary(Stat.Mind), show: fmt },
    { label: 'Vitality', value: primary(Stat.Vitality), show: fmt },
    { label: 'Damage', value: src ? src.hit.Physical + src.hit.Magic : 0, show: fmt },
    { label: 'Attack speed', value: src?.attacksPerSec ?? 0, show: n => `${n.toFixed(2)} /s` },
    { label: 'Crit chance', value: src?.critChance ?? 0, show: p },
    { label: 'Crit damage', value: st.critDamage, show: x => pct(x) },
    { label: 'Armor pen', value: st.armorPen, show: p },
    { label: 'Magic pen', value: st.magicPen, show: p },
    { label: 'DPS', value: scoreGear(s.level, gear).dps, show: n => (Math.abs(n) < 1000 ? n.toFixed(1) : fmt(n)) },
    { label: 'Heal', value: src?.heal ?? 0, show: fmt },
    { label: 'Max HP', value: st.maxHp, show: fmt },
    { label: 'HP regen', value: st.regen, show: n => `${fmt(n)} /s` },
    { label: 'Armor', value: st.armor, show: fmt },
    { label: 'Resistance', value: st.resistance, show: fmt },
    { label: 'Evasion', value: defenseAgainst(st, 'Physical', s.level).evasion, show: p },
    { label: 'Lifesteal', value: st.lifesteal, show: p },
    { label: 'Item find', value: st.itemFind, show: p },
    { label: 'Gold find', value: st.goldFind, show: p },
    { label: 'XP gain', value: st.xpGain, show: p },
    { label: 'Threat', value: st.threat, show: p },
    { label: 'Walk time', value: st.walkTime, show: n => `${Number(n.toFixed(2))} s`, lowerBetter: true },
  ];
}

/** Totals before → after; `changedOnly` leaves out the rows that stay the same. */
export function CompareTable({ before, after, changedOnly }: { before: Total[]; after: Total[]; changedOnly?: boolean }) {
  return (
    <>
      {before.map((b, i) => {
        const a = after[i];
        const same = a.value === b.value || Math.abs(a.value - b.value) < 1e-9;
        if (same && changedOnly) return null;
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
export function SwapPreview({ s, lo, slot, it, changedOnly }: { s: Snapshot; lo: Loadout; slot: number; it: Item; changedOnly?: boolean }) {
  const cur = s.items.get(lo.slots[slot]);
  const next = placeItem(lo.slots, slot, it, id => s.items.get(id));
  const also = typeof next === 'string' ? [] : next.map((id, i) => [i, id] as const).filter(([i, id]) => i !== slot && id !== lo.slots[i]);
  const before = totals(s, lo.slots);
  const after = typeof next === 'string' ? before : totals(s, next);
  const unchanged = after.every((a, i) => Math.abs(a.value - before[i].value) < 1e-9);
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
          <CardHead title={`${lo.name} totals`} />
          {changedOnly && unchanged ? (
            <p className="muted">No stat changes.</p>
          ) : (
            <div>
              <CompareTable before={before} after={after} changedOnly={changedOnly} />
            </div>
          )}
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------- account

/** Who is logged in, with the login or logout button. In the sidebar footer and on the Settings screen. */
export function AccountControls({ conn }: { conn: DbConnection }) {
  const account = [...conn.db.myAccount.iter()][0];
  const registered = account?.kind.tag === 'Registered';
  const admin = account?.role.tag === 'Admin';
  return (
    <>
      <span className="muted">{registered ? `${account?.email ?? 'Logged in'}${admin ? ' (admin)' : ''}` : 'Guest: progress is saved in this browser only'}</span>
      {!registered && auth.loginEnabled && <button className="btn small primary" onClick={() => void auth.login()}>Log in to save progress</button>}
      {registered && <button className="btn small ghost" onClick={() => void auth.logout()}>Log out</button>}
    </>
  );
}

// ---------------------------------------------------------------- popup

/** A dialog over the page; Esc or a click on the backdrop closes it. Esc closes only the top one when several are open. */
export function Modal({ onClose, className = '', children }: { onClose: () => void; className?: string; children: ReactNode }) {
  const close = useRef(onClose);
  close.current = onClose;
  const self = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const modals = document.querySelectorAll('.modal');
      if (e.key === 'Escape' && modals[modals.length - 1] === self.current) close.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="modal" ref={self} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={`modal-card card ${className}`} role="dialog" aria-modal="true">
        {children}
      </div>
    </div>
  );
}
