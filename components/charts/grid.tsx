/**
 * Grid and figure forms of the Top 100 charts: heatmaps (a one-hue ramp of the ink, the reading ringed in signal),
 * waffles (100 squares), big figures with a comparison, and two-column flows.
 */
import type { BigSpec, FlowSpec, HeatmapSpec, WaffleSpec } from '@/lib/charts/spec';
import { fmt } from '@/lib/charts/fmt';
import { T, Txt, W, fillOf, r1, textTone, tw, valueText, wrap, type Ctx } from './kit';
import type { Drawn } from './rows';

export function Heatmap(s: HeatmapSpec, ctx: Ctx): Drawn {
  const nr = s.rows.length, nc = s.cols.length;
  const lw = Math.min(120, Math.max(...s.rows.map((l) => tw(l, T.label))) + 10);
  const colTitle = s.colTitle ? 22 : 0;
  const head = colTitle + 22;
  const cw = (W - lw) / nc;
  const ch = ctx.fit ? Math.max(22, Math.min(48, (ctx.fit - head - (s.rowTitle ? 22 : 6)) / nr)) : Math.max(24, Math.min(40, cw * 0.8));
  const [d0, d1] = s.domain;
  const level = (v: number) => Math.max(0, Math.min(1, (v - d0) / (d1 - d0 || 1)));
  const lit = new Set((s.highlight ?? []).map(([a, b]) => `${a}:${b}`));
  const showValues = s.values ?? cw >= 34;
  const height = head + nr * ch + (s.rowTitle ? 22 : 6);
  const node = (
    <g>
      {s.colTitle ? <Txt x={lw + (W - lw) / 2} y={14} cls="cx-tick is-quiet" anchor="middle">{s.colTitle}</Txt> : null}
      {s.cols.map((c, j) => <Txt key={c} x={lw + cw * (j + 0.5)} y={head - 7} cls="cx-tick" anchor="middle">{c}</Txt>)}
      {s.rows.map((rl, i) => (
        <g key={rl}>
          <Txt x={0} y={head + ch * (i + 0.5) + 5} cls="cx-label">{rl}</Txt>
          {s.cells[i].map((v, j) => {
            const x = lw + cw * j, y = head + ch * i;
            if (v === null) return <rect key={j} className="cx-cell is-empty" x={r1(x + 1)} y={r1(y + 1)} width={r1(cw - 2)} height={r1(ch - 2)} />;
            const l = level(v);
            const on = lit.has(`${i}:${j}`);
            return (
              <g key={j}>
                <rect className="cx-cell" x={r1(x + 1)} y={r1(y + 1)} width={r1(cw - 2)} height={r1(ch - 2)} style={{ fillOpacity: r1(0.07 + l * 0.86) }} />
                {on ? <rect className="cx-cell-ring" x={r1(x + 2)} y={r1(y + 2)} width={r1(cw - 4)} height={r1(ch - 4)} /> : null}
                {showValues ? <Txt x={x + cw / 2} y={y + ch / 2 + 5} cls={`cx-inside${l > 0.5 ? ' is-dark' : ''}${on ? ' is-on' : ''}`} anchor="middle">{fmt(v, s.fmt, ctx.units)}</Txt> : null}
              </g>
            );
          })}
        </g>
      ))}
      {s.rowTitle ? <Txt x={0} y={height - 4} cls="cx-tick is-quiet">{s.rowTitle}</Txt> : null}
    </g>
  );
  return { height, node };
}

export function Waffle(s: WaffleSpec, ctx: Ctx): Drawn {
  const items = [...s.parts.map((p) => ({ label: p.label, share: p.share, tone: p.tone as string })), ...(s.rest ? [{ label: s.rest, share: 1 - s.parts.reduce((a, p) => a + p.share, 0), tone: 'faint' }] : [])];
  // The grid takes the frame's height (or 230 units) and the legend the width left beside it, 120 units at least.
  const target = Math.min(230, (ctx.fit ?? 230) - 4);
  const gapR = 0.18;
  const size = target / (10 + 9 * gapR);
  const gap = size * gapR;
  const grid = 10 * size + 9 * gap;
  const counts = s.parts.map((p) => Math.round(p.share * 100));
  const tones: string[] = [];
  s.parts.forEach((p, k) => { for (let c = 0; c < counts[k]; c++) tones.push(p.tone); });
  const legendX = grid + 18;
  const lw = W - legendX;
  let ly = 4;
  const legend = items.map((it) => {
    const lines = wrap(it.label, lw, T.label);
    const at = ly;
    ly += 34 + lines.length * 19 + 14;
    return { ...it, lines, at };
  });
  const height = Math.max(grid, ly) + 4;
  const node = (
    <g>
      {Array.from({ length: 100 }, (_, k) => {
        const row = Math.floor(k / 10), col = k % 10;
        const tone = tones[k] ?? 'faint';
        return <rect key={k} className={`${fillOf(tone as never)}${tone === 'faint' ? ' cx-unlit' : ''}`} x={r1(col * (size + gap))} y={r1(row * (size + gap))} width={r1(size)} height={r1(size)} rx={2.5} />;
      })}
      {legend.map((it) => (
        <g key={it.label}>
          <Txt x={legendX} y={it.at + 26} cls={`cx-figure ${it.tone === 'signal' ? 'is-signal' : it.tone === 'faint' ? 'is-quiet' : ''}`}>{fmt(it.share, 'share')}</Txt>
          {it.lines.map((l, k) => <Txt key={k} x={legendX} y={it.at + 48 + k * 19} cls="cx-label">{l}</Txt>)}
        </g>
      ))}
    </g>
  );
  void ctx;
  return { height, node };
}

export function Big(s: BigSpec, ctx: Ctx): Drawn {
  const figure = fmt(s.value, s.fmt, ctx.units);
  const size = Math.min(120, (W / Math.max(1, tw(figure, 1, 'b660'))) * 0.92);
  const capLines = wrap(s.caption, W, 17, 'i500');
  const top = size * 0.86;
  let y = top + 16 + capLines.length * 22;
  const cmp = s.compare ?? [];
  const max = Math.max(...cmp.map((c) => c.value), 0);
  const lw = cmp.length ? Math.max(...cmp.map((c) => tw(c.label, T.label))) + 12 : 0;
  const texts = cmp.map((c) => valueText(c.value, s.compareFmt ?? s.fmt, ctx));
  const vw = cmp.length ? Math.max(...texts.map((t) => tw(t, T.value, 'i600'))) + 8 : 0;
  const barsTop = y + 14;
  const rh = 32;
  if (cmp.length) y = barsTop + cmp.length * rh;
  const height = y + 6;
  const node = (
    <g>
      <text className="cx-big" x={0} y={r1(top)} style={{ fontSize: `${r1(size)}px` }}>{figure}</text>
      {capLines.map((l, k) => <Txt key={k} x={0} y={top + 30 + k * 22} cls="cx-caption">{l}</Txt>)}
      {cmp.map((c, i) => {
        const cy = barsTop + i * rh + rh / 2;
        const w = max > 0 ? ((W - lw - vw) * c.value) / max : 0;
        return (
          <g key={c.label}>
            <Txt x={0} y={cy + 5} cls={`cx-label ${textTone(c.tone)}`}>{c.label}</Txt>
            <rect className={fillOf(c.tone)} x={lw} y={r1(cy - 8)} width={r1(Math.max(1, w))} height={16} rx={1.5} />
            <Txt x={lw + w + 6} y={cy + 5} cls={`cx-value ${textTone(c.tone)}`}>{texts[i]}</Txt>
          </g>
        );
      })}
    </g>
  );
  return { height, node };
}

export function Flow(s: FlowSpec, ctx: Ctx): Drawn {
  const height = ctx.fit ?? s.height ?? 330;
  const top = 26, bottom = height - 4;
  const nodeW = 10, gap = 6;
  const lTotals = s.flows.map((row) => row.reduce((a, b) => a + b, 0));
  const rTotals = s.right.map((_, j) => s.flows.reduce((a, row) => a + row[j], 0));
  const lw = Math.max(...s.left.map((l) => tw(l, T.label))) + 8;
  const rw = Math.max(...s.right.map((l) => tw(l, T.label))) + 8;
  const xl = Math.min(lw, 110), xr = W - Math.min(rw, 110) - nodeW;
  const avail = (n: number) => bottom - top - gap * (n - 1);
  const lH = avail(s.left.length), rH = avail(s.right.length);
  const lTop: number[] = [], rTop: number[] = [];
  let acc = top;
  lTotals.forEach((t, i) => { lTop[i] = acc; acc += t * lH + gap; });
  acc = top;
  rTotals.forEach((t, j) => { rTop[j] = acc; acc += t * rH + gap; });
  const lCursor = [...lTop], rCursor = [...rTop];
  const lit = new Set((s.highlight ?? []).map(([a, b]) => `${a}:${b}`));
  const ribbons: { d: string; on: boolean }[] = [];
  s.flows.forEach((row, i) => row.forEach((f, j) => {
    if (f <= 0) return;
    const h1 = f * lH, h2 = f * rH;
    const y1 = lCursor[i], y2 = rCursor[j];
    lCursor[i] += h1; rCursor[j] += h2;
    const xa = xl + nodeW, xb = xr, mx = (xa + xb) / 2;
    const d = `M${r1(xa)} ${r1(y1)}C${r1(mx)} ${r1(y1)} ${r1(mx)} ${r1(y2)} ${r1(xb)} ${r1(y2)}L${r1(xb)} ${r1(y2 + h2)}C${r1(mx)} ${r1(y2 + h2)} ${r1(mx)} ${r1(y1 + h1)} ${r1(xa)} ${r1(y1 + h1)}Z`;
    ribbons.push({ d, on: lit.has(`${i}:${j}`) });
  }));
  const node = (
    <g>
      <Txt x={xl + nodeW} y={14} cls="cx-head" anchor="end">{s.leftTitle}</Txt>
      <Txt x={xr} y={14} cls="cx-head">{s.rightTitle}</Txt>
      {ribbons.filter((rb) => !rb.on).map((rb, k) => <path key={k} className="cx-ribbon" d={rb.d} />)}
      {ribbons.filter((rb) => rb.on).map((rb, k) => <path key={`on${k}`} className="cx-ribbon is-signal" d={rb.d} />)}
      {s.left.map((l, i) => (
        <g key={l}>
          <rect className="tf-ink2" x={xl} y={r1(lTop[i])} width={nodeW} height={r1(Math.max(1, lTotals[i] * lH))} />
          <Txt x={xl - 6} y={lTop[i] + (lTotals[i] * lH) / 2 + 5} cls="cx-label" anchor="end">{l}</Txt>
        </g>
      ))}
      {s.right.map((l, j) => (
        <g key={l}>
          <rect className="tf-ink2" x={xr} y={r1(rTop[j])} width={nodeW} height={r1(Math.max(1, rTotals[j] * rH))} />
          <Txt x={xr + nodeW + 6} y={rTop[j] + (rTotals[j] * rH) / 2 + 5} cls="cx-label">{l}</Txt>
        </g>
      ))}
    </g>
  );
  return { height, node };
}
