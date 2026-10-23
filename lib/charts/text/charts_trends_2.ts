import type { ChartText } from '../types';
import { count, pct, ratio } from '@/lib/nuggets/format';

const n = (v: number | string) => Number(v);
const mins = (s: number | string) => `${Math.round(Math.abs(n(s)) / 60)} minutes`;

/** The words of the Top 100 charts, trends (second batch). */
export const CHARTS_TRENDS_2_TEXT: Record<string, ChartText> = {
  'most-records-appear-once': {
    title: 'Names seen 3+ times hold a sixth of finishes',
    takeaway: (v) => ({
      guard: n(v.one_in) >= 17.5 && n(v.one_in) < 18.5 && n(v.held3) > 0.155 && n(v.held3) < 0.18 && n(v.records3) >= 100,
      headline: `${pct(n(v.rec3), 1)} of records linked by name have three or more finishes but hold *${pct(n(v.held3), 1)}* of all finishes.`,
      fallback: 'Records linked by name, by how many finishes they hold.',
    }),
  },
  'every-new-york-in-the-data': {
    title: 'Sixteen New Yorks under one name',
    takeaway: (v) => ({
      guard: n(v.n_eds) === 16 && n(v.all16) >= 100 && n(v.ten) > n(v.all16),
      headline: `*${count(n(v.all16))}* records linked by name finished ${count(n(v.n_eds))} New York editions, and ${count(n(v.ten))} at least 10.`,
      fallback: 'Records linked by name by how many New York editions they finished.',
    }),
  },
  'women-at-the-front-grew': {
    title: "Under 3:30 in Berlin, women's share tripled",
    takeaway: (v) => ({
      guard: n(v.last) >= 2.9 * n(v.first) && n(v.rose) >= 7,
      headline: `Women's finishes were ${pct(n(v.first), 1)} of Berlin's finishes under 3:30 in ${v.y0} and *${pct(n(v.last), 1)}* in ${v.y1}.`,
      fallback: "Women's share of finishes under 3:30, year by year.",
    }),
  },
  'new-york-2021-returners': {
    title: 'In New York 2021, more had a New York past',
    takeaway: (v) => ({
      guard: n(v.r21) > n(v.usual) + 0.05,
      headline: `*${pct(n(v.r21))}* of New York 2021 finishes belonged to records linked by name with a New York finish in the prior five years; the typical edition, ${pct(n(v.usual))}.`,
      fallback: 'New York finishes linked to a recent New York finish, year by year.',
    }),
  },
  'quicker-finishes-more-repeatable': {
    title: 'The quicker the finish, the more repeatable',
    takeaway: (v) => ({
      guard: n(v.fast) > 1.5 * n(v.slow) && n(v.n_fast) >= 100 && n(v.n_slow) >= 100,
      headline: `After a finish under 3:00, *${pct(n(v.fast))}* of next finishes by the same record linked by name came within 2% of it; after 5:00–6:00, ${pct(n(v.slow))}.`,
      fallback: 'How close the next linked finish came to the earlier one, by finish band.',
    }),
  },
  'same-race-different-year': {
    title: 'Sustained slowdowns swing from year to year',
    takeaway: (v) => ({
      guard: n(v.n20) >= n(v.races) / 2 && n(v.hi) - n(v.lo) >= n(v.swing),
      headline: `${v.race}'s sustained slowdown share ran *from ${pct(n(v.lo))} to ${pct(n(v.hi))}* across editions, highest in ${v.hi_year} and lowest in ${v.lo_year}.`,
      fallback: 'Sustained slowdown share per edition, race by race.',
    }),
  },
  'just-over-3-then-next': {
    title: 'Next time, no jump between 2:59 and 3:00',
    takeaway: (v) => ({
      guard: n(v.step) < 1.5 * n(v.mean_step) && n(v.step) <= n(v.max_step),
      headline: `For records linked by name, the next finish was under 3:00 after ${pct(n(v.under))} of 2:59 finishes and ${pct(n(v.over))} of 3:00 ones: *no jump at the mark*.`,
      fallback: 'The next linked finish under 3:00, by the minute of the earlier finish.',
    }),
  },
  'quicker-second-20k-again': {
    title: 'Quicker second 20Ks came round again more often',
    takeaway: (v) => ({
      guard: n(v.after) > 2 * n(v.other) && n(v.ratio) >= 2,
      headline: `After a quicker 20–40K than 0–20K, records linked by name did it again *${ratio(n(v.ratio), 1)}* as often.`,
      fallback: 'The next linked finish, after a quicker or a slower second 20K.',
    }),
  },
  'same-records-years-later': {
    title: 'Years on, names first seen older lost more',
    takeaway: (v) => ({
      guard: n(v.gap) > 900 && n(v.gap_early) > 900 && n(v.gap_late) > 900 && n(v.n_young) >= 100 && n(v.n50) >= 100 && n(v.rising) === 1 && n(v.fifties) >= 90 && n(v.young) <= -90,
      headline: `Eight years on, records linked by name first seen at 50–59 were *${mins(v.fifties)}* behind their first finish; at 18–29, ${mins(v.young)} ahead.`,
      fallback: 'Change from a linked record’s first finish, by years since and age at the first.',
    }),
  },
};
