import type { ExtraPage } from './types';
import { dataDate } from '../seo-routes';
import { GOAL_PAGE_MINUTES, goalPagePath } from '../tools/pace-chart';

/** When the pace charts' text was written. They are pure calculations, so no data date applies. */
const PACE_CHARTS_WRITTEN = '2026-10-08';
/** When the goal pages were created. Their lastmod is the later of this and the data date, so it never predates the page. */
const GOAL_PAGES_WRITTEN = '2026-10-08';
const later = (a: string, b: string) => (a > b ? a : b);

/** Sitemap entries for the marathon and half-marathon pace charts and the goal-time pace pages. Each path must be clean, indexable and its own canonical. */
export const PACE_PAGES: ExtraPage[] = [
  { path: '/tools/marathon-pace-chart', lastmod: PACE_CHARTS_WRITTEN },
  { path: '/tools/half-marathon-pace-chart', lastmod: PACE_CHARTS_WRITTEN },
  // The goal pages show the pace-band and finish-time data (insights manifest), and are no older than their own text.
  ...GOAL_PAGE_MINUTES.map((minute) => ({ path: goalPagePath(minute), lastmod: () => later(dataDate('insights'), GOAL_PAGES_WRITTEN) })),
];
