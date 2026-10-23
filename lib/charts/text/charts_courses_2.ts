import type { ChartText } from '../types';
import { count, pct, ratio } from '@/lib/nuggets/format';

const n = (v: number | string) => Number(v);

/** The words of the Top 100 charts module charts_courses_2. */
export const CHARTS_COURSES_2_TEXT: Record<string, ChartText> = {
  'finishing-kick-by-city': {
    title: 'Boston’s finishes kicked least of eight races',
    takeaway: (v) => ({
      guard: v.top_city === 'Chicago' && v.bottom_city === 'Boston' && n(v.chi) > n(v.bos) + 0.15 && n(v.chi_low) > n(v.bos_high)
        && n(v.second_low) - n(v.bos) >= 0.04 && n(v.n_min) >= 100,
      headline: `In the typical Boston edition, *${pct(n(v.bos))}* of finishes sped up after 40K; in Chicago, ${pct(n(v.chi))}.`,
      fallback: 'Finishes with a quicker last stretch than 35–40K, race by race.',
    }),
  },
  'downhill-start-quick-first-5k': {
    title: 'Climbing starts: first 5K rarely the quickest',
    takeaway: (v) => ({
      guard: n(v.uphill_races) >= 4 && n(v.falling_races) >= 4 && n(v.uphill_max) < 0.2 && n(v.uphill_max_grade) > 0.003
        && n(v.climb_lo) - n(v.next_climb) >= 0.001 && n(v.next_fall) - n(v.fall_hi) >= 0.001 && n(v.fall_hi) < -0.003
        && n(v.falling_median) >= n(v.uphill_max) + 0.1 && n(v.r) < -0.4,
      headline: `On the starts that climb most, no more than *${pct(n(v.uphill_max))}* of finishes ran their quickest 5K first; on those that fall most, ${pct(n(v.falling_median))} in the typical race.`,
      fallback: 'Each race’s share of finishes whose quickest 5K was the first, against the first 5K’s gradient.',
    }),
  },
  'boston-slowest-before-35k': {
    title: 'In Boston the slowest 5K was most often 30–35K',
    takeaway: (v) => ({
      guard: n(v.b) > n(v.typ) + 0.15 && n(v.b) > n(v.b_late) && n(v.b) > n(v.b_early) && n(v.b) > n(v.london) && n(v.b) > n(v.berlin),
      headline: `In Boston *${pct(n(v.b))}* of finishes ran their slowest 5K from 30K to 35K, against ${pct(n(v.typ))} across all races.`,
      fallback: 'Finishes whose slowest 5K was 30–35K, race by race.',
    }),
  },
  'wind-about-the-same': {
    title: 'Slowdowns tracked warmth far more than wind',
    takeaway: (v) => {
      const wind = [n(v.calm), n(v.wind_usual), n(v.windy)];
      return {
        guard: Math.abs(n(v.windy)) < 0.01 && n(v.windy_hi) - n(v.windy_lo) <= 0.05 && n(v.windy_lo) < 0 && n(v.windy_hi) > 0 && n(v.warm) > 0.03
          && Math.max(...wind) - Math.min(...wind) < 0.5 * (n(v.warm) - n(v.cool)),
        headline: `Warmer mornings than usual had *${Math.round(n(v.warm) * 100)} points more* sustained slowdown share; windier ones were within a point of usual.`,
        fallback: 'Sustained slowdown share against the race’s usual, by morning wind and temperature.',
      };
    },
  },
  'cooler-mornings-more-even-pacing': {
    title: 'On cooler mornings, more even pacing',
    takeaway: (v) => ({
      guard: n(v.lower_clear) + n(v.same) === n(v.races) && n(v.lower_clear) >= 0.75 * n(v.races) && n(v.same) >= 1 && n(v.races) >= 10,
      headline: `In *${count(n(v.lower_clear))} of ${count(n(v.races))}* races compared, warmer mornings had a smaller share of even-paced finishes than cooler ones; in the other ${count(n(v.same))}, about the same.`,
      fallback: 'Even-paced finishes on warmer and cooler mornings, race by race.',
    }),
  },
  'second-20k-quicker-by-city': {
    title: 'Quicker second 20Ks: most common in Valencia',
    takeaway: (v) => ({
      guard: v.top_city === 'Valencia' && n(v.top) - n(v.second) >= 0.01 && n(v.ratio) >= 2.5 && n(v.n_min) >= 100,
      headline: `On average, *${pct(n(v.top))}* of finishes in a Valencia edition ran 20–40K quicker than 0–20K: ${ratio(n(v.ratio), 1)} the share in New York.`,
      fallback: 'Finishes with a quicker 20–40K than 0–20K, race by race.',
    }),
  },
  'new-york-sped-up-at-25k': {
    title: 'New York stands out for a 25–30K speed-up',
    takeaway: (v) => ({
      guard: n(v.margin) === 0.02 && n(v.ny) - n(v.next) >= 0.15 && n(v.ny_lo) > n(v.next) && n(v.ny) >= 5 * n(v.typ) && n(v.typ) < 0.1
        && n(v.band_min) > n(v.other_band_max) && n(v.linked_ny) >= 3 * n(v.linked_other)
        && n(v.band_n_min) >= 100 && n(v.race_n_min) >= 100 && n(v.races) >= 10 && n(v.ny_editions) >= 10,
      headline: `In the typical New York edition, *${pct(n(v.ny))}* of finishes ran 25–30K at least ${pct(n(v.margin))} quicker than 20–25K, against ${pct(n(v.typ))} in the typical race.`,
      fallback: 'Finishes that ran 25–30K quicker than 20–25K, race by race.',
    }),
  },
};
