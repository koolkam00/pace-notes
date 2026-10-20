import type { FinishTimes } from '@/lib/insights';
import { readInsight } from '@/lib/insights-server';
import { STORIES } from '@/lib/stories';
import { getNugget, sentenceOf } from '@/lib/nuggets';
import { count, hm } from '@/lib/nuggets/format';
import Histogram from '@/components/viz/Histogram';
import Ruler from '@/components/viz/Ruler';
import Scrolly from '@/components/ui/Scrolly.client';
import GuessFirst from '@/components/ui/GuessFirst.client';
import Values from '@/components/ui/Values';
import { Beat, Say, StoryHero, StoryPage } from '../StoryPage';
import ScrollyLens from '../ScrollyLens.client';

const PATH = '/stories/round-numbers';
const LO = 140, HI = 380;
const LENS = { count: 'Finishes per minute', ratio: 'Against the curve' };

/**
 * The round-number effect (the redesign spec, section 7.8, under section 00): the reading (the minute that stands
 * tallest against the curve; the H1 is named for it), then the towers as the story's one step-by-step reveal: its H2
 * widens the H1 to every hour and half-hour, its steps open on the busiest minute, turn the chart against the curve,
 * show a quarter-hour that stays level, and end on the H1's own minute, the tallest tower (2:59). Under reduced motion the
 * chart shows the end state's lens with its needle on that minute and the steps that are true of it. Then the page's one guess (the final stretch to a
 * round mark). The scoreboard of marks is in All numbers; the reader's own finish lookup is cut (the next page, Your
 * target in context, is that lookup), so the beat has one control.
 */
export default function RoundNumbersBody() {
  const ft = readInsight<FinishTimes>('finish-times.json');
  const story = STORIES.find((s) => s.slug === 'round-numbers')!;
  const top = getNugget('round.top'), busiest = getNugget('finish.busiest'), marksNugget = getNugget('round.marks'), quarter = getNugget('round.quarter'), rescue = getNugget('round.rescue');
  const topMinute = Number(top.values.minutes) - 1;

  const bins = ft.histogram.filter((h) => h.minute >= LO && h.minute < HI).map((h) => ({ x: h.minute, n: h.all }));
  const curve = ft.expected_curve.filter((c) => c.minute >= LO && c.minute < HI).map((c) => ({ x: c.minute, v: c.expected }));
  const marks = ft.marks.filter((m) => m.kind !== 'quarter' && m.minutes - 1 >= LO && m.minutes - 1 < HI);
  // Every mark's published ratio (the quarter-hours' too), so the needle's readout at a quarter-hour agrees with Values.
  const ratioAt = Object.fromEntries(ft.marks.filter((m) => m.minutes - 1 >= LO && m.minutes - 1 < HI).map((m) => [m.minutes - 1, m.ratio]));
  const expected = new Map(ft.expected_curve.map((c) => [c.minute, c.expected]));
  const ratio = (b: { x: number; n: number }) => ratioAt[b.x] ?? (expected.get(b.x) ? b.n / expected.get(b.x)! : NaN);
  const xs = bins.map((b) => (b.x - LO + 0.5) / (HI - LO));
  const detents = marks.map((m) => bins.findIndex((b) => b.x === m.minutes - 1)).filter((i) => i >= 0);
  const busiestAt = Math.max(0, bins.findIndex((b) => b.x === Number(busiest.values.minute)));
  const topAt = Math.max(0, bins.findIndex((b) => b.x === topMinute));
  const quarterAt = bins.findIndex((b) => b.x === Number(quarter.values.minutes) - 1);
  const hasQuarter = quarter.guard && quarterAt >= 0;

  // The first two steps describe the per-minute view, so the static list (reduced motion) leaves them out: it shows the
  // chart against the curve with the steps true of it. The steps then turn the chart against the curve, show a
  // quarter-hour that stays level (the contrast), and end where the H1 is: the minute before its mark, the tallest
  // tower, so the animated reading closes the loop with the headline as the static one does.
  // The curve is defined once, in the chart's key, which shows in every mode (round 6: the static list dropped the step
  // that said what the curve was, so "Against the curve" was never explained under reduced motion).
  const steps = [
    { text: sentenceOf(busiest), still: false },
    ...(hasQuarter ? [{ text: sentenceOf(quarter) }] : []),
    { text: top.guard ? `Tallest of all: the minute before ${top.values.mark}.` : `The minute before ${top.values.mark}, against the curve.` },
  ];
  const last = steps.length - 1;
  const ratioFrom = hasQuarter ? last - 1 : last;
  // A one-minute bin named as the minute it is ("Finishes in 3:58"), and the minute before a round mark by that mark
  // (round 6: "from 3:58 to 3:59" read as two minutes of finishes).
  const before = new Map(ft.marks.map((m) => [m.minutes - 1, m.mark]));
  const binKey = (minute: number) => (before.has(minute) ? `In the minute before ${before.get(minute)}` : `Finishes in ${hm(minute)}`);

  const bubbleMark = String(rescue.values.mark);
  // The opener's instrument: the H1's minute against the curve, as two marks on one count scale (what the curve expected,
  // what came), so the figure's "1.7×" is drawn, not only said, and a desktop opener's right half holds it.
  const topRow = ft.marks.find((m) => m.mark === top.values.mark);
  const scaleTop = topRow ? Math.ceil(Math.max(topRow.minute_before, topRow.expected_minute_before) / 5000) * 5000 : 0;
  const instrument = top.guard && topRow && scaleTop > 0 ? (
    <Ruler min={0} max={scaleTop} ticks={[0, scaleTop / 2, scaleTop].map((v) => ({ value: v, label: count(v) }))}
      marks={[{ value: topRow.expected_minute_before, kind: 'typical', label: `Expected ${count(topRow.expected_minute_before)}` },
        { value: topRow.minute_before, kind: 'reading', label: `${hm(topMinute)} ${count(topRow.minute_before)}` }]}
      label={`${binKey(topMinute)}: ${count(topRow.minute_before)} finishes, against ${count(topRow.expected_minute_before)} on the smooth curve.`} />
  ) : undefined;

  return (
    <StoryPage path={PATH} numbers={[
      <Values key="marks" bare id="rn-marks" caption="The minute before each round mark, against the smooth curve"
        columns={[{ key: 'm', label: 'Mark' }, { key: 'r', label: '× curve' }, { key: 'n', label: 'Finishes' }, { key: 'e', label: 'Expected' }]}
        rows={ft.marks.map((m) => [m.mark, `${m.ratio.toFixed(2)}×`, count(m.minute_before), count(m.expected_minute_before)])}
        reading={ft.marks.findIndex((m) => m.mark === top.values.mark)} />,
    ]}>
      {/* The figure is how many times the expected count the minute held and its unit line says so in a runner's
          words; the count itself is the scrolly's last readout (a sentence here restated the H1 a third time). */}
      <StoryHero path={PATH} title={story.heading ?? story.title} stacked
        figure={top.figure ? { ...top.figure } : undefined} unitLine={top.key} fallback={!top.guard}
        sentence={top.figure ? undefined : <Say nugget={top} />} instrument={instrument} />

      <Beat id="towers" track="chapter-1" label="The towers" aliases={['scoreboard', 'seconds', 'my-finish']} title={marksNugget}>
        <Scrolly className="towers-scrolly" steps={steps} graphic={(
          <>
            <Histogram bins={bins} curve={curve} marks={marks.map((m) => m.minutes - 1)} reading={topMinute}
              ticks={[180, 240, 300, 360].map((m) => ({ x: m, label: hm(m) }))}
              label={`Finishes in each minute from ${hm(LO)} to ${hm(HI)}. ${sentenceOf(top).replace(/\*/g, '')}`}
              // The steps turn the lens (ScrollyLens), so the beat draws no lens control of its own (round 5: a lens, a
              // scrubber and four steps were three controls on one beat).
              lens={{ label: 'Show', ...LENS }} lensControl={false} ratioAt={ratioAt}
              keyLabels={{ bin: 'Each minute', mark: 'Minute before a round mark', curve: 'The curve: where finishes would fall if no minute were special' }}
              ratioBase="1×"
              scrub={{
                label: `Finish minute, ${hm(LO)} to ${hm(HI)}`,
                points: { x: xs, keys: bins.map((b) => binKey(b.x)), values: bins.map((b) => count(b.n)),
                  // One decimal, as the figure above it says "1.7×" (the marks' two-decimal ratios are in All numbers).
                  side: [{ label: 'Against the curve', values: bins.map((b) => (Number.isFinite(ratio(b)) ? `${ratio(b).toFixed(1)}×` : '—')) }] },
                // The chart opens on step one (the busiest minute), so its first readout adds to the reading above;
                // the reading's minute is its home, the tower that stays orange.
                initial: busiestAt, home: topAt, detents,
              }} />
            <ScrollyLens lens={{ 0: LENS.count, [ratioFrom]: LENS.ratio }} values={{ [LENS.count]: 'count', [LENS.ratio]: 'ratio' }}
              needle={{ 0: busiestAt, ...(hasQuarter ? { [ratioFrom]: quarterAt } : {}), [last]: topAt }} stillAt={topAt} />
          </>
        )} />
      </Beat>

      <Beat id="rescue" track="chapter-2" label="The last stretch"
        title={rescue.guard ? 'The pull works late, too.' : 'Just over a round mark at 40K.'}>
        <GuessFirst marks="ruler" min={0} max={100} step={1} unit="%"
          question={`At 40K, a finish is on course for just over ${bubbleMark}. What share still got under ${bubbleMark}?`}
          truth={Number(rescue.values.under) * 100} truthLabel="got under"
          compare={{ value: Number(rescue.values.expected) * 100, label: 'Away from a round mark' }}
          answer={sentenceOf(rescue)} initial={50} />
      </Beat>
    </StoryPage>
  );
}
