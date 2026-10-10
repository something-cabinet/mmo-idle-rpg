// Item text and cards from `item` rows (names, stat lines, legendary effects).

import type { Item } from '../module_bindings/types';
import { base } from '../../spacetimedb/src/data/bases';
import { LEGENDARIES_BY_ID } from '../../spacetimedb/src/data/legendary';
import { STATS, fromStored, type StatId } from '../../spacetimedb/src/data/stats';
import { fmt } from './format';
import { icon } from './icons';

export const rarityCls = (tag: string) => tag.toLowerCase();
export const itemName = (it: { baseId: number; tier: number }) => base(it.baseId).name(it.tier);

/** Bag glyph for an item: weapon/off-hand family, armor slot, or ring/amulet. */
export function itemIcon(it: { baseId: number }, cls = ''): string {
  const b = base(it.baseId);
  const name =
    b.kind === 'armor' ? b.slots[0].toLowerCase()
    : b.kind === 'jewelry' ? (b.slots[0] === 'Amulet' ? 'amulet' : 'ring')
    : b.family.toLowerCase().replace(/ /g, '-');
  return icon(`i-${name}`, cls);
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

export interface CardOpts {
  selected?: boolean;
  compact?: boolean;
  /** Extra line under the header, e.g. "In loadout 1". */
  note?: string;
}

export function itemCard(it: Item, o: CardOpts = {}): string {
  const r = rarityCls(it.rarity.tag);
  const leg = it.legendary && LEGENDARIES_BY_ID.get(it.legendary.effect);
  return `
  <div class="item-card r-${r}${o.selected ? ' selected' : ''}${o.compact ? ' compact' : ''}">
    <div class="item-head">
      <span class="item-name">${itemName(it)}</span>
      ${it.locked ? `<span class="lock" title="Locked">${icon('lock')}</span>` : ''}
      <span class="badge r-${r}">T${it.tier}</span>
    </div>
    <div class="item-sub"><span>${it.rarity.tag}</span><span>${base(it.baseId).family}</span></div>
    ${o.note ? `<div class="item-sub"><span class="muted">${o.note}</span></div>` : ''}
    <div class="item-implicits">${[...(it.weapon ? weaponLines(it.weapon) : []), ...it.implicits.map(i => statText(i.stat, i.value))]
      .map(t => `<span>${t}</span>`)
      .join('')}</div>
    ${leg ? `<div class="item-legendary"><strong>${icon('sparkles')}${leg.name}</strong><span>${leg.text}</span><span class="muted">${statText(it.legendary!.stat, it.legendary!.value)}</span></div>` : ''}
    ${it.affixes.length ? `<div class="item-affixes">${it.affixes.map(a => `<div class="affix"><span>${statText(a.stat, a.value)}</span><span class="affix-tier">T${a.tier}</span></div>`).join('')}</div>` : ''}
  </div>`;
}
