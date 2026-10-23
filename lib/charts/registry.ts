/**
 * The words of the Top 100 charts: each chart's title and takeaway from lib/charts/text/<theme>.ts, rendered with the
 * chart's own values. Pages, the cards (scripts/build-chart-cards.cjs), the nuggets and scripts/verify-charts.cjs all read
 * them through chartWords, so the sentence on the card is the sentence the verifier checked.
 */
import type { CatalogItem, ChartFile, ChartText } from './types';
import { FINISH_TIMES_TEXT } from './text/finish-times';
import { PACING_TEXT } from './text/pacing';
import { RACING_TEXT } from './text/racing';
import { COURSES_TEXT } from './text/courses';
import { PEOPLE_TEXT } from './text/people';
import { TRENDS_TEXT } from './text/trends';

export const CHART_TEXT: Record<string, ChartText> = {};
for (const group of [FINISH_TIMES_TEXT, PACING_TEXT, RACING_TEXT, COURSES_TEXT, PEOPLE_TEXT, TRENDS_TEXT]) {
  for (const [slug, text] of Object.entries(group)) {
    if (CHART_TEXT[slug]) throw new Error(`Chart words for ${slug} are registered twice.`);
    CHART_TEXT[slug] = text;
  }
}

export type ChartWords = {
  title: string;
  /** The takeaway with its one *…* accent (the guard holds), or the neutral fallback. */
  headline: string;
  /** The takeaway without the accent marks: the chart's accessible name and the start of its description. */
  plain: string;
  fallback: string;
  description: string;
  guard: boolean;
};

const plainOf = (text: string) => text.replace(/\*/g, '');

export function chartWords(item: CatalogItem, file: ChartFile): ChartWords {
  const text = CHART_TEXT[item.slug];
  if (!text) throw new Error(`No words registered for chart ${item.slug}.`);
  const t = text.takeaway(file.values);
  const headline = t.guard ? t.headline : t.fallback;
  const plain = plainOf(headline);
  return { title: text.title, headline, plain, fallback: t.fallback, description: text.description ? text.description(file.values) : plain, guard: t.guard };
}
