import { UnitLink as Link } from '@/components/UnitsProvider';
import { EvidenceTag, ScopeTag } from '@/components/tools/EvidenceTag';
import ArrowTail from '@/components/ui/ArrowTail';
import { withEm } from '@/components/ui/withEm';
import type { HalfGoal } from '@/lib/half-types';
import { NOT_A_PREDICTION, goalLines } from '@/lib/tools/half-to-full';

/**
 * A goal page's "The half marathon before" panel: a heading that names the half near H and states no reading (H is where
 * the typical marathon crosses the goal; the share under the goal it had led with followed no guard, round 4 review,
 * October 31, 2026), then the window's typical marathon and its middle 8 in 10, "Not a prediction." and the predictor at
 * H (the recorded women's and men's boundaries side by side read as a sex difference no guard holds; round 5). It says "half marathon" wherever it
 * means the race: the page's hero prints the goal's halfway time, so a bare "1:48 half" could read as halfway in 1:48.
 * Every line is lib/tools/half-to-full.ts goalLines, which verify-tools checks against the data. Drawn on the server and
 * handed to GoalPaceBody (a client component) as a node, so the goal pages ship none of it as script.
 */
export default function HalfBefore({ goal }: { goal: HalfGoal }) {
  const lines = goalLines(goal);
  return (
    <section className="tool-panel goal-pace-half" id="goal-pace-half" data-half-scope="linked" aria-labelledby="goal-pace-half-title">
      <p className="goal-pace-half-tags"><EvidenceTag kind="data" /><ScopeTag /></p>
      <p className="goal-pace-half-kicker">The half marathon before</p>
      <h2 className="tool-nugget-text" id="goal-pace-half-title">{withEm(lines.lead)}</h2>
      <p className="tool-panel-meta">Half and marathon <Link href="/methodology#half-linking" className="term-link">records linked by name</Link>, the half 3 to 16 weeks before.</p>
      <p className="goal-pace-half-lines">{lines.range}</p>
      <p className="goal-pace-half-not">{NOT_A_PREDICTION}</p>
      <p className="goal-pace-half-more arrow-line"><Link href={lines.link}><ArrowTail text={lines.linkText} /></Link></p>
    </section>
  );
}
