'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { trackAnalytics, trackPage } from '@/lib/analytics';
import { ANALYTICS_CHANGED, downloadDestination } from '@/lib/analytics-policy';

export default function SiteAnalytics() {
  const pathname = usePathname();
  // Each navigation also stops session replay on the runner-search pages and resumes it after them (lib/analytics.ts).
  useEffect(() => { trackPage(pathname); }, [pathname]);
  useEffect(() => {
    // An opt-out here or in another tab stops the recorder as well as events.
    const changed = () => trackPage(window.location.pathname);
    const clicked = (event: MouseEvent) => {
      if (event.button !== 0 && event.button !== 1) return;
      const target = event.target instanceof Element ? event.target.closest('a[href]') : null;
      const destination = target && downloadDestination((target as HTMLAnchorElement).href);
      if (destination) trackAnalytics('data_download_clicked', { destination });
    };
    window.addEventListener(ANALYTICS_CHANGED, changed);
    window.addEventListener('storage', changed);
    document.addEventListener('click', clicked);
    document.addEventListener('auxclick', clicked);
    return () => {
      window.removeEventListener(ANALYTICS_CHANGED, changed);
      window.removeEventListener('storage', changed);
      document.removeEventListener('click', clicked);
      document.removeEventListener('auxclick', clicked);
    };
  }, []);
  return null;
}
