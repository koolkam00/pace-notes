'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { trackAnalytics, trackFailure, trackPage, trackRestoredPage } from '@/lib/analytics';
import { ANALYTICS_CHANGED, downloadDestination } from '@/lib/analytics-policy';
import { chunkLoadFailed } from '@/lib/chunk-reload';

// Where a tool's own controls are: its workspace, and any it keeps outside it, marked data-tool-controls (the pace
// calculator's view switch and pace chart, the course chooser's list). Pressing a button that only moves the page,
// prints or copies the link is not an edit: the copy-link and print bar (.share-bar) and buttons marked data-not-edit.
const TOOL_CONTROLS = '.tool-workspace, [data-tool-controls]';
const NOT_EDITS = '.share-bar, [data-not-edit]';

export default function SiteAnalytics() {
  const pathname = usePathname();
  // Each navigation also stops session replay on the runner-search pages and resumes it after them (lib/analytics.ts).
  useEffect(() => { trackPage(pathname); }, [pathname]);
  // The first change a visitor makes in a tool on each page view: typing, choosing or pressing one of its buttons. Only
  // that it happened is sent, never which field or what was entered. Copying the link and printing are counted as their
  // own actions instead.
  useEffect(() => {
    let edited = false;
    const edit = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (edited || !target?.closest(TOOL_CONTROLS) || target.closest(NOT_EDITS)) return;
      if (event.type === 'click' && !target.closest('button')) return;
      edited = true;
      trackAnalytics('tool_used', { action: 'edit' });
    };
    for (const type of ['input', 'change', 'click']) document.addEventListener(type, edit, true);
    return () => { for (const type of ['input', 'change', 'click']) document.removeEventListener(type, edit, true); };
  }, [pathname]);
  useEffect(() => {
    // An opt-out here or in another tab stops the recorder as well as events.
    const changed = () => trackPage(window.location.pathname);
    const clicked = (event: MouseEvent) => {
      if (event.button !== 0 && event.button !== 1) return;
      const target = event.target instanceof Element ? event.target.closest('a[href]') : null;
      const destination = target && downloadDestination((target as HTMLAnchorElement).href);
      if (destination) trackAnalytics('data_download_clicked', { destination });
    };
    const printed = () => { if (document.querySelector('.tool-workspace, .tool-share')) trackAnalytics('tool_used', { action: 'print' }); };
    // Failures by kind only. An error's message is read only to tell a file that failed to load from other errors.
    const failed = (event: Event) => {
      const target = event.target;
      if (target instanceof HTMLScriptElement || target instanceof HTMLLinkElement) {
        if ((target instanceof HTMLScriptElement ? target.src : target.href).includes('/_next/')) trackFailure('chunk_load');
        return;
      }
      if (target instanceof Element) return; // An image or another resource: not a page failure.
      if (chunkLoadFailed(event as ErrorEvent)) trackFailure('chunk_load'); else trackFailure('js_error');
    };
    const rejected = (event: PromiseRejectionEvent) => { if (chunkLoadFailed(event.reason)) trackFailure('chunk_load'); else trackFailure('unhandled_rejection'); };
    // Back from another site to a page kept in the back/forward cache: a new page view (the SDK sent $pageleave as it left).
    const restored = (event: PageTransitionEvent) => { if (event.persisted) trackRestoredPage(); };
    window.addEventListener(ANALYTICS_CHANGED, changed);
    window.addEventListener('storage', changed);
    window.addEventListener('beforeprint', printed);
    window.addEventListener('error', failed, true);
    window.addEventListener('unhandledrejection', rejected);
    window.addEventListener('pageshow', restored);
    document.addEventListener('click', clicked);
    document.addEventListener('auxclick', clicked);
    return () => {
      window.removeEventListener(ANALYTICS_CHANGED, changed);
      window.removeEventListener('storage', changed);
      window.removeEventListener('beforeprint', printed);
      window.removeEventListener('error', failed, true);
      window.removeEventListener('unhandledrejection', rejected);
      window.removeEventListener('pageshow', restored);
      document.removeEventListener('click', clicked);
      document.removeEventListener('auxclick', clicked);
    };
  }, []);
  return null;
}
