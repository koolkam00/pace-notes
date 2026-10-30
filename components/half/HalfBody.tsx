import { getNugget, sentenceOf } from '@/lib/nuggets';
import { halfDeks, womenBandsPublished } from '@/lib/nuggets/half';
import { count, hm, pct, ratio } from '@/lib/nuggets/format';
import { readHalf } from '@/lib/half-server';
import { Beat, StoryHero } from '@/components/story/StoryPage';
import Cdf from '@/components/viz/Cdf';
import Dumbbell from '@/components/viz/Dumbbell';
import Values from '@/components/ui/Values';
import HalfPage, { HALF_PATH, HalfCrumbs } from './HalfPage';
import { FieldHistogram, RatioColumns, SaveImage, ShareColumns } from './HalfCharts';

/** The round time the reading names (2:00) and the one beat 1's readout opens on (1:45), in minutes. */
const READING_MARK = 120;
const OPEN_MARK = 105;
/** The beat-1 readout's detents: the half's round times. */
const DETENTS = [90, 105, 120, 135, 150];
const W = 'Recorded women’s', M = 'Recorded men’s';
/** A readout share in whole percent, but never "0%" or "100%" for a share that is neither (the site's "<1%" rule). */
const readPct = (share: number) => (share > 0 && share < 0.005 ? '<1%' : share < 1 && share >= 0.995 ? '>99%' : pct(share));
/** A share for a spoken label: one decimal within a point of one half (2:00's 49.6% is not "50%" beside "most from 2:15"). */
const nearHalf = (share: number) => pct(share, Math.abs(share - 0.5) < 0.01 ? 1 : 0);
/** A women's share of the recorded finishes on one side of a same-city pair. */
const womenShare = (side: { F: number; M: number }) => side.F / (side.F + side.M);

/**
 * /half, "The half marathon": where half marathon finish times sit, from half finishes in verified results (field.json,
 * women.json; no scope chip). Off the chapter chain like the Top 100 charts: no rail and no reading bar. Every sentence
 * and every figure is a half nugget or a dek built with them (lib/nuggets/half.ts); the charts draw the same files. The
 * page types no number.
 *
 * The reading (just over half under 2:00, the median 1:57, every minute as a histogram), then four beats: where any time
 * sits (the share under it, scrubbable), the crowd in the minute before 2:00, women the majority of finishes from 2:15,
 * and the same city's half and marathon. One All numbers fold at the foot holds every chart's table.
 *
 * Beat 3 and its table are drawn only while women.json publishes the band medians (at least 20 editions; 15 qualify since
 * the stamp correction, October 30, 2026, so the page has three beats and the others keep their track ids). A beat whose
 * heading falls back states nothing anywhere else either: no dek, no caption and no table reading that says a direction.
 */
export default function HalfBody() {
  const field = readHalf('field.json');
  const women = readHalf('women.json');
  const deks = halfDeks();
  const reading = getNugget('half.field'), under = getNugget('half.under'), crowd = getNugget('half.crowd');
  const womenN = getNugget('half.women'), cities = getNugget('half.cities');
  const figure = reading.figure;
  const at = (s: number) => field.under.find((u) => u.s === s)!;
  const total = field.cohort.finishes;

  // The share under every whole minute from the first mark (1:15) to 3:00, from the minute histogram (finishes under
  // minute m are the tail under its first minute and every minute before m), and the scrubber's five-minute marks.
  const { lo, counts, under_lo: tail } = field.minutes;
  const first = field.under[0].s / 60, last = field.under[field.under.length - 1].s / 60;
  const curve = Array.from({ length: last - first + 1 }, (_, i) => first + i).map((m) => ({
    x: m, share: (tail + counts.slice(0, m - lo).reduce((a, b) => a + b, 0)) / total,
  }));
  const marks = field.under;
  const markIndex = (minutes: number) => marks.findIndex((u) => u.s === minutes * 60);
  const span = last - first;

  // Beat 3: the band whose median share first passes one half and stays over it, while the medians are published.
  const bands = womenBandsPublished(women);
  const cross = women.bands.findIndex((b) => b.lo_s === women.cross_s);
  const sc = women.same_city;

  const histLabel = `Half marathon finishes in each minute from ${hm(lo)} to ${hm(field.minutes.hi - 1)}: the median ${hm(Math.floor(field.quantiles.all.p50 / 60))}, ${pct(at(READING_MARK * 60).all)} under ${hm(READING_MARK)}.`;
  return (
    <HalfPage scope="verified" how="/methodology#half-field" numbers={[
      <Values key="under" bare id="hf-under" caption="Half finishes under each time: all, recorded women’s and recorded men’s"
        columns={[{ key: 't', label: 'Under' }, { key: 'a', label: 'All' }, { key: 'f', label: 'Women’s' }, { key: 'm', label: 'Men’s' }]}
        rows={marks.map((u) => [hm(u.s / 60), pct(u.all, 1), pct(u.F, 1), pct(u.M, 1)])} reading={markIndex(OPEN_MARK)} />,
      <Values key="crowd" bare id="hf-crowd" caption="The minute before each round time, against the smooth curve"
        columns={[{ key: 'k', label: 'Before' }, { key: 'r', label: '× curve' }, { key: 'b', label: 'Minute before' }, { key: 'e', label: 'Curve' }, { key: 'a', label: 'Minute after' }, { key: 'c', label: '95% interval' }]}
        rows={field.marks.map((m) => [m.mark, ratio(m.ratio, 2), count(m.minute_before), count(m.expected_minute_before), count(m.minute_after), `${ratio(m.ratio_ci95[0], 2)} to ${ratio(m.ratio_ci95[1], 2)}`])}
        reading={field.marks.findIndex((m) => m.minutes === READING_MARK)} />,
      ...(bands ? [
        <Values key="women" bare id="hf-women" caption={`Women’s share of recorded half finishes in each band: the median of ${women.band_editions.length} editions`}
          columns={[{ key: 'b', label: 'Finish band' }, { key: 's', label: 'Women’s share' }]}
          rows={women.bands.map((b, i) => [b.hi_s === null ? `${hm(b.lo_s / 60)} and over` : b.lo_s === 0 ? `Under ${hm(b.hi_s / 60)}` : `${hm(b.lo_s / 60)} to ${hm(b.hi_s / 60 - 1)}:59`, pct(women.median_share[i], 1)])}
          reading={womenN.guard ? cross : undefined} />,
      ] : []),
      // Each pair's gap in points, and, while the beat's heading holds, the typical gap within a pair in the caption (the
      // dumbbell's Typical row joins the two medians, whose gap is wider than the typical pair's). Under the plain heading
      // the caption says what the columns are and states no direction (review, October 30, 2026).
      <Values key="cities" bare id="hf-cities" caption={cities.guard
        ? `Women’s share of recorded finishes, the same city and year: within a pair, the half’s share was typically ${sc.summary.diff_median_points.toFixed(1)} points higher`
        : 'Women’s share of recorded finishes, the same city and year, and the gap within each pair in points'}
        columns={[{ key: 'c', label: 'City', text: true }, { key: 'y', label: 'Year' }, { key: 'h', label: 'Half' }, { key: 'm', label: 'Marathon' }, { key: 'd', label: 'Gap, points' }]}
        rows={[...sc.pairs].sort((a, b) => a.city.localeCompare(b.city) || a.year - b.year).map((p) => [p.city, String(p.year), pct(womenShare(p.half), 1), pct(womenShare(p.marathon), 1),
          `+${((womenShare(p.half) - womenShare(p.marathon)) * 100).toFixed(1)}`])} />,
    ]}>
      <StoryHero path={HALF_PATH} crumbs={<HalfCrumbs />} title={sentenceOf(reading)} stacked fallback={!reading.guard}
        figure={figure ? { value: figure.value, unit: figure.unit, sr: figure.sr } : undefined}
        unitLine={figure ? deks.fieldUnit : undefined}
        instrument={(
          <>
            <FieldHistogram field={field} mark={READING_MARK} share={`${pct(at(READING_MARK * 60).all)} under ${hm(READING_MARK)}`} label={histLabel} />
            <SaveImage slug="half-under-2" />
          </>
        )} />

      {/* The dek says how to use the chart, step included (the needle stops on the published marks only): the recorded
          women's and men's shares are the readout's own side rows, so the dek's version of them (deks.under) would put
          the same two numbers twice on one screen. */}
      <Beat id="your-time" track="chapter-1" label="Your time" title={under} dek={deks.slide}>
        {/* Ticks every 15 minutes to the scale's end (3:00, turned to end at the plot's edge, so the last stop has its
            time), the half hours first: the quarters show and hide together (a tick group), so where 2:45 would touch
            3:00 a phone keeps 1:30, 2:00, 2:30 and 3:00 evenly, and a wider screen adds every quarter. */}
        <Cdf points={curve} ticks={Array.from({ length: Math.floor((last - 75) / 15) + 1 }, (_, i) => 75 + i * 15).map((m) => ({ value: m, label: hm(m), priority: m % 30 === 0 ? 3 : 1, group: m % 30 === 0 ? undefined : 'quarters' }))}
          scrub={{
            label: `Half finish time, ${hm(first)} to ${hm(last)}`,
            points: {
              x: marks.map((u) => (u.s / 60 - first) / span),
              // Where the needle meets the curve, on Cdf's own scale (yScale(0, 1, { top: 0.06 })).
              dot: marks.map((u) => 1 - u.all * 0.94),
              keys: marks.map((u) => `Under ${hm(u.s / 60)}`),
              values: marks.map((u) => readPct(u.all)),
              side: [{ label: W, values: marks.map((u) => readPct(u.F)) }, { label: M, values: marks.map((u) => readPct(u.M)) }],
            },
            initial: markIndex(OPEN_MARK), detents: DETENTS.map(markIndex).filter((i) => i >= 0),
          }}
          label={`The share of half finishes under each time from ${hm(first)} to ${hm(last)}: ${pct(at(OPEN_MARK * 60).all)} under ${hm(OPEN_MARK)}, ${pct(at(READING_MARK * 60).all)} under ${hm(READING_MARK)}.`} />
      </Beat>

      <Beat id="crowd" track="chapter-2" label="Round times" title={crowd} dek={deks.crowd ?? undefined}>
        <RatioColumns marks={field.marks} signal={READING_MARK} ink={deks.crowdNamed}
          label={`Finishes in the minute before each round time, against the smooth curve: ${field.marks.map((m) => `${m.mark} ${ratio(m.ratio, 2)}`).join(', ')}.`} />
      </Beat>

      {bands ? (
        <Beat id="women" track="chapter-3" label="Women and men" title={womenN} dek={deks.women ?? undefined}>
          <ShareColumns bands={women.bands} shares={women.median_share} signal={womenN.guard ? cross : -1} format={(s) => pct(s)}
            label={`Women’s share of recorded half finishes by finish band, the median of ${women.band_editions.length} editions: ${women.bands.map((b, i) => `${b.label} ${nearHalf(women.median_share[i])}`).join(', ')}.`} />
        </Beat>
      ) : null}

      <Beat id="two-distances" track="chapter-4" label="Two distances" title={cities} dek={deks.cities ?? undefined}>
        {/* The key first, in the order every row prints its pair (marathon · half), then, while the beat's heading holds,
            the two typical shares (the dek's two medians across the pairs, worded as two) as the one signal row, as the
            share card draws it, then each city. While the heading falls back (too few pairs or cities for a direction,
            October 30, 2026) the typical row and its "typically" in the label are left out with the dek: two medians
            side by side state the direction the heading withdrew (review, October 30, 2026: the row and the label
            still did). The cities stay, as a chart keeps its values. A value column sized to its pairs, and none on a
            zoomed-in screen (half.css). */}
        <div className="half-cities">
          <Dumbbell keyFirst rows={[
            ...(cities.guard ? [{ id: 'typical', label: 'Typical', a: sc.summary.marathon_median, b: sc.summary.half_median, display: `${pct(sc.summary.marathon_median)} · ${pct(sc.summary.half_median)}`, highlight: true }] : []),
            ...sc.cities.map((c) => ({ id: c.city, label: c.city, a: c.marathon, b: c.half, display: `${pct(c.marathon)} · ${pct(c.half)}` })),
          ]}
            domain={[0, 0.6]} ticks={[0, 0.6].map((v) => ({ value: v, label: pct(v) }))} keyLabels={{ a: 'Marathon', b: 'Half' }}
            label={`Women’s share of recorded finishes in the same city and year, marathon then half: ${cities.guard ? `typically ${pct(sc.summary.marathon_median)} and ${pct(sc.summary.half_median)}; ` : ''}${sc.cities.map((c) => `${c.city} ${pct(c.marathon)} and ${pct(c.half)}`).join('; ')}.`} />
        </div>
        <SaveImage slug="half-more-women" />
      </Beat>
    </HalfPage>
  );
}
