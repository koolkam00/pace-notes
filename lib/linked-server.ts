/**
 * Server loaders for the linked-records family (`public/data/linked/`, contract docs/LINKED_RECORDS.md), bound to the
 * family's manifest as other families bind theirs: the manifest names the adopted release (analysis/release.json), and
 * every file read must have the bytes and sha256 the manifest lists. A file that differs is an error at build time,
 * never a silent fallback to another file.
 *
 * linkedEditionReading() is the one call other pages make (a course page's edition table, a race report): the verdict
 * of an edition as words, under the file's own guard (docs/LINKED_RECORDS.md "Fast years and slow years"), recomputed
 * here from the published numbers. It gives nothing (null) for an edition without a verdict, under a floor, held for
 * review, excluded by a review, not in the file, or not on chip or net times (the strict reading of D22: an edition on
 * gun times or with no stated basis is read only among its own kind, so a page leaves it out rather than set it beside
 * the race's chip-timed years). Words never carry a number, a cause or a rank.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import release from '@/analysis/release.json';
import type { LinkedEditionRow, LinkedEditions, LinkedEditionVerdict, LinkedFile, LinkedRaces, LinkedRead } from './linked-types';

const DIR = 'public/data/linked';

interface LinkedManifest {
  family: 'linked';
  schema_version: number;
  release_tag: string;
  files: Record<string, { bytes: number; sha256: string }>;
  [key: string]: unknown;
}

let manifestCache: LinkedManifest | null = null;
const fileCache = new Map<string, LinkedRead<unknown>>();

/** The family's manifest, checked against the adopted release. */
export function getLinkedManifest(): LinkedManifest {
  if (manifestCache) return manifestCache;
  const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), DIR, 'manifest.json'), 'utf8')) as LinkedManifest;
  if (manifest.family !== 'linked' || manifest.schema_version !== 1) throw new Error('lib/linked-server.ts: public/data/linked/manifest.json is not the linked family, schema 1.');
  if (manifest.release_tag !== release.tag) throw new Error(`lib/linked-server.ts: the linked family was built on ${manifest.release_tag}, not the adopted release ${release.tag}.`);
  manifestCache = manifest;
  return manifest;
}

/** One family file, read only if its bytes and sha256 are the manifest's. */
export function readLinked<T>(file: LinkedFile): LinkedRead<T> {
  const cached = fileCache.get(file);
  if (cached) return cached as LinkedRead<T>;
  const bound = getLinkedManifest().files[file];
  if (!bound) throw new Error(`lib/linked-server.ts: the manifest does not list ${file}.`);
  const bytes = fs.readFileSync(path.join(process.cwd(), DIR, file));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (bytes.length !== bound.bytes || sha256 !== bound.sha256) throw new Error(`lib/linked-server.ts: ${file} is not the file the linked manifest binds (run node scripts/verify-linked.cjs).`);
  const data = JSON.parse(bytes.toString('utf8')) as T & { family?: string; file?: string; schema_version?: number };
  if (data.family !== 'linked' || data.file !== file || data.schema_version !== 1) throw new Error(`lib/linked-server.ts: ${file} does not name itself as the linked family's ${file}, schema 1.`);
  const read = { data: data as T, bytes: bytes.length, sha256 };
  fileCache.set(file, read);
  return read;
}

export const getLinkedEditions = () => readLinked<LinkedEditions>('editions.json');
export const getLinkedRaces = () => readLinked<LinkedRaces>('races.json');

// ---- The verdict of an edition, as words

/** The words of each edition verdict. "Linked runners" follows a first mention of "runners whose records are linked by name". */
export const LINKED_YEAR_WORDS: Readonly<Record<LinkedEditionVerdict, string>> = {
  slow: 'a slow year for linked runners',
  fast: 'a fast year for linked runners',
  usual: 'a usual year for linked runners',
};
/** What every linked figure says once (docs/LINKED_RECORDS.md "What may be said"). */
export const LINKED_BY_NAME = 'records linked by name';
/** Where an edition reading's words are explained, and where an edition a review released is listed with its evidence. */
export const LINKED_YEARS_HREF = '/stories/fast-and-slow-years';
export const LINKED_REVIEW_HREF = '/methodology#linked-reviews';

export interface LinkedEditionReading {
  verdict: LinkedEditionVerdict;
  /** "a slow year for linked runners", "a fast year …" or "a usual year …". */
  words: string;
  /** True for an edition a written review released from the hold (New York 2022 on this build): show it with a link to `reviewHref`. */
  reviewed: boolean;
  reviewHref: string;
  /** The story that reads this race's years, opened on the race. */
  href: string;
}

/**
 * The file's own guard for an edition verdict, recomputed from the row's numbers (docs/LINKED_RECORDS.md): floors of
 * `min_finishes` kept results and two other editions; `slow` when lo > margin and any high-links reading is above 0,
 * `fast` the mirror image, `usual` when the interval lies inside ±margin; otherwise null.
 */
export function linkedEditionGuard(row: LinkedEditionRow, { margin, minFinishes }: { margin: number; minFinishes: number }): LinkedEditionVerdict | null {
  if (!(row.finishes >= minFinishes) || !(row.others >= 2)) return null;
  const high = row.high_pct;
  if (row.lo_pct > margin && (high == null || high > 0)) return 'slow';
  if (row.hi_pct < -margin && (high == null || high < 0)) return 'fast';
  if (row.lo_pct > -margin && row.hi_pct < margin) return 'usual';
  return null;
}

/**
 * The verdict of one edition as words, or null (the page then states nothing about the year). `label` is the race
 * registry's label (the course page's `city`), `year` the edition's year. `series` is optional; where it is given it
 * must be the series the file names for that year (Warsaw: "Orlen Warsaw Marathon" to 2018, "PZU Warsaw Marathon"
 * from 2019), and a series given for a label that has none is an error.
 */
export function linkedEditionReading(label: string, year: number | string, series?: string | null): LinkedEditionReading | null {
  const { data } = getLinkedEditions();
  const row = data.races[label]?.[String(year)];
  if (!row) return null;
  if (series != null && row.series !== series) throw new Error(`lib/linked-server.ts: ${label} ${year} is in the series "${row.series ?? '(none)'}", not "${series}".`);
  const guard = linkedEditionGuard(row, { margin: data.margin_pct, minFinishes: data.min_finishes });
  if (guard !== row.verdict) throw new Error(`lib/linked-server.ts: the verdict of ${label} ${year} in editions.json (${row.verdict}) is not its guard's (${guard}).`);
  if (guard === null || row.basis !== 'chip_or_net') return null;
  return {
    verdict: guard,
    words: LINKED_YEAR_WORDS[guard],
    reviewed: row.reviewed_release === true,
    reviewHref: LINKED_REVIEW_HREF,
    href: `${LINKED_YEARS_HREF}?race=${encodeURIComponent(label)}`,
  };
}

/** The words alone: "a slow year for linked runners", or null. */
export const linkedEditionWords = (label: string, year: number | string, series?: string | null): string | null => linkedEditionReading(label, year, series)?.words ?? null;
