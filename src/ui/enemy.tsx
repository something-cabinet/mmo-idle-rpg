// Enemy pieces shared by Zones and Combat.

import type { Matchup } from '../../spacetimedb/src/combat';
import { base } from '../../spacetimedb/src/data/bases';
import { DROP_CHANCE, rewardScale, type EnemyDef, type ZoneDef } from '../../spacetimedb/src/data/zones';
import { RARITIES } from '../../spacetimedb/src/loot';
import { fmt, pct } from './format';
import { Icon } from './Icon';
import { itemIconName, rarityCls } from './items';
import type { Snapshot } from './snapshot';

export const DmgTag = ({ magic }: { magic: boolean }) => <span className={`tag ${magic ? 'magic' : 'phys'}`}>{magic ? 'Magic' : 'Phys'}</span>;

/** Chance of at least one drop per kill from a Poisson mean (as loot.ts `rollDrops` samples). */
const atLeastOne = (mean: number) => 1 - Math.exp(-mean);
const chanceText = (p: number) => pct(p, p >= 0.1 ? 0 : p >= 0.01 ? 1 : p >= 0.001 ? 2 : 3);

/** An enemy's rewards and drop chances for the player in `s`. */
export function EnemyDetail({ s, z, e, m }: { s: Snapshot; z: ZoneDef; e: EnemyDef; m: Matchup }) {
  const scale = rewardScale(z, e) * (1 + s.stats.itemFind);
  // Uniques are not in the game yet: their chance rolls Legendary.
  const rarities = RARITIES.filter(r => r !== 'Unique').map(r => ({
    r,
    mean: scale * (DROP_CHANCE[r] + (r === 'Legendary' ? DROP_CHANCE.Unique : 0)),
  }));
  const anyItem = rarities.reduce((sum, x) => sum + x.mean, 0);
  return (
    <div className="enemy-detail">
      <div className="chips">
        <span className="chip"><Icon name="star" />{fmt(m.xpPerKill)} XP / kill</span>
        <span className="chip c-gold"><Icon name="coins" />{fmt(m.goldPerKill)} gold / kill</span>
        {s.stats.itemFind > 0 && <span className="chip c-ok"><Icon name="sparkles" />+{pct(s.stats.itemFind)} item find</span>}
      </div>
      <div className="drop-rarities">
        {rarities.map(({ r, mean }) => (
          <span key={r} className={`c-${rarityCls(r)}`}>{r} {chanceText(atLeastOne(mean))}</span>
        ))}
      </div>
      <div className="drop-group">
        <h4>Materials</h4>
        <p className="muted">Coming soon.</p>
      </div>
      <div className="drop-group">
        <h4>Items <span className="muted">{e.boss ? 'every base of the zone' : 'each base drops from exactly one enemy in the zone'}</span></h4>
        <ul className="drop-list">
          {e.drops.map(d => (
            <li key={d}>
              <Icon name={itemIconName({ baseId: d })} />
              <span>{base(d).name(z.tier)}</span>
              <span className="num muted">{chanceText(atLeastOne(anyItem / e.drops.length))}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
