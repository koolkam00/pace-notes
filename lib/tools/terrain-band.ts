/**
 * The terrain band (owner decision, October 23, 2026: "It should use an elevation model"): on a course with a checked
 * route profile, the pace band and the race planner spread the visitor's own goal over the course's corrected elevation
 * profile at an even effort, with one published grade curve, instead of evenly. One rule, shared by both pages and by
 * scripts/verify-tools.cjs:
 *
 * - the share of the goal reached at each marker comes from tools/course-terrain.json (lib/tools/terrain-data.ts): one
 *   share per whole km, per whole mile and at halfway, the same at every goal and for every recorded gender, since the
 *   goal only sets the scale; the finish is the goal itself, so the band ends exactly on it (seconds kept);
 * - each marker's elapsed time is the goal times its share, rounded to the second, and each split is the difference of
 *   two rounded elapsed times, so the splits always add up to the goal;
 * - no finish data enters the band, and the goal is never changed, only how it is divided.
 *
 * All courses pooled has no route, so it stays even pace, as does every course without a checked profile. The as-run
 * medians of finishes near a goal are never a band: they show only unscaled, in their own Pace Notes data panel, with the
 * forewarning built here (asRunLine). What a page draws from the terrain and the visitor's choice (`bandView`), and the
 * wording both pages print (the kicker, the card line, the climbs, the one line where there is no terrain, the strip's
 * labels and captions), are built here too, so the two pages follow one rule and say it in the same words.
 */
import { HALF_KM, MARATHON_KM, perUnit, splitTable, watchTarget, type SplitInterval, type SplitRow } from '@/lib/tools/pace';
import { CHECKPOINTS, fmtGoal, fmtPace } from '@/lib/tools/pace-band-data';
import type { TerrainCourse, TerrainFeature } from '@/lib/tools/terrain-data';
import { formatDuration } from '@/lib/tools/time';
import { KM_PER_MILE, type UnitSystem } from '@/lib/units';

/** The two bands: the goal spread over the course's terrain, or spread evenly. */
export type BandMode = 'terrain' | 'even';
/** The query key that keeps the visitor's choice. Only `even` is ever written: the default (terrain where a course has it) stays out. */
export const BAND_PARAM = 'pace';
/** The choice, in the site's segmented control, the same on the planner and the pace band. */
export const BAND_OPTIONS: { value: BandMode; label: string }[] = [{ value: 'terrain', label: 'Terrain' }, { value: 'even', label: 'Even pace' }];
/** The control's label. */
export const BAND_LABEL = 'Splits';

/** The whole minute a goal's observed group uses: the minute at or below the goal, so every finish in the window beat it (3:30:59 → 210). */
export const bandMinute = (goal: number) => Math.floor(goal / 60);

/**
 * The band's mode: terrain wherever the course has terrain splits, unless the visitor chose even pace (`choice` is the
 * address's `pace` value: `even`, or anything else for the default); even pace wherever there are none.
 */
export function bandMode(terrain: TerrainCourse | null, choice: string): BandMode {
  return terrain && choice !== 'even' ? 'terrain' : 'even';
}

/** The address value for a mode: the default (terrain) stays out of the address, even pace is `even`. */
export const bandChoice = (mode: BandMode) => (mode === 'even' ? 'even' : '');

/**
 * The address value a page keeps once it has read its address: `even` stays only where a course could have terrain splits
 * (not on all courses, where no choice is offered); anything else (`pace=foo`, `pace=course`) is the default and leaves.
 * So a choice of even pace carries from one course to the next, but not through All courses: back on a course, the band
 * is that course's terrain again.
 */
export const tidyChoice = (pace: string, allCourses: boolean) => (!allCourses && pace === 'even' ? 'even' : '');

/**
 * What a page draws from its course's terrain and the visitor's choice, the same on both pages: the mode, the terrain the
 * band uses (`banded`, null at even pace) and whether the choice is offered (`offered`: the course has terrain splits).
 * Everything is known at build time, so nothing waits.
 */
export function bandView({ terrain, choice }: { terrain: TerrainCourse | null; choice: string }): { mode: BandMode; banded: TerrainCourse | null; offered: boolean } {
  const mode = bandMode(terrain, choice);
  return { mode, banded: mode === 'terrain' ? terrain : null, offered: Boolean(terrain) };
}

const whole = (v: number) => Math.abs(v - Math.round(v)) < 1e-6;

/**
 * The share of the goal reached at a marker on the terrain band: 1 at the finish, the published share at halfway, at a
 * whole km or at a whole mile. Any other distance has no published share and throws.
 */
export function terrainAt(t: TerrainCourse, km: number): number {
  if (km >= 42.19) return 1;
  if (Math.abs(km - HALF_KM) < 1e-6) return t.half;
  const k = Math.round(km);
  if (whole(km) && k >= 1 && k <= t.km.length) return t.km[k - 1];
  const m = Math.round(km / KM_PER_MILE);
  if (whole(km / KM_PER_MILE) && m >= 1 && m <= t.mi.length) return t.mi[m - 1];
  throw new Error(`The terrain band has no marker at ${km} km`);
}

/** Elapsed time (whole seconds) at a marker on the terrain band: the goal times its share, rounded; the finish is the goal. */
export const terrainElapsed = (goal: number, t: TerrainCourse, km: number) => (km >= 42.19 ? goal : Math.round(goal * terrainAt(t, km)));

/**
 * The band's rows (every mile or km, halfway and the mats, or the 5K mats), the same markers as the even-pace rows: on
 * terrain, each marker's rounded elapsed time and the difference from the one before; without terrain, the even-pace rows
 * themselves.
 */
export function bandRows(goal: number, interval: SplitInterval, terrain: TerrainCourse | null): SplitRow[] {
  const even = splitTable(goal, MARATHON_KM, interval);
  if (!terrain) return even;
  let previous = 0;
  return even.map((row) => {
    const elapsed = row.finish ? goal : terrainElapsed(goal, terrain, row.km);
    const out = { ...row, elapsed, split: elapsed - previous };
    previous = elapsed;
    return out;
  });
}

/**
 * The night card's four times: 5K, halfway, 30K and the finish, on terrain (rounded elapsed times) or at even pace.
 */
export function cardMats(goal: number, terrain: TerrainCourse | null): [string, number][] {
  if (terrain) return [['5K', terrainElapsed(goal, terrain, 5)], ['Half', terrainElapsed(goal, terrain, HALF_KM)], ['30K', terrainElapsed(goal, terrain, 30)], ['Finish', goal]];
  const pKm = goal / MARATHON_KM;
  return [['5K', pKm * 5], ['Half', goal / 2], ['30K', pKm * 30], ['Finish', goal]];
}

/** Every official mat's time on the band, for the folds and the mat strip: the terrain's (or null at even pace) beside even pace. */
export function matRows(goal: number, terrain: TerrainCourse | null): { km: number; terrain: number | null; even: number }[] {
  return CHECKPOINTS.map((km, i) => ({
    km, terrain: terrain ? terrainElapsed(goal, terrain, km) : null, even: i === CHECKPOINTS.length - 1 ? goal : (goal / MARATHON_KM) * km,
  }));
}

/**
 * Whole-unit splits (miles 1–26 or km 1–42) from consecutive rounded elapsed times, each with the stretch of road it
 * covers; the partial last unit is left out. Without terrain, the even-pace times rounded the same way.
 */
export function unitSplits(goal: number, terrain: TerrainCourse | null, units: UnitSystem): { n: number; split: number; fromKm: number; toKm: number }[] {
  const unit = units === 'mi' ? KM_PER_MILE : 1;
  const count = Math.floor(MARATHON_KM / unit);
  const at = (n: number) => (n === 0 ? 0 : terrain ? terrainElapsed(goal, terrain, n * unit) : Math.round((goal * n * unit) / MARATHON_KM));
  const out: { n: number; split: number; fromKm: number; toKm: number }[] = [];
  for (let n = 1; n <= count; n++) out.push({ n, split: at(n) - at(n - 1), fromKm: (n - 1) * unit, toKm: n * unit });
  return out;
}

/**
 * The structure a stretch of road crosses: the first feature (in race order) whose overlap with the stretch is at least a
 * quarter of the stretch, or at least 40% of the feature's own length; null when none.
 */
export function featureFor(features: TerrainFeature[], fromKm: number, toKm: number): TerrainFeature | null {
  for (const f of [...features].sort((a, b) => a.from_km - b.from_km)) {
    const overlap = Math.min(toKm, f.to_km) - Math.max(fromKm, f.from_km);
    if (overlap <= 0) continue;
    if (overlap >= 0.25 * (toKm - fromKm) - 1e-9 || overlap >= 0.4 * (f.to_km - f.from_km) - 1e-9) return f;
  }
  return null;
}

/** The goal's average time per mile or km. */
const unitAverage = (goal: number, units: UnitSystem) => goal / (MARATHON_KM / (units === 'mi' ? KM_PER_MILE : 1));

/**
 * The band's climbs: up to three of the slowest whole units, among those at least 2% slower than the goal's average
 * (ties to the earlier unit), in race order.
 */
export function climbs(goal: number, terrain: TerrainCourse, units: UnitSystem): { n: number; split: number; fromKm: number; toKm: number }[] {
  const avg = unitAverage(goal, units);
  return unitSplits(goal, terrain, units).filter((u) => u.split >= 1.02 * avg)
    .sort((a, b) => b.split - a.split || a.n - b.n).slice(0, 3)
    .sort((a, b) => a.n - b.n);
}

/**
 * The climbs in one line, each with the structure it crosses where it crosses one: "Climbs: mile 1 (Verrazzano) 12:50 ·
 * mile 15 (Queensboro, 59th St) 12:42 · mile 24 12:25"; where no unit is 2% slower than the average, "No mile more than
 * 2% slower than the 10:18/mi average."
 */
export function climbsLine(goal: number, terrain: TerrainCourse, units: UnitSystem): string {
  const word = units === 'mi' ? 'mile' : 'km';
  const list = climbs(goal, terrain, units);
  if (!list.length) return `No ${word} more than 2% slower than the ${fmtPace(goal / MARATHON_KM, units)} average.`;
  return `Climbs: ${list.map((c) => {
    const f = featureFor(terrain.features, c.fromKm, c.toKm);
    return `${word} ${c.n}${f ? ` (${f.short})` : ''} ${formatDuration(c.split)}`;
  }).join(' · ')}`;
}

/**
 * The band's kicker: the goal and course, then the band in its mode ("terrain splits, avg 12:01/mi"; "9:09/mi even"), and
 * a watch that reads long. On terrain the watch figure is labelled as the watch's average for the whole race, since the
 * band's own pace changes along the course. The planner's card already gives the average, so its band panel's kicker
 * leaves it out (`pace: false`: "5:15 · New York · terrain splits"). The band is the same for every recorded gender, so
 * the kicker never names one.
 */
export function bandKicker({ goal, place, terrain, units, overrun = 0, example = false, pace = true }: {
  goal: number; place: string; terrain: TerrainCourse | null; units: UnitSystem; overrun?: number; example?: boolean; pace?: boolean;
}): string {
  const pKm = goal / MARATHON_KM;
  const onTerrain = Boolean(terrain);
  const head = `${example ? 'Example · ' : ''}${fmtGoal(goal)} · ${place}`;
  const mode = onTerrain ? (pace ? `terrain splits, avg ${fmtPace(pKm, units)}` : 'terrain splits') : `${fmtPace(pKm, units)} even`;
  return `${head} · ${mode}${overrun ? ` · ${watchLine(pKm, overrun, units, onTerrain)}` : ''}`;
}

/** A watch that reads long by `overrun`: its pace at the goal ("watch 9:04/mi"), on terrain its average ("watch avg 9:04/mi"). */
export const watchLine = (pKm: number, overrun: number, units: UnitSystem, terrain: boolean) => `watch ${terrain ? 'avg ' : ''}${fmtPace(watchTarget(pKm, overrun), units)}`;

/** The goal's even pace where it travels with the band (the strip's Goal cell, the goal bar): labelled as the average on terrain. */
export const goalPace = (pKm: number, units: UnitSystem, terrain: boolean) => `${terrain ? 'avg ' : ''}${fmtPace(pKm, units)}`;

/**
 * The printed mat strip's Goal cell under the goal, as lines of phrases. At even pace one line, as before: "9:09/mi ·
 * 5:41/km", then the watch ("watch 9:04/mi"). On terrain "avg" is said once, for the cell ("avg 12:01/mi · 7:28/km"), and
 * the watch's figure takes its own line ("watch 11:54/mi"), each phrase kept whole.
 */
export function goalCell(pKm: number, overrun: number, units: UnitSystem, terrain: boolean): string[][] {
  const paces = [`${terrain ? 'avg ' : ''}${formatDuration(perUnit(pKm, 'mi'))}/mi`, `${formatDuration(pKm)}/km`];
  const watch = overrun ? `watch ${fmtPace(watchTarget(pKm, overrun), units)}` : null;
  if (!terrain) return [watch ? [...paces, watch] : paces];
  return watch ? [paces, [watch]] : [paces];
}

/** The short disclaimer that ends the card line, kept on one line where it shows. */
export const TERRAIN_DISCLAIMER = 'Not a prediction.';
/** What the terrain band is: "Terrain splits: 5:15 spread over New York’s climbs and descents at an even effort." */
export const terrainWhat = (goal: number, city: string) => `Terrain splits: ${fmtGoal(goal)} spread over ${city}’s climbs and descents at an even effort.`;
/** The card line, the same on both pages (the planner's card, under the pace band's kicker): what it is, and that it is not a prediction. */
export const terrainCardLine = (goal: number, city: string) => `${terrainWhat(goal, city)} ${TERRAIN_DISCLAIMER}`;

/** The one line where a course has no terrain splits: the same words on both pages and for either reason (a profile
    that did not pass its check, or none checked). The reasons are on /methodology#tools-terrain-profiles, since a page
    carries no coverage or method-caveat text (October 29, 2026). */
export function noTerrainLine(city: string): string {
  return `Even pace: no terrain splits for ${city}.`;
}

/** The printed mat strip's caption on terrain. */
export const terrainCaption = (place: string) => `Terrain splits · ${place} route · Published research`;
/**
 * A printed split strip's caption ("Terrain splits (Published research) 5:15 · each mile · strip 1 of 3"; at even pace
 * "Even pace 5:15 · …"): each strip is cut out and worn on its own, so on terrain each names its source.
 */
export const splitCaption = (terrain: boolean, goal: number, interval: SplitInterval, strip: number, strips: number) =>
  `${terrain ? 'Terrain splits (Published research)' : 'Even pace'} ${fmtGoal(goal)} · ${interval === 'mi' ? 'each mile' : 'each km'} · strip ${strip} of ${strips}`;

/** The term the forewarning links to its definition (the fourth of asRunLine's parts). */
export const AS_RUN_TERM = 'sustained slowdown';
/**
 * The forewarning over the as-run medians, as its parts, so the page links the term: "As run, slowdowns included: 48% had
 * a sustained slowdown. Not splits to copy." The share is the group's (`sd`, rounded to a whole percent); without one,
 * the line says only that slowdowns are included.
 */
export function asRunLine(sd: number | null | undefined): string[] {
  if (typeof sd !== 'number' || !Number.isFinite(sd)) return ['As run, slowdowns included. Not splits to copy.'];
  return ['As run, slowdowns included: ', `${Math.round(sd * 100)}%`, ' had a ', AS_RUN_TERM, '. Not splits to copy.'];
}
