/**
 * Route policy for search engines: the single source used by app/sitemap.ts, page metadata
 * (through lib/seo.tsx) and scripts/verify-seo.cjs. Server-only: it reads the published data files.
 * Every list here is derived from the same registries the pages are built from, so the sitemap
 * cannot name a route that was not built. See docs/SEO.md.
 */
import { STORIES } from './stories';
import { TOOLS } from './tools/registry';
import { VERIFIED_AT } from './tools/qualifying';
import { TEN_ANALYSES, type AnalysisId } from './ten-analyses';
import { getWeatherAnalyses, getWeatherEvidence } from './weather-data';
import { getFastStartStarts } from './fast-start-server';
import { getAllFinisherContextStart } from './all-finisher-context-server';
import { getCourseNames, slugifyCity } from './course-data';
import { QUESTIONS, questionForPack } from './question-catalog';
import { getExtensions, extensionForPack, extensionForQuestion } from './extension-data';
import { PACK_REPLACEMENTS, getStudyEvidence } from './research-data';
import { PACK_IDS } from './packs';
import { broaderArchive } from './broader-analysis-catalog';
import { getPersonalSummary } from './personalized-data';
import { getInsightsManifest } from './insights-server';
import type { ExtraPage } from './seo-pages/types';
import { PACE_PAGES } from './seo-pages/pace';
import { QUALIFYING_PAGES } from './seo-pages/qualifying';
import { FINISH_TIME_PAGES } from './seo-pages/finish-times';

/** The one production host. Canonicals, Open Graph URLs, the sitemap and JSON-LD all use it. */
export const SITE_URL = 'https://splithappens.run';

/** Pages that carry `noindex, follow`, have no canonical and stay out of the sitemap. */
export const NOINDEX: readonly string[] = ['/runners', '/your-race', '/request-analysis', '/htw', '/packs/smyth_htw'];

/**
 * Research-archive pages too thin to index: four say the current release cannot answer the question,
 * and rn1/rn4 are short single-chart summaries (under 170 words) covered better elsewhere.
 */
export const THIN_PACKS: readonly string[] = ['p3_race_week_weather', 'p4_even_effort_gap', 'r16_groups_hold_or_fall', 'r33_start_congestion', 'rn1_wall_severity', 'rn4_reference_dependence'];

/** robots.txt keeps crawlers out of the two folders that hold recorded runner names. Everything else stays crawlable. */
export const ROBOTS_DISALLOW: readonly string[] = ['/data/runners/index/', '/data/runners/profiles/'];

/**
 * Hand-kept dates for pages whose main content is written text rather than data.
 * Change the date when the visible content of that page changes in a meaningful way.
 * Pages without an entry (and without data) get no lastmod, which is better than a wrong one.
 */
export const CONTENT_DATES: Readonly<Record<string, string>> = {
  '/': '2026-10-08',
  '/about': '2026-10-07',
  '/methodology': '2026-10-08',
  '/stories': '2026-10-08',
  '/tools': '2026-10-08',
  '/tools/pace-calculator': '2026-10-08',
  '/analyses': '2026-10-08',
  '/courses': '2026-10-08',
  '/packs': '2026-10-08',
  '/slowdown': '2026-10-08',
  '/research/personalized': '2026-10-08',
  '/privacy': '2026-10-08',
};

export type SitemapEntry = { path: string; lastmod?: string };

/**
 * New content pages register in their own module under lib/seo-pages/ (pace, qualifying, finish-times), collected here.
 * `lastmod` is a YYYY-MM-DD date or a function returning one at build time, e.g.
 * `{ path: '/finish-times', lastmod: () => dataDate('insights') }`. Leave it out when unknown.
 * Every path must be clean, indexable and its own canonical, or the sitemap build throws.
 */
export const EXTRA_SITEMAP_PAGES: ExtraPage[] = [...PACE_PAGES, ...QUALIFYING_PAGES, ...FINISH_TIME_PAGES];

// ---------- Paths ----------

/** Throws unless the path is a clean site path: leading slash, no query, no fragment, no trailing slash. */
export function assertCleanPath(path: string): string {
  if (typeof path !== 'string' || !path.startsWith('/') || /[?#]/.test(path) || (path.length > 1 && path.endsWith('/')) || /\s/.test(path)) {
    throw new Error(`SEO paths must be clean site paths without ? or #: ${JSON.stringify(path)}`);
  }
  return path;
}

/** Absolute URL on the production host. The root is the bare origin, as Next.js writes it for canonicals. */
export function absoluteUrl(path: string): string {
  assertCleanPath(path);
  return path === '/' ? SITE_URL : SITE_URL + path;
}

// ---------- Research archive (packs) ----------

const own = (map: Readonly<Record<string, string>>, key: string) => Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;

/** Every pack id that has a page under /packs, matching app/packs/[packId] plus the smyth_htw page. */
export function packRouteIds(): string[] {
  return [...new Set([...PACK_IDS, ...QUESTIONS.map(question => question.id), ...getExtensions().map(pack => pack.id)])];
}

/**
 * The pack whose page is the original for this pack id: the id itself for the primary pages,
 * the primary id for aliases (s*, ext_*, rn3, p1, p2), and null for thin, legacy or unknown pages
 * (those are noindex). Derived from QUESTIONS aliases, each extension's question_id and PACK_REPLACEMENTS.
 */
export function packCanonical(id: string): string | null {
  if (id === 'smyth_htw' || THIN_PACKS.includes(id) || !packRouteIds().includes(id)) return null;
  const question = questionForPack(id);
  if (question) return THIN_PACKS.includes(question.id) ? null : question.id;
  const extension = extensionForPack(id);
  if (extension) {
    const target = questionForPack(extension.questionId)?.id ?? null;
    return target && !THIN_PACKS.includes(target) ? target : null;
  }
  const replacement = own(PACK_REPLACEMENTS, id);
  if (replacement) return THIN_PACKS.includes(replacement) ? null : packCanonical(replacement);
  return null;
}

/** The primary (self-canonical, indexable) pack ids, in QUESTIONS order. */
export function primaryPackIds(): string[] {
  return QUESTIONS.map(question => question.id).filter(id => packCanonical(id) === id);
}

// ---------- Route policy ----------

/** True when the page must carry noindex (NOINDEX paths, thin packs, smyth_htw and unknown pack ids). */
export function isNoindex(path: string): boolean {
  assertCleanPath(path);
  if (NOINDEX.includes(path)) return true;
  const pack = /^\/packs\/([^/]+)$/.exec(path);
  return pack ? packCanonical(pack[1]) === null : false;
}

/** True when the page may be indexed. Pack aliases are indexable but canonicalise to their primary page. */
export function isIndexable(path: string): boolean {
  return !isNoindex(path);
}

/** The canonical path a page should declare, or null when it is noindex and declares none. */
export function canonicalPathFor(path: string): string | null {
  if (isNoindex(path)) return null;
  const pack = /^\/packs\/([^/]+)$/.exec(path);
  return pack ? '/packs/' + packCanonical(pack[1]) : path;
}

// ---------- Honest lastmod dates ----------

/** The kinds of published data a page can show; each has one as_of date. */
export type DataSource = 'insights' | 'study' | 'weather' | 'personalized' | 'fastStart' | 'allFinisher' | 'qualifying';

/** UTC calendar date (YYYY-MM-DD) of an ISO timestamp or date. Throws on anything unparsable. */
function day(value: string | undefined | null): string {
  const time = typeof value === 'string' ? Date.parse(value) : NaN;
  if (!Number.isFinite(time)) throw new Error(`Unparsable data date: ${JSON.stringify(value)}`);
  return new Date(time).toISOString().slice(0, 10);
}

const latest = (...dates: (string | undefined)[]) => dates.filter((date): date is string => !!date).sort().pop();

/** The as_of date of the data a page shows, read from the same verified files the page reads. */
export function dataDate(source: DataSource): string {
  switch (source) {
    case 'insights': return day(getInsightsManifest().as_of);
    case 'study': {
      const study = getStudyEvidence();
      if (!study) throw new Error('The supporting study is missing.');
      return day(study.as_of);
    }
    case 'weather': return day(getWeatherEvidence().as_of);
    case 'personalized': {
      const summary = getPersonalSummary();
      if (!summary) throw new Error('The personalized guide summary is missing.');
      return day(summary.as_of);
    }
    case 'fastStart': {
      const starts = getFastStartStarts();
      return latest(day(starts.all.as_of), day(starts.history.as_of))!;
    }
    case 'allFinisher': return day(getAllFinisherContextStart().as_of);
    case 'qualifying': return day(VERIFIED_AT);
  }
}

/** The newest as_of among the data a primary pack page shows (its extension pack, plus any broader single-race view). */
export function packDate(id: string): string | undefined {
  const extension = extensionForQuestion(id) ?? extensionForPack(id);
  const broader = broaderArchive(id);
  return latest(extension ? day(extension.asOf) : undefined, broader ? dataDate(broader.kind === 'opening' ? 'fastStart' : 'allFinisher') : undefined);
}

/** Which data each of the ten analyses shows (see app/analyses/[slug]/page.tsx). */
const ANALYSIS_SOURCES: Record<AnalysisId, DataSource[]> = {
  profile: ['personalized'], opening: ['fastStart'], checkpoint: ['personalized'], sections: ['personalized'],
  courses: ['allFinisher', 'personalized'], weather: ['allFinisher', 'personalized'], terrain: ['personalized'],
  ambition: ['personalized'], gains: ['personalized'], age: ['personalized'],
};

/** Every date a sitemap lastmod may take: the data as_of dates, the pack dates, CONTENT_DATES and the registered extra pages' dates. */
export function allSourceDates(): string[] {
  const sources: DataSource[] = ['insights', 'study', 'weather', 'personalized', 'fastStart', 'allFinisher', 'qualifying'];
  const extras = EXTRA_SITEMAP_PAGES.map(page => typeof page.lastmod === 'function' ? page.lastmod() : page.lastmod);
  return [...new Set([...sources.map(dataDate), ...packRouteIds().map(packDate), ...Object.values(CONTENT_DATES), ...extras].filter((date): date is string => !!date))].sort();
}

// ---------- Sitemap ----------

/** The indexable, self-canonical pages, each with an honest lastmod or none. Order: home, stories, tools, analyses, courses, packs, other pages, extras. */
export function sitemapEntries(): SitemapEntry[] {
  const dates = new Map<DataSource, string>();
  const at = (source: DataSource) => { if (!dates.has(source)) dates.set(source, dataDate(source)); return dates.get(source)!; };
  const entries: SitemapEntry[] = [];
  const add = (path: string, ...sources: (DataSource | 'content')[]) => {
    const lastmod = latest(...sources.map(source => source === 'content' ? own(CONTENT_DATES, path) : at(source)));
    entries.push(lastmod ? { path, lastmod } : { path });
  };
  const manifest = getInsightsManifest();

  add('/', 'content', 'insights', 'study', 'personalized');

  add('/stories', 'content', 'insights');
  for (const story of STORIES.filter(s => manifest.files[s.file])) add(`/stories/${story.slug}`, 'insights');

  add('/tools', 'content', 'insights');
  for (const tool of TOOLS.filter(t => !t.file || manifest.files[t.file])) {
    const path = `/tools/${tool.slug}`;
    if (tool.slug === 'qualifying') add(path, 'qualifying');
    else if (tool.file) add(path, 'insights');
    else add(path, 'content');
  }

  add('/analyses', 'content');
  for (const analysis of TEN_ANALYSES) add(`/analyses/${analysis.slug}`, ...ANALYSIS_SOURCES[analysis.id]);
  for (const weather of getWeatherAnalyses()) add(`/analyses/${weather.slug}`, 'weather');
  add('/analyses/downhill-start', 'allFinisher');

  add('/courses', 'content', 'insights');
  const coursePack = extensionForQuestion('s3_course_breaks');
  for (const city of getCourseNames()) {
    const lastmod = latest(at('insights'), coursePack ? day(coursePack.asOf) : undefined);
    entries.push({ path: `/courses/${slugifyCity(city)}`, ...(lastmod ? { lastmod } : {}) });
  }

  add('/packs', 'content');
  for (const id of primaryPackIds()) {
    const lastmod = packDate(id);
    entries.push({ path: `/packs/${id}`, ...(lastmod ? { lastmod } : {}) });
  }

  add('/about', 'content', 'personalized', 'weather');
  add('/methodology', 'content', 'study');
  add('/slowdown', 'content', 'study');
  add('/research/personalized', 'content', 'personalized');
  add('/privacy');

  for (const extra of EXTRA_SITEMAP_PAGES) {
    const lastmod = typeof extra.lastmod === 'function' ? extra.lastmod() : extra.lastmod;
    if (lastmod !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(lastmod)) throw new Error(`Sitemap lastmod must be YYYY-MM-DD: ${extra.path}`);
    entries.push(lastmod ? { path: extra.path, lastmod } : { path: extra.path });
  }

  const seen = new Set<string>();
  for (const { path } of entries) {
    if (seen.has(path)) throw new Error(`Duplicate sitemap path: ${path}`);
    seen.add(path);
    if (canonicalPathFor(path) !== path) throw new Error(`Sitemap paths must be indexable and their own canonical: ${path}`);
  }
  return entries;
}
