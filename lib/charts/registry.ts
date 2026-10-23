/**
 * The words of the Top 100 charts: each chart's title and takeaway from lib/charts/text/<module>.ts, rendered with the
 * chart's own values. Pages, the cards (scripts/build-chart-cards.cjs), the nuggets and scripts/verify-charts.cjs all read
 * them through chartWords, so the sentence on the card is the sentence the verifier checked.
 */
import type { CatalogItem, ChartFile, ChartText } from './types';
import { typo } from './typo';
import { CHARTS_FINISH_TIMES_1_TEXT } from './text/charts_finish_times_1';
import { CHARTS_FINISH_TIMES_2_TEXT } from './text/charts_finish_times_2';
import { CHARTS_PACING_1_TEXT } from './text/charts_pacing_1';
import { CHARTS_PACING_2_TEXT } from './text/charts_pacing_2';
import { CHARTS_RACING_1_TEXT } from './text/charts_racing_1';
import { CHARTS_RACING_2_TEXT } from './text/charts_racing_2';
import { CHARTS_COURSES_1_TEXT } from './text/charts_courses_1';
import { CHARTS_COURSES_2_TEXT } from './text/charts_courses_2';
import { CHARTS_PEOPLE_1_TEXT } from './text/charts_people_1';
import { CHARTS_PEOPLE_2_TEXT } from './text/charts_people_2';
import { CHARTS_TRENDS_1_TEXT } from './text/charts_trends_1';
import { CHARTS_TRENDS_2_TEXT } from './text/charts_trends_2';
import { CHARTS_MORE_TEXT } from './text/charts_more';

export const CHART_TEXT: Record<string, ChartText> = {};
for (const group of [CHARTS_FINISH_TIMES_1_TEXT, CHARTS_FINISH_TIMES_2_TEXT, CHARTS_PACING_1_TEXT, CHARTS_PACING_2_TEXT, CHARTS_RACING_1_TEXT, CHARTS_RACING_2_TEXT, CHARTS_COURSES_1_TEXT, CHARTS_COURSES_2_TEXT, CHARTS_PEOPLE_1_TEXT, CHARTS_PEOPLE_2_TEXT, CHARTS_TRENDS_1_TEXT, CHARTS_TRENDS_2_TEXT, CHARTS_MORE_TEXT]) {
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
  const fallback = typo(t.fallback);
  const headline = t.guard ? typo(t.headline) : fallback;
  const plain = plainOf(headline);
  return { title: typo(text.title), headline, plain, fallback, description: text.description ? typo(text.description(file.values)) : plain, guard: t.guard };
}
