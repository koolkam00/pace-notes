/**
 * Nuggets for the home page (owned by WP1 from here; the redesign spec, sections 5 and 7.1).
 *
 * site.totals is one of WP0-C's three reference nuggets, recounted independently in scripts/verify-nuggets.cjs: the
 * home H1's "N million" and the kicker's cities and years, all from the eligible family.
 */
import { MARATHON_KM } from '@/lib/units';
import { count, distance, millions } from './format';
import { siteTotals, type SiteTotals } from './core';
import type { Builder } from './build';
import type { Nugget } from './types';

export function siteTotalsFrom(t: SiteTotals): Nugget {
  const m = millions(t.finishesEligible);
  const ok = t.finishesEligible > 0 && t.results >= t.finishesEligible && t.cities > 0 && t.firstYear <= t.lastYear;
  const headline = (units: 'mi' | 'km') => `The same ${units === 'mi' ? '26.2 miles' : distance(MARATHON_KM, 'km')}, run *${m} million* ways.`;
  return {
    id: 'site.totals', page: '/', denominator: 'eligible',
    values: { results: t.results, finishes: t.finishesEligible, cities: t.cities, race_years: t.raceYears, first_year: t.firstYear, last_year: t.lastYear },
    guard: ok,
    headline: { mi: headline('mi'), km: headline('km') },
    fallback: 'Marathon finishes, mat by mat.',
    figure: { value: m, unit: 'million', sr: `${count(t.finishesEligible)} finishes` },
    key: `finishes · ${t.cities} city marathons · ${t.firstYear}–${t.lastYear}`,
  };
}

export const HOME_NUGGETS: Record<string, Builder> = {
  'site.totals': () => siteTotalsFrom(siteTotals()),
};
