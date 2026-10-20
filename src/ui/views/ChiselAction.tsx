// The Crafting screen's Chisel tab: pick a chisel, see what it does to this item, apply it.

import { useState } from 'react';
import type { Item } from '../../module_bindings/types';
import { BOUND_LEGENDARY, CORRUPTION_TEXT, chiselBlocker, isBound, legendaryBound, type Corruption } from '../../../spacetimedb/src/chisel';
import { CHISELS, CHISELS_BY_ID, ChiselKind, type ChiselDef } from '../../../spacetimedb/src/data/supplies';
import { affixRange, type StatId } from '../../../spacetimedb/src/data/stats';
import { UNIQUES_BY_ID } from '../../../spacetimedb/src/data/uniques';
import { legendaryBonusRange, uniqueStatRange } from '../../../spacetimedb/src/loot';
import { EFFECTS_BY_ID } from '../../../spacetimedb/src/data/legendary';
import { call, useSticky } from '../../store';
import { Icon } from '../Icon';
import { BoundMark, statRangeText, statText } from '../items';
import type { Snapshot } from '../snapshot';

/** The range affix `i` of `it` rolls in, e.g. "12–18%" (undefined if unknown). */
function rangeOf(it: Item, i: number): string | undefined {
  const a = it.affixes[i];
  if (a.tier > 0) return statRangeText(a.stat, ...affixRange(a.stat as StatId, a.tier));
  const u = it.uniqueId === undefined ? undefined : UNIQUES_BY_ID.get(it.uniqueId);
  const s = u?.stats[i];
  return u && s && s.stat === a.stat ? statRangeText(a.stat, ...uniqueStatRange(u, s)) : undefined;
}

/** One affix line: its value, what the chisel shows about it (range, next tier, "stays"), its tier. */
function AffixLine({ it, i, c }: { it: Item; i: number; c: ChiselDef }) {
  const a = it.affixes[i];
  const bound = isBound(it, i);
  let note: string | undefined;
  if (bound) note = c.kind === ChiselKind.Improvement ? "bound: can't be improved" : 'stays';
  else if (c.kind === ChiselKind.Recalibration) note = rangeOf(it, i);
  else if (c.kind === ChiselKind.Improvement) {
    note = a.tier >= it.tier ? 'at the top tier' : `T${a.tier + 1}: ${statRangeText(a.stat, ...affixRange(a.stat as StatId, a.tier + 1))}`;
  }
  return (
    <>
      <span>{statText(a.stat, a.value)}</span>
      {bound && <BoundMark />}
      {note && <span className="muted">{note}</span>}
      {a.tier > 0 && <span className="affix-tier">T{a.tier}</span>}
    </>
  );
}

export function ChiselAction({ s, it }: { s: Snapshot; it: Item }) {
  const [chiselId, setChiselId] = useSticky<number>('craftChisel', CHISELS[0].id);
  const c = CHISELS_BY_ID.get(chiselId) ?? CHISELS[0];
  const [target, setTarget] = useState(0);
  const held = s.supplies.get(c.id) ?? 0;
  const leg = it.legendary;
  const legName = leg && (EFFECTS_BY_ID.get(leg.effect)?.name ?? 'Legendary affix');
  const blocked = chiselBlocker(c, it, c.target ? target : undefined) ?? (held < 1 ? `No ${c.name} in stock` : undefined);

  const apply = () => {
    if (c.kind === ChiselKind.Chaos && !confirm(`Reroll every ${it.boundAffix ? 'unbound ' : ''}affix of this item? It can't be undone.`)) return;
    if (c.kind === ChiselKind.Corruption && !confirm("Corrupt this item? One random outcome, good or bad, and it can never be crafted again.")) return;
    if (c.kind === ChiselKind.Binding && !confirm("Bind this affix for good? An item can have only one bound affix, and it can't be unbound.")) return;
    call(s.conn.reducers.applyChisel({ itemId: it.id, chiselId: c.id, target: c.target ? target : 0 }));
  };

  // Binding picks among the legendary affix too; the others that target pick a regular affix.
  const legendaryPick = c.target === 'affixOrLegendary' && leg;
  return (
    <>
      <select value={c.id} onChange={e => { setChiselId(Number(e.target.value)); setTarget(0); }}>
        {CHISELS.map(x => (
          <option key={x.id} value={x.id}>{x.name} (×{s.supplies.get(x.id) ?? 0})</option>
        ))}
      </select>
      <p className="muted">{c.text}</p>
      {it.corruption > 0 && <p className="c-bad">Corrupted: {CORRUPTION_TEXT[it.corruption as Corruption] ?? 'changed'}.</p>}
      {c.target ? (
        <div className="affix-pick">
          {it.affixes.map((_, i) => (
            <label className="radio" key={i}>
              <input type="radio" name="craft-chisel" checked={target === i} onChange={() => setTarget(i)} />
              <AffixLine it={it} i={i} c={c} />
            </label>
          ))}
          {legendaryPick && (
            <label className="radio">
              <input type="radio" name="craft-chisel" checked={target === BOUND_LEGENDARY} onChange={() => setTarget(BOUND_LEGENDARY)} />
              <span><Icon name="sparkles" />{legName}: {statText(leg.stat, leg.value)}</span>
            </label>
          )}
        </div>
      ) : (
        (it.affixes.length > 0 || leg) && (
          <div className="chisel-affixes">
            {leg && (
              <div className="affix">
                <span><Icon name="sparkles" />{legName}: {statText(leg.stat, leg.value)}</span>
                {legendaryBound(it) && <BoundMark />}
                <span className="muted">
                  {legendaryBound(it) ? 'stays' : c.kind === ChiselKind.Recalibration ? statRangeText(leg.stat, ...legendaryBonusRange(leg.stat, it.tier)) : 'new effect'}
                </span>
              </div>
            )}
            {it.affixes.map((_, i) => (
              <div className="affix" key={i}>
                <AffixLine it={it} i={i} c={c} />
              </div>
            ))}
          </div>
        )
      )}
      <div className="craft-do">
        <span className="cost">Uses: <strong>1 {c.name}</strong> <span className="muted">({held} in stock)</span></span>
        <button className="btn primary" disabled={!!blocked} title={blocked} onClick={apply}>
          <Icon name="chisel" />Apply
        </button>
        {blocked && <span className="muted">{blocked}</span>}
      </div>
    </>
  );
}
