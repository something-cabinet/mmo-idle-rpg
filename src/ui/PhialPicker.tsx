// Picks the Phial for one fight (phials.md): the Moonwell Deep's Descend and a raid party.

import { PHIALS, PHIALS_BY_ID, phialText } from '../../spacetimedb/src/data/supplies';
import type { Snapshot } from './snapshot';

/** Phials in stock, best grade first. */
export const heldPhials = (s: Snapshot) => PHIALS.filter(p => (s.supplies.get(p.id) ?? 0) > 0).sort((a, b) => b.grade - a.grade || a.phial.kind - b.phial.kind);

/** `phialId` if one is in stock, else 0: what a fight would really use. */
export const usablePhial = (s: Snapshot, phialId: number) => (phialId !== 0 && (s.supplies.get(phialId) ?? 0) > 0 ? phialId : 0);

/** A select of the Phials in stock (with the chosen one even when none are left), or a hint when there are none. */
export function PhialPicker({ s, value, onChange }: { s: Snapshot; value: number; onChange: (phialId: number) => void }) {
  const held = heldPhials(s);
  const chosen = PHIALS_BY_ID.get(value);
  const options = chosen && !held.includes(chosen) ? [chosen, ...held] : held;
  if (!options.length) return <span className="muted">No Phials: <a href="#alchemy">brew them with Alchemy</a></span>;
  return (
    <select value={value} onChange={e => onChange(Number(e.target.value))} title={chosen ? `${chosen.name}: ${phialText(chosen)}. Used up win or lose.` : 'One fight, used up win or lose'}>
      <option value={0}>No Phial</option>
      {options.map(p => {
        const n = s.supplies.get(p.id) ?? 0;
        return <option key={p.id} value={p.id}>{p.name} ({phialText(p)}) {n > 0 ? `×${n}` : '· none left'}</option>;
      })}
    </select>
  );
}
