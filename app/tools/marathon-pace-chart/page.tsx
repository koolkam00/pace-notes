import { UnitLink as Link } from '@/components/UnitsProvider';
import PaceChartTable from '@/components/tools/PaceChartTable';
import { ToolEnd, ToolPageHeader } from '@/components/tools/ToolShell';
import { pageMetadata } from '@/lib/seo';
import { GOAL_PAGE_MINUTES, HALF_CHART, MARATHON_CHART, goalLabel, goalPagePath } from '@/lib/tools/pace-chart';

const first = goalLabel(MARATHON_CHART.goals[0]);
const last = goalLabel(MARATHON_CHART.goals[MARATHON_CHART.goals.length - 1]);
const halfRange = `${goalLabel(HALF_CHART.goals[0])} to ${goalLabel(HALF_CHART.goals[HALF_CHART.goals.length - 1])}`;

export const metadata = pageMetadata({
  title: 'Marathon Pace Chart by Goal Time (Miles & km) | Pace Notes',
  description: `Marathon pace chart for every goal from ${first} to ${last}: pace per mile and per km, and the even-pace time at each 5 km mat and halfway. Free to print.`,
  path: '/tools/marathon-pace-chart',
});

export default function MarathonPaceChartPage() {
  return (
    <div className="tool-page goal-chart-page">
      <ToolPageHeader path="/tools/marathon-pace-chart" title="Marathon pace chart" trail={[['Reference'], ['Marathon pace chart']]}
        dek={<>Every goal from {first} to {last}: the pace per mile and per km, and the time at each 5K mat and halfway at an even pace.</>}>
        <p className="print-only goal-chart-print-note">Pace Notes marathon pace chart. Even pace for each goal. splithappens.run/tools/marathon-pace-chart</p>
      </ToolPageHeader>

      <PaceChartTable race="marathon" />

      <nav className="tools-goals goal-chart-goals no-print" aria-labelledby="goal-chart-goals-title">
        <h2 id="goal-chart-goals-title" className="tool-handoffs-label">Even pace beside what finishes ran</h2>
        <ul className="tools-goal-links">
          {GOAL_PAGE_MINUTES.map((m) => <li key={m}><Link href={goalPagePath(m)}>{goalLabel(m)}</Link></li>)}
        </ul>
        <p className="tool-note">Running a half? The <Link href="/tools/half-marathon-pace-chart">half marathon pace chart</Link> covers {halfRange}.</p>
      </nav>

      <ToolEnd path="/tools/marathon-pace-chart" how="/methodology#tools-pace-charts" />
    </div>
  );
}
