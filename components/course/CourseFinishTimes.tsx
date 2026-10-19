import { getNugget } from '@/lib/nuggets';
import { count } from '@/lib/nuggets/format';
import { finishMinute, type CoursePageData } from '@/lib/course-page';
import EditionLine from './EditionLine';
import { CourseSection, Said } from './Fact';

/** Whether a course shows #finish-times: three or more editions whose medians spread a minute or more (course.times). */
export const timesShown = (page: CoursePageData) => page.editions.length >= 3 && getNugget('course.times', { city: page.city }).guard;

/**
 * "#finish-times": the median finish as a line through the editions (scrub the years), under the one thing the hero has
 * not told (course.times: the trend from the first three editions to the last three, the window every median fell in,
 * or the range). The line opens on the end the sentence accents, else on the latest edition other than the hero's, and
 * labels the other end a range names, each to the minute as a race clock reads (3:59:36 is 3:59). Under three editions,
 * or with every median within a minute, a line says nothing a sentence would not: the medians are in "All numbers".
 */
export default function CourseFinishTimes({ page }: { page: CoursePageData }) {
  const { city, display, editions } = page;
  const n = getNugget('course.times', { city });
  if (!timesShown(page)) return null;
  const first = editions[0], last = editions[editions.length - 1];
  const open = Number(n.values.open_year), other = Number(n.values.other_year);
  return (
    <CourseSection id="finish-times" track="chapter-2" beat="Finish times" title={<Said nugget={n} />}>
      <EditionLine points={editions.map((e) => ({ year: e.year, seconds: e.median_s, display: finishMinute(e.median_s), side: count(e.n) }))}
        selected={open} from={Number.isFinite(other) && other !== open ? other : undefined} sideLabel="Finishes"
        label={`Median finish in ${display}, edition by edition, ${first.year} to ${last.year}`} height={140} heightMd={200} />
    </CourseSection>
  );
}
