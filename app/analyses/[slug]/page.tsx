import { notFound } from 'next/navigation';
import { unitText, distanceLabel, distanceValue, DEFAULT_UNITS } from '@/lib/units';
import { TEN_ANALYSES, analysisBySlug } from '@/lib/ten-analyses';
import { getWeatherAnalyses } from '@/lib/weather-data';
import { WEATHER_TAB_TITLES } from '@/lib/weather-catalog';
import { JsonLd, breadcrumbs, movedMetadata, pageMetadata } from '@/lib/seo';
import { movedTo } from '@/lib/seo-routes';
import { PAGE_NUGGET, getNugget, sentenceOf, type NuggetId } from '@/lib/nuggets';
import { hm } from '@/lib/nuggets/format';
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
import MovedPage from '@/components/MovedPage';

/** Miles first (the default unit), from the metric mat distance, e.g. "12.4 mi". */
const mi = (km: number) => distanceLabel(km, DEFAULT_UNITS, 1);
const checkpointMiles = [20, 30, 35].map(km => distanceValue(km, DEFAULT_UNITS).toFixed(1));

/**
 * Search titles per analysis, unchanged by the redesign (spec section 6.8); each description leads with the page's
 * finding (`describe`, below), the text here its fallback. The two weather questions now live as tabs of race-day
 * weather: their routes are noindex stubs that forward with the tab's hash (spec 2.9).
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
  'warming-and-pacing': { title: `${WEATHER_TAB_TITLES.warming} | Pace Notes`, description: 'Warming through a marathon, and how much more the second 20K slowed.' },
  'wind-and-pacing': { title: `${WEATHER_TAB_TITLES.wind} | Pace Notes`, description: 'Wind at the start of a marathon, and the second 20K.' },
  'downhill-start': { title: 'Downhill Marathon Starts and Later Pace | Pace Notes', description: 'Compare opening pace and later slowing on marathon courses that start with a larger descent against courses with other openings.', crumb: 'Downhill starts' },
};


/**
 * What each analysis lets a reader do, after its finding in the meta description (critic round 4: the descriptions were
 * tool instructions, while the pages lead with a finding). The finding is the page's own nugget headline, so a share
 * card or a search result says what the page opens on.
 */
const TAIL: Record<string, string> = {
  'starting-pace': 'Fast and steady marathon openings, against the same pace.',
  'downhill-start': 'Opening pace and later slowing, downhill-start courses against the rest.',
  'pacing-pattern': 'Median pace in each 5K for marathon finishes near your time.',
  checkpoint: 'What followed a time at the 20K, 30K or 35K mat.',
  'where-time-is-gained': 'Section by section, finishes just under and just over a goal time.',
  'finish-time-context': 'Where a marathon finish time falls among recorded finishes.',
  'age-and-pacing': 'Second-20K slowing by age group.',
  'course-comparison': 'Every course with three or more editions, in an average year.',
  'hills-and-pacing': 'Each 5K’s pace beside a course’s climbs.',
  'race-day-weather': 'Start temperature, warming and wind against late slowing.',
  'finding-improvement': 'Where faster marathon finishes found their minutes.',
};

/** The weather tabs' old routes: each describes its tab's finding (critic round 5: the warming one said "held pace"). */
const COMPAT_NUGGET: Record<string, NuggetId> = { 'warming-and-pacing': 'weather.warming', 'wind-and-pacing': 'weather.wind' };

/** The page's finding, then what it lets a reader do; the finding alone when both would pass 155 characters. */
function describe(slug: string, fallback: string): string {
  const compat = COMPAT_NUGGET[slug];
  if (compat) {
    const nugget = getNugget(compat);
    return nugget.guard ? sentenceOf(nugget, DEFAULT_UNITS).replace(/\*/g, '') : fallback;
  }
  const id = PAGE_NUGGET[`/analyses/${slug}`];
  const tail = TAIL[slug];
  if (!id || !tail) return fallback;
  const nugget = getNugget(id);
  if (!nugget.guard) return fallback;
  const finding = sentenceOf(nugget, DEFAULT_UNITS).replace(/\*/g, '');
  // Age says the size too: every age group near the goal slowed by the figure's range over the second 20K.
  const age = slug === 'age-and-pacing' && nugget.figure ? `Near ${hm(Number(nugget.values.goal_min))}, every age group slowed ${nugget.figure.value}${nugget.figure.unit ?? ''} over the second 20K.` : null;
  const both = `${finding} ${age ?? tail}`;
  return both.length <= 155 ? both : finding;
}

function seoFor(slug: string) {
  const item = analysisBySlug(slug) || getWeatherAnalyses().find(item => item.slug === slug);
  const mapped = SEO[slug];
  const crumb = mapped?.crumb ?? (item ? unitText(item.shortTitle, DEFAULT_UNITS) : undefined);
  if (mapped) return { ...mapped, description: describe(slug, mapped.description), crumb };
  if (!item) return null;
  return { title: unitText(item.shortTitle, DEFAULT_UNITS) + ' | Pace Notes', description: unitText(item.description, DEFAULT_UNITS), crumb };
}

export function generateStaticParams() { return [...TEN_ANALYSES, ...getWeatherAnalyses(), { slug: 'downhill-start' }].map(item => ({ slug: item.slug })); }
export function generateMetadata({ params }: { params: { slug: string } }) {
  const seo = seoFor(params.slug);
  if (!seo) return { title: 'Analysis not found | Pace Notes', robots: { index: false, follow: true } };
  const path = `/analyses/${params.slug}`;
  // The weather questions that became tabs of race-day weather are noindex stubs that forward to their tab (spec 2.9).
  if (movedTo(path)) return movedMetadata(path, seo.title, seo.description);
  return pageMetadata({ title: seo.title, description: seo.description, path });
}

const BODIES: Record<string, () => JSX.Element> = {
  'starting-pace': StartingPace, 'downhill-start': DownhillStart, 'pacing-pattern': PacingPattern, checkpoint: Checkpoint,
  'where-time-is-gained': WhereTime, 'finish-time-context': FinishContext, 'age-and-pacing': AgePacing, 'course-comparison': CourseComparison,
  'hills-and-pacing': HillsPacing, 'race-day-weather': RaceDayWeather, 'finding-improvement': FindingImprovement,
};

export default function AnalysisPage({ params }: { params: { slug: string } }) {
  const seo = seoFor(params.slug);
  const moved = movedTo(`/analyses/${params.slug}`);
  if (moved) return <MovedPage to={moved} action="Go to race-day weather">{seo?.crumb ?? 'This question'} is now a tab of race-day weather.</MovedPage>;
  const Body = BODIES[params.slug];
  if (!seo || !Body) notFound();
  return <>
    <JsonLd data={breadcrumbs([['Pace Notes', '/'], ['Analyses', '/analyses'], [seo.crumb ?? seo.title]])} />
    <Body />
  </>;
}
