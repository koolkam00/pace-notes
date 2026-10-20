/**
 * Search and social metadata helpers. Server components only: finishesM() reads the verified data
 * manifest from disk. Route policy (what is indexed, canonical targets, the sitemap) lives in
 * lib/seo-routes.ts. See docs/SEO.md.
 */
import type { Metadata } from 'next';
import { getInsightsManifest } from './insights-server';
import { absoluteUrl, assertCleanPath, movedTo } from './seo-routes';
import { DEFAULT_OG_IMAGE, ogImageFor } from './og-paths';
import { chapterNumber, placeOf } from './chapters';

export { SITE_URL, absoluteUrl } from './seo-routes';
export { DEFAULT_OG_IMAGE } from './og-paths';

export const SITE_NAME = 'Pace Notes';
export const OG_LOCALE = 'en_US';
export const OG_IMAGE_SIZE = { width: 1200, height: 630 } as const;

/** Screened marathon finishes in the analysis cohort (insights manifest analysis_n), read at build time. */
export function finishesCount(): number {
  return getInsightsManifest().analysis_n;
}

/** The analysis cohort in millions with one decimal, e.g. "3.9". Use it for every "N.N million" in metadata. */
export function finishesM(): string {
  return (finishesCount() / 1e6).toFixed(1);
}

export type PageMetadataInput = {
  /** The full title, ending in " | Pace Notes" where it fits. Open Graph and X get it without that suffix. */
  title: string;
  description: string;
  /** This page's own clean path, e.g. '/tools/pace-band'. Throws on ? or #. */
  path: string;
  type?: 'website' | 'article';
  /** noindex, follow; no canonical link. Use for lib/seo-routes NOINDEX paths and the moved addresses' stubs. */
  noindex?: boolean;
  /** Another page that is the original; with noindex (a moved address's stub), only og:url names it. Defaults to `path`. */
  canonicalPath?: string;
  /** A 1200x630 image path; defaults to ogImageFor(canonical path). */
  image?: string;
  imageAlt?: string;
  /** Article dates (ISO 8601), used only when type is 'article'. */
  publishedTime?: string;
  modifiedTime?: string;
};

/**
 * Complete per-page metadata: title, description, canonical, Open Graph, X card and robots.
 * It returns the whole openGraph object on purpose, because a page-level openGraph replaces the layout's.
 */
export function pageMetadata({ title, description, path, type = 'website', noindex = false, canonicalPath, image, imageAlt, publishedTime, modifiedTime }: PageMetadataInput): Metadata {
  assertCleanPath(path);
  const canonical = assertCleanPath(canonicalPath ?? path);
  const url = absoluteUrl(canonical);
  const img = image ?? ogImageFor(canonical) ?? DEFAULT_OG_IMAGE;
  const socialTitle = title.replace(/\s*\|\s*Pace Notes\s*$/, '');
  const alt = imageAlt ?? socialTitle;
  const article = type === 'article' ? { ...(publishedTime ? { publishedTime } : {}), ...(modifiedTime ? { modifiedTime } : {}) } : {};
  return {
    title,
    description,
    ...(noindex ? {} : { alternates: { canonical: url } }),
    openGraph: {
      type, siteName: SITE_NAME, locale: OG_LOCALE, url, title: socialTitle, description,
      images: [{ url: img, ...OG_IMAGE_SIZE, alt }],
      ...article,
    },
    twitter: { card: 'summary_large_image', title: socialTitle, description, images: [{ url: img, alt }] },
    robots: noindex ? { index: false, follow: true } : { index: true, follow: true, 'max-image-preview': 'large' },
  };
}

/**
 * Metadata for a moved address's stub (components/MovedPage.tsx): noindex with no canonical link, and og:url naming the
 * page it moved to. Throws for a path lib/seo-routes.ts does not list as moved, so a stub cannot outlive its entry.
 */
export function movedMetadata(path: string, title: string, description: string): Metadata {
  const target = movedTo(path);
  if (!target) throw new Error(`${path} is not a moved address in lib/seo-routes.ts`);
  return pageMetadata({ title, description, path, noindex: true, canonicalPath: target.split('#')[0] });
}

/** A JSON-LD block. `<` is escaped so the data can never close the script element. */
export function JsonLd({ data }: { data: object | object[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />;
}

export type Crumb = [name: string, path?: string];

/** schema.org BreadcrumbList from [name, path] pairs; the last (current) item may leave out its path. */
export function breadcrumbs(items: Crumb[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, path], index) => ({ '@type': 'ListItem', position: index + 1, name, ...(path ? { item: absoluteUrl(path) } : {}) })),
  };
}

/**
 * The chapter crumb of a page in the race (the redesign spec, section 6.8): "Chapter 06 · The finish line", linked to the
 * contents, where every chapter is listed (a breadcrumb URL cannot carry the chapter's #anchor). Null outside the race.
 */
export function chapterCrumb(path: string): Crumb | null {
  const place = placeOf(path);
  return place ? [`Chapter ${chapterNumber(place.chapter)} · ${place.chapter.title}`, '/research'] : null;
}

/**
 * A page's breadcrumbs: Pace Notes › its chapter (when it is in the race) › its parents › the page. `section` stands in for
 * the chapter on a page outside the race (["Runner tools", "/tools"]), so every page keeps a second crumb.
 */
export function pageCrumbs(path: string, name: string, { section, parents = [] }: { section?: Crumb; parents?: Crumb[] } = {}) {
  const chapter = chapterCrumb(path) ?? section;
  return breadcrumbs([['Pace Notes', '/'], ...(chapter ? [chapter] : []), ...parents, [name]]);
}
