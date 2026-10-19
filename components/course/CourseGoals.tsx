import Arrow from '@/components/ui/Arrow';
import { UnitLink as Link } from '@/components/UnitsProvider';
import { getNugget } from '@/lib/nuggets';
import { LEAD_GOAL } from '@/lib/nuggets/courses';
import { pct } from '@/lib/nuggets/format';
import { goalText, type CoursePageData } from '@/lib/course-page';
import { planHref } from '@/lib/tools/links';
import { CourseSection, CourseTable, Fact, Said } from './Fact';

/** A goal the course chooser publishes no row for. */
export const GOAL_GAP = 'Too few finishes at this pace.';

/**
 * "#goals": five goal times from 3:00 to 5:00, one row each, as the section's chart: of finishes on that goal's pace
 * through 20K here, the share that made the goal (a bar, the lead goal in signal), and across every course (a hollow
 * ring on the bar, as the pacing rows draw every course). The bars run to the round ten above the largest share, its end
 * labelled under them, so a gap of a few points between bar and ring reads (every share is under a third). Each row
 * opens the race planner for this course at its goal, its arrow at the row's end. The rest of each row's numbers are in
 * "All numbers".
 */
export default function CourseGoals({ page }: { page: CoursePageData }) {
  const { city, race, display, goals } = page;
  const n = getNugget('course.goal', { city });
  if (!goals.length) return null;
  const top = Math.max(0.1, Math.ceil(Math.max(...goals.flatMap((g) => [g.row?.under ?? 0, g.every?.under ?? 0])) * 10) / 10);
  const at = (share: number) => `${Math.min(100, (share / top) * 100).toFixed(1)}%`;
  return (
    <CourseSection id="goals" track="chapter-6" beat="Goals" title={<Said nugget={n} />}>
      <CourseTable id="goals-caption" captionHidden className="course-goals-table" caption={`Of finishes on each goal's pace through 20K in the ${race}, the share that made the goal`}>
        <thead className="sr-only"><tr><th scope="col">Goal</th><th scope="col">Made the goal, out of 100 (all the courses ringed)</th><th scope="col">Made the goal</th><td /></tr></thead>
        <tbody>
          {goals.map(({ goal, row, every }) => (
            <tr key={goal} className={goal === LEAD_GOAL ? 'is-lead' : undefined}>
              <th scope="row"><Link href={planHref(city, goal) ?? '/tools/plan'} aria-label={`Plan a ${goalText(goal)} ${race}`}>{goalText(goal)}</Link></th>
              {row ? (
                <>
                  <td className="goal-bar" aria-hidden="true">
                    <span style={{ width: `max(4px, ${at(row.under)})` }} />
                    {every ? <i className="goal-every" style={{ left: at(every.under) }} /> : null}
                  </td>
                  <td className="goal-value"><Fact k={`g.under.r@${goal}`} v={row.under}>{pct(row.under)}</Fact></td>
                </>
              ) : <td colSpan={2} className="course-reason" data-goal={goal}>{GOAL_GAP}</td>}
              {/* The row is the link (its goal's, stretched over it); the arrow ends the row, as the plan rows' do. */}
              <td className="goal-go" aria-hidden="true"><Arrow /></td>
            </tr>
          ))}
        </tbody>
        <tfoot aria-hidden="true">
          {/* The scale is a label, so a header cell: the body's cells hold only checked figures. */}
          <tr className="goal-axis"><td /><th className="goal-axis-track"><span className="goal-axis-ends"><span>0%</span><span>{pct(top)}</span></span></th><td colSpan={2} /></tr>
        </tfoot>
      </CourseTable>
      {goals.some((g) => g.row && g.every) ? (
        <ul className="course-rows-key course-goals-key" aria-hidden="true">
          <li><i className="course-key-bar" />{display}</li>
          <li><i className="course-key-ring" />{(() => { const pooled = goals.find((g) => g.every)?.every; return pooled ? `${pooled.courses} courses` : 'Every course'; })()}</li>
        </ul>
      ) : null}
    </CourseSection>
  );
}
