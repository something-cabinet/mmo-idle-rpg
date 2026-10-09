import './style.css';
import type { Identity } from 'spacetimedb';
import type { DbConnection } from './module_bindings';
import * as auth from './auth';
import { characterOf, guestToken, linkStoredGuest, openConnection, serverLabel, subscribeAll, watchAll } from './net';
import { $, setStatus, showScreen, toast } from './ui/dom';
import { bindCreate } from './ui/create';
import { bindGame, renderGame } from './ui/game';

let conn: DbConnection | null = null;
let me: Identity | null = null;
let ready = false;
let renderQueued = false;

function requestRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    render();
  });
}

function render() {
  if (!conn || !me || !ready) return;
  const account = [...conn.db.myAccount.iter()][0];
  renderAccount(account?.kind.tag === 'Registered', account?.role.tag === 'Admin', account?.email);

  const pres = conn.db.presence.identity.find(me);
  if (!characterOf(conn, me)) {
    showScreen('create');
  } else if (!pres || !pres.connectionId.isEqual(conn.connectionId)) {
    showScreen('elsewhere'); // another tab took over
  } else {
    showScreen('game');
    renderGame(conn, pres);
  }
}

function renderAccount(registered: boolean, admin: boolean, email?: string) {
  $('account-label').textContent = registered
    ? `${email ?? 'Logged in'}${admin ? ' (admin)' : ''}`
    : 'Guest: progress is saved in this browser only';
  $('login-btn').hidden = registered || !auth.loginEnabled;
  $('logout-btn').hidden = !registered;
}

/** After login, carry over the character this browser played as a guest. */
function linkGuest(c: DbConnection, identity: Identity) {
  linkStoredGuest(c, identity, guestName =>
    confirm(
      [
        `This browser has a guest character "${guestName}", but your account already has a character.`,
        'Only one can be kept.',
        '',
        `OK: delete "${guestName}" and keep your account's character.`,
        'Cancel: keep both separate for now (log out to play the guest).',
      ].join('\n')
    )
  )
    .then(result => {
      if (result === 'moved') toast('Guest character moved to your account');
      if (result === 'discarded') toast('Guest character deleted');
    })
    .catch((e: Error) => toast(`Could not link guest: ${e.message}`));
}

async function start() {
  $('login-btn').onclick = () => void auth.login();
  $('logout-btn').onclick = () => void auth.logout();
  $('reconnect-btn').onclick = () => window.location.reload();
  showScreen('loading');

  await auth.handleRedirect().catch(e => toast(`Login failed: ${e.message ?? e}`));
  const user = await auth.currentUser();
  setStatus(`Connecting to ${serverLabel}…`, false);

  openConnection(user?.id_token ?? guestToken.load(), {
    onConnect(c, identity, token) {
      conn = c;
      me = identity;
      if (!user) guestToken.save(token);
      setStatus('Connected', true);

      bindCreate(c);
      bindGame(c);
      watchAll(c, requestRender);
      subscribeAll(c, identity, () => {
        ready = true;
        render();
        // Idle numbers are projected locally; re-render to animate them.
        window.setInterval(requestRender, 250);
        if (user) linkGuest(c, identity);
      });
    },
    onDisconnect(error) {
      setStatus(error ? `Disconnected: ${error.message}` : 'Disconnected', false);
      $('reconnect-btn').hidden = false;
    },
    onConnectError(error) {
      console.error('Connection error:', error);
      setStatus(`Connection error: ${error.message}`, false);
      $('reconnect-btn').hidden = false;
      // Still allow switching login state if the server rejected this login.
      renderAccount(Boolean(user), false, user?.profile.email);
    },
  });
}

void start();
