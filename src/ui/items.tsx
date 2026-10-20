// Item text and cards from `item` rows (names, stat lines, legendary effects).

import type { Item } from '../module_bindings/types';
import { base, baseType } from '../../spacetimedb/src/data/bases';
import { EFFECTS_BY_ID, LEGENDARIES_BY_ID } from '../../spacetimedb/src/data/legendary';
import { MATERIALS_BY_ID } from '../../spacetimedb/src/data/materials';
import { supplyName } from '../../spacetimedb/src/data/supplies';
import { STATS, fromStored, roundStat, type StatId } from '../../spacetimedb/src/data/stats';
import { BOUND_LEGENDARY, CORRUPTION_TEXT, type Corruption } from '../../spacetimedb/src/chisel';
import { UNIQUES_BY_ID } from '../../spacetimedb/src/data/uniques';
import { MAX_TEMPER } from '../../spacetimedb/src/data/recipes';
import { TEMPER_STEP, tempered } from '../../spacetimedb/src/combat';
import { fmt } from './format';
import { Icon } from './Icon';
import { ItemArt, ItemIcon, itemArtUrl } from './itemArt';

export const rarityCls = (tag: string) => tag.toLowerCase();
/** A rarity's name in the game: an Anomaly is never named. */
export const rarityLabel = (tag: string) => (tag === 'Anomaly' ? '???' : tag);
/** "Wolfhide Cap +3": the unique's or the base's name, then the temper level. */
export const itemName = (it: { baseId: number; tier: number; uniqueId?: number; temper?: number }) =>
  ((it.uniqueId !== undefined && UNIQUES_BY_ID.get(it.uniqueId)?.name) || base(it.baseId).name(it.tier)) + (it.temper ? ` +${it.temper}` : '');

/** Bag glyph for an item: weapon/off-hand family, armor slot, or ring/amulet. */
export const materialName = (id: number) => MATERIALS_BY_ID.get(id)?.name ?? `Material ${id}`;
export const materialIconName = (id: number) => `m-${(MATERIALS_BY_ID.get(id)?.kind ?? 'Metal').toLowerCase()}`;
/** "3 Rough Hide, 1 Faint Core". */
export const materialsText = (ms: readonly { materialId: number; count: number }[]) =>
  ms.map(m => `${m.count.toLocaleString()} ${materialName(m.materialId)}`).join(', ');

export const suppliesText = (ss: readonly { supplyId: number; count: number }[]) =>
  ss.map(x => `${x.count.toLocaleString()} ${supplyName(x.supplyId)}`).join(', ');

export const itemIconName = (it: { baseId: number }) => `i-${baseType(it.baseId).icon}`;

const num = (v: number) => String(Number(Math.abs(v).toFixed(2)));

/** A stat's roll range in display units, e.g. "12–18%" (a negative bound keeps its sign). */
export function statRangeText(stat: number, lo: number, hi: number): string {
  const d = STATS[stat as StatId];
  const sign = (v: number) => (v < 0 ? '−' : '');
  const r = (v: number) => (d ? roundStat(stat as StatId, v) : v);
  return `${sign(r(lo))}${num(r(lo))}–${sign(r(hi))}${num(r(hi))}${d?.percent ? '%' : ''}`;
}

/** Marks an affix a Binding Chisel bound. */
export const BoundMark = () => (
  <span className="affix-bound" title="Bound: no reroll or chisel changes it">
    <Icon name="bind" />
  </span>
);

/** "+12 Max HP", "+5% Physical damage", "−8% Attack speed". */
export function statText(stat: number, value: bigint): string {
  const d = STATS[stat as StatId];
  const v = fromStored(value);
  const sign = v < 0 ? '−' : '+';
  if (!d) return `${sign}${num(v)} (stat ${stat})`;
  return `${sign}${num(v)}${d.percent ? '%' : ''} ${d.name}`;
}

/** Display name of an affix in the loot filter list. */
export const affixLabel = (stat: number) => {
  const d = STATS[stat as StatId];
  return `${d.name}${d.percent ? ' %' : ''}`;
};

/** A weapon's base lines: what it is first (handedness, range), then its stats. */
function weaponLines(it: Item, w: NonNullable<Item['weapon']>): string[] {
  const speed = w.speedMilli / 1000;
  return [
    `${w.twoHanded ? 'Two-handed' : 'One-handed'}${base(it.baseId).weapon?.ranged ? ', ranged' : ''}`,
    `Damage ${w.damageType.tag === 'Split' ? `${fmt(fromStored(w.hit) / 2)} phys, ${fmt(fromStored(w.hit) / 2)} magic` : `${fmt(fromStored(w.hit))} ${w.damageType.tag === 'Physical' ? 'phys' : 'magic'}`} · ${speed}/s`,
    `Crit ${w.baseCritBp / 100}%`,
    ...(w.heal > 0n ? [`Heal ${fmt(fromStored(w.heal))}${w.healTarget?.tag === 'All' ? ' (all)' : ''}`] : []),
  ];
}

export function ItemCard({ it, compact, note }: { it: Item; compact?: boolean; /** Extra line under the header, e.g. "In Farm". */ note?: string }) {
  const r = rarityCls(it.rarity.tag);
  const leg = it.legendary && EFFECTS_BY_ID.get(it.legendary.effect);
  // Tempering raises the base part: the weapon's damage and heal, and the implicits.
  const t = tempered(it);
  const implicits = [...(t.weapon ? weaponLines(t, t.weapon) : []), ...t.implicits.map(i => statText(i.stat, i.value))];
  const top = (
    <>
      <div className="item-head">
        <span className="item-name">{itemName(it)}</span>
        {it.locked && (
          <span className="lock" title="Locked">
            <Icon name="lock" />
          </span>
        )}
        <span className={`badge r-${r}`}>T{it.tier}</span>
      </div>
      <div className="item-sub">
        <span>{rarityLabel(it.rarity.tag)}</span>
        <span>{it.uniqueId !== undefined ? base(it.baseId).name(it.tier) : base(it.baseId).family}</span>
      </div>
      {note && (
        <div className="item-sub">
          <span className="muted">{note}</span>
        </div>
      )}
    </>
  );
  return (
    <div className={`item-card r-${r}${compact ? ' compact' : ''}`}>
      {itemArtUrl(it) ? (
        <div className="item-top">
          <ItemArt it={it} className="card-art" />
          <div className="item-top-text">{top}</div>
        </div>
      ) : (
        top
      )}
      {it.corruption > 0 && (
        <div className="item-sub">
          <span className="c-bad" title={`Corruption Chisel: ${CORRUPTION_TEXT[it.corruption as Corruption] ?? 'changed'}. It can't be crafted any more.`}>Corrupted</span>
        </div>
      )}
      {it.temper > 0 && (
        <div className="item-sub">
          <span className="c-temper">Tempered +{it.temper}: base stats +{Math.round(it.temper * TEMPER_STEP * 100)}%</span>
        </div>
      )}
      <div className={`item-implicits${it.temper > 0 ? ' tempered' : ''}`}>
        {implicits.map((t, i) => (
          <span key={i}>{t}</span>
        ))}
      </div>
      {leg && (
        <div className="item-legendary">
          <strong>
            <Icon name="sparkles" />
            {leg.name}
            {it.boundAffix === BOUND_LEGENDARY && <BoundMark />}
          </strong>
          <span>{leg.text}</span>
          <span className="muted">{statText(it.legendary!.stat, it.legendary!.value)}</span>
        </div>
      )}
      {/* A unique's effects: legendary ones in orange, unique-only ones in magenta. */}
      {it.effects.map(id => {
        const e = EFFECTS_BY_ID.get(id);
        return (
          <div className={`item-legendary${LEGENDARIES_BY_ID.has(id) ? '' : ' unique'}`} key={id}>
            <strong>
              <Icon name="sparkles" />
              {e?.name ?? `Effect ${id}`}
            </strong>
            <span>{e?.text}</span>
          </div>
        );
      })}
      {it.affixes.length > 0 && (
        <div className="item-affixes">
          {it.affixes.map((a, i) => (
            <div className="affix" key={i}>
              <span>{statText(a.stat, a.value)}</span>
              {it.boundAffix === i + 1 && <BoundMark />}
              {a.tier > 0 && <span className="affix-tier">T{a.tier}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export const EmptyCard = ({ text = 'Empty' }: { text?: string }) => (
  <div className="item-card empty">
    <span className="muted">{text}</span>
  </div>
);

/** Square item icon tile (bag, equipment, slot picker). */
export function ItemTile({ it, selected, badge, title, onClick }: { it: Item; selected?: boolean; badge?: React.ReactNode; title?: string; onClick: (ev: React.MouseEvent) => void }) {
  return (
    <button className={`item-tile r-${rarityCls(it.rarity.tag)}${selected ? ' selected' : ''}`} title={title ?? `${rarityLabel(it.rarity.tag)} ${itemName(it)}`} onClick={onClick}>
      <ItemIcon it={it} className="tile-ico" />
      <span className="tile-tier">T{it.tier}</span>
      {it.temper > 0 && <span className={`tile-temper${it.temper >= MAX_TEMPER ? ' maxed' : ''}`}>+{it.temper}</span>}
      {it.locked && (
        <span className="tile-lock">
          <Icon name="lock" />
        </span>
      )}
      {(it.legendary || it.effects.length > 0) && (
        <span className={`tile-leg${it.legendary ? '' : ' unique'}`}>
          <Icon name="sparkles" />
        </span>
      )}
      {badge}
    </button>
  );
}
