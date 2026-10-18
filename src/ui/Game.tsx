// The game screen: top-bar stats, sidebar navigation, the current view, chat and online list.

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { DbConnection } from '../module_bindings';
import type { Presence } from '../module_bindings/types';
import { xpToNext } from '../../spacetimedb/src/game';
import { call, toast, useTick, useView, type View } from '../store';
import { AwayReport } from './AwayReport';
import { elixirText } from './lifeSkills';
import { nowMicros, syncClock } from './clock';
import { DefeatReport } from './DefeatReport';
import { revealedAreas, rumouredAreas } from './discovery';
import { TopBar } from './TopBar';
import { fmt, fmtBig } from './format';
import { Icon } from './Icon';
import { FriendsTab } from './Friends';
import { InspectPopup, type InspectTab } from './Inspect';
import { AccountControls, Modal, perHour } from './shared';
import { snapshot, type Snapshot } from './snapshot';
import { BagView } from './views/BagView';
import { CharacterView } from './views/CharacterView';
import { CombatView } from './views/CombatView';
import { CraftingView } from './views/CraftingView';
import { EquipmentView } from './views/EquipmentView';
import { FilterView } from './views/FilterView';
import { ItemIndexView } from './views/ItemIndexView';
import { RaidsView } from './views/RaidsView';
import { AbyssView } from './views/AbyssView';
import { SettingsView } from './views/SettingsView';
import { SkillView, activityText } from './views/SkillView';
import { ProductionView } from './views/ProductionView';
import { SkillsView } from './views/SkillsView';
import { SKILLS } from '../../spacetimedb/src/data/skills';
import { ZonesView } from './views/ZonesView';

const NAV: [string, [View, string, string][]][] = [
  ['Adventure', [['combat', 'swords', 'Combat'], ['zones', 'map', 'Zones'], ['raids', 'crown', 'Raids'], ['deep', 'moon', 'Moonwell Deep'], ['skills', 'pickaxe', 'Skills']]],
  ['Character', [['character', 'user', 'Character'], ['equipment', 'shield', 'Equipment'], ['bag', 'bag', 'Bag']]],
  ['Workshop', [['crafting', 'hammer', 'Crafting'], ['filter', 'filter', 'Loot filter']]],
  ['Codex', [['index', 'book', 'Item index']]],
  ['System', [['settings', 'settings', 'Settings']]],
];

function TopStats({ s }: { s: Snapshot }) {
  const need = xpToNext(s.level);
  const m = s.fight;
  const sk = s.skilling;
  const e = s.elixir;
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
      <span className="chip stat" title="Dust"><Icon name="gem" className="c-dust" /><strong>{fmtBig(s.row.dust)}</strong></span>
      <span className="divider" />
      {sk ? (
        <button className="chip activity" title="Current activity" onClick={() => (location.hash = `#${sk.slug}`)}>
          <span className="dot ok" />
          <span>{activityText(s).replace(': ', ' › ')}</span>
          <span className="activity-rate">
            {s.production ? `${s.production.projected.countLeft} left` : `Lv ${s.skills.get(sk.id)?.level}`}
          </span>
        </button>
      ) : (
        <button className="chip activity" title="Current activity" onClick={() => (location.hash = '#combat')}>
          <span className={`dot ${!m ? '' : m.viable ? 'ok' : 'bad'}`} />
          <span>{s.target ? `${s.target.zone.name} › ${s.target.enemy.name}` : 'Idle'}</span>
          <span className="activity-rate">{m?.viable ? `${fmt(perHour(m))} kills/h` : ''}</span>
        </button>
      )}
      {e && (
        <button className="chip activity" title={`${e.supply.name} T${e.supply.tier}: ${elixirText(e.supply)}. Kills left · in stock.`} onClick={() => (location.hash = '#alchemy')}>
          <Icon name="flask" className="c-material" />
          <span>{e.supply.greater ? 'Greater ' : ''}{e.supply.elixir.name} {e.killsLeft}</span>
          <span className="activity-rate">×{s.supplies.get(e.supply.id) ?? 0}</span>
        </button>
      )}
    </div>
  );
}

/** Views that get their own tab on the mobile bottom bar; the rest go under "More". */
const TAB_BAR: View[] = ['combat', 'zones', 'skills', 'equipment', 'bag'];
const NAV_LINKS = NAV.flatMap(([, links]) => links);
/** The nav entry a view belongs to: a skill's page is under Skills. */
const navOf = (view: View): View => (SKILLS.some(sk => sk.slug === view) ? 'skills' : view);

/** The sidebar's footer, and the bottom of the phone "More" sheet. */
function AccountFoot({ conn }: { conn: DbConnection }) {
  return (
    <div className="sidebar-foot">
      <AccountControls conn={conn} />
      <span className="muted version">v0.0.1 · prototype</span>
    </div>
  );
}

function NavLinks({ view, exclude = [] }: { view: View; exclude?: View[] }) {
  return NAV.map(([group, links]) => {
    const shown = links.filter(([v]) => !exclude.includes(v));
    if (!shown.length) return null;
    return (
      <div key={group} style={{ display: 'contents' }}>
        <div className="nav-group">{group}</div>
        {shown.map(([v, icon, label]) => (
          <a key={v} href={`#${v}`} className={v === navOf(view) ? 'active' : ''} title={label}>
            <Icon name={icon} />
            <span className="nav-label">{label}</span>
          </a>
        ))}
      </div>
    );
  });
}

function Sidebar({ conn, view }: { conn: DbConnection; view: View }) {
  return (
    <nav className="sidebar">
      <NavLinks view={view} />
      <AccountFoot conn={conn} />
    </nav>
  );
}

/** Mobile navigation (the sidebar is hidden on narrow screens): main views as tabs, the rest in a sheet. */
function BottomNav({ conn, view, onNavigate }: { conn: DbConnection; view: View; onNavigate: () => void }) {
  const [more, setMore] = useState(false);
  return (
    <>
      <nav className="bottom-nav" onClick={onNavigate}>
        {TAB_BAR.map(v => {
          const [, icon, label] = NAV_LINKS.find(([x]) => x === v)!;
          return (
            <a key={v} href={`#${v}`} className={v === navOf(view) ? 'active' : ''}>
              <Icon name={icon} />
              <span>{label}</span>
            </a>
          );
        })}
        <button className={!TAB_BAR.includes(navOf(view)) ? 'active' : ''} onClick={() => setMore(true)}>
          <Icon name="menu" />
          <span>More</span>
        </button>
      </nav>
      {more && (
        <Modal className="nav-sheet" onClose={() => setMore(false)}>
          <nav className="sidebar" onClick={e => (e.target as HTMLElement).closest('a') && setMore(false)}>
            <NavLinks view={view} exclude={TAB_BAR} />
            <AccountFoot conn={conn} />
          </nav>
        </Modal>
      )}
    </>
  );
}

const SOCIAL_COLLAPSED_KEY = 'social_collapsed';

/** Phone layout (matches the 700px breakpoint in style.css): chat is an overlay instead of a column. */
const narrow = window.matchMedia('(max-width: 700px)');
const useNarrow = () =>
  useSyncExternalStore(l => {
    narrow.addEventListener('change', l);
    return () => narrow.removeEventListener('change', l);
  }, () => narrow.matches);

function Social({ conn, pres, mobile, onCollapse, onInspect }: { conn: DbConnection; pres: Presence; mobile: boolean; onCollapse: (collapsed: boolean) => void; onInspect: (characterId: bigint, tab?: InspectTab) => void }) {
  const [tab, setTab] = useState<'chat' | 'online' | 'friends'>('chat');
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
    <aside className="social">
      <div className="social-rail">
        <button className="btn icon ghost" title="Show chat and online list" onClick={() => onCollapse(false)}>
          <Icon name="message" />
        </button>
      </div>
      <div className="tabs">
        <button className={`tab${tab === 'chat' ? ' active' : ''}`} onClick={() => setTab('chat')}><Icon name="message" />Chat</button>
        <button className={`tab${tab === 'online' ? ' active' : ''}`} onClick={() => setTab('online')}>
          <Icon name="users" />Online <span className="count">{online.length}</span>
        </button>
        <button className={`tab${tab === 'friends' ? ' active' : ''}`} onClick={() => setTab('friends')}><Icon name="heart" />Friends</button>
        <button className="btn icon ghost social-collapse" title={mobile ? 'Close' : 'Collapse'} onClick={() => onCollapse(true)}>
          {mobile ? <Icon name="x" /> : '»'}
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
      ) : tab === 'friends' ? (
        <FriendsTab conn={conn} onInspect={onInspect} />
      ) : (
        <div className="tab-body">
          <ul id="online-list">
            {online.map(p => (
              <li key={String(p.characterId)} className={p.characterId === pres.characterId ? 'me' : ''}>
                {p.characterId === pres.characterId ? (
                  p.characterName
                ) : (
                  <button className="online-name" title="Inspect gear and stats" onClick={() => onInspect(p.characterId)}>
                    {p.characterName}
                  </button>
                )}
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
    case 'raids': return <RaidsView s={s} />;
    case 'deep': return <AbyssView s={s} />;
    case 'skills': return <SkillsView s={s} />;
    case 'character': return <CharacterView s={s} />;
    case 'equipment': return <EquipmentView s={s} />;
    case 'bag': return <BagView s={s} />;
    case 'crafting': return <CraftingView s={s} />;
    case 'filter': return <FilterView s={s} />;
    case 'index': return <ItemIndexView s={s} />;
    case 'settings': return <SettingsView s={s} />;
    default: {
      const skill = SKILLS.find(sk => sk.slug === view);
      if (skill?.kind === 'Gathering') return <SkillView key={skill.id} s={s} skill={skill} />;
      if (skill?.kind === 'Production') return <ProductionView key={skill.id} s={s} skill={skill} />;
      return null;
    }
  }
}

export function Game({ conn, pres, version }: { conn: DbConnection; pres: Presence; version: number }) {
  useTick(250);
  const view = useView();
  const [socialCollapsed, setSocialCollapsed] = useState(() => {
    try {
      const saved = localStorage.getItem(SOCIAL_COLLAPSED_KEY);
      if (saved !== null) return saved === '1';
    } catch {
      // Storage blocked: fall back to the default.
    }
    return window.innerWidth < 900;
  });
  const collapseSocial = (collapsed: boolean) => {
    setSocialCollapsed(collapsed);
    try {
      localStorage.setItem(SOCIAL_COLLAPSED_KEY, collapsed ? '1' : '0');
    } catch {
      // Not persisted; fine.
    }
  };
  const mobile = useNarrow();
  // Phone layout only: the chat overlay is open. Not persisted, so a reload doesn't cover the game with chat.
  const [chatOpen, setChatOpen] = useState(false);
  const chatVisible = mobile ? chatOpen : !socialCollapsed;
  // Unread = messages newer than the last one shown; history from before this session counts as read.
  let latestChat = 0n;
  for (const m of conn.db.chatMessage.iter()) if (m.id > latestChat) latestChat = m.id;
  const [seenChat, setSeenChat] = useState(latestChat);
  useEffect(() => {
    if (chatVisible) setSeenChat(latestChat);
  }, [chatVisible, latestChat]);
  let unread = 0;
  if (!chatVisible) for (const m of conn.db.chatMessage.iter()) if (m.id > seenChat) unread++;
  const [inspecting, setInspecting] = useState<{ id: bigint; tab?: InspectTab }>();
  const content = useRef<HTMLElement>(null);
  syncClock(pres);
  const row = conn.db.character.id.find(pres.characterId);
  // Views redraw when the data or the view changes; the top bar on every tick (idle numbers).
  const viewSnap = useMemo(() => row && snapshot(conn, row, nowMicros()), [conn, row, version, view]);
  const live = row && snapshot(conn, row, nowMicros());
  // Our projection shows a defeat or a boss's first kill: have the server record it now, not on its next timer.
  const settleKey = live && (live.defeated || live.firstBossKill) ? live.row.lastSettledAt.microsSinceUnixEpoch : undefined;
  useEffect(() => {
    if (settleKey !== undefined) call(conn.reducers.settleNow({}));
  }, [conn, settleKey]);
  useEffect(() => {
    if (content.current) content.current.scrollTop = 0;
  }, [view]);
  // Areas found and secrets rumoured: say so as soon as the projection gets there.
  const revealed = live ? revealedAreas(live) : [];
  const rumoured = live ? rumouredAreas(live) : [];
  const mapKey = [...revealed.map(a => `${a.id}`), ...rumoured.map(a => `r${a.id}`)].join(',');
  const mapBefore = useRef('');
  useEffect(() => {
    const before = mapBefore.current.split(',');
    const first = !mapBefore.current;
    mapBefore.current = mapKey;
    // Nothing to compare against on the first load.
    if (first) return;
    const found = revealed.find(a => !before.includes(`${a.id}`));
    const rumour = rumoured.find(a => !before.includes(`r${a.id}`));
    if (found) toast(found.secret ? `Secret found: ${found.name}!` : `New area found: ${found.name}`, 'info');
    else if (rumour?.secret) toast(rumour.secret.rumour, 'info');
  }, [mapKey]); // eslint-disable-line react-hooks/exhaustive-deps -- the lists change with the key

  if (!row || !viewSnap || !live) return <TopBar />;
  const online = conn.db.presence.count();
  return (
    <>
      <TopBar
        stats={<TopStats s={live} />}
        right={
          <>
            <span className="chip online-chip" title="Players online"><Icon name="users" /><strong>{String(online)}</strong></span>
            <button className={`btn icon ghost chat-toggle${chatOpen ? ' active' : ''}`} title="Chat and online list" onClick={() => setChatOpen(o => !o)}>
              <Icon name="message" />
              {unread > 0 && <span className="unread">{unread > 9 ? '9+' : unread}</span>}
            </button>
          </>
        }
      />
      <div className={`screen shell${socialCollapsed ? ' social-collapsed' : ''}${chatOpen ? ' chat-open' : ''}`}>
        <Sidebar conn={conn} view={view} />
        <main className="content" ref={content}>
          <section className="view" key={view}>
            <CurrentView view={view} s={viewSnap} />
          </section>
        </main>
        <Social
          conn={conn}
          pres={pres}
          mobile={mobile}
          onCollapse={collapsed => (mobile ? setChatOpen(!collapsed) : collapseSocial(collapsed))}
          onInspect={(id, tab) => setInspecting({ id, tab })}
        />
      </div>
      <BottomNav conn={conn} view={view} onNavigate={() => setChatOpen(false)} />
      <AwayReport s={viewSnap} pres={pres} />
      <DefeatReport s={viewSnap} pres={pres} />
      {inspecting !== undefined && (
        <InspectPopup
          key={`${inspecting.id}:${inspecting.tab ?? 'gear'}`}
          conn={conn}
          characterId={inspecting.id}
          version={version}
          me={{ id: live.row.id, name: live.row.name, level: live.level, stats: live.stats }}
          tab={inspecting.tab}
          onClose={() => setInspecting(undefined)}
        />
      )}
    </>
  );
}
