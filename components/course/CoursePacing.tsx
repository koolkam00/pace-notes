import { Fragment } from 'react';
import { UnitLink as Link } from '@/components/UnitsProvider';
import TypeGlyph from '@/components/viz/TypeGlyph';
import { linear, pc } from '@/components/viz/scale';
import { getNugget } from '@/lib/nuggets';
import type { CoursePageData } from '@/lib/course-page';
import { typeStyle } from '@/lib/viz/palette';
import { CourseSection, Fact, Said } from './Fact';

/**
 * "#pacing": the six pacing types, each a row with its glyph and colour: this course's share (filled, in the type's
 * colour) against the other courses' share, pooled by finishes (hollow, its key naming them without a count), the gap in signal on
 * the row the sentence names. Its last line names the three courses whose pacing fingerprints sit nearest this one's
 * (five or more editions), "Paced most like Berlin: Eindhoven, Frankfurt and Hamburg." (critic round 5: said here, with
 * the pacing it is about, rather than as a list ahead of the closing stack).
 */
export default function CoursePacing({ page }: { page: CoursePageData }) {
  const { city, display, types, typesElsewhere, archetypes, shapedLike } = page;
  const n = getNugget('course.types', { city });
  if (!types || !typesElsewhere) return null;
  const named = n.guard ? String(n.values.type) : '';
  const elsewhere = typesElsewhere.shares;
  const top = Math.max(...types.shares, ...elsewhere);
  const max = Math.ceil(top * 10 + 0.25) / 10;
  const x = linear([0, max]);
  const domain: [number, number] = [Math.min(...archetypes.flatMap((a) => a.profile)), Math.max(...archetypes.flatMap((a) => a.profile))];
  return (
    <CourseSection id="pacing" track="chapter-4" beat="Pacing" title={<Said nugget={n} />}>
      <figure className="viz viz-frame dumbbell course-types">
        <ul className="dumbbell-rows" role="img" aria-label={`The six pacing types in ${display}, each against the other courses: ${archetypes.map((a, i) => `${a.name} ${Math.round(types.shares[i] * 100)}% against ${Math.round(elsewhere[i] * 100)}%`).join(', ')}`}>
          {archetypes.map((a, i) => {
            const on = a.slug === named;
            const xa = x(elsewhere[i]), xb = x(types.shares[i]);
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
          {/* No count (round 6): the slowdown H2 keeps the one course count that is a finding. */}
          <li><i className="viz-key-mark is-hollow" />Other courses</li>
        </ul>
      </figure>
      {shapedLike.length ? (
        <p className="course-alike">
          Paced most like {display}:{' '}
          {shapedLike.map((r, i) => (
            <Fragment key={r.slug}>
              {i ? (i === shapedLike.length - 1 ? ' and ' : ', ') : null}
              <Link href={`/courses/${r.slug}`} className="course-alike-link">{r.display}</Link>
            </Fragment>
          ))}.
        </p>
      ) : null}
    </CourseSection>
  );
}
