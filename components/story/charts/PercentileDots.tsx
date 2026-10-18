import type { ReactNode } from 'react';
import ChartFrame from '@/components/viz/ChartFrame';
import Axis from '@/components/viz/Axis';
import Plot, { Baseline } from '@/components/viz/Plot';
import Annotation from '@/components/viz/Annotation';
import { placeLabels, REF_WIDTH, textWidth } from '@/components/viz/labels';
import { linear, pc } from '@/components/viz/scale';

/**
 * The field as 99 finishes (the redesign spec, section 7.3, #field): one dot for each percentile finish time, from the
 * 1st to the 99th, binned into columns and stacked, so the field's shape builds itself out of finishes. The run the H2
 * names (the middle half) is ink and named in the key; the H2 gives its ends, so no time is printed on the dots. The
 * median is the one signal dot, on top of its column, named by a label with a short leader. The rest are quiet.
 *
 * Two sizes of the same picture, binned alike: 8 px dots for phones, and 16 px dots from 900 px, so the figure spans the
 * story's measure and keeps its weight on a wide screen.
 */
export type DotLayer = {
  minutes: number[];
  /** The run of dots the H2 names (the middle half), drawn ink and named in the key. */
  band: [number, number];
  bandLabel: string;
  /** The one signal dot (the median) and its label. */
  mark: { index: number; text: string };
};

/** Dot radius and stack step, px, and the narrowest plot width each size is drawn at (labels are placed for it). */
const SIZES = { phone: { r: 4, step: 9, width: REF_WIDTH }, wide: { r: 8, step: 18, width: 576 } } as const;
const HEAD = 34;

/**
 * Dots binned into columns one dot wide (at the narrowest phone's plot width), then stacked in each column in order, so
 * the tallest column is the busiest stretch of finish times. The marked dot is lifted to the top of its column (a
 * column is one bin, so its order inside it carries nothing), where its label's leader reaches it past no other dot.
 */
const COL = SIZES.phone.r * 2 + 1;
function binned(xs: number[], marked: number): { x: number; level: number }[] {
  const count = new Map<number, number>();
  const dots = xs.map((x) => {
    const col = Math.floor((x * REF_WIDTH) / COL);
    const level = count.get(col) ?? 0;
    count.set(col, level + 1);
    return { col, x: Math.min(1, ((col + 0.5) * COL) / REF_WIDTH), level };
  });
  const own = dots[marked];
  if (own) {
    const top = dots.reduce((best, d, i) => (d.col === own.col && d.level > dots[best].level ? i : best), marked);
    [dots[top].level, own.level] = [own.level, dots[top].level];
  }
  return dots.map(({ x, level }) => ({ x, level }));
}

export default function PercentileDots({ layer, domain, ticks, label, values }: {
  layer: DotLayer; domain: [number, number]; ticks: { value: number; label: string }[]; label: string; values?: ReactNode;
}) {
  const x = linear(domain);
  const d = binned(layer.minutes.map((m) => x(m)), layer.mark.index);
  const top = Math.max(0, ...d.map((p) => p.level));
  const heightOf = (size: keyof typeof SIZES) => HEAD + (top + 1) * SIZES[size].step + 4;
  const draw = (size: keyof typeof SIZES) => {
    const { r, step, width } = SIZES[size];
    const height = heightOf(size);
    const yOf = (level: number) => (height - 4 - r - level * step) / height;
    const m = d[layer.mark.index];
    // Above the tallest column within the label's reach, so a crowded neighbour never covers it.
    const reach = textWidth(layer.mark.text, 14) / 2 + r + 2;
    const near = d.filter((p) => Math.abs(p.x - m.x) * width < reach).map((p) => p.level);
    const placed = placeLabels([{ id: 'mark', text: layer.mark.text, x: m.x, y: yOf(Math.max(...near)), priority: 3, size: 14, tone: 'signal', gap: r + 6, prefer: 'above' }],
      { height, width, avoid: d.map((p) => ({ x: p.x, y: yOf(p.level), r })) });
    const lab = placed[0];
    // The leader: from under the label to the top of the median's dot (px, from the label's anchor point).
    const from = lab.dy + 4, to = (yOf(m.level) - lab.y) * height - r - 3;
    return (
      <g className={`pd-${size}`}>
        {layer.minutes.map((_, i) => {
          const inBand = i >= layer.band[0] && i <= layer.band[1];
          return <circle key={i} className={i === layer.mark.index ? 'm-signal' : inBand ? 'm-ink' : 'm-context'} cx={pc(d[i].x)} cy={pc(yOf(d[i].level))} r={r} />;
        })}
        {lab.minWidth !== null && Math.abs(lab.dx) <= 16 && to - from > 3 ? (
          <rect className="leader" x={pc(m.x)} y={pc(lab.y)} width={1} height={to - from} transform={`translate(-0.5 ${from})`} />
        ) : null}
        <Annotation labels={placed} />
      </g>
    );
  };
  const plot = (
    <Plot>
      <Baseline />
      {draw('phone')}
      {draw('wide')}
    </Plot>
  );
  return (
    <ChartFrame className="percentile-dots" label={label} height={heightOf('phone')} heightMd={heightOf('wide')}
      plot={plot} axis={<Axis ticks={ticks.map((t) => ({ x: x(t.value), label: t.label }))} />}
      keys={[{ label: layer.bandLabel, mark: 'dot', tone: 'ink' }]}
      values={values} />
  );
}
