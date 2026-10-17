import { Elevation, Section } from '@/components/story/Units';
import { clock, medianRange, pct, type CoursePageData } from '@/lib/course-page';
import { SECTION_NAMES } from '@/lib/tools/splits';
import { CourseSection, Fact, SectionLink } from './Fact';

/** The sections this page has, for the contents list. */
function contents(page: CoursePageData): [string, string][] {
  return [
    ['finish-times', 'Finish times by year'],
    ...(page.geometry ? [['elevation', 'Elevation profile'] as [string, string]] : []),
    ['pacing', 'Pacing by 5 km'],
    ['slowdown', 'Holding pace'],
    ['goals', 'Goal times'],
    ...(page.weather.length ? [['weather', 'Race-morning weather'] as [string, string]] : []),
    ['plan', 'Plan your race'],
  ];
}

/** "{race} at a glance": two to four sentences of findings, each filled from one published field, then the contents. */
export default function CourseGlance({ page }: { page: CoursePageData }) {
  const { summary: s, editions, geometry, race } = page;
  const single = editions.length === 1 ? editions[0] : null;
  const range = medianRange(editions);
  const slowest = s.slowest_section ? SECTION_NAMES.indexOf(s.slowest_section) : -1;
  return (
    <CourseSection id="at-a-glance" track="chapter-1" kicker="At a glance" title={<>{race} <em>at a glance</em></>}>
      <div className="course-glance">
        {single ? (
          <p>The {single.year} edition’s median finish was <Fact k={`median@${single.year}`} v={single.median_s}>{clock(single.median_s)}</Fact>, and <Fact k="slowdown" v={s.slowdown}>{pct(s.slowdown)}</Fact> of its finishes had a <SectionLink to="slowdown">sustained slowdown</SectionLink>.</p>
        ) : range ? (
          <>
            <p>Edition medians ran from <Fact k="median.lo" v={range.lo.median_s}>{clock(range.lo.median_s)}</Fact> (<Fact k="median.lo.year" v={range.lo.year}>{range.lo.year}</Fact>) to <Fact k="median.hi" v={range.hi.median_s}>{clock(range.hi.median_s)}</Fact> (<Fact k="median.hi.year" v={range.hi.year}>{range.hi.year}</Fact>), averaging <Fact k="median" v={s.median_s}>{clock(s.median_s)}</Fact>.</p>
            <p>On average across editions, <Fact k="slowdown" v={s.slowdown}>{pct(s.slowdown)}</Fact> of finishes had a <SectionLink to="slowdown">sustained slowdown</SectionLink>, from <Fact k="slowdown.lo" v={s.slowdown_range[0]}>{pct(s.slowdown_range[0])}</Fact> (<Fact k="slowdown.lo.year" v={s.slowdown_range_years[0]}>{s.slowdown_range_years[0]}</Fact>) to <Fact k="slowdown.hi" v={s.slowdown_range[1]}>{pct(s.slowdown_range[1])}</Fact> (<Fact k="slowdown.hi.year" v={s.slowdown_range_years[1]}>{s.slowdown_range_years[1]}</Fact>).</p>
          </>
        ) : null}
        {slowest >= 0 ? <p>For the median finisher, the slowest 5 km section was <Fact k="slowest" v={s.slowest_section ?? ''}><Section i={slowest} /></Fact>.</p> : null}
        {geometry ? <p>The route climbs <Fact k="geo.gain" v={geometry.gain_m}><Elevation metres={geometry.gain_m} /></Fact> from start to finish.</p> : null}
      </div>
      <nav className="course-toc" aria-label="On this page">
        <p className="course-toc-label">On this page</p>
        <ul>{contents(page).map(([id, label]) => <li key={id}><SectionLink to={id}>{label}</SectionLink></li>)}</ul>
      </nav>
    </CourseSection>
  );
}
