// Top-level screens: loading, character creation, "playing elsewhere", the game.

import { useState, type ReactNode } from 'react';
import * as auth from '../auth';
import { characterOf } from '../net';
import { STARTER_WEAPONS, base, weaponValues } from '../../spacetimedb/src/data/bases';
import { validateCharacterName } from '../../spacetimedb/src/game';
import { call, landingChoice, toast, useApp, useToast } from '../store';
import { Game } from './Game';
import { TopBar } from './TopBar';

function Toast() {
  const t = useToast();
  return t ? <div id="toast" data-kind={t.kind}>{t.message}</div> : null;
}

function Landing() {
  return (
    <section className="screen center">
      <div className="card narrow">
        <h2>Welcome</h2>
        <p className="muted">Log in to keep your character on any device, or play as a guest in this browser only.</p>
        <div className="stack">
          <button className="btn primary" onClick={() => void auth.login()}>Log in</button>
          <button className="btn ghost" onClick={() => landingChoice.guest()}>Play as guest</button>
        </div>
        <p className="muted">A guest character lives in this browser's storage. Clearing it loses the character.</p>
      </div>
    </section>
  );
}

function Loading() {
  const { loginRejected } = useApp();
  return (
    <>
      <TopBar />
      <section className="screen center">
        <div className="stack">
          <p className="muted">Loading…</p>
          {/* Still allow switching login state if the server rejected this login. */}
          {loginRejected && <button className="btn small ghost" onClick={() => void auth.logout()}>Log out</button>}
        </div>
      </section>
    </>
  );
}

function CreateCharacter() {
  const { conn } = useApp();
  const [name, setName] = useState('');
  const [weapon, setWeapon] = useState<number>(STARTER_WEAPONS[0]);
  return (
    <>
      <TopBar />
      <section className="screen center">
        <div className="card narrow">
          <h2>Create your character</h2>
          <p className="muted">One character per account. Choose a name carefully.</p>
          <form
            className="stack"
            onSubmit={e => {
              e.preventDefault();
              const n = name.trim();
              const invalid = validateCharacterName(n);
              if (invalid) return toast(invalid);
              call(conn!.reducers.createCharacter({ name: n, starterWeapon: weapon }));
            }}
          >
            <input placeholder="Name (3-16 letters, digits, _)" maxLength={16} value={name} onChange={e => setName(e.target.value)} />
            <fieldset className="affix-pick">
              <legend className="muted">Starter weapon (you also get a Ratskin Vest and Boots)</legend>
              {STARTER_WEAPONS.map(id => {
                const b = base(id);
                const w = weaponValues(b.weapon!, 1);
                return (
                  <label className="radio" key={id}>
                    <input type="radio" name="starter-weapon" checked={weapon === id} onChange={() => setWeapon(id)} />
                    <span>{b.name(1)}</span>
                    <span className="muted">
                      {[`${w.damageType} ${w.hit} × ${w.speed}/s`, w.heal ? `heals ${w.heal}` : '', w.twoHanded ? '2H' : '1H'].filter(Boolean).join(' · ')}
                    </span>
                  </label>
                );
              })}
            </fieldset>
            <button className="btn primary" type="submit">Create</button>
          </form>
        </div>
      </section>
    </>
  );
}

function Elsewhere() {
  const { conn } = useApp();
  return (
    <>
      <TopBar />
      <section className="screen center">
        <div className="card narrow">
          <h2>Playing in another tab</h2>
          <p className="muted">Your character is active in another tab or device.</p>
          <button className="btn primary" onClick={() => call(conn!.reducers.playHere({}))}>Play here instead</button>
        </div>
      </section>
    </>
  );
}

export function App() {
  const { conn, me, ready, version, landing } = useApp();
  let screen: ReactNode;
  if (landing) screen = <Landing />;
  else if (!conn || !me || !ready) screen = <Loading />;
  else if (!characterOf(conn, me)) screen = <CreateCharacter />;
  else {
    const pres = conn.db.presence.identity.find(me);
    // Another tab took over when our connection no longer holds the presence row.
    screen = pres && pres.connectionId.isEqual(conn.connectionId) ? <Game conn={conn} pres={pres} version={version} /> : <Elsewhere />;
  }
  return (
    <>
      {screen}
      <Toast />
    </>
  );
}
