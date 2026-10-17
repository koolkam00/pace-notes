import PaceCalculator from '@/components/tools/PaceCalculator';
import { ToolEnd, ToolHeader } from '@/components/tools/ToolShell';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  title: 'Running Pace Calculator: Pace, Time and Splits | Pace Notes',
  description: 'Free running pace calculator: enter any two of distance, time and pace. Even-pace splits by mile, km or 5 km mat, and what a GPS watch would show.',
  path: '/tools/pace-calculator',
});

export default function PaceCalculatorPage() {
  return (
    <div className="tool-page">
      <ToolHeader slug="pace-calculator" />
      <PaceCalculator />
      <ToolEnd path="/tools/pace-calculator" how="/methodology#tools-pace-calculator" />
    </div>
  );
}
