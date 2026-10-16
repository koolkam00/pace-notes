import { UnitLink as Link } from '@/components/UnitsProvider';
import ResearchQuestion from '@/components/ResearchQuestion';
import { CourseFingerprint } from '@/components/story/CourseInsights';
import { count, yearList, type CoursePageData } from '@/lib/course-page';
import type { ResearchAnswer } from '@/lib/research-data';
import { ARCHETYPE_COLOURS } from '@/lib/viz/palette';
import { CourseSection, Fact } from './Fact';

/**
 * Why the shape views leave out some editions: their first 5 km split includes start delays
 * (courses.json shape_cohort.start_offset_editions), while the pooled profile from the course-profile pack keeps them.
 */
function startOffsetNote(page: CoursePageData) {
  const years = page.startOffset.map((e) => e.year);
  if (!years.length) return null;
  const every = years.length === page.editions.length;
  const one = years.length === 1;
  return every
    ? <>Every {page.display} edition in the data ({yearList(years)}) has a first 5 km split that includes start delays, so {page.display} has no pacing types and no fingerprint. The pooled profile below still includes these editions, so its 0–5 km point is inflated by those delays.</>
    : <>The pacing types and the fingerprint leave out {page.display} {yearList(years)}: the first 5 km split of {one ? 'that edition' : 'those editions'} includes start delays. The pooled profile below still includes {one ? 'it' : 'them'}, so its 0–5 km point is inflated by those delays.</>;
}

/** "How finishers paced each 5 km": pacing types, the course fingerprint and the pooled pace profile, each with its own cohort. */
export default function CoursePacing({ page, typical, shapeCourses, profile }: { page: CoursePageData; typical: number[]; shapeCourses: number; profile: ResearchAnswer }) {
  const { summary: s, types, archetypes, copies, display } = page;
  const shaped = s.curve && s.deviation && s.signature ? { ...s, curve: s.curve, deviation: s.deviation, signature: s.signature } : null;
  const offset = startOffsetNote(page);
  return (
    <CourseSection id="pacing" track="chapter-4" kicker="Pacing" title="How finishers paced each 5 km"
      dek={<>Three views of how {display} finishes were run: the mix of pacing types, the course’s fingerprint against the typical marathon, and the pooled pace profile. Each names the finishes it counts.</>}>
      {offset ? <p className="course-callout">{offset}</p> : null}
      {copies.length ? <p className="course-callout">The pacing types and the fingerprint leave out {display} {yearList(copies.map((c) => c.year))}, whose records largely repeat the {copies[0].duplicate_of} field; the pooled profile below still includes them.</p> : null}
      {types ? (
        <div className="course-block">
          <h3 className="course-h3">Pacing types</h3>
          <p className="course-block-dek">The mix of pacing types among <Fact k="ty.finishes" v={types.finishes}>{count(types.finishes)}</Fact> finishes across <Fact k="ty.editions" v={types.editions}>{count(types.editions)}</Fact> edition{types.editions === 1 ? '' : 's'}, each edition weighted equally. <Link href="/stories/pacing-types">What the types mean</Link>.</p>
          <div className="course-types-big">
            {archetypes.map((a, i) => (
              <div key={a.slug} className="course-type-tile" style={{ ['--arch' as string]: ARCHETYPE_COLOURS[i] }}>
                <strong><Fact k={`ty.share@${i}`} v={types.shares[i]}>{Math.round(types.shares[i] * 100)}%</Fact></strong><span>{a.name}</span>
                <small><Fact k={`ty.all@${i}`} v={a.share}>{Math.round(a.share * 100)}%</Fact> across all courses</small>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {shaped ? (
        <div className="course-block">
          <h3 className="course-h3">Course fingerprint</h3>
          <p className="course-block-dek">How the median finisher’s pace bends across <Fact k="shape.editions" v={shaped.shape_editions}>{count(shaped.shape_editions)}</Fact> edition{shaped.shape_editions === 1 ? '' : 's'}, against the typical curve across <Fact k="shape.courses" v={shapeCourses}>{count(shapeCourses)}</Fact> courses.
            {shaped.identified ? <> Its shape alone names the course in <Fact k="identified.correct" v={shaped.identified.correct}>{count(shaped.identified.correct)}</Fact> of <Fact k="identified.editions" v={shaped.identified.editions}>{count(shaped.identified.editions)}</Fact> editions.</> : null}
            {' '}<Link href="/stories/courses">Every course has a fingerprint</Link>.</p>
          <CourseFingerprint course={shaped} typical={typical} />
        </div>
      ) : null}
      <div className="course-block course-profile">
        <ResearchQuestion question={profile} standalone headingLevel={3} />
      </div>
    </CourseSection>
  );
}
