/**
 * Search and social metadata helpers. Server components only: finishesM() reads the verified data
 * manifest from disk. Route policy (what is indexed, canonical targets, the sitemap) lives in
 * lib/seo-routes.ts. See docs/SEO.md.
 */
import type { Metadata } from 'next';
import { getInsightsManifest } from './insights-server';
import { absoluteUrl, assertCleanPath } from './seo-routes';
import { DEFAULT_OG_IMAGE, ogImageFor } from './og-paths';

export { SITE_URL, absoluteUrl } from './seo-routes';
export { DEFAULT_OG_IMAGE } from './og-paths';

export const SITE_NAME = 'Pace Notes';
export const OG_LOCALE = 'en_US';
export const OG_IMAGE_SIZE = { width: 1200, height: 630 } as const;

/** Screened marathon finishes in the analysis cohort (insights manifest analysis_n), read at build time. */
export function finishesCount(): number {
  return getInsightsManifest().analysis_n;
}

/** The analysis cohort in millions with one decimal, e.g. "3.4". Use it for every "N.N million" in metadata. */
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
  /** noindex, follow; no canonical link. Use for lib/seo-routes NOINDEX paths and THIN_PACKS. */
  noindex?: boolean;
  /** Another page that is the original (pack aliases). Defaults to `path`. */
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

/** A JSON-LD block. `<` is escaped so the data can never close the script element. */
export function JsonLd({ data }: { data: object | object[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />;
}

/** schema.org BreadcrumbList from [name, path] pairs; the last (current) item may leave out its path. */
export function breadcrumbs(items: [name: string, path?: string][]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, path], index) => ({ '@type': 'ListItem', position: index + 1, name, ...(path ? { item: absoluteUrl(path) } : {}) })),
  };
}
