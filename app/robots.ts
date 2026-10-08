import type { MetadataRoute } from 'next';
import { ROBOTS_DISALLOW, SITE_URL } from '@/lib/seo-routes';

export const dynamic = 'force-static';

// Only the two folders that hold recorded runner names are blocked. Pages render from the rest of /data,
// so /data, /_next, /og and /icons must stay crawlable. Indexing of data files is handled by an
// X-Robots-Tag header in vercel.json, not here. See docs/SEO.md.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: [...ROBOTS_DISALLOW] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
