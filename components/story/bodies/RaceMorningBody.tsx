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
  const tiles = (u: UnitSystem) => p.list.map((x) => ({
    id: `${x.city}-${x.cool_year}-${x.hot_year}`, lit: x.hotter_slowed_more,
    key: `Sustained slowdown, ${pairName(x)}`, value: `${pct(x.cool_slowdown)} · ${pct(x.hot_slowdown)}`,
    side: `${temp(x.cool_temp, u)} · ${temp(x.hot_temp, u)}`, pair: pairName(x),
  }));
  // The readout opens on the pair furthest apart at the start (the first such in the data), the clearest case of a
  // warmer morning; the waffle draws the warmer-had-more pairs first, so its index counts in that order.
  const widest = p.list.reduce((best, x, i) => (x.hot_temp - x.cool_temp > p.list[best].hot_temp - p.list[best].cool_temp ? i : best), 0);
  const order = [...p.list.keys()].sort((a, b) => Number(p.list[b].hotter_slowed_more) - Number(p.list[a].hotter_slowed_more) || a - b);
  const opening = Math.max(0, order.indexOf(widest));

  // The finish against the start temperature: the median finish's change from the curve's zero point, degree by degree.
  const curve = w.curvature.finish_min_curve;
  const base = curve.find((c) => c.change === 0) ?? curve[0];
  const tLo = curve[0].temp, tHi = curve[curve.length - 1].temp;
  const local = curve.map((c, i) => (i ? c.change - curve[i - 1].change : curve[1].change - curve[0].change));
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
      layers={[{ id: 'curve', label: 'Finish', series: [{ id: 'f', values: curve.map((c) => c.change), fillAbove: 0 }],
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
        points: { x: curve.map((c) => (c.temp - tLo) / (tHi - tLo)), keys: curve.map((c) => `Median finish starting at ${temp(c.temp, u)}, against ${temp(base.temp, u)}`), values: curve.map((c) => `${signed(c.change)} min`),
          side: [{ label: 'Each degree here', values: local.map((v) => perDeg(v, u)) }] },
        initial: at(warm), detents: [at(cool), at(warm)], follow: 'f' }}
      label={`Change in the median finish with the start temperature, against ${temp(base.temp, u)}: ${perDeg(Number(curveN.values.cool_slope), u)} near ${temp(cool, u)}, ${perDeg(Number(curveN.values.warm_slope), u)} near ${temp(warm, u)}.`}
      values={(
        <Values id={`rm-curve-${u}`} caption={`The median finish against the start temperature (${u === 'mi' ? '°F' : '°C'})`}
          columns={[{ key: 't', label: 'At the start' }, { key: 'c', label: 'Median finish' }, { key: 'd', label: 'Each degree' }]}
          rows={curve.filter((_, i) => i % 2 === 0).map((c) => [temp(c.temp, u), `${signed(c.change)} min`, perDeg(local[curve.indexOf(c)], u)])} />
      )} />
  );

  // The shape on a warmer morning: each section's pace against the finish's own average, per 10 °C warmer (18 °F).
  const sig = w.heat_signature;
  const early = sig.findIndex((s) => s.section === tilt.values.early), late = sig.findIndex((s) => s.section === tilt.values.late);
  const span = Math.ceil(Math.max(...sig.map((s) => Math.abs(s.per_10c)))) + 1;

  return (
    <StoryPage path={PATH}>
      {/* The figure counts the pairs and its key says what was counted (the term's first use, so it links); the waffle
          draws them one by one. A failed guard shows the plain sentence instead. */}
      <StoryHero path={PATH} title={story.heading ?? story.title} dek={story.dek}
        figure={pairs.figure ? { ...pairs.figure } : undefined} fallback={!pairs.guard}
        unitLine={pairs.guard && pairs.key ? rich(pairs.key, { term: true }) : undefined}
        sentence={pairs.guard ? undefined : <Say nugget={pairs} term />}
        instrument={(
          <ByUnits {...Object.fromEntries(UNITS.map((u) => [u, (
            <Waffle key={u} tiles={tiles(u)} initial={opening} sideLabel="At the start" label={`${p.hotter_slowed_more} of ${p.total} same-course pairs: the warmer year had more sustained slowdowns; tap a square to read its pair`}
              keyLabels={{ lit: 'Warmer year, more sustained slowdowns', other: 'Cooler year, as many or more' }}
              values={<Values id={`rm-pairs-${u}`} caption="Same-course pairs: start temperature and sustained slowdown" columns={[{ key: 'p', label: 'Pair, cooler · warmer', text: true }, { key: 't', label: 'At the start' }, { key: 's', label: 'Sustained slowdown' }]}
                rows={tiles(u).map((t) => [t.pair, t.side, t.value])} />} />
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
        // The dek says what the line measures; the two labelled sections carry the numbers.
        dek={<ByUnits {...Object.fromEntries(UNITS.map((u) => [u, keep(`Each section’s pace against the finish’s own average, on a morning ${tempGap(10, u)} warmer.`)])) as { mi: string; km: string }} />}>
        <LineProfile x={MID} xDomain={[0, 42.195]} yDomain={[-span, span]}
          layers={[{ id: 'heat', label: 'Warmer', series: [{ id: 'h', values: sig.map((s) => s.per_10c), fillAbove: 0 }],
            points: [...(early >= 0 ? [{ x: MID[early], y: sig[early].per_10c, kind: 'compare' as const }] : []), ...(late >= 0 ? [{ x: MID[late], y: sig[late].per_10c, kind: 'reading' as const }] : [])],
            labels: [
              ...(early >= 0 ? [{ x: MID[early], y: sig[early].per_10c, text: `${sectionName(sig[early].section)} ${signed(sig[early].per_10c)}`, tone: 'ink' as const, priority: 2, prefer: 'below' as const }] : []),
              ...(late >= 0 ? [{ x: MID[late], y: sig[late].per_10c, text: `${sectionName(sig[late].section)} ${signed(sig[late].per_10c)}`, tone: 'signal' as const, priority: 3, prefer: 'above' as const }] : []),
            ] }]}
          refs={[{ value: 0, label: 'Same shape' }]}
          xTicks={[{ value: 0, label: 'Start' }, { value: 10, label: '10K' }, { value: 20, label: '20K' }, { value: 30, label: '30K' }, { value: 42.195, label: 'Finish' }]}
          label="Each section's pace against the finish's own average on a warmer morning: quicker early, slower late."
          values={(
            <Values id="rm-heat" caption={<ByUnits mi={`Pace against the finish’s own average, per ${tempGap(10, 'mi')} warmer, by section`} km={`Pace against the finish’s own average, per ${tempGap(10, 'km')} warmer, by section`} />}
              columns={[{ key: 's', label: 'Section' }, { key: 'v', label: 'Points' }, { key: 'c', label: 'Interval' }]}
              rows={sig.map((s) => [sectionName(s.section), signed(s.per_10c), `${signed(s.ci95[0])} to ${signed(s.ci95[1])}`])} />
          )} />
      </Beat>
    </StoryPage>
  );
}
