'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { UnitLink as Link } from '@/components/UnitsProvider';
import Arrow from '@/components/ui/Arrow';
import { runnerHandoffHref } from '@/lib/analytics-policy';
import { readReportGender, readReportTimes, reportCourseCity, type ReportData, type ReportGender } from '@/lib/report';
import { splitCheckHref } from '@/lib/tools/links';
import { SPLIT_EXAMPLE } from '@/lib/tools/splits';
import RaceReport from './RaceReport';

type Query = { times: number[] | null; course: string; gender: ReportGender; fromRecord: boolean; unreadable: boolean };

/** The split check's made-up race (a quick opening, a sustained slowdown from 30K): what /report shows before it has a race. */
const EXAMPLE_TIMES = readReportTimes(SPLIT_EXAMPLE) ?? [];

/** The two ways to make a report: plain links, so they work before (or without) the page's JavaScript too. */
function Starts() {
  return (
    <ul className="report-starts" aria-label="Make a race report">
      <li><Link className="report-start" href="/tools/split-check"><span><b>Paste your splits</b><span>Type or paste the mat times, then make the report.</span></span><Arrow /></Link></li>
      <li><Link className="report-start" href="/runners"><span><b>Find your race</b><span>Search the recorded results by name.</span></span><Arrow /></Link></li>
    </ul>
  );
}

/**
 * /report in the browser: it reads s, course, g and via from its own address once (the static page cannot know them),
 * then shows the race report, or, without nine valid times, the split check's made-up example report (labelled so) above
 * the two ways to make one, saying so when the link carried times it could not read. A link from a runner record
 * (via=runner) never carries g; its onward links keep the marker, so the pages they open are not recorded either.
 * Without JavaScript the page cannot read the address, so its HTML offers the two ways in a <noscript>. `crumbs` is the
 * chapter line, drawn on the server.
 */
export default function ReportView({ data, crumbs }: { data: ReportData; crumbs?: ReactNode }) {
  const [query, setQuery] = useState<Query | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromRecord = params.getAll('via').includes('runner');
    const course = params.get('course') ?? 'all';
    const times = readReportTimes(params.get('s'));
    setQuery({
      times, course: /^[a-z0-9-]+$/.test(course) ? course : 'all',
      gender: fromRecord ? 'all' : readReportGender(params.get('g')), fromRecord, unreadable: params.has('s') && !times,
    });
  }, []);
  const times = query?.times ?? null;
  const city = query && query.course !== 'all' ? reportCourseCity(data.courses, query.course) ?? undefined : undefined;
  const split = times && query ? splitCheckHref(times, city) : null;
  const splitLink = split && query ? (query.fromRecord ? runnerHandoffHref(split) : query.gender === 'all' ? split : `${split}&g=${query.gender}`) : null;
  return (
    <>
      {crumbs ? <div className="reading-crumbs t-kicker report-crumbs no-print">{crumbs}</div> : null}
      {/* Mounted from the first render (and hidden until a report shows), so the section tracker finds it. */}
      <div className="report-tracked" data-track-section="report" hidden={!times}>
        {/* The split check with these times is one of the report's actions, in its share sheet: the page's one onward way is the closing stack. */}
        {times && query ? <RaceReport times={times} course={query.course} gender={query.gender} data={data} level={1} fromRecord={query.fromRecord} onward={splitLink} /> : null}
      </div>
      {!times ? (
        <div className="report-empty">
          <header>
            <h1 className="t-title">Race report</h1>
            {/* A shared link whose times could not be read says so where it opens, above the example. */}
            {query ? <><p className="report-dek">One marathon from its mat times, on one page to print, save or share.</p>{query.unreadable ? <p className="report-unreadable">This link’s times couldn’t be read.</p> : null}</>
              : <p className="report-dek report-reading" role="status">Reading the race from this link…</p>}
          </header>
          {query ? <>
            {/* What a report is, before it asks for a race: the split check's made-up example, outside the tracked
                section and without actions (round 4). */}
            <div className="report-example"><RaceReport times={EXAMPLE_TIMES} course="all" gender="all" data={data} level={2} example /></div>
            <section className="report-make" aria-labelledby="report-make">
              <h2 className="report-make-title" id="report-make">Make yours</h2>
              <Starts />
            </section>
          </> : <noscript><p className="report-dek">Reading a race from its link needs JavaScript.</p><Starts /></noscript>}
        </div>
      ) : null}
    </>
  );
}
