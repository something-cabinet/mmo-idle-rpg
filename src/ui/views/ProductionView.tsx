// A production skill's page (life-skills.md, "Production"): its level, the queue in
// progress and what it can make. A queue takes the place of fighting and goes back to
// the combat target when it runs out.

import { memo, useState, type ReactNode } from 'react';
import { call, useSticky, useTick } from '../../store';
import { ZONE_BASES, base, type BaseKind } from '../../../spacetimedb/src/data/bases';
import { GATHERING_SKILLS, MAX_SKILL_LEVEL, SkillId, doubleYieldChance, levelSpeedBonus, productionActionMicros, productionBlocker, productionXpPerAction, skillXpToNext, tierRequirement, type ProductionSkillDef } from '../../../spacetimedb/src/data/skills';
import { affordable, forgeRecipeOf, recipeOf, toolRecipeId, type Recipe } from '../../../spacetimedb/src/data/recipes';
import { ELIXIRS, ELIXIR_KILLS, SUPPLIES, SUPPLY_TIERS, elixirSupplyId } from '../../../spacetimedb/src/data/supplies';
import { ZONES } from '../../../spacetimedb/src/data/zones';
import { FORGE_RARE_CHANCE, forgeMagicChance, masterworkTier, type ForgeFilter } from '../../../spacetimedb/src/produce';
import { MAX_TIER } from '../../../spacetimedb/src/data/stats';
import { restrictsAffixes } from '../../../spacetimedb/src/loot';
import { nowMicros } from '../clock';
import { zoneUnlocked } from '../discovery';
import { duration, fmt, fmtBig, pct } from '../format';
import { Icon } from '../Icon';
import { materialIconName, materialName, rarityCls } from '../items';
import { CardHead, ViewHeader } from '../shared';
import { snapshot, type Snapshot } from '../snapshot';
import { ElsewhereCard, SkillBar } from './SkillView';
import { AFFIX_ENTRIES, KeepList } from './FilterView';
import { elixirText, recipeLabel } from '../lifeSkills';

const VERB: Record<number, string> = { [SkillId.Smithing]: 'Forging', [SkillId.Alchemy]: 'Brewing' };

/** Forged bases a settle salvaged for the keep rule. */
const salvagedOf = (l: { salvaged: number[] }) => l.salvaged.reduce((a, b) => a + b, 0);

const held = (s: Snapshot, materialId: number) => Number(s.materials.get(materialId) ?? 0n);

/** Why `r` can't be queued now, and how many its materials (and the bag) allow. */
function queueState(s: Snapshot, r: Recipe): { blocker?: string; max: number } {
  const level = s.skills.get(r.skillId)!.level;
  const zoneOpen = ZONES.some(z => z.tier === r.tier && zoneUnlocked(s, z));
  let blocker = productionBlocker({ level, tier: r.tier, zoneOpen });
  const out = r.output;
  if (!blocker && out.kind === 'tool') {
    const have = s.tools.get(out.skillId) ?? 1;
    if (have >= r.tier) blocker = 'Done';
    else if (have < r.tier - 1) blocker = `Upgrade to tier ${r.tier - 1} first`;
  }
  let max = Math.min(r.max, affordable(r, id => held(s, id)));
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
  if (running) return <span className="btn small fighting">{VERB[r.skillId]}</span>;
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

function TierSeg({ tier, setTier }: { tier: number; setTier: (t: number) => void }) {
  return (
    <div className="seg">
      {SUPPLY_TIERS.map(t => (
        <button key={t} className={`seg-btn${t === tier ? ' active' : ''}`} onClick={() => setTier(t)}>T{t}</button>
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
  const level = live.skills.get(q.skill.id)!.level;
  const step = productionActionMicros(level, r.tier, r.seconds);
  // What is left: the queue's count, or fewer if the materials (or the bag) run out first.
  const canMake = Math.min(pr.countLeft, queueState(live, r).max);
  const perHour = 3600e6 / Number(step);
  const target = s.row.targetEnemyId !== 0;
  return (
    <div className="card">
      <CardHead title={`${VERB[q.skill.id]} ${recipeLabel(r)}`}>
        <button className="btn" onClick={() => call(s.conn.reducers.stopSkill({}))}>
          {target ? <><Icon name="swords" />Back to combat</> : 'Stop'}
        </button>
      </CardHead>
      {pr.endedAt !== undefined ? (
        <p>Queue done. {target ? 'Back to combat' : 'Idle'} at the next update.</p>
      ) : (
        <>
          <div className="stat-row"><span>Each takes</span><strong>{duration(step)}</strong></div>
          <div className="stat-row"><span>Left</span><strong>{canMake.toLocaleString()}{canMake < pr.countLeft && <span className="muted"> (materials for {canMake} of {pr.countLeft})</span>}</strong></div>
          <div className="stat-row"><span>Done in</span><strong>~{duration(BigInt(canMake) * step)}</strong></div>
          <div className="stat-row"><span>XP per hour</span><strong>{fmt(perHour * Number(productionXpPerAction(r.tier, r.seconds)))} {q.skill.name} XP · as much Character XP</strong></div>
          <div className="stat-row"><span>Since the last update</span><strong>{pr.actions} made</strong></div>
        </>
      )}
      <p className="muted">No gold or drops while {VERB[q.skill.id].toLowerCase()}. When the queue ends you go back to {target ? 'your combat target' : 'idle (no combat target)'}.</p>
    </div>
  );
}

// ---------------------------------------------------------------- Alchemy

function ElixirCard({ s }: { s: Snapshot }) {
  const e = s.elixir;
  const stock = SUPPLIES.filter(sup => (s.supplies.get(sup.id) ?? 0) > 0);
  return (
    <div className="card">
      <CardHead title="Active elixir">
        <label className="check">
          <input type="checkbox" checked={s.row.elixirAutoRenew} onChange={ev => call(s.conn.reducers.setElixirAutoRenew({ on: ev.target.checked }))} />
          Auto-renew
        </label>
      </CardHead>
      {e ? (
        <>
          <div className="stat-row"><span><Icon name="flask" className="c-material" /> {e.supply.name} T{e.supply.tier}</span><strong>{e.killsLeft} / {ELIXIR_KILLS} kills</strong></div>
          <p className="muted">{elixirText(e.supply)}. {s.row.elixirAutoRenew ? `When it runs out, the next is taken from stock (${s.supplies.get(e.supply.id) ?? 0} left).` : 'Auto-renew is off: the slot empties when it runs out.'}</p>
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
                  <div className="foe-name">{sup.name} <span className="muted">T{sup.tier} · ×{s.supplies.get(sup.id)}</span></div>
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
      <p className="muted">One elixir at a time: power (Wrath, Haste) and profit (Wisdom, Greed, Fortune) share the slot.</p>
    </div>
  );
}

function BrewCard({ s }: { s: Snapshot }) {
  const [tier, setTier] = useSticky('brewTier', 1);
  const [count, setCount] = useState('');
  return (
    <div className="card">
      <CardHead title="Brew"><CountInput count={count} setCount={setCount} /></CardHead>
      <TierSeg tier={tier} setTier={setTier} />
      <ul className="foes">
        {ELIXIRS.map(el => {
          const r = recipeOf(SkillId.Alchemy, elixirSupplyId(el.kind, tier))!;
          return (
            <li key={r.id} className="foe">
              <div className="foe-row">
                <Icon name="flask" className="c-material" />
                <div className="foe-info">
                  <div className="foe-name">{r.name} <span className="muted">T{tier} · {el.group} · ×{s.supplies.get(r.id) ?? 0} in stock</span></div>
                  <div className="foe-meta muted">{elixirText(SUPPLIES.find(x => x.id === r.id)!)}</div>
                  <div className="foe-meta"><Cost s={s} r={r} /></div>
                </div>
                <QueueButton s={s} r={r} count={count} label="Brew" />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------- Smithing

function ToolsCard({ s }: { s: Snapshot }) {
  return (
    <div className="card">
      <CardHead title="Tools"><span className="muted">Gathering tier T needs a tool of tier T or higher</span></CardHead>
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
                  <div className="foe-meta">{r ? <>T{r.tier}: <Cost s={s} r={r} /> · {duration(BigInt(r.seconds) * 1_000_000n)}</> : <span className="muted">Highest tier</span>}</div>
                </div>
                {r && <QueueButton s={s} r={r} count="1" label="Upgrade" />}
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
  const r = forgeRecipeOf(baseId, tier) ?? forgeRecipeOf(1, tier)!;
  const level = s.skills.get(SkillId.Smithing)!.level;
  const b = base(r.output.kind === 'item' ? r.output.baseId : 1);
  return (
    <div className="card">
      <CardHead title="Forge a base"><CountInput count={count} setCount={setCount} /></CardHead>
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
            <span className="c-magic">Magic {pct(forgeMagicChance(level, tier), 1)}</span> · <span className="c-rare">Rare {pct(FORGE_RARE_CHANCE)}</span> · otherwise Common
            {masterworkTier(level, tier) > 1 && ` · Masterwork: affixes T${masterworkTier(level, tier)}+`}
          </div>
        </div>
        <QueueButton s={s} r={r} count={count} label="Forge" />
      </div>
      <p className="muted">
        Bag: {s.bag.length} / {s.row.bagSize}. Finish forged bases with the usual crafting (reroll, upgrade). Magic chance +0.5% and a higher affix floor (+1 tier per 20) for each level above the tier's requirement.
      </p>
    </div>
  );
}

/** The forge keep rule: forged bases that fail it are salvaged, not put in the bag. */
function ForgeKeepCard({ s }: { s: Snapshot }) {
  const search = useSticky('forgeAffixSearch', '');
  const f: ForgeFilter = s.forgeFilter ?? { minRarity: 'Common', keepAffixes: [], minAffixTier: 1 };
  const set = (patch: Partial<ForgeFilter>) => {
    const next = { ...f, ...patch };
    call(s.conn.reducers.setForgeFilter({ minRarity: { tag: next.minRarity }, keepAffixes: [...next.keepAffixes], minAffixTier: next.minAffixTier }));
  };
  const keepsAll = f.minRarity === 'Common' && f.minAffixTier === 1 && !restrictsAffixes(f);
  return (
    <div className="card">
      <CardHead title="Keep rule"><span className="muted">{keepsAll ? 'Keeps everything' : 'Salvages the rest'}</span></CardHead>
      <p className="muted">
        Forged bases that fail this rule are salvaged into Dust and gold right away and take no bag slot. Separate from the loot filter.
      </p>
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

// ---------------------------------------------------------------- page

export const ProductionView = memo(function ProductionView({ s, skill }: { s: Snapshot; skill: ProductionSkillDef }) {
  const at = s.skills.get(skill.id)!;
  const here = s.production?.skill.id === skill.id;
  // Speed at the highest tier the level allows.
  const tier = Math.max(...SUPPLY_TIERS.filter(t => at.level >= tierRequirement(t)));
  const keep = doubleYieldChance(at.level);
  const logs = s.logs.filter(l => l.skillId === skill.id && !l.offline).slice(0, 10);
  let body: ReactNode = null;
  if (skill.id === SkillId.Alchemy) body = <><ElixirCard s={s} /><BrewCard s={s} /></>;
  if (skill.id === SkillId.Smithing) body = <><ToolsCard s={s} /><ForgeCard s={s} /><ForgeKeepCard s={s} /></>;
  return (
    <>
      <a className="btn back-link" href="#skills"><Icon name="back" />All skills</a>
      <ViewHeader title={skill.name} icon={skill.icon} />
      <div className="card">
        <CardHead title={`Level ${at.level}`}><span className="muted">{skill.makes}</span></CardHead>
        <SkillBar {...at} />
        <div className="stat-row"><span>Speed at T{tier}</span><strong>+{Math.round(levelSpeedBonus(at.level, tier) * 100)}%</strong></div>
        <div className="stat-row"><span>Keep the inputs</span><strong>{keep > 0 ? pct(keep) : 'From level 50'}</strong></div>
        {at.level < MAX_SKILL_LEVEL && <p className="muted">Each tier needs its skill level ({SUPPLY_TIERS.map(t => `T${t}: ${tierRequirement(t)}`).join(', ')}) and its zone. {fmtBig(skillXpToNext(at.level) - at.xp)} XP to level {at.level + 1}.</p>}
      </div>
      {here ? <QueueCard s={s} /> : <ElsewhereCard s={s} verb={skill.id === SkillId.Alchemy ? 'Brewing' : 'Forging'} />}
      {body}
      {logs.length > 0 && (
        <div className="card">
          <CardHead title="Log" />
          <ul className="loot-log">
            {logs.map(l => {
              const r = recipeOf(skill.id, l.recipe);
              return (
                <li key={String(l.id)}>
                  <span className="c-material">
                    {l.actions}× {r ? recipeLabel(r) : '?'}
                    {salvagedOf(l) > 0 && <span className="muted"> · {salvagedOf(l)} salvaged (+{fmtBig(l.dust)} Dust, +{fmtBig(l.gold)} gold)</span>}
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
