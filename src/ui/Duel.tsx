// A friendly duel against a friend, replayed hit by hit (duel.ts). Opened from the
// inspect popup; both sides' stats are taken when the duel starts.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CombatStats } from '../../spacetimedb/src/combat';
import { DUEL_SAMPLES, DUEL_SECONDS, duelRng, simulateDuel, winRate } from './duelSim';
import { useSticky } from '../store';
import { fmt, pct } from './format';
import { HIT_FLASH, HealGlow, HealShimmer, hitClass, lastHeals, type LastHit } from './fightFx';
import { Icon } from './Icon';
import { PlayerName } from './PlayerName';
import type { DbConnection } from '../module_bindings';

export interface Duelist {
  id: bigint;
  name: string;
  level: number;
  stats: CombatStats;
}

/** Replay speed with the speed-up toggle on: duel seconds per real second (off: 1, real time like the Combat screen). */
const FAST = 2;

export function DuelPanel({ conn, me, foe }: { conn: DbConnection; me: Duelist; foe: Duelist }) {
  const [round, setRound] = useState(() => Math.floor(Math.random() * 1e9));
  const [t, setT] = useState(0);
  // The first duel waits for Start, so it doesn't spring on the player; Rematch starts at once.
  const [started, setStarted] = useState(false);
  const skipped = useRef(false);
  // Remembered for the session, so rematches and other duels keep it.
  const [fast, setFast] = useSticky('duelFast', false);
  const speed = useRef(1);
  speed.current = fast ? FAST : 1;
  const sides: [CombatStats, CombatStats] = [me.stats, foe.stats];
  const duel = useMemo(() => simulateDuel(sides, duelRng(me.id, foe.id, round)), [round]); // eslint-disable-line react-hooks/exhaustive-deps -- stats are fixed for the panel's life
  const odds = useMemo(() => winRate(sides, me.id, foe.id), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Play the duel back: `t` runs from 0 to its end. It advances by each frame's real time
  // × the current speed, so toggling the speed mid-duel doesn't jump.
  useEffect(() => {
    setT(0);
    if (!started) return;
    skipped.current = false;
    let raf = 0;
    let at = 0;
    let last = performance.now();
    const tick = (now: number) => {
      at = skipped.current ? duel.end : Math.min(duel.end, at + ((now - last) / 1000) * speed.current);
      last = now;
      setT(at);
      if (at < duel.end) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [duel, started]);

  const shown = duel.events.filter(e => e.t <= t);
  const last = shown.at(-1);
  const hp = last?.hp ?? duel.maxHp;
  const over = started && t >= duel.end;
  const names = [me.name, foe.name];
  // Each side's latest hit taken (no sprites in a duel: the HP bar flashes).
  const lastHit: (LastHit | undefined)[] = [undefined, undefined];
  for (let n = shown.length - 1; n >= 0 && t - shown[n].t < HIT_FLASH; n--) {
    const e = shown[n];
    if (e.kind !== 'dodge') lastHit[1 - e.by] ??= { n, at: e.t };
  }
  const heals = lastHeals(shown, duel.maxHp, t);
  const line = (e: (typeof duel.events)[number]) => {
    const [a, b] = e.by === 0 ? ['You', foe.name] : [foe.name, 'you'];
    if (e.kind === 'dodge') return `${b === 'you' ? 'You dodge' : `${b} dodges`} ${e.by === 0 ? 'your' : `${a}'s`} attack`;
    return `${a} ${e.kind === 'crit' ? 'crit' : 'hit'}${e.by === 0 ? '' : 's'} ${b} for ${fmt(e.damage)}${e.secondWind ? ' (Second Wind!)' : ''}`;
  };

  return (
    <div className="duel">
      <div className="duel-arena">
        {[0, 1].map(i => (
          <div key={i} className={`duelist${over && duel.winner === i ? ' won' : ''}${over && duel.winner === 1 - i ? ' lost' : ''}`}>
            <div className="duelist-name">
              <PlayerName conn={conn} id={i === 0 ? me.id : foe.id} name={names[i]} row /> <span className="muted">Lv {i === 0 ? me.level : foe.level}</span>
            </div>
            <div className={`hpbar${i === 1 ? ' enemy' : ''}${hitClass(lastHit[i], t)}`}>
              <div className="hp-fill" style={{ width: `${(hp[i] / duel.maxHp[i]) * 100}%` }} />
              <HealShimmer heal={heals[i]} t={t} />
              <HealGlow heal={heals[i]} t={t} />
              <span className="hp-text">{fmt(hp[i])} / {fmt(duel.maxHp[i])}</span>
            </div>
          </div>
        ))}
        <div className="duel-vs">VS</div>
      </div>

      <div className="duel-status">
        {over ? (
          <strong className={duel.winner === 0 ? 'c-ok' : duel.winner === 1 ? 'c-bad' : ''}>
            {duel.winner === -1 ? 'Draw!' : duel.winner === 0 ? 'You win!' : `${foe.name} wins!`}{' '}
            <span className="muted">{duel.by === 'ko' ? `Knockout at ${duel.end.toFixed(1)} s` : `On points after ${DUEL_SECONDS} s`}</span>
          </strong>
        ) : started ? (
          <span className="muted">{t.toFixed(1)} s</span>
        ) : (
          <span className="muted">Ready?</span>
        )}
      </div>

      <ul className="duel-log">
        {shown.slice(-5).reverse().map((e, i) => (
          <li key={shown.length - i} className={`${e.by === 0 ? 'mine' : 'theirs'}${e.kind === 'crit' ? ' crit' : ''}`}>{line(e)}</li>
        ))}
      </ul>

      <div className="duel-odds" title={`${DUEL_SAMPLES} simulated duels with these stats`}>
        <span>Your odds</span>
        <div className="duel-odds-bar"><div style={{ width: `${odds * 100}%` }} /></div>
        <strong>{pct(odds)}</strong>
      </div>

      <div className="row">
        {started ? (
          <button className="btn small primary" onClick={() => setRound(r => r + 1)}>
            <Icon name="swords" />
            Rematch
          </button>
        ) : (
          <button className="btn primary duel-start" onClick={() => setStarted(true)}>
            <Icon name="swords" />
            Start
          </button>
        )}
        <button className={`btn small ghost${fast ? ' active' : ''}`} aria-pressed={fast} title="Play the duel at double speed" onClick={() => setFast(!fast)}>
          <Icon name="zap" />
          {FAST}× speed
        </button>
        {started && !over && (
          <button className="btn small ghost" onClick={() => (skipped.current = true)}>
            Skip
          </button>
        )}
      </div>
      <p className="muted hint">
        Just for fun: no rewards. Both sides use their current level and active loadout ({foe.name}'s as of their last
        save). The odds come from {DUEL_SAMPLES} duels with the same stats.
      </p>
    </div>
  );
}
