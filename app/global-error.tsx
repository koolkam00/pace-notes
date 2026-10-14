'use client';

import { useEffect, useRef } from 'react';
import { reloadAfterChunkError } from '@/lib/chunk-reload';

const button = { display: 'inline-flex', alignItems: 'center', boxSizing: 'border-box', minHeight: 48, padding: '.75rem 1.3rem', borderRadius: 999, font: 'inherit', fontWeight: 650, textDecoration: 'none', cursor: 'pointer' } as const;

// Replaces the whole document when the root layout itself fails, so the site's stylesheets may be missing: the few
// styles it needs are inline, with the site's paper and ink colours.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  const heading = useRef<HTMLHeadingElement>(null);
  // Unless the page is reloading, focus the heading so a screen reader says what happened.
  useEffect(() => { if (!reloadAfterChunkError(error)) heading.current?.focus(); }, [error]);
  return (
    <html lang="en">
      <head>
        <title>This page didn&apos;t load properly | Pace Notes</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body style={{ margin: 0, background: '#F5F0E6', color: '#15171C', font: '1.0625rem/1.6 "Inter Variable", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' }}>
        <main style={{ maxWidth: '36rem', margin: '0 auto', padding: '5rem 16px 3rem', textAlign: 'center' }}>
          <p style={{ margin: 0, fontWeight: 700 }}>Pace Notes</p>
          <h1 ref={heading} tabIndex={-1} style={{ margin: '.8rem 0', outline: 'none', font: '600 2.2rem/1.15 "Fraunces Variable", Georgia, "Times New Roman", serif' }}>This page didn&apos;t load properly</h1>
          <p style={{ margin: 0, color: '#3C3F47' }}>Something went wrong while loading this page. Reloading usually fixes it.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: '.8rem', marginTop: '2rem' }}>
            <button type="button" onClick={() => window.location.reload()} style={{ ...button, color: '#F5F0E6', background: '#15171C', border: '1px solid #15171C' }}>Reload the page</button>
            <a href={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/`} style={{ ...button, color: '#15171C', border: '1px solid #C9BFAB' }}>Go to the home page</a>
          </div>
        </main>
      </body>
    </html>
  );
}
