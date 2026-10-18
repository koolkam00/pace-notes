import type { ReactNode } from 'react';
import ChartFrame from '@/components/viz/ChartFrame';
import Axis from '@/components/viz/Axis';
import Plot, { Baseline } from '@/components/viz/Plot';
import Lens from '@/components/viz/Lens.client';
import Annotation from '@/components/viz/Annotation';
import { placeLabels, REF_WIDTH, type LabelItem } from '@/components/viz/labels';
import { linear, pc } from '@/components/viz/scale';

/**
 * The field as 99 finishes (the redesign spec, section 7.3, #field): one dot for each percentile finish time, from the
 * 1st to the 99th, binned into columns and stacked, so the field's shape builds itself out of finishes. The median is
 * the signal dot; the run the sentence names (the middle half) is ink, its ends labelled with their times; the rest
 * quiet. A lens switches the group (all finishes, recorded women, recorded men); every layer is drawn on the server.
 *
 * Two sizes of the same picture, binned alike: 8 px dots for phones, and 12 px dots from 900 px, where the figure is held
 * to the text measure, so the shape keeps its weight on a wide screen instead of thinning out across it.
 */
export type DotLayer = {
  id: string; label: string; minutes: number[]; marks: { index: number; text: string; tone: 'signal' | 'ink' }[];
  /** The run of dots the sentence names (the middle half), drawn ink; the rest stay quiet. */
  band?: [number, number];
};

const SIZES = { phone: { r: 4, step: 9 }, wide: { r: 6, step: 13 } } as const;
const HEAD = 30;

/**
 * Dots binned into columns one dot wide (at the narrowest phone's plot width), then stacked in each column in order, so
 * the tallest column is the busiest stretch of finish times and every dot sits squarely on the one under it.
 */
const COL = SIZES.phone.r * 2 + 1;
function binned(xs: number[]): { x: number; level: number }[] {
  const count = new Map<number, number>();
  return xs.map((x) => {
    const col = Math.floor((x * REF_WIDTH) / COL);
    const level = count.get(col) ?? 0;
    count.set(col, level + 1);
    return { x: Math.min(1, ((col + 0.5) * COL) / REF_WIDTH), level };
  });
}

export default function PercentileDots({ layers, initial, domain, ticks, label, lensLabel, values }: {
  layers: DotLayer[]; initial: string; domain: [number, number]; ticks: { value: number; label: string }[]; label: string; lensLabel: string; values?: ReactNode;
}) {
  const x = linear(domain);
  const dots = layers.map((l) => binned(l.minutes.map((m) => x(m))));
  const top = Math.max(0, ...dots.flat().map((d) => d.level));
  const heightOf = (size: keyof typeof SIZES) => HEAD + (top + 1) * SIZES[size].step + 4;
  const draw = (size: keyof typeof SIZES) => {
    const { r, step } = SIZES[size];
    const height = heightOf(size);
    const yOf = (level: number) => (height - 4 - r - level * step) / height;
    return (
      <g className={`pd-${size}`}>
        {layers.map((layer, k) => {
          const d = dots[k];
          const marked = new Map(layer.marks.map((m) => [m.index, m]));
          const items: LabelItem[] = layer.marks.map((m) => {
            // Above the tallest column within the label's reach, so a crowded neighbour never covers it.
            const near = d.filter((p) => Math.abs(p.x - d[m.index].x) * REF_WIDTH < 22).map((p) => p.level);
            return { id: `${layer.id}-${m.index}`, text: m.text, x: d[m.index].x, y: yOf(Math.max(...near)), priority: m.tone === 'signal' ? 3 : 2, size: m.tone === 'signal' ? 14 : 13, tone: m.tone, gap: 8, prefer: 'above' };
          });
          const placed = placeLabels(items, { height, avoid: d.map((p) => ({ x: p.x, y: yOf(p.level), r })) });
          return (
            <g key={layer.id} data-layer={layer.id} className={layer.id === initial ? undefined : 'is-off'}>
              {layer.minutes.map((_, i) => {
                const m = marked.get(i);
                const inBand = layer.band ? i >= layer.band[0] && i <= layer.band[1] : false;
                return <circle key={i} className={m?.tone === 'signal' ? 'm-signal' : m || inBand ? 'm-ink' : 'm-context'} cx={pc(d[i].x)} cy={pc(yOf(d[i].level))} r={r} />;
              })}
              <Annotation labels={placed} />
            </g>
          );
        })}
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
    <ChartFrame className="percentile-dots" label={label} height={heightOf('phone')} heightMd={heightOf('wide')} k={initial}
      lens={<Lens label={lensLabel} options={layers.map((l) => ({ value: l.id, label: l.label }))} defaultValue={initial} />}
      plot={plot} axis={<Axis ticks={ticks.map((t) => ({ x: x(t.value), label: t.label }))} />}
      values={values} />
  );
}
