import RacePlan, { type PlanCourse } from '@/components/tools/RacePlan';
import { checkedDate, pageHeading, standardByKey } from '@/components/tools/QualifyingRaceText';
import { ToolHeader, ToolMethod, ToolNext } from '@/components/tools/ToolShell';
import { UnitLink as Link } from '@/components/UnitsProvider';
import { getCourseNames, slugifyCity } from '@/lib/course-data';
import { getInsightsManifest, readInsight } from '@/lib/insights-server';
import { getPersonalSummary } from '@/lib/personalized-data';
import { pageMetadata } from '@/lib/seo';
import type { CourseGoal, PaceBandIndex, ProjectorIndex, WeatherMatch } from '@/lib/tools/data';
import { courseSlug } from '@/lib/tools/links';
import { PACE_BAND_INDEX } from '@/lib/tools/pace-band-data';
import { COURSE_GOAL_FILE, screenedReason, yearRuns } from '@/lib/tools/plan';
import { qualifyingKeyForCity } from '@/lib/tools/qualifying';
import { SLOWDOWN_CITATION, SLOWDOWN_DEFINITION } from '@/lib/tools/splits';
import { formatHM } from '@/lib/tools/time';
import '../pace-band/pace-band.css';
import './plan.css';

export const metadata = pageMetadata({
  title: 'Marathon Race Planner: Goal Pace by Course | Pace Notes',
  description: 'Plan a marathon goal on your course: even-pace splits for every mat, how finishes at that pace held up there, and a pace band to print.',
  path: '/tools/plan',
});

/** Read one optional insight file; null when it is not in this build or cannot be read. */
function optional<T>(name: string): T | null {
  try {
    return getInsightsManifest().files[name] ? readInsight<T>(name) : null;
  } catch {
    return null;
  }
}

/** A set built from a reader that may fail at build time (the course pages, the analyses' cities); empty when it does. */
function safeSet(read: () => string[]): Set<string> {
  try {
    return new Set(read());
  } catch {
    return new Set();
  }
}

/**
 * The courses the planner offers, alphabetical: every course in the course-goal file, plus any whose editions were all
 * screened out (named with the reason). Each carries only its name, slug and which tools and pages publish it, read from
 * their own index files, so no link names a course its target does not have.
 */
function planCourses(goal: CourseGoal | null, band: PaceBandIndex | null): PlanCourse[] {
  const projector = optional<ProjectorIndex>('tools/projector.json');
  const weather = optional<WeatherMatch>('tools/weather-match.json');
  const listed = new Set((goal?.courses ?? []).map((c) => c.city));
  const cities = new Set([...listed, ...[...(goal?.screens?.start_offset ?? []), ...(goal?.screens?.grid ?? [])].map((e) => e.city),
    ...(band?.scopes ?? []).flatMap((s) => (s.city ? [s.city] : []))]);
  const bandSlugs = new Set((band?.scopes ?? []).map((s) => s.slug));
  const projectorSlugs = new Set((projector?.scopes ?? []).map((s) => s.slug));
  const weatherSlugs = new Set((weather?.editions ?? []).map((e) => courseSlug(e.city)));
  const pages = safeSet(() => getCourseNames().map(slugifyCity));
  const analysisCities = safeSet(() => (getPersonalSummary()?.cities ?? []).map((c) => c.city));
  return [...cities].sort((a, b) => a.localeCompare(b)).map((city) => {
    const slug = courseSlug(city);
    const key = qualifyingKeyForCity(city);
    const standard = key ? standardByKey(key) : undefined;
    return {
      slug, city, screened: goal && !listed.has(city) ? screenedReason(city, goal.screens) : null,
      band: bandSlugs.has(slug), projector: projectorSlugs.has(slug), weather: weatherSlugs.has(slug), page: pages.has(slug), analyses: analysisCities.has(city),
      qualifying: standard ? { key: standard.key, title: pageHeading(standard), checked: checkedDate() } : null,
    };
  });
}

export default function PlanPage() {
  const manifest = getInsightsManifest();
  const courseGoalSha = manifest.files[COURSE_GOAL_FILE]?.sha256 ?? null;
  const paceBandSha = manifest.files[PACE_BAND_INDEX]?.sha256 ?? null;
  const goal = optional<CourseGoal>(COURSE_GOAL_FILE);
  const band = optional<PaceBandIndex>(PACE_BAND_INDEX);
  const courses = planCourses(goal, band);
  const noBand = band ? courses.filter((c) => !c.band).map((c) => c.city) : [];
  const duplicates = goal?.duplicate_edition_screen ?? [];
  const offsets = goal?.screens?.start_offset ?? [];
  const grid = goal?.screens?.grid ?? [];
  const byCity = (rows: { city: string; year: number }[]) => [...new Set(rows.map((r) => r.city))].sort((a, b) => a.localeCompare(b))
    .map((city) => `${city} ${yearRuns(rows.filter((r) => r.city === city).map((r) => r.year))}`).join('; ');

  return (
    <div className="container tool-page">
      <ToolHeader slug="plan" />
      <RacePlan courseGoalSha={courseGoalSha} paceBandSha={paceBandSha} courses={courses} />
      <ToolMethod sources={[SLOWDOWN_CITATION]}>
        <p><strong>Your plan is a calculation.</strong> Even pace is your goal divided by 42.195 km; the time at each mat is that pace times the distance, and a mile is 1.609344 km. Times are rounded to whole seconds once, at display. The wristband strips are the same calculation as the <Link href="/tools/pace-band">pace band</Link>. Nothing on this page suggests a pace: the plan is the goal you type, spread evenly.</p>
        <p><strong>On your course, at your pace.</strong> For a course, the results come from the course chooser’s rows: finishes whose 5–20 km pace was within ±{Math.round((goal?.tolerance ?? 0.02) * 100)}% of the even pace for the goal on that course. Rows are published for goals from {formatHM((goal?.goals[0] ?? 150) * 60)} to {formatHM((goal?.goals[1] ?? 390) * 60)} every {goal?.goal_step_min ?? 5} minutes, and the planner shows the nearest one, saying so when it differs from your goal. An edition counts with at least {goal?.min_edition_finishes ?? 20} such finishes, and a row needs {goal?.min_editions ?? 3} editions and 100 finishes; smaller groups are never shown. The share under the goal and the finish percentiles pool the editions; the sustained-slowdown share and the time after 20 km count each edition equally. These finishes are chosen by a pace they ran, after the fact, so the figures describe past races, not what you will run. For all courses together there is no such row, so the planner shows the pace band’s group of finishes in the five minutes up to the goal.</p>
        <p><strong>At each mat.</strong> The mat table and the “H” line on the strips are the pace band’s groups for the course (or all courses), all recorded genders: finishes from G − 5:00 to G − 0:01 for the whole minute G at or below your goal, split by whether they had a sustained slowdown, each with its median elapsed time at the official mats. Your even-pace times sit in their own column; no number subtracts or adjusts one kind with the other. A group with fewer than 100 finishes is not shown{noBand.length ? `, and ${noBand.join(' and ')} ${noBand.length === 1 ? 'has' : 'have'} no pace band groups` : ''}.</p>
        <p><strong>Sustained slowdown.</strong> {SLOWDOWN_DEFINITION} The definition follows the published slowdown method cited below.</p>
        <p><strong>Context, not adjustments.</strong> Race months and start temperatures come from one supplied modelled observation per edition at the scheduled start, not anyone’s exposure. The climb is the sum of the 5 km sections of the supplied current route, whose historical validity is unknown. No figure is adjusted for weather or elevation.</p>
        <p><strong>Who is not here.</strong> Only complete finishes with all nine 5 km checkpoints are counted, so runners who stopped are not in the data, and counts are finishes, not people.
          {goal ? <> The course rows draw on {goal.cohort_n.toLocaleString('en-US')} screened finishes.</> : null}
          {duplicates.length ? <> Left out as duplicated fields: {duplicates.map((d) => `${d.city} ${d.year} (a copy of ${d.duplicate_of})`).join(', ')}.</> : null}
          {offsets.length ? <> Left out because start delays inflate the first split: {byCity(offsets)}.</> : null}
          {grid.length ? <> Left out because the mat grid was shifted: {byCity(grid)}.</> : null}
        </p>
      </ToolMethod>
      <ToolNext current="plan" />
    </div>
  );
}
