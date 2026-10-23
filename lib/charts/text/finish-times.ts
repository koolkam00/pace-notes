import type { ChartText } from '../types';
import { ratio } from '@/lib/nuggets/format';

const n = (v: number | string) => Number(v);

/** The words of the finish-times charts (lib/charts/registry.ts). */
export const FINISH_TIMES_TEXT: Record<string, ChartText> = {
  'minute-before-the-hour': {
    title: 'Finishes pile up just before the hour',
    takeaway: (v) => ({
      guard: n(v.ratio) > 1.2,
      headline: `The minute before 4:00 holds *${ratio(n(v.ratio), 1)}* the finishes of the minute after it.`,
      fallback: 'Finishes minute by minute, from 2:30 to 5:30.',
    }),
  },
};
