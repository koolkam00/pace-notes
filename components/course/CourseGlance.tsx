import { Elevation, Section } from '@/components/story/Units';
import { clock, count, medianRange, pct, yearList, type CoursePageData } from '@/lib/course-page';
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
    ['data', 'About this data'],
  ];
}

/** "{race} at a glance": three to five sentences, each filled from one published field, then the contents. */
export default function CourseGlance({ page }: { page: CoursePageData }) {
  const { summary: s, editions, copies, geometry, context, race } = page;
  const single = editions.length === 1 ? editions[0] : null;
  const range = medianRange(editions);
  const slowest = s.slowest_section ? SECTION_NAMES.indexOf(s.slowest_section) : -1;
  const shapeNote = s.shape_editions < s.editions ? <> in the <Fact k="shape.editions" v={s.shape_editions}>{count(s.shape_editions)}</Fact> editions without start delays in the first split</> : null;
  return (
    <CourseSection id="at-a-glance" track="chapter-1" kicker="At a glance" title={<>{race} <em>at a glance</em></>}>
      <div className="course-glance">
        <p>
          The data holds <Fact k="finishes" v={s.finishes}>{count(s.finishes)}</Fact> finishes with all nine 5 km checkpoint times from {single
            ? <>the <Fact k="years" v={s.years.join(',')}>{yearList(s.years)}</Fact> edition of the {race}.</>
            : <><Fact k="editions" v={s.editions}>{count(s.editions)}</Fact> editions of the {race}: <Fact k="years" v={s.years.join(',')}>{yearList(s.years)}</Fact>.</>}
          {copies.length ? <> The {yearList(copies.map((c) => c.year))} editions are not counted: their records largely repeat the {copies[0].duplicate_of} field.</> : null}
        </p>
        {single ? (
          <p>The {single.year} edition’s median finish was <Fact k={`median@${single.year}`} v={single.median_s}>{clock(single.median_s)}</Fact>, and <Fact k="slowdown" v={s.slowdown}>{pct(s.slowdown)}</Fact> of its finishes had a <SectionLink to="slowdown">sustained slowdown</SectionLink>.</p>
        ) : range ? (
          <>
            <p>Edition medians ran from <Fact k="median.lo" v={range.lo.median_s}>{clock(range.lo.median_s)}</Fact> (<Fact k="median.lo.year" v={range.lo.year}>{range.lo.year}</Fact>) to <Fact k="median.hi" v={range.hi.median_s}>{clock(range.hi.median_s)}</Fact> (<Fact k="median.hi.year" v={range.hi.year}>{range.hi.year}</Fact>); the mean of the edition medians is <Fact k="median" v={s.median_s}>{clock(s.median_s)}</Fact>.</p>
            <p>On average across editions, <Fact k="slowdown" v={s.slowdown}>{pct(s.slowdown)}</Fact> of finishes had a <SectionLink to="slowdown">sustained slowdown</SectionLink>, from <Fact k="slowdown.lo" v={s.slowdown_range[0]}>{pct(s.slowdown_range[0])}</Fact> (<Fact k="slowdown.lo.year" v={s.slowdown_range_years[0]}>{s.slowdown_range_years[0]}</Fact>) to <Fact k="slowdown.hi" v={s.slowdown_range[1]}>{pct(s.slowdown_range[1])}</Fact> (<Fact k="slowdown.hi.year" v={s.slowdown_range_years[1]}>{s.slowdown_range_years[1]}</Fact>).</p>
          </>
        ) : null}
        {slowest >= 0 ? <p>For the median finisher{shapeNote}, the slowest 5 km section was <Fact k="slowest" v={s.slowest_section ?? ''}><Section i={slowest} /></Fact>.</p> : null}
        {geometry && context?.gain_m != null ? (
          <p>The supplied current route climbs <Fact k="geo.gain" v={geometry.gain_m}><Elevation metres={geometry.gain_m} /></Fact> on its smoothed route profile, or <Fact k="cg.gain" v={context.gain_m}><Elevation metres={context.gain_m} /></Fact> as the sum of the 5 km sections.</p>
        ) : null}
      </div>
      <nav className="course-toc" aria-label="On this page">
        <p className="course-toc-label">On this page</p>
        <ul>{contents(page).map(([id, label]) => <li key={id}><SectionLink to={id}>{label}</SectionLink></li>)}</ul>
      </nav>
    </CourseSection>
  );
}
