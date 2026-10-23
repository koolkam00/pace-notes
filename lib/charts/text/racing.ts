import type { ChartText } from '../types';
import { pct } from '@/lib/nuggets/format';

const n = (v: number | string) => Number(v);

/** The words of the racing charts (lib/charts/registry.ts). */
export const RACING_TEXT: Record<string, ChartText> = {
  'quarter-at-20k': {
    title: 'Where a finish stood at 20K, it mostly stayed',
    takeaway: (v) => ({
      guard: n(v.front_stay) > 0.5,
      headline: `*${pct(n(v.front_stay))}* of finishes in the front quarter of their race at 20K were still there at the finish.`,
      fallback: 'Each quarter of the field at 20K, and where it finished.',
    }),
  },
};
