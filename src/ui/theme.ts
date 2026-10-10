import { $ } from './dom';
import { hydrateIcons } from './icons';

export type ThemePref = 'system' | 'dark' | 'light';
const KEY = 'theme';
const media = window.matchMedia('(prefers-color-scheme: light)');

export function themePref(): ThemePref {
  try {
    const t = localStorage.getItem(KEY);
    if (t === 'dark' || t === 'light') return t;
  } catch {
    // storage blocked: follow the system
  }
  return 'system';
}

function effective(pref: ThemePref): 'dark' | 'light' {
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
  const theme = effective(themePref());
  document.documentElement.dataset.theme = theme;
  const btn = $('theme-btn');
  btn.querySelector('i')!.dataset.icon = theme === 'dark' ? 'sun' : 'moon';
  btn.title = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
  hydrateIcons(btn);
  document.dispatchEvent(new CustomEvent('themechange'));
}

export function initTheme() {
  $('theme-btn').onclick = () => setTheme(effective(themePref()) === 'dark' ? 'light' : 'dark');
  media.addEventListener('change', () => themePref() === 'system' && apply());
  apply();
}
