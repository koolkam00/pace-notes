import type { ExtraPage } from './types';
import { dataDate, halfDataDate, halfTextDate } from '../seo-routes';
import { GOAL_PAGE_MINUTES, goalPagePath } from '../tools/pace-chart';

/** When the pace charts' text was written. They are pure calculations, so no data date applies. */
const PACE_CHARTS_WRITTEN = '2026-10-08';
/** When the goal pages were created. Their lastmod is the later of this and the data date, so it never predates the page. */
const GOAL_PAGES_WRITTEN = '2026-10-08';
/** The latest of the dates given (an undefined one, such as the half data's in a build without it, is skipped). */
const later = (...dates: (string | undefined)[]) => dates.filter((d): d is string => !!d).sort().pop()!;

/** Sitemap entries for the marathon and half-marathon pace charts and the goal-time pace pages. Each path must be clean, indexable and its own canonical. */
export const PACE_PAGES: ExtraPage[] = [
  { path: '/tools/marathon-pace-chart', lastmod: PACE_CHARTS_WRITTEN },
  // The half chart's observed panel shows the half-marathon finishes, when the build has them.
  { path: '/tools/half-marathon-pace-chart', lastmod: () => later(PACE_CHARTS_WRITTEN, halfDataDate(), halfTextDate('/tools/half-marathon-pace-chart')) },
  // The goal pages show the pace-band and finish-time data (insights manifest) and the half before the goal (the half
  // data, and its text written on the merge day, halfTextDate), and are no older than their own text.
  ...GOAL_PAGE_MINUTES.map((minute) => ({ path: goalPagePath(minute), lastmod: () => later(dataDate('insights'), GOAL_PAGES_WRITTEN, halfDataDate(), halfTextDate()) })),
];
