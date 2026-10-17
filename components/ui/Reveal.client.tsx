'use client';
import { useEffect, useRef, type ReactNode } from 'react';

/**
 * A figure arriving (spec section 3.7): once per page view, when 18% of it is visible, it rises 12 px and fades in over
 * --d-reveal; children marked data-stagger (with style --i) follow in an 8 ms stagger. Only a figure found below the
 * fold after the script runs is hidden first, so content is never hidden without JavaScript, above the fold, or under
 * reduced motion or the site's Motion switch.
 */
export default function Reveal({ children, className, as: Tag = 'div' }: { children: ReactNode; className?: string; as?: 'div' | 'section' | 'figure' | 'li' }) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver !== 'function') return;
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || document.documentElement.hasAttribute('data-motion-off');
    if (still || el.getBoundingClientRect().top < window.innerHeight * 0.9) return;
    el.setAttribute('data-reveal', 'hidden');
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { el.setAttribute('data-reveal', 'shown'); io.disconnect(); }
    }, { threshold: 0.18 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <Tag ref={ref as never} className={className}>{children}</Tag>;
}
