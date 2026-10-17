import { UnitLink as Link } from '@/components/UnitsProvider';
import { clock, count, pct, shortDate, type CoursePageData } from '@/lib/course-page';
import { CourseSection, CourseTable, Fact } from './Fact';
import { Degrees } from './CourseUnits';

/** "Finish times by year": one row per edition in the story data. */
export default function CourseFinishTimes({ page }: { page: CoursePageData }) {
  const { editions, display } = page;
  const rows = [...editions].sort((a, b) => a.year - b.year);
  return (
    <CourseSection id="finish-times" track="chapter-2" kicker="Finish times" title="Finish times by year"
      dek={<>Every {display} edition: its median finish, its share of sustained slowdowns and the temperature at the start.</>}>
      <CourseTable id="finish-times-caption" caption={<>{display} finishes by edition</>}>
        <thead>
          <tr><th scope="col">Year</th><th scope="col">Race date</th><th scope="col">Finishes</th><th scope="col">Median finish</th><th scope="col">Sustained slowdown</th><th scope="col">Start temp.</th></tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.year}>
              <th scope="row">{e.year}</th>
              <td>{e.date ? <Fact k={`date@${e.year}`} v={e.date}>{shortDate(e.date)}</Fact> : '—'}</td>
              <td><Fact k={`n@${e.year}`} v={e.n}>{count(e.n)}</Fact></td>
              <td><Fact k={`median@${e.year}`} v={e.median_s}>{clock(e.median_s)}</Fact></td>
              <td><Fact k={`sd@${e.year}`} v={e.slowdown}>{pct(e.slowdown)}</Fact></td>
              <td>{e.temp !== null ? <Fact k={`temp@${e.year}`} v={e.temp}><Degrees c={e.temp} /></Fact> : '—'}</td>
            </tr>
          ))}
        </tbody>
      </CourseTable>
      <p className="course-note"><Link href="/finish-times">Marathon finish times across every course</Link>: the median, the spread and the shares under round times.</p>
    </CourseSection>
  );
}
