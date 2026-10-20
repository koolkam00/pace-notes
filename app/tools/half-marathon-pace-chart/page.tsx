import { UnitLink as Link } from '@/components/UnitsProvider';
import PaceChartTable from '@/components/tools/PaceChartTable';
import { ToolEnd, ToolPageHeader } from '@/components/tools/ToolShell';
import { pageMetadata } from '@/lib/seo';
import { HALF_CHART, MARATHON_CHART, goalLabel } from '@/lib/tools/pace-chart';

const first = goalLabel(HALF_CHART.goals[0]);
const last = goalLabel(HALF_CHART.goals[HALF_CHART.goals.length - 1]);
const points = HALF_CHART.points.map((p) => p.km);
const marathonRange = `${goalLabel(MARATHON_CHART.goals[0])} to ${goalLabel(MARATHON_CHART.goals[MARATHON_CHART.goals.length - 1])}`;
const pointList = `${points.slice(0, -1).join(', ')} and ${points[points.length - 1]} km`;

export const metadata = pageMetadata({
  title: 'Half Marathon Pace Chart by Goal Time | Pace Notes',
  description: `Half marathon pace chart for goals from ${first} to ${last}: pace per mile and per km, and the even-pace time at ${pointList}. Free to print.`,
  path: '/tools/half-marathon-pace-chart',
});

export default function HalfMarathonPaceChartPage() {
  return (
    <div className="tool-page goal-chart-page">
      <ToolPageHeader path="/tools/half-marathon-pace-chart" title="Half marathon pace chart" trail={[['Reference'], ['Half marathon pace chart']]}
        dek={<>Every goal from {first} to {last}: the pace per mile and per km, and the time at {pointList} at an even pace.</>}>
        <p className="print-only goal-chart-print-note">Pace Notes half marathon pace chart. Even pace for each goal. splithappens.run/tools/half-marathon-pace-chart</p>
      </ToolPageHeader>

      <PaceChartTable race="half" />

      <p className="tool-note goal-chart-other no-print">Running a marathon? The <Link href="/tools/marathon-pace-chart">marathon pace chart</Link> covers {marathonRange}.</p>

      <ToolEnd path="/tools/half-marathon-pace-chart" how="/methodology#tools-pace-charts" />
    </div>
  );
}
