import type { ChartText } from '../types';
import { count, countWord, pct, ratio } from '@/lib/nuggets/format';

const n = (v: number | string) => Number(v);

/** The words of the Top 100 charts' trends batch 1. */
export const CHARTS_TRENDS_1_TEXT: Record<string, ChartText> = {
  'sub-3-went-mainstream': {
    title: 'More of men’s finishes now come in under 3:00',
    takeaway: (v) => ({
      guard: n(v.ratio) > 1.3 && n(v.min_ratio) > 1 && n(v.rose) === n(v.races) && n(v.n_min) >= 100,
      headline: `The share of men’s finishes under 3:00 rose in all ${countWord(n(v.races))} big races, to a median *${ratio(n(v.ratio), 1)}* its 2013–19 level in 2022–25.`,
      fallback: 'The share of men’s finishes under 3:00 in eight big races, 2022–25 against 2013–19.',
    }),
  },
  'slowdowns-run-in-streaks': {
    title: 'Sustained slowdowns run in streaks',
    takeaway: (v) => ({
      guard: n(v.three) > 3 * n(v.none) && n(v.n3) >= 100 && n(v.records) >= 100,
      headline: `For records linked by name, after three finishes with a sustained slowdown, the fourth had one *${pct(n(v.three))}* of the time; after none, ${pct(n(v.none))}.`,
      fallback: 'The fourth linked finish of records linked by name, by how many of the three before it had a sustained slowdown.',
    }),
  },
  'place-in-the-field-sticks': {
    title: 'The quickest and slowest fifths mostly repeat',
    takeaway: (v) => ({
      guard: n(v.front) > 0.5 && n(v.back) > 0.5 && n(v.cross) < 0.05,
      headline: `In records linked by name, *${pct(n(v.front))}* of quickest-fifth finishes were followed by another in the quickest fifth; in the slowest, ${pct(n(v.back))}.`,
      fallback: 'The fifth of the field by finish time of each finish, and of the next finish in the same record linked by name.',
    }),
  },
  'fields-halved-in-2021': {
    title: 'Finishes fell in 2021, then topped 2019',
    takeaway: (v) => ({
      guard: n(v.med) <= 0.6 && n(v.high21) < 1 && n(v.ny21) < 0.5 && n(v.ny_latest) > 1 && n(v.bigger) === n(v.races) && n(v.races) >= 5 && n(v.races) <= 11,
      headline: `New York recorded *${pct(n(v.ny21))}* of its 2019 finishes in 2021 and ${pct(n(v.ny_latest))} in ${n(v.ny_year)}; all ${countWord(n(v.races))} races shown have since topped 2019.`,
      fallback: 'Complete finishes in 2021 and in the latest edition against 2019, race by race.',
    }),
  },
  'even-pacing-rose-since-2019': {
    title: 'Even pacing became more common after 2019',
    takeaway: (v) => ({
      guard: n(v.up) >= n(v.races) - 1 && n(v.a1) > n(v.a0),
      headline: `In ${countWord(n(v.up))} of ${countWord(n(v.races))} big races, a bigger share of finishes kept an even pace in 2022–25 than in 2013–19; in Amsterdam, *${pct(n(v.a1))}* against ${pct(n(v.a0))}.`,
      fallback: 'Even-paced finishes in eight big races, 2013–19 against 2022–25.',
    }),
  },
  'quicker-every-time': {
    title: 'Rare streaks, not random',
    takeaway: (v) => ({
      guard: n(v.dec) < 0.05 && n(v.vs_random) > 2 && n(v.records) >= 100,
      headline: `Of records linked by name with five or more finishes, ${pct(n(v.dec), 1)} got quicker every time over the first five: *${ratio(n(v.vs_random), 1)}* a random order.`,
      fallback: 'Records linked by name with five or more finishes, by the order of their first five linked finishes.',
    }),
  },
  'womens-share-rose-in-most-races': {
    title: 'Women’s share rose almost everywhere',
    takeaway: (v) => ({
      guard: n(v.up) >= 0.75 * n(v.races) && n(v.c1) > n(v.c0) + 0.05 && n(v.c1_year) - n(v.c0_year) >= 10,
      headline: `Women’s share of finishes rose in ${count(n(v.up))} of ${count(n(v.races))} races whose editions span 10+ years; in Copenhagen, from ${pct(n(v.c0))} in ${n(v.c0_year)} to *${pct(n(v.c1))}* in ${n(v.c1_year)}.`,
      fallback: 'Women’s share of finishes in each race’s earliest and latest edition.',
    }),
  },
  'five-races-in-same-share': {
    title: 'Five linked finishes, the same slowdown share',
    takeaway: (v) => ({
      guard: Math.abs(n(v.fifth) - n(v.first)) < 0.03 && n(v.high) - n(v.low) < 0.05 && n(v.n) >= 100,
      headline: `In records linked by name with five or more finishes, ${pct(n(v.first), 1)} of first linked finishes had a sustained slowdown; at the fifth, *${pct(n(v.fifth), 1)}*.`,
      fallback: 'Sustained slowdown share at each of the first five finishes of records linked by name.',
    }),
  },
  'new-york-got-younger': {
    title: 'New York’s under-30 and 60+ shares both rose',
    takeaway: (v) => ({
      guard: n(v.u25) > n(v.hi_early) + 0.04 && n(v.o25) > n(v.o06),
      headline: `From 2006 to 2025, New York’s share of finishes with a recorded age under 30 rose from ${pct(n(v.u06))} to *${pct(n(v.u25))}*, and at 60+ from ${pct(n(v.o06))} to ${pct(n(v.o25))}.`,
      fallback: 'The share of New York finishes with a recorded age under 30 and at 60 or older, year by year.',
    }),
  },
};
