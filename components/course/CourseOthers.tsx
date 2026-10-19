import { Fragment } from 'react';
import ChapterEnd from '@/components/ChapterEnd';
import { UnitLink as Link } from '@/components/UnitsProvider';
import { readingOf } from '@/lib/nuggets';
import type { CoursePageData, FieldCourse } from '@/lib/course-page';

/**
 * The related courses (the redesign spec, section 7.10, cut under section 00), as one sentence with inline links: the
 * three courses whose pacing fingerprints sit nearest this one's (five or more editions), "Paced most like Berlin:
 * Eindhoven, Frankfurt and Hamburg." A course with no shape of its own names the courses nearest its sustained-slowdown
 * share instead. Near fingerprints draw near-identical sparklines, so none is drawn. Then the closing stack: the next
 * chapter, back to every course, and "Was this useful?". Marked for section_viewed as related.
 */
export default function CourseOthers({ page }: { page: CoursePageData }) {
  const { display, summary, shapedLike, field, slug } = page;
  const shaped = shapedLike.length > 0;
  const rows: FieldCourse[] = shaped ? shapedLike
    : [...field].filter((c) => c.city !== page.city && c.editions >= 3).sort((a, b) => Math.abs(a.slowdown - summary.slowdown) - Math.abs(b.slowdown - summary.slowdown)).slice(0, 3);
  const lead = shaped ? `Paced most like ${display}` : `Nearest ${display}’s share`;
  return (
    <section id="other-courses" tabIndex={-1} className="course-foot is-last" aria-label={lead} data-track-section="related">
      {rows.length ? (
        <p className="course-foot-line">
          {lead}:{' '}
          {rows.map((r, i) => (
            <Fragment key={r.slug}>
              {i ? (i === rows.length - 1 ? ' and ' : ', ') : null}
              <Link href={`/courses/${r.slug}`} className="course-foot-link">{r.display}</Link>
            </Fragment>
          ))}.
        </p>
      ) : null}
      <ChapterEnd path={`/courses/${slug}`} readingOf={readingOf} track={false} />
    </section>
  );
}
