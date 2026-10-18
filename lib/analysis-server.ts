import fs from 'node:fs';
import path from 'node:path';
import { getPersonalSummary } from './personalized-data';
import { buildGuide, percentUnder } from './personalized';
import { EXAMPLE_PROFILE } from './analysis-profile';
import { MARATHON_SECTION_ENDS } from './section-labels';
import type { Profile } from './personalized-catalog';
import type { CheckpointData, CheckpointRow, CityData } from './personalized-types';

const TABLES = path.join(process.cwd(), 'public/data/packs/ext_personalized_guide/tables');
const cities = new Map<string, CityData>();
let checkpoints: CheckpointData | null = null;

function summary() {
  const value = getPersonalSummary();
  if (!value) throw new Error('The analysis summary is missing.');
  return value;
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

export type TerrainSection = { end: number; gain: number; net: number; pace: number; pct: number };

/**
 * A course's sections for finishes near the goal: the supplied climb and net change of each 5 km section, the median
 * section pace and that pace against the finishes' own average (distance-weighted). Null when either is missing.
 */
export function terrainSections(data: CityData, goal = EXAMPLE_PROFILE.goal): TerrainSection[] | null {
  const profile = data.cohorts['all|all|all']?.profiles[String(Math.round(goal / 15) * 15)];
  if (!profile || data.terrain.length !== MARATHON_SECTION_ENDS.length) return null;
  const lengths = MARATHON_SECTION_ENDS.map((end, i) => end - (i ? MARATHON_SECTION_ENDS[i - 1] : 0));
  const total = lengths.reduce((s, l) => s + l, 0);
  const mean = profile.pace.reduce((s, p, i) => s + p[1] * lengths[i], 0) / total;
  return MARATHON_SECTION_ENDS.map((end, i) => {
    const t = data.terrain.find(x => Math.abs(x.end - end) < 0.001);
    return { end, gain: t?.gain ?? NaN, net: t?.net ?? NaN, pace: profile.pace[i][1], pct: (profile.pace[i][1] / mean - 1) * 100 };
  });
}

/**
 * The course the hills page opens on, chosen by the data (never a city literal): of the courses whose biggest-climbing
 * 5 km section is also their slowest for finishes near 4:00, the one that climbs the most in all. When no course has
 * both in one section, the course that climbs the most, and `matched` is false.
 */
export function getTerrainDefault(): { city: string; matched: boolean } {
  const scored = summary().cities.filter(c => c.city !== EXAMPLE_PROFILE.city).flatMap(c => {
    const sections = terrainSections(getCityData(c.city));
    if (!sections || sections.some(s => !Number.isFinite(s.gain))) return [];
    const climb = sections.reduce((a, b) => (b.gain > a.gain ? b : a));
    const slow = sections.reduce((a, b) => (b.pace > a.pace ? b : a));
    return [{ city: c.city, total: sections.reduce((s, x) => s + x.gain, 0), matched: climb.end === slow.end }];
  });
  if (!scored.length) throw new Error('No course has a terrain profile.');
  const pool = scored.some(s => s.matched) ? scored.filter(s => s.matched) : scored;
  const best = pool.reduce((a, b) => (b.total > a.total ? b : a));
  return { city: best.city, matched: best.matched };
}
