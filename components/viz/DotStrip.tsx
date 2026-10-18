import type { ReactNode } from 'react';
import ChartFrame from './ChartFrame';
import Axis from './Axis';
import Plot, { Baseline } from './Plot';
import Scrubber from './Scrubber.client';
import Annotation from './Annotation';
import { placeLabels, REF_WIDTH, textWidth, type LabelItem } from './labels';
import { extent, linear, pc } from './scale';

/**
 * A dot strip (the redesign spec, section 3.6): one 10 px dot per item along a value axis, ranked by value, never A to
 * Z. Dots that would touch stack upward. The subject is signal and named by the readout; the extremes are labelled;
 * items with too few editions are hollow; the rest quiet. Tap a dot (the nearest wins) to read it out; the strip opens on
 * the subject, or, with `prompt` (where the heading already says the subject's value), on nothing: the readout holds the
 * prompt until a dot is picked, and the key names the subject's dot.
 *
 * Extremes come only from filled items (spec section 3.10: a cross-course extreme needs three or more editions), so an
 * under-sampled hollow dot is never named as the fastest or slowest. Headlines take them from `stripExtremes`.
 */
export type StripItem = { id: string; label: string; value: number; display: string; detail?: string; hollow?: boolean; subject?: boolean };

/** The lowest and highest filled (well-sampled) items: the only ones a headline or a label may call extremes. */
export function stripExtremes<T extends Pick<StripItem, 'value' | 'hollow'>>(items: T[]): [T, T] | null {
  const solid = items.filter((s) => !s.hollow);
  if (!solid.length) return null;
  return [solid.reduce((a, b) => (b.value < a.value ? b : a)), solid.reduce((a, b) => (b.value > a.value ? b : a))];
}

const R = 5;
const STEP = 11;
/** The pick ring's reach round the dot it opens on (20 px across, plus its 2 px line). */
const RING = 12;

export default function DotStrip({ items, domain, ticks, label, readoutKey, values, labelExtremes = true, keyLabels, prompt }: {
  items: StripItem[]; domain?: [number, number]; ticks: { value: number; label: string }[]; label: string;
  /** The key's words when some dots are hollow ("Three or more editions", "Fewer editions"). */
  keyLabels?: { filled: string; hollow: string };
  /** The readout's words until a dot is picked ("Choose a dot to see its course"); the key then names the subject. */
  prompt?: string;
  /** The readout's side label for each item's detail ("Finishes"). */
  readoutKey?: string; values?: ReactNode; labelExtremes?: boolean;
}) {
  const sorted = [...items].sort((a, b) => a.value - b.value);
  const x = linear(domain ?? extent(sorted.map((s) => s.value)));
  // Stack at the reference width: each dot takes the lowest level with no neighbour within a dot's width. The subject
  // goes first, on the axis, and keeps the room of the ring it opens with (12 px round it), so no neighbour sits under
  // the ring; the rest stack above it.
  const levels: number[] = new Array(sorted.length).fill(0);
  const placed: { px: number; level: number; subject: boolean }[] = [];
  const order = sorted.map((s, i) => i).sort((a, b) => Number(!!sorted[b].subject) - Number(!!sorted[a].subject) || a - b);
  for (const i of order) {
    const s = sorted[i];
    const px = x(s.value) * REF_WIDTH;
    let level = 0;
    // Clear of every dot on its own level, and of the subject's ring at any level (by the distance between centres).
    const clash = (lv: number) => placed.some((p) => (p.level === lv && Math.abs(p.px - px) < R * 2 + 1)
      || (p.subject && Math.hypot(p.px - px, (lv - p.level) * STEP) < RING + R + 1));
    while (clash(level)) level++;
    placed.push({ px, level, subject: !!s.subject });
    levels[i] = level;
  }
  const top = Math.max(0, ...levels);
  const height = 44 + (top + 1) * STEP + 8;
  const base = 1 - 10 / height;
  const yOf = (level: number) => base - (level * STEP) / height;
  const subject = sorted.findIndex((s) => s.subject);
  const ends = labelExtremes ? stripExtremes(sorted) : null;
  // The readout above the plot names the subject (the strip opens on it), so its dot carries no label of its own: the
  // labels name the extremes it is not.
  const labelled = new Set<number>((ends ? ends.map((e) => sorted.indexOf(e)) : []).filter((i) => i !== subject));
  // A label rises above the tallest stack under its own width (at the narrowest phone), on a leader down to its dot
  // when it had to climb, so a stacked neighbour never hides it.
  const pxOf = (i: number) => x(sorted[i].value) * REF_WIDTH;
  const lift = (i: number) => {
    const reach = textWidth(sorted[i].label, 13) + 6;
    return Math.max(levels[i], ...placed.filter((p) => Math.abs(p.px - pxOf(i)) < reach).map((p) => p.level));
  };
  // A label hides while the pick ring is on its dot (Scrubber's is-under): the readout names it then.
  const lab: LabelItem[] = [...labelled].map((i) => ({ id: String(i), text: sorted[i].label, x: x(sorted[i].value), y: yOf(lift(i)), priority: i === subject ? 3 : 1, tone: i === subject ? 'signal' : 'ink', size: i === subject ? 14 : 13, gap: 10, prefer: 'above' as const, at: i }));
  const labels = placeLabels(lab, { height, avoid: sorted.map((s, i) => ({ x: x(s.value), y: yOf(levels[i]), r: R })) });
  const leaders = [...labelled].filter((i) => lift(i) > levels[i]).map((i) => ({ i, y0: yOf(lift(i)) - (R + 2) / height, y1: yOf(levels[i]) - (R + 2) / height }));
  const plot = (
    <Plot>
      <Baseline y={base} />
      {leaders.map((l) => <rect key={`ld${l.i}`} className="leader" data-scrub-i={l.i} x={pc(x(sorted[l.i].value))} width={1} transform="translate(-0.5 0)" y={pc(l.y0)} height={pc(Math.max(0, l.y1 - l.y0))} />)}
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
      scrub={<Scrubber mode="pick" points={points} initial={Math.max(0, subject)} label={label} axis={axis} prompt={prompt}>{plot}</Scrubber>}
      keys={[
        ...(prompt && subject >= 0 ? [{ label: sorted[subject].label, mark: 'dot' as const, tone: 'signal' as const }] : []),
        ...(keyLabels && sorted.some((s) => s.hollow) ? [{ label: keyLabels.filled, mark: 'dot' as const, tone: 'quiet' as const }, { label: keyLabels.hollow, mark: 'hollow' as const }] : []),
      ]}
      values={values}
    />
  );
}
