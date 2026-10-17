import { UnitLink as Link } from '@/components/UnitsProvider';
import { minutes, pct, type CoursePageData } from '@/lib/course-page';
import { CourseSection, Fact } from './Fact';

/**
 * "How often finishers held pace": the course's sustained-slowdown share, the 20–40 km block and the time lost after
 * 20 km, all from the story summary (courses.json). No figure from the all-finisher view or the extension packs, which
 * still count copy editions. The term links to its definition on /methodology.
 */
export default function CourseSlowdown({ page }: { page: CoursePageData }) {
  const { summary: s, editions, display } = page;
  const single = editions.length === 1 ? editions[0] : null;
  const of = single ? <>of finishes in the {single.year} edition</> : <>of finishes in an average edition</>;
  return (
    <CourseSection id="slowdown" track="chapter-5" kicker="Holding pace" title="How often finishers held pace"
      dek={<>How often {display} finishers had a <Link href="/methodology#sustained-slowdown">sustained slowdown</Link>, and how much time the median finish lost after 20 km.</>}>
      <div className="bibs course-bibs">
        <div className="bib">
          <span className="bib-tag">Sustained slowdown</span>
          <strong className="bib-number"><Fact k="slowdown" v={s.slowdown}>{pct(s.slowdown)}</Fact></strong>
          <p className="bib-text">{of} had one{single ? '' : <>, from <Fact k="slowdown.lo" v={s.slowdown_range[0]}>{pct(s.slowdown_range[0])}</Fact> (<Fact k="slowdown.lo.year" v={s.slowdown_range_years[0]}>{s.slowdown_range_years[0]}</Fact>) to <Fact k="slowdown.hi" v={s.slowdown_range[1]}>{pct(s.slowdown_range[1])}</Fact> (<Fact k="slowdown.hi.year" v={s.slowdown_range_years[1]}>{s.slowdown_range_years[1]}</Fact>)</>}.</p>
        </div>
        <div className="bib">
          <span className="bib-tag">Slower second 20 km</span>
          <strong className="bib-number"><Fact k="block10" v={s.block10}>{pct(s.block10)}</Fact></strong>
          <p className="bib-text">{of} took more than 10% longer over 20 to 40 km than over their first 20 km.</p>
        </div>
        <div className="bib">
          <span className="bib-tag">Time lost after 20 km</span>
          <strong className="bib-number"><Fact k="after20" v={s.after20_s}>{minutes(s.after20_s)}</Fact></strong>
          <p className="bib-text">for the median finish{single ? '' : ' in an average edition'}.</p>
        </div>
      </div>
      <p className="course-note">Observed shares, not anyone’s odds. <Link href="/slowdown">Sustained slowdowns on every course</Link>.</p>
    </CourseSection>
  );
}
