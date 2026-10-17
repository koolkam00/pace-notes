import ReplayStage from '@/components/viz/ReplayStage.client';
import type { ReplayChoice } from '@/lib/insights-server';
import { defaultReplaySlug, stageChoices } from '@/lib/viz/replay';

export type { ReplayChoice };

/**
 * A race replay on a page (the redesign spec, sections 3.6 and 7.1). A server component: it draws each edition's poster
 * and moment at build and hands them to the stage, whose canvas code loads only here. With no `initial`, the replay
 * opens on the edition the data picks (the replay.first nugget's argmax), never on a city named in code.
 *
 * `band` is the compact home-page band (no picker). `picker` shows the race chips (default: when there is more than one
 * race) and `layout` the "The field | On the route" toggle (default: on, where the edition has a route).
 */
export default function HeroReplay({ choices, initial, band = false, picker, layout = true }: {
  choices: ReplayChoice[]; initial?: string; band?: boolean; picker?: boolean; layout?: boolean;
}) {
  if (!choices.length) return null;
  const stage = stageChoices(choices);
  const start = initial && stage.some((c) => c.slug === initial) ? initial : defaultReplaySlug(stage)!;
  return <ReplayStage choices={stage} initial={start} band={band} picker={picker ?? (!band && stage.length > 1)} layout={layout && !band} />;
}
