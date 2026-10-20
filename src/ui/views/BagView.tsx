import { memo, useState } from 'react';
import type { Item } from '../../module_bindings/types';
import { bagExpansionCost } from '../../../spacetimedb/src/craft';
import { SLOTS, base } from '../../../spacetimedb/src/data/bases';
import { MATERIALS, MATERIALS_BY_ID } from '../../../spacetimedb/src/data/materials';
import { fitsSlot, placeItem } from '../../../spacetimedb/src/equip';
import { BAG_MAX } from '../../../spacetimedb/src/game';
import { LISTED_RARITIES, rarityRank, salvageValue, salvageVoidglass } from '../../../spacetimedb/src/loot';
import { CHRONOSHARDS, ELIXIR_KILLS, SUPPLIES, phialText, type ChronoshardDef } from '../../../spacetimedb/src/data/supplies';
import { heldPhials } from '../PhialPicker';
import { SettleReport } from '../AwayReport';
import { SCRAP_YIELD, isScrapRarity, scrapMaterialId } from '../../../spacetimedb/src/data/recipes';

/** Common to Legendary items of a tier with materials can be scrapped. */
const scrappable = (it: Item) => isScrapRarity(it.rarity.tag) && scrapMaterialId(it.baseId, it.tier) !== undefined;

/** The materials scrapping `items` gives, e.g. "+6 Wolfhide, +2 Elven Ingot". */
function scrapYield(items: readonly Item[]): string {
  const counts = new Map<number, number>();
  for (const it of items) {
    if (!scrappable(it)) continue;
    const id = scrapMaterialId(it.baseId, it.tier)!;
    counts.set(id, (counts.get(id) ?? 0) + SCRAP_YIELD[it.rarity.tag as keyof typeof SCRAP_YIELD]);
  }
  return [...counts].map(([id, n]) => `+${n.toLocaleString()} ${MATERIALS_BY_ID.get(id)!.name}`).join(', ');
}
import { call, useSticky } from '../../store';
import { fmtBig } from '../format';
import { Icon } from '../Icon';
import { ItemTile, itemName, materialIconName, rarityCls } from '../items';
import { ItemFilterCard, useItemFilter, type ItemFilter } from '../itemFilter';
import { CardHead, Modal, SLOT_LABEL, SwapPreview, ViewHeader, openCraft } from '../shared';
import { elixirText } from '../lifeSkills';
import type { Snapshot } from '../snapshot';
import { SkillTabs } from './SkillView';

type BagSort = 'newest' | 'rarity' | 'tier' | 'slot';

/** The bag, filtered and sorted. */
function sortedBag(s: Snapshot, sort: BagSort, f: ItemFilter): Item[] {
  const items = s.bag.filter(f.matches);
  const by: Record<BagSort, (a: Item, b: Item) => number> = {
    newest: (a, b) => (a.id < b.id ? 1 : -1),
    rarity: (a, b) => rarityRank(b.rarity.tag) - rarityRank(a.rarity.tag) || b.tier - a.tier,
    tier: (a, b) => b.tier - a.tier || rarityRank(b.rarity.tag) - rarityRank(a.rarity.tag),
    slot: (a, b) => SLOTS.indexOf(base(a.baseId).slots[0]) - SLOTS.indexOf(base(b.baseId).slots[0]) || b.tier - a.tier,
  };
  return items.sort(by[sort]);
}

/** Materials held, highest tier first, untiered ones last. */
const heldMaterials = (s: Snapshot) =>
  MATERIALS.filter(m => (s.materials.get(m.id) ?? 0n) > 0n).sort((a, b) => (b.tier || -1) - (a.tier || -1));

function MaterialsTab({ s }: { s: Snapshot }) {
  const held = heldMaterials(s);
  return (
    <div className="card">
      {held.length ? (
        <div className="chips">
          {held.map(m => (
            <span key={m.id} className="chip" title={m.tier ? `T${m.tier} ${m.kind}` : 'Untiered'}>
              <Icon name={materialIconName(m.id)} className="c-material" />{m.name}<strong>{fmtBig(s.materials.get(m.id)!)}</strong>
            </span>
          ))}
        </div>
      ) : (
        <p className="muted">None yet. Enemies drop materials of their zone's tier: metal, hides, cloth, wood, reagents, gems and (magical ones) cores.</p>
      )}
    </div>
  );
}

/** Elixirs in stock, best grade first. */
const heldSupplies = (s: Snapshot) => SUPPLIES.filter(sup => (s.supplies.get(sup.id) ?? 0) > 0).sort((a, b) => b.grade - a.grade);

function ConsumablesTab({ s }: { s: Snapshot }) {
  const e = s.elixir;
  const stock = heldSupplies(s);
  return (
    <div className="card">
      <CardHead title="Elixirs">
        <a className="btn small ghost" href="#alchemy">Alchemy</a>
      </CardHead>
      {e && (
        <div className="stat-row">
          <span><Icon name="flask" className={e.infused ? 'c-magic' : 'c-material'} /> Active: {e.infused ? 'Infused ' : ''}{e.supply.name}</span>
          <strong>{e.killsLeft} / {ELIXIR_KILLS} kills</strong>
        </div>
      )}
      {stock.length ? (
        <ul className="foes">
          {stock.map(sup => (
            <li key={sup.id} className={`foe${e?.supply.id === sup.id ? ' active' : ''}`}>
              <div className="foe-row">
                <Icon name="flask" className="c-material" />
                <div className="foe-info">
                  <div className="foe-name">{sup.name} <span className="muted">×{s.supplies.get(sup.id)}</span></div>
                  <div className="foe-meta muted">{elixirText(sup)}</div>
                </div>
                <button className="btn small" title={e ? 'Discards what is left of the active elixir' : undefined}
                  onClick={() => call(s.conn.reducers.drinkElixir({ supplyId: sup.id }))}>
                  Drink
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No elixirs. Brew them with Alchemy; each lasts {ELIXIR_KILLS} kills.</p>
      )}
      <PhialList s={s} />
      <ChronoshardList s={s} />
    </div>
  );
}

/** Chronoshards in stock, best grade first. */
const heldChronoshards = (s: Snapshot) => CHRONOSHARDS.filter(c => (s.supplies.get(c.id) ?? 0) > 0).sort((a, b) => b.grade - a.grade);

/** "30 minutes", "1 hour", "2 hours". */
const minutesText = (m: number) => (m < 60 ? `${m} minutes` : `${m / 60} hour${m === 60 ? '' : 's'}`);

/** Chronoshards in stock: rare, so using one asks first, then shows what its time earned. */
function ChronoshardList({ s }: { s: Snapshot }) {
  const held = heldChronoshards(s);
  const [confirming, setConfirming] = useState<ChronoshardDef>();
  /** The shard used and the newest log row before it: its report is the offline rows after. */
  const [used, setUsed] = useState<{ shard: ChronoshardDef; afterLogId: bigint }>();
  const reportLogs = used ? s.logs.filter(l => l.offline && l.id > used.afterLogId) : [];
  // A production queue that ran out logs its part, then combat the rest, in one transaction.
  const report = reportLogs.filter(l => l.at.microsSinceUnixEpoch === reportLogs[0]?.at.microsSinceUnixEpoch);
  const activity = s.row.activitySkill !== 0 ? 'your life skill' : s.row.targetEnemyId !== 0 ? 'your current fight' : undefined;
  if (!held.length && !used) return null;
  return (
    <>
      <CardHead title="Chronoshards" />
      <ul className="foes">
        {held.map(c => (
          <li key={c.id} className="foe">
            <div className="foe-row">
              <Icon name="hourglass" className="c-magic" />
              <div className="foe-info">
                <div className="foe-name">{c.name} <span className="muted">×{s.supplies.get(c.id)}</span></div>
                <div className="foe-meta muted">Fast-forward {minutesText(c.minutes)}</div>
              </div>
              <button className="btn small" onClick={() => setConfirming(c)}>Use</button>
            </div>
          </li>
        ))}
      </ul>
      <p className="muted">Plays its time of what you're doing at once, like time away. Doesn't count against the offline cap.</p>
      {confirming && (
        <Modal onClose={() => setConfirming(undefined)}>
          <CardHead title={`Use ${confirming.name}?`} />
          <p>
            {activity
              ? <>Fast-forwards {minutesText(confirming.minutes)} of {activity}, as if you'd been away.</>
              : <span className="c-bad">You have no target or life skill: the {minutesText(confirming.minutes)} would pass idle.</span>}
          </p>
          <p className="muted">It can't be undone. {s.supplies.get(confirming.id) ?? 0} in stock.</p>
          <div className="row">
            <button className="btn ghost" onClick={() => setConfirming(undefined)}>Cancel</button>
            <button
              className="btn primary"
              onClick={() => {
                const shard = confirming;
                const afterLogId = s.logs[0]?.id ?? 0n;
                setConfirming(undefined);
                call(s.conn.reducers.activateChronoshard({ supplyId: shard.id }).then(() => setUsed({ shard, afterLogId })));
              }}
            >
              <Icon name="hourglass" />Use
            </button>
          </div>
        </Modal>
      )}
      {used && report.length > 0 && (
        <SettleReport s={s} logs={report} title={`${used.shard.name}: ${minutesText(used.shard.minutes)} later`} onClose={() => setUsed(undefined)} />
      )}
    </>
  );
}

/** Phials in stock: picked per fight in the Moonwell Deep and raids, so nothing to drink here. */
function PhialList({ s }: { s: Snapshot }) {
  const held = heldPhials(s);
  return (
    <>
      <CardHead title="Phials" />
      {held.length ? (
        <ul className="foes">
          {held.map(p => (
            <li key={p.id} className="foe">
              <div className="foe-row">
                <Icon name="flask" className="c-magic" />
                <div className="foe-info">
                  <div className="foe-name">{p.name} <span className="muted">×{s.supplies.get(p.id)}</span></div>
                  <div className="foe-meta muted">{phialText(p)}</div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="muted">One fight each, in the Moonwell Deep or a raid: pick one before the fight. Used up win or lose.</p>
    </>
  );
}

/** Slots of the active loadout the item can go in. */
const fittingSlots = (it: Item) => SLOTS.map((_, i) => i).filter(i => fitsSlot(it.baseId, i));

/** Popup for one bag item: its stats, the equipped item it would replace, totals before → after, and actions. */
function BagPopup({ s, it, onClose }: { s: Snapshot; it: Item; onClose: () => void }) {
  const lo = s.active;
  const r = s.conn.reducers;
  const slots = fittingSlots(it);
  const [chosen, setChosen] = useState<number>();
  const slot = chosen !== undefined && slots.includes(chosen) ? chosen : (slots.find(i => lo.slots[i] === 0n) ?? slots[0]);
  const blocked = typeof placeItem(lo.slots, slot, it, id => s.items.get(id)) === 'string';
  return (
    <Modal onClose={onClose} className="item-popup">
      <CardHead title={<span className={`c-${rarityCls(it.rarity.tag)}`}>{itemName(it)}</span>}>
        <button className="btn" onClick={onClose}><Icon name="x" />Close</button>
      </CardHead>
      {slots.length > 1 && (
        <div className="seg">
          {slots.map(i => (
            <button key={i} className={`seg-btn${i === slot ? ' active' : ''}`} onClick={() => setChosen(i)}>
              {SLOT_LABEL[i]}
            </button>
          ))}
        </div>
      )}
      <SwapPreview s={s} lo={lo} slot={slot} it={it} changedOnly />
      <div className="popup-actions">
        <button className="btn primary" disabled={blocked} onClick={() => call(r.equip({ loadout: lo.index, slot, itemId: it.id }))}>
          <Icon name="shield" />Equip
        </button>
        <button className="btn" onClick={() => call(r.lockItem({ itemId: it.id, locked: !it.locked }))}>
          <Icon name="lock" />{it.locked ? 'Unlock' : 'Lock'}
        </button>
        <button className="btn" onClick={() => openCraft(it.id)}><Icon name="hammer" />Craft</button>
        <button
          className="btn"
          disabled={it.locked || !scrappable(it)}
          title={it.locked ? "Locked items can't be recycled" : 'Into materials (no Dust or gold)'}
          onClick={() => call(r.scrapItems({ itemIds: [it.id] }), `Recycled: ${scrapYield([it])}`)}
        >
          Recycle
        </button>
        <button
          className="btn danger"
          disabled={it.locked}
          title={it.locked ? "Locked items can't be salvaged" : undefined}
          onClick={() => call(r.salvage({ itemIds: [it.id] }))}
        >
          Salvage → +{fmtBig(salvageValue(it.rarity.tag, it.tier).dust)} Dust, +{fmtBig(salvageValue(it.rarity.tag, it.tier).gold)} gold
          {salvageVoidglass(it.rarity.tag) > 0 && `, +${salvageVoidglass(it.rarity.tag)} Voidglass`}
        </button>
      </div>
    </Modal>
  );
}

function GearTab({ s }: { s: Snapshot }) {
  const [sort, setSort] = useSticky<BagSort>('bagSort', 'newest');
  const filter = useItemFilter('bag');
  const [selectMode, setSelectMode] = useSticky('bagSelectMode', false);
  const [sel, setSel] = useState<ReadonlySet<bigint>>(new Set());
  /** Last clicked item: the start of a shift-click range. */
  const [anchor, setAnchor] = useState<bigint>();
  const [openId, setOpenId] = useState<bigint>();
  const r = s.conn.reducers;

  const shown = sortedBag(s, sort, filter);
  // Selections and the popup drop items that left the bag.
  const selected = s.bag.filter(i => sel.has(i.id));
  const open = s.bag.find(i => i.id === openId);
  // Scrap and salvage skip locked items; they're off only when every selected item is locked.
  const unlocked = selected.filter(i => !i.locked);
  const skipped = selected.length - unlocked.length;
  const skipNote = skipped ? ` (skips ${skipped} locked)` : '';
  const allScrappable = unlocked.every(scrappable);
  const dust = unlocked.reduce((sum, i) => sum + salvageValue(i.rarity.tag, i.tier).dust, 0n);
  const salvageGold = unlocked.reduce((sum, i) => sum + salvageValue(i.rarity.tag, i.tier).gold, 0n);
  const salvageGlass = unlocked.reduce((sum, i) => sum + salvageVoidglass(i.rarity.tag), 0);
  const cost = bagExpansionCost(s.row.bagSize);

  function clickTile(ev: React.MouseEvent, id: bigint) {
    const order = shown.map(i => i.id);
    const [from, to] = [order.indexOf(anchor ?? -1n), order.indexOf(id)];
    if (ev.shiftKey && from >= 0 && to >= 0) {
      setSel(new Set([...sel, ...order.slice(Math.min(from, to), Math.max(from, to) + 1)]));
    } else if (ev.ctrlKey || ev.metaKey || selectMode) {
      const next = new Set(sel);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setSel(next);
      setAnchor(id);
    } else {
      setOpenId(id);
      setAnchor(id);
    }
  }

  return (
    <>
      <div className="toolbar card">
        <span className="toolbar-label">Bag <strong>{s.bag.length}</strong> / {s.row.bagSize}</span>
        {cost === undefined ? (
          <span className="muted">Maximum size ({BAG_MAX})</span>
        ) : (
          <button
            className="btn small ghost"
            disabled={s.gold < cost}
            title={s.gold < cost ? `Need ${fmtBig(cost - s.gold)} more gold` : undefined}
            onClick={() => call(r.expandBag({}), 'Bag expanded by 25 slots')}
          >
            +25 slots · {fmtBig(cost)} gold
          </button>
        )}
        <span className="spacer" />
        <select value={sort} onChange={e => setSort(e.target.value as BagSort)}>
          <option value="newest">Sort: Newest</option>
          <option value="rarity">Sort: Rarity</option>
          <option value="tier">Sort: Tier</option>
          <option value="slot">Sort: Slot</option>
        </select>
      </div>
      <ItemFilterCard f={filter} storageKey="bag_filters_collapsed" rarities={LISTED_RARITIES} shown={shown.length} total={s.bag.length} />
      <div className="bag-grid">
        {shown.length ? (
          shown.map(it => <ItemTile key={String(it.id)} it={it} selected={sel.has(it.id)} onClick={ev => clickTile(ev, it.id)} />)
        ) : (
          <p className="muted">{s.bag.length ? 'No items match the filters.' : 'The bag is empty. Equipped items are on the Equipment screen.'}</p>
        )}
      </div>
      <div className={`action-bar card${selected.length ? '' : ' empty'}`}>
        <button
          className={`btn small${selectMode ? ' primary' : ''}`}
          onClick={() => {
            setSelectMode(!selectMode);
            if (selectMode) setSel(new Set());
          }}
        >
          Select
        </button>
        <span>
          {selected.length ? (
            <><strong>{selected.length}</strong> selected</>
          ) : selectMode ? (
            'Click items to select them'
          ) : (
            <span className="action-hint">Click to inspect · Ctrl-click to select · Shift-click for a range</span>
          )}
        </span>
        {selected.length > 0 && <button className="btn small ghost" onClick={() => setSel(new Set())}>Clear</button>}
        <button className="btn small" onClick={() => setSel(new Set([...sel, ...shown.map(i => i.id)]))}>Select all shown</button>
        <span className="spacer" />
        <button
          className="btn small"
          disabled={!selected.length}
          onClick={() => {
            const locked = !selected.every(i => i.locked);
            for (const it of selected) call(r.lockItem({ itemId: it.id, locked }));
          }}
        >
          <Icon name="lock" />{selected.length && selected.every(i => i.locked) ? 'Unlock' : 'Lock'}
        </button>
        <button
          className="btn small"
          disabled={!unlocked.length || !allScrappable}
          title={selected.length && !unlocked.length ? "Locked items can't be recycled" : !allScrappable ? 'Only Common to Legendary items, of tiers with materials, can be recycled' : `Into materials (no Dust or gold)${skipNote}`}
          onClick={() => call(r.scrapItems({ itemIds: unlocked.map(i => i.id) }).then(() => setSel(new Set())), `Recycled: ${scrapYield(unlocked)}`)}
        >
          Recycle
        </button>
        <button
          className="btn small danger"
          disabled={!unlocked.length}
          title={selected.length && !unlocked.length ? "Locked items can't be salvaged" : skipped ? `Skips ${skipped} locked` : undefined}
          onClick={() => call(r.salvage({ itemIds: unlocked.map(i => i.id) }).then(() => setSel(new Set())))}
        >
          Salvage → +{fmtBig(dust)} Dust, +{fmtBig(salvageGold)} gold{salvageGlass > 0 && `, +${salvageGlass} Voidglass`}
        </button>
      </div>
      {open && <BagPopup key={String(open.id)} s={s} it={open} onClose={() => setOpenId(undefined)} />}
    </>
  );
}

export const BagView = memo(function BagView({ s }: { s: Snapshot }) {
  const usable = [...heldSupplies(s), ...heldChronoshards(s)].reduce((n, sup) => n + (s.supplies.get(sup.id) ?? 0), 0);
  return (
    <>
      <ViewHeader title="Bag" icon="bag" />
      <SkillTabs
        id="bag"
        tabs={[
          { key: 'gear', label: `Gear ${s.bag.length}/${s.row.bagSize}`, body: <GearTab s={s} /> },
          { key: 'consumables', label: `Consumables${usable ? ` ${usable}` : ''}`, body: <ConsumablesTab s={s} /> },
          { key: 'materials', label: 'Materials', body: <MaterialsTab s={s} /> },
        ]}
      />
    </>
  );
});
