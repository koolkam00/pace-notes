#!/usr/bin/env node
/**
 * Browser privacy checks on the static export (docs/ANALYTICS.md#browser-privacy-checks): real Chromium visits to the
 * built site, with PostHog answered by a local mock so nothing is sent anywhere, and every request, recording chunk
 * and storage write checked against the site's own privacy rules.
 *
 *   NEXT_PUBLIC_POSTHOG_KEY=phc_test_dummy NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com npm run build
 *   npm run verify:replay-e2e                         every scenario (S1–S8)
 *   npm run verify:replay-e2e -- --quick              a subset for local iteration (about a third of the work)
 *   npm run verify:replay-e2e -- --shard=1/2          one of two equal shares of the work (CI can run shards in parallel)
 *   npm run verify:replay-e2e -- --only=S3,S6         some scenarios
 *   npm run verify:replay-e2e -- --grep=projector     jobs whose name contains the text
 *   npm run verify:replay-e2e -- --workers=2          visitors at once (default 3, or 2 on a machine with 2 cores)
 *   npm run verify:replay-e2e -- --list               the jobs this shard would run, without running them
 *   npm run verify:replay-e2e -- --out <dir>          another export folder (default out/)
 *   npm run verify:replay-e2e -- --report <file>      also write the results as JSON
 *   npm run verify:replay-e2e -- --keep <dir>         save what each failed job's visitors sent and stored, one file per job
 *   npm run verify:replay-e2e -- --only=S8 --write-budget   measure the JavaScript budget into scripts/e2e/budget.json
 *
 * The build must have analytics compiled in (the dummy key above; Vercel builds production separately), or there is
 * nothing to check. Playwright's Chromium is used (`npx playwright install chromium`); PLAYWRIGHT_CHROMIUM_PATH names
 * another executable.
 *
 * Scenarios (scripts/e2e/scenarios): S1 browsing, S2 every tool and calculator with two sets of values (typed and in
 * the address), S3 the runner search journey, S4 privacy signals and blocked storage, S5 every sitemap page in emulated
 * Safari 15 and failed analytics chunks, S6 the visit signals, error pages and data failures, S7 beacons sent while a
 * page unloads, S8 the JavaScript budget.
 *
 * Every visitor (run) is checked for:
 *   I1 no host contacted but the site and the PostHog mock      I5 nothing recorded on a runner or handoff page
 *   I2 every event exactly as the allowlist lets it through      I6 no cookie; only the listed storage keys
 *   I3 recording chunks with only their nine fields, and no      I7 nothing captured after an opt-out is sent, and
 *      query, fragment, checked state, console or canvas            nothing at all with Do Not Track, GPC, a preview
 *                                                                    host or localhost
 *   I4 no typed value, runner detail, error text or junk tag     I8 no page error, crash screen or unexpected error page
 * and S2 compares its two runs (I9: scripts/e2e/known-differences.json), S8 the budget (I10: scripts/e2e/budget.json).
 */
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const option = name => { const inline = args.find(arg => arg.startsWith(name + '=')); if (inline) return inline.slice(name.length + 1); const at = args.indexOf(name); return at >= 0 ? args[at + 1] : undefined; };
const OUT = path.resolve(option('--out') || path.join(ROOT, 'out'));
const QUICK = args.includes('--quick');
const ONLY = (option('--only') || '').split(',').filter(Boolean).map(id => id.toUpperCase());
const GREP = (option('--grep') || '').toLowerCase();
const SHARD = (option('--shard') || '1/1').split('/').map(Number);
const WORKERS = Number(option('--workers') || process.env.E2E_WORKERS || (os.cpus().length <= 2 ? 2 : 3));
const REPORT = option('--report');
const KEEP = option('--keep');
const JOB_TIMEOUT_MS = 6 * 60_000;

function fail(message) { console.error(message); process.exit(1); }
if (!(SHARD.length === 2 && SHARD.every(Number.isInteger) && SHARD[0] >= 1 && SHARD[0] <= SHARD[1])) fail(`--shard must look like 1/2, not ${option('--shard')}`);
if (!(Number.isInteger(WORKERS) && WORKERS >= 1)) fail(`--workers must be a whole number from 1, not ${option('--workers') || process.env.E2E_WORKERS}`);
if (!fs.existsSync(path.join(OUT, 'index.html'))) fail(`No export in ${OUT}: run the build first (see the top of this file).`);
const chunks = path.join(OUT, '_next', 'static', 'chunks');
if (!fs.readdirSync(chunks, { recursive: true }).some(file => file.endsWith('.js') && /["']phc_\w+["']/.test(fs.readFileSync(path.join(chunks, file), 'utf8')))) {
  fail(`${OUT} was built without analytics, so there is nothing to check. Build with NEXT_PUBLIC_POSTHOG_KEY=phc_test_dummy NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com.`);
}

const { launch, Run } = require('./e2e/browser.cjs');
const inspect = require('./e2e/inspect.cjs');

const scenarios = fs.readdirSync(path.join(__dirname, 'e2e', 'scenarios')).filter(file => file.endsWith('.cjs')).sort()
  .map(file => require(path.join(__dirname, 'e2e', 'scenarios', file)))
  .filter(scenario => !ONLY.length || ONLY.includes(scenario.id));
const allJobs = scenarios.flatMap(scenario => scenario.jobs({ quick: QUICK, out: OUT, args }).map(job => ({ ...job, scenario })))
  .filter(job => !GREP || `${job.scenario.id} ${job.name}`.toLowerCase().includes(GREP));
if (!allJobs.length) fail('No job matches --only and --grep.');
// Shards: the heaviest jobs first, each to the shard with the least work so far, so every shard gets a similar share.
const loads = Array.from({ length: SHARD[1] }, () => 0);
const jobs = [];
for (const job of [...allJobs].sort((a, b) => b.weight - a.weight || (a.scenario.id + a.name).localeCompare(b.scenario.id + b.name))) {
  const shard = loads.indexOf(Math.min(...loads));
  loads[shard] += job.weight;
  if (shard === SHARD[0] - 1) jobs.push(job);
}
jobs.sort((a, b) => b.weight - a.weight);
if (args.includes('--list')) {
  for (const job of jobs) console.log(`${job.scenario.id} ${job.name} (about ${job.weight} s)`);
  console.log(`${jobs.length} of ${allJobs.length} jobs, about ${Math.round(jobs.reduce((sum, job) => sum + job.weight, 0))} s of work in shard ${SHARD.join('/')}`);
  process.exit(0);
}

const seconds = ms => (ms / 1000).toFixed(1) + ' s';

async function runJob(browser, job) {
  const started = Date.now();
  const runs = [], checks = [], notes = [];
  const h = {
    out: OUT, quick: QUICK, inspect,
    /** A new visitor (browser context); see Run in scripts/e2e/browser.cjs for the options. */
    run: async (name, options) => { const run = new Run(browser, OUT, `${job.scenario.id} ${job.name}: ${name}`, options); runs.push(run); return run.open(); },
    /** A scenario-specific check. */
    check: (label, ok, detail) => { checks.push({ label, ok: !!ok, detail: ok ? undefined : detail }); return !!ok; },
    note: text => notes.push(text),
  };
  let error = null;
  let timer;
  try {
    await Promise.race([job.run(h), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`timed out after ${seconds(JOB_TIMEOUT_MS)}`)), JOB_TIMEOUT_MS); })]);
  } catch (e) {
    error = String(e && e.stack || e).split('\n').slice(0, 3).join(' | ');
  } finally {
    clearTimeout(timer);
  }
  for (const run of runs) if (!run.end) await run.close().catch(() => {});
  const runResults = runs.map(run => ({ name: run.name, problems: inspect.invariants(run), requests: run.requests.length, posthog: run.posthogRequests().length, events: run.events().length, recording: run.rrweb().length }));
  const failed = !!error || checks.some(c => !c.ok) || runResults.some(r => Object.values(r.problems).some(p => p.length));
  if (failed && KEEP) {
    fs.mkdirSync(KEEP, { recursive: true });
    const keep = runs.map(run => ({ name: run.name, options: run.options, start: run.start, navs: run.navs, requests: run.requests, sent: run.sent, reports: run.reports, errors: run.errors, storage: run.storage, cookies: run.cookies, privacySignalAt: run.privacySignalAt }));
    fs.writeFileSync(path.join(KEEP, `${job.scenario.id}-${job.name.replace(/[^\w-]+/g, '_')}.json`), JSON.stringify(keep));
  }
  return { scenario: job.scenario.id, title: job.scenario.title, job: job.name, ms: Date.now() - started, failed, error, checks, notes, runs: runResults };
}

function printJob(result) {
  const counts = result.runs.map(r => `${r.events} events, ${r.recording} rrweb`).join('; ');
  console.log(`${result.failed ? 'FAIL' : 'ok  '} ${result.scenario} ${result.job} (${seconds(result.ms)}; ${result.runs.length} visitor${result.runs.length === 1 ? '' : 's'}: ${counts || 'none'})`);
  if (result.error) console.log(`       error: ${result.error}`);
  for (const check of result.checks.filter(c => !c.ok)) console.log(`       check failed: ${check.label}${check.detail === undefined ? '' : ' — ' + String(typeof check.detail === 'string' ? check.detail : JSON.stringify(check.detail)).slice(0, 600)}`);
  for (const run of result.runs) {
    for (const [invariant, problems] of Object.entries(run.problems)) {
      if (!problems.length) continue;
      console.log(`       ${invariant} ${run.name}: ${problems.length} problem${problems.length === 1 ? '' : 's'}`);
      for (const problem of problems.slice(0, 8)) console.log(`         - ${problem}`);
    }
  }
  for (const note of result.notes) console.log(`       note: ${note}`);
}

(async () => {
  const started = Date.now();
  console.log(`Browser privacy checks on ${path.relative(ROOT, OUT) || OUT}: ${jobs.length} of ${allJobs.length} jobs (shard ${SHARD.join('/')}${QUICK ? ', quick' : ''}), ${WORKERS} at a time.`);
  const browser = await launch();
  const results = [];
  const queue = [...jobs];
  await Promise.all(Array.from({ length: Math.min(WORKERS, queue.length) }, async () => {
    while (queue.length) {
      const result = await runJob(browser, queue.shift());
      results.push(result);
      printJob(result);
    }
  }));
  await browser.close();

  const byScenario = new Map();
  for (const r of results) {
    if (!byScenario.has(r.scenario)) byScenario.set(r.scenario, { title: r.title, jobs: 0, failed: 0, visitors: 0, checks: 0, checksFailed: 0, problems: 0, ms: 0 });
    const s = byScenario.get(r.scenario);
    s.jobs++; s.failed += r.failed ? 1 : 0; s.visitors += r.runs.length; s.checks += r.checks.length; s.checksFailed += r.checks.filter(c => !c.ok).length; s.ms += r.ms;
    s.problems += r.runs.reduce((n, run) => n + Object.values(run.problems).reduce((m, p) => m + p.length, 0), 0) + (r.error ? 1 : 0);
  }
  console.log('\nScenario  Result  Jobs  Visitors  Checks  Invariant problems  Time (summed)');
  for (const [id, s] of [...byScenario].sort()) {
    console.log(`${id.padEnd(9)} ${(s.failed ? 'FAIL' : 'pass').padEnd(7)} ${String(s.jobs).padStart(4)}  ${String(s.visitors).padStart(8)}  ${String(s.checks - s.checksFailed).padStart(3)}/${String(s.checks).padEnd(3)} ${String(s.problems).padStart(18)}  ${seconds(s.ms).padStart(13)}  ${s.title}`);
  }
  const failedJobs = results.filter(r => r.failed);
  console.log(`\n${failedJobs.length ? `${failedJobs.length} of ${results.length} jobs failed` : `All ${results.length} jobs passed`} in ${seconds(Date.now() - started)} (wall time).`);
  if (REPORT) fs.writeFileSync(REPORT, JSON.stringify({ shard: SHARD.join('/'), quick: QUICK, wallMs: Date.now() - started, results }, null, 1));
  process.exit(failedJobs.length ? 1 : 0);
})().catch(error => { console.error(error); process.exit(1); });
