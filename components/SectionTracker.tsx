'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { analyticsConfigured, analyticsDisabled, currentPageView, onPageView, trackAnalytics } from '@/lib/analytics';
import { TRACKED_SECTIONS, type AnalyticsEvents } from '@/lib/analytics-policy';

type Section = AnalyticsEvents['section_viewed']['section'];
const known = new Set<string>(TRACKED_SECTIONS);
// Callbacks at every 5% of a section on screen, and finer near the start, so a section several screens tall is still
// noticed once half a screen of it shows.
const THRESHOLDS = [0, 0.01, 0.02, 0.03, ...Array.from({ length: 20 }, (_, i) => (i + 1) / 20)];

/**
 * section_viewed: the first time on each page view that a marked section (data-track-section="<id>", one of
 * TRACKED_SECTIONS) is really seen, meaning at least half of it, or half the screen's height of it if it is taller, is
 * on screen at once. Only the section's id is sent. Mounted once in the root layout; it starts again, looking for
 * sections afresh, with each page view (currentPageView: a client-side navigation, or a page restored from the
 * back/forward cache, whose sections count again). A marked section that joins the page later in the page view (the
 * race report on /runners, shown when asked for) is watched from when it appears, but only while the address is still
 * the page view's own: the next page's sections, put in place before its view starts, are never counted for this one.
 * The server and the first render see page view 0.
 */
export default function SectionTracker() {
  const pageView = useSyncExternalStore(onPageView, currentPageView, () => 0);
  useEffect(() => {
    if (!analyticsConfigured() || analyticsDisabled() || typeof IntersectionObserver === 'undefined') return;
    const seen = new Set<string>();
    // The page this page view is on. In a client-side navigation the router puts the next page's sections in place and
    // changes the address before that page's view starts (and this effect is cleaned up), so once the address has moved
    // on these observers stop: the next page view counts its own sections, under its own $pageview_id.
    const path = window.location.pathname;
    const left = () => {
      if (window.location.pathname === path) return false;
      observer.disconnect();
      added?.disconnect();
      return true;
    };
    const observer = new IntersectionObserver((entries) => {
      if (left()) return;
      for (const entry of entries) {
        const section = (entry.target as HTMLElement).dataset.trackSection ?? '';
        const screen = entry.rootBounds?.height ?? window.innerHeight;
        if (seen.has(section) || !entry.isIntersecting || entry.intersectionRect.height < Math.min(entry.boundingClientRect.height, screen) / 2) continue;
        seen.add(section);
        observer.unobserve(entry.target);
        trackAnalytics('section_viewed', { section: section as Section });
      }
    }, { threshold: THRESHOLDS });
    const watch = (element: HTMLElement) => {
      const section = element.dataset.trackSection ?? '';
      if (known.has(section) && !seen.has(section)) observer.observe(element);
    };
    document.querySelectorAll<HTMLElement>('[data-track-section]').forEach(watch);
    const added = typeof MutationObserver === 'undefined' ? null : new MutationObserver((records) => {
      if (left()) return;
      for (const record of records) {
        for (const node of Array.from(record.addedNodes)) {
          if (!(node instanceof HTMLElement)) continue;
          if (node.matches('[data-track-section]')) watch(node);
          node.querySelectorAll<HTMLElement>('[data-track-section]').forEach(watch);
        }
      }
    });
    added?.observe(document.body, { childList: true, subtree: true });
    return () => { observer.disconnect(); added?.disconnect(); };
  }, [pageView]);
  return null;
}
