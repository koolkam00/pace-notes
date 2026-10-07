import PaceCalculator from '@/components/tools/PaceCalculator';
import { ToolHeader, ToolMethod, ToolNext } from '@/components/tools/ToolShell';

export const metadata = {
  title: 'Pace calculator and marathon pace chart | Pace Notes',
  description: 'Solve pace, time or distance instantly in miles or kilometres. Splits every 400 m, quarter mile, kilometre, mile or 5 km mat, treadmill speed, watch-reading scenarios and a printable marathon pace chart.',
};

export default function PaceCalculatorPage() {
  return (
    <div className="container tool-page">
      <ToolHeader slug="pace-calculator" />
      <PaceCalculator />
      <ToolMethod>
        <p>Pace is time divided by distance; speed is distance divided by time. A marathon is 42.195 km (26.22 miles), a half 21.0975 km and a mile 1.609344 km. Every split row is the elapsed time at an even pace, or, with a second-half difference, at an even pace within each half. Times are rounded to whole seconds once, at display.</p>
        <p>Race courses are measured along the shortest route a runner could take, plus a 0.1% allowance so they are never short. GPS watches usually record a slightly longer distance, so their average pace reads faster than your course pace. The watch table shows what a watch would display at several readings; it does not assume a typical error.</p>
      </ToolMethod>
      <ToolNext current="pace-calculator" />
    </div>
  );
}
