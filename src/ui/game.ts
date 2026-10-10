import type { DbConnection } from '../module_bindings';
import type { Character, Presence } from '../module_bindings/types';
import { combatStats, matchup, type Gear } from '../../spacetimedb/src/combat';
import { ENEMIES_BY_ID } from '../../spacetimedb/src/data/zones';
import { project, xpToNext } from '../../spacetimedb/src/game';
import { $, call } from './dom';
import { fmt, secs } from './sim';

/** serverTime ≈ clientTime + clockOffset (micros). */
let clockOffset = 0n;
let offsetFrom: bigint | null = null;
const nowMicros = () => BigInt(Date.now()) * 1000n + clockOffset;

/** Elements that only exist while their view is shown. */
const maybe = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T | null;

/** The active loadout's items in slot order, like the server's `gearOf`. */
function activeGear(conn: DbConnection, ch: Character): Gear {
  const lo = [...conn.db.myLoadouts.iter()].find(l => l.index === ch.activeLoadout);
  const items = new Map([...conn.db.myItems.iter()].map(i => [i.id, i]));
  return (lo?.slots ?? []).map(id => items.get(id));
}

export function bindGame(conn: DbConnection) {
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
    const gear = activeGear(conn, row);
    const enemy = ENEMIES_BY_ID.get(row.targetEnemyId)?.enemy;
    const ch = project({ ...row, settledMicros: row.lastSettledAt.microsSinceUnixEpoch }, { gear, enemy }, nowMicros());
    const need = xpToNext(ch.level);
    $('stat-name').textContent = row.name;
    $('stat-level').textContent = String(ch.level);
    $('xp-text').textContent = `${ch.xp.toLocaleString()} / ${need.toLocaleString()}`;
    $('xp-bar').style.width = `${Number((ch.xp * 100n) / need)}%`;
    $('stat-gold').textContent = ch.gold.toLocaleString();
    $('stat-essence').textContent = row.essence.toLocaleString();

    const target = maybe('live-target');
    if (target) {
      const m = enemy && matchup(combatStats(ch.level, gear), enemy);
      target.textContent = enemy ? `${enemy.name} (Lv ${enemy.level})` : 'None';
      maybe('live-times')!.textContent = m ? `${secs(m.timeToKill)} / ${secs(m.timeToDie)}` : '—';
      const perHour = (m?.killRate ?? 0) * 3600;
      maybe('live-rates')!.textContent = !m
        ? ''
        : m.viable
          ? `${fmt(perHour)} kills/h · +${fmt(perHour * m.xpPerKill)} xp/h · +${fmt(perHour * m.goldPerKill)} gold/h`
          : m.dps === 0
            ? 'No weapon equipped: no progress'
            : 'Losing this fight: no progress';
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
