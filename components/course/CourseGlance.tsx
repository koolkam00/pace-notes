import BigNumber from '@/components/ui/BigNumber';
import LineProfile from '@/components/viz/LineProfile';
import { getNugget, type Nugget } from '@/lib/nuggets';
import { SIGNATURE_MIN, type CourseNugget } from '@/lib/nuggets/courses';
import type { Courses } from '@/lib/insights';
import { readInsight } from '@/lib/insights-server';
import type { CoursePageData } from '@/lib/course-page';
import ByUnits from './ByUnits.client';
import { CourseSection, Said } from './Fact';

/**
 * "What makes {city} {city}" (the redesign spec, section 7.10): only what sets the course apart, up to three rows divided
 * by hairlines, each a figure, the words that finish its sentence and a micro-chart of at most 48 px. A row shows only
 * when its nugget's guard holds: a first 5K that ends 10 m or more above or below its start (the route's profile on the
 * shared height scale, the first 5K in signal), a slowest 5K unlike nearly every other course's (the nine sections
 * against the course's own average), a pacing shape that picked the course out in three of four editions or more (a dot
 * per edition), and the 5K where its pacing parts most from the typical course's (both curves, that section in signal).
 * A course with none of these that paces within 2 points of the typical course everywhere says so, over the two curves;
 * a course without enough editions to say either has no glance at all (the page leaves the section out).
 */
type Row = { id: string; figure: React.ReactNode; key: string; viz?: React.ReactNode };

const W = 96, H = 40;
const line = (p: readonly (readonly [number, number])[]) => p.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join('');

/** The profile with the first 5K in signal, on the shared height scale (so a flat start draws flat). */
function StartViz({ page }: { page: CoursePageData }) {
  const g = page.geometry!;
  const n = g.elevation_m.length;
  const floor = Math.min(...g.elevation_m);
  const x = (i: number) => (i / Math.max(1, n - 1)) * W;
  const y = (m: number) => H - 3 - ((H - 6) * (m - floor)) / page.relief;
  const pts = g.elevation_m.map((m, i) => [x(i), y(m)] as const);
  const cut = Math.max(1, Math.round(5 / g.elevation_step_km));
  return (
    <svg className="glance-viz" viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true" focusable="false">
      <path className="glance-line" d={line(pts)} />
      <path className="glance-signal" d={line(pts.slice(0, cut + 1))} />
    </svg>
  );
}

/** Nine bars: each 5K section against the course's own average pace, the slowest in signal. */
function LateViz({ curve, slowest }: { curve: number[]; slowest: number }) {
  const span = Math.max(1, ...curve.map((v) => Math.abs(v)));
  const bw = W / curve.length;
  const mid = H / 2;
  return (
    <svg className="glance-viz" viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true" focusable="false">
      <rect className="glance-axis" x="0" y={mid - 0.5} width={W} height="1" />
      {curve.map((v, i) => {
        const h = Math.max(1.5, (Math.abs(v) / span) * (mid - 2));
        return <rect key={i} className={i === slowest ? 'glance-bar is-signal' : 'glance-bar'} x={i * bw + 1} width={bw - 2} y={v > 0 ? mid - h : mid} height={h} rx="1" />;
      })}
    </svg>
  );
}

/** One dot per edition tested; those the course was picked out in are filled. */
function ShapeViz({ correct, editions }: { correct: number; editions: number }) {
  const per = Math.min(editions, 11);
  const rows = Math.ceil(editions / per);
  const step = Math.min(W / per, 9);
  return (
    <svg className="glance-viz" viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true" focusable="false">
      {Array.from({ length: editions }, (_, i) => (
        <circle key={i} className={i < correct ? 'glance-dot is-on' : 'glance-dot'} cx={W - (per - (i % per) - 0.5) * step} cy={H / 2 - ((rows - 1) * step) / 2 + Math.floor(i / per) * step} r={step / 2 - 1.2} />
      ))}
    </svg>
  );
}

/** The course's pace by section (ink) over the typical course's (dashed), on one scale; the section it parts most in signal. */
function SignatureViz({ curve, typical, at }: { curve: number[]; typical: number[]; at: number }) {
  const span = Math.max(1, ...curve.map((v) => Math.abs(v)), ...typical.map((v) => Math.abs(v)));
  const x = (i: number) => 3 + (i / 8) * (W - 6);
  const y = (v: number) => H / 2 - (v / span) * (H / 2 - 4);
  return (
    <svg className="glance-viz" viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true" focusable="false">
      <path className="glance-typical" d={line(typical.map((v, i) => [x(i), y(v)] as const))} />
      <path className="glance-course" d={line(curve.map((v, i) => [x(i), y(v)] as const))} />
      <circle className="glance-point" cx={x(at)} cy={y(curve[at])} r="3.5" />
    </svg>
  );
}

function figureOf(n: Nugget) {
  return n.figure ? <BigNumber value={n.figure.value} unit={n.figure.unit} sr={n.figure.sr} size="m" /> : null;
}

type GlanceId = 'course.start' | 'course.late' | 'course.shape' | 'course.signature';

/** The glance's rows for a course, in order, at most three: the ones whose guards hold. Exported for the page's contents row. */
export function glanceRows(page: CoursePageData): { ids: GlanceId[]; typical: boolean } {
  const { city } = page;
  const ids = (['course.start', 'course.late', 'course.shape', 'course.signature'] as GlanceId[]).filter((id) => {
    const n = getNugget(id, { city });
    return n.guard && !!n.figure && (id !== 'course.start' || !!page.geometry);
  }).slice(0, 3);
  const typical = !ids.length && Number(getNugget('course.signature', { city }).values.typical_like) === 1;
  return { ids, typical };
}

export default function CourseGlance({ page }: { page: CoursePageData }) {
  const { city, display, summary: s } = page;
  const { ids, typical } = glanceRows(page);
  const signature = getNugget('course.signature', { city });
  const typicalCurve = readInsight<Courses>('courses.json').typical_curve;
  const curve = s.curve?.length === 9 ? s.curve : null;
  if (typical && curve) {
    // Nothing sets the course apart: it says so, over its pace by section and the typical course's.
    const mid = [2.5, 7.5, 12.5, 17.5, 22.5, 27.5, 32.5, 37.5, 41.1];
    return (
      <CourseSection id="at-a-glance" track="chapter-1" beat="At a glance" title={<Said nugget={signature} />}>
        <div className="course-glance">
          <LineProfile x={mid} xDomain={[0, 42.195]} xTicks={[{ value: 0, label: 'Start' }, { value: 10, label: '10K' }, { value: 20, label: '20K' }, { value: 30, label: '30K' }, { value: 40, label: '40K' }]}
            layers={[{ id: 'shape', label: display, series: [{ id: 'typical', values: typicalCurve, dashed: true }, { id: 'course', values: curve }] }]}
            refs={[{ value: 0, label: 'Its average pace' }]}
            keys={[{ label: display, mark: 'line' }, { label: 'The typical course', mark: 'dash' }]}
            label={`${display}'s pace in each 5K section against its own average, over the typical course's: no section ${SIGNATURE_MIN} points apart or more`} height={120} heightMd={170} />
        </div>
      </CourseSection>
    );
  }
  if (!ids.length) return null;
  const kept = display.replace(/ /g, '\u00a0');
  const rows: Row[] = ids.map((id) => {
    const n = getNugget(id, { city }) as CourseNugget;
    if (id === 'course.start') {
      const km = n.figureKm;
      return { id, figure: km ? <ByUnits mi={figureOf(n)} km={<BigNumber value={km.value} unit={km.unit} sr={km.sr} size="m" />} /> : figureOf(n), key: n.key!, viz: <StartViz page={page} /> };
    }
    if (id === 'course.late') {
      const slowest = s.slowest_section ? page.sections.indexOf(s.slowest_section) : -1;
      return { id, figure: figureOf(n), key: n.key!, viz: curve && slowest >= 0 ? <LateViz curve={curve} slowest={slowest} /> : undefined };
    }
    if (id === 'course.shape') return { id, figure: figureOf(n), key: n.key!, viz: s.identified ? <ShapeViz correct={s.identified.correct} editions={s.identified.editions} /> : undefined };
    const at = s.signature_section ? page.sections.indexOf(s.signature_section) : -1;
    return { id, figure: figureOf(n), key: n.key!, viz: curve && at >= 0 ? <SignatureViz curve={curve} typical={typicalCurve} at={at} /> : undefined };
  });
  return (
    <CourseSection id="at-a-glance" track="chapter-1" beat="At a glance" title={<>What makes {kept} <em>{kept}</em></>}>
      <div className="course-glance">
        <ul className="glance-rows">
          {rows.map((r) => (
            <li key={r.id} className="glance-row">
              <span className="glance-figure">{r.figure}</span>
              <span className="glance-key">{r.key}</span>
              {r.viz ? <span className="glance-chart">{r.viz}</span> : null}
            </li>
          ))}
        </ul>
      </div>
    </CourseSection>
  );
}
