import type { MetadataRoute } from 'next';
import { absoluteUrl, sitemapEntries } from '@/lib/seo-routes';

export const dynamic = 'force-static';

// `next dev` serves this file as /sitemap.xml/[[...__metadata_id__]] and, with output: 'export', refuses
// to answer without static params for it. The production build writes a plain out/sitemap.xml either way.
export function generateStaticParams() {
  return [{ __metadata_id__: [] as string[] }];
}

// Indexable, self-canonical pages only, built from the same registries as the pages. lastmod comes from
// the as_of date of the data each page shows (or CONTENT_DATES); no priority or changefreq. New pages
// register in EXTRA_SITEMAP_PAGES in lib/seo-routes.ts. See docs/SEO.md.
export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapEntries().map(({ path, lastmod }) => (lastmod ? { url: absoluteUrl(path), lastModified: lastmod } : { url: absoluteUrl(path) }));
}
