import { getNugget } from '@/lib/nuggets';
import { count, hm } from '@/lib/nuggets/format';
import type { CoursePageData } from '@/lib/course-page';
import EditionLine from './EditionLine';
import { CourseSection, Said } from './Fact';

/** "#finish-times": the median finish, first edition to latest, as a line through the editions (scrub the years). */
export default function CourseFinishTimes({ page }: { page: CoursePageData }) {
  const { city, display, editions } = page;
  const n = getNugget('course.times', { city });
  // One edition has no line to draw: its median is in "All numbers".
  if (editions.length < 2) return null;
  const first = editions[0], last = editions[editions.length - 1];
  return (
    <CourseSection id="finish-times" track="chapter-2" beat="Finish times" title={<Said nugget={n} />}>
      <EditionLine points={editions.map((e) => ({ year: e.year, seconds: e.median_s, display: hm(e.median_s / 60), side: count(e.n) }))}
        selected={last.year} from={first.year} sideLabel="Finishes"
        label={`Median finish in ${display}, edition by edition, ${first.year} to ${last.year}`} height={140} heightMd={200} />
    </CourseSection>
  );
}
