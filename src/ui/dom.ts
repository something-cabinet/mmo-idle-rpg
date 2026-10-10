export const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;

export function setStatus(text: string, ok: boolean) {
  const el = $('status');
  el.textContent = text;
  el.dataset.ok = String(ok);
}

const SCREENS = ['loading', 'create', 'elsewhere', 'game'] as const;
export type Screen = (typeof SCREENS)[number];

export function showScreen(screen: Screen) {
  for (const s of SCREENS) $(`screen-${s}`).hidden = s !== screen;
  // Top-bar game info only makes sense once the character is in the world.
  for (const id of ['top-stats', 'online-chip', 'chat-toggle']) $(id).hidden = screen !== 'game';
}

export function toast(message: string, kind: 'error' | 'info' = 'error') {
  const el = $('toast');
  el.textContent = message;
  el.dataset.kind = kind;
  el.hidden = false;
  window.clearTimeout(Number(el.dataset.timer));
  el.dataset.timer = String(window.setTimeout(() => (el.hidden = true), 3000));
}

/** Runs a reducer call and shows the server's error message if it fails, or `ok` if it succeeds. */
export function call(p: Promise<void>, ok?: string) {
  p.then(() => ok && toast(ok, 'info')).catch((e: unknown) => toast(e instanceof Error ? e.message : String(e)));
}
