// Presentation-only fight animation (combat.md: the client animates, the server's
// expected-value formulas decide rewards). Random rolls here never affect progress.

import { $ } from './dom';
import { BAG, PREVIEW_PLAYER, RESPAWN, type Enemy, type Rarity } from './preview-data';
import { DROP_CHANCE, fmt, matchup } from './sim';

const KEEP: Rarity[] = ['rare', 'epic', 'legendary', 'unique'];
let timer = 0;

export function stopFight() {
  window.clearInterval(timer);
  timer = 0;
}

export function startFight(enemy: Enemy) {
  stopFight();
  const p = PREVIEW_PLAYER;
  const m = matchup(p, enemy);
  const you = { hp: p.hp, max: p.hp, swing: 0, period: 1 / p.speed };
  const foe = { hp: enemy.hp, max: enemy.hp, swing: 0, period: 1 / enemy.speed };
  const enemyHit = (enemy.dps / enemy.speed) * (1 - m.playerMit);
  let respawn = 0;
  let last = performance.now();
  const lootLog: string[] = [];

  const el = (who: string, sel: string) => $(`fighter-${who}`).querySelector<HTMLElement>(sel)!;
  const floatsOn = () => localStorage.getItem('floatNumbers') !== 'off';

  function float(who: 'you' | 'enemy', text: string, cls: string) {
    if (!floatsOn()) return;
    const layer = el(who, '.floats');
    const span = document.createElement('span');
    span.className = `float ${cls}`;
    span.textContent = text;
    span.style.left = `${35 + Math.random() * 30}%`;
    layer.append(span);
    window.setTimeout(() => span.remove(), 900);
  }

  function draw() {
    for (const [who, f] of [['you', you], ['enemy', foe]] as const) {
      el(who, '.hp-fill').style.width = `${(Math.max(0, f.hp) / f.max) * 100}%`;
      el(who, '.hp-text').textContent = `${fmt(Math.max(0, f.hp))} / ${fmt(f.max)}`;
      el(who, '.swing-fill').style.width = respawn > 0 ? '0%' : `${(f.swing / f.period) * 100}%`;
    }
    const status = $('scene-status');
    status.textContent = respawn > 0 ? `Next ${enemy.name} in ${respawn.toFixed(1)} s` : '';
    $('fighter-enemy').classList.toggle('dead', respawn > 0);
  }

  function drop() {
    // Real per-kill chances (zones.md), so drops are rare, as they will be in game.
    const roll = Math.random();
    let acc = 0;
    for (const [rarity, chance] of Object.entries(DROP_CHANCE) as [Rarity, number][]) {
      acc += chance;
      if (roll >= acc) continue;
      const pool = enemy.drops[0].startsWith('Any') ? BAG.map(b => b.name) : enemy.drops;
      const name = pool[Math.floor(Math.random() * pool.length)];
      const kept = KEEP.includes(rarity);
      lootLog.unshift(
        `<li class="${kept ? '' : 'dim'}"><span class="c-${rarity}">${rarity[0].toUpperCase() + rarity.slice(1)} ${name}</span><span class="muted">${kept ? 'kept' : 'salvaged'}</span></li>`
      );
      lootLog.length = Math.min(lootLog.length, 30);
      const log = document.getElementById('loot-log');
      if (log) log.innerHTML = lootLog.join('');
      return;
    }
  }

  function step() {
    if (!document.getElementById('scene')) return stopFight(); // view was replaced
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

    you.swing += dt;
    if (you.swing >= you.period) {
      you.swing -= you.period;
      const crit = Math.random() < Math.min(1, p.crit);
      const dmg = p.hit * (crit ? p.critDmg : 1) * (1 - m.enemyMit) * (0.9 + Math.random() * 0.2);
      foe.hp -= dmg;
      float('enemy', crit ? `${fmt(dmg)}!` : fmt(dmg), crit ? 'crit' : 'hit');
    }

    foe.swing += dt;
    if (foe.swing >= foe.period) {
      foe.swing -= foe.period;
      if (Math.random() < p.evasion) float('you', 'Dodge', 'dodge');
      else {
        const dmg = enemyHit * (0.9 + Math.random() * 0.2);
        you.hp -= dmg;
        float('you', `-${fmt(dmg)}`, 'taken');
      }
    }

    if (foe.hp <= 0) {
      respawn = RESPAWN;
      drop();
    } else if (you.hp <= 0) {
      respawn = RESPAWN; // a losing build: show the death, then retry
      float('you', 'Defeated', 'taken');
    }
    draw();
  }

  draw();
  timer = window.setInterval(step, 50);
}
