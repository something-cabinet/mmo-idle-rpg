// Enemy pieces shared by Zones and Combat.

import { useState } from 'react';
import type { Matchup } from '../../spacetimedb/src/combat';
import { base } from '../../spacetimedb/src/data/bases';
import { DROP_CHANCE, rewardScale, type EnemyDef, type ZoneDef } from '../../spacetimedb/src/data/zones';
import { RARITIES } from '../../spacetimedb/src/loot';
import { fmt, pct } from './format';
import { Icon } from './Icon';
import { itemIconName, rarityCls } from './items';
import { StatRows } from './shared';
import type { Snapshot } from './snapshot';

export const DmgTag = ({ magic }: { magic: boolean }) => <span className={`tag ${magic ? 'magic' : 'phys'}`}>{magic ? 'Magic' : 'Phys'}</span>;

/** Chance of at least one drop per kill from a Poisson mean (as loot.ts `rollDrops` samples). */
const atLeastOne = (mean: number) => 1 - Math.exp(-mean);
const chanceText = (p: number) => pct(p, p >= 0.1 ? 0 : p >= 0.01 ? 1 : p >= 0.001 ? 2 : 3);

/** Kills of an enemy that reveal its stats. */
export const STATS_UNLOCK_KILLS = 100;

/** An enemy's rewards tab and, after STATS_UNLOCK_KILLS kills, its stats tab. */
export function EnemyDetail({ s, z, e, m }: { s: Snapshot; z: ZoneDef; e: EnemyDef; m: Matchup }) {
  const [tab, setTab] = useState<'rewards' | 'stats'>('rewards');
  const kills = s.kills.get(e.id) ?? 0;
  const unlocked = kills >= STATS_UNLOCK_KILLS;
  return (
    <div className="enemy-detail">
      <div className="seg">
        <button className={`seg-btn${tab === 'rewards' ? ' active' : ''}`} onClick={() => setTab('rewards')}>Rewards</button>
        <button
          className={`seg-btn${tab === 'stats' ? ' active' : ''}`}
          disabled={!unlocked}
          title={unlocked ? undefined : `Unlocks after ${STATS_UNLOCK_KILLS} kills (${fmt(kills)} so far)`}
          onClick={() => setTab('stats')}
        >
          {!unlocked && <Icon name="lock" />}Stats{!unlocked && ` ${Math.min(kills, STATS_UNLOCK_KILLS)}/${STATS_UNLOCK_KILLS}`}
        </button>
      </div>
      {tab === 'stats' && unlocked ? <EnemyStats e={e} m={m} /> : <EnemyRewards s={s} z={z} e={e} m={m} />}
    </div>
  );
}

function EnemyStats({ e, m }: { e: EnemyDef; m: Matchup }) {
  return (
    <div className="enemy-stats">
      <StatRows
        rows={[
          ['Level', e.level],
          ['HP', fmt(e.hp)],
          ['DPS', fmt(e.dps)],
          ['Damage type', e.damageType],
          ['Attack speed', `${e.speed.toFixed(2)}/s`],
          ['Damage per hit', fmt(e.dps / e.speed)],
          ['Defense', e.defense],
          ['Armor', fmt(e.armor)],
          ['Resistance', fmt(e.resistance)],
          ['Blocks of your physical damage', pct(m.enemyMitigation.Physical, 1), 'After your armor penetration'],
          ['Blocks of your magic damage', pct(m.enemyMitigation.Magic, 1), 'After your magic penetration'],
        ]}
      />
    </div>
  );
}

/** An enemy's rewards and drop chances for the player in `s`. */
function EnemyRewards({ s, z, e, m }: { s: Snapshot; z: ZoneDef; e: EnemyDef; m: Matchup }) {
  const scale = rewardScale(z, e) * (1 + s.stats.itemFind);
  // Uniques are not in the game yet: their chance rolls Legendary.
  const rarities = RARITIES.filter(r => r !== 'Unique').map(r => ({
    r,
    mean: scale * (DROP_CHANCE[r] + (r === 'Legendary' ? DROP_CHANCE.Unique : 0)),
  }));
  const anyItem = rarities.reduce((sum, x) => sum + x.mean, 0);
  return (
    <>
      <div className="drop-group">
        <h4>Per kill</h4>
        <ul className="drop-list">
          <li>
            <Icon name="star" className="c-xp" />
            <span>XP</span>
            <span className="num c-xp">{fmt(m.xpPerKill)}</span>
          </li>
          <li>
            <Icon name="coins" className="c-gold" />
            <span>Gold</span>
            <span className="num c-gold">{fmt(m.goldPerKill)}</span>
          </li>
        </ul>
      </div>
      <div className="drop-group">
        <h4>Materials</h4>
        <p className="muted">Coming soon.</p>
      </div>
      <div className="drop-group">
        <h4>Items</h4>
        <ul className="drop-list">
          {e.drops.map(d => (
            <li key={d}>
              <Icon name={itemIconName({ baseId: d })} />
              <span>{base(d).name(z.tier)}</span>
              <span className="num muted">{chanceText(atLeastOne(anyItem / e.drops.length))}</span>
            </li>
          ))}
        </ul>
        <div className="drop-rarities" title="Share of item drops by rarity">
          {rarities.map(({ r, mean }) => (
            <span key={r} className={`c-${rarityCls(r)}`}>{r} {chanceText(mean / anyItem)}</span>
          ))}
          {s.stats.itemFind > 0 && <span className="c-ok">+{pct(s.stats.itemFind)} item find</span>}
        </div>
      </div>
    </>
  );
}
