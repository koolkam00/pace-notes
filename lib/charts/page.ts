/**
 * What a chart's page shows, decided in one place so the page and scripts/verify-charts.cjs cannot disagree: the words
 * (lib/charts/registry.ts), the spec the chart and its table are drawn from, and the share card the page links.
 * While the takeaway's guard holds these are the chart's own. While it does not, every slot falls back (AGENTS rule
 * 13): the words are the neutral title and the fallback sentence, the spec carries no mark of the reading
 * (lib/charts/neutral.ts) and there is no card to link, since scripts/build-chart-cards.cjs withdraws it.
 */
import { neutralSpec } from './neutral';
import { chartWords, type ChartWords } from './registry';
import type { ChartSpec } from './spec';
import type { CatalogItem, ChartFile } from './types';

export type ChartPageState = {
  words: ChartWords;
  /** The spec of the drawing and of its table twin. */
  plot: ChartSpec;
  /** The address of the share card ("Save the image"), or null when the card is withdrawn. */
  card: string | null;
};

export const chartCardPath = (number: number) => `/charts/cards/${number}.png`;

export function chartPageState(item: CatalogItem, file: ChartFile): ChartPageState {
  const words = chartWords(item, file);
  return { words, plot: words.guard ? file.plot : neutralSpec(file.plot), card: words.guard ? chartCardPath(item.number) : null };
}
