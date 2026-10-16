/**
 * Everything a course page (/courses/<slug>) prints, read at build time from published files only: the story summaries
 * (courses.json, archetypes.json, course-geometry.json, replay.json), the course chooser's rows (tools/course-goal.json),
 * the tools' and analyses' scopes (the course comparison's from its all-finisher file), the duplicate-edition screen, the
 * course-profile pack's source policy and, for each edition's race date, scheduled start (with the weather record's own
 * verification flag and source) and the supplied route's 5 km sections, the checksum-verified runner-context shards.
 * Every field is printed as published; nothing is re-derived from the records. `scripts/verify-courses.cjs` recounts
 * each figure from the files on its own and checks the built pages (docs/SEO.md, "Course pages").
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import release from '@/analysis/release.json';
import { ALL_FINISHER_DEFAULT, allFinisherGroups, allFinisherRow, type AllFinisherEvidence } from './all-finisher-context';
import { getAllFinisherContextStart } from './all-finisher-context-server';
import { getCourseNames, getIndividualCourseAnswer } from './course-data';
import { copyEditionSentence, copyEditions, isCopyEdition, type CopyEdition } from './duplicate-editions';
import type { Archetypes, CourseGeometry, Courses, CourseSummary, InsightsManifest, WeatherEdition } from './insights';
import { getInsightsManifest, readInsight } from './insights-server';
import { getPersonalSummary } from './personalized-data';
import { validateContextManifest, type ContextManifest } from './runner-context';
import type { RunnerManifest } from './runner-search';
import type { CourseContext, CourseGoal, CourseGoalRow, PaceBandIndex, ProjectorIndex, WeatherMatch } from './tools/data';
import { courseSlug } from './tools/links';
import { courseGoalReason, screenedReason, tooFewEditions } from './tools/plan';
import { qualifyingKeyForCity } from './tools/qualifying';

/** The five goals a course page tabulates (whole minutes): the goal pages' 3:00 to 5:00. */
export const COURSE_GOALS = [180, 210, 240, 270, 300] as const;
/** The matched-pace band the page compares across courses: 5:00–5:30 per km through 20 km, as before. */
export const MATCHED_BAND_LO_S = 300;
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
/** "2018, 2019 and 2022–2026": runs of three or more years collapsed, the last item joined with "and". */
export function yearList(years: number[]): string {
  const sorted = [...new Set(years)].sort((a, b) => a - b);
  const runs: string[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j += 1;
    if (j - i >= 2) runs.push(`${sorted[i]}–${sorted[j]}`);
    else runs.push(...sorted.slice(i, j + 1).map(String));
    i = j;
  }
  return runs.length > 1 ? `${runs.slice(0, -1).join(', ')} and ${runs[runs.length - 1]}` : runs.join('');
}

/**
 * The coolest-against-warmest pairing, only when the two editions' start temperatures are at least the screen's minimum
 * gap apart (weather.pairs.min_gap_c, 5 °C): closer editions are no real contrast, and the pairing would invite a causal
 * reading. Null otherwise.
 */
export function hotCoolShown<T extends { hot: { temp: number }; cool: { temp: number } }>(entry: T | undefined | null, minGap: number): T | null {
  if (!entry || !Number.isFinite(minGap)) return null;
  return Math.round((entry.hot.temp - entry.cool.temp) * 10) / 10 >= minGap ? entry : null;
}

/** The editions with the lowest and the highest median finish (the first of any tie), or null without editions. */
export function medianRange<T extends { year: number; median_s: number }>(rows: T[]): { lo: T; hi: T } | null {
  if (!rows.length) return null;
  return {
    lo: rows.reduce((a, b) => (b.median_s < a.median_s ? b : a)),
    hi: rows.reduce((a, b) => (b.median_s > a.median_s ? b : a)),
  };
}

/** The courses either side of a course in the alphabetical list, wrapping at the ends; none for a list of one. */
export function alphabeticalNeighbours(names: string[], city: string): string[] {
  const i = names.indexOf(city);
  if (i < 0 || names.length < 2) return [];
  const before = names[(i - 1 + names.length) % names.length];
  const after = names[(i + 1) % names.length];
  return before === after ? [before] : [before, after];
}

/** For each month a course is run in, the other courses run in that month (alphabetical). Months with none are left out. */
export function sameMonthCourses(months: Map<string, number[]>, city: string): { month: number; cities: string[] }[] {
  return (months.get(city) ?? []).map((month) => ({
    month,
    cities: [...months].filter(([other, list]) => other !== city && list.includes(month)).map(([other]) => other).sort((a, b) => a.localeCompare(b)),
  })).filter((m) => m.cities.length);
}

/** Search title: "{race}: Elevation, Pacing and Finish Times", or "… Pacing and Finish Times by Year" without a route; the brand when it fits. */
export function courseTitle(race: string, hasRoute: boolean): string {
  const branded = `${race}: ${hasRoute ? 'Elevation, Pacing and Finish Times' : 'Pacing and Finish Times by Year'} | Pace Notes`;
  return branded.length <= MAX_TITLE ? branded : branded.replace(/ \| Pace Notes$/, '');
}

/**
 * Search description from the same figures the page prints: richest wording first, clauses dropped while the text would
 * run past 155 characters.
 */
export function courseDescription(race: string, summary: Pick<CourseSummary, 'finishes' | 'editions' | 'years'>, hasRoute: boolean, hasWeather: boolean): string {
  const years = summary.years.length ? [Math.min(...summary.years), Math.max(...summary.years)] : null;
  const span = summary.editions === 1 && years ? ` in its ${years[0]} edition` : ` across ${count(summary.editions)} editions${years && years[0] !== years[1] ? ` (${years[0]}–${years[1]})` : ''}`;
  const lead = hasRoute ? `${race} elevation profile, finish times by year and how` : `${race} finish times by year and how`;
  const variants = [span, ''].flatMap((spanText) => [hasWeather, false].flatMap((weather) => [true, false].map((recorded) =>
    `${lead} ${count(summary.finishes)}${recorded ? ' recorded' : ''} finishes paced each 5 km${spanText}${weather ? ', with race-morning weather' : ''}.`)));
  return variants.find((text) => text.length <= MAX_DESCRIPTION) ?? variants[variants.length - 1];
}

/**
 * The line under the finish-times table for a copy edition: D2's `copyEditionSentence()`, whose evidence comes only from
 * the screen's counts, with its ending replaced. That ending describes the runner search ("shown as recorded times only,
 * without pacing, peer or weather comparisons"); this page prints no figure for a copy and counts it only in the pooled
 * pace profile.
 */
export function courseCopySentence(entry: CopyEdition): string {
  const sentence = copyEditionSentence(entry);
  const end = sentence.lastIndexOf(', so ');
  if (end < 0) throw new Error('copyEditionSentence() no longer ends in ", so …": update courseCopySentence().');
  return `${sentence.slice(0, end)}, so this page counts them only in the pooled pace profile.`;
}

/** The plain words for a source-policy category. */
export const EXCLUSION_LABEL: Record<string, string> = {
  invalid_split_grid: 'Invalid split grid', incomplete_ingestion: 'Incomplete ingestion', unreconciled_hold: 'Held pending reconciliation', selected_field: 'Selected field only',
};

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
type Matched = Courses['matched'][number];
type HotCool = Courses['weather']['hot_cool'][number];
type Slope = Courses['weather']['per_course_slopes'][number];
type ShapeScreen = { year: number; finishes: number };

export type CoursePageData = {
  city: string; slug: string; race: string; display: string;
  summary: CourseSummary;
  geometry: CourseGeometry | null;
  /** The course chooser's context for this course: the supplied route's section sums and the downhill-opening flag. */
  context: CourseContext | null;
  editions: EditionRow[];
  copies: CopyEdition[];
  /** Finishes counted in the course total from editions with fewer than 100 finishes, which have no row (null when none). */
  small: { years: number[]; finishes: number } | null;
  terrain: TerrainSection[] | null;
  weather: WeatherRow[];
  weatherMissing: { year: number; reason: string }[];
  /** True when a printed race date or scheduled start comes from a weather record that says it was not independently verified. */
  datesUnverified: boolean;
  /** The weather rows' source, when they all name the same one. */
  weatherSource: { name: string; url: string } | null;
  hotCool: HotCool | null;
  minGapC: number;
  slope: Slope | null;
  types: { finishes: number; editions: number; shares: number[] } | null;
  archetypes: { name: string; slug: string; share: number }[];
  /** Editions whose first split includes start delays: out of the shape statistics, still in the pooled profile. */
  startOffset: (ShapeScreen & { median_gap_points: number })[];
  /** Editions the tools also leave out because the mat grid was shifted. */
  grid: (ShapeScreen & { reason: string })[];
  goals: GoalLine[];
  /** Why the course has no goal rows at all (every edition screened out), else null. */
  goalsScreened: string | null;
  goalMethod: { tolerance: number; minEditionFinishes: number; minEditions: number } | null;
  matched: Matched | null;
  exclusions: { year: number; category: string; reason: string }[];
  profileN: number | null;
  /**
   * Where each linked tool and analysis publishes this course: `analyses` is the personalized summary's course list,
   * `compare` the course comparison's own all-finisher row for the course (it needs three qualifying editions), and
   * `hills` the hills-and-pacing analysis, which needs the supplied route.
   */
  scopes: { band: boolean; projector: boolean; weather: boolean; plan: boolean; analyses: boolean; compare: boolean; hills: boolean };
  qualifyingKey: string | null;
  months: number[];
  neighbours: string[];
  sameMonth: { month: number; cities: string[] }[];
};

/** Read one optional insight file; null when it is not in this build. */
function optional<T>(name: string): T | null {
  return getInsightsManifest().files[name] ? readInsight<T>(name) : null;
}

/** The course's own race name from the data: the supplied route's race, else the course summary's, else the city plus " Marathon". */
export function raceName(city: string, geometry?: CourseGeometry | null, summary?: { race?: string } | null): string {
  return geometry?.race || summary?.race || `${city} Marathon`;
}

/**
 * The courses the course comparison (/analyses/course-comparison?race=<city>) has a result for: the all-finisher file's
 * default row for the course (all ages, genders and early paces) holds a course group. The file is checked against the
 * adopted release and the runner records first, as the analysis page checks it.
 */
function comparisonCities(names: string[]): Set<string> {
  getAllFinisherContextStart();
  const { rows } = JSON.parse(fs.readFileSync(path.join(DATA(), 'all-finisher-context/evidence.json'), 'utf8')) as AllFinisherEvidence;
  return new Set(names.filter((city) => {
    const row = allFinisherRow(rows, { ...ALL_FINISHER_DEFAULT, city });
    return !!row && allFinisherGroups(row, 'courses', ALL_FINISHER_DEFAULT.opening).length > 0;
  }));
}

/** The course-profile pack's source policy (the reviewed release's edition exclusions), bound to the adopted release. */
function sourcePolicy(): { city: string; year: number; category: string; reason: string }[] {
  const meta = JSON.parse(fs.readFileSync(path.join(DATA(), 'packs/ext_course_pacing_profiles/pack_meta.json'), 'utf8'));
  if (meta.source_quality?.release_tag !== release.tag || !Array.isArray(meta.source_quality.editions)) throw new Error('The course-profile source policy must be for the adopted release.');
  return meta.source_quality.editions;
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
  const projector = optional<ProjectorIndex>('tools/projector.json');
  const weatherMatch = optional<WeatherMatch>('tools/weather-match.json');
  const analysisCities = new Set((getPersonalSummary()?.cities ?? []).map((c) => c.city));
  const compareCities = comparisonCities(names);
  const policy = sourcePolicy();
  const copies = copyEditions();
  const all = editionContexts();
  const bandSlugs = new Set((band?.scopes ?? []).map((s) => s.slug));
  const projectorSlugs = new Set((projector?.scopes ?? []).map((s) => s.slug));
  const weatherSlugs = new Set((weatherMatch?.editions ?? []).map((e) => courseSlug(e.city)));
  // The planner offers every course in the course-goal file, every course whose editions it screened out, and every pace band scope.
  const planCities = new Set([...(goal?.courses ?? []).map((c) => c.city), ...[...(goal?.screens?.start_offset ?? []), ...(goal?.screens?.grid ?? [])].map((e) => e.city),
    ...(band?.scopes ?? []).flatMap((s) => (s.city ? [s.city] : []))]);
  const months = new Map(names.map((city) => [city, raceMonths(courses, city)]));
  const built = new Map<string, CoursePageData>();
  for (const city of names) {
    const summary = courses.courses.find((c) => c.city === city);
    if (!summary) throw new Error(`courses.json has no summary for ${city}.`);
    const slug = courseSlug(city);
    const route = geometry.find((g) => g.city === city) ?? null;
    const cells = courses.years.cells.filter((c) => c.city === city).sort((a, b) => a.year - b.year);
    const editions = cells.map((c) => ({ year: c.year, n: c.n, median_s: c.median_s, slowdown: c.slowdown, temp: c.temp, date: all.get(editionKey(city, c.year))?.date ?? null }));
    const listed = new Set(cells.map((c) => c.year));
    const smallYears = [...all].filter(([key, ctx]) => key.startsWith(`${city}|`) && ctx.eligible > 0 && !listed.has(Number(key.split('|')[1]))).map(([key]) => Number(key.split('|')[1])).sort((a, b) => a - b);
    const smallFinishes = summary.finishes - cells.reduce((sum, c) => sum + c.n, 0);
    const smallSum = smallYears.reduce((sum, year) => sum + (all.get(editionKey(city, year))?.eligible ?? 0), 0);
    // Only name the small editions when the shards account for exactly the finishes the course total adds to its rows.
    const small = smallFinishes > 0 ? { years: smallSum === smallFinishes ? smallYears : [], finishes: smallFinishes } : null;
    const terrains = cells.map((c) => all.get(editionKey(city, c.year))?.terrain).filter((t): t is TerrainSection[] => !!t);
    // Every edition of a city has the same supplied current route; show its sections only when the shards agree.
    const terrain = terrains.length && terrains.every((t) => JSON.stringify(t) === JSON.stringify(terrains[0])) ? terrains[0] : null;
    const weather = courses.weather.editions.filter((e) => e.city === city).sort((a, b) => a.year - b.year)
      .map((e) => ({ ...e, start: all.get(editionKey(city, e.year))?.start ?? null }));
    const dated = [...cells.map((c) => c.year), ...weather.map((w) => w.year)].map((year) => all.get(editionKey(city, year))).filter((ctx) => ctx && (ctx.date || ctx.start));
    const sources = [...new Map(weather.map((w) => all.get(editionKey(city, w.year))?.source).filter((x): x is { name: string; url: string } => !!x).map((x) => [x.url, x])).values()];
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
    const matched = courses.matched.find((b) => b.lo_s === MATCHED_BAND_LO_S) ?? null;
    built.set(slug, {
      city, slug, race: raceName(city, route, summary), display: city === 'New York' ? 'New York City' : city,
      summary, geometry: route, context, editions,
      copies: copies.filter((c) => c.city === city),
      small, terrain, weather,
      weatherMissing: courses.weather.excluded.filter((e) => e.city === city).map(({ year, reason }) => ({ year, reason })),
      datesUnverified: dated.some((ctx) => ctx?.startVerified === false),
      weatherSource: sources.length === 1 ? sources[0] : null,
      hotCool: hotCoolShown(courses.weather.hot_cool.find((h) => h.city === city), courses.weather.pairs.min_gap_c),
      minGapC: courses.weather.pairs.min_gap_c,
      slope: courses.weather.per_course_slopes.find((s) => s.city === city) ?? null,
      types: types ? { finishes: types.finishes, editions: types.editions, shares: types.shares } : null,
      archetypes: archetypes.archetypes.map(({ name, slug: s, share }) => ({ name, slug: s, share })),
      startOffset: courses.shape_cohort.start_offset_editions.filter((e) => e.city === city).map(({ year, finishes, median_gap_points }) => ({ year, finishes, median_gap_points })),
      grid: (goal?.screens?.grid ?? []).filter((e) => e.city === city).map((e) => ({ year: e.year, finishes: e.finishes ?? 0, reason: e.reason ?? '' })),
      goals,
      goalsScreened: goal && !context ? screenedReason(city, goal.screens) : fewEditions,
      goalMethod: goal ? { tolerance: goal.tolerance, minEditionFinishes: goal.min_edition_finishes, minEditions: goal.min_editions } : null,
      matched: matched && matched.courses.some((c) => c.city === city) ? matched : null,
      exclusions: policy.filter((e) => e.city === city).map(({ year, category, reason }) => ({ year, category, reason })).sort((a, b) => a.year - b.year),
      profileN: getIndividualCourseAnswer(city)?.dataset?.n ?? null,
      scopes: {
        band: bandSlugs.has(slug), projector: projectorSlugs.has(slug), weather: weatherSlugs.has(slug), plan: planCities.has(city), analyses: analysisCities.has(city),
        compare: compareCities.has(city), hills: analysisCities.has(city) && !!route,
      },
      qualifyingKey: qualifyingKeyForCity(city),
      months: months.get(city) ?? [],
      neighbours: alphabeticalNeighbours(names, city),
      sameMonth: sameMonthCourses(months, city),
    });
  }
  pages = built;
  return built;
}

export const coursePage = (slug: string): CoursePageData | null => coursePages().get(slug) ?? null;
