import ChartFrame from './ChartFrame';
import Axis from './Axis';
import Plot from './Plot';
import { placeLabels, type LabelItem } from './labels';
import Annotation from './Annotation';
import { linear, pc } from './scale';

/**
 * A one-line scale (the redesign spec, section 3.5): a hairline from `min` to `max` with four or five ticks. Marks: the
 * reading as a signal dot, typical or expected as a hollow ring, a comparison as an ink dot, you as an orange ring.
 * Their labels sit above, placed clear of each other.
 */
export type RulerMark = { value: number; kind: 'reading' | 'typical' | 'compare' | 'you'; label?: string };

const TRACK_Y = 0.8;

export default function Ruler({ min, max, ticks, marks, label, className }: {
  min: number; max: number; ticks: { value: number; label: string }[]; marks: RulerMark[]; label: string; className?: string;
}) {
  const x = linear([min, max]);
  const order = { reading: 4, you: 3, compare: 2, typical: 1 } as const;
  const items: LabelItem[] = marks.filter((m) => m.label).map((m, i) => ({ id: String(i), text: m.label!, x: x(m.value), y: TRACK_Y, priority: order[m.kind], size: m.kind === 'reading' ? 14 : 13, gap: 12, tone: m.kind === 'reading' ? 'signal' : m.kind === 'typical' ? 'quiet' : 'ink' }));
  const placed = placeLabels(items, { height: 48, avoid: marks.map((m) => ({ x: x(m.value), y: TRACK_Y, r: 7 })) }).map((l) => (l.dy > 0 ? { ...l, minWidth: null } : l));
  return (
    <ChartFrame className={`ruler${className ? ` ${className}` : ''}`} label={label} height={48} heightMd={48}
      plot={(
        <Plot>
          <rect className="ruler-track" x="0" y={pc(TRACK_Y)} width="100%" height="1" />
          {[...marks].sort((a, b) => order[a.kind] - order[b.kind]).map((m, i) => {
            const cx = pc(x(m.value)), cy = pc(TRACK_Y);
            if (m.kind === 'typical') return <circle key={i} className="m-hollow" cx={cx} cy={cy} r={5.5} />;
            if (m.kind === 'you') return <circle key={i} className="m-ring" cx={cx} cy={cy} r={7} />;
            return <circle key={i} className={m.kind === 'reading' ? 'm-signal' : 'm-ink'} cx={cx} cy={cy} r={6} />;
          })}
          <Annotation labels={placed} />
        </Plot>
      )}
      axis={<Axis ticks={ticks.map((t) => ({ x: x(t.value), label: t.label }))} />}
    />
  );
}
