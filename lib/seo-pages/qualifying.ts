import type { ExtraPage } from './types';
import { STANDARDS } from '../tools/qualifying';
import { dataDate } from '../seo-routes';

/**
 * Sitemap entries for the per-race qualifying-time pages (app/tools/qualifying/[race]), one per race in
 * lib/tools/qualifying.ts, dated by the day the standards were checked (VERIFIED_AT). Each path must be clean,
 * indexable and its own canonical. lastmod is a function, so the import cycle with seo-routes resolves at call time.
 */
export const QUALIFYING_PAGES: ExtraPage[] = STANDARDS.map((s) => ({ path: `/tools/qualifying/${s.key}`, lastmod: () => dataDate('qualifying') }));
