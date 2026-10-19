// The Friends tab of the social panel: add a character by name, see who is online,
// and inspect a friend's gear any time (reducers/friends.ts, reducers/inspect.ts).

import { useState } from 'react';
import type { DbConnection } from '../module_bindings';
import { call } from '../store';
import { Icon } from './Icon';
import { PlayerName } from './PlayerName';
import type { InspectTab } from './Inspect';

export function FriendsTab({ conn, onInspect }: { conn: DbConnection; onInspect: (characterId: bigint, tab?: InspectTab) => void }) {
  const [name, setName] = useState('');
  const online = new Set([...conn.db.presence.iter()].map(p => p.characterId));
  const chars = new Map([...conn.db.myFriendCharacters.iter()].map(c => [c.id, c]));
  // Online first, then by name.
  const friends = [...conn.db.myFriends.iter()]
    .flatMap(f => chars.get(f.friendId) ?? [])
    .sort((a, b) => Number(online.has(b.id)) - Number(online.has(a.id)) || a.name.localeCompare(b.name));

  return (
    <div className="tab-body">
      <form
        id="friend-form"
        onSubmit={e => {
          e.preventDefault();
          const n = name.trim();
          if (n) call(conn.reducers.addFriend({ name: n }).then(() => setName('')), `Added ${n}`);
        }}
      >
        <input placeholder="Character name" maxLength={16} autoComplete="off" value={name} onChange={e => setName(e.target.value)} />
        <button className="btn small" type="submit" disabled={!name.trim()}>
          <Icon name="user" />
          Add
        </button>
      </form>
      {friends.length === 0 ? (
        <p className="muted hint friend-empty">No friends yet. Add someone by their character name.</p>
      ) : (
        <ul id="friend-list">
          {friends.map(c => (
            <li key={String(c.id)} className={online.has(c.id) ? 'online' : ''} title={online.has(c.id) ? 'Online' : 'Offline'}>
              <button className="online-name" title="Inspect gear and stats" onClick={() => onInspect(c.id)}>
                <PlayerName conn={conn} id={c.id} name={c.name} />
              </button>
              <span className="muted">Lv {c.level}</span>
              <button className="btn icon ghost friend-duel" title={`Duel ${c.name} (just for fun)`} onClick={() => onInspect(c.id, 'duel')}>
                <Icon name="swords" />
              </button>
              <button
                className="btn icon ghost friend-remove"
                title="Remove friend"
                onClick={() => confirm(`Remove ${c.name} from your friends?`) && call(conn.reducers.removeFriend({ friendId: c.id }))}
              >
                <Icon name="x" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
