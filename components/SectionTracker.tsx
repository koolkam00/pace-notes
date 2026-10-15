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
 * back/forward cache, whose sections count again). The server and the first render see page view 0.
 */
export default function SectionTracker() {
  const pageView = useSyncExternalStore(onPageView, currentPageView, () => 0);
  useEffect(() => {
    if (!analyticsConfigured() || analyticsDisabled() || typeof IntersectionObserver === 'undefined') return;
    const seen = new Set<string>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const section = (entry.target as HTMLElement).dataset.trackSection ?? '';
        const screen = entry.rootBounds?.height ?? window.innerHeight;
        if (seen.has(section) || !entry.isIntersecting || entry.intersectionRect.height < Math.min(entry.boundingClientRect.height, screen) / 2) continue;
        seen.add(section);
        observer.unobserve(entry.target);
        trackAnalytics('section_viewed', { section: section as Section });
      }
    }, { threshold: THRESHOLDS });
    document.querySelectorAll<HTMLElement>('[data-track-section]').forEach((element) => {
      if (known.has(element.dataset.trackSection ?? '')) observer.observe(element);
    });
    return () => observer.disconnect();
  }, [pageView]);
  return null;
}
