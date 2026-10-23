/**
 * The All numbers twin of a Top 100 chart: the plotted numbers as a table, derived from the spec so the table never
 * disagrees with the chart. Long series (a minute-by-minute histogram) are listed at the chart's own resolution.
 */
import { fmt } from './fmt';
import { UNIT_FMTS, type Axis, type ChartSpec, type Fmt } from './spec';
import type { UnitSystem } from '@/lib/units';

export type ChartTable = { columns: { key: string; label: string; text?: boolean }[]; rows: string[][] };

const at = (a: Axis, v: number, units: UnitSystem) => (a.cats ? a.cats[Math.round(v)] ?? String(v) : fmt(v, a.fmt, units));

export function tableOf(spec: ChartSpec, units: UnitSystem = 'mi'): ChartTable {
  const f = (v: number, k: Fmt) => fmt(v, k, units);
  switch (spec.form) {
    case 'bars':
      return { columns: [{ key: 'label', label: 'Group', text: true }, { key: 'value', label: 'Value' }], rows: spec.rows.map((r) => [r.label, f(r.value, spec.fmt)]) };
    case 'dumbbell':
      return { columns: [{ key: 'label', label: 'Group', text: true }, { key: 'a', label: spec.a }, { key: 'b', label: spec.b }], rows: spec.rows.map((r) => [r.label, f(r.a, spec.fmt), f(r.b, spec.fmt)]) };
    case 'range':
      return {
        columns: [{ key: 'label', label: 'Group', text: true }, { key: 'lo', label: spec.legend.lo }, { key: 'mid', label: spec.legend.mid }, { key: 'hi', label: spec.legend.hi }],
        rows: spec.rows.map((r) => [r.label, f(r.lo, spec.fmt), f(r.mid, spec.fmt), f(r.hi, spec.fmt)]),
      };
    case 'slope':
      return { columns: [{ key: 'label', label: 'Group', text: true }, { key: 'a', label: spec.left }, { key: 'b', label: spec.right }], rows: spec.rows.map((r) => [r.label, f(r.a, spec.fmt), f(r.b, spec.fmt)]) };
    case 'pyramid':
      return { columns: [{ key: 'label', label: 'Group', text: true }, { key: 'l', label: spec.left }, { key: 'r', label: spec.right }], rows: spec.rows.map((r) => [r.label, f(r.left, spec.fmt), f(r.right, spec.fmt)]) };
    case 'stacked':
      return { columns: [{ key: 'label', label: 'Group', text: true }, ...spec.parts.map((p, k) => ({ key: `p${k}`, label: p.label }))], rows: spec.rows.map((r) => [r.label, ...r.parts.map((p) => f(p, spec.fmt))]) };
    case 'columns':
      return { columns: [{ key: 'label', label: 'Group', text: true }, { key: 'value', label: 'Value' }], rows: spec.cols.map((c) => [c.label, f(c.value, spec.fmt)]) };
    case 'histogram':
      return {
        columns: [{ key: 'from', label: 'From', text: true }, { key: 'to', label: 'To', text: true }, { key: 'v', label: spec.y.title ?? 'Value' }],
        rows: spec.bins.map((b) => [at(spec.x, b.x0, units), at(spec.x, b.x1, units), f(b.v, spec.y.fmt)]),
      };
    case 'lines': {
      const xs = [...new Set(spec.series.flatMap((s) => s.points.map((p) => p[0])))].sort((a, b) => a - b);
      return {
        columns: [{ key: 'x', label: spec.x.title ?? 'At', text: true }, ...spec.series.map((s, k) => ({ key: `s${k}`, label: s.label }))],
        rows: xs.map((x) => [at(spec.x, x, units), ...spec.series.map((s) => { const p = s.points.find((q) => q[0] === x); return p ? f(p[1], spec.y.fmt) : '—'; })]),
      };
    }
    case 'scatter':
      return {
        columns: [{ key: 'label', label: 'Point', text: true }, { key: 'x', label: spec.x.title ?? 'x' }, { key: 'y', label: spec.y.title ?? 'y' }],
        rows: spec.points.map((p, i) => [p.label ?? String(i + 1), f(p.x, spec.x.fmt), f(p.y, spec.y.fmt)]),
      };
    case 'heatmap':
      return { columns: [{ key: 'row', label: spec.rowTitle ?? '', text: true }, ...spec.cols.map((c, j) => ({ key: `c${j}`, label: c }))], rows: spec.rows.map((r, i) => [r, ...spec.cells[i].map((v) => (v === null ? '—' : f(v, spec.fmt)))]) };
    case 'waffle':
      return { columns: [{ key: 'label', label: 'Group', text: true }, { key: 'share', label: 'Share' }], rows: spec.parts.map((p) => [p.label, f(p.share, 'share1')]) };
    case 'big':
      return { columns: [{ key: 'label', label: 'Group', text: true }, { key: 'value', label: 'Value' }], rows: [[spec.caption, f(spec.value, spec.fmt)], ...(spec.compare ?? []).map((c) => [c.label, f(c.value, spec.compareFmt ?? spec.fmt)])] };
    case 'flow':
      return { columns: [{ key: 'from', label: spec.leftTitle, text: true }, ...spec.right.map((r, j) => ({ key: `r${j}`, label: `${spec.rightTitle}: ${r}` }))], rows: spec.left.map((l, i) => [l, ...spec.flows[i].map((v) => f(v, 'share1'))]) };
    case 'strip':
      return { columns: [{ key: 'group', label: 'Group', text: true }, { key: 'label', label: 'Point', text: true }, { key: 'v', label: spec.x.title ?? 'Value' }], rows: spec.groups.flatMap((g) => g.dots.map((d, i) => [g.label, d.label ?? String(i + 1), f(d.v, spec.x.fmt)])) };
    case 'multiples': {
      const xs = [...new Set(spec.panels.flatMap((p) => p.series[0]?.points.map((q) => q[0]) ?? []))].sort((a, b) => a - b);
      return { columns: [{ key: 'panel', label: 'Panel', text: true }, ...xs.map((x, k) => ({ key: `x${k}`, label: at(spec.x, x, units) }))], rows: spec.panels.map((p) => [p.label, ...xs.map((x) => { const q = p.series[0]?.points.find((pt) => pt[0] === x); return q ? f(q[1], spec.y.fmt) : '—'; })]) };
    }
    case 'ridgeline': {
      // A density's peak and its spread read better than every sample point: the x where each row peaks.
      return { columns: [{ key: 'label', label: 'Group', text: true }, { key: 'peak', label: 'Peak at' }], rows: spec.rows.map((r) => { const top = r.points.reduce((a, b) => (b[1] > a[1] ? b : a), r.points[0]); return [r.label, at(spec.x, top[0], units)]; }) };
    }
  }
}

/** Whether a spec shows a pace, a distance or a temperature (drawn once per unit system). */
export function unitAware(spec: ChartSpec): boolean {
  const fmts: Fmt[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if ((k === 'fmt' || k === 'compareFmt' || k === 'gap') && typeof x === 'string') fmts.push(x as Fmt); else walk(x); }
  };
  walk(spec);
  return fmts.some((f) => UNIT_FMTS.includes(f));
}
