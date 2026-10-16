// Live combat (combat.md): fights played hit by hit while the player is online. Pure
// and deterministic, so the server (settling) and the client (animating) run the very
// same fights: each fight's rolls come from a generator seeded by the character and
// the fight's start time (fight.ts). Offline time still uses the expected-value `project`.

import { MAX_LEVEL, combatStats, matchup, type Matchup } from './combat';
import { Effect, effectAmount } from './data/legendary';
import { fightRng, fightSpan, respawns, simulateFight, type Fight } from './fight';
import { ElixirTracker, xpToNext, type Activity, type Progress, type Settled } from './game';
import { seededRng } from './loot';

/** Mixed into Savor's per-kill roll, so it never changes a fight's own rolls. */
const SAVOR_SALT = 0x7361766f72n; // "savor"

export interface Simulated extends Settled {
  /**
   * The latest fight and when it started: the one in progress at `nowMicros`, or the
   * one that just ended in a defeat or a stalemate. Undefined when idle.
   */
  current?: { startMicros: bigint; fight: Fight };
}

/**
 * Online progress (the live counterpart of `project`): plays the fights since
 * `p.settledMicros` back to back. Each kill grants its XP and gold (batched per
 * level, like `project`); stats are recomputed per fight, so a level-up applies from
 * the next one. Only finished fights are settled: the one in progress stays open and
 * replays identically from its start next time. A defeat in a matchup the character
 * wins on average is followed by RESPAWN_SECONDS, then the next fight (`respawns`);
 * until the respawn is over the lost fight counts as in progress. Any other defeat, or
 * a stalemate, settles up to now; such a defeat also returns `defeatedAt`. An elixir active when a fight starts
 * applies to the whole fight; each kill uses one charge.
 */
export function simulate(p: Progress, a: Activity, nowMicros: bigint, characterId: bigint): Simulated {
  let { level, xp, gold } = p;
  let start = p.settledMicros;
  let total = 0;
  let xpGained = 0n;
  let respawned = 0;
  // Kills at the current level not yet turned into XP and gold.
  let batch = 0;
  let m: Matchup | undefined;
  const savor = effectAmount(combatStats(level, a.gear).effects, Effect.Savor);
  const elixir = new ElixirTracker(a.elixir, savor);
  const commit = () => {
    if (!m || batch === 0) return;
    if (level < MAX_LEVEL) {
      const gained = BigInt(Math.floor(batch * m.xpPerKill));
      xp += gained;
      xpGained += gained;
    }
    gold += BigInt(Math.floor(batch * m.goldPerKill));
    batch = 0;
    for (let need = xpToNext(level); level < MAX_LEVEL && xp >= need; need = xpToNext(level)) {
      xp -= need;
      level += 1;
    }
    if (level >= MAX_LEVEL) xp = 0n;
  };
  const result = (settledMicros: bigint, extra: Partial<Simulated> = {}): Simulated => {
    commit();
    return { level, xp, gold, settledMicros, kills: total, xpGained, elixir: elixir.left, ...(respawned > 0 && { respawns: respawned }), ...extra };
  };

  if (!a.enemy || nowMicros <= start) return result(nowMicros > start ? nowMicros : start);
  for (;;) {
    const stats = combatStats(level, a.gear, elixir.buffs);
    const fm = matchup(stats, a.enemy);
    // Rewards changed (a level-up, an elixir running out): close the batch at the old rate.
    if (m && (fm.xpPerKill !== m.xpPerKill || fm.goldPerKill !== m.goldPerKill)) commit();
    m = fm;
    const fight = simulateFight(stats, fm, a.enemy, fightRng(characterId, start));
    const end = start + BigInt(Math.ceil(fightSpan(fight) * 1e6));
    if (end > nowMicros) return result(start, { current: { startMicros: start, fight } });
    const current = { startMicros: start, fight };
    if (respawns(fight)) {
      respawned += 1;
      start = end;
      continue;
    }
    if (fight.outcome === 'defeat') return result(nowMicros, { defeatedAt: end, current });
    if (fight.outcome === 'stalemate') return result(nowMicros, { current });
    total += 1;
    batch += 1;
    // Savor: this kill may keep its charge.
    elixir.use(1, savor > 0 && seededRng(characterId, start, SAVOR_SALT)() < savor ? 0 : 1);
    // Level up as soon as this kill's XP gets there: the next fight uses the new stats.
    if (level < MAX_LEVEL && xp + BigInt(Math.floor(batch * fm.xpPerKill)) >= xpToNext(level)) commit();
    start = end;
  }
}
