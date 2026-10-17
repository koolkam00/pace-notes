'use client';
import { useEffect, useRef } from 'react';

/**
 * Turns a scrolly's chart lens with its steps (round numbers, "Against the curve"): it watches the scrolly's data-step
 * and presses the lens option each step names, through the lens's own buttons, so the control the reader sees always
 * says what the chart shows. Once the steps are passed the lens is the reader's. Under reduced motion the scrolly stays
 * static (data-step "final") and nothing is pressed. Renders nothing.
 */
export default function ScrollyLens({ lens }: { lens: Record<number, string> }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const root = ref.current?.closest<HTMLElement>('.scrolly');
    if (!root || typeof MutationObserver !== 'function') return;
    let last = '';
    const apply = () => {
      const step = Number(root.dataset.step);
      if (!Number.isFinite(step)) return;
      const keys = Object.keys(lens).map(Number).filter((k) => k <= step);
      const want = keys.length ? lens[Math.max(...keys)] : '';
      if (!want || want === last) return;
      last = want;
      const button = Array.from(root.querySelectorAll<HTMLButtonElement>('.viz-lens button')).find((b) => b.dataset.value === want || b.textContent === want);
      if (button && button.getAttribute('aria-pressed') !== 'true') button.click();
    };
    const mo = new MutationObserver(apply);
    mo.observe(root, { attributes: true, attributeFilter: ['data-step'] });
    apply();
    return () => mo.disconnect();
  }, [lens]);
  return <span ref={ref} hidden />;
}
