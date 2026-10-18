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
 * race), `layout` the "The field | On the route" toggle (default: on, where the edition has a route) and `moment` the
 * flag frame's sentence.
 */
export default function HeroReplay({ choices, initial, band = false, picker, layout = true, moment = true }: {
  choices: ReplayChoice[]; initial?: string; band?: boolean; picker?: boolean; layout?: boolean;
  /** The flag frame's sentence under the field; off where the page's own headline already says it. */
  moment?: boolean;
}) {
  if (!choices.length) return null;
  const stage = stageChoices(choices).map((c) => (moment ? c : { ...c, moment: '' }));
  const start = initial && stage.some((c) => c.slug === initial) ? initial : defaultReplaySlug(stage)!;
  return <ReplayStage choices={stage} initial={start} band={band} picker={picker ?? (!band && stage.length > 1)} layout={layout && !band} />;
}
