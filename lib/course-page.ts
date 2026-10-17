/**
 * Everything a course page (/courses/<slug>) prints, read at build time from published files only: the story summaries
 * (courses.json, archetypes.json, course-geometry.json), the course chooser's rows (tools/course-goal.json), the tools'
 * and analyses' scopes (the course comparison's from its all-finisher file), the duplicate-edition screen and, for each
 * edition's race date, scheduled start and the supplied route's 5 km sections, the checksum-verified runner-context
 * shards, whose manifest must be the exact one the story data was built from. Every field is printed as published;
 * nothing is re-derived from the records. The page's sentences are nuggets (lib/nuggets/courses.ts) built from this
 * model. `scripts/verify-courses.cjs` recounts each figure from the files on its own and checks the built pages
 * (docs/SEO.md, "Course pages").
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import release from '@/analysis/release.json';
import { getCourseNames } from './course-data';
import { copyEditions, isCopyEdition } from './duplicate-editions';
import type { Archetypes, CourseGeometry, Courses, CourseSummary, InsightsManifest, WeatherEdition } from './insights';
import { getInsightsManifest, readInsight } from './insights-server';
import { validateContextManifest, type ContextManifest } from './runner-context';
import type { RunnerManifest } from './runner-search';
import type { CourseContext, CourseGoal, CourseGoalRow, PaceBandIndex } from './tools/data';
import { courseSlug } from './tools/links';
import { courseGoalReason, screenedReason, tooFewEditions } from './tools/plan';
import { qualifyingKeyForCity } from './tools/qualifying';

/** The five goals a course page tabulates (whole minutes): the goal pages' 3:00 to 5:00. */
export const COURSE_GOALS = [180, 210, 240, 270, 300] as const;
export const MAX_TITLE = 60;
export const MAX_DESCRIPTION = 155;
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// ---------- Pure helpers (scripts/verify-courses.cjs tests these on hand-made fixtures) ----------

export const count = (n: number) => n.toLocaleString('en-US');
/** A share as the page prints it: one decimal, e.g. 0.2181 → "21.8%". */
export const pct = (share: number) => `${(share * 100).toFixed(1)}%`;
/** Elapsed time in whole seconds, always with hours: 13111 → "3:38:31". */
export function clock(seconds: number): string {
  const s = Math.round(seconds);
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
/** A duration under an hour: 565 → "9:25". */
export function minutes(seconds: number): string {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
/** A goal in whole minutes: 210 → "3:30". */
export const goalText = (goal: number) => `${Math.floor(goal / 60)}:${String(goal % 60).padStart(2, '0')}`;
/** A race date as the edition table prints it (the year has its own column): "2018-04-16" → "Apr 16". */
export const shortDate = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1].slice(0, 3)} ${Number(iso.slice(8, 10))}`;
/**
 * The coolest-against-warmest pairing, only when the two editions' start temperatures are at least the screen's minimum
 * gap apart (weather.pairs.min_gap_c, 5 °C): closer editions are no real contrast, and the pairing would invite a causal
 * reading. Null otherwise.
 */
export function hotCoolShown<T extends { hot: { temp: number }; cool: { temp: number } }>(entry: T | undefined | null, minGap: number): T | null {
  if (!entry || !Number.isFinite(minGap)) return null;
  return Math.round((entry.hot.temp - entry.cool.temp) * 10) / 10 >= minGap ? entry : null;
}

/** Search title: "{race}: Elevation, Pacing and Finish Times", or "… Pacing and Finish Times by Year" without a route; the brand when it fits. */
export function courseTitle(race: string, hasRoute: boolean): string {
  const branded = `${race}: ${hasRoute ? 'Elevation, Pacing and Finish Times' : 'Pacing and Finish Times by Year'} | Pace Notes`;
  return branded.length <= MAX_TITLE ? branded : branded.replace(/ \| Pace Notes$/, '');
}

/**
 * Search description from the same figures the page prints: richest wording first, clauses dropped while the text would
 * run past 155 characters. The editions and years are the ones that make up the finishes (`counted`), as on the page.
 */
export function courseDescription(race: string, total: { finishes: number; editions: number; years: number[] }, hasRoute: boolean, hasWeather: boolean): string {
  const years = total.years.length ? [Math.min(...total.years), Math.max(...total.years)] : null;
  const span = total.editions === 1 && years ? ` in its ${years[0]} edition` : ` across ${count(total.editions)} editions${years && years[0] !== years[1] ? ` (${years[0]}–${years[1]})` : ''}`;
  const lead = hasRoute ? `${race} elevation profile, finish times by year and how` : `${race} finish times by year and how`;
  const variants = [span, ''].flatMap((spanText) => [hasWeather, false].flatMap((weather) => [true, false].map((recorded) =>
    `${lead} ${count(total.finishes)}${recorded ? ' recorded' : ''} finishes paced each 5 km${spanText}${weather ? ', with race-morning weather' : ''}.`)));
  return variants.find((text) => text.length <= MAX_DESCRIPTION) ?? variants[variants.length - 1];
}

/**
 * The editions whose finishes make up a course total: every edition with a row, plus the editions under 100 finishes that
 * the total also counts (Amsterdam 2023's 14). Their finishes must add up to the total exactly, or this throws and the
 * build stops: a page never says the total came from editions that do not account for it.
 */
export function countedEditions(city: string, total: number, rows: { year: number; n: number }[], small: { year: number; n: number }[]): { editions: number; years: number[] } {
  const sum = [...rows, ...small].reduce((t, e) => t + e.n, 0);
  if (sum !== total) throw new Error(`${city}: its editions add up to ${sum} finishes, not the course total of ${total}.`);
  const years = [...rows, ...small].map((e) => e.year).sort((a, b) => a - b);
  if (new Set(years).size !== years.length) throw new Error(`${city}: an edition is counted twice.`);
  return { editions: years.length, years };
}

// ---------- Runner-context shards: race dates, scheduled starts and 5 km sections ----------

export type TerrainSection = { start_km: number; end_km: number; gain_m: number; loss_m: number; net_m: number };
export type EditionContext = {
  eligible: number; date: string | null; start: string | null; terrain: TerrainSection[] | null;
  /** The weather record's own flag: false when the data producer's race date and scheduled start were not independently verified. */
  startVerified: boolean | null;
  /** The weather record's source and its documentation page (Open-Meteo's historical weather archive today). */
  source: { name: string; url: string } | null;
};

const DATA = () => path.join(process.cwd(), 'public/data');
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const editionKey = (city: string, year: number) => `${city}|${year}`;
let contexts: Map<string, EditionContext> | undefined;

const UNBOUND = 'Course pages need runner context built from the same runner records as the story data.';

/**
 * The runner-context manifest, checked with the race reports' own validator (`validateContextManifest`: the adopted
 * release, the runner manifest's hash and timestamps, one shard per edition) and bound to the exact context the story data
 * was built from: its SHA-256 must be the one the insights manifest and the course geometry record. Context rebuilt from
 * the same runner records passes every other check, so without that hash the pages would print its race dates, starts,
 * weather sources and sections beside story figures built from the context before it. Throws otherwise.
 */
export function boundContextManifest(contextBytes: Buffer, runnerBytes: Buffer, story: Pick<InsightsManifest, 'release_tag' | 'input_as_of' | 'runner_manifest_sha256' | 'runner_manifest_as_of' | 'context_manifest_sha256'>, geometryContextSha: string | undefined): ContextManifest {
  const runnerSha = sha256(runnerBytes);
  let manifest: ContextManifest;
  try {
    manifest = validateContextManifest(JSON.parse(contextBytes.toString()), JSON.parse(runnerBytes.toString()) as RunnerManifest, runnerSha);
  } catch {
    throw new Error(UNBOUND);
  }
  if (story.release_tag !== manifest.release_tag || story.runner_manifest_sha256 !== runnerSha || story.input_as_of !== manifest.input_as_of || story.runner_manifest_as_of !== manifest.runner_manifest_as_of) throw new Error(UNBOUND);
  const contextSha = sha256(contextBytes);
  if (story.context_manifest_sha256 !== contextSha || geometryContextSha !== contextSha) {
    throw new Error('Course pages need the runner context the story data was built from: the runner-context manifest is not the one the insights manifest records. Rebuild the story data after the runner context.');
  }
  return manifest;
}

/**
 * Each edition's eligible count, race date, scheduled start and supplied-route sections, from the runner-context shards,
 * each checked against its manifest (bytes and SHA-256), which must be the exact one the story data was built from
 * (`boundContextManifest`). Copy editions are never read. About a second, once per build process.
 */
export function editionContexts(): Map<string, EditionContext> {
  if (contexts) return contexts;
  const runnerBytes = fs.readFileSync(path.join(DATA(), 'runners/manifest.json'));
  const runners = JSON.parse(runnerBytes.toString()) as { editions: { city: string; year: number }[] };
  const geometry = readInsight<{ context_manifest_sha256?: string }>('course-geometry.json');
  const manifest = boundContextManifest(fs.readFileSync(path.join(DATA(), 'runner-context/manifest.json')), runnerBytes, getInsightsManifest(), geometry.context_manifest_sha256);
  const copies = copyEditions();
  const found = new Map<string, EditionContext>();
  runners.editions.forEach((edition, index) => {
    if (isCopyEdition(edition, copies)) return;
    const meta = manifest.editions[String(index)];
    if (!meta || meta.file !== `editions/${String(index).padStart(3, '0')}.json.gz`) throw new Error(`Runner context has no shard for edition ${index}.`);
    const bytes = fs.readFileSync(path.join(DATA(), 'runner-context', meta.file));
    if (bytes.length !== meta.bytes || sha256(bytes) !== meta.sha256) throw new Error(`Runner context shard changed after its manifest was written: ${meta.file}`);
    const shard = JSON.parse(zlib.gunzipSync(bytes).toString());
    if (shard.edition?.city !== edition.city || shard.edition?.year !== edition.year || !Number.isInteger(shard.eligible_n)) throw new Error(`Runner context shard ${meta.file} is for another edition.`);
    const sections: TerrainSection[] | null = Array.isArray(shard.terrain?.sections) && shard.terrain.sections.length === 9
      ? shard.terrain.sections.map(({ start_km, end_km, gain_m, loss_m, net_m }: TerrainSection) => ({ start_km, end_km, gain_m, loss_m, net_m })) : null;
    const w = shard.weather;
    found.set(editionKey(edition.city, edition.year), {
      eligible: shard.eligible_n, date: w?.date ?? null, start: w?.scheduled_start ?? null, terrain: sections,
      startVerified: typeof w?.start_time_independently_verified === 'boolean' ? w.start_time_independently_verified : null,
      source: typeof w?.source === 'string' && typeof w?.documentation_url === 'string' && /^https:\/\//.test(w.documentation_url) ? { name: w.source, url: w.documentation_url } : null,
    });
  });
  contexts = found;
  return found;
}

/** The race months of a course, from the race dates of its editions in the story data. */
function raceMonths(courses: Courses, city: string): number[] {
  const all = editionContexts();
  const months = courses.years.cells.filter((c) => c.city === city).map((c) => all.get(editionKey(city, c.year))?.date).filter((d): d is string => !!d).map((d) => Number(d.slice(5, 7)));
  return [...new Set(months)].sort((a, b) => a - b);
}


// ---------- The page model ----------

export type EditionRow = { year: number; n: number; median_s: number; slowdown: number; temp: number | null; date: string | null };
export type WeatherRow = WeatherEdition & { start: string | null };
export type GoalLine = { goal: number; row: CourseGoalRow | null; reason: string | null };
type HotCool = Courses['weather']['hot_cool'][number];
/** One course on the strip of every course: its sustained-slowdown share from courses.json, as its own page prints it. */
export type FieldCourse = { city: string; slug: string; display: string; slowdown: number; editions: number; finishes: number };
/** A course whose pacing fingerprint sits near this one's: its curve (each section against its own average) for the sparkline. */
export type ShapeNeighbour = FieldCourse & { curve: number[]; distance: number };

export type CoursePageData = {
  city: string; slug: string; race: string; display: string;
  summary: CourseSummary;
  /** The 5 km sections as the story data names them ("0–5" … "40–42.2"), the order of every per-section field. */
  sections: string[];
  geometry: CourseGeometry | null;
  /** The course chooser's context for this course: the supplied route's section sums and the downhill-opening flag. */
  context: CourseContext | null;
  editions: EditionRow[];
  /**
   * The editions whose finishes make up `summary.finishes` (`countedEditions`), which a sentence printing the total names.
   * `summary.editions` and `summary.years` are the editions with a row, over which the medians and shares are averaged.
   */
  counted: { editions: number; years: number[] };
  terrain: TerrainSection[] | null;
  weather: WeatherRow[];
  hotCool: HotCool | null;
  types: { finishes: number; editions: number; shares: number[] } | null;
  archetypes: { name: string; slug: string; share: number; profile: number[] }[];
  goals: GoalLine[];
  /** Why the course has no goal rows at all (every edition screened out), else null. */
  goalsScreened: string | null;
  /** Whether the pace band (and so the split check's course preset) publishes this course. */
  band: boolean;
  qualifyingKey: string | null;
  months: number[];
  /** The one height scale every course page draws its elevation on: the largest relief of any course page's route, rounded up to 50 m. */
  relief: number;
  /** Every course, for the strip on each page (the same courses.json share each course page leads with). */
  field: FieldCourse[];
  /** The courses whose fingerprints sit nearest this one's (five or more editions), nearest first; empty without a shape. */
  shapedLike: ShapeNeighbour[];
  /** Every course's pace by section against its own average (for the rows' sparklines), where it has a shape. */
  allCurves: { city: string; curve: number[] }[];
};

/** Read one optional insight file; null when it is not in this build. */
function optional<T>(name: string): T | null {
  return getInsightsManifest().files[name] ? readInsight<T>(name) : null;
}

/** The course's own race name from the data: the supplied route's race, else the course summary's, else the city plus " Marathon". */
export function raceName(city: string, geometry?: CourseGeometry | null, summary?: { race?: string } | null): string {
  return geometry?.race || summary?.race || `${city} Marathon`;
}

/** How a page names a city in prose: New York's race is the New York City Marathon. */
export const displayCity = (city: string) => (city === 'New York' ? 'New York City' : city);

/** The fewest editions a course needs before its fingerprint is compared with another's ("Shaped like …"). */
export const SHAPE_MIN_EDITIONS = 5;

/**
 * The courses whose fingerprints (each section's pace against its own average, minus the typical course's) sit nearest
 * a course's, by Euclidean distance over the nine sections; only courses with a shape and five or more editions, nearest
 * first, the first `limit`. Empty when the course has no shape of its own.
 */
export function nearestShapes<T extends { city: string; editions: number; deviation?: number[] }>(courses: T[], city: string, limit = 3): (T & { distance: number })[] {
  const self = courses.find((c) => c.city === city);
  if (!self?.deviation || self.deviation.length !== 9) return [];
  return courses
    .filter((c) => c.city !== city && c.deviation?.length === 9 && c.editions >= SHAPE_MIN_EDITIONS)
    .map((c) => ({ ...c, distance: Math.sqrt(c.deviation!.reduce((sum, d, i) => sum + (d - self.deviation![i]) ** 2, 0)) }))
    .sort((a, b) => a.distance - b.distance || a.city.localeCompare(b.city))
    .slice(0, limit);
}

/** The shared elevation scale: the largest relief (highest point less lowest) of the routes given, rounded up to 50 m. */
export function sharedRelief(routes: { min_m: number; max_m: number }[]): number {
  const most = Math.max(0, ...routes.map((g) => g.max_m - g.min_m));
  return Math.max(50, Math.ceil(most / 50) * 50);
}

/**
 * The editions a page never names as a range end: those the reviewed source policy for the adopted release holds or
 * excludes (the course-profile pack's copy of analysis/source_quality.py's list), and the duplicate-edition screen's
 * copies. Keys are "city|year".
 */
export function heldEditions(): Set<string> {
  const meta = JSON.parse(fs.readFileSync(path.join(DATA(), 'packs/ext_course_pacing_profiles/pack_meta.json'), 'utf8'));
  if (meta.source_quality?.release_tag !== release.tag || !Array.isArray(meta.source_quality.editions)) throw new Error('The course-profile source policy must be for the adopted release.');
  const held = (meta.source_quality.editions as { city: string; year: number }[]).map((e) => editionKey(e.city, e.year));
  return new Set([...held, ...copyEditions().map((c) => editionKey(c.city, c.year))]);
}

let pages: Map<string, CoursePageData> | undefined;

/** Every course page's data, keyed by slug, built once per process. */
export function coursePages(): Map<string, CoursePageData> {
  if (pages) return pages;
  const names = getCourseNames();
  const courses = readInsight<Courses>('courses.json');
  const geometry = readInsight<{ courses: CourseGeometry[] }>('course-geometry.json').courses;
  const archetypes = readInsight<Archetypes>('archetypes.json');
  const goal = optional<CourseGoal>('tools/course-goal.json');
  const band = optional<PaceBandIndex>('tools/pace-band.json');
  const all = editionContexts();
  const bandSlugs = new Set((band?.scopes ?? []).map((s) => s.slug));
  const routes = geometry.filter((g) => names.includes(g.city));
  const relief = sharedRelief(routes);
  const field: FieldCourse[] = courses.courses.filter((c) => names.includes(c.city))
    .map((c) => ({ city: c.city, slug: courseSlug(c.city), display: displayCity(c.city), slowdown: c.slowdown, editions: c.editions, finishes: c.finishes }));
  const allCurves = courses.courses.filter((c) => names.includes(c.city) && c.curve?.length === 9).map((c) => ({ city: c.city, curve: c.curve! }));
  const built = new Map<string, CoursePageData>();
  for (const city of names) {
    const summary = courses.courses.find((c) => c.city === city);
    if (!summary) throw new Error(`courses.json has no summary for ${city}.`);
    const slug = courseSlug(city);
    const route = routes.find((g) => g.city === city) ?? null;
    const cells = courses.years.cells.filter((c) => c.city === city).sort((a, b) => a.year - b.year);
    const editions = cells.map((c) => ({ year: c.year, n: c.n, median_s: c.median_s, slowdown: c.slowdown, temp: c.temp, date: all.get(editionKey(city, c.year))?.date ?? null }));
    const listed = new Set(cells.map((c) => c.year));
    // The editions under 100 finishes (no row) that the course total also counts: the city's other shards with finishes.
    const smallEditions = [...all].filter(([key, ctx]) => key.startsWith(`${city}|`) && ctx.eligible > 0 && !listed.has(Number(key.split('|')[1])))
      .map(([key, ctx]) => ({ year: Number(key.split('|')[1]), n: ctx.eligible })).sort((a, b) => a.year - b.year);
    const counted = countedEditions(city, summary.finishes, cells, smallEditions);
    const terrains = cells.map((c) => all.get(editionKey(city, c.year))?.terrain).filter((t): t is TerrainSection[] => !!t);
    // Every edition of a city has the same supplied current route; show its sections only when the shards agree.
    const terrain = route && terrains.length && terrains.every((t) => JSON.stringify(t) === JSON.stringify(terrains[0])) ? terrains[0] : null;
    const weather = courses.weather.editions.filter((e) => e.city === city).sort((a, b) => a.year - b.year)
      .map((e) => ({ ...e, start: all.get(editionKey(city, e.year))?.start ?? null }));
    const types = archetypes.courses.find((c) => c.city === city) ?? null;
    const context = goal?.courses.find((c) => c.city === city) ?? null;
    // Too few editions for any goal: one sentence instead of five rows saying the same thing.
    const fewEditions = goal && context && context.editions < goal.min_editions ? tooFewEditions(context.editions, goal.min_editions) : null;
    const goals: GoalLine[] = goal && context && !fewEditions ? COURSE_GOALS.map((g) => {
      const row = goal.rows.find((r) => r.city === city && r.goal === g) ?? null;
      if (row) return { goal: g, row, reason: null };
      const gap = goal.unavailable.find((u) => u.city === city && u.goal === g);
      return { goal: g, row: null, reason: gap ? courseGoalReason(gap.reason, goal.min_editions) : 'No row is published for this goal.' };
    }) : [];
    const near = nearestShapes(courses.courses.filter((c) => names.includes(c.city)), city);
    built.set(slug, {
      city, slug, race: raceName(city, route, summary), display: displayCity(city),
      summary, sections: courses.sections, counted, geometry: route, context, editions, terrain, weather,
      hotCool: hotCoolShown(courses.weather.hot_cool.find((h) => h.city === city), courses.weather.pairs.min_gap_c),
      types: types ? { finishes: types.finishes, editions: types.editions, shares: types.shares } : null,
      archetypes: archetypes.archetypes.map(({ name, slug: s, share, profile }) => ({ name, slug: s, share, profile })),
      goals,
      goalsScreened: goal && !context ? screenedReason(city, goal.screens) : fewEditions,
      band: bandSlugs.has(slug),
      qualifyingKey: qualifyingKeyForCity(city),
      months: raceMonths(courses, city),
      relief, field, allCurves,
      shapedLike: near.map((c) => ({ city: c.city, slug: courseSlug(c.city), display: displayCity(c.city), slowdown: c.slowdown, editions: c.editions, finishes: c.finishes, curve: c.curve ?? [], distance: c.distance })),
    });
  }
  pages = built;
  return built;
}

export const coursePage = (slug: string): CoursePageData | null => coursePages().get(slug) ?? null;
