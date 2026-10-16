'use client';

import { useEffect, useState } from 'react';
import { UnitLink as Link } from '@/components/UnitsProvider';
import { runnerHandoffHref } from '@/lib/analytics-policy';
import { readReportGender, readReportTimes, type ReportData, type ReportGender } from '@/lib/report';
import { splitCheckHref } from '@/lib/tools/links';
import RaceReport from './RaceReport';

type Query = { times: number[] | null; course: string; gender: ReportGender; fromRecord: boolean };

/** The two ways to make a report: plain links, so they work before (or without) the page's JavaScript too. */
function Starts() {
  return (
    <nav className="report-starts" aria-label="Make a race report">
      <ul>
        <li><Link className="report-start" href="/tools/split-check"><b>Paste your splits</b><span>Type or paste the nine times into the split check, then make the report from there.</span></Link></li>
        <li><Link className="report-start is-search" href="/runners"><b>Find your race</b><span>Search the recorded results and make the report from your race’s record.</span></Link></li>
      </ul>
    </nav>
  );
}

/**
 * /report in the browser: it reads s, course, g and via from its own address once (the static page cannot know them),
 * then shows the race report, or, without nine valid times, the two ways to make one. A link from a runner record
 * (via=runner) never carries g; its onward links keep the marker, so the pages they open are not recorded either.
 * Without JavaScript the page cannot read the address, so its HTML offers the two ways in a <noscript>.
 */
export default function ReportView({ data }: { data: ReportData }) {
  const [query, setQuery] = useState<Query | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromRecord = params.getAll('via').includes('runner');
    const course = params.get('course') ?? 'all';
    setQuery({
      times: readReportTimes(params.get('s')), course: /^[a-z0-9-]+$/.test(course) ? course : 'all',
      gender: fromRecord ? 'all' : readReportGender(params.get('g')), fromRecord,
    });
  }, []);
  const times = query?.times ?? null;
  const city = query && query.course !== 'all' ? data.courses[query.course] : undefined;
  const split = times && query ? splitCheckHref(times, city) : null;
  const splitLink = split && query ? (query.fromRecord ? runnerHandoffHref(split) : query.gender === 'all' ? split : `${split}&g=${query.gender}`) : null;
  return (
    <>
      {/* Mounted from the first render (and hidden until a report shows), so the section tracker finds it. */}
      <div className="report-tracked" data-track-section="report" hidden={!times}>
        {times && query ? <RaceReport times={times} course={query.course} gender={query.gender} data={data} level={1} fromRecord={query.fromRecord} /> : null}
        {splitLink ? <p className="report-onward no-print"><Link href={splitLink}>Open these splits in the split check</Link>, with its charts and the full comparison table.</p> : null}
      </div>
      {!times ? (
        <header className="report-empty">
          <p className="eyebrow">Pace Notes · after the race</p>
          <h1>Race report</h1>
          {query ? <>
            <p>A race report reads one marathon from its nine mat times (5, 10, 15 … 40 km and the finish) on one page you can print, save as an image or share. This link has no nine times to read.</p>
            <Starts />
          </> : <>
            <p className="report-reading" role="status">Reading the race from this link…</p>
            <noscript><p>This page reads the race from its link with JavaScript, which is off here. You can still make a report another way.</p><Starts /></noscript>
          </>}
        </header>
      ) : null}
    </>
  );
}
