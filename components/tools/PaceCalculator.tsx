'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { UnitLink as Link, useUnits } from '@/components/UnitsProvider';
import { Choice, DurationField, ShareBar } from '@/components/tools/ui';
import Values from '@/components/ui/Values';
import { MarathonHandoffs } from '@/components/tools/Handoffs';
import { useQueryState } from '@/components/tools/useQueryState';
import { DISTANCES, MARATHON_KM, SPLIT_KM, kmh, mph, paceChart, paceFrom, perKm, perUnit, splitTable, unitKm, type SplitInterval } from '@/lib/tools/pace';
import { formatDuration, parseDuration } from '@/lib/tools/time';
import { KM_PER_MILE, type UnitSystem } from '@/lib/units';

type Field = 'distance' | 'time' | 'pace';

const fmtDistance = (km: number, units: UnitSystem) => {
  const v = units === 'mi' ? km / KM_PER_MILE : km;
  // One decimal, as distances read everywhere on the site; two below one unit, so 400 m rows stay distinct (0.25 mi).
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: v < 1 ? 2 : 1 }).format(v)} ${units}`;
};
const fmtPace = (secondsPerKm: number, units: UnitSystem) => `${formatDuration(perUnit(secondsPerKm, units))}/${units}`;
const INTERVALS: { value: SplitInterval; label: string }[] = [
  { value: '400m', label: '400 m' }, { value: 'quarter', label: '¼ mi' }, { value: 'km', label: 'Every km' }, { value: 'mi', label: 'Every mile' }, { value: '5k', label: '5K mats' },
];
/** The splits offered as buttons; 400 m and ¼ mi rows stay readable from a link that asks for them. */
const SHOWN_INTERVALS: SplitInterval[] = ['5k', 'mi', 'km'];
const DIFFS = [-300, -180, -120, -60, 0, 60, 120, 180, 300];
const DEFAULTS = { view: 'calc', d: 'marathon', km: '', t: '4:00:00', p: '', solve: 'pace', split: '', diff: '0' };
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

  // Timing-mat splits by default, the checkpoints race trackers show.
  const requested = (INTERVALS.some((o) => o.value === q.split) ? q.split : '5k') as SplitInterval;
  const fits = (v: SplitInterval) => !ready || km! / SPLIT_KM[v] <= MAX_ROWS;
  const intervalOptions = INTERVALS.filter((o) => fits(o.value));
  const shownIntervals = intervalOptions.filter((o) => SHOWN_INTERVALS.includes(o.value) || o.value === q.split).sort((a, b) => SPLIT_KM[b.value] - SPLIT_KM[a.value]);
  // A distance too long for the chosen interval uses the next longer one that fits (5 km rows always fit up to 1,000 km).
  const interval = fits(requested) ? requested : (intervalOptions.find((o) => SPLIT_KM[o.value] >= SPLIT_KM[requested])?.value ?? '5k');
  const diff = DIFFS.includes(Number(q.diff)) ? Number(q.diff) : 0;
  const rows = useMemo(() => (ready ? splitTable(seconds!, km!, interval, diff) : []), [ready, seconds, km, interval, diff]);
  const others = DISTANCES.filter((d) => Math.abs(d.km - (km ?? 0)) > 0.01 && !rows.some((r) => Math.abs(r.km - d.km) < 0.01));
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
      <div className="tool-tabs no-print" data-tool-controls>
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
              onChange={(s) => edit('time', { t: s === null ? '' : formatDuration(s, true) })} placeholder="4:00:00" />
            <DurationField label={`Pace per ${units === 'mi' ? 'mile' : 'kilometre'}${solve === 'pace' ? ' (solved)' : ''}`} mode="pace" large
              value={solve === 'pace' ? (ready ? perUnit(paceKm!, units) : null) : paceUnitS} onChange={(s) => edit('pace', { p: s === null ? '' : formatDuration(s) })} placeholder={units === 'mi' ? '8:00' : '5:00'} />
            <p className="tool-field-hint">Type in any two boxes; the third updates. The one marked “solved” is calculated.</p>
          </form>

          <div className="tool-results">
            {ready ? (
              <>
                <section className="tool-reading night pace-calculator-headline" aria-labelledby="pace-calculator-title">
                  <div className="tool-reading-head">
                    <p className="tool-reading-kicker">{isExample ? 'Example · ' : ''}{solve === 'distance' ? `${formatDuration(seconds!, true)} at ${fmtPace(paceKm!, units)}` : `${preset ? preset.label : fmtDistance(km!, units)}${solve === 'pace' ? ` in ${formatDuration(seconds!, true)}` : ` at ${fmtPace(paceKm!, units)}`}`}</p>
                    <h2 className="tool-reading-figure" id="pace-calculator-title">
                      {solve === 'pace' ? <>{formatDuration(perUnit(paceKm!, units))}<small>per {units === 'mi' ? 'mile' : 'kilometre'}</small></>
                        : solve === 'time' ? <>{formatDuration(seconds!, true)}<small>for {fmtDistance(km!, units)}</small></>
                          : <>{fmtDistance(km!, units)}<small>in {formatDuration(seconds!, true)}</small></>}
                    </h2>
                  </div>
                  <dl className="tool-cells">
                    {solve === 'pace'
                      ? <div><dt>Per {units === 'mi' ? 'km' : 'mile'}</dt><dd>{fmtPace(paceKm!, units === 'mi' ? 'km' : 'mi')}</dd></div>
                      : <div><dt>Pace</dt><dd>{fmtPace(paceKm!, units)}<small>{fmtPace(paceKm!, units === 'mi' ? 'km' : 'mi')}</small></dd></div>}
                    <div><dt>Treadmill speed</dt><dd>{speedText}<small>{units === 'mi' ? `${kmh(paceKm!).toFixed(1)} km/h` : `${mph(paceKm!).toFixed(1)} mph`}</small></dd></div>
                  </dl>
                </section>
                {goalMinutes !== null ? <MarathonHandoffs label="With this marathon time" seconds={shownSeconds!} /> : null}

                <section className="tool-panel pace-calculator-splits" aria-labelledby="pace-calculator-splits-title">
                  <header className="tool-panel-head">
                    <h2 className="tool-panel-title" id="pace-calculator-splits-title">{diff ? `Splits, second half ${diff < 0 ? 'faster' : 'slower'} by ${Math.abs(diff) / 60} min` : 'Splits at an even pace'}</h2>
                  </header>
                  {/* One control on the beat: the split length. A faster or slower second half folds away below the splits. */}
                  <div className="pace-calculator-controls no-print">
                    <Choice label="Split every" small value={interval} onChange={(v) => setQ({ split: v })} options={shownIntervals} />
                  </div>
                  {intervalOptions.length < INTERVALS.length ? <p className="tool-note no-print">Shorter splits are not offered for {fmtDistance(km!, units)}: they would need more than {MAX_ROWS} rows.</p> : null}
                  <ol className="tool-laps pace-calculator-laps" aria-label={`Elapsed time at each split${diff ? '' : ' at an even pace'}`}>
                    {rows.map((r, i) => {
                      // A cell's second line only says what differs from the split before it: a shorter last split (to
                      // halfway or the finish) or a changed pace. At an even pace most cells have none.
                      const len = r.km - (rows[i - 1]?.km ?? 0), lap = rows[0] ? rows[0].km : len;
                      const split = Math.abs(len - lap) > 1e-6 ? formatDuration(r.split) : null;
                      const pace = Math.abs(r.split / len - paceKm!) > 0.5 / (units === 'mi' ? KM_PER_MILE : 1) ? fmtPace(r.split / len, units) : null;
                      return (
                        <li key={r.km} className={r.finish ? 'is-finish' : undefined}>
                          <span>{r.finish ? 'Finish' : r.halfway ? 'Halfway' : r.mat ? `${r.km}K` : fmtDistance(r.km, units)}{r.mat && units === 'mi' ? <small>{(r.km / KM_PER_MILE).toFixed(1)} mi</small> : null}</span>
                          <b>{formatDuration(r.elapsed, r.elapsed >= 3599.5)}</b>
                          {split || pace ? <small className="pace-calculator-split">{[split, pace].filter(Boolean).join(' · ')}</small> : null}
                        </li>
                      );
                    })}
                  </ol>
                  <details className="tool-more pace-calculator-more no-print" open={diff !== 0 || undefined}>
                    <summary>A faster or slower second half</summary>
                    <div className="tool-more-body">
                      <label className="pace-calculator-diff">
                        <span>Second half</span>
                        <select value={String(diff)} onChange={(e) => setQ({ diff: e.target.value })} aria-label="Second half faster or slower, in total">
                          {DIFFS.map((v) => <option key={v} value={v}>{v === 0 ? 'Even' : `${v < 0 ? 'Faster' : 'Slower'} by ${Math.abs(v) / 60} min`}</option>)}
                        </select>
                      </label>
                    </div>
                  </details>
                  <Values id="pace-calculator-watch" caption={`If your watch reads the course long, the average pace it shows for ${formatDuration(seconds!, true)}`} count={5}>
                    <table className="table">
                      <thead><tr><th scope="col">Watch reads</th><th scope="col">Average it shows</th></tr></thead>
                      <tbody>
                        {[0, 0.005, 0.01, 0.015, 0.02].map((o) => (
                          <tr key={o} className={o === 0 ? 'is-reading' : undefined}>
                            <th scope="row">{fmtDistance(km! * (1 + o), units)}{o ? ` (+${(o * 100).toFixed(1)}%)` : ' (exact)'}</th>
                            <td>{fmtPace(seconds! / (km! * (1 + o)), units)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Values>
                </section>

                {/* Only the distances the splits above do not already give, and never the distance typed: a block for
                    two or more, else just the pointer to the predictor. */}
                {others.length >= 2 ? (
                  <section className="tool-panel pace-calculator-others" aria-labelledby="pace-calculator-others-title">
                    <header className="tool-panel-head">
                      <h2 className="tool-panel-title" id="pace-calculator-others-title">{fmtPace(paceKm!, units)} at other distances</h2>
                    </header>
                    <dl className="tool-cells pace-calculator-distances">
                      {others.map((d) => <div key={d.key}><dt>{d.label}</dt><dd>{formatDuration(paceKm! * d.km, paceKm! * d.km >= 3599.5)}</dd></div>)}
                    </dl>
                    <p className="tool-note">Not a predicted race time: for a marathon estimate from a shorter race, use the <Link href="/tools/predictor">finish-time predictor</Link>.</p>
                  </section>
                ) : <p className="tool-note pace-calculator-predictor">For a marathon estimate from a shorter race, use the <Link href="/tools/predictor">finish-time predictor</Link>.</p>}
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
    <section className="tool-panel panel-plain pace-chart" data-tool-controls aria-labelledby="pace-chart-title">
      <header className="tool-panel-head">
        <h2 className="tool-panel-title" id="pace-chart-title">Finish times from {formatDuration(from)} to {formatDuration(to)} per {units === 'mi' ? 'mile' : 'kilometre'}</h2>
        <p className="tool-panel-meta no-print">Know your goal instead? The <Link href="/tools/marathon-pace-chart">marathon</Link> and <Link href="/tools/half-marathon-pace-chart">half marathon</Link> pace charts list every goal.</p>
      </header>
      <div className="tool-share no-print">
        <button type="button" className="btn btn-secondary is-compact" onClick={() => setFrom(Math.max(units === 'mi' ? 240 : 150, from - (units === 'mi' ? 300 : 180)))}>Faster paces</button>
        <button type="button" className="btn btn-secondary is-compact" onClick={() => setFrom(Math.min(units === 'mi' ? 1200 : 750, from + (units === 'mi' ? 300 : 180)))}>Slower paces</button>
        <button type="button" className="btn btn-secondary is-compact" data-not-edit onClick={() => window.print()}>Print chart</button>
      </div>
      <div className="tool-table-wrap pace-chart-wrap" role="region" aria-label="Pace chart" tabIndex={0}>
        <table className="tool-table pace-chart-table">
          <thead><tr><th scope="col">Pace /{units}</th><th scope="col">/{units === 'mi' ? 'km' : 'mi'}</th>{DISTANCES.map((d) => <th key={d.key} scope="col">{d.label}</th>)}</tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.perUnit} className={r.perUnit % 60 === 0 ? 'is-key' : undefined}>
                <th scope="row">{formatDuration(r.perUnit)}</th>
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
