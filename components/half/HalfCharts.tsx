import fs from 'node:fs';
import path from 'node:path';
import type { ReactNode } from 'react';
import ChartFrame, { type KeyItem } from '@/components/viz/ChartFrame';
import Axis from '@/components/viz/Axis';
import Plot, { Baseline, Gridlines } from '@/components/viz/Plot';
import Annotation from '@/components/viz/Annotation';
import { REF_WIDTH, placeLabels, textWidth, type LabelItem, type PlacedLabel } from '@/components/viz/labels';
import { linePath, linear, pc, stepEdge, stepPath, yScale } from '@/components/viz/scale';
import { hm } from '@/lib/nuggets/format';
import type { HalfField, HalfRoundMark } from '@/lib/half-types';

/**
 * The half pages' server-drawn figures, built from the components/viz primitives (ChartFrame, Plot, Axis, Annotation,
 * placeLabels) in the forms' own grammar: quiet silhouettes, ink and signal marks, labels placed for the narrowest phone
 * plot. Three needs no shared form covers: a minute histogram whose whole stretch under a time is the signal, columns
 * that stand on a 1× line with their intervals, and columns whose 50% rule is named on the clear (left) side.
 */

/** The value of one minute of the histogram: minute m (field.minutes.lo … hi − 1, 70 … 199 today) and its finishes. */
type Bin = { m: number; n: number };

/**
 * The reading's instrument on /half: every whole minute of verified half finishes the file publishes (1:10 to 3:19 since
 * the stamp correction, October 30, 2026) as one silhouette,
 * the minutes under `mark` (2:00) in the signal tone and named with their share, the rest quiet; the two tails drawn as
 * one bar each past a one-minute gap ("<1:10", "3:20+"). Ticks every 15 minutes where they fit (every 30 on a
 * phone).
 */
export function FieldHistogram({ field, mark, share, label, height = 120, heightMd = 170 }: {
  field: HalfField; mark: number; share: string; label: string; height?: number; heightMd?: number;
}) {
  const { lo, hi, counts, under_lo: under, at_or_over_hi: over } = field.minutes;
  // The tails stand one minute clear of the histogram on either side, so they read as totals, not minutes, and the
  // axis keeps a minute beyond each, where the tails' names sit at its ends: with the 1:10 to 3:19 range (stamp
  // correction, October 30, 2026) names centred on the tails crowded 1:30 and 3:00 and hid on a phone.
  const x0 = lo - 3, x1 = hi + 3;
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
    // The tails in a short, matched pair, so both keep their names on a phone (a long "Under 1:10" lost its own there).
    { x: x(x0), label: `<${hm(lo)}`, priority: 2 },
    { x: x(x1), label: `${hm(hi)}+`, priority: 2 },
  ];
  return <ChartFrame className="half-histogram" label={label} height={height} heightMd={heightMd} plot={plot} axis={<Axis ticks={ticks} />} />;
}

/**
 * /half's round times: for each mark, the minute before it against the smooth curve, as a column standing on the curve's
 * own line (1×, the plot's foot, so the times sit right under their columns) up to its ratio, with its interval as a
 * whisker. The mark the sentence names is the signal, one the dek names with it a step up from quiet (the mid tone, so
 * the signal reads first in both themes), the rest quiet. Each column carries its ratio over its whisker; below 240 px
 * (200% zoom) only the signal's and the named ones' do, and the first column's turns to start at its left edge. The key
 * says what the foot is. The figure keeps a column's width at any screen, so it is capped on a wide one.
 */
export function RatioColumns({ marks, signal, ink, label, values }: {
  marks: HalfRoundMark[]; signal: number; ink: number[]; label: string; values?: ReactNode;
}) {
  const height = 170;
  const top = Math.max(...marks.map((m) => m.ratio_ci95[1]));
  const y = yScale(1, top, { top: 0.22 });
  const x = linear([0, marks.length]);
  const base = y(1);
  const tone = (m: HalfRoundMark) => (m.minutes === signal ? 'signal' : ink.includes(m.minutes) ? 'named' : 'quiet');
  // Each column's ratio over its whisker, placed by hand (each in its own column): at the plot's left and right ends the
  // label turns to the column's outer edge, so it never leaves the plot at any width.
  const labels: PlacedLabel[] = marks.map((m, i) => {
    const t = tone(m);
    const anchor = i === 0 ? 'start' as const : i === marks.length - 1 ? 'end' as const : 'middle' as const;
    return {
      id: m.mark, text: `${m.ratio.toFixed(2)}×`, x: x(i + 0.5), y: y(m.ratio_ci95[1]), priority: t === 'quiet' ? 1 : 3,
      tone: t === 'signal' ? 'signal' : t === 'quiet' ? 'quiet' : 'ink', size: t === 'signal' ? 14 : 13,
      anchor, dx: anchor === 'start' ? -11 : anchor === 'end' ? 11 : 0, dy: -8, minWidth: t === 'quiet' ? 240 : 0,
    };
  });
  const plot = (
    <Plot>
      {marks.map((m, i) => {
        const t = tone(m);
        const cls = t === 'signal' ? 'm-signal' : t === 'named' ? 'm-context' : 'm-quiet';
        const cx = pc(x(i + 0.5));
        return (
          <g key={m.mark} className={`column ${cls}`}>
            <rect x={cx} width={22} transform="translate(-11 0)" y={pc(y(m.ratio))} height={pc(Math.max(0.004, base - y(m.ratio)))} rx={3} />
            <rect className="column-foot" x={cx} width={22} transform="translate(-11 -3)" y={pc(base)} height={3} />
            {/* The whisker over a 1.5 px halo of the page on each side, so it reads on any column fill in both themes
                (the mid-tone 1:30 column hid an ink whisker by day and a light one by night). */}
            <g className="half-whisker-halo">
              <rect x={cx} width={4.5} transform="translate(-2.25 0)" y={pc(y(m.ratio_ci95[1]))} height={pc(y(m.ratio_ci95[0]) - y(m.ratio_ci95[1]))} />
              <rect x={cx} width={12} transform="translate(-6 -2.25)" y={pc(y(m.ratio_ci95[1]))} height={4.5} />
              <rect x={cx} width={12} transform="translate(-6 -2.25)" y={pc(y(m.ratio_ci95[0]))} height={4.5} />
            </g>
            <g className="half-whisker">
              <rect x={cx} width={1.5} transform="translate(-0.75 0)" y={pc(y(m.ratio_ci95[1]))} height={pc(y(m.ratio_ci95[0]) - y(m.ratio_ci95[1]))} />
              <rect x={cx} width={9} transform="translate(-4.5 -0.75)" y={pc(y(m.ratio_ci95[1]))} height={1.5} />
              <rect x={cx} width={9} transform="translate(-4.5 -0.75)" y={pc(y(m.ratio_ci95[0]))} height={1.5} />
            </g>
          </g>
        );
      })}
      <Baseline />
      <Annotation labels={labels} />
    </Plot>
  );
  // The columns are named by the H2 and their axis; the key says what they stand on and names the whisker. "curve, 1×"
  // is bound by a no-break space, so the baseline's value never wraps to a line of its own (320 px, round 4 review).
  const keys: KeyItem[] = [{ label: 'Each column rises from the smooth curve,\u00a01×', mark: 'none' }, { label: '95% interval', mark: 'line' }];
  return (
    <ChartFrame className="columns half-ratio" label={label} height={height} heightMd={210} plot={plot}
      axis={<Axis ticks={marks.map((m, i) => ({ x: x(i + 0.5), label: m.mark, priority: tone(m) === 'signal' ? 4 : 2 }))} />}
      keys={keys} values={values} />
  );
}

/**
 * /half's women's share by finish band: one column per 15-minute band on a zero baseline, the 50% rule named on the
 * left (where the early bands stand short of it), the band the sentence names in signal, the later ones (also over
 * half) a step up from quiet in the mid tone, so the one signal reads first in both themes, the earlier ones quiet. The
 * ticks sit on the band edges, as a histogram's do, so the first column reads as under 1:30 and the last as 3:00 and
 * over. The first, the signal and the last columns carry their values at every width, the end ones turned to their
 * column's outer edge. Below 240 px (200% zoom) the columns narrow to 16 px, so eight keep a gap between them.
 */
export function ShareColumns({ bands, shares, signal, label, format, values }: {
  bands: { lo_s: number; hi_s: number | null; label: string }[]; shares: number[]; signal: number; label: string;
  format: (share: number) => string; values?: ReactNode;
}) {
  const height = 190;
  const y = yScale(0, Math.max(0.75, Math.ceil(Math.max(...shares) * 10) / 10), { top: 0.14 });
  const x = linear([0, bands.length]);
  // No signal (signal < 0: the page's sentence about the crossing has fallen back) draws every column quiet, so the
  // chart never marks a band its heading does not name.
  const tone = (i: number) => (signal < 0 ? 'quiet' : i === signal ? 'signal' : i > signal ? 'over' : 'quiet');
  const last = bands.length - 1;
  const labels: PlacedLabel[] = [0, signal, last].filter((i, k, a) => i >= 0 && a.indexOf(i) === k).map((i) => {
    const anchor = i === 0 ? 'start' as const : i === last ? 'end' as const : 'middle' as const;
    return {
      id: `b${i}`, text: format(shares[i]), x: x(i + 0.5), y: y(shares[i]), priority: 3, tone: i === signal ? 'signal' as const : 'ink' as const,
      // The signal's value ends at its narrow column's right edge (8 px past the centre) rather than centred: at 200% zoom
      // the pitch is 20 px, and a centred 14 px "59%" ran into the taller column to its right (the earlier one is lower).
      size: i === signal ? 14 : 13, anchor: i === signal && anchor === 'middle' ? 'end' as const : anchor,
      dx: anchor === 'start' ? -11 : anchor === 'end' ? 11 : i === signal ? 8 : 0, dy: -7, minWidth: 0,
    };
  });
  const half = y(0.5);
  const bar = (i: number, s: number, w: number, cls: string) => {
    const h = Math.max(0.004, 1 - y(s));
    return (
      <g key={`${cls}${i}`} className={cls}>
        <rect x={pc(x(i + 0.5))} width={w} transform={`translate(${-w / 2} 0)`} y={pc(1 - h)} height={pc(h)} rx={3} />
        <rect className="column-foot" x={pc(x(i + 0.5))} width={w} transform={`translate(${-w / 2} -3)`} y="100%" height={3} />
      </g>
    );
  };
  const plot = (
    <Plot>
      <Gridlines lines={[{ y: half, label: '50%' }]} side="left" />
      {shares.map((s, i) => {
        const t = tone(i);
        const cls = t === 'signal' ? 'm-signal' : t === 'over' ? 'm-context' : 'm-quiet';
        return (
          <g key={i} className={`column ${cls}`}>
            {bar(i, s, 22, 'half-col-wide')}
            {bar(i, s, 16, 'half-col-narrow')}
          </g>
        );
      })}
      <Baseline />
      <Annotation labels={labels} />
    </Plot>
  );
  // Even steps at every width: the signal's edge (2:15) first, the edges 45 minutes either side of it next (1:30, 3:00),
  // and the quarter hours between them only all together (a tick group), so 200% zoom never shows 1:30, 2:15, 2:45.
  const steps = signal >= 0 ? signal : Math.floor(bands.length / 2);
  const ticks = bands.slice(1).map((b, i) => {
    const k = i + 1, off = Math.abs(k - steps);
    return { x: x(k), label: hm(b.lo_s / 60), priority: k === signal ? 4 : off % 3 === 0 ? 3 : 1, ...(k !== signal && off % 3 !== 0 ? { group: 'quarter' } : {}) };
  });
  return <ChartFrame className="columns half-share" label={label} height={height} heightMd={230} plot={plot} axis={<Axis ticks={ticks} />} values={values} />;
}

/**
 * The half pace chart's data panel: the share of half finishes under each time as one ink curve from a share of 0 to
 * 1, the round times as dots with their shares (the one the sentence names in signal), gridlines labelled on the left
 * as on /half's curve. It is
 * LineProfile's single-curve drawing without the needle or the lens: LineProfile imports its two client islands
 * (Scrubber, Lens) wherever it is used, which put 3.6 KB of chart script on a page that runs none (S8, October 30, 2026).
 */
export function ShareCurve({ curve, xDomain, marks, xTicks, yTicks, label, height = 200, heightMd = 240 }: {
  curve: { x: number; y: number }[]; xDomain: [number, number];
  marks: { x: number; y: number; text: string; signal?: boolean }[];
  xTicks: { value: number; label: string; priority?: number; group?: string }[]; yTicks: { value: number; label: string }[];
  label: string; height?: number; heightMd?: number;
}) {
  const x = linear(xDomain);
  const y = yScale(0, 1, { top: 0.12, bottom: 0 });
  const pts = curve.map((p) => [x(p.x), y(p.y)] as [number, number]);
  // Each label keeps clear of the dots and of the curve (its vertices and points along each segment), placed for the
  // narrowest phone plot.
  const along = pts.flatMap(([x0, y0], i) => {
    if (i === pts.length - 1) return [{ x: x0, y: y0, r: 3 }];
    const [x1, y1] = pts[i + 1];
    const n = Math.max(2, Math.ceil(Math.hypot((x1 - x0) * REF_WIDTH, (y1 - y0) * height) / 5));
    return Array.from({ length: n }, (_, k) => ({ x: x0 + ((x1 - x0) * k) / n, y: y0 + ((y1 - y0) * k) / n, r: k ? 2 : 3 }));
  });
  // Above-left of each dot first: on the rising curve that place stays clear of the line at every width (a label beside
  // its dot, clear on a phone, met the flatter curve of a wide screen).
  const items: LabelItem[] = marks.map((m, i) => ({ id: `mark-${i}`, text: m.text, x: x(m.x), y: y(m.y), priority: m.signal ? 3 : 2, tone: m.signal ? 'signal' : 'ink', prefer: 'above-left', gap: 9 }));
  // The gridline labels sit on the left, as on /half's curve (one layout for one form); the marks' labels keep clear of them.
  const gridBoxes = yTicks.map((t) => ({ x0: 0, x1: (textWidth(t.label, 12, 500) + 6) / REF_WIDTH, y0: y(t.value) - 18 / height, y1: y(t.value) }));
  const placed = placeLabels(items, { height, boxes: gridBoxes, avoid: [...marks.map((m) => ({ x: x(m.x), y: y(m.y), r: 7 })), ...along] });
  const plot = (
    <Plot>
      {/* The baseline under the curve, which starts along it at the first published minute (drawn over it, the line read hollow there). */}
      <Baseline />
      {/* Below 240 px of plot (200% zoom) the gridline labels give way: the round times' own shares name the scale. */}
      <Gridlines lines={yTicks.map((t) => ({ y: y(t.value), label: t.label, className: 'w240' }))} side="left" />
      <g>
        <svg className="viz-paths" viewBox="0 0 1000 1000" preserveAspectRatio="none" width="100%" height="100%" overflow="visible">
          <path className="l-ink" d={linePath(pts)} />
        </svg>
        {marks.map((m, i) => <circle key={i} className={m.signal ? 'm-signal is-reading' : 'm-ink is-compare'} cx={pc(x(m.x))} cy={pc(y(m.y))} r={m.signal ? 5.5 : 4} />)}
        <Annotation labels={placed} />
      </g>
    </Plot>
  );
  return <ChartFrame label={label} height={height} heightMd={heightMd} plot={plot} axis={<Axis ticks={xTicks.map((t) => ({ x: x(t.value), label: t.label, priority: t.priority, group: t.group }))} />} />;
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
