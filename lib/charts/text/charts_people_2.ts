import type { ChartText } from '../types';
import { count, pct, time } from '@/lib/nuggets/format';

const n = (v: number | string) => Number(v);

/** The words of the people charts of the Top 100. */
export const CHARTS_PEOPLE_2_TEXT: Record<string, ChartText> = {
  'gap-widest-at-the-front': {
    title: 'From quick to slow, the gender gap halves',
    takeaway: (v) => ({
      guard: n(v.front) > n(v.back) + 0.05 && n(v.wider_share) > 0.9 && n(v.front_max) >= n(v.rest_max) &&
        n(v.back) / n(v.front) > 0.4 && n(v.back) / n(v.front) < 0.6,
      headline: `In the typical edition, women's finishes were *${pct(n(v.front), 1)}* slower than men's at the 5th percentile but ${pct(n(v.back), 1)} at the 90th.`,
      fallback: "Women's and men's finish times compared percentile by percentile.",
    }),
  },
  'younger-finishes-slowed-more': {
    title: "Younger men's finishes slowed down more often",
    takeaway: (v) => ({
      guard: n(v.young) > n(v.old) + 0.08 && n(v.mono_cols) >= n(v.cols) - 1 && n(v.mono_signal) === 1,
      headline: `Among men's 4:00–4:30 finishes, the sustained slowdown share fell from ${pct(n(v.young))} under 30 to *${pct(n(v.old))}* at 70–79.`,
      fallback: "Men's sustained slowdown share by age and finish time.",
    }),
  },
  'womens-share-by-finish-time': {
    title: "Women's share rises with the finish clock",
    takeaway: (v) => ({
      guard: n(v.sub3) < 0.1 && n(v.cross) > 0 && n(v.last_share) > 0.5 && n(v.cross_share) > 0.5 && n(v.before_cross) <= 0.5 && n(v.eds) >= 80,
      headline: `In the typical edition, women's finishes were *${pct(n(v.sub3))}* of those under 3:00 and over half of every band from ${time(n(v.cross), 'h:mm')} to ${time(n(v.last_end), 'h:mm')}.`,
      fallback: "Women's share of finishes in each 15-minute band.",
    }),
  },
  'sixties-beat-the-young-median': {
    title: "Men's 60–64: over a fifth beat the 25–34 median",
    takeaway: (v) => ({
      // The title says "over a fifth": the guard holds the share between a fifth and a quarter.
      guard: n(v.m6064) > 0.2 && n(v.m6064) < 0.25 && n(v.races_n) === 5,
      headline: `In ${v.races}, *${pct(n(v.m6064))}* of men's finishes at 60–64 came in under the median men's finish at 25–34.`,
      fallback: "Men's finishes by age, against the median 25–34 finish.",
    }),
  },
  'even-pace-paradox': {
    title: "Same finish, more women's finishes even-paced",
    takeaway: (v) => ({
      guard: n(v.ratio) > 1.5 && n(v.weight) >= 100 && n(v.women_pooled) < n(v.men_pooled),
      headline: `At the same finish time, *${pct(n(v.women), 1)}* of women's finishes were even-paced against ${pct(n(v.men), 1)} of men's; over all finishes, ${pct(n(v.women_pooled), 1)} against ${pct(n(v.men_pooled), 1)}.`,
      fallback: "Even-paced women's and men's finishes at the same finish time.",
    }),
  },
  'front-of-the-field-is-younger': {
    title: "Men's quickest finishes skew younger",
    takeaway: (v) => ({
      guard: n(v.all) - n(v.top1) >= 4 && n(v.min_group) >= 100 && n(v.top10) < n(v.all) && n(v.slow10) >= n(v.top1),
      headline: `In ${v.races}, the quickest 1% of men's finishes had a median recorded age of *${count(n(v.top1))}*; all men's finishes, ${count(n(v.all))}.`,
      fallback: "Median recorded age of men's finishes by finish-time group.",
    }),
  },
  'seventy-plus-under-four': {
    title: 'Hundreds broke 4:00 at 70+',
    takeaway: (v) => ({
      guard: n(v.u4) >= 200 && n(v.u4) < 1000 && n(v.u5) > n(v.u4),
      headline: `*${count(n(v.u4))}* of ${count(n(v.n70))} finishes at 70 or older came in under 4:00, and ${count(n(v.u5))} under 5:00.`,
      fallback: 'Finishes recorded at age 70 or older, by finish time.',
    }),
  },
  'womens-share-by-city': {
    title: "Under 4:00, women's share was highest in Boston",
    takeaway: (v) => ({
      // The title names Boston as the top row; one decimal keeps it apart from the next row (the bars print one decimal too).
      guard: v.top_city === 'Boston' && n(v.top) - n(v.second) >= 0.005 && n(v.top) > 3 * n(v.low) && n(v.n_min) >= 100 && n(v.latest_min_year) >= 2023,
      headline: `In each race's latest edition, women's finishes were *${pct(n(v.top), 1)}* of ${v.top_city}'s finishes under 4:00 and ${pct(n(v.low), 1)} of ${v.low_city}'s.`,
      fallback: "Women's share of finishes under 4:00, race by race.",
    }),
  },
};
