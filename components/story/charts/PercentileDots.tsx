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
 * 1st to the 99th, stacked upward where they crowd, so the field's shape builds itself out of finishes. The median is
 * the signal dot; the run the sentence names (the middle half) is ink, its ends labelled; the rest quiet. A lens switches
 * the group (all finishes, recorded women, recorded men); every layer is drawn on the server.
 */
export type DotLayer = {
  id: string; label: string; minutes: number[]; marks: { index: number; text: string; tone: 'signal' | 'ink' }[];
  /** The one line the lens updates above the plot ("Recorded women · the middle half", "3:58 to 5:09"). */
  readout?: { key: string; value: string };
  /** The run of dots the sentence names (the middle half), drawn ink; the rest stay quiet. */
  band?: [number, number];
};

const R = 4;
const STEP = 9;
const HEAD = 30;

/** Each dot takes the lowest level free of neighbours within a dot's width, at the narrowest phone's plot width. */
function stack(xs: number[]): number[] {
  const placed: { px: number; level: number }[] = [];
  return xs.map((x) => {
    const px = x * REF_WIDTH;
    let level = 0;
    while (placed.some((p) => p.level === level && Math.abs(p.px - px) < R * 2 + 0.6)) level++;
    placed.push({ px, level });
    return level;
  });
}

export default function PercentileDots({ layers, initial, domain, ticks, label, lensLabel, values }: {
  layers: DotLayer[]; initial: string; domain: [number, number]; ticks: { value: number; label: string }[]; label: string; lensLabel: string; values?: ReactNode;
}) {
  const x = linear(domain);
  const levels = layers.map((l) => stack(l.minutes.map((m) => x(m))));
  const top = Math.max(0, ...levels.flat());
  const height = HEAD + (top + 1) * STEP + 4;
  const yOf = (level: number) => (height - 4 - R - level * STEP) / height;
  const plot = (
    <Plot>
      <Baseline />
      {layers.map((layer, k) => {
        const lv = levels[k];
        const marked = new Map(layer.marks.map((m) => [m.index, m]));
        const items: LabelItem[] = layer.marks.map((m) => {
          // Above the tallest stack within the label's reach, so a crowded neighbour never covers it.
          const near = layer.minutes.map((v, i) => ({ i, d: Math.abs(x(v) - x(layer.minutes[m.index])) * REF_WIDTH })).filter((p) => p.d < 22).map((p) => lv[p.i]);
          return { id: `${layer.id}-${m.index}`, text: m.text, x: x(layer.minutes[m.index]), y: yOf(Math.max(...near)), priority: m.tone === 'signal' ? 3 : 2, size: m.tone === 'signal' ? 14 : 13, tone: m.tone, gap: 8, prefer: 'above' };
        });
        const placed = placeLabels(items, { height, avoid: layer.minutes.map((v, i) => ({ x: x(v), y: yOf(lv[i]), r: R })) });
        return (
          <g key={layer.id} data-layer={layer.id} className={layer.id === initial ? undefined : 'is-off'}>
            {layer.minutes.map((v, i) => {
              const m = marked.get(i);
              const inBand = layer.band ? i >= layer.band[0] && i <= layer.band[1] : false;
              return <circle key={i} className={m?.tone === 'signal' ? 'm-signal' : m || inBand ? 'm-ink' : 'm-context'} cx={pc(x(v))} cy={pc(yOf(lv[i]))} r={R} />;
            })}
            <Annotation labels={placed} />
          </g>
        );
      })}
    </Plot>
  );
  return (
    <ChartFrame className="percentile-dots" label={label} height={height} heightMd={height} k={initial}
      lens={(
        <>
          <Lens label={lensLabel} options={layers.map((l) => ({ value: l.id, label: l.label }))} defaultValue={initial} />
          {layers.map((l) => (l.readout ? (
            <div key={l.id} className={`readout pd-readout${l.id === initial ? '' : ' is-off'}`} data-layer={l.id}>
              <div className="readout-main"><span className="readout-key">{l.readout.key}</span><span className="readout-value">{l.readout.value}</span></div>
            </div>
          ) : null))}
        </>
      )}
      plot={plot} axis={<Axis ticks={ticks.map((t) => ({ x: x(t.value), label: t.label }))} />}
      values={values} />
  );
}
