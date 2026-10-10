import { memo, useState } from 'react';
import type { Item } from '../../module_bindings/types';
import { rerollCost, upgradeCost } from '../../../spacetimedb/src/craft';
import { RARITIES, rarityRank, type RarityName } from '../../../spacetimedb/src/loot';
import { call, useSticky } from '../../store';
import { fmtBig } from '../format';
import { Icon } from '../Icon';
import { ItemCard, itemName, rarityCls, statText } from '../items';
import { CardHead, ViewHeader, cantAfford, costText, loadoutNote } from '../shared';
import type { Snapshot } from '../snapshot';

type Tab = 'reroll' | 'upgrade';

function AffixPick({ it, value, onChange }: { it: Item; value: number; onChange: (i: number) => void }) {
  return (
    <div className="affix-pick">
      {it.affixes.map((a, i) => (
        <label className="radio" key={i}>
          <input type="radio" name="craft-affix" checked={i === value} onChange={() => onChange(i)} />
          <span>{statText(a.stat, a.value)}</span>
          <span className="affix-tier">T{a.tier}</span>
        </label>
      ))}
    </div>
  );
}

export const CraftingView = memo(function CraftingView({ s }: { s: Snapshot }) {
  const [itemId, setItemId] = useSticky<bigint | undefined>('craftItem', undefined);
  const [tab, setTab] = useSticky<Tab>('craftTab', 'reroll');
  const [affix, setAffix] = useState(0);
  const r = s.conn.reducers;

  const items = [...s.items.values()].sort((a, b) => rarityRank(b.rarity.tag) - rarityRank(a.rarity.tag) || b.tier - a.tier || (a.id < b.id ? 1 : -1));
  const item = s.items.get(itemId ?? 0n) ?? items[0];
  const head = (
    <ViewHeader title="Crafting" icon="hammer">
      <div className="head-tags">
        <span className="chip"><Icon name="coins" />{fmtBig(s.gold)}</span>
        <span className="chip"><Icon name="gem" />{fmtBig(s.row.essence)}</span>
      </div>
    </ViewHeader>
  );
  if (!item) {
    return (
      <>
        {head}
        <div className="card"><p className="muted">No items yet.</p></div>
      </>
    );
  }

  const reroll = tab === 'reroll';
  const rarity = item.rarity.tag as RarityName;
  const cost = reroll ? rerollCost(item) : upgradeCost(item);
  const next = RARITIES[rarityRank(rarity) + 1];
  const toLegendary = !reroll && rarity === 'Epic';
  const pick = <AffixPick it={item} value={affix} onChange={setAffix} />;

  let body: React.ReactNode;
  if (rarity === 'Unique') body = <p className="muted">Uniques can't be crafted.</p>;
  else if (reroll) {
    body = item.affixes.length ? (
      <>
        <p className="muted">The chosen affix is replaced by a new random one, rolled like a drop.{item.legendary ? ' The legendary affix stays.' : ''}</p>
        {pick}
      </>
    ) : (
      <p className="muted">This item has no affixes to reroll. Upgrade its rarity first.</p>
    );
  } else {
    body = cost ? (
      <>
        <p>
          {rarity} → <strong className={`c-${rarityCls(next)}`}>{next}</strong>:{' '}
          {toLegendary ? 'remove the affix you pick, add a random legendary affix.' : 'adds one random affix.'}
        </p>
        {toLegendary && pick}
      </>
    ) : (
      <p className="muted">Legendary is the highest craftable rarity.</p>
    );
  }
  const blocked = !cost || (reroll && !item.affixes.length) ? 'Nothing to craft' : cantAfford(s, cost);

  return (
    <>
      {head}
      <div className="craft">
        <div className="card craft-list">
          <CardHead title="Items"><span className="muted">{items.length}</span></CardHead>
          {items.map(it => (
            <button
              key={String(it.id)}
              className={`list-item r-${rarityCls(it.rarity.tag)}${it.id === item.id ? ' active' : ''}`}
              onClick={() => {
                setItemId(it.id);
                setAffix(0);
              }}
            >
              <span className="item-name">{itemName(it)}</span>
              <span className="muted">T{it.tier} {it.rarity.tag}{s.inLoadouts.has(it.id) ? ' · equipped' : ''}</span>
            </button>
          ))}
        </div>
        <div className="craft-main">
          <ItemCard it={item} note={loadoutNote(s, item)} />
          <div className="card">
            <div className="seg">
              {(['reroll', 'upgrade'] as Tab[]).map(t => (
                <button
                  key={t}
                  className={`seg-btn${t === tab ? ' active' : ''}`}
                  onClick={() => {
                    setTab(t);
                    setAffix(0);
                  }}
                >
                  {t === 'reroll' ? 'Reroll affix' : 'Upgrade rarity'}
                </button>
              ))}
            </div>
            {body}
            {cost && <div className="cost">Cost: <strong>{costText(cost)}</strong></div>}
            <button
              className="btn primary"
              disabled={Boolean(blocked)}
              title={blocked}
              onClick={() =>
                reroll
                  ? call(r.rerollAffix({ itemId: item.id, affixIndex: affix }))
                  : call(r.upgradeRarity({ itemId: item.id, removeAffix: rarity === 'Epic' ? affix : undefined }))
              }
            >
              {reroll ? 'Reroll' : 'Upgrade'}
            </button>
            {blocked && cost && blocked !== 'Nothing to craft' && <span className="muted"> {blocked}</span>}
          </div>
        </div>
      </div>
    </>
  );
});
