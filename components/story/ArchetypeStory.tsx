'use client';

import { useMemo, useRef, useState } from 'react';
import { RunnerGlyph } from '@/components/art/Runner';
import { useInView, usePrefersReducedMotion, useTicker } from '@/components/art/useTicker';
import { useWidth } from '@/components/viz/useSize';
import { useUnits } from '@/components/UnitsProvider';
import { SKIN_TONES } from '@/lib/art/gait';
import type { Archetypes } from '@/lib/insights';
import { count, hms, paceColour } from '@/lib/viz/format';
import { ARCHETYPE_COLOURS } from '@/lib/viz/palette';

const SECTION_KM = [5, 5, 5, 5, 5, 5, 5, 5, 2.195];
const BOUNDS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 42.195];

/** Cumulative fraction of race time at each checkpoint for a relative-pace profile (same total time for every profile). */
function timeline(profile: number[]) {
  const times = SECTION_KM.map((km, i) => km * (1 + profile[i] / 100));
  const total = times.reduce((a, b) => a + b, 0);
  const cum = [0];
  times.forEach((t) => cum.push(cum[cum.length - 1] + t / total));
  return cum;
}

function distanceAt(cum: number[], u: number) {
  if (u >= 1) return { km: 42.195, section: 8 };
  let j = 0;
  while (j < 8 && cum[j + 1] <= u) j += 1;
  const f = (u - cum[j]) / (cum[j + 1] - cum[j]);
  return { km: BOUNDS[j] + f * (BOUNDS[j + 1] - BOUNDS[j]), section: j };
}

/** Six runners with the same finish time, each pacing like one archetype. */
export function ArchetypeRace({ data, focus, onFocus }: { data: Archetypes; focus: number | null; onFocus: (i: number | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref, 960);
  const reduced = usePrefersReducedMotion();
  const inView = useInView(ref);
  const time = useTicker(inView && !reduced, 50);
  const { units } = useUnits();
  const lanes = data.archetypes;
  const mobile = width < 640;
  const laneH = mobile ? 54 : 66;
  const labelW = mobile ? 0 : 150;
  const pad = 18;
  const H = lanes.length * laneH + 46;
  const trackX0 = labelW + pad;
  const trackX1 = width - pad - 30;
  const RACE = 14;
  const HOLD = 2.5;
  const cycle = time % (RACE + HOLD);
  const u = reduced ? 0.62 : Math.min(1, cycle / RACE);
  const X = (km: number) => trackX0 + ((trackX1 - trackX0) * km) / 42.195;
  const cums = useMemo(() => lanes.map((a) => timeline(a.profile)), [lanes]);
  const leader = Math.max(...cums.map((c) => distanceAt(c, u).km));
  const size = laneH * 0.86;
  const marks = mobile ? [0, 21.0975, 42.195] : units === 'mi' ? [0, 5, 10, 15, 20, 25].map((mi) => mi * 1.609344).concat([42.195]) : [0, 10, 20, 30, 40, 42.195];
  return (
    <div className="viz-card dark archetype-race">
      <div className="viz-head">
        <div>
          <p className="viz-title">Six runners, one finish time</p>
          <p className="viz-sub">Each runner follows one archetype&apos;s average profile. They all finish together.</p>
        </div>
        <span className="race-clock">{u >= 1 ? 'Finish' : `${Math.round(u * 100)}% of race time`}</span>
      </div>
      <div ref={ref} className="viz">
        <svg width={width} height={H} role="img" aria-label="Animated race between six runners with the same finish time. The Cliff and Fast-start fader lead early and are caught late; the Metronome stays steady.">
          {marks.map((km) => (
            <g key={km}>
              <line x1={X(km)} x2={X(km)} y1={8} y2={H - 30} stroke={km === 0 || km >= 42 ? '#F4B23E' : '#252B36'} strokeDasharray={km === 0 || km >= 42 ? undefined : '2 5'} />
              <text x={X(km)} y={H - 12} textAnchor={km === 0 ? 'start' : km >= 42 ? 'end' : 'middle'}>{km === 0 ? 'start' : km >= 42 ? 'finish' : units === 'mi' ? `${(km / 1.609344).toFixed(km === 21.0975 ? 1 : 0)} mi` : `${km % 1 ? km.toFixed(1) : km} km`}</text>
            </g>
          ))}
          {lanes.map((a, i) => {
            const pos = distanceAt(cums[i], u);
            const rel = a.profile[pos.section];
            const effort = Math.max(0, Math.min(1, (rel - 6) / 30));
            const y = 8 + i * laneH;
            const dim = focus !== null && focus !== i;
            const gap = (leader - pos.km);
            return (
              <g key={a.slug} opacity={dim ? 0.35 : 1} style={{ cursor: 'pointer', color: '#000' }} onMouseEnter={() => onFocus(i)} onMouseLeave={() => onFocus(null)}>
                <rect x={trackX0} y={y + laneH - 10} width={trackX1 - trackX0} height={2} fill="#252B36" />
                <rect x={trackX0} y={y + laneH - 10} width={Math.max(0, X(pos.km) - trackX0)} height={2} fill={ARCHETYPE_COLOURS[i]} />
                {!mobile ? (
                  <g>
                    <text x={0} y={y + laneH / 2 - 2} className="lane-name" fill="#F5F0E6">{a.name}</text>
                    <text x={0} y={y + laneH / 2 + 15} className="lane-gap">{u >= 1 || gap < 0.05 ? (u >= 1 ? 'finished' : 'leading') : `${(units === 'mi' ? gap / 1.609344 : gap).toFixed(1)} ${units} back`}</text>
                  </g>
                ) : null}
                <RunnerGlyph phase={time * (1.6 - effort * 0.5) + i * 0.17} effort={effort} x={X(pos.km) - size * 0.46} y={y + laneH - 10 - size * 1.08} scale={size / 100}
                  kit={ARCHETYPE_COLOURS[i]} skin={SKIN_TONES[(i * 2 + 1) % SKIN_TONES.length]} shorts="#0B0E12" shadow={false} />
                {mobile ? <text x={trackX1} y={y + 12} textAnchor="end" className="lane-name-sm" fill={ARCHETYPE_COLOURS[i]}>{a.name}</text> : null}
              </g>
            );
          })}
        </svg>
      </div>
      <p className="viz-note">Same finish time, different journeys: the profiles are averages for each archetype, scaled to one finish. A runner who banks time early has to give it back later.</p>
    </div>
  );
}

export function ArchetypeCards({ data, focus, onFocus }: { data: Archetypes; focus: number | null; onFocus: (i: number | null) => void }) {
  return (
    <div className="archetype-grid">
      {data.archetypes.map((a, i) => {
        const pts = a.profile.map((v, k) => [((BOUNDS[k] + BOUNDS[k + 1]) / 2 / 42.195) * 100, Math.max(3, Math.min(57, 30 - v * 0.66))] as const);
        return (
          <article key={a.slug} className={`archetype-card ${focus === i ? 'is-focus' : ''}`} onMouseEnter={() => onFocus(i)} onMouseLeave={() => onFocus(null)} onFocus={() => onFocus(i)} tabIndex={0} style={{ ['--arch' as string]: ARCHETYPE_COLOURS[i] }}>
            <header>
              <span className="archetype-dot" />
              <h3>{a.name}</h3>
              <strong>{(a.share * 100).toFixed(1)}%</strong>
            </header>
            <svg viewBox="0 0 100 60" className="archetype-spark" aria-hidden="true" preserveAspectRatio="none">
              <line x1={0} x2={100} y1={30} y2={30} stroke="currentColor" opacity={0.25} strokeDasharray="2 2" />
              <path d={pts.map(([x, y], k) => `${k ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')} fill="none" stroke={ARCHETYPE_COLOURS[i]} strokeWidth={2.4} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            </svg>
            <p>{a.blurb}</p>
            <dl>
              <div><dt>Median finish</dt><dd>{hms(a.median_finish_s)}</dd></div>
              <div><dt>Sustained slowdown</dt><dd>{(a.slowdown_share * 100).toFixed(0)}%</dd></div>
              <div><dt>Extra time after 20 km*</dt><dd>+{a.median_after20_min.toFixed(1)} min</dd></div>
            </dl>
          </article>
        );
      })}
      <p className="archetype-foot">* Median time from 20 km to the finish beyond 22.2 km at the same finish&apos;s 5–20 km pace. {count(data.cohort_n)} eligible finishes; shares sum to 100%.</p>
    </div>
  );
}

export function PacingBarcode({ data }: { data: Archetypes }) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref, 900);
  const { units } = useUnits();
  const [hover, setHover] = useState<number | null>(null);
  const rows = data.barcode;
  const mobile = width < 640;
  const m = { l: mobile ? 52 : 70, r: 10, t: 34, b: 10 };
  const H = mobile ? 420 : 520;
  const iw = width - m.l - m.r;
  const ih = H - m.t - m.b;
  const rh = ih / rows.length;
  const cw = iw / 9;
  const hovered = hover === null ? null : rows[hover];
  const labelRows = [0, 20, 40, 60, 80, 100, 120, 140, 160, 180, 199];
  return (
    <div className="viz-card">
      <div className="viz-head">
        <div>
          <p className="viz-title">The pacing barcode</p>
          <p className="viz-sub">{count(data.cohort_n)} finishes, fastest at the top. Each row is 0.5% of the field.</p>
        </div>
        <div className="ramp-legend"><span>faster than own average</span><i style={{ background: 'linear-gradient(90deg,#1D3FD8,#4F79F7,#9DB6FB,#EFE8DA,#FFB48A,#FF6A3D,#C8202F)' }} /><span>slower</span></div>
      </div>
      <div ref={ref} className="viz" style={{ position: 'relative' }} onMouseLeave={() => setHover(null)}>
        <svg width={width} height={H} role="img" aria-label="Heatmap of median relative pace in each of nine sections for 200 groups of finishers ordered by finish time. Late sections turn red for slower finishers.">
          {Array.from({ length: 10 }, (_, k) => {
            const km = BOUNDS[k];
            const label = k === 0 ? '0' : k === 9 ? (units === 'mi' ? '26.2 mi' : '42.2 km') : units === 'mi' ? (km / 1.609344).toFixed(1) : String(km);
            if (mobile && (k % 2 === 1 || k === 8) && k !== 9) return null;
            return <text key={k} x={m.l + cw * k} y={m.t - 10} textAnchor={k === 0 ? 'start' : k === 9 ? 'end' : 'middle'}>{label}</text>;
          })}
          {rows.map((row, i) => row.median.map((v, k) => (
            <rect key={`${i}-${k}`} x={m.l + cw * k} y={m.t + i * rh} width={cw + 0.5} height={rh + 0.5} fill={paceColour(v, 14)} />
          )))}
          {labelRows.map((i) => <text key={i} x={m.l - 8} y={m.t + i * rh + rh / 2 + 4} textAnchor="end">{hms(rows[i].lo_s).slice(0, -3)}</text>)}
          {hover !== null ? <rect x={m.l} y={m.t + hover * rh - 1} width={iw} height={rh + 2} fill="none" stroke="#15171C" strokeWidth={1.5} /> : null}
          <rect x={m.l} y={m.t} width={iw} height={ih} fill="transparent" onMouseMove={(e) => {
            const box = (e.currentTarget as SVGRectElement).getBoundingClientRect();
            setHover(Math.max(0, Math.min(rows.length - 1, Math.floor(((e.clientY - box.top) / box.height) * rows.length))));
          }} />
        </svg>
        {hovered ? (
          <div className="viz-tooltip" style={{ left: m.l + iw / 2, top: m.t + (hover ?? 0) * rh }}>
            <b>Finishes {hms(hovered.lo_s)}–{hms(hovered.hi_s)}</b>
            <span>Median section pace vs own average:</span>
            <span className="tooltip-strip">{hovered.median.map((v, k) => <i key={k} style={{ background: paceColour(v, 14) }} title={`${v}%`} />)}</span>
            <span>Slowest section: {Math.max(...hovered.median).toFixed(1)}% · Metronomes: {(hovered.archetype[0] * 100).toFixed(0)}%</span>
          </div>
        ) : null}
      </div>
      <p className="viz-note">Blue sections are quicker than that finish&apos;s own average pace, red sections slower. The fastest finishes stay pale almost all the way; the red arrives earlier and deeper as finish times lengthen.</p>
    </div>
  );
}

export function ArchetypeRiver({ data }: { data: Archetypes }) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref, 900);
  const H = 300;
  const m = { l: 44, r: 12, t: 12, b: 34 };
  const iw = width - m.l - m.r;
  const ih = H - m.t - m.b;
  const rows = data.river;
  const x = (i: number) => m.l + (i / (rows.length - 1)) * iw;
  const layers = data.archetypes.map((_, j) => {
    const lower = rows.map((row) => row.shares.slice(0, j).reduce((a, b) => a + b, 0));
    const upper = rows.map((row, i) => lower[i] + row.shares[j]);
    return { lower, upper };
  });
  const y = (v: number) => m.t + ih - v * ih;
  return (
    <div className="viz-card">
      <div className="viz-head"><div><p className="viz-title">Who runs which way, by finish time</p><p className="viz-sub">Share of each 15-minute finish band</p></div></div>
      <div ref={ref} className="viz">
        <svg width={width} height={H} role="img" aria-label="Stacked area of archetype shares by finish time. Metronomes dominate fast finishes; Early drifters and Fast-start faders dominate slow finishes.">
          {layers.map((l, j) => (
            <path key={j} fill={ARCHETYPE_COLOURS[j]} opacity={0.9}
              d={`M${x(0)} ${y(l.upper[0])} ${l.upper.map((v, i) => `L${x(i)} ${y(v)}`).join(' ')} ${[...l.lower].reverse().map((v, i) => `L${x(rows.length - 1 - i)} ${y(v)}`).join(' ')} Z`} />
          ))}
          {rows.map((row, i) => (i % 4 === 0 ? <text key={row.lo_min} x={x(i)} y={H - 12} textAnchor="middle">{`${Math.floor(row.lo_min / 60)}:${String(row.lo_min % 60).padStart(2, '0')}`}</text> : null))}
          {[0, .5, 1].map((v) => <text key={v} x={m.l - 8} y={y(v) + 4} textAnchor="end">{v * 100}%</text>)}
        </svg>
      </div>
      <div className="legend-row">{data.archetypes.map((a, j) => <span key={a.slug}><i className="swatch" style={{ background: ARCHETYPE_COLOURS[j] }} />{a.name}</span>)}</div>
    </div>
  );
}

const SECTIONS_INPUT = ['5', '10', '15', '20', '25', '30', '35', '40', 'Finish'];

function parseClock(text: string): number | null {
  const t = text.trim();
  const m = t.match(/^(?:(\d{1,2}):)?([0-5]?\d):([0-5]\d)$/);
  if (!m) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/** Classify a reader's own nine checkpoint times with the published classifier. Runs entirely in the browser. */
export function WhichArchetype({ data }: { data: Archetypes }) {
  const [values, setValues] = useState<string[]>(['0:25:30', '0:51:00', '1:16:40', '1:42:30', '2:08:50', '2:36:10', '3:05:00', '3:36:00', '3:51:00']);
  const times = values.map(parseClock);
  const valid = times.every((t) => t !== null) && times.every((t, i) => i === 0 || (t as number) > (times[i - 1] as number));
  const result = useMemo(() => {
    if (!valid) return null;
    const t = times as number[];
    const finish = t[8];
    if (finish < 5400 || finish > 43200) return null;
    const avg = finish / 42.195;
    const rel = t.map((v, i) => 100 * (((v - (i ? t[i - 1] : 0)) / SECTION_KM[i]) / avg - 1));
    const c = data.classifier;
    const xv = rel.map((v, i) => Math.min(c.clip_hi[i], Math.max(c.clip_lo[i], v)) * c.weights[i]);
    const dist = c.centroids.map((cent) => cent.reduce((s, cv, i) => s + (xv[i] - cv) ** 2, 0));
    const best = dist.indexOf(Math.min(...dist));
    const sentence = rel.map((v) => (v < -3 ? 'F' : v > 3 ? 'S' : 'E')).join('');
    const match = data.sentences.published.find((s) => s.sentence === sentence);
    return { rel, best, sentence, match };
  }, [valid, times, data]);
  return (
    <div className="viz-card which-card">
      <div className="viz-head"><div><p className="viz-title">Which runner were you?</p><p className="viz-sub">Enter your elapsed time at each checkpoint (h:mm:ss). Nothing leaves your browser.</p></div></div>
      <div className="which-grid">
        {SECTIONS_INPUT.map((label, i) => (
          <label key={label}>
            <span>{label === 'Finish' ? 'Finish' : `${label} km`}</span>
            <input value={values[i]} inputMode="numeric" onChange={(e) => setValues(values.map((v, k) => (k === i ? e.target.value : v)))} aria-invalid={times[i] === null} />
          </label>
        ))}
      </div>
      {result ? (
        <div className="which-result" style={{ ['--arch' as string]: ARCHETYPE_COLOURS[result.best] }}>
          <div className="which-name"><span className="archetype-dot" /> You ran like a <strong>{data.archetypes[result.best].name}</strong></div>
          <div className="which-strip" aria-label={`Pacing sentence ${result.sentence}`}>
            {result.rel.map((v, i) => <span key={i} style={{ background: paceColour(v, 14) }}><b>{result.sentence[i]}</b><small>{v > 0 ? '+' : ''}{v.toFixed(1)}%</small></span>)}
          </div>
          <p>
            Your pacing sentence is <code>{result.sentence}</code> (F = more than 3% faster than your own average, E = within 3%, S = more than 3% slower).{' '}
            {result.match ? <>It is shared by {count(result.match.n)} eligible finishes, about 1 in {count(Math.round(data.cohort_n / result.match.n))}.</> : <>Fewer than 100 eligible finishes share it exactly, so it is not published.</>}
            {' '}{(data.archetypes[result.best].share * 100).toFixed(1)}% of all finishes are {data.archetypes[result.best].name}s.
          </p>
        </div>
      ) : <p className="viz-note">Check that every time is h:mm:ss, increasing, with a finish between 1:30:00 and 12:00:00.</p>}
    </div>
  );
}

export function RepeatHabits({ data }: { data: Archetypes }) {
  const rows = data.transitions.rows;
  const max = Math.max(...rows.map((r) => r.repeat_share ?? 0));
  return (
    <div className="viz-card">
      <div className="viz-head"><div><p className="viz-title">Habits follow runners to the next race</p><p className="viz-sub">{count(data.transitions.pairs)} pairs of consecutive races by the same screened identity candidate</p></div></div>
      <div className="repeat-rows">
        {rows.map((r, i) => (
          <div key={r.name} className="repeat-row">
            <span className="repeat-name"><i style={{ background: ARCHETYPE_COLOURS[i] }} />{r.name}</span>
            <div className="repeat-bars">
              <div className="repeat-track"><div style={{ width: `${((r.repeat_share ?? 0) / max) * 100}%`, background: ARCHETYPE_COLOURS[i] }} /></div>
              <div className="repeat-track base"><div style={{ width: `${(r.overall_share / max) * 100}%` }} /></div>
            </div>
            <span className="repeat-value"><strong>{((r.repeat_share ?? 0) * 100).toFixed(0)}%</strong> repeat · {(((r.repeat_share ?? 0) / r.overall_share)).toFixed(1)}× the overall share ({(r.overall_share * 100).toFixed(0)}%)</span>
          </div>
        ))}
      </div>
      <p className="viz-note">Coloured bar: share of next races in the same archetype. Grey bar: that archetype&apos;s share of all next races. Identity links are screened candidates, not verified people, and later races are only observed for runners who returned.</p>
    </div>
  );
}
