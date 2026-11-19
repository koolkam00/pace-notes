/**
 * The nugget core (the redesign spec, section 5): the site totals every surface counts from, and the helpers that turn a
 * nugget into the words a page shows. Server only: it reads the verified manifests at build time.
 *
 * One surface uses one count family. The eligible family (finishes the analyses use, their cities and race-years) is
 * the default; the raw family (every result in the release) is for the data pages only. Never put the two side by side.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import release from '@/analysis/release.json';
import { getCohortManifest, getInsightsManifest, readInsight } from '@/lib/insights-server';
import type { Courses } from '@/lib/insights';
import type { UnitSystem } from '@/lib/units';
import { millions } from './format';
import type { Nugget, NuggetText } from './types';

/** One count of the race summary: editions, races, results and finishes (any of them, by the section). */
type RaceCount = { editions: number; races: number; results: number; finishes: number };
type SlowdownCount = { editions: number; races: number; finishes: number; sustained_slowdown: number; sustained_slowdown_pct: number };

/**
 * The marathon race list's summary (`public/data/races/summary.json`, the race-list builder's file; the lead's rulings
 * on SITE-CORE's plan, November 14, 2026). Only the fields the shared pages read are typed. `editions.total` and
 * `races.total` leave out the editions set aside as copies; `without_results` are editions the release names with no
 * recorded result.
 */
export type RaceSummary = {
  distance: 'marathon';
  counted: { editions: number; races: number; finishes: number; sustained_slowdown: number; sustained_slowdown_pct: number };
  editions: {
    total: { n: number; results: number; finishes: number };
    by_tier: Record<string, RaceCount>;
    by_split_tier: Record<string, RaceCount>;
    by_timing: Record<string, RaceCount>;
    by_use: Record<string, { editions: number; results: number }>;
    badge_verified: RaceCount;
    not_counted_by_category: Record<string, number>;
    without_results: { n: number };
  };
  races: { total: { n: number }; by_page: Record<string, number> };
  sensitivity: { verified_tiers_only: SlowdownCount; without_weaker_source_editions: SlowdownCount; by_tier: Record<string, SlowdownCount> };
  notes: { hold: RaceNote[]; release: RaceNote[] };
  duplicates: { editions_set_aside: number; results_set_aside: number };
};
export type RaceNote = { label: string; year: number; tier: string; note: string };
type RaceDirectory = { races: { years: [number, number] }[] };

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
let races: { key: string; summary: RaceSummary; directory: RaceDirectory } | undefined;

/**
 * The race summary and directory, read from the verified race list: the build stops unless the race list's manifest is
 * of the adopted release, both files have the digests it records, and the summary's counted editions, races and
 * finishes are the cohort manifest's (so a page that prints both families prints one release).
 */
export function raceFiles(): { summary: RaceSummary; directory: RaceDirectory } {
  const folder = path.join(process.cwd(), 'public/data/races');
  const manifestBytes = fs.readFileSync(path.join(folder, 'manifest.json'));
  const key = sha256(manifestBytes);
  if (races?.key === key) return races;
  const manifest = JSON.parse(manifestBytes.toString('utf8')) as { release_tag: string; distance: string; files: Record<string, { sha256: string }> };
  if (manifest.release_tag !== release.tag || manifest.distance !== 'marathon') throw new Error('The race list must be of the adopted marathon release.');
  const file = (name: string) => {
    const bytes = fs.readFileSync(path.join(folder, name));
    if (sha256(bytes) !== manifest.files[name]?.sha256) throw new Error(`public/data/races/${name} differs from the race list's manifest.`);
    return JSON.parse(bytes.toString('utf8'));
  };
  const summary = file('summary.json') as RaceSummary;
  const directory = file('directory.json') as RaceDirectory;
  const cohort = getCohortManifest().manifest;
  const counted = cohort.editions.filter((e) => e.use === 'counted');
  if (summary.counted.finishes !== cohort.eligible_records || summary.counted.editions !== counted.length || summary.counted.races !== new Set(counted.map((e) => e.city)).size) {
    throw new Error('The race summary’s counted editions disagree with the marathon cohort.');
  }
  if (directory.races.length !== summary.races.total.n) throw new Error('The race directory and its summary disagree on the races.');
  races = { key, summary, directory };
  return races;
}

export type SiteTotals = {
  /** Every written marathon result in the adopted release (the raw family): the cohort manifest's `raw_records`. */
  results: number;
  /** Eligible finishes: the cohort every analysis and story counts from. */
  finishesEligible: number;
  /** Races with eligible finishes (the race summary's counted races; the course list holds one course for each). */
  cities: number;
  /** Race-years (one race in one year) with eligible finishes. */
  raceYears: number;
  firstYear: number;
  lastYear: number;
  /**
   * The raw family, for the data pages: the races, editions and years of the race list (every marathon with a recorded
   * result in the release, less the editions set aside as copies), whether or not an analysis may read its edition.
   */
  raw: { cities: number; raceYears: number; firstYear: number; lastYear: number };
};

let cached: { key: string; totals: SiteTotals } | undefined;

/**
 * The site totals from the marathon cohort's manifest, the race summary and the verified insights manifest (until
 * November 19, 2026 the raw family was counted from the cohort manifest's edition list, which also holds the two
 * editions set aside as copies). Throws when they disagree.
 */
export function siteTotals(): SiteTotals {
  const insights = getInsightsManifest();
  const { summary, directory } = raceFiles();
  const key = `${insights.release_tag}:${insights.as_of}:${insights.runner_manifest_sha256}`;
  if (cached?.key === key) return cached.totals;
  // getInsightsManifest has checked that the story data names this exact cohort manifest and its release.
  const cohort = getCohortManifest().manifest;
  if (cohort.eligible_records !== insights.analysis_n || insights.cohort.eligible !== insights.analysis_n || summary.counted.finishes !== insights.analysis_n) throw new Error('Site totals: eligible finishes disagree between the manifests.');
  const courses = readInsight<Courses>('courses.json');
  const years = courses.courses.flatMap((c) => c.years);
  const editions = courses.courses.reduce((sum, c) => sum + c.years.length, 0);
  if (courses.courses.length !== summary.counted.races || insights.cohort.cities !== summary.counted.races || editions !== summary.counted.editions || insights.cohort.editions !== summary.counted.editions) {
    throw new Error('Site totals: the course list, the insights manifest and the race summary disagree on the counted races and editions.');
  }
  const rawYears = directory.races.flatMap((r) => r.years);
  const totals: SiteTotals = {
    results: cohort.raw_records,
    finishesEligible: summary.counted.finishes,
    cities: summary.counted.races,
    raceYears: summary.counted.editions,
    firstYear: Math.min(...years),
    lastYear: Math.max(...years),
    raw: { cities: summary.races.total.n, raceYears: summary.editions.total.n, firstYear: Math.min(...rawYears), lastYear: Math.max(...rawYears) },
  };
  cached = { key, totals };
  return totals;
}

/** Eligible finishes in millions with one decimal ("3.9"): the one "N million" on every surface. */
export function finishesM(): string {
  return millions(siteTotals().finishesEligible);
}

/** A nugget text in the reader's units (a units-aware text carries both). */
export function textFor(text: NuggetText, units: UnitSystem = 'mi'): string {
  return typeof text === 'string' ? text : text[units];
}

/** The sentence a page shows: the headline when the guard holds, otherwise the neutral fallback. */
export function sentenceOf(nugget: Pick<Nugget, 'guard' | 'headline' | 'fallback'>, units: UnitSystem = 'mi'): string {
  return textFor(nugget.guard ? nugget.headline : nugget.fallback, units);
}

/** The sentence without its accent marker, for aria-labels, metadata and share cards. */
export function plain(text: string): string {
  return text.replace(/\*([^*]+)\*/g, '$1');
}
