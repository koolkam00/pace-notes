import ChapterEnd from '@/components/ChapterEnd';
import Arrow from '@/components/ui/Arrow';
import { UnitLink as Link } from '@/components/UnitsProvider';
import { readingOf } from '@/lib/nuggets';
import { pct } from '@/lib/nuggets/format';
import type { CoursePageData, FieldCourse } from '@/lib/course-page';
import { CourseSection } from './Fact';

const W = 88, H = 30;

/** A course's pace by section against its own average, drawn over this course's (quiet), on one shared scale. */
function Spark({ curve, base, span }: { curve: number[]; base: number[]; span: number }) {
  const x = (i: number) => (i / 8) * W;
  const y = (v: number) => H / 2 - (v / span) * (H / 2 - 2);
  const d = (c: number[]) => c.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('');
  return (
    <svg className="course-spark" viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true" focusable="false">
      {base.length === 9 ? <path className="course-spark-base" d={d(base)} /> : null}
      {curve.length === 9 ? <path className="course-spark-line" d={d(curve)} /> : null}
    </svg>
  );
}

/**
 * "Shaped like {city}" (the redesign spec, section 7.10): the three courses whose pacing fingerprints sit nearest this
 * one's (five or more editions), each a row with its name, its share of sustained slowdowns and its pace shape drawn
 * over this course's. A course with no shape of its own lists the courses nearest its sustained-slowdown share instead,
 * each with its share and no sparkline.
 * Then the closing stack: the next chapter, back to every course, and "Was this useful?".
 */
export default function CourseOthers({ page }: { page: CoursePageData }) {
  const { display, summary, shapedLike, field, slug } = page;
  const curves = new Map(page.allCurves.map((c) => [c.city, c.curve]));
  // Shaped like: each row's pace shape over this course's. Without a shape of its own, the courses nearest its share,
  // whose share is the point: no sparklines.
  const shaped = shapedLike.length > 0;
  const rows: FieldCourse[] = shaped ? shapedLike
    : [...field].filter((c) => c.city !== page.city && c.editions >= 3).sort((a, b) => Math.abs(a.slowdown - summary.slowdown) - Math.abs(b.slowdown - summary.slowdown)).slice(0, 3);
  const base = summary.curve ?? [];
  const span = Math.max(1, ...[base, ...rows.map((r) => curves.get(r.city) ?? [])].flat().map((v) => Math.abs(v)));
  return (
    <CourseSection id="other-courses" track="related" beat="More courses" title={shaped ? <>Shaped like <em>{display}</em>.</> : <>Courses near {display}’s share.</>}>
      {shaped ? (
        <ul className="viz-key course-rows-key" aria-hidden="true">
          <li><i className="course-key-line" />Each course, 5K by 5K</li>
          {base.length === 9 ? <li><i className="course-key-dash" />{display}</li> : null}
        </ul>
      ) : null}
      <ul className="course-rows">
        {rows.map((r) => (
          <li key={r.slug}>
            <Link href={`/courses/${r.slug}`} className={shaped ? 'course-row' : 'course-row is-plain'}>
              <span className="course-row-name">{r.display}</span>
              <span className="course-row-meta">{pct(r.slowdown)} sustained slowdown</span>
              {shaped ? <Spark curve={curves.get(r.city) ?? []} base={base} span={span} /> : null}
              <Arrow />
            </Link>
          </li>
        ))}
      </ul>
      <ChapterEnd path={`/courses/${slug}`} readingOf={readingOf} track={false} />
    </CourseSection>
  );
}
