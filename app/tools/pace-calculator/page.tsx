import PaceCalculator from '@/components/tools/PaceCalculator';
import { ToolHeader, ToolNext } from '@/components/tools/ToolShell';
import { pageMetadata } from '@/lib/seo';
import './pace-calculator.css';

export const metadata = pageMetadata({
  title: 'Running Pace Calculator: Pace, Time and Splits | Pace Notes',
  description: 'Free running pace calculator: enter any two of distance, time and pace. Even-pace splits by mile, km or 5 km mat, and what a GPS watch would show.',
  path: '/tools/pace-calculator',
});

export default function PaceCalculatorPage() {
  return (
    <div className="container tool-page">
      <ToolHeader slug="pace-calculator" />
      <PaceCalculator />
      <ToolNext current="pace-calculator" />
    </div>
  );
}
