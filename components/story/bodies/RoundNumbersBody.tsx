import type { FinishTimes } from '@/lib/insights';
import { readInsight } from '@/lib/insights-server';
import { STORIES } from '@/lib/stories';
import { getNugget, sentenceOf } from '@/lib/nuggets';
import { count, hm } from '@/lib/nuggets/format';
import Histogram from '@/components/viz/Histogram';
import Scrolly from '@/components/ui/Scrolly.client';
import GuessFirst from '@/components/ui/GuessFirst.client';
import Values from '@/components/ui/Values';
import { Beat, Say, StoryHero, StoryPage } from '../StoryPage';
import ScrollyLens from '../ScrollyLens.client';
import MyFinish from '../FinishTimeStory';

const PATH = '/stories/round-numbers';
const LO = 140, HI = 380;
const LENS = { count: 'Finishes per minute', ratio: 'Against the curve' };

/**
 * The round-number effect (the redesign spec, section 7.8, under section 00): the reading (the minute that stands
 * tallest against the curve; the H1 is named for it), then the towers as the story's one step-by-step reveal, opening on
 * the busiest minute and ending on the scrubbable lens chart, the page's one guess (the final stretch to a round mark)
 * and the reader's own minute on a small silhouette. The scoreboard of marks lives in the towers' Values; the
 * ten-second view and the reading's mini lens are cut (the towers follow straight after the reading).
 */
export default function RoundNumbersBody() {
  const ft = readInsight<FinishTimes>('finish-times.json');
  const story = STORIES.find((s) => s.slug === 'round-numbers')!;
  const top = getNugget('round.top'), busiest = getNugget('finish.busiest'), marksNugget = getNugget('round.marks'), rescue = getNugget('round.rescue');
  const median = Number(getNugget('field.median').values.median_min);
  const topMinute = Number(top.values.minutes) - 1;

  const bins = ft.histogram.filter((h) => h.minute >= LO && h.minute < HI).map((h) => ({ x: h.minute, n: h.all }));
  const curve = ft.expected_curve.filter((c) => c.minute >= LO && c.minute < HI).map((c) => ({ x: c.minute, v: c.expected }));
  const marks = ft.marks.filter((m) => m.kind !== 'quarter' && m.minutes - 1 >= LO && m.minutes - 1 < HI);
  const ratioAt = Object.fromEntries(marks.map((m) => [m.minutes - 1, m.ratio]));
  const expected = new Map(ft.expected_curve.map((c) => [c.minute, c.expected]));
  const ratio = (b: { x: number; n: number }) => ratioAt[b.x] ?? (expected.get(b.x) ? b.n / expected.get(b.x)! : NaN);
  const xs = bins.map((b) => (b.x - LO + 0.5) / (HI - LO));
  const detents = marks.map((m) => bins.findIndex((b) => b.x === m.minutes - 1)).filter((i) => i >= 0);
  const busiestAt = Math.max(0, bins.findIndex((b) => b.x === Number(busiest.values.minute)));
  const topAt = Math.max(0, bins.findIndex((b) => b.x === topMinute));

  const steps = [
    { text: sentenceOf(busiest) },
    { text: 'The line is a smooth curve: where finishes would fall if no minute on the clock were special.' },
    { text: sentenceOf(marksNugget) },
    { text: top.guard ? `Against the curve, the tallest tower is the minute before *${top.values.mark}*: ${Number(top.values.ratio).toFixed(2)} times what it expects.` : `Against the curve, the minute before ${top.values.mark}.` },
  ];

  const bubbleMark = String(rescue.values.mark);
  const lookupBins = ft.histogram.filter((h) => h.minute >= LO && h.minute < HI);

  return (
    <StoryPage path={PATH}>
      <StoryHero path={PATH} title={story.heading ?? story.title} dek={story.dek}
        figure={top.figure ? { ...top.figure } : undefined} unitLine={top.key} fallback={!top.guard}
        sentence={<Say nugget={top} />} />

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
                // The chart opens on step one (the busiest minute), so its first readout adds to the reading above;
                // the reading's minute is its home, the tower that stays orange.
                initial: busiestAt, home: topAt, detents,
              }} />
            <ScrollyLens lens={{ 0: LENS.count, [steps.length - 1]: LENS.ratio }}
              needle={{ 0: busiestAt, [steps.length - 1]: topAt }} />
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
          example={Number.isFinite(median) ? median : Number(busiest.values.minute)} exampleLabel={Number.isFinite(median) ? 'The median finish' : 'The busiest minute'}
          ticks={[180, 240, 300, 360]} />
      </Beat>
    </StoryPage>
  );
}
