import SplitCheck from '@/components/tools/SplitCheck';
import { ToolEnd, ToolHeader } from '@/components/tools/ToolShell';
import { pageMetadata } from '@/lib/seo';
import { getInsightsManifest, readInsight } from '@/lib/insights-server';
import { ARCHETYPES, otherCourses } from '@/lib/split-check-server';
import type { PaceBandIndex } from '@/lib/tools/data';

export const metadata = pageMetadata({
  title: 'Marathon Split Analysis: Check Your 5K Splits | Pace Notes',
  description: 'Paste your nine mat times to see each section’s pace, whether you had a sustained slowdown, your pacing type and how finishes at your time paced.',
  path: '/tools/split-check',
});

const INDEX = 'tools/pace-band.json';

export default function SplitCheckPage() {
  const manifest = getInsightsManifest();
  const indexSha = manifest.files[INDEX]?.sha256 ?? null;
  const archetypesSha = manifest.files[ARCHETYPES]?.sha256 ?? null;
  const index = indexSha ? readInsight<PaceBandIndex>(INDEX) : null;
  const bandCourses = (index?.scopes ?? []).map((s) => s.slug).filter((s) => s !== 'all');

  return (
    <div className="tool-page">
      <ToolHeader slug="split-check" />
      <SplitCheck indexSha={indexSha} archetypesSha={archetypesSha}
        bandCourses={bandCourses} otherCourses={otherCourses(index)} />
      <ToolEnd path="/tools/split-check" how="/methodology#tools-split-check" />
    </div>
  );
}
