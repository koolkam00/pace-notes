import type { ReactNode } from 'react';
import ChartFrame, { type KeyItem } from '@/components/viz/ChartFrame';
import Axis from '@/components/viz/Axis';
import Plot, { Baseline, Gridlines } from '@/components/viz/Plot';
import Annotation from '@/components/viz/Annotation';
import { placeLabels, REF_WIDTH, textWidth, type LabelItem } from '@/components/viz/labels';
import { linear, pc, yScale } from '@/components/viz/scale';

/**
 * Columns for a few ordered groups (start-temperature bands, earlier-best bands, age groups): one column of at most
 * 24 px per group on a shared zero baseline, the group the sentence is about in signal, the rest ink, a group with too
 * few races hollow. With six groups or fewer every column carries its value; with more, only the extremes and the
 * subject do (the rest stay in Values). Server-drawn and stretched to any width.
 */
export type Column = { id: string; label: string; value: number; display: string; tone?: 'signal' | 'ink' | 'quiet' | 'hollow' };

export default function Columns({ items, max, label, keys, values, height = 180, heightMd = 220, gridLabel }: {
  items: Column[]; max?: number; label: string; keys?: KeyItem[]; values?: ReactNode; height?: number; heightMd?: number;
  /** A label for the top gridline ("50%"). */
  gridLabel?: { value: number; label: string };
}) {
  const top = max ?? Math.max(...items.map((c) => c.value)) * 1.05;
  const y = yScale(0, top, { top: 0.16 });
  const x = linear([0, items.length]);
  const all = items.length <= 6;
  const lo = items.reduce((b, c, i) => (c.value < items[b].value ? i : b), 0);
  const hi = items.reduce((b, c, i) => (c.value > items[b].value ? i : b), 0);
  const shown = items.map((c, i) => all || i === lo || i === hi || c.tone === 'signal');
  // A value wider than its column sits above the tallest neighbour it spans (at the narrowest phone), centred on its own
  // column, so a short column between taller ones (the lowest group a headline names) still carries its value.
  const pitch = REF_WIDTH / items.length;
  const anchorOf = (c: Column, i: number) => {
    // Neighbour k's near edge is k pitches less 11 px from the centre; the label spans it when its half-width is wider.
    const reach = Math.max(0, Math.ceil((textWidth(c.display, c.tone === 'signal' ? 14 : 13) / 2 + 11) / pitch) - 1);
    return Math.min(...items.slice(Math.max(0, i - reach), i + reach + 1).map((d) => y(d.value)));
  };
  const lab: LabelItem[] = items.flatMap((c, i) => (shown[i] ? [{ id: c.id, text: c.display, x: x(i + 0.5), y: anchorOf(c, i), priority: c.tone === 'signal' ? 3 : 2, tone: c.tone === 'signal' ? 'signal' as const : 'ink' as const, size: c.tone === 'signal' ? 14 : 13, gap: 6, prefer: 'above' as const }] : []));
  // Below 200 px (a phone at 200% zoom) only the extremes and the signal column keep their values; the rest are in Values.
  const key = new Set([lo, hi, ...items.flatMap((c, i) => (c.tone === 'signal' ? [i] : []))].map((i) => items[i].id));
  const placed = placeLabels(lab, { height, boxes: items.map((c, i) => ({ x0: x(i + 0.5) - 12 / 288, x1: x(i + 0.5) + 12 / 288, y0: y(c.value), y1: 1 })) })
    .map((p) => (key.has(p.id) || p.minWidth === null ? p : { ...p, minWidth: Math.max(p.minWidth, 200) }));
  const plot = (
    <Plot>
      {gridLabel ? <Gridlines lines={[{ y: y(gridLabel.value), label: gridLabel.label }]} side="right" /> : null}
      {items.map((c, i) => {
        const h = Math.max(0.004, 1 - y(c.value));
        const cls = c.tone === 'signal' ? 'm-signal' : c.tone === 'hollow' ? 'm-hollow' : c.tone === 'quiet' ? 'm-quiet' : 'm-ink';
        return <rect key={c.id} className={`column ${cls}`} x={pc(x(i + 0.5))} width={22} transform="translate(-11 0)" y={pc(1 - h)} height={pc(h)} rx={3} />;
      })}
      <Baseline />
      <Annotation labels={placed} />
    </Plot>
  );
  return (
    <ChartFrame className="columns" label={label} height={height} heightMd={heightMd} plot={plot}
      // The signal column and the labelled extremes are named under their columns first, then the ends.
      axis={<Axis ticks={items.map((c, i) => ({ x: x(i + 0.5), label: c.label, priority: c.tone === 'signal' ? 4 : !all && (i === lo || i === hi) ? 3 : i === 0 || i === items.length - 1 ? 2 : 1 }))} />}
      keys={keys} values={values}
    />
  );
}
