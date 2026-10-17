import { UnitLink as Link } from '@/components/UnitsProvider';
import { clock, count, courseCopySentence, pct, shortDate, yearList, type CoursePageData } from '@/lib/course-page';
import { CourseSection, CourseTable, Fact } from './Fact';
import { Degrees } from './CourseUnits';

/**
 * "Finish times by year": one row per edition in the story data, and a row without numbers for each copy edition, whose
 * line under the table (courseCopySentence) says why.
 */
export default function CourseFinishTimes({ page }: { page: CoursePageData }) {
  const { editions, copies, small, display, datesUnverified } = page;
  const rows = [...editions.map((e) => ({ year: e.year, edition: e })), ...copies.map((c) => ({ year: c.year, edition: null }))].sort((a, b) => a.year - b.year);
  return (
    <CourseSection id="finish-times" track="chapter-2" kicker="Finish times" title="Finish times by year"
      dek={<>Each {display} edition in the data: its date, how many finishes it has, the median finish, the share with a sustained slowdown and the temperature at the start.</>}>
      <CourseTable id="finish-times-caption" caption={<>{display} finishes by edition</>}>
        <thead>
          <tr><th scope="col">Year</th><th scope="col">Race date</th><th scope="col">Finishes</th><th scope="col">Median finish</th><th scope="col">Sustained slowdown</th><th scope="col">Start temp.</th></tr>
        </thead>
        <tbody>
          {rows.map(({ year, edition: e }) => e ? (
            <tr key={year}>
              <th scope="row">{year}</th>
              <td>{e.date ? <Fact k={`date@${year}`} v={e.date}>{shortDate(e.date)}</Fact> : '—'}</td>
              <td><Fact k={`n@${year}`} v={e.n}>{count(e.n)}</Fact></td>
              <td><Fact k={`median@${year}`} v={e.median_s}>{clock(e.median_s)}</Fact></td>
              <td><Fact k={`sd@${year}`} v={e.slowdown}>{pct(e.slowdown)}</Fact></td>
              <td>{e.temp !== null ? <Fact k={`temp@${year}`} v={e.temp}><Degrees c={e.temp} /></Fact> : '—'}</td>
            </tr>
          ) : (
            <tr key={year} className="is-copy" data-copy-year={year}>
              <th scope="row">{year}</th>
              <td colSpan={5} className="course-copy-cell">Not counted; see the note below the table</td>
            </tr>
          ))}
        </tbody>
      </CourseTable>
      <p className="course-note">Editions with at least 100 finishes, each with all nine 5 km checkpoint times; years not listed have no eligible finishes{small ? <>, except {yearList(small.years)} (below)</> : null}. A race year can be in the source records without any, when its 5 km splits are missing or the source review excludes it. The median is each edition’s own. Race dates and start temperatures come from the edition’s supplied weather record (the modelled hour at the scheduled start).{datesUnverified ? ' The data producer supplied the race dates and scheduled starts; they have not been independently verified.' : ''}</p>
      {copies.length ? <p className="course-callout course-copy-note">{copies.map(courseCopySentence).join(' ')}</p> : null}
      {small ? (
        <p className="course-note">The course total also counts <Fact k="small" v={small.finishes}>{count(small.finishes)}</Fact> finishes from the {yearList(small.years)} edition{small.years.length === 1 ? '' : 's'}, which {small.years.length === 1 ? 'has' : 'have'} fewer than 100 finishes and no row here.</p>
      ) : null}
      <p className="course-note"><Link href="/finish-times">Marathon finish times across every course</Link>: the median, the spread and the shares under round times.</p>
    </CourseSection>
  );
}
