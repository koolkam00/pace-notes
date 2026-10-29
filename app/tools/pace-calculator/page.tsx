import PaceCalculator from '@/components/tools/PaceCalculator';
import { ToolEnd, ToolHeader } from '@/components/tools/ToolShell';
import { pageMetadata } from '@/lib/seo';
import { readHalf } from '@/lib/half-server';
import { halfManifest } from '@/lib/stories';

export const metadata = pageMetadata({
  title: 'Running Pace Calculator: Pace, Time and Splits | Pace Notes',
  description: 'Free running pace calculator: enter any two of distance, time and pace. Even-pace splits by mile, km or 5 km mat, and what a GPS watch would show.',
  path: '/tools/pace-calculator',
});

/** The half times the predictor's half panel covers (its "all" windows), or null when the half data is not in this build. */
function halfRange(): [number, number] | null {
  if (!halfManifest()?.files['tools/half-to-full.json']) return null;
  const all = readHalf('tools/half-to-full.json').groups.all;
  return [all.from, all.to];
}

export default function PaceCalculatorPage() {
  return (
    <div className="tool-page">
      <ToolHeader slug="pace-calculator" />
      <PaceCalculator halfRange={halfRange()} />
      <ToolEnd path="/tools/pace-calculator" how="/methodology#tools-pace-calculator" />
    </div>
  );
}
