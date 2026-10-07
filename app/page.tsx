import { UnitLink as Link, MarathonDistance } from '@/components/UnitsProvider';
import AnalysisIndex from '@/components/AnalysisIndex';
import WeatherIndex from '@/components/WeatherIndex';
import { getAnalysisStart } from '@/lib/analysis-server';
import { count } from '@/lib/personalized';
import CreatorCredit from '@/components/CreatorCredit';
import { getStudyEvidence } from '@/lib/research-data';
import { getInsightsManifest, readInsight } from '@/lib/insights-server';
import type { Archetypes, CourseGeometry, FinishTimes, Positions, ReplayIndex } from '@/lib/insights';
import { BreakEven, GapGauge } from '@/components/story/PlacesStory';
import ArchetypeChapter from '@/components/story/ArchetypeChapter';
import { PacingBarcode, WhichArchetype } from '@/components/story/ArchetypeStory';
import HeroReplay, { type ReplayChoice } from '@/components/story/HeroReplay';
import RunnerLane from '@/components/art/RunnerLane';
import { FinishHistogram, Rescue, SecondsLens } from '@/components/story/FinishTimeStory';
import { Distance } from '@/components/story/Units';

export default function Page() {
  const { summary } = getAnalysisStart();
  const study = getStudyEvidence();
  if (!study || study.n !== summary.n || !Number.isSafeInteger(study.cohort.raw) || study.cohort.raw < summary.n) {
    throw new Error('Homepage record totals must match the current analytical cohort.');
  }
  const manifest = getInsightsManifest();
  const replay = readInsight<ReplayIndex>('replay.json');
  const finish = readInsight<FinishTimes>('finish-times.json');
  const types = readInsight<Archetypes>('archetypes.json');
  const metronome = types.archetypes[0];
  const cliff = types.archetypes[4];
  const cliffRepeat = types.transitions.rows[4];
  const places = readInsight<Positions>('positions.json');
  const coin30 = places.coin_flip['30'].find((r) => r.gap_lo_s === 60)!;
  const geometry = readInsight<{ courses: CourseGeometry[] }>('course-geometry.json');
  const routes = new Map(geometry.courses.map((c) => [c.city, { points: c.route, km: c.route_km }]));
  const choices: ReplayChoice[] = replay.editions.map((e) => ({ ...e, version: manifest.files[e.file].sha256, route: routes.get(e.city) ?? null }));
  const berlin = replay.editions.find((e) => e.city === 'Berlin') ?? replay.editions[0];
  const at3 = berlin.snapshots.find((s) => s.clock_s === 10800)!;
  const three = finish.marks.find((m) => m.minutes === 180)!;
  const four = finish.bubble.find((b) => b.minutes === 240)!;
  const years = manifest.cohort;
  return <div className="home">
    <section className="night night-grain bleed hero" aria-labelledby="hero-title">
      <div className="container hero-inner">
        <div className="hero-head">
          <p className="eyebrow">Pace Notes · {count(manifest.analysis_n)} marathon finishes · {years.cities} cities · 2005–2026</p>
          <h1 id="hero-title" className="hero-title">The same <MarathonDistance />, run <em>3.4&nbsp;million</em> ways.</h1>
        </div>
        <div className="hero-side">
          <p className="hero-dek">Every recorded 5 km split from two decades of big-city marathons. Press play to watch a real field spread out, then see where races are <strong>held together</strong>, where they <strong>come apart</strong> and where they are <strong>rescued in the final minutes</strong>.</p>
          <div className="hero-actions">
            <a className="button-accent" href="#pacing-types">Start the story <span aria-hidden="true">↓</span></a>
            <Link className="button-secondary" href="/runners">Find your own race</Link>
          </div>
          <CreatorCredit />
        </div>
        <HeroReplay choices={choices} initial={berlin.slug} />
      </div>
      <div className="container">
        <div className="bibs hero-bibs">
          <a className="bib on-night" href="#finish-times"><span className="bib-tag">The 3:59 effect</span><span className="bib-number">{three.ratio.toFixed(2)}×</span><span className="bib-text">as many finishes in the minute before 3:00 as a smooth curve expects.</span></a>
          <a className="bib on-night" href="#rescue"><span className="bib-tag">Rescued at 40 km</span><span className="bib-number">≈{count(Math.round(four.over.extra_under / 100) * 100)}</span><span className="bib-text">extra sub-4:00 finishes than comparable late-race positions would suggest.</span></a>
          <Link className="bib on-night" href="/slowdown"><span className="bib-tag">Sustained slowdown</span><span className="bib-number">{study.rate.toFixed(1)}%</span><span className="bib-text">of eligible finishes include a stretch at least 25% slower than the 5–20 km pace.</span></Link>
          <div className="bib on-night"><span className="bib-tag">Race clock 3:00</span><span className="bib-number"><Distance km={at3.median_km} /></span><span className="bib-text">where the median {berlin.city} {berlin.year} finisher had reached when the race clock read 3:00.</span></div>
        </div>
      </div>
      <RunnerLane dark className="hero-lane" height={110} runners={[
        { finishMinutes: 150, label: '2:30' }, { finishMinutes: 195, label: '3:15' }, { finishMinutes: 240, label: '4:00' },
        { finishMinutes: 285, label: '4:45' }, { finishMinutes: 330, label: '5:30' }, { finishMinutes: 390, label: '6:30' },
      ]} />
    </section>

    <section id="pacing-types" className="chapter" aria-labelledby="pacing-types-title">
      <div className="chapter-head">
        <p className="chapter-num">Chapter 01 · The shape of a marathon</p>
        <h2 id="pacing-types-title" className="chapter-title">Six ways to run <em>the same race</em>.</h2>
        <p className="chapter-dek">Strip away the finish time and every marathon has a shape: the rhythm of nine recorded sections against the runner&apos;s own average. Grouping {count(types.cohort_n)} of those shapes reveals six recurring types.</p>
      </div>
      <div className="nugget">
        <span className="nugget-number">{(metronome.share * 100).toFixed(0)}%</span>
        <p className="nugget-text">of finishes are <strong>Metronomes</strong>, holding within a couple of percent of their own average pace to 40 km. The most common shape is the <strong>Gentle fader</strong> ({(types.archetypes[1].share * 100).toFixed(0)}%), and {(cliff.share * 100).toFixed(1)}% run a <strong>Cliff</strong>: fast to 25 km, then about 40% slower than average over 35–40 km.</p>
      </div>
      <div className="chapter-body"><ArchetypeChapter data={types} /></div>
      <div className="chapter-grid chapter-body">
        <PacingBarcode data={types} />
        <div className="chapter-aside">
          <div className="bib"><span className="bib-tag">Habits repeat</span><span className="bib-number">{((cliffRepeat.repeat_share ?? 0) / cliffRepeat.overall_share).toFixed(1)}×</span><span className="bib-text">After a Cliff race, the next linked race is a Cliff {((cliffRepeat.repeat_share ?? 0) * 100).toFixed(0)}% of the time, against {(cliffRepeat.overall_share * 100).toFixed(1)}% of all next races.</span></div>
          <div className="bib"><span className="bib-tag">Same finish band</span><span className="bib-number">{(types.gender.men.standardized_shares[4] / types.gender.women.standardized_shares[4]).toFixed(1)}×</span><span className="bib-text">Cliffs are {(types.gender.men.standardized_shares[4] * 100).toFixed(1)}% of men&apos;s finishes and {(types.gender.women.standardized_shares[4] * 100).toFixed(1)}% of women&apos;s once finish times are matched.</span></div>
          <div className="note">Types are assigned after the race from its own splits. They describe shapes, not physiology or advice, and profiles form a continuum: many races sit between two types.</div>
        </div>
      </div>
      <div className="chapter-body"><WhichArchetype data={types} /></div>
      <a className="chapter-more" href="/stories/pacing-types">Explore all six pacing types <span aria-hidden="true">→</span></a>
    </section>

    <section id="finish-times" className="chapter" aria-labelledby="finish-times-title">
      <div className="chapter-head">
        <p className="chapter-num">Chapter 02 · Round numbers</p>
        <h2 id="finish-times-title" className="chapter-title">The <em>3:59</em> effect.</h2>
        <p className="chapter-dek">Finish times are not smooth. In the minutes before each hour and half-hour, the field piles up against the clock, then thins out just after it. The tallest tower stands at 2:59.</p>
      </div>
      <div className="nugget">
        <span className="nugget-number">{count(three.minute_before)}</span>
        <p className="nugget-text">finishes landed between <strong>2:59:00 and 2:59:59</strong>. A smooth curve fitted around the mark expects about {count(three.expected_minute_before)}, and the next minute holds only {count(three.minute_after)}.</p>
      </div>
      <div className="chapter-body"><FinishHistogram data={finish} /></div>
      <div className="chapter-grid chapter-body">
        <SecondsLens data={finish} />
        <div className="chapter-aside">
          <div className="bib"><span className="bib-tag">Across every hour and half-hour</span><span className="bib-number">≈{count(Math.round(finish.total_excess_hour_half_hour / 1000) * 1000)}</span><span className="bib-text">finishes sit in the five minutes before a mark beyond what the smooth curve expects, {(100 * finish.total_excess_hour_half_hour / manifest.analysis_n).toFixed(1)}% of the field.</span></div>
          <div className="note">These are observed finishing patterns. Goals, pacers and pace bands are not recorded, so the data cannot say why any runner sped up, only that the field bunches before round numbers.</div>
        </div>
      </div>
      <div id="rescue" className="chapter-body"><Rescue data={finish} /></div>
      <Link className="chapter-more" href="/stories/round-numbers">The full round-number story <span aria-hidden="true">→</span></Link>
    </section>

    <section id="places" className="chapter" aria-labelledby="places-title">
      <div className="chapter-head">
        <p className="chapter-num">Chapter 03 · Places on the clock</p>
        <h2 id="places-title" className="chapter-title">At 30 km, a minute is <em>a coin flip</em>.</h2>
        <p className="chapter-dek">The order of a marathon field keeps changing long after halfway. Most runners slow after 30 km, so what matters for places is how much you slow compared with everyone around you.</p>
      </div>
      <div className="nugget">
        <span className="nugget-number">{Math.round(coin30.share * 100)}%</span>
        <p className="nugget-text">of the time, a finish <strong>60–90 seconds behind another at 30 km</strong> still crossed the line first. There are about {(places.sinker_share / places.surger_share).toFixed(0)} late sinkers for every late surger, and women gained on men after 30 km in <strong>all {places.women_ahead_editions} race editions</strong> compared.</p>
      </div>
      <div className="chapter-body"><GapGauge data={places} /></div>
      <div className="chapter-body"><BreakEven data={places} /></div>
      <a className="chapter-more" href="/stories/places">More on places gained and lost <span aria-hidden="true">→</span></a>
    </section>

    <section id="the-ten" className="chapter home-analyses" aria-labelledby="the-ten-title">
      <div className="chapter-head">
        <p className="chapter-num">Now make it yours</p>
        <h2 id="the-ten-title" className="chapter-title">Ten questions for your next race.</h2>
        <p className="chapter-dek">Ranked by how useful they are to a runner and how strong the evidence is. Pick a course, a time and an age group, and every answer recalculates from the same {count(summary.n)} eligible finishes.</p>
      </div>
      <div className="chapter-body"><AnalysisIndex /></div>
    </section>
    <WeatherIndex />
    <section className="night bleed cta-band-wrap" aria-labelledby="cta-title">
      <div className="container cta-band">
        <div>
          <p className="eyebrow">Your splits are in here</p>
          <h2 id="cta-title">Find your race among {(study.cohort.raw / 1e6).toFixed(2)} million records.</h2>
          <p>Search a recorded name, choose your races and see how your pacing compares with the runners who finished around you. Everything is free to explore and download.</p>
          <div className="hero-actions"><Link className="button-accent" href="/runners">Find a runner</Link><Link className="button-secondary" href="/request-analysis">Request an analysis</Link></div>
        </div>
        <RunnerLane dark height={150} crossing={20} runners={[{ finishMinutes: 210 }, { finishMinutes: 255 }, { finishMinutes: 300 }]} />
      </div>
    </section>
    <section className="home-purpose"><p className="eyebrow">Why this study exists</p><div><h2>A finish time is only part of the story.</h2><p>Pace Notes looks at the distance between the start and the finish. It makes race patterns easier to explore, so runners can ask better questions about their own marathons.</p><p>{count(study.cohort.raw)} race records are in the database; {count(summary.n)} pass the timing and race-quality checks used by the analyses. Counts are finishes, not unique runners.</p><Link className="text-link" href="/methodology#data-quality">Why the totals differ <span aria-hidden="true">↗</span></Link></div></section>
  </div>;
}
