// The online fight scene (combat.md): replays the live fights of sim.ts, the same
// fights the server settles, so what you see is what you get. Each fight is a pure
// function of the clock from its start, so leaving and reopening the view resumes
// where it was.

import type { Simulated } from '../../spacetimedb/src/sim';
import { nowMicros } from './clock';
import { fmt } from './format';

export type CurrentFight = NonNullable<Simulated['current']>;

let timer = 0;
const $ = (id: string) => document.getElementById(id)!;

const FLOATS_KEY = 'floatNumbers';
/** Settings › Floating damage numbers. */
export function floatsOn() {
  try {
    return localStorage.getItem(FLOATS_KEY) !== 'off';
  } catch {
    return true;
  }
}
export function setFloats(on: boolean) {
  try {
    localStorage.setItem(FLOATS_KEY, on ? 'on' : 'off');
  } catch {
    // storage blocked: the setting lasts for this page only
  }
}

export function stopFight() {
  window.clearInterval(timer);
  timer = 0;
}

/**
 * Animates `first`, then each following fight from `next(now)` (a fresh projection
 * once the current fight is over; undefined when idle or defeated). `caption` gives
 * each fight's flavour line, shown from its walk until the next fight.
 */
export function startFight(first: CurrentFight, next: (now: bigint) => CurrentFight | undefined, caption?: (c: CurrentFight) => string | undefined) {
  stopFight();
  let cur = first;
  const showCaption = () => {
    const el = $('scene-flavor');
    el.textContent = caption?.(cur) ?? '';
    // Restart the fade-in for the new line.
    el.classList.remove('in');
    void el.offsetWidth;
    el.classList.add('in');
  };
  /** Seconds into `cur` at the previous frame, to spot new events. */
  let lastT = -1;

  const el = (who: string, sel: string) => $(`fighter-${who}`).querySelector<HTMLElement>(sel)!;

  function float(who: 'you' | 'enemy', text: string, cls: string) {
    if (!floatsOn()) return;
    const span = document.createElement('span');
    span.className = `float ${cls}`;
    span.textContent = text;
    span.style.left = `${35 + Math.random() * 30}%`;
    el(who, '.floats').append(span);
    window.setTimeout(() => span.remove(), 900);
  }

  /** Your HP before event `e` of the current fight. */
  const prevHp = (e: CurrentFight['fight']['events'][number]) => {
    const events = cur.fight.events;
    return events[events.indexOf(e) - 1]?.youHp ?? cur.fight.stats.maxHp;
  };

  /** Draws `cur` at `now`, with floating numbers for the events since the last frame. */
  function draw(c: CurrentFight, now: bigint) {
    const { fight, startMicros } = c;
    const { stats: s, enemy } = fight;
    const t = Math.min(fight.end, Math.max(0, Number(now - startMicros) / 1e6));
    const walking = t < fight.walk;
    const over = t >= fight.end;

    let i = 0;
    while (i < fight.events.length && fight.events[i].t <= t) i++;
    const last = fight.events[i - 1];
    // New events since the last frame; after a pause, only the latest few.
    if (lastT >= 0 && t > lastT) {
      for (const e of fight.events.slice(0, i).filter(e => e.t > lastT).slice(-4)) {
        if (e.by === 'you') float('enemy', e.kind === 'crit' ? `${fmt(e.damage)}!` : fmt(e.damage), e.carried ? 'hit carry' : e.kind);
        else if (e.kind === 'dodge') float('you', 'Dodge', 'dodge');
        // Bulwark: a blocked hit; Second Skin: a hit the shield took (HP unchanged shows as "Shield").
        else float('you', `${e.blocked ? 'Block ' : ''}-${fmt(e.damage)}`, e.blocked ? 'block' : e.shield !== undefined && e.youHp === prevHp(e) ? 'shielded' : 'taken');
        if (e.secondWind) float('you', 'Second Wind', 'heal');
        if (e.healed >= 0.5) float('you', `+${fmt(e.healed)}`, 'heal');
      }
      if (over && fight.outcome === 'defeat') float('you', 'Defeated', 'taken');
    }
    lastT = t;

    const youHp = last?.youHp ?? s.maxHp;
    const foeHp = last?.foeHp ?? enemy.hp;
    // Second Skin: the shield left, drawn over the top end of the HP bar.
    const shield = last?.shield ?? fight.matchup.shield;
    const shieldEl = el('you', '.hp-shield');
    const shieldPct = Math.min(100, (shield / s.maxHp) * 100);
    shieldEl.style.width = `${shieldPct}%`;
    shieldEl.style.left = `${Math.max(0, (youHp / s.maxHp) * 100 - shieldPct)}%`;
    const src = s.sources[0];
    const periods = { you: src && fight.matchup.dps > 0 ? 1 / src.attacksPerSec : Infinity, enemy: 1 / enemy.speed };
    for (const [who, hp, max] of [['you', youHp, s.maxHp], ['enemy', foeHp, enemy.hp]] as const) {
      const period = periods[who];
      // Swings land half a period into the fight, then every period (sim.ts).
      const swing = (((t - fight.walk - period / 2) % period) + period) % period;
      el(who, '.hp-fill').style.width = `${(hp / max) * 100}%`;
      el(who, '.hp-text').textContent = `${fmt(hp)} / ${fmt(max)}${who === 'you' && shield >= 0.5 ? ` +${fmt(shield)}` : ''}`;
      el(who, '.swing-fill').style.width = walking || over || !Number.isFinite(period) ? '0%' : `${(swing / period) * 100}%`;
    }
    $('scene-status').textContent =
      over && fight.outcome === 'defeat'
        ? 'Defeated'
        : over && fight.outcome === 'stalemate'
          ? 'Neither side can win'
          : !src
            ? 'No weapon equipped'
            : walking
              ? `Next ${enemy.name} in ${(fight.walk - t).toFixed(1)} s`
              : '';
    $('fighter-enemy').classList.toggle('dead', walking || (over && fight.outcome === 'kill'));
  }

  function step() {
    if (!document.getElementById('scene')) return stopFight(); // view was replaced
    const now = nowMicros();
    draw(cur, now);
    // A kill: on to the next fight, which starts with the walk. A defeat stays on screen.
    const endsAt = cur.startMicros + BigInt(Math.ceil(cur.fight.end * 1e6));
    if (cur.fight.outcome !== 'defeat' && now >= endsAt) {
      const n = next(now);
      if (n && n.startMicros > cur.startMicros) {
        cur = n;
        lastT = -1;
        showCaption();
        draw(cur, now);
      }
    }
  }

  showCaption();
  step();
  timer = window.setInterval(step, 50);
}
