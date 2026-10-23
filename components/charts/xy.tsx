/**
 * Forms on an x–y plane: lines (with direct end labels), histograms, columns, scatters, strips (beeswarms), small
 * multiples and ridgelines. The value axis is gridlines with their labels sitting on the left end, so the plot keeps the
 * canvas width; series are named at their ends, never in a legend.
 */
import type { ReactNode } from 'react';
import type { Axis, Band, ColumnsSpec, HistogramSpec, LinesSpec, MultiplesSpec, Ref, RidgelineSpec, ScatterSpec, StripSpec } from '@/lib/charts/spec';
import {
  Notes, T, Txt, W, XTicks, YGrid, axisTicks, fillOf, gutterFor, r1, relax, scale, strokeOf, textTone, tickText, tw, valueText, xTickLayout, type Ctx,
} from './kit';
import type { Drawn } from './rows';

const path = (pts: [number, number][]) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${r1(x)} ${r1(y)}`).join('');

/** The plot box of an x–y form: the value labels sit inside it, the x ticks (and title) under it. */
function box(height: number, x: Axis, rightGutter = 0) {
  const top = 22;
  const bottom = height - 26 - (x.title ? 20 : 0);
  return { top, bottom, left: 0, right: W - rightGutter };
}

function XTitle({ a, y }: { a: Axis; y: number }) {
  return a.title ? <Txt x={W / 2} y={y} cls="cx-tick is-quiet" anchor="middle">{a.title}</Txt> : null;
}

function Bands({ bands, xs, ys, b }: { bands?: Band[]; xs: (v: number) => number; ys: (v: number) => number; b: ReturnType<typeof box> }) {
  if (!bands?.length) return null;
  return (
    <g>
      {bands.map((band, i) => {
        if (band.axis === 'x') {
          const x0 = Math.max(b.left, xs(band.from)), x1 = Math.min(b.right, xs(band.to));
          return (
            <g key={i}>
              {/* From the top gridline down, so the band never runs into the axis title written on that line. */}
              <rect className={band.tone === 'signal' ? 'cx-band is-signal' : 'cx-band'} x={r1(x0)} y={b.top + 8} width={r1(Math.max(0, x1 - x0))} height={r1(Math.max(0, b.bottom - b.top - 8))} />
              {band.label ? <Txt x={x1 - 4} y={b.top + 24} cls={`cx-tick${band.tone === 'signal' ? ' is-signal' : ''}`} anchor="end">{band.label}</Txt> : null}
            </g>
          );
        }
        const y0 = ys(band.to), y1 = ys(band.from);
        return (
          <g key={i}>
            <rect className={band.tone === 'signal' ? 'cx-band is-signal' : 'cx-band'} x={b.left} y={r1(y0)} width={r1(b.right - b.left)} height={r1(Math.max(0, y1 - y0))} />
            {band.label ? <Txt x={b.right - 4} y={y0 + 16} cls="cx-tick" anchor="end">{band.label}</Txt> : null}
          </g>
        );
      })}
    </g>
  );
}

function Refs({ refs, xs, ys, b, ctx }: { refs?: Ref[]; xs: (v: number) => number; ys: (v: number) => number; b: ReturnType<typeof box>; ctx: Ctx }) {
  if (!refs?.length) return null;
  void ctx;
  return (
    <g>
      {refs.map((ref, i) => {
        const cls = `cx-ref ${strokeOf(ref.tone ?? 'ink2')}`;
        if (ref.axis === 'x') {
          const x = xs(ref.value);
          const anchor = x > b.right - 60 ? 'end' : x < b.left + 60 ? 'start' : 'middle';
          return (
            <g key={i}>
              {/* The line starts a few units under its label's baseline, clear of descenders. */}
              <line className={cls} x1={r1(x)} x2={r1(x)} y1={ref.label ? b.top : b.top - 4} y2={b.bottom} />
              {ref.label ? <Txt x={anchor === 'end' ? x - 4 : anchor === 'start' ? x + 4 : x} y={b.top - 8} cls={`cx-tick ${ref.tone === 'signal' ? 'is-signal' : 'is-strong'}`} anchor={anchor}>{ref.label}</Txt> : null}
            </g>
          );
        }
        const y = ys(ref.value);
        return (
          <g key={i}>
            <line className={cls} x1={b.left} x2={b.right} y1={r1(y)} y2={r1(y)} />
            {ref.label ? <Txt x={b.right} y={y - 8} cls={`cx-tick ${ref.tone === 'signal' ? 'is-signal' : 'is-strong'}`} anchor="end" halo>{ref.label}</Txt> : null}
          </g>
        );
      })}
    </g>
  );
}

export function Lines(s: LinesSpec, ctx: Ctx): Drawn {
  const height = ctx.fit ?? s.height ?? 300;
  const ends = s.series.filter((se) => (se.labelAt ?? 'end') === 'end');
  const gutter = ends.length ? Math.min(130, Math.max(...ends.map((se) => tw(se.label, T.label, 'i600'))) + 10) : 6;
  const b = box(height, s.x, gutter);
  const xs = scale(s.x.min, s.x.max, b.left + 2, b.right);
  const ys = s.y.invert ? scale(s.y.min, s.y.max, b.top + 8, b.bottom) : scale(s.y.min, s.y.max, b.bottom, b.top + 8);
  const yt = axisTicks(s.y, ctx, 4), xt = axisTicks(s.x, ctx, 5);
  const order = [...s.series].sort((a, c) => rank(a.tone) - rank(c.tone));
  const endY = relax(ends.map((se) => ys(se.points[se.points.length - 1][1])), 17, b.top, b.bottom);
  const node = (
    <g>
      <Bands bands={s.bands} xs={xs} ys={ys} b={b} />
      <YGrid a={s.y} ticks={yt} at={ys} left={b.left} right={b.right} ctx={ctx} title={s.y.title} />
      <Refs refs={s.refs} xs={xs} ys={ys} b={b} ctx={ctx} />
      {order.map((se) => {
        const pts = se.points.map(([x, y]) => [xs(x), ys(y)] as [number, number]);
        return (
          <g key={se.label}>
            {se.area ? <path className={`cx-area ${fillOf(se.tone)}`} d={`${path(pts)}L${r1(pts[pts.length - 1][0])} ${r1(b.bottom)}L${r1(pts[0][0])} ${r1(b.bottom)}Z`} /> : null}
            <path className={`cx-line ${strokeOf(se.tone)}${se.dash ? ' is-dash' : ''}`} d={path(pts)} style={se.width ? { strokeWidth: se.width } : undefined} />
            {se.dots ? pts.map(([x, y], k) => <circle key={k} className={fillOf(se.tone)} cx={r1(x)} cy={r1(y)} r={3} />) : null}
            {se.labelAt === 'start' ? <Txt x={pts[0][0] + 4} y={pts[0][1] - 8} cls={`cx-label ${textTone(se.tone)}`} halo>{se.label}</Txt> : null}
          </g>
        );
      })}
      {ends.map((se, i) => {
        const last = se.points[se.points.length - 1];
        return <Txt key={se.label} x={b.right + 6} y={endY[i] + 5} cls={`cx-label is-end ${textTone(se.tone)}`}>{se.label}</Txt>;
        void last;
      })}
      <line className="cx-axis" x1={b.left} x2={b.right} y1={b.bottom} y2={b.bottom} />
      <XTicks a={s.x} ticks={xt} at={xs} y={b.bottom} left={b.left} right={b.right} ctx={ctx} />
      <XTitle a={s.x} y={height - 4} />
      <Notes notes={s.notes} ctx={ctx} px={(n) => (n.x === undefined || n.y === undefined ? null : [xs(n.x), ys(n.y)])} />
    </g>
  );
  return { height, node };
}

const rank = (t: string) => (t === 'signal' ? 3 : t === 'ink' ? 2 : t === 'ink2' ? 1 : 0);

export function Histogram(s: HistogramSpec, ctx: Ctx): Drawn {
  const height = ctx.fit ?? s.height ?? 280;
  const yMax = Math.max(s.y.max, ...s.bins.map((bin) => bin.v));
  const yt = axisTicks({ ...s.y, max: yMax }, ctx, 3), xt = axisTicks(s.x, ctx, 5);
  const gut = gutterFor(s.y, yt, ctx);
  const b = { ...box(height, s.x), left: gut };
  const xs = scale(s.x.min, s.x.max, b.left, b.right);
  const ys = scale(s.y.min, yMax, b.bottom, b.top + 8);
  const gap = (xs(s.bins[0].x1) - xs(s.bins[0].x0)) > 5 ? 0.8 : 0;
  const node = (
    <g>
      <Bands bands={s.bands} xs={xs} ys={ys} b={b} />
      <YGrid a={s.y} ticks={yt} at={ys} left={b.left} right={b.right} ctx={ctx} title={s.y.title} gutter={gut} />
      {s.bins.map((bin, i) => {
        const x0 = xs(bin.x0) + gap / 2, x1 = xs(bin.x1) - gap / 2, y = ys(bin.v);
        return <rect key={i} className={fillOf(bin.tone)} x={r1(x0)} y={r1(y)} width={r1(Math.max(0.6, x1 - x0))} height={r1(Math.max(0, b.bottom - y))} />;
      })}
      {s.overlay ? <path className={`cx-line ${strokeOf(s.overlay.tone ?? 'ink')} is-dash`} d={path(s.overlay.points.map(([x, y]) => [xs(x), ys(y)]))} /> : null}
      <Refs refs={s.refs} xs={xs} ys={ys} b={b} ctx={ctx} />
      <line className="cx-axis" x1={b.left} x2={b.right} y1={b.bottom} y2={b.bottom} />
      <XTicks a={s.x} ticks={xt} at={xs} y={b.bottom} left={b.left} right={b.right} ctx={ctx} />
      <XTitle a={s.x} y={height - 4} />
      <Notes notes={s.notes} ctx={ctx} px={(n) => (n.x === undefined || n.y === undefined ? null : [xs(n.x), ys(n.y)])} />
    </g>
  );
  return { height, node };
}

export function Columns(s: ColumnsSpec, ctx: Ctx): Drawn {
  const height = ctx.fit ?? s.height ?? 280;
  const n = s.cols.length;
  const [y0, y1] = [Math.min(s.y.min, ...s.cols.map((c) => c.value)), Math.max(s.y.max, ...s.cols.map((c) => c.value))];
  const yt = axisTicks({ ...s.y, min: y0, max: y1 }, ctx, 3);
  const gut = gutterFor(s.y, yt, ctx);
  const b = { top: 22, bottom: height - 26, left: gut, right: W };
  const slot = (b.right - b.left) / n;
  const bw = Math.max(2, slot * (n > 24 ? 0.78 : 0.66));
  const cx = (i: number) => b.left + slot * (i + 0.5);
  const ys = scale(y0, y1, b.bottom, b.top + 10);
  const show = s.values ?? 'toned';
  const labels = xTickLayout(s.cols.map((_, i) => i), cx, (i) => s.cols[i].label, b.left, b.right);
  const zero = ys(Math.max(s.y.min, 0));
  const node = (
    <g>
      <YGrid a={s.y} ticks={yt} at={ys} left={b.left} right={b.right} ctx={ctx} title={s.y.title} gutter={gut} />
      {s.cols.map((c, i) => {
        const y = ys(c.value);
        const tone = c.tone ?? 'quiet';
        const text = valueText(c.value, s.fmt, ctx);
        // A value prints over its column only when it fits two slots, so it never sits on a neighbour's label.
        const print = (show === 'all' || (show === 'toned' && c.tone && c.tone !== 'quiet')) && tw(text, T.value, 'i600') <= slot * 2 - 4;
        return (
          <g key={`${c.label}-${i}`}>
            <rect className={fillOf(tone)} x={r1(cx(i) - bw / 2)} y={r1(Math.min(y, zero))} width={r1(bw)} height={r1(Math.max(0.8, Math.abs(zero - y)))} rx={bw > 8 ? 1.5 : 0} />
            {print ? <Txt x={cx(i)} y={c.value >= 0 ? y - 6 : y + 17} cls={`cx-value ${textTone(tone)}`} anchor="middle" halo>{text}</Txt> : null}
          </g>
        );
      })}
      {s.ref ? <Refs refs={[s.ref]} xs={cx} ys={ys} b={b as ReturnType<typeof box>} ctx={ctx} /> : null}
      <line className="cx-axis" x1={b.left} x2={b.right} y1={r1(zero)} y2={r1(zero)} />
      <g className="cx-xticks">
        {labels.map((t) => <Txt key={t.v} x={t.tx} y={b.bottom + 20} cls={`cx-tick ${s.cols[t.v].tone === 'signal' ? 'is-signal' : ''}`} anchor={t.anchor}>{t.t}</Txt>)}
      </g>
      <Notes notes={s.notes} ctx={ctx} px={(nt) => (nt.x === undefined || nt.y === undefined ? null : [cx(nt.x), ys(nt.y)])} />
    </g>
  );
  return { height, node };
}

type Box = { x0: number; y0: number; x1: number; y1: number };
const hits = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

export function Scatter(s: ScatterSpec, ctx: Ctx): Drawn {
  const height = ctx.fit ?? s.height ?? 320;
  const b = box(height, s.x);
  const xs = scale(s.x.min, s.x.max, b.left + 4, b.right - 4);
  const ys = scale(s.y.min, s.y.max, b.bottom - 4, b.top + 10);
  const yt = axisTicks(s.y, ctx, 4), xt = axisTicks(s.x, ctx, 5);
  const order = s.points.map((p, i) => ({ p, i })).sort((a, c) => rank(a.p.tone ?? 'quiet') - rank(c.p.tone ?? 'quiet'));
  // Labels: the first free spot of right, left, above, below; skipped when none is free.
  const placed: Box[] = s.points.map((p) => { const x = xs(p.x), y = ys(p.y), r = p.r ?? 3.5; return { x0: x - r, y0: y - r, x1: x + r, y1: y + r }; });
  const labels: { x: number; y: number; t: string; anchor: 'start' | 'end' | 'middle'; tone?: string }[] = [];
  for (const p of s.points.filter((q) => q.label).sort((a, c) => rank(c.tone ?? 'quiet') - rank(a.tone ?? 'quiet'))) {
    const x = xs(p.x), y = ys(p.y), w = tw(p.label!, T.tick, 'i600'), h = 14;
    const tries: [number, number, 'start' | 'end' | 'middle'][] = [[x + 7, y + 5, 'start'], [x - 7, y + 5, 'end'], [x, y - 9, 'middle'], [x, y + 19, 'middle']];
    for (const [tx, ty, anchor] of tries) {
      const x0 = anchor === 'start' ? tx : anchor === 'end' ? tx - w : tx - w / 2;
      const bb = { x0: x0 - 2, y0: ty - h + 2, x1: x0 + w + 2, y1: ty + 3 };
      if (bb.x0 < 0 || bb.x1 > W || bb.y0 < b.top - 16 || bb.y1 > b.bottom) continue;
      if (placed.some((q) => hits(q, bb))) continue;
      placed.push(bb);
      labels.push({ x: tx, y: ty, t: p.label!, anchor, tone: p.tone });
      break;
    }
  }
  const node = (
    <g>
      <YGrid a={s.y} ticks={yt} at={ys} left={b.left} right={b.right} ctx={ctx} title={s.y.title} />
      <Refs refs={s.refs} xs={xs} ys={ys} b={b} ctx={ctx} />
      {s.fit ? <line className="cx-fit" x1={r1(xs(s.fit.x0))} y1={r1(ys(s.fit.y0))} x2={r1(xs(s.fit.x1))} y2={r1(ys(s.fit.y1))} /> : null}
      {order.map(({ p, i }) => <circle key={i} className={`cx-dot ${fillOf(p.tone)}`} cx={r1(xs(p.x))} cy={r1(ys(p.y))} r={p.r ?? 3.5} />)}
      {labels.map((l) => <Txt key={l.t} x={l.x} y={l.y} cls={`cx-tick is-label ${textTone(l.tone as never)}`} anchor={l.anchor} halo>{l.t}</Txt>)}
      <line className="cx-axis" x1={b.left} x2={b.right} y1={b.bottom} y2={b.bottom} />
      <XTicks a={s.x} ticks={xt} at={xs} y={b.bottom} left={b.left} right={b.right} ctx={ctx} />
      <XTitle a={s.x} y={height - 4} />
      <Notes notes={s.notes} ctx={ctx} px={(n) => (n.x === undefined || n.y === undefined ? null : [xs(n.x), ys(n.y)])} />
    </g>
  );
  return { height, node };
}

/** Beeswarm offsets: each dot as near its row's line as it can sit without touching a placed dot. */
function swarm(xs: number[], r: number): number[] {
  const order = xs.map((x, i) => ({ x, i })).sort((a, b) => a.x - b.x);
  const placed: { x: number; y: number }[] = [];
  const out = new Array<number>(xs.length).fill(0);
  const d = 2 * r + 0.6;
  for (const { x, i } of order) {
    const near = placed.filter((p) => Math.abs(p.x - x) < d);
    let y = 0;
    for (let k = 0; k < 400; k++) {
      const cand = k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (r * 0.5);
      if (near.every((p) => (p.x - x) ** 2 + (p.y - cand) ** 2 >= d * d)) { y = cand; break; }
    }
    placed.push({ x, y });
    out[i] = y;
  }
  return out;
}

export function Strip(s: StripSpec, ctx: Ctx): Drawn {
  const many = s.groups.length > 1;
  const xt = axisTicks(s.x, ctx, 5);
  const titleH = s.x.title ? 20 : 0;
  // Labelled dots are named over the swarm, each on its own line, with a leader down to its dot.
  const labelled = s.groups.flatMap((g, gi) => g.dots.map((d, k) => ({ d, gi, k })).filter((x) => x.d.label));
  const labelRows = many ? 0 : labelled.length;
  const head = labelRows * 18 + (labelRows ? 6 : 0);
  // The dot radius shrinks (to 2.5) until every swarm fits the frame.
  const avail = (ctx.fit ?? s.height ?? 300) - 28 - titleH - head - 8;
  let r = s.r ?? 4.5, rows: { g: StripSpec['groups'][number]; offs: number[]; lo: number; hi: number }[] = [];
  const layout = () => {
    const xs = scale(s.x.min, s.x.max, r + 2, W - r - 2);
    rows = s.groups.map((g) => {
      const offs = swarm(g.dots.map((d) => xs(d.v)), r);
      return { g, offs, lo: Math.min(0, ...offs) - r, hi: Math.max(0, ...offs) + r };
    });
    return rows.reduce((h, row) => h + (many ? 20 : 0) + (row.hi - row.lo) + 12, 0);
  };
  let need = layout();
  while (need > avail && r > 2.5) { r = Math.max(2.5, r - 0.25); need = layout(); }
  const xs = scale(s.x.min, s.x.max, r + 2, W - r - 2);
  // In a fixed frame a single swarm sits midway between its labels and the axis (the leaders grow to reach it).
  const spare = ctx.fit && !many ? Math.max(0, ctx.fit - 28 - titleH - (4 + head) - need) : 0;
  // A note set above the first swarm needs room over it, which a page (no spare height) does not otherwise give.
  const lo0 = rows[0]?.lo ?? 0;
  const lift = Math.max(0, ...(s.notes ?? []).filter((n) => (n.row ?? 0) === 0 && (n.dy ?? -10) < 0)
    .map((n) => 0.75 * T.note + 2 - (n.dy ?? -10) + lo0 - 4 - head));
  let y = 4 + head + Math.max(lift, spare / 2);
  const laid = rows.map((row) => {
    const top = y;
    const centre = y + (many ? 20 : 0) - row.lo + 2;
    y += (many ? 20 : 0) + (row.hi - row.lo) + 12;
    return { ...row, centre, top };
  });
  const bottom = Math.max(y, ctx.fit ? ctx.fit - 28 - titleH : 0);
  const height = bottom + 28 + titleH;
  // Label lines over the swarm, in the order of their dots from left to right.
  const named = [...labelled].sort((a, b) => a.d.v - b.d.v);
  const node = (
    <g>
      {xt.map((v) => <line key={v} className="cx-grid" x1={r1(xs(v))} x2={r1(xs(v))} y1={head} y2={bottom} />)}
      <Refs refs={s.refs} xs={xs} ys={() => 0} b={{ top: head + 12 + (!head && s.refs?.some((rf) => rf.label) ? 10 : 0), bottom, left: 0, right: W }} ctx={ctx} />
      {laid.map(({ g, offs, centre, top }) => (
        <g key={g.label}>
          {/* A ref line passes behind the group heading, which knocks it out. */}
          {many ? <Txt x={0} y={top + 14} cls="cx-label is-strong" halo={!!s.refs?.length}>{g.label}</Txt> : null}
          {g.dots.map((d, k) => ({ d, k })).sort((a, c) => rank(a.d.tone ?? 'quiet') - rank(c.d.tone ?? 'quiet')).map(({ d, k }) => (
            <circle key={k} className={`cx-dot ${fillOf(d.tone)}`} cx={r1(xs(d.v))} cy={r1(centre + offs[k])} r={r1(r)} />
          ))}
          {many ? g.dots.map((d, k) => (d.label ? (
            <Txt key={`l${k}`} x={xs(d.v)} y={centre + offs[k] - r - 6} cls={`cx-tick is-label ${textTone(d.tone)}`} anchor={xs(d.v) < 50 ? 'start' : xs(d.v) > W - 50 ? 'end' : 'middle'} halo>{d.label}</Txt>
          ) : null)) : null}
        </g>
      ))}
      {!many ? named.map(({ d, gi, k }, i) => {
        const x = xs(d.v), ly = 14 + i * 18, dotY = laid[gi].centre + laid[gi].offs[k];
        const anchor = x < 70 ? 'start' : x > W - 70 ? 'end' : 'middle';
        return (
          <g key={`n${i}`}>
            <line className={`cx-leader${d.tone === 'signal' ? ' is-signal' : ''}`} x1={r1(x)} x2={r1(x)} y1={r1(ly + 4)} y2={r1(dotY - r - 1)} />
            <Txt x={anchor === 'start' ? x - 2 : anchor === 'end' ? x + 2 : x} y={ly} cls={`cx-tick is-label ${textTone(d.tone)}`} anchor={anchor} halo>{d.label}</Txt>
          </g>
        );
      }) : null}
      <line className="cx-axis" x1={0} x2={W} y1={bottom} y2={bottom} />
      <XTicks a={s.x} ticks={xt} at={xs} y={bottom} left={0} right={W} ctx={ctx} />
      <XTitle a={s.x} y={height - 4} />
      <Notes notes={s.notes} ctx={ctx} px={(n) => (n.x === undefined ? null : [xs(n.x), laid[n.row ?? 0]?.centre ?? 0])} />
    </g>
  );
  return { height, node };
}

export function Multiples(s: MultiplesSpec, ctx: Ctx): Drawn {
  const cols = s.cols;
  const gx = 12, gy = 14;
  const pw = (W - gx * (cols - 1)) / cols;
  const head = 20;
  const rowsN = Math.ceil(s.panels.length / cols);
  const ph = ctx.fit ? Math.max(34, Math.floor((ctx.fit - 26) / rowsN) - head - gy) : s.height ?? 62;
  const cell = head + ph + gy;
  const xt = axisTicks(s.x, ctx, 2);
  const yt = axisTicks(s.y, ctx, 2);
  const height = rowsN * cell + 26;
  const node = (
    <g>
      {s.panels.map((p, i) => {
        const c = i % cols, rw = Math.floor(i / cols);
        const x0 = c * (pw + gx), y0 = rw * cell + head;
        const xs = scale(s.x.min, s.x.max, x0, x0 + pw);
        const ys = s.y.invert ? scale(s.y.min, s.y.max, y0, y0 + ph) : scale(s.y.min, s.y.max, y0 + ph, y0);
        const lit = p.tone === 'signal';
        return (
          <g key={p.label}>
            <Txt x={x0} y={y0 - 6} cls={`cx-label is-panel ${textTone(p.tone)}`}>{p.label}</Txt>
            {yt.map((v) => <line key={v} className={Math.abs(v) < 1e-12 ? 'cx-zero' : 'cx-grid'} x1={r1(x0)} x2={r1(x0 + pw)} y1={r1(ys(v))} y2={r1(ys(v))} />)}
            {s.refs?.filter((rf) => rf.axis === 'y').map((rf, k) => <line key={k} className="cx-ref ts-ink2" x1={r1(x0)} x2={r1(x0 + pw)} y1={r1(ys(rf.value))} y2={r1(ys(rf.value))} />)}
            {[...p.series].sort((a, b) => rank(a.tone) - rank(b.tone)).map((se, k) => (
              <path key={k} className={`cx-line is-thin ${strokeOf(lit && se.tone !== 'quiet' ? 'signal' : se.tone)}${se.dash ? ' is-dash' : ''}`} d={path(se.points.map(([x, y]) => [xs(x), ys(y)]))} />
            ))}
            {rw === rowsN - 1 || i + cols >= s.panels.length ? xt.filter((_, k) => k === 0 || k === xt.length - 1).map((v, k) => (
              <Txt key={v} x={xs(v)} y={y0 + ph + 17} cls="cx-tick" anchor={k === 0 ? 'start' : 'end'}>{tickText(s.x, v, ctx)}</Txt>
            )) : null}
          </g>
        );
      })}
      {yt.length ? <Txt x={W} y={height - 4} cls="cx-tick is-quiet" anchor="end">{s.y.title ?? ''}</Txt> : null}
    </g>
  );
  return { height, node };
}

export function Ridgeline(s: RidgelineSpec, ctx: Ctx): Drawn {
  const n = s.rows.length;
  const over = s.overlap ?? 1.6;
  const natural = n <= 6 ? 40 : n <= 10 ? 30 : 22;
  const rh = ctx.fit ? Math.max(16, Math.min(natural * 1.4, (ctx.fit - 40 - (s.x.title ? 20 : 0)) / (n - 1 + over))) : natural;
  const lw = Math.min(110, Math.max(...s.rows.map((r) => tw(r.label, T.label))) + 10);
  const top = rh * over + 4;
  const xs = scale(s.x.min, s.x.max, lw, W);
  const peak = Math.max(...s.rows.flatMap((r) => r.points.map((p) => p[1])));
  const bottom = top + (n - 1) * rh + 6;
  const xt = axisTicks(s.x, ctx, 4);
  const height = bottom + 28 + (s.x.title ? 20 : 0);
  const node = (
    <g>
      {xt.map((v) => <line key={v} className="cx-grid" x1={r1(xs(v))} x2={r1(xs(v))} y1={8} y2={bottom} />)}
      {s.rows.map((r, i) => {
        const base = top + i * rh;
        const pts = r.points.map(([x, y]) => [xs(x), base - (y / peak) * rh * over] as [number, number]);
        const d = `${path(pts)}L${r1(pts[pts.length - 1][0])} ${r1(base)}L${r1(pts[0][0])} ${r1(base)}Z`;
        const lit = r.tone === 'signal';
        return (
          <g key={r.label}>
            <path className={`cx-ridge${lit ? ' is-signal' : ''}`} d={d} />
            <path className={`cx-line is-thin ${lit ? 'ts-signal' : strokeOf(r.tone ?? 'ink2')}`} d={path(pts)} />
            <Txt x={0} y={base - 3} cls={`cx-label ${textTone(r.tone)}`}>{r.label}</Txt>
          </g>
        );
      })}
      <Refs refs={s.refs} xs={xs} ys={() => 0} b={{ top: 8, bottom, left: lw, right: W }} ctx={ctx} />
      <line className="cx-axis" x1={lw} x2={W} y1={bottom} y2={bottom} />
      <XTicks a={s.x} ticks={xt} at={xs} y={bottom} left={lw} right={W} ctx={ctx} />
      <XTitle a={s.x} y={height - 4} />
      <Notes notes={s.notes} ctx={ctx} px={(nt) => (nt.x === undefined ? null : [xs(nt.x), top + (nt.row ?? 0) * rh - rh])} />
    </g>
  );
  return { height, node };
}
