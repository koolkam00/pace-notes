/**
 * One race's qualifying standards (/tools/qualifying/[race]): the full table by age group and division, the age rule,
 * the window, how entry works and, for Boston, every published cut-off. Server-rendered from lib/tools/qualifying.ts,
 * so the page reads completely without JavaScript; only the even-pace column follows the units switch.
 * Copy rules: published facts only, no forecast of any cut-off, meeting a standard is not entry.
 */
import { MarathonDistance, UnitLink as Link } from '@/components/UnitsProvider';
import { Pace } from '@/components/story/Units';
import { EvidenceTag } from '@/components/tools/EvidenceTag';
import { ToolEnd, ToolPageHeader } from '@/components/tools/ToolShell';
import Values from '@/components/ui/Values';
import Arrow from '@/components/ui/Arrow';
import ScrollCue from '@/components/ui/ScrollCue.client';
import YearStrip from '@/components/viz/YearStrip';
import {
  ageLabel, bornLabel, capital, checkedDate, checkerHref, divisionWords, divisions, editionDetail, fmtDate, fmtMargin, fmtStandard,
  lastRunDate, pageHeading, program, racePath, raceName, raceYear, shortName,
} from '@/components/tools/QualifyingRaceText';
import { MARATHON_KM } from '@/lib/tools/pace';
import { ASSUMED_COMPARISON, BOSTON_CUTOFFS, VERIFIED_AT, type Standard } from '@/lib/tools/qualifying';

const grouped = (n: number) => n.toLocaleString('en-US');


function ageRule(s: Standard): { value: string; detail: string; column: string; sentence: string } {
  if (s.ageRule === 'race-day') {
    const day = s.ageDate ? fmtDate(s.ageDate) : 'race day';
    return { value: 'Age on race day', detail: s.ageDate ? day : 'Race day', column: 'Age', sentence: `Your age on race day, ${day}.` };
  }
  if (s.ageRule === 'time-run') {
    return { value: 'Age when the time was run', detail: 'Your age on the day you ran the qualifying time, not on race day.', column: 'Age when run',
      sentence: 'Your age on the day you ran the qualifying time, not your age on race day.' };
  }
  return { value: `Age reached in ${s.ageYear}`, detail: 'The groups go by birth year.', column: `Age in ${s.ageYear}`,
    sentence: `The age you reach during ${s.ageYear}, so the groups go by birth year.` };
}

/** The time rule in the checker's words (comparisonText in lib/tools/qualifying.ts), driven by `comparison` and `comparisonStated`. */
function timeRule(s: Standard): { value: string; detail: string } {
  if (s.comparison === 'strictly-under') return { value: 'Strictly under the standard', detail: 'A time equal to the standard does not qualify.' };
  if (s.comparisonStated) return { value: 'At or under the standard', detail: 'A time equal to the standard qualifies.' };
  return { value: `At or under the standard ${ASSUMED_COMPARISON}`,
    detail: 'A time equal to the standard counts here.' };
}

/**
 * Library rules already said by the facts above them (London repeats its age rule in `extra`). London's "sub" rule stays:
 * it quotes the race's own word, which is where "strictly under" comes from.
 */
function otherRules(s: Standard): string[] {
  return (s.extra ?? []).filter((rule) => !(s.ageRule === 'time-run' && /^Age is your age on the day you ran/i.test(rule)));
}

export default function QualifyingRace({ s, others }: { s: Standard; others: Standard[] }) {
  const year = raceYear(s);
  const name = raceName(s);
  const detail = editionDetail(s);
  const age = ageRule(s);
  const time = timeRule(s);
  // Where every non-binary standard equals the women's (the race says so in its note), one column carries both.
  const shared = divisions(s).some((c) => c.key === 'nonbinary') && s.bands.every((b) => b.nonbinary === b.women);
  const cols = divisions(s).filter((c) => !(shared && c.key === 'nonbinary')).map((c) => (shared && c.key === 'women' ? { ...c, label: 'Women, non-binary' } : c));
  const birthYear = s.ageRule === 'birth-year' && s.ageYear !== undefined;
  const last = lastRunDate(s);
  const what = capital(program(s) ? `${program(s)} standards` : 'qualifying standards');
  // Proof goes in with the application, so an application deadline before the window's end (Berlin), or a window with
  // no listed end (Sydney), ends it at that deadline: the same date the rules and the checker use.
  const windowEnd = last.byApplications && last.date ? `${fmtDate(last.date)} (application deadline)` : s.windowEnd ? fmtDate(s.windowEnd) : 'end not yet dated';
  return (
    <div className="tool-page qrace">
      <ToolPageHeader path={racePath(s)} title={pageHeading(s)}
        // The H1 names the race, its year and its standards, so the dek adds only how the table is set out.
        dek={<>By {birthYear ? 'birth year' : 'age group'}, for {divisionWords(s).replace('non-binary', 'non\u2011binary')}.</>}
        trail={[['Reference'], ['Qualifying checker', '/tools/qualifying'], [`${name} ${year}`]]}>
        <p className="qrace-provenance">
          <EvidenceTag kind="official" />
          <span>Checked <time dateTime={VERIFIED_AT}>{checkedDate()}</time></span>
          {s.sources[0] ? <a className="no-print" href={s.sources[0].url} rel="noopener noreferrer">Official page<span aria-hidden="true">{'\u00a0'}↗</span></a> : null}
        </p>
      </ToolPageHeader>

      <div className="qrace-body">
        {/* The race date is said once: under "Age used" when ages count on race day, else on its own row. */}
        <dl className="tool-ledger qrace-glance">
          {!(s.ageRule === 'race-day' && s.ageDate) && detail ? <div><dt>Race day</dt><dd>{detail}</dd></div> : null}
          <div><dt>Age used</dt><dd>{age.value}</dd><dd className="tool-ledger-note">{age.detail}</dd></div>
          <div><dt>Window</dt><dd className="qrace-window">{fmtDate(s.windowStart)} – {windowEnd}</dd></div>
          <div><dt>Time rule</dt><dd>{time.value}</dd><dd className="tool-ledger-note">{time.detail}</dd></div>
        </dl>
        <p className="qrace-cta no-print"><Link className="btn btn-primary" href={checkerHref(s)}>Check a time for {shortName(s)}</Link></p>

        <section className="qrace-section" id="standards" aria-labelledby="qrace-standards-title">
          <h2 className="tool-panel-title" id="qrace-standards-title">{what}</h2>
          <p className="tool-panel-meta">By {birthYear ? `birth year (the age reached in ${s.ageYear})` : age.value.toLowerCase()}, each time with its even pace over <MarathonDistance />.</p>
          <div className="tool-table-wrap table-wrap qrace-table-wrap" role="region" tabIndex={0} aria-labelledby="qrace-standards-title">
            <table className="tool-table qrace-table" data-race={s.key}>
              <caption className="sr-only">{name} {year} {program(s) ? `${program(s)} ` : ''}standards in hours, minutes and seconds, each with the even pace for a finish exactly on it.</caption>
              <thead>
                <tr>
                  {birthYear ? <th scope="col">Born</th> : null}
                  <th scope="col">{age.column}</th>
                  {cols.map((c) => <th scope="col" key={c.key}>{c.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {s.bands.map((b) => (
                  <tr key={b.min}>
                    {birthYear ? <th scope="row">{bornLabel(s, b)}</th> : null}
                    {birthYear ? <td className="qrace-age">{ageLabel(b)}</td> : <th scope="row">{ageLabel(b)}</th>}
                    {cols.map((c) => {
                      const v = b[c.key];
                      return <td key={c.key} data-division={c.key}>{v === undefined ? '—' : <>{fmtStandard(v)}<small><Pace secondsPerKm={v / MARATHON_KM} /></small></>}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Shown only while the table is wider than the screen (ScrollCue marks the section). */}
          <span className="qrace-cue" aria-hidden="true">Scroll<Arrow /></span>
          <ScrollCue target="standards" />
          <p className="tool-note">{s.nonbinaryNote}</p>
        </section>

        <section className="qrace-section qrace-rules" id="rules" aria-labelledby="qrace-rules-title">
          <h2 className="tool-panel-title" id="qrace-rules-title">Meeting the standard is not entry by itself</h2>
          <p>{s.entry}</p>
          <h3>Applications</h3>
          <p>{s.applications?.note ?? 'Application dates for this edition were not listed when checked.'}</p>
          <details className="tool-more qrace-more-rules">
            <summary>The window, the age group and every other rule</summary>
            <div className="tool-more-body">
              <h3>Qualifying window</h3>
              <p>{s.windowNote}{last.byApplications && last.date ? ` Proof goes in with the application, so a time must be run by ${fmtDate(last.date)}, the application deadline.` : ''}</p>
              <h3>Age group</h3>
              <p>{age.sentence}</p>
              <h3>Time</h3>
              <p>{time.value}. {time.detail}</p>
              {otherRules(s).length ? (
                <>
                  <h3>Other rules</h3>
                  <ul>{otherRules(s).map((rule) => <li key={rule}>{rule}</li>)}</ul>
                </>
              ) : null}
            </div>
          </details>
          {s.key === 'nyc' ? <NycPool s={s} /> : null}
        </section>

        {s.key === 'boston' ? <BostonCutoffs /> : null}
      </div>

      {/* One way on (every race is one tap away there) and, in the closing row, one way back. */}
      <nav className="tool-handoffs qrace-forward no-print" aria-label="Every race">
        <ul><li><Link href="/tools/qualifying"><span className="tool-handoff-text"><b>Check one time against all {others.length + 1} races</b></span><Arrow /></Link></li></ul>
      </nav>

      <ToolEnd path="/tools/qualifying" how="/methodology#tools-qualifying" />
    </div>
  );
}

/** New York's capped pool for non-NYRR times: the published cut-offs, past years only. */
function NycPool({ s }: { s: Standard }) {
  const pools = s.poolHistory ?? [];
  const nyrr = s.nyrrMarathonDate;
  return (
    <>
      {nyrr ? <p>The only NYRR marathon in the {raceYear(s)} window is the {nyrr.slice(0, 4)} TCS New York City Marathon on {fmtDate(nyrr)}. Times from other marathons go to the capped pool.</p> : null}
      {pools.length ? (
        <>
          <h3 id="pool">Past cut-offs in the capped pool</h3>
          <div className="tool-table-wrap">
            <table className="tool-table qrace-table qrace-pool-table">
              <caption>How far under their standard non-NYRR qualifiers had to be, as reported by NYRR. Past cut-offs are not a forecast.</caption>
              <thead><tr><th scope="col">Race year</th><th scope="col">Cut-off under the standard</th><th scope="col">Accepted</th></tr></thead>
              <tbody>
                {[...pools].reverse().map((p) => (
                  <tr key={p.year}><th scope="row">{p.year}</th><td>{fmtMargin(p.seconds)}</td><td>{p.accepted}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </>
  );
}

/** Every published Boston cut-off, as the B.A.A. announced them, one lollipop per year. Descriptive only; no forecast. */
function BostonCutoffs() {
  const rows = BOSTON_CUTOFFS;
  if (!rows.length) return null;
  const first = rows[0].year;
  const last = rows[rows.length - 1].year;
  const sorted = [...rows].sort((a, b) => a.cutoff - b.cutoff);
  const lowest = sorted[0];
  const highest = sorted[sorted.length - 1];
  const lowestYears = rows.filter((c) => c.cutoff === lowest.cutoff).map((c) => c.year);
  const list = (xs: (string | number)[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
  const latest = rows[rows.length - 1];
  const years = Array.from({ length: last - first + 1 }, (_, i) => last - i);
  return (
    <section className="qrace-section qrace-cutoffs" id="cutoffs" aria-labelledby="qrace-cutoffs-title">
      <EvidenceTag kind="official" />
      <p className="tool-nugget-text" id="qrace-cutoffs-title">
        For {latest.year}, qualifiers needed to be <em>{fmtMargin(latest.cutoff)}</em> under their standard. Since {first}, cut-offs have run from {fmtMargin(lowest.cutoff)} ({list(lowestYears)}) to {fmtMargin(highest.cutoff)} ({highest.year}{highest.note ? `, ${highest.note.toLowerCase()}` : ''}).
      </p>
      <YearStrip label={`Boston cut-offs from ${first} to ${last}: how far under their standard accepted qualifiers had to be, from ${fmtMargin(lowest.cutoff)} to ${fmtMargin(highest.cutoff)}.`}
        editions={rows.map((c) => ({ year: c.year, value: c.cutoff, display: fmtMargin(c.cutoff), side: [grouped(c.notAccepted)] }))}
        sideLabels={['Not accepted']} selected={latest.year} extremeLabel={(p) => `${p.year} · ${p.display}`} gapLabel="No cut-off on record"
        values={(
          <Values id="qrace-cutoff-values" caption="Cut-off: how far under their standard accepted qualifiers had to be, with the field and the qualifiers not accepted, as announced by the B.A.A." count={years.length}>
            <table className="table">
              <thead><tr><th scope="col">Race year</th><th scope="col">Cut-off</th><th scope="col">Field</th><th scope="col">Not accepted</th></tr></thead>
              <tbody>
                {/* Every year from the first to the last; a year the race was held without a published cut-off says so, as
                    the strip's key does. */}
                {years.map((year) => {
                  const c = rows.find((r) => r.year === year);
                  return c ? (
                    <tr key={year}>
                      <th scope="row">{c.year}{c.note ? <small> {c.note}</small> : null}</th>
                      <td>{fmtMargin(c.cutoff)}</td>
                      <td>{grouped(c.field)}</td>
                      <td>{grouped(c.notAccepted)}</td>
                    </tr>
                  ) : <tr key={year}><th scope="row">{year}</th><td colSpan={3}>No cut-off on record</td></tr>;
                })}
              </tbody>
            </table>
          </Values>
        )} />
      {/* The random draw is in the rules above ("Acceptance depends on the cut-off (and … a random selection …)"). */}
      <p className="tool-note">Past cut-offs are not a forecast.</p>
    </section>
  );
}
