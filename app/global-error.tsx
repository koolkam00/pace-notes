'use client';

import { useEffect, useRef } from 'react';
import { chunkLoadFailed, reloadAfterChunkError } from '@/lib/chunk-reload';
import { trackFailure } from '@/lib/analytics';

// The site's tokens written out (app/styles/tokens.css): paper, ink, ink-2, the accent and its ink text, the rule.
const button = { display: 'inline-flex', alignItems: 'center', boxSizing: 'border-box', minHeight: 52, padding: '0 24px', borderRadius: 999, font: 'inherit', fontWeight: 600, textDecoration: 'none', cursor: 'pointer' } as const;

// Replaces the whole document when the root layout itself fails, so the site's stylesheets may be missing: the few
// styles it needs are inline, with the site's paper and ink colours.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  const heading = useRef<HTMLHeadingElement>(null);
  // Unless the page is reloading, focus the heading so a screen reader says what happened.
  useEffect(() => {
    // A reload is reported by the page it loads (components/SiteAnalytics.tsx). Otherwise only the kind of failure is
    // reported, never the error's message.
    if (reloadAfterChunkError(error)) return;
    if (chunkLoadFailed(error)) trackFailure('chunk_load'); else trackFailure('render');
    heading.current?.focus();
  }, [error]);
  return (
    <html lang="en">
      <head>
        <title>This page didn&apos;t load properly | Pace Notes</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body style={{ margin: 0, background: '#F5F0E6', color: '#15171C', font: '1.0625rem/1.6 "Inter Variable", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' }}>
        <main style={{ maxWidth: '36rem', margin: '0 auto', padding: '96px 16px 64px' }}>
          <p style={{ margin: 0, fontWeight: 600, fontSize: '.75rem', letterSpacing: '.08em', textTransform: 'uppercase', color: '#66625A' }}>Pace Notes · Loading error</p>
          <h1 ref={heading} tabIndex={-1} style={{ margin: '12px 0', outline: 'none', font: '440 clamp(2.25rem, 8.6vw + .2rem, 4rem)/1 "Fraunces Variable", Georgia, "Times New Roman", serif', letterSpacing: '-.024em' }}>This page didn&apos;t load properly</h1>
          <p style={{ margin: 0, color: '#3C3F47' }}>Something went wrong while loading this page. Reloading usually fixes it.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px 24px', marginTop: '24px' }}>
            <button type="button" onClick={() => window.location.reload()} style={{ ...button, color: '#15171C', background: '#FF5B2E', border: 0 }}>Reload the page</button>
            <a href={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/`} style={{ ...button, padding: 0, color: '#15171C', textDecoration: 'underline', textUnderlineOffset: '.18em' }}>Go to the home page</a>
          </div>
        </main>
      </body>
    </html>
  );
}
