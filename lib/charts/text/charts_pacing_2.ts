import type { ChartText } from '../types';
import { approxWords, pct } from '@/lib/nuggets/format';

const n = (v: number | string) => Number(v);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The words of the Top 100 pacing charts (second batch). */
export const CHARTS_PACING_2_TEXT: Record<string, ChartText> = {
  'where-slowdowns-began': {
    title: 'Most sustained slowdowns began at 30K or later',
    takeaway: (v) => ({
      guard: n(v.late) > 0.5 && Math.abs(n(v.late) + n(v.early) - 1) < 1e-6 && n(v.early) < n(v.late),
      headline: `*${pct(n(v.late))}* of sustained slowdowns began at 30K or 35K; the other ${pct(n(v.early))} began at 20K or 25K.`,
      fallback: 'Every 100 sustained slowdowns, by where they began.',
    }),
  },
  'quickest-and-slowest-5k': {
    title: 'The slowest 5K usually came at 35–40K',
    takeaway: (v) => ({
      guard: n(v.slow) > 0.5 && n(v.quick) > 0.5,
      // The before-15K share is in words: its three drawn bars print 34%, 27% and 18%, so a whole percent (80%) would not add up.
      headline: `*${cap(approxWords(n(v.slow), 'finishes'))}* ran their slowest 5K at 35–40K, and ${approxWords(n(v.quick))} their quickest before 15K.`,
      fallback: 'Which 5K was each finish’s quickest and which its slowest.',
    }),
  },
  'where-the-slow-day-happened': {
    title: 'Quickest vs slowest finish: most lost after 20K',
    takeaway: (v) => ({
      guard: n(v.pooled) > 0.5 && n(v.pooled) > n(v.even) + 0.08 && n(v.after_wider) === 5 && n(v.n) >= 100,
      headline: `For records linked by name, *${pct(n(v.pooled))}* of the gap opened after 20K, the last ${pct(n(v.even))} of the distance.`,
      fallback: 'Where the gap between a linked record’s quickest and slowest finish opened.',
    }),
  },
  'slowest-5k-after-20k': {
    title: 'After 20K, nearly every finish slowed somewhere',
    takeaway: (v) => ({
      guard: n(v.any_slower) > 0.95 && n(v.med) > 0.08,
      headline: `The typical finish’s slowest 5K after 20K was *${pct(n(v.med))}* slower than its 5–20K pace.`,
      fallback: 'The slowest 5K after 20K, against each finish’s 5–20K pace.',
    }),
  },
  'steady-before-20k': {
    title: 'The more 15–20K slowed, the more slowdowns',
    takeaway: (v) => ({
      guard: n(v.faster) < n(v.steady) && n(v.steady) < n(v.drift2) && n(v.drift2) < n(v.drift4) && n(v.drift4) < n(v.drift)
        && n(v.drift) > 2 * n(v.steady) && n(v.n_min) >= 100,
      headline: `When 15–20K was 6%+ slower than 5–10K, *${pct(n(v.drift))}* of finishes had a sustained slowdown, against ${pct(n(v.steady))} when within 2%.`,
      fallback: 'Sustained slowdowns by how much 15–20K drifted from 5–10K.',
    }),
  },
  'most-ran-second-5k-quicker': {
    title: 'Most 5:00+ finishes ran the second 5K slower',
    takeaway: (v) => ({
      guard: n(v.slower_5_6) > 0.5 && n(v.slower_6) > 0.5 && n(v.peak) - n(v.slow) > 0.3,
      headline: `Only *${pct(n(v.slow))}* of 6:00+ finishes ran the second 5K quicker than the first; among 3:00–3:30 finishes, ${pct(n(v.peak))}.`,
      fallback: 'Finishes whose second 5K was quicker than the first, by finish time.',
    }),
  },
  'later-slowdowns-up-front': {
    title: 'Later slowdowns up front',
    takeaway: (v) => ({
      guard: n(v.front35) > n(v.s35_2) && n(v.s35_2) > n(v.s35_3) && n(v.s35_3) > n(v.s35_4) && n(v.s35_4) > n(v.back35)
        && n(v.front35) - n(v.back35) > 0.15 && n(v.back20) > n(v.front20) && n(v.slowdowns_min) >= 100
        && n(v.editions_front_higher) >= 0.9 * n(v.editions_both) && n(v.editions_both) >= 100,
      headline: `In the front fifth at 20K, *${pct(n(v.front35))}* of sustained slowdowns began only at 35K; in the back fifth, ${pct(n(v.back35))} did.`,
      fallback: 'Where sustained slowdowns began, by place in the field at 20K.',
    }),
  },
  'middle-split-orders-the-field': {
    title: 'The 25–30K split ordered the field best',
    takeaway: (v) => ({
      guard: [n(v.s0), n(v.s5), n(v.s10), n(v.s15), n(v.s20), n(v.s30), n(v.s35), n(v.s40)].every((x) => x < n(v.s25))
        && n(v.s25) - n(v.s35) > 0.2 && n(v.mid_beats_late) === n(v.editions) && n(v.editions) >= 100 && n(v.n_min) >= 1000,
      headline: `In the typical edition, the 25–30K split alone put *${pct(n(v.s25))}* of finishes within 5 places per 100 of where they finished; 35–40K alone, ${pct(n(v.s35))}.`,
      fallback: 'How closely each section’s split on its own matched the finish order.',
    }),
  },
};
