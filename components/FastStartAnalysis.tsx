'use client';

import { useEffect, useMemo, useState } from 'react';
import { UnitLink as Link, useUnits } from './UnitsProvider';
import { distanceLabel, unitText, type UnitSystem } from '@/lib/units';
import { AGE_OPTIONS } from '@/lib/personalized-catalog';
import { clock } from '@/lib/personalized';
import { TEN_ANALYSES, analysisHref } from '@/lib/ten-analyses';
import { sourceReleaseHref } from '@/lib/data-source';
import { FAST_START_DEFAULT, PRIOR_OPTIONS, fastStartCharts, fastStartRow, fastStartSearch, loadFastStartEvidence, readFastStartSelection, referenceTimeDifference, timeChange,
  type FastStartEvidence, type FastStartGroup, type FastStartRow, type FastStartSelection, type FastStartStart, type FastStartStarts, type FastStartMode } from '@/lib/fast-start';
import QuestionViz from './QuestionViz';
import { trackAnalytics } from '@/lib/analytics';

const count = (n: number) => n.toLocaleString('en-US');
const percent = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 1 }) + '%';
const cityName = (city: string) => city === 'New York' ? 'New York City' : city;

export function FastStartResults({ row, focus, start, units }: { row: FastStartRow; focus: FastStartGroup; start: FastStartStart; units: UnitSystem }) {
  const name = start.bands.find(b => b.id === focus.band)!.label;
  const all = start.mode === 'all';
  const charts = fastStartCharts(row, focus, start.bands, start.mode);
  const rate = 100 * focus.slowdown_n / focus.n;
  const steady = focus.band === 'steady' ? undefined : row.groups.find(group => group.band === 'steady');
  return <>
    <section className="analysis-finding fs-finding" aria-labelledby="fast-start-finding">
      <p className="eyebrow">Opening pace: {name.toLowerCase()}</p>
      <h2 id="fast-start-finding">{percent(rate)} developed a sustained slowdown.</h2>
      {all ? <p>After {distanceLabel(20, units)}, this group’s median time difference was <strong>{referenceTimeDifference(focus.after20_delta_median_s!).toLowerCase()}</strong> compared with covering the remaining distance at each finish’s {distanceLabel(5, units)}–{distanceLabel(20, units)} pace. This is a recorded time difference, not a prediction or avoidable time loss.</p> : <p>The median finish in this starting group was <strong>{Math.abs(focus.finish_delta_median_s) < 3 ? 'about the same as' : timeChange(focus.finish_delta_median_s).toLowerCase() + ' than'}</strong> the runner’s earlier recorded best. Late slowing and a slower overall result are different outcomes.</p>}
      {steady && <p className="control-help">For openings within 2% of {all ? `the same race’s ${distanceLabel(5, units)}–${distanceLabel(20, units)} pace` : 'the earlier-best pace'}, {percent(100 * steady.slowdown_n / steady.n)} developed sustained slowdown ({count(steady.slowdown_n)} of {count(steady.n)} finishes with the same filters). {all && `That group’s median recorded finish was ${clock(steady.actual_finish_median_s!, true)}. `}The groups contain different runners and race editions{all ? ', with different finishing speeds and conditions' : ''}.</p>}
      <p className="study-meta">{count(focus.n)} eligible finishes · {count(focus.editions)} race editions · {cityName(row.city)} · {row.age === 'all' ? 'All ages' : `Age ${row.age}`} · {row.gender === 'all' ? 'All recorded genders' : row.gender}{!all && ` · ${PRIOR_OPTIONS.find(p => p.id === row.prior)!.label}`}</p>
    </section>
    <div className="fs-numbers">
      <div><strong>{all ? referenceTimeDifference(focus.after20_delta_median_s!) : timeChange(focus.finish_delta_median_s)}</strong><span>{all ? `Median time difference after ${distanceLabel(20, units)}` : 'Median finish change'}</span><small>{all ? `Relative to the same race’s ${distanceLabel(5, units)}–${distanceLabel(20, units)} pace` : 'Compared with the earlier recorded best'}</small></div>
      <div><strong>{percent(rate)}</strong><span>Had a sustained slowdown</span><small>{count(focus.slowdown_n)} of {count(focus.n)} finishes</small></div>
      <div><strong>{all ? clock(focus.actual_finish_median_s!, true) : percent(100 - rate)}</strong><span>{all ? 'Median recorded finish' : 'No detected sustained slowdown'}</span><small>{all ? 'Actual results in this opening group' : 'Does not rule out milder or shorter slowing'}</small></div>
    </div>
    <p className="fs-caution">{all ? `This compares the first ${distanceLabel(5, units)} with the next ${distanceLabel(15, units)}. It cannot tell whether the entire first half was too ambitious. Terrain, congestion, conditions and fitness remain mixed together; the opening and slowdown measures also share the same reference pace.` : 'A fast opening is measured against an earlier result, not the runner’s current fitness. These groups mix fitness changes, race days, terrain and choices.'} The differences do not prove that the start caused the result.</p>

    <section className="fs-section" aria-labelledby="fs-pace-title"><p className="eyebrow">01 / Watch the race unfold</p><h2 id="fs-pace-title">How did pace change after the opening?</h2><p>Each section shows its typical pace relative to {all ? `the same race’s ${distanceLabel(5, units)}–${distanceLabel(20, units)} pace` : 'the earlier best’s average pace'}. Above zero means slower. {focus.band !== 'steady' && !row.groups.some(g => g.band === 'steady') && 'The similar-opening group is too small to draw a comparison line for these filters.'}</p><QuestionViz spec={charts.pace} unitSystem={units} /></section>

    <section className="fs-section" aria-labelledby="fs-onset-title"><p className="eyebrow">02 / Find the turning point</p><h2 id="fs-onset-title">Where did sustained slowing begin?</h2><p>Here, sustained slowdown means at least 25% slower than the runner’s {distanceLabel(5, units)}–{distanceLabel(20, units)} pace, lasting at least {distanceLabel(5, units)} after {distanceLabel(20, units)}. This follows the <a href="https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0251513">published slowdown method (2021)</a>.</p>
      {charts.onset ? <><p className="control-help">This chart covers only the {count(focus.slowdown_n)} finishes with a detected episode. It does not describe the other {count(focus.n - focus.slowdown_n)} finishes in this starting group.</p><QuestionViz spec={charts.onset} unitSystem={units} /></> : <div className="empty-comparison"><h3>Too few detected slowdowns to show a reliable onset pattern.</h3><p>The group has {count(focus.slowdown_n)} detected episodes. At least {count(start.min_cell)} are required for this chart; the overall rate above still uses all {count(focus.n)} finishes.</p></div>}
    </section>

    <section className="fs-section" aria-labelledby="fs-finish-title"><p className="eyebrow">03 / Look at the finish</p><h2 id="fs-finish-title">{all ? 'How much time accumulated later?' : 'How did the finish times compare?'}</h2><p>{all ? `Compare time after ${distanceLabel(20, units)} with covering that distance at the same race’s ${distanceLabel(5, units)}–${distanceLabel(20, units)} pace.` : 'A runner can fade late and still beat an earlier best.'} Compare the median and range across every starting group with enough data for your filters.</p><QuestionViz spec={charts.finishes} unitSystem={units} /><p className="control-help">Only groups with at least {count(start.min_cell)} finishes are shown. Missing groups are not treated as zero.</p></section>

    <section className="fs-section" aria-labelledby="fs-minutes-title"><p className="eyebrow">04 / Follow the minutes</p><h2 id="fs-minutes-title">Where did the time differences appear?</h2><p>For the <strong>{name.toLowerCase()}</strong> group, {all ? `compare the first ${distanceLabel(5, units)} and the distance after ${distanceLabel(20, units)} with the same race’s ${distanceLabel(5, units)}–${distanceLabel(20, units)} pace. The reference section contributes zero by definition.` : `compare the first ${distanceLabel(10, units)} and the rest of the race with an even pace based on the earlier best.`} That reference is not an expected or predicted finish.</p><QuestionViz spec={charts.accounting} unitSystem={units} /></section>
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
    window.history.pushState(null, '', window.location.pathname + fastStartSearch(next) + '&units=' + units);
  };
  const navSearch = '?' + new URLSearchParams({ race: selection.city, age: selection.age, gender: selection.gender, units }).toString();
  const pending = loading || (!initialRow && !data && !error);
  return <div className="analysis-layout">
    <aside className="analysis-sidebar"><Link href="/analyses" className="sidebar-heading">The essential ten</Link><nav aria-label="The ten ranked analyses"><ol>{TEN_ANALYSES.map(item => <li key={item.id}><Link href={analysisHref(item) + navSearch} aria-current={item.id === 'opening' ? 'page' : undefined}><span>{String(item.rank).padStart(2, '0')}</span>{unitText(item.shortTitle, units)}</Link></li>)}</ol></nav><p>One question at a time.</p></aside>
    <article className="analysis-main fs-page">
      <header className="analysis-heading"><Link href={archive ? '/packs' : '/analyses'} className="eyebrow">{archive ? 'Research archive / Opening pace' : 'Analysis 02 of 10 / Plan your race'}</Link><h1>{title}</h1><p>{description}</p></header>
      <div className="fs-modes" role="group" aria-label="Choose the comparison"><button type="button" aria-pressed={all} onClick={() => apply({ ...draft, mode: 'all', prior: 'all' })}>All eligible finishes<span>No previous race needed</span></button><button type="button" aria-pressed={!all} onClick={() => apply({ ...draft, mode: 'history', prior: 'all' })}>With an earlier result<span>Compare with a recorded best</span></button></div>
      <p className="fs-coverage">{all ? <><strong>{count(start.analysis_n)} eligible finishes.</strong> First-time runners and people without recorded history are included. Compare the first {distanceLabel(5, units)} with the next {distanceLabel(15, units)}, then see what happened afterward.</> : <><strong>{count(start.analysis_n)} eligible finishes with earlier results.</strong> Compare the first {distanceLabel(10, units)} with an eligible recorded best from the two earlier calendar years.</>}</p>
      <form className="comparison-controls" onSubmit={event => { event.preventDefault(); apply(draft); }}>
        <div className="controls-heading"><h2>Choose the runners and their start</h2><span>{all ? 'Each race supplies its own comparison' : 'Observed races with earlier results'}</span></div>
        <div className={'profile-fields fs-controls' + (all ? ' fs-controls-all' : '')}>
          <label>Course<select value={draft.city} onChange={e => setDraft({ ...draft, city: e.target.value })}>{start.cities.map(city => <option key={city} value={city}>{cityName(city)}</option>)}</select></label>
          {!all && <label>Earlier recorded best<select value={draft.prior} onChange={e => setDraft({ ...draft, prior: e.target.value })}>{PRIOR_OPTIONS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>}
          <label>Opening pace<select value={draft.band} onChange={e => setDraft({ ...draft, band: e.target.value })}>{start.bands.map(band => <option key={band.id} value={band.id}>{band.label}</option>)}</select></label>
          <label>Age group<select value={draft.age} onChange={e => setDraft({ ...draft, age: e.target.value })}>{AGE_OPTIONS.map(age => <option key={age} value={age}>{age === 'all' ? 'All ages' : age}</option>)}</select></label>
          <label>Recorded gender<select value={draft.gender} onChange={e => setDraft({ ...draft, gender: e.target.value })}><option value="all">All recorded categories</option><option value="Women">Women</option><option value="Men">Men</option></select></label>
          <button type="submit" className="button-primary">Update comparison <span aria-hidden="true">↗</span></button>
        </div>
        <p className="control-help">Opening pace covers the first {distanceLabel(all ? 5 : 10, units)}. “Faster” means less time per {units === 'mi' ? 'mile' : 'kilometre'} than {all ? `the same race’s ${distanceLabel(5, units)}–${distanceLabel(20, units)} pace` : 'the average pace of that runner’s best recorded finish in the two earlier calendar years'}. These thresholds describe a start; they do not diagnose overreach.</p>
      </form>
      <div className="sr-only" role="status">{pending ? 'Loading the starting-pace comparison.' : error ? '' : focus ? `Comparison updated. ${count(focus.n)} finishes in the selected opening group.` : 'Not enough recorded finishes for this exact selection.'}</div>
      {pending ? <p className="loading-message">Loading the comparison…</p> : error ? <div className="feedback-error" role="alert"><p>{error}</p><button type="button" onClick={() => setRetry(n => n + 1)}>Try again</button></div> : row && focus ? <FastStartResults row={row} focus={focus} start={start} units={units} /> : <section className="empty-comparison"><h2>Not enough results for this starting group.</h2><p>This exact combination needs at least {count(start.min_cell)} eligible finishes{!all && ' with earlier results'}. Try another opening group or broaden the course, age or gender filters{!all && ', or choose all earlier times'}.</p><button className="button-secondary" type="button" onClick={() => apply({ ...FAST_START_DEFAULT, mode: selection.mode, band: defaultOpening })}>Reset comparison filters</button></section>}
      <section className="fs-method"><h2>What this can tell you</h2><p>The comparison follows {count(start.analysis_n)} eligible finishes{!all && ' with a usable recent recorded benchmark'}. It includes complete finishers only. Withdrawals, intended targets, fitness, training and fueling are not measured, and the same runner may contribute several races. Incomplete results remain available in <Link href="/runners">Find a runner</Link>.</p><details><summary>Definitions, coverage and limits</summary>{all ? <p>No earlier race or cross-race identity link is needed. Each eligible result contributes once. A runner who holds the same pace through {distanceLabel(20, units)} and then fades can have a similar opening in this view. It does not identify every overly ambitious start. The reference section is observed after the opening, and both opening and later-slowdown ratios share it.</p> : <p>Candidate identities use the database’s screened links; they are not independently verified people. Earlier bests use eligible finishes in the two strictly earlier calendar years. No current-year result can supply the benchmark.</p>}<p>Every displayed group needs at least {count(start.min_cell)} finishes. Filters select the exact requested cohort; sparse selections are not silently widened. Age uses recorded exact ages from 18 to 89. Missing age or gender remains in All and is not inferred.</p><p>Sustained slowdown uses the study’s established 25% threshold over at least {distanceLabel(5, units)} after {distanceLabel(20, units)}, compared with {distanceLabel(5, units)}–{distanceLabel(20, units)} pace. Onset is a recorded section boundary. An isolated short final section cannot meet the distance requirement.</p><p>Neither finish-time differences nor the early/later time accounting establish a causal penalty. Weather, historical course changes, fitness and selection into recorded complete finishes remain mixed together.</p></details><p><a href={(process.env.NEXT_PUBLIC_BASE_PATH || '') + '/data/fast-start/' + (all ? 'all-finishers.json' : 'evidence.json')}>Download the analysis data</a> · <a href={sourceReleaseHref(start.release_tag)}>Open the source data</a> · <Link href="/methodology#fast-start-method">Study methods</Link></p></section>
      <nav className="analysis-next" aria-label="Continue exploring"><Link href={'/analyses/pacing-pattern' + navSearch}>← Your pacing pattern</Link><Link href={'/analyses/checkpoint' + navSearch}>From here to the finish →</Link></nav>
    </article>
  </div>;
}
