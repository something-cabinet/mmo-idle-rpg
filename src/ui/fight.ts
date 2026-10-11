// Presentation-only fight animation (combat.md: the client animates, the server's
// expected-value formulas decide rewards). Random rolls here never affect progress;
// the averages match `matchup`.

import type { CombatStats, Matchup } from '../../spacetimedb/src/combat';
import { RESPAWN_SECONDS, type EnemyDef } from '../../spacetimedb/src/data/zones';
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

export function startFight(s: CombatStats, m: Matchup, enemy: EnemyDef) {
  stopFight();
  const src = s.sources[0];
  const crit = Math.min(1, src?.critChance ?? 0);
  // Average hit after mitigation without crits, and a crit's multiplier, so that
  // hits × speed × critMult = dps (effect damage included).
  const hit = src ? m.dps / src.attacksPerSec / src.critMult : 0;
  const critX = crit > 0 && src ? 1 + (src.critMult - 1) / crit : 1;
  const sustain = m.hps + s.regen + s.lifesteal * m.dps; // HP per second
  const respawnTime = m.viable ? 1 / m.killRate - m.timeToKill : RESPAWN_SECONDS;

  const you = { hp: s.maxHp, max: s.maxHp, swing: 0, period: src ? 1 / src.attacksPerSec : Infinity };
  const foe = { hp: enemy.hp, max: enemy.hp, swing: 0, period: 1 / enemy.speed };
  const enemyHit = (enemy.dps / enemy.speed) * (1 - m.playerMitigation);
  let respawn = 0;
  let defeated = false;
  let last = performance.now();

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

  function draw() {
    for (const [who, f] of [['you', you], ['enemy', foe]] as const) {
      el(who, '.hp-fill').style.width = `${(Math.max(0, f.hp) / f.max) * 100}%`;
      el(who, '.hp-text').textContent = `${fmt(Math.max(0, f.hp))} / ${fmt(f.max)}`;
      el(who, '.swing-fill').style.width = respawn > 0 || !Number.isFinite(f.period) ? '0%' : `${(f.swing / f.period) * 100}%`;
    }
    $('scene-status').textContent = defeated
      ? 'Defeated'
      : !src
      ? 'No weapon equipped'
      : respawn > 0
        ? `Next ${enemy.name} in ${respawn.toFixed(1)} s`
        : '';
    $('fighter-enemy').classList.toggle('dead', respawn > 0);
  }

  function step() {
    if (!document.getElementById('scene')) return stopFight(); // view was replaced
    if (defeated) return;
    const now = performance.now();
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;

    if (respawn > 0) {
      respawn -= dt;
      if (respawn <= 0) {
        foe.hp = foe.max;
        you.hp = you.max; // each fight starts at full HP (combat.md)
        foe.swing = you.swing = 0;
      }
      return draw();
    }

    you.hp = Math.min(you.max, you.hp + sustain * dt);
    you.swing += dt;
    if (you.swing >= you.period) {
      you.swing -= you.period;
      const isCrit = Math.random() < crit;
      const dmg = hit * (isCrit ? critX : 1) * (0.9 + Math.random() * 0.2);
      foe.hp -= dmg;
      float('enemy', isCrit ? `${fmt(dmg)}!` : fmt(dmg), isCrit ? 'crit' : 'hit');
    }

    foe.swing += dt;
    if (foe.swing >= foe.period) {
      foe.swing -= foe.period;
      if (Math.random() < m.evasion) float('you', 'Dodge', 'dodge');
      else {
        const dmg = enemyHit * (0.9 + Math.random() * 0.2);
        you.hp -= dmg;
        float('you', `-${fmt(dmg)}`, 'taken');
      }
    }

    if (foe.hp <= 0) respawn = respawnTime;
    else if (you.hp <= 0) {
      float('you', 'Defeated', 'taken');
      // A losing build dies for good (the server then sets us idle); a winning one only had bad luck.
      if (m.viable) respawn = RESPAWN_SECONDS;
      else defeated = true;
    }
    draw();
  }

  draw();
  timer = window.setInterval(step, 50);
}
