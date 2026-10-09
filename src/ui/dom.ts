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
}

export function toast(message: string) {
  const el = $('toast');
  el.textContent = message;
  el.hidden = false;
  window.clearTimeout(Number(el.dataset.timer));
  el.dataset.timer = String(window.setTimeout(() => (el.hidden = true), 3000));
}

/** Runs a reducer call and shows the server's error message if it fails. */
export function call(p: Promise<void>) {
  p.catch((e: unknown) => toast(e instanceof Error ? e.message : String(e)));
}
