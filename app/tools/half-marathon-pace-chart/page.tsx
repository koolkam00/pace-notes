import { UnitLink as Link } from '@/components/UnitsProvider';
import PaceChartTable from '@/components/tools/PaceChartTable';
import { ToolMethod, ToolNext } from '@/components/tools/ToolShell';
import { JsonLd, breadcrumbs, pageMetadata } from '@/lib/seo';
import { HALF_KM } from '@/lib/tools/pace';
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

const ACCENT = '#2F5BFF';

export default function HalfMarathonPaceChartPage() {
  return (
    <div className="container tool-page goal-chart-page" style={{ ['--tool' as string]: ACCENT }}>
      <header className="tool-header">
        <p className="eyebrow"><Link href="/tools">Runner tools</Link> · Pace charts</p>
        <h1 className="tool-title">Half marathon pace chart</h1>
        <p className="tool-dek">
          Pace per mile and per kilometre for every half-marathon goal from {first} to {last}, with the time at {pointList}.
          Every number is calculated at even pace from the goal.
        </p>
        <p className="print-only goal-chart-print-note">Pace Notes half marathon pace chart. Calculated at even pace from each goal; these are not recorded splits. splithappens.run/tools/half-marathon-pace-chart</p>
        <JsonLd data={breadcrumbs([['Pace Notes', '/'], ['Runner tools', '/tools'], ['Half marathon pace chart']])} />
      </header>

      <section className="goal-chart-intro no-print" aria-label="How to read the chart">
        <div>
          <h2>What even pace means</h2>
          <p>Every kilometre takes the same time, and so does every mile: the goal divided by {HALF_KM} km (13.1 miles). The time at any point is that pace times the distance.</p>
        </div>
        <div>
          <h2>How to use it</h2>
          <p>Find your goal row. Its <b>Splits</b> link opens the <Link href="/tools/pace-calculator">pace calculator</Link> for that goal, with splits every 400 m, quarter mile, kilometre or mile.</p>
        </div>
        <div>
          <h2>Running a marathon?</h2>
          <p>The <Link href="/tools/marathon-pace-chart">marathon pace chart</Link> covers goals from {marathonRange}, with every 5 km mat and halfway.</p>
        </div>
      </section>

      <div className="goal-chart-stack">
        <PaceChartTable race="half" />
      </div>


      <ToolMethod>
        <p><strong>Every number is an even-pace calculation.</strong> Even pace is the goal divided by {HALF_KM} km; a mile is 1.609344 km. The elapsed time at any point is that pace times the distance. Paces and times are rounded to whole seconds once, at display. These are not recorded splits, and nothing on this page uses race data, weather or elevation.</p>
      </ToolMethod>
      <ToolNext current="" />
    </div>
  );
}
