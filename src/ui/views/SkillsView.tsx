// The life skills hub: every skill with its level, the one being worked marked. Each row opens the skill's page.

import { memo } from 'react';
import { SKILLS } from '../../../spacetimedb/src/data/skills';
import { Icon } from '../Icon';
import { CardHead, ViewHeader } from '../shared';
import type { Snapshot } from '../snapshot';
import { SkillBar, activityText } from './SkillView';

export const SkillsView = memo(function SkillsView({ s }: { s: Snapshot }) {
  const total = SKILLS.reduce((sum, sk) => sum + (s.skills.get(sk.id)?.level ?? 1), 0);
  const working = s.skilling;
  return (
    <>
      <ViewHeader title="Skills" icon="pickaxe" />
      <div className="card">
        <CardHead title="Life skills"><span className="muted">Total level {total}</span></CardHead>
        <p className="muted">
          {working
            ? `Now: ${activityText(s)}.`
            : 'Skilling takes the place of combat: one activity at a time, online and offline. Gathering runs until you stop it; Smithing and Alchemy run a queue, then go back to combat.'}
        </p>
        <ul className="skill-list">
          {SKILLS.map(sk => {
            const at = s.skills.get(sk.id)!;
            const active = working?.id === sk.id;
            return (
              <li key={sk.id}>
                <a href={`#${sk.slug}`} className={`skill-row${active ? ' active' : ''}`}>
                  <Icon name={sk.icon} className="c-material" />
                  <span className="skill-name">
                    {sk.name}
                    <span className="muted">Lv {at.level} · {active ? 'Working' : sk.makes}</span>
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
