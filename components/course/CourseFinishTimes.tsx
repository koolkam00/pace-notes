import { getNugget } from '@/lib/nuggets';
import { count, hm } from '@/lib/nuggets/format';
import type { CoursePageData } from '@/lib/course-page';
import EditionLine from './EditionLine';
import { CourseSection, Said } from './Fact';

/** Whether a course shows #finish-times: three or more editions whose medians spread a minute or more (course.times). */
export const timesShown = (page: CoursePageData) => page.editions.length >= 3 && getNugget('course.times', { city: page.city }).guard;

/**
 * "#finish-times": the range of the median finish, as a line through the editions (scrub the years). The line opens on
 * the slowest median the sentence accents and labels the quickest. Under three editions, or with every median within a
 * minute, a line says nothing a sentence would not: the medians are in "All numbers".
 */
export default function CourseFinishTimes({ page }: { page: CoursePageData }) {
  const { city, display, editions } = page;
  const n = getNugget('course.times', { city });
  if (!timesShown(page)) return null;
  const first = editions[0], last = editions[editions.length - 1];
  const hi = Number(n.values.hi_year), lo = Number(n.values.lo_year);
  return (
    <CourseSection id="finish-times" track="chapter-2" beat="Finish times" title={<Said nugget={n} />}>
      <EditionLine points={editions.map((e) => ({ year: e.year, seconds: e.median_s, display: hm(e.median_s / 60), side: count(e.n) }))}
        selected={hi} from={lo} sideLabel="Finishes"
        label={`Median finish in ${display}, edition by edition, ${first.year} to ${last.year}`} height={140} heightMd={200} />
    </CourseSection>
  );
}
