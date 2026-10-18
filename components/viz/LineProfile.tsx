import type { ReactNode } from 'react';
import ChartFrame, { type KeyItem } from './ChartFrame';
import Axis from './Axis';
import Plot, { Baseline, Gridlines, RefLine } from './Plot';
import Lens from './Lens.client';
import Scrubber, { type ScrubPoints } from './Scrubber.client';
import Annotation from './Annotation';
import { fitClass, keepClearOf, placeLabels, REF_WIDTH, textWidth, type LabelItem } from './labels';
import { areaPath, extent, linear, linePath, pc, yScale } from './scale';
import { typeStyle } from '@/lib/viz/palette';

/**
 * A line profile (the redesign spec, section 3.6): x along the course (mats or sections) or along any continuous
 * measure; the median as a 2 px ink line, its p25–p75 band at a 10% ink wash, even pace or typical dashed, a region the
 * sentence is about washed. It also draws the U-curve of starting pace: one line against a zero line, the side the
 * sentence is about washed signal (`fillAbove`), the best point a hollow ring. A `compare` point is the level or end the
 * headline is measured against: a small filled ink dot (a ring is reserved for the reader).
 *
 * `layers` are the lens: goal chips or the like. Each is drawn on the server and the chosen one shows (the lens fades
 * between them). `scrub` adds the needle, with detents at the values the headline names.
 */
export type ProfileSeries = { id: string; values: number[]; tone?: 'ink' | 'quiet' | 'signal' | 'type'; typeIndex?: number; dashed?: boolean; fillAbove?: number };
export type ProfileLayer = {
  id: string;
  label: string;
  series: ProfileSeries[];
  /** A p10–p90 (or p25–p75) band; `edge` draws its two edges as 1.5 px --mark-quiet lines. */
  band?: { lo: number[]; hi: number[]; edge?: boolean };
  /** The span the sentence names, as a signal bracket at `x` from `y0` to `y1`, its label on the inside (left). */
  bracket?: { x: number; y0: number; y1: number; label: string };
  labels?: { x: number; y: number; text: string; tone?: 'ink' | 'signal' | 'quiet'; priority?: number; prefer?: LabelItem['prefer']; gap?: number }[];
  points?: { x: number; y: number; kind: 'best' | 'reading' | 'compare' }[];
  /** A level two points share ("as often as"): a 1 px dashed --ink-3 connector at `y` from `x0` to `x1`. */
  links?: { x0: number; x1: number; y: number }[];
};

type Props = {
  x: number[];
  xDomain?: [number, number];
  yDomain?: [number, number];
  xTicks: { value: number; label: string; priority?: number }[];
  yTicks?: { value: number; label: string }[];
  /** Which side the gridline labels sit on: the clear one (default right). */
  gridSide?: 'left' | 'right';
  layers: ProfileLayer[];
  initial?: string;
  lensLabel?: string;
  chips?: boolean;
  refs?: { value: number; label?: string; dashed?: boolean }[];
  /** A stretch of x the sentence is about ("after 20K"): its start drawn as a hairline with its label, washed with `fill`. */
  washes?: { from: number; to: number; label?: string; fill?: boolean }[];
  /**
   * `follow` names the series (by id) whose value at each scrub point the needle marks with a dot while it is away from
   * the headline's point, so a scrubbed needle always shows where it crosses the subject line.
   */
  scrub?: { points: ScrubPoints; initial: number; detents: number[]; label: string; follow?: string };
  axisTitle?: { start?: string; end?: string };
  label: string;
  keys?: KeyItem[];
  values?: ReactNode;
  height?: number;
  heightMd?: number;
};

export default function LineProfile({ x: xs, xDomain, yDomain, xTicks, yTicks = [], gridSide = 'right', layers, initial, lensLabel, chips, refs = [], washes = [], scrub, axisTitle, label, keys, values, height = 220, heightMd = 280 }: Props) {
  const x = linear(xDomain ?? extent(xs));
  const all = layers.flatMap((l) => [...l.series.flatMap((s) => s.values), ...(l.band ? [...l.band.lo, ...l.band.hi] : [])]).concat(refs.map((r) => r.value));
  const [lo, hi] = yDomain ?? extent(all);
  const pad = (hi - lo) * 0.06 || 1;
  // A domain that starts at zero stands on the axis: its zero is the baseline, so a filled area never floats above it.
  const y = yScale(yDomain ? lo : lo - pad, yDomain ? hi : hi + pad, { top: 0.12, bottom: yDomain && lo === 0 ? 0 : 0.04 });
  const current = initial ?? layers[0]?.id;
  const lensOn = layers.length > 1;

  const drawLayer = (layer: ProfileLayer) => {
    // Values outside the domain (a wide band) are held at its edge, so nothing spills out of the plot.
    const [d0, d1] = y.domain;
    const clamp = (v: number) => Math.max(Math.min(d0, d1), Math.min(Math.max(d0, d1), v));
    const pts = (values: number[]) => values.map((v, i) => [x(xs[i]), y(clamp(v))] as [number, number]);
    const items: LabelItem[] = (layer.labels ?? []).map((l, i) => ({ id: `${layer.id}-${i}`, text: l.text, x: x(l.x), y: y(l.y), priority: l.priority ?? (l.tone === 'signal' ? 3 : 2), tone: l.tone, prefer: l.prefer, gap: l.gap }));
    // Labels keep clear of the points and of every line: its vertices and points along each segment.
    const along = (values: number[]) => values.flatMap((v, i) => {
      if (i === values.length - 1) return [{ x: x(xs[i]), y: y(clamp(v)), r: 3 }];
      const [x0, y0, x1, y1] = [x(xs[i]), y(clamp(v)), x(xs[i + 1]), y(clamp(values[i + 1]))];
      const n = Math.max(2, Math.ceil(Math.hypot((x1 - x0) * REF_WIDTH, (y1 - y0) * height) / 5));
      return Array.from({ length: n }, (_, k) => ({ x: x0 + ((x1 - x0) * k) / n, y: y0 + ((y1 - y0) * k) / n, r: k ? 2 : 3 }));
    });
    const avoid = [...(layer.points ?? []).map((p) => ({ x: x(p.x), y: y(p.y), r: 7 })), ...layer.series.flatMap((sr) => along(sr.values))];
    // …and of a bracket's label (to the bracket's left, at its middle).
    if (layer.bracket) {
      const bx = x(layer.bracket.x), by = (y(layer.bracket.y0) + y(layer.bracket.y1)) / 2, bw = (textWidth(layer.bracket.label, 14) + 14) / REF_WIDTH;
      for (let t = 0; t <= 6; t++) avoid.push({ x: bx - (bw * t) / 6, y: by, r: 10 });
    }
    // …and of a level connector between two points.
    for (const k of layer.links ?? []) for (let t = 0; t <= 20; t++) avoid.push({ x: x(k.x0 + ((k.x1 - k.x0) * t) / 20), y: y(k.y), r: 2 });
    const placed = placeLabels(items, { height, avoid });
    // Below the reference width the bracket's label keeps its place by the plot's edge while the others move with the
    // plot, so a label that would meet it there hides at that width (200% zoom; the Values table keeps it).
    if (layer.bracket) {
      const b = layer.bracket, bw = textWidth(b.label, 14), base = ((y(b.y0) + y(b.y1)) / 2) * height + 5;
      // The bracket's text box is taken at its full glyph height (ascenders and descenders), measured in Chromium.
      keepClearOf(placed, (w) => { const x1 = Math.min(1, Math.max(0, x(b.x))) * w - 12; return { x0: x1 - bw, x1, y0: base - 14 * 0.95, y1: base + 14 * 0.3 }; }, height);
    }
    return (
      <g key={layer.id} data-layer={lensOn ? layer.id : undefined} className={lensOn && layer.id !== current ? 'is-off' : undefined}>
        <svg className="viz-paths" viewBox="0 0 1000 1000" preserveAspectRatio="none" width="100%" height="100%" overflow="visible">
          {layer.band ? <path className="a-band" d={areaPath(pts(layer.band.hi), pts(layer.band.lo))} /> : null}
          {layer.band?.edge ? <><path className="a-edge" d={linePath(pts(layer.band.hi))} /><path className="a-edge" d={linePath(pts(layer.band.lo))} /></> : null}
          {layer.series.filter((s) => s.fillAbove !== undefined).map((s) => (
            <path key={`fill-${s.id}`} className="a-signal" d={areaPath(pts(s.values.map((v) => Math.max(v, s.fillAbove!))), pts(s.values.map(() => s.fillAbove!)))} />
          ))}
          {layer.series.map((s) => (
            <path key={s.id} className={s.dashed ? 'l-dash' : s.tone === 'quiet' ? 'l-quiet' : s.tone === 'signal' ? 'l-signal' : s.tone === 'type' ? 'l-type' : 'l-ink'}
              style={s.tone === 'type' ? typeStyle(s.typeIndex ?? 0) : undefined} d={linePath(pts(s.values))} />
          ))}
        </svg>
        {(layer.links ?? []).map((k, i) => (
          <line key={`link-${i}`} className="ref-line is-dashed is-link" x1={pc(x(k.x0))} x2={pc(x(k.x1))} y1={pc(y(k.y))} y2={pc(y(k.y))} />
        ))}
        {layer.bracket ? <Bracket {...layer.bracket} x={x(layer.bracket.x)} y0={y(layer.bracket.y0)} y1={y(layer.bracket.y1)} /> : null}
        {(layer.points ?? []).map((p, i) => (
          <circle key={i} className={p.kind === 'best' ? 'm-hollow-ink' : p.kind === 'compare' ? 'm-ink is-compare' : 'm-signal is-reading'} cx={pc(x(p.x))} cy={pc(y(p.y))} r={p.kind === 'best' ? 5 : p.kind === 'compare' ? 4 : 5.5} />
        ))}
        <Annotation labels={placed} />
      </g>
    );
  };

  // A reference line's label goes where nothing else is (looks-off item 1): clear of every line, of the washed "behind"
  // area, of the gridline labels and of the needle's opening position. The ends are tried first, over then under the
  // line, then positions along it; the check runs at the narrowest phone plot (REF_WIDTH × height).
  const firstLayer = layers.find((l) => l.id === current) ?? layers[0];
  // A domain passed high to low draws larger values lower (pace: slower down, ahead up).
  const flipped = y(1) > y(0);
  const needleX = scrub ? (scrub.points.x[scrub.initial] ?? null) : null;
  const refSpot = (r: { value: number; label?: string }): { side?: 'left' | 'right'; at?: number; below?: boolean } => {
    if (!r.label || !firstLayer) return { side: 'left' };
    const w = textWidth(r.label, 13) + 4, ry = y(r.value) * height;
    const lines = firstLayer.series.map((sr) => sr.values.map((v, i) => [x(xs[i]) * REF_WIDTH, y(v) * height] as [number, number]));
    const washed = firstLayer.series.filter((sr) => sr.fillAbove !== undefined).map((sr) => sr.values.map((v, i) => [x(xs[i]) * REF_WIDTH, v > sr.fillAbove! ? 1 : 0] as [number, number]));
    const grid = yTicks.map((t) => { const gy = y(t.value) * height; const gw = textWidth(t.label, 12, 500) + 4; return gridSide === 'left' ? { x0: 0, x1: gw, y0: gy - 18, y1: gy } : { x0: REF_WIDTH - gw, x1: REF_WIDTH, y0: gy - 18, y1: gy }; });
    const clear = (x0: number, below: boolean) => {
      const x1 = x0 + w, y0 = below ? ry + 3 : ry - 19, y1 = below ? ry + 19 : ry - 3;
      if (x0 < 0 || x1 > REF_WIDTH) return false;
      if (needleX !== null && needleX * REF_WIDTH > x0 - 6 && needleX * REF_WIDTH < x1 + 6) return false;
      if (grid.some((g) => g.x0 < x1 && g.x1 > x0 && g.y0 < y1 && g.y1 > y0)) return false;
      for (const pts of lines) {
        for (let i = 1; i < pts.length; i++) {
          const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
          if (bx < x0 - 3 || ax > x1 + 3) continue;
          // The segment's y over the part of it inside the box's x range.
          const t0 = bx === ax ? 0 : Math.max(0, Math.min(1, (x0 - 3 - ax) / (bx - ax))), t1 = bx === ax ? 1 : Math.max(0, Math.min(1, (x1 + 3 - ax) / (bx - ax)));
          const ya = ay + (by - ay) * t0, yb = ay + (by - ay) * t1;
          if (Math.max(ya, yb) > y0 - 3 && Math.min(ya, yb) < y1 + 3) return false;
        }
      }
      // The washed side is above the line, or below it on a flipped scale (slower drawn down).
      if (below === flipped && washed.some((pts) => pts.some(([px, on]) => on && px > x0 - 3 && px < x1 + 3))) return false;
      return true;
    };
    const ends: [number, boolean, { side?: 'left' | 'right'; at?: number; below?: boolean }][] = [
      [REF_WIDTH - w, false, { side: 'right' }], [0, false, { side: 'left' }], [REF_WIDTH - w, true, { side: 'right', below: true }], [0, true, { side: 'left', below: true }],
    ];
    for (const [x0, below, spot] of ends) if (clear(x0, below)) return spot;
    for (const below of [false, true]) for (let x0 = 8; x0 + w <= REF_WIDTH; x0 += 8) if (clear(x0, below)) return { at: x0 / REF_WIDTH, below };
    return { side: 'left' };
  };

  const plot = (
    <Plot>
      {washes.map((w, i) => (
        <g key={i}>
          {w.fill ? <rect className="a-wash" x={pc(x(w.from))} width={pc(x(w.to) - x(w.from))} y="0" height="100%" /> : null}
          <rect className="grid-line" x={pc(x(w.from))} width={1} y="0" height="100%" transform="translate(-0.5 0)" />
          {w.label ? <text className={`tick ${fitClass((textWidth(w.label, 12, 500) + 64) / Math.max(0.05, 1 - x(w.from)))}`} x={pc(x(w.from))} y="0" dy={12} dx={6}>{w.label}</text> : null}
        </g>
      ))}
      <Gridlines lines={yTicks.map((t) => ({ y: y(t.value), label: t.label }))} side={gridSide} />
      {refs.map((r) => <RefLine key={r.value} y={y(r.value)} label={r.label} dashed={r.dashed} {...refSpot(r)} />)}
      {layers.map(drawLayer)}
      <Baseline />
    </Plot>
  );
  const axis = <Axis ticks={xTicks.map((t) => ({ x: x(t.value), label: t.label, priority: t.priority }))} title={axisTitle} />;
  // The followed series' value under each scrub point (one value per point, in order), as a fraction from the top.
  const followed = (sc: NonNullable<Props['scrub']>): ScrubPoints => {
    const series = sc.follow ? layers.flatMap((l) => l.series).find((sr) => sr.id === sc.follow) : undefined;
    if (!series || series.values.length !== sc.points.x.length) return sc.points;
    return { ...sc.points, dot: series.values.map((v) => (Number.isFinite(v) ? y(v) : NaN)) };
  };
  return (
    <ChartFrame label={label} height={height} heightMd={heightMd} k={lensOn ? current : undefined}
      lens={lensOn ? <Lens label={lensLabel ?? 'Show'} options={layers.map((l) => ({ value: l.id, label: l.label }))} defaultValue={current} chips={chips} /> : undefined}
      scrub={scrub ? <Scrubber points={followed(scrub)} initial={scrub.initial} detents={scrub.detents} label={scrub.label} axis={axis}>{plot}</Scrubber> : undefined}
      plot={scrub ? undefined : plot} axis={scrub ? undefined : axis} keys={keys} values={values}
    />
  );
}

/**
 * A bracket on the plot: a 1.5 px signal line from y0 to y1 (fractions from the top) at x, with 6 px caps turned
 * inward (left), and its label inside it, level with its middle (the sentence's span: "49 min"). At the plot's right
 * edge it is held just inside, so the stroke never clips.
 */
function Bracket({ x, y0, y1, label }: { x: number; y0: number; y1: number; label: string }) {
  const top = Math.min(y0, y1), bottom = Math.max(y0, y1);
  const at = pc(Math.min(1, Math.max(0, x)));
  return (
    <g className="viz-bracket">
      <rect className="bracket-line" x={at} y={pc(top)} width={1.5} height={pc(bottom - top)} transform="translate(-1.5 0)" />
      <rect className="bracket-line" x={at} y={pc(top)} width={7} height={1.5} transform="translate(-7 0)" />
      <rect className="bracket-line" x={at} y={pc(bottom)} width={7} height={1.5} transform="translate(-7 -1.5)" />
      <text className="viz-label is-signal" x={at} y={pc((top + bottom) / 2)} dx={-12} dy={5} textAnchor="end">{label}</text>
    </g>
  );
}
