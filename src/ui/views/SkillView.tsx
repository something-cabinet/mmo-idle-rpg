// One life skill's page (life-skills.md): its level and tool, what it can gather, and its log.
// Gathering takes the place of fighting: one activity at a time.

import { memo } from 'react';
import { call, useTick } from '../../store';
import {
  GEM_CHANCE,
  MAX_SKILL_LEVEL,
  SkillId,
  doubleYieldChance,
  gatherActionMicros,
  gatherBlocker,
  gatherCharacterXpPerAction,
  gatherXpPerAction,
  levelSpeedBonus,
  skillXpToNext,
  tierRequirement,
  toolSpeedBonus,
  type SkillDef,
} from '../../../spacetimedb/src/data/skills';
import { ZONES } from '../../../spacetimedb/src/data/zones';
import { materialOf } from '../../../spacetimedb/src/data/materials';
import { nowMicros } from '../clock';
import { zoneUnlocked } from '../discovery';
import { duration, fmt, fmtBig } from '../format';
import { Icon } from '../Icon';
import { materialIconName, materialsText } from '../items';
import { CardHead, ViewHeader } from '../shared';
import { snapshot, type Snapshot } from '../snapshot';

const TIERS = [...new Set(ZONES.map(z => z.tier))].sort((a, b) => a - b);

/** Actions, skill XP and character XP per hour gathering `tier` at `level` with a tool of `toolTier`. */
function rates(level: number, tier: number, toolTier: number) {
  const perHour = 3600e6 / Number(gatherActionMicros(level, tier, toolTier));
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

/** What this skill is gathering now. Ticks on its own: views only redraw on data changes. */
function GatheringCard({ s }: { s: Snapshot }) {
  useTick(1000);
  const live = snapshot(s.conn, s.row, nowMicros());
  const g = live.gathering;
  if (!g) return null;
  const at = live.skills.get(g.skill.id)!;
  const r = rates(at.level, g.tier, g.toolTier);
  const material = materialOf(g.tier, g.skill.makes);
  const toNext = at.level >= MAX_SKILL_LEVEL ? 'Max level' : `~${duration(BigInt(Math.ceil((Number(skillXpToNext(at.level) - at.xp) / r.xp) * 3600e6)))}`;
  const target = s.row.targetEnemyId !== 0;
  return (
    <div className="card">
      <CardHead title={`Gathering ${material.name}`}>
        <button className="btn" onClick={() => call(s.conn.reducers.stopSkill({}))}>
          {target ? <><Icon name="swords" />Back to combat</> : 'Stop'}
        </button>
      </CardHead>
      <div className="stat-row"><span>Per hour</span><strong>{fmt(r.actions)} {material.name}</strong></div>
      <div className="stat-row"><span>XP per hour</span><strong>{fmt(r.xp)} {g.skill.name} XP · {fmt(r.charXp)} Character XP</strong></div>
      <div className="stat-row"><span>Next {g.skill.name} level</span><strong>{toNext}</strong></div>
      <div className="stat-row"><span>Since the last update</span><strong>{fmt(g.projected.actions)} actions</strong></div>
      <p className="muted">No gold or drops while gathering. Materials arrive every minute.</p>
    </div>
  );
}

/** What the character does instead, when it isn't working this skill: gathering here stops it. */
function ElsewhereCard({ s }: { s: Snapshot }) {
  const g = s.gathering;
  const now = g ? `${g.skill.name}: ${materialOf(g.tier, g.skill.makes).name}` : s.target ? `Fighting ${s.target.enemy.name}` : 'Idle';
  return (
    <div className="card">
      <p>Now: <strong>{now}</strong></p>
      {(g || s.target) && <p className="muted">Gathering here stops it.</p>}
    </div>
  );
}

function TierRow({ s, skill, tier }: { s: Snapshot; skill: SkillDef; tier: number }) {
  const { level } = s.skills.get(skill.id)!;
  const toolTier = s.tools.get(skill.id) ?? 1;
  const zoneOpen = ZONES.some(z => z.tier === tier && zoneUnlocked(s, z));
  const blocker = gatherBlocker({ level, tier, toolTier, zoneOpen, tool: skill.tool });
  const active = s.gathering?.skill.id === skill.id && s.gathering.tier === tier;
  const material = materialOf(tier, skill.makes);
  const r = rates(level, tier, toolTier);
  return (
    <li className={`foe${active ? ' active' : ''}`}>
      <div className="foe-row">
        <Icon name={materialIconName(material.id)} className="c-material" />
        <div className="foe-info">
          <div className="foe-name">{material.name} <span className="muted">T{tier}</span></div>
          <div className="foe-meta muted">
            {blocker ?? `${fmt(r.actions)}/h · ${fmt(r.xp)} XP/h`}
            {!blocker && skill.id === SkillId.Mining && ` · ${fmt(r.actions * GEM_CHANCE)} ${materialOf(tier, 'Gem').name}/h`}
          </div>
        </div>
        {active ? (
          <span className="btn small fighting">Gathering</span>
        ) : (
          <button className="btn small" disabled={!!blocker} title={blocker} onClick={() => call(s.conn.reducers.startGathering({ skillId: skill.id, tier }))}>
            Gather
          </button>
        )}
      </div>
    </li>
  );
}

export const SkillView = memo(function SkillView({ s, skill }: { s: Snapshot; skill: SkillDef }) {
  const at = s.skills.get(skill.id)!;
  const toolTier = s.tools.get(skill.id) ?? 1;
  const double = doubleYieldChance(at.level);
  const here = s.gathering?.skill.id === skill.id;
  // Speed at the tier being gathered, or the highest the skill level allows.
  const tier = here ? s.gathering!.tier : Math.max(...TIERS.filter(t => at.level >= tierRequirement(t)));
  const logs = s.logs.filter(l => l.skillId === skill.id && !l.offline).slice(0, 10);
  return (
    <>
      <a className="btn back-link" href="#skills"><Icon name="back" />All skills</a>
      <ViewHeader title={skill.name} icon={skill.icon} />
      <div className="card">
        <CardHead title={`Level ${at.level}`}><span className="muted">{skill.tool} T{toolTier}</span></CardHead>
        <SkillBar {...at} />
        <div className="stat-row"><span>Speed at T{tier}</span><strong>+{Math.round((levelSpeedBonus(at.level, tier) + toolSpeedBonus(toolTier, tier)) * 100)}%</strong></div>
        <div className="stat-row"><span>Double yield</span><strong>{double > 0 ? `${Math.round(double * 100)}%` : 'From level 50'}</strong></div>
      </div>
      {here ? <GatheringCard s={s} /> : <ElsewhereCard s={s} />}
      <div className="card">
        <CardHead title="Gather"><span className="muted">Each tier needs its skill level, its zone and a tool of its tier</span></CardHead>
        <ul className="foes">
          {TIERS.map(t => <TierRow key={t} s={s} skill={skill} tier={t} />)}
        </ul>
      </div>
      {logs.length > 0 && (
        <div className="card">
          <CardHead title="Log" />
          <ul className="loot-log">
            {logs.map(l => (
              <li key={String(l.id)}>
                <span className="c-material">{materialsText(l.materials)}</span>
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
