import { UnitLink as Link } from '@/components/UnitsProvider';
import PlanFormUnits from './PlanFormUnits';
import KeypadHint from '@/components/KeypadHint';
import Arrow from '@/components/ui/Arrow';
import { CHAPTERS, chapterHref } from '@/lib/chapters';

export type HomeCourse = { slug: string; city: string };

/**
 * The home hero's three ways to start, in one section (styles in app/styles/pages/home.css; the redesign spec, section
 * 7.1). The first, planning the next marathon, is a plain GET form to /tools/plan with the planner's own parameters
 * (course=<slug>|all, goal=H:MM), so it works before the page's JavaScript runs; the planner reads and checks the goal (a
 * keypad's "3.30" too). It is one instrument row of two cells, Course and Goal, over the page's one orange button. Once
 * the script has run, the goal's dot key types a colon (PlanFormUnits). The other two are ordinary links in one quieter
 * style, so the next page view names the home page as the one before it; the form's GET is a full page load, whose page
 * view does not (docs/ANALYTICS.md says how each door is counted). The form is masked in recordings (`.home-plan`,
 * lib/replay-policy.ts); the course and goal go only into the planner's address, which analytics never keeps.
 */
export default function HomeDoors({ courses }: { courses: HomeCourse[] }) {
  return (
    <section className="home-doors" aria-labelledby="home-doors-title" data-track-section="paths">
      <h2 id="home-doors-title" className="sr-only">Three ways to start</h2>
      <form className="home-door home-plan" action={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/tools/plan`} method="get" aria-labelledby="home-plan-title">
        <h3 id="home-plan-title" className="sr-only">Plan your next marathon</h3>
        <div className="home-plan-fields">
          <div className="home-plan-field">
            <label htmlFor="home-plan-course">Course</label>
            <select id="home-plan-course" name="course" defaultValue="all">
              <option value="all">All courses</option>
              {courses.map((c) => <option key={c.slug} value={c.slug}>{c.city}</option>)}
            </select>
          </div>
          <div className="home-plan-field is-goal">
            <span className="home-plan-field-head"><label htmlFor="home-plan-goal">Goal</label><KeypadHint /></span>
            <input id="home-plan-goal" name="goal" inputMode="decimal" autoComplete="off" spellCheck={false} placeholder="4:00" />
          </div>
        </div>
        <PlanFormUnits />
        <button type="submit" className="btn btn-primary is-block home-plan-button">Plan your race</button>
      </form>
      <ul className="home-door-others">
        <li><Link href="/runners" className="home-door home-door-link">Analyze a past race<Arrow /></Link></li>
        <li><Link href={chapterHref(CHAPTERS[0])} className="home-door home-door-link">Read it start to finish<Arrow /></Link></li>
      </ul>
    </section>
  );
}
