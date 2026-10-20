/**
 * The course-shape band (owner decision, October 20, 2026): the pace band and the race planner print a band in the course's
 * observed shape instead of even pace wherever the course's pace-band group publishes the goal. One rule, shared by both
 * pages and by scripts/verify-tools.cjs:
 *
 * - the group is the pace band's `all` group for the course and recorded gender (every screened finish from G − 5:00 to
 *   G − 0:01, G the whole minute at or below the goal), published only with 100 finishes (`cellOf` returns its cell),
 *   whatever the number of editions behind it (a course with one or two screened editions has shapes from those alone);
 * - its median elapsed time at each of the nine official timing points (the 5–40 km mats and the finish), times
 *   goal ÷ the median finish, so the band ends exactly on the goal (seconds kept) and keeps the course's proportions;
 * - between timing points each segment's pace is held evenly (the mile and km rows, and halfway on those strips). Those
 *   rows are interpolated: the observed facts are the nine timing points only.
 *
 * All courses pooled has no course to shape it, so it stays even pace, as does a course or goal without a cell.
 * What a page draws from the shape and the visitor's choice (`bandView`), and the wording both pages print (the kicker,
 * the shape's line, the one line where there is no shape, the strip's labels and captions), are built here too, so the
 * two pages follow one rule and say it in the same words.
 */
import type { PaceBandIndex } from '@/lib/tools/data';
import { MARATHON_KM, perUnit, splitTable, watchTarget, type SplitInterval, type SplitRow } from '@/lib/tools/pace';
import { CHECKPOINTS, fmtGoal, fmtPace, paceBandShardPath } from '@/lib/tools/pace-band-data';
import { formatDuration, formatHM } from '@/lib/tools/time';
import type { UnitSystem } from '@/lib/units';

/** The two bands: the course's observed shape, or the goal spread evenly. */
export type BandMode = 'course' | 'even';
/** The query key that keeps the visitor's choice. Only `even` is ever written: the default (course shape where one exists) stays out. */
export const BAND_PARAM = 'pace';
/** The choice, in the site's segmented control, the same on the planner and the pace band. */
export const BAND_OPTIONS: { value: BandMode; label: string }[] = [{ value: 'course', label: 'Course shape' }, { value: 'even', label: 'Even pace' }];
/** The control's label. */
export const BAND_LABEL = 'Splits';

/** The whole minute a goal's group uses: the minute at or below the goal, so every finish in the window beat it (3:30:59 → 210). */
export const bandMinute = (goal: number) => Math.floor(goal / 60);

/**
 * The nine shaped elapsed times (seconds) for a goal, from a published cell's medians: e50[i] × goal ÷ e50[finish], the
 * finish exactly the goal. Null without a cell, or with medians that are not nine finite, rising times. The cell's
 * edition count does not enter: a published cell (100 finishes) is shaped however many editions it pools.
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

/**
 * The address value a page keeps once it has read its address: `even` stays only where a course could have a shape (not
 * on all courses, where no choice is offered); anything else (`pace=foo`, `pace=course`) is the default and leaves. So a
 * choice of even pace carries from one course to the next, but not through All courses: back on a course, the band is
 * that course's shape again.
 */
export const tidyChoice = (pace: string, allCourses: boolean) => (!allCourses && pace === 'even' ? 'even' : '');

/**
 * What a page draws from its shape, the visitor's choice and its loading state, the same on both pages: the mode, the
 * shape the band uses (`shaped`, null at even pace), whether the band waits for a shape on its way (`pending`: the
 * course shape's layout with dashes, or a shape kept while its group reloads, `stale`), whether the band is in the course
 * shape's layout (`layout`, the shape or its place) and whether the choice is offered (`offered`).
 */
export function bandView({ shape, choice, loading, stale = false }: { shape: number[] | null; choice: string; loading: boolean; stale?: boolean }) {
  const mode = bandMode(shape, choice);
  const shaped = mode === 'course' ? shape : null;
  const pending = (!shape && loading && choice !== 'even') || (Boolean(shaped) && stale);
  return { mode, shaped, pending, layout: Boolean(shaped) || pending, offered: Boolean(shape) || loading };
}

/**
 * Each course the pace band publishes, by slug: its city and its groups' published goals by recorded gender (whole
 * minutes), as the index lists them. A course missing here has no group at all (Prague) or is not in the data.
 */
export type ShapeGoals = Record<string, { city: string | null; goals: Partial<Record<'all' | 'men' | 'women', [number, number]>> }>;

/** Every course's published goals, read from the index at build time so a page knows before any file loads whether to wait for a shape. */
export function shapeGoalsOf(index: Pick<PaceBandIndex, 'scopes' | 'shards'> | null): ShapeGoals {
  const out: ShapeGoals = {};
  for (const scope of index?.scopes ?? []) {
    if (scope.slug === 'all') continue;
    const goals: ShapeGoals[string]['goals'] = {};
    for (const g of ['all', 'men', 'women'] as const) {
      const meta = scope.genders[g];
      if (meta && index?.shards?.[paceBandShardPath(scope.slug, g)]) goals[g] = [meta.goals[0], meta.goals[1]];
    }
    out[scope.slug] = { city: scope.city, goals };
  }
  return out;
}

/**
 * Whether a course's group may have a shape at this minute: inside its published goals (a goal outside them settles at
 * once as even pace, with no wait for a file that cannot hold one; a gap inside them settles when its file arrives).
 */
export const mayShape = (goals: readonly [number, number] | null | undefined, minute: number | null) =>
  Boolean(goals) && minute !== null && minute >= goals![0] && minute <= goals![1];

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

/** The shape in words, the same on both pages and on paper: "8:41/mi to 20K, 9:48/mi from 30K". */
export function shapeLine(shape: number[], units: UnitSystem): string {
  const { to20, from30 } = shapePaces(shape);
  return `${fmtPace(to20, units)} to 20K, ${fmtPace(from30, units)} from 30K`;
}

/**
 * The night card's four times: in course shape the timing points 5K, 20K, 30K and the finish (never an interpolated
 * half); at even pace 5K, halfway, 30K and the finish. While a course's shape loads (`pending`), the course shape's labels
 * with no times yet (null), the finish being the goal itself.
 */
export function cardMats(goal: number, shape: number[] | null, pending = false): [string, number | null][] {
  if (shape) return [['5K', shape[0]], ['20K', shape[3]], ['30K', shape[5]], ['Finish', shape[8]]];
  if (pending) return [['5K', null], ['20K', null], ['30K', null], ['Finish', goal]];
  const pKm = goal / MARATHON_KM;
  return [['5K', pKm * 5], ['Half', goal / 2], ['30K', pKm * 30], ['Finish', goal]];
}

/** Every official mat's time on the band, for the folds: the course shape's (or null at even pace) beside even pace. */
export function matRows(goal: number, shape: number[] | null): { km: number; shaped: number | null; even: number }[] {
  return CHECKPOINTS.map((km, i) => ({ km, shaped: shape ? shape[i] : null, even: i === CHECKPOINTS.length - 1 ? goal : (goal / MARATHON_KM) * km }));
}

/** The short disclaimer that ends the shape's line, kept on one line where it shows. */
export const SHAPE_DISCLAIMER = 'Not a prediction.';
/** What the shape is, chosen by its outcome: "Course shape: how finishes that made 4:00 ran Boston." (with the recorded gender on the pace band). */
export const shapeWhat = (goal: number, city: string, genderWord = '') =>
  `Course shape: how finishes that made ${fmtGoal(goal)} ran ${city}${genderWord ? ` (recorded as ${genderWord})` : ''}.`;
/** The shape's one line, the same on both pages (the planner's card, under the pace band's kicker): what it is, and that it is not a prediction. */
export const cardShapeLine = (goal: number, city: string, genderWord = '') => `${shapeWhat(goal, city, genderWord)} ${SHAPE_DISCLAIMER}`;

/**
 * The band's kicker: the goal and course, then the band in its mode ("course shape, 8:41/mi to 20K, 9:48/mi from 30K",
 * with the recorded gender the shape comes from; "9:09/mi even"), and a watch that reads long. In course shape the watch
 * figure is labelled as the watch's average for the whole race, since the band's own pace changes along the course;
 * while the shape loads (`pending`) it reads "course shape" alone. The planner's card already gives the two phases, so
 * its band panel's kicker leaves them out (`phases: false`: "4:00 · Boston · course shape").
 */
export function bandKicker({ goal, place, genderWord = '', shape, units, overrun = 0, example = false, pending = false, phases = true }: {
  goal: number; place: string; genderWord?: string; shape: number[] | null; units: UnitSystem; overrun?: number; example?: boolean; pending?: boolean; phases?: boolean;
}): string {
  const pKm = goal / MARATHON_KM;
  const course = Boolean(shape) || pending;
  const head = `${example ? 'Example · ' : ''}${fmtGoal(goal)} · ${place}${course && genderWord ? ` · ${genderWord}` : ''}`;
  const mode = shape && phases ? `course shape, ${shapeLine(shape, units)}` : course ? 'course shape' : `${fmtPace(pKm, units)} even`;
  return `${head} · ${mode}${overrun ? ` · ${watchLine(pKm, overrun, units, course)}` : ''}`;
}

/** A watch that reads long by `overrun`: its pace at the goal ("watch 9:04/mi"), in course shape its average ("watch avg 9:04/mi"). */
export const watchLine = (pKm: number, overrun: number, units: UnitSystem, course: boolean) => `watch ${course ? 'avg ' : ''}${fmtPace(watchTarget(pKm, overrun), units)}`;

/** The goal's even pace where it travels with the band (the strip's Goal cell, the goal bar): labelled as the average in course shape. */
export const goalPace = (pKm: number, units: UnitSystem, course: boolean) => `${course ? 'avg ' : ''}${fmtPace(pKm, units)}`;

/**
 * The printed mat strip's Goal cell under the goal, as lines of phrases. At even pace one line, as before: "9:09/mi ·
 * 5:41/km", then the watch ("watch 9:04/mi"). In course shape "avg" is said once, for the cell ("avg 9:09/mi · 5:41/km"),
 * and the watch's figure takes its own line ("watch 9:04/mi"), each phrase kept whole.
 */
export function goalCell(pKm: number, overrun: number, units: UnitSystem, course: boolean): string[][] {
  const paces = [`${course ? 'avg ' : ''}${formatDuration(perUnit(pKm, 'mi'))}/mi`, `${formatDuration(pKm)}/km`];
  const watch = overrun ? `watch ${fmtPace(watchTarget(pKm, overrun), units)}` : null;
  if (!course) return [watch ? [...paces, watch] : paces];
  return watch ? [paces, [watch]] : [paces];
}

/**
 * Why a course shows no shape at this goal, in order: the pace band has no group for the course (`course`: Prague, whose
 * editions were all screened out) or for this recorded gender (`gender`: Singapore, women; the pace band's choice), the
 * goal is outside the published goals (`range`: 2:30 to 6:30), or the group has too few finishes at this goal (`few`: a
 * goal inside 2:30 to 6:30 whose window was counted and held fewer than 100).
 */
export type NoShapeReason = 'course' | 'gender' | 'range' | 'few';
export function noShapeReason({ scoped, gendered, minute, goals }: { scoped: boolean; gendered: boolean; minute: number; goals: readonly [number, number] }): NoShapeReason {
  if (!scoped) return 'course';
  if (!gendered) return 'gender';
  if (minute < goals[0] || minute > goals[1]) return 'range';
  return 'few';
}

/**
 * The one line where a course has no shape (the same words on both pages), from its reason: never a count that was not
 * made. Outside the published goals it gives the range, unless the page already says it beside the line (`noted`: the
 * planner's note on course results, the pace band's finishes section), where it reads "No course shape at this goal."
 */
export function noShapeLine(reason: NoShapeReason, { city, genderWord = '', goals, noted = false }: { city: string; genderWord?: string; goals: readonly [number, number]; noted?: boolean }): string {
  if (reason === 'range') return noted ? 'No course shape at this goal.' : `Course shapes cover goals from ${formatHM(goals[0] * 60)} to ${formatHM(goals[1] * 60)}.`;
  if (reason === 'few') return `Too few finishes at this goal in ${city}${genderWord ? ` (recorded as ${genderWord})` : ''} for a course shape.`;
  return `No course shape for ${city}${genderWord ? `, recorded as ${genderWord}` : ''}.`;
}

/** The printed mat strip's caption in course mode. */
export const shapeCaption = (place: string, genderWord = '') => `Course shape · finishes that made the goal in ${place}${genderWord ? `, ${genderWord}` : ''} · Pace Notes data`;
/**
 * A printed split strip's caption ("Course shape (Pace Notes data) 4:00 · each mile · strip 1 of 3"; at even pace "Even
 * pace 4:00 · …"): each strip is cut out and worn on its own, so in course shape each names its source.
 */
export const splitCaption = (course: boolean, goal: number, interval: SplitInterval, strip: number, strips: number) =>
  `${course ? 'Course shape (Pace Notes data)' : 'Even pace'} ${fmtGoal(goal)} · ${interval === 'mi' ? 'each mile' : 'each km'} · strip ${strip} of ${strips}`;
