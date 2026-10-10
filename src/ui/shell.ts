// App frame: sidebar routing (#view in the URL), social tabs, chat toggle.

import { $ } from './dom';
import { hydrateIcons } from './icons';
import { bindViews, renderView } from './views';
import { stopFight } from './fight';

const VIEWS = ['fight', 'zones', 'character', 'equipment', 'bag', 'crafting', 'filter', 'settings'];
let current = '';

function route() {
  const view = VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'fight';
  if (view !== 'fight') stopFight();
  current = view;
  document.querySelectorAll<HTMLElement>('.view').forEach(v => (v.hidden = v.dataset.view !== view));
  document.querySelectorAll<HTMLElement>('.sidebar a').forEach(a => a.classList.toggle('active', a.dataset.view === view));
  renderView(view);
  $('content').scrollTop = 0;
}

export function initShell() {
  hydrateIcons();
  window.addEventListener('hashchange', route);
  bindViews();

  // Right column tabs
  document.querySelectorAll<HTMLElement>('.social .tab').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll<HTMLElement>('.social .tab').forEach(t => t.classList.toggle('active', t === tab));
      document.querySelectorAll<HTMLElement>('.social .tab-body').forEach(b => (b.hidden = b.dataset.tabBody !== tab.dataset.tab));
    };
  });

  // On narrow screens chat becomes an overlay toggled from the top bar.
  $('chat-toggle').onclick = () => $('social').classList.toggle('open');
  $('activity').onclick = () => (location.hash = '#fight');

  route();
}

export const currentView = () => current;
