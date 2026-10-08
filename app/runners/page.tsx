import RunnerSearch from '@/components/RunnerSearch';
import { pageMetadata } from '@/lib/seo';

// A name lookup, not a page for search results: noindex (lib/seo-routes NOINDEX), and searches never enter the address.
export const metadata = pageMetadata({
  title: 'Find your races | Pace Notes',
  description: 'Search every named race record, including incomplete results. View recorded finishes and explore pacing, peers, weather and elevation where data exists.',
  path: '/runners',
  noindex: true,
});

export default function RunnersPage() {
  return <RunnerSearch />;
}
