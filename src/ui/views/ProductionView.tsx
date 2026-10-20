// A production skill's page (life-skills.md, "Production"): its level, the queue in
// progress and what it can make. A queue takes the place of fighting and goes back to
// the combat target when it runs out.

import { memo, useState, type ReactNode } from 'react';
import { call, useSticky, useTick } from '../../store';
import { ZONE_BASES, base, type BaseKind } from '../../../spacetimedb/src/data/bases';
import { GATHERING_SKILLS, SkillId, TOOL_SPEED_PER_TIER, productionActionMicros, productionBlocker, productionXpPerAction, tierRequirement, type ProductionSkillDef } from '../../../spacetimedb/src/data/skills';
import {
  MAX_TEMPER,
  affordable,
  elixirRecipeId,
  forgeRecipeOf,
  phialRecipeId,
  isScrapRarity,
  recipeOf,
  smeltRecipeId,
  toolRecipeId,
  type Recipe,
  type Stock,
} from '../../../spacetimedb/src/data/recipes';
import { materialOf, untieredMaterial } from '../../../spacetimedb/src/data/materials';
import { BREW_YIELD, ELIXIRS, ELIXIR_KILLS, INFUSE_BONUS, PHIALS_BY_ID, PHIAL_KINDS, PHIAL_VOIDGLASS, SUPPLIES, SUPPLIES_BY_ID, SUPPLY_TIERS, brewYield, elixirSupplyId, gradeOf, infuseHerbIds, phialSupplyId, phialText } from '../../../spacetimedb/src/data/supplies';
import { ABYSS_UNLOCK_ZONE } from '../../../spacetimedb/src/data/abyss';
import { ZONES } from '../../../spacetimedb/src/data/zones';
import { FORGE_RARE_CHANCE, forgeMagicChance, type ForgeFilter } from '../../../spacetimedb/src/produce';
import { MAX_TIER } from '../../../spacetimedb/src/data/stats';
import { restrictsAffixes } from '../../../spacetimedb/src/loot';
import { nowMicros } from '../clock';
import { zoneUnlocked } from '../discovery';
import { duration, fmt, fmtBig, pct } from '../format';
import { Icon } from '../Icon';
import { itemName, materialIconName, materialName, rarityCls, rarityLabel } from '../items';
import type { Item } from '../../module_bindings/types';
import { CardHead, ViewHeader } from '../shared';
import { snapshot, type Snapshot } from '../snapshot';
import { ActionBar, SkillLevelCard, SkillTabs } from './SkillView';
import { AFFIX_ENTRIES, KeepList } from './FilterView';
import { elixirText, madeCount, recipeLabel } from '../lifeSkills';
import { MilestonesCard } from './MilestonesCard';
import { TemperAction } from './TemperAction';

const VERB: Record<number, string> = { [SkillId.Smithing]: 'Forging', [SkillId.Alchemy]: 'Brewing' };

/** What doing `r` is called: "Smelting", "Tempering", or the skill's verb. */
const verbOf = (r: Recipe) => (r.output.kind === 'material' ? 'Smelting' : VERB[r.skillId]);
/** A queue's title: smelting recipes are named as actions already. */
const queueTitle = (r: Recipe) => (r.output.kind === 'material' ? r.name : `${verbOf(r)} ${recipeLabel(r)}`);

/** Forged bases a settle salvaged (or scrapped) for the keep rule. */
const salvagedOf = (l: { salvaged: number[] }) => l.salvaged.reduce((a, b) => a + b, 0);
const scrappedOf = (l: { scrapped: number[] }) => l.scrapped.reduce((a, b) => a + b, 0);

const held = (s: Snapshot, materialId: number) => Number(s.materials.get(materialId) ?? 0n);
const stockOf = (s: Snapshot): Stock => ({ have: id => held(s, id) });

/** Why `r` can't be queued now, and how many its materials (and the bag) allow. */
function queueState(s: Snapshot, r: Recipe): { blocker?: string; max: number } {
  const level = s.skills.get(r.skillId)!.level;
  const zoneOpen = ZONES.some(z => z.tier === r.tier && zoneUnlocked(s, z));
  let blocker = productionBlocker({ level, tier: r.tier, zoneOpen, needsDeep: r.needsDeep, deepOpen: s.killedZones.has(ABYSS_UNLOCK_ZONE) });
  const out = r.output;
  let max = Math.min(r.max, affordable(r, stockOf(s)));
  if (out.kind === 'item') max = Math.min(max, s.row.bagSize - s.bag.length);
  if (!blocker && out.kind === 'item' && s.row.bagSize - s.bag.length <= 0) blocker = 'Your bag is full';
  if (!blocker && max < 1) blocker = 'Not enough materials';
  return { blocker, max };
}

/** The inputs of `r`, each marked short when the stock can't pay for one. */
function Cost({ s, r }: { s: Snapshot; r: Recipe }) {
  return (
    <>
      {r.inputs.map((i, n) => {
        const have = held(s, i.materialId);
        return (
          <span key={i.materialId} className={have < i.count ? 'c-bad' : ''} title={`You have ${have.toLocaleString()}`}>
            {n > 0 && ' + '}
            {i.count} {materialName(i.materialId)}
          </span>
        );
      })}
    </>
  );
}

/** Queues `r`: `count` actions, or as many as the materials allow when empty. */
function QueueButton({ s, r, count, label }: { s: Snapshot; r: Recipe; count: string; label: string }) {
  const { blocker, max } = queueState(s, r);
  const n = count ? Math.max(1, Math.min(Number(count), r.max)) : Math.max(1, max);
  const running = s.production?.recipe.id === r.id && s.production.skill.id === r.skillId;
  if (running) return <span className="btn small fighting">{verbOf(r)}</span>;
  return (
    <button className="btn small" disabled={!!blocker} title={blocker} onClick={() => call(s.conn.reducers.startProduction({ skillId: r.skillId, recipe: r.id, count: n }))}>
      {label}{r.max > 1 && ` ×${n}`}
    </button>
  );
}

/** How many to queue: a number, or empty for as many as the materials allow. */
function CountInput({ count, setCount }: { count: string; setCount: (c: string) => void }) {
  return (
    <label className="queue-count">
      <span className="muted">Queue</span>
      <input type="number" min={1} max={1000} placeholder="Max" value={count} onChange={e => setCount(e.target.value.replace(/\D/g, ''))} />
    </label>
  );
}

/** Tier buttons. */
function TierSeg({ tier, setTier }: { tier: number; setTier: (t: number) => void }) {
  return (
    <div className="seg">
      {SUPPLY_TIERS.map(t => (
        <button key={t} className={`seg-btn${t === tier ? ' active' : ''}`} onClick={() => setTier(t)}>
          T{t}
        </button>
      ))}
    </div>
  );
}

/** The queue in progress. Ticks on its own: views only redraw on data changes. */
function QueueCard({ s }: { s: Snapshot }) {
  useTick(1000);
  const live = snapshot(s.conn, s.row, nowMicros());
  const q = live.production;
  if (!q) return null;
  const { recipe: r, projected: pr } = q;
  const step = productionActionMicros(r.seconds);
  // What is left: the queue's count, or fewer if the materials (or the bag) run out first.
  const canMake = Math.min(pr.countLeft, queueState(live, r).max);
  const perHour = 3600e6 / Number(step);
  const target = s.row.targetEnemyId !== 0;
  return (
    <div className="card">
      <CardHead title={queueTitle(r)}>
        <button className="btn" onClick={() => call(s.conn.reducers.stopSkill({}))}>
          {target ? <><Icon name="swords" />Back to combat</> : 'Stop'}
        </button>
      </CardHead>
      {pr.endedAt !== undefined ? (
        <p>Queue done. {target ? 'Back to combat' : 'Idle'} at the next update.</p>
      ) : (
        <>
          <div className="stat-row">
            <span>Next action</span>
            {canMake > 0 && <ActionBar key={`${s.row.lastSettledAt.microsSinceUnixEpoch}:${step}`} start={pr.settledMicros} step={step} />}
            <strong>{duration(step)} each</strong>
          </div>
          <div className="stat-row"><span>Left</span><strong>{canMake.toLocaleString()}{canMake < pr.countLeft && <span className="muted"> (materials for {canMake} of {pr.countLeft})</span>}</strong></div>
          <div className="stat-row"><span>Done in</span><strong>~{duration(BigInt(canMake) * step)}</strong></div>
          <div className="stat-row"><span>XP per hour</span><strong>{fmt(perHour * Number(productionXpPerAction(r.tier, r.seconds)))} {q.skill.name} XP · as much Character XP</strong></div>
          <div className="stat-row"><span>Since the last update</span><strong>{madeCount(r, pr.actions)} made</strong></div>
        </>
      )}
      <p className="muted">No gold or drops while {verbOf(r).toLowerCase()}. When the queue ends you go back to {target ? 'your combat target' : 'idle (no combat target)'}.</p>
    </div>
  );
}

// ---------------------------------------------------------------- Alchemy

function ElixirCard({ s }: { s: Snapshot }) {
  const e = s.elixir;
  const stock = SUPPLIES.filter(sup => (s.supplies.get(sup.id) ?? 0) > 0);
  const herbs = (grade: number) => infuseHerbIds(grade).reduce((n, id) => n + Number(s.materials.get(id) ?? 0n), 0);
  return (
    <div className="card">
      <CardHead title="Active elixir">
        <label className="check" title={`Each new elixir (drunk or auto-renewed) uses a rare herb of its grade for ${INFUSE_BONUS}× the bonus, while you have any`}>
          <input type="checkbox" checked={s.row.elixirInfuse} onChange={ev => call(s.conn.reducers.setElixirInfuse({ on: ev.target.checked }))} />
          Infuse
        </label>
        <label className="check">
          <input type="checkbox" checked={s.row.elixirAutoRenew} onChange={ev => call(s.conn.reducers.setElixirAutoRenew({ on: ev.target.checked }))} />
          Auto-renew
        </label>
      </CardHead>
      {e ? (
        <>
          <div className="stat-row">
            <span><Icon name="flask" className={e.infused ? 'c-magic' : 'c-material'} /> {e.infused ? 'Infused ' : ''}{e.supply.name}</span>
            <strong>{e.killsLeft} / {ELIXIR_KILLS} kills</strong>
          </div>
          <p className="muted">
            {elixirText(e.supply, e.infused)}.{' '}
            {s.row.elixirAutoRenew ? `When it runs out, the next is taken from stock (${s.supplies.get(e.supply.id) ?? 0} left)` : 'Auto-renew is off: the slot empties when it runs out'}
            {s.row.elixirAutoRenew && s.row.elixirInfuse && `, infused while rare herbs last (${herbs(e.supply.grade)} left)`}.
          </p>
        </>
      ) : (
        <p className="muted">None. An elixir lasts {ELIXIR_KILLS} kills (about an hour of farming); losing fights and walking use none.</p>
      )}
      {stock.length > 0 && (
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
      )}
      <p className="muted">
        One elixir at a time: power (Wrath, Haste) and profit (Wisdom, Greed, Fortune) share the slot. Infusing uses one rare
        herb from Foraging, any tier of the elixir's grade, lowest first.
      </p>
    </div>
  );
}

function BrewCard({ s }: { s: Snapshot }) {
  const [tier, setTier] = useSticky('brewTier', 1);
  const [count, setCount] = useState('');
  const grade = gradeOf(tier);
  return (
    <div className="card">
      <CardHead title="Elixirs"><CountInput count={count} setCount={setCount} /></CardHead>
      <TierSeg tier={tier} setTier={setTier} />
      <ul className="foes">
        {ELIXIRS.map(el => {
          const r = recipeOf(SkillId.Alchemy, elixirRecipeId(el.kind, tier))!;
          const sup = SUPPLIES_BY_ID.get(elixirSupplyId(el.kind, grade))!;
          return (
            <li key={r.id} className="foe">
              <div className="foe-row">
                <Icon name="flask" className="c-material" />
                <div className="foe-info">
                  <div className="foe-name">{sup.name} <span className="muted">{el.group} · ×{brewYield(tier)} a brew · ×{s.supplies.get(sup.id) ?? 0} in stock</span></div>
                  <div className="foe-meta muted">{elixirText(sup)}</div>
                  <div className="foe-meta"><Cost s={s} r={r} /></div>
                </div>
                <QueueButton s={s} r={r} count={count} label="Brew" />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="muted">
        T1–T3 materials brew Elixirs, T4–T6 Greater, T7–T9 Divine. Within a grade, higher-tier materials make more a
        brew: {BREW_YIELD.join(' / ')}.
      </p>
    </div>
  );
}

/** Phials (phials.md): one fight in the Moonwell Deep or a raid, brewed from its Voidglass. */
function PhialCard({ s }: { s: Snapshot }) {
  const [tier, setTier] = useSticky('phialTier', 1);
  const [count, setCount] = useState('');
  const grade = gradeOf(tier);
  return (
    <div className="card">
      <CardHead title="Phials"><CountInput count={count} setCount={setCount} /></CardHead>
      <TierSeg tier={tier} setTier={setTier} />
      <ul className="foes">
        {PHIAL_KINDS.map(k => {
          const r = recipeOf(SkillId.Alchemy, phialRecipeId(k.kind, tier))!;
          const p = PHIALS_BY_ID.get(phialSupplyId(k.kind, grade))!;
          return (
            <li key={r.id} className="foe">
              <div className="foe-row">
                <Icon name="flask" className="c-magic" />
                <div className="foe-info">
                  <div className="foe-name">{p.name} <span className="muted">×{s.supplies.get(p.id) ?? 0} in stock</span></div>
                  <div className="foe-meta muted">{phialText(p)}</div>
                  <div className="foe-meta"><Cost s={s} r={r} /></div>
                </div>
                <QueueButton s={s} r={r} count={count} label="Brew" />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="muted">
        One Phial lasts one fight in the Moonwell Deep or a raid, picked before it starts and used up win or lose. Elixirs
        don't work there. T1–T3 materials brew Phials, T4–T6 Greater; within a grade, higher tiers cost less
        Voidglass: {PHIAL_VOIDGLASS.join(' / ')}. Needs the Moonwell Deep open.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- Smithing

/** Upgrades a tool one tier: instant, like tempering, so the queue (or the fight) goes on. */
function UpgradeButton({ s, skillId, r }: { s: Snapshot; skillId: number; r: Recipe }) {
  const { blocker } = queueState(s, r);
  return (
    <button className="btn small" disabled={!!blocker} title={blocker} onClick={() => call(s.conn.reducers.upgradeTool({ skillId }))}>
      Upgrade
    </button>
  );
}

function ToolsCard({ s }: { s: Snapshot }) {
  return (
    <div className="card">
      <CardHead title="Tools"><span className="muted">+{Math.round(TOOL_SPEED_PER_TIER * 100)}% gathering speed per tier above T1</span></CardHead>
      <ul className="foes">
        {GATHERING_SKILLS.map(sk => {
          const have = s.tools.get(sk.id) ?? 1;
          const r = recipeOf(SkillId.Smithing, toolRecipeId(sk.id, have + 1));
          return (
            <li key={sk.id} className="foe">
              <div className="foe-row">
                <Icon name={sk.icon} className="c-material" />
                <div className="foe-info">
                  <div className="foe-name">{sk.tool} <span className="muted">T{have} · {sk.name}</span></div>
                  <div className="foe-meta">{r ? <>T{r.tier}: <Cost s={s} r={r} /> · +{fmtBig(productionXpPerAction(r.tier, r.seconds))} XP</> : <span className="muted">Highest tier</span>}</div>
                </div>
                {r && <UpgradeButton s={s} skillId={sk.id} r={r} />}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const KIND_LABEL: Record<BaseKind, string> = { weapon: 'Weapons', offhand: 'Off-hands', armor: 'Armor', jewelry: 'Jewelry' };

function ForgeCard({ s }: { s: Snapshot }) {
  const [tier, setTier] = useSticky('forgeTier', 1);
  const [baseId, setBaseId] = useSticky('forgeBase', 1);
  const [count, setCount] = useState('');
  const [tear, setTear] = useSticky('forgeTear', false);
  const r = forgeRecipeOf(baseId, tier, tear) ?? forgeRecipeOf(1, tier, tear)!;
  const level = s.skills.get(SkillId.Smithing)!.level;
  const b = base(r.output.kind === 'item' ? r.output.baseId : 1);
  const tearHeld = s.materials.get(untieredMaterial('Tear').id) ?? 0n;
  return (
    <div className="card">
      <CardHead title="Forge a base">
        <label className="check" title="At least Magic, and one affix of the item's tier">
          <input type="checkbox" checked={tear} onChange={ev => setTear(ev.target.checked)} />
          Dryad's Tear ({fmtBig(tearHeld)})
        </label>
        <CountInput count={count} setCount={setCount} />
      </CardHead>
      <TierSeg tier={tier} setTier={setTier} />
      <select value={b.id} onChange={e => setBaseId(Number(e.target.value))}>
        {(Object.keys(KIND_LABEL) as BaseKind[]).map(kind => (
          <optgroup key={kind} label={KIND_LABEL[kind]}>
            {ZONE_BASES.filter(x => x.kind === kind).map(x => <option key={x.id} value={x.id}>{x.family}: {x.name(tier)}</option>)}
          </optgroup>
        ))}
      </select>
      <div className="forge-pick">
        <Icon name={materialIconName(r.inputs[0].materialId)} className="c-material" />
        <div className="foe-info">
          <div className="foe-name">{r.name} <span className="muted">T{tier} · {b.family}</span></div>
          <div className="foe-meta"><Cost s={s} r={r} /> · {duration(BigInt(r.seconds) * 1_000_000n)}</div>
          <div className="foe-meta muted">
            {tear ? (
              <><span className="c-magic">Magic</span> or <span className="c-rare">Rare {pct(FORGE_RARE_CHANCE)}</span> · one affix at T{tier}</>
            ) : (
              <><span className="c-magic">Magic {pct(forgeMagicChance(level, tier), 1)}</span> · <span className="c-rare">Rare {pct(FORGE_RARE_CHANCE)}</span> · otherwise Common</>
            )}
          </div>
        </div>
        <QueueButton s={s} r={r} count={count} label="Forge" />
      </div>
      <p className="muted">
        Bag: {s.bag.length} / {s.row.bagSize}. Finish forged bases with the usual crafting (reroll, upgrade). Magic chance +0.5% for each level above the tier's requirement.
      </p>
    </div>
  );
}

/** The forge keep rule: forged bases that fail it are salvaged, not put in the bag. */
function ForgeKeepCard({ s }: { s: Snapshot }) {
  const search = useSticky('forgeAffixSearch', '');
  const f: ForgeFilter = s.forgeFilter ?? { minRarity: 'Common', keepAffixes: [], minAffixTier: 1, scrap: false };
  const set = (patch: Partial<ForgeFilter>) => {
    const next = { ...f, ...patch };
    call(s.conn.reducers.setForgeFilter({
      minRarity: { tag: next.minRarity },
      keepAffixes: [...next.keepAffixes],
      minAffixTier: next.minAffixTier,
      scrap: next.scrap ?? false,
    }));
  };
  const keepsAll = f.minRarity === 'Common' && f.minAffixTier === 1 && !restrictsAffixes(f);
  return (
    <div className="card">
      <CardHead title="Keep rule"><span className="muted">{keepsAll ? 'Keeps everything' : f.scrap ? 'Recycles the rest' : 'Salvages the rest'}</span></CardHead>
      <p className="muted">
        Forged bases that fail this rule are salvaged into Dust and gold (or recycled back into materials) right away and take no bag slot. Separate from the loot filter.
      </p>
      <div className="seg">
        <button className={`seg-btn${!f.scrap ? ' active' : ''}`} onClick={() => set({ scrap: false })}>Salvage</button>
        <button className={`seg-btn${f.scrap ? ' active' : ''}`} onClick={() => set({ scrap: true })}>Recycle</button>
      </div>
      <div className="seg wrap">
        {(['Common', 'Magic', 'Rare'] as const).map(r => (
          <button key={r} className={`seg-btn c-${rarityCls(r)}${r === f.minRarity ? ' active' : ''}`} onClick={() => set({ minRarity: r })}>
            {r === 'Rare' ? 'Rare' : `${r}+`}
          </button>
        ))}
      </div>
      <div className="seg wrap">
        {Array.from({ length: MAX_TIER }, (_, i) => i + 1).map(t => (
          <button key={t} className={`seg-btn${t === f.minAffixTier ? ' active' : ''}`} onClick={() => set({ minAffixTier: t })}>
            {t === 1 ? 'Any affix tier' : `T${t}+`}
          </button>
        ))}
      </div>
      <details className="forge-affixes">
        <summary>Affixes ({restrictsAffixes(f) ? `${f.keepAffixes.length} / ${AFFIX_ENTRIES.length}` : 'any'})</summary>
        <KeepList
          title="Only keep these affixes"
          what="Forged bases"
          one="affix"
          many="affixes"
          entries={AFFIX_ENTRIES}
          keep={new Set(f.keepAffixes.length ? f.keepAffixes : AFFIX_ENTRIES.map(e => e.id))}
          search={search}
          onChange={keepAffixes => set({ keepAffixes })}
        />
      </details>
    </div>
  );
}

/** Ore into bars (life-skills.md, "Smithing: smelting"). */
function SmeltCard({ s }: { s: Snapshot }) {
  const [tier, setTier] = useSticky('smeltTier', 1);
  const [count, setCount] = useState('');
  const ore = recipeOf(SkillId.Smithing, smeltRecipeId(tier))!;
  return (
    <div className="card">
      <CardHead title="Smelt"><CountInput count={count} setCount={setCount} /></CardHead>
      <TierSeg tier={tier} setTier={setTier} />
      <ul className="foes">
        <li className="foe">
          <div className="foe-row">
            <Icon name="m-ore" className="c-material" />
            <div className="foe-info">
              <div className="foe-name">{materialName(ore.inputs[0].materialId)} → {materialName(materialOf(tier, 'Metal').id)}</div>
              <div className="foe-meta"><Cost s={s} r={ore} /> · {duration(BigInt(ore.seconds) * 1_000_000n)} each</div>
            </div>
            <QueueButton s={s} r={ore} count={count} label="Smelt" />
          </div>
        </li>
      </ul>
      <p className="muted">Ore comes from Mining, one bar per Ore.</p>
    </div>
  );
}

/** Items that tempering could raise: Common to Legendary, below +10. */
const temperable = (it: Item) => isScrapRarity(it.rarity.tag) && it.temper < MAX_TEMPER;

/** Temper an item (life-skills.md, "Smithing: temper an item"): pick an item, then `TemperAction`. Also in the crafting workshop. */
function TemperCard({ s }: { s: Snapshot }) {
  const [pick, setPick] = useState<bigint>();
  const all = [...s.items.values()].filter(temperable).sort((a, b) => b.tier - a.tier || b.temper - a.temper);
  const worn = all.filter(it => s.inLoadouts.has(it.id));
  const bag = all.filter(it => !s.inLoadouts.has(it.id));
  const it = (pick !== undefined && s.items.get(pick)) || worn[0] || bag[0];
  const option = (x: Item) => <option key={String(x.id)} value={String(x.id)}>{itemName(x)} (T{x.tier} {rarityLabel(x.rarity.tag)})</option>;
  return (
    <div className="card">
      <CardHead title="Temper an item" />
      {it ? (
        <>
          <select value={String(it.id)} onChange={e => setPick(BigInt(e.target.value))}>
            {worn.length > 0 && <optgroup label="Equipped">{worn.map(option)}</optgroup>}
            {bag.length > 0 && <optgroup label="Bag">{bag.map(option)}</optgroup>}
          </select>
          <TemperAction s={s} it={it} />
        </>
      ) : (
        <p className="muted">No item to temper: Common to Legendary items below +{MAX_TEMPER} can be tempered.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- page

export const ProductionView = memo(function ProductionView({ s, skill }: { s: Snapshot; skill: ProductionSkillDef }) {
  const at = s.skills.get(skill.id)!;
  const here = s.production?.skill.id === skill.id;
  const logs = s.logs.filter(l => l.skillId === skill.id && !l.offline).slice(0, 10);
  let tabs: { key: string; label: string; body: ReactNode }[] = [];
  if (skill.id === SkillId.Alchemy) {
    tabs = [
      { key: 'brew', label: 'Elixirs', body: <BrewCard s={s} /> },
      { key: 'phial', label: 'Phials', body: <PhialCard s={s} /> },
      { key: 'elixir', label: 'Active elixir', body: <ElixirCard s={s} /> },
    ];
  }
  if (skill.id === SkillId.Smithing) {
    tabs = [
      { key: 'smelt', label: 'Smelt', body: <SmeltCard s={s} /> },
      { key: 'temper', label: 'Temper', body: <TemperCard s={s} /> },
      { key: 'forge', label: 'Forge', body: <><ForgeCard s={s} /><ForgeKeepCard s={s} /></> },
      { key: 'tools', label: 'Tools', body: <ToolsCard s={s} /> },
    ];
  }
  return (
    <>
      <a className="btn back-link" href="#skills"><Icon name="back" />All skills</a>
      <ViewHeader title={skill.name} icon={skill.icon} />
      <SkillLevelCard {...at}>
        <p className="muted">Each tier needs its skill level ({SUPPLY_TIERS.map(t => `T${t}: ${tierRequirement(t)}`).join(', ')}) and its zone.</p>
      </SkillLevelCard>
      <MilestonesCard skill={skill} level={at.level} />
      {here && <QueueCard s={s} />}
      {tabs.length > 0 && <SkillTabs id={skill.slug} tabs={tabs} />}
      {logs.length > 0 && (
        <div className="card">
          <CardHead title="Log" />
          <ul className="loot-log">
            {logs.map(l => {
              const r = recipeOf(skill.id, l.recipe);
              return (
                <li key={String(l.id)}>
                  <span className="c-material">
                    {r ? madeCount(r, l.actions) : l.actions}× {r ? recipeLabel(r) : '?'}
                    {l.materials.length > 0 && <span className="muted"> · +{l.materials.map(m => `${m.count.toLocaleString()} ${materialName(m.materialId)}`).join(', ')}</span>}
                    {salvagedOf(l) > 0 && <span className="muted"> · {salvagedOf(l)} salvaged (+{fmtBig(l.dust)} Dust, +{fmtBig(l.gold)} gold)</span>}
                    {scrappedOf(l) > 0 && <span className="muted"> · {scrappedOf(l)} recycled</span>}
                  </span>
                  <span className="muted">
                    +{fmtBig(l.skillXp)} {skill.name} XP · +{fmtBig(l.xp)} XP{l.skillLevelTo > l.skillLevelFrom ? ` · Level ${l.skillLevelTo}!` : ''}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
});
