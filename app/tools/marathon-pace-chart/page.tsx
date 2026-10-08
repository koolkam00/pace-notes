import { UnitLink as Link } from '@/components/UnitsProvider';
import PaceChartTable from '@/components/tools/PaceChartTable';
import { ToolMethod, ToolNext } from '@/components/tools/ToolShell';
import { JsonLd, breadcrumbs, pageMetadata } from '@/lib/seo';
import { GOAL_PAGE_MINUTES, HALF_CHART, MARATHON_CHART, goalLabel, goalPagePath } from '@/lib/tools/pace-chart';

const first = goalLabel(MARATHON_CHART.goals[0]);
const last = goalLabel(MARATHON_CHART.goals[MARATHON_CHART.goals.length - 1]);
const halfRange = `${goalLabel(HALF_CHART.goals[0])} to ${goalLabel(HALF_CHART.goals[HALF_CHART.goals.length - 1])}`;

export const metadata = pageMetadata({
  title: 'Marathon Pace Chart by Goal Time (Miles & km) | Pace Notes',
  description: `Marathon pace chart for every goal from ${first} to ${last}: pace per mile and per km, and the even-pace time at each 5 km mat and halfway. Free to print.`,
  path: '/tools/marathon-pace-chart',
});

const ACCENT = '#2F5BFF';

export default function MarathonPaceChartPage() {
  return (
    <div className="container tool-page goal-chart-page" style={{ ['--tool' as string]: ACCENT }}>
      <header className="tool-header">
        <p className="eyebrow"><Link href="/tools">Runner tools</Link> · Pace charts</p>
        <h1 className="tool-title">Marathon pace chart</h1>
        <p className="tool-dek">
          Pace per mile and per kilometre for every marathon goal from {first} to {last}, with the time at each 5 km timing mat and at halfway,
          all calculated at even pace from the goal.
        </p>
        <p className="print-only goal-chart-print-note">Pace Notes marathon pace chart. Calculated at even pace from each goal; these are not recorded splits. splithappens.run/tools/marathon-pace-chart</p>
        <JsonLd data={breadcrumbs([['Pace Notes', '/'], ['Runner tools', '/tools'], ['Marathon pace chart']])} />
      </header>

      <section className="goal-chart-intro no-print" aria-label="How to read the chart">
        <div>
          <h2>What even pace means</h2>
          <p>Every kilometre takes the same time, and so does every mile: the goal divided by 42.195 km (26.2 miles). Halfway is exactly half the goal.</p>
        </div>
        <div>
          <h2>How to use it</h2>
          <p>Find your goal row. Its <b>Pace band</b> link prints that goal as a wristband; the <Link href="/tools/pace-calculator">pace calculator</Link> gives splits every 400 m, kilometre or mile. Running a half? The <Link href="/tools/half-marathon-pace-chart">half marathon pace chart</Link> covers goals from {halfRange}.</p>
        </div>
        <div>
          <h2>What recorded finishes ran</h2>
          <p>Underlined goals have a page that sets these splits beside what recorded finishes at that goal ran at each mat. The <Link href="/stories/round-numbers">3:59 effect</Link> story shows finish times bunching just under round numbers.</p>
        </div>
      </section>

      <div className="goal-chart-stack">
        <PaceChartTable race="marathon" />
      </div>

      <nav className="goal-chart-goals no-print" aria-labelledby="goal-chart-goals-title">
        <h2 id="goal-chart-goals-title">Goal pages: even pace beside recorded finishes</h2>
        <ul>
          {GOAL_PAGE_MINUTES.map((m) => (
            <li key={m}><Link href={goalPagePath(m)}><b>{goalLabel(m)}</b><span>marathon pace</span></Link></li>
          ))}
        </ul>
      </nav>


      <ToolMethod>
        <p><strong>Every number is an even-pace calculation.</strong> Even pace is the goal divided by 42.195 km; a mile is 1.609344 km. The elapsed time at any point is that pace times the distance: the official timing mats every 5 km from 5 to 40 km, halfway at 21.0975 km and, in miles, the markers every 5 miles. Paces and times are rounded to whole seconds once, at display.</p>
        <p><strong>None of these are recorded splits.</strong> Official trackers record the 5 km mats, so the goal pages and the <Link href="/tools/pace-band">pace band</Link> show what recorded finishes ran at each mat, as Pace Notes data, next to the calculated even pace. Nothing on this page uses weather, elevation or course.</p>
      </ToolMethod>
      <ToolNext current="" />
    </div>
  );
}
