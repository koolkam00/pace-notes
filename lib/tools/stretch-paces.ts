/**
 * Each stretch's time and pace on the band (owner request, October 29, 2026: "Can you also add options for paces per mile
 * for each 5k and mile time"), the same rule on the race planner, the pace band and in scripts/verify-tools.cjs:
 *
 * - the stretches are each 5K section (0–5K … 35–40K, then 40K–Finish, 2.195 km) and each whole mile 1–26 then the last
 *   0.2188 mi (on a km band: each km 1–42, then the last 0.195 km);
 * - a stretch's time is the difference of the band's own times at its two ends: on terrain the rounded terrain elapsed
 *   times (terrainElapsed, the finish the goal), so the times are whole seconds and add up exactly to the goal, and a
 *   whole unit's time is its unitSplits split; at even pace the exact even-pace times, so every stretch runs at the goal's
 *   even pace;
 * - its pace is that time divided by its distance, written with fmtPace in the band's units (/mi or /km), so a whole
 *   mile's pace is its mile time.
 *
 * Nothing here comes from finish data: the times are the band's, so the stretches are the band's too, and on terrain they
 * carry the band's Published research badge where the page shows it. The option that shows them (`paces=1` in the
 * address, off by default and never written when off) and its words are here too, so both pages say it the same way.
 */
import { MARATHON_KM, MATS_KM } from '@/lib/tools/pace';
import { fmtGoal, fmtPace } from '@/lib/tools/pace-band-data';
import { terrainElapsed } from '@/lib/tools/terrain-band';
import type { TerrainCourse } from '@/lib/tools/terrain-data';
import { KM_PER_MILE, type UnitSystem } from '@/lib/units';

/** One stretch of the band: where it starts and ends (km), its time (seconds) and its pace (seconds per km). */
export interface Stretch { label: string; fromKm: number; toKm: number; time: number; pace: number }

/** The query key that keeps the option. Only `1` is ever written; off, the default, stays out of the address. */
export const PACES_PARAM = 'paces';
/** The address value a page keeps once it has read its address: `1` stays, anything else (`paces=0`, `paces=yes`) leaves. */
export const tidyPaces = (value: string) => (value === '1' ? '1' : '');
/** The option's label, then its unit in small type: "Add each stretch’s pace" " (per mile)". */
export const PACES_LABEL = 'Add each stretch’s pace';
export const pacesUnit = (units: UnitSystem) => ` (per ${units === 'mi' ? 'mile' : 'km'})`;

/** The band's elapsed time at a marker: on terrain the rounded terrain time, at even pace the exact even-pace time; the start 0, the finish the goal. */
function bandAt(goal: number, terrain: TerrainCourse | null, km: number): number {
  if (km <= 0) return 0;
  if (km >= 42.19) return goal;
  return terrain ? terrainElapsed(goal, terrain, km) : (goal * km) / MARATHON_KM;
}

/** The stretches between consecutive markers (the start first, the finish last), each with its time and pace. */
function between(goal: number, terrain: TerrainCourse | null, ends: number[], label: (i: number, from: number, to: number) => string): Stretch[] {
  const out: Stretch[] = [];
  let from = 0;
  ends.forEach((to, i) => {
    const time = bandAt(goal, terrain, to) - bandAt(goal, terrain, from);
    out.push({ label: label(i, from, to), fromKm: from, toKm: to, time, pace: time / (to - from) });
    from = to;
  });
  return out;
}

/** The nine 5K sections, mat to mat: "0–5K" … "35–40K", then "40K–Finish" (2.195 km). */
export function fiveKStretches(goal: number, terrain: TerrainCourse | null): Stretch[] {
  return between(goal, terrain, [...MATS_KM, MARATHON_KM], (i, from, to) => (i === MATS_KM.length ? `${from}K–Finish` : `${from}–${to}K`));
}

/** Each whole mile (or km) and the last part one: "Mile 1" … "Mile 26", "Last 0.2 mi"; "Km 1" … "Km 42", "Last 0.2 km". */
export function unitStretches(goal: number, terrain: TerrainCourse | null, units: UnitSystem): Stretch[] {
  const unit = units === 'mi' ? KM_PER_MILE : 1;
  const count = Math.floor(MARATHON_KM / unit);
  const ends = [...Array.from({ length: count }, (_, i) => (i + 1) * unit), MARATHON_KM];
  return between(goal, terrain, ends, (i) => (i < count ? `${units === 'mi' ? 'Mile' : 'Km'} ${i + 1}` : `Last 0.2 ${units}`));
}

/** A stretch's pace as the pages write it: "12:01/mi". */
export const stretchPace = (s: Stretch, units: UnitSystem) => fmtPace(s.pace, units);

/**
 * What the strips print under each time with the option on: the nine 5K sections' paces for the mat strip (the 5K cell
 * holds 0–5K, the Finish cell 40K–Finish), and each whole unit's pace for the split strips (index n − 1 for mile or km n;
 * the halfway cell has none).
 */
export interface StripPaces { mats: string[]; units: string[] }
export function stripPaces(goal: number, terrain: TerrainCourse | null, units: UnitSystem): StripPaces {
  return {
    mats: fiveKStretches(goal, terrain).map((s) => stretchPace(s, units)),
    units: unitStretches(goal, terrain, units).slice(0, -1).map((s) => stretchPace(s, units)),
  };
}

/** The fold's title, the same on both pages: "Every 5K and every mile: time and pace". */
export const stretchesTitle = (units: UnitSystem) => `Every 5K and every ${units === 'mi' ? 'mile' : 'km'}: time and pace`;
/** The fold's row count: the nine 5K sections and every unit (27 in miles, 43 in km). */
export const stretchCount = (units: UnitSystem) => 9 + unitStretches(1, null, units).length;
/** The strips' captions with the option on: a short note that the second line is each stretch's pace. */
export const MAT_PACES_NOTE = ' · each 5K’s pace under its time';
export const splitPacesNote = (units: UnitSystem) => ` · pace per ${units === 'mi' ? 'mile' : 'km'} under each time`;
/** The tables' screen-reader captions, in the style of the band's other tables. */
export function stretchCaption(kind: '5k' | 'unit', goal: number, terrain: boolean, units: UnitSystem): string {
  const what = kind === '5k' ? 'each 5K' : `each ${units === 'mi' ? 'mile' : 'km'}`;
  return terrain ? `Terrain-split time and pace for ${what} of ${fmtGoal(goal)} (published research)` : `Even-pace time and pace for ${what} of ${fmtGoal(goal)}`;
}
