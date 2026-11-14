import { ChapterCrumbs } from '@/components/ui/ChapterHeader';
import { EditionTags } from '@/components/ui/TierTag';
import { HowLink } from '@/components/ui/Values';
import { UnitLink as Link } from '@/components/UnitsProvider';
import { howWeKnowOf } from '@/lib/chapters';
import type { CourseList } from '@/lib/course-page';
import { CourseSection } from './Fact';

/**
 * A course page with no counted edition (lead decision D15, November 14, 2026: the course's address is kept). It names
 * the race and lists its editions, each with its tier labels from the shared vocabulary (`EditionTags`: the tier, then
 * "finish times only" and gun timing where they apply, each a link to its definition on /methodology), and states no
 * figure: no share, no median, no comparison, since no edition of the race supplies one. The one sentence is the
 * page's empty state.
 */
export default function CourseEditionList({ course }: { course: CourseList }) {
  const { race, display, slug, listed } = course;
  const years = listed.map((e) => e.year);
  const span = years.length > 1 ? `${years[0]}–${years[years.length - 1]}` : String(years[0] ?? '');
  const how = howWeKnowOf(`/courses/${slug}`);
  return (
    <>
      <section className="night course-hero is-routeless is-stripless" data-track-section="hero" data-course-list="">
        <div className="course-hero-head">
          <div className="reading-crumbs t-kicker course-crumbs"><ChapterCrumbs path={`/courses/${slug}`} place={<Link href="/courses" className="crumb-courses">Courses</Link>} /></div>
          <h1 className="course-title t-title">{race}</h1>
          <p className="hero-dek">{listed.length === 1 ? `One edition, ${span}` : `${listed.length} editions, ${span}`}</p>
        </div>
        <p className="course-hero-sentence t-sentence">No pacing figures for this race.</p>
      </section>
      <CourseSection id="editions" beat="Editions" title={`${display}, edition by edition`}>
        {/* The shared table (app/styles/components/table.css): a tier column is text, so it wraps and aligns left. */}
        <table className="table course-list-table">
          <caption className="sr-only">{`${display}: each edition and the status of its results`}</caption>
          <thead><tr><th scope="col">Year</th><th scope="col" className="is-text">Results</th></tr></thead>
          <tbody>
            {listed.map((e) => (
              <tr key={e.year}>
                <th scope="row">{e.year}</th>
                {/* A code the cohort manifest does not state stops the build here: no label is ever a default. */}
                <td className="is-text"><EditionTags tier={e.tier as string} weakerSource={e.weakerSource} splitTier={e.splitTier as string} timingBasis={e.timingBasis} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {how ? <HowLink href={how} /> : null}
      </CourseSection>
    </>
  );
}
