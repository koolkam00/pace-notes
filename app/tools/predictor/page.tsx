import Predictor, { type HalfPanelInfo } from '@/components/tools/Predictor';
import { ToolEnd, ToolHeader } from '@/components/tools/ToolShell';
import { pageMetadata } from '@/lib/seo';
import { getInsightsManifest } from '@/lib/insights-server';
import { halfSha, readHalf } from '@/lib/half-server';
import { halfManifest } from '@/lib/stories';

export const metadata = pageMetadata({
  title: 'Marathon Time Predictor from a Half, 10K or 5K | Pace Notes',
  description: 'A marathon range from a recent half, 10K or 5K, from published formulas, beside the marathons that followed the same half time.',
  path: '/tools/predictor',
});

const INDEX = 'tools/projector.json';
const SHARD = 'tools/projector/all/20.json';
const HALF_TOOL = 'tools/half-to-full.json';

/** The verified index digest, or null when the index or the 20 km shard is not part of this build. */
function indexVersion(): string | null {
  try {
    const files = getInsightsManifest().files;
    return files[INDEX] && files[SHARD] ? files[INDEX].sha256 : null;
  } catch {
    return null;
  }
}

/**
 * The half panel's file (the marathons after a half, records linked by name), its verified digest and the half times
 * its "all" windows cover, or null when the half data is not in this build: the 20K panel then shows for every input.
 */
function halfPanel(): HalfPanelInfo | null {
  if (!halfManifest()?.files[HALF_TOOL]) return null;
  const tool = readHalf(HALF_TOOL);
  return { sha: halfSha(HALF_TOOL), from: tool.groups.all.from, to: tool.groups.all.to };
}

export default function PredictorPage() {
  const sha = indexVersion();
  return (
    <div className="tool-page">
      <ToolHeader slug="predictor" />
      <Predictor indexSha={sha} half={halfPanel()} />
      <ToolEnd path="/tools/predictor" how="/methodology#tools-predictor" />
    </div>
  );
}
