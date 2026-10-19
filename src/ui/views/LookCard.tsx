// The Character page's Customize tab (docs/design/cosmetics.md): a preview of the name as
// others see it, and one picker per slot with the cosmetics unlocked so far.

import { COSMETICS, type CosmeticDef, type CosmeticSlot } from '../../../spacetimedb/src/data/cosmetics';
import { call } from '../../store';
import { NameInLook, type LookIds } from '../PlayerName';
import { CardHead } from '../shared';
import type { Snapshot } from '../snapshot';

const SLOTS: { slot: CosmeticSlot; label: string; key: keyof LookIds }[] = [
  { slot: 'title', label: 'Title', key: 'titleId' },
  { slot: 'visual', label: 'Name effect', key: 'visualId' },
  { slot: 'plate', label: 'Nameplate', key: 'plateId' },
];

export function LookCard({ s }: { s: Snapshot }) {
  const conn = s.conn;
  const look: LookIds = conn.db.look.characterId.find(s.row.id) ?? { titleId: 0, visualId: 0, plateId: 0 };
  const have = new Set([...conn.db.myCosmetics.iter()].map(u => u.cosmeticId));
  const wear = (key: keyof LookIds, id: number) => call(conn.reducers.setLook({ ...look, [key]: id }));

  return (
    <div className="card look-card">
      <CardHead title="Look" />
      <div className="look-preview"><NameInLook name={s.row.name} look={look} /></div>
      {SLOTS.map(({ slot, label, key }) => {
        const list = COSMETICS.filter(c => c.slot === slot && have.has(c.id));
        return (
          <div key={slot} className="look-slot">
            <h3>{label}</h3>
            <div className="look-options">
              <button className={`look-option${look[key] === 0 ? ' on' : ''}`} onClick={() => look[key] !== 0 && wear(key, 0)}>
                <span className="look-sample">None</span>
              </button>
              {list.map(c => (
                <Option key={c.id} c={c} on={look[key] === c.id} onPick={() => look[key] !== c.id && wear(key, c.id)} />
              ))}
            </div>
            {!list.length && <p className="muted hint">None unlocked yet: milestones like bosses, raids and Moonwell depths unlock them.</p>}
          </div>
        );
      })}
    </div>
  );
}

function Option({ c, on, onPick }: { c: CosmeticDef; on: boolean; onPick: () => void }) {
  const sample = c.slot === 'visual' ? <span className={`pname-name nv nv-${c.css}`} data-text={c.name}>{c.name}</span>
    : c.slot === 'plate' ? <span className={`pname np np-${c.css}`}><span className="pname-name">{c.name}</span></span>
    : c.name;
  return (
    <button className={`look-option${on ? ' on' : ''}`} onClick={onPick} title={c.text ?? c.how}>
      <span className="look-sample">{sample}</span>
      <span className="look-how muted">{c.text ?? c.how}</span>
    </button>
  );
}
