// "While you were away" (ui.md): shown once per login, from the login settle's log row.

import type { Presence } from '../module_bindings/types';
import { ENEMIES_BY_ID } from '../../spacetimedb/src/data/zones';
import { MAX_OFFLINE_MICROS } from '../../spacetimedb/src/game';
import { RARITIES } from '../../spacetimedb/src/loot';
import { $ } from './dom';
import { duration, fmtBig } from './format';
import { itemName, rarityCls } from './items';
import type { Snapshot } from './snapshot';

/** Shorter absences (a reload) don't get a report. */
const MIN_AWAY_MICROS = 60_000_000n;
let shownFor: bigint | undefined;

export function showAwayReport(s: Snapshot, pres: Presence) {
  if (shownFor === pres.since.microsSinceUnixEpoch) return;
  // The login settle runs in the same transaction that inserts our presence row.
  const log = s.logs.find(l => l.offline && l.at.microsSinceUnixEpoch === pres.since.microsSinceUnixEpoch);
  if (!log) return;
  shownFor = pres.since.microsSinceUnixEpoch;
  if (log.elapsedMicros < MIN_AWAY_MICROS) return;

  const enemy = ENEMIES_BY_ID.get(log.enemyId)?.enemy;
  const kept = log.keptItemIds.map(id => s.items.get(id)).filter(it => it !== undefined);
  const salvaged = RARITIES.map((r, i) => [r, log.salvaged[i] ?? 0] as const).filter(([, n]) => n > 0);
  const lines = [
    log.capped ? `<p class="muted">Offline progress is capped at ${duration(MAX_OFFLINE_MICROS)}.</p>` : '',
    !enemy
      ? '<p>No target: pick an enemy on the Zones screen.</p>'
      : log.kills > 0
        ? `<p><strong>${enemy.name}</strong> × ${log.kills.toLocaleString()} kills</p>`
        : log.viable
          ? `<p>0 kills of ${enemy.name}.</p>`
          : `<p class="c-bad">0 kills: your build loses to ${enemy.name}.</p>`,
    log.xp > 0n ? `<p>+${fmtBig(log.xp)} XP${log.levelTo > log.levelFrom ? ` · Level ${log.levelFrom} → ${log.levelTo}` : ''}</p>` : '',
    log.gold > 0n || log.essence > 0n
      ? `<p>${[log.gold > 0n ? `<span class="c-gold">+${fmtBig(log.gold)} gold</span>` : '', log.essence > 0n ? `<span class="c-essence">+${fmtBig(log.essence)} Essence</span>` : ''].filter(Boolean).join(' · ')}</p>`
      : '',
    kept.length
      ? `<p>Items kept (${kept.length}): ${kept.map(it => `<span class="c-${rarityCls(it.rarity.tag)}">${it.rarity.tag} ${itemName(it)}</span>`).join(', ')}</p>`
      : '',
    salvaged.length ? `<p class="muted">Salvaged: ${salvaged.map(([r, n]) => `${n} ${r}`).join(', ')}</p>` : '',
    log.overflow ? `<p class="c-bad">⚠ Bag full: ${log.overflow} kept items were salvaged.</p>` : '',
  ];
  $('away-body').innerHTML = `
    <div class="card-head"><h2>While you were away (${duration(log.elapsedMicros)})</h2></div>
    ${lines.join('')}
    <div class="row">${kept.length ? '<a class="btn small ghost" href="#bag" data-away-close>View in bag</a>' : '<span></span>'}<button class="btn primary small" data-away-close>OK</button></div>`;
  $('away').hidden = false;
}

export function bindAwayReport() {
  $('away').addEventListener('click', ev => {
    const t = ev.target as HTMLElement;
    if (t === $('away') || t.closest('[data-away-close]')) $('away').hidden = true;
  });
}
