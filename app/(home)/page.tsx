// The home page lives in the (home) route group, not at app/page.tsx: Next.js 14 hands pages under app/ the client
// chunks of a page in a parent folder for any client component they share, so with this file at app/page.tsx /privacy,
// /htw and /runners loaded the home page's charts (about 37 KB gzipped). The route group keeps the URL `/`.
import { UnitLink as Link, MarathonDistance } from '@/components/UnitsProvider';
import CreatorCredit from '@/components/CreatorCredit';
import { assertCohortTotals } from '@/components/CohortNote';
import StoryCards from '@/components/StoryCards';
import HomeDoors from '@/components/home/HomeDoors';
import HeroReplay from '@/components/story/HeroReplay';
import RunnerLane from '@/components/art/RunnerLane';
import { getCourseNames } from '@/lib/course-data';
import { getPersonalSummary } from '@/lib/personalized-data';
import { getStudyEvidence } from '@/lib/research-data';
import { getInsightsManifest, readInsight, replayChoices } from '@/lib/insights-server';
import { STORIES, capital, countWord, courseSpan } from '@/lib/stories';
import { JsonLd, SITE_URL, finishesM, pageMetadata } from '@/lib/seo';
import { TEN_ANALYSES } from '@/lib/ten-analyses';
import { courseSlug } from '@/lib/tools/links';
import type { CourseGeometry, ReplayIndex } from '@/lib/insights';

/** The three stories the home page shows, in this order; the rest are on /research and /stories. */
const TEASER = ['pacing-types', 'round-numbers', 'courses'];

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
  const study = getStudyEvidence();
  const summary = getPersonalSummary();
  if (!study || !summary || study.n !== summary.n || !Number.isFinite(study.rate)) {
    throw new Error('Homepage record totals must match the current analytical cohort.');
  }
  assertCohortTotals();
  const manifest = getInsightsManifest();
  const replay = readInsight<ReplayIndex>('replay.json');
  const geometry = readInsight<{ courses: CourseGeometry[] }>('course-geometry.json');
  const routes = new Map(geometry.courses.map((c) => [c.city, { points: c.route, km: c.route_km }]));
  const choices = replayChoices(replay.editions, manifest, routes);
  const berlin = replay.editions.find((e) => e.city === 'Berlin') ?? replay.editions[0];
  const span = courseSpan();
  const stories = STORIES.filter((s) => manifest.files[s.file]);
  const teaser = TEASER.map((slug) => stories.find((s) => s.slug === slug)).filter((s): s is (typeof stories)[number] => Boolean(s));
  const storyWord = capital(countWord(stories.length) ?? String(stories.length));
  const analysisWord = countWord(TEN_ANALYSES.length) ?? String(TEN_ANALYSES.length);
  const courses = getCourseNames().map((city) => ({ city, slug: courseSlug(city) }));
  const website = {
    '@context': 'https://schema.org', '@type': 'WebSite', name: 'Pace Notes', alternateName: 'splithappens.run', url: `${SITE_URL}/`,
    inLanguage: 'en', description: homeDescription(), creator: { '@type': 'Person', name: 'Andrew Kam' },
  };
  return <><div className="home">
    <section className="night night-grain bleed hero home-hero-band" aria-labelledby="hero-title" data-track-section="hero">
      <div className="container home-hero-grid">
        <div className="home-hero-copy">
          <p className="eyebrow home-hero-eyebrow">Pace Notes · {manifest.cohort.cities} big-city marathons{span ? ` · ${span.first}–${span.last}` : ''}</p>
          <h1 id="hero-title" className="hero-title home-hero-title">The same <MarathonDistance />, run {finishesM()}&nbsp;million ways. <em>Plan yours.</em></h1>
          <p className="hero-dek home-hero-dek">Pick your course and goal time. See how finishes at that pace held up there, then print a pace band to race with.</p>
          <HomeDoors courses={courses} storyCount={storyWord} analysisCount={analysisWord} />
          <CreatorCredit />
        </div>
        <HeroReplay choices={choices} initial={berlin.slug} />
      </div>
      <RunnerLane dark className="hero-lane" height={110} runners={[
        { finishMinutes: 150, label: '2:30' }, { finishMinutes: 195, label: '3:15' }, { finishMinutes: 240, label: '4:00' },
        { finishMinutes: 285, label: '4:45' }, { finishMinutes: 330, label: '5:30' }, { finishMinutes: 390, label: '6:30' },
      ]} />
    </section>

    <section id="stakes" className="chapter home-section" aria-labelledby="stakes-title" data-track-section="stakes">
      <div className="chapter-head">
        <p className="chapter-num">What&apos;s at stake</p>
        <h2 id="stakes-title" className="chapter-title">A goal pace is easy to set and <em>hard to hold</em>.</h2>
      </div>
      <div className="nugget">
        <span className="nugget-number">{study.rate.toFixed(1)}%</span>
        {/* The study's base is the ten analyses' finishes, so the sentence names it (under 0934 it included the copy editions the 3.4 million left out; since 1652 both are 3,871,767). */}
        <p className="nugget-text">of finishes in the {analysisWord} analyses had a <Link href="/methodology#sustained-slowdown"><strong>sustained slowdown</strong></Link>.</p>
      </div>
      <Link className="chapter-more" href="/slowdown">See where it happens <span aria-hidden="true">→</span></Link>
    </section>

    <section id="guide" className="chapter home-section" aria-labelledby="guide-title" data-track-section="guide">
      <div className="chapter-head">
        <p className="chapter-num">Your guide</p>
        <h2 id="guide-title" className="chapter-title">A guide, <em>not a coach</em>.</h2>
        <p className="chapter-dek">Pace Notes doesn&apos;t coach or pick a pace for you. It shows what happened to real finishes, so you can make your own plan.</p>
      </div>
      <p className="home-guide-links"><Link href="/methodology">Methods &amp; sources</Link>{' '}<Link href="/about">About</Link></p>
    </section>

    <section id="steps" className="chapter home-section" aria-labelledby="steps-title" data-track-section="steps">
      <div className="chapter-head">
        <p className="chapter-num">How it works</p>
        <h2 id="steps-title" className="chapter-title">Three steps to <em>a race plan</em>.</h2>
      </div>
      <ol className="home-steps">
        <li><span className="home-step-number" aria-hidden="true">1</span><span>Choose your course and goal.</span></li>
        <li><span className="home-step-number" aria-hidden="true">2</span><span>See how finishes at that pace held up.</span></li>
        <li><span className="home-step-number" aria-hidden="true">3</span><span>Print your pace band.</span></li>
      </ol>
      <div className="hero-actions home-steps-action"><Link className="button-accent" href="/tools/plan">Plan your race</Link></div>
      <div className="home-after">
        <p><strong>After the race:</strong> paste your splits or find your race in the results for a report you can print, save or share.</p>
        <Link className="chapter-more" href="/runners">Analyze a past race <span aria-hidden="true">→</span></Link>
      </div>
    </section>

    <section id="research" className="chapter home-section" aria-labelledby="research-title" data-track-section="stories">
      <div className="chapter-head">
        <p className="chapter-num">From the data</p>
        <h2 id="research-title" className="chapter-title">{storyWord} stories about <em>how marathons are run</em>.</h2>
      </div>
      <StoryCards stories={teaser} className="home-story-cards" />
      <Link className="chapter-more" href="/research">All research <span aria-hidden="true">→</span></Link>
    </section>

    <section className="night bleed cta-band-wrap" aria-labelledby="cta-title" data-track-section="cta">
      <div className="container cta-band">
        <div>
          <h2 id="cta-title">Your next marathon <em>starts with a plan</em>.</h2>
          <div className="hero-actions"><Link className="button-accent" href="/tools/plan">Plan your race</Link><Link className="button-secondary" href="/runners">Analyze a past race</Link></div>
          <p className="home-cta-small">Want someone to look at it with you? <Link href="/request-analysis">Request an analysis.</Link></p>
        </div>
        <RunnerLane dark height={150} crossing={20} runners={[{ finishMinutes: 210 }, { finishMinutes: 255 }, { finishMinutes: 300 }]} />
      </div>
    </section>
  </div><JsonLd data={website} /></>;
}
