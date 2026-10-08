import type { ExtraPage } from './types';
import { dataDate } from '../seo-routes';
import { GOAL_PAGE_MINUTES, goalPagePath } from '../tools/pace-chart';

/** When the pace charts' text was written. They are pure calculations, so no data date applies. */
const PACE_CHARTS_WRITTEN = '2026-10-08';

/** Sitemap entries for the marathon and half-marathon pace charts and the goal-time pace pages. Each path must be clean, indexable and its own canonical. */
export const PACE_PAGES: ExtraPage[] = [
  { path: '/tools/marathon-pace-chart', lastmod: PACE_CHARTS_WRITTEN },
  { path: '/tools/half-marathon-pace-chart', lastmod: PACE_CHARTS_WRITTEN },
  // The goal pages show the pace-band and finish-time data (insights manifest).
  ...GOAL_PAGE_MINUTES.map((minute) => ({ path: goalPagePath(minute), lastmod: () => dataDate('insights') })),
];
