import { unitText, distanceLabel, distanceValue, DEFAULT_UNITS } from '@/lib/units';
import { notFound } from 'next/navigation';
import { TEN_ANALYSES, analysisBySlug } from '@/lib/ten-analyses';
import { getAnalysisStart } from '@/lib/analysis-server';
import AnalysisExplorer from '@/components/AnalysisExplorer';
import WeatherAnalysis from '@/components/WeatherAnalysis';
import { getWeatherAnalyses, getWeatherEvidence } from '@/lib/weather-data';
import FastStartAnalysis from '@/components/FastStartAnalysis';
import { getFastStartStarts } from '@/lib/fast-start-server';
import AllFinisherAnalysis from '@/components/AllFinisherAnalysis';
import { getAllFinisherContextStart } from '@/lib/all-finisher-context-server';
import { UnitLink as Link } from '@/components/UnitsProvider';
import PageFeedback from '@/components/PageFeedback';
import RelatedTool from '@/components/tools/RelatedTool';
import { JsonLd, breadcrumbs, pageMetadata } from '@/lib/seo';

/** Miles first (the default unit), from the metric mat distance, e.g. "12.4 mi". */
const mi = (km: number) => distanceLabel(km, DEFAULT_UNITS, 1);
const checkpointMiles = [20, 30, 35].map(km => distanceValue(km, DEFAULT_UNITS).toFixed(1));

/**
 * Search titles and descriptions per analysis, written against what each page shows.
 * Slugs not listed here (a weather question that passes its evidence check later) fall back to the
 * analysis's own short title and description; see seoFor().
 */
const SEO: Record<string, { title: string; description: string; crumb?: string }> = {
  'pacing-pattern': { title: 'How Marathons Are Paced at Your Finish Time | Pace Notes', description: `Median pace in each 5 km section (${mi(5)}) for marathon finishes near your time, from start to finish, by course, age group and recorded gender.` },
  'starting-pace': { title: 'Fast Marathon Starts and Late Slowing | Pace Notes', description: 'Compare fast and steady marathon openings: how often a sustained slowdown followed, where it began and how the finish times compared.' },
  checkpoint: { title: 'Marathon Checkpoint Times: What Followed | Pace Notes', description: `Enter your time at the 20, 30 or 35 km mat (${checkpointMiles[0]}, ${checkpointMiles[1]} or ${checkpointMiles[2]} mi) and explore the finishes that followed from the same place on the clock.` },
  'where-time-is-gained': { title: 'Just Under vs Just Over a Marathon Goal Time | Pace Notes', description: 'Section by section, see where marathon finishes just under and just over a goal time gained and lost minutes against an even pace.' },
  'course-comparison': { title: 'Marathon Course Comparison: Pacing and Late Slowing', description: 'How often marathon finishes slowed late, how much pace changed and how varied races were on each course. A comparison, not a ranking.' },
  'race-day-weather': { title: 'Marathon Results by Start Temperature | Pace Notes', description: 'Compare pacing and sustained slowing in cooler and warmer marathons, grouped by the temperature at the start.' },
  'hills-and-pacing': { title: 'Marathon Hills and Pacing: Elevation vs Pace | Pace Notes', description: 'Place a marathon course’s elevation profile beside the section paces of its finishes, to see where climbs, descents and pace changes line up.' },
  'finish-time-context': { title: 'Marathon Finish Times: Where Yours Falls | Pace Notes', description: 'See where a marathon finish time falls among comparable recorded finishes. Observed shares of finishes, not predictions.' },
  'finding-improvement': { title: 'Where Faster Marathon Finishes Found Time | Pace Notes', description: 'See where faster marathon finishes found their minutes against an earlier result: the opening, the middle or the late race. Not training advice.' },
  'age-and-pacing': { title: 'Marathon Pace Retention by Age Group | Pace Notes', description: `Compare how marathon finishes held pace from the first 20 km (${mi(20)}) to the second across age groups and recorded genders, within one finish-time band.` },
  'warming-and-pacing': { title: 'Marathon Pacing When the Temperature Rises | Pace Notes', description: 'See how a temperature rise during a marathon relates to how well runners held their pace later in the race.' },
  'wind-and-pacing': { title: 'Wind and Marathon Pacing: Windy vs Calm Races | Pace Notes', description: 'Compare late-race slowing on windier and calmer marathon race days.' },
  'downhill-start': { title: 'Downhill Marathon Starts and Later Pace | Pace Notes', description: 'Compare opening pace and later slowing on marathon courses that start with a larger descent against courses with other openings.', crumb: 'Downhill starts' },
};

function seoFor(slug: string) {
  const item = analysisBySlug(slug) || getWeatherAnalyses().find(item => item.slug === slug);
  const mapped = SEO[slug];
  const crumb = mapped?.crumb ?? (item ? unitText(item.shortTitle, DEFAULT_UNITS) : undefined);
  if (mapped) return { ...mapped, crumb };
  if (!item) return null;
  return { title: unitText(item.shortTitle, DEFAULT_UNITS) + ' | Pace Notes', description: unitText(item.description, DEFAULT_UNITS), crumb };
}

export function generateStaticParams() { return [...TEN_ANALYSES, ...getWeatherAnalyses(), { slug: 'downhill-start' }].map(item => ({ slug: item.slug })); }
export function generateMetadata({ params }: { params: { slug: string } }) {
  const seo = seoFor(params.slug);
  if (!seo) return { title: 'Analysis not found | Pace Notes', robots: { index: false, follow: true } };
  return pageMetadata({ title: seo.title, description: seo.description, path: `/analyses/${params.slug}` });
}
export default function AnalysisPage({ params }: { params: { slug: string } }) {
  const seo = seoFor(params.slug);
  return <>{seo ? <JsonLd data={breadcrumbs([['Pace Notes', '/'], ['Analyses', '/analyses'], [seo.crumb ?? seo.title]])} /> : null}{analysisBody(params)}<PageFeedback className="page-feedback-analysis" />{params.slug === 'finish-time-context' ? <FinishTimesLink /> : null}<RelatedTool analysis={params.slug} /></>;
}

/** The whole-field view of finish times, linked from the target-in-context analysis. */
function FinishTimesLink() {
  return <aside className="related-tool" aria-label="Marathon finish times"><p>For the whole field at once, <Link href="/finish-times">marathon finish times</Link> gives the median, the percentiles and the share of finishes under each round time, for recorded women and recorded men.</p></aside>;
}

function analysisBody(params: { slug: string }) {
  if (params.slug === 'downhill-start') return <AllFinisherAnalysis kind="downhill" start={getAllFinisherContextStart('downhill')} archive history={<div className="prose"><h1>Downhill starts with an earlier result</h1><p><Link href="/research/personalized#guide-downhill">Open the earlier-result downhill comparison</Link> and choose a course.</p></div>} />;
  const weatherQuestions = getWeatherAnalyses();
  const weatherDefinition = weatherQuestions.find(item => item.slug === params.slug);
  if (weatherDefinition) {
    const evidence = getWeatherEvidence();
    const candidate = evidence.candidates.find(item => item.id === weatherDefinition.id && item.status === 'ready')!;
    return <WeatherAnalysis key={candidate.id} definition={weatherDefinition} candidate={candidate} evidence={evidence} questions={weatherQuestions} />;
  }
  const definition = analysisBySlug(params.slug);
  if (!definition) notFound();
  if (definition.id === 'opening') return <FastStartAnalysis starts={getFastStartStarts()} />;
  const { summary, answers } = getAnalysisStart();
  if (definition.id === 'courses' || definition.id === 'weather') {
    const historyDefinition = { ...definition, dek: definition.id === 'courses' ? 'See how finish times compared with the same runners’ earlier bests, course by course.' : 'See how finish times compared with the same runners’ earlier bests in cooler and warmer races.' };
    return <AllFinisherAnalysis kind={definition.id} start={getAllFinisherContextStart(definition.id)} history={<AnalysisExplorer definition={historyDefinition} summary={summary} initialAnswer={answers.find(answer => answer.id === definition.id)!} weatherQuestions={weatherQuestions} historyMode />} related={definition.id === 'weather' ? <div className="prose"><h2>More weather questions</h2><ul>{weatherQuestions.map(item => <li key={item.slug}><Link href={'/analyses/' + item.slug}>{item.shortTitle}</Link></li>)}<li><Link href="/packs/r15_weather_penalty_who">Weather and the full pacing pattern</Link></li></ul></div> : undefined} />;
  }
  return <AnalysisExplorer key={definition.id} definition={definition} summary={summary} initialAnswer={answers.find(answer => answer.id === definition.id)!} weatherQuestions={weatherQuestions} />;
}
