'use client';

import { useMemo, useRef, useState } from 'react';
import { RunnerGlyph } from '@/components/art/Runner';
import { useInView, usePrefersReducedMotion, useTicker } from '@/components/art/useTicker';
import { useWidth } from '@/components/viz/useSize';
import { useUnits } from '@/components/UnitsProvider';
import type { Demographics } from '@/lib/insights';
import { count, mss } from '@/lib/viz/format';

const WOMEN = '#7A4DFF';
const MEN = '#0FA3A3';
const KM = [0, 5, 10, 15, 20, 25, 30, 35, 40, 42.195];
const SECTION = [5, 5, 5, 5, 5, 5, 5, 5, 2.195];

function cumulative(profile: number[], finish: number) {
  const t = SECTION.map((km, i) => km * (1 + profile[i] / 100));
  const total = t.reduce((a, b) => a + b, 0);
  const out = [0];
  t.forEach((v) => out.push(out[out.length - 1] + (v / total) * finish));
  return out;
}

function at(cum: number[], clock: number) {
  if (clock >= cum[9]) return 42.195;
  let j = 0;
  while (j < 8 && cum[j + 1] <= clock) j += 1;
  return KM[j] + ((clock - cum[j]) / (cum[j + 1] - cum[j])) * (KM[j + 1] - KM[j]);
}

/** Two runners with the same finish time, one pacing like matched women and one like matched men. */
export function GhostRace({ data }: { data: Demographics }) {
  const [pick, setPick] = useState(Math.max(0, data.bands.findIndex((b) => b.lo_min === 260)));
  const band = data.bands[pick];
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref, 900);
  const reduced = usePrefersReducedMotion();
  const inView = useInView(ref);
  const time = useTicker(inView && !reduced, 50);
  const { units } = useUnits();
  const finish = (band.lo_min + 5) * 60;
  const men = useMemo(() => cumulative(band.men_profile, finish), [band, finish]);
  const women = useMemo(() => men.map((t, k) => (k === 0 ? 0 : t + band.ghost_s[k - 1])), [men, band]);
  const RACE = 12;
  const u = reduced ? 0.6 : Math.min(1, (time % (RACE + 2.5)) / RACE);
  const clock = u * finish;
  const mKm = at(men, clock);
  const wKm = at(women, clock);
  const gapS = (() => {
    // time gap at the woman's current distance: how long ago the man passed this point
    const d = wKm;
    let j = 0;
    while (j < 8 && KM[j + 1] <= d) j += 1;
    const f = (d - KM[j]) / (KM[j + 1] - KM[j]);
    const tm = men[j] + f * (men[j + 1] - men[j]);
    const tw = women[j] + f * (women[j + 1] - women[j]);
    return tw - tm;
  })();
  const pad = 30;
  const left = 74;
  const X = (km: number) => left + ((width - left - pad) * km) / 42.195;
  const H = 190;
  const peak = band.ghost_s.indexOf(Math.max(...band.ghost_s));
  return (
    <div className="viz-card ghost-race">
      <div className="viz-head">
        <div><p className="viz-title">Same finish, different race</p><p className="viz-sub">Matched women and men finishing {band.label}, averaged section by section</p></div>
        <label className="ghost-select">
          <span>Finish band</span>
          <select value={pick} onChange={(e) => setPick(Number(e.target.value))}>
            {data.bands.map((b, i) => <option key={b.lo_min} value={i}>{b.label}</option>)}
          </select>
        </label>
      </div>
      <div ref={ref} className="viz">
        <svg width={width} height={H} role="img" aria-label={`Animated ghost race: in the ${band.label} band, matched men are ${mss(band.ghost_s[3])} ahead at 20 km and the two finish together.`}>
          {[0, 10, 20, 30, 40, 42.195].map((km) => <g key={km}><line x1={X(km)} x2={X(km)} y1={20} y2={H - 30} stroke={km === 0 || km > 42 ? '#F4B23E' : '#E3D9C6'} strokeDasharray={km === 0 || km > 42 ? undefined : '3 5'} /><text x={X(km)} y={H - 12} textAnchor="middle">{km === 0 ? 'start' : km > 42 ? 'finish' : units === 'mi' ? `${(km / 1.609344).toFixed(1)} mi` : `${km} km`}</text></g>)}
          <line x1={X(0)} x2={X(42.195)} y1={74} y2={74} stroke="#E3D9C6" strokeWidth={2} />
          <line x1={X(0)} x2={X(42.195)} y1={146} y2={146} stroke="#E3D9C6" strokeWidth={2} />
          <rect x={Math.min(X(wKm), X(mKm))} y={84} width={Math.abs(X(mKm) - X(wKm))} height={52} rx={6} fill="rgba(244,178,62,.18)" />
          <g style={{ color: '#000' }}>
            <RunnerGlyph phase={time * 1.5} x={X(mKm) - 32} y={74 - 70} scale={0.64} kit={MEN} skin="#8D5524" shorts="#1E2A4A" />
            <RunnerGlyph phase={time * 1.5 + 0.4} x={X(wKm) - 32} y={146 - 70} scale={0.64} kit={WOMEN} skin="#E0AC69" shorts="#1E2A4A" />
          </g>
          <text className="annotation" x={0} y={70} fill={MEN}>Men</text>
          <text className="annotation" x={0} y={142} fill={WOMEN}>Women</text>
        </svg>
      </div>
      <div className="ghost-ticker">
        <div><strong>{u >= 1 ? '0:00' : mss(Math.max(0, gapS))}</strong><span>{u >= 1 ? 'Same finish time.' : 'Matched men ahead on the clock right now'}</span></div>
        <div><strong>{mss(band.ghost_s[3])}</strong><span>ahead at {units === 'mi' ? '12.4 mi' : '20 km'}</span></div>
        <div><strong>{mss(Math.max(...band.ghost_s))}</strong><span>largest gap, at {units === 'mi' ? `${(KM[peak + 1] / 1.609344).toFixed(1)} mi` : `${KM[peak + 1]} km`}</span></div>
      </div>
      <p className="viz-note">Each runner follows the matched average for one group, so this is not a real pair. &quot;Ahead&quot; means on the clock, not on the road.</p>
    </div>
  );
}

type Metric = 'slowdown' | 'block' | 'kick';
const METRICS: Record<Metric, { label: string; w: (b: Demographics['bands'][number]) => number; m: (b: Demographics['bands'][number]) => number; fmt: (v: number) => string; max: number }> = {
  slowdown: { label: 'Sustained slowdown', w: (b) => b.women_slowdown * 100, m: (b) => b.men_slowdown * 100, fmt: (v) => `${v.toFixed(0)}%`, max: 70 },
  block: { label: '20–40 km block slower than 0–20 km', w: (b) => b.women_block, m: (b) => b.men_block, fmt: (v) => `${v.toFixed(1)}%`, max: 30 },
  kick: { label: 'Final 2.2 km faster than own 0–40 km average', w: (b) => b.women_kick * 100, m: (b) => b.men_kick * 100, fmt: (v) => `${v.toFixed(0)}%`, max: 50 },
};

export function GenderDumbbell({ data }: { data: Demographics }) {
  const [metric, setMetric] = useState<Metric>('slowdown');
  const spec = METRICS[metric];
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref, 900);
  const rows = data.bands;
  const rowH = 22;
  const m = { l: 78, r: 50, t: 24, b: 28 };
  const H = m.t + rows.length * rowH + m.b;
  const x = (v: number) => m.l + (v / spec.max) * (width - m.l - m.r);
  return (
    <div className="viz-card">
      <div className="viz-head">
        <div><p className="viz-title">The gap at every finish time</p><p className="viz-sub">Matched within the same race and finish minute</p></div>
        <div className="segmented" role="group" aria-label="Measure">
          {(Object.keys(METRICS) as Metric[]).map((k) => <button key={k} type="button" aria-pressed={metric === k} onClick={() => setMetric(k)}>{k === 'slowdown' ? 'Slowdown' : k === 'block' ? 'Late slowing' : 'Final kick'}</button>)}
        </div>
      </div>
      <div ref={ref} className="viz">
        <svg width={width} height={H} role="img" aria-label={`${spec.label} for matched women and men in each 10-minute finish band.`}>
          {Array.from({ length: Math.floor(spec.max / 10) + 1 }, (_, i) => i * 10).map((v) => <g key={v}><g className="grid"><line x1={x(v)} x2={x(v)} y1={m.t - 8} y2={H - m.b} /></g><text x={x(v)} y={H - 8} textAnchor="middle">{v}%</text></g>)}
          {rows.map((b, i) => {
            const y = m.t + i * rowH + rowH / 2;
            const wv = spec.w(b);
            const mv = spec.m(b);
            return (
              <g key={b.lo_min}>
                <text x={m.l - 10} y={y + 4} textAnchor="end">{b.label}</text>
                <line x1={x(wv)} x2={x(mv)} y1={y} y2={y} stroke="#C9BFAB" strokeWidth={3} strokeLinecap="round" />
                <circle cx={x(wv)} cy={y} r={6} fill={WOMEN} />
                <circle cx={x(mv)} cy={y} r={6} fill={MEN} />
                {i === 0 || i === rows.length - 1 || i % 5 === 0 ? <text x={Math.max(x(wv), x(mv)) + 10} y={y + 4} className="annotation-sub">{spec.fmt(wv)} vs {spec.fmt(mv)}</text> : null}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="legend-row"><span><i className="swatch" style={{ background: WOMEN }} />Women (recorded)</span><span><i className="swatch" style={{ background: MEN }} />Men (recorded)</span><span>{spec.label}</span></div>
    </div>
  );
}

export function AgeLadder({ data }: { data: Demographics }) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref, 900);
  const rows = data.ladder;
  const ages = [...new Set(rows.map((r) => r.age))];
  const H = 70 + ages.length * 26;
  const m = { l: 64, r: 20, t: 36, b: 30 };
  const lo = Math.min(...rows.map((r) => r.slowdown_vs_field)) * 100 - 2;
  const hi = Math.max(...rows.map((r) => r.slowdown_vs_field)) * 100 + 2;
  const x = (v: number) => m.l + ((v - lo) / (hi - lo)) * (width - m.l - m.r);
  const y = (age: string) => m.t + ages.indexOf(age) * 26 + 13;
  const [hover, setHover] = useState<string | null>(null);
  return (
    <div className="viz-card">
      <div className="viz-head"><div><p className="viz-title">The age ladder</p><p className="viz-sub">Sustained-slowdown share vs the same race&apos;s same-minute field (both genders), percentage points</p></div></div>
      <div ref={ref} className="viz" style={{ position: 'relative' }}>
        <svg width={width} height={H} role="img" aria-label="Every women's five-year age group sits below the field; every men's group sits higher than every women's group, with the gap narrowing with age.">
          <line x1={x(0)} x2={x(0)} y1={m.t - 16} y2={H - m.b} stroke="#15171C" />
          <text x={x(0)} y={m.t - 20} textAnchor="middle" className="annotation-sub">same as the field</text>
          {ages.map((a) => <text key={a} x={m.l - 10} y={y(a) + 4} textAnchor="end">{a}</text>)}
          {ages.map((a) => {
            const w = rows.find((r) => r.age === a && r.gender === 'Women');
            const mm = rows.find((r) => r.age === a && r.gender === 'Men');
            return w && mm ? <line key={a} x1={x(w.slowdown_vs_field * 100)} x2={x(mm.slowdown_vs_field * 100)} y1={y(a)} y2={y(a)} stroke="#E3D9C6" strokeWidth={2} /> : null;
          })}
          {rows.map((r) => (
            <g key={r.gender + r.age} onMouseEnter={() => setHover(r.gender + r.age)} onMouseLeave={() => setHover(null)}>
              <circle cx={x(r.slowdown_vs_field * 100)} cy={y(r.age)} r={hover === r.gender + r.age ? 8 : 6} fill={r.gender === 'Women' ? WOMEN : MEN} />
            </g>
          ))}
          {[-20, -10, 0, 10].filter((v) => v > lo && v < hi).map((v) => <text key={v} x={x(v)} y={H - 10} textAnchor="middle">{v > 0 ? `+${v}` : v} pts</text>)}
        </svg>
        {hover ? (() => {
          const r = rows.find((x2) => x2.gender + x2.age === hover)!;
          return <div className="viz-tooltip" style={{ left: x(r.slowdown_vs_field * 100), top: y(r.age) }}><b>{r.gender} {r.age}</b><span>{(r.slowdown_vs_field * 100).toFixed(1)} points vs the field</span><span>{(r.slowdown * 100).toFixed(0)}% had a sustained slowdown · {count(r.n)} finishes</span></div>;
        })() : null}
      </div>
      <div className="legend-row"><span><i className="swatch" style={{ background: WOMEN }} />Women</span><span><i className="swatch" style={{ background: MEN }} />Men</span><span>Exact ages from {data.granular_age_cities.join(', ')}</span></div>
      <p className="viz-note">Different people at different ages, not the same runners getting older. Ages come only from sources that record exact ages; some sources record age-group floors and are left out.</p>
    </div>
  );
}

export function WomenShare({ data }: { data: Demographics }) {
  const cities = data.women_share_by_city.filter((c) => c.years.length >= 5).sort((a, b) => b.years.reduce((s, y) => s + y.n, 0) - a.years.reduce((s, y) => s + y.n, 0)).slice(0, 8);
  return (
    <div className="share-grid">
      {cities.map((c) => {
        const ys = c.years;
        const y0 = ys[0].year;
        const y1 = ys[ys.length - 1].year;
        const px = (y: number) => 6 + ((y - y0) / Math.max(1, y1 - y0)) * 188;
        const py = (v: number) => 70 - v * 120;
        return (
          <div key={c.city} className="viz-card share-card">
            <p className="viz-title">{c.city === 'New York' ? 'New York City' : c.city}</p>
            <p className="share-delta"><strong>{Math.round(ys[0].women_share * 100)}% → {Math.round(ys[ys.length - 1].women_share * 100)}%</strong><span>{y0}–{y1}</span></p>
            <svg viewBox="0 0 200 76" aria-label={`Women's share of eligible finishes in ${c.city} from ${y0} to ${y1}`}>
              <line x1={0} x2={200} y1={py(0.5)} y2={py(0.5)} stroke="#DCD3C2" strokeDasharray="3 3" />
              <path d={ys.map((y, i) => `${i ? 'L' : 'M'}${px(y.year).toFixed(1)} ${py(y.women_share).toFixed(1)}`).join(' ')} fill="none" stroke={WOMEN} strokeWidth={2.5} />
              {ys.map((y) => <circle key={y.year} cx={px(y.year)} cy={py(y.women_share)} r={2.4} fill={WOMEN} />)}
            </svg>
          </div>
        );
      })}
    </div>
  );
}
