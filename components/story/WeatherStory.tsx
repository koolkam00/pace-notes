'use client';

import { useMemo, useRef, useState } from 'react';
import { RunnerGlyph } from '@/components/art/Runner';
import { useInView, usePrefersReducedMotion, useTicker } from '@/components/art/useTicker';
import { useUnits } from '@/components/UnitsProvider';
import { useWidth } from '@/components/viz/useSize';
import type { Courses } from '@/lib/insights';
import { paceLabel } from '@/lib/units';
import { count, mss } from '@/lib/viz/format';
import { SectionAxis } from './CoursesStory';
import { useOptionalStoryData, useStoryData } from './StoryData';

const COOL = '#2F5BFF';
const HOT = '#FF5B2E';

const toF = (c: number) => c * 1.8 + 32;
function tempText(c: number, units: 'mi' | 'km', digits = 0) {
  return units === 'mi' ? `${toF(c).toFixed(digits)}°F` : `${c.toFixed(digits)}°C`;
}

/** Cool-to-hot colour for a start temperature in °C. */
export function tempColour(c: number) {
  const stops: [number, [number, number, number]][] = [[0, [29, 63, 216]], [6, [79, 121, 247]], [11, [239, 232, 218]], [16, [255, 150, 100]], [22, [232, 70, 40]], [27, [170, 20, 40]]];
  if (c <= stops[0][0]) return `rgb(${stops[0][1].join(',')})`;
  for (let i = 0; i < stops.length - 1; i += 1) {
    const [a, ca] = stops[i];
    const [b, cb] = stops[i + 1];
    if (c <= b) {
      const f = (c - a) / (b - a);
      return `rgb(${ca.map((v, k) => Math.round(v + f * (cb[k] - v))).join(',')})`;
    }
  }
  return `rgb(${stops[stops.length - 1][1].join(',')})`;
}

/** 190 editions: start temperature against sustained slowdown, pooled and then within each course. */
export function Untangle({ weather: given }: { weather?: Pick<Courses['weather'], 'editions' | 'fits'> }) {
  const fromContext = useOptionalStoryData('courses');
  const w = given ?? fromContext?.weather;
  if (!w) throw new Error('Untangle needs weather data.');
  const [within, setWithin] = useState(false);
  const cities = useMemo(() => [...new Set(w.editions.map((e) => e.city))].sort(), [w]);
  const [focus, setFocus] = useState('Copenhagen');
  const { units } = useUnits();
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref, 860);
  const H = Math.min(440, Math.max(340, width * 0.55));
  const m = { l: 48, r: 16, t: 20, b: 42 };
  const means = useMemo(() => {
    const out: Record<string, { t: number; s: number }> = {};
    for (const c of cities) {
      const g = w.editions.filter((e) => e.city === c);
      out[c] = { t: g.reduce((a, e) => a + e.temp, 0) / g.length, s: g.reduce((a, e) => a + e.slowdown, 0) / g.length };
    }
    return out;
  }, [w, cities]);
  const gt = w.editions.reduce((a, e) => a + e.temp, 0) / w.editions.length;
  const gs = w.editions.reduce((a, e) => a + e.slowdown, 0) / w.editions.length;
  const pts = w.editions.map((e) => ({
    e,
    t: within ? e.temp - means[e.city].t + gt : e.temp,
    s: within ? e.slowdown - means[e.city].s + gs : e.slowdown,
  }));
  const tLo = -4;
  const tHi = 28;
  const sLo = 0;
  const sHi = 0.62;
  const x = (t: number) => m.l + ((t - tLo) / (tHi - tLo)) * (width - m.l - m.r);
  const y = (s: number) => m.t + ((sHi - s) / (sHi - sLo)) * (H - m.t - m.b);
  const slope = (within ? w.fits.slowdown_within.slope : w.fits.slowdown_across.slope) / 100;
  const r2 = within ? w.fits.slowdown_within.r2 : w.fits.slowdown_across.r2;
  const fx = [0, 26];
  const focusPts = pts.filter((p) => p.e.city === focus).sort((a, b) => a.t - b.t);
  const tTicks = within
    ? (units === 'mi' ? [-20, -10, 0, 10, 20] : [-10, -5, 0, 5, 10, 15]).map((d) => ({ t: gt + (units === 'mi' ? d / 1.8 : d), label: `${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d)}°` }))
    : (units === 'mi' ? [30, 40, 50, 60, 70, 80].map((f) => (f - 32) / 1.8) : [0, 5, 10, 15, 20, 25]).map((t) => ({ t, label: tempText(t, units) }));
  return (
    <div className="viz-card untangle">
      <div className="viz-head">
        <div><p className="viz-title">Race-morning temperature and sustained slowdown</p><p className="viz-sub">One dot per race edition, coloured by start temperature</p></div>
        <div className="segmented" role="group" aria-label="Comparison">
          <button type="button" aria-pressed={!within} onClick={() => setWithin(false)}>All races</button>
          <button type="button" aria-pressed={within} onClick={() => setWithin(true)}>Untangle by course</button>
        </div>
      </div>
      <p className="untangle-stat" aria-live="polite"><strong>R² {r2.toFixed(2)}</strong> {within ? <>within each course · {units === 'mi' ? `${(w.fits.slowdown_within.slope / 1.8).toFixed(2)} points per °F` : `${w.fits.slowdown_within.slope.toFixed(2)} points per °C`}</> : 'temperature alone, all courses pooled'}</p>
      <div ref={ref} className="viz">
        <svg width={width} height={H} role="img" aria-label={within ? `Within each course, a warmer start goes with more sustained slowdown: ${(w.fits.slowdown_within.slope).toFixed(2)} points per degree Celsius, R squared ${r2.toFixed(2)}.` : `Across all races, temperature explains little of the slowdown share: R squared ${r2.toFixed(2)}.`}>
          {[0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6].map((s) => <g key={s} className="grid"><line x1={m.l} x2={width - m.r} y1={y(s)} y2={y(s)} /><text x={m.l - 8} y={y(s) + 4} textAnchor="end">{Math.round(s * 100)}%</text></g>)}
          {tTicks.map((k) => <text key={k.label} x={x(k.t)} y={H - 20} textAnchor="middle">{k.label}</text>)}
          <text x={(m.l + width - m.r) / 2} y={H - 2} textAnchor="middle" className="annotation-sub">{within ? 'start temperature against the course’s own average' : 'start temperature at the scheduled start'}</text>
          <line x1={x(fx[0])} x2={x(fx[1])} y1={y(gs + slope * (fx[0] - gt))} y2={y(gs + slope * (fx[1] - gt))} stroke="var(--ink)" strokeWidth={2.4} strokeDasharray={within ? undefined : '6 6'} style={{ transition: 'all .9s cubic-bezier(.2,.7,.2,1)' }} />
          {pts.map((p) => (
            <circle key={`${p.e.city}${p.e.year}`} r={p.e.city === focus ? 6 : 4.2} cx={0} cy={0}
              style={{ transform: `translate(${x(p.t)}px, ${y(p.s)}px)`, transition: 'transform .9s cubic-bezier(.2,.7,.2,1)' }}
              fill={tempColour(p.e.temp)} stroke={p.e.city === focus ? 'var(--ink)' : '#FFFDF8'} strokeWidth={p.e.city === focus ? 2 : 1} opacity={p.e.city === focus ? 1 : 0.85}>
              <title>{`${p.e.city} ${p.e.year}: ${tempText(p.e.temp, units, 1)}, ${(p.e.slowdown * 100).toFixed(1)}% sustained slowdown`}</title>
            </circle>
          ))}
          {focusPts.length > 1 ? <path d={focusPts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t)} ${y(p.s)}`).join(' ')} fill="none" stroke="var(--ink)" strokeOpacity={0.35} strokeWidth={1.2} style={{ transition: 'd .9s' }} /> : null}
        </svg>
      </div>
      <div className="untangle-foot">
        <label className="ghost-select">
          <span>Highlight a course</span>
          <select value={focus} onChange={(ev) => setFocus(ev.target.value)}>{cities.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        </label>
        <p className="viz-note">
          {within ? 'Each course’s dots are moved so its own averages sit at the centre. Only the differences between its editions remain.' : 'Courses differ in field, terrain and climate, so pooled dots mix many things at once.'}
          {' '}Weather is the supplied modelled hour at the scheduled start in one city location. It is not a wave start or personal exposure.
        </p>
      </div>
    </div>
  );
}

const PAIR_KEYS: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 };

/** Every same-course pair of editions at least 5 °C apart: did the warmer one have more sustained slowdown? */
export function PairsWaffle({ data: given }: { data?: Courses }) {
  const data = useStoryData('courses', given);
  const p = data.weather.pairs;
  const { units } = useUnits();
  const sorted = [...p.list].sort((a, b) => a.city.localeCompare(b.city) || (b.hot_temp - b.cool_temp) - (a.hot_temp - a.cool_temp));
  const [hover, setHover] = useState<number | null>(null);
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLSpanElement | null)[]>([]);
  const move = (j: number) => {
    const k = Math.max(0, Math.min(sorted.length - 1, j));
    setActive(k);
    setHover(k);
    refs.current[k]?.focus();
  };
  const h = hover == null ? null : sorted[hover];
  return (
    <div className="viz-card pairs">
      <div className="viz-head">
        <div><p className="viz-title">{p.hotter_slowed_more} of {p.total} same-course pairs</p><p className="viz-sub">Pairs of editions of one course with starts at least {units === 'mi' ? '9°F' : `${p.min_gap_c}°C`} apart</p></div>
        <div className="pairs-legend"><span><i style={{ background: HOT }} />warmer one slowed more</span><span><i style={{ background: '#C9BFAB' }} />it didn&apos;t</span></div>
      </div>
      <div className="pairs-grid" role="list" aria-label="Same-course pairs; use the arrow keys to move between them" onMouseLeave={() => setHover(null)}>
        {sorted.map((x, i) => (
          <span key={`${x.city}${x.hot_year}${x.cool_year}`} role="listitem" className={x.hotter_slowed_more ? 'pair hit' : 'pair'}
            ref={(el) => { refs.current[i] = el; }} tabIndex={i === active ? 0 : -1}
            onKeyDown={(ev) => {
              let d = PAIR_KEYS[ev.key] ?? (ev.key === 'Home' ? -Infinity : ev.key === 'End' ? Infinity : 0);
              if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
                // Up and down move by one row of the wrapped grid, measured from the first row.
                const top = refs.current[0]?.offsetTop;
                const cols = Math.max(1, refs.current.filter((el) => el?.offsetTop === top).length);
                d = ev.key === 'ArrowDown' ? cols : -cols;
              }
              if (d) { ev.preventDefault(); move(Number.isFinite(d) ? i + d : d < 0 ? 0 : sorted.length - 1); }
            }}
            onMouseEnter={() => setHover(i)} onFocus={() => { setActive(i); setHover(i); }}
            aria-label={`${x.city}: ${x.hot_year} at ${tempText(x.hot_temp, units)} had ${(x.hot_slowdown * 100).toFixed(1)}% slowdown; ${x.cool_year} at ${tempText(x.cool_temp, units)} had ${(x.cool_slowdown * 100).toFixed(1)}%.`} />
        ))}
      </div>
      <p className="pairs-readout">
        {h ? <><strong>{h.city}</strong> {h.hot_year} at {tempText(h.hot_temp, units)}: {(h.hot_slowdown * 100).toFixed(1)}% · {h.cool_year} at {tempText(h.cool_temp, units)}: {(h.cool_slowdown * 100).toFixed(1)}%</> : 'Hover a square, or tab to the grid and use the arrow keys, to see each pair.'}
      </p>
      <p className="viz-note">Pairs share editions, so they are not independent tests. Squares are grouped by course, alphabetically.</p>
    </div>
  );
}

/** Drag the start temperature; the typical pace curve bends by the heat signature. */
export function HeatCurve({ data: given }: { data?: Courses }) {
  const data = useStoryData('courses', given);
  const w = data.weather;
  const base = w.mean_start_temp;
  const [temp, setTemp] = useState(20);
  const { units } = useUnits();
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref, 760);
  const reduced = usePrefersReducedMotion();
  const inView = useInView(ref);
  const time = useTicker(inView && !reduced, 40, 30);
  const typical = data.typical_curve;
  const curve = typical.map((v, i) => v + ((temp - base) / 10) * w.heat_signature[i].per_10c);
  const H = 260;
  const m = { l: 44, r: 14, t: 16, b: 32 };
  const iw = width - m.l - m.r;
  const cw = iw / 9;
  const lo = -12;
  const hi = 16;
  const y = (v: number) => m.t + ((hi - v) / (hi - lo)) * (H - m.t - m.b);
  const cx = (i: number) => m.l + cw * (i + 0.5);
  const path = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${cx(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const band = `${path(curve)} ${[...typical].reverse().map((v, j) => `L${cx(8 - j).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')} Z`;
  const tClamp = Math.round(Math.max(0, Math.min(26, temp)));
  const finishChange = w.curvature.finish_min_curve.find((c) => c.temp === tClamp)?.change ?? 0;
  const slowChange = w.curvature.slowdown_points_curve.find((c) => c.temp === tClamp)?.change ?? 0;
  const effort = Math.max(0, Math.min(1, (temp - 8) / 16));
  const fMin = units === 'mi' ? 32 : 0;
  const fMax = units === 'mi' ? 79 : 26;
  const shown = units === 'mi' ? Math.round(toF(temp)) : Math.round(temp);
  return (
    <div className="viz-card heat-curve">
      <div className="viz-head">
        <div><p className="viz-title">The heat signature</p><p className="viz-sub">The typical pace curve, bent by how editions of the same course differ with start temperature</p></div>
      </div>
      <div className="heat-layout">
        <div className="heat-control">
          <svg viewBox="0 0 120 120" className="heat-runner" aria-hidden="true">
            <circle cx={96} cy={22} r={8 + effort * 10} fill={tempColour(temp)} opacity={0.9} />
            <g style={{ color: '#000' }}><RunnerGlyph phase={time * (1.5 - effort * 0.35)} effort={effort} x={8} y={6} scale={1} kit="#0FA3A3" skin="#C68642" /></g>
            {effort > 0.45 ? <path d="M70 34 q2 4 0 6 q-2 -2 0 -6" fill="#4F79F7" opacity={Math.min(1, (effort - 0.45) * 3)} /> : null}
          </svg>
          <label className="heat-slider">
            <span>Start temperature <strong>{shown}{units === 'mi' ? '°F' : '°C'}</strong></span>
            <input type="range" min={fMin} max={fMax} step={1} value={shown}
              onChange={(e) => setTemp(units === 'mi' ? (Number(e.target.value) - 32) / 1.8 : Number(e.target.value))} aria-valuetext={`${shown}${units === 'mi' ? '°F' : '°C'}`} />
          </label>
          <dl className="heat-readout">
            <div><dt>Median finish vs a {units === 'mi' ? '50°F' : '10°C'} morning</dt><dd>{Math.round(finishChange) === 0 ? '±0' : `${finishChange > 0 ? '+' : '−'}${Math.abs(Math.round(finishChange))}`} min</dd></div>
            <div><dt>Sustained slowdown</dt><dd>{Math.round(slowChange) === 0 ? '±0' : `${slowChange > 0 ? '+' : '−'}${Math.abs(Math.round(slowChange))}`} pts</dd></div>
          </dl>
        </div>
        <div ref={ref} className="viz heat-chart">
          <svg width={width} height={H} role="img" aria-label={`At ${shown} degrees the first 5 km runs ${(curve[0] - typical[0]).toFixed(1)} points against the typical curve and 35 to 40 km ${(curve[7] - typical[7]).toFixed(1)} points.`}>
            {[-12, -8, -4, 0, 4, 8, 12, 16].map((v) => <g key={v} className="grid"><line x1={m.l} x2={width - m.r} y1={y(v)} y2={y(v)} /><text x={m.l - 8} y={y(v) + 4} textAnchor="end">{v > 0 ? `+${v}` : v}%</text></g>)}
            <path d={band} fill={temp > base ? HOT : COOL} opacity={0.16} />
            <path d={path(typical)} fill="none" stroke="#8C836F" strokeWidth={2} strokeDasharray="5 5" />
            <path d={path(curve)} fill="none" stroke={temp > base ? '#C8202F' : '#1D3FD8'} strokeWidth={3} />
            {curve.map((v, i) => <circle key={i} cx={cx(i)} cy={y(v)} r={4} fill={temp > base ? '#C8202F' : '#1D3FD8'} stroke="#FFFDF8" strokeWidth={1.5} />)}
            <SectionAxis left={m.l} cw={cw} y={H - 10} units={units} />
          </svg>
        </div>
      </div>
      <p className="viz-note">
        Median finisher&apos;s pace by section against their own average; dashed, the typical curve at the average start. The bend is an average within-course association, drawn as a straight
        line from the typical curve at the average start ({tempText(base, units, 1)}); it is not a forecast for any race. The finish and slowdown
        readouts use a separate curved fit, compared with a {units === 'mi' ? '50°F' : '10°C'} start on the same course.
      </p>
    </div>
  );
}

/** Each course's hottest and coolest edition. */
export function HotCool({ data: given }: { data?: Courses }) {
  const data = useStoryData('courses', given);
  const rows = data.weather.hot_cool;
  const { units } = useUnits();
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref, 860);
  const narrow = width < 560;
  const m = { l: narrow ? 92 : 110, r: narrow ? 16 : 150, t: 24, b: 30 };
  const rowH = 30;
  const H = m.t + rows.length * rowH + m.b;
  const x = (s: number) => m.l + (s / 0.6) * (width - m.l - m.r);
  return (
    <div className="viz-card">
      <div className="viz-head">
        <div><p className="viz-title">Same course, hottest and coolest morning</p><p className="viz-sub">Share of finishes with a sustained slowdown, courses with three or more editions</p></div>
        <div className="pairs-legend"><span><i style={{ background: COOL }} />coolest start</span><span><i style={{ background: HOT }} />hottest start</span></div>
      </div>
      <div ref={ref} className="viz">
        <svg width={width} height={H} role="img" aria-label="Dumbbell chart of each course's hottest and coolest edition and their sustained slowdown shares.">
          {[0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6].map((s) => <g key={s} className="grid"><line x1={x(s)} x2={x(s)} y1={m.t - 10} y2={H - m.b} /><text x={x(s)} y={H - 10} textAnchor="middle">{Math.round(s * 100)}%</text></g>)}
          {rows.map((r, i) => {
            const yy = m.t + i * rowH + rowH / 2;
            const up = r.hot.slowdown > r.cool.slowdown;
            return (
              <g key={r.city}>
                <text x={m.l - 10} y={yy + 4} textAnchor="end">{r.city}</text>
                <line x1={x(r.cool.slowdown)} x2={x(r.hot.slowdown)} y1={yy} y2={yy} stroke={up ? '#FFB48A' : '#C9BFAB'} strokeWidth={4} strokeLinecap="round" />
                <circle cx={x(r.cool.slowdown)} cy={yy} r={7} fill={COOL}><title>{`${r.city} ${r.cool.year}: ${tempText(r.cool.temp, units, 1)}, ${(r.cool.slowdown * 100).toFixed(1)}%`}</title></circle>
                <circle cx={x(r.hot.slowdown)} cy={yy} r={7} fill={HOT}><title>{`${r.city} ${r.hot.year}: ${tempText(r.hot.temp, units, 1)}, ${(r.hot.slowdown * 100).toFixed(1)}%`}</title></circle>
                {!narrow ? <text x={width - m.r + 12} y={yy + 4} className="annotation-sub">{r.cool.year} {tempText(r.cool.temp, units)} → {r.hot.year} {tempText(r.hot.temp, units)}</text> : null}
              </g>
            );
          })}
        </svg>
      </div>
      <p className="viz-note">Hottest and coolest refer to the modelled temperature at the scheduled start. Other things also changed between those years.</p>
    </div>
  );
}

/** Courses compared among finishes with the same 5–20 km pace. */
export function MatchedPace({ data: given }: { data?: Courses }) {
  const data = useStoryData('courses', given);
  const [pick, setPick] = useState(Math.max(0, data.matched.findIndex((b) => b.lo_s === 300)));
  const band = data.matched[pick];
  const { units } = useUnits();
  const MIN = 1000;
  const MIN_EDITIONS = 3;
  const rows = band.courses.filter((c) => c.finishes >= MIN && c.editions >= MIN_EDITIONS);
  const dropped = band.courses.length - rows.length;
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref, 860);
  const narrow = width < 560;
  const m = { l: narrow ? 96 : 120, r: narrow ? 56 : 136, t: 18, b: 30 };
  const rowH = 24;
  const H = m.t + rows.length * rowH + m.b;
  const max = Math.max(0.5, Math.ceil(Math.max(...rows.map((r) => r.slowdown)) * 10) / 10);
  const x = (s: number) => m.l + (s / max) * (width - m.l - m.r);
  const label = (b: typeof band) => `${paceLabel(b.lo_s, units, false)}–${paceLabel(b.hi_s, units)}`;
  const lowest = rows[0];
  const highest = rows[rows.length - 1];
  return (
    <div className="viz-card">
      <div className="viz-head">
        <div><p className="viz-title">Same 5–20 km pace, different finish</p><p className="viz-sub">Finishes whose 5–20 km pace was {label(band)}. Each edition weighted equally</p></div>
        <div className="segmented" role="group" aria-label="5 to 20 km pace">
          {data.matched.map((b, i) => <button key={b.lo_s} type="button" aria-pressed={i === pick} onClick={() => setPick(i)}>{paceLabel(b.lo_s, units, false)}</button>)}
        </div>
      </div>
      <div ref={ref} className="viz">
        <svg width={width} height={H} role="img" aria-label={`At ${label(band)} through 20 km, sustained slowdown ranges from ${(lowest.slowdown * 100).toFixed(0)}% in ${lowest.city} to ${(highest.slowdown * 100).toFixed(0)}% in ${highest.city}.`}>
          {Array.from({ length: Math.round(max * 10) + 1 }, (_, i) => i / 10).map((s) => <g key={s} className="grid"><line x1={x(s)} x2={x(s)} y1={m.t - 8} y2={H - m.b} /><text x={x(s)} y={H - 10} textAnchor="middle">{Math.round(s * 100)}%</text></g>)}
          {!narrow ? <text x={width - m.r + 12} y={m.t - 4} className="annotation-sub">given back after 20 km</text> : null}
          {rows.map((r, i) => {
            const yy = m.t + i * rowH + rowH / 2;
            const edge = r === lowest || r === highest;
            return (
              <g key={r.city}>
                <text x={m.l - 10} y={yy + 4} textAnchor="end" fontWeight={edge ? 700 : 400}>{r.city}</text>
                <line x1={x(0)} x2={x(r.slowdown)} y1={yy} y2={yy} stroke={edge ? (r === lowest ? '#17A673' : HOT) : '#C9BFAB'} strokeWidth={edge ? 3 : 2} />
                <circle cx={x(r.slowdown)} cy={yy} r={edge ? 6 : 4.5} fill={edge ? (r === lowest ? '#17A673' : HOT) : 'var(--ink)'}><title>{`${r.city}: ${(r.slowdown * 100).toFixed(1)}% of ${count(r.finishes)} finishes in ${r.editions} editions`}</title></circle>
                <text x={x(r.slowdown) + 10} y={yy + 4} className="annotation-sub">{(r.slowdown * 100).toFixed(0)}%</text>
                <text x={width - m.r + 12} y={yy + 4} className="annotation-sub">{narrow ? '' : `+${mss(r.after20_s)}`}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <p className="viz-note">
        Dots: share of finishes with a sustained slowdown. Right column: median time beyond holding the 5–20 km pace to the finish.
        Matching on early pace balances speed, not ability, goals or weather. Courses with fewer than {MIN_EDITIONS} editions or {count(MIN)} finishes in this band are not drawn ({dropped} here).
      </p>
    </div>
  );
}
