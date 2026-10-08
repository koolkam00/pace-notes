import type { ExtraPage } from './types';
import { dataDate } from '../seo-routes';

/** When /finish-times was created. Its lastmod is never earlier than this. */
const WRITTEN = '2026-10-08';

/**
 * Sitemap entries for the marathon finish-time distribution page. Each path must be clean, indexable and its own canonical.
 * /finish-times shows the insights data (finish-times.json, courses.json and the manifest), so its lastmod is the later of
 * that as_of date and the date the page was written. lastmod is a function, so the import cycle with seo-routes resolves at call time.
 */
export const FINISH_TIME_PAGES: ExtraPage[] = [{ path: '/finish-times', lastmod: () => { const data = dataDate('insights'); return data > WRITTEN ? data : WRITTEN; } }];
