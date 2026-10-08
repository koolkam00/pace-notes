import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import CourseChooser, { type ScreenedCourse } from '@/components/tools/CourseChooser';
import { ToolHeader, ToolMethod, ToolNext } from '@/components/tools/ToolShell';
import { pageMetadata } from '@/lib/seo';
import { UnitLink as Link } from '@/components/UnitsProvider';
import { getCourseNames, slugifyCity } from '@/lib/course-data';
import { getInsightsManifest, readInsight } from '@/lib/insights-server';
import type { InsightsManifest } from '@/lib/insights';
import type { CourseGoal, PaceBandIndex, PaceBandShard } from '@/lib/tools/data';
import { SLOWDOWN_CITATION, SLOWDOWN_DEFINITION } from '@/lib/tools/splits';
import './course-chooser.css';

export const metadata = pageMetadata({
  title: 'Compare Marathon Courses at Your Goal Pace | Pace Notes',
  description: 'Pick a goal and compare marathon courses side by side: how finishes on that pace held up, race month, start temperatures and elevation. Not a ranking.',
  path: '/tools/course-chooser',
});

const FILE = 'tools/course-goal.json';

function load(): { sha: string | null; data: CourseGoal | null; bandGoals: Record<string, number[]> | null } {
  try {
    const manifest = getInsightsManifest();
    const sha = manifest.files[FILE]?.sha256 ?? null;
    const data = sha ? readInsight<CourseGoal>(FILE) : null;
    return { sha, data, bandGoals: data ? paceBandGoals(manifest, data) : null };
  } catch {
    return { sha: null, data: null, bandGoals: null };
  }
}

/**
 * For each course, the goals on this tool's grid where the pace band has observed data for that course
 * (100 or more finishes in the five minutes under the goal). A course the pace band does not publish
 * (not in its index scopes) gets no goals, and a row whose goal is missing links to the all-course band
 * instead, so a link carries course= only when the pace band publishes that course. Each shard is checked
 * against the verified manifest digest; null when the pace-band family is not in this build or cannot be
 * checked, and every row then links to the all-course band.
 */
function paceBandGoals(manifest: InsightsManifest, data: CourseGoal): Record<string, number[]> | null {
  try {
    if (!manifest.files['tools/pace-band.json']) return null;
    const scopes = new Set(readInsight<PaceBandIndex>('tools/pace-band.json').scopes.map((s) => s.slug).filter((s) => s !== 'all'));
    const out: Record<string, number[]> = {};
    for (const course of data.courses) {
      const name = `tools/pace-band/${course.slug}/all.json`;
      const meta = manifest.files[name];
      if (!meta || !scopes.has(course.slug)) { out[course.slug] = []; continue; }
      const bytes = fs.readFileSync(path.join(process.cwd(), 'public/data/insights', name));
      if (createHash('sha256').update(bytes).digest('hex') !== meta.sha256) return null;
      const shard = JSON.parse(bytes.toString()) as PaceBandShard & { release_tag?: string };
      if (shard.release_tag !== manifest.release_tag) return null;
      const observed = new Set(shard.groups.all?.g ?? []);
      out[course.slug] = data.rows.filter((r) => r.city === course.city && observed.has(r.goal)).map((r) => r.goal);
    }
    return out;
  } catch {
    return null;
  }
}

function coursePages(): { city: string; slug: string }[] {
  try {
    return getCourseNames().map((city) => ({ city, slug: slugifyCity(city) }));
  } catch {
    return [];
  }
}

/** "Madrid 2013–2018; New York 2006–2007": years grouped by city, consecutive runs collapsed. */
function editionList(rows: { city: string; year: number }[]): string {
  const byCity = new Map<string, number[]>();
  for (const r of rows) byCity.set(r.city, [...(byCity.get(r.city) ?? []), r.year]);
  return [...byCity.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([city, years]) => `${city} ${yearRuns(years)}`).join('; ');
}
function yearRuns(years: number[]): string {
  const sorted = [...new Set(years)].sort((a, b) => a - b);
  const runs: string[] = [];
  let start = sorted[0];
  for (let i = 1; i <= sorted.length; i += 1) {
    if (sorted[i] !== sorted[i - 1] + 1) {
      runs.push(start === sorted[i - 1] ? String(start) : `${start}–${sorted[i - 1]}`);
      start = sorted[i];
    }
  }
  return runs.join(', ');
}

export default function CourseChooserPage() {
  const { sha, data, bandGoals } = load();
  const pages = coursePages();
  const offsets = data?.screens?.start_offset ?? [];
  const grid = data?.screens?.grid ?? [];
  const duplicates = data?.duplicate_edition_screen ?? [];

  // Course pages with no course in the data at all: every one of their editions was screened out.
  const inData = new Set((data?.courses ?? []).map((c) => c.city));
  const screened: ScreenedCourse[] = data ? pages.filter((p) => !inData.has(p.city)).map((p) => {
    const off = offsets.filter((o) => o.city === p.city).map((o) => o.year);
    const shifted = grid.filter((g) => g.city === p.city).map((g) => g.year);
    const parts = [
      off.length ? `start delays inflate the first split in ${yearRuns(off)}` : null,
      shifted.length ? `the mat grid was shifted in ${yearRuns(shifted)}` : null,
    ].filter(Boolean);
    return { ...p, reason: `No edition passed the data screens${parts.length ? ` (${parts.join('; ')})` : ''}.` };
  }) : [];
  const fewEditions = (data?.courses ?? []).filter((c) => c.editions < (data?.min_editions ?? 3));

  return (
    <div className="container tool-page">
      <ToolHeader slug="course-chooser" />
      <CourseChooser sha={sha} pages={pages.map((p) => p.slug)} screened={screened} bandGoals={bandGoals} />
      <ToolMethod sources={[SLOWDOWN_CITATION]}>
        <p><strong>Who is in each row.</strong> For a goal G, even pace is G ÷ 42.195 km. On each course, a finish is counted when its 5–20 km pace, (20 km time − 5 km time) ÷ 15, is within ±2% of that even pace. An edition counts when it has at least {data?.min_edition_finishes ?? 20} such finishes, and a course row is published only with at least {data?.min_editions ?? 3} counted editions and 100 finishes in all; smaller groups are never shown. The 5–20 km pace is measured during the race, so each row describes finishes that happened to run that pace, chosen after the fact. It is not an estimate of what you can run.</p>
        <p><strong>The figures.</strong> <em>Under goal</em> is the share of the row’s finishes with a finish time below G, all counted editions pooled, so large editions weigh more. The <em>sustained-slowdown share</em> and the <em>time after 20 km</em> are worked out per edition and then averaged with every edition counted equally. Time after 20 km is the median of (finish − 20 km time) − 22.195 × the 5–20 km pace per km: how much longer the last 22.195 km took than at the pace held from 5 to 20 km. Finish-time percentiles (10th, median, 90th) pool all of the row’s finishes. Every share is an observed share of complete finishes, never anyone’s chance.</p>
        <p><strong>Sustained slowdown.</strong> {SLOWDOWN_DEFINITION} The definition follows the published slowdown method cited below.</p>
        <p><strong>Why this is not a ranking.</strong> The default order is alphabetical, and no course is called fast, slow, easy or hard. Courses differ in field composition, qualifying rules (e.g. Boston, which has qualifying times), weather, era and route. Averaging editions equally stops one large or unusual year from dominating a row, but it does not remove those differences, and nothing here shows that a course causes a finish to hold up or fade. No course factor or equivalent time is calculated. At slow goals, a course’s closing time matters too: finishes after a course closes are not recorded, so a row near a time limit describes only those who finished inside it.</p>
        <p><strong>Context columns.</strong> Race months come from the dates of editions with a weather row. Start temperature is the range, across editions, of one supplied modelled observation per edition for the hour of the scheduled start at one point in the city. It is not anyone’s personal exposure. The route profile is the supplied current route: climb, descent and the endpoint net change are shown exactly as supplied (net is not climb minus descent), and historical routes may differ. A downhill opening means the first 5 km of that profile drops more than 25 m (82 ft). Weather and elevation are context only: no figure is adjusted for either. For how warm and cool races compare see <Link href="/analyses/race-day-weather">race-day weather</Link>, and for downhill openings see <Link href="/analyses/downhill-start">downhill starts</Link>.</p>
        <p><strong>Who is not here.</strong> Only complete finishes with all nine 5 km checkpoints are counted, so runners who stopped are not in the data. Counts are finishes, not people: one runner can appear in several editions.
          {data ? <> The rows draw on {data.cohort_n.toLocaleString('en-US')} screened finishes.</> : null}
          {duplicates.length ? <> Left out as duplicated fields: {duplicates.map((d) => `${d.city} ${d.year} (a copy of ${d.duplicate_of})`).join(', ')}.</> : null}
          {offsets.length ? <> Left out because start delays inflate the first split: {editionList(offsets)}.</> : null}
          {grid.length ? <> Left out because the mat grid was shifted: {editionList(grid)}.</> : null}
          {fewEditions.length ? <> Never published, with fewer than {data?.min_editions ?? 3} editions after these screens: {fewEditions.map((c) => c.city).join(', ')}{screened.length ? `, plus ${screened.map((s) => s.city).join(' and ')}, which ${screened.length === 1 ? 'has' : 'have'} none` : ''}.</> : null}
        </p>
        <p><strong>Related.</strong> The <Link href="/analyses/course-comparison">course comparison</Link> uses wider pace bands and shows each course’s pacing fingerprint. For any course here, the <Link href="/tools/pace-band">pace band</Link> shows what finishes that came in within five minutes under your goal ran at each 5 km mat. That is a different group from a row here, which is chosen on 5–20 km pace, so a course can have a row at a goal and still have fewer than 100 finishes just under it; those rows link to the all-course band, marked “all courses”.</p>
      </ToolMethod>
      <ToolNext current="course-chooser" />
    </div>
  );
}
