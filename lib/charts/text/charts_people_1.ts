import type { ChartText } from '../types';
import { count, inWords, pct } from '@/lib/nuggets/format';

const n = (v: number | string) => Number(v);
const minutes = (s: number) => `${Math.round(s / 60)} minutes`;
/** A gap in words, never m:ss (which reads as a clock time): '18 seconds', '2 min 18 s'. Matches the chart notes. */
const gapWords = (s: number) => {
  const t = Math.round(Math.abs(s));
  if (t < 60) return `${t} seconds`;
  return `${Math.floor(t / 60)} min` + (t % 60 ? ` ${t % 60} s` : '');
};

/** The words of the Top 100 charts people module. */
export const CHARTS_PEOPLE_1_TEXT: Record<string, ChartText> = {
  'big-birthday-bulge': {
    title: 'Round birthdays from 40 bulge in New York',
    takeaway: (v) => ({
      guard: n(v.lo) > 0.15 && n(v.r30) < 0.1 && n(v.eds_above) === n(v.eds),
      headline: `In New York, ages 40, 50, 60 and 70 each hold *${pct(n(v.lo))} to ${pct(n(v.hi))} more* finishes than the average of the ages either side.`,
      fallback: 'New York finishes by exact recorded age.',
    }),
  },
  'age-barely-shows-until-45': {
    title: "Men's finish times barely move until 45",
    takeaway: (v) => ({
      guard: n(v.d1) > 0 && n(v.d2) > 3 * n(v.d1) && n(v.w1) > 0 && n(v.w2) > 3 * n(v.w1) && n(v.races_n) === 5,
      headline: `In ${v.races}, men's median finish was *${minutes(n(v.d1))}* slower at 45 than 25, then ${Math.round(n(v.d2) / 60)} more by 65.`,
      fallback: 'Median finish times by exact recorded age.',
    }),
  },
  'women-outnumber-men-mid-20s': {
    title: "Only at ages 23–28 were most finishes women's",
    takeaway: (v) => ({
      guard: n(v.a0) === 23 && n(v.a1) === 28 && n(v.peak) > 0.5 && n(v.contiguous) === 1 && n(v.n_min) >= 100
        && n(v.races_n) === 5 && n(v.under_after) === 1 && n(v.first_under) === n(v.a1) + 1,
      headline: `In ${v.races}, women's finishes peaked at *${pct(n(v.peak))}* at age ${n(v.peak_age)} and were under half from ${n(v.first_under)} to ${n(v.last_age)}.`,
      fallback: "Women's share of finishes at each exact recorded age.",
    }),
  },
  'older-finishes-draw-level': {
    title: 'Older finishes start slower, gain after 25K',
    takeaway: (v) => ({
      guard: n(v.g20) > 60 && n(v.g40) > 0 && n(v.falls25) === 1 && n(v.gain) === n(v.g20) + n(v.g40),
      headline: `At the same finish minute, finishes at 60–69 were ${gapWords(n(v.g20))} behind those at 18–29 at 20K and *${gapWords(n(v.g40))} ahead* at 40K.`,
      fallback: 'The gap between older and younger finishes with the same finish time, mat by mat.',
    }),
  },
  'women-slow-down-less': {
    title: "Women's finishes slowed down far less often",
    takeaway: (v) => ({
      guard: n(v.ratio) > 2 && n(v.cities) >= 10 && n(v.cities_men_higher) === n(v.cities),
      headline: `In the same edition and finish minute, men's finishes had a sustained slowdown *more than twice as often* as women's: ${pct(n(v.m))} against ${pct(n(v.w))}.`,
      fallback: "Sustained slowdown shares of women's and men's finishes at the same finish time.",
    }),
  },
  'sub-3-not-only-for-the-young': {
    title: 'Sub-3:00 finishes are not only for the young',
    takeaway: (v) => ({
      guard: n(v.m40) > 0.25 && n(v.m50) < n(v.m40) && n(v.med) < 40 && n(v.n) >= 100 && n(v.races_n) === 5,
      headline: `In ${v.races}, *${pct(n(v.m40))}* of men's finishes under 3:00 came at a recorded age of 40 or older.`,
      fallback: "Men's finishes under 3:00 by recorded age.",
    }),
  },
  'women-beat-the-median-man': {
    title: "1 in 4 women's finishes beat the men's median",
    takeaway: (v) => ({
      guard: inWords(n(v.share)) === '1 in 4' && n(v.eds_20_35) >= 0.85 && n(v.eds_in) === Math.round(n(v.eds_20_35) * n(v.eds)),
      headline: `In the typical edition, *${pct(n(v.share))}* of women's finishes beat that edition's median men's finish; it was ${pct(n(v.band_lo))} to ${pct(n(v.band_hi))} in ${count(n(v.eds_in))} of ${count(n(v.eds))} editions.`,
      fallback: "Women's finishes against each edition's median men's finish.",
    }),
  },
  'new-york-2006-vs-2025': {
    title: "In New York, women's share rose at every age",
    takeaway: (v) => ({
      guard: n(v.ratio53) >= 1.95 && n(v.ratio53) < 2.1 && n(v.rose_all) === 1 && n(v.n_min) >= 100,
      headline: `From 2006 to 2025, women's share of New York finishes at 53 or older *doubled*, from ${pct(n(v.a53))} to ${pct(n(v.b53))}.`,
      fallback: 'New York finishes by age band and gender, 2006 and 2025.',
    }),
  },
};
