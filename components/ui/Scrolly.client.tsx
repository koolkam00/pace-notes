'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { withEm } from './withEm';

/**
 * A step-by-step reveal, one per story, for its signature finding (spec section 3.5). `graphic` is a server-rendered
 * figure.viz with every layer in it; layers carry data-from="n" (and optionally data-to="m") and show while the current
 * step is in that range. The current step is the last whose text has crossed a line: on a phone one step (30svh) under
 * the pinned graphic, at most 20% above the bottom of the screen; from 900 px 28% above it, where each step's text sits
 * mid-way down its tall box; the scrolly carries it as data-step, so page CSS can also key a zoom or a label off it. State
 * changes only when a step crosses that line: scroll position never drives animation and scrolling is never taken over.
 *
 * The server markup carries data-step="final", so without the script, and under reduced motion or the site's Motion
 * switch, the graphic shows its end state, unpinned, with the steps as a short list after it.
 */
export type ScrollyStep = { kicker?: string; text: string };

export default function Scrolly({ graphic, steps, className }: { graphic: ReactNode; steps: ScrollyStep[]; className?: string }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || document.documentElement.hasAttribute('data-motion-off');
    if (still || typeof IntersectionObserver !== 'function') { el.classList.add('is-static'); return; }
    const stepEls = Array.from(el.querySelectorAll<HTMLElement>('.scrolly-step'));
    // Each step's text, not its box: the graphic changes as the words that explain it come into view.
    const texts = stepEls.map((s) => s.querySelector<HTMLElement>('p') ?? s);
    const layers = Array.from(el.querySelectorAll<HTMLElement>('[data-from]'));
    const wide = window.matchMedia?.('(min-width: 900px)').matches;
    const inset = wide ? 0.28 : 0.2;
    // On a phone the line sits one step's height (30svh, scrolly.css) under the pinned graphic, so the current step's
    // words ride from there up to the graphic's foot: they are always in view and never more than a step below it.
    const graphicEl = el.querySelector<HTMLElement>('.scrolly-graphic');
    const lineAt = () => {
      if (wide || !graphicEl) return window.innerHeight * (1 - inset);
      const foot = (parseFloat(getComputedStyle(el).getPropertyValue('--reading-h')) || 36) + graphicEl.offsetHeight;
      return Math.min(window.innerHeight * (1 - inset), foot + window.innerHeight * 0.3);
    };
    let current = -1;
    const apply = (n: number) => {
      if (n === current) return;
      current = n;
      el.dataset.step = String(n);
      stepEls.forEach((s, i) => s.classList.toggle('is-current', i === n));
      for (const layer of layers) {
        const from = Number(layer.dataset.from), to = layer.dataset.to === undefined ? Infinity : Number(layer.dataset.to);
        layer.toggleAttribute('data-active', from <= n && n <= to);
      }
    };
    const pick = () => {
      const line = lineAt();
      let n = 0;
      texts.forEach((t, i) => { if (t.getBoundingClientRect().top < line) n = i; });
      apply(n);
    };
    pick();
    // The observer's band ends at the line, so every crossing calls pick (rebuilt if the screen's height changes).
    let io: IntersectionObserver | null = null;
    const watch = () => {
      io?.disconnect();
      const below = Math.max(0, window.innerHeight - lineAt());
      io = new IntersectionObserver(pick, { rootMargin: `0px 0px -${Math.round(below)}px 0px`, threshold: [0, 1] });
      texts.forEach((t) => io!.observe(t));
    };
    watch();
    window.addEventListener('resize', watch, { passive: true });
    return () => { io?.disconnect(); window.removeEventListener('resize', watch); };
  }, []);
  return (
    <div ref={root} className={`scrolly${className ? ` ${className}` : ''}`} data-step="final">
      <div className="scrolly-graphic">{graphic}</div>
      <ol className="scrolly-steps">
        {steps.map((s, i) => (
          <li className="scrolly-step" key={i}>
            {s.kicker ? <span className="t-kicker">{s.kicker}</span> : null}
            <p>{withEm(s.text)}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
