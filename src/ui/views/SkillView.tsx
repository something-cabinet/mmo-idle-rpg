// One gathering skill's page (life-skills.md): its level and tool, what it can gather, and its log.
// Gathering takes the place of fighting: one activity at a time.

import { memo, useRef, useState, type ReactNode } from 'react';
import { call, useSticky, useTick } from '../../store';
import {
  GATHER_NODES,
  GATHER_NODES_BY_ID,
  MAX_SKILL_LEVEL,
  SkillId,
  doubleYieldChance,
  findChances,
  findLevelMult,
  gatherActionMicros,
  gatherBlocker,
  gemChance,
  mainChance,
  gatherCharacterXpPerAction,
  gatherXpPerAction,
  toolSpeedBonus,
  skillXpToNext,
  type GatheringSkillDef,
} from '../../../spacetimedb/src/data/skills';
import { ZONES } from '../../../spacetimedb/src/data/zones';
import { MATERIALS_BY_ID, materialOf } from '../../../spacetimedb/src/data/materials';
import { relicGold } from '../../../spacetimedb/src/gather';
import { nowMicros } from '../clock';
import { zoneUnlocked } from '../discovery';
import { duration, fmt, fmtBig } from '../format';
import { Icon } from '../Icon';
import { materialIconName, materialsText } from '../items';
import { CardHead, ViewHeader } from '../shared';
import { snapshot, type Snapshot } from '../snapshot';
import { recipeLabel } from '../lifeSkills';
import { MilestonesCard } from './MilestonesCard';

const TIERS = [...new Set(ZONES.map(z => z.tier))].sort((a, b) => a - b);

/** Actions, skill XP and character XP per hour gathering `tier` with a tool of `toolTier`. */
function rates(tier: number, toolTier: number) {
  const perHour = 3600e6 / Number(gatherActionMicros(toolTier));
  return { actions: perHour, xp: perHour * gatherXpPerAction(tier), charXp: perHour * gatherCharacterXpPerAction(tier) };
}

export function SkillBar({ level, xp }: { level: number; xp: bigint }) {
  const need = skillXpToNext(level);
  const maxed = level >= MAX_SKILL_LEVEL;
  return (
    <div className="skill-xp">
      <div className="bar"><div className="skill-fill" style={{ width: maxed ? '100%' : `${Number((xp * 100n) / need)}%` }} /></div>
      <span className="xp-text">{maxed ? 'Max level' : `${xp.toLocaleString()} / ${need.toLocaleString()}`}</span>
    </div>
  );
}

/** Below this an action bar would only flicker: it shows full instead. */
const MIN_ANIMATED_STEP = 400_000n;

/**
 * Progress of actions of `step` micros, the first started at `start`. A looping CSS
 * animation, so it keeps time between redraws however short the actions are. The offset
 * is read once (updating it would push the running animation ahead): key it by what
 * realigns it, like a new `start` or `step`.
 */
export function ActionBar({ start, step }: { start: bigint; step: bigint }) {
  const [delay] = useState(() => {
    const into = nowMicros() - start;
    return Number(into > 0n ? into % step : 0n) / 1e6;
  });
  const animated = step >= MIN_ANIMATED_STEP;
  return (
    <div className="bar progress-bar">
      <div
        className={animated ? 'action-fill' : 'action-fill full'}
        style={animated ? { animationDuration: `${Number(step) / 1e6}s`, animationDelay: `-${delay}s` } : undefined}
      />
    </div>
  );
}

/** What `skill` at `tier` and `node` yields per hour on top of the main material: Gems and rare finds. */
function extrasPerHour(skill: GatheringSkillDef, tier: number, node: number, level: number, actions: number): string[] {
  const out: string[] = [];
  if (skill.id === SkillId.Mining) out.push(`${fmt(actions * gemChance(node))} ${materialOf(tier, 'Gem').name}`);
  for (const f of findChances(skill.id, tier, node, level)) {
    const n = actions * f.chance;
    out.push(
      f.materialId === undefined
        ? `${fmt(n)} Relics (${fmtBig(BigInt(Math.round(n * Number(relicGold(tier)))))} gold)`
        : `${fmt(n)} ${MATERIALS_BY_ID.get(f.materialId)!.name}`
    );
  }
  return out;
}

/** A count with "+n" floating over it each time it grows. */
function Held({ count, name }: { count: bigint; name: string }) {
  const last = useRef({ count, gain: 0n, at: 0 });
  const r = last.current;
  if (count !== r.count) last.current = count > r.count ? { count, gain: count - r.count, at: r.at + 1 } : { ...r, count };
  const { gain, at } = last.current;
  return (
    <span className="gain-anchor">
      {fmtBig(count)} {name}
      {gain > 0n && <span key={at} className="gain-float">+{fmtBig(gain)}</span>}
    </span>
  );
}

/** What this skill is gathering now. Ticks on its own: views only redraw on data changes. */
function GatheringCard({ s }: { s: Snapshot }) {
  // Often enough for actions of a second or so.
  useTick(250);
  const live = snapshot(s.conn, s.row, nowMicros());
  const g = live.gathering;
  if (!g) return null;
  const at = live.skills.get(g.skill.id)!;
  const r = rates(g.tier, g.toolTier);
  const material = materialOf(g.tier, g.skill.makes);
  const node = GATHER_NODES_BY_ID.get(g.node);
  const main = mainChance(g.node);
  // Everything this spot can yield, to show the counts held.
  const held = [
    ...(main > 0 ? [material] : []),
    ...(g.skill.id === SkillId.Mining ? [materialOf(g.tier, 'Gem')] : []),
    ...findChances(g.skill.id, g.tier, g.node, at.level).flatMap(f => (f.materialId === undefined ? [] : [MATERIALS_BY_ID.get(f.materialId)!])),
  ];
  const toNext = at.level >= MAX_SKILL_LEVEL ? 'Max level' : `~${duration(BigInt(Math.ceil((Number(skillXpToNext(at.level) - at.xp) / r.xp) * 3600e6)))}`;
  const step = gatherActionMicros(g.toolTier);
  const target = s.row.targetEnemyId !== 0;
  return (
    <div className="card">
      <CardHead title={node ? `${node.name} T${g.tier}` : `Gathering ${material.name}`}>
        <button className="btn" onClick={() => call(s.conn.reducers.stopSkill({}))}>
          {target ? <><Icon name="swords" />Back to combat</> : 'Stop'}
        </button>
      </CardHead>
      <div className="stat-row">
        <span>Next action</span>
        <ActionBar key={`${s.row.lastSettledAt.microsSinceUnixEpoch}:${step}`} start={g.projected.settledMicros} step={step} />
        <strong>{(Number(step) / 1e6).toFixed(1)} s each</strong>
      </div>
      <div className="stat-row">
        <span>Held</span>
        <strong>
          {held.map((m, i) => <span key={m.id}>{i > 0 && ' · '}<Held count={live.materials.get(m.id) ?? 0n} name={m.name} /></span>)}
        </strong>
      </div>
      <div className="stat-row">
        <span>Per hour</span>
        <strong>{[...(main > 0 ? [`${fmt(r.actions * main)} ${material.name}`] : []), ...extrasPerHour(g.skill, g.tier, g.node, at.level, r.actions)].join(' · ')}</strong>
      </div>
      <div className="stat-row"><span>XP per hour</span><strong>{fmt(r.xp)} {g.skill.name} XP · {fmt(r.charXp)} Character XP</strong></div>
      <div className="stat-row"><span>Next {g.skill.name} level</span><strong>{toNext}</strong></div>
      <p className="muted">{g.skill.id === SkillId.Mining ? 'No drops while gathering; Relics sell for gold on the spot.' : 'No gold or drops while gathering.'}</p>
    </div>
  );
}

/** What the character is doing: a life skill, fighting, or idle. */
export function activityText(s: Snapshot): string {
  const g = s.gathering;
  const p = s.production;
  if (g) return `${g.skill.name}: ${GATHER_NODES_BY_ID.get(g.node)?.name ?? materialOf(g.tier, g.skill.makes).name}${g.node ? ` T${g.tier}` : ''}`;
  if (p) return `${p.skill.name}: ${recipeLabel(p.recipe)}`;
  return s.target ? `Fighting ${s.target.enemy.name}` : 'Idle';
}

/** A skill page's top card: the level and a full-width XP bar, then the skill's perks (`children`). */
export function SkillLevelCard({ level, xp, children }: { level: number; xp: bigint; children?: ReactNode }) {
  return <LevelCard level={level} xp={xp} need={skillXpToNext(level)} maxed={level >= MAX_SKILL_LEVEL}>{children}</LevelCard>;
}

/** A level and a full-width XP bar toward the next one (skills and the character page). */
export function LevelCard({ level, xp, need, maxed, children }: { level: number; xp: bigint; need: bigint; maxed: boolean; children?: ReactNode }) {
  const pct = maxed ? 100 : Number((xp * 1000n) / need) / 10;
  return (
    <div className="card skill-level">
      <div className="skill-level-head">
        <h2>Level {level}</h2>
        <span className="muted">{maxed ? 'Max level' : `${xp.toLocaleString()} / ${need.toLocaleString()} XP · ${fmtBig(need - xp)} to level ${level + 1}`}</span>
      </div>
      <div className="bar skill-level-bar"><div className="skill-fill" style={{ width: `${pct}%` }} /></div>
      {children}
    </div>
  );
}

/** A skill's actions, one per tab (the choice is kept per `id`). */
export function SkillTabs({ id, tabs }: { id: string; tabs: { key: string; label: string; body: ReactNode }[] }) {
  const [key, setKey] = useSticky(`skillTab:${id}`, tabs[0].key);
  const active = tabs.find(t => t.key === key) ?? tabs[0];
  return (
    <>
      <div className="skill-tabs" role="tablist">
        {tabs.map(t => (
          <button key={t.key} role="tab" aria-selected={t === active} className={`skill-tab${t === active ? ' active' : ''}`} onClick={() => setKey(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      {active.body}
    </>
  );
}

/** One spot to gather: tier `tier` at `node` (0: the normal node). */
function TierRow({ s, skill, tier, node = 0 }: { s: Snapshot; skill: GatheringSkillDef; tier: number; node?: number }) {
  const { level } = s.skills.get(skill.id)!;
  const toolTier = s.tools.get(skill.id) ?? 1;
  const zoneOpen = ZONES.some(z => z.tier === tier && zoneUnlocked(s, z));
  const blocker = gatherBlocker({ level, tier, zoneOpen, node });
  const active = s.gathering?.skill.id === skill.id && s.gathering.tier === tier && s.gathering.node === node;
  const material = materialOf(tier, skill.makes);
  const n = GATHER_NODES_BY_ID.get(node);
  const main = mainChance(node);
  const r = rates(tier, toolTier);
  const yields = [
    ...(main > 0 ? [`${fmt(r.actions * main)}/h`] : []),
    `${fmt(r.xp)} XP/h`,
    ...extrasPerHour(skill, tier, node, level, r.actions).map(x => `${x}/h`),
  ];
  return (
    <li className={`foe${active ? ' active' : ''}`}>
      <div className="foe-row">
        <Icon name={materialIconName(material.id)} className="c-material" />
        <div className="foe-info">
          <div className="foe-name">{n ? n.name : material.name} <span className="muted">T{tier}{n && ` · ${n.text}`}</span></div>
          <div className="foe-meta muted">{blocker ?? yields.join(' · ')}</div>
        </div>
        {active ? (
          <span className="btn small fighting">Gathering</span>
        ) : (
          <button className="btn small" disabled={!!blocker} title={blocker} onClick={() => call(s.conn.reducers.startGathering({ skillId: skill.id, tier, node }))}>
            Gather
          </button>
        )}
      </div>
    </li>
  );
}

export const SkillView = memo(function SkillView({ s, skill }: { s: Snapshot; skill: GatheringSkillDef }) {
  const at = s.skills.get(skill.id)!;
  const toolTier = s.tools.get(skill.id) ?? 1;
  const double = doubleYieldChance(at.level);
  const here = s.gathering?.skill.id === skill.id;
  const logs = s.logs.filter(l => l.skillId === skill.id && !l.offline).slice(0, 10);
  const nodes = GATHER_NODES.filter(n => n.skillId === skill.id);
  return (
    <>
      <a className="btn back-link" href="#skills"><Icon name="back" />All skills</a>
      <ViewHeader title={skill.name} icon={skill.icon} />
      <SkillLevelCard {...at}>
        <div className="stat-row"><span>{skill.tool}</span><strong>T{toolTier} · +{Math.round(toolSpeedBonus(toolTier) * 100)}% speed</strong></div>
        {double > 0 && <div className="stat-row"><span>Double yield</span><strong>{Math.round(double * 100)}%</strong></div>}
        <div className="stat-row"><span>Rare finds</span><strong>×{findLevelMult(at.level).toFixed(2)}</strong></div>
      </SkillLevelCard>
      <MilestonesCard skill={skill} level={at.level} />
      {here && <GatheringCard s={s} />}
      <div className="card">
        <CardHead title="Gather"><span className="muted">Each tier needs its skill level and its zone</span></CardHead>
        <ul className="foes">
          {TIERS.map(t => <TierRow key={t} s={s} skill={skill} tier={t} />)}
        </ul>
      </div>
      {nodes.length > 0 && (
        <div className="card">
          <CardHead title="Special nodes"><span className="muted">Trade the main material for a focus</span></CardHead>
          <ul className="foes">
            {nodes.flatMap(n => TIERS.map(t => <TierRow key={`${n.id}:${t}`} s={s} skill={skill} tier={t} node={n.id} />))}
          </ul>
        </div>
      )}
      {logs.length > 0 && (
        <div className="card">
          <CardHead title="Log" />
          <ul className="loot-log">
            {logs.map(l => (
              <li key={String(l.id)}>
                <span className="c-material">{materialsText(l.materials)}</span>
                {l.gold > 0n && <span className="c-gold"> +{fmtBig(l.gold)} gold</span>}
                <span className="muted">
                  +{fmtBig(l.skillXp)} {skill.name} XP · +{fmtBig(l.xp)} XP{l.skillLevelTo > l.skillLevelFrom ? ` · Level ${l.skillLevelTo}!` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
});
