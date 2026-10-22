import type { Courses } from '@/lib/insights';
import { readInsight } from '@/lib/insights-server';
import { STORIES } from '@/lib/stories';
import { getNugget } from '@/lib/nuggets';
import { sectionName } from '@/lib/nuggets/stories';
import { pct, temp, tempGap } from '@/lib/nuggets/format';
import type { UnitSystem } from '@/lib/units';
import Waffle from '@/components/viz/Waffle';
import LineProfile from '@/components/viz/LineProfile';
import Values from '@/components/ui/Values';
import ByUnits from '@/components/ui/ByUnits.client';
import { Beat, Say, StoryHero, StoryPage, keep, rich } from '../StoryPage';

const PATH = '/stories/race-morning';
const MID = [2.5, 7.5, 12.5, 17.5, 22.5, 27.5, 32.5, 37.5, 41.1];
const MINUS = '−';
/** A signed value; one that rounds to zero is plain "0.0", never "−0.0". */
const signed = (v: number, digits = 1) => (Math.abs(v) < 0.5 * 10 ** -digits ? (0).toFixed(digits) : `${v > 0 ? '+' : MINUS}${Math.abs(v).toFixed(digits)}`);
const UNITS: UnitSystem[] = ['mi', 'km'];
/** A section's shift against the finish's own average pace, in percent as All numbers gives it: "3.0% quicker",
 *  "3.1% slower" (round 5: "points" had no stated base). */
const shift = (v: number) => (Math.abs(v) < 0.05 ? 'no shift' : `${Math.abs(v).toFixed(1)}% ${v < 0 ? 'quicker' : 'slower'}`);

/**
 * Race-morning weather (the redesign spec, section 7.11, new, under section 00): the weather half of the old course
 * story. The reading compares each course with itself (warmer year against cooler year), its instrument the pairs one
 * by one (tap a square), then two beats: how each degree counts for more when it is already warm, and how a warm
 * morning changes the shape of the race.
 * Temperatures follow the units switch (°F gaps are °C gaps × 9/5); the across-and-within fits are cut.
 */
export default function RaceMorningBody() {
  const data = readInsight<Courses>('courses.json');
  const story = STORIES.find((s) => s.slug === 'race-morning')!;
  const pairs = getNugget('weather.pairs'), curveN = getNugget('weather.curve'), tilt = getNugget('weather.tilt');
  const w = data.weather;
  const p = w.pairs;

  // The pairs, cooler year first: the readout's key names what its values are (sustained slowdown) and the pair, and the
  // start temperatures beside them follow the same order, cooler then warmer.
  const pairName = (x: (typeof p.list)[number]) => `${x.city} ${x.cool_year} · ${x.hot_year}`;
  // A pair whose shares print the same is said with the fewest decimals (up to two) that tell them apart, so the colour
  // its square takes (which year had more) can be read from the numbers beside it.
  const shares = (x: (typeof p.list)[number]) => {
    const digits = [0, 1, 2].find((d) => pct(x.cool_slowdown, d) !== pct(x.hot_slowdown, d)) ?? 2;
    return [pct(x.cool_slowdown, digits), pct(x.hot_slowdown, digits)];
  };
  const tiles = (u: UnitSystem) => p.list.map((x) => {
    const [cooler, warmer] = shares(x);
    return {
      id: `${x.city}-${x.cool_year}-${x.hot_year}`, lit: x.hotter_slowed_more,
      key: `${x.city}: ${temp(x.cool_temp, u)} in ${x.cool_year} and ${temp(x.hot_temp, u)} in ${x.hot_year}; sustained slowdowns went from ${cooler} to ${warmer}.`, value: '',
      side: `${temp(x.cool_temp, u)} · ${temp(x.hot_temp, u)}`, value2: `${cooler} · ${warmer}`, pair: pairName(x),
    };
  });
  // The readout opens on the pair furthest apart at the start (the first such in the data), the clearest case of a
  // warmer morning; the waffle draws the warmer-had-more pairs first, so its index counts in that order.
  const widest = p.list.reduce((best, x, i) => (x.hot_temp - x.cool_temp > p.list[best].hot_temp - p.list[best].cool_temp ? i : best), 0);
  const order = [...p.list.keys()].sort((a, b) => Number(p.list[b].hotter_slowed_more) - Number(p.list[a].hotter_slowed_more) || a - b);
  const opening = Math.max(0, order.indexOf(widest));

  // The finish against the start temperature: the median finish's change from the curve's zero point, degree by degree.
  const curve = w.curvature.finish_min_curve;
  const base = curve.find((c) => c.change === 0) ?? curve[0];
  const tLo = curve[0].temp, tHi = curve[curve.length - 1].temp;
  // Each degree's rate is centred on it (half the change from the degree below to the one above): on this fitted curve
  // that is the slope the H2 and the cool end's label give, where a step from the degree below is the rate half a degree
  // cooler. The two ends use the one-sided three-point rate, exact on this quadratic (October 22, 2026: a one-step
  // difference read −0.3 min per °C at 0 °C, where the fitted slope is −0.4).
  const n = curve.length - 1;
  const local = curve.map((c, i) => (i === 0 ? (-3 * c.change + 4 * curve[1].change - curve[2].change) / 2
    : i === n ? (3 * c.change - 4 * curve[n - 1].change + curve[n - 2].change) / 2
    : (curve[i + 1].change - curve[i - 1].change) / 2));
  const cool = Number(curveN.values.cool_c), warm = Number(curveN.values.warm_c);
  const at = (t: number) => Math.max(0, curve.findIndex((c) => c.temp === t));
  const top = Math.ceil(Math.max(...curve.map((c) => c.change)) / 10) * 10, bottom = Math.floor(Math.min(...curve.map((c) => c.change)) / 5) * 5;
  const perDeg = (v: number, u: UnitSystem) => `${signed(u === 'mi' ? v / 1.8 : v)} min per °${u === 'mi' ? 'F' : 'C'}`;
  // Ticks on round numbers in the reader's own scale: 40, 50, 60 … °F, or 0, 5, 10 … °C.
  const tickTemps = (u: UnitSystem) => (u === 'mi'
    ? [30, 40, 50, 60, 70, 80].map((f) => (f - 32) / 1.8).filter((c) => c >= tLo && c <= tHi)
    : [0, 5, 10, 15, 20, 25].filter((c) => c >= tLo && c <= tHi));
  const curveChart = (u: UnitSystem) => (
    <LineProfile x={curve.map((c) => c.temp)} xDomain={[tLo, tHi]} yDomain={[bottom, top]}
      // Slower is never orange: the slower side is washed quiet; the H2's point is the needle's.
      layers={[{ id: 'curve', label: 'Finish', series: [{ id: 'f', values: curve.map((c) => c.change), fillAbove: 0, fillTone: 'quiet' }],
        // The warm end is the H2's and the needle's (the readout gives its rate); the cool end it is compared with is
        // a small ink dot carrying its own rate.
        points: [{ x: cool, y: curve[at(cool)].change, kind: 'compare' }, { x: warm, y: curve[at(warm)].change, kind: 'reading' }],
        labels: [
          { x: cool, y: curve[at(cool)].change, text: perDeg(Number(curveN.values.cool_slope), u), tone: 'ink', priority: 2, prefer: 'above' },
        ] }]}
      refs={[{ value: 0, label: `As at ${temp(base.temp, u)}` }]}
      xTicks={tickTemps(u).map((c) => ({ value: c, label: temp(c, u) }))}
      yTicks={[{ value: top, label: `+${top} min` }]}
      axisTitle={{ start: 'Cooler start', end: 'Warmer start' }}
      scrub={{ label: 'Start temperature',
        // The readout leads with the H2's quantity (the minutes each degree adds here); the cumulative change against
        // the curve's zero is its second row.
        points: { x: curve.map((c) => (c.temp - tLo) / (tHi - tLo)), keys: curve.map((c) => `Median finish, each degree warmer near ${temp(c.temp, u)}`), values: local.map((v) => perDeg(v, u)),
          side: [{ label: `Against a ${temp(base.temp, u)} start`, values: curve.map((c) => `${signed(c.change)} min`) }] },
        initial: at(warm), detents: [at(cool), at(warm)], follow: 'f' }}
      label={`Change in the median finish with the start temperature, against ${temp(base.temp, u)}: ${perDeg(Number(curveN.values.cool_slope), u)} near ${temp(cool, u)}, ${perDeg(Number(curveN.values.warm_slope), u)} near ${temp(warm, u)}.`} />
  );
  // The page's tables, in its All numbers at the foot (each in the reader's units where it has degrees).
  const pairsTable = (u: UnitSystem) => (
    <Values bare id={`rm-pairs-${u}`} caption="Same-course pairs: start temperature and sustained slowdown" columns={[{ key: 'p', label: 'Pair, cooler · warmer', text: true }, { key: 't', label: 'At the start' }, { key: 's', label: 'Sustained slowdown' }]}
      rows={tiles(u).map((t) => [t.pair, t.side, t.value2])} />
  );
  const curveTable = (u: UnitSystem) => (
    <Values bare id={`rm-curve-${u}`} caption={`The median finish against the start temperature (${u === 'mi' ? '°F' : '°C'})`}
      columns={[{ key: 't', label: 'At the start' }, { key: 'c', label: 'Median finish' }, { key: 'd', label: 'Each degree' }]}
      rows={curve.filter((_, i) => i % 2 === 0).map((c) => [temp(c.temp, u), `${signed(c.change)} min`, perDeg(local[curve.indexOf(c)], u)])} />
  );

  // The shape on a warmer morning: each section's pace against the finish's own average, per 10 °C warmer (18 °F).
  const sig = w.heat_signature;
  const early = sig.findIndex((s) => s.section === tilt.values.early), late = sig.findIndex((s) => s.section === tilt.values.late);
  const span = Math.ceil(Math.max(...sig.map((s) => Math.abs(s.per_10c)))) + 1;

  return (
    <StoryPage path={PATH} numbers={[
      <ByUnits key="pairs" mi={pairsTable('mi')} km={pairsTable('km')} />,
      <ByUnits key="curve" mi={curveTable('mi')} km={curveTable('km')} />,
      <Values key="heat" bare id="rm-heat" caption={<ByUnits mi={`Pace against the finish’s own average, per ${tempGap(10, 'mi')} warmer, by section`} km={`Pace against the finish’s own average, per ${tempGap(10, 'km')} warmer, by section`} />}
        columns={[{ key: 's', label: 'Section' }, { key: 'v', label: 'Pace' }, { key: 'c', label: 'Interval' }]}
        rows={sig.map((s) => [sectionName(s.section), `${signed(s.per_10c)}%`, `${signed(s.ci95[0])}% to ${signed(s.ci95[1])}%`])} />,
    ]}>
      {/* The figure counts the pairs and its unit line says what was counted, the pairs' minimum gap in the reader's
          units (the term's first use, so it links); the waffle draws them one by one. A failed guard shows the plain
          sentence instead. */}
      <StoryHero path={PATH} title={story.heading ?? story.title}
        figure={pairs.figure ? { ...pairs.figure } : undefined} fallback={!pairs.guard}
        unitLine={pairs.guard ? <ByUnits {...Object.fromEntries(UNITS.map((u) => [u, rich(`same-course pairs at least ${tempGap(p.min_gap_c, u)} apart where the warmer year had more sustained slowdowns`, { term: true })])) as { mi: JSX.Element; km: JSX.Element }} /> : undefined}
        sentence={pairs.guard ? undefined : <Say nugget={pairs} term />}
        instrument={(
          <ByUnits {...Object.fromEntries(UNITS.map((u) => [u, (
            <Waffle key={u} tiles={tiles(u)} initial={opening} line hint="Choose a square to read its pair." label={`${p.hotter_slowed_more} of ${p.total} same-course pairs: the warmer year had more sustained slowdowns; choose a square to read its pair`}
              keyLabels={{ lit: 'Warmer year, more sustained slowdowns', other: 'Cooler year, as many or more' }} />
          )])) as { mi: JSX.Element; km: JSX.Element }} />
        )}>
        {/* The pairs were a beat of their own; links to it land on the reading, which now draws them. */}
        <span id="pairs" className="beat-alias" aria-hidden="true" />
      </StoryHero>

      {/* The H2 names the warm end; the chart labels the cool end it is compared with. */}
      <Beat id="curvature" track="chapter-1" label="Each degree" title={curveN} aliases={['weather']}>
        <ByUnits mi={curveChart('mi')} km={curveChart('km')} />
      </Beat>

      <Beat id="heat" track="chapter-2" label="The shape" title={tilt} aliases={['untangle']}
        // The dek says what the line measures (a shift, against a cooler morning's shape); the two labelled sections
        // carry the numbers, in percent of the finish's own average pace.
        dek={<ByUnits {...Object.fromEntries(UNITS.map((u) => [u, keep(`How much each section’s pace shifts, against the finish’s own average, on a morning ${tempGap(10, u)} warmer.`)])) as { mi: string; km: string }} />}>
        <LineProfile x={MID} xDomain={[0, 42.195]} yDomain={[-span, span]}
          // Quicker and slower both in ink (slower is never orange): the shape is the finding, not one section.
          layers={[{ id: 'heat', label: 'Warmer', series: [{ id: 'h', values: sig.map((s) => s.per_10c), fillAbove: 0, fillTone: 'quiet' }],
            points: [...(early >= 0 ? [{ x: MID[early], y: sig[early].per_10c, kind: 'compare' as const }] : []), ...(late >= 0 ? [{ x: MID[late], y: sig[late].per_10c, kind: 'compare' as const }] : [])],
            labels: [
              // Each label says the shift in percent of the finish's own average pace, and which way, as the dek says.
              ...(early >= 0 ? [{ x: MID[early], y: sig[early].per_10c, text: `${sectionName(sig[early].section)}: ${shift(sig[early].per_10c)}`, tone: 'ink' as const, priority: 2, prefer: 'below' as const }] : []),
              ...(late >= 0 ? [{ x: MID[late], y: sig[late].per_10c, text: `${sectionName(sig[late].section)}: ${shift(sig[late].per_10c)}`, tone: 'ink' as const, priority: 3, prefer: 'above' as const }] : []),
            ] }]}
          refs={[{ value: 0, label: 'Same shape' }]}
          xTicks={[{ value: 0, label: 'Start' }, { value: 10, label: '10K' }, { value: 20, label: '20K' }, { value: 30, label: '30K' }, { value: 42.195, label: 'Finish' }]}
          label="Each section's pace against the finish's own average on a warmer morning: quicker early, slower late." />
      </Beat>
    </StoryPage>
  );
}
