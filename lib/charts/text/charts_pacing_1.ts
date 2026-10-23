import type { ChartText } from '../types';
import { pct, time } from '@/lib/nuggets/format';

const n = (v: number | string) => Number(v);
const mins = (s: number | string) => `${Math.round(n(s) / 60)} minutes`;
const hm = (s: number | string) => time(n(s), 'h:mm');

/** The words of the Top 100 charts' pacing batch one. */
export const CHARTS_PACING_1_TEXT: Record<string, ChartText> = {
  'even-pace-1-in-13': {
    title: 'Even pace is rare, and rarer in slower finishes',
    takeaway: (v) => ({
      guard: n(v.share) < 0.12 && n(v.sub3) > 3 * n(v.share) && n(v.slow) < n(v.share) && n(v.n_slow) >= 100,
      headline: `*${pct(n(v.sub3), 1)}* of finishes under 3:00 kept every 5K within ${pct(n(v.tol))} of their average pace; ${pct(n(v.share), 1)} of all finishes did, ${pct(n(v.slow), 1)} at 6:00+.`,
      fallback: 'Finishes that kept every 5K near their average pace, by finish time.',
    }),
  },
  'same-20k-different-finish': {
    title: 'Same 20K split, very different finishes',
    takeaway: (v) => ({
      guard: n(v.gap) > 600 && n(v.fast_n) >= 100 && n(v.even_n) >= 100,
      headline: `Of finishes through 20K in ${hm(v.t20_lo)}–${hm(v.t20_hi)}, those who ran 0–5K ${pct(n(v.cut))}+ quicker than 5–20K pace finished a median *${mins(v.gap)} later* than steady starts.`,
      fallback: 'Finish times by first-5K pace, at the same 20K split.',
    }),
  },
  'second-20k-rarely-quicker': {
    title: 'Few finishes ran the second 20K quicker',
    takeaway: (v) => ({
      guard: n(v.all) < 0.15 && n(v.sub3) > n(v.all) && n(v.all) > n(v.slow),
      headline: `Only *${pct(n(v.all), 1)}* of finishes ran 20–40K quicker than 0–20K; of finishes under 3:00, ${pct(n(v.sub3), 1)} did.`,
      fallback: 'Finishes whose 20–40K took less time than 0–20K, by finish time.',
    }),
  },
  'two-ways-to-run-359': {
    title: 'Two ways to run 3:59',
    takeaway: (v) => ({
      guard: n(v.early_min) >= 0.08 && n(v.early_max) <= 0.12 && n(v.rest_max) < n(v.tol) && n(v.n_slow) >= 100 && n(v.n_rest) >= 100,
      headline: `Finishes of 3:59 with a sustained slowdown ran their first 15K about *${pct(n(v.early))} quicker* than their own average pace; the rest stayed within ${pct(n(v.tol))}.`,
      fallback: 'Section paces of 3:59 finishes, with and without a sustained slowdown.',
    }),
  },
  'slowed-in-every-5k': {
    title: 'A third of finishes slowed every 5K after 20K',
    takeaway: (v) => ({
      guard: n(v.share) > 0.29 && n(v.share) < 0.37 && n(v.peak) > n(v.share) && n(v.peak_hi) < 30000
        && n(v.sub3) < n(v.peak) && n(v.slow6) < n(v.peak),
      headline: `*${pct(n(v.peak))}* of ${hm(v.peak_lo)}–${hm(v.peak_hi)} finishes ran each 5K from 20–25K to 35–40K slower than the one before; ${pct(n(v.share))} of all did, ${pct(n(v.slow6))} at 6:00+.`,
      fallback: 'Finishes that slowed in every 5K after 20K, by finish time.',
    }),
  },
  'kick-but-not-early-pace': {
    title: 'A finishing kick, but not back to early pace',
    takeaway: (v) => ({
      guard: n(v.kick) > 2 * n(v.early),
      headline: `*${pct(n(v.kick))}* of finishes ran 40K to the finish at a quicker pace than 35–40K; only ${pct(n(v.early))} got back under their 5–20K pace.`,
      fallback: 'The last stretch against 35–40K and against 5–20K pace.',
    }),
  },
  'rarely-back-to-early-pace': {
    title: 'A slowdown rarely reverses',
    takeaway: (v) => ({
      guard: n(v.back) < 0.1 && n(v.stayed) > 0.5 && n(v.n) >= 100,
      headline: `Of finishes whose sustained slowdown began before 35K, only *${pct(n(v.back), 1)}* ran a later 5K within ${pct(n(v.thr))} of their 5–20K pace.`,
      fallback: 'What happened after a sustained slowdown began before 35K.',
    }),
  },
  'bigger-fade-later-finish': {
    title: 'The later the finish, the bigger the fade',
    takeaway: (v) => {
      const col = [v.c0, v.c1, v.c2, v.c3, v.c4, v.c5].map(n);
      return {
        guard: n(v.slow) > n(v.fast) + 0.1 && n(v.n_min) >= 100 && col.every((x, i) => i === 0 || x > col[i - 1]),
        headline: `In 35–40K, ${hm(v.slow_lo)}–${hm(n(v.slow_lo) + n(v.band))} finishes ran a median *${pct(n(v.slow))} slower* than their 5–20K pace; ${hm(v.fast_lo)}–${hm(n(v.fast_lo) + n(v.band))} finishes, ${pct(n(v.fast))}.`,
        fallback: 'Median section paces against the 5–20K pace, by finish time.',
      };
    },
  },
};
