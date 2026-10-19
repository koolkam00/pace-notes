import ChapterEnd from '@/components/ChapterEnd';
import { readingOf } from '@/lib/nuggets';
import type { CoursePageData } from '@/lib/course-page';

/**
 * The page's foot: the closing stack every page in the race ends on (the next chapter, back to every course and How we
 * know, then "Was this useful?"), in the #other-courses section that keeps the course page's `related` id (critic round
 * 5: the tools row and the courses paced alike ahead of it made the course pages the one template that ended on forward
 * lists; the courses paced alike are #pacing's last line, and the tools are the hero's "Plan your …" and the menu).
 */
export default function CourseOthers({ page }: { page: CoursePageData }) {
  return (
    <section id="other-courses" tabIndex={-1} className="course-foot is-last" data-track-section="related">
      <ChapterEnd path={`/courses/${page.slug}`} readingOf={readingOf} track={false} />
    </section>
  );
}
