/**
 * The nugget core (the redesign spec, section 5): the site totals every surface counts from, and the helpers that turn a
 * nugget into the words a page shows. Server only: it reads the verified manifests at build time.
 *
 * One surface uses one count family. The eligible family (finishes the analyses use, their cities and race-years) is
 * the default; the raw family (every result in the release) is for the data pages only. Never put the two side by side.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getInsightsManifest, readInsight } from '@/lib/insights-server';
import type { Courses } from '@/lib/insights';
import type { UnitSystem } from '@/lib/units';
import { millions } from './format';
import type { Nugget, NuggetText } from './types';

export type SiteTotals = {
  /** Every runner result in the adopted release (the raw family). */
  results: number;
  /** Eligible finishes: the cohort every analysis and story counts from. */
  finishesEligible: number;
  /** Cities with eligible finishes. */
  cities: number;
  /** Race-years (one city in one year) with eligible finishes. */
  raceYears: number;
  firstYear: number;
  lastYear: number;
  /** The raw family, for the data pages: cities, race-years and years of every result in the release. */
  raw: { cities: number; raceYears: number; firstYear: number; lastYear: number };
};

type RunnerManifest = { release_tag: string; raw_records: number; eligible_records: number; editions: { city: string; year: number }[] };

let cached: { key: string; totals: SiteTotals } | undefined;

/** The site totals from the runner manifest and the verified insights manifest. Throws when the two disagree. */
export function siteTotals(): SiteTotals {
  const insights = getInsightsManifest();
  const key = `${insights.release_tag}:${insights.as_of}:${insights.runner_manifest_sha256}`;
  if (cached?.key === key) return cached.totals;
  const runner = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/data/runners/manifest.json'), 'utf8')) as RunnerManifest;
  if (runner.release_tag !== insights.release_tag) throw new Error('Site totals: the runner and insights manifests name different releases.');
  if (runner.eligible_records !== insights.analysis_n || insights.cohort.eligible !== insights.analysis_n) throw new Error('Site totals: eligible finishes disagree between the manifests.');
  const courses = readInsight<Courses>('courses.json');
  const years = courses.courses.flatMap((c) => c.years);
  const editions = courses.courses.reduce((sum, c) => sum + c.years.length, 0);
  if (courses.courses.length !== insights.cohort.cities || editions !== insights.cohort.editions) throw new Error('Site totals: the course list disagrees with the cohort.');
  const rawYears = runner.editions.map((e) => e.year);
  const totals: SiteTotals = {
    results: runner.raw_records,
    finishesEligible: insights.analysis_n,
    cities: insights.cohort.cities,
    raceYears: insights.cohort.editions,
    firstYear: Math.min(...years),
    lastYear: Math.max(...years),
    raw: { cities: new Set(runner.editions.map((e) => e.city)).size, raceYears: runner.editions.length, firstYear: Math.min(...rawYears), lastYear: Math.max(...rawYears) },
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
