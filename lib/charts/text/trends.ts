import type { ChartText } from '../types';
import { count, inWords, pct, approxWords, ratio, time, delta } from '@/lib/nuggets/format';

void [count, inWords, pct, approxWords, ratio, time, delta];

/** The words of the trends charts (lib/charts/registry.ts). */
export const TRENDS_TEXT: Record<string, ChartText> = {};
