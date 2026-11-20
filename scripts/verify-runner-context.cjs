const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto'), zlib = require('node:zlib');
const Module = require('node:module'), ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const resolve = Module._resolveFilename;
Module._resolveFilename = function(request, ...args) { return resolve.call(this, request.startsWith('@/') ? path.join(__dirname, '..', request.slice(2)) : request, ...args); };
const { validateContextManifest, validateEditionContext, runnerAgeBand, runnerGender, pacePeerKey } = require('../lib/runner-context.ts');
const root = path.resolve(__dirname, '..'), args = process.argv.slice(2);
assert.ok(args.length === 0 || args.length === 2 && args[0] === '--data-root');
const folder = args.length ? path.resolve(args[1]) : path.join(root, 'public/data/runner-context');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
// The context binds the marathon cohort (analysis/marathon-cohort, read through scripts/lib/cohort.cjs) since November 14,
// 2026, not the runner lookup: `runners` below is the cohort manifest, checked against the pin and the checkout's scripts.
// `runner_manifest_sha256` keeps its name and holds the cohort manifest's digest, as `cohort_manifest_sha256` says.
const cohort = require('./lib/cohort.cjs');
const { manifest: runners, sha256: runnerManifestSha } = cohort.verifiedManifest(read(path.join(root, 'analysis/release.json')));
const manifest = validateContextManifest(read(path.join(folder, 'manifest.json')), runners, runnerManifestSha);
assert.equal(manifest.runner_manifest_sha256, runnerManifestSha);
assert.equal(manifest.cohort_manifest_sha256, runnerManifestSha, 'The context names the cohort manifest it was built on');
assert.equal(manifest.input_asset_sha256, runners.input_asset_sha256);
assert.equal(manifest.input_manifest_sha256, runners.input_manifest_sha256);
assert.deepEqual(manifest.cohort, runners.cohort);
assert.deepEqual(manifest.source_quality, runners.source_quality);
const scripts = ['build_runner_context.py','runner_peers.py','runner_environment.py','build_pacing.py','build_weather.py','source_quality.py'];
assert.deepEqual(Object.keys(manifest.scripts).sort(), [...scripts].sort());
for (const file of scripts) assert.equal(manifest.scripts[file], hash(fs.readFileSync(path.join(root, 'analysis', file))), `Stale calculation: ${file}`);
assert.deepEqual(Object.keys(manifest.input_files).sort(), ['race_records.parquet','race_conditions.parquet','course_profiles.parquet','course_segments.parquet'].sort());
for (const value of Object.values(manifest.input_files)) assert.match(value, /^[a-f0-9]{64}$/);
const near = (a,b,label) => assert.ok(Number.isFinite(a) && Math.abs(a-b) < 1e-8, `${label}: ${a} != ${b}`);
const nullable = (x, min, max) => x === null || Number.isFinite(x) && x >= min && x <= max;
let groups = 0, paceCells = 0, cdfCells = 0, weather = 0, terrain = 0;
const contexts = [], expectedGroups = [], seen = [], coverage = [], allCells = [];
for (let i = 0; i < runners.editions.length; i++) {
  // An edition has a file when the cohort counts it and it has a peer group, a weather row or a route profile.
  expectedGroups[i] = new Map(); seen[i] = {}; coverage[i] = {eligible:0, age:0, gender:0};
  const meta = manifest.editions[String(i)];
  if (!meta) { contexts[i] = null; continue; }
  assert.equal(runners.editions[i].use, 'counted', 'Only an edition the cohort counts has a context file');
  const bytes = fs.readFileSync(path.join(folder, meta.file));
  assert.equal(bytes.length, meta.bytes); assert.equal(hash(bytes), meta.sha256);
  const data = validateEditionContext(JSON.parse(zlib.gunzipSync(bytes)), i, runners);
  contexts[i] = data;
  assert.ok(Object.keys(data.groups).length || data.weather || data.terrain, 'A context file has a peer group, a weather row or a route profile');
  for (const [key, group] of Object.entries(data.groups)) {
    groups++; cdfCells += group.finish.length; seen[i][key] = new Uint32Array(group.finish.length);
    for (const [band, p] of Object.entries(group.pace)) {
      paceCells++; assert.equal(p.n, group.finish.filter(([t]) => t >= p.from_sec && t < p.to_sec).reduce((sum,[,n])=>sum+n,0), 'Pace group must equal its CDF interval');
      allCells.push({ edition:i, group:key, band, n:p.n });
    }
    const expectedBands = new Map();
    for (const [t,n] of group.finish) { const band = pacePeerKey(t); expectedBands.set(band,(expectedBands.get(band)||0)+n); }
    assert.deepEqual(Object.keys(group.pace).sort(), [...expectedBands].filter(([,n])=>n>=101).map(([key])=>key).sort(), 'Every adequately sized pace group is available');
  }
  assert.equal(data.weather === null, typeof data.weather_reason === 'string');
  assert.equal(data.terrain === null, typeof data.terrain_reason === 'string');
  if (data.weather) {
    weather++; const w=data.weather;
    assert.equal(Number(w.date.slice(0,4)), data.edition.year); assert.ok(w.source_url.startsWith('https://archive-api.open-meteo.com/'));
    assert.equal(w.hours.length,5); near(w.hours.at(-1).temp_c-w.hours[0].temp_c,w.warming_c,'Temperature rise');
    near(w.temp_c,w.hours[0].temp_c,'Start temperature'); near(w.humidity_pct,w.hours[0].humidity_pct,'Start humidity'); near(w.wind_mps,w.hours[0].wind_mps,'Start wind');
    assert.ok(w.notes.length && w.context_label && w.precipitation_note);
    for (const h of w.hours) { assert.ok(nullable(h.temp_c,-60,60)&&h.temp_c!==null&&nullable(h.humidity_pct,0,100)&&nullable(h.wind_mps,0,100)&&nullable(h.precip_mm,0,500)); }
    assert.ok(nullable(w.feels_like_c,-80,80)&&nullable(w.wind_dir_deg,0,360)&&nullable(w.cloud_pct,0,100)&&nullable(w.pressure_hpa,800,1100));
  }
  if (data.terrain) {
    terrain++; const t=data.terrain;
    assert.equal(t.historical_validity_known,false);
    // A supplied validity interval (Warsaw's starts in 2019) must contain the edition year; otherwise no route is attached.
    assert.ok(t.valid_from_year===null || (Number.isInteger(t.valid_from_year) && t.valid_from_year<=data.edition.year),'Route validity starts after this edition');
    assert.ok(t.valid_to_year===null || (Number.isInteger(t.valid_to_year) && t.valid_to_year>=data.edition.year),'Route validity ended before this edition');
    assert.ok(t.context_label && t.aggregation_method && t.notes.length); assert.equal(t.sections.length,9);
    const points=[0,5,10,15,20,25,30,35,40,42.195];
    for(let k=0;k<9;k++){ const s=t.sections[k]; near(s.start_km,points[k],'Section start');near(s.end_km,points[k+1],'Section end');assert.ok(nullable(s.gain_m,0,5000)&&s.gain_m!==null&&nullable(s.loss_m,0,5000)&&s.loss_m!==null&&nullable(s.net_m,-5000,5000)&&s.net_m!==null); }
    for(const key of ['gain_m','loss_m','net_m']) near(t[key],t.sections.reduce((sum,s)=>sum+s[key],0),'Section total '+key);
    assert.ok(Number.isFinite(t.profile_distance_km) && t.profile_distance_km>40 && t.profile_distance_km<45); near(t.segment_span_km,42.195,'Nominal timing-grid span');
  }
}
// Independently recount every published CDF from the cohort's counted records, read with the shared Node reader
// (each file is checked against the cohort manifest as it is read). Keep a bounded representative sample to
// recompute pacing quartiles.
const selectedCells=[];
for(let i=0;i<Math.min(16,allCells.length);i++) selectedCells.push(allCells[Math.floor(i*allCells.length/Math.min(16,allCells.length))]);
const samples=new Map(selectedCells.map(c=>[`${c.edition}/${c.group}/${c.band}`, { ...c, values:Array.from({length:10},()=>[]) }]));
let eligible=0;
cohort.forEachEdition((edition, entry, i) => {
  if (entry.use !== 'counted') return;
  for (let r = 0; r < edition.ids.length; r++) {
    eligible++;const times=edition.times[r], age=runnerAgeBand(edition.age[r]),gender=runnerGender(edition.sex[r]),finish=Math.round(times[8]*1000)/1000;
    coverage[i].eligible++;if(age)coverage[i].age++;if(gender)coverage[i].gender++;
    const keys=['all',...(gender?[`gender:${gender}`]:[]),...(age?[`age:${age}`]:[]),...(age&&gender?[`age_gender:${age}:${gender}`]:[])];
    for(const key of keys){
      expectedGroups[i].set(key,(expectedGroups[i].get(key)||0)+1);
      const group=contexts[i]?.groups[key];if(!group)continue;
      let lo=0,hi=group.finish.length;
      while(lo<hi){const mid=(lo+hi)>>1;if(group.finish[mid][0]<finish)lo=mid+1;else hi=mid;}
      assert.equal(group.finish[lo]?.[0],finish,'Every eligible finish appears in the correct exact CDF');seen[i][key][lo]++;
      const sample=samples.get(`${i}/${key}/${pacePeerKey(finish)}`);
      if(sample){let prevTime=0,prevKm=0;const points=[5,10,15,20,25,30,35,40,42.195];for(let k=0;k<9;k++){sample.values[k].push((times[k]-prevTime)/(points[k]-prevKm));prevTime=times[k];prevKm=points[k];}sample.values[9].push(100*((times[8]-times[5])/12.195/((times[3]-times[0])/15)-1));}
    }
  }
});
assert.equal(eligible,manifest.cohort.eligible);
let withFile = 0;
const without = [];
for(let i=0;i<contexts.length;i++){
  const data=contexts[i], entry=runners.editions[i];
  const adequate=[...expectedGroups[i]].filter(([,n])=>n>=101).map(([key])=>key).sort();
  if(!data){
    // No file: an own-record edition, or a counted edition with no peer group (and, by the builder, no weather row or route).
    if(entry.use==='counted'){assert.deepEqual(adequate,[],`${entry.city} ${entry.year}: an edition with a peer group has no context file`);without.push({index:i,city:entry.city,year:entry.year,race:entry.race,eligible_n:coverage[i].eligible});}
    continue;
  }
  withFile+=coverage[i].eligible;
  assert.deepEqual(coverage[i],{eligible:data.eligible_n,age:data.age_n,gender:data.gender_n});
  assert.deepEqual(Object.keys(data.groups).sort(),adequate);
  for(const [key,group]of Object.entries(data.groups)){assert.equal(group.n,expectedGroups[i].get(key));for(let k=0;k<group.finish.length;k++)assert.equal(seen[i][key][k],group.finish[k][1],'Exact finish CDF recount');}
}
assert.deepEqual(manifest.editions_without_context,without,'The counted editions without a file are those with nothing to compare');
assert.equal(manifest.counted_editions,runners.editions.filter(e=>e.use==='counted').length);
assert.equal(withFile+without.reduce((sum,e)=>sum+e.eligible_n,0),manifest.cohort.eligible,'Every counted finish is in an edition with a file or one listed without');
const quantile=(values,q)=>{const a=[...values].sort((a,b)=>a-b),index=(a.length-1)*q,lo=Math.floor(index),hi=Math.ceil(index);return a[lo]+(a[hi]-a[lo])*(index-lo);};
for(const sample of samples.values()){
  const actual=contexts[sample.edition].groups[sample.group].pace[sample.band];assert.equal(sample.values[0].length,actual.n);
  for(const [key,q]of [['q25',.25],['median',.5],['q75',.75]]){for(let k=0;k<9;k++)near(actual[key][k],quantile(sample.values[k],q),'Independent section quartile');near(actual.late_change[key],quantile(sample.values[9],q),'Independent late-change quartile');}
}
assert.deepEqual(manifest.totals,{eligible:withFile,groups,pace_cells:paceCells,cdf_cells:cdfCells,weather_editions:weather,terrain_editions:terrain});
console.log(`Verified runner context: ${eligible.toLocaleString('en-US')} eligible finishes recounted across every exact CDF; ${groups} peer groups, ${paceCells} pace groups, ${samples.size} independently recomputed quartile samples; ${weather} weather and ${terrain} terrain edition contexts.`);
