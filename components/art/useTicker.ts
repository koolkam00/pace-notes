'use client';

import { RefObject, useEffect, useRef, useState } from 'react';

const MOTION_KEY = 'pace-notes-motion';
const motionListeners = new Set<() => void>();
let siteMotionOff: boolean | null = null;

function readSiteMotionOff(): boolean {
  if (siteMotionOff === null) {
    try { siteMotionOff = window.localStorage.getItem(MOTION_KEY) === 'off'; } catch { siteMotionOff = false; }
  }
  return siteMotionOff;
}

/** The site-wide "pause animations" switch. It persists per browser and pauses every animated figure. */
export function setSiteMotionOff(off: boolean) {
  siteMotionOff = off;
  try { window.localStorage.setItem(MOTION_KEY, off ? 'off' : 'on'); } catch {}
  document.documentElement.toggleAttribute('data-motion-off', off);
  motionListeners.forEach((listener) => listener());
}

export function useSiteMotionOff(): boolean {
  const [off, setOff] = useState(false);
  useEffect(() => {
    const update = () => setOff(readSiteMotionOff());
    update();
    document.documentElement.toggleAttribute('data-motion-off', readSiteMotionOff());
    motionListeners.add(update);
    return () => { motionListeners.delete(update); };
  }, []);
  return off;
}

/** True when the visitor asks for reduced motion, in the system or with the site's pause switch. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  const siteOff = useSiteMotionOff();
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);
  return reduced || siteOff;
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
 * `active`. Time pauses (rather than jumping) when the loop stops, and stops
 * for good after `limit` seconds (decorative loops settle instead of running forever).
 */
export function useTicker(active: boolean, fps = 60, limit = Infinity): number {
  const [time, setTime] = useState(0);
  const elapsed = useRef(0);
  useEffect(() => {
    if (!active || elapsed.current >= limit) return;
    let frame = 0;
    let last = performance.now();
    let acc = 0;
    const minStep = 1 / fps;
    const loop = (now: number) => {
      if (elapsed.current >= limit) return;
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
  }, [active, fps, limit]);
  return time;
}
