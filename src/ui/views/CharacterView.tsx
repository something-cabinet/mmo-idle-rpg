import { memo } from 'react';
import { CardHead, EffectsCard, StatRows, ViewHeader } from '../shared';
import type { Snapshot } from '../snapshot';
import { statSheet } from '../statSheet';

export const CharacterView = memo(function CharacterView({ s }: { s: Snapshot }) {
  const enemyLevel = s.target?.enemy.level ?? s.level;
  const sheet = statSheet(s.level, s.gear, s.stats, enemyLevel, s.fight?.dps);

  return (
    <>
      <ViewHeader title="Character" icon="user" />
      <div className="grid-4">
        <div className="card">
          <CardHead title="Primaries" />
          <StatRows rows={sheet.primaries} />
        </div>
        <div className="card">
          <CardHead title="Offense" />
          <StatRows rows={sheet.offense} />
        </div>
        <div className="card">
          <CardHead title="Defense" />
          <StatRows rows={sheet.defense} />
        </div>
        <div className="card">
          <CardHead title="Utility" />
          <StatRows rows={sheet.utility} />
        </div>
      </div>
      <EffectsCard effects={s.stats.effects} />
      <p className="muted hint">
        Hover a stat name to see what it does, or the rest of its row to see where it comes from. Evasion is against Lv {enemyLevel}
        {s.target ? ` (${s.target.enemy.name})` : ''}.
      </p>
    </>
  );
});
