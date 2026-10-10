import type { DbConnection } from '../module_bindings';
import type { Presence } from '../module_bindings/types';
import {
  goldPerSecond,
  project,
  upgradeCost,
  xpPerSecond,
  xpToNextLevel,
} from '../../spacetimedb/src/game';
import { $, call } from './dom';

/** serverTime ≈ clientTime + clockOffset (micros). */
let clockOffset = 0n;
let offsetFrom: bigint | null = null;
const nowMicros = () => BigInt(Date.now()) * 1000n + clockOffset;

/** Elements that only exist while their view is shown. */
const maybe = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T | null;

export function bindGame(conn: DbConnection) {
  // The upgrade button lives in the Fight view, which is re-rendered: delegate.
  $('content').addEventListener('click', e => {
    if ((e.target as HTMLElement).closest('#upgrade-btn')) call(conn.reducers.buyUpgrade({}));
  });
  $<HTMLFormElement>('chat-form').onsubmit = e => {
    e.preventDefault();
    const input = $<HTMLInputElement>('chat-input');
    const text = input.value.trim();
    if (text) call(conn.reducers.sendChat({ text }).then(() => void (input.value = '')));
  };
}

export function renderGame(conn: DbConnection, pres: Presence) {
  // `since` is the server's clock at the moment we entered the world. Use it
  // to correct the local clock, so we never show gold the server doesn't
  // think we have yet (latency only makes this err on the low side).
  if (offsetFrom !== pres.since.microsSinceUnixEpoch) {
    offsetFrom = pres.since.microsSinceUnixEpoch;
    clockOffset = offsetFrom - BigInt(Date.now()) * 1000n;
  }

  const row = conn.db.character.id.find(pres.characterId);
  if (row) {
    const ch = project({ ...row, settledMicros: row.lastSettledAt.microsSinceUnixEpoch }, nowMicros());
    const need = xpToNextLevel(ch.level);
    $('stat-name').textContent = row.name;
    $('stat-level').textContent = String(ch.level);
    $('xp-text').textContent = `${ch.xp.toLocaleString()} / ${need.toLocaleString()}`;
    $('xp-bar').style.width = `${Number((ch.xp * 100n) / need)}%`;
    $('stat-gold').textContent = ch.gold.toLocaleString();

    const power = maybe('stat-power');
    if (power) {
      const cost = upgradeCost(ch.power);
      power.textContent = String(ch.power);
      maybe('stat-rates')!.textContent = `+${goldPerSecond(ch.power)} gold/s · +${xpPerSecond(ch.power)} xp/s`;
      const upgrade = maybe<HTMLButtonElement>('upgrade-btn')!;
      upgrade.textContent = `Upgrade power (${cost.toLocaleString()} gold)`;
      upgrade.disabled = ch.gold < cost;
    }
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
