// Touch screens never show `title` tooltips, so a tap on a titled element shows its text in a bubble instead.
// Works for every `title` in the app (stat names, stat rows, drop lists); mouse users keep the native tooltip.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/** True on devices whose main input can't hover (phones, tablets): used for "Tap" vs "Hover" in hint text. */
export const touchFirst = window.matchMedia('(hover: none)').matches;

/** Controls have their own tap action, so their titles stay as labels. */
const INTERACTIVE = 'button, a, input, select, textarea, label, summary';

export function TapTip() {
  const [tip, setTip] = useState<{ el: Element; text: string }>();
  const bubble = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let touch = false;
    const onDown = (e: PointerEvent) => {
      touch = e.pointerType !== 'mouse';
    };
    const onClick = (e: MouseEvent) => {
      if (!touch) return;
      const target = e.target as Element;
      const el = target.closest('[title]');
      const text = el?.getAttribute('title');
      if (!el || !text || el.closest(INTERACTIVE)) return setTip(undefined);
      setTip(t => (t?.el === el ? undefined : { el, text }));
    };
    const hide = () => setTip(undefined);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && hide();
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('scroll', hide, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('hashchange', hide);
    window.addEventListener('resize', hide);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('scroll', hide, true);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('hashchange', hide);
      window.removeEventListener('resize', hide);
    };
  }, []);

  // Above the element, or below it when there's no room; kept 8px inside the screen.
  useLayoutEffect(() => {
    const b = bubble.current;
    if (!tip || !b) return;
    const r = tip.el.getBoundingClientRect();
    const w = b.offsetWidth;
    const h = b.offsetHeight;
    const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
    const top = r.top - h - 6 >= 8 ? r.top - h - 6 : r.bottom + 6;
    b.style.left = `${left}px`;
    b.style.top = `${top}px`;
  }, [tip]);

  // Gone from the page (view re-rendered): drop the bubble too.
  if (tip && !tip.el.isConnected) return null;
  return tip ? (
    <div ref={bubble} className="tap-tip" role="tooltip">
      {tip.text}
    </div>
  ) : null;
}
