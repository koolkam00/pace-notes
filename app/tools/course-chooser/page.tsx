import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import CourseChooser, { type ScreenedCourse } from '@/components/tools/CourseChooser';
import { ToolHeader, ToolNext } from '@/components/tools/ToolShell';
import { pageMetadata } from '@/lib/seo';
import { getCourseNames, slugifyCity } from '@/lib/course-data';
import { getInsightsManifest, readInsight } from '@/lib/insights-server';
import type { InsightsManifest } from '@/lib/insights';
import type { CourseGoal, PaceBandIndex, PaceBandShard } from '@/lib/tools/data';
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

export default function CourseChooserPage() {
  const { sha, data, bandGoals } = load();
  const pages = coursePages();

  // Course pages with no course in the data at all: every one of their editions was screened out.
  const inData = new Set((data?.courses ?? []).map((c) => c.city));
  const screened: ScreenedCourse[] = data ? pages.filter((p) => !inData.has(p.city)) : [];

  return (
    <div className="container tool-page">
      <ToolHeader slug="course-chooser" />
      <CourseChooser sha={sha} pages={pages.map((p) => p.slug)} screened={screened} bandGoals={bandGoals} />
      <ToolNext current="course-chooser" />
    </div>
  );
}
