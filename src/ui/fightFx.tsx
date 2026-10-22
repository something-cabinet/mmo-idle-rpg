// Fight effects. The hit flash: a sprite (or a bar, where there's no sprite) blinks and jolts
// when it takes damage (`.hit-a` / `.hit-b`). The heal: a green glow with rising sparks over
// the sprite (`.heal-fx`), and a shimmer over the stretch of HP bar it gave back (`.hp-shimmer`).

/** Seconds a hit flash lasts (the `hit-flash` animation). */
export const HIT_FLASH = 0.35;
/** Seconds a heal's glow, sparks and shimmer last (the `heal-glow` animation). */
export const HEAL_GLOW = 0.7;

/** The latest hit on someone: its index among the fight's events, and when it landed (s). */
export interface LastHit {
  n: number;
  at: number;
}

/** The latest heal on someone: as a hit, with their HP before and after, as fractions of their max. */
export interface LastHeal extends LastHit {
  from: number;
  to: number;
}

/**
 * The class that flashes someone at `t` for their latest hit, or ''. Back-to-back hits
 * alternate between two identical animations, so each one restarts it.
 */
export const hitClass = (hit: LastHit | undefined, t: number) => (hit && t - hit.at < HIT_FLASH ? ` hit-${hit.n % 2 ? 'a' : 'b'}` : '');

/**
 * Each side's latest heal at `t`, from a fight's events (each with every side's HP after it):
 * a rise in HP big enough to show (regen between swings is too small).
 */
export function lastHeals(shown: readonly { t: number; hp: readonly number[] }[], maxHp: readonly number[], t: number): (LastHeal | undefined)[] {
  const heals: (LastHeal | undefined)[] = maxHp.map(() => undefined);
  for (let n = shown.length - 1; n >= 0 && t - shown[n].t < HEAL_GLOW; n--) {
    const before = shown[n - 1]?.hp ?? maxHp;
    shown[n].hp.forEach((h, j) => {
      if (!heals[j] && h - before[j] >= Math.max(1, 0.005 * maxHp[j])) heals[j] = { n, at: shown[n].t, from: before[j] / maxHp[j], to: h / maxHp[j] };
    });
  }
  return heals;
}

/** A heal's glow and sparks, over the portrait it sits in; keyed by the heal, so each one replays. */
export function HealGlow({ heal, t }: { heal: LastHeal | undefined; t: number }) {
  return heal && t - heal.at < HEAL_GLOW ? <span key={heal.n} className="heal-fx" aria-hidden="true"><i /><i /><i /><i /></span> : null;
}

/** A heal's shimmer, over the HP bar it sits in. */
export function HealShimmer({ heal, t }: { heal: LastHeal | undefined; t: number }) {
  return heal && t - heal.at < HEAL_GLOW ? <span key={heal.n} className="hp-shimmer" style={{ left: `${heal.from * 100}%`, width: `${(heal.to - heal.from) * 100}%` }} /> : null;
}

/** Replays the hit flash on `el` (for views drawn outside React, like fight.ts). */
export function flash(el: Element) {
  el.classList.remove('hit-a');
  void (el as HTMLElement).offsetWidth;
  el.classList.add('hit-a');
}

/** Plays a heal on `portrait` and `bar` (HP `from` → `to`, fractions of max), outside React. */
export function healFx(portrait: Element, bar: Element, from: number, to: number) {
  const glow = document.createElement('span');
  glow.className = 'heal-fx';
  glow.append(...Array.from({ length: 4 }, () => document.createElement('i')));
  const shimmer = document.createElement('span');
  shimmer.className = 'hp-shimmer';
  shimmer.style.left = `${Math.max(0, from) * 100}%`;
  shimmer.style.width = `${Math.max(0, Math.min(1, to) - from) * 100}%`;
  portrait.append(glow);
  bar.append(shimmer);
  window.setTimeout(() => {
    glow.remove();
    shimmer.remove();
  }, HEAL_GLOW * 1000);
}
