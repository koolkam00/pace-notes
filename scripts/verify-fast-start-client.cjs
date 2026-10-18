const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const Module = require('node:module');
const ts = require('typescript');
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
}).outputText, filename);
const resolve = Module._resolveFilename;
Module._resolveFilename = function(request, ...args) { return resolve.call(this, request.startsWith('@/') ? path.join(__dirname, '..', request.slice(2)) : request, ...args); };
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { FAST_START_DEFAULT, PRIOR_OPTIONS, fastStartSearch, readFastStartSelection, fastStartRow, fastStartCharts, timeChange, loadFastStartEvidence } = require('../lib/fast-start.ts');
const { getFastStartStarts } = require('../lib/fast-start-server.ts');
const { FastStartResults, default: FastStartAnalysis } = require('../components/FastStartAnalysis.tsx');
const { default: MethodologyPage } = require('../app/methodology/page.tsx');
const starts = getFastStartStarts(), start = starts.history;
const bytes = fs.readFileSync(path.join(__dirname, '../public/data/fast-start/evidence.json'));
const evidence = JSON.parse(bytes);
const allBytes = fs.readFileSync(path.join(__dirname, '../public/data/fast-start/all-finishers.json'));
const allEvidence = JSON.parse(allBytes);
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
// The adopted runner lookup sets the expected cohorts (3,871,767 finishes and 592,241 earlier-best benchmarks under 1652; 3,517,336 and 555,437 under 0934).
const runners = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/data/runners/manifest.json'), 'utf8'));
const eligible = runners.eligible_records, benchmarked = runners.linkage.recent_benchmark_finishes;
// Method, definitions, coverage and source text belong on /methodology only (owner request, 2026-10-16).
const METHOD_COPY = [/What this can tell you/, /Definitions, coverage and limits/, /Download the analysis data/, /Open the source data/, /Study methods/,
  /journals\.plos\.org/, /\d[\d,]* eligible finishes/, /withdrawals/i, /do not prove that the start caused/, /not minutes caused or lost/,
  /not a prediction or avoidable time loss/, /cannot tell whether the entire first half/, /share the same reference pace/, /they do not diagnose overreach/,
  /Each race supplies its own comparison/, /First-time runners and people without recorded history/, /at least \d+ (?:eligible |detected )?finishes/, /Missing groups are not treated as zero/];
const noMethodCopy = (html, where) => { for (const pattern of METHOD_COPY) assert.doesNotMatch(html, pattern, `${where}: method or source copy belongs on /methodology (${pattern})`); };
const SLOWDOWN_LINK = /<a [^>]*href="\/methodology#sustained-slowdown"[^>]*>sustained slowdowns?<\/a>/;

async function main() {
  for (const prior of PRIOR_OPTIONS) for (const band of start.bands) {
    const selection = {mode:'history',city:'New York',age:'35–39',gender:'Women',prior:prior.id,band:band.id};
    assert.deepEqual(readFastStartSelection(fastStartSearch(selection),start),selection);
  }
  assert.deepEqual(readFastStartSelection('?race=unknown&age=unknown&gender=unknown&prior=unknown&opening=unknown',start),FAST_START_DEFAULT);
  assert.equal(readFastStartSelection('?previous=179&goal=300',start).prior,'under3');
  assert.equal(readFastStartSelection('?previous=180',start).prior,'3to330');
  assert.equal(readFastStartSelection('?previous=210',start).prior,'330to4');
  assert.equal(readFastStartSelection('?previous=240',start).prior,'4plus');
  assert.equal(readFastStartSelection('?previous=&goal=180',start).prior,'all','A target must not silently select prior ability');
  assert.equal(readFastStartSelection('?previous=240&prior=all',start).prior,'all','An explicit reset must clear earlier-time filtering');
  assert.equal(readFastStartSelection('',starts.all).mode,'all','New visitors include finishes without history');
  assert.equal(readFastStartSelection('?previous=240',start).mode,'history','Old earlier-time links retain their comparison');
  assert.equal(readFastStartSelection('?prior=all',start).mode,'history','Old shared opening URLs retain their comparison');
  assert.deepEqual(readFastStartSelection('?comparison=all&prior=under3&previous=180',start),FAST_START_DEFAULT,'All mode must clear incompatible earlier-time restrictions');
  assert.equal(readFastStartSelection('?comparison=history',start).mode,'history');
  for(const band of starts.all.bands) {
    const selection={...FAST_START_DEFAULT,city:'New York',age:'35–39',gender:'Women',band:band.id};
    assert.deepEqual(readFastStartSelection(fastStartSearch(selection),starts.all),selection);
  }
  assert.equal(fastStartRow(evidence.rows,{...FAST_START_DEFAULT,city:'Missing course'}),undefined,'Sparse cohorts cannot fall back to All');
  assert.equal(fastStartRow(evidence.rows,FAST_START_DEFAULT).groups.length,6);
  const focus=start.initial.groups.find(g=>g.band==='fast10');
  const steady=start.initial.groups.find(g=>g.band==='steady');
  const charts=fastStartCharts(start.initial,focus,start.bands);
  assert.deepEqual(charts.pace.rows.map(row=>row.value),focus.pace_pct);
  assert.deepEqual(charts.pace.rows.map(row=>row.steady),steady.pace_pct);
  assert.deepEqual(charts.pace.rows.map(row=>row.n_value),Array(9).fill(focus.n));
  assert.ok(charts.onset.rows.every(row=>row.n_value===focus.slowdown_n),'Onset denominator is detected episodes, not all group finishes');
  assert.ok(Math.abs(charts.onset.rows.reduce((sum,row)=>sum+row.value,0)-100)<1e-8);
  assert.equal(charts.finishes.rows[0].median,focus.finish_delta_median_s/60);
  assert.ok(Math.abs(charts.accounting.rows[0].value+charts.accounting.rows[1].value-charts.accounting.rows[2].value)<1e-6);
  assert.equal(fastStartCharts(start.initial,steady,start.bands).pace.series.length,1,'A selected steady group must not be duplicated');
  assert.equal(fastStartCharts({...start.initial,groups:[focus]},focus,start.bands).pace.series.length,1,'No invented steady comparison for a sparse cohort');
  assert.equal(timeChange(-997),'16:37 faster'); assert.equal(timeChange(325),'5:25 slower'); assert.equal(timeChange(3725),'1:02:05 slower'); assert.equal(timeChange(0),'About the same time');

  // The figures the history view prints, from the verified evidence (verify-fast-start recounts them from the runner
  // records). Under 0934 they were 47%, 16.6 min faster, 17.9%, 142,757 and 67,025; in 1652 43.6%, 19 min faster, 20.2%,
  // 152,758 and 66,657. Formatted here independently of the component: whole percent and m:ss durations, as every page
  // writes them (October 18, 2026), en-US thousands.
  const pct=n=>Math.round(n)+'%';
  const esc=text=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const focusRate=pct(100*focus.slowdown_n/focus.n), steadyRate=pct(100*steady.slowdown_n/steady.n);
  const whole=Math.round(Math.abs(focus.finish_delta_median_s));
  const finishChange=`${Math.floor(whole/60)}:${String(whole%60).padStart(2,'0')} ${focus.finish_delta_median_s<0?'faster':'slower'}`;
  assert.equal(timeChange(focus.finish_delta_median_s),finishChange,'The finish change reads as the evidence median');
  for (const units of ['mi','km']) {
    const html=render(FastStartResults,{row:start.initial,focus,start,units});
    assert.match(html,new RegExp(esc(focusRate)+' developed a <a [^>]*>sustained slowdown</a>'));
    assert.match(html,new RegExp(esc(timeChange(focus.finish_delta_median_s))));
    assert.match(html,new RegExp(esc(steadyRate))); assert.match(html,new RegExp(focus.n.toLocaleString('en-US'))); assert.match(html,new RegExp(focus.slowdown_n.toLocaleString('en-US')));
    assert.match(html,/earlier recorded best/);
    assert.match(html,SLOWDOWN_LINK,'The sustained slowdown term links to its definition on /methodology');
    // Where each opening's slowdowns most often began is in Values ("Most often began"), its slowest section on the chart.
    assert.match(html,/>Most often began</,'Values states where each opening\'s slowdowns most often began');
    const onsetAt=focus.onset.reduce((best,n,i)=>n>focus.onset[best]?i:best,0);
    assert.match(html,new RegExp(`${25+onsetAt*5-5}–${25+onsetAt*5}K, ${esc(pct(100*focus.onset[onsetAt]/focus.slowdown_n))}`),'the focused opening\'s onset section and share');
    noMethodCopy(html,`history results (${units})`);
    // Sections and the course axis are named by their mats in both units (the redesign spec, section 3.10).
    assert.match(html,/30–35K/);
    assert.match(html,/>Finish</);
    assert.doesNotMatch(html,/private-export-|20260912|htw-db-|20261016/,'Internal upload identifiers stay out of visible result copy');
  }
  const sparse={...focus,n:100,editions:5,slowdown_n:7,onset:null};
  assert.equal(fastStartCharts(start.initial,sparse,start.bands).onset,null);
  // Too few detected slowdowns to place their start: the opening's onset cell reads a dash, never an invented section.
  assert.match(render(FastStartResults,{row:{...start.initial,groups:[sparse]},focus:sparse,start,units:'mi'}),/<tr class="is-reading"><th scope="row">[^<]+<\/th><td>\d+%<\/td><td>—<\/td>/);
  const zero={...focus,n:100,editions:5,slowdown_n:0,onset:null,finish_delta_median_s:0};
  assert.match(render(FastStartResults,{row:start.initial,focus:zero,start,units:'km'}),/about the same as/);
  assert.doesNotMatch(render(FastStartResults,{row:start.initial,focus:zero,start,units:'km'}),/same time than/);
  const page=render(FastStartAnalysis,{starts});
  assert.match(page,/Opening pace/); assert.match(page,/No previous race needed/); assert.doesNotMatch(page,/>Earlier recorded best</); assert.doesNotMatch(page,/>Target time</);
  assert.doesNotMatch(page,new RegExp(eligible.toLocaleString('en-US')),'Coverage counts belong on /methodology'); noMethodCopy(page,'fast-start page');
  assert.match(page,/aria-pressed="true">All eligible finishes/);
  assert.match(page,/With an earlier result/);
  const allRow=starts.all.initial, allFocus=allRow.groups.find(g=>g.band==='fast10');
  assert.equal(allRow.groups.reduce((sum,g)=>sum+g.n,0),eligible);
  const allCharts=fastStartCharts(allRow,allFocus,starts.all.bands,'all');
  assert.equal(allCharts.finishes.rows[0].median,allFocus.after20_delta_median_s/60,'All mode foregrounds the subsequent outcome, not a finish difference partly defined by the opening');
  assert.equal(allCharts.accounting.rows[0].label,'Opening 5 km');
  assert.equal(allCharts.accounting.rows[1].label,'After 20 km');
  assert.ok(Math.abs(allCharts.accounting.rows[0].value+allCharts.accounting.rows[1].value-allCharts.accounting.rows[2].value)<1e-6);
  for(const units of ['mi','km']) {
    const html=render(FastStartResults,{row:allRow,focus:allFocus,start:starts.all,units});
    assert.match(html,/>Median finish</); assert.match(html,/than its own early-race pace/);
    assert.match(html,SLOWDOWN_LINK);
    noMethodCopy(html,`all-finisher results (${units})`);
    assert.match(html,/After 20K, the median finish ran /);
    assert.doesNotMatch(html,/earlier recorded best|earlier-best|All earlier times/,'All mode cannot present its reference as a prior result');
    assert.doesNotMatch(html,/private-export-|20260912|htw-db-|20261016/);
  }
  const methodology=render(MethodologyPage,{});
  const legacyOpening=(methodology.match(/<details\b[^>]*>[\s\S]*?<\/details>/g)||[]).find(detail=>detail.includes('Which openings are associated with finishing under my target?'));
  assert.ok(legacyOpening,'Keep the legacy opening explanation available');
  assert.match(legacyOpening,/href="\/research\/personalized#guide-opening"/,'Legacy target comparison must open its own guide');
  assert.doesNotMatch(legacyOpening,/href="\/analyses\/starting-pace"/);
  assert.match(methodology,/href="\/analyses\/starting-pace"/,'Document and link the current fast-start analysis separately');
  for (const row of evidence.rows.filter(row=>row.city!=='All courses').slice(0,3)) {
    const html=render(FastStartResults,{row,focus:row.groups[0],start,units:'mi'});
    assert.ok(html.includes(row.city==='New York'?'New York City':row.city));
  }

  const originalFetch=global.fetch; const calls=[]; let served=bytes,status=200;
  global.fetch=async(url,options)=>{calls.push({url:String(url),signal:options.signal});return new Response(served,{status});};
  const signal=new AbortController().signal;
  const descriptor=raw=>({...start,bytes:raw.length,sha256:crypto.createHash('sha256').update(raw).digest('hex')});
  try {
    status=503; await assert.rejects(()=>loadFastStartEvidence(start,signal),/could not load/); status=200;
    served=Buffer.from(bytes); served[0]=32;
    await assert.rejects(()=>loadFastStartEvidence(start,signal),/changed/,'Corrupt bytes must never reach the charts');
    served=Buffer.from(JSON.stringify({...evidence,release_tag:'wrong'}));
    await assert.rejects(()=>loadFastStartEvidence(descriptor(served),signal),/verified/);
    served=bytes; const cancelled=new AbortController(); cancelled.abort();
    await assert.rejects(()=>loadFastStartEvidence(start,cancelled.signal),/Aborted/);
    const loaded=await loadFastStartEvidence(start,signal); assert.equal(loaded.history_n,benchmarked);
    assert.ok(calls.at(-1).url.endsWith('?v='+start.sha256)); assert.equal(calls.at(-1).signal,signal);
    const before=calls.length; await loadFastStartEvidence(start,signal); assert.equal(calls.length,before,'Use only a verified content-bound cache');
    served=allBytes;
    const allLoaded=await loadFastStartEvidence(starts.all,signal);assert.equal(allLoaded.analysis_n,eligible);
    assert.ok(calls.at(-1).url.includes('/all-finishers.json?v='),'Each comparison loads its own artifact');
    served=bytes;const historyLoaded=await loadFastStartEvidence(start,signal);assert.equal(historyLoaded.history_n,benchmarked);
    assert.ok(calls.at(-1).url.includes('/evidence.json?v='),'Mode changes never reuse the other comparison payload');
    served=Buffer.from(JSON.stringify({...allEvidence,mode:undefined}));
    await assert.rejects(()=>loadFastStartEvidence({...starts.all,bytes:served.length,sha256:crypto.createHash('sha256').update(served).digest('hex')},signal),/mode/,'Reject incorrect mode semantics even with matching transport bytes');
  } finally {global.fetch=originalFetch;}
  console.log('Fast-start client checks passed: exact filters and URL restore/reset, no target leakage or sparse fallback, chart denominators and signed accounting, mi/km rendered results, hash-bound loading and errors.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
