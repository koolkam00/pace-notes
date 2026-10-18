import type { Positions } from '@/lib/insights';
import { readInsight } from '@/lib/insights-server';
import { STORIES } from '@/lib/stories';
import { getNugget } from '@/lib/nuggets';
import { ms, pct } from '@/lib/nuggets/format';
import LineProfile from '@/components/viz/LineProfile';
import Histogram from '@/components/viz/Histogram';
import Values from '@/components/ui/Values';
import { Beat, Say, StoryHero, StoryPage } from '../StoryPage';

const PATH = '/stories/places';
const MINUS = '−';
const signed = (v: number, digits = 1) => `${v > 0 ? '+' : v < 0 ? MINUS : ''}${Math.abs(v).toFixed(digits)}`;

/**
 * Pass or be passed (the redesign spec, section 7.6, under section 00): the reading (a minute back at 30K against the
 * same gap at 40K), then three beats: how far back at 30K matched a minute back at 40K (the gap scrubbed from both
 * mats), how much slowing after 30K still gained places, and the long tail of places lost. The women-against-men editions are cut (chapter 07
 * is about recorded gender); every band and crossing comes from positions.json.
 */
export default function PlacesBody() {
  const data = readInsight<Positions>('positions.json');
  const story = STORIES.find((s) => s.slug === 'places')!;
  const gap = getNugget('places.gap'), coin = getNugget('places.coin'), breakeven = getNugget('places.breakeven'), shuffle = getNugget('places.shuffle');

  // The gap behind, from 0 to past the band places.coin names, from 30K and from 40K (the same 30-second bands at both mats).
  const r30 = data.coin_flip['30'].filter((r) => r.gap_lo_s < Math.max(300, Number(coin.values.gap30_s) + 60 || 0));
  const step = Number(gap.values.step_s) || 30;
  const r40 = new Map(data.coin_flip['40'].map((r) => [r.gap_lo_s, r.share]));
  const gx = r30.map((r) => r.gap_lo_s + step / 2);
  const g40 = r30.map((r) => r40.get(r.gap_lo_s) ?? NaN);
  // The beat opens on the 30K band places.coin names (as often as a minute back at 40K); the minute back at 40K is ringed.
  const farBand = Math.max(0, r30.findIndex((r) => r.gap_lo_s === coin.values.gap30_s));
  const minuteBand = Math.max(0, r30.findIndex((r) => r.gap_lo_s === coin.values.gap40_s));
  const span = [0, r30[r30.length - 1].gap_lo_s + step] as [number, number];

  // Break-even: the 30–40K pace against a finish's own 5–20K pace, from 10% quicker to 40% slower.
  const be = data.breakeven.filter((b) => b.x >= -11 && b.x <= 41);
  const crossing = Number(breakeven.values.crossing);
  // The headline's pace: the bin nearest the rounded crossing, so the readout opens on the figure the H2 names.
  const beAt = be.reduce((best, b, i) => (Math.abs(b.x - Math.round(crossing)) < Math.abs(be[best].x - Math.round(crossing)) ? i : best), 0);
  const beTop = Math.ceil(Math.max(...be.map((b) => b.median)) / 5) * 5, beBottom = Math.floor(Math.min(...be.map((b) => b.median)) / 5) * 5;
  const slower = (x: number) => (x < 0 ? `${Math.abs(x)}% quicker` : `${x}% slower`);

  // Places gained or lost per 100 of the field, 30K to the finish: the tails are the big moves.
  const bins = data.histogram.map((h) => ({ x: h.lo, n: h.share }));
  const tails = data.histogram.filter((h) => h.lo >= 10 || h.lo <= -11).map((h) => h.lo);

  return (
    <StoryPage path={PATH}>
      <StoryHero path={PATH} title={story.heading ?? story.title} dek={story.dek}
        figure={gap.figure ? { ...gap.figure } : undefined} fallback={!gap.guard} sentence={<Say nugget={gap} />} />

      <Beat id="gap" track="chapter-1" label="How far back" title={coin}>
        <LineProfile x={gx} xDomain={span} yDomain={[0, 0.55]}
          layers={[{ id: 'gap', label: 'Crossed first', series: [{ id: '40', values: g40 }, { id: '30', values: r30.map((r) => r.share), tone: 'signal' }],
            points: coin.guard ? [{ x: gx[minuteBand], y: g40[minuteBand], kind: 'best' }] : [],
            labels: [
              // Both lines named in the open middle, clear of the needle at the far band.
              { x: gx[Math.min(gx.length - 1, 4)], y: r30[Math.min(gx.length - 1, 4)].share, text: 'From 30K', tone: 'signal', priority: 3, prefer: 'above' },
              { x: gx[Math.min(gx.length - 1, 5)], y: g40[Math.min(g40.length - 1, 5)], text: 'From 40K', tone: 'ink', priority: 2, prefer: 'above' },
            ] }]}
          refs={[{ value: 0.5, label: 'A coin flip', dashed: true }]}
          xTicks={[0, 60, 120, 180, 240, 300, 360, 420, 480, 540, 600].filter((s) => s <= span[1] && (span[1] <= 300 || s % 120 === 0)).map((s) => ({ value: s, label: s ? `${s / 60} min` : '0' }))}
          yTicks={[{ value: 0.5, label: '50%' }, { value: 0.25, label: '25%' }]}
          axisTitle={{ start: 'Close behind', end: 'Further back' }}
          scrub={{ label: 'Gap behind at the mat',
            points: { x: gx.map((v) => (v - span[0]) / (span[1] - span[0])), keys: r30.map((r) => `${ms(r.gap_lo_s)}–${ms(r.gap_lo_s + step)} behind at 30K, crossed first`),
              values: r30.map((r) => pct(r.share)), side: [{ label: 'From 40K, same gap', values: g40.map((v) => pct(v)) }] },
            initial: coin.guard ? farBand : minuteBand, detents: [...new Set([minuteBand, farBand])] }}
          label={`How often a trailing finish crossed the line first, by how far behind it was, from 30K and from 40K: ${pct(r30[farBand].share)} from ${ms(r30[farBand].gap_lo_s)} back at 30K, ${pct(g40[minuteBand])} from ${ms(r30[minuteBand].gap_lo_s)} back at 40K.`}
          values={(
            <Values id="pl-gap" caption="Crossed the line first, by the gap behind"
              columns={[{ key: 'g', label: 'Behind by' }, { key: 'a', label: 'From 30K' }, { key: 'b', label: 'From 40K' }]}
              rows={r30.map((r, i) => [`${ms(r.gap_lo_s)}–${ms(r.gap_lo_s + step)}`, pct(r.share), pct(g40[i])])} reading={farBand} />
          )} />
      </Beat>

      <Beat id="break-even" track="chapter-2" label="Slowing and still gaining" title={breakeven} dek="Pace from 30K to 40K, against the finish’s own 5–20K pace.">
        <LineProfile x={be.map((b) => b.x)} xDomain={[be[0].x, be[be.length - 1].x]} yDomain={[beBottom, beTop]}
          layers={[{ id: 'be', label: 'Places', series: [{ id: 'median', values: be.map((b) => b.median), fillAbove: 0 }],
            points: [{ x: be[beAt].x, y: be[beAt].median, kind: 'reading' }] }]}
          refs={[{ value: 0, label: 'No places gained' }]}
          xTicks={[-10, 0, 10, 20, 30, 40].filter((v) => v >= be[0].x && v <= be[be.length - 1].x).map((v) => ({ value: v, label: v === 0 ? 'Even' : v < 0 ? `${-v}% quicker` : `${v}% slower` }))}
          yTicks={[{ value: beTop, label: `+${beTop}` }, { value: beBottom, label: `${MINUS}${Math.abs(beBottom)}` }]}
          scrub={{ label: '30–40K pace against the 5–20K pace',
            points: { x: be.map((b) => (b.x - be[0].x) / (be[be.length - 1].x - be[0].x)), keys: be.map((b) => `30–40K ${slower(b.x)} than 5–20K, places per 100`), values: be.map((b) => (Math.abs(b.median) < 0.25 ? '±0' : signed(b.median))) },
            initial: beAt, detents: [beAt] }}
          label={`Median places gained per 100 of the field after 30K, by 30–40K pace against the 5–20K pace; the line crosses zero near ${Math.round(crossing)}% slower.`}
          values={(
            <Values id="pl-breakeven" caption="Places gained per 100 after 30K, by 30–40K pace"
              columns={[{ key: 'x', label: '30–40K pace' }, { key: 'm', label: 'Median places per 100' }, { key: 'g', label: 'Moved up, at this pace' }]}
              rows={be.map((b) => [slower(b.x), signed(b.median), pct(b.gained)])} reading={beAt} />
          )} />
      </Beat>

      <Beat id="shuffle" track="chapter-3" label="The long tail" title={shuffle} aliases={['gains', 'women']}>
        <Histogram bins={bins} marks={tails} ticks={[-30, -20, -10, 0, 10].map((v) => ({ x: v, label: v > 0 ? `+${v}` : v < 0 ? `${MINUS}${-v}` : '0' }))}
          readout={{ keyText: 'Lost 10 or more places per 100', value: pct(data.sinker_share, 1), side: [{ label: 'Gained 10 or more', value: pct(data.surger_share, 1) }] }}
          keyLabels={{ bin: 'Places gained or lost per 100 after 30K', mark: '10 or more either way' }}
          label={`Places gained or lost per 100 of the field from 30K to the finish. ${pct(data.gained_share)} moved up; ${pct(data.sinker_share, 1)} lost 10 or more, ${pct(data.surger_share, 1)} gained 10 or more.`}
          height={170} heightMd={220}
          values={(
            <Values id="pl-tail" caption="Share of finishes by places gained per 100 after 30K"
              columns={[{ key: 'p', label: 'Places per 100' }, { key: 's', label: 'Share of finishes' }]}
              rows={data.histogram.map((h) => [h.lo <= -30 ? `${MINUS}30 or more lost` : h.lo >= 14 ? '+14 or more' : signed(h.lo, 0), pct(h.share, 1)])} />
          )} />
      </Beat>
    </StoryPage>
  );
}
