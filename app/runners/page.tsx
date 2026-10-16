import RunnerSearch from '@/components/RunnerSearch';
import { copyEditions } from '@/lib/duplicate-editions';
import { pageMetadata } from '@/lib/seo';

// A name lookup, not a page for search results: noindex (lib/seo-routes NOINDEX), and searches never enter the address.
export const metadata = pageMetadata({
  title: 'Find your races | Pace Notes',
  description: 'Search every named race record, including incomplete results. View recorded finishes and explore pacing, peers, weather and elevation where data exists.',
  path: '/runners',
  noindex: true,
});

export default function RunnersPage() {
  // Read at build time from the verified story manifest, so the page carries the copy editions and their counts.
  return <RunnerSearch copyEditions={copyEditions()} />;
}
