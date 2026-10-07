'use client';

import { useMemo, useRef, useState } from 'react';
import { useUnits } from '@/components/UnitsProvider';
import { useWidth } from '@/components/viz/useSize';
import type { CourseGeometry, CourseSummary, Courses } from '@/lib/insights';
import { count, paceColour, sectionLabel } from '@/lib/viz/format';
import { RouteMap } from './CourseArt';
import { useStoryData } from './StoryData';

const SLOWER = '#FF5B2E';
const FASTER = '#2F5BFF';

function signed(v: number, digits = 1) {
  const r = Number(v.toFixed(digits));
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toFixed(digits)}`;
}

/** Course context that is not measured in the data. Shown only as labelled notes. */
const CONTEXT: Record<string, (u: 'mi' | 'km') => string> = {
  'New York': (u) => `Course context, not measured here: ${sectionLabel(4, u)} takes in the Pulaski Bridge and the climb onto the Queensboro Bridge. The supplied elevation file reads the bridge decks as water level.`,
  Boston: (u) => `Course context, not measured here: the Newton hills, ending with Heartbreak Hill, fall between about ${u === 'mi' ? '16 and 21 mi' : '26 and 34 km'}. The ${sectionLabel(7, u)} section runs downhill towards the city.`,
};
const SECTION_NAMES = ['0–5', '5–10', '10–15', '15–20', '20–25', '25–30', '30–35', '35–40', '40–42.2'];

const BOUNDS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 42.195];

/** Section labels under a nine-column chart: ranges when there is room, boundary distances when narrow. */
export function SectionAxis({ left, cw, y, units }: { left: number; cw: number; y: number; units: 'mi' | 'km' }) {
  if (cw >= 62) {
    return <>{Array.from({ length: 9 }, (_, i) => <text key={i} x={left + cw * (i + 0.5)} y={y} textAnchor="middle">{sectionLabel(i, units).replace(' km', '').replace(' mi', '')}</text>)}</>;
  }
  const v = (km: number) => (units === 'mi' ? km / 1.609344 : km);
  return (
    <>
      {BOUNDS.map((km, i) => ((i % 2 === 0 && i !== 8) || i === 9 ? (
        <g key={km}>
          <line x1={left + cw * i} x2={left + cw * i} y1={y - 14} y2={y - 10} stroke="#B9AE98" />
          <text x={left + cw * i} y={y} textAnchor={i === 0 ? 'start' : i === 9 ? 'end' : 'middle'}>{km === 0 ? '0' : v(km).toFixed(1).replace(/\.0$/, '')}{i === 9 ? ` ${units}` : ''}</text>
        </g>
      ) : null))}
    </>
  );
}

function shapeCourses(data: Courses) {
  return data.courses.filter((c): c is ShapedCourse => Array.isArray(c.curve));
}

/** A strip of nine section cells coloured by deviation from the typical curve. */
function Strip({ values, span = 6, height = 14 }: { values: number[]; span?: number; height?: number }) {
  return (
    <svg className="fp-strip" viewBox={`0 0 ${values.length * 10} 10`} preserveAspectRatio="none" height={height} width="100%" aria-hidden="true">
      {values.map((v, i) => <rect key={i} x={i * 10 + 0.4} y={0} width={9.2} height={10} rx={1.4} fill={paceColour(v, span)} />)}
    </svg>
  );
}

type ShapedCourse = CourseSummary & Required<Pick<CourseSummary, 'curve' | 'deviation' | 'signature'>>;

/** One course's median pace curve against the typical curve, with the most distinctive section marked. */
export function CourseCurve({ course, typical, height = 280 }: { course: ShapedCourse; typical: number[]; height?: number }) {
  const { units } = useUnits();
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref, 760);
  const m = { l: 44, r: 12, t: 18, b: 34 };
  const H = height;
  const iw = width - m.l - m.r;
  const cw = iw / 9;
  const all = [...typical, ...course.curve];
  const lo = Math.min(-8, Math.floor(Math.min(...all) / 2) * 2 - 1);
  const hi = Math.max(12, Math.ceil(Math.max(...all) / 2) * 2 + 1);
  const y = (v: number) => m.t + ((hi - v) / (hi - lo)) * (H - m.t - m.b);
  const cx = (i: number) => m.l + cw * (i + 0.5);
  const line = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${cx(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const k = course.deviation.reduce((best, v, i) => (Math.abs(v) > Math.abs(course.deviation[best]) ? i : best), 0);
  const ticks = [];
  for (let v = Math.ceil(lo / 4) * 4; v <= hi; v += 4) ticks.push(v);
  return (
    <div ref={ref} className="viz">
      <svg width={width} height={H} role="img" aria-label={`${course.city}: the most distinctive section is ${course.signature_section} km, ${signed(course.deviation[k])} points against the typical curve.`}>
        {ticks.map((v) => <g key={v} className="grid"><line x1={m.l} x2={width - m.r} y1={y(v)} y2={y(v)} /><text x={m.l - 8} y={y(v) + 4} textAnchor="end">{v > 0 ? `+${v}` : v}%</text></g>)}
        <line x1={m.l} x2={width - m.r} y1={y(0)} y2={y(0)} stroke="#B9AE98" />
        {course.deviation.map((d, i) => (
          <rect key={i} x={cx(i) - cw * 0.32} width={cw * 0.64} y={Math.min(y(typical[i]), y(course.curve[i]))} height={Math.max(1, Math.abs(y(course.curve[i]) - y(typical[i])))}
            rx={3} fill={d > 0 ? SLOWER : FASTER} opacity={i === k ? 0.5 : 0.22} />
        ))}
        <path d={line(typical)} fill="none" stroke="#8C836F" strokeWidth={2} strokeDasharray="5 5" />
        <path d={line(course.curve)} fill="none" stroke="var(--ink)" strokeWidth={2.6} />
        {course.curve.map((v, i) => <circle key={i} cx={cx(i)} cy={y(v)} r={i === k ? 6 : 4} fill={i === k ? (course.deviation[i] > 0 ? SLOWER : FASTER) : 'var(--ink)'} stroke="#FFFDF8" strokeWidth={2} />)}
        <text className="annotation" x={cx(k)} y={Math.min(y(course.curve[k]), y(typical[k])) - 12} textAnchor="middle">{signed(course.deviation[k])} pts</text>
        <text className="annotation-sub" x={cx(0) - cw * 0.4} y={y(typical[0]) + 22}>typical</text>
        <SectionAxis left={m.l} cw={cw} y={H - 12} units={units} />
        {cw >= 62 ? <text x={width - m.r} y={H} textAnchor="end" className="annotation-sub">{units === 'mi' ? 'miles' : 'km'}</text> : null}
      </svg>
    </div>
  );
}

/** Deviation from the typical curve, overall and by finish band. */
export function BandStrips({ course }: { course: ShapedCourse }) {
  return (
    <div className="fp-bands" role="table" aria-label={`${course.city} deviation from the typical curve, by finish band`}>
      <div role="row" className="fp-band-row fp-band-head"><span role="columnheader">Finish band</span><span role="columnheader">Each section against typical: blue faster, orange slower</span></div>
      <div role="row" className="fp-band-row"><span role="cell">All finishes</span><span role="cell"><Strip values={course.deviation} /></span></div>
      {course.bands?.map((b) => <div key={b.band} role="row" className="fp-band-row"><span role="cell">{b.band}</span><span role="cell"><Strip values={b.deviation} /></span></div>)}
    </div>
  );
}

export function courseNote(course: ShapedCourse, units: 'mi' | 'km') {
  const k = course.deviation.reduce((best, v, i) => (Math.abs(v) > Math.abs(course.deviation[best]) ? i : best), 0);
  const slowest = SECTION_NAMES.indexOf(course.slowest_section ?? '');
  return `${course.city}'s most distinctive section is ${sectionLabel(k, units)}, ${Math.abs(course.deviation[k]).toFixed(1)} points ${course.deviation[k] > 0 ? 'slower' : 'faster'} than the typical curve. Its slowest 5 km section is ${slowest >= 0 ? sectionLabel(slowest, units) : course.slowest_section}. ${CONTEXT[course.city]?.(units) ?? ''}`;
}

/** Every course's pace curve against the typical marathon, with the signature by finish band. */
export function Fingerprints({ data: given, geometry: givenGeometry }: { data?: Courses; geometry?: CourseGeometry[] }) {
  const data = useStoryData('courses', given);
  const geometry = useStoryData('geometry', givenGeometry);
  const courses = shapeCourses(data);
  const [city, setCity] = useState('New York');
  const course = courses.find((c) => c.city === city) ?? courses[0];
  const geo = geometry.find((g) => g.city === course.city);
  const { units } = useUnits();
  return (
    <div className="viz-card fingerprints">
      <div className="fp-layout">
        <div className="fp-side">
          <p className="viz-title">{course.city === 'New York' ? 'New York City' : course.city}</p>
          <p className="viz-sub">{course.race}</p>
          {geo ? <div className="fp-route"><RouteMap course={geo} size={220} stroke="#15171C" label={`Supplied ${course.city} route`} /></div> : <div className="fp-route fp-route-missing">No supplied route file</div>}
          <dl className="fp-stats">
            <div><dt>Editions</dt><dd>{course.editions}{course.shape_editions !== course.editions ? <small>{course.shape_editions} used for pace shape</small> : null}</dd></div>
            <div><dt>Finishes</dt><dd>{count(course.finishes)}</dd></div>
            <div><dt>Late fade vs typical</dt><dd>{course.fade?.toFixed(2)}×</dd></div>
            <div><dt>Named by shape</dt><dd>{course.identified ? `${course.identified.correct}/${course.identified.editions}` : '—'}</dd></div>
          </dl>
        </div>
        <div className="fp-main">
          <div className="viz-head">
            <div><p className="viz-title">Pace by section, against the typical marathon</p><p className="viz-sub">Median finisher, % slower (+) or faster (−) than their own average pace</p></div>
          </div>
          <CourseCurve course={course} typical={data.typical_curve} />
          <BandStrips course={course} />
          <p className="viz-note">{courseNote(course, units)} Late fade: how strongly this course bends the typical pace curve (1.00× = typical).</p>
        </div>
      </div>
      <div className="fp-grid" role="group" aria-label="Choose a course">
        {courses.map((c) => {
          const g = geometry.find((x) => x.city === c.city);
          return (
            <button key={c.city} type="button" className="fp-chip" aria-pressed={c.city === course.city} onClick={() => setCity(c.city)}>
              <span className="fp-chip-route">{g ? <RouteMap course={g} size={64} animate={false} stroke="currentColor" label="" /> : null}</span>
              <span className="fp-chip-name">{c.city}</span>
              <Strip values={c.deviation} height={8} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Deterministic sequence of mystery editions (no Math.random during render). The step is coprime with n, so every edition appears once before any repeats. */
function nextIndex(i: number, n: number) {
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  let step = 37;
  while (gcd(step, n) !== 1) step += 1;
  return (i + step) % n;
}

function distractors(truth: string, model: string, pool: string[], seed: number) {
  const out = new Set<string>([truth]);
  if (model !== truth) out.add(model);
  let s = seed;
  while (out.size < 4) {
    s = (s * 1103515245 + 12345) % 2147483648;
    out.add(pool[s % pool.length]);
  }
  const list = [...out];
  // stable shuffle by seed
  return list.map((c, i) => ({ c, k: (seed * (i + 7) * 2654435761) % 4294967296 })).sort((a, b) => a.k - b.k).map((x) => x.c);
}

/** A guessing game: one edition's fade-removed pace signature; which course was it? */
export function NameThatCourse({ data: given, geometry: givenGeometry }: { data?: Courses; geometry?: CourseGeometry[] }) {
  const data = useStoryData('courses', given);
  const geometry = useStoryData('geometry', givenGeometry);
  const id = data.identification;
  const pool = useMemo(() => [...new Set(id.editions.map((e) => e.city))].sort(), [id]);
  const start = Math.max(0, id.editions.findIndex((e) => e.city === 'Boston'));
  const [i, setI] = useState(start);
  const [guess, setGuess] = useState<string | null>(null);
  const [score, setScore] = useState({ right: 0, played: 0 });
  const { units } = useUnits();
  const e = id.editions[i];
  const options = useMemo(() => distractors(e.city, e.predicted, pool, i + 3), [e, pool, i]);
  const centroid = data.courses.find((c) => c.city === e.city)?.signature;
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref, 520);
  const H = 190;
  const m = { l: 8, r: 8, t: 14, b: 26 };
  const cw = (width - m.l - m.r) / 9;
  const span = Math.max(6, ...e.signature.map(Math.abs), ...(centroid ?? []).map(Math.abs));
  const y = (v: number) => m.t + ((span - v) / (2 * span)) * (H - m.t - m.b);
  const choose = (c: string) => {
    if (guess) return;
    setGuess(c);
    setScore((s) => ({ right: s.right + (c === e.city ? 1 : 0), played: s.played + 1 }));
  };
  const next = () => { setGuess(null); setI((v) => nextIndex(v, id.editions.length)); };
  return (
    <div className="viz-card name-course">
      <div className="viz-head">
        <div><p className="viz-title">Name that course</p><p className="viz-sub">One race&apos;s pace shape with its overall fade removed. Which course was it?</p></div>
        <p className="name-score" aria-live="polite">You {score.right}/{score.played} · Model {id.correct}/{id.editions_tested}</p>
      </div>
      <div className="name-layout">
        <div ref={ref} className="viz name-signature">
          <svg width={width} height={H} role="img" aria-label="Mystery pace signature: nine bars, one per section.">
            <line x1={m.l} x2={width - m.r} y1={y(0)} y2={y(0)} stroke="#B9AE98" />
            {e.signature.map((v, k) => (
              <rect key={k} x={m.l + cw * k + cw * 0.18} width={cw * 0.64} y={Math.min(y(0), y(v))} height={Math.max(1, Math.abs(y(v) - y(0)))} rx={3} fill={v > 0 ? SLOWER : FASTER} />
            ))}
            {guess && centroid ? centroid.map((v, k) => (
              <rect key={`c${k}`} x={m.l + cw * k + cw * 0.1} width={cw * 0.8} y={Math.min(y(0), y(v))} height={Math.max(1, Math.abs(y(v) - y(0)))} rx={3} fill="none" stroke="var(--ink)" strokeWidth={1.6} strokeDasharray="4 3" />
            )) : null}
            <SectionAxis left={m.l} cw={cw} y={H - 8} units={units} />
          </svg>
          <p className="viz-note">{guess ? `Dashed outline: ${e.city}'s average signature across its other editions.` : `A ${count(e.n)}-finish edition. Bars show each section against what its overall fade predicts.`}</p>
        </div>
        <div className="name-options" role="group" aria-label="Your guess">
          {options.map((c) => {
            const g = geometry.find((x) => x.city === c);
            const state = !guess ? '' : c === e.city ? 'is-right' : c === guess ? 'is-wrong' : 'is-dim';
            return (
              <button key={c} type="button" className={`name-option ${state}`} onClick={() => choose(c)} aria-disabled={guess ? true : undefined} aria-pressed={guess === c}>
                <span className="name-option-route">{g ? <RouteMap course={g} size={72} animate={false} stroke="currentColor" label="" /> : null}</span>
                <span>{c}</span>
                {guess && c === e.predicted ? <span className="name-model">model&apos;s pick</span> : null}
              </button>
            );
          })}
        </div>
      </div>
      <div className="name-foot" aria-live="polite">
        {guess ? (
          <p><strong>{guess === e.city ? 'Right.' : 'Not this time.'}</strong> It was {e.city} {e.year}. The model {e.predicted === e.city ? 'also named it' : `guessed ${e.predicted}`}{e.rank > 1 ? ` (the right course ranked ${e.rank} of ${id.courses})` : ''}.</p>
        ) : <p>The model matches each edition to the nearest course average, built without that edition.</p>}
        <button type="button" className="button-secondary" onClick={next}>{guess ? 'Next mystery race' : 'Skip'}</button>
      </div>
    </div>
  );
}
