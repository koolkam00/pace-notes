import type { ChartText } from '../types';
import { count, inWords, pct, ratio } from '@/lib/nuggets/format';

const n = (v: number | string) => Number(v);

/** The words of the finish-times Top 100 charts. */
export const CHARTS_FINISH_TIMES_1_TEXT: Record<string, ChartText> = {
  'minute-before-the-hour': {
    title: 'Finishes pile up just before the hour',
    takeaway: (v) => ({
      guard: n(v.ratio) > 1.3 && n(v.after) >= 100,
      headline: `The minute before 3:00 holds *${ratio(n(v.ratio), 2)}* the finishes of the minute after it.`,
      fallback: 'Finishes minute by minute around 3:00.',
    }),
  },
  'shared-second': {
    title: 'In the biggest fields, most times are shared',
    takeaway: (v) => ({
      guard: n(v.big) > 0.8 && n(v.small) < n(v.big) - 0.3 && n(v.n_small) >= 100 && n(v.big_min) === 35000 && n(v.small_max) === 5000,
      headline: `In fields of ${count(n(v.big_min))}+ finishes, *${pct(n(v.big))}* of finishes shared their exact recorded second with another; in fields under ${count(n(v.small_max))}, ${pct(n(v.small))}.`,
      fallback: 'How often finishes share their recorded second, by field size.',
    }),
  },
  'seconds-before-the-mark': {
    title: 'The crowd thins in the last seconds before 3:00',
    takeaway: (v) => ({
      guard: n(v.drop) > 0.1,
      headline: `The last ten seconds before 3:00 held *${pct(n(v.drop))} fewer* finishes than the first ten seconds of 2:59.`,
      fallback: 'Finishes in ten-second steps around 3:00.',
    }),
  },
  'a-year-apart': {
    title: 'A year apart, most finishes moved 5+ minutes',
    takeaway: (v) => ({
      guard: n(v.within) < 0.5 && n(v.within_ny) < 0.5 && n(v.tol) === 300 && n(v.n) >= 100,
      headline: `For records linked by name about a year apart, only *${pct(n(v.within))}* of finishes came within ${Math.round(n(v.tol) / 60)} minutes of the one before.`,
      fallback: 'How much a linked record’s finish time changed over about a year.',
    }),
  },
  'kick-just-under-the-mark': {
    title: 'Kicks spike just before 3:00, 3:30 and 4:00',
    takeaway: (v) => ({
      guard: n(v.a) > n(v.b) + 0.04 && n(v.a) > n(v.a0) + 0.04 && n(v.a) > n(v.b1) + 0.1 && n(v.n_min) >= 100
        && n(v.a) > n(v.near3) && n(v.peak330) > n(v.near330) && n(v.peak4) > n(v.near4),
      headline: `*${pct(n(v.a))}* of 2:59 finishes ran 40K to the finish quicker than 35–40K, against ${pct(n(v.b))} of 3:00 finishes.`,
      fallback: 'Finishes with a quicker last stretch, minute by minute.',
    }),
  },
  'ten-minutes-many-places': {
    title: 'Ten minutes are worth far more places at 4:00',
    takeaway: (v) => ({
      guard: n(v.w4) > 10 * n(v.w230) && n(v.lo4) > n(v.hi3) && n(v.eds) >= 20 && n(v.scale) === 40000 && n(v.size_min) === 30000,
      headline: `In the typical edition of ${count(n(v.size_min))}+ finishes, the ten minutes around 4:00 held *${count(n(v.w4))}* of every ${count(n(v.scale))}; around 2:30, just ${count(n(v.w230))}.`,
      fallback: 'Finishes in ten-minute windows around round times, in the largest fields.',
    }),
  },
  'same-four-hours-different-place': {
    title: 'Same 4:00, very different place in the field',
    takeaway: (v) => ({
      guard: n(v.wash) > 0.6 && n(v.val) < 0.4,
      headline: `A 4:00 finish was ahead of *${pct(n(v.wash))}* of Washington’s finishes but only ${pct(n(v.val))} of Valencia’s.`,
      fallback: 'The share of each city’s finishes slower than 4:00.',
    }),
  },
  'only-1-in-20-under-3': {
    title: 'Only 1 in 20 finishes came in under 3:00',
    takeaway: (v) => ({
      guard: n(v.sub3) < 0.08 && n(v.ed_med) < 0.08 && inWords(n(v.sub3)) === '1 in 20',
      headline: `Under 3:00 held *${pct(n(v.sub3))}* of finishes; 3:00–4:00 held another ${pct(n(v.sub3to4))}.`,
      fallback: 'The share of finishes under each round time.',
    }),
  },
};
