import './style.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Identity } from 'spacetimedb';
import type { DbConnection } from './module_bindings';
import * as auth from './auth';
import { guestToken, linkStoredGuest, openConnection, serverLabel, subscribeAll, watchAll } from './net';
import { app, toast } from './store';
import { App } from './ui/App';
import { initTheme } from './ui/theme';

/** Server changes arrive in bursts: bump the data version at most once per frame. */
let bumpQueued = false;
function dataChanged() {
  if (bumpQueued) return;
  bumpQueued = true;
  requestAnimationFrame(() => {
    bumpQueued = false;
    app.set({ version: app.get().version + 1 });
  });
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
  initTheme();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );

  await auth.handleRedirect().catch(e => toast(`Login failed: ${e.message ?? e}`));
  const user = await auth.currentUser();
  app.set({ status: { text: `Connecting to ${serverLabel}…`, ok: false } });

  openConnection(user?.id_token ?? guestToken.load(), {
    onConnect(c, identity, token) {
      if (!user) guestToken.save(token);
      app.set({ conn: c, me: identity, status: { text: 'Connected', ok: true } });
      watchAll(c, dataChanged);
      subscribeAll(c, identity, () => {
        app.set({ ready: true });
        if (user) linkGuest(c, identity);
      });
    },
    onDisconnect(error) {
      app.set({ status: { text: error ? `Disconnected: ${error.message}` : 'Disconnected', ok: false }, offline: true });
    },
    onConnectError(error) {
      console.error('Connection error:', error);
      app.set({ status: { text: `Connection error: ${error.message}`, ok: false }, offline: true, loginRejected: Boolean(user) });
    },
  });
}

void start();
