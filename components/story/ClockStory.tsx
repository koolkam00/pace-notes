'use client';

import { useMemo, useRef, useState } from 'react';
import { useUnits } from '@/components/UnitsProvider';
import { useWidth } from '@/components/viz/useSize';
import type { ReplayEditionMeta, ReplayIndex } from '@/lib/insights';
import { checkpointLabel, count, hms } from '@/lib/viz/format';

const KM = [5, 10, 15, 20, 25, 30, 35, 40, 42.195];
const name = (e: ReplayEditionMeta) => `${e.city === 'New York' ? 'New York City' : e.city} ${e.year}`;
const dist = (km: number, units: 'mi' | 'km', digits = 1) => (units === 'mi' ? `${(km / 1.609344).toFixed(digits)} mi` : `${km.toFixed(digits)} km`);

function EditionPicker({ editions, value, onChange }: { editions: ReplayEditionMeta[]; value: string; onChange: (slug: string) => void }) {
  return (
    <label className="ghost-select">
      <span>Race</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>{editions.map((e) => <option key={e.slug} value={e.slug}>{name(e)}</option>)}</select>
    </label>
  );
}

/** Where the whole field was when the fastest eligible finish crossed the line. */
export function FirstFinish({ editions, initial }: { editions: ReplayEditionMeta[]; initial: string }) {
  const list = editions.filter((e) => e.moments);
  const [slug, setSlug] = useState(initial);
  const e = list.find((x) => x.slug === slug) ?? list[0];
  const m = e.moments!;
  const { units } = useUnits();
  const segs = [
    { label: `not yet at ${checkpointLabel(10, units)}`, n: m.not_past_10_at_first, c: '#C8202F' },
    { label: `${checkpointLabel(10, units).replace(' mi', '').replace(' km', '')}–${checkpointLabel(20, units)}`, n: m.not_past_20_at_first - m.not_past_10_at_first, c: '#FF6A3D' },
    { label: `${checkpointLabel(20, units).replace(' mi', '').replace(' km', '')}–${checkpointLabel(30, units)}`, n: e.finishes - m.not_past_20_at_first - m.past_30_at_first, c: '#F4B23E' },
    { label: `past ${checkpointLabel(30, units)}`, n: m.past_30_at_first, c: '#17A673' },
  ];
  const share = m.not_past_20_at_first / e.finishes;
  return (
    <div className="viz-card dark first-finish">
      <div className="viz-head">
        <div><p className="viz-title">The moment the first finisher crosses the line</p><p className="viz-sub">Every eligible finish in the race, by the last checkpoint passed on the same clock</p></div>
        <EditionPicker editions={list} value={e.slug} onChange={setSlug} />
      </div>
      <div className="first-finish-top">
        <p className="first-finish-clock"><span>Race clock</span><strong>{hms(m.first_finish_s)}</strong></p>
        <p className="first-finish-big"><strong>{Math.round(share * 100)}%</strong><span>of {count(e.finishes)} eligible finishes had not yet reached {checkpointLabel(20, units)}.</span></p>
      </div>
      <div className="first-finish-bar" role="img" aria-label={segs.map((s) => `${s.label}: ${count(s.n)}`).join('; ')}>
        {segs.map((s) => <span key={s.label} style={{ flexGrow: Math.max(s.n, 0), background: s.c }} title={`${s.label}: ${count(s.n)}`} />)}
      </div>
      <div className="first-finish-legend">
        {segs.map((s) => <span key={s.label}><i style={{ background: s.c }} />{s.label} <b>{count(s.n)}</b></span>)}
      </div>
      <p className="viz-note">At that moment the back of the eligible field was about {dist(m.back_km_at_first, units)} into the course, {dist(42.195 - m.back_km_at_first, units)} behind the front. Half the field was home by {hms(m.half_home_s)}, {m.half_home_ratio.toFixed(2)} times the first finish time. Everyone shares one race clock here: wave starts are not recorded.</p>
    </div>
  );
}

/** An even-paced ghost against the real field: share of finishes ahead on the clock at each checkpoint. */
export function EvenGhost({ editions, initial }: { editions: ReplayEditionMeta[]; initial: string }) {
  const list = editions.filter((e) => e.ghosts?.length);
  const [slug, setSlug] = useState(initial);
  const e = list.find((x) => x.slug === slug) ?? list[0];
  const ghosts = e.ghosts!;
  const [ti, setTi] = useState(Math.max(0, ghosts.findIndex((g) => g.target_s === 16200)));
  const g = ghosts[Math.min(ti, ghosts.length - 1)];
  const { units } = useUnits();
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref, 760);
  const H = 250;
  const m = { l: 44, r: 16, t: 18, b: 34 };
  const x = (km: number) => m.l + (km / 42.195) * (width - m.l - m.r);
  const y = (s: number) => m.t + (1 - s) * (H - m.t - m.b);
  const pts = [[0, g.ahead[0]] as [number, number], ...g.ahead.map((s, k) => [KM[k], s] as [number, number])];
  const path = g.ahead.map((s, k) => `${k ? 'L' : 'M'}${x(KM[k]).toFixed(1)} ${y(s).toFixed(1)}`).join(' ');
  const area = `${path} L${x(42.195)} ${y(0)} L${x(5)} ${y(0)} Z`;
  const pace = (g.target_s / 42.195) * (units === 'mi' ? 1.609344 : 1);
  const paceText = `${Math.floor(pace / 60)}:${String(Math.round(pace % 60)).padStart(2, '0')}/${units}`;
  void pts;
  return (
    <div className="viz-card ghost-even">
      <div className="viz-head">
        <div><p className="viz-title">Run it perfectly even</p><p className="viz-sub">A ghost holding {paceText} from start to finish, against every eligible finish in {name(e)}</p></div>
        <EditionPicker editions={list} value={e.slug} onChange={setSlug} />
      </div>
      <label className="heat-slider ghost-target">
        <span>Ghost&apos;s finish time <strong>{hms(g.target_s).slice(0, -3)}</strong></span>
        <input type="range" min={0} max={ghosts.length - 1} step={1} value={ti} onChange={(ev) => setTi(Number(ev.target.value))} aria-label="Ghost finish time" />
      </label>
      <div ref={ref} className="viz">
        <svg width={width} height={H} role="img" aria-label={`Share of the field ahead of an even ${hms(g.target_s)} ghost: ${Math.round(g.ahead[0] * 100)}% at 5 km, ${Math.round(g.ahead[8] * 100)}% at the finish.`}>
          {[0, .25, .5, .75, 1].map((s) => <g key={s} className="grid"><line x1={m.l} x2={width - m.r} y1={y(s)} y2={y(s)} /><text x={m.l - 8} y={y(s) + 4} textAnchor="end">{Math.round(s * 100)}%</text></g>)}
          <path d={area} fill="#2F5BFF" opacity={0.12} />
          <path d={path} fill="none" stroke="#2F5BFF" strokeWidth={3} />
          {g.ahead.map((s, k) => <circle key={k} cx={x(KM[k])} cy={y(s)} r={k === 0 || k === 8 ? 6 : 3.5} fill="#2F5BFF" stroke="#FFFDF8" strokeWidth={1.5} />)}
          <text className="annotation" x={x(5) + 8} y={y(g.ahead[0]) - 10}>{Math.round(g.ahead[0] * 100)}% ahead</text>
          <text className="annotation" x={x(42.195) - 6} y={y(g.ahead[8]) - 12} textAnchor="end">{Math.round(g.ahead[8] * 100)}% ahead</text>
          {[5, 10, 20, 30, 40].map((km) => <text key={km} x={x(km)} y={H - 12} textAnchor="middle">{checkpointLabel(km, units)}</text>)}
        </svg>
      </div>
      <div className="ghost-ticker">
        <div><strong>{count(g.net_passes)}</strong><span>finishes the ghost moves past on the clock between {checkpointLabel(5, units)} and the finish, without speeding up</span></div>
        <div><strong>{hms(g.even_20km_s)}</strong><span>the ghost&apos;s time at {checkpointLabel(20, units)}</span></div>
        <div><strong>{g.typical_20km_s ? hms(g.typical_20km_s) : '—'}</strong><span>{g.typical_20km_s ? `typical ${checkpointLabel(20, units)} time for ${count(g.near_n ?? 0)} real finishes within 2:30 of ${hms(g.target_s).slice(0, -3)}` : 'too few real finishes near this time'}</span></div>
      </div>
      <p className="viz-note">&quot;Ahead&quot; and &quot;moves past&quot; are clock ranks among eligible finishes, not passes on the road. The typical time is the median share of finish time reached at {checkpointLabel(20, units)}, not anyone&apos;s plan.</p>
    </div>
  );
}

/** The emptying-course illusion: who is left explains much of the apparent slowdown. */
export function EmptyingCourse({ editions, initial }: { editions: ReplayEditionMeta[]; initial: string }) {
  const list = editions.filter((e) => e.composition?.length);
  const [slug, setSlug] = useState(initial);
  const e = list.find((x) => x.slug === slug) ?? list[0];
  const rows = e.composition!;
  const { units } = useUnits();
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref, 760);
  const H = 290;
  const m = { l: 48, r: 18, t: 28, b: 34 };
  const toU = (kmh: number) => (units === 'mi' ? kmh / 1.609344 : kmh);
  const maxT = rows[rows.length - 1].clock_s;
  const lo = Math.floor(toU(Math.min(...rows.map((r) => r.current_kmh))) - 0.5);
  const hi = Math.ceil(toU(Math.max(...rows.map((r) => Math.max(r.current_kmh, r.whole_race_kmh)))) + 0.5);
  const x = (s: number) => m.l + ((s - 600) / (maxT - 600)) * (width - m.l - m.r);
  const y = (v: number) => m.t + ((hi - toU(v)) / (hi - lo)) * (H - m.t - m.b);
  const line = (key: 'current_kmh' | 'whole_race_kmh') => rows.map((r, i) => `${i ? 'L' : 'M'}${x(r.clock_s).toFixed(1)} ${y(r[key]).toFixed(1)}`).join(' ');
  const five = rows.find((r) => r.clock_s === 18000);
  const ticks = [];
  for (let v = lo; v <= hi; v += 1) ticks.push(v);
  return (
    <div className="viz-card">
      <div className="viz-head">
        <div><p className="viz-title">Who is still out there</p><p className="viz-sub">Runners still on course at each moment: speed in their current section, and their own whole-race average speed</p></div>
        <EditionPicker editions={list} value={e.slug} onChange={setSlug} />
      </div>
      <div ref={ref} className="viz">
        <svg width={width} height={H} role="img" aria-label={five ? `At 5:00 on the clock, ${count(five.on_course)} finishes were still on course at ${toU(five.current_kmh).toFixed(1)} ${units === 'mi' ? 'mph' : 'km/h'}; their own race average was ${toU(five.whole_race_kmh).toFixed(1)}.` : 'Speeds of runners still on course.'}>
          {ticks.map((v) => <g key={v} className="grid"><line x1={m.l} x2={width - m.r} y1={m.t + ((hi - v) / (hi - lo)) * (H - m.t - m.b)} y2={m.t + ((hi - v) / (hi - lo)) * (H - m.t - m.b)} /><text x={m.l - 8} y={m.t + ((hi - v) / (hi - lo)) * (H - m.t - m.b) + 4} textAnchor="end">{v}</text></g>)}
          <text x={m.l - 8} y={10} textAnchor="end" className="annotation-sub">{units === 'mi' ? 'mph' : 'km/h'}</text>
          <path d={`${line('whole_race_kmh')} ${[...rows].reverse().map((r) => `L${x(r.clock_s).toFixed(1)} ${y(r.current_kmh).toFixed(1)}`).join(' ')} Z`} fill="#FF5B2E" opacity={0.12} />
          <path d={line('whole_race_kmh')} fill="none" stroke="#7A4DFF" strokeWidth={2.6} strokeDasharray="6 4" />
          <path d={line('current_kmh')} fill="none" stroke="#FF5B2E" strokeWidth={3} />
          {rows.filter((r) => r.clock_s % 3600 === 0 || r.clock_s === 600).map((r) => <text key={r.clock_s} x={x(r.clock_s)} y={H - 12} textAnchor="middle">{r.clock_s === 600 ? '0:10' : `${r.clock_s / 3600}:00`}</text>)}
          {five ? <g><line x1={x(18000)} x2={x(18000)} y1={y(five.whole_race_kmh)} y2={y(five.current_kmh)} stroke="var(--ink)" strokeWidth={1.4} /><text className="annotation" x={x(18000) + 8} y={y(five.current_kmh) + 18}>{count(five.on_course)} still out at 5:00</text></g> : null}
        </svg>
      </div>
      <div className="pairs-legend"><span><i style={{ background: '#FF5B2E' }} />current section speed</span><span><i style={{ background: '#7A4DFF' }} />same runners&apos; whole-race average</span></div>
      {five?.composition_share != null ? (
        <p className="viz-note">Since 0:10 the average speed on course fell from {toU(rows[0].current_kmh).toFixed(1)} to {toU(five.current_kmh).toFixed(1)} {units === 'mi' ? 'mph' : 'km/h'} at 5:00. About {Math.round(five.composition_share * 100)}% of that drop is who is left: the runners still out at 5:00 averaged only {toU(five.whole_race_kmh).toFixed(1)} {units === 'mi' ? 'mph' : 'km/h'} over their whole race. This is descriptive accounting, not a cause.</p>
      ) : null}
    </div>
  );
}

/** One 30-second clock pack at 10 km and how far apart its members finish. */
export function ClockPack({ editions, initial }: { editions: ReplayEditionMeta[]; initial: string }) {
  const list = editions.filter((e) => e.pack);
  const [slug, setSlug] = useState(initial);
  const e = list.find((x) => x.slug === slug) ?? list[0];
  const p = e.pack!;
  const { units } = useUnits();
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref, 760);
  const H = 300;
  const m = { l: 64, r: 18, t: 18, b: 34 };
  const q = p.quantiles;
  const off = q.map((r) => ({ km: r.km, lo: (r.p10_s - r.p50_s) / 60, hi: (r.p90_s - r.p50_s) / 60 }));
  const span = Math.max(10, Math.ceil(Math.max(...off.map((o) => Math.max(o.hi, -o.lo))) / 10) * 10);
  const x = (km: number) => m.l + (km / 42.195) * (width - m.l - m.r);
  const y = (min: number) => m.t + ((span - min) / (2 * span)) * (H - m.t - m.b);
  const band = `M${x(off[0].km)} ${y(off[0].hi)} ${off.map((o) => `L${x(o.km).toFixed(1)} ${y(o.hi).toFixed(1)}`).join(' ')} ${[...off].reverse().map((o) => `L${x(o.km).toFixed(1)} ${y(o.lo).toFixed(1)}`).join(' ')} Z`;
  const ticks = [];
  for (let t = -span; t <= span; t += span / 2) ticks.push(t);
  const last = off[8];
  return (
    <div className="viz-card">
      <div className="viz-head">
        <div><p className="viz-title">A clock pack comes apart</p><p className="viz-sub">{count(p.n)} finishes that passed {checkpointLabel(p.checkpoint_km, units)} within the same 30 seconds ({hms(p.window_start_s)}–{hms(p.window_start_s + 29)}): minutes ahead of or behind the pack&apos;s median</p></div>
        <EditionPicker editions={list} value={e.slug} onChange={setSlug} />
      </div>
      <div ref={ref} className="viz">
        <svg width={width} height={H} role="img" aria-label={`Their finish times spread over ${p.finish_window_min.toFixed(0)} minutes between the 10th and 90th percentile.`}>
          {ticks.map((t) => <g key={t} className="grid"><line x1={m.l} x2={width - m.r} y1={y(t)} y2={y(t)} /><text x={m.l - 8} y={y(t) + 4} textAnchor="end">{t === 0 ? 'median' : `${t > 0 ? '+' : '−'}${Math.abs(t)} min`}</text></g>)}
          <path d={band} fill="#F4B23E" opacity={0.45} />
          <line x1={x(off[0].km)} x2={x(42.195)} y1={y(0)} y2={y(0)} stroke="var(--ink)" strokeWidth={2} />
          <line x1={x(p.checkpoint_km)} x2={x(p.checkpoint_km)} y1={m.t} y2={H - m.b} stroke="#B9AE98" strokeDasharray="4 4" />
          <text className="annotation" x={x(p.checkpoint_km) + 6} y={m.t + 14}>together here</text>
          <line x1={x(42.195) - 3} x2={x(42.195) - 3} y1={y(last.hi)} y2={y(last.lo)} stroke="#C8202F" strokeWidth={3} />
          <text className="annotation" x={x(42.195) - 12} y={y(last.hi) - 8} textAnchor="end">{p.finish_window_min.toFixed(0)} min apart at the finish</text>
          {[5, 10, 20, 30, 40].map((km) => <text key={km} x={x(km)} y={H - 12} textAnchor="middle">{checkpointLabel(km, units)}</text>)}
        </svg>
      </div>
      <p className="viz-note">Shaded: the middle 80% of the pack&apos;s elapsed times at each checkpoint, relative to the pack&apos;s median there. A clock pack shares elapsed times, not necessarily the same stretch of road.</p>
    </div>
  );
}

/** Every edition's stretch: how much wider the field is over 20–40 km than over 0–20 km. */
export function StretchStrip({ stretch }: { stretch: NonNullable<ReplayIndex['stretch']> }) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref, 860);
  const H = 170;
  const m = { l: 16, r: 16 };
  const lo = 0.96;
  const hi = 1.24;
  const x = (v: number) => m.l + ((v - lo) / (hi - lo)) * (width - m.l - m.r);
  const placed = useMemo(() => {
    const sorted = [...stretch.editions].sort((a, b) => a.stretch - b.stretch);
    const lanes: number[] = [];
    return sorted.map((d) => {
      const px = (d.stretch - lo) / (hi - lo);
      let lane = 0;
      while (lanes[lane] !== undefined && px - lanes[lane] < 0.012) lane += 1;
      lanes[lane] = px;
      return { ...d, lane };
    });
  }, [stretch]);
  const cy = (lane: number) => 92 - (lane % 2 === 0 ? 1 : -1) * Math.ceil(lane / 2) * 9;
  return (
    <div className="viz-card">
      <div className="viz-head"><div><p className="viz-title">{stretch.wider_after_20} of {stretch.editions.length} races stretch after 20 km</p><p className="viz-sub">Width of the field (90th ÷ 10th percentile block time) over 20–40 km, relative to 0–20 km</p></div></div>
      <div ref={ref} className="viz">
        <svg width={width} height={H} role="img" aria-label={`All ${stretch.editions.length} editions sit to the right of 1, from ${stretch.min.stretch.toFixed(2)} to ${stretch.max.stretch.toFixed(2)}.`}>
          <line x1={x(1)} x2={x(1)} y1={14} y2={H - 30} stroke="var(--ink)" strokeWidth={1.5} />
          <text x={x(1) - 6} y={22} textAnchor="end" className="annotation-sub">narrower after 20 km</text>
          <text x={x(1) + 6} y={22} className="annotation-sub">wider after 20 km →</text>
          {placed.map((d) => <circle key={`${d.city}${d.year}`} cx={x(d.stretch)} cy={cy(d.lane)} r={3.6} fill="#F4B23E" stroke="#8A5A00" strokeWidth={0.6}><title>{`${d.city} ${d.year}: ${d.stretch.toFixed(3)}×`}</title></circle>)}
          {[1, 1.05, 1.1, 1.15, 1.2].map((v) => <text key={v} x={x(v)} y={H - 10} textAnchor="middle">{v.toFixed(2)}×</text>)}
        </svg>
      </div>
      <p className="viz-note">Each dot is one race edition with at least 1,000 eligible finishes. Narrowest stretch: {stretch.min.city} {stretch.min.year} ({stretch.min.stretch.toFixed(2)}×); widest: {stretch.max.city} {stretch.max.year} ({stretch.max.stretch.toFixed(2)}×). These are percentiles at each block, not the same runners.</p>
    </div>
  );
}
