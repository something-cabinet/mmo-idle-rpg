// The Look card on the Character page (docs/design/cosmetics.md): a preview of the name as
// others see it, and one picker per slot. Locked cosmetics show how to unlock them.

import { COSMETICS, type CosmeticDef, type CosmeticSlot } from '../../../spacetimedb/src/data/cosmetics';
import { call } from '../../store';
import { NameInLook, type LookIds } from '../PlayerName';
import { CardHead } from '../shared';
import type { Snapshot } from '../snapshot';

const SLOTS: { slot: CosmeticSlot; label: string; key: keyof LookIds }[] = [
  { slot: 'title', label: 'Title', key: 'titleId' },
  { slot: 'visual', label: 'Name visual', key: 'visualId' },
  { slot: 'plate', label: 'Nameplate', key: 'plateId' },
];

export function LookCard({ s }: { s: Snapshot }) {
  const conn = s.conn;
  const look: LookIds = conn.db.look.characterId.find(s.row.id) ?? { titleId: 0, visualId: 0, plateId: 0 };
  const have = new Set([...conn.db.myCosmetics.iter()].map(u => u.cosmeticId));
  const wear = (key: keyof LookIds, id: number) => call(conn.reducers.setLook({ ...look, [key]: id }));

  return (
    <div className="card look-card">
      <CardHead title="Look"><span className="muted">{have.size} / {COSMETICS.length} unlocked</span></CardHead>
      <div className="look-preview"><NameInLook name={s.row.name} look={look} /></div>
      {SLOTS.map(({ slot, label, key }) => {
        const list = COSMETICS.filter(c => c.slot === slot);
        return (
          <div key={slot} className="look-slot">
            <h3>{label} <span className="muted">{list.filter(c => have.has(c.id)).length} / {list.length}</span></h3>
            <div className="look-options">
              <button className={`look-option${look[key] === 0 ? ' on' : ''}`} onClick={() => look[key] !== 0 && wear(key, 0)}>
                <span className="look-sample">None</span>
              </button>
              {list.map(c => (
                <Option key={c.id} c={c} on={look[key] === c.id} unlocked={have.has(c.id)} onPick={() => look[key] !== c.id && wear(key, c.id)} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Option({ c, on, unlocked, onPick }: { c: CosmeticDef; on: boolean; unlocked: boolean; onPick: () => void }) {
  const sample = c.slot === 'visual' ? <span className={`pname-name nv nv-${c.css}`} data-text={c.name}>{c.name}</span>
    : c.slot === 'plate' ? <span className={`pname np np-${c.css}`}><span className="pname-name">{c.name}</span></span>
    : c.name;
  return (
    <button className={`look-option${on ? ' on' : ''}${unlocked ? '' : ' locked'}`} disabled={!unlocked} onClick={onPick}
      title={unlocked ? c.text ?? c.how : `Locked: ${c.how}`}>
      <span className="look-sample">{sample}</span>
      <span className="look-how muted">{unlocked ? c.text ?? c.how : c.how}</span>
    </button>
  );
}
