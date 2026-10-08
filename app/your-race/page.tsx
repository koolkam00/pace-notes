import AnalysisIndex from '@/components/AnalysisIndex';
import LegacyAnalysisLink from '@/components/LegacyAnalysisLink';
import { pageMetadata } from '@/lib/seo';

// Legacy entry point that forwards old #guide links in the browser; kept out of search.
export const metadata = pageMetadata({
  title: 'Your race | Pace Notes',
  description: 'Ten useful marathon analyses, with comparisons for your course, age and finish time.',
  path: '/your-race',
  noindex: true,
});
export default function YourRacePage() {
  return <article className="analysis-directory"><LegacyAnalysisLink /><h1>Your race, one question at a time.</h1><p>The personalized guide now starts with ten focused analyses.</p><AnalysisIndex /></article>;
}
