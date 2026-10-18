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
const { default: MethodologyPage } = require('../app/methodology/page.tsx');
const start = getAllFinisherContextStart();
const bytes = fs.readFileSync(path.join(__dirname, '../public/data/all-finisher-context/evidence.json'));
const evidence = JSON.parse(bytes);
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
// The adopted runner lookup sets the expected cohort (3,871,767 finishes and 287 editions under 1652; 3,517,336 and 256 under 0934).
const runners = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/data/runners/manifest.json'), 'utf8'));
const eligibleText = new RegExp(runners.eligible_records.toLocaleString('en-US'));
// Method, definitions, coverage and source text belong on /methodology only (owner request, 2026-10-16).
const METHOD_COPY = [/What this can tell you/, /Definitions, coverage and limits/, /Download the analysis data/, /Open the source data/, /Study methods/,
  /journals\.plos\.org/, /\d[\d,]* eligible finishes/, /Included courses and race years/, /equal weight/, /historical route validity/i, /[Ss]upplied net/,
  /Modeled start-hour/, /not a ranking of course difficulty/, /at least \d[\d,]* (?:eligible |detected )?finishes/, /This earlier-result view always requires/,
  /Exact filters, no earlier result required/, /This view starts with/, /calculated reference/, /pools those finishes/, /We do not substitute a broader group/];
const noMethodCopy = (html, where) => { for (const pattern of METHOD_COPY) assert.doesNotMatch(html, pattern, `${where}: method or source copy belongs on /methodology (${pattern})`); };
const { ALL_FINISHER_DEFAULT, readAllFinisherSelection, allFinisherSearch, allFinisherRow, allFinisherGroups, allFinisherGroupLabel, allFinisherCharts, earlyPaceLabel, loadAllFinisherContext } = helpers;
async function main() {
  assert.equal(start.analysis_n, runners.eligible_records);
  assert.equal(start.edition_labels.length, runners.editions.length);
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
      assert.match(html,/<h2>(?:Sustained slowdown rates ranged from|The sustained slowdown rate was|Late-race pace|Late-race experiences varied most in)/,kind+': the headline states the spread across groups');
      if(charts.onset) assert.match(html,/<a href="\/methodology#sustained-slowdown">sustained slowdowns<\/a> most often began in the /,kind+': the onset section states where slowdowns most often began and links the term');
      noMethodCopy(html,`${kind} results (${units})`);
      assert.match(html,units==='mi'?/12\.43 mi/:/20 km/);
      assert.doesNotMatch(html,/private-export-|20260912|htw-db-|20261016/);
      if(kind==='race-day') {
        assert.match(html,/Slowdown rate in this edition/);
        assert.doesNotMatch(html,/Mean edition slowdown rate|across 3 editions/);
        assert.match(html,/Start-hour temperature(?:: | is unavailable)/);
        // The headline speaks of the editions on the chart only: the one followed and its comparison line.
        const headlineText=html.match(/<h2>([^<]*)<\/h2>/)[1];
        const shown=new Set([focus.id,...(comparison?[comparison.id]:[])]);
        for(const group of groups) if(!shown.has(group.id)) assert.ok(!headlineText.includes(allFinisherGroupLabel(group,kind,units).replace(/&/g,'&amp;')),`race-day headline names only shown editions, not ${group.id}`);
        const alone=render(AllFinisherResults,{groups,kind,start,units,focus});
        assert.match(alone,/<h2>The sustained slowdown rate was /,'race-day: one edition, one rate');
      }
    }
    const page=render(AllFinisherAnalysis,{kind,start,history:React.createElement('p',null,'HISTORY RESULT')});
    assert.match(page,/aria-pressed="true">All eligible finishes/);
    assert.match(page,/No previous race needed/);
    assert.match(page,/Early-race pace/);
    assert.doesNotMatch(page,/>Target time</);
    assert.doesNotMatch(page,/HISTORY RESULT/,'History output must not leak into all-mode results');
    noMethodCopy(page,`${kind} page`);
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
    assert.match(html,/All eligible finishes/);assert.match(html,/No previous race needed/);assert.doesNotMatch(html,eligibleText,'Coverage counts belong on /methodology');
  }
  // The research archive's broader views (/packs/<id>) closed with the archive (the redesign spec, section 00): each
  // address is a moved stub now, so only the analyses above render these explorers.
  assert.doesNotMatch(render(AnalysisPage,{params:{slug:'finding-improvement'}}),/This comparison requires earlier results|strictly earlier/,'Cohort notes belong on /methodology');
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
    served=bytes;const loaded=await loadAllFinisherContext(start,signal);assert.equal(loaded.analysis_n,runners.eligible_records);
    assert.ok(calls.at(-1).url.endsWith('?v='+start.sha256));assert.equal(calls.at(-1).signal,signal);
    const before=calls.length;await loadAllFinisherContext(start,signal);assert.equal(calls.length,before);
    const aborted=new AbortController();aborted.abort();await assert.rejects(()=>loadAllFinisherContext(start,aborted.signal),/Aborted/);
  } finally {global.fetch=originalFetch;}
  console.log('All-finisher client checks passed: exact filters and URL modes, balanced rates versus pooled onset denominators, per-edition semantics, mi/km and temperature display, sparse states, primary route coverage, source-bound loading and errors.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
