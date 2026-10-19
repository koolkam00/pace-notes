import type { ReactNode } from 'react';
import { UnitLink as Link } from '@/components/UnitsProvider';
import Arrow from '@/components/ui/Arrow';
import PageFeedback from '@/components/PageFeedback';
import { EvidenceTag } from '@/components/tools/EvidenceTag';
import { Pace } from '@/components/story/Units';
import { getInsightsManifest, readInsight } from '@/lib/insights-server';
import { EXAMPLE_PROFILE } from '@/lib/analysis-profile';
import { readingOf, type NuggetId } from '@/lib/nuggets';
import type { CourseGoal, PaceBandShard } from '@/lib/tools/data';
import { cellOf } from '@/lib/tools/pace-band-data';
import { HALF_KM, MARATHON_KM } from '@/lib/tools/pace';
import { PREDICTOR_EXAMPLE, marathonRange } from '@/lib/tools/predictor';
import { formatDuration, formatHM } from '@/lib/tools/time';
import { TOOLS, toolHref, type ToolEvidence, type ToolGroup } from '@/lib/tools/registry';
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

/** A row's reading: its figure, a few words of key, and the kind of evidence it comes from (none: a plain calculation). */
type RowReading = { figure: ReactNode; key: string; kind?: ToolEvidence } | null;

/** Read an optional tool file: null when it is not in this build's verified manifest. */
function optional<T>(name: string): T | null {
  try {
    return getInsightsManifest().files[name] ? readInsight<T>(name) : null;
  } catch {
    return null;
  }
}

/**
 * Each tool's row reads its own example's answer (critic round 3: the hub was the one list without readings), every
 * number from the tool's data or its own calculation for the example inputs, never typed: the planner, projector, weather
 * match and split check by their chapter readings (lib/nuggets/tools.ts); the pace band, course chooser and predictor from
 * the same files and formulas their pages use; the calculator's even pace for the example goal. Each reading carries the
 * word for its evidence, so the list needs no legend; a plain calculation carries none.
 */
function readings(): Record<string, RowReading> {
  const goal = EXAMPLE_PROFILE.goal;
  const g = formatHM(goal * 60);
  const nugget = (id: NuggetId, kind: ToolEvidence): RowReading => {
    const r = readingOf(id);
    return r ? { figure: <>{r.value}{r.unit ? <small>{r.unit}</small> : null}</>, key: r.key ?? '', kind } : null;
  };
  // The pace band: at 20K, how far ahead the finishes just under the goal that later had a sustained slowdown were.
  const band = optional<PaceBandShard>('tools/pace-band/all/all.json');
  const held = band ? cellOf(band.groups.held, goal) : null, slow = band ? cellOf(band.groups.slowdown, goal) : null;
  const gap20 = held && slow ? held.e50[3] - slow.e50[3] : NaN;
  const windowLo = band ? goal * 60 - band.window_s : NaN;
  // The course chooser at the example goal: the share that made it, from the lowest course to the highest.
  const cg = optional<CourseGoal>('tools/course-goal.json');
  const listed = new Set((cg?.courses ?? []).map((c) => c.city));
  const shares = (cg?.rows ?? []).filter((r) => r.goal === goal && listed.has(r.city)).map((r) => r.under);
  const pc = (v: number) => `${Math.round(v * 100)}`;
  // The predictor's example race and its typical recreational range.
  const range = marathonRange(HALF_KM, PREDICTOR_EXAMPLE.seconds);
  return {
    plan: nugget('plan.goal', 'data'),
    'pace-band': Number.isFinite(gap20) && gap20 !== 0 ? {
      figure: formatDuration(Math.abs(gap20)), kind: 'data',
      key: `${gap20 > 0 ? 'ahead' : 'behind'} at 20K, for ${formatHM(windowLo)}–${formatHM(goal * 60 - 60)} finishes that later had a sustained slowdown`,
    } : null,
    'course-chooser': shares.length >= 2 ? {
      figure: <>{pc(Math.min(...shares))}–{pc(Math.max(...shares))}<small>%</small></>, kind: 'data',
      key: `made ${g} from within ${Math.round((cg?.tolerance ?? 0.02) * 100)}% of its pace at 20K, course by course`,
    } : null,
    predictor: { figure: `${formatHM(range.low)}–${formatHM(range.high)}`, key: `a typical marathon range from a ${formatHM(PREDICTOR_EXAMPLE.seconds)} half`, kind: 'research' },
    'weather-match': nugget('weathermatch.mornings', 'data'),
    projector: nugget('projector.range', 'data'),
    'split-check': nugget('splitcheck.share', 'data'),
    'pace-calculator': { figure: <Pace secondsPerKm={(goal * 60) / MARATHON_KM} />, key: `even pace for a ${g} marathon` },
  };
}

/** One tool, two lines: its name, then its example's reading (or what it is for), the reading's evidence named at its end. */
function Row({ href, title, line, reading, lineKind }: { href: string; title: string; line: string; reading?: RowReading; lineKind?: ToolEvidence }) {
  return (
    <li>
      <Link href={href} className="tools-row">
        <span className="tools-row-text">
          <b>{title}</b>
          {reading ? (
            <span className="tools-row-reading"><strong>{reading.figure}</strong> {reading.key}{reading.kind ? <> <EvidenceTag kind={reading.kind} link={false} className="tools-row-badge" /></> : null}</span>
          ) : <span>{line}{lineKind ? <> <EvidenceTag kind={lineKind} link={false} className="tools-row-badge" /></> : null}</span>}
        </span>
        <Arrow />
      </Link>
    </li>
  );
}

/**
 * /tools (the redesign spec, section 00 cut 3): one list of tools in two groups, each row its example's reading. A data
 * tool shows only when its file is in the verified manifest. The pace charts and the goal pages are reference lookups too.
 */
export default function ToolsPage() {
  const manifest = getInsightsManifest();
  const available = TOOLS.filter((t) => !t.file || manifest.files[t.file]);
  const marathon = `${goalLabel(MARATHON_CHART.goals[0])} to ${goalLabel(MARATHON_CHART.goals[MARATHON_CHART.goals.length - 1])}`;
  const half = `${goalLabel(HALF_CHART.goals[0])} to ${goalLabel(HALF_CHART.goals[HALF_CHART.goals.length - 1])}`;
  const read = readings();
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
              {tools.map((t) => <Row key={t.slug} href={toolHref(t)} title={t.title} line={t.short}
                reading={read[t.slug] ?? null} lineKind={t.evidence.length === 1 ? t.evidence[0] : undefined} />)}
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
