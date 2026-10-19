import { UnitLink as Link } from '@/components/UnitsProvider';
import Arrow from '@/components/ui/Arrow';
import PageFeedback from '@/components/PageFeedback';
import { getInsightsManifest } from '@/lib/insights-server';
import { TOOLS, toolHref, type ToolGroup } from '@/lib/tools/registry';
import { pageMetadata } from '@/lib/seo';
import { GOAL_PAGE_MINUTES, HALF_CHART, MARATHON_CHART, goalLabel, goalPagePath } from '@/lib/tools/pace-chart';

export const metadata = pageMetadata({
  title: 'Free Marathon Calculators and Pacing Tools | Pace Notes',
  description: 'Free marathon tools: race planner, pace calculator, predictor, pace band, course chooser, weather match, projector, split check and qualifying times.',
  path: '/tools',
});

const GROUPS: { group: ToolGroup; title: string }[] = [
  { group: 'race', title: 'For your race' },
  { group: 'reference', title: 'Reference' },
];

/** One tool, two lines: its name, then what it does. No number, so no badge (each tool's own first screen has its reading). */
function Row({ href, title, line }: { href: string; title: string; line: string }) {
  return (
    <li>
      <Link href={href} className="tools-row">
        <span className="tools-row-text"><b>{title}</b><span>{line}</span></span>
        <Arrow />
      </Link>
    </li>
  );
}

/**
 * /tools (the redesign spec, section 00 cut 3): one list of tools in two groups, each row its name and one plain line of
 * what it does (critic round 4: a statistic and a badge on every row made the busiest list on the site, seven badges on a
 * phone screen). A data tool shows only when its file is in the verified manifest. The pace charts and the goal pages
 * are reference lookups too.
 */
export default function ToolsPage() {
  const manifest = getInsightsManifest();
  const available = TOOLS.filter((t) => !t.file || manifest.files[t.file]);
  const marathon = `${goalLabel(MARATHON_CHART.goals[0])} to ${goalLabel(MARATHON_CHART.goals[MARATHON_CHART.goals.length - 1])}`;
  const half = `${goalLabel(HALF_CHART.goals[0])} to ${goalLabel(HALF_CHART.goals[HALF_CHART.goals.length - 1])}`;
  return (
    <div className="tool-page tools-index">
      <header className="tool-header">
        <h1 className="tool-title t-title">Tools</h1>
        <p className="tool-dek">For one race: plan it, pace it, follow it and read it afterwards, beside what finishes like it ran.</p>
      </header>
      {GROUPS.map(({ group, title }) => {
        const tools = available.filter((t) => t.group === group);
        return (
          <section key={group} className="tools-group" aria-labelledby={`tools-${group}`}>
            <h2 id={`tools-${group}`} className="tools-group-title">{title}</h2>
            <ul className="tools-list">
              {tools.map((t) => <Row key={t.slug} href={toolHref(t)} title={t.title} line={t.short} />)}
              {group === 'reference' ? (
                <>
                  <Row href="/tools/marathon-pace-chart" title="Marathon pace chart" line={`Every goal from ${marathon}`} />
                  <Row href="/tools/half-marathon-pace-chart" title="Half marathon pace chart" line={`Every goal from ${half}`} />
                  <li className="tools-goals">
                    <span className="tools-row-text"><b>Pace for one goal</b><span>Even splits beside what finishes at that goal ran</span></span>
                    <span className="tools-goal-links">
                      {GOAL_PAGE_MINUTES.map((m) => <Link key={m} href={goalPagePath(m)} aria-label={`${goalLabel(m)} marathon pace`}>{goalLabel(m)}</Link>)}
                    </span>
                  </li>
                </>
              ) : null}
            </ul>
          </section>
        );
      })}
      <div className="chapter-end tool-end">
        <p className="tools-privacy">Everything runs in your browser. Birth dates never go into links or analytics.</p>
        <PageFeedback />
      </div>
    </div>
  );
}
