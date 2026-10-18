/**
 * Nuggets for the home page (owned by WP1; the redesign spec, sections 5 and 7.1). Each has an independent recount in
 * scripts/verify-nuggets.cjs.
 *
 * - site.totals (one of WP0-C's reference nuggets): the H1's "N million" and the kicker's cities and years, all from the
 *   eligible family.
 * - home.second20k: the page's one guess (#stakes). Of every eligible finish, the share whose second 20K was faster
 *   than its first, from the pacing-shapes pack (the "Faster second 20 km" row, its count over its n). "Only" needs the
 *   share under one half; the figure is the plain fraction (inWords), so "Only about 1 in 25 did." Same family as the
 *   H1 above it: the pack's n is the eligible count.
 */
import { MARATHON_KM } from '@/lib/units';
import { table } from '@/lib/research-data';
import { count, distance, inWords, millions } from './format';
import { siteTotals, type SiteTotals } from './core';
import type { Builder } from './build';
import type { Nugget } from './types';

export function siteTotalsFrom(t: SiteTotals): Nugget {
  const m = millions(t.finishesEligible);
  const ok = t.finishesEligible > 0 && t.results >= t.finishesEligible && t.cities > 0 && t.firstYear <= t.lastYear;
  // The distance and its unit never part at a line break (a no-break space), in either unit.
  const headline = (units: 'mi' | 'km') => `The same ${(units === 'mi' ? '26.2 miles' : distance(MARATHON_KM, 'km')).replace(' ', '\u00a0')}, run *${m} million* ways.`;
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

/** The pack row the guess reads: finishes with a faster second 20K (`count`) of every finish shaped (`total`). */
export type Second20kRow = { count: number; total: number };

/**
 * The guess's answer, said after "You guessed …": "Only about 1 in 25 did." With no usable row there is no figure, and
 * the page shows the neutral sentence without a guess.
 */
export function second20kFrom(row: Second20kRow | null): Nugget {
  const share = row && row.total > 0 && row.count >= 0 && row.count <= row.total ? row.count / row.total : NaN;
  const known = Number.isFinite(share) && share > 0 && share < 1;
  const words = known ? inWords(share) : '';
  return {
    id: 'home.second20k', page: '/#stakes', denominator: 'eligible',
    values: { share, faster: row?.count ?? NaN, total: row?.total ?? NaN },
    guard: known && share < 0.5,
    headline: `Only about *${words}* did.`,
    fallback: known ? `About *${words}* did.` : 'The second 20K against the first, finish by finish.',
    figure: known ? { value: words, sr: inWords(share, 'finishes') } : null,
    key: 'ran their second 20K faster than their first',
  };
}

function second20k(): Nugget {
  const row = table('ext_pacing_shapes', 'patterns.csv').find((r) => r.label === 'Faster second 20 km');
  const faster = Number(row?.count), total = Number(row?.n_value);
  return second20kFrom(row && Number.isFinite(faster) && Number.isFinite(total) ? { count: faster, total } : null);
}

export const HOME_NUGGETS: Record<string, Builder> = {
  'site.totals': () => siteTotalsFrom(siteTotals()),
  'home.second20k': second20k,
};
