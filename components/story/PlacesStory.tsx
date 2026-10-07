'use client';

import { useMemo, useRef, useState } from 'react';
import { RunnerGlyph } from '@/components/art/Runner';
import { useInView, usePrefersReducedMotion, useTicker } from '@/components/art/useTicker';
import { useWidth } from '@/components/viz/useSize';
import { useUnits } from '@/components/UnitsProvider';
import type { Positions } from '@/lib/insights';
import { count, checkpointLabel } from '@/lib/viz/format';
import { useStoryData } from './StoryData';

const CHECKPOINTS = ['20', '30', '35', '40'] as const;

function mmss(s: number) {
  return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
}

/** Drag the gap, pick a checkpoint: how often the trailing finish crossed the line first. */
export function GapGauge({ data: given }: { data?: Positions }) {
  const data = useStoryData('positions', given);
  const [gap, setGap] = useState(60);
  const [cp, setCp] = useState<(typeof CHECKPOINTS)[number]>('30');
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref, 900);
  const reduced = usePrefersReducedMotion();
  const inView = useInView(ref);
  const time = useTicker(inView && !reduced, 40, 30);
  const { units } = useUnits();
  const rows = data.coin_flip[cp];
  const row = rows.find((r) => gap >= r.gap_lo_s && gap < r.gap_lo_s + 30) ?? rows[rows.length - 1];
  const share = row.share;
  const binLo = row.gap_lo_s === 0 ? 1 : row.gap_lo_s; // tied clock times are never paired
  const binHi = row.gap_lo_s >= 870 ? 900 : row.gap_lo_s + 29; // the last bin includes exactly 15:00
  const span = `${mmss(binLo)}–${mmss(binHi)}`;
  const H = 300;
  const m = { l: 46, r: 16, t: 20, b: 40 };
  const iw = width - m.l - m.r;
  const ih = H - m.t - m.b;
  const x = (s: number) => m.l + (s / 900) * iw;
  const y = (v: number) => m.t + ih - (v / 0.5) * ih;
  const colours: Record<string, string> = { '20': '#9DB6FB', '30': '#2F5BFF', '35': '#7A4DFF', '40': '#E2416B' };
  const km = Number(cp);
  const label = units === 'mi' ? `${(km / 1.609344).toFixed(1)} mi` : `${km} km`;
  return (
    <div className="viz-card gap-gauge">
      <div className="viz-head">
        <div><p className="viz-title">The gap gauge</p><p className="viz-sub">Pairs of finishes in the same race, ranked on the clock</p></div>
        <div className="segmented" role="group" aria-label="Checkpoint">
          {CHECKPOINTS.map((c) => <button key={c} type="button" aria-pressed={cp === c} onClick={() => setCp(c)}>{units === 'mi' ? `${(Number(c) / 1.609344).toFixed(1)} mi` : `${c} km`}</button>)}
        </div>
      </div>
      <div className="gap-top">
        <div className="gap-number">
          <strong>{Math.round(share * 100)}%</strong>
          <span>of the time, a finish <b>{span}</b> behind at {label} still crossed the line first.</span>
        </div>
        <svg className="gap-runners" viewBox="0 -16 320 106" aria-hidden="true">
          <line x1={0} x2={320} y1={84} y2={84} stroke="currentColor" opacity={0.2} />
          <RunnerGlyph phase={time * 1.5 + 0.3} x={40} y={-10} scale={0.85} kit="#2F5BFF" skin="#C68642" />
          <RunnerGlyph phase={time * 1.5} x={40 + 40 + Math.min(150, (gap / 900) * 300)} y={-10} scale={0.85} kit="#FF5B2E" skin="#5A3825" />
          <text x={86} y={-6} textAnchor="middle" className="lane-tag">chaser</text>
          <text x={126 + Math.min(150, (gap / 900) * 300)} y={-6} textAnchor="middle" className="lane-tag">leader</text>
        </svg>
      </div>
      <label className="gap-slider">
        <span>Gap on the clock at {label}: <b>{span}</b></span>
        <input type="range" min={0} max={870} step={30} value={gap} onChange={(e) => setGap(Number(e.target.value))} aria-valuetext={`${mmss(binLo)} to ${mmss(binHi)} behind`} />
      </label>
      <div ref={ref} className="viz">
        <svg width={width} height={H} role="img" aria-label="Share of pairs where the trailing finish ends ahead, by clock gap, for four checkpoints. The share falls fastest from 40 km.">
          {[0, .1, .2, .3, .4, .5].map((v) => <g key={v}><g className="grid"><line x1={m.l} x2={width - m.r} y1={y(v)} y2={y(v)} /></g><text x={m.l - 8} y={y(v) + 4} textAnchor="end">{v * 100}%</text></g>)}
          {CHECKPOINTS.map((c) => {
            const rs = data.coin_flip[c];
            return <path key={c} d={rs.map((r, i) => `${i ? 'L' : 'M'}${x(r.gap_lo_s + 15).toFixed(1)} ${y(r.share).toFixed(1)}`).join(' ')} fill="none" stroke={colours[c]} strokeWidth={c === cp ? 3.5 : 1.5} opacity={c === cp ? 1 : 0.55} />;
          })}
          <line x1={x(gap)} x2={x(gap)} y1={m.t} y2={m.t + ih} stroke="#15171C" strokeDasharray="3 3" />
          <circle cx={x(row.gap_lo_s + 15)} cy={y(share)} r={6} fill={colours[cp]} stroke="#FFFDF8" strokeWidth={2} />
          {(width < 560 ? [0, 240, 480, 720] : [0, 120, 240, 360, 480, 600, 720, 840]).map((s) => <text key={s} x={x(s)} y={H - 20} textAnchor="middle">{s / 60} min</text>)}
          <text x={m.l + iw / 2} y={H - 4} textAnchor="middle" className="axis-label">gap behind on the clock at the checkpoint</text>
        </svg>
      </div>
      <div className="legend-row">{CHECKPOINTS.map((c) => <span key={c}><i style={{ background: colours[c], height: c === cp ? 4 : 2 }} />Gap measured at {units === 'mi' ? `${(Number(c) / 1.609344).toFixed(1)} mi` : `${c} km`}</span>)}</div>
      <p className="viz-note">Clock ranks compare elapsed times, not positions on the road. A rate describes past pairs of finishes in the same race, not anyone&apos;s personal chances.</p>
    </div>
  );
}

export function GainHistogram({ data: given }: { data?: Positions }) {
  const data = useStoryData('positions', given);
  const at30 = checkpointLabel(30, useUnits().units);
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref, 900);
  const H = 260;
  const m = { l: 40, r: 10, t: 28, b: 40 };
  const iw = width - m.l - m.r;
  const ih = H - m.t - m.b;
  const rows = data.histogram;
  const max = Math.max(...rows.map((r) => r.share));
  const x = (v: number) => m.l + ((v + 30) / 45) * iw;
  const y = (v: number) => m.t + ih - (v / max) * ih;
  const bw = iw / rows.length - 1;
  const narrow = width < 560;
  return (
    <div className="viz-card">
      <div className="viz-head"><div><p className="viz-title">Places gained or lost after {at30}</p><p className="viz-sub">Percentile points of the field, {count(data.cohort_n)} eligible finishes</p></div></div>
      <div ref={ref} className="viz">
        <svg width={width} height={H} role="img" aria-label={`Histogram of percentile points gained after ${at30}. Most finishes gain a few points; a long tail loses many.`}>
          {rows.map((r) => <rect key={r.lo} x={x(r.lo) + 0.5} y={y(r.share)} width={Math.max(1, bw)} height={m.t + ih - y(r.share)} fill={r.lo <= -10 ? '#E2416B' : r.lo >= 10 ? '#17A673' : r.lo < 0 ? '#F6A7B9' : '#9BD8C0'} />)}
          <line x1={x(0)} x2={x(0)} y1={m.t - 8} y2={m.t + ih} stroke="#15171C" />
          <text className="annotation" x={x(-29)} y={m.t + 4}>{narrow ? 'Lost 10+ points' : 'Late sinkers · lost 10+ points'}</text>
          <text className="annotation-sub" x={x(-29)} y={m.t + 20}>{(data.sinker_share * 100).toFixed(1)}%{narrow ? '' : ' of finishes'}</text>
          <text className="annotation" x={x(14.5)} y={m.t + 4} textAnchor="end">{narrow ? 'Gained 10+' : 'Late surgers · gained 10+'}</text>
          <text className="annotation-sub" x={x(14.5)} y={m.t + 20} textAnchor="end">{(data.surger_share * 100).toFixed(1)}%{narrow ? '' : ' of finishes'}</text>
          {[-30, -20, -10, 0, 10].map((v) => <text key={v} x={x(v)} y={H - 20} textAnchor="middle">{v > 0 ? `+${v}` : v}</text>)}
          <text x={m.l + iw / 2} y={H - 4} textAnchor="middle" className="axis-label">{narrow ? `points gained, ${at30} to finish` : `percentile points gained from ${at30} to the finish`}</text>
        </svg>
      </div>
      <p className="viz-note">{(data.gained_share * 100).toFixed(0)}% of finishes gained places on the clock after {at30}, mostly a few points. Losses are rarer but much larger: about {(data.sinker_share / data.surger_share).toFixed(0)} late sinkers for every late surger.</p>
    </div>
  );
}

export function BreakEven({ data: given }: { data?: Positions }) {
  const data = useStoryData('positions', given);
  const at30 = checkpointLabel(30, useUnits().units);
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref, 900);
  const [hover, setHover] = useState<number | null>(null);
  const H = 300;
  const m = { l: 46, r: 16, t: 20, b: 40 };
  const iw = width - m.l - m.r;
  const ih = H - m.t - m.b;
  const rows = data.breakeven.filter((b) => b.x >= -12 && b.x <= 60);
  const x0 = rows[0].x - 1;
  const x1 = rows[rows.length - 1].x + 1;
  const yMin = Math.min(...rows.map((r) => r.p10));
  const yMax = Math.max(...rows.map((r) => r.p90));
  const x = (v: number) => m.l + ((v - x0) / (x1 - x0)) * iw;
  const y = (v: number) => m.t + ih - ((v - yMin) / (yMax - yMin)) * ih;
  const band = `${rows.map((r, i) => `${i ? 'L' : 'M'}${x(r.x)} ${y(r.p90)}`).join(' ')} ${[...rows].reverse().map((r) => `L${x(r.x)} ${y(r.p10)}`).join(' ')} Z`;
  const hov = hover === null ? null : rows[hover];
  const { units } = useUnits();
  const late = units === 'mi' ? '18.6–24.9 mi' : '30–40 km';
  const slowText = (v: number) => (v === 0 ? 'the same pace' : v > 0 ? `${v}% slower` : `${-v}% faster`);
  const zero = rows.reduce((b, r, k) => (Math.abs(r.x) < Math.abs(rows[b].x) ? k : b), 0);
  const cross = data.breakeven_crossing ?? 0;
  return (
    <div className="viz-card">
      <div className="viz-head"><div><p className="viz-title">How much slowing costs places</p><p className="viz-sub">{late} pace compared with the same finish&apos;s 5–20 km pace</p></div></div>
      <div ref={ref} className="viz" style={{ position: 'relative' }} onMouseLeave={() => setHover(null)}>
        <svg width={width} height={H} role="img" aria-label={`Median percentile points gained after ${at30} falls as 30–40 km slowing grows, crossing zero at about ${cross.toFixed(0)}% slower.`}>
          <path d={band} fill="rgba(47,91,255,.14)" />
          <line x1={m.l} x2={width - m.r} y1={y(0)} y2={y(0)} stroke="#15171C" />
          <path d={rows.map((r, i) => `${i ? 'L' : 'M'}${x(r.x)} ${y(r.median)}`).join(' ')} fill="none" stroke="#2346E6" strokeWidth={3} />
          <line x1={x(cross)} x2={x(cross)} y1={m.t} y2={m.t + ih} stroke="#FF5B2E" strokeDasharray="4 3" strokeWidth={1.5} />
          <text className="annotation" x={x(cross) + 6} y={m.t + 12}>break-even ≈ {cross.toFixed(1)}% slower</text>
          <text className="annotation-sub" x={width - m.r - 4} y={y(0) - 8} textAnchor="end">gained places ↑</text>
          <text className="annotation-sub" x={width - m.r - 4} y={y(0) + 18} textAnchor="end">lost places ↓</text>
          {(width < 560 ? [-10, 10, 30, 50] : [-10, 0, 10, 20, 30, 40, 50, 60]).filter((v) => v >= x0 && v <= x1).map((v) => <text key={v} x={x(v)} y={H - 20} textAnchor="middle">{v > 0 ? `+${v}%` : `${v}%`}</text>)}
          {[-10, -5, 0, 5, 10].filter((v) => v >= yMin && v <= yMax).map((v) => <text key={v} x={m.l - 8} y={y(v) + 4} textAnchor="end">{v > 0 ? `+${v}` : v}</text>)}
          {hov ? <circle cx={x(hov.x)} cy={y(hov.median)} r={5} fill="#2346E6" stroke="#FFFDF8" strokeWidth={2} /> : null}
          <rect x={m.l} y={m.t} width={iw} height={ih} fill="transparent" onMouseMove={(e) => {
            const box = (e.currentTarget as SVGRectElement).getBoundingClientRect();
            const v = x0 + ((e.clientX - box.left) / box.width) * (x1 - x0);
            let best = 0;
            rows.forEach((r, i) => { if (Math.abs(r.x - v) < Math.abs(rows[best].x - v)) best = i; });
            setHover(best);
          }} />
          <text x={m.l + iw / 2} y={H - 4} textAnchor="middle" className="axis-label">{late} pace vs own 5–20 km pace</text>
        </svg>
        {hov ? <div className="viz-tooltip" style={{ left: Math.min(width - 90, Math.max(90, x(hov.x))), top: y(hov.median) }}><b>{slowText(hov.x)}</b><span>Median {hov.median > 0 ? '+' : ''}{hov.median.toFixed(1)} points</span><span>{Math.round(hov.gained * 100)}% gained places · {count(hov.n)} finishes</span></div> : null}
      </div>
      <label className="heat-slider ledger-slider">
        <span>{late} pace vs own 5–20 km pace: <strong>{slowText((hov ?? rows[zero]).x)}</strong></span>
        <input type="range" min={0} max={rows.length - 1} step={1} value={hover ?? zero} onChange={(e) => setHover(Number(e.target.value))}
          aria-valuetext={`${slowText((hov ?? rows[zero]).x)}: median ${(hov ?? rows[zero]).median.toFixed(1)} points, ${Math.round((hov ?? rows[zero]).gained * 100)}% gained places, ${count((hov ?? rows[zero]).n)} finishes`} />
      </label>
      <p className="viz-note">Shaded: the middle 80% of finishes at each level of slowing. Everyone around you is slowing too, so a typical finish holds its place until it slows by about {cross.toFixed(0)}%. Both measures overlap the same late kilometres, so this describes the link rather than predicting it.</p>
    </div>
  );
}

export function Ledger({ data: given }: { data?: Positions }) {
  const data = useStoryData('positions', given);
  const at30 = checkpointLabel(30, useUnits().units);
  const l = data.ledger;
  return (
    <div className="ledger">
      <div className="ledger-head"><span>Receipt · median runner after {at30}</span><span>{count(l.n)} finishes ranked 49th–51st percentile at {at30}</span></div>
      <div className="ledger-row"><span>Other finishers passed on the clock</span><b>{count(l.median_passes)}</b></div>
      <div className="ledger-row"><span>Passed them on the clock</span><b>−{count(l.median_passed_by)}</b></div>
      <div className="ledger-row total"><span>Median per 1,000 others, race by race</span><b>{l.passes_per_1000.toFixed(0)} vs {l.passed_by_per_1000.toFixed(0)}</b></div>
      <p>Median field: {count(l.median_field)} eligible finishes. Counts compare elapsed times at the {at30} and finish mats; swaps between mats are invisible. Each median is taken separately, so the rows do not divide into each other.</p>
    </div>
  );
}

export function WomenMen({ data: given }: { data?: Positions }) {
  const data = useStoryData('positions', given);
  const at30 = checkpointLabel(30, useUnits().units);
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref, 900);
  const [hover, setHover] = useState<number | null>(null);
  const rows = useMemo(() => [...data.gender_editions].sort((a, b) => (a.women - a.men) - (b.women - b.men)), [data]);
  const ahead = rows.filter((r) => r.women > r.men).length;
  const H = 300;
  const m = { l: 40, r: 12, t: 16, b: 34 };
  const iw = width - m.l - m.r;
  const ih = H - m.t - m.b;
  const lo = Math.min(...rows.map((r) => Math.min(r.men, r.women)));
  const hi = Math.max(...rows.map((r) => Math.max(r.men, r.women)));
  const x = (i: number) => m.l + ((i + 0.5) / rows.length) * iw;
  const y = (v: number) => m.t + ih - ((v - lo) / (hi - lo)) * ih;
  const hov = hover === null ? null : rows[hover];
  return (
    <div className="viz-card">
      <div className="viz-head"><div><p className="viz-title">Women gain on men after {at30}, race by race</p><p className="viz-sub">{ahead} of {rows.length} race editions: each arrow runs from men&apos;s mean change to women&apos;s</p></div>
        <div className="legend-row"><span><i className="swatch" style={{ background: '#0FA3A3' }} />Men</span><span><i className="swatch" style={{ background: '#7A4DFF' }} />Women</span></div></div>
      <div ref={ref} className="viz" style={{ position: 'relative' }} onMouseLeave={() => setHover(null)}>
        <svg width={width} height={H} role="img" aria-label={`For ${ahead} of ${rows.length} race editions, women's mean percentile change after ${at30} is above men's.`}>
          {[-2, -1, 0, 1, 2, 3].filter((v) => v >= lo && v <= hi).map((v) => <g key={v}><g className="grid"><line x1={m.l} x2={width - m.r} y1={y(v)} y2={y(v)} /></g><text x={m.l - 8} y={y(v) + 4} textAnchor="end">{v > 0 ? `+${v}` : v}</text></g>)}
          <line x1={m.l} x2={width - m.r} y1={y(0)} y2={y(0)} stroke="#15171C" />
          {rows.map((r, i) => (
            <g key={`${r.city}${r.year}`} opacity={hover === null || hover === i ? 1 : 0.35}>
              <line x1={x(i)} x2={x(i)} y1={y(r.men)} y2={y(r.women)} stroke="#B9AFF5" strokeWidth={Math.max(1, iw / rows.length - 1.5)} />
              <circle cx={x(i)} cy={y(r.men)} r={2.2} fill="#0FA3A3" />
              <circle cx={x(i)} cy={y(r.women)} r={2.6} fill="#7A4DFF" />
            </g>
          ))}
          <text x={m.l + iw / 2} y={H - 8} textAnchor="middle" className="axis-label">race editions, sorted by the size of the gap</text>
          <rect x={m.l} y={m.t} width={iw} height={ih} fill="transparent" onMouseMove={(e) => {
            const box = (e.currentTarget as SVGRectElement).getBoundingClientRect();
            setHover(Math.max(0, Math.min(rows.length - 1, Math.floor(((e.clientX - box.left) / box.width) * rows.length))));
          }} />
        </svg>
        {hov ? <div className="viz-tooltip" style={{ left: Math.min(width - 90, Math.max(90, x(hover!))), top: y(hov.women) }}><b>{hov.city === 'New York' ? 'New York City' : hov.city} {hov.year}</b><span>Women {hov.women > 0 ? '+' : ''}{hov.women.toFixed(2)} · Men {hov.men > 0 ? '+' : ''}{hov.men.toFixed(2)} points</span><span>{count(hov.women_n)} women · {count(hov.men_n)} men</span></div> : null}
      </div>
      <label className="ghost-select years-pick">
        <span className="sr-only">Show a race edition</span>
        <select value={hover ?? ''} onChange={(e) => setHover(e.target.value === '' ? null : Number(e.target.value))}>
          <option value="">Choose a race edition</option>
          {rows.map((r, k) => <option key={`${r.city}${r.year}`} value={k}>{r.city === 'New York' ? 'New York City' : r.city} {r.year}: women {r.women > 0 ? '+' : ''}{r.women.toFixed(2)}, men {r.men > 0 ? '+' : ''}{r.men.toFixed(2)} points</option>)}
        </select>
      </label>
      <p className="viz-note">Mean percentile points gained on the mixed-gender clock from {at30} to the finish. On a shared clock, one group&apos;s gains are others&apos; losses. Recorded gender as published; the comparison says nothing about why.</p>
    </div>
  );
}
