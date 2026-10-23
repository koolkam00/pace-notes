import type { ChartText } from '../types';
import { count, pct, ratio } from '@/lib/nuggets/format';

const n = (v: number | string) => Number(v);

/** The words of the charts_more Top 100 charts. */
export const CHARTS_MORE_TEXT: Record<string, ChartText> = {
  'women-median-matches-older-men': {
    title: "Women's median, matched by men decades older",
    takeaway: (v) => ({
      guard: n(v.eds) >= 10 && n(v.eds_m50_ahead) === n(v.eds) && n(v.min_lead50) > 0 && n(v.eds_m55_ahead) > 0 && n(v.eds_m55_ahead) < n(v.eds) && n(v.m55) < n(v.w30) && n(v.m60) > n(v.w30),
      headline: `The men's median at 50–54 was ahead of the women's at 30–34 in *all ${count(n(v.eds))} editions* compared; at 55–59, in ${count(n(v.eds_m55_ahead))}.`,
      fallback: "Edition by edition, the men's 50–54 and 55–59 medians against the women's 30–34 median.",
    }),
  },
  'boston-packed-front-long-back': {
    title: "Boston's field: packed in front, long behind",
    takeaway: (v) => ({
      guard: n(v.boston_min) > n(v.next_max) && n(v.ratio) > 1.25 * n(v.typ) && n(v.ratio) > 1.25 * n(v.typ_ed) && n(v.other_eds) >= 20 && n(v.men_ratio) > 1.5 && n(v.women_ratio) > 1.5,
      headline: `In the typical Boston edition, the 90th percentile finish trails the median *${ratio(n(v.ratio), 1)} as far* as the 10th leads it; elsewhere, ${ratio(n(v.typ_ed), 1)}.`,
      fallback: "How far each race's 10th and 90th percentile finishes sit from its median.",
    }),
  },
  'mornings-vary-by-year': {
    title: 'Race mornings vary more by year than by race',
    takeaway: (v) => ({
      guard: n(v.wider) === n(v.races) && n(v.races) >= 8 && n(v.narrowest) > n(v.gap) && n(v.within) > 0.5,
      headline: `In *each of ${count(n(v.races))} races*, start temperatures across editions spread wider than the gap between the races' typical mornings.`,
      fallback: "Each race's spread of start temperatures across its editions.",
    }),
  },
  'each-race-keeps-its-profile': {
    title: 'Half of editions pace most like their own race',
    takeaway: (v) => ({
      guard: n(v.share) >= 0.5 && n(v.share) < 0.55 && n(v.share) > 3 * n(v.chance) && n(v.men) > 3 * n(v.men_chance) && n(v.women) > 3 * n(v.women_chance) && n(v.gap3) > 3 * n(v.chance),
      headline: `*${pct(n(v.share))}* of editions paced most like another edition of the same race; a random pick would give ${pct(n(v.chance))}.`,
      fallback: "How similar each edition's pace profile is to other editions of the same race.",
    }),
  },
  'late-climber-came-in-first': {
    title: 'Level at 40K? Behind at 30K usually ends ahead',
    takeaway: (v) => ({
      guard: n(v.share) > 0.6 && n(v.eds_above_half) === n(v.eds) && n(v.eds) >= 100 && n(v.g30_60) > 0.5 && n(v.g10) > n(v.g30_60),
      headline: `In the typical edition, when two finishes were level at 40K, the one behind at 30K finished ahead *${pct(n(v.share))}* of the time.`,
      fallback: 'Among pairs of finishes level at 40K, how often the one behind at 30K finished ahead.',
    }),
  },
  'steady-climbers-twice-fallers': {
    title: 'After 20K, twice as many always gained as lost',
    takeaway: (v) => ({
      guard: n(v.ratio) >= 1.8 && n(v.ratio) < 2.5 && n(v.up) >= 1.8 * n(v.down) && n(v.up) < 2.5 * n(v.down) && n(v.gain_med_min) > 0.5 && n(v.eds_up_gt_down) === n(v.eds) && n(v.men_eds_up_gt_down) >= 0.95 * n(v.men_eds) && n(v.women_up) > n(v.women_down),
      headline: `In the typical edition, *${pct(n(v.up))}* of finishes gained places at every mat after 20K; ${pct(n(v.down))} lost places at every mat.`,
      fallback: 'How many finishes moved the same way in the finishing order at every mat after 20K.',
    }),
  },
  'in-step-and-close-in-age': {
    title: 'Step for step, and close in age',
    takeaway: (v) => ({
      guard: n(v.ratio) > 2 && n(v.eds_obs_gt_exp) === n(v.eds_100) && n(v.n_pairs) >= 100 && n(v.hump) > 1 && n(v.trough) < 1 && n(v.back) >= 25,
      headline: `Pairs of finishes in step at every mat were within two years in recorded age *${ratio(n(v.ratio), 1)}* as often as pairs level only at the finish.`,
      fallback: 'How far apart in recorded age pairs of finishes in step at every mat were, against pairs level only at the finish.',
    }),
  },
  'in-step-once-in-step-again': {
    title: 'In step once, often in step again',
    takeaway: (v) => ({
      guard: n(v.n_later) >= 100 && n(v.again) >= 0.2 && n(v.again4) >= 0.2 && n(v.ctrl_later) >= 100 && n(v.again) > 20 * n(v.ctrl_again) && n(v.ctrl_again) < n(v.under),
      headline: `When two records linked by name ran in step at every mat, they were in step again in *${pct(n(v.again))}* of the later editions both finished.`,
      fallback: 'How often two records linked by name that ran in step at every mat were in step again in a later edition.',
    }),
  },
};
