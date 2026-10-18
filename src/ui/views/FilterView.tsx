import { Fragment, memo, useEffect, useRef, useState } from 'react';
import { TYPE_LIST, type BaseKind } from '../../../spacetimedb/src/data/bases';
import { MAX_TIER } from '../../../spacetimedb/src/data/stats';
import { AFFIX_STAT_IDS, RARITIES } from '../../../spacetimedb/src/loot';
import { SCRAP_YIELD } from '../../../spacetimedb/src/data/recipes';
import { call, useSticky } from '../../store';
import { fmtBig } from '../format';
import { affixLabel, rarityCls } from '../items';
import { CardHead, StatRows, ViewHeader } from '../shared';
import type { Snapshot } from '../snapshot';

type LootFilterArgs = Parameters<Snapshot['conn']['reducers']['setLootFilter']>[0];

/** Whether two filters keep the same drops (checklist order doesn't matter). */
const sameFilter = (a: LootFilterArgs, b: LootFilterArgs) => {
  const key = (f: LootFilterArgs) =>
    JSON.stringify([f.minRarity.tag, f.minAffixTier, f.scrap, [...f.keepAffixes].sort(), [...f.keepTypes].sort()]);
  return key(a) === key(b);
};

export const AFFIX_ENTRIES = AFFIX_STAT_IDS.map(id => ({ id, label: affixLabel(id) }));
const KIND_GROUP: Record<BaseKind, string> = { weapon: 'Weapons', offhand: 'Off-hands', armor: 'Armor', jewelry: 'Jewelry' };
const TYPE_ENTRIES = (Object.keys(KIND_GROUP) as BaseKind[]).flatMap(kind =>
  TYPE_LIST.filter(t => t.kind === kind).map(t => ({ id: t.id, label: t.name, group: KIND_GROUP[kind] }))
);

function FilterSummary({ s }: { s: Snapshot }) {
  const since = BigInt(Date.now() - 8 * 3600_000) * 1000n;
  const recent = s.logs.filter(l => l.at.microsSinceUnixEpoch >= since);
  const kept = recent.reduce((n, l) => n + l.keptItemIds.length, 0);
  const salvaged = recent.reduce((n, l) => n + l.salvaged.reduce((a, b) => a + b, 0), 0);
  const dust = recent.reduce((n, l) => n + l.dust, 0n);
  const overflow = recent.reduce((n, l) => n + l.overflow, 0);
  return (
    <StatRows
      rows={[
        ['Drops', String(kept + salvaged)],
        ['Kept', String(kept)],
        ['Salvaged', `${salvaged} (+${fmtBig(dust)} Dust)`],
        ...(overflow ? [['Salvaged for a full bag', String(overflow)] as [string, string]] : []),
      ]}
    />
  );
}

/** A checklist that keeps only drops with a checked entry; none checked counts as all. */
export function KeepList({ title, what = 'Drops', one, many, entries, keep, search, onChange }: {
  title: string;
  /** What is kept or salvaged, for the help text. */
  what?: string;
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
        {what} that pass the other filters are kept only if they have a checked {one}; the rest are
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

/**
 * While `dirty`, asks before leaving this view: another view (hash navigation, put back
 * if the player stays, before the view switch renders) or the page (reload, close).
 */
function useLeaveGuard(dirty: boolean, message: string) {
  const ref = useRef(dirty);
  ref.current = dirty;
  useEffect(() => {
    const here = location.hash;
    const onHash = () => {
      if (!ref.current || location.hash === here) return;
      if (confirm(message)) ref.current = false;
      else history.replaceState(null, '', here);
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (ref.current) e.preventDefault();
    };
    window.addEventListener('hashchange', onHash);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [message]);
}

export const FilterView = memo(function FilterView({ s }: { s: Snapshot }) {
  const search = useSticky('affixSearch', '');
  const saved: LootFilterArgs = {
    minRarity: s.filter?.minRarity ?? { tag: 'Magic' },
    keepAffixes: s.filter?.keepAffixes ?? [],
    keepTypes: s.filter?.keepTypes ?? [],
    minAffixTier: s.filter?.minAffixTier ?? 1,
    scrap: s.filter?.scrap ?? false,
  };
  // Edits stay local until Save, so quick clicks can't overwrite each other.
  const [draft, setDraft] = useState<LootFilterArgs>();
  const f = draft ?? saved;
  const dirty = !!draft && !sameFilter(draft, saved);
  const setFilter = (patch: Partial<LootFilterArgs>) => setDraft({ ...f, ...patch });
  useLeaveGuard(dirty, 'You have unsaved loot filter changes. Leave without saving?');

  return (
    <>
      <ViewHeader title="Loot filter" icon="filter">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {dirty && <span className="tag">Unsaved changes</span>}
          <button className="btn small ghost" disabled={!dirty} onClick={() => setDraft(undefined)}>
            Discard
          </button>
          <button
            className="btn small primary"
            disabled={!dirty}
            onClick={() => draft && call(s.conn.reducers.setLootFilter(draft).then(() => setDraft(undefined)))}
          >
            Save
          </button>
        </div>
      </ViewHeader>
      <div className="grid-2">
        <div className="card">
          <CardHead title="Keep rarity" />
          <p className="muted">Drops below this rarity are salvaged into Dust automatically. Uniques are always kept.</p>
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
          <div className="card-head" style={{ marginTop: 12 }}><h2>Rejected drops</h2></div>
          <p className="muted">
            Salvage turns them into Dust and gold. Recycle turns them into materials of their tier, with no Dust or gold:{' '}
            {Object.entries(SCRAP_YIELD).map(([r, n]) => `${n} (${r})`).join(', ')}. Neither takes a bag slot.
          </p>
          <div className="seg">
            <button className={`seg-btn${!f.scrap ? ' active' : ''}`} onClick={() => setFilter({ scrap: false })}>Salvage</button>
            <button className={`seg-btn${f.scrap ? ' active' : ''}`} onClick={() => setFilter({ scrap: true })}>Recycle</button>
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
            title="Only keep these item types"
            one="item type"
            many="item types"
            entries={TYPE_ENTRIES}
            // Stored empty when all are kept (so new types are kept too); shown all checked.
            keep={new Set(f.keepTypes.length ? f.keepTypes : TYPE_ENTRIES.map(e => e.id))}
            onChange={keepTypes => setFilter({ keepTypes })}
          />
        </div>
      </div>
    </>
  );
});
