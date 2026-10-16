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
const helpers = require('../lib/all-finisher-context.ts');
const { getAllFinisherContextStart } = require('../lib/all-finisher-context-server.ts');
const { default: AllFinisherAnalysis, AllFinisherResults } = require('../components/AllFinisherAnalysis.tsx');
const { default: AnalysisPage } = require('../app/analyses/[slug]/page.tsx');
const { default: PackPage } = require('../app/packs/[packId]/page.tsx');
const { BROADER_ARCHIVE } = require('../lib/broader-analysis-catalog.ts');
const { default: MethodologyPage } = require('../app/methodology/page.tsx');
const start = getAllFinisherContextStart();
const bytes = fs.readFileSync(path.join(__dirname, '../public/data/all-finisher-context/evidence.json'));
const evidence = JSON.parse(bytes);
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
const { ALL_FINISHER_DEFAULT, readAllFinisherSelection, allFinisherSearch, allFinisherRow, allFinisherGroups, allFinisherGroupLabel, allFinisherCharts, earlyPaceLabel, loadAllFinisherContext } = helpers;
async function main() {
  assert.equal(start.analysis_n, 3517336);
  assert.equal(start.edition_labels.length, 256);
  assert.deepEqual(readAllFinisherSelection('', start), ALL_FINISHER_DEFAULT);
  assert.deepEqual(readAllFinisherSelection('?race=bad&age=bad&gender=bad&early=bad&opening=bad',start), ALL_FINISHER_DEFAULT);
  assert.equal(readAllFinisherSelection('?previous=240',start).mode,'history');
  assert.equal(readAllFinisherSelection('?comparison=all&previous=240&prior=under3',start).mode,'all');
  assert.equal(readAllFinisherSelection('?previous=&goal=180',start).mode,'all');
  assert.equal(readAllFinisherSelection('?previous=Infinity',start).mode,'all');
  for(const pace of start.early_pace_bands) for(const mode of ['all','history']) {
    const selection={mode,city:'New York',age:'35–39',gender:'Women',early_pace:pace.id,opening:'slow5'};
    assert.deepEqual(readAllFinisherSelection(allFinisherSearch(selection),start),selection);
    const params=new URLSearchParams(allFinisherSearch(selection));
    assert.equal(params.has('previous'),false); assert.equal(params.has('goal'),false);
  }
  assert.equal(allFinisherRow(evidence.rows,{...ALL_FINISHER_DEFAULT,city:'Missing course'}),undefined,'Never replace unavailable exact filters with broader data');
  const kinds=['courses','weather','downhill','weather-profile','course-consistency','course-profile','race-day'];
  for(const kind of kinds) {
    const groups=allFinisherGroups(start.initial,kind,'fast10');
    assert.ok(groups.length>0,kind+' has default data');
    if(kind==='downhill') assert.ok(groups.every(group=>group.opening==='fast10'));
    if(kind==='race-day') assert.ok(groups.every(group=>group.edition_n===1&&group.n>=100));
    for(const units of ['mi','km']) {
      const focus=groups[0],comparison=groups[1];
      const charts=allFinisherCharts(groups,focus,comparison,kind,units);
      assert.equal(charts.slowdown.rows[0].value,focus.slowdown_pct,'Use equally weighted stored rates, not a pooled recount');
      assert.equal(charts.consistency.rows[0].value,focus.late_spread_pct);
      assert.equal(charts.time.rows[0].value,focus.after20_delta_s/60);
      assert.deepEqual(charts.profile.rows.map(row=>row.g0),focus.profile_pct);
      if(charts.onset) {
        assert.ok(charts.onset.rows.every(row=>row.n_value===focus.detected_n));
        assert.ok(Math.abs(charts.onset.rows.reduce((sum,row)=>sum+row.value,0)-100)<1e-4);
      }
      const html=render(AllFinisherResults,{groups,kind,start,units,focus,comparison});
      assert.match(html,/Included courses and race years/);
      assert.match(html,units==='mi'?/12\.43 mi/:/20 km/);
      assert.doesNotMatch(html,/private-export-|20260912|htw-db-|20261016/);
      if(kind==='race-day') {
        assert.match(html,/Slowdown rate in this edition/);
        assert.doesNotMatch(html,/Mean edition slowdown rate|across 3 editions/);
        assert.match(html,/Modeled start-hour temperature|Start-hour temperature is unavailable/);
      }
      if(kind==='downhill') assert.match(html,/historical route validity is unverified/i);
    }
    const page=render(AllFinisherAnalysis,{kind,start,history:React.createElement('p',null,'HISTORY RESULT')});
    assert.match(page,/aria-pressed="true">All eligible finishes/);
    assert.match(page,/No previous race needed/);
    assert.match(page,/Early-race pace/);
    assert.doesNotMatch(page,/>Target time</);
    assert.doesNotMatch(page,/HISTORY RESULT/,'History output must not leak into all-mode results');
  }
  const temperature=start.initial.weather.find(group=>group.lower_c===5);
  assert.equal(allFinisherGroupLabel(temperature,'weather','mi'),'41°F to below 50°F');
  assert.equal(allFinisherGroupLabel(temperature,'weather','km'),'5°C to below 10°C');
  assert.equal(earlyPaceLabel(start.early_pace_bands[1],'mi'),'Faster than 7:15/mi');
  assert.equal(earlyPaceLabel(start.early_pace_bands[1],'km'),'Faster than 4:30/km');
  const sparse={...start.initial.courses[0],detected_n:7,onset_n:null,onset_pct:null};
  assert.equal(allFinisherCharts([sparse],sparse,undefined,'courses','mi').onset,null);
  assert.match(render(AllFinisherResults,{groups:[sparse],kind:'courses',start,units:'mi',focus:sparse}),/Too few detected slowdowns/);
  for(const slug of ['course-comparison','race-day-weather','downhill-start']) {
    const html=render(AnalysisPage,{params:{slug}});
    assert.match(html,/All eligible finishes/);assert.match(html,/No previous race needed/);assert.match(html,/3,517,336/);
  }
  for(const id of [...Object.keys(BROADER_ARCHIVE),'rn3_heat_curves','ext_weather_pacing_patterns']) {
    const html=render(PackPage,{params:{packId:id}});
    assert.match(html,/All eligible finishes/);assert.match(html,/No previous race needed/);
    if(id==='r02_recover_slow_start') assert.match(html,/<option value="slow5" selected="">/);
    if(id==='r34_pacing_risk_reward') assert.match(html,/<option value="steady" selected="">/);
  }
  assert.match(render(AnalysisPage,{params:{slug:'finding-improvement'}}),/This comparison requires earlier results/);
  assert.match(render(MethodologyPage,{}),/id="all-finisher-context"/);
  const originalFetch=global.fetch;let served=bytes,status=200;const calls=[];
  global.fetch=async(url,options)=>{calls.push({url,signal:options.signal});return new Response(served,{status});};
  const descriptor=raw=>({...start,bytes:raw.length,sha256:crypto.createHash('sha256').update(raw).digest('hex')});
  const signal=new AbortController().signal;
  try {
    status=503;await assert.rejects(()=>loadAllFinisherContext(start,signal),/could not load/);status=200;
    served=Buffer.from(bytes);served[0]=32;await assert.rejects(()=>loadAllFinisherContext(start,signal),/changed/);
    for(const altered of [{release_tag:'wrong'},{mode:'history'},{runner_manifest_sha256:'wrong'},{context_manifest_sha256:'wrong'},{analysis_n:0}]) {
      served=Buffer.from(JSON.stringify({...evidence,...altered}));await assert.rejects(()=>loadAllFinisherContext(descriptor(served),signal),/verified/);
    }
    served=bytes;const loaded=await loadAllFinisherContext(start,signal);assert.equal(loaded.analysis_n,3517336);
    assert.ok(calls.at(-1).url.endsWith('?v='+start.sha256));assert.equal(calls.at(-1).signal,signal);
    const before=calls.length;await loadAllFinisherContext(start,signal);assert.equal(calls.length,before);
    const aborted=new AbortController();aborted.abort();await assert.rejects(()=>loadAllFinisherContext(start,aborted.signal),/Aborted/);
  } finally {global.fetch=originalFetch;}
  console.log('All-finisher client checks passed: exact filters and URL modes, balanced rates versus pooled onset denominators, per-edition semantics, mi/km and temperature display, sparse states, primary/archive route coverage, source-bound loading and errors.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
