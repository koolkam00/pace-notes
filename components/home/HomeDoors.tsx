import { UnitLink as Link } from '@/components/UnitsProvider';
import PlanFormUnits from './PlanFormUnits';

export type HomeCourse = { slug: string; city: string };

/**
 * The home hero's three ways to start, in one section (styles in app/story.css). The first, planning the next marathon,
 * is a plain GET form to /tools/plan with the planner's own parameters (course=<slug>|all, goal=H:MM), so it works
 * before the page's JavaScript runs; the planner reads and checks the goal. Its orange button is the page's primary
 * action. The other two are ordinary links in one quieter style, so the next page view says which way a visitor went.
 * The form is masked in recordings (`.home-plan`, lib/replay-policy.ts); the course and goal go only into the
 * planner's address, which analytics never keeps.
 */
export default function HomeDoors({ courses, storyCount, analysisCount }: { courses: HomeCourse[]; storyCount: string; analysisCount: string }) {
  return (
    <section className="home-doors" aria-labelledby="home-doors-title" data-track-section="paths">
      <h2 id="home-doors-title" className="sr-only">Three ways to start</h2>
      <form className="home-door home-plan" action="/tools/plan" method="get" aria-labelledby="home-plan-title">
        <h3 id="home-plan-title" className="home-door-title">Plan your next marathon</h3>
        <div className="home-plan-fields">
          <div className="home-plan-field">
            <label htmlFor="home-plan-course">Course</label>
            <select id="home-plan-course" name="course" defaultValue="all">
              <option value="all">All courses</option>
              {courses.map((c) => <option key={c.slug} value={c.slug}>{c.city}</option>)}
            </select>
          </div>
          <div className="home-plan-field">
            <label htmlFor="home-plan-goal">Goal time</label>
            <input id="home-plan-goal" name="goal" inputMode="decimal" autoComplete="off" spellCheck={false} placeholder="4:00" />
          </div>
        </div>
        <PlanFormUnits />
        <button type="submit" className="button-accent home-plan-button">Plan your race</button>
      </form>
      <ul className="home-door-others">
        <li>
          <Link href="/runners" className="home-door home-door-link" style={{ ['--door' as string]: 'var(--gold)' }}>
            <span className="home-door-title">Analyze a past race</span>
            <span className="home-door-hint">Find it in the results, paste your splits, or start from your finish time.</span>
            <span className="home-door-go" aria-hidden="true">→</span>
          </Link>
        </li>
        <li>
          <Link href="/research" className="home-door home-door-link" style={{ ['--door' as string]: 'var(--blue)' }}>
            <span className="home-door-title">Explore the research</span>
            <span className="home-door-hint">{storyCount} stories, {analysisCount} analyses, open data.</span>
            <span className="home-door-go" aria-hidden="true">→</span>
          </Link>
        </li>
      </ul>
    </section>
  );
}
