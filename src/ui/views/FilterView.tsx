import { memo } from 'react';
import { STATS, type StatId } from '../../../spacetimedb/src/data/stats';
import { RARITIES, type RarityName } from '../../../spacetimedb/src/loot';
import { call, useSticky } from '../../store';
import { fmtBig } from '../format';
import { affixLabel, rarityCls } from '../items';
import { CardHead, StatRows, ViewHeader } from '../shared';
import type { Snapshot } from '../snapshot';

const AFFIX_STATS = (Object.values(STATS) as (typeof STATS)[StatId][]).filter(d => d.ref !== undefined).map(d => d.id);

function FilterSummary({ s }: { s: Snapshot }) {
  const since = BigInt(Date.now() - 8 * 3600_000) * 1000n;
  const recent = s.logs.filter(l => l.at.microsSinceUnixEpoch >= since);
  const kept = recent.reduce((n, l) => n + l.keptItemIds.length, 0);
  const salvaged = recent.reduce((n, l) => n + l.salvaged.reduce((a, b) => a + b, 0), 0);
  const essence = recent.reduce((n, l) => n + l.essence, 0n);
  const overflow = recent.reduce((n, l) => n + l.overflow, 0);
  return (
    <StatRows
      rows={[
        ['Drops', String(kept + salvaged)],
        ['Kept', String(kept)],
        ['Salvaged', `${salvaged} (+${fmtBig(essence)} Essence)`],
        ...(overflow ? [['Salvaged for a full bag', String(overflow)] as [string, string]] : []),
      ]}
    />
  );
}

export const FilterView = memo(function FilterView({ s }: { s: Snapshot }) {
  const [search, setSearch] = useSticky('affixSearch', '');
  const min = s.filter?.minRarity.tag ?? 'Magic';
  const keep = new Set(s.filter?.keepAffixes ?? []);
  const q = search.toLowerCase();
  const setFilter = (minRarity: string, keepAffixes: number[]) =>
    call(s.conn.reducers.setLootFilter({ minRarity: { tag: minRarity as RarityName }, keepAffixes }));

  return (
    <>
      <ViewHeader title="Loot filter" icon="filter" />
      <div className="grid-2">
        <div className="card">
          <CardHead title="Keep rarity" />
          <p className="muted">Drops below this rarity are salvaged into Essence automatically.</p>
          <div className="seg wrap">
            {RARITIES.slice(0, 5).map(r => (
              <button key={r} className={`seg-btn c-${rarityCls(r)}${r === min ? ' active' : ''}`} onClick={() => setFilter(r, [...keep])}>
                {r}+
              </button>
            ))}
          </div>
          <div className="card-head" style={{ marginTop: 12 }}><h2>Last 8 hours</h2></div>
          <FilterSummary s={s} />
        </div>
        <div className="card">
          <CardHead title="Always keep affixes"><span className="muted">{keep.size} selected</span></CardHead>
          <input placeholder="Search affixes…" value={search} onChange={e => setSearch(e.target.value)} />
          <div className="checks">
            {AFFIX_STATS.map(id => {
              const label = affixLabel(id);
              return (
                <label className="check" key={id} hidden={Boolean(q) && !label.toLowerCase().includes(q)}>
                  <input
                    type="checkbox"
                    checked={keep.has(id)}
                    onChange={e => {
                      const next = new Set(keep);
                      if (e.target.checked) next.add(id);
                      else next.delete(id);
                      setFilter(min, [...next]);
                    }}
                  />
                  {label}
                </label>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
});
