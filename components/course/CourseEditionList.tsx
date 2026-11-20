import { ChapterCrumbs } from '@/components/ui/ChapterHeader';
import { EditionKey, editionKey, RowTags } from './EditionKey';
import { HowLink } from '@/components/ui/Values';
import { UnitLink as Link } from '@/components/UnitsProvider';
import { howWeKnowOf } from '@/lib/chapters';
import type { CourseList } from '@/lib/course-page';
import { count } from '@/lib/course-page';
import { CourseSection, Fact } from './Fact';

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
  // A label true of most rows is said once, above the table (lead decision D48).
  const key = editionKey(listed);
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
        <EditionKey model={key} />
        {/* The shared table (app/styles/components/table.css): a tier column is text, so it wraps and aligns left. */}
        <div className="table-wrap" role="region" aria-label={`${display}: each edition`} tabIndex={0}>
        <table className="table course-list-table">
          <caption className="sr-only">{`${display}: each edition and the status of its results`}</caption>
          <thead><tr><th scope="col">Year</th><th scope="col" className="is-text">Status</th><th scope="col">Recorded results</th></tr></thead>
          <tbody>
            {listed.map((e) => (
              <tr key={e.year} data-edition={e.year}>
                <th scope="row">{e.year}</th>
                {/* A code the cohort manifest does not state stops the build here: no label is ever a default. */}
                <td className="is-text edition-status"><RowTags row={e} model={key} /></td>
                <td><Fact k={`rr@${e.year}`} v={e.results}>{count(e.results)}</Fact></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {how ? <HowLink href={how} /> : null}
      </CourseSection>
    </>
  );
}
