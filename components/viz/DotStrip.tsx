import type { ReactNode } from 'react';
import ChartFrame from './ChartFrame';
import Axis from './Axis';
import Plot, { Baseline } from './Plot';
import Scrubber from './Scrubber.client';
import Annotation from './Annotation';
import { placeLabels, REF_WIDTH, textWidth, type LabelItem, type PlacedLabel } from './labels';
import { extent, linear, pc } from './scale';

/**
 * A dot strip (the redesign spec, section 3.6): one 10 px dot per item along a value axis, ranked by value, never A to
 * Z. Dots that would touch stack upward. The subject is signal and named by the readout; the extremes are labelled;
 * items with too few editions are hollow; the rest quiet. Tap a dot (the nearest wins) to read it out: the chosen dot
 * grows and fills with ink (signal on the subject), never a ring, which is only ever the reader. The strip opens on the
 * subject, or, with `prompt` (where the heading already says the subject's value), on nothing: the readout holds the
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

/** Where `named` labels are placed: a plot this wide (they hide on narrower ones, and below a 900 px screen). */
const WIDE = 720;

export default function DotStrip({ items, domain, ticks, label, readoutKey, values, labelExtremes = true, keyLabels, prompt, labelSubject = false, hint, named, mdScale = 1 }: {
  items: StripItem[]; domain?: [number, number]; ticks: { value: number; label: string }[]; label: string;
  /** Name the subject on its dot too when it is an extreme (it then never hides under the pick ring). */
  labelSubject?: boolean;
  /** A quiet line under the strip saying it can be tapped ("Tap a dot to read its course"). */
  hint?: ReactNode;
  /**
   * From a 900 px screen: the strip is `mdScale` times taller (the stacks keep their shape; page CSS may grow the dots
   * to 7 px), and the `named` items (ids) carry quiet labels on leaders where the plot is 720 px or wider, so a reader
   * finds the items they know before tapping. They are placed for that height and width and hide on anything smaller
   * (Values keeps every item).
   */
  named?: string[]; mdScale?: number;
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
  // The readout above the plot names the dot the strip opens on (the subject, else the lowest), and the ring sits on it,
  // so that dot carries no label of its own: the labels name the extremes it is not.
  const opened = Math.max(0, subject);
  const labelled = new Set<number>((ends ? ends.map((e) => sorted.indexOf(e)) : []).filter((i) => i !== opened || (labelSubject && i === subject)));
  // A label rises above the tallest stack under its own width (at the narrowest phone), on a leader down to its dot
  // when it had to climb, so a stacked neighbour never hides it.
  const pxOf = (i: number) => x(sorted[i].value) * REF_WIDTH;
  const lift = (i: number) => {
    const reach = textWidth(sorted[i].label, 13) + 6;
    return Math.max(levels[i], ...placed.filter((p) => Math.abs(p.px - pxOf(i)) < reach).map((p) => p.level));
  };
  // A label hides while the pick ring is on its dot (Scrubber's is-under): the readout names it then.
  // The subject's own label (labelSubject) stands clear of the pick ring it opens with and never hides under it.
  const lab: LabelItem[] = [...labelled].map((i) => ({ id: String(i), text: sorted[i].label, x: x(sorted[i].value), y: yOf(lift(i)), priority: i === subject ? 3 : 1, tone: i === subject ? 'signal' : 'ink', size: i === subject ? 14 : 13, gap: i === subject ? RING + 2 : 10, prefer: 'above' as const, ...(i === subject && labelSubject ? {} : { at: i }) }));
  const labels = placeLabels(lab, { height, avoid: sorted.map((s, i) => ({ x: x(s.value), y: yOf(levels[i]), r: R })) });
  const leaders = [...labelled].filter((i) => lift(i) > levels[i]).map((i) => ({ i, y0: yOf(lift(i)) - (R + 2) / height, y1: yOf(levels[i]) - (R + 2) / height }));
  const heightMd = Math.round(height * mdScale);
  // Greedy placement depends on the order: the labels are placed left to right and right to left, and the pass that
  // names more of them is kept.
  const wide = named?.length ? [placeNamed(named, 1), placeNamed(named, -1)].reduce((a, b) => (b.length > a.length ? b : a)) : [];
  /**
   * The named labels at the wide plot (WIDE px by heightMd): each above the dots under its own width, centred on its
   * leader or slid along it, one 15 px row up at a time until it is clear of the labels and leaders already there; one
   * that finds no room is left out. The dots are kept 8 px round, the largest page CSS draws them.
   */
  function placeNamed(ids: string[], dir: 1 | -1) {
    const W = WIDE, H = heightMd, size = 13, ROW = 15;
    const px = sorted.map((s, i) => ({ x: x(s.value) * W, y: yOf(levels[i]) * H }));
    const hit = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
    const taken: Box[] = [
      ...labels.filter((l) => l.minWidth !== null).map((l) => labelBox(l, W, H, 2)),
      ...leaders.map((l) => ({ x0: px[l.i].x - 2, x1: px[l.i].x + 2, y0: l.y0 * H, y1: l.y1 * H })),
    ];
    const out: { i: number; label: PlacedLabel; y0: number; y1: number }[] = [];
    const want = sorted.map((_, j) => j).filter((j) => ids.includes(sorted[j].id) && !labelled.has(j) && j !== subject).sort((a, b) => dir * (a - b));
    for (const i of want) {
      const w = textWidth(sorted[i].label, size, 500);
      // Centred over its leader first, then slid a quarter or more of its width either way (the leader still under it);
      // first clear of the named dots still to come, whose leaders will rise there, then anywhere.
      const spots = [0, 0.25, -0.25, 0.4, -0.4].map((k) => Math.min(Math.max(px[i].x - w / 2 + k * w, 0), W - w));
      const later = want.slice(want.indexOf(i) + 1).map((j) => px[j].x);
      let done = false;
      for (const strict of [true, false]) {
        for (let row = 0; row < 8 && !done; row++) {
          for (const x0 of spots) {
            if (strict && later.some((lx) => lx > x0 - 6 && lx < x0 + w + 6)) continue;
            const under = px.filter((d) => d.x + 8 > x0 - 2 && d.x - 8 < x0 + w + 2);
            const base = Math.min(...under.map((d) => d.y)) - 8 - 6 - row * ROW;
            const box = { x0: x0 - 3, x1: x0 + w + 3, y0: base - size * 0.78 - 2, y1: base + size * 0.22 + 2 };
            const lead = { x0: px[i].x - 2, x1: px[i].x + 2, y0: base + 3, y1: px[i].y - 8 };
            if (box.y0 < 0 || taken.some((b) => hit(b, box) || hit(b, lead))) continue;
            taken.push(box, lead);
            out.push({ i, y0: (base + 3) / H, y1: (px[i].y - 8) / H, label: { id: `n${i}`, text: sorted[i].label, x: x(sorted[i].value), y: yOf(levels[i]), dx: x0 - px[i].x, dy: base - px[i].y, anchor: 'start', priority: 0, size, tone: 'quiet', at: i, minWidth: WIDE } });
            done = true;
            break;
          }
        }
        if (done) break;
      }
    }
    return out;
  }
  const plot = (
    <Plot>
      <Baseline y={base} />
      {/* The subject's own label never hides under the pick ring it opens with (labelSubject), nor does its leader. */}
      {leaders.map((l) => <rect key={`ld${l.i}`} className="leader" data-scrub-i={labelSubject && l.i === subject ? undefined : l.i} x={pc(x(sorted[l.i].value))} width={1} transform="translate(-0.5 0)" y={pc(l.y0)} height={pc(Math.max(0, l.y1 - l.y0))} />)}
      {wide.map((n) => <rect key={`nl${n.i}`} className="leader w720 md-only" data-scrub-i={n.i} x={pc(x(sorted[n.i].value))} width={1} transform="translate(-0.5 0)" y={pc(n.y0)} height={pc(Math.max(0, n.y1 - n.y0))} />)}
      {sorted.map((s, i) => (
        <circle key={s.id} className={s.subject ? 'm-signal' : s.hollow ? 'm-hollow' : 'm-context'} cx={pc(x(s.value))} cy={pc(yOf(levels[i]))} r={R} />
      ))}
      <Annotation labels={labels} />
      {wide.length ? <g className="md-only"><Annotation labels={wide.map((n) => n.label)} /></g> : null}
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
    <ChartFrame className={`dot-strip${subject >= 0 ? ' has-subject' : ''}`} label={label} height={height} heightMd={heightMd}
      scrub={<Scrubber mode="pick" points={points} initial={Math.max(0, subject)} label={label} axis={axis} prompt={prompt}>{plot}</Scrubber>}
      keys={[
        ...(prompt && subject >= 0 ? [{ label: sorted[subject].label, mark: 'dot' as const, tone: 'signal' as const }] : []),
        ...(keyLabels && sorted.some((s) => s.hollow) ? [{ label: keyLabels.filled, mark: 'dot' as const, tone: 'quiet' as const }, { label: keyLabels.hollow, mark: 'hollow' as const }] : []),
      ]}
      caption={hint}
      values={values}
    />
  );
}

type Box = { x0: number; x1: number; y0: number; y1: number };
/** A placed label's text box at a given plot size, px, padded. */
function labelBox(l: PlacedLabel, W: number, H: number, pad: number): Box {
  const size = l.size ?? 14;
  const w = textWidth(l.text, size);
  const ax = l.x * W + l.dx;
  const x0 = l.anchor === 'middle' ? ax - w / 2 : l.anchor === 'end' ? ax - w : ax;
  const base = l.y * H + l.dy;
  return { x0: x0 - pad, x1: x0 + w + pad, y0: base - size * 0.78 - pad, y1: base + size * 0.22 + pad };
}
