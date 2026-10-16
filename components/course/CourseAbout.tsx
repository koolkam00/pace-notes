import { UnitLink as Link } from '@/components/UnitsProvider';
import { count, EXCLUSION_LABEL, yearList, type CoursePageData } from '@/lib/course-page';
import { CourseSection, Fact } from './Fact';

/**
 * "About this data": which finishes each section counts, and every edition of this race left out, with its reason as the
 * source policy, the screens and the weather file give it.
 */
export default function CourseAbout({ page }: { page: CoursePageData }) {
  const { summary: s, types, display, copies, exclusions, startOffset, grid, geometry, weatherMissing, profileN, context } = page;
  return (
    <CourseSection id="data" kicker="Sources" title="About this data"
      dek={<>Every count on this page is of finishes with all nine official 5 km checkpoint times, not of runners: one runner can appear in several editions. Runners who did not finish are not in the data.</>}>
      <ul className="course-data-list">
        <li><strong>Finish times, sustained slowdown and weather.</strong> <Fact k="finishes" v={s.finishes}>{count(s.finishes)}</Fact> finishes from <Fact k="editions" v={s.editions}>{count(s.editions)}</Fact> edition{s.editions === 1 ? '' : 's'}, from the story data. Each edition’s share counts once in the averages.</li>
        <li><strong>Pacing types and fingerprint.</strong> {types ? <><Fact k="ty.finishes" v={types.finishes}>{count(types.finishes)}</Fact> finishes from <Fact k="ty.editions" v={types.editions}>{count(types.editions)}</Fact> edition{types.editions === 1 ? '' : 's'}{startOffset.length ? '; editions whose first split includes start delays are left out' : ''}.</> : <>None: no edition passed the start-delay screen.</>}</li>
        <li><strong>Goal times.</strong> {page.goalsScreened ? <>None published for this course. {page.goalsScreened}</> : context ? <>The course chooser’s rows, from <Fact k="cg.editions" v={context.editions}>{count(context.editions)}</Fact> edition{context.editions === 1 ? '' : 's'} (<Fact k="cg.finishes" v={context.finishes}>{count(context.finishes)}</Fact> finishes){startOffset.length || grid.length ? '; the editions listed below with start delays in the first split or a shifted mat grid are left out' : ''}.</> : <>None published for this course.</>}</li>
        <li><strong>Pooled pace profile.</strong> {copies.length
          ? <>Every eligible edition, including {yearList(copies.map((c) => c.year))}, whose records largely repeat the {copies[0].duplicate_of} field.</>
          : profileN ? <><Fact k="profile.n" v={profileN}>{count(profileN)}</Fact> finishes from every eligible edition{startOffset.length ? ', start delays included' : ''}.</> : <>Every eligible edition.</>}</li>
        {exclusions.map((e) => (
          <li key={`x${e.year}`}><strong>{display} {e.year} is left out</strong> ({(EXCLUSION_LABEL[e.category] ?? e.category).toLowerCase()}): {e.reason}</li>
        ))}
        {copies.length ? <li><strong>{display} {yearList(copies.map((c) => c.year))}</strong> are not counted anywhere on this page except the pooled profile; see <a href="#finish-times">finish times by year</a>.</li> : null}
        {startOffset.length ? <li><strong>{display} {yearList(startOffset.map((e) => e.year))}</strong>: the first 5 km split includes start delays, so the pacing types, the fingerprint and the goal rows leave {startOffset.length === 1 ? 'it' : 'them'} out.</li> : null}
        {grid.map((e) => <li key={`g${e.year}`}><strong>{display} {e.year}</strong>: the mat grid was shifted ({e.reason.charAt(0).toLowerCase() + e.reason.slice(1)}), so the goal rows leave it out.</li>)}
        {geometry ? null : <li><strong>No supplied route.</strong> There is no route file for this race, so the page has no elevation profile.</li>}
        {weatherMissing.length ? <li><strong>No weather row</strong> for {yearList(weatherMissing.map((w) => w.year))}.</li> : null}
      </ul>
      <p className="course-note"><Link href="/methodology">Methods and sources</Link> · <Link href="/about#data-coverage">Marathons, years and recorded data</Link> · The pooled profile’s CSV and method are under “Full methodology &amp; sources” above.</p>
    </CourseSection>
  );
}
