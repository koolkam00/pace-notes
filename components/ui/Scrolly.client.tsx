'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { withEm } from './Reading';

/**
 * A step-by-step reveal, one per story, for its signature finding (spec section 3.5). `graphic` is a server-rendered
 * figure.viz with every layer in it; layers carry data-from="n" (and optionally data-to="m") and show while the current
 * step is in that range. The current step is the last whose top has crossed a line 20% above the bottom of the screen
 * (28% from 900 px); the scrolly carries it as data-step, so page CSS can also key a zoom or a label off it. State
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
    const layers = Array.from(el.querySelectorAll<HTMLElement>('[data-from]'));
    const wide = window.matchMedia?.('(min-width: 900px)').matches;
    const inset = wide ? 0.28 : 0.2;
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
      const line = window.innerHeight * (1 - inset);
      let n = 0;
      stepEls.forEach((s, i) => { if (s.getBoundingClientRect().top < line) n = i; });
      apply(n);
    };
    pick();
    const io = new IntersectionObserver(pick, { rootMargin: `0px 0px -${inset * 100}% 0px`, threshold: [0, 1] });
    stepEls.forEach((s) => io.observe(s));
    return () => io.disconnect();
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
