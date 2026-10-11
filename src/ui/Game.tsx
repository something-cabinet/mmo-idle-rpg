// The game screen: top-bar stats, sidebar navigation, the current view, chat and online list.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { DbConnection } from '../module_bindings';
import type { Presence } from '../module_bindings/types';
import * as auth from '../auth';
import { xpToNext } from '../../spacetimedb/src/game';
import { call, useTick, useView, type View } from '../store';
import { AwayReport } from './AwayReport';
import { nowMicros, syncClock } from './clock';
import { TopBar } from './TopBar';
import { fmt, fmtBig } from './format';
import { Icon } from './Icon';
import { perHour } from './shared';
import { snapshot, type Snapshot } from './snapshot';
import { BagView } from './views/BagView';
import { CharacterView } from './views/CharacterView';
import { CombatView } from './views/CombatView';
import { CraftingView } from './views/CraftingView';
import { EquipmentView } from './views/EquipmentView';
import { FilterView } from './views/FilterView';
import { SettingsView } from './views/SettingsView';
import { ZonesView } from './views/ZonesView';

const NAV: [string, [View, string, string][]][] = [
  ['Adventure', [['combat', 'swords', 'Combat'], ['zones', 'map', 'Zones']]],
  ['Character', [['character', 'user', 'Character'], ['equipment', 'shield', 'Equipment'], ['bag', 'bag', 'Bag']]],
  ['Workshop', [['crafting', 'hammer', 'Crafting'], ['filter', 'filter', 'Loot filter']]],
  ['System', [['settings', 'settings', 'Settings']]],
];

function TopStats({ s }: { s: Snapshot }) {
  const need = xpToNext(s.level);
  const m = s.fight;
  return (
    <div className="top-stats">
      <div className="top-char">
        <span className="top-name">{s.row.name}</span>
        <span className="chip">Lv <strong>{s.level}</strong></span>
        <div className="xp" title="Experience">
          <div className="bar"><div id="xp-bar" style={{ width: `${Number((s.xp * 100n) / need)}%` }} /></div>
          <span className="xp-text">{s.xp.toLocaleString()} / {need.toLocaleString()}</span>
        </div>
      </div>
      <span className="divider" />
      <span className="chip stat" title="Gold"><Icon name="coins" className="c-gold" /><strong>{fmtBig(s.gold)}</strong></span>
      <span className="chip stat" title="Essence"><Icon name="gem" className="c-essence" /><strong>{fmtBig(s.row.essence)}</strong></span>
      <span className="divider" />
      <button className="chip activity" title="Current activity" onClick={() => (location.hash = '#combat')}>
        <span className={`dot ${m?.viable ? 'ok' : 'bad'}`} />
        <span>{s.target ? `${s.target.zone.name} › ${s.target.enemy.name}` : 'No target'}</span>
        <span className="activity-rate">{m?.viable ? `${fmt(perHour(m))} kills/h` : ''}</span>
      </button>
    </div>
  );
}

function Sidebar({ conn, view }: { conn: DbConnection; view: View }) {
  const account = [...conn.db.myAccount.iter()][0];
  const registered = account?.kind.tag === 'Registered';
  const admin = account?.role.tag === 'Admin';
  return (
    <nav className="sidebar">
      {NAV.map(([group, links]) => (
        <div key={group} style={{ display: 'contents' }}>
          <div className="nav-group">{group}</div>
          {links.map(([v, icon, label]) => (
            <a key={v} href={`#${v}`} className={v === view ? 'active' : ''}>
              <Icon name={icon} />
              {label}
            </a>
          ))}
        </div>
      ))}
      <div className="sidebar-foot">
        <span className="muted">{registered ? `${account?.email ?? 'Logged in'}${admin ? ' (admin)' : ''}` : 'Guest: progress is saved in this browser only'}</span>
        {!registered && auth.loginEnabled && <button className="btn small primary" onClick={() => void auth.login()}>Log in to save progress</button>}
        {registered && <button className="btn small ghost" onClick={() => void auth.logout()}>Log out</button>}
        <span className="muted version">v0.0.1 · prototype</span>
      </div>
    </nav>
  );
}

function Social({ conn, pres, open }: { conn: DbConnection; pres: Presence; open: boolean }) {
  const [tab, setTab] = useState<'chat' | 'online'>('chat');
  const [text, setText] = useState('');
  const log = useRef<HTMLUListElement>(null);
  const atBottom = useRef(true);
  const online = [...conn.db.presence.iter()];
  const messages = [...conn.db.chatMessage.iter()].sort((a, b) => (a.id < b.id ? -1 : 1)).slice(-50);
  const lastId = messages.at(-1)?.id;
  useLayoutEffect(() => {
    if (atBottom.current && log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [lastId, tab]);

  return (
    <aside className={`social${open ? ' open' : ''}`}>
      <div className="tabs">
        <button className={`tab${tab === 'chat' ? ' active' : ''}`} onClick={() => setTab('chat')}><Icon name="message" />Chat</button>
        <button className={`tab${tab === 'online' ? ' active' : ''}`} onClick={() => setTab('online')}>
          <Icon name="users" />Online <span className="count">{online.length}</span>
        </button>
      </div>
      {tab === 'chat' ? (
        <div className="tab-body">
          <ul
            id="chat-log"
            ref={log}
            onScroll={e => {
              const el = e.currentTarget;
              atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 8;
            }}
          >
            {messages.map(m => (
              <li key={String(m.id)}>
                <strong>{m.characterName}</strong> {m.text}
              </li>
            ))}
          </ul>
          <form
            id="chat-form"
            onSubmit={e => {
              e.preventDefault();
              const t = text.trim();
              if (t) call(conn.reducers.sendChat({ text: t }).then(() => setText('')));
            }}
          >
            <input placeholder="Say something…" maxLength={200} autoComplete="off" value={text} onChange={e => setText(e.target.value)} />
          </form>
        </div>
      ) : (
        <div className="tab-body">
          <ul id="online-list">
            {online.map(p => (
              <li key={String(p.characterId)} className={p.characterId === pres.characterId ? 'me' : ''}>
                {p.characterName}
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}

function CurrentView({ view, s }: { view: View; s: Snapshot }) {
  switch (view) {
    case 'combat': return <CombatView s={s} />;
    case 'zones': return <ZonesView s={s} />;
    case 'character': return <CharacterView s={s} />;
    case 'equipment': return <EquipmentView s={s} />;
    case 'bag': return <BagView s={s} />;
    case 'crafting': return <CraftingView s={s} />;
    case 'filter': return <FilterView s={s} />;
    case 'settings': return <SettingsView />;
  }
}

export function Game({ conn, pres, version }: { conn: DbConnection; pres: Presence; version: number }) {
  useTick(250);
  const view = useView();
  const [socialOpen, setSocialOpen] = useState(false);
  const content = useRef<HTMLElement>(null);
  syncClock(pres);
  const row = conn.db.character.id.find(pres.characterId);
  // Views redraw when the data or the view changes; the top bar on every tick (idle numbers).
  const viewSnap = useMemo(() => row && snapshot(conn, row, nowMicros()), [conn, row, version, view]);
  const live = row && snapshot(conn, row, nowMicros());
  useEffect(() => {
    if (content.current) content.current.scrollTop = 0;
  }, [view]);

  if (!row || !viewSnap || !live) return <TopBar />;
  const online = conn.db.presence.count();
  return (
    <>
      <TopBar
        stats={<TopStats s={live} />}
        right={
          <>
            <span className="chip" title="Players online"><Icon name="users" /><strong>{String(online)}</strong></span>
            <button id="chat-toggle" className="btn icon ghost" title="Chat" onClick={() => setSocialOpen(!socialOpen)}>
              <Icon name="message" />
            </button>
          </>
        }
      />
      <div className="screen shell">
        <Sidebar conn={conn} view={view} />
        <main className="content" ref={content}>
          <section className="view" key={view}>
            <CurrentView view={view} s={viewSnap} />
          </section>
        </main>
        <Social conn={conn} pres={pres} open={socialOpen} />
      </div>
      <AwayReport s={viewSnap} pres={pres} />
    </>
  );
}
