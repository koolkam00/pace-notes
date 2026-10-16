import RunnerSearch, { FinishTimeStart } from '@/components/RunnerSearch';
import { UnitLink as Link } from '@/components/UnitsProvider';
import { copyEditions } from '@/lib/duplicate-editions';
import { pageMetadata } from '@/lib/seo';
import { reportData } from '@/lib/split-check-server';

// A name lookup, not a page for search results: noindex (lib/seo-routes NOINDEX), and searches never enter the address.
export const metadata = pageMetadata({
  title: 'Analyze a past race | Pace Notes',
  description: 'Find your race in every named result, paste your splits or start from your finish time, then explore pacing, peers, weather and a race report.',
  path: '/runners',
  noindex: true,
});

export default function RunnersPage() {
  // Read at build time from the verified story manifest, so the page carries the copy editions and their counts, and the
  // race report's hashes, opening groups and pacing-type cohort.
  return <article className="runner-page">
    <header className="directory-heading"><p className="eyebrow">Every recorded runner</p><h1>Analyze a past race</h1><p>Find it in the results, paste your splits, or start from your finish time. Pacing and comparisons show where the data supports them.</p></header>
    <RunnerSearch copyEditions={copyEditions()} report={reportData()} starts={<nav className="runner-starts" aria-label="Start without a name">
      <p className="eyebrow">Or start without a name</p>
      <ul>
        <li><Link className="runner-start" href="/tools/split-check"><b>Have your splits? Paste them</b><span>Nine mat times give each section’s pace, the sustained-slowdown reading and a race report to print or share.</span></Link></li>
        <li><FinishTimeStart /></li>
      </ul>
    </nav>} />
  </article>;
}
