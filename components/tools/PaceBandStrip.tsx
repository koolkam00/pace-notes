'use client';

import { useRef } from 'react';
import { useWidth } from '@/components/viz/useSize';
import { perUnit, watchTarget, type SplitInterval, type SplitRow } from '@/lib/tools/pace';
import { CHECKPOINTS, fmtGoal, fmtPace } from '@/lib/tools/pace-band-data';
import { formatDuration } from '@/lib/tools/time';
import { KM_PER_MILE, elevationLabel, type UnitSystem } from '@/lib/units';
import { count } from '@/lib/viz/format';

/** Supplied route elevation (every `step` km) for the optional printed back strip. Context only. */
export interface RouteProfile { slug: string; city: string; race: string; km: number; step: number; m: number[]; min: number; max: number; gain: number; loss: number }

/** The held-pace group whose median goes on the mat strip as the small "H" line, and the finish window it comes from. */
export interface StripObserved { held: { n: number; e50: number[] } | null; lo: number; hi: number; place: string; genderWord: string }

/**
 * The cut-out wristband strips, for the screen preview and for @media print (styles in app/styles/pages/tools/pace-band-strip.css):
 * the mat strip with each mat's even-pace time and the held-pace median, the mile or km split strips, and the optional
 * route elevation strip for the back. The preview is scaled to fit the screen (and not drawn under 600 px, where it could
 * not be read); it prints at full size.
 */
export default function PaceBandStrip({ goal, pKm, units, rows, interval, overrun, place, genderWord, observed, profile, showBack, waiting }: {
  goal: number; pKm: number; units: UnitSystem; rows: SplitRow[]; interval: SplitInterval; overrun: number; place: string; genderWord: string;
  observed: StripObserved | null; profile: RouteProfile | null; showBack: boolean;
  /** The goal field holds text that is not a goal: the preview is dimmed. */
  waiting: boolean;
}) {
  const held = observed?.held ?? null;
  const wrapRef = useRef<HTMLDivElement>(null);
  const wrapWidth = useWidth(wrapRef, 760);
  const SHEET_PX = (18.4 + 0.9) * (96 / 2.54);
  const zoom = Math.min(1, Math.max(0.3, (wrapWidth - 30) / SHEET_PX));
  // Split strips repeat every mile or km, plus halfway; the mat strip carries the 5 km mats and the finish.
  const isWhole = (v: number) => Math.abs(v - Math.round(v)) < 1e-6;
  const splitCells = interval === '5k' ? [] : rows.filter((r) => !r.finish && (r.halfway || isWhole(interval === 'mi' ? r.km / KM_PER_MILE : r.km)));
  const perStrip = splitCells.length ? Math.ceil(splitCells.length / Math.ceil(splitCells.length / 12)) : 0;
  const strips: (typeof splitCells)[] = [];
  for (let i = 0; i < splitCells.length; i += perStrip) strips.push(splitCells.slice(i, i + perStrip));
  const caption = held && observed
    ? `H = held-pace median of ${count(held.n)} finishes ${formatDuration(observed.lo, true)}–${formatDuration(observed.hi, true)}, ${observed.place}${observed.genderWord ? `, ${observed.genderWord}` : ''} (Pace Notes data). Big numbers: even pace.`
    : 'Even-pace times.';
  return (
    <>
      <div className={`pace-band-sheet-wrap${waiting ? ' pace-band-held-dim' : ''}`} ref={wrapRef}>
        <div className="pace-band-sheet" style={{ zoom }}>
          <p className="pace-band-sheet-head">Pace Notes · pace band · {fmtGoal(goal)} goal · {place}{genderWord ? ` · ${genderWord}` : ''} · cut along the dashed lines</p>
          <div className="pace-band-strip is-mats">
            <div className="pace-band-cell is-lead">
              <span className="k">Goal</span>
              <b>{fmtGoal(goal)}</b>
              <span className="h">{formatDuration(perUnit(pKm, 'mi'))}/mi · {formatDuration(pKm)}/km{overrun ? ` · watch ${fmtPace(watchTarget(pKm, overrun), units)}` : ''}</span>
            </div>
            {CHECKPOINTS.map((km, i) => (
              <div key={km} className={`pace-band-cell${i === 8 ? ' is-finish' : ''}`}>
                <span className="k">{i === 8 ? 'Finish' : `${km}K`} <small>{i === 8 ? '26.2mi' : `${(km / KM_PER_MILE).toFixed(1)}mi`}</small></span>
                <b>{formatDuration(i === 8 ? goal : pKm * km)}</b>
                <span className="h">{held ? `H ${formatDuration(held.e50[i])}` : ' '}</span>
              </div>
            ))}
            <p className="pace-band-strip-caption">{caption}</p>
          </div>
          {strips.map((cells, s) => (
            <div key={s} className="pace-band-strip is-splits" style={{ ['--cells' as string]: cells.length }}>
              {cells.map((r) => (
                <div key={r.km} className={`pace-band-cell${r.halfway ? ' is-half' : r.mat ? ' is-mat' : ''}`}>
                  <span className="k">{r.halfway ? 'Half' : interval === 'mi' ? `Mi ${Math.round(r.km / KM_PER_MILE)}` : `Km ${Math.round(r.km)}`}</span>
                  <b>{formatDuration(r.elapsed)}</b>
                </div>
              ))}
              <p className="pace-band-strip-caption">Even pace {fmtGoal(goal)} · {interval === 'mi' ? 'each mile' : 'each km'} · strip {s + 1} of {strips.length}</p>
            </div>
          ))}
          {showBack && profile ? <ElevationStrip profile={profile} units={units} /> : null}
        </div>
      </div>
    </>
  );
}

/** Full height of the printed elevation strip, the same on every course, so flat courses print flat. */
const ELEVATION_SCALE_M = 200;

/** Supplied route elevation as a strip for the back of the band. Context only; never used in a calculation. */
function ElevationStrip({ profile, units }: { profile: RouteProfile; units: UnitSystem }) {
  const W = 700;
  const H = 62;
  const top = 6;
  const pts = profile.m;
  const lo = Math.min(...pts);
  const hi = Math.max(...pts);
  const range = Math.max(hi - lo, ELEVATION_SCALE_M);
  const x = (km: number) => (km / profile.km) * W;
  const y = (v: number) => top + (1 - (v - lo) / range) * (H - top - 4);
  // The supplied profile stops at its last sample (e.g. 42.0 of 42.184 km); nothing is drawn beyond it.
  const lastKm = Math.min((pts.length - 1) * profile.step, profile.km);
  const coords = pts.map((v, i) => `${x(Math.min(i * profile.step, profile.km)).toFixed(1)},${y(v).toFixed(1)}`);
  const fill = `M0 ${H} L${coords.join(' L')} L${x(lastKm).toFixed(1)} ${H} Z`;
  const scale = units === 'mi' ? `${Math.round(ELEVATION_SCALE_M * 3.28084)} ft` : `${ELEVATION_SCALE_M} m`;
  return (
    <div className="pace-band-strip is-back">
      <svg viewBox={`0 0 ${W} ${H + 12}`} preserveAspectRatio="none" role="img"
        aria-label={`Route elevation for ${profile.city}, from ${elevationLabel(profile.min, units)} to ${elevationLabel(profile.max, units)}, drawn on a fixed ${scale} vertical scale.`}>
        <path d={fill} fill="var(--strip-rule)" stroke="none" />
        <polyline points={coords.join(' ')} fill="none" stroke="var(--strip-ink)" strokeWidth={1} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {[5, 10, 15, 20, 25, 30, 35, 40].filter((km) => km < profile.km).map((km) => (
          <g key={km}>
            <line x1={x(km)} x2={x(km)} y1={top} y2={H} stroke="var(--strip-ink)" strokeWidth={0.6} strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
            <text x={x(km)} y={H + 10} textAnchor="middle" fontSize="8.5" fontFamily="var(--sans)">{km}K</text>
          </g>
        ))}
      </svg>
      <p className="pace-band-strip-caption">Back · {profile.race} route elevation, {elevationLabel(profile.min, units)} to {elevationLabel(profile.max, units)} · strip height = {scale} on every course</p>
    </div>
  );
}
