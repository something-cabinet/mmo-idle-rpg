// Dev cheats, rendered only in dev builds (SettingsView). The server refuses them unless
// the database was published locally with DEV_CHEATS=1 (spacetimedb/src/reducers/dev.ts).

import { useState } from 'react';
import { BASE_LIST } from '../../spacetimedb/src/data/bases';
import { MAX_TIER } from '../../spacetimedb/src/data/stats';
import { UNIQUES } from '../../spacetimedb/src/data/uniques';
import { RARITIES } from '../../spacetimedb/src/loot';
import { call, useSticky } from '../store';
import { CardHead } from './shared';
import type { Snapshot } from './snapshot';

const KINDS = [
  ['weapon', 'Weapons'],
  ['offhand', 'Off-hands'],
  ['armor', 'Armor'],
  ['jewelry', 'Jewelry'],
] as const;
const GEAR_RARITIES = RARITIES.filter(r => r !== 'Unique');

export function DevPanel({ s }: { s: Snapshot }) {
  const r = s.conn.reducers;
  const [gold, setGold] = useState('100000');
  const [dust, setDust] = useState('10000');
  const [baseId, setBaseId] = useSticky('devBase', BASE_LIST[0].id);
  const [tier, setTier] = useSticky('devTier', 1);
  const [rarity, setRarity] = useSticky<string>('devRarity', 'Rare');
  const [uniqueId, setUniqueId] = useSticky('devUnique', UNIQUES[0].id);
  const grant = (g: bigint, d: bigint) => call(r.devGrant({ gold: g, dust: d }), `+${g} gold, +${d} Dust`);
  const amount = (v: string) => (/^\d+$/.test(v) ? BigInt(v) : 0n);

  return (
    <div className="card dev-panel">
      <CardHead title="Dev cheats"><span className="tag preview">local only</span></CardHead>

      <h4 className="dev-h">Reveal</h4>
      <div className="dev-row">
        <button className="btn small" onClick={() => call(r.devRevealAll({}), 'Revealed every item, enemy and area')}>Reveal all items and locations</button>
        <button className="btn small" onClick={() => call(r.devUnlockZones({}), 'Every zone unlocked')}>Unlock all zones</button>
      </div>

      <h4 className="dev-h">Gold and Dust</h4>
      <div className="dev-row">
        <button className="btn small" onClick={() => grant(1_000_000n, 0n)}>+1M gold</button>
        <button className="btn small" onClick={() => grant(0n, 100_000n)}>+100k Dust</button>
      </div>
      <div className="dev-row">
        <label>Gold <input inputMode="numeric" value={gold} onChange={e => setGold(e.target.value)} /></label>
        <label>Dust <input inputMode="numeric" value={dust} onChange={e => setDust(e.target.value)} /></label>
        <button className="btn small" onClick={() => grant(amount(gold), amount(dust))}>Grant</button>
      </div>

      <h4 className="dev-h">Give gear</h4>
      <div className="dev-row">
        <label>
          Family
          <select value={baseId} onChange={e => setBaseId(Number(e.target.value))}>
            {KINDS.map(([kind, label]) => (
              <optgroup key={kind} label={label}>
                {BASE_LIST.filter(b => b.kind === kind).map(b => <option key={b.id} value={b.id}>{b.family}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        <label>
          Tier
          <select value={tier} onChange={e => setTier(Number(e.target.value))}>
            {Array.from({ length: MAX_TIER }, (_, i) => i + 1).map(t => <option key={t} value={t}>T{t}</option>)}
          </select>
        </label>
        <label>
          Rarity
          <select value={rarity} onChange={e => setRarity(e.target.value)}>
            {GEAR_RARITIES.map(x => <option key={x}>{x}</option>)}
          </select>
        </label>
        <button className="btn small primary" onClick={() => call(r.devGiveItem({ baseId, tier, rarity }), `Gave a T${tier} ${rarity} ${BASE_LIST.find(b => b.id === baseId)?.family}`)}>
          Give
        </button>
      </div>
      <div className="dev-row">
        <label>
          Unique
          <select value={uniqueId} onChange={e => setUniqueId(Number(e.target.value))}>
            {UNIQUES.map(u => <option key={u.id} value={u.id}>T{u.tier} {u.name}</option>)}
          </select>
        </label>
        <button className="btn small primary" onClick={() => call(r.devGiveUnique({ uniqueId }), `Gave ${UNIQUES.find(u => u.id === uniqueId)?.name}`)}>
          Give unique
        </button>
      </div>
      <p className="muted hint">Items go straight into the bag, past the bag limit. "Reveal" sets every enemy to at least 1 kill and each secret's trigger enemy to its threshold.</p>
    </div>
  );
}
