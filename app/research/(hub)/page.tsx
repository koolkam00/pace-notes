// The research hub lives in the (hub) route group, not at app/research/page.tsx: Next.js 14 hands a page the client
// chunks of a page in a parent folder for the client components they share, so at app/research/page.tsx the archived
// guide at /research/personalized would load this page's chunks too (see the home page's note, docs/WEBSITE_ARCHITECTURE.md).
import AnalysisIndex from '@/components/AnalysisIndex';
import CohortNote from '@/components/CohortNote';
import DataCoverage from '@/components/DataCoverage';
import StoryCards from '@/components/StoryCards';
import { UnitLink as Link, UnitText } from '@/components/UnitsProvider';
import WeatherIndex from '@/components/WeatherIndex';
import RunnerLane from '@/components/art/RunnerLane';
import { getInsightsManifest } from '@/lib/insights-server';
import { getPersonalSummary } from '@/lib/personalized-data';
import { getStudyEvidence } from '@/lib/research-data';
import { JsonLd, breadcrumbs, pageMetadata } from '@/lib/seo';
import { STORIES, capital, countWord } from '@/lib/stories';
import { getStudyFigures } from '@/lib/study-figures';
import { TEN_ANALYSES } from '@/lib/ten-analyses';
import { SLOWDOWN_CITATION } from '@/lib/tools/splits';

export const metadata = pageMetadata({
  title: 'Marathon Pacing Research and Open Data | Pace Notes',
  description: 'Data stories, ten marathon pacing analyses you can set to your course and time, the sustained-slowdown study and the open data behind them.',
  path: '/research',
});

/**
 * Everything Pace Notes has found, in one place: every data story, the ten analyses and the weather questions that
 * passed their check, the sustained-slowdown study and its figures, the methods, the open data and the archive. Every
 * story and analysis page is linked from here (verify-seo checks it), so none is left without a way in.
 */
export default function ResearchPage() {
  const manifest = getInsightsManifest();
  const stories = STORIES.filter((s) => manifest.files[s.file]);
  const figures = getStudyFigures();
  const study = getStudyEvidence();
  const storyWord = capital(countWord(stories.length) ?? String(stories.length));
  const analysisWord = countWord(TEN_ANALYSES.length) ?? String(TEN_ANALYSES.length);
  const guide = getPersonalSummary()?.analyses;
  return <div className="research-hub">
    <JsonLd data={breadcrumbs([['Pace Notes', '/'], ['Research']])} />
    <header className="night night-grain bleed story-hero research-hero">
      <div className="container">
        <p className="eyebrow">Research</p>
        <h1 className="story-title">Explore the <em>research</em>.</h1>
        <p className="hero-dek">{storyWord} data stories, {analysisWord} analyses you can set to your own course and finish time, the sustained-slowdown study and the open data behind them. Every group&apos;s size is printed beside its number.</p>
      </div>
      <RunnerLane dark height={96} runners={[{ finishMinutes: 175, label: '2:55' }, { finishMinutes: 235, label: '3:55' }, { finishMinutes: 295, label: '4:55' }]} />
    </header>
    <div className="research-cohort"><CohortNote /></div>

    <section id="stories" className="chapter research-section" aria-labelledby="research-stories-title">
      <div className="chapter-head">
        <p className="chapter-num">Stories from the data</p>
        <h2 id="research-stories-title" className="chapter-title">{storyWord} stories about <em>how marathons are run</em>.</h2>
        <p className="chapter-dek">Each starts with one finding you can say out loud, then hands you the evidence to explore.</p>
      </div>
      <StoryCards stories={stories} className="research-story-cards" />
      <Link className="chapter-more" href="/stories">All stories on one page <span aria-hidden="true">→</span></Link>
    </section>

    <section id="analyses" className="chapter research-section" aria-labelledby="research-analyses-title">
      <div className="chapter-head">
        <p className="chapter-num">Analyses</p>
        <h2 id="research-analyses-title" className="chapter-title">{capital(analysisWord)} questions, <em>set to your race</em>.</h2>
        <p className="chapter-dek">Choose a course, a finish time and an age group, and each answer is recounted for the finishes that match, with the group&apos;s size beside it.</p>
      </div>
      <div className="chapter-body"><AnalysisIndex /></div>
      <p className="research-also">Also: <Link href="/analyses/downhill-start">downhill starts and later slowing</Link> · <Link href="/analyses">the {analysisWord} on one page</Link></p>
    </section>
    <WeatherIndex />

    <section id="slowdown" className="chapter research-section" aria-labelledby="research-slowdown-title">
      <div className="chapter-head">
        <p className="chapter-num">The supporting study</p>
        <h2 id="research-slowdown-title" className="chapter-title">Sustained <em>slowdown</em>.</h2>
        <p className="chapter-dek">At least 5 km after 20 km run 25% or more slower than a finish&apos;s own 5–20 km pace, following the <a href={SLOWDOWN_CITATION.url}>{SLOWDOWN_CITATION.label.charAt(0).toLowerCase() + SLOWDOWN_CITATION.label.slice(1)}</a>.{study ? ` ${study.rate.toFixed(1)}% of the ${study.n.toLocaleString('en-US')} finishes in the ${analysisWord} analyses had one.` : ''}</p>
      </div>
      <ul className="research-links">
        <li><Link href="/slowdown">How often, where it began, and the sensitivity of the definition <span aria-hidden="true">→</span></Link></li>
        {figures.map((figure) => <li key={figure.id}><Link href={`/slowdown#${figure.id}`}><UnitText>{figure.title}</UnitText> <span aria-hidden="true">→</span></Link></li>)}
      </ul>
    </section>

    <section id="methods" className="chapter research-section" aria-labelledby="research-methods-title">
      <div className="chapter-head">
        <p className="chapter-num">Methods</p>
        <h2 id="research-methods-title" className="chapter-title">How the numbers <em>are made</em>.</h2>
        <p className="chapter-dek">Definitions, cohorts and limits, and why the study exists. Weather and elevation are context, never adjustments, and counts are finishes, not runners.</p>
      </div>
      <ul className="research-links">
        <li><Link href="/methodology">Methods &amp; sources <span aria-hidden="true">→</span></Link></li>
        <li><Link href="/about">About the study <span aria-hidden="true">→</span></Link></li>
      </ul>
    </section>

    <section id="open-data" className="chapter research-section" aria-labelledby="research-data-title">
      <div className="chapter-head">
        <p className="chapter-num">Open data</p>
        <h2 id="research-data-title" className="chapter-title">The data, <em>to download</em>.</h2>
        <p className="chapter-dek">The exports, the code and the data files behind the pages are public, so anyone can recount them.</p>
      </div>
      <p className="research-download"><a className="button-primary" href="https://github.com/koolkam00/htw-live-study/releases">Download the data <span aria-hidden="true">↗</span></a></p>
      <div className="research-coverage"><DataCoverage /></div>
    </section>

    <section id="archive" className="chapter research-section" aria-labelledby="research-archive-title">
      <div className="chapter-head">
        <p className="chapter-num">Archive</p>
        <h2 id="research-archive-title" className="chapter-title">Earlier <em>research</em>.</h2>
        <p className="chapter-dek">The broader research questions and the earlier personalized guide, kept as they were published.</p>
      </div>
      <ul className="research-links">
        <li><Link href="/packs">Research archive <span aria-hidden="true">→</span></Link></li>
        <li><Link href="/research/personalized">The earlier personalized guide{guide ? `, all ${guide} questions` : ''} (archived) <span aria-hidden="true">→</span></Link></li>
      </ul>
    </section>
  </div>;
}
