import CourseChooser, { type ScreenedCourse } from '@/components/tools/CourseChooser';
import { ToolEnd, ToolHeader } from '@/components/tools/ToolShell';
import { pageMetadata } from '@/lib/seo';
import { getCourseNames, slugifyCity } from '@/lib/course-data';
import { getInsightsManifest, readInsight } from '@/lib/insights-server';
import type { CourseGoal } from '@/lib/tools/data';

export const metadata = pageMetadata({
  title: 'Compare Marathon Courses at Your Goal Pace | Pace Notes',
  description: 'Pick a goal and compare marathon courses side by side: how finishes on that pace held up, the race month and which courses start downhill. Not a ranking.',
  path: '/tools/course-chooser',
});

const FILE = 'tools/course-goal.json';

function load(): { sha: string | null; data: CourseGoal | null } {
  try {
    const sha = getInsightsManifest().files[FILE]?.sha256 ?? null;
    return { sha, data: sha ? readInsight<CourseGoal>(FILE) : null };
  } catch {
    return { sha: null, data: null };
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
  const { sha, data } = load();
  const pages = coursePages();

  // Course pages with no course in the data at all: every one of their editions was screened out.
  const inData = new Set((data?.courses ?? []).map((c) => c.city));
  const screened: ScreenedCourse[] = data ? pages.filter((p) => !inData.has(p.city)) : [];

  return (
    <div className="tool-page">
      <ToolHeader slug="course-chooser" />
      <CourseChooser sha={sha} screened={screened} />
      <ToolEnd path="/tools/course-chooser" how="/methodology#tools-course-chooser" />
    </div>
  );
}
