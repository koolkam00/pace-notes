/**
 * The course-shape band (owner decision, October 20, 2026): the pace band and the race planner print a band in the course's
 * observed shape instead of even pace wherever the course's pace-band group publishes the goal. One rule, shared by both
 * pages and by scripts/verify-tools.cjs:
 *
 * - the group is the pace band's `all` group for the course and recorded gender (every screened finish from G − 5:00 to
 *   G − 0:01, G the whole minute at or below the goal), published only with 100 finishes (`cellOf` returns its cell);
 * - its median elapsed time at each of the nine official timing points (the 5–40 km mats and the finish), times
 *   goal ÷ the median finish, so the band ends exactly on the goal (seconds kept) and keeps the course's proportions;
 * - between timing points each segment's pace is held evenly (the mile and km rows, and halfway on those strips). Those
 *   rows are interpolated: the observed facts are the nine timing points only.
 *
 * All courses pooled has no course to shape it, so it stays even pace, as does a course or goal without a cell.
 */
import { MARATHON_KM, splitTable, type SplitInterval, type SplitRow } from '@/lib/tools/pace';
import { CHECKPOINTS } from '@/lib/tools/pace-band-data';

/** The two bands: the course's observed shape, or the goal spread evenly. */
export type BandMode = 'course' | 'even';
/** The query key that keeps the visitor's choice. Only `even` is ever written: the default (course shape where one exists) stays out. */
export const BAND_PARAM = 'pace';
/** The choice, in the site's segmented control, the same on the planner and the pace band. */
export const BAND_OPTIONS: { value: BandMode; label: string }[] = [{ value: 'course', label: 'Course shape' }, { value: 'even', label: 'Even pace' }];
/** The control's label. */
export const BAND_LABEL = 'Splits';

/**
 * The nine shaped elapsed times (seconds) for a goal, from a published cell's medians: e50[i] × goal ÷ e50[finish], the
 * finish exactly the goal. Null without a cell, or with medians that are not nine finite, rising times.
 */
export function courseShape(cell: { e50: number[] } | null | undefined, goal: number): number[] | null {
  const e = cell?.e50;
  if (!e || e.length !== CHECKPOINTS.length || !Number.isFinite(goal) || goal <= 0) return null;
  if (!e.every((v, i) => Number.isFinite(v) && v > (i ? e[i - 1] : 0))) return null;
  return e.map((v, i) => (i === e.length - 1 ? goal : (v * goal) / e[e.length - 1]));
}

/** The shape for a scope: none on all courses pooled (no course to shape it), otherwise the cell's. */
export function shapeFor(scope: string, cell: { e50: number[] } | null | undefined, goal: number): number[] | null {
  return scope === 'all' || scope === '' ? null : courseShape(cell, goal);
}

/**
 * The band's mode: course shape wherever a shape exists, unless the visitor chose even pace (`choice` is the address's
 * `pace` value: `even`, or anything else for the default); even pace wherever there is no shape.
 */
export function bandMode(shape: number[] | null, choice: string): BandMode {
  return shape && choice !== 'even' ? 'course' : 'even';
}

/** The address value for a mode: the default (course shape) stays out of the address, even pace is `even`. */
export const bandChoice = (mode: BandMode) => (mode === 'even' ? 'even' : '');

/** Elapsed time at a distance on the shaped band: each segment between timing points (and from the start) run evenly. */
export function shapedAt(shape: number[], km: number): number {
  let fromKm = 0;
  let fromT = 0;
  for (let i = 0; i < CHECKPOINTS.length; i++) {
    const toKm = CHECKPOINTS[i];
    if (Math.abs(km - toKm) < 1e-9) return shape[i];
    if (km < toKm) return fromT + ((shape[i] - fromT) * (km - fromKm)) / (toKm - fromKm);
    fromKm = toKm;
    fromT = shape[i];
  }
  return shape[CHECKPOINTS.length - 1];
}

/**
 * The band's rows (every mile or km, halfway and the mats, or the 5K mats), the same markers as the even-pace rows: on a
 * shape, each marker's elapsed time from `shapedAt`; without one, the even-pace rows themselves.
 */
export function bandRows(goal: number, interval: SplitInterval, shape: number[] | null): SplitRow[] {
  const even = splitTable(goal, MARATHON_KM, interval);
  if (!shape) return even;
  let previous = 0;
  return even.map((row) => {
    const elapsed = shapedAt(shape, row.km);
    const shaped = { ...row, elapsed, split: elapsed - previous };
    previous = elapsed;
    return shaped;
  });
}

/** The shape at a glance, in seconds per km: through 20K (the 20K mat ÷ 20) and from 30K to the finish. */
export function shapePaces(shape: number[]): { to20: number; from30: number } {
  return { to20: shape[3] / 20, from30: (shape[8] - shape[5]) / (MARATHON_KM - 30) };
}

/** The one line where a course has no shape at this goal (the same on both pages). `where` reads "in Boston". */
export const noShapeLine = (where: string, genderWord = '') => `Too few finishes at this goal ${where}${genderWord ? ` (recorded as ${genderWord})` : ''} for a course shape.`;

/** The printed mat strip's caption in course mode. */
export const shapeCaption = (place: string, genderWord = '') => `Course shape · finishes that made the goal in ${place}${genderWord ? `, ${genderWord}` : ''} · Pace Notes data`;
