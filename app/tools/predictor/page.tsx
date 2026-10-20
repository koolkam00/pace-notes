import Predictor from '@/components/tools/Predictor';
import { ToolEnd, ToolHeader } from '@/components/tools/ToolShell';
import { pageMetadata } from '@/lib/seo';
import { getInsightsManifest } from '@/lib/insights-server';

export const metadata = pageMetadata({
  title: 'Marathon Time Predictor from a 5K, 10K or Half | Pace Notes',
  description: 'A marathon range from a recent 5K, 10K or half with Riegel, Daniels–Gilbert and typical exponents, and where finishes on that pace at 20 km finished.',
  path: '/tools/predictor',
});

const INDEX = 'tools/projector.json';
const SHARD = 'tools/projector/all/20.json';

/** The verified index digest, or null when the index or the 20 km shard is not part of this build. */
function indexVersion(): string | null {
  try {
    const files = getInsightsManifest().files;
    return files[INDEX] && files[SHARD] ? files[INDEX].sha256 : null;
  } catch {
    return null;
  }
}

export default function PredictorPage() {
  const sha = indexVersion();
  return (
    <div className="tool-page">
      <ToolHeader slug="predictor" />
      <Predictor indexSha={sha} />
      <ToolEnd path="/tools/predictor" how="/methodology#tools-predictor" />
    </div>
  );
}
