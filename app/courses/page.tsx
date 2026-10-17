import ChapterEnd from '@/components/ChapterEnd';
import { Elevation, Temperature } from '@/components/story/Units';
import { UnitLink as Link } from '@/components/UnitsProvider';
import CourseSort, { type SortKey } from '@/components/course/CourseSort.client';
import { Fact } from '@/components/course/Fact';
import RouteFace from '@/components/course/RouteFace';
import { ChapterCrumbs } from '@/components/ui/ChapterHeader';
import { SlowdownTerm } from '@/components/tools/EvidenceTag';
import { readingAttrs } from '@/lib/chapters';
import Reading from '@/components/ui/Reading';
import { coursePages, raceName } from '@/lib/course-page';
import type { Courses } from '@/lib/insights';
import { readInsight } from '@/lib/insights-server';
import { getNugget, readingOf, sentenceOf } from '@/lib/nuggets';
import { MIN_EDITIONS } from '@/lib/nuggets/courses';
import { count } from '@/lib/nuggets/format';
import { JsonLd, absoluteUrl, breadcrumbs, pageMetadata } from '@/lib/seo';
import '@/app/styles/pages/courses.css';

export function generateMetadata() {
  const pages = [...coursePages().values()];
  const names = pages.map((p) => p.city).sort();
  const drawn = pages.filter((p) => p.geometry).length;
  const display = (city: string) => (city === 'New York' ? 'New York City' : city);
  const span = names.length > 1 ? `, from ${display(names[0])} to ${display(names[names.length - 1])}` : '';
  const describe = (from: string) => `Pacing by 5 km section for ${names.length} marathon courses${from}, with route and elevation profiles for ${drawn}. Alphabetical, not ranked.`;
  // Every course has a pacing profile; only those with a supplied route file have elevation, so the title counts both.
  const title = drawn === names.length ? `Marathon Courses: Elevation and Pacing for ${names.length} Races` : `Marathon Courses: Pacing for ${names.length} Races, Elevation for ${drawn}`;
  return pageMetadata({ title, description: describe(span).length <= 155 ? describe(span) : describe(''), path: '/courses' });
}

const W = 44, H = 44;

/** A course's pace shape, in the face's box, for a course with no supplied route (never an empty box). */
function ShapeFace({ curve }: { curve: number[] }) {
  if (curve.length !== 9) return <svg className="course-index-face-svg" viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false"><rect className="course-index-flat" x="6" y={H / 2} width={W - 12} height="1.5" /></svg>;
  const span = Math.max(1, ...curve.map((v) => Math.abs(v)));
  const d = curve.map((v, i) => `${i ? 'L' : 'M'}${(4 + (i / 8) * (W - 8)).toFixed(1)} ${(H / 2 - (v / span) * (H / 2 - 6)).toFixed(1)}`).join('');
  return <svg className="course-index-face-svg" viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false"><path className="course-index-shape" d={d} /></svg>;
}

/**
 * /courses (the redesign spec, section 7.10, cut under section 00): the reading (how far sustained slowdown runs from
 * one course to the next, from the same courses.json share each course page leads with), then every course as one row
 * the chips sort: its route as its face (or its pace shape), its name, the figure the order is by, and its share of
 * sustained slowdowns on one shared scale, so the list is the chart (hollow for a course with fewer than three editions,
 * as on every dot strip; the range above leaves those out). The ItemList stays alphabetical.
 */
export default function CoursesPage() {
  const pages = [...coursePages().values()];
  const alpha = [...pages].sort((a, b) => a.city.localeCompare(b.city));
  const courses = readInsight<Courses>('courses.json');
  const temps = new Map<string, number[]>();
  for (const w of courses.weather.editions) temps.set(w.city, [...(temps.get(w.city) ?? []), w.temp]);
  const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
  const range = getNugget('courses.range');
  const index = getNugget('courses.index');
  const top = Math.max(0.5, Math.ceil(Math.max(...pages.map((p) => p.summary.slowdown)) * 10) / 10);
  const by = (f: (p: (typeof pages)[number]) => number | null, dir: 1 | -1) =>
    [...pages].sort((a, b) => { const x = f(a), y = f(b); if (x === null) return 1; if (y === null) return -1; return dir * (x - y) || a.city.localeCompare(b.city); }).map((p) => p.slug);
  const orders: Record<SortKey, string[]> = {
    slowdown: by((p) => p.summary.slowdown, 1),
    climb: by((p) => p.geometry?.gain_m ?? null, -1),
    finishes: by((p) => p.summary.finishes, -1),
    temp: by((p) => (temps.get(p.city)?.length ? mean(temps.get(p.city)!) : null), 1),
    az: alpha.map((p) => p.slug),
  };
  const rows = pages.map((p) => {
    const t = temps.get(p.city) ?? [];
    const share = p.summary.slowdown;
    return {
      id: p.slug,
      node: (
        <Link href={`/courses/${p.slug}`} className="course-index-row">
          <span className="course-index-face">{p.geometry ? <RouteFace course={p.geometry} /> : <ShapeFace curve={p.summary.curve ?? []} />}</span>
          <span className="course-index-name">{p.display}</span>
          <span className="course-index-meta">
            <span className="m-default">{count(p.summary.editions)} {p.summary.editions === 1 ? 'edition' : 'editions'}{p.geometry ? <> · <Elevation metres={p.geometry.gain_m} /> climb</> : null}</span>
            <span className="m-climb">{p.geometry ? <><Elevation metres={p.geometry.gain_m} /> of climbing</> : 'No route drawn'}</span>
            <span className="m-finishes">{count(p.summary.finishes)} finishes</span>
            <span className="m-temp">{t.length ? <>{t.length > 1 ? <><Temperature c={Math.min(...t)} />–</> : null}<Temperature c={Math.max(...t)} /> at the start</> : 'No race mornings'}</span>
          </span>
          <span className="course-index-share"><Fact k="slowdown.r" v={share}>{Math.round(share * 100)}%</Fact></span>
          <span className="course-index-track" aria-hidden="true"><i className={p.summary.editions < MIN_EDITIONS ? 'is-few' : undefined} style={{ left: `${Math.min(100, (share / top) * 100).toFixed(1)}%` }} /></span>
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
      <JsonLd data={[breadcrumbs([['Pace Notes', '/'], ['Courses']]), list]} />
      <Reading crumbs={<ChapterCrumbs path="/courses" />} title="Courses" titleSize="title" dek={sentenceOf(index).replace(/\*/g, '')}
        figure={range.figure ? { ...range.figure, size: 'xl' } : undefined}
        unitLine={<>of finishes had a <SlowdownTerm />, course by course</>}
        sentence={sentenceOf(range)} fallback={!range.guard} className="courses-reading" />
      <section className="courses-list" aria-label="Every course">
        <CourseSort initial="slowdown" orders={orders} rows={rows}
          options={[{ value: 'slowdown', label: 'Sustained slowdown' }, { value: 'climb', label: 'Climb' }, { value: 'finishes', label: 'Finishes' }, { value: 'temp', label: 'Start temperature' }, { value: 'az', label: 'A–Z' }]} />
        {pages.some((p) => p.summary.editions < MIN_EDITIONS) ? <p className="courses-key" aria-hidden="true"><span><i />Three or more editions</span><span><i className="is-few" />Fewer editions</span></p> : null}
      </section>
      <ChapterEnd path="/courses" readingOf={readingOf} />
    </div>
  );
}
