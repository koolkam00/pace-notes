'use client';

import { RefObject, useEffect, useRef, useState } from 'react';

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);
  return reduced;
}

/** True while the element is at least partly on screen. */
export function useInView<T extends Element>(ref: RefObject<T>, rootMargin = '120px'): boolean {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { rootMargin });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, rootMargin]);
  return inView;
}

/**
 * Elapsed animation seconds, advanced on requestAnimationFrame only while
 * `active`. Time pauses (rather than jumping) when the loop stops.
 */
export function useTicker(active: boolean, fps = 60): number {
  const [time, setTime] = useState(0);
  const elapsed = useRef(0);
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    let last = performance.now();
    let acc = 0;
    const minStep = 1 / fps;
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      acc += dt;
      if (acc >= minStep) {
        elapsed.current += acc;
        acc = 0;
        setTime(elapsed.current);
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [active, fps]);
  return time;
}
