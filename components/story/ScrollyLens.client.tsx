'use client';
import { useEffect, useRef } from 'react';

/**
 * Turns a scrolly's chart with its steps (round numbers): it watches the scrolly's data-step, presses the lens option
 * each step names through the lens's own buttons, and moves the needle to the point each step names (a 'scrub-to'
 * event on the scrubber), so the control and the readout always say what the step's words say. Once the steps are
 * passed the chart is the reader's. Under reduced motion (or the site's Motion switch) the scrolly is a static list
 * that ends on its last step, so the chart is set once to the last step's state (its lens and its point together),
 * never left on the first step's while the list ends on another. Renders nothing.
 */
export default function ScrollyLens({ lens, needle = {} }: { lens: Record<number, string>; needle?: Record<number, number> }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const root = ref.current?.closest<HTMLElement>('.scrolly');
    if (!root) return;
    const at = <T,>(map: Record<number, T>, step: number) => {
      const keys = Object.keys(map).map(Number).filter((k) => k <= step);
      return keys.length ? map[Math.max(...keys)] : undefined;
    };
    let lastLens = '', lastNeedle = -1;
    const show = (step: number) => {
      const want = at(lens, step);
      if (want && want !== lastLens) {
        lastLens = want;
        const button = Array.from(root.querySelectorAll<HTMLButtonElement>('.viz-lens button')).find((b) => b.dataset.value === want || b.textContent === want);
        if (button && button.getAttribute('aria-pressed') !== 'true') button.click();
      }
      const i = at(needle, step);
      if (i !== undefined && i !== lastNeedle) {
        lastNeedle = i;
        root.querySelector('.scrub')?.dispatchEvent(new CustomEvent('scrub-to', { detail: i }));
      }
    };
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || document.documentElement.hasAttribute('data-motion-off');
    // A static list ends on its last step: show that step's state, once (a press and a set point, nothing animated).
    if (still || typeof MutationObserver !== 'function') { show(Math.max(...Object.keys(lens).map(Number), ...Object.keys(needle).map(Number))); return; }
    const apply = () => { const step = Number(root.dataset.step); if (Number.isFinite(step)) show(step); };
    const mo = new MutationObserver(apply);
    mo.observe(root, { attributes: true, attributeFilter: ['data-step'] });
    apply();
    return () => mo.disconnect();
  }, [lens, needle]);
  return <span ref={ref} hidden />;
}
