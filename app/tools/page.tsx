import { UnitLink as Link } from '@/components/UnitsProvider';
import Arrow from '@/components/ui/Arrow';
import PageFeedback from '@/components/PageFeedback';
import { EvidenceBadge } from '@/components/tools/ToolShell';
import { EvidenceTag } from '@/components/tools/EvidenceTag';
import { getInsightsManifest } from '@/lib/insights-server';
import { TOOLS, toolHref, type ToolDefinition, type ToolGroup } from '@/lib/tools/registry';
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

/** Badges in one order on every row: Pace Notes data first, then published research, then official standards. */
const BADGE_ORDER: ToolDefinition['evidence'] = ['data', 'research', 'official'];

const BADGE_WORDS: Record<ToolDefinition['evidence'][number], string> = { data: 'Pace Notes data', research: 'Published research', official: 'Official standards' };

/**
 * One tool, two lines: its name with its evidence glyphs (● data, ◆ research, ■ official, keyed once under the dek and
 * named for screen readers), and what it is for; then the way in.
 */
function Row({ href, title, line, badges = [] }: { href: string; title: string; line: string; badges?: ToolDefinition['evidence'] }) {
  return (
    <li>
      <Link href={href} className="tools-row">
        <span className="tools-row-text">
          <b>{title}{badges.length ? <span className="tools-row-badges">{[...badges].sort((a, b) => BADGE_ORDER.indexOf(a) - BADGE_ORDER.indexOf(b)).map((e) => (
            <EvidenceTag key={e} kind={e} link={false} className="is-glyph"><span className="sr-only">{BADGE_WORDS[e]}</span></EvidenceTag>
          ))}</span> : null}</b>
          <span>{line}</span>
        </span>
        <Arrow />
      </Link>
    </li>
  );
}

/**
 * /tools (the redesign spec, section 00 cut 3): one list of tools, one line each, in two groups. A data tool shows only
 * when its file is in the verified manifest. The pace charts and the goal pages are reference lookups too.
 */
export default function ToolsPage() {
  const manifest = getInsightsManifest();
  const available = TOOLS.filter((t) => !t.file || manifest.files[t.file]);
  const marathon = `${goalLabel(MARATHON_CHART.goals[0])} to ${goalLabel(MARATHON_CHART.goals[MARATHON_CHART.goals.length - 1])}`;
  const half = `${goalLabel(HALF_CHART.goals[0])} to ${goalLabel(HALF_CHART.goals[HALF_CHART.goals.length - 1])}`;
  return (
    <div className="tool-page tools-index">
      <header className="tool-header">
        <h1 className="tool-title t-title">Runner tools</h1>
        <p className="tool-dek">For one race: plan it, pace it, follow it and read it afterwards, beside what finishes like it ran.</p>
        {/* The evidence key, once: each row shows its glyphs. */}
        <p className="tools-key">{BADGE_ORDER.map((e) => <EvidenceBadge key={e} kind={e} />)}</p>
      </header>
      {GROUPS.map(({ group, title }) => {
        const tools = available.filter((t) => t.group === group);
        return (
          <section key={group} className="tools-group" aria-labelledby={`tools-${group}`}>
            <h2 id={`tools-${group}`} className="tools-group-title">{title}</h2>
            <ul className="tools-list">
              {tools.map((t) => <Row key={t.slug} href={toolHref(t)} title={t.title} line={t.short} badges={t.evidence} />)}
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
