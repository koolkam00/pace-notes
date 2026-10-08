import { notFound } from 'next/navigation';
import { UnitLink as Link } from '@/components/UnitsProvider';
import { GoalPaceBody, GoalPaceDek, type GoalBunching, type GoalObserved } from '@/components/tools/GoalPace';
import { ToolMethod, ToolNext } from '@/components/tools/ToolShell';
import type { FinishTimes } from '@/lib/insights';
import { getInsightsManifest, readInsight } from '@/lib/insights-server';
import { JsonLd, breadcrumbs, pageMetadata } from '@/lib/seo';
import type { PaceBandGroup, PaceBandIndex, PaceBandShard } from '@/lib/tools/data';
import { editionsText, type GoalPeer } from '@/lib/tools/goal-facts';
import { MARATHON_KM, perUnit } from '@/lib/tools/pace';
import { GOAL_PAGE_MINUTES, goalFromSlug, goalLabel, goalPagePath, goalSearchName, goalSlug } from '@/lib/tools/pace-chart';
import { SLOWDOWN_CITATION } from '@/lib/tools/splits';
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
const ACCENT = '#FF5B2E';
const MAX_DESCRIPTION = 155;

const index = (group: PaceBandGroup | undefined, minute: number) => (group ? group.g.indexOf(minute) : -1);

const grouped = (n: number) => n.toLocaleString('en-US');

/**
 * Which race editions a goal's window draws on, set against every edition in the data: "all 179 race editions whose mat
 * times line up for this comparison, out of 194 in the data". The pace band screens out editions whose first split or
 * mat grid does not line up (the index's `screens`), so its cohort is smaller than the data's.
 */
function editionsPhrase(editions: number, total: number | null, inData: number | null): string {
  const base = editionsText(editions, total);
  if (total === null || inData === null || !(inData > total)) return `${base} in the data`;
  return `${base} whose mat times line up for this comparison, out of ${grouped(inData)} in the data`;
}

/**
 * The editions and finishes the pace band leaves out, from its own screens: "The other 15 editions (153,455 finishes) are
 * left out: 13 whose first 5 km split includes start delays and 2 whose mats sit on a shifted grid." Null when the
 * screens do not account for the difference.
 */
function screenedText(bandIndex: PaceBandIndex, inData: number | null, analysisN: number): string | null {
  const total = bandIndex.editions;
  if (inData === null || !(inData > total)) return null;
  const startOffset = bandIndex.screens?.start_offset ?? [];
  const grid = bandIndex.screens?.grid ?? [];
  const out = inData - total;
  if (startOffset.length + grid.length !== out) return null;
  const finishes = [...startOffset, ...grid].reduce((sum, e) => sum + (e.finishes ?? NaN), 0);
  const counted = Number.isFinite(finishes) && finishes === analysisN - bandIndex.cohort_n ? ` (${grouped(finishes)} finishes)` : '';
  const parts = [
    startOffset.length ? `${grouped(startOffset.length)} whose first 5 km split includes start delays` : '',
    grid.length ? `${grouped(grid.length)} whose mats sit on a shifted grid` : '',
  ].filter(Boolean);
  return `The other ${grouped(out)} editions${counted} are left out: ${parts.join(' and ')}.`;
}

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
      editionsPhrase: editionsPhrase(all.ed[i], total, manifest.cohort?.editions ?? null), screened: screenedText(bandIndex, manifest.cohort?.editions ?? null, manifest.analysis_n),
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
    <div className="container tool-page goal-pace-page" style={{ ['--tool' as string]: ACCENT }}>
      <header className="tool-header">
        <p className="eyebrow"><Link href="/tools">Runner tools</Link> · <Link href="/tools/marathon-pace-chart">Marathon pace chart</Link></p>
        <h1 className="tool-title">{label} marathon pace</h1>
        <GoalPaceDek goal={minute} observed={observed} peers={peers} />
        <p className="print-only goal-chart-print-note">Pace Notes {label} marathon pace. Even-pace splits are calculated from the goal, not recorded; the observed columns are Pace Notes data. splithappens.run{goalPagePath(minute)}</p>
        <JsonLd data={breadcrumbs([['Pace Notes', '/'], ['Runner tools', '/tools'], ['Marathon pace chart', '/tools/marathon-pace-chart'], [`${label} marathon pace`]])} />
      </header>

      <div className="goal-pace-stack">
        <GoalPaceBody goal={minute} observed={observed} bunching={bunching} peers={peers} />
      </div>

      <ToolMethod sources={[SLOWDOWN_CITATION]}>
        <p><strong>The even-pace splits are a calculation.</strong> Even pace is the goal divided by 42.195 km; a mile is 1.609344 km and halfway is 21.0975 km. The elapsed time at any point is that pace times the distance, rounded to whole seconds once, at display. They are not recorded splits.</p>
        <p><strong>The observed columns are Pace Notes data.</strong> For the {label} goal the window holds every screened finish from {observed ? `${formatDuration(observed.lo, true)} to ${formatDuration(observed.hi, true)}` : 'the five minutes under the goal'} on all courses{observed ? `, ${observed.n.toLocaleString('en-US')} finishes from ${observed.editionsPhrase},` : ''} each with all nine official 5 km checkpoint times: achieved finishes, not stated goals.{observed?.screened ? ` ${observed.screened}` : ''} They are the same groups the <Link href="/tools/pace-band">pace band</Link> shows for All courses. Editions are pooled, so the group mixes different years, courses, weather and fields. The middle half is the 25th to 75th percentile: observed variation between finishes, not uncertainty in an estimate, and not a recommended plan. There are no observed halfway or mile splits, because the source records only the 5 km mats. A section’s median pace is the median of every finish’s own pace over that section, so it need not equal the gap between two mat medians.</p>
        <p><strong>What is not here.</strong> Only complete finishes are recorded, so runners who stopped are missing. Counts are finishes, not people: one runner can appear in several editions. Weather and elevation do not enter any number.</p>
      </ToolMethod>
      <ToolNext current="" />
    </div>
  );
}
