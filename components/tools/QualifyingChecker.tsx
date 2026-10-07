'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { UnitLink as Link, useUnits } from '@/components/UnitsProvider';
import { Choice, DurationField, EvidencePanel, ShareBar } from '@/components/tools/ui';
import { useQueryState } from '@/components/tools/useQueryState';
import { useWidth } from '@/components/viz/useSize';
import { MARATHON_KM, perUnit } from '@/lib/tools/pace';
import {
  BOSTON_CUTOFFS, STANDARDS, VERIFIED_AT, bostonDownhillIndex, clearedCutoffs, evaluate,
  type Band, type Division, type QualifyResult, type Standard,
} from '@/lib/tools/qualifying';
import { formatDuration, formatMargin, parseDuration } from '@/lib/tools/time';
import { METRES_PER_FOOT, type UnitSystem } from '@/lib/units';

/* ---------- Constants ---------- */

/** Only division and time go in the URL. The birth date never does (see docs/TOOLS.md, Privacy). */
const DEFAULTS = { div: 'W', t: '3:29:00' };
const DIVISIONS: { value: string; label: string; division: Division }[] = [
  { value: 'M', label: 'Men', division: 'men' },
  { value: 'W', label: 'Women', division: 'women' },
  { value: 'NB', label: 'Non-binary', division: 'nonbinary' },
];
const DIVISION_WORD: Record<Division, string> = { men: 'men', women: 'women', nonbinary: 'non-binary' };
/** An example runner so the page shows a full result before anything is typed. Flagged on screen until replaced. */
const EXAMPLE_BIRTH = '1984-05-20';
/** Example race date inside every listed window (the Berlin 2026 date). */
const EXAMPLE_RACE = '2026-09-27';
const STORAGE_KEY = 'pace-notes-qualifying-birth';
const SHORT: Record<string, string> = { boston: 'Boston', nyc: 'New York', london: 'London', chicago: 'Chicago', berlin: 'Berlin', sydney: 'Sydney' };
/** NYC 2026 non-NYRR pool: runners at least 22:52 under their standard (the NYC entry text in lib/tools/qualifying.ts). */
const NYC_POOL_2026 = 22 * 60 + 52;
/** Sydney High Performance Program: net drop of no more than 457 m (the Sydney window note in lib/tools/qualifying.ts). */
const SYDNEY_MAX_DROP_M = 457;
/** Boston 2027 random selection: about 1,000 qualifiers who missed the cut-off (BOSTON_CUTOFFS 2027 note). */
const BOSTON_DRAWN_2027 = 1000;

/* ---------- Dates (all YYYY-MM-DD, compared as strings, formatted in UTC so no time zone shifts a day) ---------- */

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const parts = (s: string) => s.split('-').map(Number) as [number, number, number];
function validDate(s: string): boolean {
  if (!ISO.test(s)) return false;
  const [y, m, d] = parts(s);
  const t = new Date(Date.UTC(y, m - 1, d));
  return y >= 1900 && y <= 2100 && t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}
const dayNumber = (s: string) => { const [y, m, d] = parts(s); return Date.UTC(y, m - 1, d) / 86400000; };
const daysBetween = (from: string, to: string) => Math.round(dayNumber(to) - dayNumber(from));
const DATE_FMT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const DATE_FMT_SHORT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const fmtDate = (s: string) => { const [y, m, d] = parts(s); return DATE_FMT.format(new Date(Date.UTC(y, m - 1, d))); };
const fmtDay = (s: string) => { const [y, m, d] = parts(s); return DATE_FMT_SHORT.format(new Date(Date.UTC(y, m - 1, d))); };
const pad = (n: number) => String(n).padStart(2, '0');
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
const inDays = (n: number) => (n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`);
const grouped = (n: number) => Math.round(n).toLocaleString('en-US');

/* ---------- Application windows ---------- */

type AppKind = 'open' | 'upcoming' | 'closed' | 'unknown';
interface AppInfo { kind: AppKind; label: string; short: string; detail: string }

/** Open / upcoming / closed from the visitor's own date and the dated application window, if one is listed. */
function applicationInfo(s: Standard, today: string): AppInfo {
  const opens = s.applications?.opens;
  const closes = s.applications?.closes;
  if (!opens && !closes) return { kind: 'unknown', label: 'Dates not announced', short: 'Not announced', detail: '' };
  if (closes && today > closes) return { kind: 'closed', label: 'Closed', short: 'Closed', detail: '' };
  if (opens && today < opens) {
    const d = daysBetween(today, opens);
    return { kind: 'upcoming', label: 'Upcoming', short: d <= 1 ? `Opens ${inDays(d)}` : `Opens ${fmtDay(opens)}`, detail: `Opens ${inDays(d)}.` };
  }
  const d = closes ? daysBetween(today, closes) : null;
  return { kind: 'open', label: 'Open now', short: 'Open now', detail: d === null ? '' : `Closes ${inDays(d)}.` };
}
const APP_RANK: Record<AppKind, number> = { open: 0, upcoming: 1, unknown: 2, closed: 3 };

/* ---------- Verdicts ---------- */

type Tone = 'good' | 'bad' | 'warn' | 'muted';
interface Verdict { tone: Tone; label: string; short: string; route?: string; reason?: string }
const GLYPH: Record<Tone, string> = { good: '✓', bad: '✕', warn: '!', muted: '–' };

function verdict(r: QualifyResult, opts: { uk: boolean; nyrr: boolean; dropFeet?: number }): Verdict {
  const key = r.standard.key;
  if (key === 'sydney' && opts.dropFeet !== undefined && opts.dropFeet * METRES_PER_FOOT > SYDNEY_MAX_DROP_M && r.status !== 'not-eligible') {
    return { tone: 'muted', label: 'Course not accepted', short: 'Course drop', reason: `Sydney accepts courses with a net drop of no more than ${SYDNEY_MAX_DROP_M} m (${grouped(SYDNEY_MAX_DROP_M / METRES_PER_FOOT)} ft).` };
  }
  switch (r.status) {
    case 'not-eligible':
      return r.limit === null && r.band
        ? { tone: 'muted', label: 'Course not accepted', short: 'Course drop', reason: r.notes[0] }
        : { tone: 'muted', label: 'No age group', short: 'No age group', reason: r.notes[0] };
    case 'no-category':
      return { tone: 'muted', label: 'No non-binary category', short: 'No category', reason: r.standard.nonbinaryNote };
    case 'outside-window':
      return { tone: 'warn', label: 'Outside the qualifying window', short: 'Outside window' };
    case 'misses':
      return { tone: 'bad', label: 'Misses the standard', short: 'Misses' };
    default: {
      if (key === 'london' && !opts.uk) return { tone: 'warn', label: 'Meets the time · UK residents only', short: 'UK only', route: 'If you live in the UK, tick it under “Course and entry details”.' };
      const route: Record<string, string> = {
        boston: 'You can apply. Acceptance depends on the cut-off.',
        nyc: opts.nyrr ? 'Guaranteed entry: an NYRR race time.' : 'Enters the capped pool, fastest first.',
        london: 'Places go fastest first, relative to the standard.',
        chicago: 'Guaranteed entry. There is no cut-off.',
        berlin: 'Not guaranteed: proof is reviewed.',
        sydney: 'Not guaranteed: places go fastest first.',
      };
      return { tone: 'good', label: 'Meets the standard', short: 'Meets', route: route[key] };
    }
  }
}

/* ---------- Text helpers ---------- */

function ageText(s: Standard, r: QualifyResult, birth: string, raceDate: string): { value: string; rule: string } {
  const value = r.age === null ? '—' : String(r.age);
  if (s.ageRule === 'race-day') return { value, rule: `Age on race day, ${fmtDate(s.ageDate!)}${s.key === 'boston' ? ' (expected date, not yet confirmed)' : ''}` };
  if (s.ageRule === 'time-run') return { value, rule: `Age on the day you ran it, ${fmtDate(raceDate)}` };
  return { value, rule: `Age reached in ${s.ageYear}: Berlin bands go by birth year (born ${birth.slice(0, 4)})` };
}

function bandText(s: Standard, b: Band, division: Division): string {
  if (s.ageRule === 'birth-year') {
    const to = s.ageYear! - b.min;
    return b.max >= 120 ? `${DIVISION_WORD[division]}, born ${to} or earlier` : `${DIVISION_WORD[division]}, born ${s.ageYear! - b.max}–${to}`;
  }
  return `${DIVISION_WORD[division]} ${b.max >= 120 ? `${b.min}+` : `${b.min}–${b.max}`}`;
}

const marginWord = (m: number) => (m > 0 ? 'under' : m < 0 ? 'over' : 'exactly on');
const fmtTime = (s: number) => formatDuration(s, true);
const yearOf = (s: Standard) => s.edition.slice(0, 4);

/** "cleared 3 of the last 4 (2024–2027)": descriptive, never a forecast. */
function cutoffSummary(margin: number) {
  const cleared = clearedCutoffs(margin);
  const last4 = BOSTON_CUTOFFS.slice(-4);
  const recent = cleared.filter((c) => c.year >= last4[0].year).length;
  return { recent, all: cleared.length, total: BOSTON_CUTOFFS.length, span: `${last4[0].year}–${last4[last4.length - 1].year}` };
}

/* ---------- Main component ---------- */

interface Item { s: Standard; r: QualifyResult; v: Verdict; app: AppInfo }

export default function QualifyingChecker() {
  const { units } = useUnits();
  const [q, setQ] = useQueryState(DEFAULTS);
  const ids = useId();
  const [today, setToday] = useState(VERIFIED_AT);
  const [birth, setBirth] = useState(EXAMPLE_BIRTH);
  const [example, setExample] = useState(true);
  const [remember, setRemember] = useState(false);
  const [raceDate, setRaceDate] = useState(EXAMPLE_RACE);
  const [dropText, setDropText] = useState('');
  const [dropUnitChoice, setDropUnit] = useState<'ft' | 'm' | null>(null);
  const [nyrr, setNyrr] = useState(false);
  const [uk, setUk] = useState(false);
  const [buffer, setBuffer] = useState(0);
  const [storageRead, setStorageRead] = useState(false);

  // The visitor's own date (after mount, so the static HTML and first render agree) and any remembered birth date.
  useEffect(() => {
    setToday(localToday());
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored && validDate(stored)) { setBirth(stored); setExample(false); setRemember(true); }
    } catch { /* storage unavailable: nothing remembered */ }
    setStorageRead(true);
  }, []);
  // Write or forget only after the stored value has been read, and only when the visitor asked to be remembered.
  useEffect(() => {
    if (!storageRead) return;
    try {
      if (remember && !example && validDate(birth)) window.localStorage.setItem(STORAGE_KEY, birth);
      else if (!remember) window.localStorage.removeItem(STORAGE_KEY);
    } catch { /* storage unavailable */ }
  }, [storageRead, remember, birth, example]);

  const division = (DIVISIONS.find((d) => d.value === q.div) ?? DIVISIONS[1]).division;
  const seconds = q.t ? parseDuration(q.t, 'race') : null;
  const dropUnit = dropUnitChoice ?? (units === 'mi' ? 'ft' : 'm');
  const dropNumber = dropText.trim() === '' ? null : Number(dropText.replace(/,/g, ''));
  const dropValid = dropNumber === null || Number.isFinite(dropNumber);
  const dropFeet = dropNumber !== null && Number.isFinite(dropNumber) ? (dropUnit === 'm' ? dropNumber / METRES_PER_FOOT : dropNumber) : undefined;

  const birthOk = validDate(birth);
  const raceOk = validDate(raceDate);
  const timeError = seconds !== null && seconds < 7200 ? 'Under 2:00:00 is faster than the marathon world record. Check the time.' : null;
  const orderError = birthOk && raceOk && birth >= raceDate ? 'The date of birth must be before the race date.' : null;
  const ready = seconds !== null && !timeError && birthOk && raceOk && !orderError && dropValid;

  const items: Item[] = useMemo(() => {
    if (!ready) return [];
    const input = { birth, division, seconds: seconds!, raceDate, dropFeet, nyrr, ukResident: uk };
    return STANDARDS
      .map((s, i) => {
        const r = evaluate(s, input);
        return { s, r, v: verdict(r, { uk, nyrr, dropFeet }), app: applicationInfo(s, today), i };
      })
      .sort((a, b) => {
        const rank = APP_RANK[a.app.kind] - APP_RANK[b.app.kind];
        if (rank) return rank;
        if (a.app.kind === 'open') return (a.s.applications?.closes ?? '9999').localeCompare(b.s.applications?.closes ?? '9999') || a.i - b.i;
        if (a.app.kind === 'upcoming') return (a.s.applications?.opens ?? '').localeCompare(b.s.applications?.opens ?? '') || a.i - b.i;
        return a.i - b.i;
      })
      .map(({ s, r, v, app }) => ({ s, r, v, app }));
  }, [ready, birth, division, seconds, raceDate, dropFeet, nyrr, uk, today]);

  const meets = items.filter((it) => it.r.status === 'meets').length;
  const boston = items.find((it) => it.s.key === 'boston');
  const planned = raceOk && raceDate > today;
  const extras = [dropFeet !== undefined ? `${grouped(dropNumber!)} ${dropUnit} drop` : null, nyrr ? 'NYRR' : null, uk ? 'UK resident' : null].filter(Boolean);

  return (
    <div className="qualifying">
      <div className="tool-workspace">
        <form className="tool-inputs" onSubmit={(e) => e.preventDefault()} aria-label="Qualifying checker inputs">
          <h2>Your marathon</h2>
          <DurationField label="Chip (net) time" large value={seconds} placeholder="3:29:00" error={timeError}
            onChange={(s) => setQ({ t: s === null ? '' : formatDuration(s, true) })} hint="h:mm:ss, e.g. 3:29:00 or 3:29" />
          <div className="tool-field">
            <span className="tool-label" aria-hidden="true">Division</span>
            <Choice label="Division" value={q.div} onChange={(v) => setQ({ div: v })} options={DIVISIONS.map(({ value, label }) => ({ value, label }))} />
          </div>
          <div className="tool-field">
            <label htmlFor={`${ids}-race`}>Race date</label>
            <div className="qualifying-date-row">
              <input id={`${ids}-race`} type="date" className="qualifying-date" value={raceDate} min="2024-01-01" max="2028-12-31"
                aria-invalid={!raceOk || undefined} aria-describedby={`${ids}-race-hint`} onChange={(e) => setRaceDate(e.target.value)} />
              <button type="button" className="qualifying-link-button" onClick={() => setRaceDate(today)}>Today</button>
            </div>
            <p className={`tool-field-hint${raceOk ? '' : ' is-error'}`} id={`${ids}-race-hint`}>
              {raceOk ? (planned ? 'A future date checks a planned race against the current windows.' : 'The day you ran it. Each race counts times from its own window.') : 'Enter the race date.'}
            </p>
          </div>
          <div className="tool-field">
            <label htmlFor={`${ids}-birth`}>Date of birth {example ? <span className="qualifying-example">Example</span> : null}</label>
            <input id={`${ids}-birth`} type="date" className="qualifying-date" value={birth} min="1900-01-01" max={today} autoComplete="bday"
              aria-invalid={(!birthOk || Boolean(orderError)) || undefined} aria-describedby={`${ids}-birth-hint`}
              onChange={(e) => { setBirth(e.target.value); setExample(false); }} />
            <p className={`tool-field-hint${birthOk && !orderError ? '' : ' is-error'}`} id={`${ids}-birth-hint`}>
              {!birthOk ? 'Enter your date of birth: each race works out your age group differently.'
                : orderError ?? (example ? `An example runner born ${fmtDate(EXAMPLE_BIRTH)}. Enter yours. ` : '')}
              {birthOk && !orderError ? 'It stays in this browser: never in the link or analytics.' : null}
            </p>
            <label className="tool-check">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              <span>Remember my date of birth on this device</span>
            </label>
          </div>

          <details className="qualifying-more">
            <summary>
              Course and entry details
              {extras.length ? <span className="qualifying-summary-value">{extras.join(' · ')}</span> : <span className="qualifying-summary-hint">optional</span>}
            </summary>
            <div className="qualifying-more-body">
              <div className="tool-field">
                <label htmlFor={`${ids}-drop`}>Course net drop (start minus finish elevation)</label>
                <div className="qualifying-drop">
                  <input id={`${ids}-drop`} inputMode="decimal" autoComplete="off" placeholder="0" value={dropText}
                    aria-invalid={!dropValid || undefined} aria-describedby={`${ids}-drop-hint`} onChange={(e) => setDropText(e.target.value)} />
                  <Choice label="Drop unit" small value={dropUnit} onChange={(v) => setDropUnit(v)} options={[{ value: 'ft', label: 'ft' }, { value: 'm', label: 'm' }]} />
                </div>
                <p className={`tool-field-hint${dropValid ? '' : ' is-error'}`} id={`${ids}-drop-hint`}>
                  {!dropValid ? 'Type a number, e.g. 1650.' : dropFeet !== undefined ? <>{dropUnit === 'm' ? `= ${grouped(dropFeet)} ft. ` : `= ${grouped(dropFeet * METRES_PER_FOOT)} m. `}{dropNote(dropFeet)} </> : null}
                  For Boston’s <a href={STANDARDS[0].sources[0].url} rel="noopener noreferrer">downhill index</a>: 1,500 ft (457 m) adds 5:00, 3,000 ft (914 m) adds 10:00, 6,000 ft (1,829 m) is not accepted. Sydney accepts at most 457 m. The B.A.A. does not list affected races.
                </p>
              </div>
              <label className="tool-check">
                <input type="checkbox" checked={nyrr} onChange={(e) => setNyrr(e.target.checked)} />
                <span>The race was an NYRR event (New York guaranteed entry)</span>
              </label>
              <label className="tool-check">
                <input type="checkbox" checked={uk} onChange={(e) => setUk(e.target.checked)} />
                <span>I live in the UK (London Good For Age)</span>
              </label>
            </div>
          </details>
        </form>

        <div className="tool-results">
          {ready ? (
            <>
              <div className="tool-headline qualifying-headline">
                <div className="qualifying-head" aria-live="polite" aria-atomic="true">
                  <span className="evidence-badge evidence-official">Official standards</span>
                  <p className="qualifying-kicker">
                    {DIVISIONS.find((d) => d.division === division)!.label} · {fmtTime(seconds!)} · {planned ? 'planned for' : 'run'} {fmtDate(raceDate)}
                    {example ? ' · example birth date' : ''}
                  </p>
                  <p className="qualifying-big">
                    {meets === items.length ? <>Meets all {items.length} time standards</> : meets === 0 ? <>Meets none of the {items.length} time standards</> : <>Meets {meets} of {items.length} time standards</>}
                  </p>
                  {boston ? <p className="qualifying-big-sub"><BostonLine it={boston} /></p> : null}
                </div>
                <Scoreboard items={items} />
              </div>

              {example ? (
                <p className="tool-callout qualifying-example-note">
                  <strong>These cards use an example birth date ({fmtDate(EXAMPLE_BIRTH)}).</strong> Enter yours: Boston, New York, Chicago and Sydney use your age on their race day, London your age when you ran the time, and Berlin your birth year.
                </p>
              ) : null}

              {items.map((it) => (
                <RaceCard key={it.s.key} it={it} birth={birth} raceDate={raceDate} seconds={seconds!} division={division} dropFeet={dropFeet} nyrr={nyrr} />
              ))}

              <TargetsPanel items={items} seconds={seconds!} buffer={buffer} setBuffer={setBuffer} dropFeet={dropFeet} units={units} />

              <p className="tool-note qualifying-share-note">The copied link carries your division and time only. Whoever opens it enters their own date of birth.</p>
              <ShareBar />
            </>
          ) : (
            <p className="tool-empty">
              {seconds === null ? 'Enter your chip time to check it against six marathons’ standards.'
                : timeError ? 'Check the chip time.'
                : !raceOk ? 'Enter the race date: each race only counts times from its own window.'
                : !birthOk ? 'Enter your date of birth: each race works out your age group differently.'
                : orderError ? orderError
                : 'Check the course drop: type a number.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function dropNote(feet: number): string {
  const index = bostonDownhillIndex(feet);
  if (index === null) return 'Not accepted for Boston.';
  return index ? `Boston adds ${index / 60}:00.` : 'No Boston index.';
}

function BostonLine({ it }: { it: Item }) {
  const { r } = it;
  if (r.margin === null) return <>Boston {yearOf(it.s)}: {(it.v.reason ?? it.v.label).replace(/\.$/, '')}.</>;
  const sum = cutoffSummary(r.margin);
  const lead = <>Boston {yearOf(it.s)}: <b>{formatMargin(r.margin)}</b> {marginWord(r.margin)} the standard</>;
  if (r.status === 'outside-window') return <>{lead}, but the race date is outside the {yearOf(it.s)} window (from {fmtDate(it.s.windowStart)}).</>;
  if (r.margin < 0) return <>{lead}.</>;
  return <>{lead}. That margin would have cleared {sum.recent} of the last 4 cut-offs ({sum.span}). Past cut-offs, not a forecast.</>;
}

/* ---------- Headline scoreboard: margin against each standard ---------- */

function Scoreboard({ items }: { items: Item[] }) {
  const margins = items.map((it) => it.r.margin).filter((m): m is number => m !== null);
  const CAP = 30 * 60;
  const lo = Math.max(-CAP, Math.floor(Math.min(-300, ...margins) / 300) * 300);
  const hi = Math.min(CAP, Math.ceil(Math.max(300, ...margins) / 300) * 300);
  const span = hi - lo;
  const step = span > 2400 ? 1200 : span > 1200 ? 600 : 300;
  const pct = (v: number) => ((Math.min(hi, Math.max(lo, v)) - lo) / span) * 100;
  const ticks: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) ticks.push(t);
  return (
    <div className="qualifying-board-wrap">
      <div className="qualifying-board-axis" aria-hidden="true">
        <span />
        <div className="qualifying-board-scale">
          {ticks.map((t) => <span key={t} style={{ left: `${pct(t)}%` }} className={t === 0 ? 'is-zero' : undefined}>{t === 0 ? '0' : `${t > 0 ? '+' : '−'}${Math.abs(t) / 60}`}</span>)}
        </div>
        <span>min</span>
      </div>
      <ol className="qualifying-board">
        {items.map(({ s, r, v, app }) => {
          const m = r.margin;
          const clipped = m !== null && (m > hi || m < lo);
          return (
            <li key={s.key} className={`qualifying-board-row is-${v.tone}`}>
              <a className="qualifying-board-name" href={`#qualifying-${s.key}`}>
                <b>{SHORT[s.key]} {yearOf(s)}</b>
                <span className={`qualifying-board-app is-${app.kind}`}>{app.short}</span>
              </a>
              <div className="qualifying-board-track" aria-hidden="true">
                {ticks.map((t) => <i key={t} className={t === 0 ? 'is-zero' : undefined} style={{ left: `${pct(t)}%` }} />)}
                {m !== null ? (
                  <span className={`qualifying-board-bar${m < 0 ? ' is-neg' : ''}${clipped ? ' is-clipped' : ''}`}
                    style={{ left: `${Math.min(pct(0), pct(m))}%`, width: `${Math.abs(pct(m) - pct(0))}%` }} />
                ) : null}
              </div>
              <p className="qualifying-board-value">
                <b>{m !== null ? formatMargin(m) : '—'}</b>
                {m !== null ? <span className="sr-only"> {marginWord(m)} the standard.</span> : null}
                <span className="qualifying-board-status"><span aria-hidden="true">{GLYPH[v.tone]}</span> {v.short}</span>
              </p>
            </li>
          );
        })}
      </ol>
      <p className="qualifying-board-caption">Minutes under (+) or over (−) each standard. Bars stop at {CAP / 60} minutes. Tap a race for its rules.</p>
    </div>
  );
}

/* ---------- One card per race ---------- */

function RaceCard({ it, birth, raceDate, seconds, division, dropFeet, nyrr }: {
  it: Item; birth: string; raceDate: string; seconds: number; division: Division; dropFeet?: number; nyrr: boolean;
}) {
  const { s, r, v, app } = it;
  const age = ageText(s, r, birth, raceDate);
  const inside = raceDate >= s.windowStart && (!s.windowEnd || raceDate <= s.windowEnd);
  const index = s.key === 'boston' && dropFeet !== undefined ? bostonDownhillIndex(dropFeet) : 0;
  const notes = r.notes.filter((n) => !n.startsWith('Downhill index') && !n.startsWith('London Good For Age places') && !n.startsWith('An NYRR race') && !n.startsWith('A non-NYRR') && n !== v.reason);
  // What it would take, in chip time on this course: the standard less any downhill index (and a second for a strict "under").
  const needed = r.limit !== null && index !== null ? r.limit - (index ?? 0) - (s.comparison === 'strictly-under' ? 1 : 0) : null;
  const passesTime = r.margin !== null && (s.comparison === 'strictly-under' ? r.margin > 0 : r.margin >= 0);
  const extraNote = v.tone === 'muted' ? null
    : r.status === 'misses' && needed !== null ? `To meet it: ${fmtTime(needed)} or faster${index ? ' on this course' : ''}.`
    : r.status === 'outside-window' ? `The time ${passesTime ? 'would meet' : 'would also miss'} the standard, but ${fmtDate(raceDate)} is outside this edition’s window.`
    : null;
  const fine = [...(s.extra ?? []), s.nonbinaryNote];
  if (s.key === 'boston') fine.push('B.A.A. statements differ on how long the downhill index lasts: the June 2025 rule said at least two years; the September 2026 registration update says it may change before 2028 registration.');
  if (s.key === 'london') fine.push('London publishes no acceptance cut-off.');
  return (
    <EvidencePanel kind="official" id={`qualifying-${s.key}`} title={s.race} meta={<>Edition {s.edition}</>}>
      <span className={`qualifying-app is-${app.kind}`}>{app.label}</span>
      <div className="qualifying-card">
        <div className={`qualifying-verdict is-${v.tone}`}>
          <p className="qualifying-status"><span className="qualifying-glyph" aria-hidden="true">{GLYPH[v.tone]}</span>{v.label}</p>
          {r.margin !== null ? (
            <p className="qualifying-margin"><b>{formatMargin(r.margin)}</b> <span>{marginWord(r.margin)} the standard</span></p>
          ) : null}
          {v.route || v.reason || extraNote || notes.length ? (
            <ul className="qualifying-verdict-notes">
              {v.route ? <li>{v.route}</li> : null}
              {extraNote ? <li>{extraNote}</li> : null}
              {v.reason ? <li>{v.reason}</li> : null}
              {notes.map((n) => <li key={n}>{n}</li>)}
              {s.key === 'boston' && r.margin === 0 ? <li>Exactly on the standard. The B.A.A. does not say outright whether an equal time qualifies; acceptance goes to those furthest under.</li> : null}
            </ul>
          ) : null}
        </div>

        <dl className="qualifying-facts">
          <div className="is-key"><dt>Age used</dt><dd><b>{age.value}</b><span>{age.rule}</span></dd></div>
          <div className="is-key">
            <dt>Standard</dt>
            <dd>
              {r.limit !== null && r.band ? <><b>{fmtTime(r.limit)}</b><span>{bandText(s, r.band, division)}{division === 'nonbinary' && r.band.nonbinary === r.band.women ? ' (equal to the women’s)' : ''} · {s.comparison === 'strictly-under' ? 'strictly under' : 'at or under'}</span></>
                : <><b>—</b><span>{v.reason ?? 'No standard applies.'}</span></>}
            </dd>
          </div>
          <div className="is-key">
            <dt>{s.key === 'boston' ? 'Time counted' : 'Your time'}</dt>
            <dd>
              {s.key === 'boston' && index === null ? <><b>—</b><span>A net drop of 6,000 ft or more is not accepted.</span></>
                : s.key === 'boston' && index ? <><b>{fmtTime(r.counted)}</b><span>{fmtTime(seconds)} chip + {index / 60}:00 downhill index for a {grouped(dropFeet!)} ft net drop</span></>
                : <><b>{fmtTime(seconds)}</b><span>{s.key === 'boston' ? (dropFeet !== undefined ? 'Chip time; no downhill index under 1,500 ft' : 'Chip time; add a course drop for the downhill index') : 'Chip (net) time'}</span></>}
            </dd>
          </div>
          <div className="is-half">
            <dt>Window</dt>
            <dd><b className={inside ? 'is-in' : 'is-out'}><span aria-hidden="true">{inside ? '✓ ' : '✕ '}</span>{inside ? 'Inside' : 'Outside'}</b><span>{s.windowNote}</span></dd>
          </div>
          <div className="is-half">
            <dt>Applications</dt>
            <dd><b className={`qualifying-app-inline is-${app.kind}`}>{app.label}</b><span>{app.detail ? `${app.detail} ` : ''}{s.applications?.note ?? 'Application dates for this edition are not listed yet.'}{app.kind === 'closed' && s.key === 'sydney' ? ' Shown for reference.' : ''}</span></dd>
          </div>
          <div className="is-wide"><dt>Entry</dt><dd><span className="qualifying-entry">{s.entry}</span></dd></div>
        </dl>

        {s.key === 'boston' ? <BostonHistory margin={r.margin} outside={r.status === 'outside-window'} /> : null}
        {s.key === 'nyc' && r.margin !== null && r.margin >= 0 && !nyrr ? (
          <p className="tool-callout qualifying-pool">
            <strong>The capped pool.</strong> For 2026, non-NYRR qualifiers needed to be at least {formatDuration(NYC_POOL_2026)} under their standard. A margin of {formatMargin(r.margin)} {r.margin >= NYC_POOL_2026 ? 'would have been enough' : 'would not have been enough'} that year. NYRR does not publish the next one in advance, and neither does Pace Notes.
          </p>
        ) : null}

        <details className="qualifying-fine">
          <summary>Rules and fine print</summary>
          <ul>{fine.map((f) => <li key={f}>{f}</li>)}</ul>
        </details>

        <p className="qualifying-sources">
          {s.sources.map((src) => <a key={src.url} href={src.url} rel="noopener noreferrer">{src.label}<span aria-hidden="true"> ↗</span></a>)}
          <span className="qualifying-checked">Checked <time dateTime={VERIFIED_AT}>{VERIFIED_AT}</time></span>
        </p>
      </div>
    </EvidencePanel>
  );
}

/* ---------- Boston: every past cut-off against this margin ---------- */

function BostonHistory({ margin, outside }: { margin: number | null; outside: boolean }) {
  const draw = BOSTON_CUTOFFS[BOSTON_CUTOFFS.length - 1];
  const share = BOSTON_DRAWN_2027 / (draw.notAccepted + BOSTON_DRAWN_2027);
  const sorted = [...BOSTON_CUTOFFS].sort((a, b) => a.cutoff - b.cutoff);
  const lowest = sorted[0];
  const highest = sorted[sorted.length - 1];
  const zeroYears = BOSTON_CUTOFFS.filter((c) => c.cutoff === 0).map((c) => c.year);
  const sum = margin !== null ? cutoffSummary(margin) : null;
  return (
    <section className="qualifying-boston" aria-labelledby="qualifying-boston-history">
      <h3 id="qualifying-boston-history">Your margin against every past cut-off</h3>
      {margin === null ? <p className="qualifying-boston-lead">With no margin to compare, the cut-offs are shown for reference.</p>
        : margin < 0 ? <p className="qualifying-boston-lead">A time {formatMargin(margin).slice(1)} over the standard could not apply in any of these years.</p>
        : <p className="qualifying-boston-lead">A margin of <b>{formatMargin(margin)}</b> would have cleared <b>{sum!.recent} of the last 4</b> ({sum!.span}) and {sum!.all} of the {sum!.total} cut-offs since {BOSTON_CUTOFFS[0].year}.{outside ? ' This compares the margin only: the race date is outside the 2028 window.' : ''}</p>}
      <CutoffChart margin={margin} />
      <div className="tool-table-wrap">
        <table className="tool-table qualifying-cutoff-table">
          <thead><tr><th scope="col">Race</th><th scope="col">Cut-off</th><th scope="col">Turned away</th><th scope="col">Cleared</th></tr></thead>
          <tbody>
            {[...BOSTON_CUTOFFS].reverse().map((c) => {
              const cleared = margin !== null && margin >= c.cutoff;
              return (
                <tr key={c.year}>
                  <td>{c.year}{c.note ? <span className="qualifying-row-note">{c.note}</span> : null}</td>
                  <td>{formatDuration(c.cutoff)}</td>
                  <td>{grouped(c.notAccepted)}</td>
                  <td className={cleared ? 'is-minus' : undefined}>{cleared ? '✓ yes' : <span className="qualifying-dim">no</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="tool-note qualifying-table-note">Cut-off: how far under their standard applicants had to be, as announced by the B.A.A. “Turned away” counts qualifiers who applied and were not accepted. “Cleared” means your margin was at least the cut-off. No cut-off is listed for {BOSTON_CUTOFFS[0].year + 1}.</p>
      <p className="tool-callout qualifying-draw">
        <strong>2027 random selection.</strong> For 2027 the B.A.A. also drew about {grouped(BOSTON_DRAWN_2027)} qualifiers at random from those who missed the {formatDuration(draw.cutoff)} cut-off. By our derivation from B.A.A. counts ({grouped(BOSTON_DRAWN_2027)} ÷ ({grouped(draw.notAccepted)} turned away + {grouped(BOSTON_DRAWN_2027)} drawn)), that was about {Math.round(share * 100)}% of that group. The B.A.A. has not said whether the draw will continue.
      </p>
      <p className="tool-note">The B.A.A. does not predict cut-offs, and Pace Notes does not either. They have ranged from {formatDuration(lowest.cutoff)} ({zeroYears.join(' and ')}) to {formatDuration(highest.cutoff)} ({highest.year}{highest.note ? `, ${highest.note.toLowerCase()}` : ''}).</p>
    </section>
  );
}

function CutoffChart({ margin }: { margin: number | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useWidth(ref, 640);
  const narrow = width < 520;
  const H = narrow ? 200 : 230;
  const m = { l: 40, r: 8, t: 30, b: 26 };
  const rows = BOSTON_CUTOFFS;
  const maxCut = Math.max(...rows.map((c) => c.cutoff));
  const yMax = margin !== null && margin > maxCut && margin <= 600 ? Math.ceil((margin + 30) / 120) * 120 : Math.ceil((maxCut + 10) / 120) * 120;
  const plotW = Math.max(120, width - m.l - m.r);
  const plotH = H - m.t - m.b;
  const step = plotW / rows.length;
  const barW = Math.max(6, Math.min(26, step * 0.62));
  const x = (i: number) => m.l + step * i + step / 2;
  const y = (v: number) => m.t + plotH - (Math.min(v, yMax) / yMax) * plotH;
  const ticks: number[] = [];
  for (let t = 0; t <= yMax; t += 120) ticks.push(t);
  const sum = margin !== null && margin >= 0 ? cutoffSummary(margin) : null;
  const label = `Column chart of Boston Marathon cut-offs from ${rows[0].year} to ${rows[rows.length - 1].year}, from 0:00 to ${formatDuration(maxCut)} under the standard. `
    + (margin === null ? 'No margin to compare.' : margin < 0 ? `Your time is ${formatMargin(margin).slice(1)} over the standard, so it clears none.` : `Your margin of ${formatMargin(margin)} would have cleared ${sum!.all} of ${sum!.total}, including ${sum!.recent} of the last 4 (${sum!.span}).`);
  const lineY = margin !== null && margin >= 0 ? y(margin) : null;
  const above = margin !== null && margin > yMax;
  return (
    <div className="viz qualifying-cutoff-chart" ref={ref}>
      <div className="qualifying-legend" aria-hidden="true">
        <span><i className="is-cleared" />Cleared by your margin</span>
        <span><i className="is-not" />Not cleared</span>
        {lineY !== null ? <span><i className="is-line" />Your margin</span> : null}
      </div>
      <svg width={width} height={H} role="img" aria-label={label}>
        <defs>
          <pattern id="qualifying-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="5" height="5" fill="var(--paper-2)" />
            <line x1="0" y1="0" x2="0" y2="5" stroke="var(--line-2)" strokeWidth="2" />
          </pattern>
        </defs>
        {ticks.map((t) => (
          <g key={t} className="grid">
            <line x1={m.l} x2={width - m.r} y1={y(t)} y2={y(t)} />
            <text x={m.l - 6} y={y(t) + 4} textAnchor="end">{formatDuration(t)}</text>
          </g>
        ))}
        {rows.map((c, i) => {
          const cleared = margin !== null && margin >= c.cutoff;
          const top = y(c.cutoff);
          const h = Math.max(0, m.t + plotH - top);
          return (
            <g key={c.year}>
              {h > 0 ? <rect x={x(i) - barW / 2} y={top} width={barW} height={h} rx={2}
                fill={cleared ? 'var(--green)' : 'url(#qualifying-hatch)'} stroke={cleared ? 'var(--green-ink)' : 'var(--ink-3)'} strokeWidth={cleared ? 0 : 1} />
                : <rect x={x(i) - barW / 2} y={m.t + plotH - 2} width={barW} height={2} fill={cleared ? 'var(--green-ink)' : 'var(--ink-3)'} />}
              {!narrow ? <text x={x(i)} y={top - 6} textAnchor="middle" className="qualifying-bar-value">{formatDuration(c.cutoff)}</text> : null}
              <text x={x(i)} y={H - 8} textAnchor="middle" className={narrow ? 'qualifying-year-short' : undefined}>{narrow ? String(c.year).slice(2) : c.year}</text>
            </g>
          );
        })}
        <line x1={m.l} x2={width - m.r} y1={m.t + plotH} y2={m.t + plotH} stroke="var(--ink-3)" />
        {lineY !== null ? (
          <g className="qualifying-margin-line">
            <line x1={m.l} x2={width - m.r} y1={lineY} y2={lineY} />
            <text className="annotation" x={m.l + 4} y={lineY - 7}>
              {above ? `Your margin ${formatMargin(margin!)} is above every cut-off ▲` : `Your margin ${formatMargin(margin!)}`}
            </text>
          </g>
        ) : margin !== null ? (
          <text className="annotation" x={m.l + 6} y={m.t - 12}>Your time is {formatMargin(margin).slice(1)} over the standard</text>
        ) : null}
      </svg>
    </div>
  );
}

/* ---------- Targets: standard minus a buffer, and the even pace for it ---------- */

function TargetsPanel({ items, seconds, buffer, setBuffer, dropFeet, units }: {
  items: Item[]; seconds: number; buffer: number; setBuffer: (n: number) => void; dropFeet?: number; units: UnitSystem;
}) {
  const rows = items.filter((it) => it.r.limit !== null && !(it.s.key === 'boston' && dropFeet !== undefined && bostonDownhillIndex(dropFeet) === null));
  const bostonIndex = dropFeet !== undefined ? bostonDownhillIndex(dropFeet) ?? 0 : 0;
  const target = (it: Item) => it.r.limit! - (it.s.key === 'boston' ? bostonIndex : 0) - buffer * 60 - (it.s.comparison === 'strictly-under' ? 1 : 0);
  const goalParam = (t: number) => { const mins = Math.floor(t / 60); return `${Math.floor(mins / 60)}:${pad(mins % 60)}`; };
  const linkable = (t: number) => t >= 150 * 60 && t <= 390 * 60;
  const bostonRow = rows.find((it) => it.s.key === 'boston');
  const focus = bostonRow ?? rows[0];
  const set = (n: number) => setBuffer(Math.max(0, Math.min(30, n)));
  return (
    <EvidencePanel kind="arithmetic" title="Times to aim for" meta="Each standard minus the buffer you choose, and the even pace for it. Arithmetic on the official standards: it does not forecast a cut-off.">
      <div className="qualifying-buffer no-print">
        <span className="tool-label" id="qualifying-buffer-label">Buffer under each standard</span>
        <div className="tool-stepper" role="group" aria-labelledby="qualifying-buffer-label">
          <button type="button" aria-label="One minute less buffer" disabled={buffer <= 0} onClick={() => set(buffer - 1)}>−</button>
          <div className="tool-stepper-value"><b className="qualifying-buffer-value" aria-live="polite">{buffer} min</b></div>
          <button type="button" aria-label="One minute more buffer" disabled={buffer >= 30} onClick={() => set(buffer + 1)}>+</button>
        </div>
      </div>
      <div className="tool-table-wrap">
        <table className="tool-table wrap-first qualifying-targets">
          <thead><tr><th scope="col">Race</th><th scope="col">Aim for</th><th scope="col" className="qualifying-pace-col">Pace /{units}</th><th scope="col">Your margin</th></tr></thead>
          <tbody>
            {rows.map((it) => {
              const t = target(it);
              const diff = t - seconds;
              return (
                <tr key={it.s.key} className={it === focus ? 'is-key' : undefined}>
                  <td>{SHORT[it.s.key]} {yearOf(it.s)}<span className="qualifying-row-note">standard {fmtTime(it.r.limit!)}{it.s.key === 'boston' && bostonIndex ? `, −${bostonIndex / 60}:00 index` : ''}</span></td>
                  <td>
                    {linkable(t) ? <Link href={`/tools/pace-band?goal=${goalParam(t)}`} aria-label={`${fmtTime(t)}: pace band for this target`}>{fmtTime(t)}</Link> : fmtTime(t)}
                    <span className="qualifying-pace-inline">{formatDuration(perUnit(t / MARATHON_KM, units))}/{units}</span>
                  </td>
                  <td className="qualifying-pace-col">{formatDuration(perUnit(t / MARATHON_KM, units))}</td>
                  <td className={diff >= 0 ? 'is-minus' : 'is-plus'}>{formatMargin(diff)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="tool-note qualifying-table-note">
        Your margin is how far your {fmtTime(seconds)} is under (+) or over (−) each target. Paces are even-pace arithmetic over {units === 'mi' ? '26.22 mi' : '42.195 km'}. {rows.some((it) => it.s.comparison === 'strictly-under') ? 'London needs a time strictly under its standard, so its target is a second inside. ' : ''}
        {bostonIndex ? `Boston’s target includes the ${bostonIndex / 60}:00 downhill index for your course. ` : ''}Each target links to a pace band for it.
      </p>
      {focus && linkable(target(focus)) ? (
        <p className="tool-callout qualifying-plan no-print">
          <strong>Planning a {SHORT[focus.s.key]} attempt at {fmtTime(target(focus))}?</strong> The <Link href={`/tools/pace-band?goal=${goalParam(target(focus))}`}>pace band</Link> shows what finishes near that time actually ran at each 5 km mat, and the <Link href={`/tools/course-chooser?goal=${goalParam(target(focus))}`}>course chooser</Link> compares courses at that pace.
        </p>
      ) : null}
    </EvidencePanel>
  );
}
