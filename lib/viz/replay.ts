/**
 * The replay's build-time data (server only): for each edition a page replays, the flag (the whole field's first
 * finish), the moment's sentence from the replay.first nugget's rules, and the poster (a 40-point ribbon of the sampled
 * field at the flag, with the share finished the HUD shows there). About 1 KB per edition in the page.
 */
import { readInsight } from '@/lib/insights-server';
import { displayCity } from '@/lib/course-page';
import type { ReplayEditionMeta, ReplayIndex, ReplayRows } from '@/lib/insights';
import type { ReplayChoice } from '@/lib/insights-server';
import { sentenceOf, textFor } from '@/lib/nuggets/core';
import { replayFirstFrom } from '@/lib/nuggets/stories';
import { byFinish, ribbonAt, sharesAt } from '@/components/viz/replay-geometry';
import type { StageChoice } from '@/components/viz/ReplayStage.client';

/** The edition whose field was furthest from 20K at the first finish: the replay.first nugget's own choice. */
export function defaultReplaySlug(choices: { slug: string }[]): string | undefined {
  const { editions } = readInsight<ReplayIndex>('replay.json');
  const slug = String(replayFirstFrom(editions.filter((e) => choices.some((c) => c.slug === e.slug))).values.slug ?? '');
  return choices.find((c) => c.slug === slug)?.slug ?? choices[0]?.slug;
}

/**
 * Each edition a page replays, ready for the stage. With `exact`, each moment's sentence gives its own share in figures
 * ("…, *47%* of the field had not reached 20K."), never the words its headline would use, so a page whose H1 already
 * says "nearly half" reads the number under the replay, for whichever race is picked.
 */
export function stageChoices(choices: ReplayChoice[], { exact = false }: { exact?: boolean } = {}): StageChoice[] {
  const index = new Map<string, ReplayEditionMeta>(readInsight<ReplayIndex>('replay.json').editions.map((e) => [e.slug, e]));
  return choices.map((c) => {
    const meta = index.get(c.slug);
    const rows = readInsight<ReplayRows>(c.file).rows;
    const sorted = byFinish(rows);
    const last = sorted.length ? sorted[sorted.length - 1][8] : 0;
    const flag = meta?.moments?.first_finish_s ?? meta?.first_finish_s ?? (sorted[0]?.[8] ?? 0);
    const shares = sharesAt(rows, flag);
    // The race as pages name it in prose ("New York City 2025"), in its label and its moment's sentence.
    const first = meta ? replayFirstFrom([{ ...meta, city: displayCity(meta.city) }]) : null;
    const moment = first ? (exact ? textFor(first.fallback) : sentenceOf(first)) : '';
    return {
      slug: c.slug, city: c.city, year: c.year, finishes: c.finishes, sample: c.sample, file: c.file, version: c.version, route: c.route,
      race: `${displayCity(c.city)} ${c.year}`, flag_s: flag, moment,
      poster: { flag_s: flag, last_s: last, ribbon: ribbonAt(sorted, flag), finished: Number(shares.finished.toFixed(4)) },
    };
  });
}
