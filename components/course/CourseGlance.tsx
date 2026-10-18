import BigNumber from '@/components/ui/BigNumber';
import { getNugget, type Nugget } from '@/lib/nuggets';
import type { CourseNugget } from '@/lib/nuggets/courses';
import type { Courses } from '@/lib/insights';
import { readInsight } from '@/lib/insights-server';
import type { CoursePageData } from '@/lib/course-page';
import ByUnits from './ByUnits.client';
import { CourseSection, Said } from './Fact';

/**
 * "What makes {city} {city}" (the redesign spec, section 7.10): only what sets the course apart, up to three rows divided
 * by hairlines, each a figure, the words that finish its sentence and a micro-chart of at most 48 px. A row shows only
 * when its nugget's guard holds: a first 5K that ends 10 m or more above or below its start (that 5K's profile on its
 * own scale, over a level at the start's height), a slowest 5K unlike nearly every other course's (the nine sections
 * against the course's own average), 5K splits that told the course apart in nine of ten of its editions or more (a dot
 * per edition), and the 5K where its pacing parts most from the typical course's (both curves, that section in signal).
 * A course with none of these has no glance at all (the page leaves the section out and opens on its first difference).
 */
type Row = { id: string; figure: React.ReactNode; key: string; viz?: React.ReactNode };

const W = 96, H = 40;
const line = (p: readonly (readonly [number, number])[]) => p.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join('');

/**
 * The first 5K alone, on its own height scale: the profile from a dot at the start to a dot at 5K, in signal, over a
 * dashed level at the start's height, so the end sits plainly below it (or above). The figure beside it says how far.
 */
function StartViz({ page }: { page: CoursePageData }) {
  const g = page.geometry!;
  const cut = Math.min(g.elevation_m.length - 1, Math.max(1, Math.round(5 / g.elevation_step_km)));
  const first = g.elevation_m.slice(0, cut + 1);
  const lo = Math.min(...first), hi = Math.max(...first);
  const pad = 6;
  const x = (i: number) => pad + (i / cut) * (W - 2 * pad);
  const y = (m: number) => pad + ((H - 2 * pad) * (hi - m)) / Math.max(1, hi - lo);
  const pts = first.map((m, i) => [x(i), y(m)] as const);
  const end = pts[pts.length - 1];
  return (
    <svg className="glance-viz" viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true" focusable="false">
      <line className="glance-level" x1={pad} x2={W - pad} y1={pts[0][1]} y2={pts[0][1]} />
      <path className="glance-signal" d={line(pts)} />
      <circle className="glance-start" cx={pts[0][0]} cy={pts[0][1]} r="3" />
      <circle className="glance-point" cx={end[0]} cy={end[1]} r="3.5" />
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

/**
 * The glance's rows for a course, in order, at most three: the ones whose guards hold. The start row stays out where
 * #elevation's finding is the same 5K (its biggest climb is 0–5K), so one 5K never reads as two different climbs a
 * screen apart; the signature row stays out where it would be about the same stretch as another row (the first 5K
 * beside the start row; a section next to the slowest 5K beside the late row), since two big section names that close
 * read as a contradiction. Exported for the page's contents row, and recounted by scripts/verify-courses.cjs.
 */
export function glanceRows(page: CoursePageData): GlanceId[] {
  const { city, sections, summary: s } = page;
  const climb = getNugget('course.climb', { city });
  let ids = (['course.start', 'course.late', 'course.shape', 'course.signature'] as GlanceId[]).filter((id) => {
    const n = getNugget(id, { city });
    return n.guard && !!n.figure && (id !== 'course.start' || (!!page.geometry && !(climb.guard && Number(climb.values.section) === 0)));
  });
  const sig = s.signature_section ? sections.indexOf(s.signature_section) : -1;
  const slowest = s.slowest_section ? sections.indexOf(s.slowest_section) : -1;
  if (ids.includes('course.signature') && ((ids.includes('course.late') && Math.abs(sig - slowest) <= 1) || (ids.includes('course.start') && sig === 0))) {
    ids = ids.filter((id) => id !== 'course.signature');
  }
  return ids.slice(0, 3);
}

export default function CourseGlance({ page }: { page: CoursePageData }) {
  const { city, display, summary: s } = page;
  const ids = glanceRows(page);
  const typicalCurve = readInsight<Courses>('courses.json').typical_curve;
  const curve = s.curve?.length === 9 ? s.curve : null;
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
