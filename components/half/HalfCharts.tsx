import fs from 'node:fs';
import path from 'node:path';
import type { ReactNode } from 'react';
import ChartFrame, { type KeyItem } from '@/components/viz/ChartFrame';
import Axis from '@/components/viz/Axis';
import Plot, { Baseline, Gridlines, RefLine } from '@/components/viz/Plot';
import Annotation from '@/components/viz/Annotation';
import { placeLabels, type LabelItem, type PlacedLabel } from '@/components/viz/labels';
import { linear, pc, stepEdge, stepPath, yScale } from '@/components/viz/scale';
import { hm } from '@/lib/nuggets/format';
import type { HalfField, HalfRoundMark } from '@/lib/half-types';

/**
 * The half pages' server-drawn figures, built from the components/viz primitives (ChartFrame, Plot, Axis, Annotation,
 * placeLabels) in the forms' own grammar: quiet silhouettes, ink and signal marks, labels placed for the narrowest phone
 * plot. Three needs no shared form covers: a minute histogram whose whole stretch under a time is the signal, columns
 * that stand on a 1× line with their intervals, and columns whose 50% rule is named on the clear (left) side.
 */

/** The value of one minute of the histogram: minute m (65 … 209) and its finishes. */
type Bin = { m: number; n: number };

/**
 * The reading's instrument on /half: every whole minute of verified half finishes from 1:05 to 3:29 as one silhouette,
 * the minutes under `mark` (2:00) in the signal tone and named with their share, the rest quiet; the two tails drawn as
 * one bar each past a one-minute gap ("Under 1:05", "3:30+"). Ticks every 15 minutes where they fit (every 30 on a
 * phone).
 */
export function FieldHistogram({ field, mark, share, label, height = 120, heightMd = 170 }: {
  field: HalfField; mark: number; share: string; label: string; height?: number; heightMd?: number;
}) {
  const { lo, hi, counts, under_lo: under, at_or_over_hi: over } = field.minutes;
  // The tails stand one minute clear of the histogram on either side, so they read as totals, not minutes.
  const x0 = lo - 2, x1 = hi + 2;
  const x = linear([x0, x1]);
  const w = 1 / (x1 - x0);
  const bins: Bin[] = counts.map((n, i) => ({ m: lo + i, n }));
  const y = yScale(0, Math.max(...counts, under, over), { top: 0.18 });
  const at = (list: Bin[]) => list.map((b) => ({ x: x(b.m), y: y(b.n) }));
  const below = bins.filter((b) => b.m < mark), from = bins.filter((b) => b.m >= mark);
  const tailUnder = [{ m: lo - 2, n: under }], tailOver = [{ m: hi + 1, n: over }];
  // The share's name sits over the plot's top left, above the rising minutes and clear of the tallest one (the plot's top
  // 18% is kept free for it), at every width down to 200% zoom.
  const name: PlacedLabel = { id: 'share', text: share, x: 0, y: 0.13, priority: 3, tone: 'signal', anchor: 'start', dx: 0, dy: 0, minWidth: 0 };
  const plot = (
    <Plot>
      <svg className="viz-paths" viewBox="0 0 1000 1000" preserveAspectRatio="none" width="100%" height="100%" overflow="visible">
        <path className="a-signal" d={stepPath(at(below), w)} />
        <path className="a-signal" d={stepPath(at(tailUnder), w)} />
        <path className="a-silhouette" d={stepPath(at(from), w)} />
        <path className="a-silhouette" d={stepPath(at(tailOver), w)} />
        <path className="a-edge" d={stepEdge(at(from), w)} />
        <path className="a-edge" d={stepEdge(at(tailOver), w)} />
        <path className="l-signal" d={stepEdge(at(below), w)} />
        <path className="l-signal" d={stepEdge(at(tailUnder), w)} />
      </svg>
      <Annotation labels={[name]} />
      <Baseline />
    </Plot>
  );
  const ticks = [
    ...Array.from({ length: Math.floor((hi - 75) / 15) + 1 }, (_, i) => 75 + i * 15).filter((m) => m < hi)
      .map((m) => ({ x: x(m), label: hm(m), priority: m % 30 === 0 ? 3 : 1 })),
    { x: x(lo - 1.5), label: `Under ${hm(lo)}`, priority: 2 },
    { x: x(hi + 1.5), label: `${hm(hi)}+`, priority: 2 },
  ];
  return <ChartFrame className="half-histogram" label={label} height={height} heightMd={heightMd} plot={plot} axis={<Axis ticks={ticks} />} />;
}

/**
 * /half's round times: for each mark, the minute before it against the smooth curve, as a column standing on the curve's
 * own line (1×) up to its ratio, with its interval as a whisker. The mark the sentence names is the signal, the one the
 * dek names with it ink, the rest quiet. Each column carries its ratio.
 */
export function RatioColumns({ marks, signal, ink, label, values }: {
  marks: HalfRoundMark[]; signal: number; ink: number[]; label: string; values?: ReactNode;
}) {
  const height = 190;
  const top = Math.max(...marks.map((m) => m.ratio_ci95[1]));
  // The 1× line sits above the plot's foot, so its name reads under it, clear of the columns that stand on it.
  const y = yScale(0.94, top, { top: 0.2 });
  const x = linear([0, marks.length]);
  const base = y(1);
  const tone = (m: HalfRoundMark) => (m.minutes === signal ? 'signal' : ink.includes(m.minutes) ? 'ink' : 'quiet');
  const items: LabelItem[] = marks.map((m, i) => ({
    id: m.mark, text: `${m.ratio.toFixed(2)}×`, x: x(i + 0.5), y: y(m.ratio_ci95[1]), priority: tone(m) === 'signal' ? 3 : 2,
    tone: tone(m) === 'signal' ? 'signal' : tone(m) === 'quiet' ? 'quiet' : 'ink', size: tone(m) === 'signal' ? 14 : 13, gap: 6, prefer: 'above',
  }));
  const placed = placeLabels(items, { height, boxes: marks.map((m, i) => ({ x0: x(i + 0.5) - 12 / 288, x1: x(i + 0.5) + 12 / 288, y0: y(m.ratio_ci95[1]), y1: base })) });
  const plot = (
    <Plot>
      {marks.map((m, i) => {
        const t = tone(m);
        const cls = t === 'signal' ? 'm-signal' : t === 'ink' ? 'm-ink' : 'm-quiet';
        const cx = pc(x(i + 0.5));
        return (
          <g key={m.mark} className={`column ${cls}`}>
            <rect x={cx} width={22} transform="translate(-11 0)" y={pc(y(m.ratio))} height={pc(Math.max(0.004, base - y(m.ratio)))} rx={3} />
            <rect className="column-foot" x={cx} width={22} transform="translate(-11 -3)" y={pc(base)} height={3} />
            <g className="half-whisker">
              <rect x={cx} width={1.5} transform="translate(-0.75 0)" y={pc(y(m.ratio_ci95[1]))} height={pc(y(m.ratio_ci95[0]) - y(m.ratio_ci95[1]))} />
              <rect x={cx} width={9} transform="translate(-4.5 -0.75)" y={pc(y(m.ratio_ci95[1]))} height={1.5} />
              <rect x={cx} width={9} transform="translate(-4.5 -0.75)" y={pc(y(m.ratio_ci95[0]))} height={1.5} />
            </g>
          </g>
        );
      })}
      <RefLine y={base} label="The curve" below side="left" />
      <Annotation labels={placed} />
    </Plot>
  );
  // The columns are named by the H2 and their axis; the key names only the whisker (a single swatch for three tones of
  // column read as one of them).
  const keys: KeyItem[] = [{ label: '95% interval', mark: 'line' }];
  return (
    <ChartFrame className="columns half-ratio" label={label} height={height} heightMd={230} plot={plot}
      axis={<Axis ticks={marks.map((m, i) => ({ x: x(i + 0.5), label: m.mark, priority: tone(m) === 'signal' ? 4 : 2 }))} />}
      keys={keys} values={values} />
  );
}

/**
 * /half's women's share by finish band: one column per 15-minute band on a zero baseline, the 50% rule named on the
 * left (where the early bands stand short of it), the band the sentence names in signal, the later ones ink, the
 * earlier ones quiet. The ticks sit on the band edges, as a histogram's do, so the first column reads as under 1:30 and
 * the last as 3:00 and over. The first, the signal and the last columns carry their values.
 */
export function ShareColumns({ bands, shares, signal, label, format, values }: {
  bands: { lo_s: number; hi_s: number | null; label: string }[]; shares: number[]; signal: number; label: string;
  format: (share: number) => string; values?: ReactNode;
}) {
  const height = 190;
  const y = yScale(0, Math.max(0.75, Math.ceil(Math.max(...shares) * 10) / 10), { top: 0.14 });
  const x = linear([0, bands.length]);
  const tone = (i: number) => (i === signal ? 'signal' : i > signal ? 'ink' : 'quiet');
  const named = new Set([0, signal, bands.length - 1]);
  const items: LabelItem[] = shares.flatMap((s, i) => (named.has(i) ? [{
    id: `b${i}`, text: format(s), x: x(i + 0.5), y: y(s), priority: i === signal ? 3 : 2, tone: i === signal ? 'signal' as const : 'ink' as const,
    size: i === signal ? 14 : 13, gap: 6, prefer: 'above' as const,
  }] : []));
  const half = y(0.5);
  // The 50% rule's name is the gridline's own label at its left end, where the early bands stand short of it; the
  // values keep clear of its box.
  const ruleBox = { x0: 0, x1: 34 / 288, y0: half - 20 / height, y1: half };
  const placed = placeLabels(items, { height, boxes: [ruleBox, ...shares.map((s, i) => ({ x0: x(i + 0.5) - 12 / 288, x1: x(i + 0.5) + 12 / 288, y0: y(s), y1: 1 }))] });
  const plot = (
    <Plot>
      <Gridlines lines={[{ y: half, label: '50%' }]} side="left" />
      {shares.map((s, i) => {
        const t = tone(i);
        const cls = t === 'signal' ? 'm-signal' : t === 'ink' ? 'm-ink' : 'm-quiet';
        const h = Math.max(0.004, 1 - y(s));
        return (
          <g key={i} className={`column ${cls}`}>
            <rect x={pc(x(i + 0.5))} width={22} transform="translate(-11 0)" y={pc(1 - h)} height={pc(h)} rx={3} />
            <rect className="column-foot" x={pc(x(i + 0.5))} width={22} transform="translate(-11 -3)" y="100%" height={3} />
          </g>
        );
      })}
      <Baseline />
      <Annotation labels={placed} />
    </Plot>
  );
  const ticks = bands.slice(1).map((b, i) => ({ x: x(i + 1), label: hm(b.lo_s / 60), priority: i + 1 === signal ? 4 : 1 }));
  return <ChartFrame className="columns half-share" label={label} height={height} heightMd={230} plot={plot} axis={<Axis ticks={ticks} />} values={values} />;
}

/**
 * "Save the image" under a beat whose finding has a "From the half" card (public/charts/cards/, drawn by
 * scripts/build-chart-cards.cjs --set half). Nothing shows until the card's image is in the build.
 */
export function SaveImage({ slug }: { slug: string }) {
  const name = [`${slug}.png`, `half-${slug}.png`].find((f) => fs.existsSync(path.join(process.cwd(), 'public/charts/cards', f)));
  if (!name) return null;
  return <p className="half-save"><a href={`/charts/cards/${name}`} download={`pace-notes-${slug}.png`}>Save the image</a></p>;
}
