import { memo, useState } from "react";
import type { Item } from "../../module_bindings/types";
import { combatStats } from "../../../spacetimedb/src/combat";
import { PROFILES, PROFILE_LABEL, asProfile, fitsSlot, placeItem, scoreGear, slotLocked } from "../../../spacetimedb/src/equip";
import { rarityRank } from "../../../spacetimedb/src/loot";
import { call, useSticky } from "../../store";
import { fmt } from "../format";
import { Icon } from "../Icon";
import { EmptyCard, ItemCard, ItemTile, itemName, rarityCls, rarityLabel } from "../items";
import {
  CardHead,
  CompareTable,
  EffectsCard,
  Modal,
  SLOT_LABEL,
  SlotItemName,
  StatBoard,
  SwapPreview,
  ViewHeader,
  loadoutNote,
  openCraft,
  totals,
  type Loadout,
} from "../shared";
import { gearFor, type Snapshot } from "../snapshot";
import { statSheet } from "../statSheet";
import { touchFirst } from "../TapTip";

interface Candidate {
  it: Item;
  /** The loadout's slots after the swap, or why it can't happen. */
  next: bigint[] | string;
  /** DPS change against the reference enemy of your level; undefined if it can't be equipped. */
  delta?: number;
}

/** Items that can replace `slot`, best DPS gain against the reference enemy first. */
function candidates(s: Snapshot, lo: Loadout, slot: number): Candidate[] {
  const dps = (slots: readonly bigint[]) =>
    scoreGear(s.level, gearFor(slots, s.items)).dps;
  const now = dps(lo.slots);
  return [...s.items.values()]
    .filter((it) => fitsSlot(it.baseId, slot) && it.id !== lo.slots[slot])
    .map((it) => {
      const next = placeItem(lo.slots, slot, it, (id) => s.items.get(id));
      return {
        it,
        next,
        delta: typeof next === "string" ? undefined : dps(next) - now,
      };
    })
    .sort(
      (a, b) =>
        (b.delta ?? -1e18) - (a.delta ?? -1e18) ||
        b.it.tier - a.it.tier ||
        rarityRank(b.it.rarity.tag) - rarityRank(a.it.rarity.tag),
    );
}

function DeltaBadge({ c }: { c: Candidate }) {
  if (typeof c.next === "string")
    return <span className="tile-badge muted">✖</span>;
  if (c.delta === undefined || Math.abs(c.delta) < 1e-6) return null;
  return c.delta > 0 ? (
    <span className="tile-badge c-ok">▲</span>
  ) : (
    <span className="tile-badge c-bad">▼</span>
  );
}

/** Popup for an equipment slot: the equipped item, or (after "Change equipment") the items that can replace it. */
function SlotPopup({
  s,
  lo,
  slot,
  onClose,
}: {
  s: Snapshot;
  lo: Loadout;
  slot: number;
  onClose: () => void;
}) {
  const [changing, setChanging] = useState(false);
  const [pickId, setPickId] = useState<bigint>();
  const r = s.conn.reducers;
  const cur = s.items.get(lo.slots[slot]);

  let body: React.ReactNode;
  if (!changing) {
    body = (
      <>
        {cur ? (
          <ItemCard it={cur} note={loadoutNote(s, cur)} />
        ) : (
          <EmptyCard text="Nothing equipped" />
        )}
        <div className="popup-actions vertical">
          <button className="btn primary" onClick={() => setChanging(true)}>
            Change equipment
          </button>
          {cur && (
            <>
              <button
                className="btn"
                onClick={() => call(r.unequip({ loadout: lo.index, slot }))}
              >
                Unequip
              </button>
              <button className="btn" onClick={() => openCraft(cur.id)}>
                <Icon name="hammer" />
                Craft
              </button>
            </>
          )}
        </div>
      </>
    );
  } else {
    const list = candidates(s, lo, slot);
    const pick = list.find((c) => c.it.id === pickId);
    body = (
      <>
        <div className="picker-tiles">
          {list.length ? (
            list.map((c) => (
              <ItemTile
                key={String(c.it.id)}
                it={c.it}
                selected={c === pick}
                badge={<DeltaBadge c={c} />}
                title={`${rarityLabel(c.it.rarity.tag)} ${itemName(c.it)}${typeof c.next === "string" ? ` · ${c.next}` : c.delta !== undefined ? ` · DPS ${c.delta >= 0 ? "+" : ""}${fmt(c.delta)}` : ""}`}
                onClick={() => setPickId(c.it.id)}
              />
            ))
          ) : (
            <p className="muted">No other items fit this slot.</p>
          )}
        </div>
        {pick ? (
          <SwapPreview s={s} lo={lo} slot={slot} it={pick.it} changedOnly />
        ) : (
          list.length > 0 && (
            <p className="muted">
              Pick an item to compare it with what's equipped.
            </p>
          )
        )}
        <div className="popup-actions">
          <button className="btn" onClick={() => setChanging(false)}>
            <Icon name="back" />
            Back
          </button>
          {pick && (
            <button
              className="btn primary"
              disabled={typeof pick.next === "string"}
              onClick={() => {
                call(r.equip({ loadout: lo.index, slot, itemId: pick.it.id }));
                setChanging(false);
                setPickId(undefined);
              }}
            >
              <Icon name="shield" />
              Equip
            </button>
          )}
        </div>
        <p className="muted hint">
          ▲ / ▼: DPS against an average Lv {s.level} enemy goes up / down with{" "}
          {lo.name}.
        </p>
      </>
    );
  }
  return (
    <Modal onClose={onClose} className={`item-popup${changing ? "" : " narrow"}`}>
      <CardHead
        title={`${SLOT_LABEL[slot]}${changing ? " · Change equipment" : ""}`}
      >
        <button className="btn" onClick={onClose}>
          <Icon name="x" />
          Close
        </button>
      </CardHead>
      {body}
    </Modal>
  );
}

/** Slot indexes in grid order, three per row: Hands left of Chest, which sits in the middle. */
export const SLOT_GRID = [0, 1, 2, 4, 3, 5, 6, 7, 8];

/** Faded glyph shown in an empty slot. */
const SLOT_ICON = [
  "i-sword",
  "i-shield",
  "i-head",
  "i-chest",
  "i-hands",
  "i-feet",
  "i-ring",
  "i-ring",
  "i-amulet",
];

export function SlotCell({
  gear,
  i,
  selected,
  onOpen,
  lock,
}: {
  gear: (Item | undefined)[];
  i: number;
  selected: boolean;
  onOpen: () => void;
  /** The slot's auto-equip lock, for your own loadouts. */
  lock?: { locked: boolean; onToggle: () => void };
}) {
  const it = gear[i];
  const blocked = !it && i === 1 && gear[0]?.weapon?.twoHanded;
  return (
    <div className="slot-cell">
      <div className="slot-label">{SLOT_LABEL[i]}</div>
      <div className="slot-tile">
        {it ? (
          <ItemTile it={it} selected={selected} onClick={onOpen} />
        ) : (
          <button
            className={`item-tile empty${selected ? " selected" : ""}`}
            title={`${SLOT_LABEL[i]}: empty`}
            onClick={onOpen}
          >
            <Icon name={SLOT_ICON[i]} className="tile-ico" />
          </button>
        )}
        {lock && (
          <button
            className={`slot-lock${lock.locked ? " on" : ""}`}
            title={lock.locked ? "Locked: auto-equip leaves this slot as it is. Click to unlock." : "Lock this slot so auto-equip leaves it as it is"}
            aria-label={lock.locked ? "Unlock slot for auto-equip" : "Lock slot for auto-equip"}
            aria-pressed={lock.locked}
            onClick={lock.onToggle}
          >
            <Icon name={lock.locked ? "lock" : "unlock"} />
          </button>
        )}
      </div>
      <div className="slot-name">
        {it ? (
          <span className={`c-${rarityCls(it.rarity.tag)}`}>
            {itemName(it)}
          </span>
        ) : (
          <span className="muted">{blocked ? "Two-handed" : "Empty"}</span>
        )}
      </div>
    </div>
  );
}

function AutoSummary({
  s,
  lo,
  before,
  onClose,
}: {
  s: Snapshot;
  lo: Loadout;
  before: bigint[];
  onClose: () => void;
}) {
  const changes = lo.slots
    .map((id, i) => [i, before[i] ?? 0n, id] as const)
    .filter(([, b, n]) => b !== n);
  return (
    <div className="card" id="auto-summary">
      <CardHead title={`Auto-equip · ${lo.profile.tag}`}>
        <button className="btn small ghost" onClick={onClose}>
          Dismiss
        </button>
      </CardHead>
      {changes.length ? (
        <>
          {changes.map(([i, b, n]) => (
            <div className="stat-row" key={i}>
              <span>{SLOT_LABEL[i]}</span>
              <strong>
                <SlotItemName s={s} id={b} /> → <SlotItemName s={s} id={n} />
              </strong>
            </div>
          ))}
          <div className="card-head" style={{ marginTop: 12 }}>
            <h2>Totals before → after</h2>
          </div>
          <CompareTable
            before={totals(s, before)}
            after={totals(s, lo.slots)}
            changedOnly
          />
        </>
      ) : (
        <p className="muted">
          Already the best gear you own for this profile: nothing changed.
        </p>
      )}
    </div>
  );
}

export const EquipmentView = memo(function EquipmentView({
  s,
}: {
  s: Snapshot;
}) {
  const [loadoutIdx, setLoadoutIdx] = useSticky<number | undefined>(
    "equipLoadout",
    undefined,
  );
  const [openSlot, setOpenSlot] = useState<number>();
  const [summary, setSummary] = useState<{
    loadout: number;
    before: bigint[];
  }>();
  const r = s.conn.reducers;
  const lo =
    s.loadouts.find((l) => l.index === (loadoutIdx ?? s.row.activeLoadout)) ??
    s.active;
  const gear = gearFor(lo.slots, s.items);
  const stats = combatStats(s.level, gear);
  const sheet = statSheet(s.level, gear, stats);
  const isActive = lo.index === s.row.activeLoadout;

  return (
    <>
      <ViewHeader title="Equipment" icon="shield" />
      <div className="toolbar card">
        <span className="toolbar-label">Loadout</span>
        <div className="seg">
          {s.loadouts.map((l) => (
            <button
              key={l.index}
              className={`seg-btn${l.index === lo.index ? " active" : ""}`}
              onClick={() => {
                setLoadoutIdx(l.index);
                setOpenSlot(undefined);
                setSummary(undefined);
              }}
            >
              {l.index + 1} {l.name}
              {l.index === s.row.activeLoadout ? " ✔" : ""}
            </button>
          ))}
        </div>
        {isActive ? (
          <span className="tag ok">In use</span>
        ) : (
          <button
            className="btn small"
            onClick={() => call(r.switchLoadout({ loadout: lo.index }))}
          >
            Use this loadout
          </button>
        )}
        <button
          className="btn small ghost"
          onClick={() => {
            const name = prompt("Loadout name", lo.name);
            if (name !== null)
              call(r.renameLoadout({ loadout: lo.index, name }));
          }}
        >
          Rename
        </button>
        <span className="spacer" />
        <span className="toolbar-label">Profile</span>
        <select
          value={asProfile(lo.profile.tag)}
          onChange={(e) =>
            call(
              r.setProfile({
                loadout: lo.index,
                profile: { tag: e.target.value as (typeof PROFILES)[number] },
              }),
            )
          }
        >
          {PROFILES.map((p) => (
            <option key={p} value={p}>
              {PROFILE_LABEL[p]}
            </option>
          ))}
        </select>
        <button
          className="btn primary small"
          onClick={() => {
            const before = [...lo.slots];
            setOpenSlot(undefined);
            call(
              r
                .autoEquip({ loadout: lo.index })
                .then(() => setSummary({ loadout: lo.index, before })),
            );
          }}
        >
          <Icon name="zap" />
          Auto-equip
        </button>
      </div>
      <div className="equip-layout">
        <div className="card equip-slots">
          {SLOT_GRID.map((i) => (
            <SlotCell
              key={i}
              gear={gear}
              i={i}
              selected={openSlot === i}
              onOpen={() => setOpenSlot(i)}
              lock={{
                locked: slotLocked(lo.lockedSlots, i),
                onToggle: () => call(r.lockSlot({ loadout: lo.index, slot: i, locked: !slotLocked(lo.lockedSlots, i) })),
              }}
            />
          ))}
        </div>
        <StatBoard sheet={sheet} className="stat-board" />
      </div>
      {summary && summary.loadout === lo.index && (
        <AutoSummary
          s={s}
          lo={lo}
          before={summary.before}
          onClose={() => setSummary(undefined)}
        />
      )}
      <EffectsCard effects={stats.effects} />
      <p className="muted hint">
        {touchFirst ? "Tap" : "Click"} a slot to see its item or change it. {touchFirst ? "Tap" : "Hover"} a stat name to see what
        it does, or the rest of its row to see where it comes from. Evasion and
        DPS are against an average enemy of your level (Lv {s.level}), the same
        one auto-equip scores against.
      </p>
      {openSlot !== undefined && (
        <SlotPopup
          key={`${lo.index}:${openSlot}`}
          s={s}
          lo={lo}
          slot={openSlot}
          onClose={() => setOpenSlot(undefined)}
        />
      )}
    </>
  );
});
