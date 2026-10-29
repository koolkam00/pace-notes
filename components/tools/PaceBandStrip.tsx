'use client';

import { Fragment } from 'react';
import { type SplitInterval, type SplitRow } from '@/lib/tools/pace';
import { matPacesNote, splitPacesNote, type StripPaces } from '@/lib/tools/stretch-paces';
import { goalCell, splitCaption, terrainCaption } from '@/lib/tools/terrain-band';
import { CHECKPOINTS, fmtGoal } from '@/lib/tools/pace-band-data';
import type { TerrainFeature } from '@/lib/tools/terrain-data';
import { formatDuration } from '@/lib/tools/time';
import { KM_PER_MILE, elevationValue, type UnitSystem } from '@/lib/units';

/**
 * A terrain course's corrected, smoothed route profile (every `step` km from the start, on the official 42.195 km axis)
 * for the optional printed back strip, with the structures to name on it.
 */
export interface RouteProfile { slug: string; city: string; race: string; km: number; step: number; m: number[]; min: number; max: number; gain: number; loss: number; features: TerrainFeature[] }

/**
 * The cut-out wristband strips, for the screen preview and for @media print (styles in app/styles/pages/tools/pace-band-strip.css):
 * the mat strip with each mat's time on the band, the mile or km split strips, and the optional route elevation strip
 * for the back. With `terrain` (lib/tools/terrain-band.ts) the band is the terrain splits: its nine rounded mat times
 * (`mats`) on the mat strip and `rows` built the same way (bandRows), the Goal cell's even pace labelled as the average,
 * and captions that name the terrain splits and their source on every strip, since each is cut out and worn on its own.
 * At even pace each mat holds its even-pace time alone. With `paces` (the visitor ticked "Add each stretch’s pace",
 * lib/tools/stretch-paces.ts) each 5K cell also holds, under its time, the pace of the 5K section that ends there, and
 * each mile or km cell its own pace (the halfway cell none), and the captions say so (a watch's pace, when the pace band's
 * watch reads long); without it the strips are exactly as before. The preview is scaled to fit its column on every
 * screen, in CSS alone (em measures sized from the column, pace-band-strip.css), so it never scrolls, clips or shifts when
 * the script runs. It prints at full size.
 */
export default function PaceBandStrip({ goal, pKm, units, rows, interval, overrun, place, genderWord, profile, showBack, waiting, mats = null, terrain = false, paces = null }: {
  goal: number; pKm: number; units: UnitSystem; rows: SplitRow[]; interval: SplitInterval; overrun: number; place: string; genderWord: string;
  profile: RouteProfile | null; showBack: boolean;
  /** The goal field holds text that is not a goal: the preview is dimmed. */
  waiting: boolean;
  /** The terrain splits' nine mat times (matRows), or null for even pace. */
  mats?: number[] | null;
  /** The band is the terrain splits. */
  terrain?: boolean;
  /** Each stretch's pace under its time (stripPaces, in the band's units, as a watch that reads long shows it), or null for the strips as before. */
  paces?: StripPaces | null;
}) {
  const onTerrain = terrain && Boolean(mats);
  // Split strips repeat every mile or km, plus halfway; the mat strip carries the 5 km mats and the finish.
  const isWhole = (v: number) => Math.abs(v - Math.round(v)) < 1e-6;
  const splitCells = interval === '5k' ? [] : rows.filter((r) => !r.finish && (r.halfway || isWhole(interval === 'mi' ? r.km / KM_PER_MILE : r.km)));
  const perStrip = splitCells.length ? Math.ceil(splitCells.length / Math.ceil(splitCells.length / 12)) : 0;
  const strips: (typeof splitCells)[] = [];
  for (let i = 0; i < splitCells.length; i += perStrip) strips.push(splitCells.slice(i, i + perStrip));
  const caption = onTerrain ? `${terrainCaption(place)}${paces ? matPacesNote(paces.overrun) : ''}` : paces ? `Even-pace times${matPacesNote(paces.overrun)}.` : 'Even-pace times.';
  const unitKm = interval === 'mi' ? KM_PER_MILE : 1;
  const withPaces = paces ? ' has-paces' : '';
  return (
    <>
      <div className={`pace-band-sheet-wrap${waiting ? ' pace-band-held-dim' : ''}`}>
        <div className="pace-band-sheet">
          <p className="pace-band-sheet-head">Pace Notes · pace band · {fmtGoal(goal)} goal · {place}{onTerrain ? ' · terrain splits' : genderWord ? ` · ${genderWord}` : ''} · cut along the dashed lines</p>
          <div className={`pace-band-strip is-mats${withPaces}`}>
            <div className="pace-band-cell is-lead">
              <span className="k">Goal</span>
              <b>{fmtGoal(goal)}</b>
              {/* At even pace one line, as before; on terrain "avg" once, then the watch on its own line, each phrase whole. */}
              <span className="h">{onTerrain
                ? goalCell(pKm, overrun, units, true).map((line, i) => <Fragment key={i}>{i ? <br /> : null}{line.map((p, j) => <Fragment key={j}>{j ? ' · ' : ''}<span className="nowrap">{p}</span></Fragment>)}</Fragment>)
                : goalCell(pKm, overrun, units, false)[0].join(' · ')}</span>
            </div>
            {CHECKPOINTS.map((km, i) => (
              <div key={km} className={`pace-band-cell${i === 8 ? ' is-finish' : ''}`}>
                <span className="k">{i === 8 ? 'Finish' : `${km}K`} <small>{i === 8 ? '26.2mi' : `${(km / KM_PER_MILE).toFixed(1)}mi`}</small></span>
                <b>{formatDuration(i === 8 ? goal : onTerrain ? mats![i] : pKm * km)}</b>
                {paces ? <PaceLine pace={paces.mats[i]} /> : null}
              </div>
            ))}
            <p className="pace-band-strip-caption">{caption}</p>
          </div>
          {strips.map((cells, s) => (
            <div key={s} className={`pace-band-strip is-splits${withPaces}`} style={{ ['--cells' as string]: cells.length }}>
              {cells.map((r) => (
                <div key={r.km} className={`pace-band-cell${r.halfway ? ' is-half' : r.mat ? ' is-mat' : ''}`}>
                  <span className="k">{r.halfway ? 'Half' : interval === 'mi' ? `Mi ${Math.round(r.km / KM_PER_MILE)}` : `Km ${Math.round(r.km)}`}</span>
                  <b>{formatDuration(r.elapsed)}</b>
                  {paces && !r.halfway ? <PaceLine pace={paces.units[Math.round(r.km / unitKm) - 1]} /> : null}
                </div>
              ))}
              <p className="pace-band-strip-caption">{splitCaption(onTerrain, goal, interval, s + 1, strips.length)}{paces ? splitPacesNote(interval === 'mi' ? 'mi' : 'km', paces.overrun) : null}</p>
            </div>
          ))}
          {showBack && profile ? <ElevationStrip profile={profile} units={units} /> : null}
        </div>
      </div>
    </>
  );
}

/** A stretch's pace under its time ("12:01/mi"), its unit in smaller type so the figure keeps its size in a narrow cell. */
function PaceLine({ pace }: { pace: string }) {
  const at = pace.lastIndexOf('/');
  return <span className="p">{pace.slice(0, at)}<small>{pace.slice(at)}</small></span>;
}

/** Full height of the printed elevation strip, the same on every course, so flat courses print flat. */
const ELEVATION_SCALE_M = 200;
/** The km ticks' and the structure labels' type size, in the strip's drawing units. */
const LABEL_SIZE = 8.5;
/** Labels whose middles fall closer than this (km) to the previous label's are left out. */
const LABEL_GAP_KM = 1.5;
/** A label's width in drawing units (an estimate on the generous side, so the ticks and other labels keep clear). */
const labelWidth = (text: string) => text.length * LABEL_SIZE * 0.56;
/** An elevation for the band, in whole feet or metres, with the minus sign the site prints (U+2212). */
const wholeElevation = (metres: number, units: UnitSystem) => {
  const v = Math.round(elevationValue(metres, units));
  return `${v < 0 ? '\u2212' : ''}${Math.abs(v).toLocaleString('en-US')} ${units === 'mi' ? 'ft' : 'm'}`;
};

/**
 * The corrected profile the terrain splits were spread over, as a strip for the back of the band, with each structure's
 * short name over the road at its middle (one closer than 1.5 km to the previous label is left out; labels that would
 * touch are stacked).
 */
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
  // The strip stops at its last sample (42.0 of 42.195 km); nothing is drawn beyond it.
  const lastKm = Math.min((pts.length - 1) * profile.step, profile.km);
  const coords = pts.map((v, i) => `${x(Math.min(i * profile.step, profile.km)).toFixed(1)},${y(v).toFixed(1)}`);
  const fill = `M0 ${H} L${coords.join(' L')} L${x(lastKm).toFixed(1)} ${H} Z`;
  const scale = units === 'mi' ? `${Math.round(ELEVATION_SCALE_M * 3.28084)} ft` : `${ELEVATION_SCALE_M} m`;
  // Each label sits over the highest point of the road under it, anchored inside the strip at its ends, and moves up a
  // row while it would touch a label already placed.
  const labels: { id: string; text: string; x: number; y: number; anchor: 'start' | 'middle' | 'end' }[] = [];
  let previousMid: number | null = null;
  for (const f of [...profile.features].sort((a, b) => a.from_km - b.from_km)) {
    const mid = (f.from_km + f.to_km) / 2;
    if (previousMid !== null && mid - previousMid < LABEL_GAP_KM) continue;
    previousMid = mid;
    const cx = x(mid);
    const width = labelWidth(f.short);
    const anchor = cx - width / 2 < 2 ? 'start' : cx + width / 2 > W - 2 ? 'end' : 'middle';
    const left = anchor === 'start' ? Math.max(0, cx - 4) : anchor === 'end' ? cx - width : cx - width / 2;
    const tx = anchor === 'start' ? left : anchor === 'end' ? Math.min(W, cx + 4) : cx;
    const under = pts.filter((_, i) => i * profile.step >= Math.min(f.from_km, mid - 0.25) && i * profile.step <= Math.max(f.to_km, mid + 0.25));
    let ty = Math.max(LABEL_SIZE, y(Math.max(...(under.length ? under : [lo]))) - 3);
    const touches = (yy: number) => labels.some((l) => {
      const lw = labelWidth(l.text);
      const ll = l.anchor === 'start' ? l.x : l.anchor === 'end' ? l.x - lw : l.x - lw / 2;
      return left < ll + lw + 3 && ll < left + width + 3 && Math.abs(l.y - yy) < LABEL_SIZE + 1;
    });
    while (touches(ty) && ty > LABEL_SIZE) ty = Math.max(LABEL_SIZE, ty - (LABEL_SIZE + 1));
    labels.push({ id: f.id, text: f.short, x: tx, y: ty, anchor });
  }
  const named = labels.length ? ` Marked: ${labels.map((l) => l.text).join(', ')}.` : '';
  // Each 5 km tick is broken where it would run through a label (the label's box with a margin), so every name on the
  // wristband reads whole.
  const boxes = labels.map((l) => {
    const w = labelWidth(l.text);
    const left = l.anchor === 'start' ? l.x : l.anchor === 'end' ? l.x - w : l.x - w / 2;
    return { x0: left - 2, x1: left + w + 2, y0: l.y - LABEL_SIZE - 1, y1: l.y + LABEL_SIZE * 0.3 + 1 };
  });
  const tickRuns = (tx: number) => {
    const runs: [number, number][] = [];
    let from = top;
    for (const b of boxes.filter((b) => b.x0 <= tx && tx <= b.x1).sort((a, b) => a.y0 - b.y0)) {
      if (b.y0 > from) runs.push([from, Math.min(b.y0, H)]);
      from = Math.max(from, b.y1);
    }
    if (from < H) runs.push([from, H]);
    return runs;
  };
  const low = wholeElevation(profile.min, units), high = wholeElevation(profile.max, units);
  return (
    <div className="pace-band-strip is-back">
      <svg viewBox={`0 0 ${W} ${H + 12}`} preserveAspectRatio="none" role="img"
        aria-label={`Route elevation for ${profile.city}, from ${low} to ${high}, drawn on a fixed ${scale} vertical scale.${named}`}>
        <path d={fill} fill="var(--strip-rule)" stroke="none" />
        <polyline points={coords.join(' ')} fill="none" stroke="var(--strip-ink)" strokeWidth={1} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {[5, 10, 15, 20, 25, 30, 35, 40].filter((km) => km < profile.km).map((km) => (
          <g key={km}>
            {tickRuns(x(km)).map(([y1, y2]) => <line key={y1} x1={x(km)} x2={x(km)} y1={y1} y2={y2} stroke="var(--strip-ink)" strokeWidth={0.6} strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />)}
            <text x={x(km)} y={H + 10} textAnchor="middle" fontSize={LABEL_SIZE} fontFamily="var(--sans)">{km}K</text>
          </g>
        ))}
        {labels.map((l) => (
          <text key={l.id} className="pace-band-back-label" x={l.x.toFixed(1)} y={l.y.toFixed(1)} textAnchor={l.anchor} fontSize={LABEL_SIZE} fontFamily="var(--sans)"
            paintOrder="stroke" stroke="var(--strip-paper)" strokeWidth={2.5} strokeLinejoin="round">{l.text}</text>
        ))}
      </svg>
      <p className="pace-band-strip-caption">Back · {profile.race} route elevation, {low} to {high} · strip height = {scale} on every course</p>
    </div>
  );
}
