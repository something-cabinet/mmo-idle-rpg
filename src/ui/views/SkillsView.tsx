// The life skills hub: every skill with its level, the one being worked marked. Each row opens the skill's page.

import { memo } from 'react';
import { SKILLS } from '../../../spacetimedb/src/data/skills';
import { materialOf } from '../../../spacetimedb/src/data/materials';
import { Icon } from '../Icon';
import { CardHead, ViewHeader } from '../shared';
import type { Snapshot } from '../snapshot';
import { SkillBar } from './SkillView';

export const SkillsView = memo(function SkillsView({ s }: { s: Snapshot }) {
  const total = SKILLS.reduce((sum, sk) => sum + (s.skills.get(sk.id)?.level ?? 1), 0);
  const g = s.gathering;
  return (
    <>
      <ViewHeader title="Skills" icon="pickaxe" />
      <div className="card">
        <CardHead title="Life skills"><span className="muted">Total level {total}</span></CardHead>
        <p className="muted">
          {g ? `You're gathering ${materialOf(g.tier, g.skill.makes).name} (${g.skill.name}).` : 'Gathering takes the place of combat: one activity at a time, online and offline.'}
        </p>
        <ul className="skill-list">
          {SKILLS.map(sk => {
            const at = s.skills.get(sk.id)!;
            const active = g?.skill.id === sk.id;
            return (
              <li key={sk.id}>
                <a href={`#${sk.slug}`} className={`skill-row${active ? ' active' : ''}`}>
                  <Icon name={sk.icon} className="c-material" />
                  <span className="skill-name">
                    {sk.name}
                    <span className="muted">Lv {at.level}{active && ' · Gathering'}</span>
                  </span>
                  <SkillBar {...at} />
                  <Icon name="chevron" className="caret" />
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
});
