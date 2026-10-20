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
import { weatherHref } from './weather-catalog';
import { getFastStartStarts } from './fast-start-server';
import { getAllFinisherContextStart } from './all-finisher-context-server';
import { getCourseNames, slugifyCity } from './course-data';
import { QUESTIONS } from './question-catalog';
import { getExtensions, extensionForQuestion } from './extension-data';
import { getStudyEvidence } from './research-data';
import { PACK_IDS } from './packs';
import { getPersonalSummary } from './personalized-data';
import { getInsightsManifest } from './insights-server';
import type { ExtraPage } from './seo-pages/types';
import { PACE_PAGES } from './seo-pages/pace';
import { QUALIFYING_PAGES } from './seo-pages/qualifying';
import { FINISH_TIME_PAGES } from './seo-pages/finish-times';

const own = (map: Readonly<Record<string, string>>, key: string) => Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;

/** The one production host. Canonicals, Open Graph URLs, the sitemap and JSON-LD all use it. */
export const SITE_URL = 'https://splithappens.run';

/**
 * Pages that carry `noindex, follow`, have no canonical and stay out of the sitemap. The moved addresses below are noindex
 * too (isNoindex). /your-race is listed here as well as there: verify-seo holds it, with /runners, as a personal page.
 */
export const NOINDEX: readonly string[] = ['/runners', '/your-race', '/request-analysis', '/report'];

// ---------- Moved addresses ----------

/**
 * Addresses that moved, and where each went (the redesign spec, sections 00 and 2.9). Vercel answers each with a 308 from
 * vercel.json, so a visitor there never sees the old page. The noindex stub kept at each (components/MovedPage.tsx) is for
 * the GitHub Pages build, which cannot redirect: it names the new place, links to it and forwards in the browser, keeping
 * the query, and the hash when the target names none (as a 308 does). scripts/verify-seo.cjs checks vercel.json against
 * movedTo() for every stub and keeps every moved address out of the sitemap and out of the site's own links.
 *
 * The research archive (/packs and every /packs/<id>) closed on October 17, 2026 (section 00, cut 1): its data files stay
 * published under public/data/packs and are listed at /methodology#downloads.
 */
const MOVED: Readonly<Record<string, string>> = {
  '/htw': '/slowdown',
  '/packs/smyth_htw': '/slowdown',
  '/packs': '/methodology#downloads',
  '/research/personalized': '/research',
};

/**
 * Moved addresses with no 308: /your-race forwards old #guide-* links in the browser, and a redirect would drop the hash
 * before the page could read it. Its stub is the page.
 */
export const FORWARD_ONLY: Readonly<Record<string, string>> = { '/your-race': '/research' };

/** Where a moved address went (a path, possibly with a #tab or #section), or null for a page that did not move. */
export function movedTo(path: string): string | null {
  assertCleanPath(path);
  const fixed = own(MOVED, path) ?? own(FORWARD_ONLY, path);
  if (fixed) return fixed;
  // Every research-archive question page, whatever its id (vercel.json's /packs/:id* rule).
  if (/^\/packs\/[^/]+$/.test(path)) return '/methodology#downloads';
  const analysis = /^\/analyses\/([^/]+)$/.exec(path);
  const weather = analysis && getWeatherAnalyses().find((item) => item.slug === analysis[1]);
  // The weather questions that became tabs of race-day weather (their own pages are stubs): lib/weather-catalog.ts.
  return weather ? weatherHref(weather) : null;
}

/** The former research-archive question pages, each now a stub (app/packs/[packId]): every registry, question and extension id. */
export function movedPackIds(): string[] {
  return [...new Set([...PACK_IDS, ...QUESTIONS.map((question) => question.id), ...getExtensions().map((pack) => pack.id)])].filter((id) => id !== 'smyth_htw');
}

/** Every moved address that keeps a stub page in the export. */
export function movedPages(): string[] {
  return [...Object.keys(MOVED), ...Object.keys(FORWARD_ONLY), ...movedPackIds().map((id) => `/packs/${id}`), ...getWeatherAnalyses().map((item) => `/analyses/${item.slug}`)];
}

/**
 * Where an old personalized-guide link (#guide-<question>) goes now: the analysis that answers that question, keyed by the
 * hash without its '#'. The stubs at /research/personalized and /your-race forward with it (components/LegacyAnalysisLink).
 * The guide's other questions (returning to a course) have no page of their own and go to the stub's target.
 */
export function guideTargets(): Record<string, string> {
  return Object.fromEntries([...TEN_ANALYSES.map((item) => [`guide-${item.id}`, `/analyses/${item.slug}`]), ['guide-downhill', '/analyses/downhill-start']]);
}

/** robots.txt keeps crawlers out of the two folders that hold recorded runner names. Everything else stays crawlable. */
export const ROBOTS_DISALLOW: readonly string[] = ['/data/runners/index/', '/data/runners/profiles/'];

/**
 * Hand-kept dates for pages whose main content is written text rather than data.
 * Change the date when the visible content of that page changes in a meaningful way.
 * Pages without an entry (and without data) get no lastmod, which is better than a wrong one.
 * Story pages also show data: their lastmod is the later of this date and their data date,
 * so an entry here only matters when their wording changed after the data did.
 */
export const CONTENT_DATES: Readonly<Record<string, string>> = {
  // The redesign (October 18, 2026) rewrote every hub, story and info page: each opens on its reading now, its beats
  // were cut to the findings, and the chapter crumbs and closing stack are new. October 19: the chapter leads, keys and
  // story copy were edited again (round 2, part A), and each page's tables moved into one "All numbers" row; the tools
  // open answer first with short H1s, the analyses' H1s became one clause and /courses opens on its list (part B).
  '/': '2026-10-19',
  '/research': '2026-10-19',
  '/about': '2026-10-19',
  '/methodology': '2026-10-19',
  '/stories': '2026-10-19',
  '/tools': '2026-10-19',
  '/tools/pace-calculator': '2026-10-19',
  '/analyses': '2026-10-19',
  '/courses': '2026-10-19',
  '/slowdown': '2026-10-19',
  '/privacy': '2026-10-19',
  '/stories/pacing-types': '2026-10-19',
  '/stories/round-numbers': '2026-10-19',
  '/stories/race-replay': '2026-10-19',
  '/stories/places': '2026-10-19',
  '/stories/final-kick': '2026-10-19',
  '/stories/courses': '2026-10-19',
  '/stories/who-holds-pace': '2026-10-19',
  '/stories/race-morning': '2026-10-19',
};

export type SitemapEntry = { path: string; lastmod?: string };

/** The course pages (/courses/<slug>) were rewritten on this date; their lastmod is the later of it and their data's. */
export const COURSE_PAGES_WRITTEN = '2026-10-19';

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

// ---------- Route policy ----------

/** True when the page must carry noindex: the NOINDEX pages and every moved address's stub. */
export function isNoindex(path: string): boolean {
  assertCleanPath(path);
  return NOINDEX.includes(path) || movedTo(path) !== null;
}

/** True when the page may be indexed. */
export function isIndexable(path: string): boolean {
  return !isNoindex(path);
}

/** The canonical path a page should declare: itself, or null when it is noindex and declares none. */
export function canonicalPathFor(path: string): string | null {
  return isNoindex(path) ? null : path;
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

/** Which data each of the ten analyses shows (see app/analyses/[slug]/page.tsx). */
const ANALYSIS_SOURCES: Record<AnalysisId, DataSource[]> = {
  profile: ['personalized'], opening: ['fastStart'], checkpoint: ['personalized'], sections: ['personalized'],
  courses: ['allFinisher', 'personalized'], weather: ['allFinisher', 'personalized'], terrain: ['personalized'],
  ambition: ['personalized'], gains: ['personalized'], age: ['personalized'],
};

/** Every date a sitemap lastmod may take: the data as_of dates, the course pack's date, CONTENT_DATES, COURSE_PAGES_WRITTEN and the registered extra pages' dates. */
export function allSourceDates(): string[] {
  const sources: DataSource[] = ['insights', 'study', 'weather', 'personalized', 'fastStart', 'allFinisher', 'qualifying'];
  const extras = EXTRA_SITEMAP_PAGES.map(page => typeof page.lastmod === 'function' ? page.lastmod() : page.lastmod);
  const coursePack = extensionForQuestion('s3_course_breaks');
  return [...new Set([...sources.map(dataDate), coursePack ? day(coursePack.asOf) : undefined, ...Object.values(CONTENT_DATES), COURSE_PAGES_WRITTEN, ...extras].filter((date): date is string => !!date))].sort();
}

// ---------- Sitemap ----------

/**
 * The indexable, self-canonical pages, each with an honest lastmod or none. Order: home, the research hub, stories, tools,
 * analyses, courses, other pages, extras. A moved address is never listed: its stub is noindex.
 */
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
  add('/research', 'content', 'insights', 'study', 'weather');

  add('/stories', 'content', 'insights');
  for (const story of STORIES.filter(s => manifest.files[s.file])) add(`/stories/${story.slug}`, 'content', 'insights');

  add('/tools', 'content', 'insights');
  for (const tool of TOOLS.filter(t => !t.file || manifest.files[t.file])) {
    const path = `/tools/${tool.slug}`;
    if (tool.slug === 'qualifying') add(path, 'qualifying');
    else if (tool.file) add(path, 'insights');
    else add(path, 'content');
  }

  add('/analyses', 'content');
  for (const analysis of TEN_ANALYSES) add(`/analyses/${analysis.slug}`, ...ANALYSIS_SOURCES[analysis.id]);
  add('/analyses/downhill-start', 'allFinisher');

  add('/courses', 'content', 'insights');
  const coursePack = extensionForQuestion('s3_course_breaks');
  for (const city of getCourseNames()) {
    const lastmod = latest(at('insights'), coursePack ? day(coursePack.asOf) : undefined, COURSE_PAGES_WRITTEN);
    entries.push({ path: `/courses/${slugifyCity(city)}`, ...(lastmod ? { lastmod } : {}) });
  }

  add('/about', 'content', 'personalized', 'weather');
  add('/methodology', 'content', 'study');
  add('/slowdown', 'content', 'study');
  add('/privacy', 'content');

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
