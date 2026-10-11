// App state that lives outside React: the connection, its status, a data version
// bumped on every server change, toasts, and view state that survives switching views.
// Components read it through the hooks at the bottom.

import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Identity } from 'spacetimedb';
import type { DbConnection } from './module_bindings';

export function createStore<T extends object>(initial: T) {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(patch: Partial<T>) {
      state = { ...state, ...patch };
      listeners.forEach(l => l());
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
  };
}

export interface AppState {
  conn?: DbConnection;
  me?: Identity;
  /** The subscription is applied: the client cache has the player's data. */
  ready: boolean;
  /** Bumped on every subscribed-row change (and on display settings), so views redraw. */
  version: number;
  status: { text: string; ok: boolean };
  /** Disconnected or failed to connect: offer a reload. */
  offline: boolean;
  /** The server rejected a login: offer a logout from the loading screen. */
  loginRejected: boolean;
}

export const app = createStore<AppState>({
  ready: false,
  version: 0,
  status: { text: 'Starting…', ok: false },
  offline: false,
  loginRejected: false,
});

export const useApp = () => useSyncExternalStore(app.subscribe, app.get);

/** Redraws every view, e.g. after a display setting changed. */
export const bumpVersion = () => app.set({ version: app.get().version + 1 });

// ---------------------------------------------------------------- toasts

const toasts = createStore({ message: '', kind: 'error' as 'error' | 'info', id: 0 });

export function toast(message: string, kind: 'error' | 'info' = 'error') {
  toasts.set({ message, kind, id: toasts.get().id + 1 });
}

export function useToast() {
  const t = useSyncExternalStore(toasts.subscribe, toasts.get);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!t.id) return;
    setShown(t.id);
    const timer = window.setTimeout(() => setShown(0), 3000);
    return () => window.clearTimeout(timer);
  }, [t.id]);
  return shown && shown === t.id ? t : undefined;
}

/** Runs a reducer call and shows the server's error message if it fails, or `ok` if it succeeds. */
export function call(p: Promise<void>, ok?: string) {
  p.then(() => ok && toast(ok, 'info')).catch((e: unknown) => toast(e instanceof Error ? e.message : String(e)));
}

// ---------------------------------------------------------------- sticky view state

const sticky = new Map<string, unknown>();

/** Sets view state from elsewhere (e.g. which item Crafting opens on). */
export const setSticky = (key: string, value: unknown) => void sticky.set(key, value);

/** useState that keeps its value when the view unmounts and comes back. */
export function useSticky<T>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => (sticky.has(key) ? (sticky.get(key) as T) : initial));
  // Another view may have changed it while this one was mounted.
  const current = sticky.has(key) ? (sticky.get(key) as T) : v;
  return [
    current,
    (n: T) => {
      sticky.set(key, n);
      setV(n);
    },
  ];
}

/** Re-renders every `ms` (idle numbers are projected locally). */
export function useTick(ms: number) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setN(x => x + 1), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return n;
}

/** The view named in the URL hash (#bag), or 'combat'. */
export const VIEWS = ['combat', 'zones', 'character', 'equipment', 'bag', 'crafting', 'filter', 'settings'] as const;
export type View = (typeof VIEWS)[number];
const hashView = (): View => {
  const h = location.hash.slice(1) as View;
  return VIEWS.includes(h) ? h : 'combat';
};
export function useView(): View {
  return useSyncExternalStore(l => {
    window.addEventListener('hashchange', l);
    return () => window.removeEventListener('hashchange', l);
  }, hashView);
}
