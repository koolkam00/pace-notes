import { UnitLink as Link } from '@/components/UnitsProvider';
import { MONTHS, type CoursePageData } from '@/lib/course-page';
import { courseSlug } from '@/lib/tools/links';
import { CourseSection } from './Fact';

const named = (city: string) => (city === 'New York' ? 'New York City' : city);

/** "Other courses": the alphabetical neighbours and the courses run in the same month. No similarity or difficulty labels. */
export default function CourseOthers({ page, total }: { page: CoursePageData; total: number }) {
  const { neighbours, sameMonth, display } = page;
  return (
    <CourseSection id="other-courses" track="related" kicker="More courses" title="Other courses">
      {neighbours.length ? (
        <div className="course-others">
          <p className="course-others-label">Next to {display} in the alphabetical list</p>
          <ul>{neighbours.map((city) => <li key={city}><Link href={`/courses/${courseSlug(city)}`}>{named(city)}</Link></li>)}</ul>
        </div>
      ) : null}
      {sameMonth.map(({ month, cities }) => (
        <div className="course-others" key={month}>
          <p className="course-others-label">Also run in {MONTHS[month - 1]}</p>
          <ul>{cities.map((city) => <li key={city}><Link href={`/courses/${courseSlug(city)}`}>{named(city)}</Link></li>)}</ul>
        </div>
      ))}
      <p className="course-note"><Link href="/courses">All {total} courses</Link>, in alphabetical order.</p>
    </CourseSection>
  );
}
