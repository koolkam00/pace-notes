'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { UnitLink as Link, useUnits } from './UnitsProvider';
import { type UnitSystem } from '@/lib/units';
import { AGE_OPTIONS } from '@/lib/personalized-catalog';
import { clock } from '@/lib/personalized';
import { MARATHON_SECTION_ENDS, sectionLabel } from '@/lib/section-labels';
import { FAST_START_DEFAULT, PRIOR_OPTIONS, fastStartRow, fastStartSearch, loadFastStartEvidence, readFastStartSelection, referenceTimeDifference, timeChange,
  type FastStartEvidence, type FastStartGroup, type FastStartRow, type FastStartSelection, type FastStartStart, type FastStartStarts, type FastStartMode } from '@/lib/fast-start';
import MakeItYours from './ui/MakeItYours.client';
import Segmented from './ui/Segmented.client';
import Values from './ui/Values';
import LineProfile from './viz/LineProfile';
import { trackAnalytics } from '@/lib/analytics';
import { unitHref } from '@/lib/unit-preference';

const percent = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 1 }) + '%';
const cityName = (city: string) => city === 'New York' ? 'New York City' : city;
const SECTION_MIDS = MARATHON_SECTION_ENDS.map((end, i) => ((i ? MARATHON_SECTION_ENDS[i - 1] : 0) + end) / 2);
const signedPct = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;

/**
 * The starting-pace explorer's results for one selection (the redesign spec, section 7.4): how often a sustained slowdown
 * followed this opening, what happened after 20K, where pace was slowest and where the slowdowns began, then one chart
 * (pace through the race against the steady opening) and every opening's values. Pinned copy (verify-fast-start-client):
 * "developed a sustained slowdown", "Pace was slowest in the", "most often began in the", the term link.
 */
export function FastStartResults({ row, focus, start, units: _units }: { row: FastStartRow; focus: FastStartGroup; start: FastStartStart; units: UnitSystem }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const name = (band: string) => start.bands.find(b => b.id === band)?.label ?? band;
  const all = start.mode === 'all';
  const rate = 100 * focus.slowdown_n / focus.n;
  const steady = focus.band === 'steady' ? undefined : row.groups.find(group => group.band === 'steady');
  const reference = all ? 'early-race pace' : 'the earlier best’s pace';
  const section = (index: number) => sectionLabel(MARATHON_SECTION_ENDS[index]);
  const slowest = focus.pace_pct.reduce((best, value, i) => value > focus.pace_pct[best] ? i : best, 0);
  const peak = focus.pace_pct[slowest];
  const onsetAt = focus.onset ? focus.onset.reduce((best, n, i) => n > focus.onset![best] ? i : best, 0) : -1;
  const differs = (seconds: number) => referenceTimeDifference(seconds).toLowerCase();
  const values = [...focus.pace_pct, ...(steady ? steady.pace_pct : []), 0];
  const lo = Math.floor(Math.min(...values) / 5) * 5, hi = Math.ceil(Math.max(...values) / 5) * 5;
  const step = hi - lo > 30 ? 10 : 5;
  return (
    <div className="explore-results">
      <h2 className="explore-title">{percent(rate)} developed a sustained slowdown.</h2>
      <p className="explore-sentence">
        {all
          ? <>After 20K, the median finish took <strong>{differs(focus.after20_delta_median_s!)}</strong> than the same distance at its early-race pace. </>
          : <>The median finish was <strong>{Math.abs(focus.finish_delta_median_s) < 3 ? 'about the same as' : timeChange(focus.finish_delta_median_s).toLowerCase() + ' than'}</strong> the runner’s earlier recorded best. </>}
        {peak > 0.05 ? `Pace was slowest in the ${section(slowest)} section, ${percent(peak)} slower than ${reference}.` : `Pace stayed ahead of ${reference} in every section; it came closest in the ${section(slowest)} section.`}
      </p>
      <LineProfile x={SECTION_MIDS} xDomain={[0, 42.195]} yDomain={[Math.min(lo, -step / 2), hi]}
        layers={[{
          id: 'pace', label: name(focus.band),
          series: [...(steady ? [{ id: 'steady', values: steady.pace_pct, tone: 'quiet' as const }] : []), { id: 'focus', values: focus.pace_pct }],
          labels: [{ x: SECTION_MIDS[slowest], y: peak, text: `${section(slowest)} ${signedPct(peak)}`, priority: 3 }],
        }]}
        refs={[{ value: 0, label: reference }]}
        xTicks={[{ value: 0, label: 'Start' }, { value: 10, label: '10K' }, { value: 20, label: '20K' }, { value: 30, label: '30K' }, { value: 42.195, label: 'Finish' }]}
        keys={[{ label: name(focus.band), mark: 'line' }, ...(steady ? [{ label: name('steady'), mark: 'line' as const, tone: 'quiet' as const }] : [])]}
        label={`Section pace against ${reference}, ${name(focus.band).toLowerCase()} openings${steady ? ' against steady ones' : ''}: slowest in the ${section(slowest)} section, ${percent(peak)} slower`}
        height={200} heightMd={240} />
      {focus.onset ? <p className="explore-note">In this group, <Link href="/methodology#sustained-slowdown">sustained slowdowns</Link> most often began in the {sectionLabel(25 + onsetAt * 5)} section ({percent(100 * focus.onset[onsetAt] / focus.slowdown_n)} of them).</p>
        : <p className="explore-note">Too few detected slowdowns to show where they began.</p>}
      <Values id={`${id}-values`} caption={`Every opening: ${cityName(row.city)} · ${row.age === 'all' ? 'All ages' : `Age ${row.age}`} · ${row.gender === 'all' ? 'All recorded genders' : row.gender}${all ? '' : ` · ${PRIOR_OPTIONS.find(p => p.id === row.prior)!.label}`}`}
        columns={[{ key: 'b', label: 'Opening', text: true }, { key: 's', label: 'Sustained slowdown' }, { key: all ? 'f' : 'c', label: all ? 'Median recorded finish' : 'Finish against the earlier best' }, { key: 'n', label: 'Finishes' }, { key: 'd', label: 'Sustained slowdowns' }]}
        rows={row.groups.map(g => [name(g.band), percent(100 * g.slowdown_n / g.n), all ? clock(g.actual_finish_median_s!, true) : timeChange(g.finish_delta_median_s), g.n.toLocaleString('en-US'), g.slowdown_n.toLocaleString('en-US')])}
        reading={row.groups.indexOf(focus)} />
    </div>
  );
}

/**
 * The starting-pace explorer (Make it yours): the comparison (all eligible finishes, or those with an earlier result),
 * course, opening, age group and recorded gender in one form, in a sheet under 900 px and inline from 900 px. The
 * all-course example is in the page; anything else loads the published evidence, checked against its hash.
 * `archive` (the research-archive pages) puts the page's own title and description above it.
 */
export default function FastStartAnalysis({ starts, defaultOpening = 'fast10', title = 'What happens after a very fast start?', description, archive = false }: { starts: FastStartStarts; defaultOpening?: string; title?: string; description?: string; archive?: boolean }) {
  const { units } = useUnits();
  const formId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const [selection, setSelection] = useState<FastStartSelection>({ ...FAST_START_DEFAULT, band: defaultOpening });
  const [draft, setDraft] = useState<FastStartSelection>({ ...FAST_START_DEFAULT, band: defaultOpening });
  const [datasets, setDatasets] = useState<Partial<Record<FastStartMode, FastStartEvidence>>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const start = starts[selection.mode];
  const all = selection.mode === 'all';
  const data = datasets[selection.mode];
  const initialRow = fastStartRow([start.initial], selection);
  useEffect(() => {
    const restore = () => { const params = new URLSearchParams(window.location.search); if (!params.has('opening')) params.set('opening', defaultOpening); const next = readFastStartSelection(params.toString(), starts.all); setSelection(next); setDraft(next); };
    restore(); window.addEventListener('popstate', restore); return () => window.removeEventListener('popstate', restore);
  }, [starts, defaultOpening]);
  useEffect(() => {
    if (initialRow || data) { setLoading(false); setError(''); return; }
    const controller = new AbortController(); setLoading(true); setError('');
    loadFastStartEvidence(start, controller.signal).then(value => { if (!controller.signal.aborted) { setDatasets(previous => ({ ...previous, [start.mode]: value })); setLoading(false); } })
      .catch(reason => { if (!controller.signal.aborted) { setError(reason instanceof Error ? reason.message : 'The comparison could not load.'); setLoading(false); } });
    return () => controller.abort();
  }, [initialRow, data, start, retry]);
  const row = useMemo(() => initialRow || (data ? fastStartRow(data.rows, selection) : undefined), [initialRow, data, selection]);
  const focus = row?.groups.find(group => group.band === selection.band);
  const apply = (next: FastStartSelection) => {
    trackAnalytics('analysis_filters_applied', { analysis: 'opening', course_scope: next.city === 'All courses' ? 'all' : 'single' });
    setSelection(next); setDraft(next);
    window.history.pushState(null, '', unitHref(window.location.pathname + fastStartSearch(next), units));
  };
  const pending = loading || (!initialRow && !data && !error);
  const band = (id: string) => start.bands.find(b => b.id === id)?.label ?? id;
  const summary = [cityName(selection.city), band(selection.band), selection.age === 'all' ? 'All ages' : selection.age, ...(selection.gender === 'all' ? [] : [selection.gender]), ...(all ? [] : ['With an earlier result'])].join(' · ');
  const field = (key: string) => `${formId}-${key}`;
  return <div className="analysis-layout explorer fs-explorer">
    {archive ? <header className="explorer-head"><h1 className="t-title">{title}</h1>{description ? <p className="t-body">{description}</p> : null}</header> : null}
    <MakeItYours id={`${formId}-miy`} summary={summary} busy={pending}>
      <form className="explore-form" onSubmit={event => { event.preventDefault(); apply(draft); }}>
        <div className="explore-mode">
          <Segmented label="Choose the comparison" block value={all ? 'all' : 'history'} onChange={value => apply({ ...draft, mode: value as FastStartMode, prior: 'all' })}
            options={[{ value: 'all', label: 'All eligible finishes' }, { value: 'history', label: 'With an earlier result' }]} />
          <p className="field-hint">{all ? 'No previous race needed' : 'Compared with a recorded best'}</p>
        </div>
        <div className="explore-fields">
          <div className="field"><label className="field-label" htmlFor={field('course')}>Course</label><select id={field('course')} className="select" value={draft.city} onChange={e => setDraft({ ...draft, city: e.target.value })}>{start.cities.map(city => <option key={city} value={city}>{cityName(city)}</option>)}</select></div>
          <div className="field"><label className="field-label" htmlFor={field('opening')}>Opening pace</label><select id={field('opening')} className="select" value={draft.band} onChange={e => setDraft({ ...draft, band: e.target.value })}>{start.bands.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}</select></div>
          {!all && <div className="field"><label className="field-label" htmlFor={field('prior')}>Earlier recorded best</label><select id={field('prior')} className="select" value={draft.prior} onChange={e => setDraft({ ...draft, prior: e.target.value })}>{PRIOR_OPTIONS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></div>}
          <div className="field"><label className="field-label" htmlFor={field('age')}>Age group</label><select id={field('age')} className="select" value={draft.age} onChange={e => setDraft({ ...draft, age: e.target.value })}>{AGE_OPTIONS.map(age => <option key={age} value={age}>{age === 'all' ? 'All ages' : age}</option>)}</select></div>
          <div className="field"><label className="field-label" htmlFor={field('gender')}>Recorded gender</label><select id={field('gender')} className="select" value={draft.gender} onChange={e => setDraft({ ...draft, gender: e.target.value })}><option value="all">All recorded categories</option><option value="Women">Women</option><option value="Men">Men</option></select></div>
        </div>
        <button type="submit" className="btn btn-secondary is-compact explore-submit">Update comparison</button>
      </form>
    </MakeItYours>
    <div className="sr-only" role="status">{pending ? 'Loading the starting-pace comparison.' : error ? '' : focus ? 'Comparison updated.' : 'Not enough recorded finishes for this exact selection.'}</div>
    <div className="miy-results">
      {pending && !row ? <p className="explore-state">Loading the comparison…</p>
        : error ? <div className="explore-state" role="alert"><p>{error}</p><button type="button" className="btn btn-secondary is-compact" onClick={() => setRetry(n => n + 1)}>Try again</button></div>
        : row && focus ? <FastStartResults row={row} focus={focus} start={start} units={units} />
        : <div className="explore-state"><h2 className="explore-title">Not enough results for this starting group.</h2><p>Try another opening or a broader course, age or gender{!all && ', or every earlier time'}.</p><button className="btn btn-secondary is-compact" type="button" onClick={() => apply({ ...FAST_START_DEFAULT, mode: selection.mode, band: defaultOpening })}>Reset the comparison</button></div>}
    </div>
  </div>;
}
