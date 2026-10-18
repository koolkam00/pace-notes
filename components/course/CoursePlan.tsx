import Arrow from '@/components/ui/Arrow';
import { UnitLink as Link } from '@/components/UnitsProvider';
import { EvidenceTag } from '@/components/tools/EvidenceTag';
import { shortName, standardByKey } from '@/components/tools/QualifyingRaceText';
import type { CoursePageData } from '@/lib/course-page';
import { planHref } from '@/lib/tools/links';
import { CourseSection } from './Fact';

/**
 * "Plan your {city}": the tools that take this course, as one list of rows: the planner, the pace band and the split
 * check (with the course preset where the pace band publishes it), and the official qualifying standards for the six
 * races that have them.
 */
export default function CoursePlan({ page }: { page: CoursePageData }) {
  const { city, slug, display, band, qualifyingKey } = page;
  const standard = qualifyingKey ? standardByKey(qualifyingKey) : undefined;
  const rows = [
    { href: planHref(city) ?? '/tools/plan', title: 'Plan your race' },
    ...(band ? [{ href: `/tools/pace-band?course=${slug}`, title: 'Make a pace band' }] : []),
    { href: band ? `/tools/split-check?course=${slug}` : '/tools/split-check', title: 'Check your splits' },
  ];
  return (
    <CourseSection id="plan" track="cta" beat="Plan" title={<>Plan <em>your</em> {display}.</>}>
      <ul className="course-links">
        {rows.map((r) => <li key={r.href}><Link href={r.href} className="course-link"><span>{r.title}</span><Arrow /></Link></li>)}
        {standard ? (
          <li><Link href={`/tools/qualifying/${standard.key}`} className="course-link"><span>{shortName(standard)} qualifying times<EvidenceTag kind="official" link={false} /></span><Arrow /></Link></li>
        ) : null}
      </ul>
    </CourseSection>
  );
}
