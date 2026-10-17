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
 * "#goals": five goal times from 3:00 to 5:00, one row each, as the section's chart: of 100 finishes on that goal's
 * pace through 20K here, how many made the goal (a bar out of 100, the lead goal in signal). Each goal opens the race
 * planner for this course. The rest of each row's numbers are in "All numbers".
 */
export default function CourseGoals({ page }: { page: CoursePageData }) {
  const { city, race, goals } = page;
  const n = getNugget('course.goal', { city });
  return (
    <CourseSection id="goals" track="chapter-6" beat="Goals" title={<Said nugget={n} />}>
      {goals.length ? (
        <CourseTable id="goals-caption" captionHidden className="course-goals-table" caption={`Of finishes on each goal's pace through 20K in the ${race}, the share that made the goal`}>
          <thead className="sr-only"><tr><th scope="col">Goal</th><th scope="col">Made the goal, out of 100</th><th scope="col">Made the goal</th></tr></thead>
          <tbody>
            {goals.map(({ goal, row }) => (
              <tr key={goal} className={goal === LEAD_GOAL ? 'is-lead' : undefined}>
                <th scope="row"><Link href={planHref(city, goal) ?? '/tools/plan'} aria-label={`Plan a ${goalText(goal)} ${race}`}>{goalText(goal)}<Arrow /></Link></th>
                {row ? (
                  <>
                    <td className="goal-bar" aria-hidden="true"><span style={{ width: `${Math.max(0.5, row.under * 100).toFixed(1)}%` }} /></td>
                    <td className="goal-value"><Fact k={`g.under.r@${goal}`} v={row.under}>{pct(row.under)}</Fact></td>
                  </>
                ) : <td colSpan={2} className="course-reason" data-goal={goal}>{GOAL_GAP}</td>}
              </tr>
            ))}
          </tbody>
        </CourseTable>
      ) : null}
    </CourseSection>
  );
}
