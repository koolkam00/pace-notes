import BigNumber from '@/components/ui/BigNumber';
import { Elevation } from '@/components/story/Units';
import { getNugget, type Nugget } from '@/lib/nuggets';
import type { CourseNugget } from '@/lib/nuggets/courses';
import { hm } from '@/lib/nuggets/format';
import type { CoursePageData } from '@/lib/course-page';
import ByUnits from './ByUnits.client';
import { CourseSection, Fact } from './Fact';

/**
 * "What makes {city} {city}" (the redesign spec, section 7.10): up to three nugget rows divided by hairlines, each a
 * figure, the words that finish its sentence and a micro-chart of at most 48 px: the first 5K's drop or climb (the
 * route's profile on the shared height scale, the first 5K in signal), the slowest 5K (the nine sections against the
 * course's own average), and how often its pacing shape alone picked the course out (one dot per edition). A course
 * without a route or a shape fills in with its climb and its median finish, so the section is never thin.
 */
type Row = { id: string; figure: React.ReactNode; key: string; viz?: React.ReactNode };

const W = 96, H = 40;

/** The profile with the first 5K in signal, on the shared height scale (so a flat start draws flat). */
function StartViz({ page }: { page: CoursePageData }) {
  const g = page.geometry!;
  const n = g.elevation_m.length;
  const floor = Math.min(...g.elevation_m);
  const x = (i: number) => (i / Math.max(1, n - 1)) * W;
  const y = (m: number) => H - 3 - ((H - 6) * (m - floor)) / page.relief;
  const pts = g.elevation_m.map((m, i) => [x(i), y(m)] as const);
  const line = (p: readonly (readonly [number, number])[]) => p.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join('');
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

function figureOf(n: Nugget) {
  return n.figure ? <BigNumber value={n.figure.value} unit={n.figure.unit} sr={n.figure.sr} size="m" /> : null;
}

export default function CourseGlance({ page }: { page: CoursePageData }) {
  const { city, display, summary: s, geometry } = page;
  // A two-word city stays on one line, so a long name breaks between the two, never inside one.
  const kept = display.replace(/ /g, '\u00a0');
  const start = getNugget('course.start', { city }) as CourseNugget;
  const late = getNugget('course.late', { city });
  const shape = getNugget('course.shape', { city });
  const rows: Row[] = [];
  if (start.figure && geometry) {
    const km = start.figureKm;
    rows.push({
      id: 'start',
      figure: km ? <ByUnits mi={figureOf(start)} km={<BigNumber value={km.value} unit={km.unit} sr={km.sr} size="m" />} /> : figureOf(start),
      key: start.key!,
      viz: <StartViz page={page} />,
    });
  }
  if (late.guard && late.figure) {
    const curve = s.curve ?? [];
    const slowest = s.slowest_section ? page.sections.indexOf(s.slowest_section) : -1;
    rows.push({ id: 'late', figure: figureOf(late), key: late.key!, viz: curve.length === 9 && slowest >= 0 ? <LateViz curve={curve} slowest={slowest} /> : undefined });
  }
  if (shape.guard && s.identified) rows.push({ id: 'shape', figure: figureOf(shape), key: shape.key!, viz: <ShapeViz correct={s.identified.correct} editions={s.identified.editions} /> });
  // Fill-ins for a course without a route or a shape: its whole climb, then its median finish.
  if (rows.length < 3 && geometry && !rows.some((r) => r.id === 'start')) {
    rows.push({ id: 'climb', figure: <span className="big-number is-m"><Fact k="geo.gain" v={geometry.gain_m}><Elevation metres={geometry.gain_m} /></Fact></span>, key: 'of climbing, start to finish' });
  }
  if (rows.length < 3) rows.push({ id: 'median', figure: <BigNumber value={hm(s.median_s / 60)} sr={`median finish ${hm(s.median_s / 60)}`} size="m" />, key: 'the median finish in an average edition' });
  return (
    <CourseSection id="at-a-glance" track="chapter-1" beat="At a glance" title={<>What makes {kept} <em>{kept}</em></>}>
      <div className="course-glance">
        <ul className="glance-rows">
          {rows.slice(0, 3).map((r) => (
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
