import type { FinishTimes } from '@/lib/insights';
import { readInsight } from '@/lib/insights-server';
import { STORIES } from '@/lib/stories';
import { getNugget, sentenceOf } from '@/lib/nuggets';
import { count, hm } from '@/lib/nuggets/format';
import Histogram from '@/components/viz/Histogram';
import Plot, { Baseline } from '@/components/viz/Plot';
import { linear, pc, stepEdge, stepPath, u, yScale } from '@/components/viz/scale';
import Scrolly from '@/components/ui/Scrolly.client';
import GuessFirst from '@/components/ui/GuessFirst.client';
import Values from '@/components/ui/Values';
import { Beat, Say, StoryHero, StoryPage } from '../StoryPage';
import ScrollyLens from '../ScrollyLens.client';
import MyFinish from '../FinishTimeStory';

const PATH = '/stories/round-numbers';
const LO = 140, HI = 380;
const LENS = { count: 'Finishes per minute', ratio: 'Against the curve' };

/** A 64 px lens on the reading's minute: the bins either side of it, its tower in signal, the smooth curve over them. */
function MiniLens({ ft, minute }: { ft: FinishTimes; minute: number }) {
  const lo = minute - 14, hi = minute + 15;
  const bins = ft.histogram.filter((h) => h.minute >= lo && h.minute < hi);
  const curve = ft.expected_curve.filter((c) => c.minute >= lo && c.minute < hi);
  const x = linear([lo, hi]);
  const y = yScale(0, Math.max(...bins.map((b) => b.all), ...curve.map((c) => c.expected)), { top: 0.06 });
  const w = 1 / (hi - lo);
  return (
    <figure className="viz viz-frame mini-lens" aria-hidden="true">
      <div className="viz-plot">
        <Plot>
          <svg className="viz-paths" viewBox="0 0 1000 1000" preserveAspectRatio="none" width="100%" height="100%" overflow="visible">
            {bins.map((b) => <rect key={b.minute} className={b.minute === minute ? 'm-signal' : 'm-quiet'} x={u(x(b.minute) + w * 0.12)} width={u(w * 0.76)} y={u(y(b.all))} height={u(1 - y(b.all))} />)}
            <path className="l-ink2" d={curve.map((c, i) => `${i ? 'L' : 'M'}${u(x(c.minute + 0.5))} ${u(y(c.expected))}`).join('')} />
          </svg>
          <Baseline />
        </Plot>
      </div>
    </figure>
  );
}

/** The minute histogram's silhouette for the finish lookup: no marks, so the reader's ring is the one orange thing. */
function LookupPlot({ ft }: { ft: FinishTimes }) {
  const bins = ft.histogram.filter((h) => h.minute >= LO && h.minute < HI);
  const x = linear([LO, HI]);
  const y = yScale(0, Math.max(...bins.map((b) => b.all)), { top: 0.1 });
  const w = 1 / (HI - LO);
  const ticks = [180, 240, 300, 360].filter((m) => m > LO && m < HI);
  return (
    <figure className="viz viz-frame lookup-plot">
      <div className="viz-plot" role="img" aria-label={`Finishes in each minute from ${hm(LO)} to ${hm(HI)}`}>
        <Plot>
          <svg className="viz-paths" viewBox="0 0 1000 1000" preserveAspectRatio="none" width="100%" height="100%" overflow="visible">
            <path className="a-silhouette" d={stepPath(bins.map((b) => ({ x: x(b.minute), y: y(b.all) })), w)} />
            <path className="a-edge" d={stepEdge(bins.map((b) => ({ x: x(b.minute), y: y(b.all) })), w)} />
          </svg>
          <Baseline />
        </Plot>
      </div>
      <div className="viz-axis">
        <svg className="viz-axis-svg" width="100%" height="24" aria-hidden="true">
          {ticks.map((m) => <text key={m} className="tick" x={pc(x(m))} y={18} textAnchor="middle">{hm(m)}</text>)}
        </svg>
      </div>
    </figure>
  );
}

/**
 * The 3:59 effect (the redesign spec, section 7.8, under section 00): the reading (the minute that stands tallest
 * against the curve), then the towers as the story's one step-by-step reveal ending on the scrubbable lens chart, the
 * page's one guess (the final stretch to a round mark) and the reader's own minute. The scoreboard of marks lives in
 * the towers' Values; the ten-second view is cut.
 */
export default function RoundNumbersBody() {
  const ft = readInsight<FinishTimes>('finish-times.json');
  const story = STORIES.find((s) => s.slug === 'round-numbers')!;
  const top = getNugget('round.top'), busiest = getNugget('finish.busiest'), marksNugget = getNugget('round.marks'), rescue = getNugget('round.rescue');
  const topMinute = Number(top.values.minutes) - 1;

  const bins = ft.histogram.filter((h) => h.minute >= LO && h.minute < HI).map((h) => ({ x: h.minute, n: h.all }));
  const curve = ft.expected_curve.filter((c) => c.minute >= LO && c.minute < HI).map((c) => ({ x: c.minute, v: c.expected }));
  const marks = ft.marks.filter((m) => m.kind !== 'quarter' && m.minutes - 1 >= LO && m.minutes - 1 < HI);
  const ratioAt = Object.fromEntries(marks.map((m) => [m.minutes - 1, m.ratio]));
  const expected = new Map(ft.expected_curve.map((c) => [c.minute, c.expected]));
  const ratio = (b: { x: number; n: number }) => ratioAt[b.x] ?? (expected.get(b.x) ? b.n / expected.get(b.x)! : NaN);
  const xs = bins.map((b) => (b.x - LO + 0.5) / (HI - LO));
  const detents = marks.map((m) => bins.findIndex((b) => b.x === m.minutes - 1)).filter((i) => i >= 0);

  const steps = [
    { text: sentenceOf(busiest) },
    { text: 'The line is a smooth curve: where finishes would fall if no minute on the clock were special.' },
    { text: sentenceOf(marksNugget) },
    { text: top.guard ? `Against the curve, the tallest tower is the minute before *${top.values.mark}*: ${Number(top.values.ratio).toFixed(2)} times what it expects.` : `Against the curve, the minute before ${top.values.mark}.` },
  ];

  const bubbleMark = String(rescue.values.mark);
  const lookupBins = ft.histogram.filter((h) => h.minute >= LO && h.minute < HI);
  const lookupMax = Math.max(...lookupBins.map((b) => b.all));
  const lookupY = yScale(0, lookupMax, { top: 0.1 });

  return (
    <StoryPage path={PATH}>
      <StoryHero path={PATH} title={story.heading ?? story.title} dek={story.dek}
        figure={top.figure ? { ...top.figure } : undefined} unitLine={top.key} fallback={!top.guard}
        sentence={<Say nugget={top} />} instrument={<MiniLens ft={ft} minute={topMinute} />} />

      <Beat id="towers" track="chapter-1" label="The towers" aliases={['scoreboard', 'seconds']}
        title={marksNugget.guard ? <>Finishes pile up just under <em>round numbers</em>.</> : <>Finish times, minute by minute.</>}>
        <Scrolly className="towers-scrolly" steps={steps} graphic={(
          <>
            <Histogram bins={bins} curve={curve} marks={marks.map((m) => m.minutes - 1)} reading={topMinute}
              ticks={[180, 240, 300, 360].map((m) => ({ x: m, label: hm(m) }))}
              label={`Finishes in each minute from ${hm(LO)} to ${hm(HI)}. ${sentenceOf(top).replace(/\*/g, '')}`}
              lens={{ label: 'Show', ...LENS }} ratioAt={ratioAt}
              keyLabels={{ bin: 'Each minute', mark: 'The minute before a round mark', curve: 'The smooth curve' }}
              scrub={{
                label: `Finish minute, ${hm(LO)} to ${hm(HI)}`,
                points: { x: xs, keys: bins.map((b) => `Finishes in ${hm(b.x)}:00–:59`), values: bins.map((b) => count(b.n)),
                  side: [{ label: 'Against the curve', values: bins.map((b) => (Number.isFinite(ratio(b)) ? `${ratio(b).toFixed(2)}×` : '—')) }] },
                initial: Math.max(0, bins.findIndex((b) => b.x === topMinute)), detents,
              }} />
            <ScrollyLens lens={{ 0: LENS.count, 3: LENS.ratio }} />
          </>
        )} />
        <Values id="rn-marks" caption="The minute before each round mark, against the smooth curve"
          columns={[{ key: 'm', label: 'Mark' }, { key: 'r', label: 'Against the curve' }, { key: 'n', label: 'Finishes' }, { key: 'e', label: 'The curve expects' }]}
          rows={ft.marks.map((m) => [m.mark, `${m.ratio.toFixed(2)}×`, count(m.minute_before), count(m.expected_minute_before)])}
          reading={ft.marks.findIndex((m) => m.mark === top.values.mark)} />
      </Beat>

      <Beat id="rescue" track="chapter-2" label="The last stretch"
        title={rescue.guard ? <>The pull works <em>late</em>, too.</> : <>Just over a round mark at 40K.</>}>
        <GuessFirst marks="ruler" min={0} max={100} step={1} unit="%"
          question={`At 40K, a finish is on course for just over ${bubbleMark}. What share still got under ${bubbleMark}?`}
          truth={Number(rescue.values.under) * 100} truthLabel="got under"
          compare={{ value: Number(rescue.values.expected) * 100, label: 'Away from a round mark' }}
          answer={sentenceOf(rescue)} initial={50} />
      </Beat>

      <Beat id="your-minute" track="chapter-3" label="Your minute" title={<>Where did <em>your</em> finish land?</>}>
        <MyFinish first={LO} bins={lookupBins.map((b) => b.all)} expected={lookupBins.map((b) => Math.round(expected.get(b.minute) ?? 0))}
          tops={lookupBins.map((b) => Number(lookupY(b.all).toFixed(4)))}>
          <LookupPlot ft={ft} />
        </MyFinish>
      </Beat>
    </StoryPage>
  );
}
