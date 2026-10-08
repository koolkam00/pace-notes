import { UnitLink as Link, MarathonDistance } from '@/components/UnitsProvider';
import AnalysisIndex from '@/components/AnalysisIndex';
import WeatherIndex from '@/components/WeatherIndex';
import { getAnalysisStart } from '@/lib/analysis-server';
import { count } from '@/lib/personalized';
import CreatorCredit from '@/components/CreatorCredit';
import { getStudyEvidence } from '@/lib/research-data';
import { clientArchetypes, getInsightsManifest, readInsight, replayChoices } from '@/lib/insights-server';
import { STORIES, capital, countWord, courseSpan, storyHref } from '@/lib/stories';
import { JsonLd, SITE_URL, finishesM, pageMetadata } from '@/lib/seo';
import { TOOLS, toolHref } from '@/lib/tools/registry';
import ToolIcon from '@/components/tools/ToolIcon';
import type { Archetypes, CourseGeometry, Courses, Demographics, FinishTimes, Positions, ReplayIndex } from '@/lib/insights';
import { Untangle } from '@/components/story/WeatherStory';
import { GhostRace } from '@/components/story/DemographicsStory';
import { BreakEven, GapGauge } from '@/components/story/PlacesStory';
import ArchetypeChapter from '@/components/story/ArchetypeChapter';
import { PacingBarcode, WhichArchetype } from '@/components/story/ArchetypeStory';
import HeroReplay from '@/components/story/HeroReplay';
import { StoryData } from '@/components/story/StoryData';
import RunnerLane from '@/components/art/RunnerLane';
import { FinishHistogram, Rescue, SecondsLens } from '@/components/story/FinishTimeStory';
import { Checkpoint, Distance, PerDegree, Section, TemperatureStep } from '@/components/story/Units';

const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];

/** The site description, with every number read from the verified story data. */
function homeDescription() {
  const span = courseSpan();
  const where = span ? ` at ${getInsightsManifest().cohort.cities} marathons, ${span.first}–${span.last},` : '';
  return `How ${finishesM()} million recorded finishes${where} were paced: data stories, free pacing tools and course pages. By Andrew Kam.`;
}

export function generateMetadata() {
  return pageMetadata({ title: `Pace Notes: Marathon Pacing from ${finishesM()} Million Finishes`, description: homeDescription(), path: '/' });
}

export default function Page() {
  const { summary } = getAnalysisStart();
  const study = getStudyEvidence();
  if (!study || study.n !== summary.n || !Number.isSafeInteger(study.cohort.raw) || study.cohort.raw < summary.n) {
    throw new Error('Homepage record totals must match the current analytical cohort.');
  }
  const manifest = getInsightsManifest();
  const replay = readInsight<ReplayIndex>('replay.json');
  const finish = readInsight<FinishTimes>('finish-times.json');
  const types = clientArchetypes(readInsight<Archetypes>('archetypes.json'));
  const metronome = types.archetypes[0];
  const cliff = types.archetypes[4];
  const cliffRepeat = types.transitions.rows[4];
  const places = readInsight<Positions>('positions.json');
  const coin30 = places.coin_flip['30'].find((r) => r.gap_lo_s === 60)!;
  const demo = readInsight<Demographics>('demographics.json');
  const geometry = readInsight<{ courses: CourseGeometry[] }>('course-geometry.json');
  const routes = new Map(geometry.courses.map((c) => [c.city, { points: c.route, km: c.route_km }]));
  const choices = replayChoices(replay.editions, manifest, routes);
  const berlin = replay.editions.find((e) => e.city === 'Berlin') ?? replay.editions[0];
  const at3 = berlin.snapshots.find((s) => s.clock_s === 10800)!;
  const three = finish.marks.find((m) => m.minutes === 180)!;
  const four = finish.bubble.find((b) => b.minutes === 240)!;
  const years = manifest.cohort;
  const courses = manifest.files['courses.json'] ? readInsight<Courses>('courses.json') : null;
  const stories = STORIES.filter((s) => manifest.files[s.file]);
  const tools = TOOLS.filter((t) => !t.file || manifest.files[t.file]);
  const toolCohort = manifest.files['tools/projector.json'] ? readInsight<{ cohort_n: number }>('tools/projector.json').cohort_n : null;
  const span = courseSpan();
  /** Race years the course data covers, counted inclusively (2005–2026 is 22 years). */
  const yearsCovered = span ? span.last - span.first + 1 : null;
  /** The number of pacing types, in words where it has one. */
  const typeCount = countWord(types.archetypes.length) ?? String(types.archetypes.length);
  /** The minute before the round-number mark that stands tallest against the smooth curve (2:59 before 3:00). */
  const tallest = finish.marks.reduce((a, m) => (m.ratio > a.ratio ? m : a), finish.marks[0]);
  const tallestMinute = `${Math.floor((tallest.minutes - 1) / 60)}:${String((tallest.minutes - 1) % 60).padStart(2, '0')}`;
  const website = {
    '@context': 'https://schema.org', '@type': 'WebSite', name: 'Pace Notes', alternateName: 'splithappens.run', url: `${SITE_URL}/`,
    inLanguage: 'en', description: homeDescription(), creator: { '@type': 'Person', name: 'Andrew Kam' },
  };
  return <><StoryData value={{ archetypes: types, finish, positions: places }}><div className="home">
    <section className="night night-grain bleed hero" aria-labelledby="hero-title">
      <div className="container hero-inner">
        <div className="hero-head">
          <p className="eyebrow">Pace Notes · {count(manifest.analysis_n)} marathon finishes · {years.cities} cities{span ? ` · ${span.first}–${span.last}` : ''}</p>
          <h1 id="hero-title" className="hero-title">The same <MarathonDistance />, run <em>{finishesM()}&nbsp;million</em> ways.</h1>
        </div>
        <div className="hero-side">
          <p className="hero-dek">Every recorded 5 km split from {yearsCovered ? `${yearsCovered} years of ` : ''}big-city marathons. Press play to watch a real field spread out, then see where races are <strong>held together</strong>, where they <strong>come apart</strong> and where finishes <strong>slip under round numbers in the final minutes</strong>.</p>
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
          <a className="bib on-night" href="#finish-times"><span className="bib-tag">The 2:59 tower</span><span className="bib-number">{three.ratio.toFixed(2)}×</span><span className="bib-text">as many finishes in the minute before 3:00 as a smooth curve expects.</span></a>
          <a className="bib on-night" href="#rescue"><span className="bib-tag">Under 4:00 after <Checkpoint km={40} /></span><span className="bib-number">≈{count(Math.round(four.over.extra_under / 100) * 100)}</span><span className="bib-text">more sub-4:00 finishes than comparable late-race positions would suggest.</span></a>
          <Link className="bib on-night" href="/slowdown"><span className="bib-tag">Sustained slowdown</span><span className="bib-number">{study.rate.toFixed(1)}%</span><span className="bib-text">of the {count(study.n)} finishes in the ten analyses include at least 5 km, after 20 km, run 25% or more slower than their own 5–20 km pace.</span></Link>
          <div className="bib on-night"><span className="bib-tag">Race clock 3:00</span><span className="bib-number"><Distance km={at3.median_km} /></span><span className="bib-text">how far the median {berlin.city} {berlin.year} finisher had run when the race clock read 3:00.</span></div>
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
        <h2 id="pacing-types-title" className="chapter-title">{capital(typeCount)} ways to run <em>the same race</em>.</h2>
        <p className="chapter-dek">Strip away the finish time and every marathon has a shape: the rhythm of nine recorded sections against the runner&apos;s own average. Grouping {count(types.cohort_n)} of those shapes reveals {typeCount} recurring types.</p>
      </div>
      <div className="nugget">
        <span className="nugget-number">{(metronome.share * 100).toFixed(0)}%</span>
        <p className="nugget-text">of finishes are <strong>Metronomes</strong>, holding within a couple of percent of their own average pace to <Checkpoint km={40} />. The most common shape is the <strong>Gentle fader</strong> ({(types.archetypes[1].share * 100).toFixed(0)}%), and {(cliff.share * 100).toFixed(1)}% run a <strong>Cliff</strong>: fast to <Checkpoint km={25} />, then about {Math.round(cliff.profile[7] / 5) * 5}% slower than average over <Section i={7} />.</p>
      </div>
      <div className="chapter-body"><ArchetypeChapter /></div>
      <div className="chapter-grid chapter-body">
        <PacingBarcode />
        <div className="chapter-aside">
          <div className="bib"><span className="bib-tag">Habits repeat</span><span className="bib-number">{((cliffRepeat.repeat_share ?? 0) / cliffRepeat.overall_share).toFixed(1)}×</span><span className="bib-text">After a Cliff race, the next linked race is a Cliff {((cliffRepeat.repeat_share ?? 0) * 100).toFixed(0)}% of the time, against {(cliffRepeat.overall_share * 100).toFixed(1)}% of all next races.</span></div>
          <div className="bib"><span className="bib-tag">Same finish band</span><span className="bib-number">{(types.gender.men.standardized_shares[4] / types.gender.women.standardized_shares[4]).toFixed(1)}×</span><span className="bib-text">Cliffs are {(types.gender.men.standardized_shares[4] * 100).toFixed(1)}% of men&apos;s finishes and {(types.gender.women.standardized_shares[4] * 100).toFixed(1)}% of women&apos;s once finish times are matched.</span></div>
          <div className="note">Types are assigned after the race from its own splits. They describe shapes, not physiology or advice, and profiles form a continuum: many races sit between two types.</div>
        </div>
      </div>
      <div className="chapter-body"><WhichArchetype /></div>
      <Link className="chapter-more" href="/stories/pacing-types">Explore all {typeCount} pacing types <span aria-hidden="true">→</span></Link>
    </section>

    <section id="finish-times" className="chapter" aria-labelledby="finish-times-title">
      <div className="chapter-head">
        <p className="chapter-num">Chapter 02 · Round numbers</p>
        <h2 id="finish-times-title" className="chapter-title">The <em>3:59</em> effect.</h2>
        <p className="chapter-dek">Finish times are not smooth. In the minutes before each hour and half-hour, the field piles up against the clock, then thins out just after it. Against a smooth curve, the tallest tower stands at {tallestMinute}.</p>
      </div>
      <div className="nugget">
        <span className="nugget-number">{count(three.minute_before)}</span>
        <p className="nugget-text">finishes landed between <strong>2:59:00 and 2:59:59</strong>. A smooth curve fitted around the mark expects about {count(Math.round(three.expected_minute_before))}, and the next minute holds only {count(three.minute_after)}.</p>
      </div>
      <div className="chapter-body"><FinishHistogram /></div>
      <div className="chapter-grid chapter-body">
        <SecondsLens />
        <div className="chapter-aside">
          <div className="bib"><span className="bib-tag">Across every hour and half-hour</span><span className="bib-number">≈{count(Math.round(finish.total_excess_hour_half_hour / 1000) * 1000)}</span><span className="bib-text">finishes sit in the five minutes before a mark beyond what the smooth curve expects, {(100 * finish.total_excess_hour_half_hour / manifest.analysis_n).toFixed(1)}% of the field.</span></div>
          <div className="note">These are observed finishing patterns. Goals, pacers and pace bands are not recorded, so the data cannot say why any runner sped up, only that the field bunches before round numbers.</div>
        </div>
      </div>
      <div id="rescue" className="chapter-body"><Rescue /></div>
      <Link className="chapter-more" href="/stories/round-numbers">The full round-number story <span aria-hidden="true">→</span></Link>
    </section>

    <section id="places" className="chapter" aria-labelledby="places-title">
      <div className="chapter-head">
        <p className="chapter-num">Chapter 03 · Places on the clock</p>
        <h2 id="places-title" className="chapter-title">At <Checkpoint km={30} />, a minute is <em>nearly a coin flip</em>.</h2>
        <p className="chapter-dek">The order of a marathon field keeps changing long after <Checkpoint km={20} />. Most finishes slowed after <Checkpoint km={30} />; the ones that moved up the clock order were those that slowed less than the finishes around them.</p>
      </div>
      <div className="nugget">
        <span className="nugget-number">{Math.round(coin30.share * 100)}%</span>
        <p className="nugget-text">of the time, a finish <strong>60–90 seconds behind another at <Checkpoint km={30} /></strong> still crossed the line first. There are about {(places.sinker_share / places.surger_share).toFixed(0)} late sinkers for every late surger, and women gained on men after <Checkpoint km={30} /> in <strong>all {places.women_ahead_editions} race editions</strong> compared.</p>
      </div>
      <div className="chapter-body"><GapGauge /></div>
      <div className="chapter-body"><BreakEven /></div>
      <Link className="chapter-more" href="/stories/places">More on places gained and lost <span aria-hidden="true">→</span></Link>
    </section>

    <section id="who-holds-pace" className="chapter" aria-labelledby="who-title">
      <div className="chapter-head">
        <p className="chapter-num">Chapter 04 · Gender and age</p>
        <h2 id="who-title" className="chapter-title">Same finish time, <em>different race</em>.</h2>
        <p className="chapter-dek">Compare recorded women and men who finished the same race in the same minute. The men were well ahead at <Checkpoint km={20} />; the women caught them by the line.</p>
      </div>
      <div className="nugget">
        <span className="nugget-number">{(demo.overall.men_slowdown / demo.overall.women_slowdown).toFixed(1)}×</span>
        <p className="nugget-text">as many matched men&apos;s finishes as women&apos;s had a <strong>sustained slowdown</strong> ({(demo.overall.men_slowdown * 100).toFixed(0)}% against {(demo.overall.women_slowdown * 100).toFixed(0)}%). The gap appears at almost every finish time, and every women&apos;s age group paces more evenly than every men&apos;s.</p>
      </div>
      <div className="chapter-body"><GhostRace data={demo} /></div>
      <Link className="chapter-more" href="/stories/who-holds-pace">See the gap at every finish time and age <span aria-hidden="true">→</span></Link>
    </section>

    {courses ? <section id="courses-weather" className="chapter" aria-labelledby="courses-weather-title">
      <div className="chapter-head">
        <p className="chapter-num">Chapter 05 · Courses and weather</p>
        <h2 id="courses-weather-title" className="chapter-title">Same course, <em>warmer morning</em>.</h2>
        <p className="chapter-dek">Pool every race and the start temperature barely seems to matter. Compare each course only with itself and a clear pattern appears: warmer editions of the same course had more finishes with a sustained slowdown.</p>
      </div>
      <div className="nugget">
        <span className="nugget-number">{courses.weather.pairs.hotter_slowed_more}<small>/{courses.weather.pairs.total}</small></span>
        <p className="nugget-text">same-course pairs of editions at least <TemperatureStep c={courses.weather.pairs.min_gap_c} /> apart where the <strong>warmer one had more sustained slowdown</strong>. Within a course, the share with a sustained slowdown rises about <PerDegree perC={courses.weather.fits.slowdown_within.slope} unit="points" />. Pairs share editions, so they are not independent tests.</p>
      </div>
      <div className="chapter-body"><Untangle weather={{ editions: courses.weather.editions, fits: courses.weather.fits }} /></div>
      <Link className="chapter-more" href="/stories/courses">Course fingerprints, heat and {yearsCovered ? `${yearsCovered} years of ` : ''}races <span aria-hidden="true">→</span></Link>
    </section> : null}

    <section id="all-stories" className="chapter" aria-labelledby="all-stories-title">
      <div className="chapter-head">
        <p className="chapter-num">Keep reading</p>
        <h2 id="all-stories-title" className="chapter-title">{WORDS[stories.length] ?? stories.length} stories, <em>one set of race records</em>.</h2>
        <p className="chapter-dek">Each story starts with one finding you can say out loud, then hands you the evidence to explore.</p>
      </div>
      <ol className="story-grid home-story-grid">
        {stories.map((s) => (
          <li key={s.slug}>
            <Link href={storyHref(s)} className="story-card" style={{ ['--story' as string]: s.accent }}>
              <span className="story-card-number">{s.number}</span>
              <span className="story-card-kicker">{s.kicker}</span>
              <span className="story-card-title">{s.title}</span>
              <span className="story-card-dek">{s.dek}</span>
              <span className="story-card-go">Read the story <span aria-hidden="true">→</span></span>
            </Link>
          </li>
        ))}
      </ol>
    </section>

    {tools.length ? <section id="tools" className="chapter home-tools" aria-labelledby="tools-title">
      <div className="chapter-head">
        <p className="chapter-num">Runner tools</p>
        <h2 id="tools-title" className="chapter-title">Plan your next race on <em>real</em> finishes.</h2>
        <p className="chapter-dek">Most calculators assume you will hold your pace to the finish. These pair exact calculations and published research with what {toolCohort ? `${(toolCohort / 1e6).toFixed(2)} million` : 'millions of'} recorded finishes actually did, and label which is which.</p>
      </div>
      <ul className="home-tools-grid">
        {tools.map((t) => (
          <li key={t.slug}>
            <Link href={toolHref(t)} className="home-tool" style={{ ['--tool' as string]: t.accent }}>
              <ToolIcon slug={t.slug} className="home-tool-icon" />
              <span className="home-tool-title">{t.title}</span>
              <span className="home-tool-short">{t.short}</span>
            </Link>
          </li>
        ))}
      </ul>
      <Link className="chapter-more" href="/tools">All runner tools <span aria-hidden="true">→</span></Link>
    </section> : null}

    <section id="the-ten" className="chapter home-analyses" aria-labelledby="the-ten-title">
      <div className="chapter-head">
        <p className="chapter-num">Now make it yours</p>
        <h2 id="the-ten-title" className="chapter-title">Ten questions for your next race.</h2>
        <p className="chapter-dek">Ranked by how useful they are to a runner and how strong the evidence is. Pick a course, a time and an age group, and every answer recalculates from the same {count(summary.n)} eligible finishes. The stories above also leave out {manifest.duplicate_edition_screen.map((d) => `${d.city} ${d.year}`).join(' and ')}, whose records duplicate {manifest.duplicate_edition_screen[0]?.city} {manifest.duplicate_edition_screen[0]?.duplicate_of}, leaving {count(manifest.analysis_n)}.</p>
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
  </div></StoryData><JsonLd data={website} /></>;
}
