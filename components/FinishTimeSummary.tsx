import { UnitLink as Link } from '@/components/UnitsProvider';
import DotStrip from '@/components/viz/DotStrip';
import Values from '@/components/ui/Values';
import PercentileDots from '@/components/story/charts/PercentileDots';
import Ruler from '@/components/viz/Ruler';
import EraShift from '@/components/story/charts/EraShift';
import { Beat, StoryHero, StoryPage } from '@/components/story/StoryPage';
import { FINISH_GROUPS, GROUP_LABEL, clockMinute, ordinal, percentileMinutes, type FinishTimeSummary as Summary, type GroupSummary } from '@/lib/finish-times-summary';
import type { Courses } from '@/lib/insights';
import { getNugget, sentenceOf } from '@/lib/nuggets';
import { count, hm } from '@/lib/nuggets/format';
import { courseSlug } from '@/lib/tools/links';
import { finishMinute } from '@/lib/course-page';

const PATH = '/finish-times';
const at = (g: GroupSummary, p: number) => g.percentiles.find((x) => x.p === p)?.minute ?? null;
const MINUS = '−';
const signedMin = (v: number) => `${v > 0 ? '+' : v < 0 ? MINUS : ''}${Math.abs(v).toFixed(1)} min`;

/**
 * Chapter 01's opener, /finish-times (the redesign spec, section 7.3, under section 00): the median finish alone under
 * the H1 (recorded women's and men's medians are in All numbers: women against men is chapter 07's story), then three
 * beats: every finish as 99 finishes, the front of the field against the back across the eras, and the median course by
 * course. Every number comes from the field.* nuggets and the verified story data; what the numbers cover and how they
 * are counted is on /methodology.
 */
export default function FinishTimeSummary({ summary, courses }: { summary: Summary; courses: Courses }) {
  const { groups } = summary;
  const title = getNugget('field.title'), median = getNugget('field.median'), middle = getNugget('field.middle'), front = getNugget('field.front'), byRace = getNugget('field.byrace');

  // The opener's ruler: whole hours around the median, the hour the H1 names (the median's own) and everything past it.
  const medianAll = groups.all.median ?? NaN;
  const hourMark = Math.floor(medianAll / 60) * 60;
  const rLo = hourMark - 60, rHi = hourMark + 120;
  const rulerTicks = [rLo, hourMark, hourMark + 60, rHi].map((m) => ({ value: m, label: hm(m) }));

  // Every finish as 99 finishes: the 1st to the 99th percentile of all finishes. Recorded women and men are the reading's
  // ruler and the Values table, so the beat has no control that would move it away from its H2.
  const centiles = (g: typeof FINISH_GROUPS[number]) => percentileMinutes(summary.bins.map((b) => ({ minute: b.minute, n: b[g] })), groups[g].total);
  const minutes = centiles('all');
  // The middle half is the H2's run (its ends are the H2's times); the median is the one signal dot.
  const layer = { minutes, band: [24, 74] as [number, number], bandLabel: 'The middle half', mark: { index: 49, text: 'Median' } };
  const dLo = Math.floor(minutes[0] / 30) * 30;
  const dHi = Math.ceil(minutes[98] / 30) * 30;
  const dotTicks = [];
  // Ticks on the round hours this chapter is about, never the half hours.
  for (let m = Math.ceil(dLo / 60) * 60; m <= dHi; m += 60) dotTicks.push({ value: m, label: hm(m) });

  // The eras: each fully covered course's change at the 10th and 90th percentile, in minutes.
  const eras = courses.years.eras;
  const covered = eras.courses.filter((c) => c.high_coverage);
  const change = (pair: [number, number]) => (pair[1] - pair[0]) / 60;
  const rows = [
    { id: 'p10', label: 'Front of the field', values: covered.map((c) => ({ id: c.city, v: change(c.p10) })), mean: eras.summary.p10.change, display: signedMin(eras.summary.p10.change), tone: 'signal' as const },
    { id: 'p90', label: 'Back of the field', values: covered.map((c) => ({ id: c.city, v: change(c.p90) })), mean: eras.summary.p90.change, display: signedMin(eras.summary.p90.change), tone: 'ink' as const },
  ];
  const span = Math.ceil(Math.max(...rows.flatMap((r) => r.values.map((v) => Math.abs(v.v)))) / 5) * 5;

  // Course by course: each course's median finish across its editions. The strip draws the courses the H2's range spans
  // (100 or more finishes and three or more editions), so no dot sits past the range it names; All numbers lists every
  // course with 100 or more finishes, with its editions.
  const list = courses.courses.filter((c) => c.finishes >= 100);
  const drawn = list.filter((c) => c.editions >= 3);
  const t0 = Math.floor(Math.min(...drawn.map((c) => c.median_s)) / 1800) * 1800, t1 = Math.ceil(Math.max(...drawn.map((c) => c.median_s)) / 1800) * 1800;
  const stripTicks = [];
  for (let t = t0; t <= t1; t += 1800) stripTicks.push({ value: t, label: hm(t / 60) });

  return (
    <StoryPage path={PATH} numbers={[
      <Values key="ft-percentiles" bare id="ft-percentiles" caption="Finish time at each percentile"
        columns={[{ key: 'p', label: 'Percentile' }, ...FINISH_GROUPS.map((g) => ({ key: g, label: GROUP_LABEL[g] }))]}
        rows={[0.1, 0.25, 0.5, 0.75, 0.9].map((p) => [ordinal(p), ...FINISH_GROUPS.map((g) => { const m = at(groups[g], p); return m === null ? '—' : clockMinute(m); })])}
        reading={2} />,
      <Values key="ft-eras" bare id="ft-eras" caption={`Change from ${eras.pre[0]}–${eras.pre[1]} to ${eras.post[0]}–${eras.post[1]}, by course`}
        columns={[{ key: 'c', label: 'Course', text: true }, { key: 'f', label: 'Front, 10th percentile' }, { key: 'b', label: 'Back, 90th percentile' }]}
        rows={[...covered].sort((a, b) => change(a.p10) - change(b.p10)).map((c) => [c.city, signedMin(change(c.p10)), signedMin(change(c.p90))])} />,
      <Values key="ft-races" bare id="ft-races" caption="Median finish by course" count={list.length}>
        <table className="table">
          <thead><tr><th scope="col" className="is-text">Course</th><th scope="col">Median finish</th><th scope="col">Editions</th><th scope="col">Finishes</th></tr></thead>
          <tbody>
            {[...list].sort((a, b) => a.median_s - b.median_s).map((c) => (
              <tr key={c.city}>
                <th scope="row" className="is-text"><Link href={`/courses/${courseSlug(c.city)}`}>{c.city}</Link></th>
                <td>{finishMinute(c.median_s)}</td><td>{c.editions}</td><td>{count(c.finishes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Values>,
    ]}>
      {/* The H1 is the finding in words and the figure its time; the ruler draws the H1's claim: the hour it names,
          the time past it as a span, and the median (the figure's dot) inside that span. */}
      <StoryHero path={PATH} title={title.guard ? sentenceOf(title) : 'Marathon finish times'}
        figure={median.figure ? { ...median.figure } : undefined} unitLine={median.key} fallback={!median.guard}
        instrument={title.guard && median.guard ? (
          <Ruler min={rLo} max={rHi} ticks={rulerTicks} band={{ lo: hourMark, hi: rHi }}
            marks={[{ value: medianAll, kind: 'reading', label: 'Median' }]}
            label={`The median finish, ${hm(medianAll)}, sits past ${hm(hourMark)}: more than half of all finishes took longer than ${hm(hourMark)}.`} />
        ) : undefined} />

      <Beat id="field" track="chapter-1" label="Most finishes" title={middle}>
        <PercentileDots layer={layer} domain={[dLo, dHi]} ticks={dotTicks}
          label={`99 finishes, one at each percentile from the 1st to the 99th. All finishes: median ${hm(minutes[49])}, the middle half from ${hm(minutes[24])} to ${hm(minutes[74])}.`} />
      </Beat>

      <Beat id="front" track="chapter-2" label="Then and now" title={front}
        dek={`${eras.pre[0]}–${String(eras.pre[1]).slice(2)} against ${eras.post[0]}–${String(eras.post[1]).slice(2)}. Each dot is a course; each bar, their average.`}>
        <EraShift rows={rows} domain={[-span, span]} axisTitle={{ start: 'Faster', end: 'Slower' }}
          ticks={[-span, -span / 2, 0, span / 2, span].map((v) => ({ value: v, label: v === 0 ? '0' : `${v > 0 ? '+' : MINUS}${Math.abs(v)} min` }))}
          label={`Change in finish time from ${eras.pre[0]}–${eras.pre[1]} to ${eras.post[0]}–${eras.post[1]} across ${covered.length} courses: 10th percentile ${signedMin(eras.summary.p10.change)}, 90th percentile ${signedMin(eras.summary.p90.change)} on average.`} />
      </Beat>

      {/* The strip draws the courses the H2's range spans and opens on its low end (the readout names it; the high end is
          labelled), so the beat never opens on an empty readout. Times floor to the minute, as the course pages read a
          clock: a median at 3:59:56 is "3:59", never a rounded "4:00". */}
      <Beat id="by-race" track="chapter-3" label="Course by course" title={byRace} dek="Each course’s median across its editions, three or more.">
        <DotStrip items={drawn.map((c) => ({ id: c.city, label: c.city, value: c.median_s, display: finishMinute(c.median_s), detail: count(c.finishes) }))}
          domain={[t0, t1]} ticks={stripTicks} readoutKey="Finishes" hint="Choose a dot to read its course."
          label={`Median finish of ${drawn.length} courses with three or more editions, ranked; choose a dot to read it`} />
      </Beat>
    </StoryPage>
  );
}
