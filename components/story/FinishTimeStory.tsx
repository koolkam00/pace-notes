'use client';

import { useMemo, useRef, useState } from 'react';
import { useWidth } from '@/components/viz/useSize';
import type { FinishTimes } from '@/lib/insights';
import { checkpointLabel, count, hm } from '@/lib/viz/format';
import { useUnits } from '@/components/UnitsProvider';

const MAJOR = new Set([150, 180, 210, 240, 270, 300, 330, 360]);
const LO = 140;
const HI = 390;

function parseTime(text: string): number | null {
  const m = text.trim().replace(/[.,]/g, ':').match(/^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?$/);
  if (!m) return null;
  const seconds = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] ?? 0);
  return seconds >= 5400 && seconds < 43200 ? seconds : null;
}

export function FinishHistogram({ data }: { data: FinishTimes }) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref, 960);
  const [series, setSeries] = useState<'all' | 'men' | 'women'>('all');
  const [hover, setHover] = useState<number | null>(null);
  const [mine, setMine] = useState('');
  const mineSeconds = parseTime(mine);
  const mineMinute = mineSeconds === null ? null : Math.floor(mineSeconds / 60);
  const rows = useMemo(() => data.histogram.filter((d) => d.minute >= LO && d.minute < HI), [data]);
  const expected = useMemo(() => new Map(data.expected_curve.map((d) => [d.minute, d.expected])), [data]);
  const marks = useMemo(() => new Map(data.marks.map((m) => [m.minutes, m])), [data]);
  const mobile = width < 640;
  const H = mobile ? 300 : 380;
  const m = { l: mobile ? 40 : 56, r: 12, t: 36, b: 34 };
  const iw = width - m.l - m.r;
  const ih = H - m.t - m.b;
  const max = Math.max(...rows.map((d) => d[series]));
  const x = (minute: number) => m.l + ((minute - LO) / (HI - LO)) * iw;
  const y = (v: number) => m.t + ih - (v / max) * ih;
  const bw = Math.max(1, iw / (HI - LO) - (mobile ? 0.4 : 0.9));
  const pile = (minute: number) => [...MAJOR].some((B) => minute >= B - 5 && minute < B);
  const ticks = mobile ? [150, 180, 210, 240, 270, 300, 330, 360] : [150, 165, 180, 195, 210, 225, 240, 255, 270, 285, 300, 330, 360];
  const yTicks = [0, 10000, 20000, 30000, 40000].filter((v) => v <= max);
  const curve = series === 'all' ? rows.map((d) => [x(d.minute + 0.5), y(expected.get(d.minute) ?? 0)] as const) : [];
  const hovered = hover === null ? null : rows.find((d) => d.minute === hover);
  const callouts = series === 'all' ? [180, 210, 240].map((B) => marks.get(B)!).filter(Boolean) : [];
  const mineRow = mineMinute === null ? null : data.histogram.find((d) => d.minute === mineMinute);

  return (
    <div className="viz-card">
      <div className="viz-head">
        <div>
          <p className="viz-title">Eligible finishes in each minute of finish time</p>
          <p className="viz-sub">{series === 'all' ? 'Bars: recorded finishes · dashed line: smooth reference curve' : `Recorded ${series === 'men' ? 'men' : 'women'}'s finishes`}</p>
        </div>
        <div className="segmented" role="group" aria-label="Recorded gender">
          {(['all', 'women', 'men'] as const).map((s) => (
            <button key={s} type="button" aria-pressed={series === s} onClick={() => setSeries(s)}>{s === 'all' ? 'Everyone' : s === 'men' ? 'Men' : 'Women'}</button>
          ))}
        </div>
      </div>
      <div ref={ref} className="viz" style={{ position: 'relative' }} onMouseLeave={() => setHover(null)}>
        <svg width={width} height={H} role="img" aria-label="Histogram of finish times from 2:20 to 6:30. Finishes pile up in the minutes just before each hour and half-hour.">
          <g className="grid">
            {yTicks.map((v) => <line key={v} x1={m.l} x2={width - m.r} y1={y(v)} y2={y(v)} />)}
          </g>
          {yTicks.map((v) => <text key={v} x={m.l - 8} y={y(v) + 4} textAnchor="end">{v === 0 ? '0' : `${v / 1000}k`}</text>)}
          {rows.map((d) => {
            const isPile = series === 'all' && pile(d.minute);
            const isLast = series === 'all' && MAJOR.has(d.minute + 1);
            const fill = mineMinute === d.minute ? '#2F5BFF' : isLast ? '#C8202F' : isPile ? '#FF5B2E' : hover === d.minute ? '#3C3F47' : '#BDB29C';
            return <rect key={d.minute} x={x(d.minute)} y={y(d[series])} width={bw} height={Math.max(0, m.t + ih - y(d[series]))} fill={fill} rx={mobile ? 0 : 1} />;
          })}
          {curve.length ? <path d={curve.map(([cx, cy], i) => `${i ? 'L' : 'M'}${cx.toFixed(1)} ${cy.toFixed(1)}`).join(' ')} fill="none" stroke="#15171C" strokeWidth={1.4} strokeDasharray="4 3" opacity={0.75} /> : null}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={m.t + ih} y2={m.t + ih + 5} stroke="#9A907D" />
              <text x={x(t)} y={H - 12} textAnchor="middle" style={{ fontWeight: MAJOR.has(t) ? 700 : 400 }}>{hm(t)}</text>
            </g>
          ))}
          {callouts.map((c, i) => {
            const cx = x(c.minutes - 1) + bw / 2;
            const cy = y(c.minute_before);
            const lift = [26, 22, 18][i] ?? 20;
            return (
              <g key={c.mark}>
                <line x1={cx} x2={cx} y1={cy - 3} y2={cy - lift} stroke="#15171C" strokeWidth={1} />
                <circle cx={cx} cy={cy - 3} r={2.5} fill="#15171C" />
                <text className="annotation" x={cx + (mobile ? -2 : 6)} y={cy - lift - 4} textAnchor={mobile ? 'middle' : 'start'}>{hm(c.minutes - 1)}: {c.ratio.toFixed(2)}×</text>
              </g>
            );
          })}
          <rect x={m.l} y={m.t} width={iw} height={ih} fill="transparent"
            onMouseMove={(e) => {
              const box = (e.currentTarget as SVGRectElement).getBoundingClientRect();
              const minute = Math.floor(LO + ((e.clientX - box.left) / box.width) * (HI - LO));
              setHover(Math.max(LO, Math.min(HI - 1, minute)));
            }} />
        </svg>
        {hovered ? (
          <div className="viz-tooltip" style={{ left: Math.min(width - 90, Math.max(90, x(hovered.minute) + bw / 2)), top: y(hovered[series]) }}>
            <b>{hm(hovered.minute)}:00–{hm(hovered.minute)}:59</b>
            <span>{count(hovered[series])} finishes</span>
            {series === 'all' && expected.has(hovered.minute) ? <span>Smooth curve: {count(expected.get(hovered.minute)!)}</span> : null}
          </div>
        ) : null}
      </div>
      <div className="finish-lookup">
        <label htmlFor="my-finish">Your finish time</label>
        <input id="my-finish" inputMode="decimal" autoComplete="off" placeholder="e.g. 3:58:42" value={mine} onChange={(e) => setMine(e.target.value)} />
        <p aria-live="polite">
          {mineRow ? <>{count(mineRow.all)} eligible finishes landed in the same minute ({hm(mineRow.minute)}:00–:59){expected.has(mineRow.minute) ? <>, {(mineRow.all / expected.get(mineRow.minute)!).toFixed(2)}× the smooth curve</> : null}.</>
            : mine && mineSeconds === null ? 'Enter h:mm or h:mm:ss between 1:30 and 12:00.'
              : mineSeconds !== null ? 'That minute is outside the charted range.' : 'Type a time to find its minute on the chart.'}
        </p>
      </div>
    </div>
  );
}

export function SecondsLens({ data }: { data: FinishTimes }) {
  const [pick, setPick] = useState(2);
  const lens = data.seconds[pick];
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref, 640);
  const H = 260;
  const m = { l: 44, r: 10, t: 20, b: 34 };
  const iw = width - m.l - m.r;
  const ih = H - m.t - m.b;
  const max = Math.max(...lens.bins.map((b) => Math.max(b.n, b.expected)));
  const x = (o: number) => m.l + ((o + 300) / 600) * iw;
  const y = (v: number) => m.t + ih - (v / max) * ih;
  const bw = iw / 60 - 1;
  return (
    <div className="viz-card">
      <div className="viz-head">
        <div>
          <p className="viz-title">Ten-second view either side of {lens.mark}</p>
          <p className="viz-sub">Busiest slot: {lens.peak_offset_s < 0 ? `${Math.abs(lens.peak_offset_s)} s before` : 'at'} the mark, {lens.peak_ratio.toFixed(2)}× the reference</p>
        </div>
        <div className="segmented" role="group" aria-label="Mark for the ten-second view">
          {data.seconds.map((s, i) => <button key={s.mark} type="button" aria-pressed={i === pick} onClick={() => setPick(i)}>{s.mark}</button>)}
        </div>
      </div>
      <div ref={ref} className="viz">
        <svg width={width} height={H} role="img" aria-label={`Finishes in ten-second bins from five minutes before to five minutes after ${lens.mark}.`}>
          {lens.bins.map((b) => (
            <rect key={b.offset_s} x={x(b.offset_s) + 0.5} y={y(b.n)} width={Math.max(1, bw)} height={m.t + ih - y(b.n)} fill={b.offset_s < 0 ? (b.offset_s === lens.peak_offset_s ? '#C8202F' : '#FF5B2E') : '#BDB29C'} />
          ))}
          <path d={lens.bins.map((b, i) => `${i ? 'L' : 'M'}${(x(b.offset_s) + bw / 2).toFixed(1)} ${y(b.expected).toFixed(1)}`).join(' ')} fill="none" stroke="#15171C" strokeDasharray="4 3" strokeWidth={1.3} />
          <line x1={x(0)} x2={x(0)} y1={m.t - 6} y2={m.t + ih} stroke="#15171C" strokeWidth={1.5} />
          <text className="annotation" x={x(0) + 6} y={m.t + 4}>{lens.mark}:00</text>
          {(width < 560 ? [-300, -180, -60, 0, 120, 240] : [-300, -240, -180, -120, -60, 0, 60, 120, 180, 240]).map((o) => (
            <text key={o} x={x(o)} y={H - 12} textAnchor="middle">{o === 0 ? '0' : `${o > 0 ? '+' : '−'}${Math.abs(o) / 60}:00`}</text>
          ))}
        </svg>
      </div>
      {lens.share_of_pile_in_last_minute !== null ? (
        <p className="viz-note">{Math.round(lens.share_of_pile_in_last_minute * 100)}% of the extra finishes in the five minutes before {lens.mark} arrive in the final minute; an even spread would put 20% there.</p>
      ) : null}
    </div>
  );
}

export function Rescue({ data }: { data: FinishTimes }) {
  const [pick, setPick] = useState(2);
  const b = data.bubble[pick];
  const { units } = useUnits();
  const at40 = checkpointLabel(40, units);
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref, 640);
  const H = 280;
  const m = { l: 46, r: 14, t: 18, b: 40 };
  const iw = width - m.l - m.r;
  const ih = H - m.t - m.b;
  const pts = b.premium;
  const x0 = pts[0]?.margin_s ?? -120;
  const x1 = (pts[pts.length - 1]?.margin_s ?? 225) + 15;
  const x = (s: number) => m.l + ((s - x0) / (x1 - x0)) * iw;
  const y = (v: number) => m.t + ih - v * ih;
  const line = (key: 'share_under' | 'expected_share_under') => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.margin_s + 7.5).toFixed(1)} ${y(p[key]).toFixed(1)}`).join(' ');
  const area = `${line('share_under')} ${[...pts].reverse().map((p) => `L${x(p.margin_s + 7.5).toFixed(1)} ${y(p.expected_share_under).toFixed(1)}`).join(' ')} Z`;
  return (
    <div className="viz-card">
      <div className="viz-head">
        <div>
          <p className="viz-title">Getting under {b.mark} after {at40}</p>
          <p className="viz-sub">Share finishing under {b.mark}, by projected margin at {at40}</p>
        </div>
        <div className="segmented" role="group" aria-label="Mark for the after-40 km chart">
          {data.bubble.map((s, i) => <button key={s.mark} type="button" aria-pressed={i === pick} onClick={() => setPick(i)}>{s.mark}</button>)}
        </div>
      </div>
      <div className="rescue-numbers">
        <div><strong>{Math.round(b.over.share_under * 100)}%</strong><span>of {count(b.over.n)} finishes projected 0–2 min over {b.mark} at {at40} got under it</span></div>
        <div><strong>{Math.round(b.over.expected_share_under * 100)}%</strong><span>would be expected from comparable finishes projected away from a round mark</span></div>
        <div><strong>≈{count(Math.round(b.over.extra_under / 10) * 10)}</strong><span>extra finishes under {b.mark} (interval {count(b.over.extra_under_ci95[0])}–{count(b.over.extra_under_ci95[1])})</span></div>
      </div>
      <div ref={ref} className="viz">
        <svg width={width} height={H} role="img" aria-label={`Observed and comparison shares finishing under ${b.mark} by projected margin at ${at40}.`}>
          {[0, .25, .5, .75, 1].map((v) => (
            <g key={v} className="grid"><line x1={m.l} x2={width - m.r} y1={y(v)} y2={y(v)} /></g>
          ))}
          {[0, .25, .5, .75, 1].map((v) => <text key={v} x={m.l - 8} y={y(v) + 4} textAnchor="end">{v * 100}%</text>)}
          <path d={area} fill="rgba(255,91,46,.18)" />
          <path d={line('expected_share_under')} fill="none" stroke="#66625A" strokeWidth={2} strokeDasharray="5 4" />
          <path d={line('share_under')} fill="none" stroke="#FF5B2E" strokeWidth={3} strokeLinejoin="round" />
          <line x1={x(0)} x2={x(0)} y1={m.t} y2={m.t + ih} stroke="#15171C" />
          <text className="annotation" x={x(0) + 6} y={m.t + 12}>on pace for {b.mark}:00</text>
          {(width < 560 ? [-120, 0, 120] : [-120, -60, 0, 60, 120, 180]).filter((s) => s >= x0 && s <= x1).map((s) => (
            <text key={s} x={x(s)} y={H - 20} textAnchor="middle">{s === 0 ? '0' : `${s > 0 ? '+' : '−'}${Math.abs(s) / 60}:00`}</text>
          ))}
          <text x={m.l + iw / 2} y={H - 4} textAnchor="middle" className="axis-label">{width < 560 ? `margin at ${at40} (min:s)` : `projected finish at ${at40}, relative to the mark (min:s)`}</text>
        </svg>
      </div>
      <div className="legend-row">
        <span><i style={{ background: '#FF5B2E' }} />Recorded share under {b.mark}</span>
        <span><i className="dashed" />Comparison from finishes away from round marks</span>
      </div>
      <p className="viz-note">The projection carries each finish from its {at40} time at its own {units === 'mi' ? '21.7–24.9 mi' : '35–40 km'} pace. The comparison uses finishes projected the same distance from a non-round minute with similar late slowing. It is a reference, not a forecast or a measure of intent.</p>
    </div>
  );
}
