// A skill's level milestones (lifeSkills.ts `skillMilestones`): what each level unlocks,
// so the next goal is always in view.

import type { SkillDef } from '../../../spacetimedb/src/data/skills';
import { CardHead } from '../shared';
import { skillMilestones } from '../lifeSkills';

export function MilestonesCard({ skill, level }: { skill: SkillDef; level: number }) {
  const rows = skillMilestones(skill);
  const next = rows.find(r => r.level > level);
  return (
    <div className="card">
      <CardHead title="Milestones">
        <span className="muted">{next ? `Next at level ${next.level}` : 'All reached'}</span>
      </CardHead>
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
    </div>
  );
}
