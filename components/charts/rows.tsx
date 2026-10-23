/**
 * Row forms of the Top 100 charts: ranked bars, dumbbells (a gap or a change), ranges, slopes, pyramids and 100%
 * stacked bars. Each returns its height and its marks on the 340-unit canvas (components/charts/kit.tsx).
 */
import type { ReactNode } from 'react';
import type { BarsSpec, DumbbellSpec, KeyItem, PyramidSpec, RangeSpec, SlopeSpec, StackedSpec, Tone } from '@/lib/charts/spec';
import {
  T, Txt, W, XTicks, axisTicks, clamp, fillOf, keyLayout, r1, relax, scale, strokeOf, textTone, tw, valueText, Notes, type Ctx,
} from './kit';

export type Drawn = { height: number; node: ReactNode };

const rowHeight = (n: number) => (n <= 6 ? 34 : n <= 10 ? 30 : n <= 14 ? 25 : 21);
/** A row height that fills a fixed frame (the card) when one is set: from 18 units up to a third over the natural one. */
const fitRows = (n: number, chrome: number, ctx: Ctx, min = 18) => (ctx.fit ? clamp(Math.floor((ctx.fit - chrome) / n), min, rowHeight(n) * 1.3) : rowHeight(n));
/** A domain that holds every value, so no mark runs off its track. */
const span = (lo: number, hi: number, values: number[]): [number, number] => [Math.min(lo, ...values), Math.max(hi, ...values)];
const labelGutter = (labels: string[], cap = 160) => Math.min(cap, Math.max(...labels.map((l) => tw(l, T.label))) + 12);

/** Light fills take night text inside them; dark fills take ink. */
const LIGHT: Tone[] = ['signal', 'ink', 'ink2', 'o3', 'o4'];
const insideText = (t: Tone) => (LIGHT.includes(t) ? 'cx-inside is-dark' : 'cx-inside');

export function Bars(s: BarsSpec, ctx: Ctx): Drawn {
  const n = s.rows.length;
  const top = s.ref?.label ? 24 : 4;
  const rh = fitRows(n, top + 6, ctx);
  const bar = Math.round(rh * 0.56);
  const lw = labelGutter(s.rows.map((r) => r.label));
  const texts = s.rows.map((r) => valueText(r.value, s.fmt, ctx));
  const vw = Math.max(...texts.map((t) => tw(t, T.value, 'i600'))) + 8;
  const [min, max] = span(Math.min(s.x.min, 0), s.x.max, s.rows.map((r) => r.value).concat(s.ref ? [s.ref.value] : []));
  const left = lw + (s.rows.some((r) => r.value < 0) ? vw : 0);
  const x = scale(min, max, left, W - vw);
  const zero = x(Math.max(min, 0));
  const height = top + n * rh + 6;
  const cyOf = (i: number) => top + i * rh + rh / 2;
  // The ref runs over the bars but behind the value text, which knocks it out with a halo of the card.
  const node = (
    <g>
      {s.rows.map((r, i) => {
        const cy = cyOf(i);
        const tone = r.tone ?? 'quiet';
        const xv = x(r.value);
        return (
          <g key={r.label} className={tone === 'signal' ? 'is-lit' : undefined}>
            <Txt x={0} y={cy + 5} cls={`cx-label ${textTone(tone)}`}>{r.label}</Txt>
            <rect className={fillOf(tone)} x={r1(Math.min(zero, xv))} y={r1(cy - bar / 2)} width={r1(Math.max(1, Math.abs(xv - zero)))} height={bar} rx={1.5} />
          </g>
        );
      })}
      <line className="cx-axis" x1={r1(zero)} x2={r1(zero)} y1={top - 2} y2={height - 4} />
      {s.ref ? (
        <g>
          <line className={`cx-ref ${strokeOf(s.ref.tone ?? 'ink')}`} x1={r1(x(s.ref.value))} x2={r1(x(s.ref.value))} y1={top - 6} y2={height - 4} />
          {s.ref.label ? <Txt x={x(s.ref.value)} y={top - 10} cls="cx-tick is-strong" anchor={x(s.ref.value) > W * 0.7 ? 'end' : 'middle'}>{s.ref.label}</Txt> : null}
        </g>
      ) : null}
      <g className="cx-values">
        {s.rows.map((r, i) => {
          const xv = x(r.value);
          const neg = r.value < 0;
          return <Txt key={r.label} x={neg ? xv - 6 : xv + 6} y={cyOf(i) + 5} cls={`cx-value ${textTone(r.tone ?? 'quiet')}`} anchor={neg ? 'end' : 'start'} halo>{texts[i]}</Txt>;
        })}
      </g>
      <Notes notes={s.notes} ctx={ctx} px={(nt) => (nt.row === undefined ? null : [x(nt.x ?? 0), top + nt.row * rh + rh / 2])} />
    </g>
  );
  return { height, node };
}

export function Dumbbell(s: DumbbellSpec, ctx: Ctx): Drawn {
  const n = s.rows.length;
  const lw = labelGutter(s.rows.map((r) => r.label), 130);
  const gaps = s.gap ? s.rows.map((r) => valueText(r.b - r.a, s.gap!, ctx)) : [];
  const gw = s.gap ? Math.max(...gaps.map((g) => tw(g, T.value, 'i600'))) + 10 : 8;
  const [x0, x1] = span(s.x.min, s.x.max, s.rows.flatMap((r) => [r.a, r.b]).concat(s.ref ? [s.ref.value] : []));
  const x = scale(x0, x1, lw + 8, W - gw - 8);
  // The spec's own key when it has one; else the two marks are named over the first row when they sit apart, or in a
  // key whose b mark is the one the rows draw (an arrowhead for a change, a dot for a gap).
  const r0 = s.rows[0];
  const aw = tw(s.a, T.tick), bw = tw(s.b, T.tick);
  const own = !!s.key?.length;
  const apart = !own && Math.abs(x(r0.a) - x(r0.b)) > (aw + bw) / 2 + 10;
  const fallback: KeyItem[] = [{ label: s.a, tone: 'quiet', mark: 'ring' }, s.arrow ? { label: s.b, tone: 'ink2', mark: 'arrow' } : { label: s.b, tone: 'ink', mark: 'dot' }];
  const key = apart ? { node: null, height: 0 } : keyLayout(own ? s.key : fallback, 14);
  // A ref's label takes its own line over the plot, under the key and over the mark names, so it never meets them.
  const refLabel = !!s.ref?.label;
  const refY = key.height + 14;
  const head = key.height + (refLabel ? 20 : 0);
  const top = apart ? head + 24 : head + 4;
  const titleH = s.x.title ? 20 : 0;
  const rh = fitRows(n, top + 30 + titleH, ctx, 20);
  const plotH = n * rh;
  const ticks = axisTicks({ ...s.x, min: x0, max: x1 }, ctx, 4);
  const height = top + plotH + 30 + titleH;
  const xr = s.ref ? x(s.ref.value) : 0;
  const node = (
    <g>
      {key.node}
      {ticks.map((v) => <line key={v} className="cx-grid" x1={r1(x(v))} x2={r1(x(v))} y1={top} y2={top + plotH} />)}
      {s.ref ? (
        <g>
          <line className={`cx-ref ${strokeOf(s.ref.tone ?? 'ink')}`} x1={r1(xr)} x2={r1(xr)} y1={refLabel ? refY + 8 : top - 4} y2={top + plotH} />
          {refLabel ? <Txt x={xr} y={refY} cls={`cx-tick ${s.ref.tone === 'signal' ? 'is-signal' : 'is-strong'}`} anchor={xr > W * 0.7 ? 'end' : xr < W * 0.3 ? 'start' : 'middle'}>{s.ref.label}</Txt> : null}
        </g>
      ) : null}
      {apart ? (
        <g>
          <Txt x={x(r0.a)} y={top - 8} cls="cx-tick" anchor="middle" halo={!!s.ref}>{s.a}</Txt>
          <Txt x={x(r0.b)} y={top - 8} cls="cx-tick is-strong" anchor="middle" halo={!!s.ref}>{s.b}</Txt>
        </g>
      ) : null}
      {s.rows.map((r, i) => {
        const cy = top + i * rh + rh / 2;
        const lit = r.tone === 'signal';
        const xa = x(r.a), xb = x(r.b);
        const dir = Math.sign(xb - xa) || 1;
        return (
          <g key={r.label}>
            <Txt x={0} y={cy + 5} cls={`cx-label ${textTone(r.tone)}`}>{r.label}</Txt>
            {s.arrow ? (
              <g>
                <line className={`cx-stem ${lit ? 'ts-signal' : 'ts-ink2'}`} x1={r1(xa)} x2={r1(xb - dir * 6)} y1={r1(cy)} y2={r1(cy)} />
                <path className={lit ? 'tf-signal' : 'tf-ink2'} d={`M${r1(xb)} ${r1(cy)}L${r1(xb - dir * 8)} ${r1(cy - 5)}L${r1(xb - dir * 8)} ${r1(cy + 5)}Z`} />
                <circle className="cx-ring ts-quiet" cx={r1(xa)} cy={r1(cy)} r={4} />
              </g>
            ) : (
              <g>
                <line className={`cx-stem ${lit ? 'ts-signal' : 'ts-quiet'}`} x1={r1(xa)} x2={r1(xb)} y1={r1(cy)} y2={r1(cy)} />
                <circle className="cx-ring ts-quiet" cx={r1(xa)} cy={r1(cy)} r={5} />
                <circle className={lit ? 'tf-signal' : 'tf-ink'} cx={r1(xb)} cy={r1(cy)} r={5.5} />
              </g>
            )}
            {s.gap ? <Txt x={W} y={cy + 5} cls={`cx-value ${textTone(r.tone)}`} anchor="end">{gaps[i]}</Txt> : null}
          </g>
        );
      })}
      <line className="cx-axis" x1={lw + 8} x2={W - gw - 8} y1={top + plotH} y2={top + plotH} />
      <XTicks a={s.x} ticks={ticks} at={x} y={top + plotH} left={lw} right={W - gw} ctx={ctx} />
      {s.x.title ? <Txt x={(lw + 8 + W - gw - 8) / 2} y={height - 4} cls="cx-tick is-quiet" anchor="middle">{s.x.title}</Txt> : null}
      <Notes notes={s.notes} ctx={ctx} px={(nt) => (nt.row === undefined ? null : [x(nt.x ?? 0), top + nt.row * rh + rh / 2])} />
    </g>
  );
  return { height, node };
}

export function Range(s: RangeSpec, ctx: Ctx): Drawn {
  const n = s.rows.length;
  const lw = labelGutter(s.rows.map((r) => r.label), 120);
  const [x0, x1] = span(s.x.min, s.x.max, s.rows.flatMap((r) => [r.lo, r.hi]));
  const x = scale(x0, x1, lw + 8, W - 8);
  const r0 = s.rows[0];
  // The box is named on its own line over the end and middle names, centred on the first row's box. That line costs
  // 12 units at the top (its text box stays inside the canvas) and takes 6 from the axis margin (the tick text ends 20
  // under the axis), so in a fixed frame the rows keep nearly all their height and notes set between rows still fit.
  const boxed = !!s.legend.box && r0.q1 !== undefined && r0.q3 !== undefined;
  const top = boxed ? 38 : 26, bottom = boxed ? 24 : 30;
  const rh = fitRows(n, top + bottom, ctx, 20);
  const plotH = n * rh;
  const ticks = axisTicks({ ...s.x, min: x0, max: x1 }, ctx, 4);
  const height = top + plotH + bottom;
  const boxW = boxed ? tw(s.legend.box!, T.tick) : 0;
  const boxX = boxed ? clamp(x((r0.q1! + r0.q3!) / 2), boxW / 2, W - boxW / 2) : 0;
  const node = (
    <g>
      {ticks.map((v) => <line key={v} className="cx-grid" x1={r1(x(v))} x2={r1(x(v))} y1={top} y2={top + plotH} />)}
      {boxed ? <Txt x={boxX} y={top - 24} cls="cx-tick" anchor="middle">{s.legend.box}</Txt> : null}
      <Txt x={x(r0.lo)} y={top - 8} cls="cx-tick" anchor="middle">{s.legend.lo}</Txt>
      <Txt x={x(r0.mid)} y={top - 8} cls="cx-tick is-strong" anchor="middle">{s.legend.mid}</Txt>
      <Txt x={x(r0.hi)} y={top - 8} cls="cx-tick" anchor="middle">{s.legend.hi}</Txt>
      {s.rows.map((r, i) => {
        const cy = top + i * rh + rh / 2;
        const lit = r.tone === 'signal';
        // An ink row's box and dot read in ink (the box in the comparator's softer light), a signal row's in signal.
        const ink = r.tone === 'ink';
        const boxedRow = r.q1 !== undefined && r.q3 !== undefined;
        return (
          <g key={r.label}>
            <Txt x={0} y={cy + 5} cls={`cx-label ${textTone(r.tone)}`}>{r.label}</Txt>
            <line className={`cx-stem ${lit ? 'ts-signal' : 'ts-quiet'}`} x1={r1(x(r.lo))} x2={r1(x(r.hi))} y1={r1(cy)} y2={r1(cy)} />
            {r.q1 !== undefined && r.q3 !== undefined
              ? <rect className={lit ? 'tf-signal is-soft' : ink ? 'tf-ink' : 'tf-o2'} x={r1(x(r.q1))} y={r1(cy - 5)} width={r1(Math.max(1, x(r.q3) - x(r.q1)))} height={10} rx={2} /> : null}
            <line className="cx-tickmark" x1={r1(x(r.lo))} x2={r1(x(r.lo))} y1={r1(cy - 5)} y2={r1(cy + 5)} />
            <line className="cx-tickmark" x1={r1(x(r.hi))} x2={r1(x(r.hi))} y1={r1(cy - 5)} y2={r1(cy + 5)} />
            <circle className={`${lit ? 'tf-signal' : 'tf-ink'}${ink && boxedRow ? ' cx-mid' : ''}`} cx={r1(x(r.mid))} cy={r1(cy)} r={5.5} />
          </g>
        );
      })}
      <line className="cx-axis" x1={lw + 8} x2={W - 8} y1={top + plotH} y2={top + plotH} />
      <XTicks a={s.x} ticks={ticks} at={x} y={top + plotH} left={lw} right={W} ctx={ctx} />
      <Notes notes={s.notes} ctx={ctx} px={(nt) => (nt.row === undefined ? null : [x(nt.x ?? 0), top + nt.row * rh + rh / 2])} />
    </g>
  );
  return { height, node };
}

export function Slope(s: SlopeSpec, ctx: Ctx): Drawn {
  const height = ctx.fit ?? s.height ?? 330;
  const top = 30, bottom = height - 12;
  const vals = s.rows.flatMap((r) => [r.a, r.b]);
  const lo = s.y?.min ?? Math.min(...vals), hi = s.y?.max ?? Math.max(...vals);
  const y = scale(lo, hi, bottom, top + 8);
  const many = s.rows.length > 6;
  const leftTexts = s.rows.map((r) => `${r.label}  ${valueText(r.a, s.fmt, ctx)}`);
  const rightTexts = s.rows.map((r) => (many ? valueText(r.b, s.fmt, ctx) : `${valueText(r.b, s.fmt, ctx)}  ${r.label}`));
  const lw = Math.max(...leftTexts.map((t) => tw(t, T.label))) + 12;
  const rw = Math.max(...rightTexts.map((t) => tw(t, T.label))) + 12;
  const xa = Math.min(lw, 150), xb = W - Math.min(rw, 150);
  const ly = relax(s.rows.map((r) => y(r.a)), 17, top + 8, bottom);
  const ry = relax(s.rows.map((r) => y(r.b)), 17, top + 8, bottom);
  const order = s.rows.map((_, i) => i).sort((i, j) => (s.rows[i].tone === 'signal' ? 1 : 0) - (s.rows[j].tone === 'signal' ? 1 : 0));
  const node = (
    <g>
      <line className="cx-axis" x1={xa} x2={xa} y1={top} y2={bottom + 4} />
      <line className="cx-axis" x1={xb} x2={xb} y1={top} y2={bottom + 4} />
      <Txt x={xa} y={top - 12} cls="cx-head" anchor="middle">{s.left}</Txt>
      <Txt x={xb} y={top - 12} cls="cx-head" anchor="middle">{s.right}</Txt>
      {order.map((i) => {
        const r = s.rows[i];
        const tone = r.tone ?? 'quiet';
        return (
          <g key={r.label}>
            <line className={`cx-slope ${strokeOf(tone)}`} x1={xa} x2={xb} y1={r1(y(r.a))} y2={r1(y(r.b))} />
            <circle className={fillOf(tone)} cx={xa} cy={r1(y(r.a))} r={4} />
            <circle className={fillOf(tone)} cx={xb} cy={r1(y(r.b))} r={4} />
            <Txt x={xa - 9} y={ly[i] + 5} cls={`cx-label ${textTone(tone)}`} anchor="end">{leftTexts[i]}</Txt>
            <Txt x={xb + 9} y={ry[i] + 5} cls={`cx-label ${textTone(tone)}`}>{rightTexts[i]}</Txt>
          </g>
        );
      })}
    </g>
  );
  return { height, node };
}

export function Pyramid(s: PyramidSpec, ctx: Ctx): Drawn {
  const n = s.rows.length;
  const rh = fitRows(n, 32, ctx);
  const bar = Math.round(rh * 0.62);
  const cw = Math.max(...s.rows.map((r) => tw(r.label, T.label))) + 18;
  const texts = s.rows.map((r) => [valueText(r.left, s.fmt, ctx), valueText(r.right, s.fmt, ctx)]);
  const vw = Math.max(...texts.flat().map((t) => tw(t, T.value, 'i600'))) + 6;
  const half = (W - cw) / 2 - vw;
  const cx = W / 2;
  const len = (v: number) => (v / s.max) * half;
  const top = 26;
  const height = top + n * rh + 6;
  const node = (
    <g>
      <Txt x={cx - cw / 2 - 4} y={14} cls="cx-head" anchor="end">{s.left}</Txt>
      <Txt x={cx + cw / 2 + 4} y={14} cls="cx-head">{s.right}</Txt>
      {s.rows.map((r, i) => {
        const cy = top + i * rh + rh / 2;
        const lit = r.tone === 'signal';
        // Each side takes its own tone when given, else the row's: a signal row lights both, any other reads quiet | ink2.
        const lt: Tone = r.toneLeft ?? (lit ? 'signal' : 'quiet'), rt: Tone = r.toneRight ?? (lit ? 'signal' : 'ink2');
        const ll = len(r.left), rl = len(r.right);
        return (
          <g key={r.label}>
            <rect className={fillOf(lt)} x={r1(cx - cw / 2 - ll)} y={r1(cy - bar / 2)} width={r1(Math.max(1, ll))} height={bar} rx={1.5} />
            <rect className={fillOf(rt)} x={r1(cx + cw / 2)} y={r1(cy - bar / 2)} width={r1(Math.max(1, rl))} height={bar} rx={1.5} />
            <Txt x={cx} y={cy + 5} cls={`cx-label ${textTone(r.tone)}`} anchor="middle">{r.label}</Txt>
            <Txt x={cx - cw / 2 - ll - 5} y={cy + 5} cls={`cx-value ${lt === 'signal' ? 'is-signal' : ''}`} anchor="end">{texts[i][0]}</Txt>
            <Txt x={cx + cw / 2 + rl + 5} y={cy + 5} cls={`cx-value ${rt === 'signal' ? 'is-signal' : ''}`}>{texts[i][1]}</Txt>
          </g>
        );
      })}
    </g>
  );
  return { height, node };
}

export function Stacked(s: StackedSpec, ctx: Ctx): Drawn {
  const key = keyLayout(s.parts.map((p) => ({ label: p.label, tone: p.tone, mark: 'square' as const })), 14);
  const top = key.height + 2;
  const rowH = ctx.fit ? clamp(Math.floor((ctx.fit - top) / s.rows.length), 46, 66) : 58;
  // The row label sits over its bar; the bar keeps the rest of the row (less a 6-unit gap), so its value text fits inside.
  const barH = rowH - 28;
  const height = top + s.rows.length * rowH;
  const node = (
    <g>
      {key.node}
      {s.rows.map((r, i) => {
        const y0 = top + i * rowH;
        let at = 0;
        return (
          <g key={r.label}>
            <Txt x={0} y={y0 + 16} cls={`cx-label ${textTone(r.tone)}`}>{r.label}</Txt>
            {r.parts.map((p, k) => {
              const x0 = at * W, w = p * W;
              at += p;
              const tone = s.parts[k].tone;
              const t = valueText(p, s.fmt, ctx);
              const fits = s.parts[k].values !== false && tw(t, T.value, 'i600') + 8 <= w;
              return (
                <g key={k}>
                  <rect className={fillOf(tone)} x={r1(x0)} y={y0 + 22} width={r1(Math.max(0, w - 1.5))} height={barH} />
                  {fits ? <Txt x={x0 + 5} y={y0 + 22 + barH / 2 + 5} cls={insideText(tone)}>{t}</Txt> : null}
                </g>
              );
            })}
          </g>
        );
      })}
      <Notes notes={s.notes} ctx={ctx} px={(nt) => (nt.row === undefined ? null : [(nt.x ?? 0) * W, top + nt.row * rowH + 22 + barH / 2])} />
    </g>
  );
  return { height, node };
}
