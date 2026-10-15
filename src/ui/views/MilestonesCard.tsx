// A skill's level milestones (lifeSkills.ts `skillMilestones`): what each level unlocks,
// so the next goal is always in view. Collapsed until opened: the summary names the next one.

import type { SkillDef } from '../../../spacetimedb/src/data/skills';
import { CollapsibleCard } from '../itemFilter';
import { skillMilestones } from '../lifeSkills';

export function MilestonesCard({ skill, level }: { skill: SkillDef; level: number }) {
  const rows = skillMilestones(skill);
  const next = rows.find(r => r.level > level);
  return (
    <CollapsibleCard
      storageKey="skill_milestones_collapsed"
      title="Milestones"
      defaultCollapsed
      summary={next ? `Next at level ${next.level}: ${next.perks.join(' · ')}` : 'All reached'}
    >
      <div className="table-wrap">
        <table className="table milestones">
          <thead>
            <tr><th className="num">Level</th><th>Unlocks</th></tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.level} className={r === next ? 'active' : r.level <= level ? 'reached' : ''}>
                <td className="num">{r.level <= level ? '✓ ' : ''}{r.level}</td>
                <td>{r.perks.join(' · ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CollapsibleCard>
  );
}
