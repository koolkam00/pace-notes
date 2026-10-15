'use client';

import { useEffect, useRef } from 'react';
import { chunkLoadFailed, reloadAfterChunkError } from '@/lib/chunk-reload';
import { trackFailure } from '@/lib/analytics';

const TITLE = "This page didn't load properly | Pace Notes";

// Shown in place of a page that failed while loading or rendering; the site header and footer stay. A full reload is
// the main action because it also fetches any JavaScript file that failed to arrive.
export default function PageError({ error }: { error: Error & { digest?: string } }) {
  const heading = useRef<HTMLHeadingElement>(null);
  // Unless the page is reloading, focus the heading so a screen reader says what happened.
  useEffect(() => {
    // A reload is reported by the page it loads (components/SiteAnalytics.tsx). Otherwise only the kind of failure is
    // reported, never the error's message.
    if (reloadAfterChunkError(error)) return;
    if (chunkLoadFailed(error)) trackFailure('chunk_load'); else trackFailure('render');
    heading.current?.focus();
  }, [error]);
  // The tab, and the announcement after a client-side navigation, would otherwise name the page that failed.
  useEffect(() => {
    const previous = document.title;
    document.title = TITLE;
    return () => { if (document.title === TITLE) document.title = previous; };
  }, []);
  return (
    <section className="page-error">
      <p className="eyebrow">Loading error</p>
      <h1 ref={heading} tabIndex={-1}>This page didn&apos;t load properly</h1>
      <p>Something went wrong while loading this page. Reloading usually fixes it.</p>
      <div className="hero-actions">
        <button type="button" className="button-primary" onClick={() => window.location.reload()}>Reload the page</button>
        <a className="button-secondary" href={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/`}>Go to the home page</a>
      </div>
    </section>
  );
}
