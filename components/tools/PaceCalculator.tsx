'use client';

import { useMemo, useState } from 'react';
import { UnitLink as Link, useUnits } from '@/components/UnitsProvider';
import { Choice, DurationField, EvidencePanel, ShareBar, Stat } from '@/components/tools/ui';
import { useQueryState } from '@/components/tools/useQueryState';
import { DISTANCES, MARATHON_KM, kmh, mph, paceChart, paceFrom, perKm, perUnit, splitTable, unitKm, type SplitInterval } from '@/lib/tools/pace';
import { formatDuration, formatHM, parseDuration } from '@/lib/tools/time';
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

export default function PaceCalculator() {
  const { units } = useUnits();
  const [q, setQ] = useQueryState({ view: 'calc', d: 'marathon', km: '', t: '3:30:00', p: '', solve: 'pace', split: '', diff: '0' });
  const [chartFrom, setChartFrom] = useState(units === 'mi' ? 300 : 180);

  const preset = DISTANCES.find((d) => d.key === q.d);
  const customKm = Number(q.km);
  const distanceKm = preset ? preset.km : Number.isFinite(customKm) && customKm > 0 ? customKm : null;
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
  const ready = km !== null && seconds !== null && paceKm !== null && km > 0 && seconds > 0 && paceKm > 0;

  const interval = (q.split || (units === 'mi' ? 'mi' : 'km')) as SplitInterval;
  const diff = Number(q.diff) || 0;
  const rows = useMemo(() => (ready ? splitTable(seconds!, km!, interval, diff) : []), [ready, seconds, km, interval, diff]);
  const isMarathon = km !== null && Math.abs(km - MARATHON_KM) < 1e-6;

  const edit = (field: Field, patch: Partial<typeof q>) => {
    // Editing a field makes the oldest-edited of the other two the one we solve for.
    const keep = solve === field ? (field === 'pace' ? 'time' : 'pace') : solve;
    setQ({ ...patch, solve: keep });
  };
  const goalHM = ready && isMarathon ? formatHM(seconds!) : null;

  return (
    <>
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
                  <button key={d.key} type="button" aria-pressed={q.d === d.key} onClick={() => edit('distance', { d: d.key, km: '' })}>{d.label}</button>
                ))}
                <button type="button" aria-pressed={!preset} onClick={() => edit('distance', { d: 'custom', km: q.km || String(km ?? 10) })}>Custom</button>
              </div>
              {!preset ? (
                <div className="tool-inline">
                  <input aria-label={`Custom distance in ${units}`} inputMode="decimal" value={q.km ? String(Math.round((Number(q.km) / unitKm(units)) * 1000) / 1000) : ''}
                    onChange={(e) => { const v = Number(e.target.value); edit('distance', { d: 'custom', km: Number.isFinite(v) && v > 0 ? String(v * unitKm(units)) : '' }); }} />
                  <span>{units}</span>
                </div>
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
                <div className="tool-headline" aria-live="polite">
                  <Stat label="Time" value={formatDuration(seconds!, true)} sub={`for ${fmtDistance(km!, units)}`} />
                  <Stat label={`Pace /${units}`} value={formatDuration(perUnit(paceKm!, units))} sub={`${fmtPace(paceKm!, units === 'mi' ? 'km' : 'mi')}`} />
                  <Stat label="Treadmill speed" value={units === 'mi' ? mph(paceKm!).toFixed(1) : kmh(paceKm!).toFixed(1)} sub={units === 'mi' ? `mph · ${kmh(paceKm!).toFixed(1)} km/h` : `km/h · ${mph(paceKm!).toFixed(1)} mph`} />
                </div>

                <EvidencePanel kind="arithmetic" title="Splits at an even pace" meta="Elapsed time at each split if every step is run at the same pace. Rows marked as timing mats match the 5 km checkpoints official trackers show.">
                  <div className="tool-split-controls no-print">
                    <Choice label="Split every" small value={interval} onChange={(v) => setQ({ split: v })} options={INTERVALS} />
                    <label className="tool-inline">
                      <span>Second half</span>
                      <select value={String(diff)} onChange={(e) => setQ({ diff: e.target.value })} aria-label="Second half faster or slower, in total">
                        {[-300, -180, -120, -60, 0, 60, 120, 180, 300].map((v) => <option key={v} value={v}>{v === 0 ? 'even' : `${v < 0 ? 'faster' : 'slower'} by ${Math.abs(v) / 60} min`}</option>)}
                      </select>
                    </label>
                  </div>
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
                    <table className="tool-table">
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
                    <strong>Racing a marathon at {goalHM}?</strong> The <Link href={`/tools/pace-band?goal=${goalHM}`}>pace band</Link> shows what finishes that hit {goalHM} actually ran at each 5 km mat, the <Link href={`/tools/course-chooser?goal=${goalHM}`}>course chooser</Link> compares courses at this pace, and the <Link href={`/tools/qualifying?t=${formatDuration(seconds!, true)}`}>qualifying checker</Link> shows which standards {formatDuration(seconds!, true)} would meet.
                  </div>
                ) : null}
                <ShareBar />
              </>
            ) : <p className="tool-empty">Enter two of distance, time and pace to see splits.</p>}
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
