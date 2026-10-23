import type { ChartText } from '../types';
import { pct, ratio } from '@/lib/nuggets/format';

const n = (v: number | string) => Number(v);
const minutes = (s: number | string) => Math.round(n(s) / 60);

/** The words of the racing charts (second batch). */
export const CHARTS_RACING_2_TEXT: Record<string, ChartText> = {
  'ahead-at-20k-gone-by-40k': {
    title: 'The 3:59 crowd banked minutes, then spent them',
    takeaway: (v) => ({
      guard: n(v.peak) > 180 && n(v.ahead40) < 90 && n(v.ahead40) > 0,
      headline: `Finishes of 3:59 were a median *${minutes(v.peak)} minutes* ahead of 4:00 splits at ${v.peak_mat}, and only ${Math.round(n(v.ahead40))} seconds ahead at 40K.`,
      fallback: 'How far 3:59 finishes were from 4:00 splits at each mat.',
    }),
  },
  'front-settles-early': {
    title: 'The middle of the field settles late',
    takeaway: (v) => ({
      guard: n(v.d35) > n(v.d20) + 0.3,
      headline: `At 20K, only *${pct(n(v.d20))}* of mid-field finishes were already near their final place; by 35K, ${pct(n(v.d35))} were.`,
      fallback: 'How settled each part of the field was at every mat.',
    }),
  },
  'same-second-different-20k': {
    title: 'Same finish second, minutes apart at 20K',
    takeaway: (v) => ({
      guard: n(v.gap) > 120 && n(v.within10) < 0.25 && n(v.pairs) >= 100,
      headline: `Pairs of finishes recorded in the same second of the same edition had 20K splits a median *${minutes(v.gap)} minutes* apart.`,
      fallback: 'How far apart at 20K finishes with the same recorded second were.',
    }),
  },
  'three-hour-crowd-at-20k': {
    title: 'The 2:59 bulge shows up long before the line',
    takeaway: (v) => ({
      guard: n(v.r20p) > 0.15 && n(v.rf) > n(v.r20p) + 0.2 && n(v.n_out) >= 100,
      headline: `At 20K, *${pct(n(v.r20p))} more* finishes were on 2:59 splits than on 3:00 splits, well before the bigger bulge at the line.`,
      fallback: 'Finishes on 2:59 splits and on 3:00 splits at each mat.',
    }),
  },
  'order-shuffled-faster-after-20k': {
    title: 'The fewest place changes come just before 20K',
    takeaway: (v) => ({
      guard: v.low_section === '15–20K' && n(v.ratio) > 1.2 && n(v.above1) >= 0.9 * n(v.eds),
      headline: `Finishes changed places least during 15–20K, then *${ratio(n(v.ratio), 1)}* as much during 30–35K, more in ${n(v.above1)} of ${n(v.eds)} editions.`,
      fallback: 'How much the order of each field changed in each 5K.',
    }),
  },
  'how-a-race-spreads-out': {
    title: 'The field spreads out more late in the race',
    takeaway: (v) => ({
      guard: n(v.extra) > 600 && n(v.spread40) > 1.1 * n(v.linear40),
      headline: `In the typical edition, the middle 80% of finishes spanned ${minutes(v.spread40)} minutes at 40K, *${minutes(v.extra)} minutes more* than the first-5K rate would give.`,
      fallback: 'How far each field had spread out at every mat.',
    }),
  },
  'warm-mornings-reshuffle': {
    title: 'Warmest mornings: often more late reordering',
    takeaway: (v) => ({
      guard: n(v.warm_count) >= 0.5 * n(v.cities) && n(v.cool_count) === 0 && n(v.level_count) === n(v.cities) - n(v.warm_count) && n(v.cities) >= 10,
      headline: `In *${n(v.warm_count)} of ${n(v.cities)}* races compared, more of the order changed after 20K on the warmest morning than the coolest; in ${n(v.level_count)}, about the same.`,
      fallback: 'Each race’s coolest and warmest edition, by how much of the order changed after 20K.',
    }),
  },
};
