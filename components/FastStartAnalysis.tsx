'use client';

import { useEffect, useMemo, useState } from 'react';
import { UnitLink as Link, useUnits } from './UnitsProvider';
import { distanceLabel, unitText, type UnitSystem } from '@/lib/units';
import { AGE_OPTIONS } from '@/lib/personalized-catalog';
import { clock } from '@/lib/personalized';
import { TEN_ANALYSES, analysisHref } from '@/lib/ten-analyses';
import { MARATHON_SECTION_ENDS, sectionLabel } from '@/lib/section-labels';
import { chartOnly } from './AnalysisChart';
import { FAST_START_DEFAULT, PRIOR_OPTIONS, fastStartCharts, fastStartRow, fastStartSearch, loadFastStartEvidence, readFastStartSelection, referenceTimeDifference, timeChange,
  type FastStartEvidence, type FastStartGroup, type FastStartRow, type FastStartSelection, type FastStartStart, type FastStartStarts, type FastStartMode } from '@/lib/fast-start';
import QuestionViz from './QuestionViz';
import { trackAnalytics } from '@/lib/analytics';
import { dropDefaults, unitHref } from '@/lib/unit-preference';

const percent = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 1 }) + '%';
const cityName = (city: string) => city === 'New York' ? 'New York City' : city;

export function FastStartResults({ row, focus, start, units }: { row: FastStartRow; focus: FastStartGroup; start: FastStartStart; units: UnitSystem }) {
  const name = start.bands.find(b => b.id === focus.band)!.label;
  const all = start.mode === 'all';
  const charts = fastStartCharts(row, focus, start.bands, start.mode);
  const rate = 100 * focus.slowdown_n / focus.n;
  const steady = focus.band === 'steady' ? undefined : row.groups.find(group => group.band === 'steady');
  const reference = all ? 'early-race pace' : 'the earlier best’s pace';
  const section = (index: number) => unitText(sectionLabel(MARATHON_SECTION_ENDS[index]), units);
  const slowest = focus.pace_pct.reduce((best, value, i) => value > focus.pace_pct[best] ? i : best, 0);
  const peak = focus.pace_pct[slowest];
  const onsetAt = focus.onset ? focus.onset.reduce((best, n, i) => n > focus.onset![best] ? i : best, 0) : -1;
  const differs = (seconds: number) => referenceTimeDifference(seconds).toLowerCase();
  return <>
    <section className="analysis-finding fs-finding" aria-labelledby="fast-start-finding">
      <p className="eyebrow">Opening pace: {name.toLowerCase()}</p>
      <h2 id="fast-start-finding">{percent(rate)} developed a sustained slowdown.</h2>
      {all ? <p>After {distanceLabel(20, units)}, the median finish in this group took <strong>{differs(focus.after20_delta_median_s!)}</strong> than the same distance at its early-race pace.</p> : <p>The median finish in this starting group was <strong>{Math.abs(focus.finish_delta_median_s) < 3 ? 'about the same as' : timeChange(focus.finish_delta_median_s).toLowerCase() + ' than'}</strong> the runner’s earlier recorded best.</p>}
      {steady && <p className="control-help">Among steady openings, within 2% of {reference}, {percent(100 * steady.slowdown_n / steady.n)} developed a sustained slowdown{all ? `, and the median finish was ${clock(steady.actual_finish_median_s!, true)}` : ''}.</p>}
      <p className="study-meta">{cityName(row.city)} · {row.age === 'all' ? 'All ages' : `Age ${row.age}`} · {row.gender === 'all' ? 'All recorded genders' : row.gender}{!all && ` · ${PRIOR_OPTIONS.find(p => p.id === row.prior)!.label}`}</p>
    </section>
    <div className="fs-numbers">
      <div><strong>{all ? referenceTimeDifference(focus.after20_delta_median_s!) : timeChange(focus.finish_delta_median_s)}</strong><span>{all ? `Median time after ${distanceLabel(20, units)}, against early-race pace` : 'Median finish against the earlier best'}</span></div>
      <div><strong>{percent(rate)}</strong><span>Had a sustained slowdown</span></div>
      <div><strong>{all ? clock(focus.actual_finish_median_s!, true) : percent(100 - rate)}</strong><span>{all ? 'Median recorded finish' : 'No sustained slowdown'}</span></div>
    </div>

    <section className="fs-section" aria-labelledby="fs-pace-title"><p className="eyebrow">01 / Watch the race unfold</p><h2 id="fs-pace-title">How did pace change after the opening?</h2><p>{peak > 0.05 ? `Pace was slowest in the ${section(slowest)} section, ${percent(peak)} slower than ${reference}.` : `Pace stayed ahead of ${reference} in every section; it came closest in the ${section(slowest)} section.`}{focus.band !== 'steady' && !row.groups.some(g => g.band === 'steady') && ' Too few steady openings to draw a comparison line.'}</p><QuestionViz spec={chartOnly(charts.pace)} unitSystem={units} /></section>

    <section className="fs-section" aria-labelledby="fs-onset-title"><p className="eyebrow">02 / Find the turning point</p><h2 id="fs-onset-title">Where did sustained slowing begin?</h2>
      {charts.onset && focus.onset ? <><p>In this group, <Link href="/methodology#sustained-slowdown">sustained slowdowns</Link> most often began in the {unitText(`${20 + onsetAt * 5}–${25 + onsetAt * 5} km`, units)} section ({percent(100 * focus.onset[onsetAt] / focus.slowdown_n)} of them).</p><QuestionViz spec={chartOnly(charts.onset)} unitSystem={units} /></> : <div className="empty-comparison"><h3>Too few detected slowdowns to show a reliable onset pattern.</h3><p>Try a broader course, age or gender selection.</p></div>}
    </section>

    <section className="fs-section" aria-labelledby="fs-finish-title"><p className="eyebrow">03 / Look at the finish</p><h2 id="fs-finish-title">{all ? 'How much time accumulated later?' : 'How did the finish times compare?'}</h2><QuestionViz spec={chartOnly(charts.finishes)} unitSystem={units} /></section>

    <section className="fs-section" aria-labelledby="fs-minutes-title"><p className="eyebrow">04 / Follow the minutes</p><h2 id="fs-minutes-title">Where did the time differences appear?</h2><p>For the <strong>{name.toLowerCase()}</strong> group, the opening {distanceLabel(all ? 5 : 10, units)} took {differs(focus.opening_delta_mean_s)} on average and {all ? `the distance after ${distanceLabel(20, units)}` : 'the rest of the race'} took {differs(focus.remainder_delta_mean_s)}, against {reference}.</p><QuestionViz spec={chartOnly(charts.accounting)} unitSystem={units} /></section>
  </>;
}

export default function FastStartAnalysis({ starts, defaultOpening = 'fast10', title = 'What happens after a very fast start?', description = 'Follow the opening pace through the late stages and into the finish time. See who slowed, where it began, and whether an early gain lasted.', archive = false }: { starts: FastStartStarts; defaultOpening?: string; title?: string; description?: string; archive?: boolean }) {
  const { units } = useUnits();
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
  // Filters at their defaults stay out of the links; UnitLink adds units=km for a kilometres visitor.
  const navSearch = dropDefaults({ race: selection.city, age: selection.age, gender: selection.gender });
  const pending = loading || (!initialRow && !data && !error);
  return <div className="analysis-layout">
    <aside className="analysis-sidebar"><Link href="/analyses" className="sidebar-heading">The essential ten</Link><nav aria-label="The ten ranked analyses"><ol>{TEN_ANALYSES.map(item => <li key={item.id}><Link href={analysisHref(item) + navSearch} aria-current={item.id === 'opening' ? 'page' : undefined}><span>{String(item.rank).padStart(2, '0')}</span>{unitText(item.shortTitle, units)}</Link></li>)}</ol></nav><p>One question at a time.</p></aside>
    <article className="analysis-main fs-page">
      <header className="analysis-heading"><Link href={archive ? '/packs' : '/analyses'} className="eyebrow">{archive ? 'Research archive / Opening pace' : 'Analysis 02 of 10 / Pace your race'}</Link><h1>{title}</h1><p>{description}</p></header>
      <div className="fs-modes" role="group" aria-label="Choose the comparison"><button type="button" aria-pressed={all} onClick={() => apply({ ...draft, mode: 'all', prior: 'all' })}>All eligible finishes<span>No previous race needed</span></button><button type="button" aria-pressed={!all} onClick={() => apply({ ...draft, mode: 'history', prior: 'all' })}>With an earlier result<span>Compare with a recorded best</span></button></div>
      <form className="comparison-controls" onSubmit={event => { event.preventDefault(); apply(draft); }}>
        <div className="controls-heading"><h2>Choose the runners and their start</h2></div>
        <div className={'profile-fields fs-controls' + (all ? ' fs-controls-all' : '')}>
          <label>Course<select value={draft.city} onChange={e => setDraft({ ...draft, city: e.target.value })}>{start.cities.map(city => <option key={city} value={city}>{cityName(city)}</option>)}</select></label>
          {!all && <label>Earlier recorded best<select value={draft.prior} onChange={e => setDraft({ ...draft, prior: e.target.value })}>{PRIOR_OPTIONS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>}
          <label>Opening pace<select value={draft.band} onChange={e => setDraft({ ...draft, band: e.target.value })}>{start.bands.map(band => <option key={band.id} value={band.id}>{band.label}</option>)}</select></label>
          <label>Age group<select value={draft.age} onChange={e => setDraft({ ...draft, age: e.target.value })}>{AGE_OPTIONS.map(age => <option key={age} value={age}>{age === 'all' ? 'All ages' : age}</option>)}</select></label>
          <label>Recorded gender<select value={draft.gender} onChange={e => setDraft({ ...draft, gender: e.target.value })}><option value="all">All recorded categories</option><option value="Women">Women</option><option value="Men">Men</option></select></label>
          <button type="submit" className="button-primary">Update comparison <span aria-hidden="true">↗</span></button>
        </div>
      </form>
      <div className="sr-only" role="status">{pending ? 'Loading the starting-pace comparison.' : error ? '' : focus ? 'Comparison updated.' : 'Not enough recorded finishes for this exact selection.'}</div>
      {pending ? <p className="loading-message">Loading the comparison…</p> : error ? <div className="feedback-error" role="alert"><p>{error}</p><button type="button" onClick={() => setRetry(n => n + 1)}>Try again</button></div> : row && focus ? <FastStartResults row={row} focus={focus} start={start} units={units} /> : <section className="empty-comparison"><h2>Not enough results for this starting group.</h2><p>Try another opening group or broaden the course, age or gender filters{!all && ', or choose all earlier times'}.</p><button className="button-secondary" type="button" onClick={() => apply({ ...FAST_START_DEFAULT, mode: selection.mode, band: defaultOpening })}>Reset comparison filters</button></section>}
      <nav className="analysis-next" aria-label="Continue exploring"><Link href={'/analyses/pacing-pattern' + navSearch}>← Your pacing pattern</Link><Link href={'/analyses/checkpoint' + navSearch}>From here to the finish →</Link></nav>
    </article>
  </div>;
}
