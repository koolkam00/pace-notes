import ChainFrame from '@/components/ChainFrame';
import ChapterEnd from '@/components/ChapterEnd';
import RunnerSearch, { FinishTimeStart } from '@/components/RunnerSearch';
import { ChapterCrumbs } from '@/components/ui/ChapterHeader';
import Arrow from '@/components/ui/Arrow';
import { UnitLink as Link } from '@/components/UnitsProvider';
import { copyEditions } from '@/lib/duplicate-editions';
import { readingOf } from '@/lib/nuggets';
import { pageMetadata } from '@/lib/seo';
import { reportData } from '@/lib/split-check-server';
import { getStudyEvidence } from '@/lib/research-data';
import { approxWords } from '@/lib/nuggets/format';
import { capitalize } from '@/lib/nuggets/build';
import { coursePages } from '@/lib/course-page';
import { profileUnderWater } from '@/lib/nuggets/courses';
import { LINKED_BY_NAME, LINKED_REVIEW_HREF, LINKED_YEAR_WORDS, getLinkedEditions, linkedEditionReading } from '@/lib/linked-server';
import { LINKED_VERDICT_CODES, type LinkedYears } from '@/lib/report-year';

/**
 * The linked-records family's year verdicts, for one line in a runner record's race report: every edition the family
 * reads, through its own guard (lib/linked-server.ts linkedEditionReading); an edition with no verdict is left out, so
 * the report says nothing about its year. The words come from the helper, once per verdict.
 */
function linkedYears(): LinkedYears {
  const rows: [string, number, 0 | 1 | 2, 0 | 1][] = [], hrefs: Record<string, string> = {};
  for (const [label, years] of Object.entries(getLinkedEditions().data.races)) for (const year of Object.keys(years)) {
    const reading = linkedEditionReading(label, year);
    if (!reading) continue;
    rows.push([label, Number(year), LINKED_VERDICT_CODES.indexOf(reading.verdict) as 0 | 1 | 2, reading.reviewed ? 1 : 0]);
    hrefs[label] = reading.href;
  }
  return { words: LINKED_YEAR_WORDS, byName: LINKED_BY_NAME, reviewHref: LINKED_REVIEW_HREF, hrefs, rows };
}

// A name lookup, not a page for search results: noindex (lib/seo-routes NOINDEX), and searches never enter the address.
export const metadata = pageMetadata({
  title: 'Analyze a past race | Pace Notes',
  description: 'Find your race in every named result, paste your splits or start from your finish time, then explore pacing, peers, weather and a race report.',
  path: '/runners',
  noindex: true,
});

/**
 * /runners (the redesign spec, section 7.12): reached from the navigation, so it opens on the task, with one line of
 * reading in its dek (how often a finish had a sustained slowdown, the study's rate in words, so a runner knows what the
 * search will tell them about their race). The chapter line, the H1 and that dek, then the search (usable from the first
 * paint) and two ways in without a name, in one column (centred from 900 px; from 1180 px beside the chapter rail, the
 * chain's frame). Ends on the closing stack: back to the split check (chapter 10's first page), on to chapter 11.
 */
export default function RunnersPage() {
  const rate = (getStudyEvidence()?.rate ?? NaN) / 100;
  // The cities whose route profile reads the water under a bridge (New York, Dubai): as on their course pages, the
  // runner view shows no climb for them.
  const wet = [...coursePages().values()].filter(profileUnderWater).map(page => page.city);
  // Read at build time from the verified story manifest, so the page carries the copy editions and their counts, and the
  // race report's hashes, opening groups and pacing-type cohort.
  return <ChainFrame path="/runners"><div className="runner-page">
    <header className="runner-head">
      <div className="reading-crumbs t-kicker"><ChapterCrumbs path="/runners" /></div>
      <h1 className="t-title">Analyze a past race</h1>
      <p className="runner-dek">{Number.isFinite(rate) ? <>{capitalize(approxWords(rate, 'finishes'))} had a <Link className="term-link" href="/methodology#sustained-slowdown">sustained slowdown</Link>. Find a recorded race by name to see whether it did, or start from your splits or a finish time.</> : 'Find a recorded race by name, or start from your splits or a finish time.'}</p>
    </header>
    <div className="runner-work">
      <RunnerSearch copyEditions={copyEditions()} report={reportData()} wet={wet} years={linkedYears()} starts={<nav className="runner-starts" aria-label="Start without a name">
        <ul className="runner-rows">
          <li><Link className="runner-start" href="/tools/split-check"><b>Have your splits? Paste them</b><span>Each section’s pace, the sustained-slowdown reading and a race report.</span><Arrow /></Link></li>
          <li><FinishTimeStart /></li>
        </ul>
      </nav>} />
    </div>
    <ChapterEnd path="/runners" readingOf={readingOf} track={false} />
  </div></ChainFrame>;
}
