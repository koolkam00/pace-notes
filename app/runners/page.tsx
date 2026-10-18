import ChapterEnd from '@/components/ChapterEnd';
import RunnerSearch, { FinishTimeStart } from '@/components/RunnerSearch';
import { ChapterCrumbs } from '@/components/ui/ChapterHeader';
import Arrow from '@/components/ui/Arrow';
import { UnitLink as Link } from '@/components/UnitsProvider';
import { copyEditions } from '@/lib/duplicate-editions';
import { readingOf } from '@/lib/nuggets';
import { pageMetadata } from '@/lib/seo';
import { reportData } from '@/lib/split-check-server';

// A name lookup, not a page for search results: noindex (lib/seo-routes NOINDEX), and searches never enter the address.
export const metadata = pageMetadata({
  title: 'Analyze a past race | Pace Notes',
  description: 'Find your race in every named result, paste your splits or start from your finish time, then explore pacing, peers, weather and a race report.',
  path: '/runners',
  noindex: true,
});

/**
 * /runners (the redesign spec, section 7.12): reached from the navigation, so it opens on the task, not a reading. The
 * chapter line, the H1 and its dek, then the search (usable from the first paint) and two ways in without a name; from
 * 900 px the search is a sticky left column and everything it finds reads in the right one. Ends on the closing stack:
 * on to the split check, back to chapter 09.
 */
export default function RunnersPage() {
  // Read at build time from the verified story manifest, so the page carries the copy editions and their counts, and the
  // race report's hashes, opening groups and pacing-type cohort.
  return <div className="runner-page">
    <header className="runner-head">
      <div className="reading-crumbs t-kicker"><ChapterCrumbs path="/runners" /></div>
      <h1 className="t-title">Analyze a past race</h1>
      <p className="runner-dek">Find a recorded race by name, or start from your splits or a finish time.</p>
    </header>
    <div className="runner-work">
      <RunnerSearch copyEditions={copyEditions()} report={reportData()} starts={<nav className="runner-starts" aria-label="Start without a name">
        <ul className="runner-rows">
          <li><Link className="runner-start" href="/tools/split-check"><b>Have your splits? Paste them</b><span>Each section’s pace, the sustained-slowdown reading and a race report.</span><Arrow /></Link></li>
          <li><FinishTimeStart /></li>
        </ul>
      </nav>} />
    </div>
    <ChapterEnd path="/runners" readingOf={readingOf} track={false} />
  </div>;
}
