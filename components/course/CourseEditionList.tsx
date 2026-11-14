import { ChapterCrumbs } from '@/components/ui/ChapterHeader';
import { HowLink } from '@/components/ui/Values';
import { UnitLink as Link } from '@/components/UnitsProvider';
import { howWeKnowOf } from '@/lib/chapters';
import { tierWords, type CourseList } from '@/lib/course-page';
import { CourseSection, CourseTable } from './Fact';

/**
 * A course page with no counted edition (lead decision D15, November 14, 2026: the course's address is kept). It names
 * the race and lists its editions, each with its tier in the site's words (`tierWords`), and states no figure: no share,
 * no median, no comparison, since no edition of the race supplies one. The one sentence is the page's empty state. The
 * words are plain text until /methodology defines the tiers at an anchor a label can link to.
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
        <CourseTable id="editions-caption" caption={`${display}: each edition and the status of its results`} captionHidden>
          <thead><tr><th scope="col">Year</th><th scope="col">Results</th></tr></thead>
          <tbody>
            {listed.map((e) => (
              <tr key={e.year}><th scope="row">{e.year}</th><td data-tier={e.tier ?? ''}>{tierWords(e).join(' · ') || '—'}</td></tr>
            ))}
          </tbody>
        </CourseTable>
        {how ? <HowLink href={how} /> : null}
      </CourseSection>
    </>
  );
}
