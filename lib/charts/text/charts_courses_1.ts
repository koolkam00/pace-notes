import type { ChartText } from '../types';
import { pct, time } from '@/lib/nuggets/format';

const n = (v: number | string) => Number(v);
const minutes = (s: number | string) => `${Math.round(n(s) / 60)}`;
const points = (share: number | string) => `${Math.round(n(share) * 100)} points`;

/** The words of the courses-and-weather Top 100 charts. */
export const CHARTS_COURSES_1_TEXT: Record<string, ChartText> = {
  'same-race-warmer-return': {
    title: 'A warmer return: same start, slower end',
    takeaway: (v) => ({
      guard: Math.abs(n(v.warm_start)) < 0.01 && n(v.warm_late) > n(v.warm_start) + 0.03 && n(v.warm_late) > n(v.same_late) + 0.03
        && n(v.cool_late) < n(v.cool_start) - 0.02 && n(v.ep_warm_late_gt) >= 0.8 * n(v.ep_warm_100) && n(v.loo_lo) > 0.03
        && n(v.ep_warm) >= 20 && n(v.n_warm) >= 100 && n(v.n_same) >= 100 && n(v.n_cool) >= 100,
      headline: `Back at the same race on a much warmer morning, records linked by name ran the first 5K as quickly as before and 35–40K *${pct(n(v.warm_late), 0)} slower*.`,
      fallback: 'Section-by-section pace change for records linked by name returning to the same race, by how the race morning changed.',
    }),
  },
  'every-race-has-its-minute': {
    title: 'The finish rush lands just before round times',
    takeaway: (v) => ({
      guard: n(v.bk) >= 0.7 * n(v.bn) && n(v.vk) >= 0.7 * n(v.vn) && n(v.vn) >= 3 && n(v.n_min) >= 100,
      headline: `Berlin's busiest finish minute fell *just before ${time(n(v.bmark), 'h:mm')}* in ${n(v.bk)} of ${n(v.bn)} editions, Valencia's just before ${time(n(v.vmark), 'h:mm')} in ${n(v.vk)} of ${n(v.vn)}.`,
      fallback: 'Each edition’s busiest finish minute, for three races.',
    }),
  },
  'where-each-race-slows': {
    title: 'Of six races, New York slowed most by 25K',
    takeaway: (v) => ({
      guard: n(v.ny_rank) === 1 && n(v.next) === n(v.ny_next) && n(v.ny) > n(v.next) + 0.02,
      headline: `In the typical edition at the same early pace, New York finishes ran 20–25K *${pct(n(v.ny), 1)} slower* than their 5–20K pace, against ${pct(n(v.next), 1)} in ${v.next_city}.`,
      fallback: 'Median section paces against the 5–20K pace, race by race, at the same early pace.',
    }),
  },
  'how-spread-out-each-race-is': {
    title: 'Of seven races, London’s finishes spread widest',
    takeaway: (v) => ({
      guard: n(v.top_iqr) > 1.5 * n(v.low_iqr),
      headline: `In the typical edition, the middle half of finishes spanned *${minutes(v.top_iqr)} minutes* in ${v.top}, against only ${minutes(v.low_iqr)} in ${v.low}.`,
      fallback: 'The spread of finish times in each race.',
    }),
  },
  'races-that-warmed-up': {
    title: 'More warming after the start, more slowdowns',
    takeaway: (v) => ({
      guard: n(v.gap) > 0.03 && n(v.most) > 0.02 && n(v.least) < -0.02 && n(v.most) === n(v.high) && n(v.least) === n(v.low),
      headline: `At similar start temperatures, editions warming most averaged *${points(v.most)} above* their race’s usual sustained slowdown share, the least ${Math.round(Math.abs(n(v.least)) * 100)} below.`,
      fallback: 'Sustained slowdown share by how much a race warmed after the start, against the race’s usual.',
    }),
  },
  'climb-a-loose-guide': {
    title: 'Climb is a loose guide to late slowing',
    takeaway: (v) => ({
      guard: n(v.boston) < n(v.gold) && n(v.r_lo) < 0.3 && n(v.n_cities) >= 15,
      headline: `At the same early pace, hilly Boston's sustained slowdown share sat *${points(v.gap)} below* flat Gold Coast's: climb tracked slowing only loosely.`,
      fallback: 'Course climb against sustained slowdown share at the same early pace.',
    }),
  },
};
