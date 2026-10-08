import PaceCalculator from '@/components/tools/PaceCalculator';
import { ToolHeader, ToolMethod, ToolNext } from '@/components/tools/ToolShell';
import { pageMetadata } from '@/lib/seo';
import './pace-calculator.css';

export const metadata = pageMetadata({
  title: 'Running Pace Calculator: Pace, Time and Splits | Pace Notes',
  description: 'Free running pace calculator: enter any two of distance, time and pace. Even-pace splits by mile, km or 5 km mat, and what a GPS watch would show.',
  path: '/tools/pace-calculator',
});

/** Course measurement rules behind the watch table. Checked against the English edition on this date. */
const MEASUREMENT_CHECKED = 'October 7, 2026';
const SOURCES = [
  {
    label: `World Athletics and AIMS, The Measurement of Road Race Courses (revised edition, 2023): Rule 55.3, shortest possible route and the 0.1% short course prevention factor. Checked ${MEASUREMENT_CHECKED}.`,
    url: 'https://media.aws.iaaf.org/competitioninfo/2023%20Course%20Measurement%20Book%20-%20ENG.pdf',
  },
];

export default function PaceCalculatorPage() {
  return (
    <div className="container tool-page">
      <ToolHeader slug="pace-calculator" />
      <PaceCalculator />
      <ToolMethod sources={SOURCES}>
        <p>Pace is time divided by distance; speed is distance divided by time. A marathon is 42.195 km (26.22 miles), a half 21.0975 km and a mile 1.609344 km. Every split row is the elapsed time at an even pace, or, with a second-half difference, at an even pace within each half. Times are rounded to whole seconds once, at display. A custom distance can be from 0.1 to 1,000 km; split tables stop at 500 rows, so very long distances offer only the longer split intervals.</p>
        <p>Certified road courses are measured along the shortest possible route a runner could take (World Athletics Rule 55.3), and measurers add 0.1%, the short course prevention factor, so a later re-measurement does not find the course short: each kilometre is laid out as 1,001 m (World Athletics and AIMS course measurement manual, checked {MEASUREMENT_CHECKED}). GPS watches usually record a slightly longer distance, so their average pace reads faster than your course pace. The watch table shows what a watch would display at several readings; it does not assume a typical error.</p>
      </ToolMethod>
      <ToolNext current="pace-calculator" />
    </div>
  );
}
