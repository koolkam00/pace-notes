import { Fragment } from 'react';
import { UnitLink as Link } from '@/components/UnitsProvider';
import { EvidenceTag } from '@/components/tools/EvidenceTag';
import { standardByKey } from '@/components/tools/QualifyingRaceText';
import type { CoursePageData } from '@/lib/course-page';

/**
 * The tools that take this course, as one quiet row of inline links after the race's last finding (no heading: the
 * planner is the hero's one action, and a heading over a list without it promised the wrong thing): the pace band and
 * the split check (with the course preset where the pace band publishes it), and the official qualifying standards for
 * the six races that have them, labelled as such. Marked for section_viewed as the page's cta.
 */
export default function CoursePlan({ page }: { page: CoursePageData }) {
  const { slug, display, band, qualifyingKey } = page;
  const standard = qualifyingKey ? standardByKey(qualifyingKey) : undefined;
  const links = [
    ...(band ? [{ href: `/tools/pace-band?course=${slug}`, title: 'Pace band' }] : []),
    { href: band ? `/tools/split-check?course=${slug}` : '/tools/split-check', title: 'Check your splits' },
    ...(standard ? [{ href: `/tools/qualifying/${standard.key}`, title: 'Qualifying times' }] : []),
  ];
  return (
    <section id="plan" tabIndex={-1} className="course-foot" aria-label={`Tools for ${display}`} data-track-section="cta">
      <p className="course-foot-line">
        {links.map((l, i) => (
          <Fragment key={l.href}>
            {i ? <span className="course-foot-sep" aria-hidden="true"> · </span> : null}
            <Link href={l.href} className="course-foot-link">{l.title}</Link>
            {standard && l.href.startsWith('/tools/qualifying/') ? <> <EvidenceTag kind="official" link={false} /></> : null}
          </Fragment>
        ))}
      </p>
    </section>
  );
}
