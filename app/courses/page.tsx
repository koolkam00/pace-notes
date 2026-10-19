import ChapterEnd from '@/components/ChapterEnd';
import { Elevation, Temperature } from '@/components/story/Units';
import { UnitLink as Link } from '@/components/UnitsProvider';
import CourseSort, { type SortKey } from '@/components/course/CourseSort.client';
import { Fact } from '@/components/course/Fact';
import RouteFace from '@/components/course/RouteFace';
import { ChapterCrumbs } from '@/components/ui/ChapterHeader';
import { readingAttrs } from '@/lib/chapters';
import Reading from '@/components/ui/Reading';
import { coursePages, raceName, routeClimb } from '@/lib/course-page';
import type { Courses } from '@/lib/insights';
import { readInsight } from '@/lib/insights-server';
import { getNugget, readingOf, sentenceOf } from '@/lib/nuggets';
import { count } from '@/lib/nuggets/format';
import { MIN_EDITIONS, profileUnderWater } from '@/lib/nuggets/courses';
import { JsonLd, absoluteUrl, pageCrumbs, pageMetadata } from '@/lib/seo';
import '@/app/styles/pages/courses.css';

export function generateMetadata() {
  const pages = [...coursePages().values()];
  const names = pages.map((p) => p.city).sort();
  const drawn = pages.filter((p) => p.geometry).length;
  const display = (city: string) => (city === 'New York' ? 'New York City' : city);
  const span = names.length > 1 ? `, from ${display(names[0])} to ${display(names[names.length - 1])}` : '';
  const describe = (from: string) => `Sustained slowdown, climb, finishes and race-morning weather for ${names.length} marathon courses${from}, with route and elevation for ${drawn}.`;
  // Every course has a pacing profile; only those with a supplied route file have elevation, so the title counts both.
  const title = drawn === names.length ? `Marathon Courses: Elevation and Pacing for ${names.length} Races` : `Marathon Courses: Pacing for ${names.length} Races, Elevation for ${drawn}`;
  return pageMetadata({ title, description: describe(span).length <= 155 ? describe(span) : describe(''), path: '/courses' });
}

const W = 44, H = 44;

/**
 * A course's pace shape, in the face's box, for a course with no supplied route (never an empty box): a quiet line over
 * a dashed level (its own average pace), so it reads as a different kind of mark from the routes drawn in ink.
 */
function ShapeFace({ curve }: { curve: number[] }) {
  const level = <line className="course-index-level" x1="4" x2={W - 4} y1={H / 2} y2={H / 2} />;
  if (curve.length !== 9) return <svg className="course-index-face-svg" viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false">{level}</svg>;
  const span = Math.max(1, ...curve.map((v) => Math.abs(v)));
  const d = curve.map((v, i) => `${i ? 'L' : 'M'}${(4 + (i / 8) * (W - 8)).toFixed(1)} ${(H / 2 - (v / span) * (H / 2 - 6)).toFixed(1)}`).join('');
  return <svg className="course-index-face-svg" viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false">{level}<path className="course-index-shape" d={d} /></svg>;
}

/**
 * /courses (the redesign spec, section 7.10, cut under section 00): the H1 and the dek, then every course as one row
 * the chips sort: its route as its face in a fine ink-2 line (or its pace shape), its name, and the figure the order is
 * by, at the right; the sorted figures are the ranking, so no bar repeats them (bars under every row read as
 * underlines). Under any other order the share of sustained slowdowns moves to the row's small line. A route whose
 * profile reads the water under a bridge prints no climb (as on its page). The courses with fewer than three editions are
 * drawn quieter: under the share's order they follow under their own hairline; under any other they stand in their
 * sorted place. The ItemList stays alphabetical.
 */
export default function CoursesPage() {
  const pages = [...coursePages().values()];
  const alpha = [...pages].sort((a, b) => a.city.localeCompare(b.city));
  const courses = readInsight<Courses>('courses.json');
  const temps = new Map<string, number[]>();
  for (const w of courses.weather.editions) temps.set(w.city, [...(temps.get(w.city) ?? []), w.temp]);
  const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
  const index = getNugget('courses.index');
  // The one climb a course prints everywhere; none where the profile reads the water under a bridge.
  const climbOf = (p: (typeof pages)[number]) => (profileUnderWater(p) ? null : routeClimb(p));
  const few = pages.filter((p) => p.summary.editions < MIN_EDITIONS).map((p) => p.slug);
  const by = (f: (p: (typeof pages)[number]) => number | null, dir: 1 | -1) =>
    [...pages].sort((a, b) => { const x = f(a), y = f(b); if (x === null) return 1; if (y === null) return -1; return dir * (x - y) || a.city.localeCompare(b.city); }).map((p) => p.slug);
  const orders: Record<SortKey, string[]> = {
    slowdown: by((p) => p.summary.slowdown, 1),
    climb: by((p) => climbOf(p)?.gain_m ?? null, -1),
    finishes: by((p) => p.summary.finishes, -1),
    temp: by((p) => (temps.get(p.city)?.length ? mean(temps.get(p.city)!) : null), 1),
    az: alpha.map((p) => p.slug),
  };
  const rows = pages.map((p) => {
    const t = temps.get(p.city) ?? [];
    const share = p.summary.slowdown;
    const climb = climbOf(p);
    const editions = `${count(p.summary.editions)} ${p.summary.editions === 1 ? 'edition' : 'editions'}`;
    return {
      id: p.slug,
      node: (
        <Link href={`/courses/${p.slug}`} className="course-index-row">
          <span className="course-index-face">{p.geometry ? <RouteFace course={p.geometry} /> : <ShapeFace curve={p.summary.curve ?? []} />}</span>
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
  });
  const list = {
    '@context': 'https://schema.org', '@type': 'ItemList', name: 'Marathon courses', itemListOrder: 'https://schema.org/ItemListOrderAscending', numberOfItems: alpha.length,
    itemListElement: alpha.map((p, i) => ({ '@type': 'ListItem', position: i + 1, name: raceName(p.city, p.geometry, p.summary), url: absoluteUrl(`/courses/${p.slug}`) })),
  };
  return (
    <div className="courses-page" {...readingAttrs('/courses')}>
      <JsonLd data={[pageCrumbs('/courses', 'Courses'), list]} />
      {/* One list (section 00): the H1, the dek, then every course. The spread across courses is course-comparison's. */}
      <Reading crumbs={<ChapterCrumbs path="/courses" />} title="Courses" titleSize="title" dek={sentenceOf(index).replace(/\*/g, '')} className="courses-reading" />
      <section className="courses-list" aria-label="Every course">
        <CourseSort initial="slowdown" orders={orders} rows={rows} foot={few} footTitle="Fewer than three editions"
          options={[{ value: 'slowdown', label: 'Sustained slowdown' }, { value: 'climb', label: 'Climb' }, { value: 'finishes', label: 'Finishes' }, { value: 'temp', label: 'Start temperature' }, { value: 'az', label: 'A–Z' }]} />
      </section>
      <ChapterEnd path="/courses" readingOf={readingOf} />
    </div>
  );
}
