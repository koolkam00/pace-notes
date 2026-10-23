import type { ChartText } from '../types';
import { count, inWords, pct, approxWords, ratio, time, delta } from '@/lib/nuggets/format';

void [count, inWords, pct, approxWords, ratio, time, delta];

/** The words of the people charts (lib/charts/registry.ts). */
export const PEOPLE_TEXT: Record<string, ChartText> = {};
