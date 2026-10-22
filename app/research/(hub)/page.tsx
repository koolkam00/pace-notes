// The research hub lives in the (hub) route group, not at app/research/page.tsx: Next.js 14 hands a page the client
// chunks of a page in a parent folder for the client components they share, so at app/research/page.tsx the archived
// guide at /research/personalized would load this page's chunks too (see the home page's note, docs/WEBSITE_ARCHITECTURE.md).
import { assertCohortTotals } from '@/components/CohortNote';
import { MarathonDistance, UnitLink as Link } from '@/components/UnitsProvider';
import ChapterList from '@/components/ui/ChapterList';
import { CHAPTERS } from '@/lib/chapters';
import { readingOf } from '@/lib/nuggets';
import { JsonLd, breadcrumbs, pageMetadata } from '@/lib/seo';
import { sitemapEntries } from '@/lib/seo-routes';
import { WEATHER_QUESTIONS, weatherHref } from '@/lib/weather-catalog';
import { countWord } from '@/lib/nuggets/format';

export const metadata = pageMetadata({
  title: 'Marathon Pacing Research: Stories and Analyses | Pace Notes',
  description: 'Data stories, marathon pacing analyses you can set to your course and time, and the sustained-slowdown study, all in one place.',
  path: '/research',
});

/**
 * The contents (the redesign spec, sections 7.2 and 00): the race in eleven chapters, each with its reading, and under
 * each chapter its pages, each with its own reading where it has one. Every story and analysis page is linked here
 * (verify-seo checks it), so none is left without a way in. Methods, sources and the data downloads are only on
 * /methodology (linked from the footer).
 */
export default function ResearchPage() {
  // The build stops here when the site's two finish totals do not add up (the cohort note itself is on /methodology).
  assertCohortTotals();
  const chapters = countWord(CHAPTERS.length);
  // Analyses still in the sitemap that no chapter holds (the warming and wind questions, until they fold into race-day
  // weather): rows under their chapter, so every analysis keeps a way in from here. They go once they leave the sitemap.
  const inChapters = new Set(CHAPTERS.flatMap((c) => c.pages.map((p) => p.href)));
  const loose = sitemapEntries().map((e) => e.path).filter((p) => /^\/analyses\/[^/]+$/.test(p) && !inChapters.has(p));
  const titleOf = (path: string) => WEATHER_QUESTIONS.find((q) => weatherHref(q) === path)?.shortTitle ?? path.replace(/^\/analyses\//, '').replace(/-/g, ' ');
  // They are weather questions, so they sit under the chapter that holds race-day weather.
  const weather = CHAPTERS.find((c) => c.pages.some((p) => p.href === '/analyses/race-day-weather')) ?? CHAPTERS[CHAPTERS.length - 1];
  return <div className="contents-page">
    <JsonLd data={breadcrumbs([['Pace Notes', '/'], ['Research']])} />
    <header className="contents-hero" data-track-section="hero">
      <h1 className="t-title">The race, start to finish.</h1>
      <p className="contents-dek"><MarathonDistance /> in {chapters} chapters, and what each one found.</p>
      <p className="contents-views"><Link href="/stories">Stories</Link> show one finding each. <Link href="/analyses">Analyses</Link> answer a question you can set to your own course and time.</p>
    </header>
    <section id="analyses" className="contents-body" data-track-section="analyses" aria-label="Every chapter and page">
      <ChapterList variant="expanded" readingOf={readingOf} label="Contents" className="contents-chapters"
        extra={weather && loose.length ? { [weather.id]: loose.map((path) => ({ href: path, label: titleOf(path) })) } : {}} />
    </section>
  </div>;
}
