import BigNumber from '@/components/ui/BigNumber';
import Button from '@/components/ui/Button';
import { ChapterCrumbs } from '@/components/ui/ChapterHeader';
import { UnitLink as Link } from '@/components/UnitsProvider';
import { Elevation } from '@/components/story/Units';
import { SlowdownTerm } from '@/components/tools/EvidenceTag';
import YearStrip, { type YearPoint } from '@/components/viz/YearStrip';
import { getNugget } from '@/lib/nuggets';
import { heroKeyLead } from '@/lib/nuggets/courses';
import { hm, pct, temp } from '@/lib/nuggets/format';
import { heldEditions, MONTHS, routeClimb, type CoursePageData } from '@/lib/course-page';
import { planHref } from '@/lib/tools/links';
import type { UnitSystem } from '@/lib/units';
import ByUnits from '@/components/ui/ByUnits.client';
import { Fact, Said } from './Fact';
import RouteFace from './RouteFace';

/**
 * When the race is run: its usual month (the one most editions were run in), with any other month named with its years
 * ("April; October in 2021"), so a one-off autumn date never reads as a second race each year. Where no month leads,
 * all of them.
 */
function raceMonths(editions: { year: number; date: string | null }[]): string {
  const seen = new Map<number, number[]>();
  for (const e of editions) if (e.date) { const m = Number(e.date.slice(5, 7)); seen.set(m, [...(seen.get(m) ?? []), e.year]); }
  const months = [...seen.keys()].sort((a, b) => a - b);
  const most = Math.max(0, ...[...seen.values()].map((y) => y.length));
  const usual = months.filter((m) => seen.get(m)!.length === most);
  if (usual.length !== 1) return months.map((m) => MONTHS[m - 1]).join(' and ');
  // Years as runs: three or more in a row as a span ("2015–2018"), the rest listed.
  const years = (y: number[]) => {
    const runs: number[][] = [];
    for (const year of [...y].sort((a, b) => a - b)) { const last = runs[runs.length - 1]; if (last && year === last[last.length - 1] + 1) last.push(year); else runs.push([year]); }
    const parts = runs.flatMap((r) => (r.length >= 3 ? [`${r[0]}–${r[r.length - 1]}`] : r.map(String)));
    return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
  };
  // The other months in the order they were first run.
  const others = months.filter((m) => m !== usual[0]).sort((a, b) => Math.min(...seen.get(a)!) - Math.min(...seen.get(b)!)).map((m) => `${MONTHS[m - 1]} in ${years(seen.get(m)!)}`);
  return `${MONTHS[usual[0] - 1]}${others.length ? `; ${others.join('; ')}` : ''}`;
}

/**
 * The night hero (the redesign spec, sections 4.3 and 7.10, cut under section 00): the race, when it is run, then the
 * reading: the share of its finishes with a sustained slowdown in the average edition (summary.slowdown averages the
 * editions' shares), the route as its face (with the climb; a course without a route lifts the strip into its place on
 * desktop, so no cell runs empty), the sentence
 * that says how far the share ran edition by edition (course.slowdown, shown only when its guard holds), and, with three
 * or more editions, the year strip to scrub them. The strip opens on the edition the sentence accents, so the needle,
 * the readout and the orange word agree, and labels the other end; without the sentence, it opens on the latest edition
 * the source policy keeps. Where this course sits among the others is #slowdown's finding, over the strip of every course.
 * One action: the planner for this course, an outline from 1180 px, where the header carries the orange "Plan your race".
 */
export default function CourseHero({ page }: { page: CoursePageData }) {
  const { city, display, race, summary: s, geometry, editions } = page;
  const reading = getNugget('course.slowdown', { city });
  const climb = routeClimb(page);
  const years = s.years;
  const span = years.length > 1 ? `${years[0]}–${years[years.length - 1]}` : String(years[0] ?? '');
  const when = raceMonths(editions);
  const held = heldEditions();
  const kept = editions.filter((e) => !held.has(`${page.city}|${e.year}`));
  const latest = kept[kept.length - 1]?.year ?? editions[editions.length - 1]?.year;
  // Without the sentence, the strip labels the extremes among the editions the policy keeps.
  const extremes = kept.length > 1 ? [...new Set([kept.reduce((a, b) => (b.slowdown < a.slowdown ? b : a)).year, kept.reduce((a, b) => (b.slowdown > a.slowdown ? b : a)).year])] : [];
  const points = (units: UnitSystem): YearPoint[] => editions.map((e) => ({ year: e.year, value: e.slowdown, display: pct(e.slowdown), side: [hm(e.median_s / 60), e.temp === null ? '—' : temp(e.temp, units)] }));
  const valueDomain: [number, number] = [0, Math.max(0.1, Math.ceil(Math.max(...editions.map((e) => e.slowdown)) * 10) / 10)];
  const extremeLabel = (p: YearPoint) => `${p.year} · ${p.display}`;
  // With the sentence, the strip opens on the edition it accents (the high end), so the needle, the readout and the
  // orange word name one year; the low end is the one label (shown wherever it has room). Without it, the latest
  // edition the policy keeps, with the extremes labelled.
  const opening = reading.guard ? Number(reading.values.hi_year) : latest;
  const labelled = reading.guard ? [Number(reading.values.lo_year)] : extremes;
  const strip = (units: UnitSystem) => (
    <YearStrip
      editions={points(units)}
      selected={opening} sideLabels={['Median finish', 'At the start']}
      valueDomain={valueDomain}
      extremeLabel={extremeLabel} labelled={labelled}
      label={`Sustained slowdown in ${display}, edition by edition, ${span}`} height={100} heightMd={168} signal={reading.guard} />
  );
  // Two editions are two lollipops (their numbers are in "All numbers"): the strip is drawn from three.
  const stripped = editions.length >= 3;
  return (
    <section className={`night course-hero${geometry ? '' : ' is-routeless'}${stripped ? '' : ' is-stripless'}`} data-track-section="hero">
      <div className="course-hero-head">
        <div className="reading-crumbs t-kicker course-crumbs"><ChapterCrumbs path={`/courses/${page.slug}`} place={<Link href="/courses" className="crumb-courses">Courses</Link>} /></div>
        <h1 className="course-title t-title">{race}</h1>
        <p className="hero-dek">{s.editions === 1 ? `One edition, ${span}` : `${s.editions} editions, ${span}`}{when ? ` · ${when}` : ''}</p>
      </div>
      <div className="course-hero-figure">
        {reading.figure ? <BigNumber value={reading.figure.value} unit={reading.figure.unit} sr={reading.figure.sr} size="xl" tone="night" /> : null}
        <p className="course-hero-key">{heroKeyLead(s.editions, years[0])} <SlowdownTerm /></p>
      </div>
      {geometry ? (
        <figure className="course-hero-route">
          <RouteFace course={geometry} fit label={`The ${race} route`} />
          {climb ? <figcaption><Fact k={`${climb.key}.gain`} v={climb.gain_m}><Elevation metres={climb.gain_m} /></Fact> of climbing</figcaption> : null}
        </figure>
      ) : null}
      {/* How far the share ran, edition by edition: the strip below labels both ends. Without a strip (two editions) no
          mark carries the orange, so the sentence is said plainly. */}
      {reading.guard ? <p className="course-hero-sentence t-sentence">{stripped || typeof reading.headline !== 'string' ? <Said nugget={reading} /> : reading.headline.replace(/\*/g, '')}</p> : null}
      {stripped ? <div className="course-hero-strip"><ByUnits mi={strip('mi')} km={strip('km')} /></div> : null}
      <div className="course-hero-actions">
        <Button href={planHref(city) ?? '/tools/plan'} arrow="right">Plan your {display}</Button>
      </div>
    </section>
  );
}
