import TypeGlyph from '@/components/viz/TypeGlyph';
import { linear, pc } from '@/components/viz/scale';
import { getNugget } from '@/lib/nuggets';
import type { CoursePageData } from '@/lib/course-page';
import { typeStyle } from '@/lib/viz/palette';
import { CourseSection, Fact, Said } from './Fact';

/**
 * "#pacing": the six pacing types, each a row with its glyph and colour: this course's share (filled, in the type's
 * colour) against every course's (hollow), the gap in signal on the row the sentence names.
 */
export default function CoursePacing({ page }: { page: CoursePageData }) {
  const { city, display, types, archetypes } = page;
  const n = getNugget('course.types', { city });
  if (!types) return null;
  const named = n.guard ? String(n.values.type) : '';
  const top = Math.max(...types.shares, ...archetypes.map((a) => a.share));
  const max = Math.ceil(top * 10 + 0.25) / 10;
  const x = linear([0, max]);
  const domain: [number, number] = [Math.min(...archetypes.flatMap((a) => a.profile)), Math.max(...archetypes.flatMap((a) => a.profile))];
  return (
    <CourseSection id="pacing" track="chapter-4" beat="Pacing" title={<Said nugget={n} />}>
      <figure className="viz viz-frame dumbbell course-types">
        <ul className="dumbbell-rows" role="img" aria-label={`The six pacing types in ${display}, each against every course: ${archetypes.map((a, i) => `${a.name} ${Math.round(types.shares[i] * 100)}% against ${Math.round(a.share * 100)}%`).join(', ')}`}>
          {archetypes.map((a, i) => {
            const on = a.slug === named;
            const xa = x(a.share), xb = x(types.shares[i]);
            return (
              <li key={a.slug} className={on ? 'is-highlight' : undefined}>
                <span className="dumbbell-label"><TypeGlyph profile={a.profile} index={i} domain={domain} /><span>{a.name}</span></span>
                <svg className="dumbbell-track" width="100%" height="44" aria-hidden="true" focusable="false">
                  <rect className="grid-line" x="0" y="22" width="100%" height="1" transform="translate(0 -0.5)" />
                  <rect className={on ? 'dumbbell-gap is-signal' : 'dumbbell-gap'} x={pc(Math.min(xa, xb))} y="21" width={pc(Math.abs(xb - xa))} height="2" />
                  <circle className="m-hollow" cx={pc(xa)} cy="22" r="5" />
                  <circle className="m-type" style={typeStyle(i)} cx={pc(xb)} cy="22" r="6" />
                </svg>
                <span className="dumbbell-value"><Fact k={`ty.share@${i}`} v={types.shares[i]}>{Math.round(types.shares[i] * 100)}%</Fact></span>
              </li>
            );
          })}
        </ul>
        <ul className="viz-key" aria-hidden="true">
          {/* The filled mark in ink: filled is this course, whatever colour each row's type gives its dot. */}
          <li><i className="viz-key-mark" />{display}</li>
          <li><i className="viz-key-mark is-hollow" />Every course</li>
        </ul>
      </figure>
    </CourseSection>
  );
}
