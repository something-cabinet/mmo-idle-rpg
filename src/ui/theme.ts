import { useSyncExternalStore } from 'react';

export type ThemePref = 'system' | 'dark' | 'light';
const KEY = 'theme';
const media = window.matchMedia('(prefers-color-scheme: light)');
const listeners = new Set<() => void>();

export function themePref(): ThemePref {
  try {
    const t = localStorage.getItem(KEY);
    if (t === 'dark' || t === 'light') return t;
  } catch {
    // storage blocked: follow the system
  }
  return 'system';
}

export function effectiveTheme(pref = themePref()): 'dark' | 'light' {
  return pref === 'system' ? (media.matches ? 'light' : 'dark') : pref;
}

export function setTheme(pref: ThemePref) {
  try {
    if (pref === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    // ignore
  }
  apply();
}

function apply() {
  document.documentElement.dataset.theme = effectiveTheme();
  listeners.forEach(l => l());
}

export function initTheme() {
  media.addEventListener('change', () => themePref() === 'system' && apply());
  apply();
}

let cached = { pref: themePref(), theme: effectiveTheme() };
function current() {
  const pref = themePref();
  const theme = effectiveTheme(pref);
  if (pref !== cached.pref || theme !== cached.theme) cached = { pref, theme };
  return cached;
}

/** The saved preference and the theme in effect; re-renders when either changes. */
export function useTheme() {
  return useSyncExternalStore(l => {
    listeners.add(l);
    return () => void listeners.delete(l);
  }, current);
}
