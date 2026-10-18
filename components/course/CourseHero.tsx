import BigNumber from '@/components/ui/BigNumber';
import Button from '@/components/ui/Button';
import { ChapterCrumbs } from '@/components/ui/ChapterHeader';
import { UnitLink as Link } from '@/components/UnitsProvider';
import { Elevation } from '@/components/story/Units';
import { SlowdownTerm } from '@/components/tools/EvidenceTag';
import YearStrip from '@/components/viz/YearStrip';
import { getNugget } from '@/lib/nuggets';
import { hm, pct, temp } from '@/lib/nuggets/format';
import { MONTHS, routeClimb, type CoursePageData } from '@/lib/course-page';
import { planHref } from '@/lib/tools/links';
import type { UnitSystem } from '@/lib/units';
import ByUnits from './ByUnits.client';
import { Fact, Said } from './Fact';
import RouteFace from './RouteFace';

/**
 * The night hero (the redesign spec, sections 4.3 and 7.10, cut under section 00): the race, when it is run, then the
 * reading: the share of its finishes with a sustained slowdown, the route as its face (with the climb), the sentence
 * that says how far the share ran edition by edition, and the year strip to scrub them (opening on the highest edition,
 * which the readout names; the lowest the sentence names is labelled). One action: the planner for this course, an
 * outline from 1180 px, where the header carries the orange "Plan your race".
 */
export default function CourseHero({ page }: { page: CoursePageData }) {
  const { city, display, race, summary: s, geometry, editions, months } = page;
  const reading = getNugget('course.slowdown', { city });
  const climb = routeClimb(page);
  const years = s.years;
  const span = years.length > 1 ? `${years[0]}–${years[years.length - 1]}` : String(years[0] ?? '');
  const when = months.map((m) => MONTHS[m - 1]).join(' and ');
  const hi = Number(reading.values.hi_year), lo = Number(reading.values.lo_year);
  const strip = (units: UnitSystem) => (
    <YearStrip
      editions={editions.map((e) => ({ year: e.year, value: e.slowdown, display: pct(e.slowdown), side: [hm(e.median_s / 60), e.temp === null ? '—' : temp(e.temp, units)] }))}
      selected={editions.some((e) => e.year === hi) ? hi : editions[editions.length - 1]?.year}
      sideLabels={['Median finish', 'At the start']}
      valueDomain={[0, Math.max(0.1, Math.ceil(Math.max(...editions.map((e) => e.slowdown)) * 10) / 10)]}
      average={s.slowdown} averageLabel="Average edition" extremeLabel={(p) => `${p.year} · ${p.display}`} labelSelected={false} named={reading.guard ? [lo] : []}
      label={`Sustained slowdown in ${display}, edition by edition, ${span}`} height={100} heightMd={168} />
  );
  return (
    <section className="night course-hero" data-track-section="hero">
      <div className="course-hero-head">
        <div className="reading-crumbs t-kicker course-crumbs"><ChapterCrumbs path={`/courses/${page.slug}`} /><span className="crumb-place">· <Link href="/courses" className="crumb-courses">Courses</Link></span></div>
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
      {/* Without its range (one edition, or ends the page never names) the sentence would only repeat the dek. */}
      {reading.guard ? <p className="course-hero-sentence t-sentence"><Said nugget={reading} /></p> : null}
      {editions.length > 1 ? <div className="course-hero-strip"><ByUnits mi={strip('mi')} km={strip('km')} /></div> : null}
      <div className="course-hero-actions">
        <Button href={planHref(city) ?? '/tools/plan'} arrow="right">Plan your {display}</Button>
      </div>
    </section>
  );
}
