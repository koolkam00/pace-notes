import { notFound } from 'next/navigation';
import { unitText, distanceLabel, distanceValue, DEFAULT_UNITS } from '@/lib/units';
import { TEN_ANALYSES, analysisBySlug } from '@/lib/ten-analyses';
import { getWeatherAnalyses } from '@/lib/weather-data';
import { JsonLd, breadcrumbs, pageMetadata } from '@/lib/seo';
import StartingPace from '@/components/analysis/pages/StartingPace';
import DownhillStart from '@/components/analysis/pages/DownhillStart';
import PacingPattern from '@/components/analysis/pages/PacingPattern';
import Checkpoint from '@/components/analysis/pages/Checkpoint';
import WhereTime from '@/components/analysis/pages/WhereTime';
import FinishContext from '@/components/analysis/pages/FinishContext';
import AgePacing from '@/components/analysis/pages/AgePacing';
import CourseComparison from '@/components/analysis/pages/CourseComparison';
import HillsPacing from '@/components/analysis/pages/HillsPacing';
import RaceDayWeather from '@/components/analysis/pages/RaceDayWeather';
import FindingImprovement from '@/components/analysis/pages/FindingImprovement';
import Moved from '@/components/analysis/Moved.client';

/** Miles first (the default unit), from the metric mat distance, e.g. "12.4 mi". */
const mi = (km: number) => distanceLabel(km, DEFAULT_UNITS, 1);
const checkpointMiles = [20, 30, 35].map(km => distanceValue(km, DEFAULT_UNITS).toFixed(1));

/**
 * Search titles and descriptions per analysis, unchanged by the redesign (spec section 6.8). The two weather questions
 * now live as tabs of race-day weather: their routes are noindex stubs that forward with the tab's hash (spec 2.9).
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

/** The weather questions that became tabs of race-day weather, and the tab each forwards to. */
const MOVED: Record<string, string> = { warming: '/analyses/race-day-weather#warming', wind: '/analyses/race-day-weather#wind', humidity: '/analyses/race-day-weather#temperature' };
const movedTo = (slug: string) => { const w = getWeatherAnalyses().find(item => item.slug === slug); return w ? MOVED[w.id] : undefined; };

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
  const target = movedTo(params.slug);
  if (target) return pageMetadata({ title: seo.title, description: seo.description, path: `/analyses/${params.slug}`, canonicalPath: target.split('#')[0], noindex: true });
  return pageMetadata({ title: seo.title, description: seo.description, path: `/analyses/${params.slug}` });
}

const BODIES: Record<string, () => JSX.Element> = {
  'starting-pace': StartingPace, 'downhill-start': DownhillStart, 'pacing-pattern': PacingPattern, checkpoint: Checkpoint,
  'where-time-is-gained': WhereTime, 'finish-time-context': FinishContext, 'age-and-pacing': AgePacing, 'course-comparison': CourseComparison,
  'hills-and-pacing': HillsPacing, 'race-day-weather': RaceDayWeather, 'finding-improvement': FindingImprovement,
};

export default function AnalysisPage({ params }: { params: { slug: string } }) {
  const seo = seoFor(params.slug);
  const target = movedTo(params.slug);
  if (target) return <Moved to={target} title={seo?.crumb ?? 'Race-day weather'} />;
  const Body = BODIES[params.slug];
  if (!seo || !Body) notFound();
  return <>
    <JsonLd data={breadcrumbs([['Pace Notes', '/'], ['Analyses', '/analyses'], [seo.crumb ?? seo.title]])} />
    <Body />
  </>;
}
