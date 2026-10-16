import { UnitLink as Link } from '@/components/UnitsProvider';
import { Temperature } from '@/components/story/Units';
import { clock, count, pct, shortDate, yearList, type CoursePageData } from '@/lib/course-page';
import { copyEditionSentence } from '@/lib/duplicate-editions';
import { CourseSection, Fact } from './Fact';

/**
 * "Finish times by year": one row per edition in the story data, and a row without numbers for each copy edition, whose
 * line under the table says why.
 */
export default function CourseFinishTimes({ page }: { page: CoursePageData }) {
  const { editions, copies, small, display } = page;
  const rows = [...editions.map((e) => ({ year: e.year, edition: e })), ...copies.map((c) => ({ year: c.year, edition: null }))].sort((a, b) => a.year - b.year);
  return (
    <CourseSection id="finish-times" track="chapter-2" kicker="Finish times" title="Finish times by year"
      dek={<>Each {display} edition in the data: its date, how many finishes it has, the median finish, the share with a sustained slowdown and the temperature at the start.</>}>
      <div className="tool-table-wrap course-table-wrap">
        <table className="tool-table course-table">
          <caption className="sr-only">{display} finishes by edition</caption>
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
                <td>{e.temp !== null ? <Fact k={`temp@${year}`} v={e.temp}><Temperature c={e.temp} /></Fact> : '—'}</td>
              </tr>
            ) : (
              <tr key={year} className="is-copy" data-copy-year={year}>
                <th scope="row">{year}</th>
                <td colSpan={5} className="course-copy-cell">Recorded times only; not counted</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="course-note">Editions with at least 100 finishes, each with all nine 5 km checkpoint times; years not listed are not in the data. The median is each edition’s own. Race dates and start temperatures come from the edition’s supplied weather record (the modelled hour at the scheduled start).</p>
      {copies.length ? <p className="course-callout course-copy-note">{copies.map(copyEditionSentence).join(' ')}</p> : null}
      {small ? (
        <p className="course-note">The course total also counts <Fact k="small" v={small.finishes}>{count(small.finishes)}</Fact> finishes from {small.years.length ? <>the {yearList(small.years)} edition{small.years.length === 1 ? '' : 's'}, which {small.years.length === 1 ? 'has' : 'have'}</> : 'editions with'} fewer than 100 finishes and no row here.</p>
      ) : null}
      <p className="course-note"><Link href="/finish-times">Marathon finish times across every course</Link>: the median, the spread and the shares under round times.</p>
    </CourseSection>
  );
}
