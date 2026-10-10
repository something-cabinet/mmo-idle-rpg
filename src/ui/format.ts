// Number and text formatting shared by the views.

/** Settings › Numbers: 'short' = 1.2k, 'full' = 1,234. */
export type NumberFormat = 'short' | 'full';
const FORMAT_KEY = 'numberFormat';
let numberFormat: NumberFormat = (() => {
  try {
    return localStorage.getItem(FORMAT_KEY) === 'full' ? 'full' : 'short';
  } catch {
    return 'short';
  }
})();

export const getNumberFormat = () => numberFormat;
export function setNumberFormat(f: NumberFormat) {
  numberFormat = f;
  try {
    localStorage.setItem(FORMAT_KEY, f);
  } catch {
    // storage blocked: the setting lasts for this page only
  }
}

export function fmt(n: number): string {
  if (!Number.isFinite(n)) return '∞';
  const a = Math.abs(n);
  if (numberFormat === 'full' && a >= 100) return Math.round(n).toLocaleString();
  if (a >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e4) return `${(n / 1e3).toFixed(1)}k`;
  if (a >= 100) return Math.round(n).toLocaleString();
  if (a >= 10) return n.toFixed(0);
  return n.toFixed(1);
}

/** Big integers (gold, Essence, costs): full digits below 100k, then short. */
export const fmtBig = (n: bigint) => (numberFormat === 'full' || n < 100_000n ? n.toLocaleString() : fmt(Number(n)));

export const pct = (x: number, digits = 0) => `${(x * 100).toFixed(digits)}%`;
export const secs = (s: number) => (Number.isFinite(s) ? `${s.toFixed(1)} s` : '∞');

/** "7h 42m", "3m 10s". */
export function duration(micros: bigint): string {
  const s = Number(micros / 1_000_000n);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : m ? `${m}m ${s % 60}s` : `${s}s`;
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** For player-written text (loadout names) put into HTML strings. */
export const esc = (s: string) => s.replace(/[&<>"']/g, c => ESCAPES[c]);
