import fs from 'node:fs';
import path from 'node:path';
import { getPersonalSummary } from './personalized-data';
import { buildGuide, percentUnder } from './personalized';
import { EXAMPLE_PROFILE } from './analysis-profile';
import { MARATHON_SECTION_ENDS } from './section-labels';
import type { Profile } from './personalized-catalog';
import type { CheckpointData, CheckpointRow, CityData } from './personalized-types';
import { readInsight } from './insights-server';
import type { CourseGeometry } from './insights';
import { againstAverage, againstElsewhere, terrainReading, underWater } from './terrain-reading';

const TABLES = path.join(process.cwd(), 'public/data/packs/ext_personalized_guide/tables');
const cities = new Map<string, CityData>();
let checkpoints: CheckpointData | null = null;

function summary() {
  const value = getPersonalSummary();
  if (!value) throw new Error('The analysis summary is missing.');
  return value;
}

/**
 * The courses an explorer offers, in their own order: All courses and the courses with published comparisons, the
 * course pages' list. The all-finisher and fast-start files also hold courses that have no page (Melbourne, Tokyo…).
 */
export function publishedCourses(cities: string[]): string[] {
  const keep = new Set(summary().cities.map((row) => row.city));
  return cities.filter((city) => keep.has(city));
}

/** One course's comparison file (or All courses), read once per build. */
export function getCityData(city: string): CityData {
  const hit = cities.get(city);
  if (hit) return hit;
  const row = summary().cities.find(item => item.city === city);
  if (!row) throw new Error(`No comparison file for ${city}.`);
  const data = JSON.parse(fs.readFileSync(path.join(TABLES, row.file), 'utf8')) as CityData;
  if (data.city !== city) throw new Error(`The comparison file for ${city} names ${data.city}.`);
  cities.set(city, data);
  return data;
}

export function getAnalysisStart() {
  const s = summary();
  return { summary: s, answers: buildGuide(getCityData(EXAMPLE_PROFILE.city), s, EXAMPLE_PROFILE) };
}

/** The answers for one profile at build (a page whose default is not the all-course example). */
export function getAnalysisAnswers(profile: Profile) {
  const s = summary();
  return buildGuide(getCityData(profile.city), s, profile);
}

/** The all-course checkpoint shard, read once per build. */
function allCheckpoints(): CheckpointData {
  if (checkpoints) return checkpoints;
  const row = summary().cities.find(item => item.city === EXAMPLE_PROFILE.city)!;
  checkpoints = JSON.parse(fs.readFileSync(path.join(TABLES, row.checkpoint_file), 'utf8')) as CheckpointData;
  return checkpoints;
}

export type CushionPoint = { elapsed: number; n: number; share: number; median: number };

/**
 * Every 2-minute elapsed band at one mat for all courses, ages, recorded genders and recent-pace trends, with the share
 * of its finishes under the goal and its median finish: the curve the checkpoint page scrubs. Bands with fewer than 100
 * finishes, or none on either side of the goal, are left out.
 */
export function getCheckpointCurve(checkpoint = 30, goal = EXAMPLE_PROFILE.goal): CushionPoint[] {
  return allCheckpoints().rows
    .filter(r => r.checkpoint === checkpoint && r.trend === 'all' && r.age === 'all' && r.gender === 'all' && r.n >= 100)
    .map(r => ({ elapsed: r.elapsed, n: r.n, share: (percentUnder(r, goal) ?? NaN) / 100, median: r.finish[1] }))
    .filter(p => Number.isFinite(p.share))
    .sort((a, b) => a.elapsed - b.elapsed);
}

/** The checkpoint row the page opens on: the elapsed band holding even goal pace at the mat. */
export function getCheckpointDefault(checkpoint = 30, goal = EXAMPLE_PROFILE.goal): CheckpointRow | null {
  const band = Math.floor((goal * checkpoint) / 42.195 / 2) * 2;
  return allCheckpoints().rows.find(r => r.checkpoint === checkpoint && r.elapsed === band && r.trend === 'all' && r.age === 'all' && r.gender === 'all') ?? null;
}

export type TerrainSection = { end: number; gain: number; net: number; pace: number; pct: number; vs: number };

/** Every course combined: the median section paces of all finishes near the goal (the hills reading's baseline). */
export function terrainBaseline(goal = EXAMPLE_PROFILE.goal): number[] {
  return getCityData(EXAMPLE_PROFILE.city).cohorts['all|all|all']?.profiles[String(Math.round(goal / 15) * 15)]?.pace.map(p => p[1]) ?? [];
}

/** The baseline at every finish-time bucket, for the hills explorer (its comparison is always all ages and genders). */
export function terrainBaselines(): Record<string, number[]> {
  const profiles = getCityData(EXAMPLE_PROFILE.city).cohorts['all|all|all']?.profiles ?? {};
  return Object.fromEntries(Object.entries(profiles).map(([bucket, p]) => [bucket, p.pace.map(x => x[1])]));
}

/**
 * A course's sections for finishes near the goal: the supplied climb and net change of each 5 km section, the median
 * section pace, that pace against the finishes' own average (distance-weighted) and, `vs`, against the same section on
 * every course combined (lib/terrain-reading.ts). Null when either is missing.
 */
export function terrainSections(data: CityData, goal = EXAMPLE_PROFILE.goal): TerrainSection[] | null {
  const profile = data.cohorts['all|all|all']?.profiles[String(Math.round(goal / 15) * 15)];
  if (!profile || data.terrain.length !== MARATHON_SECTION_ENDS.length) return null;
  const paces = profile.pace.map(p => p[1]);
  const own = againstAverage(paces), vs = againstElsewhere(paces, terrainBaseline(goal));
  return MARATHON_SECTION_ENDS.map((end, i) => {
    const t = data.terrain.find(x => Math.abs(x.end - end) < 0.001);
    return { end, gain: t?.gain ?? NaN, net: t?.net ?? NaN, pace: paces[i], pct: own[i] ?? NaN, vs: vs[i] ?? NaN };
  });
}

/** The courses the hills page may draw: a supplied route profile at the release's step that does not read the water under a bridge. */
export function terrainProfiles(): Record<string, number[]> {
  const geometry = readInsight<{ courses: CourseGeometry[] }>('course-geometry.json').courses;
  const step = geometry[0]?.elevation_step_km ?? 0.5;
  return Object.fromEntries(geometry
    .filter(g => g.elevation_step_km === step && summary().cities.some(c => c.city === g.city) && !underWater(g.city, g.elevation_m, step))
    .map(g => [g.city, g.elevation_m.map(m => Math.round(m * 10) / 10)]));
}

/** The courses with a supplied profile that reads the water under a bridge: the hills page offers them nowhere. */
export function terrainHidden(): string[] {
  const geometry = readInsight<{ courses: CourseGeometry[] }>('course-geometry.json').courses;
  return geometry.filter(g => summary().cities.some(c => c.city === g.city) && underWater(g.city, g.elevation_m, g.elevation_step_km)).map(g => g.city);
}

/**
 * The course the hills page opens on, chosen by the data (never a city literal): of the courses it may draw (a supplied
 * route whose profile does not read the water under a bridge), the one whose climbing 5K ran slowest against the same 5K
 * on every course combined (terrainReading). `matched` is false when no course's climb ran slower by TERRAIN_GAP.
 */
export function getTerrainDefault(): { city: string; matched: boolean } {
  const drawn = terrainProfiles();
  const scored = summary().cities.filter(c => c.city !== EXAMPLE_PROFILE.city && drawn[c.city]).flatMap(c => {
    const sections = terrainSections(getCityData(c.city));
    const reading = sections ? terrainReading(sections.map(s => s.gain), sections.map(s => s.vs)) : null;
    return reading ? [{ city: c.city, vs: reading.vs, matched: reading.slower }] : [];
  });
  if (!scored.length) throw new Error('No course has a terrain profile with a climb.');
  const best = scored.reduce((a, b) => (b.vs > a.vs ? b : a));
  return { city: best.city, matched: best.matched };
}
