import BigNumber from '@/components/ui/BigNumber';
import LineProfile from '@/components/viz/LineProfile';
import { getNugget, type Nugget } from '@/lib/nuggets';
import type { CourseNugget } from '@/lib/nuggets/courses';
import type { Courses } from '@/lib/insights';
import { readInsight } from '@/lib/insights-server';
import type { CoursePageData } from '@/lib/course-page';
import ByUnits from '@/components/ui/ByUnits.client';
import { sectionLabel } from '@/lib/nuggets/format';
import { SECTION_BOUNDS } from '@/lib/viz/format';
import { CourseSection, Said } from './Fact';

/**
 * "What makes {city} {city}" (the redesign spec, section 7.10; "What sets {city} apart" for a name of two words or more,
 * which would stutter over two lines): only what sets the course apart, up to three rows divided
 * by hairlines, each a figure (a reading: how far, how much slower, how far from the typical course; never a section's
 * name), the words that finish its sentence and a micro-chart of at most 48 px. One row is the section's finding, so its
 * sentence is the H2 and the row keeps its figure and chart. Orange marks the first row's chart only: one accent per
 * section. A row shows only
 * when its nugget's guard holds: a first 5K that ends 10 m or more above or below its start (that 5K's profile on its
 * own scale, over a level at the start's height), a slowest 5K unlike nearly every other course's (the nine sections
 * against the course's own average), and the 5K where its pacing parts most from the typical course's (both curves,
 * that section in signal). How well a model tells the course apart by its splits is not a runner's finding: it lives in
 * the "Name that course" game on /stories/courses.
 * A course with none of these has no glance at all (the page leaves the section out and opens on its first difference).
 */
/** A row: its figure, the words that finish its sentence and its micro-chart; alone (its sentence the H2), a wide chart. */
type Row = { id: string; figure: React.ReactNode; key: string; viz?: React.ReactNode; wide?: React.ReactNode };

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

/**
 * One row alone is the section's finding (its sentence is the H2), so it gets a chart a runner can read (critic round 5:
 * a 96 × 40 sparkline beside its caption was the smallest mark on the page): the course's pace 5K by 5K against its own
 * average (slower up, the average a solid hairline), the typical course dashed, the section the sentence names washed,
 * its point in signal and its name on it, at the column's width.
 */
function ShapeChart({ display, curve, typical, at }: { display: string; curve: number[]; typical: number[]; at: number }) {
  const span = Math.max(2, ...curve.map((v) => Math.abs(v)), ...typical.map((v) => Math.abs(v)));
  const top = Math.ceil(span + 0.5);
  const name = SECTION_BOUNDS[at] ? sectionLabel(...SECTION_BOUNDS[at]) : '';
  return (
    <LineProfile x={curve.map((_, i) => i + 0.5)} xDomain={[0, 9]} yDomain={[-top, top]}
      xTicks={[{ value: 0, label: 'Start' }, { value: 2, label: '10K' }, { value: 4, label: '20K' }, { value: 6, label: '30K' }, { value: 8, label: '40K' }]}
      refs={[{ value: 0, label: 'Average pace' }]} washes={[{ from: at, to: at + 1, fill: true }]}
      layers={[{ id: 'shape', label: display, series: [{ id: 'typical', values: typical, dashed: true }, { id: 'course', values: curve, tone: 'ink' }],
        // The row's sentence names the section, so the chart marks it (the wash and the point) without a second label,
        // which met "Average pace" at 195-320 px.
        points: [{ x: at + 0.5, y: curve[at], kind: 'reading' }] }]}
      keys={[{ label: `${display}, 5K by 5K`, mark: 'line' }, { label: 'The typical course', mark: 'dash' }]}
      label={`${display}’s pace 5K by 5K against its own average, the typical course beside it; ${name} marked`} height={132} heightMd={176} />
  );
}

function figureOf(n: Nugget) {
  return n.figure ? <BigNumber value={n.figure.value} unit={n.figure.unit} sr={n.figure.sr} size="m" /> : null;
}

type GlanceId = 'course.start' | 'course.late' | 'course.signature';

/**
 * The glance's rows for a course, in order (at most three): the ones whose guards hold. The start row stays out where
 * #elevation's finding is the same 5K (its biggest climb is 0–5K), so one 5K never reads as two different climbs a
 * screen apart; the signature row stays out where it would be about the same stretch as another row (the first 5K
 * beside the start row; a section next to the slowest 5K beside the late row), since two big section names that close
 * read as a contradiction. Exported for the page's contents row, and recounted by scripts/verify-courses.cjs.
 */
export function glanceRows(page: CoursePageData): GlanceId[] {
  const { city, sections, summary: s } = page;
  const climb = getNugget('course.climb', { city });
  let ids = (['course.start', 'course.late', 'course.signature'] as GlanceId[]).filter((id) => {
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
  const single = ids.length === 1 ? getNugget(ids[0], { city }) : null;
  const rows: Row[] = ids.map((id) => {
    const n = getNugget(id, { city }) as CourseNugget;
    if (id === 'course.start') {
      const km = n.figureKm;
      // Alone, the H2 already says how far: the row is its chart.
      const figure = single ? null : km ? <ByUnits mi={figureOf(n)} km={<BigNumber value={km.value} unit={km.unit} sr={km.sr} size="m" />} /> : figureOf(n);
      return { id, figure, key: n.key!, viz: <StartViz page={page} /> };
    }
    if (id === 'course.late') {
      const slowest = s.slowest_section ? page.sections.indexOf(s.slowest_section) : -1;
      // Alone, the H2 names the section and the usual one: the row is the wide chart, the typical course's late fade beside it.
      if (single && curve && slowest >= 0) return { id, figure: null, key: n.key!, wide: <ShapeChart display={display} curve={curve} typical={typicalCurve} at={slowest} /> };
      return { id, figure: figureOf(n), key: n.key!, viz: curve && slowest >= 0 ? <LateViz curve={curve} slowest={slowest} /> : undefined };
    }
    const at = s.signature_section ? page.sections.indexOf(s.signature_section) : -1;
    // Alone, the H2 says the one figure (critic round 4: the two curves' percentages beside it read as three numbers), so
    // the row is its chart, drawn wide.
    if (single && curve && at >= 0) return { id, figure: null, key: n.key!, wide: <ShapeChart display={display} curve={curve} typical={typicalCurve} at={at} /> };
    return { id, figure: figureOf(n), key: n.key!, viz: curve && at >= 0 ? <SignatureViz curve={curve} typical={typicalCurve} at={at} /> : undefined };
  });
  const wide = single ? rows[0].wide : null;
  return (
    <CourseSection id="at-a-glance" track="chapter-1" beat="At a glance"
      title={single ? <Said nugget={single} /> : display.includes(' ') ? <>What sets <em className="is-plain">{kept}</em> apart</> : <>What makes {kept} <em className="is-plain">{kept}</em></>}>
      {wide ? <div className="course-glance is-single is-wide">{wide}</div> : (
      <div className={`course-glance${single ? ' is-single' : ''}`}>
        <ul className="glance-rows">
          {rows.map((r, i) => (
            <li key={r.id} className={`glance-row${i > 0 ? ' is-quiet' : ''}${r.figure ? '' : ' is-chart'}`}>
              {r.figure ? <span className="glance-figure">{r.figure}</span> : null}
              {single ? null : <span className="glance-key">{r.key}</span>}
              {r.viz ? <span className="glance-chart">{r.viz}</span> : null}
            </li>
          ))}
        </ul>
      </div>
      )}
    </CourseSection>
  );
}
