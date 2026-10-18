'use client';
import { useEffect } from 'react';

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';

/**
 * The forward on a moved address's stub (components/MovedPage.tsx). Vercel answers these addresses with a 308 first; the
 * stub, and so this forward, only runs on a host that cannot redirect (the GitHub Pages build). It replaces the page, as a
 * 308 would, so the stub stays out of the history and the new page loads as if it had been asked for directly: the query
 * is kept, and the visitor's hash too unless the target names its own (#downloads, a weather tab). `guides` maps an old
 * personalized-guide hash (guide-profile …) to the analysis that answers it, read on the server (lib/seo-routes); a guide
 * hash with no page of its own goes to the target without it.
 */
export default function LegacyAnalysisLink({ to, guides }: { to: string; guides?: Record<string, string> }) {
  useEffect(() => {
    const { search, hash } = window.location;
    const guide = guides && Object.prototype.hasOwnProperty.call(guides, hash.slice(1)) ? guides[hash.slice(1)] : null;
    const [path, own] = (guide ?? to).split('#');
    // A guide hash is spent on choosing the page (an unknown one, such as #guide-return, is dropped); any other is kept.
    const fragment = own ? `#${own}` : guides && hash.startsWith('#guide-') ? '' : hash;
    window.location.replace(`${BASE}${path}${search}${fragment}`);
  }, [to, guides]);
  return null;
}
