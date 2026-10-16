// Item index: every base's stats at a chosen tier, every affix's roll ranges, and every unique.

import { memo } from 'react';
import { BASE_LIST, implicitValue, weaponValues, type BaseDef, type BaseKind, type WeaponValues } from '../../../spacetimedb/src/data/bases';
import { EFFECTS_BY_ID, LEGENDARIES, LEGENDARIES_BY_ID, type LegendaryGroup } from '../../../spacetimedb/src/data/legendary';
import { MAX_TIER, STATS, Stat, affixRange, affixRef, roundStat, toStored, type StatId } from '../../../spacetimedb/src/data/stats';
import { AFFIX_STAT_IDS } from '../../../spacetimedb/src/loot';
import { UNIQUES, uniqueRoll, type UniqueDef } from '../../../spacetimedb/src/data/uniques';
import { RAIDS_BY_ID } from '../../../spacetimedb/src/data/raids';
import { useSticky } from '../../store';
import { fmt } from '../format';
import { Icon } from '../Icon';
import { affixLabel, statText } from '../items';
import { ItemIcon } from '../itemArt';
import { CardHead, ViewHeader } from '../shared';
import type { Snapshot } from '../snapshot';
import { UNKNOWN, baseFound, uniqueFound } from '../discovery';

const KIND_TITLE: Record<BaseKind, string> = { weapon: 'Weapons', offhand: 'Off-hands', armor: 'Armor', jewelry: 'Jewelry' };
const SLOT_LABEL: Record<string, string> = { MainHand: 'Main hand', OffHand: 'Off-hand', Ring1: 'Ring', Ring2: 'Ring' };
const slotText = (b: BaseDef) => [...new Set(b.slots.map(s => SLOT_LABEL[s] ?? s))].join(', ');

/** A base's implicit lines at tier `t`. */
const implicitLines = (b: BaseDef, t: number) => b.implicits.map(imp => statText(imp.stat, toStored(implicitValue(imp, t))));

/** A base's name at `tier`, or ??? until it has dropped for the player. */
function BaseName({ b, tier, found }: { b: BaseDef; tier: number; found: boolean }) {
  return (
    <td className="name">
      <ItemIcon it={{ baseId: b.id, tier }} />
      {found ? b.name(tier) : <span className="muted" title="Not found yet: see it drop to learn its name">{UNKNOWN}</span>}
    </td>
  );
}

const damageText = (w: WeaponValues) => `${fmt(w.hit)} ${w.damageType === 'Physical' ? 'phys' : 'magic'}`;
const healText = (w: WeaponValues) => (w.heal > 0 ? `${fmt(w.heal)}${w.healTarget === 'All' ? ' (all)' : ''}` : '');

function WeaponTable({ bases, tier, found }: { bases: BaseDef[]; tier: number; found: (b: BaseDef) => boolean }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Name</th><th>Hands</th><th className="num">Damage</th><th className="num">Speed</th>
            <th className="num" title="Damage × speed, before crits and stats">DPS</th><th className="num">Crit</th><th className="num">Heal</th><th>Implicits</th>
          </tr>
        </thead>
        <tbody>
          {bases.map(b => {
            const w = weaponValues(b.weapon!, tier);
            return (
              <tr key={b.id}>
                <BaseName b={b} tier={tier} found={found(b)} />
                <td>{w.twoHanded ? '2H' : '1H'}{w.ranged ? ' ranged' : ''}</td>
                <td className="num">{damageText(w)}</td>
                <td className="num">{w.speed}/s</td>
                <td className="num">{fmt(w.hit * w.speed)}</td>
                <td className="num">{w.baseCrit}%</td>
                <td className="num">{healText(w)}</td>
                <td className="muted">{implicitLines(b, tier).join(' · ')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function BaseTable({ bases, tier, found }: { bases: BaseDef[]; tier: number; found: (b: BaseDef) => boolean }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr><th>Name</th><th>Type</th><th>Slot</th><th>Implicits</th></tr>
        </thead>
        <tbody>
          {bases.map(b => (
            <tr key={b.id}>
              <BaseName b={b} tier={tier} found={found(b)} />
              <td>{b.family.split(' · ')[0]}</td>
              <td>{slotText(b)}</td>
              <td className="muted">{implicitLines(b, tier).join(' · ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const num = (v: number) => String(Number(v.toFixed(2)));
const TIERS = Array.from({ length: MAX_TIER }, (_, i) => i + 1);
const AFFIX_WEIGHT = AFFIX_STAT_IDS.reduce((sum, id) => sum + (STATS[id as StatId].weight ?? 100), 0);
/** Stats added after their kin, listed right after it instead of by ID. */
const AFFIX_AFTER: Partial<Record<number, number>> = { [Stat.BaseCritChance]: Stat.CritChancePct, [Stat.EvasionRatingPct]: Stat.EvasionRating };
const affixRank = (id: number) => (AFFIX_AFTER[id] ?? id - 0.5) + 0.5;
const AFFIX_ORDER = [...AFFIX_STAT_IDS].sort((a, b) => affixRank(a) - affixRank(b));

/** Every regular affix: its chance to be picked and its value range per affix tier. */
function AffixTable() {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Affix</th>
            <th className="num" title="Chance that a rolled affix is this one">Chance</th>
            {TIERS.map(k => <th key={k} className="num">T{k}</th>)}
          </tr>
        </thead>
        <tbody>
          {AFFIX_ORDER.map(id => {
            const stat = id as StatId;
            return (
              <tr key={id}>
                <td className="name">{affixLabel(id)}</td>
                <td className="num">{num((100 * (STATS[stat].weight ?? 100)) / AFFIX_WEIGHT)}%</td>
                {TIERS.map(k => {
                  const [lo, hi] = affixRange(stat, k);
                  return <td key={k} className="num">{num(roundStat(stat, lo))}–{num(roundStat(stat, hi))}</td>;
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const GROUP_SLOTS: Record<LegendaryGroup, string> = { Offense: 'Weapons and tome', Defense: 'Armor and shield', Utility: 'Rings and amulet' };

/** Every legendary affix by group: its stat bonus, what one copy does and its stacking cap. */
function LegendaryTable() {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr><th>Effect</th><th>Bonus stat</th><th>One copy</th><th>Cap</th></tr>
        </thead>
        <tbody>
          {(Object.keys(GROUP_SLOTS) as LegendaryGroup[]).flatMap(g => [
            <tr key={g} className="boss"><td colSpan={4} className="muted">{g}: {GROUP_SLOTS[g]}</td></tr>,
            ...LEGENDARIES.filter(l => l.group === g).map(l => (
              <tr key={l.id}>
                <td className="name"><Icon name="sparkles" />{l.name}</td>
                <td>{affixLabel(l.bonusStat)}</td>
                <td className="wrap">{l.text}</td>
                <td className="wrap">{Number.isFinite(l.cap) ? l.describe(l.cap) : 'None'}</td>
              </tr>
            )),
          ])}
        </tbody>
      </table>
    </div>
  );
}

/** "+24–42% Physical damage": a unique stat's roll range. */
function rangeText(stat: UniqueDef['stats'][number], tier: number): string {
  const d = STATS[stat.stat];
  const top = affixRef(stat.stat, tier) * (stat.x ?? 1);
  const [rlo, rhi] = uniqueRoll(stat);
  const [lo, hi] = [roundStat(stat.stat, top * rlo), roundStat(stat.stat, top * rhi)];
  const unit = d.percent ? '%' : '';
  // A range that crosses zero (Lunatic's Wager) reads "−14% to +14%".
  return lo < 0 ? `${num(lo)}${unit} to +${num(hi)}${unit} ${d.name}` : `+${num(lo)}–${num(hi)}${unit} ${d.name}`;
}

type UniqueSource = 'world' | 'raid';
const uniqueSource = (u: UniqueDef): UniqueSource => (u.raidId !== undefined ? 'raid' : 'world');
const SOURCE_LABEL: Record<UniqueSource | 'all', string> = { all: 'All', world: 'World', raid: 'Raid' };
/** Tiers that have uniques, ascending. */
const UNIQUE_TIERS = [...new Set(UNIQUES.map(u => u.tier))].sort((a, b) => a - b);

/** An undiscovered unique: only its tier and base are known. */
function UnknownUniqueCard({ u }: { u: UniqueDef }) {
  const b = BASE_LIST.find(x => x.id === u.baseId)!;
  return (
    <div className="item-card r-unique unknown">
      <div className="item-head">
        <span className="item-name">{UNKNOWN}</span>
        <span className="badge r-unique">T{u.tier}</span>
      </div>
      <div className="item-sub">
        <span>Unique</span>
        <span>{b.family.split(' · ')[0]}</span>
      </div>
      <p className="muted">
        Not found yet. Its name, effects and stats are revealed when one drops for you.{u.enemyId !== undefined && ' Rumoured to drop in one hidden place only.'}
        {u.raidId !== undefined && ` Drops only from the ${RAIDS_BY_ID.get(u.raidId)?.name ?? 'raid'} raid.`}
      </p>
    </div>
  );
}

function UniqueCard({ u }: { u: UniqueDef }) {
  const b = BASE_LIST.find(x => x.id === u.baseId)!;
  const w = b.weapon && weaponValues(b.weapon, u.tier);
  const baseLines = [
    ...(w ? [`${w.twoHanded ? 'Two-handed' : 'One-handed'}${w.ranged ? ', ranged' : ''}`, `Damage ${damageText(w)} · ${w.speed}/s`, `Crit ${w.baseCrit}%`, ...(w.heal > 0 ? [`Heal ${healText(w)}`] : [])] : []),
    ...implicitLines(b, u.tier),
  ];
  return (
    <div className="item-card r-unique">
      <div className="item-head">
        <span className="item-name">{u.name}</span>
        <span className="badge r-unique">T{u.tier}</span>
      </div>
      <div className="item-sub">
        <span>Unique</span>
        <span>{b.name(u.tier)}</span>
      </div>
      <div className="item-implicits">
        {baseLines.map((t, i) => <span key={i}>{t}</span>)}
      </div>
      {u.effects.map(id => {
        const e = EFFECTS_BY_ID.get(id);
        return (
          <div className={`item-legendary${LEGENDARIES_BY_ID.has(id) ? '' : ' unique'}`} key={id}>
            <strong><Icon name="sparkles" />{e?.name ?? `Effect ${id}`}</strong>
            <span>{e?.text}</span>
          </div>
        );
      })}
      <div className="item-affixes">
        {u.stats.map((st, i) => (
          <div className="affix" key={i}><span>{rangeText(st, u.tier)}</span></div>
        ))}
      </div>
    </div>
  );
}

export const ItemIndexView = memo(function ItemIndexView({ s }: { s: Snapshot }) {
  const [tab, setTab] = useSticky<'bases' | 'affixes' | 'uniques'>('indexTab', 'bases');
  const [tier, setTier] = useSticky('indexTier', s.target?.zone.tier ?? 1);
  const [uTier, setUTier] = useSticky<number>('indexUniqueTier', 0);
  const [uSource, setUSource] = useSticky<UniqueSource | 'all'>('indexUniqueSource', 'all');
  const uniques = [...UNIQUES]
    .filter(u => (uTier === 0 || u.tier === uTier) && (uSource === 'all' || uniqueSource(u) === uSource))
    .sort((a, b) => a.tier - b.tier || a.id - b.id);
  const uniquesFound = uniques.filter(u => uniqueFound(s, u)).length;
  const found = (b: BaseDef) => baseFound(s, b.id, tier);
  // Raid-only bases drop at their raid's tier only.
  const tierBases = BASE_LIST.filter(b => b.raidId === undefined || RAIDS_BY_ID.get(b.raidId)?.tier === tier);
  const basesFound = tierBases.filter(found).length;

  return (
    <>
      <ViewHeader title="Item index" icon="book">
        <div className="seg view-head-center">
          <button className={`seg-btn${tab === 'bases' ? ' active' : ''}`} onClick={() => setTab('bases')}>Bases</button>
          <button className={`seg-btn${tab === 'affixes' ? ' active' : ''}`} onClick={() => setTab('affixes')}>Affixes</button>
          <button className={`seg-btn c-unique${tab === 'uniques' ? ' active' : ''}`} onClick={() => setTab('uniques')}>Uniques</button>
        </div>
      </ViewHeader>
      {tab === 'affixes' ? (
        <>
          <div className="card">
            <CardHead title="Affixes" />
            <p className="muted">
              Any affix can roll on any item, duplicates allowed. A tier-N item rolls affix tiers 1 to N with equal chance;
              each tier's range is the same on every item.
            </p>
            <AffixTable />
          </div>
          <div className="card">
            <CardHead title="Legendary affixes" />
            <p className="muted">
              A Legendary item has 2 affixes plus one legendary affix from its slot's group: a stat bonus (half a roll of the item's top affix tier) and an
              effect. Wearing more copies adds the effect again, up to its cap.
            </p>
            <LegendaryTable />
          </div>
        </>
      ) : tab === 'bases' ? (
        <>
          <div className="card index-toolbar">
            <span className="toolbar-label">Tier</span>
            <div className="seg wrap">
              {Array.from({ length: MAX_TIER }, (_, i) => i + 1).map(t => (
                <button key={t} className={`seg-btn${t === tier ? ' active' : ''}`} onClick={() => setTier(t)}>T{t}</button>
              ))}
            </div>
            <span className="muted">Found {basesFound}/{tierBases.length} at T{tier}. Base stats only: affixes roll on top (Magic and up).</span>
          </div>
          {(Object.keys(KIND_TITLE) as BaseKind[]).map(kind => {
            const bases = tierBases.filter(b => b.kind === kind);
            return (
              <div className="card" key={kind}>
                <CardHead title={KIND_TITLE[kind]} />
                {kind === 'weapon' ? <WeaponTable bases={bases} tier={tier} found={found} /> : <BaseTable bases={bases} tier={tier} found={found} />}
              </div>
            );
          })}
        </>
      ) : (
        <>
          <div className="card index-toolbar">
            <span className="toolbar-label">Tier</span>
            <div className="seg wrap">
              {[0, ...UNIQUE_TIERS].map(t => (
                <button key={t} className={`seg-btn${t === uTier ? ' active' : ''}`} onClick={() => setUTier(t)}>{t === 0 ? 'All' : `T${t}`}</button>
              ))}
            </div>
            <span className="toolbar-label">Source</span>
            <div className="seg wrap">
              {(['all', 'world', 'raid'] as const).map(src => (
                <button key={src} className={`seg-btn${src === uSource ? ' active' : ''}`} onClick={() => setUSource(src)}>{SOURCE_LABEL[src]}</button>
              ))}
            </div>
          </div>
          <p className="muted">
            World uniques drop from any enemy in a zone of their tier or higher (a few only in one hidden place), raid uniques
            only from their raid; all are always kept. Each stat rolls in the range shown; effects with a cost apply once
            however many items carry them. Found {uniquesFound}/{uniques.length}.
          </p>
          {uniques.length === 0 && <p className="muted">No uniques match these filters.</p>}
          <div className="index-uniques">
            {uniques.map(u => (uniqueFound(s, u) ? <UniqueCard key={u.id} u={u} /> : <UnknownUniqueCard key={u.id} u={u} />))}
          </div>
        </>
      )}
    </>
  );
});
