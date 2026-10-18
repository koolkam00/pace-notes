import BigNumber from '@/components/ui/BigNumber';
import Button from '@/components/ui/Button';
import { ChapterCrumbs } from '@/components/ui/ChapterHeader';
import { UnitLink as Link } from '@/components/UnitsProvider';
import { Elevation } from '@/components/story/Units';
import { SlowdownTerm } from '@/components/tools/EvidenceTag';
import YearStrip from '@/components/viz/YearStrip';
import { getNugget } from '@/lib/nuggets';
import { hm, pct, temp } from '@/lib/nuggets/format';
import { heldEditions, MONTHS, routeClimb, type CoursePageData } from '@/lib/course-page';
import { planHref } from '@/lib/tools/links';
import type { UnitSystem } from '@/lib/units';
import ByUnits from './ByUnits.client';
import { Fact, Said } from './Fact';
import RouteFace from './RouteFace';

/**
 * The night hero (the redesign spec, sections 4.3 and 7.10, cut under section 00): the race, when it is run, then the
 * reading: the share of its finishes with a sustained slowdown, the route as its face (with the climb), the sentence
 * that says where the share sits among the other courses (course.among; a course with fewer than three editions has
 * none), and, with three or more editions, the year strip to scrub them. The strip opens on the latest edition the source policy keeps, which
 * the readout names, and labels the highest and lowest; the label under the needle hides, since the readout says it.
 * One action: the planner for this course, an outline from 1180 px, where the header carries the orange "Plan your race".
 */
export default function CourseHero({ page }: { page: CoursePageData }) {
  const { city, display, race, summary: s, geometry, editions, months } = page;
  const reading = getNugget('course.slowdown', { city });
  const among = getNugget('course.among', { city });
  const climb = routeClimb(page);
  const years = s.years;
  const span = years.length > 1 ? `${years[0]}–${years[years.length - 1]}` : String(years[0] ?? '');
  const when = months.map((m) => MONTHS[m - 1]).join(' and ');
  const held = heldEditions();
  const kept = editions.filter((e) => !held.has(`${page.city}|${e.year}`));
  const latest = kept[kept.length - 1]?.year ?? editions[editions.length - 1]?.year;
  // The extremes among the editions the policy keeps: the strip labels these two.
  const extremes = kept.length > 1 ? [...new Set([kept.reduce((a, b) => (b.slowdown < a.slowdown ? b : a)).year, kept.reduce((a, b) => (b.slowdown > a.slowdown ? b : a)).year])] : [];
  const strip = (units: UnitSystem) => (
    <YearStrip
      editions={editions.map((e) => ({ year: e.year, value: e.slowdown, display: pct(e.slowdown), side: [hm(e.median_s / 60), e.temp === null ? '—' : temp(e.temp, units)] }))}
      selected={latest} sideLabels={['Median finish', 'At the start']}
      valueDomain={[0, Math.max(0.1, Math.ceil(Math.max(...editions.map((e) => e.slowdown)) * 10) / 10)]}
      extremeLabel={(p) => `${p.year} · ${p.display}`} labelled={extremes}
      label={`Sustained slowdown in ${display}, edition by edition, ${span}`} height={100} heightMd={168} />
  );
  return (
    <section className="night course-hero" data-track-section="hero">
      <div className="course-hero-head">
        <div className="reading-crumbs t-kicker course-crumbs"><ChapterCrumbs path={`/courses/${page.slug}`} /><span className="crumb-place"><Link href="/courses" className="crumb-courses">Courses</Link></span></div>
        <h1 className="course-title t-title">{race}</h1>
        <p className="hero-dek">{s.editions === 1 ? `One edition, ${span}` : `${s.editions} editions, ${span}`}{when ? ` · ${when}` : ''}</p>
      </div>
      <div className="course-hero-figure">
        {reading.figure ? <BigNumber value={reading.figure.value} unit={reading.figure.unit} sr={reading.figure.sr} size="xl" tone="night" /> : null}
        <p className="course-hero-key">of finishes had a <SlowdownTerm /></p>
      </div>
      {geometry ? (
        <figure className="course-hero-route">
          <RouteFace course={geometry} fit label={`The ${race} route`} />
          {climb ? <figcaption><Fact k={`${climb.key}.gain`} v={climb.gain_m}><Elevation metres={climb.gain_m} /></Fact> of climbing</figcaption> : null}
        </figure>
      ) : null}
      {/* What the share means: lower or higher than on how many other courses. Without three editions, no sentence. */}
      {among.guard ? <p className="course-hero-sentence t-sentence"><Said nugget={among} /></p> : null}
      {/* Two editions are two lollipops: their numbers are in "All numbers". */}
      {editions.length >= 3 ? <div className="course-hero-strip"><ByUnits mi={strip('mi')} km={strip('km')} /></div> : null}
      <div className="course-hero-actions">
        <Button href={planHref(city) ?? '/tools/plan'} arrow="right">Plan your {display}</Button>
      </div>
    </section>
  );
}
