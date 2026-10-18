import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import ChartFrame from '@/components/viz/ChartFrame';
import Plot, { Baseline } from '@/components/viz/Plot';
import Axis from '@/components/viz/Axis';
import Annotation from '@/components/viz/Annotation';
import { placeLabels } from '@/components/viz/labels';
import { linear, pc, stepEdge, stepPath, u, yScale } from '@/components/viz/scale';
import Values from '@/components/ui/Values';
import { GoalPaceBody, GoalPaceDek, type GoalBunching, type GoalObserved } from '@/components/tools/GoalPace';
import { ToolEnd, ToolPageHeader } from '@/components/tools/ToolShell';
import type { FinishTimes } from '@/lib/insights';
import { getInsightsManifest, readInsight } from '@/lib/insights-server';
import { pageMetadata } from '@/lib/seo';
import type { PaceBandGroup, PaceBandIndex, PaceBandShard } from '@/lib/tools/data';
import type { GoalPeer } from '@/lib/tools/goal-facts';
import { MARATHON_KM, perUnit } from '@/lib/tools/pace';
import { GOAL_PAGE_MINUTES, goalFromSlug, goalLabel, goalPagePath, goalSearchName, goalSlug } from '@/lib/tools/pace-chart';
import { formatDuration } from '@/lib/tools/time';

// No `dynamicParams = false`: with output 'export' it changes nothing in the build (only these slugs are exported and
// any other slug calls notFound()), and Next 14.2's dev server then answers every goal page with a 500.
export function generateStaticParams() {
  return GOAL_PAGE_MINUTES.map((m) => ({ goal: goalSlug(m) }));
}

const INDEX = 'tools/pace-band.json';
/** All courses, all recorded genders: the pace band's widest group. */
const SHARD = 'tools/pace-band/all/all.json';
const FINISH_TIMES = 'finish-times.json';
const MAX_DESCRIPTION = 155;

const index = (group: PaceBandGroup | undefined, minute: number) => (group ? group.g.indexOf(minute) : -1);

/**
 * What finishes in the five minutes under the goal ran at each mat, from the verified pace-band family (the same files the
 * pace band reads). Null when the family is not in this build, its shard digest does not match the index, or the goal has no group.
 */
function observedFor(minute: number): GoalObserved | null {
  try {
    const manifest = getInsightsManifest();
    if (!manifest.files[INDEX] || !manifest.files[SHARD]) return null;
    const bandIndex = readInsight<PaceBandIndex>(INDEX);
    const total = bandIndex.editions ?? null;
    if (bandIndex.shards?.[SHARD] !== manifest.files[SHARD].sha256) return null;
    const shard = readInsight<PaceBandShard>(SHARD);
    const all = shard.groups.all;
    const i = index(all, minute);
    if (!all || i < 0) return null;
    const windowS = shard.window_s || bandIndex.window_s;
    const side = (group: PaceBandGroup | undefined) => {
      const j = index(group, minute);
      return group && j >= 0 ? { n: group.n[j], e50: group.e50[j] } : null;
    };
    return {
      lo: minute * 60 - windowS, hi: minute * 60 - 1, n: all.n[i], editions: all.ed[i], totalEditions: total,
      e50: all.e50[i], e25: all.e25?.[i] ?? null, e75: all.e75?.[i] ?? null, s50: all.s50?.[i] ?? null, sd: all.sd?.[i] ?? null,
      onset: all.onset?.[i] ?? null, onsetKm: bandIndex.onset_sections ?? null,
      held: side(shard.groups.held), slow: side(shard.groups.slowdown),
    };
  } catch {
    return null;
  }
}

/** Finishes just under the goal mark, when the finish-time data shows bunching there (the ratio's whole 95% interval above 1). */
function bunchingFor(minute: number): GoalBunching | null {
  try {
    if (!getInsightsManifest().files[FINISH_TIMES]) return null;
    const mark = readInsight<FinishTimes>(FINISH_TIMES).marks.find((m) => m.minutes === minute);
    if (!mark || !(mark.ratio_ci95[0] > 1)) return null;
    return { before: mark.minute_before, after: mark.minute_after, expected: mark.expected_minute_before, ratio: mark.ratio, ci: mark.ratio_ci95 };
  } catch {
    return null;
  }
}

/**
 * The pile-up as a figure: finishes per minute for ten minutes either side of the goal, the smooth curve over them and the
 * minute before the goal in signal. Server-drawn (no script on the page), from the same finish-time file as the sentence.
 */
function pileupFigure(minute: number): ReactNode {
  try {
    const ft = readInsight<FinishTimes>(FINISH_TIMES);
    const lo = minute - 10, hi = minute + 10;
    const bins = ft.histogram.filter((h) => h.minute >= lo && h.minute < hi).map((h) => ({ x: h.minute, n: h.all }));
    const curve = ft.expected_curve.filter((c) => c.minute >= lo && c.minute < hi).map((c) => ({ x: c.minute, v: c.expected }));
    if (bins.length < 15 || curve.length < 15) return null;
    const hm = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
    const before = minute - 1;
    const at = (m: number) => bins.find((b) => b.x === m)?.n ?? 0;
    // The minute histogram's grammar (components/viz/Histogram), static: a silhouette, the smooth curve, the minute
    // before the goal in signal and named. No lens or needle, so the page ships no chart script.
    const height = 130;
    const x = linear([lo, hi]), w = 1 / (hi - lo);
    const y = yScale(0, Math.max(...bins.map((b) => b.n), ...curve.map((c) => c.v)), { top: 0.16 });
    const top = y(at(before));
    const placed = placeLabels([{ id: 'before', text: hm(before), x: x(before + 0.5), y: top, priority: 3, tone: 'signal', gap: 6 }], { height });
    const plot = (
      <Plot>
        <svg className="viz-paths" viewBox="0 0 1000 1000" preserveAspectRatio="none" width="100%" height="100%" overflow="visible">
          <path className="a-silhouette" d={stepPath(bins.map((b) => ({ x: x(b.x), y: y(b.n) })), w)} />
          <path className="a-edge" d={stepEdge(bins.map((b) => ({ x: x(b.x), y: y(b.n) })), w)} />
          <path className="l-ink2" d={curve.map((c, i) => `${i ? 'L' : 'M'}${u(x(c.x + 0.5))} ${u(y(c.v))}`).join('')} />
        </svg>
        <rect className="m-signal is-reading histo-tower" x={pc(x(before))} width={pc(w)} y={pc(top)} height={pc(1 - top)} />
        <Annotation labels={placed} />
        <Baseline />
      </Plot>
    );
    return (
      <ChartFrame label={`Finishes per minute from ${hm(lo)} to ${hm(hi)}, against a smooth curve: ${at(before).toLocaleString('en-US')} in the minute before ${hm(minute)}`}
        height={height} heightMd={150} plot={plot}
        axis={<Axis ticks={[lo, minute, hi].map((m) => ({ x: x(m), label: hm(m) }))} />}
        keys={[{ label: 'Finishes per minute', mark: 'square', tone: 'quiet' }, { label: 'Smooth curve', mark: 'line' }]}
        values={<Values id="goal-pace-pileup" caption={`Finishes per minute around ${hm(minute)}, and what a smooth curve expects`} columns={[{ key: 'm', label: 'Minute' }, { key: 'n', label: 'Finishes' }, { key: 'e', label: 'Smooth curve' }]}
          rows={bins.map((b) => [hm(b.x), b.n.toLocaleString('en-US'), Math.round(curve.find((c) => c.x === b.x)?.v ?? NaN).toLocaleString('en-US')])} reading={bins.findIndex((b) => b.x === before)} />} />
    );
  } catch {
    return null;
  }
}

/** Every goal page's window size and sustained-slowdown share, so a page can say where its goal sits among them. */
function goalPeers(): GoalPeer[] {
  const peers = GOAL_PAGE_MINUTES.map((goal) => {
    const o = observedFor(goal);
    return o ? { goal, n: o.n, sd: o.sd } : null;
  });
  return peers.every((p): p is GoalPeer => p !== null) ? peers : [];
}

function seo(minute: number) {
  const label = goalLabel(minute);
  const pKm = (minute * 60) / MARATHON_KM;
  const mi = formatDuration(perUnit(pKm, 'mi'));
  const km = formatDuration(pKm);
  const observed = observedFor(minute);
  const title = `${goalSearchName(minute)} Marathon Pace: ${mi}/mi, ${km}/km Splits | Pace Notes`;
  const lead = `${label} marathon pace is ${mi} per mile (${km} per km) at even pace.`;
  const long = observed ? `${lead} See the 5 km splits beside what ${observed.n.toLocaleString('en-US')} recorded finishes just under ${label} actually ran.` : '';
  const description = long && long.length <= MAX_DESCRIPTION ? long : `${lead} See the even-pace 5 km splits beside what recorded finishes just under ${label} ran.`;
  return { title, description };
}

export function generateMetadata({ params }: { params: { goal: string } }) {
  const minute = goalFromSlug(params.goal);
  if (minute === null) return {};
  return pageMetadata({ ...seo(minute), path: goalPagePath(minute) });
}

export default function GoalPacePage({ params }: { params: { goal: string } }) {
  const minute = goalFromSlug(params.goal);
  if (minute === null) notFound();
  const label = goalLabel(minute);
  const observed = observedFor(minute);
  const bunching = bunchingFor(minute);
  const peers = goalPeers();

  return (
    <div className="tool-page goal-pace-page">
      {/* No header badge: the splits card is a plain calculation, and the observed beats below carry the one badge. */}
      <ToolPageHeader path={goalPagePath(minute)} title={`${label} marathon pace`} badges={[]}
        trail={[['Reference'], ['Marathon pace chart', '/tools/marathon-pace-chart'], [`${label} marathon pace`]]}
        dek={<GoalPaceDek goal={minute} observed={observed} />}>
        <p className="print-only goal-chart-print-note">Pace Notes {label} marathon pace. splithappens.run{goalPagePath(minute)}</p>
      </ToolPageHeader>
      <div className="goal-pace-stack">
        <GoalPaceBody goal={minute} observed={observed} bunching={bunching} peers={peers} pileup={bunching ? pileupFigure(minute) : null} />
      </div>
      <ToolEnd path={goalPagePath(minute)} how="/methodology#tools-goal-pages" />
    </div>
  );
}
