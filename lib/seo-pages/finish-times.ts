import type { ExtraPage } from './types';
import { dataDate } from '../seo-routes';

/**
 * Sitemap entries for the marathon finish-time distribution page. Each path must be clean, indexable and its own canonical.
 * /finish-times shows the insights data (finish-times.json, courses.json and the manifest), so its lastmod is that as_of date.
 * lastmod is a function, so the import cycle with seo-routes resolves at call time.
 */
export const FINISH_TIME_PAGES: ExtraPage[] = [{ path: '/finish-times', lastmod: () => dataDate('insights') }];
