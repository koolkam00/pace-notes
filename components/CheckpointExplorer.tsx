'use client';
import { useEffect, useState } from 'react';
import type { Profile } from '@/lib/personalized-catalog';
import type { CheckpointData, PersonalSummary } from '@/lib/personalized-types';
import { checkpointResult, clock, count, fmt, parseElapsed, parseSection, percentUnder } from '@/lib/personalized';
import { loadAnalysisAggregate } from '@/lib/analysis-aggregates';
import { keypadInput } from '@/lib/keypad';
import AnalysisChart from './AnalysisChart';
import { distanceLabel, paceLabel, unitText } from '@/lib/units';
import { useUnits } from './UnitsProvider';

export default function CheckpointExplorer({ summary, profile }: { summary: PersonalSummary; profile: Profile }) {
  const { units } = useUnits();
  const text = (value: string) => unitText(value, units);
  const [checkpoint, setCheckpoint] = useState(30);
  const [elapsedText, setElapsedText] = useState(clock(profile.goal * 60 * 30 / 42.195, true));
  const [sectionText, setSectionText] = useState('');
  const [edited, setEdited] = useState(false);
  const [request, setRequest] = useState<{ checkpoint: number; elapsed: number; section: number | null; sequence: number } | null>(null);
  const [data, setData] = useState<CheckpointData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const clearComparison = () => { setRequest(null); setData(null); setLoading(false); setError(''); };
  const city = summary.cities.find(row => row.city === profile.city)!;
  useEffect(() => { if (!edited) setElapsedText(clock(profile.goal * 60 * checkpoint / 42.195, true)); }, [profile.goal, checkpoint, edited]);
  useEffect(() => {
    setRequest(null); setData(null); setLoading(false); setError('');
  }, [profile.city, profile.age, profile.gender, profile.goal]);
  useEffect(() => {
    if (!request) return;
    const controller = new AbortController();
    setLoading(true); setError('');
    loadAnalysisAggregate<CheckpointData>(city.checkpoint_file, city.city, summary.as_of, controller.signal)
      .then(value => { if (!controller.signal.aborted) { setData(value); setLoading(false); } })
      .catch(reason => { if (!controller.signal.aborted) { setError(reason.message); setLoading(false); } });
    return () => controller.abort();
  }, [request, city.city, city.checkpoint_file, summary.as_of]);
  const result = request && data?.city === profile.city ? checkpointResult(data, profile, request.checkpoint, request.elapsed, request.section) : null;
  const probability = result ? percentUnder(result.row, profile.goal) : null;
  const remaining = request ? (profile.goal * 60 - request.elapsed) / (42.195 - request.checkpoint) : null;
  return <section className="checkpoint-explorer">
    <form onSubmit={event => {
      event.preventDefault();
      const elapsed = parseElapsed(elapsedText), section = sectionText.trim() ? parseSection(sectionText) : null;
      if (elapsed === null || elapsed <= 0 || elapsed >= 12 * 3600) { setError('Enter your elapsed time as hours:minutes:seconds, for example 2:50:00.'); return; }
      if (sectionText.trim() && (section === null || section < 600 || section > 6000 || section > elapsed)) { setError('Enter a 5 km time between 10:00 and 100:00, shorter than the total elapsed time.'); return; }
      setData(null); setError(''); setRequest(current => ({ checkpoint, elapsed, section, sequence: (current?.sequence || 0) + 1 }));
    }}>
      <h2>Where are you in the race?</h2>
      <p className="control-help">An even-pace example is filled in. Replace it with a time from your race.</p>
      <div className="profile-fields checkpoint-fields"><label>Distance reached<select value={checkpoint} onChange={event => { clearComparison(); setCheckpoint(Number(event.target.value)); setEdited(false); }}>{[20, 30, 35].map(km => <option key={km} value={km}>{distanceLabel(km, units)}</option>)}</select></label><label>Elapsed time<input value={elapsedText} onChange={event => { clearComparison(); setElapsedText(keypadInput(event.target, event.nativeEvent)); setEdited(true); }} placeholder="2:50:00" spellCheck={false} inputMode="text" aria-describedby="elapsed-help" /></label><label>Last {distanceLabel(5, units)} · optional<input value={sectionText} onChange={event => { clearComparison(); setSectionText(keypadInput(event.target, event.nativeEvent)); }} placeholder="e.g. 28:00" spellCheck={false} aria-describedby="elapsed-help" /></label></div>
      {units === 'mi' && <p className="control-help">Distances follow the recorded timing points, rounded to two decimals. Last 3.11 mi is the original 5 km section.</p>}
      <p className="control-help" id="elapsed-help">{text('Elapsed time: hours:minutes:seconds. Last 5 km: minutes:seconds.')}</p>
      <button className="button-primary" type="submit" disabled={loading}>{loading ? 'Finding comparable finishes…' : 'Compare this checkpoint'} <span aria-hidden="true">↗</span></button>
    </form>
    {error && <div className="feedback-error" role="alert"><p>{text(error)}</p>{request && <button type="button" onClick={() => setRequest(current => current ? { ...current, sequence: current.sequence + 1 } : current)}>Try again</button>}</div>}
    {loading && <p role="status" className="loading-message">Loading the checkpoint comparison…</p>}
    {request && !loading && !error && !result && <div className="empty-comparison"><h3>Too few comparable finishes.</h3><p>Fewer than 100 complete finishes match this checkpoint, even after broadening the available age and gender groups. Try another elapsed time or choose All courses above.</p></div>}
    {result && request && !loading && !error && <div className="checkpoint-result" aria-live="polite"><p className="eyebrow">At {distanceLabel(request.checkpoint, units)} in {clock(request.elapsed, true)}</p><div className="checkpoint-numbers"><div><strong>{probability === null ? 'Unavailable' : fmt(probability) + '%'}</strong><span>finished below {clock(profile.goal * 60)}</span></div><div><strong>{clock(result.row.finish[1], true)}</strong><span>median recorded finish</span></div><div><strong>{remaining !== null && remaining > 0 ? paceLabel(remaining, units, false) : '—'}</strong><span>{remaining !== null && remaining > 0 ? `per ${units === 'mi' ? 'mile' : 'km'} needed for your target` : 'your target time has elapsed'}</span></div></div><p className="comparison-context">{count(result.row.n)} complete finishes · {result.row.editions} race editions. {text(result.comparison)}.</p>{(result.widened || result.trendWidened) && <p className="coverage-notice">{result.widened ? text(result.widened) : null} {result.trendWidened ? 'Recent pace trend was broadened to all trends.' : ''}</p>}<AnalysisChart analysisId="checkpoint-result" charts={[{ title: 'The range of recorded finish times', unit: 'finish', xLabel: 'Finish', kind: 'bars', rows: [{ label: 'Comparable finishes', low: result.row.finish[0] / 60, value: result.row.finish[1] / 60, high: result.row.finish[2] / 60, n_low: result.row.n, n_value: result.row.n, n_high: result.row.n }], series: [{ key: 'low', label: '10th percentile' }, { key: 'value', label: 'Median' }, { key: 'high', label: '90th percentile' }], note: 'This range contains the middle 80% of complete finishes. It is not a prediction interval for you; non-finishers are absent.' }]} /></div>}
  </section>;
}
