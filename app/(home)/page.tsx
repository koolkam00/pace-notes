// The home page lives in the (home) route group, not at app/page.tsx: Next.js 14 hands pages under app/ the client
// chunks of a page in a parent folder for any client component they share, so with this file at app/page.tsx /privacy,
// /htw and /runners loaded the home page's charts (about 37 KB gzipped). The route group keeps the URL `/`.
//
// The start line (the redesign spec, sections 00 and 7.1): four things. The night hero opens on the race replay and the
// plan door (hero, paths); one guess (stakes); the chapters as a course line, each with its reading (guide); and the
// closing call (cta). Every number comes from lib/nuggets (site.totals, replay.back as the replay's moment, home.second20k
// and each chapter's lead), never typed here. The band's moment is how far the back of the field had come, in the edition
// where it had come least, so the home page never opens on the race-replay story's own race and finding.
import { UnitLink as Link } from '@/components/UnitsProvider';
import { assertCohortTotals } from '@/components/CohortNote';
import HomeDoors from '@/components/home/HomeDoors';
import UnitSentence from '@/components/home/UnitSentence.client';
import HeroReplay from '@/components/story/HeroReplay';
import ChapterList from '@/components/ui/ChapterList';
import GuessFirst from '@/components/ui/GuessFirst.client';
import { withEm } from '@/components/ui/withEm';
import { getCourseNames } from '@/lib/course-data';
import { getPersonalSummary } from '@/lib/personalized-data';
import { getStudyEvidence } from '@/lib/research-data';
import { getInsightsManifest, readInsight, replayChoices } from '@/lib/insights-server';
import { CHAPTERS, chapterNumber } from '@/lib/chapters';
import { getNugget, readingOf, sentenceOf, textFor } from '@/lib/nuggets';
import { countWord } from '@/lib/nuggets/format';
import { courseSpan } from '@/lib/stories';
import { JsonLd, SITE_URL, finishesM, pageMetadata } from '@/lib/seo';
import { courseSlug } from '@/lib/tools/links';
import { defaultReplaySlug } from '@/lib/viz/replay';
import type { CourseGeometry, ReplayIndex } from '@/lib/insights';

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
  // The band has no race picker, so it carries only the edition its moment names (replay.back: where the back of the
  // field had come least at the first finish), never chapter 01's own edition and finding.
  const back = getNugget('replay.back');
  const pick = choices.some((c) => c.slug === back.values.slug) ? String(back.values.slug) : defaultReplaySlug(choices);
  const courses = getCourseNames().map((city) => ({ city, slug: courseSlug(city) }));

  const totals = getNugget('site.totals');
  const title = totals.guard ? totals.headline : totals.fallback;
  const { cities, first_year: firstYear, last_year: lastYear } = totals.values;
  const guess = getNugget('home.second20k');
  const share = Number(guess.values.share);
  // The guess hands off to the page that develops it: the pacing pattern (finishes run fast early and slow late, which
  // is why so few ran a faster second 20K), in its chapter's words.
  const pattern = CHAPTERS.flatMap((c) => c.pages.map((page) => ({ c, page }))).find(({ page }) => page.href === '/analyses/pacing-pattern');
  const moment = { mi: sentenceOf(back, 'mi'), km: sentenceOf(back, 'km') };
  const chapterCount = countWord(CHAPTERS.length);

  const website = {
    '@context': 'https://schema.org', '@type': 'WebSite', name: 'Pace Notes', alternateName: 'splithappens.run', url: `${SITE_URL}/`,
    inLanguage: 'en', description: homeDescription(), creator: { '@type': 'Person', name: 'Andrew Kam' },
  };
  return <><div className="home">
    <section className="night home-band home-start" aria-labelledby="hero-title" data-track-section="hero">
      <div className="container home-start-grid">
        <div className="home-hero-copy">
          <p className="t-kicker home-hero-kicker">{cities} city marathons · {firstYear}–{lastYear}</p>
          <h1 id="hero-title" className="t-display home-hero-title"><UnitSentence mi={textFor(title, 'mi')} km={textFor(title, 'km')} /></h1>
          <p className="home-hero-dek">Pick a course and a goal. See how finishes at that pace held up there.</p>
          <HomeDoors courses={courses} />
        </div>
        <div className="home-hero-replay">
          <HeroReplay choices={choices.filter((c) => c.slug === pick)} initial={pick} band moment={moment} />
        </div>
      </div>
    </section>

    <section id="stakes" className="home-beat home-stakes" aria-labelledby="stakes-title" data-track-section="stakes">
      <h2 id="stakes-title" className="t-kicker home-beat-kicker">Before the gun · a guess</h2>
      {guess.figure ? (
        <GuessFirst
          marks="dots" unit="of 100" min={0} max={60} step={1}
          question="Of 100 finishes, how many ran their second 20K faster than their first?"
          truth={share * 100} truthLabel="Second 20K faster" answer={sentenceOf(guess)}
          next={pattern ? { href: pattern.page.href, label: `Chapter ${chapterNumber(pattern.c)} · ${pattern.page.short}` } : undefined}
        />
      ) : <p className="t-sentence">{withEm(sentenceOf(guess))}</p>}
    </section>

    <section id="guide" className="home-beat home-guide" aria-labelledby="guide-title" data-track-section="guide">
      <div className="home-guide-head">
        <h2 id="guide-title" className="t-h2">The race, start to finish.</h2>
        {/* The term's first use on the page (the chapter rows' keys sit inside their links), so it links to its definition. */}
        <p className="home-guide-dek">{chapterCount.charAt(0).toUpperCase() + chapterCount.slice(1)} chapters, from the gun through the <Link href="/methodology#sustained-slowdown" className="term-link">sustained slowdown</Link> to the finish line.</p>
      </div>
      <ChapterList variant="full" readingOf={readingOf} label="The chapters, start to finish" className="home-chapters" />
    </section>

    <section className="night home-band home-cta" aria-labelledby="cta-title" data-track-section="cta">
      <div className="container home-cta-inner">
        <h2 id="cta-title" className="t-h2">Your next marathon starts with a plan.</h2>
        <Link className="btn btn-primary" href="/tools/plan">Plan your race</Link>
      </div>
    </section>
  </div><JsonLd data={website} /></>;
}
