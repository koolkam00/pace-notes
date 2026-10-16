import { UnitLink as Link } from '@/components/UnitsProvider';
import { CourseMatched } from '@/components/story/CourseInsights';
import { clock, count, goalText, minutes, pct, type CoursePageData } from '@/lib/course-page';
import { planHref } from '@/lib/tools/links';
import { CourseSection, CourseTable, Fact } from './Fact';

/**
 * "Goal times on {race}": the course chooser's published rows at five goals, a static table with no inputs, then the
 * existing same-pace comparison across courses (dots, no ranks). Every goal links into the planner.
 */
export default function CourseGoals({ page }: { page: CoursePageData }) {
  const { goals, goalsScreened, goalMethod, matched, race, city } = page;
  const tolerance = goalMethod ? Math.round(goalMethod.tolerance * 100) : null;
  // The dek promises five rows only when the table is there; without rows the callout says why, after the method.
  const dek = goals.length
    ? <>For five goal times, the finishes on this course whose 5–20 km pace was within {tolerance ?? 2}% of the goal’s even pace, and how they finished. Observed shares of complete finishes, not a prediction.</>
    : <>Goal rows count the finishes whose 5–20 km pace was within {tolerance ?? 2}% of the goal’s even pace.</>;
  return (
    <CourseSection id="goals" track="chapter-6" kicker="Goal times" title={<>Goal times on the {race}</>} dek={dek}>
      {goalsScreened ? <p className="course-callout">No goal rows are published for this course. {goalsScreened}</p> : goals.length ? (
        <CourseTable id="goals-caption" className="course-goals-table" caption="Finishes at five goal paces on this course and how they finished">
          <thead>
            <tr><th scope="col">Goal</th><th scope="col">Finishes</th><th scope="col">Finished under the goal</th><th scope="col">Sustained slowdown</th><th scope="col">Time lost after 20 km</th><th scope="col">Median finish (10th–90th percentile)</th></tr>
          </thead>
          <tbody>
            {goals.map(({ goal, row, reason }) => (
              <tr key={goal}>
                <th scope="row"><Link href={planHref(city, goal) ?? '/tools/plan'} aria-label={`Plan a ${goalText(goal)} ${race}`}>{goalText(goal)}</Link></th>
                {row ? (
                  <>
                    <td><Fact k={`g.n@${goal}`} v={row.n}>{count(row.n)}</Fact><small className="course-cell-sub"><Fact k={`g.ed@${goal}`} v={row.ed}>{count(row.ed)}</Fact> editions</small></td>
                    <td><Fact k={`g.under@${goal}`} v={row.under}>{pct(row.under)}</Fact></td>
                    <td><Fact k={`g.sd@${goal}`} v={row.sd}>{pct(row.sd)}</Fact></td>
                    <td><Fact k={`g.after20@${goal}`} v={row.after20}>{minutes(row.after20)}</Fact></td>
                    <td><Fact k={`g.p50@${goal}`} v={row.fin[1]}>{clock(row.fin[1])}</Fact><small className="course-cell-sub"><Fact k={`g.p10@${goal}`} v={row.fin[0]}>{clock(row.fin[0])}</Fact>–<Fact k={`g.p90@${goal}`} v={row.fin[2]}>{clock(row.fin[2])}</Fact></small></td>
                  </>
                ) : <td colSpan={5} className="course-reason" data-goal={goal}>{reason}</td>}
              </tr>
            ))}
          </tbody>
        </CourseTable>
      ) : null}
      {goals.length ? <p className="course-note">Each goal opens the race planner. Finishes are chosen by the 5–20 km pace they ran, after the fact. The share under the goal and the finish percentiles pool the editions; the sustained-slowdown share and the time after 20 km count each edition equally.{goalMethod ? ` An edition counts with at least ${goalMethod.minEditionFinishes} such finishes, and a row needs ${goalMethod.minEditions} editions and 100 finishes.` : ''}</p> : null}
      <p className="course-plan-link"><Link href={planHref(city) ?? '/tools/plan'}>Your goal: plan it</Link>. The race planner takes any goal from 1:30 to 8:00 on this course: even-pace splits{goals.length ? ', how finishes at that pace held up here,' : ''} and a pace band to print. <Link href="/tools/course-chooser">Your goal on every course</Link> in the course chooser.</p>
      {matched ? (
        <div className="course-block">
          <CourseMatched city={city} band={matched} />
          <p className="course-note">Each dot is a course with at least 1,000 such finishes over 3 or more editions; {page.display} is marked whatever its size. The dots show observed shares, not an order of merit: courses differ in field, qualifying rules, weather, era and route.</p>
        </div>
      ) : null}
    </CourseSection>
  );
}
