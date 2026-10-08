/**
 * One race's qualifying standards (/tools/qualifying/[race]): the full table by age group and division, the age rule,
 * the window, how entry works and, for Boston, every published cut-off. Server-rendered from lib/tools/qualifying.ts,
 * so the page reads completely without JavaScript; only the even-pace column follows the units switch.
 * Copy rules: published facts only, no forecast of any cut-off, meeting a standard is not entry.
 */
import { MarathonDistance, UnitLink as Link } from '@/components/UnitsProvider';
import { Pace } from '@/components/story/Units';
import { EvidencePanel } from '@/components/tools/ui';
import { ToolNext } from '@/components/tools/ToolShell';
import { QualifyingRaceLinks } from '@/components/tools/QualifyingRaceLinks';
import {
  ageLabel, bornLabel, capital, checkedDate, checkerHref, divisionWords, divisions, editionDetail, fmtDate, fmtMargin, fmtStandard,
  lastRunDate, organiser, pageHeading, possessive, program, raceName, raceYear, shortName,
} from '@/components/tools/QualifyingRaceText';
import { JsonLd, breadcrumbs } from '@/lib/seo';
import { MARATHON_KM } from '@/lib/tools/pace';
import { ASSUMED_COMPARISON, BOSTON_CUTOFFS, VERIFIED_AT, hasPublishedCutoffs, type Standard } from '@/lib/tools/qualifying';
import { toolBySlug } from '@/lib/tools/registry';

const grouped = (n: number) => n.toLocaleString('en-US');
const pct = (share: number) => `${Math.round(share * 100)}%`;

/** A course page for this race, when the course list has one (slug from lib/course-data). */
export type CourseLink = { href: string; label: string } | null;

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
    detail: `${capital(organiser(s))} does not say whether a time exactly equal to the standard qualifies; this page and the checker count it as meeting the standard.` };
}

/**
 * Library rules already said by the facts above them (London repeats its age rule in `extra`). London's "sub" rule stays:
 * it quotes the race's own word, which is where "strictly under" comes from.
 */
function otherRules(s: Standard): string[] {
  return (s.extra ?? []).filter((rule) => !(s.ageRule === 'time-run' && /^Age is your age on the day you ran/i.test(rule)));
}

export default function QualifyingRace({ s, others, course }: { s: Standard; others: Standard[]; course: CourseLink }) {
  const year = raceYear(s);
  const name = raceName(s);
  const detail = editionDetail(s);
  const age = ageRule(s);
  const time = timeRule(s);
  const cols = divisions(s);
  const birthYear = s.ageRule === 'birth-year' && s.ageYear !== undefined;
  const last = lastRunDate(s);
  const accent = toolBySlug('qualifying')?.accent;
  const sources = s.sources;
  // Panels in the main column; the facts card spans them on wide screens.
  const panels = s.key === 'boston' && BOSTON_CUTOFFS.length ? 5 : 4;
  const what = capital(program(s) ? `${program(s)} standards` : 'qualifying standards');
  // Proof goes in with the application, so an application deadline before the window's end (Berlin), or a window with
  // no listed end (Sydney), ends it at that deadline: the same date the rules panel and the checker use.
  const windowEnd = last.byApplications && last.date ? `${fmtDate(last.date)} (application deadline)` : s.windowEnd ? fmtDate(s.windowEnd) : 'end not yet dated';
  return (
    <div className="container tool-page qrace">
      <header className="tool-header qrace-header" style={accent ? { ['--tool' as string]: accent } : undefined}>
        <p className="eyebrow"><Link href="/tools">Runner tools</Link> · <Link href="/tools/qualifying">Qualifying checker</Link></p>
        <h1 className="tool-title">{pageHeading(s)}</h1>
        <p className="tool-dek">
          {what} for the {year} {name}{detail ? ` (${detail})` : ''} by {birthYear ? 'birth-year group' : 'age group'} for {divisionWords(s)}, with the qualifying window, the age rule and how entry works.
        </p>
        <p className="qrace-provenance">
          <span className="evidence-badge evidence-official">Official standards</span>
          <span>Transcribed from {possessive(organiser(s))} official page{sources.length > 1 ? 's' : ''} · checked <time dateTime={VERIFIED_AT}>{checkedDate()}</time></span>
        </p>
        <JsonLd data={breadcrumbs([['Pace Notes', '/'], ['Runner tools', '/tools'], ['Qualifying checker', '/tools/qualifying'], [`${name} ${year}`]])} />
      </header>

      <div className="qrace-layout" style={{ ['--qrace-rows' as string]: String(panels) }}>
        <EvidencePanel kind="official" id="standards" title={`${name} ${year} ${program(s) ? `${program(s)} ` : ''}standards`}
          meta={<>By {birthYear ? `birth year (the age reached in ${s.ageYear})` : age.value.toLowerCase()}{s.ageRule === 'race-day' && s.ageDate ? ` (${fmtDate(s.ageDate)})` : ''}, for {divisionWords(s)}.</>}>
          <div className="tool-table-wrap">
            <table className="tool-table qrace-table" data-race={s.key}>
              <caption>
                {name} {year} {program(s) ? `${program(s)} ` : ''}standards as published by {organiser(s)}, in hours, minutes and seconds.
              </caption>
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
                      return <td key={c.key} data-division={c.key}>{v === undefined ? '—' : fmtStandard(v)}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="tool-note">{s.nonbinaryNote}</p>
          <p className="qrace-sources">
            {sources.map((src) => <a key={src.url} href={src.url} rel="noopener noreferrer">{src.label}<span aria-hidden="true">{'\u00a0'}↗</span></a>)}
            <span className="qrace-checked">Checked <time dateTime={VERIFIED_AT}>{checkedDate()}</time></span>
          </p>
        </EvidencePanel>

        <aside className="qrace-glance" aria-labelledby="qrace-glance-title">
          <h2 id="qrace-glance-title" className="qrace-glance-title">At a glance</h2>
          <dl className="qrace-facts">
            <div><dt>Race</dt><dd><b>{year}</b>{detail ? <span>{detail}</span> : null}</dd></div>
            <div><dt>Age used</dt><dd><b>{age.value}</b><span>{age.detail}</span></dd></div>
            <div>
              <dt>Window</dt>
              <dd>
                <b>{fmtDate(s.windowStart)} – {windowEnd}</b>
                <span>{s.windowNote}</span>
              </dd>
            </div>
            <div><dt>Time rule</dt><dd><b>{time.value}</b><span>{time.detail}</span></dd></div>
          </dl>
          <div className="qrace-cta no-print">
            <Link className="button-primary" href={checkerHref(s)}>Check a time for {shortName(s)}</Link>
            <p>The checker works out the age group from a date of birth, which stays in your browser and never goes in a link.</p>
          </div>
        </aside>

        <EvidencePanel kind="official" id="rules" title="Window, age and application rules" meta={`As ${organiser(s)} states them for the ${year} race.`}>
          <dl className="qrace-rules">
            <div>
              <dt>Qualifying window</dt>
              <dd>
                {s.windowNote}
                {last.byApplications && last.date ? ` Proof goes in with the application, so a time must be run by ${fmtDate(last.date)}, the application deadline.` : ''}
              </dd>
            </div>
            <div><dt>Age group</dt><dd>{age.sentence}</dd></div>
            <div><dt>Time</dt><dd>{time.value}. {time.detail}</dd></div>
            <div><dt>Applications</dt><dd>{s.applications?.note ?? 'Application dates for this edition were not listed when checked.'}</dd></div>
          </dl>
          {otherRules(s).length ? (
            <>
              <h3 className="qrace-subhead">Other rules</h3>
              <ul className="qrace-list">{otherRules(s).map((rule) => <li key={rule}>{rule}</li>)}</ul>
            </>
          ) : null}
        </EvidencePanel>

        <EvidencePanel kind="official" id="entry" title="Meeting the standard is not entry by itself" meta="A standard is the time needed to apply as a time qualifier. You still apply in the race’s window, and what happens next is the race’s own rule.">
          <p className="tool-callout qrace-entry">{s.entry}</p>
          {s.key === 'nyc' ? <NycPool s={s} /> : null}
          {s.key === 'boston' && BOSTON_CUTOFFS.length ? <p className="tool-note">Every published cut-off is listed <a href="#cutoffs">below</a>.</p> : null}
        </EvidencePanel>

        {s.key === 'boston' ? <BostonCutoffs s={s} /> : null}

        <EvidencePanel id="even-pace" title="Even pace for each standard"
          meta={<>Calculated at even pace, not recorded splits: each standard divided by <MarathonDistance />. It is a reference, not a pacing plan.</>}>
          <div className="tool-table-wrap">
            <table className="tool-table qrace-table qrace-pace-table" data-race={s.key}>
              <caption>Pace for a finish exactly on each {name} {year} standard, calculated at even pace.{s.comparison === 'strictly-under' ? ' A qualifying time has to be strictly under it.' : ''}</caption>
              <thead>
                <tr>
                  <th scope="col">{birthYear ? 'Born' : age.column}</th>
                  {cols.map((c) => <th scope="col" key={c.key}>{c.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {s.bands.map((b) => (
                  <tr key={b.min}>
                    <th scope="row">{birthYear ? bornLabel(s, b) : ageLabel(b)}</th>
                    {cols.map((c) => {
                      const v = b[c.key];
                      return <td key={c.key}>{v === undefined ? '—' : <Pace secondsPerKm={v / MARATHON_KM} />}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </EvidencePanel>
      </div>

      <nav className="qrace-more" aria-labelledby="qrace-more-title">
        <h2 id="qrace-more-title" className="qrace-more-title">Standards for other races</h2>
        <QualifyingRaceLinks races={others} />
        <p className="qrace-more-links">
          <Link href="/tools/qualifying">Check one time against all {others.length + 1} races</Link>
          {course ? <><span aria-hidden="true"> · </span><Link href={course.href}>{course.label}</Link></> : null}
        </p>
      </nav>

      <details className="tool-method">
        <summary>How this page works</summary>
        <div className="tool-method-body">
          <p><strong>Official rules only.</strong> Every standard, age rule, window and application date on this page was transcribed from {possessive(organiser(s))} own page{sources.length > 1 ? 's' : ''} and checked on {checkedDate()}. Standards change from year to year, so check the official page before you apply. Pace Notes reviews them before each registration season.</p>
          {hasPublishedCutoffs(s) ? <p><strong>Past cut-offs are not a forecast.</strong> Where a race publishes how far under the standard its accepted qualifiers had to be, this page lists those figures as published. Nothing here estimates a future cut-off or whether anyone will be accepted.</p> : null}
          <p><strong>The even-pace table</strong> divides each standard by the marathon distance. It is calculated, not recorded, and real races are rarely run at an even pace.</p>
          <ul className="tool-sources">{sources.map((src) => <li key={src.url}><a href={src.url} rel="noopener noreferrer">{src.label}</a></li>)}</ul>
        </div>
      </details>
      <ToolNext current="qualifying" />
    </div>
  );
}

/** New York's capped pool for non-NYRR times: the published cut-offs, past years only. */
function NycPool({ s }: { s: Standard }) {
  const pools = s.poolHistory ?? [];
  const nyrr = s.nyrrMarathonDate;
  return (
    <>
      {nyrr ? (
        <p className="tool-note">The only NYRR marathon in the {raceYear(s)} window is the {nyrr.slice(0, 4)} TCS New York City Marathon on {fmtDate(nyrr)}. Times from other marathons go to the capped pool.</p>
      ) : null}
      {pools.length ? (
        <>
          <h3 className="qrace-subhead" id="pool">Past cut-offs in the capped pool</h3>
          <div className="tool-table-wrap">
            <table className="tool-table qrace-table qrace-pool-table">
              <caption>How far under their standard non-NYRR qualifiers had to be, as reported by NYRR. Past years only, not a forecast.</caption>
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

/** Every published Boston cut-off, as the B.A.A. announced them. Descriptive only; no forecast. */
function BostonCutoffs({ s }: { s: Standard }) {
  const rows = BOSTON_CUTOFFS;
  if (!rows.length) return null;
  const first = rows[0].year;
  const last = rows[rows.length - 1].year;
  const missing: number[] = [];
  for (let y = first; y <= last; y += 1) if (!rows.some((c) => c.year === y)) missing.push(y);
  const sorted = [...rows].sort((a, b) => a.cutoff - b.cutoff);
  const lowest = sorted[0];
  const highest = sorted[sorted.length - 1];
  const lowestYears = rows.filter((c) => c.cutoff === lowest.cutoff).map((c) => c.year);
  const random = s.randomSelection;
  const draw = random ? rows.find((c) => c.year === random.year) : undefined;
  const share = random && draw ? random.drawn / (draw.notAccepted + random.drawn) : null;
  const list = (xs: (string | number)[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
  return (
    <EvidencePanel kind="official" id="cutoffs" title={`Every published Boston cut-off, ${first}–${last}`}
      meta="The B.A.A. accepts qualifiers by how far under their standard they ran until the field is full, then announces the cut-off. Published figures, not a forecast.">
      <div className="tool-table-wrap">
        <table className="tool-table qrace-table qrace-cutoff-table">
          <caption>Cut-off: how far under their standard accepted qualifiers had to be. Field and qualifiers not accepted as announced by the B.A.A.{missing.length ? ` No cut-off is listed for ${list(missing)}.` : ''}</caption>
          <thead><tr><th scope="col">Race year</th><th scope="col">Cut-off</th><th scope="col">Field</th><th scope="col">Not accepted</th></tr></thead>
          <tbody>
            {[...rows].reverse().map((c) => (
              <tr key={c.year}>
                <th scope="row">{c.year}{c.note ? <span className="qrace-row-note">{c.note}</span> : null}</th>
                <td>{fmtMargin(c.cutoff)}</td>
                <td>{grouped(c.field)}</td>
                <td>{grouped(c.notAccepted)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tool-note">Published cut-offs have ranged from {fmtMargin(lowest.cutoff)} ({list(lowestYears)}) to {fmtMargin(highest.cutoff)} ({highest.year}{highest.note ? `, ${highest.note.toLowerCase()}` : ''}). The B.A.A. does not predict cut-offs, and Pace Notes does not either.</p>
      {random && draw && share !== null ? (
        <p className="tool-callout qrace-draw">
          <strong>{random.year} random selection.</strong> For {random.year} the B.A.A. also drew about {grouped(random.drawn)} qualifiers at random from those who missed the {fmtMargin(draw.cutoff)} cut-off. By our derivation from B.A.A. counts ({grouped(random.drawn)} ÷ ({grouped(draw.notAccepted)} not accepted + {grouped(random.drawn)} drawn)), that was about {pct(share)} of that group. The B.A.A. has not said whether the draw will continue.
        </p>
      ) : null}
    </EvidencePanel>
  );
}
