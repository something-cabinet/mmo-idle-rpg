// Item text and cards from `item` rows (names, stat lines, legendary effects).

import type { Item } from '../module_bindings/types';
import { base } from '../../spacetimedb/src/data/bases';
import { LEGENDARIES_BY_ID } from '../../spacetimedb/src/data/legendary';
import { STATS, fromStored, type StatId } from '../../spacetimedb/src/data/stats';
import { fmt } from './format';
import { Icon } from './Icon';

export const rarityCls = (tag: string) => tag.toLowerCase();
export const itemName = (it: { baseId: number; tier: number }) => base(it.baseId).name(it.tier);

/** Bag glyph for an item: weapon/off-hand family, armor slot, or ring/amulet. */
export function itemIconName(it: { baseId: number }): string {
  const b = base(it.baseId);
  const name =
    b.kind === 'armor' ? b.slots[0].toLowerCase()
    : b.kind === 'jewelry' ? (b.slots[0] === 'Amulet' ? 'amulet' : 'ring')
    : b.family.toLowerCase().replace(/ /g, '-');
  return `i-${name}`;
}

const num = (v: number) => String(Number(Math.abs(v).toFixed(2)));

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

function weaponLines(w: NonNullable<Item['weapon']>): string[] {
  const speed = w.speedMilli / 1000;
  return [
    `Hit ${fmt(fromStored(w.hit))} ${w.damageType.tag === 'Physical' ? 'phys' : 'magic'} · ${speed}/s`,
    `Crit ${w.baseCritBp / 100}%`,
    ...(w.heal > 0n ? [`Heal ${fmt(fromStored(w.heal))}${w.healTarget?.tag === 'All' ? ' (all)' : ''}`] : []),
    w.twoHanded ? 'Two-handed' : 'One-handed',
  ];
}

export function ItemCard({ it, compact, note }: { it: Item; compact?: boolean; /** Extra line under the header, e.g. "In Farm". */ note?: string }) {
  const r = rarityCls(it.rarity.tag);
  const leg = it.legendary && LEGENDARIES_BY_ID.get(it.legendary.effect);
  const implicits = [...(it.weapon ? weaponLines(it.weapon) : []), ...it.implicits.map(i => statText(i.stat, i.value))];
  return (
    <div className={`item-card r-${r}${compact ? ' compact' : ''}`}>
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
        <span>{it.rarity.tag}</span>
        <span>{base(it.baseId).family}</span>
      </div>
      {note && (
        <div className="item-sub">
          <span className="muted">{note}</span>
        </div>
      )}
      <div className="item-implicits">
        {implicits.map((t, i) => (
          <span key={i}>{t}</span>
        ))}
      </div>
      {leg && (
        <div className="item-legendary">
          <strong>
            <Icon name="sparkles" />
            {leg.name}
          </strong>
          <span>{leg.text}</span>
          <span className="muted">{statText(it.legendary!.stat, it.legendary!.value)}</span>
        </div>
      )}
      {it.affixes.length > 0 && (
        <div className="item-affixes">
          {it.affixes.map((a, i) => (
            <div className="affix" key={i}>
              <span>{statText(a.stat, a.value)}</span>
              <span className="affix-tier">T{a.tier}</span>
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
    <button className={`item-tile r-${rarityCls(it.rarity.tag)}${selected ? ' selected' : ''}`} title={title ?? `${it.rarity.tag} ${itemName(it)}`} onClick={onClick}>
      <Icon name={itemIconName(it)} className="tile-ico" />
      <span className="tile-tier">T{it.tier}</span>
      {it.locked && (
        <span className="tile-lock">
          <Icon name="lock" />
        </span>
      )}
      {it.legendary && (
        <span className="tile-leg">
          <Icon name="sparkles" />
        </span>
      )}
      {badge}
    </button>
  );
}
