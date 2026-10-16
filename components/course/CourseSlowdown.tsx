import { UnitLink as Link } from '@/components/UnitsProvider';
import { count, minutes, pct, type CoursePageData } from '@/lib/course-page';
import { SLOWDOWN_CITATION, SLOWDOWN_DEFINITION } from '@/lib/tools/splits';
import { CourseSection, Fact } from './Fact';

/**
 * "How often finishers held pace": where the term is defined, with its citation, then the course's sustained-slowdown
 * share, the 20–40 km block and the time lost after 20 km, all from the story summary (courses.json). No figure from the
 * all-finisher view or the extension packs, which still count copy editions.
 */
export default function CourseSlowdown({ page }: { page: CoursePageData }) {
  const { summary: s, editions } = page;
  const single = editions.length === 1 ? editions[0] : null;
  // The shares are means over the editions with a row, so their finishes are the rows' (Amsterdam's total also counts 14 from 2023).
  const rowFinishes = editions.reduce((sum, e) => sum + e.n, 0);
  const scope = single
    ? <>of the <Fact k={`n@${single.year}`} v={single.n}>{count(single.n)}</Fact> finishes in the {single.year} edition</>
    : <>of finishes in an average edition, across <Fact k="editions" v={s.editions}>{count(s.editions)}</Fact> editions weighted equally (<Fact k="rows.finishes" v={rowFinishes}>{count(rowFinishes)}</Fact> finishes)</>;
  return (
    <CourseSection id="slowdown" track="chapter-5" kicker="Holding pace" title="How often finishers held pace"
      dek={<>{SLOWDOWN_DEFINITION} The definition follows the <a href={SLOWDOWN_CITATION.url} rel="noopener noreferrer">{SLOWDOWN_CITATION.label}</a>.</>}>
      <div className="bibs course-bibs">
        <div className="bib">
          <span className="bib-tag">Sustained slowdown</span>
          <strong className="bib-number"><Fact k="slowdown" v={s.slowdown}>{pct(s.slowdown)}</Fact></strong>
          <p className="bib-text">{scope}{single ? '' : <>; from <Fact k="slowdown.lo" v={s.slowdown_range[0]}>{pct(s.slowdown_range[0])}</Fact> (<Fact k="slowdown.lo.year" v={s.slowdown_range_years[0]}>{s.slowdown_range_years[0]}</Fact>) to <Fact k="slowdown.hi" v={s.slowdown_range[1]}>{pct(s.slowdown_range[1])}</Fact> (<Fact k="slowdown.hi.year" v={s.slowdown_range_years[1]}>{s.slowdown_range_years[1]}</Fact>)</>}.</p>
        </div>
        <div className="bib">
          <span className="bib-tag">Slower second 20 km</span>
          <strong className="bib-number"><Fact k="block10" v={s.block10}>{pct(s.block10)}</Fact></strong>
          <p className="bib-text">{single ? <>of finishes in the {single.year} edition</> : <>of finishes in an average edition</>} took more than 10% longer over 20 to 40 km than over their first 20 km.</p>
        </div>
        <div className="bib">
          <span className="bib-tag">Time lost after 20 km</span>
          <strong className="bib-number"><Fact k="after20" v={s.after20_s}>{minutes(s.after20_s)}</Fact></strong>
          <p className="bib-text">beyond the finish’s own 5–20 km pace, for the median finish{single ? '' : ' (the mean of the edition medians)'}.</p>
        </div>
      </div>
      <p className="course-note">These are observed shares of complete finishes, not anyone’s odds. {single ? null : 'Each edition’s own share is in the finish-times table above. '}<Link href="/slowdown">How sustained slowdowns are measured across every course</Link>.</p>
    </CourseSection>
  );
}
