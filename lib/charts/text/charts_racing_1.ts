import type { ChartText } from '../types';
import { count, pct, time } from '@/lib/nuggets/format';

const n = (v: number | string) => Number(v);
/** A gap in whole and half minutes, for prose: 270 → "4½ minutes" (the margins come in 30-second bins). */
const halfMinutes = (s: number) => { const h = Math.round(s / 30); return `${Math.floor(h / 2)}${h % 2 ? '½' : ''} minutes`; };

/** The words of the racing charts in this module (titles and takeaways). */
export const CHARTS_RACING_1_TEXT: Record<string, ChartText> = {
  'when-the-front-1-percent-finish': {
    title: "In the quickest 1%'s time, most were shy of 30K",
    takeaway: (v) => ({
      guard: n(v.past30) < 0.5 && n(v.past25) > 0.5 && n(v.eds) >= 20 && n(v.n_min) >= 100,
      headline: `In the typical edition, only *${pct(n(v.past30))}* of finishes reached 30K within the time the quickest 1% took to finish (about ${time(n(v.t1), 'h:mm')}).`,
      fallback: 'The share of finishes that reached each mat within the running time of the quickest 1%.',
    }),
  },
  'women-move-up-after-20k': {
    title: "After 20K, women's finishes gained on men's",
    takeaway: (v) => ({
      guard: n(v.sfin) - n(v.s20) > 0.01 && Math.abs(n(v.s20) - n(v.s5)) < 0.01 && n(v.eds_up) >= 0.9 * n(v.eds) && n(v.n_min) >= 100,
      headline: `In the typical edition, women's finishes were ahead in ${pct(n(v.s20))} of woman–man pairs at 20K and *${pct(n(v.sfin))}* at the finish; up in ${n(v.eds_up) === n(v.eds) ? 'all' : `${count(n(v.eds_up))} of`} ${count(n(v.eds))} editions.`,
      fallback: "The share of woman–man pairs of finishes with the woman ahead, at each mat.",
    }),
  },
  'pairs-in-step-split-up': {
    title: 'Most quick pairs in step at 20K split by 25K',
    takeaway: (v) => {
      const parts = [0, 1, 2, 3, 4].map((j) => n(v[`part${j}`]));
      return {
        guard: n(v.apart25) > 0.5 && n(v.apart25) === n(v.top_part) && Math.max(...parts) === parts[0] && n(v.fast) < 0.01 && n(v.n_fast) >= 100,
        headline: `Of pairs of finishes in step through 20K on splits for a 2:45–3:15 finish, *${pct(n(v.apart25), 1)}* were apart by 25K; ${pct(n(v.fast), 1)} stayed in step to the finish.`,
        fallback: 'Pairs of finishes in step through 20K on quick splits, and where they parted.',
      };
    },
  },
  'leads-overturned': {
    title: 'Gaps of 5–10 minutes at 20K still flipped',
    takeaway: (v) => ({
      guard: n(v.p20) > 0.05 && n(v.p20) < 0.5 && n(v.p20_1) > 2 * n(v.p20) && n(v.pairs_min) >= 100,
      headline: `In the typical edition, *${pct(n(v.p20))}* of pairs of finishes 5–\u206010 minutes apart at 20K ended in the reverse order; under 1 minute apart, ${pct(n(v.p20_1))}.`,
      fallback: 'Pairs of finishes in the same edition, by their gap at 20K and whether the order held.',
    }),
  },
  'time-in-hand-for-4': {
    title: 'On 4:00 splits at 20K, most finished over 4:00',
    takeaway: (v) => ({
      guard: n(v.on) < 0.3 && n(v.half20) >= 60 && n(v.half20) % 30 === 0 && n(v.n_on) >= 100,
      headline: `Of finishes on 4:00 splits at 20K, only *${pct(n(v.on))}* finished under 4:00; of those ${halfMinutes(n(v.half20))} ahead, half did.`,
      fallback: 'Finishes under 4:00, by their margin on 4:00 splits at each mat.',
    }),
  },
  'slowing-that-still-gained': {
    title: 'Further back, more slowing still gained places',
    takeaway: (v) => ({
      guard: n(v.back) > n(v.front) && n(v.cross) > 0.05 && n(v.cross) < 0.2 && n(v.back) > n(v.typical) && n(v.front) < n(v.typical),
      headline: `From the back tenth at 20K, finishes with 20–\u206040K up to *${pct(n(v.back), 1)}* slower than 0–\u206020K still gained places in the median; front tenth, ${pct(n(v.front), 1)}.`,
      fallback: 'The slowing after 20K at which the median finish stopped gaining places by 40K, by place at 20K.',
    }),
  },
  'matched-at-every-mat': {
    title: 'Slower finishes more often in step at every mat',
    takeaway: (v) => ({
      guard: n(v.slow) > 3 * n(v.fast) && n(v.slow) === n(v.top),
      headline: `*${pct(n(v.slow), 1)}* of 5:30–6:00 finishes were in step with another at every mat; under 3:00, ${pct(n(v.fast), 1)}.`,
      fallback: 'Finishes in step with another finish at every mat, by finish band.',
    }),
  },
};
