import { Fragment, memo } from 'react';
import { BASE_LIST, type BaseKind } from '../../../spacetimedb/src/data/bases';
import { MAX_TIER } from '../../../spacetimedb/src/data/stats';
import { AFFIX_STAT_IDS, RARITIES } from '../../../spacetimedb/src/loot';
import { call, useSticky } from '../../store';
import { fmtBig } from '../format';
import { affixLabel, rarityCls } from '../items';
import { CardHead, StatRows, ViewHeader } from '../shared';
import type { Snapshot } from '../snapshot';

type LootFilterArgs = Parameters<Snapshot['conn']['reducers']['setLootFilter']>[0];

const AFFIX_ENTRIES = AFFIX_STAT_IDS.map(id => ({ id, label: affixLabel(id) }));
const KIND_GROUP: Record<BaseKind, string> = { weapon: 'Weapons', offhand: 'Off-hands', armor: 'Armor', jewelry: 'Jewelry' };
const BASE_ENTRIES = (Object.keys(KIND_GROUP) as BaseKind[]).flatMap(kind =>
  BASE_LIST.filter(b => b.kind === kind).map(b => ({ id: b.id, label: b.family, group: KIND_GROUP[kind] }))
);

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

/** A checklist that keeps only drops with a checked entry; none checked counts as all. */
function KeepList({ title, one, many, entries, keep, search, onChange }: {
  title: string;
  /** Singular and plural noun for the entries, e.g. "affix", "affixes". */
  one: string;
  many: string;
  entries: { id: number; label: string; group?: string }[];
  keep: ReadonlySet<number>;
  search?: [string, (q: string) => void];
  onChange: (ids: number[]) => void;
}) {
  const q = search?.[0].toLowerCase() ?? '';
  const shown = entries.filter(e => !q || e.label.toLowerCase().includes(q));
  return (
    <>
      <CardHead title={title}>
        <span className="muted" style={{ marginLeft: 'auto' }}>{keep.size} / {entries.length} selected</span>
        <button className="btn small ghost" disabled={keep.size === entries.length} onClick={() => onChange(entries.map(e => e.id))}>
          Reset
        </button>
      </CardHead>
      <p className="muted">
        Drops that pass the other filters are kept only if they have a checked {one}; the rest are
        salvaged. Keep everything checked to keep them all.
      </p>
      {keep.size === 0 && <p className="filter-warn">No {many} checked: treated as all checked, so nothing is salvaged for its {one}.</p>}
      {search && <input placeholder={`Search ${many}…`} value={search[0]} onChange={e => search[1](e.target.value)} />}
      <div className="checks">
        {shown.map((e, i) => (
          <Fragment key={e.id}>
            {e.group && e.group !== shown[i - 1]?.group && <h3 className="checks-group">{e.group}</h3>}
            <label className="check">
              <input
                type="checkbox"
                checked={keep.has(e.id)}
                onChange={ev => {
                  const next = new Set(keep);
                  if (ev.target.checked) next.add(e.id);
                  else next.delete(e.id);
                  onChange([...next]);
                }}
              />
              {e.label}
            </label>
          </Fragment>
        ))}
      </div>
    </>
  );
}

export const FilterView = memo(function FilterView({ s }: { s: Snapshot }) {
  const search = useSticky('affixSearch', '');
  const f: LootFilterArgs = {
    minRarity: s.filter?.minRarity ?? { tag: 'Magic' },
    keepAffixes: s.filter?.keepAffixes ?? [],
    keepBases: s.filter?.keepBases ?? [],
    minAffixTier: s.filter?.minAffixTier ?? 1,
  };
  const setFilter = (patch: Partial<LootFilterArgs>) => call(s.conn.reducers.setLootFilter({ ...f, ...patch }));

  return (
    <>
      <ViewHeader title="Loot filter" icon="filter" />
      <div className="grid-2">
        <div className="card">
          <CardHead title="Keep rarity" />
          <p className="muted">Drops below this rarity are salvaged into Essence automatically. Uniques are always kept.</p>
          <div className="seg wrap">
            {RARITIES.slice(0, 5).map(r => (
              <button key={r} className={`seg-btn c-${rarityCls(r)}${r === f.minRarity.tag ? ' active' : ''}`} onClick={() => setFilter({ minRarity: { tag: r } })}>
                {r}+
              </button>
            ))}
          </div>
          <div className="card-head" style={{ marginTop: 12 }}><h2>Minimum affix tier</h2></div>
          <p className="muted">
            Drops are kept only if at least one affix, checked or not, is this tier or higher. Common items have no affixes, so
            any minimum above Any salvages them.
          </p>
          <div className="seg wrap">
            {Array.from({ length: MAX_TIER }, (_, i) => i + 1).map(t => (
              <button key={t} className={`seg-btn${t === f.minAffixTier ? ' active' : ''}`} onClick={() => setFilter({ minAffixTier: t })}>
                {t === 1 ? 'Any' : `T${t}+`}
              </button>
            ))}
          </div>
          <div className="card-head" style={{ marginTop: 12 }}><h2>Last 8 hours</h2></div>
          <FilterSummary s={s} />
        </div>
        <div className="card">
          <KeepList
            title="Only keep these affixes"
            one="affix"
            many="affixes"
            entries={AFFIX_ENTRIES}
            keep={new Set(f.keepAffixes)}
            search={search}
            onChange={keepAffixes => setFilter({ keepAffixes })}
          />
        </div>
        <div className="card">
          <KeepList
            title="Only keep these families"
            one="family"
            many="families"
            entries={BASE_ENTRIES}
            keep={new Set(f.keepBases)}
            onChange={keepBases => setFilter({ keepBases })}
          />
        </div>
      </div>
    </>
  );
});
