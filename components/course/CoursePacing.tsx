import { UnitLink as Link } from '@/components/UnitsProvider';
import ResearchQuestion from '@/components/ResearchQuestion';
import { forPage } from '@/lib/research-display';
import { CourseFingerprint } from '@/components/story/CourseInsights';
import { count, type CoursePageData } from '@/lib/course-page';
import type { ResearchAnswer } from '@/lib/research-data';
import { ARCHETYPE_COLOURS } from '@/lib/viz/palette';
import { CourseSection, Fact } from './Fact';

/** "How finishers paced each 5 km": the mix of pacing types, the course fingerprint and the pooled pace profile. */
export default function CoursePacing({ page, typical, profile }: { page: CoursePageData; typical: number[]; profile: ResearchAnswer }) {
  const { summary: s, types, archetypes, display } = page;
  const shaped = s.curve && s.deviation && s.signature ? { ...s, curve: s.curve, deviation: s.deviation, signature: s.signature } : null;
  // The most common pacing type, for the dek (the first of any tie).
  const top = types ? types.shares.indexOf(Math.max(...types.shares)) : -1;
  return (
    <CourseSection id="pacing" track="chapter-4" kicker="Pacing" title="How finishers paced each 5 km"
      dek={types && top >= 0 && archetypes[top]
        ? <>{archetypes[top].name} was the most common pacing type on {display}, at <Fact k={`ty.share@${top}`} v={types.shares[top]}>{Math.round(types.shares[top] * 100)}%</Fact> of finishes.</>
        : <>How {display} finishers spread their pace over the 5 km sections.</>}>
      {types ? (
        <div className="course-block">
          <h3 className="course-h3">Pacing types</h3>
          <p className="course-block-dek">The share of {display} finishes in each pacing type, beside every course. <Link href="/stories/pacing-types">The six pacing types</Link>.</p>
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
          <p className="course-block-dek">How the median finisher’s pace bends on this course, against the typical marathon.
            {shaped.identified ? <> Its shape alone names the course in <Fact k="identified.correct" v={shaped.identified.correct}>{count(shaped.identified.correct)}</Fact> of <Fact k="identified.editions" v={shaped.identified.editions}>{count(shaped.identified.editions)}</Fact> editions.</> : null}
            {' '}<Link href="/stories/courses">Every course has a fingerprint</Link>.</p>
          <CourseFingerprint course={shaped} typical={typical} />
        </div>
      ) : null}
      <div className="course-block course-profile">
        <ResearchQuestion question={forPage(profile)} standalone headingLevel={3} />
      </div>
    </CourseSection>
  );
}
