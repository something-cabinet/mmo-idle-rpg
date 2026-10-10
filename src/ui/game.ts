import type { DbConnection } from '../module_bindings';
import type { Presence } from '../module_bindings/types';
import { xpToNext } from '../../spacetimedb/src/game';
import { showAwayReport } from './away';
import { $, call } from './dom';
import { fmtBig } from './format';
import { currentView } from './shell';
import { snapshot } from './snapshot';
import { renderView, setSnapshot, updateActivity } from './views';

/** serverTime ≈ clientTime + clockOffset (micros). */
let clockOffset = 0n;
let offsetFrom: bigint | null = null;
const nowMicros = () => BigInt(Date.now()) * 1000n + clockOffset;

/** Data version the current view was drawn with. */
let drawnVersion = -1;
let drawnView = '';

export function bindGame(conn: DbConnection) {
  $<HTMLFormElement>('chat-form').onsubmit = e => {
    e.preventDefault();
    const input = $<HTMLInputElement>('chat-input');
    const text = input.value.trim();
    if (text) call(conn.reducers.sendChat({ text }).then(() => void (input.value = '')));
  };
}

/**
 * Draws the game screen. `version` counts server data changes: the top bar is
 * redrawn on every call (idle numbers tick), the current view only when the data
 * or the view changed.
 */
export function renderGame(conn: DbConnection, pres: Presence, version: number) {
  // `since` is the server's clock at the moment we entered the world. Use it
  // to correct the local clock, so we never show gold the server doesn't
  // think we have yet (latency only makes this err on the low side).
  if (offsetFrom !== pres.since.microsSinceUnixEpoch) {
    offsetFrom = pres.since.microsSinceUnixEpoch;
    clockOffset = offsetFrom - BigInt(Date.now()) * 1000n;
  }

  const row = conn.db.character.id.find(pres.characterId);
  if (row) {
    const s = snapshot(conn, row, nowMicros());
    setSnapshot(s);
    const need = xpToNext(s.level);
    $('stat-name').textContent = row.name;
    $('stat-level').textContent = String(s.level);
    $('xp-text').textContent = `${s.xp.toLocaleString()} / ${need.toLocaleString()}`;
    $('xp-bar').style.width = `${Number((s.xp * 100n) / need)}%`;
    $('stat-gold').textContent = fmtBig(s.gold);
    $('stat-essence').textContent = fmtBig(row.essence);
    updateActivity(s);

    const view = currentView();
    if (version !== drawnVersion || view !== drawnView) {
      drawnVersion = version;
      drawnView = view;
      renderView(view);
    }
    showAwayReport(s, pres);
  }

  const online = [...conn.db.presence.iter()];
  $('online-count').textContent = String(online.length);
  $('online-count-2').textContent = String(online.length);
  $('online-list').replaceChildren(
    ...online.map(p => {
      const li = document.createElement('li');
      li.textContent = p.characterName;
      if (p.characterId === pres.characterId) li.classList.add('me');
      return li;
    })
  );

  const log = $('chat-log');
  const messages = [...conn.db.chatMessage.iter()].sort((a, b) => (a.id < b.id ? -1 : 1)).slice(-50);
  const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 8;
  log.replaceChildren(
    ...messages.map(m => {
      const li = document.createElement('li');
      const who = document.createElement('strong');
      who.textContent = m.characterName;
      li.append(who, ` ${m.text}`);
      return li;
    })
  );
  if (atBottom) log.scrollTop = log.scrollHeight;
}
