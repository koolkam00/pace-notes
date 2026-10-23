import type { ChartText } from '../types';
import { hm, pct, ratio } from '@/lib/nuggets/format';

const n = (v: number | string) => Number(v);
const minutes = (s: number | string) => `${Math.round(n(s) / 60)} minutes`;

/** The words of the Top 100 charts, finish times (second batch). */
export const CHARTS_FINISH_TIMES_2_TEXT: Record<string, ChartText> = {
  'men-bunch-at-round-marks': {
    title: 'At 3:00, men’s finishes bunch more than women’s',
    takeaway: (v) => ({
      guard: n(v.men) > n(v.women) + 0.2 && n(v.women) > 1.1 && n(v.men4) > n(v.women4) && n(v.n_min) >= 100,
      headline: `Men's finishes in the minute before 3:00 outnumbered the minute after *${ratio(n(v.men), 2)}*; women's, ${ratio(n(v.women), 2)}.`,
      fallback: "Men's and women's finishes either side of each round mark.",
    }),
  },
  'mens-median-on-the-mark': {
    title: "4:00 divides men's finishes in half",
    takeaway: (v) => ({
      guard: Math.round(n(v.men) / 60) === 240 && Math.abs(n(v.men_eq) - 14400) < 300 && Math.abs(n(v.men_under4) - 0.5) < 0.01
        && n(v.all_under4) < n(v.men_under4),
      headline: `*${pct(n(v.men_under4), 1)}* of men's finishes came in under 4:00; of all finishes, ${pct(n(v.all_under4), 1)}.`,
      fallback: "The share of men's finishes, and of all finishes, under 4:00.",
    }),
  },
  'long-back-of-the-field': {
    title: 'The slowest 1% trail by almost 2 hours',
    takeaway: (v) => ({
      // "Almost 2 hours": 105 to 120 minutes; the back tail longer than the front in the typical edition and in 90% of editions.
      guard: n(v.back) >= 105 * 60 && n(v.back) < 120 * 60 && n(v.back) > 1.3 * n(v.front) && n(v.eds_back_longer) >= 0.9 * n(v.eds),
      headline: `In the typical edition, the quickest 1% beat the median by ${minutes(v.front)}; the slowest 1% trailed it by *${minutes(v.back)}*.`,
      fallback: 'How far each percentile finished from the median.',
    }),
  },
  'even-ten-minute-marks': {
    title: 'Ten-minute marks like 3:10 bunch finishes too',
    takeaway: (v) => ({
      guard: n(v.ten) > 1.1 && n(v.ten) > n(v.ten_late) + 0.1 && n(v.at310) > 1.1,
      headline: `Finishes dropped *${ratio(n(v.ten), 2)}* as sharply across marks like 3:10 as across nearby minutes; from 4:10 to 5:50, ${ratio(n(v.ten_late), 2)}.`,
      fallback: 'Finishes either side of each ten-minute mark.',
    }),
  },
  'fields-stretching-out': {
    title: 'Race fields spread out over the years',
    takeaway: (v) => ({
      guard: n(v.n_wider) === n(v.races) && n(v.races) >= 5 && n(v.min_change) > 0 && n(v.berlin) > 0,
      headline: `All ${n(v.races)} races compared spread out; Berlin's middle 80% of finishes widened by *${minutes(v.berlin)}*.`,
      fallback: 'The spread of each race compared, early editions against recent ones.',
    }),
  },
  'one-hour-holds-half': {
    title: 'Nearly half of all finishes fit in one hour',
    takeaway: (v) => ({
      guard: n(v.share) > 0.4 && n(v.share) < 0.5,
      headline: `*${pct(n(v.share))}* of all finishes landed in a single hour, from ${hm(n(v.start) / 60)} to ${hm(n(v.end) / 60)}.`,
      fallback: 'Every finish by finish time, with the busiest hour lit.',
    }),
  },
  'quick-double-mostly-slower': {
    title: 'Sub-3:30 doubles: the second more often slower',
    takeaway: (v) => ({
      // Under half quicker within three weeks (and most slower), well over half a year on at the same race pairs; the gap
      // is widest in the quickest band; every group holds 100+ pairs.
      guard: n(v.dbl) < 0.5 && n(v.slower_dbl) > 0.5 && n(v.yr) > 0.5 && n(v.gap_top) >= 0.15 && n(v.gap_top) > 1.5 * n(v.gap_max_rest)
        && n(v.min_pairs) >= 100,
      headline: `With two finishes averaging under 3:30, records linked by name ran the second quicker *${pct(n(v.dbl))}* of the time within three weeks; a year on, ${pct(n(v.yr))}.`,
      fallback: 'How often the second of two finishes by records linked by name was quicker, weeks apart and a year apart.',
    }),
  },
};
