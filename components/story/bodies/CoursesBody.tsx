import type { CourseGeometry, Courses, InsightsManifest } from '@/lib/insights';
import { count } from '@/lib/viz/format';
import { Fingerprints, NameThatCourse } from '../CoursesStory';
import { StoryMethods, StorySection } from '../StoryShell';
import { Pace, PerDegree, PerDegreeRange, Section, Temperature, TemperatureStep } from '../Units';
import { HeatCurve, HotCool, MatchedPace, PairsWaffle, Untangle } from '../WeatherStory';
import { EraArrows, YearsStrip } from '../YearsStory';

const pts = (v: number, digits = 1) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(digits)}`;

export default function CoursesBody({ data, geometry, manifest }: { data: Courses; geometry: CourseGeometry[]; manifest: InsightsManifest }) {
  const t = data.typical_curve;
  const byCity = (c: string) => data.courses.find((x) => x.city === c);
  const ny = byCity('New York');
  const boston = byCity('Boston');
  const shaped = data.courses.filter((c) => c.slowest_section);
  const usual = shaped.filter((c) => c.slowest_section === '35–40');
  const unusual = shaped.filter((c) => c.slowest_section !== '35–40').map((c) => c.city);
  const id = data.identification;
  const per = (c: string) => id.per_course.find((x) => x.city === c);
  const perfect = id.per_course.filter((x) => x.correct === x.editions && x.editions >= 5).map((x) => `${x.city} ${x.correct} of ${x.editions}`);
  const copenhagen = per('Copenhagen');
  const w = data.weather;
  const f = w.fits;
  const heat = w.heat_signature;
  const fin = w.curvature.finish_min_per_c;
  const at = (temp: number) => fin.find((x) => x.temp === temp)!;
  const cph = w.hot_cool.find((x) => x.city === 'Copenhagen');
  const band = data.matched.find((b) => b.lo_s === 300)!;
  const big = band.courses.filter((c) => c.finishes >= 1000 && c.editions >= 3);
  const low = big[0];
  const high = big[big.length - 1];
  const e = data.years.eras;
  const s = e.summary;
  const y2020 = data.years.by_year.find((r) => r.year === 2020);
  const recovery = data.years.recovery.filter((r) => ['New York', 'Berlin', 'London'].includes(r.city) && r.first_back_year === 2021 && r.first_back_n);
  const biggest = [...data.years.cells].sort((a, b) => b.n - a.n).slice(0, 3);
  return (
    <>
      <StorySection id="fingerprint" kicker="01 · The shape of a course" title={<>Every course bends the curve <em>in its own place</em>.</>}
        dek={<>On a typical course the median finisher runs <Section i={1} /> {Math.abs(t[1]).toFixed(1)}% faster than their own average pace and <Section i={7} /> {t[7].toFixed(1)}% slower.
          {ny ? <> New York runs <Section i={4} /> {Math.abs(ny.deviation![4]).toFixed(1)} points slower than typical, its most distinctive section.</> : null}
          {boston ? <> Boston&apos;s slowest 5 km section is <Section i={6} />. {usual.length} of {shaped.length} courses are slowest at <Section i={7} />; the exceptions are {unusual.join(' and ')}.</> : null}</>}>
        <Fingerprints data={data} geometry={geometry} />
      </StorySection>

      <StorySection id="name" kicker="02 · A course you can recognise" title={<>The shape alone <em>names the course</em>.</>}
        dek={<>Remove each race&apos;s overall fade, keep only where it ran faster or slower, and match it to the nearest course average built without it. That names the right
          course for {id.correct} of {id.editions_tested} editions ({Math.round((id.correct / id.editions_tested) * 100)}%), against {(id.chance * 100).toFixed(1)}% by chance: {perfect.join(', ')}.
          Some courses blur together{copenhagen ? <>: Copenhagen is named {copenhagen.correct} time{copenhagen.correct === 1 ? '' : 's'} in {copenhagen.editions}</> : null}.</>}>
        <NameThatCourse data={data} geometry={geometry} />
      </StorySection>

      <StorySection id="weather" kicker="03 · Same course, different day" title={<>Temperature hides <em>until you compare a course with itself</em>.</>}
        dek={<>Across all {w.cohort.editions} race editions, the start temperature explains about a tenth of the spread in sustained slowdown (R² {f.slowdown_across.r2.toFixed(2)}).
          Within each course it explains about a third (R² {f.slowdown_within.r2.toFixed(2)}): each degree warmer goes with <PerDegree perC={f.slowdown_within.slope} unit="points" /> of
          finishes in sustained slowdown (interval <PerDegreeRange lo={f.slowdown_within.ci95[0]} hi={f.slowdown_within.ci95[1]} />).</>}>
        <Untangle weather={{ editions: w.editions, fits: w.fits }} />
        <PairsWaffle data={data} />
      </StorySection>

      <StorySection id="heat" kicker="04 · Warmer mornings" title={<>Warmer mornings go with a <em>different shape</em>, not just a slower clock.</>}
        dek={<>For each <TemperatureStep c={10} /> warmer start on the same course, the median finisher&apos;s first 5 km runs {Math.abs(heat[0].per_10c).toFixed(1)} points faster than their own average
          and <Section i={7} /> runs {heat[7].per_10c.toFixed(1)} points slower. The finish-time difference grows with temperature: about <PerDegree perC={at(5).slope} unit="min" /> near <Temperature c={5} />,
          and <PerDegree perC={at(20).slope} unit="min" /> near <Temperature c={20} />.</>}>
        <HeatCurve data={data} />
        <HotCool data={data} />
        {cph ? <p className="story-aside">Copenhagen {cph.hot.year} started at <Temperature c={cph.hot.temp} /> and {(cph.hot.slowdown * 100).toFixed(0)}% of finishes had a sustained slowdown. Copenhagen {cph.cool.year} started at <Temperature c={cph.cool.temp} />: {(cph.cool.slowdown * 100).toFixed(0)}%.</p> : null}
      </StorySection>

      <StorySection id="matched" kicker="05 · Same early pace" title={<>The same start <em>ends differently</em> on different courses.</>}
        dek={<>Take finishes that ran 5–20 km at <Pace secondsPerKm={band.lo_s} /> to <Pace secondsPerKm={band.hi_s} />. In {low.city}, {(low.slowdown * 100).toFixed(0)}% then had a sustained slowdown.
          In {high.city}, {(high.slowdown * 100).toFixed(0)}% did. Courses differ in terrain, climate, field and timing, and all of it is folded in here.</>}>
        <MatchedPace data={data} />
      </StorySection>

      <StorySection id="years" kicker="06 · The years" title={<>Since the pandemic, <em>the front of the field</em> is faster.</>}
        dek={<>In the {e.high_coverage_courses.length} high-coverage courses with editions in both {e.pre[0]}–{String(e.pre[1]).slice(2)} and {e.post[0]}–{String(e.post[1]).slice(2)}, the 10th-percentile finish is
          {' '}{Math.abs(s.p10.change).toFixed(1)} minutes faster, and faster in all {s.p10.lower}. The 90th percentile has not clearly moved ({pts(s.p90.change)} min, interval {pts(s.p90.ci95[0])} to {pts(s.p90.ci95[1])}).</>}>
        <div className="bibs">
          <div className="bib"><span className="bib-tag">10th percentile</span><span className="bib-number">{pts(s.p10.change)} <small>min</small></span><span className="bib-text">faster in {s.p10.lower} of {e.high_coverage_courses.length} courses. Interval {pts(s.p10.ci95[0])} to {pts(s.p10.ci95[1])} min.</span></div>
          <div className="bib"><span className="bib-tag">Under 3:00</span><span className="bib-number">{pts(s.sub3.change * 100)} <small>pts</small></span><span className="bib-text">share of finishes under three hours, higher in {s.sub3.higher} of {e.high_coverage_courses.length} courses.</span></div>
          <div className="bib"><span className="bib-tag">2020</span><span className="bib-number">{y2020?.editions ?? 0} <small>editions</small></span><span className="bib-text">{count(y2020?.finishes ?? 0)} eligible finishes, against {count(data.years.by_year.find((r) => r.year === 2019)?.finishes ?? 0)} in 2019.</span></div>
        </div>
        <YearsStrip data={data} />
        <EraArrows data={data} />
        <p className="story-aside">
          {recovery.length ? <>{recovery.map((r) => r.city).join(', ').replace(/, ([^,]*)$/, ' and $1')} came back in 2021 at {recovery.map((r) => `${Math.round((r.first_back_n! / r.n2019) * 100)}%`).join(', ').replace(/, ([^,]*)$/, ' and $1')} of their 2019 fields.</> : null}
          {' '}The largest fields in the data came after: {biggest.map((c) => `${c.city} ${c.year} (${count(c.n)})`).join(', ')}.
          Start temperatures in these courses averaged <TemperatureStep c={s.temp.change} digits={1} /> warmer after the pandemic, so the faster front did not come with cooler mornings.
        </p>
      </StorySection>

      <StoryMethods manifest={manifest} files={['courses.json', 'course-geometry.json']} method={data.method}
        caveats={[
          'Course means the supplied city label, not a verified historical route. Route maps and elevation are the current supplied course files, and the elevation model misses bridge decks.',
          'Relative pace mixes terrain, field ability, weather and race behaviour. The typical curve is the median across courses.',
          `Weather is the supplied modelled hour at the scheduled start, at one point in each city. It is never personal or wave exposure. ${w.excluded.length} editions without a valid weather row are left out of the weather charts.`,
          'These are simple descriptive slopes. The prespecified weather screen in the existing analyses remains the adjusted analysis.',
          `${data.shape_cohort.start_offset_editions.length} editions whose first 5 km looks inflated (${[...new Set(data.shape_cohort.start_offset_editions.map((x) => x.city))].join(', ')}) are left out of every shape statistic.`,
          `Course identification was chosen among four variants, all reported in the data file (${Object.entries(id.variants).map(([k, v]) => `${k.toLowerCase()} ${Math.round(v * 100)}%`).join('; ')}).`,
          'Field size counts eligible finishes in this dataset, not official finishers. Recorded-gender gaps and changing eligibility shares affect some courses and years.',
          'Counts are race finishes, not unique people. Associations describe, they do not explain why.',
        ]} />
    </>
  );
}
