import Link from 'next/link';
import { pageMetadata } from '@/lib/seo';

// An old address kept for bookmarks: noindex, no canonical (the host redirects it to /slowdown).
export const metadata = pageMetadata({
  title: 'Sustained Slowdown Analysis Has Moved | Pace Notes',
  description: 'The Pace Notes sustained slowdown analysis has moved to a new address on splithappens.run.',
  path: '/htw',
  noindex: true,
});

// Keep earlier bookmarks usable in the static export.
export default function LegacySlowdownPage() {
  return <section className="study-intro">
    <h1>Sustained slowdown analysis</h1>
    <p>This analysis has moved to a new address.</p>
    <p><Link href="/slowdown">Explore sustained slowdown</Link></p>
  </section>;
}
