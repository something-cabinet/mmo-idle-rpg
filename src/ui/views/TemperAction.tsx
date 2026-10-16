// Tempering one item (life-skills.md, "Smithing: temper an item"): its cost, the Smithing
// XP it gives and the button. Instant, so it sits on the Smithing page and in the
// crafting workshop alike.

import type { Item } from '../../module_bindings/types';
import { TEMPER_STEP } from '../../../spacetimedb/src/combat';
import { MAX_TEMPER, temperCost } from '../../../spacetimedb/src/data/recipes';
import { SkillId } from '../../../spacetimedb/src/data/skills';
import { ZONES } from '../../../spacetimedb/src/data/zones';
import { temperBlocker } from '../../../spacetimedb/src/produce';
import { call } from '../../store';
import { zoneUnlocked } from '../discovery';
import { fmtBig } from '../format';
import { materialName } from '../items';
import type { Snapshot } from '../snapshot';

/** Why `it` can't be tempered now (level, tier, materials or gold), or undefined. */
export function temperState(s: Snapshot, it: Item) {
  const level = s.skills.get(SkillId.Smithing)!.level;
  const cost = temperCost(it);
  const zoneOpen = ZONES.some(z => z.tier === it.tier && zoneUnlocked(s, z));
  const short = !!cost && Number(s.materials.get(cost.material.materialId) ?? 0n) < cost.material.count;
  let blocker = temperBlocker(it, level, zoneOpen);
  if (cost && !blocker) blocker = short ? 'Not enough materials' : s.gold < cost.gold ? 'Not enough gold' : undefined;
  return { level, cost, short, blocker };
}

/** `it`'s next temper level: what it gives, what it costs, and the button. */
export function TemperAction({ s, it }: { s: Snapshot; it: Item }) {
  const { cost, short, blocker } = temperState(s, it);
  const pct = (k: number) => `+${Math.round(k * TEMPER_STEP * 100)}%`;
  return (
    <div className="temper-action">
      <p>
        {it.temper >= MAX_TEMPER ? (
          <>Fully tempered: base stats {pct(MAX_TEMPER)}.</>
        ) : (
          <>+{it.temper} → <strong className="c-temper">+{it.temper + 1}</strong>: base stats {pct(it.temper)} → {pct(it.temper + 1)}</>
        )}
      </p>
      {cost && it.temper < MAX_TEMPER && (
        <div className="craft-do">
          <span className="cost">
            Cost:{' '}
            <strong>
              <span className={short ? 'c-bad' : ''}>{cost.material.count} {materialName(cost.material.materialId)}</span>
              {' + '}
              <span className={s.gold < cost.gold ? 'c-bad' : ''}>{fmtBig(cost.gold)} gold</span>
            </strong>
            <span className="muted"> · +{fmtBig(cost.xp)} Smithing XP</span>
          </span>
          <button className="btn primary" disabled={!!blocker} title={blocker} onClick={() => call(s.conn.reducers.temperItem({ itemId: it.id }))}>
            Temper
          </button>
          {blocker && <span className="muted">{blocker}</span>}
        </div>
      )}
      <p className="muted">Each temper level adds {Math.round(TEMPER_STEP * 100)}% to base stats and implicits.</p>
    </div>
  );
}
