'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { UnitLink as Link, useUnits } from '@/components/UnitsProvider';
import { Choice, DurationField, EvidencePanel, ExampleNote, ShareBar, Stat } from '@/components/tools/ui';
import { useQueryState } from '@/components/tools/useQueryState';
import { DISTANCES, MARATHON_KM, SPLIT_KM, kmh, mph, paceChart, paceFrom, perKm, perUnit, splitTable, unitKm, type SplitInterval } from '@/lib/tools/pace';
import { formatDuration, parseDuration } from '@/lib/tools/time';
import { KM_PER_MILE, type UnitSystem } from '@/lib/units';

type Field = 'distance' | 'time' | 'pace';

const fmtDistance = (km: number, units: UnitSystem) => {
  const v = units === 'mi' ? km / KM_PER_MILE : km;
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(v)} ${units}`;
};
const fmtPace = (secondsPerKm: number, units: UnitSystem) => `${formatDuration(perUnit(secondsPerKm, units))}/${units}`;
const INTERVALS: { value: SplitInterval; label: string }[] = [
  { value: '400m', label: '400 m' }, { value: 'quarter', label: '¼ mi' }, { value: 'km', label: '1 km' }, { value: 'mi', label: '1 mi' }, { value: '5k', label: '5 km mats' },
];
const DIFFS = [-300, -180, -120, -60, 0, 60, 120, 180, 300];
const DEFAULTS = { view: 'calc', d: 'marathon', km: '', t: '3:30:00', p: '', solve: 'pace', split: '', diff: '0' };
/** The query keys that hold the visitor's inputs: a link that sets any of them is not the example. */
const INPUT_KEYS = ['d', 'km', 't', 'p', 'solve'] as const;

/* Custom distances: plain decimals only, from 0.1 to 1,000 km, so a typed value or a shared link cannot build a table of many thousands of rows. */
const MIN_KM = 0.1;
const MAX_KM = 1000;
/** Split tables never pass this many rows: shorter intervals are offered only while they fit. */
const MAX_ROWS = 500;
const PLAIN_DECIMAL = /^\d*[.,]?\d*$/;
type DistanceCheck = { km: number | null; problem: 'format' | 'range' | 'incomplete' | null };
/**
 * Read a plain decimal ("26.2", "26,2", ".5") typed in units of `unitLengthKm`, as km rounded to 6 places. Exponents ("1e3"), signs and units are refused.
 * Six places keep the URL free of float noise (13.1 mi is km=21.082406) while whole and quarter miles stay exact (2 mi = 3.218688 km),
 * so a typed distance never lands a hair past a split mark and adds a sliver row.
 */
function readDistance(text: string, unitLengthKm: number): DistanceCheck {
  const t = text.trim();
  if (!t) return { km: null, problem: null };
  if (!PLAIN_DECIMAL.test(t)) return { km: null, problem: 'format' };
  const n = Number(t.replace(',', '.'));
  // ".", "0" and "0." are on the way to a number such as 0.5.
  if (!(n > 0)) return { km: null, problem: 'incomplete' };
  const km = Math.round(n * unitLengthKm * 1e6) / 1e6;
  return km >= MIN_KM && km <= MAX_KM ? { km, problem: null } : { km: null, problem: 'range' };
}
const rangeMessage = (units: UnitSystem) => (units === 'mi' ? 'Type a distance from 0.1 km (0.06 mi) to 621 mi.' : 'Type a distance from 0.1 to 1,000 km.');
const solvedMessage = (km: number, units: UnitSystem) => `That time and pace give ${fmtDistance(km, units)}; the calculator covers ${units === 'mi' ? '0.1 km (0.06 mi) to 621 mi' : '0.1 to 1,000 km'}.`;
const formatMessage = (units: UnitSystem) => `Type the distance as a plain number, such as ${units === 'mi' ? '13.1' : '21.1'}.`;
/** Whole minutes as H:MM. */
const hm = (minutes: number) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;

/** A value that follows `value` once it has stopped changing for `ms` (keeps the status line from announcing every keystroke). */
function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), ms);
    return () => window.clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

export default function PaceCalculator() {
  const { units } = useUnits();
  const [q, setQ, queryReady, fromUrl] = useQueryState(DEFAULTS);
  const [chartFrom, setChartFrom] = useState(units === 'mi' ? 300 : 180);
  // The visitor changed an input on this page (hides the example note and lets the status line speak).
  const [touched, setTouched] = useState(false);
  // The custom distance as typed, kept while it is incomplete ("26.", "0.") or invalid; null shows the stored distance.
  const [distText, setDistText] = useState<string | null>(null);
  const [distBlurred, setDistBlurred] = useState(false);
  const distId = useId();
  useEffect(() => { setDistText(null); }, [units]);

  const preset = DISTANCES.find((d) => d.key === q.d);
  const stored = readDistance(q.km, 1);
  const distCheck = distText !== null ? readDistance(distText, unitKm(units)) : stored;
  const shownDistance = distText ?? (stored.km !== null ? String(Math.round((stored.km / unitKm(units)) * 1000) / 1000) : q.km);
  const distProblem = preset ? null
    : distCheck.problem === 'format' ? formatMessage(units)
    : distCheck.problem === 'range' || (distCheck.problem === 'incomplete' && (distText === null || distBlurred)) ? rangeMessage(units)
    : null;
  const distanceKm = preset ? preset.km : stored.km;
  const timeS = q.t ? parseDuration(q.t, 'race') : null;
  const paceUnitS = q.p ? parseDuration(q.p, 'pace') : null;
  const solve = (['distance', 'time', 'pace'].includes(q.solve) ? q.solve : 'pace') as Field;

  // The field being solved is derived from the other two.
  let km = distanceKm;
  let seconds = timeS;
  let paceKm = paceUnitS !== null ? perKm(paceUnitS, units) : null;
  if (solve === 'pace' && km && seconds) paceKm = paceFrom(seconds, km);
  if (solve === 'time' && km && paceKm) seconds = paceKm * km;
  if (solve === 'distance' && seconds && paceKm) km = seconds / paceKm;
  // A solved distance obeys the same limits as a typed one.
  const solvedOutOfRange = solve === 'distance' && km !== null && km > 0 && (km < MIN_KM || km > MAX_KM);
  const ready = !solvedOutOfRange && km !== null && seconds !== null && paceKm !== null && km > 0 && seconds > 0 && paceKm > 0;

  const requested = (INTERVALS.some((o) => o.value === q.split) ? q.split : units === 'mi' ? 'mi' : 'km') as SplitInterval;
  const fits = (v: SplitInterval) => !ready || km! / SPLIT_KM[v] <= MAX_ROWS;
  const intervalOptions = INTERVALS.filter((o) => fits(o.value));
  // A distance too long for the chosen interval uses the next longer one that fits (5 km rows always fit up to 1,000 km).
  const interval = fits(requested) ? requested : (intervalOptions.find((o) => SPLIT_KM[o.value] >= SPLIT_KM[requested])?.value ?? '5k');
  const diff = DIFFS.includes(Number(q.diff)) ? Number(q.diff) : 0;
  const rows = useMemo(() => (ready ? splitTable(seconds!, km!, interval, diff) : []), [ready, seconds, km, interval, diff]);
  const isMarathon = km !== null && Math.abs(km - MARATHON_KM) < 1e-6;

  const edit = (field: Field, patch: Partial<typeof q>) => {
    // Editing a field makes the oldest-edited of the other two the one we solve for.
    const keep = solve === field ? (field === 'pace' ? 'time' : 'pace') : solve;
    setTouched(true);
    setQ({ ...patch, solve: keep });
  };
  const pickDistance = (patch: Partial<typeof q>) => { setDistText(null); setDistBlurred(false); edit('distance', patch); };

  // Cross-tool goals are whole minutes: the minute at or below the time shown (whole seconds), as H:MM.
  const shownSeconds = ready ? Math.round(seconds!) : null;
  const goalMinutes = shownSeconds !== null && isMarathon ? Math.floor(shownSeconds / 60) : null;
  const goalHM = goalMinutes !== null ? hm(goalMinutes) : null;
  // The pace band's even-pace band covers 1:30–8:00; its observed mat times and the course chooser cover 2:30–6:30.
  const banded = goalMinutes !== null && goalMinutes >= 90 && goalMinutes <= 480;
  const observed = goalMinutes !== null && goalMinutes >= 150 && goalMinutes <= 390;

  const isExample = queryReady && !touched && !INPUT_KEYS.some((k) => fromUrl.has(k));
  const speedText = ready ? (units === 'mi' ? `${mph(paceKm!).toFixed(1)} mph` : `${kmh(paceKm!).toFixed(1)} km/h`) : '';
  const status = ready
    ? `${preset && solve !== 'distance' ? preset.label : fmtDistance(km!, units)} in ${formatDuration(seconds!, seconds! >= 3600)}: ${formatDuration(perUnit(paceKm!, units))} per ${units === 'mi' ? 'mile' : 'km'}, ${speedText}.`
    : solvedOutOfRange ? solvedMessage(km!, units)
    : distProblem ?? 'Enter two of distance, time and pace to see splits.';
  const settledStatus = useSettled(touched ? status : '', 700);

  return (
    <>
      <p className="sr-only" role="status">{settledStatus}</p>
      <div className="tool-tabs no-print">
        <Choice label="View" value={q.view} onChange={(v) => setQ({ view: v })} options={[{ value: 'calc', label: 'Calculator' }, { value: 'chart', label: 'Pace chart' }]} />
      </div>
      {q.view === 'chart' ? <PaceChart units={units} from={chartFrom} setFrom={setChartFrom} /> : (
        <div className="tool-workspace">
          <form className="tool-inputs" onSubmit={(e) => e.preventDefault()} aria-label="Pace calculator inputs">
            <h2>Any two of three</h2>
            <div className="tool-field">
              <span className="tool-label" id="dist-label">Distance{solve === 'distance' ? ' (solved)' : ''}</span>
              <div className="tool-presets" role="group" aria-labelledby="dist-label">
                {DISTANCES.map((d) => (
                  <button key={d.key} type="button" aria-pressed={q.d === d.key} onClick={() => pickDistance({ d: d.key, km: '' })}>{d.label}</button>
                ))}
                <button type="button" aria-pressed={!preset} onClick={() => pickDistance({ d: 'custom', km: q.km || String(Math.round((km ?? 10) * 1e6) / 1e6) })}>Custom</button>
              </div>
              {!preset ? (
                <>
                  <div className="tool-inline">
                    <input id={distId} aria-label={`Custom distance in ${units}`} inputMode="decimal" autoComplete="off" spellCheck={false} value={shownDistance}
                      aria-invalid={distProblem ? true : undefined} aria-describedby={distProblem ? `${distId}-hint` : undefined}
                      onChange={(e) => {
                        const text = e.target.value;
                        const read = readDistance(text, unitKm(units));
                        setDistText(text);
                        setDistBlurred(false);
                        edit('distance', { d: 'custom', km: read.km === null ? '' : String(read.km) });
                      }}
                      onBlur={() => setDistBlurred(true)} />
                    <span>{units}</span>
                  </div>
                  {distProblem ? <p className="tool-field-hint is-error" id={`${distId}-hint`}>{distProblem}</p> : null}
                </>
              ) : null}
            </div>
            <DurationField label={`Time${solve === 'time' ? ' (solved)' : ''}`} large value={solve === 'time' ? (ready ? seconds : null) : timeS}
              onChange={(s) => edit('time', { t: s === null ? '' : formatDuration(s, true) })} placeholder="3:30:00" />
            <DurationField label={`Pace per ${units === 'mi' ? 'mile' : 'kilometre'}${solve === 'pace' ? ' (solved)' : ''}`} mode="pace" large
              value={solve === 'pace' ? (ready ? perUnit(paceKm!, units) : null) : paceUnitS} onChange={(s) => edit('pace', { p: s === null ? '' : formatDuration(s) })} placeholder={units === 'mi' ? '8:00' : '5:00'} />
            <p className="tool-field-hint">Type in any two boxes; the third updates. The one marked “solved” is calculated.</p>
          </form>

          <div className="tool-results">
            {ready ? (
              <>
                {isExample ? <ExampleNote>These results are for a 3:30:00 marathon. Type your own distance, time or pace; everything updates as you type.</ExampleNote> : null}
                <div className="tool-headline pace-calculator-headline">
                  <span className="evidence-badge evidence-arithmetic">Arithmetic</span>
                  <Stat label="Time" value={formatDuration(seconds!, true)} sub={`for ${fmtDistance(km!, units)}`} />
                  <Stat label={`Pace /${units}`} value={formatDuration(perUnit(paceKm!, units))} sub={`${fmtPace(paceKm!, units === 'mi' ? 'km' : 'mi')}`} />
                  <Stat label="Treadmill speed" value={units === 'mi' ? mph(paceKm!).toFixed(1) : kmh(paceKm!).toFixed(1)} sub={units === 'mi' ? `mph · ${kmh(paceKm!).toFixed(1)} km/h` : `km/h · ${mph(paceKm!).toFixed(1)} mph`} />
                </div>

                <EvidencePanel kind="arithmetic" title="Splits at an even pace" meta="Elapsed time at each split if every step is run at the same pace. Rows marked as timing mats match the 5 km checkpoints official trackers show.">
                  <div className="tool-split-controls no-print">
                    <Choice label="Split every" small value={interval} onChange={(v) => setQ({ split: v })} options={intervalOptions} />
                    <label className="tool-inline">
                      <span>Second half</span>
                      <select value={String(diff)} onChange={(e) => setQ({ diff: e.target.value })} aria-label="Second half faster or slower, in total">
                        {DIFFS.map((v) => <option key={v} value={v}>{v === 0 ? 'even' : `${v < 0 ? 'faster' : 'slower'} by ${Math.abs(v) / 60} min`}</option>)}
                      </select>
                    </label>
                  </div>
                  {intervalOptions.length < INTERVALS.length ? <p className="tool-note no-print">Shorter splits are not offered for {fmtDistance(km!, units)}: they would need more than {MAX_ROWS} rows.</p> : null}
                  <div className="tool-table-wrap">
                    <table className="tool-table">
                      <thead><tr><th scope="col">Split</th><th scope="col">Elapsed</th><th scope="col">Split time</th><th scope="col">Pace</th></tr></thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.km} className={r.finish ? 'is-finish' : r.mat ? 'is-mat' : r.halfway ? 'is-key' : undefined}>
                            <td>{r.finish ? 'Finish' : r.halfway ? `Halfway · ${fmtDistance(r.km, units)}` : r.mat ? `${r.km} km mat · ${fmtDistance(r.km, 'mi')}` : fmtDistance(r.km, units)}</td>
                            <td>{formatDuration(r.elapsed, seconds! >= 3600)}</td>
                            <td>{formatDuration(r.split)}</td>
                            <td>{fmtPace(r.split / (r.km - (rows[rows.indexOf(r) - 1]?.km ?? 0)), units)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <caption>Arithmetic only. {diff ? `The first half runs at ${formatDuration((seconds! - diff) / 2)} and the second at ${formatDuration((seconds! + diff) / 2)}, each even within its half. ` : ''}Halfway and mile rows are calculated, not recorded splits.</caption>
                    </table>
                  </div>
                </EvidencePanel>

                <EvidencePanel kind="arithmetic" title="The same pace at other distances" meta="Pace × distance. This is not a predicted race time: marathons in particular rarely hold a shorter race’s pace.">
                  <div className="tool-table-wrap">
                    <table className="tool-table">
                      <thead><tr><th scope="col">Distance</th><th scope="col">At {fmtPace(paceKm!, units)}</th></tr></thead>
                      <tbody>{DISTANCES.map((d) => <tr key={d.key}><td>{d.label}</td><td>{formatDuration(paceKm! * d.km, true)}</td></tr>)}</tbody>
                    </table>
                  </div>
                  <p className="tool-note">For a realistic marathon estimate from a shorter race, use the <Link href="/tools/predictor">finish-time predictor</Link>.</p>
                </EvidencePanel>

                <EvidencePanel kind="arithmetic" title="What your watch will say" meta="Certified courses are measured on the shortest possible line. Most watches read a little long, so the pace they show is a little quicker than your course pace.">
                  <div className="tool-table-wrap">
                    <table className="tool-table wrap-first pace-calculator-watch">
                      <thead><tr><th scope="col">If your watch reads</th><th scope="col">It shows an average of</th></tr></thead>
                      <tbody>
                        {[0, 0.005, 0.01, 0.015, 0.02].map((o) => (
                          <tr key={o} className={o === 0 ? 'is-key' : undefined}>
                            <td>{fmtDistance(km! * (1 + o), units)}{o ? ` (+${(o * 100).toFixed(1)}%)` : ' (exact)'}</td>
                            <td>{fmtPace(seconds! / (km! * (1 + o)), units)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <caption>Scenarios, not a typical overrun: how far long a watch reads depends on tangents, buildings and tunnels.</caption>
                    </table>
                  </div>
                </EvidencePanel>

                {goalHM ? (
                  <div className="tool-callout no-print">
                    <strong>Racing a marathon in {formatDuration(shownSeconds!, true)}?</strong>{' '}
                    {observed ? <>The <Link href={`/tools/pace-band?goal=${goalHM}`}>pace band</Link> for {goalHM}{shownSeconds! % 60 ? ', the whole minute at or below your time,' : ''} shows what finishes that hit {goalHM} actually ran at each 5 km mat, and the <Link href={`/tools/course-chooser?goal=${goalHM}`}>course chooser</Link> compares courses at that pace.</>
                      : banded ? <>The <Link href={`/tools/pace-band?goal=${goalHM}`}>pace band</Link> gives the even-pace band for {goalHM}. Its observed mat times and the <Link href="/tools/course-chooser">course chooser</Link> cover goals from 2:30 to 6:30 only.</>
                      : <>The <Link href="/tools/pace-band">pace band</Link> covers goals from 1:30 to 8:00, and the <Link href="/tools/course-chooser">course chooser</Link> goals from 2:30 to 6:30.</>}
                    {' '}Look up the standards for your age group in the <Link href="/tools/qualifying">qualifying checker</Link>.
                  </div>
                ) : null}
                <ShareBar />
              </>
            ) : <p className="tool-empty">{solvedOutOfRange ? solvedMessage(km!, units) : 'Enter two of distance, time and pace to see splits.'}</p>}
          </div>
        </div>
      )}
    </>
  );
}

function PaceChart({ units, from, setFrom }: { units: UnitSystem; from: number; setFrom: (v: number) => void }) {
  const step = 5;
  const to = from + (units === 'mi' ? 600 : 360);
  const rows = paceChart(from, to, step, units);
  return (
    <section className="tool-panel panel-arithmetic pace-chart" aria-labelledby="pace-chart-title">
      <header className="tool-panel-head">
        <span className="evidence-badge evidence-arithmetic">Arithmetic</span>
        <h2 className="tool-panel-title" id="pace-chart-title">Pace chart: {formatDuration(from)} to {formatDuration(to)} per {units === 'mi' ? 'mile' : 'kilometre'}</h2>
        <p className="tool-panel-meta">Finish times at an even pace, every {step} seconds per {units}. Print it, or move the range.</p>
      </header>
      <div className="tool-share no-print">
        <button type="button" className="button-secondary" onClick={() => setFrom(Math.max(units === 'mi' ? 240 : 150, from - (units === 'mi' ? 300 : 180)))}>Faster paces</button>
        <button type="button" className="button-secondary" onClick={() => setFrom(Math.min(units === 'mi' ? 1200 : 750, from + (units === 'mi' ? 300 : 180)))}>Slower paces</button>
        <button type="button" className="button-secondary" onClick={() => window.print()}>Print chart</button>
      </div>
      <div className="tool-table-wrap">
        <table className="tool-table pace-chart-table">
          <thead><tr><th scope="col">Pace /{units}</th><th scope="col">/{units === 'mi' ? 'km' : 'mi'}</th>{DISTANCES.map((d) => <th key={d.key} scope="col">{d.label}</th>)}</tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.perUnit} className={r.perUnit % 60 === 0 ? 'is-key' : undefined}>
                <td>{formatDuration(r.perUnit)}</td>
                <td>{formatDuration(units === 'mi' ? r.perKm : r.perKm * KM_PER_MILE)}</td>
                {DISTANCES.map((d) => <td key={d.key}>{formatDuration(r.times[d.key], r.times[d.key] >= 3600)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
