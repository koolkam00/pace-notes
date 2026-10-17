import { UnitLink as Link } from '@/components/UnitsProvider';
import { CourseMatched } from '@/components/story/CourseInsights';
import { clock, count, goalText, minutes, pct, type CoursePageData } from '@/lib/course-page';
import { planHref } from '@/lib/tools/links';
import { CourseSection, CourseTable, Fact } from './Fact';

/** A goal the course chooser publishes no row for. */
export const GOAL_GAP = 'Too few finishes at this pace.';

/**
 * "Goal times on {race}": the course chooser's published rows at five goals, a static table with no inputs, then the
 * existing same-pace comparison across courses (dots, no ranks). Every goal links into the planner.
 */
export default function CourseGoals({ page }: { page: CoursePageData }) {
  const { goals, goalsScreened, matched, race, city } = page;
  // The dek promises five rows only when the table is there.
  const dek = goals.length ? <>For five goal times: how finishes on goal pace through 20 km finished on this course. Not a prediction.</> : undefined;
  return (
    <CourseSection id="goals" track="chapter-6" kicker="Goal times" title={<>Goal times on the {race}</>} dek={dek}>
      {goalsScreened ? <p className="course-callout">No goal times are shown for this course.</p> : goals.length ? (
        <CourseTable id="goals-caption" className="course-goals-table" caption="Finishes at five goal paces on this course and how they finished">
          <thead>
            <tr><th scope="col">Goal</th><th scope="col">Finishes</th><th scope="col">Finished under the goal</th><th scope="col">Sustained slowdown</th><th scope="col">Time lost after 20 km</th><th scope="col">Median finish (10th–90th percentile)</th></tr>
          </thead>
          <tbody>
            {goals.map(({ goal, row }) => (
              <tr key={goal}>
                <th scope="row"><Link href={planHref(city, goal) ?? '/tools/plan'} aria-label={`Plan a ${goalText(goal)} ${race}`}>{goalText(goal)}</Link></th>
                {row ? (
                  <>
                    <td><Fact k={`g.n@${goal}`} v={row.n}>{count(row.n)}</Fact></td>
                    <td><Fact k={`g.under@${goal}`} v={row.under}>{pct(row.under)}</Fact></td>
                    <td><Fact k={`g.sd@${goal}`} v={row.sd}>{pct(row.sd)}</Fact></td>
                    <td><Fact k={`g.after20@${goal}`} v={row.after20}>{minutes(row.after20)}</Fact></td>
                    <td><Fact k={`g.p50@${goal}`} v={row.fin[1]}>{clock(row.fin[1])}</Fact><small className="course-cell-sub"><Fact k={`g.p10@${goal}`} v={row.fin[0]}>{clock(row.fin[0])}</Fact>–<Fact k={`g.p90@${goal}`} v={row.fin[2]}>{clock(row.fin[2])}</Fact></small></td>
                  </>
                ) : <td colSpan={5} className="course-reason" data-goal={goal}>{GOAL_GAP}</td>}
              </tr>
            ))}
          </tbody>
        </CourseTable>
      ) : null}
      {goals.length ? <p className="course-note">Each goal opens the race planner.</p> : null}
      <p className="course-plan-link"><Link href={planHref(city) ?? '/tools/plan'}>Your goal: plan it</Link>. The race planner takes any goal from 1:30 to 8:00 on this course: even-pace splits{goals.length ? ', how finishes at that pace held up here,' : ''} and a pace band to print. <Link href="/tools/course-chooser">Your goal on every course</Link> in the course chooser.</p>
      {matched ? (
        <div className="course-block">
          <CourseMatched city={city} band={matched} />
          <p className="course-note">The dots show observed shares, not an order of merit.</p>
        </div>
      ) : null}
    </CourseSection>
  );
}
