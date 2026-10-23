/**
 * Nuggets for the Top 100 charts: each chart's takeaway, read from its verified data file through lib/charts/registry
 * (the same words its card and page show), so scripts/verify-nuggets.cjs holds them to the site's text rules. The
 * values are recounted by scripts/verify-charts.cjs.
 */
import { CATALOG, chartHref, readChart } from '@/lib/charts-server';
import { CHART_TEXT } from '@/lib/charts/registry';
import type { Builder } from './build';
import type { Nugget, NuggetId } from './types';

export const CHART_NUGGETS: Record<string, Builder> = Object.fromEntries(CATALOG.filter((c) => CHART_TEXT[c.slug]).map((c) => {
  const id = `charts.${c.slug}` as NuggetId;
  const build: Builder = () => {
    const file = readChart(c.slug);
    const t = CHART_TEXT[c.slug].takeaway(file.values);
    const nugget: Nugget = {
      id, page: chartHref(c.number), values: file.values, guard: t.guard, headline: t.headline, fallback: t.fallback, figure: null,
      denominator: 'story', ...(/sustained slowdown/i.test(t.headline) ? { term: '/methodology#sustained-slowdown' as const } : {}),
    };
    return nugget;
  };
  return [id, build];
}));
