'use client';

import { useRef, useState } from 'react';
import { RunnerGlyph } from '@/components/art/Runner';
import { useInView, usePrefersReducedMotion, useTicker } from '@/components/art/useTicker';
import { useUnits } from '@/components/UnitsProvider';
import { useWidth } from '@/components/viz/useSize';
import type { Kick } from '@/lib/insights';
import { count, hms, mss, sectionLabel } from '@/lib/viz/format';

const STATE_COLOURS = ['#17A673', '#F4B23E', '#FF6A3D', '#C8202F'];
const SECTION_INDEX: Record<string, number> = { '0–5': 0, '5–10': 1, '10–15': 2, '15–20': 3, '20–25': 4, '25–30': 5, '30–35': 6, '35–40': 7, '40–42.2': 8 };
const pct = (v: number, d = 0) => `${(v * 100).toFixed(d)}%`;

function useSection() {
  const { units } = useUnits();
  return (label: string) => sectionLabel(SECTION_INDEX[label] ?? 0, units);
}

/** Share of finishes faster than their previous section, for each section after 20 km. */
export function Magnet({ data }: { data: Kick }) {
  const [group, setGroup] = useState<'all' | 'slowdown'>('all');
  const sec = useSection();
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref, 860);
  const reduced = usePrefersReducedMotion();
  const inView = useInView(ref);
  const time = useTicker(inView && !reduced, 40);
  const H = 300;
  const m = { l: 44, r: 16, t: 70, b: 44 };
  const rows = data.magnet;
  const cw = (width - m.l - m.r) / rows.length;
  const narrow = cw < 110;
  const y = (v: number) => m.t + (1 - v) * (H - m.t - m.b);
  const last = rows[rows.length - 1];
  return (
    <div className="viz-card magnet">
      <div className="viz-head">
        <div><p className="viz-title">Faster than the section before</p><p className="viz-sub">Share of finishes whose pace in each section beat their previous section</p></div>
        <div className="segmented" role="group" aria-label="Finishes">
          <button type="button" aria-pressed={group === 'all'} onClick={() => setGroup('all')}>All finishes</button>
          <button type="button" aria-pressed={group === 'slowdown'} onClick={() => setGroup('slowdown')}>With a sustained slowdown</button>
        </div>
      </div>
      <div ref={ref} className="viz">
        <svg width={width} height={H} role="img" aria-label={`${pct(last[group])} ran the final 2.195 km faster than 35 to 40 km; in earlier sections after 20 km, ${pct(Math.min(...rows.slice(0, -1).map((r) => r[group])))} to ${pct(Math.max(...rows.slice(0, -1).map((r) => r[group])))} sped up.`}>
          {[0, .25, .5, .75, 1].map((v) => <g key={v} className="grid"><line x1={m.l} x2={width - m.r} y1={y(v)} y2={y(v)} /><text x={m.l - 8} y={y(v) + 4} textAnchor="end">{pct(v)}</text></g>)}
          {rows.map((r, i) => {
            const v = r[group];
            const x = m.l + cw * i + cw * 0.18;
            const isLast = i === rows.length - 1;
            return (
              <g key={r.section}>
                <rect x={x} width={cw * 0.64} y={y(v)} height={y(0) - y(v)} rx={6} fill={isLast ? '#FF5B2E' : '#C9BFAB'} style={{ transition: 'y .6s, height .6s' }} />
                {isLast
                  ? <text x={x + cw * 0.32} y={y(v) + (narrow ? 22 : 34)} textAnchor="middle" className="magnet-value" style={narrow ? { fontSize: 16 } : undefined}>{pct(v)}</text>
                  : <text className="annotation" x={x + cw * 0.32} y={y(v) - 8} textAnchor="middle">{pct(v)}</text>}
                <text x={x + cw * 0.32} y={H - 24} textAnchor="middle">{narrow ? (isLast ? 'final' : `from ${sec(r.section).split('–')[0]}`) : sec(r.section).replace(' km', '').replace(' mi', '')}</text>
                {!narrow ? <text x={x + cw * 0.32} y={H - 8} textAnchor="middle" className="annotation-sub">vs {sec(r.previous).replace(' km', '').replace(' mi', '')}</text> : null}
              </g>
            );
          })}
          {(() => {
            const x0 = m.l + cw * (rows.length - 1) + cw * 0.08;
            const x1 = m.l + cw * rows.length - cw * 0.08;
            const top = y(last[group]) - 58;
            return (
              <g aria-hidden="true">
                <path d={`M${x0} ${y(0)} L${x0} ${top} Q${(x0 + x1) / 2} ${top - 18} ${x1} ${top} L${x1} ${y(0)}`} fill="none" stroke="var(--ink)" strokeWidth={2} strokeDasharray="2 4" />
                <g style={{ color: '#000' }}><RunnerGlyph phase={time * 1.9} effort={group === 'slowdown' ? 0.55 : 0.1} x={(x0 + x1) / 2 - 22} y={y(last[group]) - 50} scale={0.44} kit="#FF5B2E" skin="#8D5524" /></g>
              </g>
            );
          })()}
        </svg>
      </div>
      <p className="viz-note">The final section is only 2.195 km, so where the finish mat sits matters: 50 m shifts its pace by about 2%. Faster here means faster than the runner&apos;s own previous section, not faster than their early pace.</p>
    </div>
  );
}

/** States after 20 km and how finishes move between them, section by section. */
export function StateFlow({ data }: { data: Kick }) {
  const st = data.states;
  const sec = useSection();
  const [focus, setFocus] = useState<number | null>(3);
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref, 860);
  const narrow = width < 560;
  const H = narrow ? 320 : 380;
  const m = { l: 8, r: 8, t: 16, b: 40 };
  const cols = st.occupancy;
  const total = cols[0].counts.reduce((a, b) => a + b, 0);
  const barW = narrow ? 18 : 26;
  const gapPx = 3;
  const innerH = H - m.t - m.b - gapPx * 3;
  const cx = (i: number) => m.l + ((width - m.l - m.r - barW) * i) / (cols.length - 1);
  const layout = cols.map((c) => {
    let yy = m.t;
    return c.counts.map((n) => { const h = (n / total) * innerH; const out = { y: yy, h }; yy += h + gapPx; return out; });
  });
  const ribbons: { d: string; from: number; to: number; n: number; key: string }[] = [];
  st.flows.forEach((f, i) => {
    const outOff = layout[i].map((b) => b.y);
    const inOff = layout[i + 1].map((b) => b.y);
    for (let a = 0; a < 4; a += 1) {
      for (let b = 0; b < 4; b += 1) {
        const n = f.counts[a][b];
        if (!n) continue;
        const h = (n / total) * innerH;
        const x0 = cx(i) + barW;
        const x1 = cx(i + 1);
        const y0 = outOff[a];
        const y1 = inOff[b];
        outOff[a] += h;
        inOff[b] += h;
        const mx = (x0 + x1) / 2;
        ribbons.push({ d: `M${x0} ${y0} C${mx} ${y0} ${mx} ${y1} ${x1} ${y1} L${x1} ${y1 + h} C${mx} ${y1 + h} ${mx} ${y0 + h} ${x0} ${y0 + h} Z`, from: a, to: b, n, key: `${i}-${a}-${b}` });
      }
    }
  });
  const stay = data.recovery.stay;
  return (
    <div className="viz-card">
      <div className="viz-head">
        <div><p className="viz-title">Four states of the second half</p><p className="viz-sub">Each finish, section by section, against its own 5–20 km pace</p></div>
        <div className="pairs-legend state-legend">
          {st.labels.map((l, k) => <button key={l} type="button" aria-pressed={focus === k} onClick={() => setFocus(focus === k ? null : k)}><i style={{ background: STATE_COLOURS[k] }} />{l}</button>)}
        </div>
      </div>
      <div ref={ref} className="viz">
        <svg width={width} height={H} role="img" aria-label={`Once a 5 km section was 25% or more slower, the next one stayed that slow ${pct(stay[0].stay)} of the time from ${stay[0].source} km and ${pct(stay[1].stay)} from ${stay[1].source} km.`}>
          {ribbons.map((rb) => (
            <path key={rb.key} d={rb.d} fill={STATE_COLOURS[rb.from]} opacity={focus == null ? 0.28 : rb.from === focus ? 0.55 : 0.06} style={{ transition: 'opacity .3s' }}>
              <title>{`${st.labels[rb.from]} → ${st.labels[rb.to]}: ${count(rb.n)} finishes`}</title>
            </path>
          ))}
          {layout.map((col, i) => col.map((b, k) => <rect key={`${i}-${k}`} x={cx(i)} y={b.y} width={barW} height={Math.max(0.5, b.h)} rx={3} fill={STATE_COLOURS[k]} />))}
          {cols.map((c, i) => <text key={c.section} x={cx(i) + barW / 2} y={H - 18} textAnchor={i === 0 ? 'start' : i === cols.length - 1 ? 'end' : 'middle'}>{narrow ? sec(c.section).split('–')[0] : sec(c.section)}</text>)}
          {focus != null ? cols.map((c, i) => (
            <text key={`p${c.section}`} className="annotation" x={cx(i) + barW / 2} y={H - 2} textAnchor={i === 0 ? 'start' : i === cols.length - 1 ? 'end' : 'middle'} fill={STATE_COLOURS[focus]}>{pct(c.counts[focus] / total)}</text>
          )) : null}
        </svg>
      </div>
      <p className="viz-note">Bars show the share of finishes in each state; ribbons show where they went next. Click a state to follow it. Recovery means a later section back within 10% of the runner&apos;s 5–20 km pace.</p>
    </div>
  );
}

/** Spread of pace by section, with the line where most of the field is more than 10% slower. */
export function BreakRiver({ data }: { data: Kick }) {
  const bands = data.breaks.bands;
  const [pick, setPick] = useState(-1);
  const rows = pick < 0 ? data.breaks.all.sections : bands[pick].sections;
  const brk = pick < 0 ? rows.slice(4).find((r) => r.over10 > 0.5)?.section ?? null : bands[pick].break_section;
  const sec = useSection();
  const { units } = useUnits();
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref, 860);
  const H = 320;
  const m = { l: 48, r: 14, t: 26, b: 52 };
  const cw = (width - m.l - m.r) / 9;
  const lo = -0.12;
  const hi = 0.5;
  const y = (v: number) => m.t + ((hi - Math.max(lo, Math.min(hi, v))) / (hi - lo)) * (H - m.t - m.b);
  const cx = (i: number) => m.l + cw * (i + 0.5);
  const crack = brk ? SECTION_INDEX[brk] : -1;
  return (
    <div className="viz-card">
      <div className="viz-head">
        <div><p className="viz-title">Where the field breaks</p><p className="viz-sub">Pace in each section against each runner&apos;s own 5–20 km pace: middle 50% and middle 80% of finishes</p></div>
        <label className="ghost-select">
          <span>5–20 km pace, as a marathon</span>
          <select value={pick} onChange={(e) => setPick(Number(e.target.value))}>
            <option value={-1}>All finishes</option>
            {bands.map((b, i) => <option key={b.label} value={i}>{b.label}</option>)}
          </select>
        </label>
      </div>
      <div ref={ref} className="viz">
        <svg width={width} height={H} role="img" aria-label={brk ? `Most of this group is more than 10% slower than their 5 to 20 km pace from ${brk} km.` : 'Most of this group never runs more than 10% slower than their 5 to 20 km pace.'}>
          {[-0.1, 0, 0.1, 0.2, 0.3, 0.4, 0.5].map((v) => <g key={v} className="grid"><line x1={m.l} x2={width - m.r} y1={y(v)} y2={y(v)} /><text x={m.l - 8} y={y(v) + 4} textAnchor="end">{v > 0 ? '+' : ''}{Math.round(v * 100)}%</text></g>)}
          <line x1={m.l} x2={width - m.r} y1={y(0.1)} y2={y(0.1)} stroke="#C8202F" strokeDasharray="6 4" strokeWidth={1.5} />
          {cw >= 70 ? <text x={m.l + 4} y={y(0.1) - 6} className="annotation-sub" fill="#C8202F">10% slower than 5–20 km pace</text> : null}
          {rows.map((r, i) => (
            <g key={r.section}>
              <rect x={cx(i) - cw * 0.3} width={cw * 0.6} y={y(r.p90)} height={Math.max(1, y(r.p10) - y(r.p90))} rx={8} fill={i >= crack && crack >= 0 ? '#FFB48A' : '#DCD3C2'} style={{ transition: 'all .5s' }} />
              <rect x={cx(i) - cw * 0.3} width={cw * 0.6} y={y(r.p75)} height={Math.max(1, y(r.p25) - y(r.p75))} rx={6} fill={i >= crack && crack >= 0 ? '#FF6A3D' : '#9F9584'} style={{ transition: 'all .5s' }} />
              <line x1={cx(i) - cw * 0.3} x2={cx(i) + cw * 0.3} y1={y(r.p50)} y2={y(r.p50)} stroke="var(--ink)" strokeWidth={2.4} style={{ transition: 'all .5s' }} />
              <text x={cx(i)} y={H - 30} textAnchor="middle" className="annotation-sub" fill={r.over10 > 0.5 ? '#C8202F' : undefined}>{pct(r.over10)}</text>
              {cw >= 70 ? <text x={cx(i)} y={H - 12} textAnchor="middle">{sec(r.section).replace(' km', '').replace(' mi', '')}</text> : i % 2 === 0 ? <text x={cx(i)} y={H - 12} textAnchor="middle">{sec(r.section).split('–')[0]}</text> : null}
            </g>
          ))}
          <text x={m.l - 8} y={H - 30} textAnchor="end" className="annotation-sub">&gt;10%</text>
          {crack >= 0 ? <path d={`M${cx(crack) - cw * 0.5} ${m.t - 8} l6 10 l-5 6 l8 12 l-4 8`} fill="none" stroke="#C8202F" strokeWidth={2} aria-hidden="true" /> : null}
        </svg>
      </div>
      <p className="viz-note">
        The small numbers are the share more than 10% slower than their own 5–20 km pace ({units === 'mi' ? 'section labels in miles' : 'sections in kilometres'}). The 5–10, 10–15 and 15–20 km sections sit inside the baseline itself,
        so their narrow spread is partly by construction. Pace bands are set by 5–20 km pace, before the second half is run.
      </p>
    </div>
  );
}

/** Pick how slow your latest section was; see how often a sustained slowdown followed. */
export function WarningLight({ data }: { data: Kick }) {
  const [w, setW] = useState(1);
  const block = data.warning[w];
  const [k, setK] = useState(Math.min(4, block.rows.length - 1));
  const row = block.rows[Math.min(k, block.rows.length - 1)];
  const sec = useSection();
  const later = row.later;
  const angle = -90 + later * 180;
  const lamp = later < 0.15 ? '#17A673' : later < 0.45 ? '#F4B23E' : '#C8202F';
  return (
    <div className="viz-card warning-light">
      <div className="viz-head">
        <div><p className="viz-title">The warning light</p><p className="viz-sub">Among finishes with no sustained slowdown so far: how often one came later</p></div>
        <div className="segmented" role="group" aria-label="Section just finished">
          {data.warning.map((b, i) => <button key={b.after} type="button" aria-pressed={i === w} onClick={() => setW(i)}>After {sec(b.after)}</button>)}
        </div>
      </div>
      <div className="warning-layout">
        <svg viewBox="0 0 240 150" className="warning-dial" role="img" aria-label={`${pct(later)} of ${count(row.n)} finishes later had a sustained slowdown.`}>
          {Array.from({ length: 30 }, (_, i) => {
            const a = Math.PI * (1 - i / 29);
            const c = i / 29 < 0.15 ? '#17A673' : i / 29 < 0.45 ? '#F4B23E' : '#C8202F';
            return <line key={i} x1={120 + Math.cos(a) * 82} y1={130 - Math.sin(a) * 82} x2={120 + Math.cos(a) * 100} y2={130 - Math.sin(a) * 100} stroke={c} strokeWidth={5} strokeLinecap="round" opacity={i / 29 <= later ? 1 : 0.22} />;
          })}
          <g style={{ transform: `rotate(${angle}deg)`, transformOrigin: '120px 130px', transition: 'transform .6s cubic-bezier(.2,.8,.2,1)' }}>
            <line x1={120} y1={130} x2={120} y2={52} stroke="var(--ink)" strokeWidth={4} strokeLinecap="round" />
          </g>
          <circle cx={120} cy={130} r={10} fill={lamp} stroke="var(--ink)" strokeWidth={2} />
          <text x={120} y={104} textAnchor="middle" className="dial-value">{pct(later)}</text>
        </svg>
        <div className="warning-control">
          <label className="heat-slider">
            <span>Your {sec(block.after)} section against your 5–20 km pace: <strong>{row.label}</strong></span>
            <input type="range" min={0} max={block.rows.length - 1} step={1} value={Math.min(k, block.rows.length - 1)} onChange={(e) => setK(Number(e.target.value))} aria-label="How much slower the latest section was" />
          </label>
          <p className="warning-text"><strong>{pct(later)}</strong> of {count(row.n)} finishes in this situation went on to have a sustained slowdown before 40 km.</p>
        </div>
      </div>
      <p className="viz-note">A conditional frequency, not a prediction for any one runner. It is partly mechanical: a section already 20% slower needs little more to reach 25%.</p>
    </div>
  );
}

/** Same race, same 5–20 km pace: what a fast or slow first 5 km went with. */
export function BankAndPay({ data }: { data: Kick }) {
  const rows = data.bank.curve;
  const [hover, setHover] = useState(rows.findIndex((r) => r.lo === -10));
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref, 860);
  const H = 320;
  const m = { l: 56, r: 14, t: 20, b: 44 };
  const cw = (width - m.l - m.r) / rows.length;
  const max = Math.ceil(Math.max(...rows.map((r) => Math.max(Math.abs(r.open_s), Math.abs(r.after20_s), Math.abs(r.finish_s)))) / 60) * 60;
  const y = (s: number) => m.t + ((max - s) / (2 * max)) * (H - m.t - m.b);
  const cx = (i: number) => m.l + cw * (i + 0.5);
  const best = rows.reduce((b, r, i) => (r.finish_s < rows[b].finish_s ? i : b), 0);
  const h = rows[hover] ?? rows[0];
  const line = rows.map((r, i) => `${i ? 'L' : 'M'}${cx(i).toFixed(1)} ${y(r.finish_s).toFixed(1)}`).join(' ');
  const ticks = [];
  for (let t = -max; t <= max; t += max / 2) ticks.push(t);
  const label = (lo: number) => (lo < 0 ? `${-lo - 1}–${-lo}% faster` : `${lo}–${lo + 1}% slower`);
  return (
    <div className="viz-card">
      <div className="viz-head">
        <div><p className="viz-title">Bank time early, pay it back later</p><p className="viz-sub">Against finishes in the same race at the same 5–20 km pace: first 5 km, after 20 km and the whole race</p></div>
        <div className="pairs-legend"><span><i style={{ background: '#17A673' }} />first 5 km</span><span><i style={{ background: '#E2416B' }} />after 20 km</span><span><i style={{ background: '#15171C' }} />finish</span></div>
      </div>
      <div ref={ref} className="viz">
        <svg width={width} height={H} role="img" aria-label={`The best average finish relative to same-race, same-pace peers went with a first 5 km ${label(rows[best].lo)} than the 5 to 20 km pace.`}>
          {ticks.map((t) => <g key={t} className="grid"><line x1={m.l} x2={width - m.r} y1={y(t)} y2={y(t)} /><text x={m.l - 8} y={y(t) + 4} textAnchor="end">{t === 0 ? '0' : `${t > 0 ? '+' : '−'}${mss(Math.abs(t))}`}</text></g>)}
          <line x1={m.l} x2={width - m.r} y1={y(0)} y2={y(0)} stroke="#8C836F" />
          {rows.map((r, i) => (
            <g key={r.lo} onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} style={{ cursor: 'pointer' }}>
              <rect x={cx(i) - cw / 2} width={cw} y={m.t} height={H - m.t - m.b} fill={i === hover ? 'rgba(244,178,62,.16)' : 'transparent'} />
              <rect x={cx(i) - cw * 0.34} width={cw * 0.3} y={Math.min(y(0), y(r.open_s))} height={Math.abs(y(r.open_s) - y(0))} fill="#17A673" rx={2} />
              <rect x={cx(i) + cw * 0.04} width={cw * 0.3} y={Math.min(y(0), y(r.after20_s))} height={Math.abs(y(r.after20_s) - y(0))} fill="#E2416B" rx={2} />
            </g>
          ))}
          <path d={line} fill="none" stroke="var(--ink)" strokeWidth={2.6} pointerEvents="none" />
          {rows.map((r, i) => <circle key={r.lo} cx={cx(i)} cy={y(r.finish_s)} r={i === best ? 6 : 3} fill={i === best ? '#F4B23E' : 'var(--ink)'} stroke="#FFFDF8" strokeWidth={1.5} pointerEvents="none" />)}
          <text className="annotation" x={cx(best)} y={y(rows[best].finish_s) + 22} textAnchor="middle">best</text>
          {rows.map((r, i) => (r.lo % 4 === 0 ? <text key={r.lo} x={cx(i) - cw / 2} y={H - 26} textAnchor="middle">{r.lo === 0 ? 'even' : `${r.lo > 0 ? '+' : '−'}${Math.abs(r.lo)}%`}</text> : null))}
          <text x={m.l} y={H - 6} className="annotation-sub">{width < 560 ? '← faster first 5 km' : '← first 5 km faster than 5–20 km pace'}</text>
          <text x={width - m.r} y={H - 6} textAnchor="end" className="annotation-sub">{width < 560 ? 'slower →' : 'first 5 km slower →'}</text>
        </svg>
      </div>
      <p className="ledger-readout" aria-live="polite">
        First 5 km <strong>{label(h.lo)}</strong> than 5–20 km pace ({count(h.n)} finishes): {h.open_s <= 0 ? 'banked' : 'gave up'} <strong>{mss(Math.abs(h.open_s))}</strong> early,
        {h.after20_s >= 0 ? ' spent ' : ' saved '}<strong>{mss(Math.abs(h.after20_s))}</strong> after 20 km, and finished <strong>{mss(Math.abs(h.finish_s))} {h.finish_s >= 0 ? 'behind' : 'ahead of'}</strong> same-race, same-pace peers.
        Sustained slowdown: {pct(h.slowdown)} ({h.excess >= 0 ? '+' : '−'}{Math.abs(h.excess * 100).toFixed(1)} points against peers).
      </p>
      <p className="viz-note">Peers share the race and a 5 s/km band of 5–20 km pace; each finish is left out of its own comparison. The 5–20 km pace is measured after the opening, so it can already reflect it. This describes what went together, not pacing advice.</p>
    </div>
  );
}

/** Same 5–20 km pace, with and without a sustained slowdown. */
export function TwinRunners({ data }: { data: Kick }) {
  const bands = data.cost.bands;
  const [pick, setPick] = useState(Math.max(0, bands.findIndex((b) => b.lo_min === 225)));
  const b = bands[pick];
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref, 860);
  const reduced = usePrefersReducedMotion();
  const inView = useInView(ref);
  const time = useTicker(inView && !reduced, 50);
  const H = 190;
  const m = { l: 18, r: 18 };
  const x = (km: number) => m.l + (km / 42.195) * (width - m.l - m.r);
  const RACE = 10;
  const u = reduced || time === 0 ? 0.8 : Math.min(1, (time % (RACE + 3)) / RACE);
  const clock = u * b.slowdown_finish_s;
  // Each twin: even to 20 km at the shared median, then a straight line to its own median finish.
  const pos = (t20: number, fin: number) => (clock <= t20 ? (clock / t20) * 20 : Math.min(42.195, 20 + ((clock - t20) / (fin - t20)) * 22.195));
  const a = pos(b.other_20km_s, b.other_finish_s);
  const c = pos(b.slowdown_20km_s, b.slowdown_finish_s);
  return (
    <div className="viz-card twin">
      <div className="viz-head">
        <div><p className="viz-title">Two runners, one 5–20 km pace</p><p className="viz-sub">Median finishes for this 5–20 km pace, with and without a sustained slowdown</p></div>
        <label className="ghost-select">
          <span>5–20 km pace, as a marathon</span>
          <select value={pick} onChange={(e) => setPick(Number(e.target.value))}>{bands.map((x2, i) => <option key={x2.lo_min} value={i}>{x2.label}</option>)}</select>
        </label>
      </div>
      <div ref={ref} className="viz">
        <svg width={width} height={H} role="img" aria-label={`Both reached 20 km in about ${hms(b.other_20km_s)}; median finishes ${hms(b.other_finish_s)} and ${hms(b.slowdown_finish_s)}.`}>
          {[54, 130].map((yy) => <line key={yy} x1={x(0)} x2={x(42.195)} y1={yy} y2={yy} stroke="#E3D9C6" strokeWidth={2} />)}
          <line x1={x(20)} x2={x(20)} y1={14} y2={160} stroke="#B9AE98" strokeDasharray="4 4" />
          <text x={x(20)} y={178} textAnchor="middle" className="annotation-sub">20 km together</text>
          <line x1={x(42.195)} x2={x(42.195)} y1={14} y2={160} stroke="#F4B23E" strokeWidth={2} />
          <g style={{ color: '#000' }}>
            <RunnerGlyph phase={time * 1.5} x={x(a) - 30} y={54 - 64} scale={0.6} kit="#17A673" skin="#C68642" />
            <RunnerGlyph phase={time * (c > 20 ? 1.1 : 1.5)} effort={c > 22 ? 0.85 : 0} x={x(c) - 30} y={130 - 64} scale={0.6} kit="#E2416B" skin="#8D5524" />
          </g>
        </svg>
      </div>
      <div className="ghost-ticker">
        <div><strong>{hms(b.other_finish_s)}</strong><span>median finish without a sustained slowdown ({count(b.other_n)} finishes)</span></div>
        <div><strong>{hms(b.slowdown_finish_s)}</strong><span>median finish with one ({count(b.slowdown_n)} finishes)</span></div>
        <div><strong>+{mss(b.slowdown_finish_s - b.other_finish_s)}</strong><span>between them, after reaching 20 km in {hms(b.other_20km_s)} and {hms(b.slowdown_20km_s)}</span></div>
      </div>
      <p className="viz-note">Group medians, not a personal penalty: part of the gap is built into the definition, since a section 25% slower costs minutes by itself. Each runner is drawn with a straight line to its median finish.</p>
    </div>
  );
}

/** Women and men: share faster over the final section, by 5–20 km pace band. */
export function GenderKick({ data }: { data: Kick }) {
  const rows = data.gender_kick;
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref, 860);
  const narrow = width < 560;
  const m = { l: narrow ? 84 : 110, r: 24, t: 20, b: 30 };
  const rowH = 28;
  const H = m.t + rows.length * rowH + m.b;
  const x = (v: number) => m.l + ((v - 0.4) / 0.5) * (width - m.l - m.r);
  return (
    <div className="viz-card">
      <div className="viz-head">
        <div><p className="viz-title">Final 2.2 km faster than 35–40 km</p><p className="viz-sub">Recorded women and men at the same 5–20 km pace</p></div>
        <div className="pairs-legend"><span><i style={{ background: '#7A4DFF' }} />women</span><span><i style={{ background: '#0FA3A3' }} />men</span></div>
      </div>
      <div ref={ref} className="viz">
        <svg width={width} height={H} role="img" aria-label="In every pace band from 2:30 onwards, recorded women sped up over the final section more often than men.">
          {[0.4, 0.5, 0.6, 0.7, 0.8, 0.9].map((v) => <g key={v} className="grid"><line x1={x(v)} x2={x(v)} y1={m.t - 8} y2={H - m.b} /><text x={x(v)} y={H - 10} textAnchor="middle">{pct(v)}</text></g>)}
          {rows.map((r, i) => {
            const yy = m.t + i * rowH + rowH / 2;
            return (
              <g key={r.label}>
                <text x={m.l - 10} y={yy + 4} textAnchor="end">{r.label}</text>
                <line x1={x(r.men)} x2={x(r.women)} y1={yy} y2={yy} stroke="#C9BFAB" strokeWidth={3} />
                <circle cx={x(r.men)} cy={yy} r={6} fill="#0FA3A3"><title>{`Men ${r.label}: ${pct(r.men, 1)} of ${count(r.men_n)}`}</title></circle>
                <circle cx={x(r.women)} cy={yy} r={6} fill="#7A4DFF"><title>{`Women ${r.label}: ${pct(r.women, 1)} of ${count(r.women_n)}`}</title></circle>
              </g>
            );
          })}
        </svg>
      </div>
      <p className="viz-note">Pace bands use 5–20 km pace expressed as a marathon time. Recorded gender only; groups differ in age, course and field. Women had also slowed less by 35–40 km, so they had less to bounce back from.</p>
    </div>
  );
}
