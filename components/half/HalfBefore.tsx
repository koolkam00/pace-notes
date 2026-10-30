import { UnitLink as Link } from '@/components/UnitsProvider';
import { EvidenceTag, ScopeTag } from '@/components/tools/EvidenceTag';
import Arrow from '@/components/ui/Arrow';
import { withEm } from '@/components/ui/withEm';
import type { HalfGoal } from '@/lib/half-types';
import { NOT_A_PREDICTION, floorHM, goalLines } from '@/lib/tools/half-to-full';

/**
 * A goal page's "The half before" panel: after a half near H, the typical marathon came in under the goal; the middle
 * 8 in 10; the recorded women's and men's halves where both have a window; "Not a prediction."; and the predictor at H.
 * Every line is lib/tools/half-to-full.ts goalLines, which verify-tools checks against the data. Drawn on the server and
 * handed to GoalPaceBody (a client component) as a node, so the goal pages ship none of it as script.
 */
export default function HalfBefore({ goal }: { goal: HalfGoal }) {
  const lines = goalLines(goal);
  const H = floorHM(goal.all.h);
  return (
    <section className="tool-panel goal-pace-half" id="goal-pace-half" data-half-scope="linked" aria-labelledby="goal-pace-half-title">
      <p className="goal-pace-half-tags"><EvidenceTag kind="data" /><ScopeTag /></p>
      <p className="goal-pace-half-kicker">The half before</p>
      <h2 className="tool-nugget-text" id="goal-pace-half-title">{withEm(lines.lead)}</h2>
      <p className="tool-panel-meta">Half and marathon <Link href="/methodology#half-linking" className="term-link">records linked by name</Link>, the half 3 to 16 weeks before.</p>
      <p className="goal-pace-half-lines">{lines.range}{lines.sexes ? <><br />{lines.sexes}</> : null}</p>
      <p className="goal-pace-half-not">{NOT_A_PREDICTION}</p>
      <p className="goal-pace-half-more"><Link href={lines.link}>The marathons after a {H} half<Arrow /></Link></p>
    </section>
  );
}
