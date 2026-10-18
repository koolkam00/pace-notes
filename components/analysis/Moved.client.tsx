'use client';
import { useEffect } from 'react';
import { UnitLink as Link } from '@/components/UnitsProvider';

/**
 * A page that has moved (the redesign spec, section 2.9): a visible heading, a link to its new place, and a forward in
 * the browser that keeps the visitor's query and lands on the right tab. It stays only for the GitHub Pages fallback;
 * Vercel serves the 308 first. The page is noindex with the target as its canonical (app/analyses/[slug]).
 */
export default function Moved({ to, title }: { to: string; title: string }) {
  // A full replace, not a client navigation: the stub is a static fallback, and the new page should load as if the 308
  // had served it (its hash opening the tab), with the stub left out of the history.
  useEffect(() => {
    const [path, hash] = to.split('#');
    window.location.replace(path + window.location.search + (hash ? `#${hash}` : ''));
  }, [to]);
  return (
    <article className="moved-page">
      <h1 className="t-title">This page has moved</h1>
      <p className="t-body">{title} is now part of race-day weather.</p>
      <p><Link href={to} className="moved-link">Go to race-day weather</Link></p>
    </article>
  );
}
