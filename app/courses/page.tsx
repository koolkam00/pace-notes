import ChapterEnd from '@/components/ChapterEnd';
import { Elevation, Temperature } from '@/components/story/Units';
import { UnitLink as Link } from '@/components/UnitsProvider';
import CourseSort, { type SortKey } from '@/components/course/CourseSort.client';
import { Fact, SectionLink } from '@/components/course/Fact';
import { SlowdownTerm } from '@/components/tools/EvidenceTag';
import RouteFace from '@/components/course/RouteFace';
import { ChapterCrumbs } from '@/components/ui/ChapterHeader';
import { readingAttrs } from '@/lib/chapters';
import Reading from '@/components/ui/Reading';
import { courseLists, coursePages, raceName, routeClimb } from '@/lib/course-page';
import RaceFinder from '@/components/races/RaceFinder.client';
import { TierTerm } from '@/components/ui/TierTag';
import { directorySha, racePages, raceFile, resultsPages } from '@/lib/races-server';
import type { RaceSeriesNames } from '@/components/races/RaceFinder.client';
import { raceDisplayName } from '@/lib/races-types';
import type { Courses } from '@/lib/insights';
import { readInsight } from '@/lib/insights-server';
import { getNugget, readingOf, sentenceOf } from '@/lib/nuggets';
import { count } from '@/lib/nuggets/format';
import { FINISHES_ALL_SPLITS, MIN_EDITIONS, profileUnderWater } from '@/lib/nuggets/courses';
import { TIER_LINE_SEPARATOR, tierLine } from '@/lib/tiers';
import { JsonLd, absoluteUrl, pageCrumbs, pageMetadata } from '@/lib/seo';
import '@/app/styles/pages/courses.css';

export function generateMetadata() {
  const pages = [...coursePages().values()];
  // The courses whose row prints a climb (climbOf below): a supplied route whose profile does not read the water under a
  // bridge. Until November 9, 2026 this counted every route file, two more than the rows that print a climb.
  const drawn = pages.filter((p) => p.geometry && !profileUnderWater(p)).length;
  // Since November 19, 2026 the counts are the page's own nuggets: every marathon the list holds (courses.index) and the
  // races with a page (courses.pages), so no copy of the title or the description counts anything the page does not list.
  const total = Number(getNugget('courses.index').values.races);
  const withPage = Number(getNugget('courses.pages').values.pages);
  const title = `Marathon Courses: ${count(withPage)} Race Pages, Elevation for ${count(drawn)}`;
  const long = `${count(total)} marathons, year by year, and ${count(withPage)} race pages: finish times, and sustained slowdown, climb and race-morning weather where recorded; elevation for ${count(drawn)}.`;
  const description = long.length <= 155 ? long : `${count(total)} marathons, year by year, and ${count(withPage)} race pages, with route and elevation for ${count(drawn)}.`;
  return pageMetadata({ title, description, path: '/courses' });
}

/**
 * /courses (the redesign spec, section 7.10, cut under section 00): the H1 and the dek, then every course as one row
 * the chips sort, A–Z first (the share's order is course comparison's finding; critic round 4), under a key line saying
 * what the row's figure is: its route as its face in a fine ink-2 line (an empty face where no route was supplied, as
 * the hero leaves the route out), its name, and the figure the order is by, at the right; the sorted figures are the
 * ranking, so no bar repeats them. Under any order but A–Z and the share, the share of sustained slowdowns moves to the
 * row's small line. A route whose profile reads the water under a bridge prints no climb (as on its page). A course
 * with fewer than three editions has its share drawn quieter: under the share's order it follows under its own
 * hairline; under any other it stands in its sorted place. The ItemList stays alphabetical.
 *
 * A course whose page only lists its editions (no counted edition; lib/course-page.ts `courseLists`, since November 14,
 * 2026) keeps its row: its name, "No pacing figures" and a dash where a figure would stand. It has no value to sort
 * by, so it comes last under every order but A–Z and follows with the fewer-edition courses under the share's order.
 */
/** The races that hold two series under one label (Warsaw), named in the list as their page names them (review m5). */
function seriesNames(): RaceSeriesNames {
  const out: RaceSeriesNames = {};
  for (const p of racePages()) {
    const series = raceFile(p.slug).series ?? [];
    if (series.length > 1) out[p.label] = series.map((s) => ({ name: s.name, years: s.first_year === s.last_year ? String(s.first_year) : `${s.first_year}–${s.last_year}` }));
  }
  return out;
}

export default function CoursesPage() {
  const pages = [...coursePages().values()];
  const lists = [...courseLists().values()];
  // Every course page in one alphabetical list: its slug, its city and the race's name.
  const alpha = [...pages.map((p) => ({ slug: p.slug, city: p.city, race: raceName(p.city, p.geometry, p.summary) })), ...lists.map((l) => ({ slug: l.slug, city: l.city, race: l.race }))]
    .sort((a, b) => a.city.localeCompare(b.city));
  const courses = readInsight<Courses>('courses.json');
  const temps = new Map<string, number[]>();
  for (const w of courses.weather.editions) temps.set(w.city, [...(temps.get(w.city) ?? []), w.temp]);
  const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
  const index = getNugget('courses.index');
  // The one climb a course prints everywhere; none where the profile reads the water under a bridge.
  const climbOf = (p: (typeof pages)[number]) => (profileUnderWater(p) ? null : routeClimb(p));
  const listSlugs = [...lists].sort((a, b) => a.city.localeCompare(b.city)).map((l) => l.slug);
  const few = [...pages.filter((p) => p.summary.editions < MIN_EDITIONS).map((p) => p.slug), ...listSlugs];
  const by = (f: (p: (typeof pages)[number]) => number | null, dir: 1 | -1) =>
    [...[...pages].sort((a, b) => { const x = f(a), y = f(b); if (x === null) return 1; if (y === null) return -1; return dir * (x - y) || a.city.localeCompare(b.city); }).map((p) => p.slug), ...listSlugs];
  const orders: Record<SortKey, string[]> = {
    slowdown: by((p) => p.summary.slowdown, 1),
    climb: by((p) => climbOf(p)?.gain_m ?? null, -1),
    finishes: by((p) => p.summary.finishes, -1),
    temp: by((p) => (temps.get(p.city)?.length ? mean(temps.get(p.city)!) : null), 1),
    az: alpha.map((p) => p.slug),
  };
  const listRows = lists.map((l) => ({
    id: l.slug,
    node: (
      <Link href={`/courses/${l.slug}`} className="course-index-row" data-course-list="">
        <span className="course-index-face"><i className="course-index-noroute" aria-hidden="true" /></span>
        <span className="course-index-name">{l.display}</span>
        <span className="course-index-meta"><span className="m-default">No pacing figures</span><span className="m-other">No pacing figures</span></span>
        <span className="course-index-share" aria-hidden="true">
          <span className="f-slowdown">—</span><span className="f-climb">—</span><span className="f-finishes">—</span><span className="f-temp">—</span>
        </span>
      </Link>
    ),
  }));
  const rows = [...pages.map((p) => {
    const t = temps.get(p.city) ?? [];
    const share = p.summary.slowdown;
    const climb = climbOf(p);
    // Counted editions, the word /methodology#edition-tiers defines (review M9, November 20, 2026).
    const editions = `${count(p.summary.editions)} ${p.summary.editions === 1 ? 'counted edition' : 'counted editions'}`;
    return {
      id: p.slug,
      node: (
        <Link href={`/courses/${p.slug}`} className="course-index-row">
          {/* A course with no route keeps its slot with a quiet dash, so the blank never reads as an image that failed. */}
          <span className="course-index-face">{p.geometry ? <RouteFace course={p.geometry} /> : <i className="course-index-noroute" aria-hidden="true" />}</span>
          <span className="course-index-name">{p.display}</span>
          <span className="course-index-meta">
            <span className="m-default">{editions}{climb ? <>{'\u00a0· '}<span className="nowrap"><Elevation metres={climb.gain_m} /> climb</span></> : null}</span>
            <span className="m-other">{Math.round(share * 100)}% sustained slowdown</span>
          </span>
          {/* The figure the order is by; the share first, the one the course page leads with. */}
          <span className="course-index-share">
            <span className="f-slowdown"><Fact k="slowdown.r" v={share}>{Math.round(share * 100)}%</Fact></span>
            <span className="f-climb">{climb ? <><Elevation metres={climb.gain_m} /><span className="sr-only"> of climbing</span></> : '—'}</span>
            <span className="f-finishes">{count(p.summary.finishes)}<span className="sr-only"> finishes</span></span>
            <span className="f-temp">{t.length ? <>{t.length > 1 ? <><Temperature c={Math.min(...t)} />–</> : null}<Temperature c={Math.max(...t)} /><span className="sr-only"> at the start</span></> : '—'}</span>
          </span>
        </Link>
      ),
    };
  }), ...listRows];
  // Each order's key, in place of the figure's guesswork: what the number at the row's end is, and in what order.
  const share = <>Each course’s share of finishes with a <SlowdownTerm />, in an average year</>;
  const keys: Record<SortKey, React.ReactNode> = {
    // A–Z draws the fewer-edition shares quieter: the key says why (critic round 5), as the share's order says by its title.
    az: few.length ? <>{share}; in grey, from fewer than three counted editions.</> : <>{share}.</>,
    slowdown: <>{share}, lowest first.</>,
    climb: <>Each route’s climbing, start to finish, most first.</>,
    finishes: <>{FINISHES_ALL_SPLITS} on each course, most first.</>,
    temp: <>Start temperatures across each course’s race mornings, coolest on average first.</>,
  };
  // The results pages (the second template, November 19, 2026): finish times by year, no pacing figure, so no place in
  // the sorted list above (each of its orders is a pacing or route figure). One row each, A–Z, drawn as the course rows
  // are, with the race's reading where race.reading's guard holds and a dash where it does not.
  const results = [...resultsPages().values()].map((r) => ({ page: r, name: raceDisplayName(r), reading: getNugget('race.reading', { city: r.label }) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const resultsRows = results.map(({ page: r, name, reading }) => (
    <li key={r.slug}>
      <Link href={`/courses/${r.slug}`} className="course-index-row" data-course-results="">
        <span className="course-index-name">{name}</span>
        {/* The years the median rests on, in the tier module's words, so a weaker-source stamp says so (review m1). */}
        <span className="course-index-meta"><span className="m-default">{r.place ? <>{r.place}{'\u00a0· '}</> : null}{count(r.editions)} {r.editions === 1 ? 'edition' : 'editions'}{reading.guard ? <>{TIER_LINE_SEPARATOR}{tierLine({ stamped: Number(reading.values.verified), stamped_weaker_source: Number(reading.values.weaker) }, count)}</> : null}</span></span>
        <span className="course-index-share">
          {/* No route, so no climb: the dash keeps the cell every row of the list has (verify-seo reads it). */}
          <span className="f-climb">—</span>
          <span className="f-reading">{reading.guard && reading.figure ? <><Fact k={`reading@${r.slug}`} v={Number(reading.values.median_s)}>{reading.figure.value}</Fact><span className="sr-only"> median finish</span></> : '—'}</span>
        </span>
      </Link>
    </li>
  ));
  const pagesNugget = getNugget('courses.pages');
  // The ItemList names the races with a page only (course and results pages), alphabetically.
  const named = [...alpha.map((p) => ({ slug: p.slug, city: p.city, race: p.race })), ...results.map(({ page: r, name }) => ({ slug: r.slug, city: name, race: name }))]
    .sort((a, b) => a.city.localeCompare(b.city));
  const list = {
    '@context': 'https://schema.org', '@type': 'ItemList', name: 'Marathon courses', itemListOrder: 'https://schema.org/ItemListOrderAscending', numberOfItems: named.length,
    itemListElement: named.map((p, i) => ({ '@type': 'ListItem', position: i + 1, name: p.race, url: absoluteUrl(`/courses/${p.slug}`) })),
  };
  const total = Number(index.values.races);
  return (
    <div className="courses-page" {...readingAttrs('/courses')}>
      <JsonLd data={[pageCrumbs('/courses', 'Courses'), list]} />
      {/* The H1 and the dek (every marathon the list holds), then the races with a page, then every race. */}
      <Reading crumbs={<ChapterCrumbs path="/courses" />} title="Courses" titleSize="title" dek={sentenceOf(index).replace(/\*/g, '')} className="courses-reading" />
      {/* Every marathon is under the course pages: one visible way straight to its filter (review nit, November 20, 2026). */}
      <p className="courses-jump"><SectionLink to="every-race" className="btn btn-secondary is-compact">Find any marathon</SectionLink></p>
      <section className="courses-list" id="pages" aria-labelledby="pages-title">
        <h2 id="pages-title" className="courses-h2">{sentenceOf(pagesNugget).replace(/\*/g, '')}</h2>
        <h3 className="courses-h3">Pacing, course and weather</h3>
        <CourseSort initial="az" orders={orders} rows={rows} keys={keys} foot={few} footTitle="Fewer than three counted editions"
          options={[{ value: 'az', label: 'A–Z' }, { value: 'slowdown', label: 'Sustained slowdown' }, { value: 'climb', label: 'Climb' }, { value: 'finishes', label: 'Finishes' }, { value: 'temp', label: 'Start temperature' }]} />
        {/* The results pages, folded (review m8, November 20, 2026: /courses ran to 6.9 phone screens against a hub's 4), so
            the first screens hold the reading, the course pages and the way to every marathon. */}
        <details className="values courses-results" id="finish-times-by-year">
          <summary>
            <span>Finish times by year<span className="values-count"> {count(results.length)} races</span></span>
            <span className="values-glyph" aria-hidden="true" />
          </summary>
          <div className="values-body">
            <p className="course-index-key">Each race’s median finish in a typical year; its row counts the years that median is taken from.</p>
            <ol className="course-index is-results" data-sort="reading">{resultsRows}</ol>
          </div>
        </details>
      </section>
      <section className="courses-every" id="every-race" tabIndex={-1} aria-labelledby="every-title">
        <h2 id="every-title" className="courses-h2">Every marathon</h2>
        <p className="course-index-key">Each race’s editions by the <TierTerm>status of their results</TierTerm>; a race with a page links to it.</p>
        <RaceFinder sha={directorySha()} total={count(total)} series={seriesNames()} />
      </section>
      <ChapterEnd path="/courses" readingOf={readingOf} />
    </div>
  );
}
