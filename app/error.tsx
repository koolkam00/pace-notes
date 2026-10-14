'use client';

import { useEffect } from 'react';
import { reloadAfterChunkError } from '@/lib/chunk-reload';

// Shown in place of a page that failed while loading or rendering; the site header and footer stay. A full reload is
// the main action because it also fetches any JavaScript file that failed to arrive.
export default function PageError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => { reloadAfterChunkError(error); }, [error]);
  return (
    <section className="page-error">
      <p className="eyebrow">Loading error</p>
      <h1>This page didn&apos;t load properly</h1>
      <p>Something went wrong while loading this page. Reloading usually fixes it.</p>
      <div className="hero-actions">
        <button type="button" className="button-primary" onClick={() => window.location.reload()}>Reload the page</button>
        <a className="button-secondary" href={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/`}>Go to the home page</a>
      </div>
    </section>
  );
}
