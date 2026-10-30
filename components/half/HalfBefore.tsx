import { UnitLink as Link } from '@/components/UnitsProvider';
import { EvidenceTag, ScopeTag } from '@/components/tools/EvidenceTag';
import Arrow from '@/components/ui/Arrow';
import { withEm } from '@/components/ui/withEm';
import type { HalfGoal } from '@/lib/half-types';
import { readHalf } from '@/lib/half-server';
import { NOT_A_PREDICTION, goalLines } from '@/lib/tools/half-to-full';

/**
 * A goal page's "The half marathon before" panel: after a half marathon near H, the share of marathons under the goal
 * (just over half: H is where the typical marathon crosses the goal); the middle 8 in 10; the recorded women's and men's
 * boundaries where both have a window; "Not a prediction."; and the predictor at H. It says "half marathon" wherever it
 * means the race: the page's hero prints the goal's halfway time, so a bare "1:48 half" could read as halfway in 1:48.
 * Every line is lib/tools/half-to-full.ts goalLines, which verify-tools checks against the data. Drawn on the server and
 * handed to GoalPaceBody (a client component) as a node, so the goal pages ship none of it as script.
 */
export default function HalfBefore({ goal }: { goal: HalfGoal }) {
  // The window at H, whose published mark at the goal gives the lead its share.
  const lines = goalLines(goal, readHalf('linked.json').windows.all.find((w) => w.h === goal.all.h) ?? null);
  return (
    <section className="tool-panel goal-pace-half" id="goal-pace-half" data-half-scope="linked" aria-labelledby="goal-pace-half-title">
      <p className="goal-pace-half-tags"><EvidenceTag kind="data" /><ScopeTag /></p>
      <p className="goal-pace-half-kicker">The half marathon before</p>
      <h2 className="tool-nugget-text" id="goal-pace-half-title">{withEm(lines.lead)}</h2>
      <p className="tool-panel-meta">Half and marathon <Link href="/methodology#half-linking" className="term-link">records linked by name</Link>, the half 3 to 16 weeks before.</p>
      <p className="goal-pace-half-lines">{lines.range}</p>
      {lines.sexes ? <p className="goal-pace-half-lines">{lines.sexes}</p> : null}
      <p className="goal-pace-half-not">{NOT_A_PREDICTION}</p>
      <p className="goal-pace-half-more"><Link href={lines.link}>{lines.linkText}<Arrow /></Link></p>
    </section>
  );
}
