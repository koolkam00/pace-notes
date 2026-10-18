/*
 * The race report (/report and the runner view's report panel): lib/report.ts against the published files, read again
 * here with the split check's documented rules, and the rendered card.
 *
 * - Links: reportHref and reportLink carry the nine times, the course and (typed) the comparison group, or, from a
 *   runner record, the handoff marker and nothing else; readReportTimes reads exactly what they write.
 * - The same numbers as the split check: for sample races on every published course and recorded gender, the report's
 *   comparison is the pace band cell for G = ⌊F ÷ 60⌋ + 3 (finishes, editions, sustained-slowdown share, group medians),
 *   its pacing type the nearest weighted centroid in archetypes.json, and its opening group the starting-pace bounds,
 *   each recomputed here from the checksum-verified files rather than through lib/report.ts.
 * - Every data block carries its group label and its finishes; groups under 100 finishes never show.
 * - The card, the image's lines and its alternative text: no name, record ID, rank or percentile outside the record
 *   block (which never reaches the image or a link), no "you", the units named. Since October 16, 2026 the card holds
 *   findings only: no definition, citation or method line (they are on /methodology), "sustained slowdown" linked to
 *   its definition there and every evidence badge linked to the evidence labels.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const Module = require('node:module');
const ts = require('typescript');

for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
}).outputText, filename);
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  return resolveFilename.call(this, request.startsWith('@/') ? path.join(__dirname, '..', request.slice(2)) : request, ...args);
};
const ROOT = path.join(__dirname, '..');
process.chdir(ROOT);

const report = require('../lib/report.ts');
const { approxWords } = require('../lib/nuggets/format.ts');
const { capitalize } = require('../lib/nuggets/build.ts');
const links = require('../lib/tools/links.ts');
const splits = require('../lib/tools/splits.ts');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { ReportCard, EVIDENCE_HREF, SLOWDOWN_HREF } = require('../components/report/RaceReport.tsx');
/** Method copy the card no longer carries (October 16, 2026: it is on /methodology). */
const METHOD_COPY = /doi:|Published slowdown method|by the published definition|Calculated from|Source:|Higher means|ties count halfway|the starting-pace analysis|nearest of six|an observed share|Editions are pooled|chosen by how their races ended|modell?ed weather|personal exposure|supplied|historical validity|not an adjustment|25% slower|dashed line/i;
const badgeLink = (kind, label) => new RegExp(`<a\\b(?=[^>]*class="race-report-badge is-${kind}")(?=[^>]*href="${EVIDENCE_HREF}")[^>]*>${label}</a>`);
assert.equal(EVIDENCE_HREF, '/methodology#evidence'); assert.equal(SLOWDOWN_HREF, '/methodology#sustained-slowdown');
let checks = 0;
const ok = (n = 1) => { checks += n; };
const started = Date.now();

const INSIGHTS = path.join(ROOT, 'public/data/insights');
const manifest = JSON.parse(fs.readFileSync(path.join(INSIGHTS, 'manifest.json'), 'utf8'));
/** An insights file, read only when its bytes match the SHA-256 the manifest (or an index) lists. */
const verified = (name, sha) => {
  const bytes = fs.readFileSync(path.join(INSIGHTS, name));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), sha, `${name} matches its listed SHA-256`);
  return JSON.parse(bytes.toString());
};

// ---------- Links ----------
const EXAMPLE = [1550, 3144, 4746, 6354, 7998, 9761, 11799, 13752, 14611];
assert.equal(links.reportHref(EXAMPLE, 'New York'), '/report?s=0:25:50,0:52:24,1:19:06,1:45:54,2:13:18,2:42:41,3:16:39,3:49:12,4:03:31&course=new-york');
assert.equal(links.reportHref(EXAMPLE), '/report?s=0:25:50,0:52:24,1:19:06,1:45:54,2:13:18,2:42:41,3:16:39,3:49:12,4:03:31');
assert.equal(links.reportHref([1500, 3000]), null);
assert.equal(report.reportLink(EXAMPLE, 'Berlin', 'women', false), '/report?s=0:25:50,0:52:24,1:19:06,1:45:54,2:13:18,2:42:41,3:16:39,3:49:12,4:03:31&course=berlin&g=women', 'A typed report keeps the comparison group');
const fromRecord = new URL(report.reportLink(EXAMPLE, 'Berlin', 'women', true), 'https://splithappens.run');
assert.deepEqual([...fromRecord.searchParams.keys()], ['s', 'course', 'via'], 'A link from a runner record carries s, course and via only (never g)');
assert.equal(fromRecord.searchParams.get('via'), 'runner');
assert.deepEqual(report.readReportTimes(new URL(links.reportHref(EXAMPLE), 'https://splithappens.run').searchParams.get('s')), EXAMPLE, 'readReportTimes reads what reportHref writes');
// Record times can carry milliseconds; the link and the report use the whole second, as the split-check link does.
assert.deepEqual(report.readReportTimes(new URL(links.reportHref(EXAMPLE.map((t) => t + 0.4)), 'https://splithappens.run').searchParams.get('s')), EXAMPLE);
for (const bad of [null, '', '0:25:50', EXAMPLE.slice(0, 8).map((t) => links.reportHref([...EXAMPLE]) && t).join(','), '0:25:50,0:52:24,1:19:06,1:45:54,2:13:18,2:42:41,3:16:39,3:49:12,4:03:31,4:10:00',
  '0:25:50,0:52:24,1:19:06,1:45:54,2:13:18,2:42:41,3:16:39,3:49:12,3:49:00', '25:50,0:52:24,1:19:06,1:45:54,2:13:18,2:42:41,3:16:39,3:49:12,4:03:31', '0:25:50,0:52:24,1:19:06,1:45:54,2:13:18,2:42:41,3:16:39,3:49:12,4:03:3x',
  '0:05:50,0:52:24,1:19:06,1:45:54,2:13:18,2:42:41,3:16:39,3:49:12,4:03:31']) assert.equal(report.readReportTimes(bad), null, `not a report: ${bad}`);
for (const [g, want] of [['men', 'men'], ['women', 'women'], ['all', 'all'], ['Women', 'all'], [null, 'all'], ['x', 'all']]) assert.equal(report.readReportGender(g), want);
ok(19);

// ---------- The published files ----------
const INDEX = 'tools/pace-band.json';
const index = verified(INDEX, manifest.files[INDEX].sha256);
const archetypes = verified('archetypes.json', manifest.files['archetypes.json'].sha256);
const { openingGroups, typeCohort } = require('../lib/split-check-server.ts');
const bands = openingGroups().bands;
const cohort = typeCohort(index);
assert.equal(bands.length, 6, 'the six opening groups of the starting-pace analysis');
assert.ok(cohort && cohort.n === archetypes.cohort_n, 'the pacing-type cohort');
ok(2);

/** The pace band cell for minute G, read straight from a shard (the split check's rule). */
function expectedCell(shard, group, minute) {
  const g = shard.groups[group];
  const i = g ? g.g.indexOf(minute) : -1;
  return i < 0 ? null : { n: g.n[i], ed: g.ed[i], at20: g.e50[i][3], finish: g.e50[i][8], sd: g.sd ? g.sd[i] : undefined };
}
/** Nearest weighted, clipped centroid of the race's own relative paces (the pacing-types story's classifier). */
function expectedType(times) {
  const c = archetypes.classifier;
  const avg = times[8] / 42.195;
  const rel = times.map((t, i) => 100 * ((t - (i ? times[i - 1] : 0)) / c.section_km[i] / avg - 1));
  const x = rel.map((v, i) => Math.min(c.clip_hi[i], Math.max(c.clip_lo[i], v)) * c.weights[i]);
  const d = c.centroids.map((cent) => cent.reduce((s, cv, i) => s + (x[i] - cv) ** 2, 0));
  return c.names[d.indexOf(Math.min(...d))];
}
function expectedBand(times) {
  const pct = 100 * ((times[0] / 5) / ((times[3] - times[0]) / 15) - 1);
  return bands.find((b) => (b.lower === null || (b.lower_inclusive ? pct >= b.lower - 1e-8 : pct > b.lower + 1e-8)) && (b.upper === null || (b.upper_inclusive ? pct <= b.upper + 1e-8 : pct < b.upper - 1e-8)))?.id ?? null;
}
/** A race of about `finish` seconds: an opening `open` and a late fade `fade` (fractions), on the 5 km grid. */
function race(finish, open = 0, fade = 0) {
  const base = finish / 42.195;
  const paces = [base * (1 + open), base, base, base, base, base * (1 + fade / 2), base * (1 + fade), base * (1 + fade), base * (1 + fade)];
  const scale = finish / paces.reduce((s, p, i) => s + p * splits.SECTION_KM[i], 0);
  let t = 0;
  return paces.map((p, i) => Math.round((t += p * scale * splits.SECTION_KM[i])));
}

// ---------- The report's numbers against the files ----------
const shardCache = new Map();
const shardOf = (file) => { if (!shardCache.has(file)) shardCache.set(file, verified(file, index.shards[file])); return shardCache.get(file); };
const samples = [EXAMPLE, race(3 * 3600 + 7 * 60, -0.03, 0.02), race(3 * 3600 + 34 * 60 + 12, 0.01, 0.3), race(4 * 3600 + 21 * 60 + 40, -0.08, 0.35), race(5 * 3600 + 2 * 60, 0, 0.1), race(2 * 3600 + 31 * 60, -0.01, 0), race(6 * 3600 + 40 * 60, -0.06, 0.4)];
let compared = 0, unpublished = 0, shown = 0;
for (const scope of index.scopes) {
  for (const gender of ['all', 'men', 'women']) {
    for (const times of samples) {
      assert.equal(splits.validateSplits(times), null, 'a valid sample race');
      const file = `tools/pace-band/${scope.slug}/${gender}.json`;
      const path_ = report.reportShardPath(index, scope.slug, gender, times[8]);
      const minute = Math.floor(times[8] / 60) + 3;
      const inRange = minute >= index.goals[0] && minute <= index.goals[1];
      const listed = Boolean(scope.genders[gender] && index.shards[file]);
      assert.equal(path_, inRange && listed ? file : null, `${scope.slug}/${gender}: the shard the report needs`);
      const model = report.buildReport({
        times, race: { city: scope.city }, openingBands: bands, types: { data: archetypes, error: null, cohort },
        comparison: { index, indexError: null, course: scope.slug, gender, shard: path_ ? { path: path_, data: shardOf(path_), error: null } : null },
      });
      // Calculated from the times: the split check's own reading.
      const reading = splits.readSplits(times);
      assert.equal(model.finish, times[8]); assert.equal(model.slowdown.yes, reading.slowdown); assert.equal(model.slowdown.onsetKm, reading.onsetKm);
      assert.ok(Math.abs(model.baseline - (times[3] - times[0]) / 15) < 1e-9, 'the 5–20 km pace');
      assert.equal(model.sections.length, 9); assert.ok(Math.abs(model.sections[8].endKm - 42.195) < 1e-9);
      assert.equal(model.opening.band?.id ?? null, expectedBand(times), 'the opening group');
      assert.equal(model.type.state, 'ok'); assert.equal(model.type.name, expectedType(times), 'the pacing type');
      const arch = archetypes.archetypes.find((a) => a.name === model.type.name);
      assert.equal(model.type.n, arch.n); assert.equal(model.type.cohortN, archetypes.cohort_n); assert.equal(model.type.label, 'complete finishes'); // the cohort is named on /methodology#pacing-types, not on the report
      const c = model.comparison;
      if (!path_) { assert.equal(c.state, 'unavailable', `${scope.slug}/${gender} ${times[8]}: nothing published`); unpublished += 1; continue; }
      const all = expectedCell(shardOf(path_), 'all', minute);
      if (!all) { assert.equal(c.state, 'unavailable', 'fewer than 100 finishes in the window'); unpublished += 1; continue; }
      assert.equal(c.state, 'ok');
      assert.ok(all.n >= 100, 'a published window has 100 finishes');
      assert.equal(c.n, all.n); assert.equal(c.ed, all.ed); assert.equal(c.lo, minute * 60 - (shardOf(path_).window_s || 300)); assert.equal(c.hi, minute * 60 - 1);
      assert.ok(c.lo <= times[8] - 120 && c.hi >= times[8] + 119, 'the window holds the finish with two minutes on each side');
      const held = expectedCell(shardOf(path_), 'held', minute), slow = expectedCell(shardOf(path_), 'slowdown', minute);
      assert.equal(c.slowdownShare, all.sd ?? (slow ? slow.n / all.n : null), 'the sustained-slowdown share');
      const want = held || slow ? [held && ['held', held], slow && ['slowdown', slow]].filter(Boolean) : [['all', all]];
      assert.deepEqual(c.groups.map((g) => [g.key, g.n, g.ed, g.at20, g.finish]), want.map(([key, cell]) => [key, cell.n, cell.ed, cell.at20, cell.finish]), 'the groups shown, each with 100 finishes');
      for (const g of c.groups) assert.ok(g.n >= 100, 'no group under 100 finishes');
      assert.match(c.label, scope.slug === 'all' ? / on all courses/ : new RegExp(` in ${scope.city}`)); if (gender !== 'all') assert.match(c.label, new RegExp(`recorded as ${gender}$`));
      compared += 1;
      // The card shows each data block with its label and finishes; no "you", no record, no method copy.
      if (shown < 40) {
        for (const units of ['mi', 'km']) {
          const html = renderToStaticMarkup(React.createElement(ReportCard, { id: 'r', model, units, level: 1, gender, dropped: null, retryComparison: () => {}, retryType: () => {} }));
          const text = html.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, '\'').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
          assert.ok(text.includes(`${c.n.toLocaleString('en-US')} ${c.label}`), 'the comparison names its finishes and its group');
          for (const g of c.groups) assert.ok(text.includes(`${g.name} ${g.n.toLocaleString('en-US')}`), `${g.name}: its finishes`);
          assert.ok(text.includes(`${capitalize(approxWords(model.type.share))} of ${archetypes.cohort_n.toLocaleString('en-US')} finishes were ${model.type.name.toLowerCase()}s`), 'the pacing type names its finishes and its share, in words');
          assert.ok(!text.includes('doi:10.1371/journal.pone.0251513') && !text.includes(splits.SLOWDOWN_DEFINITION), 'no definition or citation on the card');
          assert.doesNotMatch(text, METHOD_COPY, 'no method line on the card');
          assert.match(html, new RegExp(`<a\\b[^>]*href="${SLOWDOWN_HREF}"[^>]*>sustained slowdown</a>`), 'the term links to its definition');
          assert.equal((html.match(/class="race-report-badge /g) || []).length, (html.match(/<a\b[^>]*class="race-report-badge /g) || []).length, 'every badge is a link');
          assert.match(html, badgeLink('data', 'Pace Notes data'));
          assert.equal((html.match(/class="race-report-badge is-data"/g) || []).length, 1, 'one Pace Notes data badge, in the foot');
          assert.match(html, new RegExp(`<footer class="race-report-foot">${badgeLink('data', 'Pace Notes data').source}`), 'the data badge sits in the foot');
          assert.doesNotMatch(text, /\byou\b|\byour\b|the wall|arithmetic|percentile|\brank\b|\brecord\b/i, 'the report says "this race", and holds no rank, percentile or record');
          assert.match(text, units === 'mi' ? /\/mi\b/ : /\/km\b/); assert.doesNotMatch(text, units === 'mi' ? /\d\/km\b/ : /\d\/mi\b/, 'paces in the units shown');
          assert.equal((html.match(/<h1\b/g) || []).length, 1, 'one title');
          const lines = report.reportLines(model, units);
          const alt = report.reportImageAlt(model, units);
          assert.ok(alt.includes(lines.finish) && lines.sections.every((s) => alt.includes(`${s.label} ${s.pace}`)) && alt.includes(lines.slowdown), 'the alternative text holds the image\'s numbers');
          assert.ok(alt.includes(`${report.REPORT_DATA_LABEL}. ${lines.type}.`) && alt.indexOf(report.REPORT_DATA_LABEL) > alt.indexOf(lines.slowdown) && alt.split(report.REPORT_DATA_LABEL).length === 2, 'the alternative text labels the data lines, once, after the calculations and the reading');
          assert.match(html, new RegExp(`<span>Sustained slowdown</span><strong>(?:Yes|No)</strong>(?:<small>from [^<]*</small>)?${badgeLink('research', 'Published research').source}`), 'the slowdown tile carries the Published research badge, linked to the evidence labels');
          assert.ok(lines.comparison.includes(c.n.toLocaleString('en-US')) && lines.comparison.includes(c.label), 'the image\'s comparison line names its finishes and group');
          assert.doesNotMatch(JSON.stringify(lines), /percentile|\brank\b|\brecord\b|\byou\b/i, 'the image holds no rank, percentile or record');
          ok(9);
        }
        shown += 1;
      }
      ok(18);
    }
  }
}
assert.ok(compared > 200 && unpublished > 0, `windows compared (${compared}) and unpublished ones (${unpublished}) both checked`);
ok();

// ---------- Loading, failures and the runner record ----------
{
  const base = { times: EXAMPLE, race: { city: null }, openingBands: bands, types: { data: null, error: null, cohort } };
  const loading = report.buildReport({ ...base, comparison: { index: null, indexError: null, course: 'all', gender: 'all', shard: null } });
  assert.equal(loading.comparison.state, 'loading'); assert.equal(loading.type.state, 'loading'); assert.equal(loading.record, null);
  const failed = report.buildReport({ ...base, types: { data: null, error: 'This data could not be verified.', cohort }, comparison: { index: null, indexError: 'This data could not be loaded.', course: 'all', gender: 'all', shard: null } });
  assert.equal(failed.comparison.state, 'off'); assert.equal(failed.type.state, 'off');
  assert.doesNotMatch(report.reportImageAlt(failed, 'mi'), new RegExp(report.REPORT_DATA_LABEL), 'without data lines, the alternative text has no data label');
  // A course the comparison does not publish (a runner page can link any race) falls back to all courses.
  assert.deepEqual(report.reportScope(index, 'not-a-course').scope.slug, 'all'); assert.equal(report.reportScope(index, 'not-a-course').dropped, true);
  assert.equal(report.reportScope(index, 'all').dropped, false);
  // A slug that names an inherited key is no course (it threw while rendering: `course=constructor`), nor is an unknown one.
  for (const slug of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'not-a-course']) assert.equal(report.reportCourseCity({ boston: 'Boston' }, slug), null, `course=${slug} is no course`);
  assert.equal(report.reportCourseCity({ boston: 'Boston' }, 'boston'), 'Boston');
  for (const source of ['components/report/RaceReport.tsx', 'components/report/ReportView.tsx']) assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '..', source), 'utf8'), /data\.courses\[/, `${source} looks a course up by its own keys only (reportCourseCity)`);
  // An unknown course in the link is never echoed into the card.
  assert.match(fs.readFileSync(path.join(__dirname, '../components/report/RaceReport.tsx'), 'utf8'), /city \?\? 'The course in this link'/, 'the dropped-course note never repeats the link\'s slug');
  const sample = { comparisons: { all: { key: 'all', label: 'All eligible finishers', n: 5000, other_n: 4999, rank: 1200, ties: 2, percentile: 76.0, median_finish: 15000, pace: { n: 420, from_sec: 14850, to_sec: 15750, q25: [], median: [], q75: [], late_change: { q25: 4, median: 9.5, q75: 16 } } }, gender: null, age: null, age_gender: null },
    weather: { temp_c: 11.5, humidity_pct: 70, wind_mps: 3, scheduled_start: '09:15' }, weather_reason: null, terrain: { gain_m: 120.4 }, terrain_reason: null };
  const recorded = report.buildReport({ ...base, types: { data: archetypes, error: null, cohort }, comparison: { index, indexError: null, course: 'all', gender: 'all', shard: null },
    record: { edition: { city: 'Lakeside', year: 2021 }, context: sample, error: null, lateChange: 12.3 } });
  assert.equal(recorded.race, 'Lakeside 2021'); assert.equal(recorded.record.state, 'ok');
  assert.deepEqual([recorded.record.placement.n, recorded.record.placement.otherN, recorded.record.placement.rank, recorded.record.late.n, recorded.record.late.median, recorded.record.late.race], [5000, 4999, 1200, 420, 9.5, 12.3]);
  assert.equal(recorded.record.placement.label, 'finishes in Lakeside 2021'); assert.match(recorded.record.late.label, /^finishes from 4:07:30 to under 4:22:30 in Lakeside 2021$/);
  const html = renderToStaticMarkup(React.createElement(ReportCard, { id: 'r', model: recorded, units: 'mi', level: 3, gender: 'all', dropped: null, retryComparison: () => {}, retryType: () => {} }));
  assert.match(html, /<h3 class="race-report-title"/); assert.doesNotMatch(html, /<h1\b/);
  assert.match(html, /Ahead of <em>76 in every 100<\/em> other finishes in Lakeside 2021\./); assert.doesNotMatch(html, /4,999/, 'the placement carries no count: it would stand beside the comparison\'s different one'); assert.match(html, /not an official placing/);
  assert.doesNotMatch(html.replace(/<[^>]+>/g, ' '), METHOD_COPY, 'no method line in the record block either');
  // The edition's lines load with the record (components/report/RecordBlock.tsx, lazily, so /report carries none of
  // their code): rendered here on their own, with the same rules.
  const RecordBlock = require('../components/report/RecordBlock.tsx').default;
  const lines = renderToStaticMarkup(React.createElement(RecordBlock, { id: 'r-record', Head: 'h4', record: recorded.record, units: 'mi' }));
  assert.match(lines, /class="race-report-block race-report-record"/); assert.match(lines, /<dl>/);
  assert.match(lines, /52\.7°F/); assert.match(lines, /395 ft/); assert.doesNotMatch(lines, /race-report-badge/, 'the foot carries the one data badge');
  assert.match(lines, /\+12\.3%<\/strong> against its 5–20K pace; similar finishes in this edition: \+9\.5%\./, 'the late change beside the edition\'s similar finishes, with no second window or count');
  assert.doesNotMatch(lines.replace(/<[^>]+>/g, ' '), METHOD_COPY, 'no method line in the edition lines either');
  assert.doesNotMatch(lines.replace(/<[^>]+>/g, ' '), /\byou\b|\byour\b|percentile|\brank\b|\brecord\b/i, 'the edition lines say "this race", and hold no rank, percentile or record');
  assert.doesNotMatch(JSON.stringify(report.reportLines(recorded, 'mi')), /4,999|1,200|\b76(?:\.0)?%|percentile|\brank\b|9\.5%|12\.3%|°|\bft\b/, 'the image never carries the record\'s placement');
  const small = report.buildReport({ ...base, comparison: { index, indexError: null, course: 'all', gender: 'all', shard: null },
    record: { edition: { city: 'Lakeside', year: 2021 }, context: { ...sample, comparisons: { all: null } , weather: null, weather_reason: 'No verified weather.', terrain: null, terrain_reason: null }, error: null, lateChange: 1 } });
  assert.ok('unavailable' in small.record.placement && 'unavailable' in small.record.late && small.record.weather.unavailable === 'Not available for this edition.' && small.record.climb.unavailable === 'Not available for this edition.', 'small or missing groups say so, with no data-screen reason (method copy)');
  ok(20);
}
assert.equal(report.REPORT_IMAGE_NAME, 'pace-notes-race-report.png'); ok();

console.log(`Race report checks passed (${checks}, ${((Date.now() - started) / 1000).toFixed(1)} s): link forms (typed with its comparison group, from a record with s, course and via only), the same window, groups, pacing type and opening group as the split check on ${compared} published windows across every course and recorded gender (${unpublished} unpublished ones say so), every data block with its finishes and cohort, no group under 100 finishes, no "you", rank, percentile or record in the card or the image, no definition, citation or method line (the term and the badges link to /methodology), and the units shown.`);
