import ChartFrame from './ChartFrame';
import Axis from './Axis';
import Plot from './Plot';
import { FIT_STEPS, REF_WIDTH, placeLabels, textWidth, type LabelItem } from './labels';
import Annotation from './Annotation';
import { linear, pc } from './scale';

/**
 * A one-line scale (the redesign spec, section 3.5): a hairline from `min` to `max` with four or five ticks. Marks: the
 * reading as a signal dot, typical or expected as a hollow ring, a comparison as an ink dot, you as an orange ring.
 * With ticks, every label sits above the line and the ticks directly under it (8 px), so the scale reads as one
 * instrument: labels, line, ticks. Without ticks (the line alone), comparisons' and typical's labels sit below it on
 * two lines (the name, then its value), each turned away from the reading (a mark left of it reads leftwards, one right
 * of it rightwards), so long names ("Recorded women" / "4:30") fit beside each other. A label that would leave the plot
 * at a narrow width hides there (it stays in the sentence). An optional `band` lays a range (the middle 80% of
 * finishes) on the line as a quiet bar under the marks.
 */
export type RulerMark = { value: number; kind: 'reading' | 'typical' | 'compare' | 'you'; label?: string };

/** Labels above and below the line (no ticks): the line a third of the way down. */
const HEIGHT = 80;
const TRACK = 30;
/** Labels above, ticks under (8 px from the line to the plot's foot, where the axis starts). */
const TIGHT = 46;
const TIGHT_TRACK = 38;
const SIZE = 13;

export default function Ruler({ min, max, ticks, marks, label, className, band }: {
  min: number; max: number; ticks: { value: number; label: string }[]; marks: RulerMark[]; label: string; className?: string;
  /** A range drawn on the line under the marks (lo and hi on the scale's own values). */
  band?: { lo: number; hi: number };
}) {
  const x = linear([min, max]);
  const tight = ticks.length > 0;
  const height = tight ? TIGHT : HEIGHT;
  const TRACK_Y = (tight ? TIGHT_TRACK : TRACK) / height;
  const order = { reading: 4, you: 3, compare: 2, typical: 1 } as const;
  const top = marks.filter((m) => m.label && (tight || m.kind === 'reading' || m.kind === 'you'));
  const items: LabelItem[] = top.map((m, i) => ({ id: `t${i}`, text: m.label!, x: x(m.value), y: TRACK_Y, priority: order[m.kind], size: m.kind === 'reading' ? 14 : SIZE, gap: 12, tone: m.kind === 'reading' ? 'signal' : m.kind === 'typical' ? 'quiet' : 'ink', prefer: 'above' }));
  const above = placeLabels(items, { height, avoid: marks.map((m) => ({ x: x(m.value), y: TRACK_Y, r: 7 })) }).map((l) => (l.dy > 0 ? { ...l, minWidth: null } : l));
  // Without ticks, under the line on two lines: each label reads away from the reading, from 4 px past its dot's centre.
  const pivot = x(marks.find((m) => m.kind === 'reading')?.value ?? (min + max) / 2);
  const below = (tight ? [] : marks).filter((m) => m.label && (m.kind === 'compare' || m.kind === 'typical')).map((m, i) => {
    const text = m.label!, cut = text.lastIndexOf(' ');
    const lines = cut > 0 ? [text.slice(0, cut), text.slice(cut + 1)] : [text];
    const f = x(m.value), w = Math.max(...lines.map((l) => textWidth(l, SIZE)));
    // Away from the reading, unless that side has no room at the reference width and the other does (a mark near an end).
    const room = (toLeft: boolean) => (w - 4) / Math.max(0.01, toLeft ? f : 1 - f);
    const away = f < pivot || (f === pivot && f > 0.5);
    const left = room(away) > REF_WIDTH && room(!away) <= REF_WIDTH ? !away : away;
    const need = room(left);
    const fit = need <= FIT_STEPS[0] - 1 ? '' : (FIT_STEPS.find((st) => st >= need) ? `w${FIT_STEPS.find((st) => st >= need)}` : 'w-never');
    return { key: `b${i}`, lines, f, left, fit, quiet: m.kind === 'typical' };
  });
  return (
    <ChartFrame className={`ruler${tight ? ' is-tight' : ''}${className ? ` ${className}` : ''}`} label={label} height={height} heightMd={height}
      plot={(
        <Plot>
          <rect className="ruler-track" x="0" y={pc(TRACK_Y)} width="100%" height="1" />
          {band ? <rect className="a-band" x={pc(Math.max(0, x(band.lo)))} y={pc(TRACK_Y)} width={pc(Math.max(0, Math.min(1, x(band.hi)) - Math.max(0, x(band.lo))))} height="10" rx="5" transform="translate(0 -4.5)" /> : null}
          {[...marks].sort((a, b) => order[a.kind] - order[b.kind]).map((m, i) => {
            const cx = pc(x(m.value)), cy = pc(TRACK_Y);
            if (m.kind === 'typical') return <circle key={i} className="m-hollow" cx={cx} cy={cy} r={5.5} />;
            if (m.kind === 'you') return <circle key={i} className="m-ring" cx={cx} cy={cy} r={7} />;
            return <circle key={i} className={m.kind === 'reading' ? 'm-signal' : 'm-ink'} cx={cx} cy={cy} r={6} />;
          })}
          <Annotation labels={above} />
          {below.map((b) => (
            <text key={b.key} className={`viz-label is-sm${b.quiet ? ' is-quiet' : ''}${b.fit ? ` ${b.fit}` : ''}`} x={pc(b.f)} y={pc(TRACK_Y)} textAnchor={b.left ? 'end' : 'start'}>
              {/* 4 px past the dot's centre, held inside the plot at either end (a mark at the scale's zero). */}
              {b.lines.map((line, k) => <tspan key={k} x={pc(b.f)} dx={b.left ? Math.min(4, (1 - b.f) * REF_WIDTH) : -Math.min(4, b.f * REF_WIDTH)} dy={k ? SIZE + 3 : 10 + SIZE * 0.78}>{line}</tspan>)}
            </text>
          ))}
        </Plot>
      )}
      axis={tight ? <Axis ticks={ticks.map((t) => ({ x: x(t.value), label: t.label }))} /> : undefined}
    />
  );
}
