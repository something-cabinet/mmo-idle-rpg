// Presentation-only fight animation (combat.md: the client animates, the server's
// expected-value formulas decide rewards). The scene is a pure function of the clock,
// in step with `project`: each cycle is the walk, then a fight that ends exactly when
// the kill is granted, so leaving and reopening the view resumes where it was. HP drops
// in equal steps on each hit, spaced so the last hit lands on the kill (or the defeat).
// Only the floating numbers are random.

import type { CombatStats, Matchup } from '../../spacetimedb/src/combat';
import type { EnemyDef } from '../../spacetimedb/src/data/zones';
import { nowMicros } from './clock';
import { fmt } from './format';

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
 * Animates fighting `enemy` since `sinceMicros` (server clock): the last granted kill,
 * or when the fight started (snapshot `fightSince`). A winning fight repeats every
 * walk + timeToKill; a losing one ends in defeat at timeToDie.
 */
export function startFight(s: CombatStats, m: Matchup, enemy: EnemyDef, sinceMicros: bigint) {
  stopFight();
  const src = s.sources[0];
  const crit = Math.min(1, src?.critChance ?? 0);
  // Average hit after mitigation without crits, and a crit's multiplier, so that
  // hits × speed × critMult = dps (effect damage included).
  const hit = src ? m.dps / src.attacksPerSec / src.critMult : 0;
  const critX = crit > 0 && src ? 1 + (src.critMult - 1) / crit : 1;
  const enemyHit = (enemy.dps / enemy.speed) * (1 - m.playerMitigation);
  /** HP per second you get back: heals, regen and lifesteal (matchup: incoming − netIncoming). */
  const sustain = m.incoming - m.netIncoming;
  /** The swing time stretched a little so a whole number of hits ends at `end`. */
  const evenSteps = (period: number, end: number) =>
    Number.isFinite(period) && Number.isFinite(end) ? end / Math.max(1, Math.round(end / period)) : period;
  const yourPeriod = evenSteps(src ? 1 / src.attacksPerSec : Infinity, m.timeToKill);
  const foePeriod = evenSteps(1 / enemy.speed, m.timeToDie);
  /** Hits landed by `fight` seconds in, × the swing time: when the last one landed. */
  const lastHit = (period: number, fight: number) => (Number.isFinite(period) ? Math.floor(fight / period + 1e-9) * period : 0);
  const walk = m.viable ? s.walkTime : 0;
  const cycle = m.viable ? walk + m.timeToKill : Infinity;
  /** Fight time and swing counts at the previous frame, to spot new swings. */
  let lastFight = -1;

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

  /** Swings that land in (from, to] of fight time, at most 2 (after a pause, skip the backlog). */
  const swings = (period: number, from: number, to: number) =>
    !Number.isFinite(period) || from < 0 ? 0 : Math.min(2, Math.floor(to / period) - Math.floor(from / period));

  function step() {
    if (!document.getElementById('scene')) return stopFight(); // view was replaced
    const elapsed = Math.max(0, Number(nowMicros() - sinceMicros) / 1e6);
    const t = Number.isFinite(cycle) ? elapsed % cycle : elapsed;
    const walking = t < walk;
    const defeated = !m.viable && t >= m.timeToDie;
    // Time into the current fight; frozen at the moment of defeat.
    const fight = walking ? 0 : Math.min(t - walk, defeated ? m.timeToDie : Infinity);

    // Expected HP after the last hit: the enemy reaches 0 exactly at timeToKill, you at timeToDie.
    const foeHp = Number.isFinite(m.timeToKill) ? enemy.hp * Math.max(0, 1 - lastHit(yourPeriod, fight) / m.timeToKill) : enemy.hp;
    // Enemy hits take their full damage and your swings heal (with regen and lifesteal), so the
    // sum is `netIncoming` over time, like the server; overhealing above max HP isn't shown.
    const youHp = defeated ? 0 : Math.min(s.maxHp, Math.max(0, s.maxHp - m.incoming * lastHit(foePeriod, fight) + sustain * lastHit(yourPeriod, fight)));
    const healPerSwing = sustain * yourPeriod;

    if (!walking && !defeated && fight > lastFight) {
      for (let i = swings(yourPeriod, lastFight, fight); i > 0; i--) {
        const isCrit = Math.random() < crit;
        const dmg = hit * (isCrit ? critX : 1) * (0.9 + Math.random() * 0.2);
        float('enemy', isCrit ? `${fmt(dmg)}!` : fmt(dmg), isCrit ? 'crit' : 'hit');
        if (healPerSwing >= 0.5) float('you', `+${fmt(healPerSwing)}`, 'heal');
      }
      for (let i = swings(foePeriod, lastFight, fight); i > 0; i--) {
        if (Math.random() < m.evasion) float('you', 'Dodge', 'dodge');
        else float('you', `-${fmt(enemyHit * (0.9 + Math.random() * 0.2))}`, 'taken');
      }
    }
    // The killing blow lands as the cycle wraps into the walk.
    if (walking && lastFight >= 0) float('enemy', fmt(hit * (0.9 + Math.random() * 0.2)), 'hit');
    if (defeated && lastFight < m.timeToDie && lastFight >= 0) float('you', 'Defeated', 'taken');
    lastFight = walking ? -1 : fight;

    for (const [who, hp, max, period] of [['you', youHp, s.maxHp, yourPeriod], ['enemy', foeHp, enemy.hp, foePeriod]] as const) {
      el(who, '.hp-fill').style.width = `${(hp / max) * 100}%`;
      el(who, '.hp-text').textContent = `${fmt(hp)} / ${fmt(max)}`;
      el(who, '.swing-fill').style.width = walking || defeated || !Number.isFinite(period) ? '0%' : `${((fight % period) / period) * 100}%`;
    }
    $('scene-status').textContent = defeated
      ? 'Defeated'
      : !src
        ? 'No weapon equipped'
        : walking
          ? `Next ${enemy.name} in ${(walk - t).toFixed(1)} s`
          : '';
    $('fighter-enemy').classList.toggle('dead', walking);
  }

  step();
  timer = window.setInterval(step, 50);
}
