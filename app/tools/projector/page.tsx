import Projector from '@/components/tools/Projector';
import { ToolEnd, ToolHeader } from '@/components/tools/ToolShell';
import { pageMetadata } from '@/lib/seo';
import { getInsightsManifest } from '@/lib/insights-server';

export const metadata = pageMetadata({
  title: 'Marathon Finish Time Projector from Tracker Splits',
  description: 'Type a tracker time from any 5 km mat to see a finish range and next-mat arrival windows from what finishes on the same pace ran next.',
  path: '/tools/projector',
});

const INDEX = 'tools/projector.json';

function indexVersion(): string | null {
  try {
    return getInsightsManifest().files[INDEX]?.sha256 ?? null;
  } catch {
    return null;
  }
}

export default function ProjectorPage() {
  const sha = indexVersion();
  return (
    <div className="tool-page">
      <ToolHeader slug="projector" />
      <Projector indexSha={sha} />
      <ToolEnd path="/tools/projector" how="/methodology#tools-projector" />
    </div>
  );
}
