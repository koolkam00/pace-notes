'use client';
import { useEffect, useRef } from 'react';
import { applyLens } from '@/components/viz/lens-layer';

/**
 * Turns a scrolly's chart with its steps (round numbers): it watches the scrolly's data-step, presses the lens option
 * each step names through the lens's own buttons, and moves the needle to the point each step names (a 'scrub-to'
 * event on the scrubber), so the control and the readout always say what the step's words say. Once the steps are
 * passed the chart is the reader's. Under reduced motion (or the site's Motion switch) the scrolly is a static list
 * that ends on its last step, so the chart is set once to the last step's state (its lens and its point together),
 * never left on the first step's while the list ends on another. `stillAt` moves that point for the static list: the
 * needle opens on the page's own reading (round numbers' 2:59), so the readout agrees with the heading above it.
 * Renders nothing.
 */
export default function ScrollyLens({ lens, needle = {}, stillAt, values }: {
  lens: Record<number, string>; needle?: Record<number, number>; stillAt?: number;
  /** The layer each lens name shows, where the figure draws no control to press ({ 'Against the curve': 'ratio' }). */
  values?: Record<string, string>;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const root = ref.current?.closest<HTMLElement>('.scrolly');
    if (!root) return;
    const at = <T,>(map: Record<number, T>, step: number) => {
      const keys = Object.keys(map).map(Number).filter((k) => k <= step);
      return keys.length ? map[Math.max(...keys)] : undefined;
    };
    let lastLens = '', lastNeedle = -1;
    const end = Math.max(...Object.keys(lens).map(Number), ...Object.keys(needle).map(Number));
    const show = (step: number, at_ = at(needle, step)) => {
      const want = at(lens, step);
      if (want && want !== lastLens) {
        lastLens = want;
        const button = Array.from(root.querySelectorAll<HTMLButtonElement>('.viz-lens button')).find((b) => b.dataset.value === want || b.textContent === want);
        if (button) { if (button.getAttribute('aria-pressed') !== 'true') button.click(); }
        else {
          // No control (the steps own the lens): set the figure's layer by its value ("count", "ratio") directly.
          const figure = root.querySelector<HTMLElement>('.viz');
          if (figure) applyLens(figure, values?.[want] ?? want);
        }
      }
      // The scrubber is the reader's once the steps are passed: until then the steps move the needle, and the drag
      // handle stays hidden, so the beat has one control at a time (round 5).
      root.toggleAttribute('data-free', step >= end);
      const i = at_;
      if (i !== undefined && i !== lastNeedle) {
        lastNeedle = i;
        root.querySelector('.scrub')?.dispatchEvent(new CustomEvent('scrub-to', { detail: i }));
      }
    };
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || document.documentElement.hasAttribute('data-motion-off');
    // A static list ends on its last step: show that step's state, once (a press and a set point, nothing animated).
    if (still || typeof MutationObserver !== 'function') {
      show(end, stillAt ?? at(needle, end));
      return;
    }
    const apply = () => { const step = Number(root.dataset.step); if (Number.isFinite(step)) show(step); };
    const mo = new MutationObserver(apply);
    mo.observe(root, { attributes: true, attributeFilter: ['data-step'] });
    apply();
    return () => mo.disconnect();
  }, [lens, needle, stillAt, values]);
  return <span ref={ref} hidden />;
}
