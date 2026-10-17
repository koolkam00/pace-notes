import type { ReactNode } from 'react';
import ChartFrame from './ChartFrame';
import Axis from './Axis';
import Plot, { Baseline } from './Plot';
import Scrubber from './Scrubber.client';
import Annotation from './Annotation';
import { placeLabels, REF_WIDTH, type LabelItem } from './labels';
import { extent, linear, pc } from './scale';

/**
 * A dot strip (the redesign spec, section 3.6): one 10 px dot per item along a value axis, ranked by value, never A to
 * Z. Dots that would touch stack upward. The subject is signal with its label; the extremes are labelled; items with too
 * few editions are hollow; the rest quiet. Tap a dot (the nearest wins) to read it out; the strip opens on the subject.
 */
export type StripItem = { id: string; label: string; value: number; display: string; detail?: string; hollow?: boolean; subject?: boolean };

const R = 5;
const STEP = 11;

export default function DotStrip({ items, domain, ticks, label, readoutKey, values, labelExtremes = true, keyLabels }: {
  items: StripItem[]; domain?: [number, number]; ticks: { value: number; label: string }[]; label: string;
  /** The key's words when some dots are hollow ("Three or more editions", "Fewer editions"). */
  keyLabels?: { filled: string; hollow: string };
  /** The readout's side label for each item's detail ("Finishes"). */
  readoutKey?: string; values?: ReactNode; labelExtremes?: boolean;
}) {
  const sorted = [...items].sort((a, b) => a.value - b.value);
  const x = linear(domain ?? extent(sorted.map((s) => s.value)));
  // Stack at the reference width: each dot takes the lowest level with no neighbour within a dot's width.
  const levels: number[] = [];
  const placed: { px: number; level: number }[] = [];
  for (const s of sorted) {
    const px = x(s.value) * REF_WIDTH;
    let level = 0;
    while (placed.some((p) => p.level === level && Math.abs(p.px - px) < R * 2 + 1)) level++;
    placed.push({ px, level });
    levels.push(level);
  }
  const top = Math.max(0, ...levels);
  const height = 44 + (top + 1) * STEP + 8;
  const base = 1 - 10 / height;
  const yOf = (level: number) => base - (level * STEP) / height;
  const subject = sorted.findIndex((s) => s.subject);
  const labelled = new Set<number>([...(subject >= 0 ? [subject] : []), ...(labelExtremes ? [0, sorted.length - 1] : [])]);
  const lab: LabelItem[] = [...labelled].map((i) => ({ id: String(i), text: sorted[i].label, x: x(sorted[i].value), y: yOf(levels[i]), priority: i === subject ? 3 : 1, tone: i === subject ? 'signal' : 'ink', size: i === subject ? 14 : 13, gap: 10 }));
  const labels = placeLabels(lab, { height, avoid: sorted.map((s, i) => ({ x: x(s.value), y: yOf(levels[i]), r: R })) });
  const plot = (
    <Plot>
      <Baseline y={base} />
      {sorted.map((s, i) => (
        <circle key={s.id} className={s.subject ? 'm-signal' : s.hollow ? 'm-hollow' : 'm-context'} cx={pc(x(s.value))} cy={pc(yOf(levels[i]))} r={R} />
      ))}
      <Annotation labels={labels} />
    </Plot>
  );
  const points = {
    x: sorted.map((s) => x(s.value)),
    y: sorted.map((_, i) => yOf(levels[i])),
    keys: sorted.map((s) => s.label),
    values: sorted.map((s) => s.display),
    side: readoutKey ? [{ label: readoutKey, values: sorted.map((s) => s.detail ?? '') }] : undefined,
  };
  const axis = <Axis ticks={ticks.map((t) => ({ x: x(t.value), label: t.label }))} />;
  return (
    <ChartFrame className="dot-strip" label={label} height={height} heightMd={height}
      scrub={<Scrubber mode="pick" points={points} initial={Math.max(0, subject)} label={label} axis={axis}>{plot}</Scrubber>}
      keys={keyLabels && sorted.some((s) => s.hollow) ? [{ label: keyLabels.filled, mark: 'dot', tone: 'quiet' }, { label: keyLabels.hollow, mark: 'hollow' }] : undefined}
      values={values}
    />
  );
}
