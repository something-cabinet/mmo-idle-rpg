import { memo, useState } from 'react';
import type { Item } from '../../module_bindings/types';
import { rerollCost, upgradeCost } from '../../../spacetimedb/src/craft';
import { SLOTS, base } from '../../../spacetimedb/src/data/bases';
import { RARITIES, rarityRank, type RarityName } from '../../../spacetimedb/src/loot';
import { call, useSticky } from '../../store';
import { fmtBig } from '../format';
import { Icon } from '../Icon';
import { ItemCard, itemIconName, itemName, rarityCls, statText } from '../items';
import { ItemFilterCard, useItemFilter } from '../itemFilter';
import { CardHead, ViewHeader, cantAfford, costText, loadoutNote } from '../shared';
import type { Snapshot } from '../snapshot';

type Where = 'all' | 'equipped' | 'bag';
type CraftSort = 'rarity' | 'tier' | 'newest' | 'slot';

/** Rarities that can be crafted: uniques can't. */
const CRAFT_RARITIES = RARITIES.filter(r => r !== 'Unique');

function AffixPick({ it, name, value, onChange }: { it: Item; name: string; value: number; onChange: (i: number) => void }) {
  return (
    <div className="affix-pick">
      {it.affixes.map((a, i) => (
        <label className="radio" key={i}>
          <input type="radio" name={name} checked={i === value} onChange={() => onChange(i)} />
          <span>{statText(a.stat, a.value)}</span>
          <span className="affix-tier">T{a.tier}</span>
        </label>
      ))}
    </div>
  );
}

export const CraftingView = memo(function CraftingView({ s }: { s: Snapshot }) {
  const [itemId, setItemId] = useSticky<bigint | undefined>('craftItem', undefined);
  const filter = useItemFilter('craft');
  const [where, setWhere] = useSticky<Where>('craftWhere', 'all');
  const [sort, setSort] = useSticky<CraftSort>('craftSort', 'rarity');
  const [rerollIndex, setRerollIndex] = useState(0);
  const [removeIndex, setRemoveIndex] = useState(0);
  const r = s.conn.reducers;

  const craftable = [...s.items.values()].filter(it => it.rarity.tag !== 'Unique');
  const by: Record<CraftSort, (a: Item, b: Item) => number> = {
    rarity: (a, b) => rarityRank(b.rarity.tag) - rarityRank(a.rarity.tag) || b.tier - a.tier,
    tier: (a, b) => b.tier - a.tier || rarityRank(b.rarity.tag) - rarityRank(a.rarity.tag),
    newest: () => 0,
    slot: (a, b) => SLOTS.indexOf(base(a.baseId).slots[0]) - SLOTS.indexOf(base(b.baseId).slots[0]) || b.tier - a.tier,
  };
  const items = craftable
    .filter(it => filter.matches(it) && (where === 'all' || (where === 'equipped') === s.inLoadouts.has(it.id)))
    .sort((a, b) => by[sort](a, b) || (a.id < b.id ? 1 : -1));
  // The chosen item stays open even when the filters hide it from the list.
  const item = s.items.get(itemId ?? 0n) ?? items[0];
  const filters = (
    <ItemFilterCard
      f={filter}
      storageKey="craft_filters_collapsed"
      rarities={CRAFT_RARITIES}
      shown={items.length}
      total={craftable.length}
      extraActive={where === 'all' ? 0 : 1}
      onClear={() => setWhere('all')}
      extra={
        <>
          <span className="toolbar-label">Where</span>
          <div className="seg wrap">
            {(['all', 'equipped', 'bag'] as Where[]).map(w => (
              <button key={w} className={`seg-btn${w === where ? ' active' : ''}`} onClick={() => setWhere(w)}>
                {w === 'all' ? 'Anywhere' : w === 'equipped' ? 'Equipped' : 'Bag'}
              </button>
            ))}
          </div>
        </>
      }
      foot={
        <select value={sort} onChange={e => setSort(e.target.value as CraftSort)}>
          <option value="rarity">Sort: Rarity</option>
          <option value="tier">Sort: Tier</option>
          <option value="newest">Sort: Newest</option>
          <option value="slot">Sort: Slot</option>
        </select>
      }
    />
  );
  const head = (
    <ViewHeader title="Crafting" icon="hammer">
      <div className="head-tags">
        <span className="chip"><Icon name="coins" />{fmtBig(s.gold)}</span>
        <span className="chip"><Icon name="gem" />{fmtBig(s.row.dust)}</span>
      </div>
    </ViewHeader>
  );
  if (!item) {
    return (
      <>
        {head}
        {craftable.length > 0 && filters}
        <div className="card"><p className="muted">{craftable.length ? 'No items match the filters.' : 'No craftable items yet.'}</p></div>
      </>
    );
  }

  const rarity = item.rarity.tag as RarityName;
  const unique = rarity === 'Unique';
  const next = RARITIES[rarityRank(rarity) + 1];
  const toLegendary = rarity === 'Epic';

  // Reroll: replace one regular affix.
  const rCost = item.affixes.length ? rerollCost(item) : undefined;
  const rBlocked = rCost ? cantAfford(s, rCost) : 'Nothing to reroll';
  const rerollBody = unique ? (
    <p className="muted">Uniques can't be crafted.</p>
  ) : item.affixes.length ? (
    <>
      <p className="muted">The chosen affix is replaced by a new random one, rolled like a drop.{item.legendary ? ' The legendary affix stays.' : ''}</p>
      <AffixPick it={item} name="craft-reroll" value={rerollIndex} onChange={setRerollIndex} />
    </>
  ) : (
    <p className="muted">This item has no affixes to reroll. Upgrade its rarity first.</p>
  );

  // Upgrade: one rarity higher.
  const uCost = upgradeCost(item);
  const uBlocked = uCost ? cantAfford(s, uCost) : 'Nothing to upgrade';
  const upgradeBody = unique ? (
    <p className="muted">Uniques can't be crafted.</p>
  ) : uCost ? (
    <>
      <p>
        {rarity} → <strong className={`c-${rarityCls(next)}`}>{next}</strong>:{' '}
        {toLegendary ? 'remove the affix you pick, add a random legendary affix.' : 'adds one random affix.'}
      </p>
      {toLegendary && <AffixPick it={item} name="craft-remove" value={removeIndex} onChange={setRemoveIndex} />}
    </>
  ) : (
    <p className="muted">Legendary is the highest craftable rarity.</p>
  );

  const action = (title: string, body: React.ReactNode, cost: typeof rCost, blocked: string | undefined | false, label: string, run: () => void) => (
    <div className="card">
      <CardHead title={title} />
      {body}
      {!unique && cost && (
        <div className="craft-do">
          <span className="cost">Cost: <strong>{costText(cost)}</strong></span>
          <button className="btn primary" disabled={Boolean(blocked)} title={blocked || undefined} onClick={run}>{label}</button>
          {blocked && <span className="muted">{blocked}</span>}
        </div>
      )}
    </div>
  );

  return (
    <>
      {head}
      {filters}
      <div className="craft">
        <div className="card craft-list">
          <CardHead title="Items"><span className="muted">{items.length}</span></CardHead>
          {!items.length && <p className="muted">No items match the filters.</p>}
          {items.map(it => (
            <button
              key={String(it.id)}
              className={`list-item r-${rarityCls(it.rarity.tag)}${it.id === item.id ? ' active' : ''}`}
              onClick={() => {
                setItemId(it.id);
                setRerollIndex(0);
                setRemoveIndex(0);
              }}
            >
              <span className="list-item-name"><Icon name={itemIconName(it)} /><span className="item-name">{itemName(it)}</span></span>
              <span className="muted">T{it.tier} {it.rarity.tag}{s.inLoadouts.has(it.id) ? ' · equipped' : ''}</span>
            </button>
          ))}
        </div>
        <div className="craft-item">
          <ItemCard it={item} note={loadoutNote(s, item)} />
        </div>
        <div className="craft-actions">
          {action('Reroll affix', rerollBody, rCost, rBlocked, 'Reroll', () => call(r.rerollAffix({ itemId: item.id, affixIndex: rerollIndex })))}
          {action('Upgrade rarity', upgradeBody, uCost, uBlocked, 'Upgrade', () =>
            call(r.upgradeRarity({ itemId: item.id, removeAffix: toLegendary ? removeIndex : undefined })))}
        </div>
      </div>
    </>
  );
});
