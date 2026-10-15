#!/usr/bin/env node
/**
 * The autopilot merge gate (docs/AUTOPILOT.md). .github/workflows/autopilot-merge.yml runs it from main's checkout and
 * never runs a pull request's code. Node built-ins only: global fetch for the GitHub API, git for the guard and reverts.
 *
 *   node scripts/autopilot-merge.cjs evaluate [--dry-run] [--pr <n>]
 *   node scripts/autopilot-merge.cjs smoke-result --pr <n> --sha <head sha> --smoke-exit <code> --seo-exit <code> [--dir <results>]
 *   node scripts/autopilot-merge.cjs merge --pr <n> --sha <head sha>
 *   node scripts/autopilot-merge.cjs wait-deploy --sha <merge sha>
 *   node scripts/autopilot-merge.cjs record-live --pr <n> --sha <merge sha>
 *   node scripts/autopilot-merge.cjs report-live --pr <n> --sha <merge sha> --smoke-exit <code> --seo-exit <code> --baseline-exit <code> --baseline <file> --live <file> [--log <file>]
 *   node scripts/autopilot-merge.cjs incident --pr <n> --sha <merge sha> --reason <text> [--revert] [--step <name>] [--log <file>]
 *   node scripts/autopilot-merge.cjs reconcile [--dry-run]
 *   node scripts/autopilot-merge.cjs --self-test     every gate against a mocked GitHub API, and reverts in temporary repositories
 *
 * evaluate first makes sure every autopilot merge of the last 14 days was live-checked (reconcile, below), then checks
 * every open autopilot pull request (a branch starting autopilot/, here or in a fork, or the `autopilot` label),
 * keeps one status comment on each up to date (only when its text changes) and outputs the eligible one (eligible,
 * pr, sha, preview_url). While more than one is open, none is eligible. --pr evaluates one pull request whatever its
 * labels; --dry-run writes nothing. smoke-result records the preview checks on that comment and outputs
 * outcome=pass|fail|incomplete. merge checks every gate again and squash-merges with the head commit pinned.
 * wait-deploy waits for Vercel's Production deployment of the merge commit and for /version.json to name it.
 * record-live leaves the "live checks passed" record on the pull request. incident optionally reverts the merge on
 * main as github-actions[bot] (keeping the ledger and the learnings) and always opens an issue labelled autopilot-incident and
 * autopilot:paused, which stops every further merge until someone closes it. reconcile opens such an issue for any
 * autopilot pull request merged with neither record: one merged by hand, or a run that was cancelled or timed out.
 *
 * Environment: GITHUB_TOKEN (without it reads are unauthenticated, review threads cannot be read and every write is
 * refused: enough for a local `evaluate --dry-run` of a public repository), GITHUB_REPOSITORY (default
 * koolkam00/pace-notes), AUTOPILOT_MERGE (the repository variable; merges only when it is unset or "on"),
 * GITHUB_OUTPUT and GITHUB_STEP_SUMMARY (written when set), RUNNER_TEMP (where evaluate leaves its state for
 * smoke-result).
 */
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const CONFIG = {
  base: 'main', branchPrefix: 'autopilot/', label: 'autopilot',
  blockLabels: ['autopilot:paused', 'autopilot:needs-owner', 'do-not-merge'],
  pauseLabel: 'autopilot:paused', incidentLabel: 'autopilot-incident',
  allowedAuthors: ['koolkam00'],
  requiredChecks: ['verify', 'privacy-e2e'],  // check-run names on the head SHA, latest attempt, conclusion success
  requiredStatuses: ['Vercel'],               // commit statuses on the head SHA, state success
  minReadyMinutes: 15,                        // time since the PR was marked ready (or opened non-draft)
  productionUrl: 'https://splithappens.run',
  deployTimeoutMinutes: 30,
};

const ROOT = path.join(__dirname, '..');
const GUARD = path.join(__dirname, 'autopilot-guard.cjs');
const SEO_LIVE = path.join(__dirname, 'verify-seo-live.cjs');
const OWN_WORKFLOW = '.github/workflows/autopilot-merge.yml';
const LEDGER = 'autopilot/ledger.jsonl';
/** Records an automatic revert keeps as they are on main: the ledger is append-only, and so is what was learned. */
const LEARNINGS = 'autopilot/LEARNINGS.md';
const MARKER = '<!-- autopilot-merge-status -->';
/** Hidden notes on the status comment, per head commit: the preview checks failed, or GitHub refused the merge. */
const noteMarker = (kind, sha, detail) => `<!-- autopilot-${kind}:${sha}${detail ? ` ${encodeURIComponent(detail)}` : ''} -->`;
const smokeFailedMarker = (sha, detail) => noteMarker('smoke-failed', sha, detail);
const NOTE = /<!-- autopilot-(smoke-failed|merge-refused):([0-9a-f]{40})(?: ([^\s>]*))? -->/g;
/** On a merged pull request: the live checks passed for this merge commit. In an incident issue: which pull request it is about. */
const liveOkMarker = (sha) => `<!-- autopilot-live-ok:${sha} -->`;
const incidentMarker = (number) => `<!-- autopilot-incident:${number} -->`;
const BOT_LOGIN = 'github-actions[bot]';
const BOT_EMAIL = '41898282+github-actions[bot]@users.noreply.github.com';
const VERCEL_LOGIN = 'vercel[bot]';
/** Vercel's own address for one preview deployment of this project. */
const PREVIEW_HOST = /^htw-live-study-[a-z0-9-]+-koolkam00s-projects\.vercel\.app$/;
const CHECKS_APP = 'github-actions';
/** How a check run may end: any check cleanly, a required one only by succeeding. */
const CLEAN_CONCLUSIONS = ['success', 'neutral', 'skipped'];
const REQUIRED_CONCLUSIONS = ['success'];
const RECONCILE_DAYS = 14;
const VERSION_TIMEOUT_MINUTES = 5;
const POLL_MS = 20000;
const LABEL_COLORS = { [CONFIG.pauseLabel]: 'b60205', [CONFIG.incidentLabel]: 'd93f0b' };

// ---------- Small helpers ----------

class UsageError extends Error {}
class NeedsToken extends Error {}
const short = (sha) => String(sha || '').slice(0, 7);
const cell = (text) => String(text ?? '').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
const utc = (date) => `${new Date(date).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
function option(argv, name) { const at = argv.indexOf(name); return at >= 0 ? argv[at + 1] : undefined; }
function required(argv, name) { const value = option(argv, name); if (!value) throw new UsageError(`${name} is required`); return value; }
function prNumber(argv) { const n = Number(required(argv, '--pr')); if (!Number.isInteger(n) || n < 1) throw new UsageError('--pr must be a pull request number'); return n; }
function shaArg(argv) { const sha = required(argv, '--sha'); if (!/^[0-9a-f]{40}$/.test(sha)) throw new UsageError('--sha must be a full 40-character commit SHA'); return sha; }

function firstParagraph(body) {
  const text = String(body || '').replace(/<!--[\s\S]*?-->/g, '').replace(/\r\n/g, '\n').trim();
  const paragraph = text.split(/\n\s*\n/).map((p) => p.trim()).find(Boolean) || '';
  return paragraph.length > 1500 ? `${paragraph.slice(0, 1500)}…` : paragraph;
}

/** The status comment's hidden notes for one head commit: { 'smoke-failed': detail, 'merge-refused': detail }. */
function readNotes(comment, sha) {
  const notes = {};
  for (const match of String(comment ? comment.body : '').matchAll(NOTE)) {
    if (match[2] !== sha) continue;
    try { notes[match[1]] = match[3] ? decodeURIComponent(match[3]) : ''; } catch { notes[match[1]] = ''; }
  }
  return notes;
}

/** Runs fn up to three times when GitHub answers 5xx or 429, or the request itself fails (a timeout, a dropped connection). */
async function retrying(deps, what, fn, attempts = 3) {
  for (let attempt = 1; ; attempt += 1) {
    try { return await fn(); } catch (error) {
      const transient = !(error instanceof NeedsToken) && (error.status === undefined || error.status >= 500 || error.status === 429);
      if (!transient || attempt >= attempts) throw error;
      deps.log(`${what}: ${error.message}; trying again`);
      await deps.sleep(attempt * 5000);
    }
  }
}
const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------- GitHub API ----------

function createClient({ token, fetchImpl, apiUrl, dryRun, log, sleep = defaultSleep }) {
  const headers = () => ({
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    'user-agent': 'pace-notes-autopilot-merge',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  });
  async function send(method, url, body) {
    const response = await fetchImpl(url, { method, headers: { ...headers(), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: response.status, ok: response.ok, data, link: response.headers.get('link') || '' };
  }
  const absolute = (route) => (route.startsWith('http') ? route : `${apiUrl}${route}`);
  const failure = (method, route, res) => Object.assign(new Error(`${method} ${route} answered ${res.status}: ${res.data && res.data.message ? res.data.message : String(res.data).slice(0, 200)}`), { status: res.status, apiMessage: res.data && res.data.message ? String(res.data.message) : '' });
  /** A read, tried up to three times on 5xx, 429 or a failed request, so one bad answer does not fail a scheduled run. */
  const read = (route, url, allow404) => retrying({ log, sleep }, `GET ${route}`, async () => {
    const res = await send('GET', url);
    if (res.status === 404 && allow404) return res;
    if (!res.ok) throw failure('GET', route, res);
    return res;
  });
  return {
    authenticated: Boolean(token),
    async get(route, { allow404 = false } = {}) {
      const res = await read(route, absolute(route), allow404);
      return res.status === 404 ? null : res.data;
    },
    /**
     * Every item of a paginated list (follows Link: rel="next", at most `pages` pages). `key` names the array in object
     * responses. `complete` throws instead of returning a list cut short by the page limit.
     */
    async list(route, { key, pages = 10, complete = false } = {}) {
      const items = [];
      let url = absolute(route);
      for (let page = 0; url && page < pages; page += 1) {
        const res = await read(route, url, false);
        items.push(...(key ? res.data[key] || [] : res.data));
        const next = /<([^>]+)>;\s*rel="next"/.exec(res.link);
        url = next ? next[1] : null;
      }
      if (complete && url) throw new Error(`GET ${route} has more than ${pages} pages, so the list would be incomplete`);
      return items;
    },
    async graphql(query, variables) {
      if (!token) throw new NeedsToken('GitHub GraphQL needs GITHUB_TOKEN');
      const res = await send('POST', absolute('/graphql'), { query, variables });
      if (!res.ok || (res.data && res.data.errors)) throw new Error(`GraphQL: ${res.data && res.data.errors ? res.data.errors.map((e) => e.message).join('; ') : res.status}`);
      return res.data.data;
    },
    /** A write. Dry runs only log it; without a token it is refused. */
    async write(method, route, body, what) {
      if (dryRun) { log(`dry run: would ${what}`); return null; }
      if (!token) throw new NeedsToken(`${what} needs GITHUB_TOKEN`);
      const res = await send(method, absolute(route), body);
      if (!res.ok) throw failure(method, route, res);
      return res.data;
    },
  };
}

// ---------- Gates ----------

const latestFirst = (a, b) => (Date.parse(b.started_at || b.created_at || 0) - Date.parse(a.started_at || a.created_at || 0)) || (b.id - a.id);

/**
 * Every check run on the head commit, not only the required ones: per app and name, only the latest attempt counts.
 * The required checks must be there, from GitHub Actions, and must have succeeded: skipped or neutral means they never
 * passed (a job whose condition was false), so it fails. Every other check must have completed with success, neutral
 * or skipped. Anything queued or running waits; any other conclusion fails. This workflow's own jobs are left out.
 */
async function checksGate(gh, repo, sha) {
  const runs = await gh.list(`/repos/${repo}/commits/${sha}/check-runs?filter=all&per_page=100`, { key: 'check_runs' });
  const workflowRuns = await gh.list(`/repos/${repo}/actions/runs?head_sha=${sha}&per_page=100`, { key: 'workflow_runs', pages: 2 });
  const ownSuites = new Set(workflowRuns.filter((r) => String(r.path || '').startsWith(OWN_WORKFLOW)).map((r) => r.check_suite_id));
  const latest = new Map();
  for (const run of runs.filter((r) => r.head_sha === sha && !(r.check_suite && ownSuites.has(r.check_suite.id))).sort(latestFirst)) {
    const key = `${run.app ? run.app.slug : 'unknown'}/${run.name}`;
    if (latest.has(key)) latest.get(key).attempts += 1;
    else latest.set(key, { run, attempts: 1 });
  }
  const parts = [];
  let ok = true;
  const waiting = () => { if (ok) ok = null; };
  const describe = ({ run, attempts }, label, { required = false } = {}) => {
    if (run.status !== 'completed') { waiting(); return `${label}: ${String(run.status).replace('_', ' ')}`; }
    if (!(required ? REQUIRED_CONCLUSIONS : CLEAN_CONCLUSIONS).includes(run.conclusion)) { ok = false; return `${label}: ${run.conclusion}${required ? ' (a required check must succeed)' : ''}`; }
    return `${label}: ${run.conclusion}${attempts > 1 ? ` (attempt ${attempts})` : ''}`;
  };
  for (const name of CONFIG.requiredChecks) {
    const found = latest.get(`${CHECKS_APP}/${name}`);
    if (!found) { parts.push(`${name}: not reported for this commit yet`); waiting(); continue; }
    parts.push(describe(found, name, { required: true }));
  }
  const others = [...latest].filter(([key]) => !CONFIG.requiredChecks.some((name) => key === `${CHECKS_APP}/${name}`));
  const notClean = others.filter(([, { run }]) => run.status !== 'completed' || !CLEAN_CONCLUSIONS.includes(run.conclusion));
  for (const [key, found] of notClean) parts.push(describe(found, key.startsWith(`${CHECKS_APP}/`) ? key.slice(CHECKS_APP.length + 1) : key));
  if (others.length > notClean.length) parts.push(`${plural(others.length - notClean.length, 'other check')} passed`);
  return { ok, detail: parts.join('; ') };
}

/** Required commit statuses, as posted by Vercel's app: a status with the same context from anyone else is ignored. */
async function statusesGate(gh, repo, sha) {
  const statuses = await gh.list(`/repos/${repo}/commits/${sha}/statuses?per_page=100`, { pages: 3 });
  const parts = [];
  let ok = true;
  for (const context of CONFIG.requiredStatuses) {
    const status = statuses.filter((s) => s.context === context && s.creator && s.creator.login === VERCEL_LOGIN).sort((a, b) => Date.parse(b.updated_at || b.created_at || 0) - Date.parse(a.updated_at || a.created_at || 0) || b.id - a.id)[0];
    if (!status) { parts.push(`${context}: not reported by ${VERCEL_LOGIN} yet`); if (ok) ok = null; continue; }
    if (status.state === 'pending') { parts.push(`${context}: pending`); if (ok) ok = null; continue; }
    if (status.state !== 'success') { parts.push(`${context}: ${status.state}`); ok = false; continue; }
    parts.push(`${context}: success`);
  }
  return { ok, detail: parts.join('; ') };
}

const REVIEW_THREADS = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) { pullRequest(number: $number) { reviewThreads(first: 100) { totalCount nodes { isResolved path } } } }
}`;
async function threadsGate(gh, repo, number) {
  const [owner, name] = repo.split('/');
  const data = await gh.graphql(REVIEW_THREADS, { owner, name, number });
  const threads = data.repository.pullRequest.reviewThreads;
  if (threads.totalCount > threads.nodes.length) return { ok: false, detail: `${threads.totalCount} review threads; too many to check` };
  const open = threads.nodes.filter((t) => !t.isResolved);
  return open.length ? { ok: false, detail: `${open.length} unresolved: ${[...new Set(open.map((t) => t.path).filter(Boolean))].slice(0, 3).join(', ') || 'see the conversation'}` } : { ok: true, detail: threads.nodes.length ? `${threads.nodes.length} threads, all resolved` : 'none' };
}

/** A reviewer's latest decisive review (APPROVED, CHANGES_REQUESTED, DISMISSED); a later comment-only review does not clear a change request. */
async function reviewsGate(gh, repo, number) {
  const reviews = await gh.list(`/repos/${repo}/pulls/${number}/reviews?per_page=100`);
  const latest = new Map();
  for (const review of [...reviews].sort((a, b) => Date.parse(a.submitted_at || 0) - Date.parse(b.submitted_at || 0) || a.id - b.id)) {
    if (!review.user || !['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(review.state)) continue;
    latest.set(review.user.login, review.state);
  }
  const blocking = [...latest].filter(([, state]) => state === 'CHANGES_REQUESTED').map(([login]) => login);
  return blocking.length ? { ok: false, detail: `changes requested by ${blocking.join(', ')}` } : { ok: true, detail: 'none' };
}

/**
 * The wait counts from the later of the last ready_for_review event and the head commit's arrival (the first check
 * suite GitHub created for it), so a commit pushed long after the pull request was marked ready waits too. Both
 * times are GitHub's own, not commit dates, which anyone can set.
 */
async function readyGate(gh, repo, pr, now) {
  const events = await gh.list(`/repos/${repo}/issues/${pr.number}/timeline?per_page=100`);
  const ready = events.filter((e) => e.event === 'ready_for_review').map((e) => e.created_at).sort().pop();
  const suites = await gh.list(`/repos/${repo}/commits/${pr.head.sha}/check-suites?per_page=100`, { key: 'check_suites', pages: 1 });
  const arrived = suites.map((s) => s.created_at).filter(Boolean).sort()[0] || null;
  const readySince = ready || pr.created_at;
  const since = arrived && Date.parse(arrived) > Date.parse(readySince) ? arrived : readySince;
  const due = Date.parse(since) + CONFIG.minReadyMinutes * 60000;
  const detail = `ready since ${utc(readySince)}${ready ? '' : ' (opened ready)'}${since === arrived ? `; head commit pushed ${utc(arrived)}` : ''}`;
  return now() >= due ? { ok: true, detail } : { ok: null, detail: `${detail}; can merge from ${utc(due)}` };
}

async function mergeableGate(gh, repo, pr) {
  const compare = await gh.get(`/repos/${repo}/compare/${encodeURIComponent(CONFIG.base)}...${pr.head.sha}`);
  if (compare.behind_by > 0) return { ok: false, detail: `needs main merged in (${compare.behind_by} commit${compare.behind_by === 1 ? '' : 's'} behind)` };
  if (pr.mergeable === null || pr.mergeable === undefined) return { ok: null, detail: 'GitHub is still working out whether it merges cleanly' };
  if (pr.mergeable !== true) return { ok: false, detail: `does not merge cleanly (${pr.mergeable_state || 'conflicts'})` };
  return { ok: true, detail: 'merges cleanly; up to date with main' };
}

/** Vercel's deployments for a commit in one environment (Preview or Production), newest first, each with Vercel's latest status. */
async function vercelDeployments(gh, repo, sha, environment) {
  const deployments = (await gh.list(`/repos/${repo}/deployments?sha=${sha}&per_page=100`, { pages: 2 }))
    .filter((d) => d.creator && d.creator.login === VERCEL_LOGIN && new RegExp(`^${environment}\\b`, 'i').test(d.environment || ''))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id);
  const out = [];
  for (const deployment of deployments.slice(0, 5)) {
    const statuses = await gh.list(`/repos/${repo}/deployments/${deployment.id}/statuses?per_page=30`, { pages: 1 });
    const latest = statuses.filter((s) => s.creator && s.creator.login === VERCEL_LOGIN).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id)[0] || null;
    out.push({ deployment, status: latest });
  }
  return out;
}

const previewHostOk = (url) => { try { const u = new URL(url); return u.protocol === 'https:' && PREVIEW_HOST.test(u.hostname); } catch { return false; } };
async function previewGate(gh, repo, sha) {
  const found = await vercelDeployments(gh, repo, sha, 'Preview');
  const ready = found.find(({ status }) => status && status.state === 'success' && previewHostOk(status.environment_url || ''));
  if (ready) return { ok: true, detail: ready.status.environment_url, url: ready.status.environment_url.replace(/\/$/, '') };
  if (!found.length) return { ok: null, detail: 'no Vercel preview deployment for this commit yet' };
  const state = found[0].status ? found[0].status.state : 'pending';
  if (state === 'success') return { ok: false, detail: `the preview's address ${found[0].status.environment_url || '(none)'} is not one of this project's Vercel preview addresses` };
  if (['failure', 'error'].includes(state)) return { ok: false, detail: `the Vercel preview deployment reported ${state}` };
  return { ok: null, detail: `the Vercel preview deployment is ${state.replace('_', ' ')}` };
}

/** Runs main's copy of the guard against the pull request's head with git (fetch, diff); nothing from the PR is executed. */
function runGuardWithGit(pr, { cwd = ROOT } = {}) {
  const ref = `refs/remotes/autopilot-pr/${pr.number}`;
  const git = (gitArgs) => execFileSync('git', gitArgs, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    git(['fetch', '--no-tags', '--quiet', 'origin', `+refs/heads/${CONFIG.base}:refs/remotes/origin/${CONFIG.base}`, `+refs/pull/${pr.number}/head:${ref}`]);
  } catch (error) {
    return { ok: null, detail: `could not fetch the pull request: ${String(error.stderr || error.message).trim().split('\n')[0]}` };
  }
  const fetched = git(['rev-parse', ref]);
  if (fetched !== pr.head.sha) return { ok: null, detail: `the branch moved while checking (now ${short(fetched)}); checks again next run` };
  const run = spawnSync(process.execPath, [GUARD, '--base', `refs/remotes/origin/${CONFIG.base}`, '--head', ref, '--branch', pr.head.ref, '--pr', String(pr.number), '--json'], { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  let result;
  try { result = JSON.parse(run.stdout); } catch { return { ok: false, detail: `the guard did not run (exit ${run.status}): ${String(run.stderr || '').trim().split('\n')[0]}` }; }
  if (result.error) return { ok: false, detail: `guard error: ${result.error}` };
  if (result.skipped) return { ok: false, detail: 'the guard checks only autopilot/ branches' };
  if (run.status === 0 && result.ok) return { ok: true, detail: `${result.files} files, ${result.changedLines} changed lines; within the rules` };
  const listed = result.violations.slice(0, 3).map((v) => `${v.rule}${v.file ? ` ${v.file}${v.line ? `:${v.line}` : ''}` : ''}: ${v.message}`).join('; ');
  return { ok: false, detail: `${result.violations.length} violation${result.violations.length === 1 ? '' : 's'}: ${listed}${result.violations.length > 3 ? '; …' : ''}` };
}

/**
 * scripts/verify-seo-live.cjs against production, just before merging: a live site that already fails would make
 * the post-deploy check blame (and revert) this change for a problem it did not cause. Exit 3 means it could not
 * reach the site.
 */
function runProductionSeo() {
  const run = spawnSync(process.execPath, [SEO_LIVE], { cwd: ROOT, encoding: 'utf8', timeout: 5 * 60000, maxBuffer: 16 * 1024 * 1024 });
  const failed = String(run.stdout || '').split('\n').map((line, i, all) => (line.startsWith('FAIL') ? `${line.slice(4).trim()}: ${(all[i + 1] || '').trim()}` : null)).filter(Boolean);
  if (run.status === 0) return { ok: true, detail: `${CONFIG.productionUrl} passes verify:seo:live` };
  const what = failed.length ? `${plural(failed.length, 'check')} fail, first: ${failed[0].slice(0, 160)}` : `exit ${run.status === null ? `signal ${run.signal}` : run.status}`;
  return { ok: null, detail: `${CONFIG.productionUrl} ${run.status === 3 ? 'could not be checked' : 'already fails verify:seo:live'} (${what}); merges wait until the live site passes, so this change is not blamed for it` };
}

const GATE_LABELS = {
  open: 'Pull request is open',
  draft: 'Marked ready for review',
  base: `Targets ${CONFIG.base}`,
  'same-repo': 'Branch is in this repository (no forks)',
  branch: `Branch starts with ${CONFIG.branchPrefix}`,
  author: `Opened by ${CONFIG.allowedAuthors.join(' or ')}`,
  label: `Has the ${CONFIG.label} label`,
  'block-labels': `None of ${CONFIG.blockLabels.join(', ')}`,
  pause: `No open issue or pull request labelled ${CONFIG.pauseLabel}`,
  'one-open': 'One open autopilot pull request',
  variable: 'Repository variable AUTOPILOT_MERGE is unset or "on"',
  history: `Every autopilot merge of the last ${RECONCILE_DAYS} days was live-checked`,
  checks: `${CONFIG.requiredChecks.join(' and ')} succeeded and every other check passed on the head commit`,
  statuses: `Status passed on the head commit (${CONFIG.requiredStatuses.join(', ')}, from ${VERCEL_LOGIN})`,
  guard: "Autopilot guard (main's copy) passes",
  threads: 'No unresolved review threads',
  reviews: 'No outstanding change requests',
  ready: `Ready for at least ${CONFIG.minReadyMinutes} minutes`,
  mergeable: 'Merges cleanly and is up to date with main',
  preview: 'Vercel preview deployed for the head commit',
  production: 'The live site passes verify:seo:live before merging',
  smoke: 'Preview checks have not failed on this commit',
  'merge-refused': 'GitHub has not refused to merge this commit',
};

/** Every gate for one pull request. ok: true passes, false fails, null is still waiting (or could not be checked). */
async function evaluateGates(gh, deps, pr, { pause, autopilot, statusComment, unchecked = { items: [], error: null } }) {
  const repo = deps.repo;
  const sha = pr.head.sha;
  const gates = [];
  const add = (id, ok, detail, extra = {}) => gates.push({ id, label: GATE_LABELS[id], ok, detail, ...extra });
  const attempt = async (id, fn) => {
    try { const { ok, detail, ...extra } = await fn(); add(id, ok, detail, extra); } catch (error) { add(id, null, error instanceof NeedsToken ? 'cannot be read without GITHUB_TOKEN' : `could not check: ${error.message}`); }
  };
  const labels = (pr.labels || []).map((l) => l.name);
  add('open', pr.state === 'open', pr.merged ? 'already merged' : pr.state);
  add('draft', !pr.draft, pr.draft ? 'still a draft' : 'ready for review');
  add('base', pr.base.ref === CONFIG.base, `base is ${pr.base.ref}`);
  const headRepo = pr.head.repo ? pr.head.repo.full_name : null;
  add('same-repo', headRepo === repo, headRepo === repo ? repo : `head is in ${headRepo || 'a deleted repository'}`);
  add('branch', pr.head.ref.startsWith(CONFIG.branchPrefix), pr.head.ref);
  add('author', CONFIG.allowedAuthors.includes(pr.user && pr.user.login), `opened by ${pr.user ? pr.user.login : 'unknown'}`);
  add('label', labels.includes(CONFIG.label), labels.includes(CONFIG.label) ? 'present' : 'missing');
  const blocking = CONFIG.blockLabels.filter((label) => labels.includes(label));
  add('block-labels', blocking.length === 0, blocking.length ? `labelled ${blocking.join(', ')}` : 'none');
  add('pause', pause.length === 0, pause.length ? `${pause.slice(0, 3).map((i) => `#${i.number}`).join(', ')} ${pause.length === 1 ? 'is' : 'are'} labelled ${CONFIG.pauseLabel}; close ${pause.length === 1 ? 'it' : 'them'} or remove the label to resume` : 'none');
  // One autopilot pull request at a time (constitution §4.1): while more than one is open, none of them merges.
  if (!Array.isArray(autopilot)) add('one-open', null, 'the open autopilot pull requests were not listed');
  else {
    const others = autopilot.filter((p) => p.number !== pr.number);
    add('one-open', others.length === 0, others.length ? `${others.map((p) => `#${p.number}`).join(', ')} ${others.length === 1 ? 'is' : 'are'} open too; no autopilot pull request merges while more than one is open, so close all but one` : 'no other autopilot pull request is open');
  }
  // Fail closed: anything but no value or "on" (off, false, 0, no, paused, …) stops merges.
  const variable = String(deps.env.AUTOPILOT_MERGE || '').trim();
  const variableOn = variable === '' || variable.toLowerCase() === 'on';
  add('variable', variableOn, variable ? `AUTOPILOT_MERGE is "${variable}"${variableOn ? '' : '; only "on" or no value lets merges through'}` : 'AUTOPILOT_MERGE is not set');
  if (unchecked.error) add('history', null, `could not check: ${unchecked.error}`);
  else add('history', unchecked.items.length === 0, unchecked.items.length ? `${unchecked.items.map((m) => `#${m.number}`).join(', ')} merged with no record that the live checks passed and no incident yet` : 'none unaccounted for');
  await attempt('checks', () => checksGate(gh, repo, sha));
  await attempt('statuses', () => statusesGate(gh, repo, sha));
  if (headRepo === repo && pr.state === 'open') await attempt('guard', () => deps.runGuard(pr));
  else add('guard', false, 'not run (closed, or not a branch of this repository)');
  await attempt('threads', () => threadsGate(gh, repo, pr.number));
  await attempt('reviews', () => reviewsGate(gh, repo, pr.number));
  await attempt('ready', () => readyGate(gh, repo, pr, deps.now));
  await attempt('mergeable', () => mergeableGate(gh, repo, pr));
  await attempt('preview', () => previewGate(gh, repo, sha));
  const notes = readNotes(statusComment, sha);
  const smokeFailed = 'smoke-failed' in notes;
  add('smoke', !smokeFailed, smokeFailed ? `failed on this commit${notes['smoke-failed'] ? `: ${notes['smoke-failed']}` : ''}. Push a fix (or an empty commit to try again)` : 'run after the gates pass');
  const refused = 'merge-refused' in notes;
  add('merge-refused', !refused, refused ? `GitHub refused to merge this commit${notes['merge-refused'] ? `: ${notes['merge-refused']}` : ''}. Push a commit to try again` : 'no earlier attempt was refused');
  // The live baseline costs about 130 requests to production, so it runs only once everything else passes.
  if (gates.every((g) => g.ok === true)) await attempt('production', () => deps.runLiveSeo());
  const eligible = gates.every((g) => g.ok === true);
  const preview = gates.find((g) => g.id === 'preview');
  return { number: pr.number, title: pr.title, sha, headRef: pr.head.ref, gates, eligible, previewUrl: preview && preview.url ? preview.url : null, notes, smokeFailed };
}

/**
 * Every open autopilot pull request: its branch starts with autopilot/ (in this repository or a fork), or it carries
 * the autopilot label. A label alone is not enough to find them, because a branch can be opened without it. Fails
 * closed: a list longer than the page limit throws rather than miss one, and a pull request that moved to the next
 * page while the pages were read (another one opened meanwhile) counts once.
 */
async function openAutopilotPrs(gh, repo) {
  const listed = await gh.list(`/repos/${repo}/pulls?state=open&per_page=100`, { pages: 30, complete: true });
  const open = [...new Map(listed.map((p) => [p.number, p])).values()];
  return open.filter((p) => (p.head && String(p.head.ref || '').startsWith(CONFIG.branchPrefix)) || (p.labels || []).some((l) => l.name === CONFIG.label))
    .map((p) => ({ number: p.number, title: p.title, headRef: p.head ? p.head.ref : null }))
    .sort((a, b) => a.number - b.number);
}

async function pausedItems(gh, repo) {
  const items = await gh.list(`/repos/${repo}/issues?state=open&labels=${encodeURIComponent(CONFIG.pauseLabel)}&per_page=100`, { pages: 3 });
  return items.map((i) => ({ number: i.number, title: i.title, pullRequest: Boolean(i.pull_request) }));
}

async function findStatusComment(gh, repo, number) {
  const comments = await gh.list(`/repos/${repo}/issues/${number}/comments?per_page=100`);
  return comments.find((c) => c.user && c.user.login === BOT_LOGIN && typeof c.body === 'string' && c.body.includes(MARKER)) || null;
}

/**
 * Autopilot pull requests merged in the last RECONCILE_DAYS days that have neither the workflow's "live checks
 * passed" record nor an incident issue: merged by hand (the session acts as the owner's account), or merged by a run
 * that was cancelled, timed out or lost its connection before it checked the live site.
 */
async function uncheckedMerges(gh, deps) {
  const since = deps.now() - RECONCILE_DAYS * 86400000;
  const closed = await gh.list(`/repos/${deps.repo}/pulls?state=closed&sort=updated&direction=desc&per_page=100`, { pages: 2 });
  const merged = closed.filter((p) => p.merged_at && Date.parse(p.merged_at) >= since && p.base && p.base.ref === CONFIG.base
    && ((p.head && String(p.head.ref).startsWith(CONFIG.branchPrefix)) || (p.labels || []).some((l) => l.name === CONFIG.label)));
  if (!merged.length) return [];
  const incidents = await gh.list(`/repos/${deps.repo}/issues?state=all&labels=${encodeURIComponent(CONFIG.incidentLabel)}&per_page=100`, { pages: 3 });
  const out = [];
  for (const p of merged.sort((a, b) => a.number - b.number)) {
    if (incidents.some((i) => i.user && i.user.login === BOT_LOGIN && String(i.body || '').includes(incidentMarker(p.number)))) continue;
    const comments = await gh.list(`/repos/${deps.repo}/issues/${p.number}/comments?per_page=100`);
    if (comments.some((c) => c.user && c.user.login === BOT_LOGIN && String(c.body || '').includes(liveOkMarker(p.merge_commit_sha)))) continue;
    out.push({ number: p.number, title: p.title, mergeSha: p.merge_commit_sha, mergedAt: p.merged_at });
  }
  return out;
}

/** Opens an incident issue for each unaccounted merge. Returns the ones still unaccounted for (a dry run, or a failed write). */
async function reconcileMerges(gh, deps) {
  const items = await uncheckedMerges(gh, deps);
  const left = [];
  for (const item of items) {
    let mergedBy = 'unknown';
    try { const pr = await gh.get(`/repos/${deps.repo}/pulls/${item.number}`); mergedBy = pr.merged_by ? pr.merged_by.login : 'unknown'; } catch { /* the incident still opens */ }
    const byWorkflow = mergedBy === BOT_LOGIN;
    const reason = byWorkflow
      ? `the Autopilot merge workflow merged it on ${utc(item.mergedAt)}, but there is no record that the live checks passed: the run was probably cancelled or timed out, or could not write its result. Check main's history for an automatic revert, then check the live site`
      : `it was merged on ${utc(item.mergedAt)} by ${mergedBy}, not by the Autopilot merge workflow (Claude sessions act as the owner's account), so the merge gates, the preview checks, the live checks and the automatic revert never ran for it. Check the live site`;
    try {
      const issue = await openIncident(gh, deps, { number: item.number, title: item.title, sha: item.mergeSha, step: 'merge record', reason, revert: { pushed: false, detail: 'not attempted (found afterwards)' } });
      if (!issue) left.push(item);
    } catch (error) {
      deps.log(`reconcile: could not open the incident for #${item.number}: ${error.message}`);
      left.push(item);
    }
  }
  return { items: left, found: items };
}

function headline(result, { stage } = {}) {
  if (stage === 'smoke-passed') return '**All gates and the preview checks pass.** Merging now, pinned to this commit.';
  if (stage === 'smoke-failed') return '**Blocked: the preview checks failed on this commit.** Push a fix, or an empty commit to try again.';
  if (stage === 'smoke-incomplete') return '**Not merging yet:** the preview checks did not finish. The workflow tries again on its next run.';
  if (stage === 'merge-refused') return '**Blocked: GitHub refused to merge this commit.** The reason is in the table. Push a commit to try again.';
  const failing = result.gates.filter((g) => g.ok === false).map((g) => g.id);
  const waiting = result.gates.filter((g) => g.ok === null).map((g) => g.id);
  if (!failing.length && !waiting.length) return '**All gates pass.** Next: the preview checks, then a squash merge pinned to this commit.';
  const parts = [];
  if (failing.length) parts.push(`${failing.length} failing (${failing.join(', ')})`);
  if (waiting.length) parts.push(`${waiting.length} waiting (${waiting.join(', ')})`);
  return `**Not merging yet:** ${parts.join('; ')}.`;
}

function gateTable(gates) {
  return ['| Gate | Result | Detail |', '| --- | --- | --- |', ...gates.map((g) => `| ${cell(g.label)} | ${g.ok === true ? 'pass' : g.ok === false ? '**fail**' : 'waiting'} | ${cell(g.detail)} |`)];
}

function statusBody(deps, result, { stage, extraRows = [] } = {}) {
  const hidden = Object.entries(result.notes || {}).map(([kind, detail]) => noteMarker(kind, result.sha, detail));
  return [
    MARKER, ...hidden,
    '### Autopilot merge gate', '',
    headline(result, { stage }), '',
    `Head commit \`${short(result.sha)}\`.`, '',
    ...gateTable([...result.gates, ...extraRows]), '',
    `The **Autopilot merge** workflow on \`main\` checks again every 15 minutes and whenever CI finishes. Gates and how to pause it: [docs/AUTOPILOT.md](${deps.serverUrl}/${deps.repo}/blob/main/docs/AUTOPILOT.md).`,
  ].join('\n');
}

const normalise = (text) => String(text || '').replace(/\r\n/g, '\n').trim();
async function upsertStatusComment(gh, deps, number, existing, body) {
  if (existing && normalise(existing.body) === normalise(body)) return 'unchanged';
  if (existing) { await gh.write('PATCH', `/repos/${deps.repo}/issues/comments/${existing.id}`, { body }, `update the status comment on #${number}`); return 'updated'; }
  await gh.write('POST', `/repos/${deps.repo}/issues/${number}/comments`, { body }, `create the status comment on #${number}`);
  return 'created';
}

// ---------- Commands ----------

function statePath(deps) { return path.join(deps.env.RUNNER_TEMP || os.tmpdir(), 'autopilot-merge-state.json'); }

async function cmdEvaluate(argv, deps) {
  const dryRun = argv.includes('--dry-run');
  const only = option(argv, '--pr');
  const gh = deps.client({ dryRun });
  let unchecked = { items: [], error: null };
  try { unchecked = { ...(await reconcileMerges(gh, deps)), error: null }; } catch (error) { unchecked = { items: [], error: error.message }; }
  const pause = await pausedItems(gh, deps.repo);
  const autopilot = await openAutopilotPrs(gh, deps.repo);
  const prs = [];
  for (const p of only ? [{ number: Number(only) }] : autopilot) prs.push(await gh.get(`/repos/${deps.repo}/pulls/${p.number}`));
  const several = autopilot.length > 1 ? autopilot.map((p) => `#${p.number}`).join(', ') : null;
  deps.log(`autopilot-merge evaluate${dryRun ? ' (dry run)' : ''}: ${deps.repo}; ${only ? `pull request #${only}; ` : ''}${plural(autopilot.length, 'open autopilot pull request')}${autopilot.length ? ` (${autopilot.map((p) => `#${p.number}`).join(', ')})` : ''}${several ? ', so none merges' : ''}; ${pause.length ? `paused by ${pause.map((i) => `#${i.number}`).join(', ')}` : 'not paused'}; ${unchecked.error ? `merge history not checked (${unchecked.error})` : unchecked.found && unchecked.found.length ? `${plural(unchecked.found.length, 'merge')} without a live-check record (${unchecked.found.map((m) => `#${m.number}`).join(', ')})` : 'every recent autopilot merge accounted for'}; AUTOPILOT_MERGE ${deps.env.AUTOPILOT_MERGE ? `"${deps.env.AUTOPILOT_MERGE}"` : 'not set'}; ${gh.authenticated ? 'authenticated' : 'unauthenticated (read-only)'}`);

  const results = [];
  for (const pr of prs) {
    let statusComment = null;
    try { statusComment = await findStatusComment(gh, deps.repo, pr.number); } catch (error) { deps.log(`#${pr.number}: could not read comments: ${error.message}`); }
    const result = await evaluateGates(gh, deps, pr, { pause, autopilot, statusComment, unchecked });
    results.push({ ...result, statusComment });
    deps.log(`\n#${pr.number} ${pr.title} (${short(result.sha)}): ${result.eligible ? 'ELIGIBLE' : 'not eligible'}`);
    for (const g of result.gates) deps.log(`  ${g.ok === true ? 'pass   ' : g.ok === false ? 'FAIL   ' : 'waiting'} ${g.id.padEnd(13)} ${g.detail}`);
  }
  const chosen = results.find((r) => r.eligible) || null;
  deps.setOutput('eligible', chosen && !dryRun ? 'true' : 'false');
  deps.setOutput('candidate', chosen ? 'true' : 'false');
  deps.setOutput('pr', chosen ? String(chosen.number) : '');
  deps.setOutput('sha', chosen ? chosen.sha : '');
  deps.setOutput('preview_url', chosen ? chosen.previewUrl : '');
  if (chosen) fs.writeFileSync(statePath(deps), JSON.stringify({ number: chosen.number, title: chosen.title, sha: chosen.sha, headRef: chosen.headRef, gates: chosen.gates, previewUrl: chosen.previewUrl, notes: chosen.notes }));

  const summary = [`## Autopilot merge gate${dryRun ? ' (dry run)' : ''}`, ''];
  if (several) summary.push(`**${autopilot.length} autopilot pull requests are open (${several}), so none merges in this run.** Only one may be open at a time: close all but one.`, '');
  if (!results.length) summary.push(`No open autopilot pull request (a branch starting \`${CONFIG.branchPrefix}\` or the \`${CONFIG.label}\` label).${pause.length ? ` Merges are paused by ${pause.map((i) => `#${i.number}`).join(', ')}.` : ''}`);
  for (const result of results) summary.push(`### #${result.number} ${cell(result.title)}`, '', headline(result), '', ...gateTable(result.gates), '');
  if (chosen) summary.push(dryRun ? `Dry run: #${chosen.number} would go to the preview checks and merge next.` : `#${chosen.number} goes to the preview checks next.`);
  deps.summary(summary.join('\n'));

  for (const result of results) {
    const body = statusBody(deps, result);
    try {
      const done = await upsertStatusComment(gh, deps, result.number, result.statusComment, body);
      deps.log(`#${result.number}: status comment ${dryRun && done !== 'unchanged' ? `${done} (dry run: not written)` : done}`);
    } catch (error) {
      deps.log(`#${result.number}: could not write the status comment: ${error.message}`);
    }
  }
  return 0;
}

/** The first problems in a smoke JSON file and the FAIL lines of a verify-seo-live log, for the status comment. */
function previewProblems(dir) {
  const problems = [];
  if (!dir) return problems;
  try {
    const smoke = JSON.parse(fs.readFileSync(path.join(dir, 'smoke.json'), 'utf8'));
    for (const f of (smoke.failures || []).slice(0, 2)) problems.push(`${f.where}: ${f.message}`);
    if ((smoke.failures || []).length > 2) problems.push(`${smoke.failures.length - 2} more in the smoke test`);
  } catch { /* the smoke test did not get as far as writing its results */ }
  try {
    const lines = fs.readFileSync(path.join(dir, 'seo.log'), 'utf8').split('\n');
    lines.forEach((line, i) => { if (line.startsWith('FAIL') && problems.length < 4) problems.push(`verify:seo:live ${line.slice(4).trim()}: ${(lines[i + 1] || '').trim().slice(0, 160)}`); });
  } catch { /* no log */ }
  return problems;
}

/**
 * Records the preview checks (the smoke test of every sitemap page with --expect-sha, and verify-seo-live's path
 * checks) on the status comment. Exit codes: 0 passed, 1 a page or check failed (blocks this commit), 3 or anything
 * else could not finish (tried again next run). Outputs outcome=pass|fail|incomplete.
 */
async function cmdSmokeResult(argv, deps) {
  const number = prNumber(argv);
  const sha = shaArg(argv);
  const smokeExit = String(option(argv, '--smoke-exit') ?? '');
  const seoExit = String(option(argv, '--seo-exit') ?? '');
  const dir = option(argv, '--dir');
  const gh = deps.client({ dryRun: false });
  let state;
  try { state = JSON.parse(fs.readFileSync(statePath(deps), 'utf8')); } catch { state = null; }
  if (!state || state.number !== number || state.sha !== sha) {
    const pr = await gh.get(`/repos/${deps.repo}/pulls/${number}`);
    state = { number, title: pr.title, sha, gates: [], previewUrl: null, notes: {} };
  }
  const outcome = smokeExit === '1' || seoExit === '1' ? 'fail' : smokeExit === '0' && seoExit === '0' ? 'pass' : 'incomplete';
  const exitText = (code) => (code === '' ? 'did not run' : code === '0' ? 'passed' : code === '1' ? 'failed' : code === '3' ? 'could not finish' : `exit ${code}`);
  const problems = previewProblems(dir);
  const detail = `smoke test ${exitText(smokeExit)}, verify:seo:live on the preview ${exitText(seoExit)}${problems.length ? `; ${problems.join('; ')}` : ''}`.slice(0, 600);
  const notes = { ...(state.notes || {}) };
  if (outcome === 'fail') notes['smoke-failed'] = `${detail}${deps.runUrl ? ` (run ${deps.runUrl})` : ''}`;
  const gates = state.gates.filter((g) => g.id !== 'smoke');
  const stage = { pass: 'smoke-passed', fail: 'smoke-failed', incomplete: 'smoke-incomplete' }[outcome];
  const body = statusBody(deps, { ...state, gates, notes }, { stage, extraRows: [{ id: 'smoke-run', label: 'Preview checks', ok: outcome === 'pass' ? true : outcome === 'fail' ? false : null, detail: `${detail}${deps.runUrl ? ` ([run](${deps.runUrl}))` : ''}` }] });
  const existing = await findStatusComment(gh, deps.repo, number);
  const done = await upsertStatusComment(gh, deps, number, existing, body);
  deps.setOutput('outcome', outcome);
  deps.log(`#${number}: preview checks ${outcome}: ${detail}; status comment ${done}`);
  deps.summary(`### Preview checks for #${number}: ${outcome === 'pass' ? 'passed' : outcome === 'fail' ? '**failed**' : '**did not finish**'}\n\n${cell(detail)}\n`);
  return 0;
}

/** After a merge request that errored: is the pull request merged at this head anyway (the answer was lost)? */
async function mergedAnyway(gh, deps, number, sha) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const pr = await gh.get(`/repos/${deps.repo}/pulls/${number}`);
      if (pr.merged && pr.head.sha === sha && /^[0-9a-f]{40}$/.test(pr.merge_commit_sha || '')) return pr.merge_commit_sha;
      if (pr.state === 'open') return null;
    } catch (error) { deps.log(`#${number}: could not re-read the pull request: ${error.message}`); }
    await deps.sleep(attempt * 5000);
  }
  return null;
}

async function cmdMerge(argv, deps) {
  const number = prNumber(argv);
  const sha = shaArg(argv);
  const gh = deps.client({ dryRun: false });
  const pr = await gh.get(`/repos/${deps.repo}/pulls/${number}`);
  let unchecked;
  try { unchecked = { items: await uncheckedMerges(gh, deps), error: null }; } catch (error) { unchecked = { items: [], error: error.message }; }
  const pause = await pausedItems(gh, deps.repo);
  const autopilot = await openAutopilotPrs(gh, deps.repo);
  const statusComment = await findStatusComment(gh, deps.repo, number);
  const result = await evaluateGates(gh, deps, pr, { pause, autopilot, statusComment, unchecked });
  if (pr.head.sha !== sha) {
    result.gates.push({ id: 'pinned', label: 'Head commit unchanged since evaluation', ok: false, detail: `head is now ${short(pr.head.sha)}, evaluated ${short(sha)}` });
    result.eligible = false;
  }
  if (!result.eligible) {
    const blocked = result.gates.filter((g) => g.ok !== true);
    deps.log(`#${number}: not merging; ${blocked.map((g) => `${g.id}: ${g.detail}`).join('; ')}`);
    deps.summary(`### Not merged: #${number}\n\n${gateTable(result.gates).join('\n')}\n`);
    return 1;
  }
  const commitMessage = [firstParagraph(pr.body), 'Merged by the autopilot merge workflow after all gates passed.'].filter(Boolean).join('\n\n');
  let mergeSha;
  try {
    const merged = await gh.write('PUT', `/repos/${deps.repo}/pulls/${number}/merge`, { merge_method: 'squash', sha, commit_title: `${pr.title} (#${number})`, commit_message: commitMessage }, `squash-merge #${number} at ${short(sha)}`);
    if (!merged || !merged.merged || !/^[0-9a-f]{40}$/.test(merged.sha || '')) throw new Error(`the merge API did not confirm a merge: ${JSON.stringify(merged).slice(0, 200)}`);
    mergeSha = merged.sha;
  } catch (error) {
    mergeSha = await mergedAnyway(gh, deps, number, sha);
    if (mergeSha) deps.log(`#${number}: the merge request failed (${error.message}), but the pull request is merged as ${mergeSha}; carrying on`);
    else {
      // GitHub said no (a ruleset, a merge queue, squash merging turned off): record it, so the commit is not retried every 15 minutes.
      if (error.status >= 400 && error.status < 500) {
        const why = `${error.status} ${error.apiMessage || error.message}`.slice(0, 300);
        const gates = result.gates.map((g) => (g.id === 'merge-refused' ? { ...g, ok: false, detail: `GitHub refused to merge this commit: ${why}. Push a commit to try again` } : g));
        try { await upsertStatusComment(gh, deps, number, statusComment, statusBody(deps, { ...result, gates, notes: { ...result.notes, 'merge-refused': why } }, { stage: 'merge-refused' })); } catch (writeError) { deps.log(`#${number}: could not record the refusal: ${writeError.message}`); }
      }
      deps.summary(`### Not merged: #${number}\n\nThe merge request failed: ${cell(error.message)}\n`);
      throw error;
    }
  }
  deps.setOutput('merge_sha', mergeSha);
  const body = [`Merged by the **Autopilot merge** workflow as \`${short(mergeSha)}\` (squash, pinned to \`${short(sha)}\`) after all gates and the preview checks passed.${deps.runUrl ? ` [Workflow run](${deps.runUrl}).` : ''}`, '', ...gateTable(result.gates), '', `Next: the workflow waits for the production deploy, checks ${CONFIG.productionUrl} and reverts this merge automatically if the live site is broken.`].join('\n');
  try { await gh.write('POST', `/repos/${deps.repo}/issues/${number}/comments`, { body }, `comment on #${number}`); } catch (error) { deps.log(`#${number}: merged, but the comment failed: ${error.message}`); }
  deps.log(`#${number}: merged as ${mergeSha}`);
  deps.summary(`### Merged #${number} as \`${short(mergeSha)}\`\n\n${gateTable(result.gates).join('\n')}\n`);
  return 0;
}

async function cmdWaitDeploy(argv, deps) {
  const sha = shaArg(argv);
  const gh = deps.client({ dryRun: false });
  const deadline = deps.now() + CONFIG.deployTimeoutMinutes * 60000;
  const give = (reason) => { deps.setOutput('reason', reason); deps.log(`wait-deploy: ${reason}`); deps.summary(`### Production deploy of \`${short(sha)}\`: **not live**\n\n${cell(reason)}\n`); return 1; };
  let deployUrl = null;
  let last = '';
  for (;;) {
    // One failed read (a 5xx, a timeout) is not a deploy problem: log it and keep polling until the deadline.
    let state;
    try {
      const found = await vercelDeployments(gh, deps.repo, sha, 'Production');
      const ready = found.find(({ status }) => status && status.state === 'success');
      if (ready) { deployUrl = ready.status.environment_url || null; break; }
      state = found.length ? (found[0].status ? found[0].status.state : 'pending') : 'not created yet';
    } catch (error) {
      state = `unknown (could not read deployments: ${error.message})`;
    }
    if (['failure', 'error'].includes(state)) return give(`Vercel's production deployment of ${short(sha)} reported ${state}. The change itself was not checked, so it was not reverted.`);
    if (state !== last) { deps.log(`wait-deploy: production deployment of ${short(sha)}: ${state}`); last = state; }
    if (deps.now() >= deadline) return give(`No successful Vercel production deployment of ${short(sha)} after ${CONFIG.deployTimeoutMinutes} minutes (last state: ${state}). The change itself was not checked, so it was not reverted.`);
    await deps.sleep(POLL_MS);
  }
  deps.log(`wait-deploy: Vercel reports the production deployment of ${short(sha)} ready${deployUrl ? ` (${deployUrl})` : ''}`);
  const versionDeadline = deps.now() + VERSION_TIMEOUT_MINUTES * 60000;
  let served = null;
  for (let n = 1; ; n += 1) {
    try {
      const response = await deps.fetchPublic(`${CONFIG.productionUrl}/version.json?cb=${Date.now()}-${n}`);
      served = response.ok ? (await response.json()).sha : `HTTP ${response.status}`;
    } catch (error) {
      served = `unreadable (${error.message})`;
    }
    if (served === sha) break;
    if (deps.now() >= versionDeadline) return give(`Vercel reported the production deployment of ${short(sha)} ready, but ${CONFIG.productionUrl}/version.json still names ${served} after ${VERSION_TIMEOUT_MINUTES} minutes. The change itself was not checked, so it was not reverted.`);
    await deps.sleep(10000);
  }
  deps.setOutput('deploy_url', deployUrl || '');
  deps.log(`wait-deploy: ${CONFIG.productionUrl} serves ${sha}`);
  deps.summary(`### Production deploy of \`${short(sha)}\`: live\n\n${CONFIG.productionUrl}/version.json names the merge commit.\n`);
  return 0;
}

/** The record that the live checks passed for a merge; without it (or an incident) the next evaluate stops merging. */
async function cmdRecordLive(argv, deps) {
  const number = prNumber(argv);
  const sha = shaArg(argv);
  const gh = deps.client({ dryRun: false });
  const body = `${liveOkMarker(sha)}\nThe live checks passed on ${CONFIG.productionUrl} for merge commit \`${short(sha)}\`: the smoke test of every sitemap page and \`npm run verify:seo:live\`.${deps.runUrl ? ` [Workflow run](${deps.runUrl}).` : ''}`;
  await retrying(deps, 'record-live', () => gh.write('POST', `/repos/${deps.repo}/issues/${number}/comments`, { body }, `record the live checks on #${number}`));
  deps.log(`#${number}: recorded that the live checks passed for ${sha}`);
  deps.summary(`### Live checks passed for \`${short(sha)}\` (#${number})\n`);
  return 0;
}

/**
 * The auto-revert reverses the whole squash merge, its ledger line and learnings included. Put main's ledger and
 * LEARNINGS.md back, so nothing recorded is lost (both are append-only), and mark the ledger entries the merge added
 * as reverted: verdict revert, the pull request, the day it shipped, the day it was reverted as its evaluation date,
 * and a note saying why (a complete record, as the guard requires of any entry moving to reverted). Returns their ids.
 */
function keepRecordsAfterRevert(sha, { cwd, git, pr = null }) {
  const show = (spec) => { try { return execFileSync('git', ['show', spec], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); } catch { return null; } };
  if (show(`refs/remotes/origin/${CONFIG.base}:${LEARNINGS}`) !== null) git(['checkout', `refs/remotes/origin/${CONFIG.base}`, '--', LEARNINGS]);
  const onMain = show(`refs/remotes/origin/${CONFIG.base}:${LEDGER}`);
  if (onMain === null) return [];
  const ids = (text) => new Set(String(text || '').split('\n').map((line) => { try { return JSON.parse(line).id; } catch { return null; } }).filter(Boolean));
  const before = ids(show(`${sha}^:${LEDGER}`));
  const addedByMerge = [...ids(show(`${sha}:${LEDGER}`))].filter((id) => !before.has(id));
  const date = new Date().toISOString().slice(0, 10);
  const shippedOn = (() => { try { return new Date(git(['show', '-s', '--format=%cI', sha])).toISOString().slice(0, 10); } catch { return date; } })();
  const marked = [];
  const text = onMain.split('\n').map((line) => {
    let entry;
    try { entry = JSON.parse(line); } catch { return line; }
    if (!entry || typeof entry !== 'object' || !addedByMerge.includes(entry.id) || entry.status === 'reverted') return line;
    entry.status = 'reverted';
    if (entry.verdict === null || entry.verdict === undefined) entry.verdict = 'revert';
    if ((entry.pr === null || entry.pr === undefined) && pr) entry.pr = pr;
    if (entry.shipped_on === null || entry.shipped_on === undefined) entry.shipped_on = shippedOn;
    if (entry.evaluated_on === null || entry.evaluated_on === undefined) entry.evaluated_on = date;
    entry.notes = [entry.notes, `Reverted automatically on ${date}: the live checks failed after merge ${short(sha)}.`].filter(Boolean).join(' ');
    marked.push(entry.id);
    return JSON.stringify(entry);
  }).join('\n');
  fs.mkdirSync(path.join(cwd, path.dirname(LEDGER)), { recursive: true });
  fs.writeFileSync(path.join(cwd, LEDGER), text);
  git(['add', '--', LEDGER]);
  return marked;
}

/** Reverts the merge commit on an up-to-date main and pushes it as github-actions[bot]. Never forces anything. */
function revertOnMain(sha, { cwd = ROOT, pr = null } = {}) {
  const git = (gitArgs) => execFileSync('git', gitArgs, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const bot = ['-c', `user.name=${BOT_LOGIN}`, '-c', `user.email=${BOT_EMAIL}`, '-c', 'commit.gpgsign=false'];
  const firstLine = (error) => String(error.stderr || error.message).trim().split('\n').filter(Boolean).pop() || 'unknown error';
  const abort = () => { try { git(['revert', '--abort']); } catch { /* nothing to abort */ } };
  try {
    git(['fetch', '--no-tags', '--quiet', 'origin', `+refs/heads/${CONFIG.base}:refs/remotes/origin/${CONFIG.base}`]);
  } catch (error) {
    return { pushed: false, detail: `not pushed: could not fetch ${CONFIG.base} (${firstLine(error)})` };
  }
  try { git(['merge-base', '--is-ancestor', sha, `refs/remotes/origin/${CONFIG.base}`]); } catch {
    return { pushed: false, detail: `not pushed: ${short(sha)} is not on ${CONFIG.base}` };
  }
  git(['checkout', '--quiet', '--force', '--detach', `refs/remotes/origin/${CONFIG.base}`]);
  try {
    git([...bot, 'revert', '--no-commit', sha]);
  } catch (error) {
    // A conflict only in the ledger or the learnings (a later line appended next to the merge's) is fine: main's
    // copies are kept below.
    const kept = [LEDGER, LEARNINGS];
    const conflicted = (() => { try { return git(['diff', '--name-only', '--diff-filter=U']).split('\n').filter(Boolean); } catch { return []; } })();
    if (!conflicted.length || conflicted.some((file) => !kept.includes(file))) {
      abort();
      return { pushed: false, detail: `not pushed: the revert conflicts with later commits on ${CONFIG.base} (${conflicted.filter((file) => !kept.includes(file)).join(', ') || firstLine(error)}); revert by hand` };
    }
  }
  let marked = [];
  try {
    marked = keepRecordsAfterRevert(sha, { cwd, git, pr });
    git([...bot, 'commit', '--quiet', '--no-edit']);
  } catch (error) {
    abort();
    return { pushed: false, detail: `not pushed: could not commit the revert with the ledger's entries kept (${firstLine(error)}); revert by hand` };
  }
  const revertSha = git(['rev-parse', 'HEAD']);
  try {
    git(['push', '--quiet', 'origin', `HEAD:refs/heads/${CONFIG.base}`]);
  } catch (error) {
    return { pushed: false, revertSha, detail: `not pushed: the push to ${CONFIG.base} was rejected (${firstLine(error)})` };
  }
  return { pushed: true, revertSha, detail: `pushed to ${CONFIG.base} as ${revertSha}${marked.length ? `; the ledger keeps ${marked.map((id) => `"${id}"`).join(', ')}, marked reverted` : ''}; the ledger and the learnings stay as they are on ${CONFIG.base}` };
}

/** Opens the incident issue (with both labels) and comments on the pull request. Returns the issue, or null on a dry run. */
async function openIncident(gh, deps, { number, title, sha, step, reason, revert, excerpt = '' }) {
  for (const name of [CONFIG.incidentLabel, CONFIG.pauseLabel]) {
    try {
      const existing = await gh.get(`/repos/${deps.repo}/labels/${encodeURIComponent(name)}`, { allow404: true });
      if (!existing) await gh.write('POST', `/repos/${deps.repo}/labels`, { name, color: LABEL_COLORS[name], description: name === CONFIG.pauseLabel ? 'Stops autopilot merges and runs while any open issue carries it' : 'Opened by the autopilot merge workflow' }, `create the ${name} label`);
    } catch (error) { deps.log(`incident: label ${name}: ${error.message}`); }
  }
  const prLink = `${deps.serverUrl}/${deps.repo}/pull/${number}`;
  const body = [
    incidentMarker(number),
    `The **Autopilot merge** workflow found a problem with the merge of #${number}. This issue carries \`${CONFIG.pauseLabel}\`, so no autopilot pull request merges until it is closed.`, '',
    `- **What failed:** ${step}: ${reason}`,
    `- **Pull request:** ${prLink} (${title})`,
    `- **Merge commit:** \`${sha}\``,
    `- **Revert:** ${revert.detail}`,
    deps.runUrl ? `- **Workflow run:** ${deps.runUrl}` : null,
    '',
    excerpt ? '<details><summary>Log excerpt (last lines)</summary>\n\n```\n' + excerpt + '\n```\n\n</details>\n' : null,
    '**Next steps.** Find the cause, ship a fix or confirm the revert is live, and check the site with `npm run autopilot:smoke -- --base https://splithappens.run --quick`. Close this issue to let autopilot merges resume. See [docs/AUTOPILOT.md](' + `${deps.serverUrl}/${deps.repo}/blob/main/docs/AUTOPILOT.md` + ').',
  ].filter((line) => line !== null).join('\n');
  const issue = await retrying(deps, 'incident', () => gh.write('POST', `/repos/${deps.repo}/issues`, { title: `Autopilot incident: ${title}`, body, labels: [CONFIG.incidentLabel, CONFIG.pauseLabel] }, `open the incident issue for #${number}`));
  if (issue) {
    deps.setOutput('issue_url', issue.html_url);
    try { await gh.write('POST', `/repos/${deps.repo}/issues/${number}/comments`, { body: `After this merge the ${step} failed: ${reason}. Revert: ${revert.detail}. Incident: ${issue.html_url}. Autopilot merges are paused until it is closed.` }, `comment on #${number}`); } catch (error) { deps.log(`incident: comment on #${number} failed: ${error.message}`); }
  }
  deps.log(`incident for #${number}: ${issue ? issue.html_url : 'issue not opened'}; revert ${revert.detail}`);
  deps.summary(`### Incident after merging #${number}\n\n- ${cell(step)}: ${cell(reason)}\n- Revert: ${cell(revert.detail)}\n- Issue: ${issue ? issue.html_url : 'not opened'}\n`);
  return issue;
}

async function cmdIncident(argv, deps) {
  const number = prNumber(argv);
  const sha = shaArg(argv);
  const reason = required(argv, '--reason');
  const step = option(argv, '--step') || 'post-deploy checks';
  const logFile = option(argv, '--log');
  const gh = deps.client({ dryRun: false });
  let pr = null;
  try { pr = await gh.get(`/repos/${deps.repo}/pulls/${number}`); } catch (error) { deps.log(`incident: could not read #${number}: ${error.message}`); }
  let revert = { pushed: false, detail: 'not attempted: the change itself was not found broken' };
  if (argv.includes('--revert')) {
    try { revert = deps.revert(sha, number); } catch (error) { revert = { pushed: false, detail: `not pushed: ${error.message.split('\n')[0]}` }; }
    deps.log(`incident: revert ${revert.detail}`);
    if (revert.revertSha) deps.setOutput('revert_sha', revert.revertSha);
  }
  let excerpt = '';
  if (logFile) {
    try { excerpt = fs.readFileSync(logFile, 'utf8').split('\n').slice(-60).join('\n').slice(-6000).replace(/`{3,}/g, '` ` `'); } catch (error) { excerpt = `(log not readable: ${error.message})`; }
  }
  await openIncident(gh, deps, { number, title: pr ? pr.title : `pull request #${number}`, sha, step, reason, revert, excerpt });
  return 0;
}

/**
 * A baseline is evidence only for the exact failures it observed, never a blanket exemption for smoke exit 1.
 * Keep route, viewport, browser mode AND message in the identity: another failure on an already broken page is
 * still new. Do not fuzzy-match messages (including measured CLS values), which could hide a worse failure.
 * Infrastructure failures are not page failures. Missing/malformed artifacts cannot prove a failure pre-existing.
 */
function smokeFailureSet(report) {
  if (!report || report.base !== CONFIG.productionUrl || !['quick', 'full'].includes(report.mode) || report.ok !== false ||
      !Array.isArray(report.failures) || !report.failures.length ||
      !report.failures.every((f) => f && typeof f.where === 'string' && f.where.length && typeof f.message === 'string' && f.message.length &&
        (f.infrastructure === undefined || typeof f.infrastructure === 'boolean'))) return null;
  const failures = report.failures.filter((f) => !f.infrastructure);
  return failures.length ? new Set(failures.map((f) => JSON.stringify([f.where, f.message]))) : null;
}

function liveCheckDecision({ smoke, seo, baselineExit, baseline, live }) {
  if (smoke === '0' && seo === '0') return { action: 'pass', reason: 'Both live checks passed.' };
  if (seo === '1') return { action: 'revert', reason: 'verify:seo:live failed after the deploy (the pre-merge SEO check passed).' };
  if (smoke === '1') {
    const before = baselineExit === '1' ? smokeFailureSet(baseline) : null;
    const after = smokeFailureSet(live);
    if (before && after) {
      const added = [...after].filter((failure) => !before.has(failure));
      if (!added.length) return { action: 'incident', reason: `Every live smoke failure (${after.size}) exactly matches a failure recorded before the merge, by page, viewport, browser mode and message. No new smoke failure was observed, so the change was not reverted.${seo === '0' ? '' : ' The SEO check also did not finish.'}` };
      const detail = added.slice(0, 10).map((failure) => { const [where, message] = JSON.parse(failure); return `${where}: ${message}`; }).join('; ');
      return { action: 'revert', reason: `The live smoke test has ${added.length} new failure(s) absent from the pre-merge baseline: ${detail}` };
    }
    return { action: 'revert', reason: `The live smoke test failed and matching pre-existing failures could not be established (baseline exit ${baselineExit || 'none'}; baseline/live artifacts missing, invalid or without comparable page failures).` };
  }
  return { action: 'incident', reason: `The live checks did not finish (smoke test exit ${smoke || 'none'}, verify:seo:live exit ${seo || 'none'}; 3 means the run could not complete). The change was not found broken and was not reverted; check the live site.` };
}

/** The workflow calls this one command so its artifact comparison and revert decision are covered by self-tests. */
async function cmdReportLive(argv, deps) {
  const number = prNumber(argv);
  const sha = shaArg(argv);
  const read = (flag) => {
    const file = option(argv, flag);
    if (!file) return null;
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (error) { deps.log(`report-live: ${flag} could not be read: ${error.message}`); return null; }
  };
  const decision = liveCheckDecision({ smoke: option(argv, '--smoke-exit'), seo: option(argv, '--seo-exit'), baselineExit: option(argv, '--baseline-exit'), baseline: read('--baseline'), live: read('--live') });
  deps.setOutput('live_action', decision.action);
  deps.log(`report-live: ${decision.action}: ${decision.reason}`);
  if (decision.action === 'pass') return cmdRecordLive(['--pr', String(number), '--sha', sha], deps);
  const log = option(argv, '--log');
  return cmdIncident(['--pr', String(number), '--sha', sha, '--step', 'live checks', '--reason', decision.reason,
    ...(decision.action === 'revert' ? ['--revert'] : []), ...(log ? ['--log', log] : [])], deps);
}

/** Opens an incident for every autopilot merge with no live-check record and no incident. The workflow runs it last, whatever happened. */
async function cmdReconcile(argv, deps) {
  const dryRun = argv.includes('--dry-run');
  const gh = deps.client({ dryRun });
  const { items, found } = await reconcileMerges(gh, deps);
  deps.log(`reconcile: ${found.length ? `${plural(found.length, 'autopilot merge')} without a live-check record (${found.map((m) => `#${m.number}`).join(', ')}); ${items.length ? `${items.length} still without an incident` : 'incidents opened'}` : `every autopilot merge of the last ${RECONCILE_DAYS} days is accounted for`}`);
  return items.length && !dryRun ? 1 : 0;
}

// ---------- Wiring ----------

function realDeps(env = process.env) {
  const repo = env.GITHUB_REPOSITORY || 'koolkam00/pace-notes';
  const serverUrl = env.GITHUB_SERVER_URL || 'https://github.com';
  const log = (line) => console.log(line);
  return {
    repo, serverUrl, env, log,
    runUrl: env.GITHUB_RUN_ID ? `${serverUrl}/${repo}/actions/runs/${env.GITHUB_RUN_ID}` : null,
    client: ({ dryRun }) => createClient({ token: env.GITHUB_TOKEN || '', fetchImpl: globalThis.fetch, apiUrl: (env.GITHUB_API_URL || 'https://api.github.com').replace(/\/$/, ''), dryRun, log }),
    fetchPublic: (url) => globalThis.fetch(url, { cache: 'no-store', headers: { 'user-agent': 'pace-notes-autopilot-merge' }, signal: AbortSignal.timeout(20000) }),
    now: () => Date.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    runGuard: (pr) => runGuardWithGit(pr),
    runLiveSeo: () => runProductionSeo(),
    revert: (sha, number) => revertOnMain(sha, { pr: number }),
    setOutput: (key, value) => { if (env.GITHUB_OUTPUT) fs.appendFileSync(env.GITHUB_OUTPUT, `${key}=${String(value ?? '').replace(/[\r\n]/g, ' ')}\n`); },
    summary: (text) => { if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `${text}\n`); },
  };
}

const COMMANDS = { evaluate: cmdEvaluate, 'smoke-result': cmdSmokeResult, merge: cmdMerge, 'wait-deploy': cmdWaitDeploy, 'record-live': cmdRecordLive, 'report-live': cmdReportLive, incident: cmdIncident, reconcile: cmdReconcile };
const USAGE = 'Usage: node scripts/autopilot-merge.cjs evaluate [--dry-run] [--pr <n>] | smoke-result --pr <n> --sha <sha> --smoke-exit <code> --seo-exit <code> [--dir <dir>] | merge --pr <n> --sha <sha> | wait-deploy --sha <sha> | record-live --pr <n> --sha <sha> | report-live --pr <n> --sha <sha> --smoke-exit <code> --seo-exit <code> --baseline-exit <code> --baseline <file> --live <file> [--log <file>] | incident --pr <n> --sha <sha> --reason <text> [--revert] [--step <name>] [--log <file>] | reconcile [--dry-run] | --self-test';

async function main(argv, deps = realDeps()) {
  if (argv.includes('--self-test')) return selfTest();
  const command = COMMANDS[argv[0]];
  if (!command) { console.error(`autopilot-merge: ${argv[0] ? `unknown command "${argv[0]}"` : 'no command'}\n${USAGE}`); return 2; }
  try {
    return await command(argv.slice(1), deps);
  } catch (error) {
    if (error instanceof UsageError) { console.error(`autopilot-merge: ${error.message}\n${USAGE}`); return 2; }
    console.error(`autopilot-merge ${argv[0]}: ${error.message}`);
    return 1;
  }
}

// ---------- Self-test ----------

const SHA = (c) => c.repeat(40);

function fixture() {
  const repo = 'koolkam00/pace-notes';
  const now = Date.parse('2026-10-14T12:00:00Z');
  const head = SHA('a');
  const vercel = { login: 'vercel[bot]' };
  return {
    repo, now,
    prs: {
      7: { number: 7, state: 'open', merged: false, draft: false, title: 'Clearer home hero', body: '<!-- template -->\nLead with the question runners ask.\n\nDetails follow.', html_url: `https://github.com/${repo}/pull/7`, created_at: '2026-10-14T10:00:00Z', mergeable: true, mergeable_state: 'clean', user: { login: 'koolkam00' }, labels: [{ name: 'autopilot' }], base: { ref: 'main' }, head: { ref: 'autopilot/2026-10-14-home-hero', sha: head, repo: { full_name: repo } } },
    },
    issues: [],
    checkRuns: [
      { id: 101, name: 'verify', head_sha: head, status: 'completed', conclusion: 'success', started_at: '2026-10-14T10:05:00Z', app: { slug: 'github-actions' }, check_suite: { id: 1 } },
      { id: 102, name: 'privacy-e2e', head_sha: head, status: 'completed', conclusion: 'success', started_at: '2026-10-14T10:05:00Z', app: { slug: 'github-actions' }, check_suite: { id: 1 } },
      { id: 103, name: 'Vercel Preview Comments', head_sha: head, status: 'completed', conclusion: 'success', started_at: '2026-10-14T10:05:00Z', app: { slug: 'vercel' }, check_suite: { id: 2 } },
      { id: 104, name: 'autopilot-guard', head_sha: head, status: 'completed', conclusion: 'success', started_at: '2026-10-14T10:05:00Z', app: { slug: 'github-actions' }, check_suite: { id: 3 } },
    ],
    checkSuites: { [head]: [{ id: 1, created_at: '2026-10-14T10:04:30Z' }, { id: 2, created_at: '2026-10-14T10:04:31Z' }] },
    workflowRuns: [{ id: 1, head_sha: head, path: '.github/workflows/site-validation.yml', check_suite_id: 1 }],
    statuses: { [head]: [{ id: 2, context: 'Vercel', state: 'success', creator: vercel, created_at: '2026-10-14T10:08:00Z', updated_at: '2026-10-14T10:08:00Z' }, { id: 1, context: 'Vercel', state: 'pending', creator: vercel, created_at: '2026-10-14T10:05:00Z', updated_at: '2026-10-14T10:05:00Z' }] },
    reviews: { 7: [] },
    timeline: { 7: [{ event: 'labeled', created_at: '2026-10-14T10:00:00Z' }] },
    behind: {},
    threads: { 7: [] },
    deployments: [{ id: 501, sha: head, environment: 'Preview', creator: vercel, created_at: '2026-10-14T10:06:00Z' }],
    deploymentStatuses: { 501: [{ id: 1, state: 'success', environment_url: 'https://htw-live-study-abc-koolkam00s-projects.vercel.app', creator: vercel, created_at: '2026-10-14T10:08:00Z' }] },
    comments: { 7: [] },
    labels: ['autopilot'],
    createdIssues: [],
    merges: [],
    faults: [],
    nextId: 9000,
  };
}

function mockFetch(state, calls) {
  const json = (status, data, headers = {}) => new Response(data === undefined ? '' : JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } });
  const route = async (u, method, body) => {
    const p = u.pathname.replace(`/repos/${state.repo}`, '');
    let m;
    if (method === 'POST' && u.pathname === '/graphql') return json(200, { data: { repository: { pullRequest: { reviewThreads: { totalCount: (state.threads[body.variables.number] || []).length, nodes: state.threads[body.variables.number] || [] } } } } });
    if (method === 'GET' && p === '/pulls') {
      // Pages of state.pullsPerPage when it is set, to exercise Link pagination; state.beforePullsPage(page) may change
      // the pull requests between pages.
      const wanted = u.searchParams.get('state') || 'open';
      if (state.beforePullsPage) state.beforePullsPage(Number(u.searchParams.get('page') || 1));
      const all = Object.values(state.prs).filter((pr) => pr.state === wanted).map(({ mergeable, merged_by: mergedBy, ...rest }) => rest);
      const size = state.pullsPerPage || Math.max(all.length, 1);
      const page = Number(u.searchParams.get('page') || 1);
      const more = page * size < all.length;
      return json(200, all.slice((page - 1) * size, page * size), more ? { link: `<${u.origin}${u.pathname}?state=${wanted}&per_page=100&page=${page + 1}>; rel="next"` } : {});
    }
    if (method === 'GET' && (m = /^\/pulls\/(\d+)$/.exec(p))) return state.prs[m[1]] ? json(200, state.prs[m[1]]) : json(404, { message: 'Not Found' });
    if (method === 'GET' && p === '/issues') {
      const wanted = u.searchParams.get('state') || 'open';
      return json(200, state.issues.filter((i) => (wanted === 'all' || i.state === wanted) && i.labels.some((l) => l.name === u.searchParams.get('labels'))));
    }
    if (method === 'GET' && (m = /^\/commits\/([0-9a-f]+)\/check-runs$/.exec(p))) { const runs = state.checkRuns.filter((r) => r.head_sha === m[1]); return json(200, { total_count: runs.length, check_runs: runs }); }
    if (method === 'GET' && (m = /^\/commits\/([0-9a-f]+)\/check-suites$/.exec(p))) return json(200, { check_suites: state.checkSuites[m[1]] || [] });
    if (method === 'GET' && p === '/actions/runs') return json(200, { workflow_runs: state.workflowRuns.filter((r) => r.head_sha === u.searchParams.get('head_sha')) });
    if (method === 'GET' && (m = /^\/commits\/([0-9a-f]+)\/statuses$/.exec(p))) return json(200, state.statuses[m[1]] || []);
    if (method === 'GET' && (m = /^\/pulls\/(\d+)\/reviews$/.exec(p))) return json(200, state.reviews[m[1]] || []);
    if (method === 'GET' && (m = /^\/issues\/(\d+)\/timeline$/.exec(p))) return json(200, state.timeline[m[1]] || []);
    if (method === 'GET' && (m = /^\/compare\/main\.\.\.([0-9a-f]+)$/.exec(p))) return json(200, { behind_by: state.behind[m[1]] || 0, ahead_by: 1 });
    if (method === 'GET' && p === '/deployments') return json(200, state.deployments.filter((d) => d.sha === u.searchParams.get('sha')));
    if (method === 'GET' && (m = /^\/deployments\/(\d+)\/statuses$/.exec(p))) return json(200, state.deploymentStatuses[m[1]] || []);
    if (method === 'GET' && (m = /^\/issues\/(\d+)\/comments$/.exec(p))) {
      // Two pages when there are more than two comments, to exercise Link pagination.
      const all = state.comments[m[1]] || [];
      const page = Number(u.searchParams.get('page') || 1);
      const items = all.length > 2 ? all.slice((page - 1) * 2, page * 2) : all;
      const more = all.length > 2 && page * 2 < all.length;
      return json(200, items, more ? { link: `<${u.origin}${u.pathname}?per_page=100&page=${page + 1}>; rel="next"` } : {});
    }
    if (method === 'POST' && (m = /^\/issues\/(\d+)\/comments$/.exec(p))) { const c = { id: (state.nextId += 1), user: { login: BOT_LOGIN }, body: body.body }; (state.comments[m[1]] = state.comments[m[1]] || []).push(c); return json(201, c); }
    if (method === 'PATCH' && (m = /^\/issues\/comments\/(\d+)$/.exec(p))) { const c = Object.values(state.comments).flat().find((x) => x.id === Number(m[1])); if (!c) return json(404, { message: 'Not Found' }); c.body = body.body; return json(200, c); }
    if (method === 'PUT' && (m = /^\/pulls\/(\d+)\/merge$/.exec(p))) {
      const pr = state.prs[m[1]];
      if (body.sha !== pr.head.sha) return json(409, { message: 'Head branch was modified' });
      state.merges.push({ number: Number(m[1]), ...body });
      Object.assign(pr, { state: 'closed', merged: true, merged_at: new Date(state.now).toISOString(), merge_commit_sha: SHA('d'), merged_by: { login: BOT_LOGIN } });
      return json(200, { sha: SHA('d'), merged: true, message: 'Pull Request successfully merged' });
    }
    if (method === 'GET' && (m = /^\/labels\/(.+)$/.exec(p))) return state.labels.includes(decodeURIComponent(m[1])) ? json(200, { name: decodeURIComponent(m[1]) }) : json(404, { message: 'Not Found' });
    if (method === 'POST' && p === '/labels') { state.labels.push(body.name); return json(201, { name: body.name }); }
    if (method === 'POST' && p === '/issues') {
      const issue = { number: (state.nextId += 1), html_url: `https://github.com/${state.repo}/issues/${state.nextId}`, state: 'open', user: { login: BOT_LOGIN }, title: body.title, body: body.body, labels: body.labels.map((name) => ({ name })) };
      state.createdIssues.push(issue);
      state.issues.push(issue);
      return json(201, issue);
    }
    return json(500, { message: `mock has no route for ${method} ${u.pathname}` });
  };
  return async (url, init = {}) => {
    const u = new URL(url);
    const method = (init.method || 'GET').toUpperCase();
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method, path: `${u.pathname}${u.search}`, body, auth: Boolean(init.headers && init.headers.authorization) });
    // Injected faults: answer with a status without doing anything, or do the work and lose the answer (a timeout).
    const fault = state.faults.find((f) => f.times > 0 && f.method === method && f.path.test(u.pathname));
    if (fault) {
      fault.times -= 1;
      if (fault.lost) { await route(u, method, body); throw new DOMException('The operation was aborted due to timeout', 'TimeoutError'); }
      return json(fault.status, { message: fault.message || 'Server Error' });
    }
    return route(u, method, body);
  };
}

function mockDeps(state, { token = 'test-token', env = {}, guard = { ok: true, detail: 'within the rules' }, liveSeo = { ok: true, detail: 'passes' }, clock, version } = {}) {
  const calls = [];
  const outputs = {};
  const logs = [];
  const summaries = [];
  const counts = { liveSeo: 0 };
  let time = clock !== undefined ? clock : state.now;
  const fetchImpl = mockFetch(state, calls);
  const deps = {
    repo: state.repo, serverUrl: 'https://github.com', env: { RUNNER_TEMP: state.tmp, ...env }, runUrl: 'https://github.com/koolkam00/pace-notes/actions/runs/1',
    log: (line) => logs.push(line),
    client: ({ dryRun }) => createClient({ token, fetchImpl, apiUrl: 'https://api.github.test', dryRun, log: (line) => logs.push(line), sleep: (ms) => deps.sleep(ms) }),
    fetchPublic: async () => (version ? version() : new Response(JSON.stringify({ sha: SHA('d') }), { status: 200 })),
    now: () => time,
    sleep: async (ms) => { time += ms; if (state.onSleep) state.onSleep(time); },
    runGuard: () => guard,
    runLiveSeo: () => { counts.liveSeo += 1; return liveSeo; },
    revert: () => ({ pushed: true, revertSha: SHA('e'), detail: `pushed to main as ${SHA('e')}` }),
    setOutput: (key, value) => { outputs[key] = value; },
    summary: (text) => summaries.push(text),
  };
  return { deps, calls, outputs, logs, summaries, counts };
}

async function selfTestAsync() {
  const failures = [];
  let checks = 0;
  const ok = (label, condition, detail = '') => { checks += 1; if (!condition) failures.push(`${label}${detail ? `: ${detail}` : ''}`); };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-merge-'));
  const fresh = (edit) => { const state = fixture(); state.tmp = tmp; if (edit) edit(state); return state; };
  const gatesOf = async (state, options) => {
    const { deps, counts } = mockDeps(state, options);
    const gh = deps.client({ dryRun: true });
    const pr = await gh.get(`/repos/${state.repo}/pulls/7`);
    const statusComment = await findStatusComment(gh, state.repo, 7);
    const result = await evaluateGates(gh, deps, pr, { pause: await pausedItems(gh, state.repo), autopilot: await openAutopilotPrs(gh, state.repo), statusComment, unchecked: { items: await uncheckedMerges(gh, deps), error: null } });
    return { ...result, counts };
  };
  const failing = (result) => result.gates.filter((g) => g.ok !== true).map((g) => g.id).sort().join(',');
  const gate = (result, id) => result.gates.find((g) => g.id === id) || {};
  const bodyOf = (state, number) => ((state.comments[number] || [])[0] || {}).body || '';
  const head = SHA('a');
  const old = SHA('b');
  const merged = SHA('d');
  // Another open pull request, a copy of #7 (an autopilot one unless extra says otherwise).
  const openPr = (s, number, extra = {}) => { s.prs[number] = { ...JSON.parse(JSON.stringify(s.prs[7])), number, title: `Another change ${number}`, ...extra }; s.reviews[number] = []; s.timeline[number] = []; s.threads[number] = []; s.comments[number] = []; };
  // A merged autopilot pull request in the recent past, as GitHub lists it.
  const mergedPr = (s, number, extra = {}) => { s.prs[number] = { ...JSON.parse(JSON.stringify(s.prs[7])), number, title: `Earlier change ${number}`, state: 'closed', merged: true, merged_at: '2026-10-13T09:00:00Z', merge_commit_sha: SHA('f'), merged_by: { login: 'koolkam00' }, ...extra }; s.comments[number] = s.comments[number] || []; };

  try {
    // Every gate passes on the fixture.
    const all = await gatesOf(fresh());
    ok('fixture: every gate passes', all.eligible && failing(all) === '', failing(all) || '');
    ok('fixture: preview URL found', all.previewUrl === 'https://htw-live-study-abc-koolkam00s-projects.vercel.app', all.previewUrl);
    ok('fixture: the live baseline runs once the other gates pass', all.counts.liveSeo === 1 && gate(all, 'production').ok === true);

    // Each gate failing on its own blocks.
    const SINGLE = [
      ['open', (s) => { s.prs[7].state = 'closed'; }, ['open', 'guard']],
      ['draft', (s) => { s.prs[7].draft = true; }],
      ['base', (s) => { s.prs[7].base.ref = 'develop'; }],
      ['same-repo', (s) => { s.prs[7].head.repo.full_name = 'someone/fork'; }, ['same-repo', 'guard']],
      ['branch', (s) => { s.prs[7].head.ref = 'feature/home-hero'; }],
      ['author', (s) => { s.prs[7].user.login = 'someone-else'; }],
      ['label', (s) => { s.prs[7].labels = []; }],
      ['block-labels: do-not-merge', (s) => { s.prs[7].labels.push({ name: 'do-not-merge' }); }, ['block-labels']],
      ['block-labels: needs-owner', (s) => { s.prs[7].labels.push({ name: 'autopilot:needs-owner' }); }, ['block-labels']],
      ['block-labels: paused on the PR itself', (s) => { s.prs[7].labels.push({ name: 'autopilot:paused' }); s.issues.push({ number: 7, state: 'open', title: 'x', labels: [{ name: 'autopilot:paused' }], pull_request: {} }); }, ['block-labels', 'pause']],
      ['pause', (s) => { s.issues.push({ number: 3, state: 'open', title: 'Autopilot log', labels: [{ name: 'autopilot:paused' }] }); }],
      ['variable: OFF', null, ['variable'], { env: { AUTOPILOT_MERGE: ' OFF ' } }],
      ['history', (s) => mergedPr(s, 5)],
      ['one-open: another labelled autopilot pull request', (s) => openPr(s, 8)],
      ['one-open: an unlabelled autopilot/ branch', (s) => openPr(s, 8, { labels: [], head: { ref: 'autopilot/2026-10-14-other', sha: old, repo: { full_name: s.repo } } })],
      ['one-open: an autopilot/ branch in a fork', (s) => openPr(s, 8, { labels: [], user: { login: 'someone' }, head: { ref: 'autopilot/2026-10-14-fork', sha: old, repo: { full_name: 'someone/pace-notes' } } })],
      ['checks: verify failed', (s) => { s.checkRuns[0].conclusion = 'failure'; }, ['checks']],
      ['checks: verify skipped', (s) => { s.checkRuns[0].conclusion = 'skipped'; }, ['checks']],
      ['checks: privacy-e2e neutral', (s) => { s.checkRuns[1].conclusion = 'neutral'; }, ['checks']],
      ['checks: privacy-e2e missing', (s) => { s.checkRuns.splice(1, 1); }, ['checks']],
      ['checks: another check failed', (s) => { s.checkRuns.push({ id: 105, name: 'build', head_sha: head, status: 'completed', conclusion: 'failure', started_at: '2026-10-14T10:06:00Z', app: { slug: 'github-actions' }, check_suite: { id: 4 } }); }, ['checks']],
      ['checks: the PR\'s own guard check failed', (s) => { s.checkRuns[3].conclusion = 'failure'; }, ['checks']],
      ['checks: another check still running', (s) => { s.checkRuns.push({ id: 105, name: 'build', head_sha: head, status: 'in_progress', conclusion: null, started_at: '2026-10-14T10:06:00Z', app: { slug: 'github-actions' }, check_suite: { id: 4 } }); }, ['checks']],
      ['checks: another app timed out', (s) => { s.checkRuns.push({ id: 105, name: 'Lint', head_sha: head, status: 'completed', conclusion: 'timed_out', started_at: '2026-10-14T10:06:00Z', app: { slug: 'some-app' }, check_suite: { id: 5 } }); }, ['checks']],
      ['statuses: Vercel failed', (s) => { s.statuses[head][0].state = 'failure'; }, ['statuses']],
      ['statuses: Vercel pending', (s) => { s.statuses[head][0].state = 'pending'; }, ['statuses']],
      ['statuses: only someone else says success', (s) => { s.statuses[head] = [{ id: 3, context: 'Vercel', state: 'success', creator: { login: 'koolkam00' }, created_at: '2026-10-14T10:09:00Z' }]; }, ['statuses']],
      ['guard', null, ['guard'], { guard: { ok: false, detail: '1 violation: protected-path lib/analytics.ts' } }],
      ['threads', (s) => { s.threads[7] = [{ isResolved: true, path: 'a.tsx' }, { isResolved: false, path: 'b.tsx' }]; }],
      ['reviews', (s) => { s.reviews[7] = [{ id: 1, user: { login: 'chatgpt-codex-connector[bot]' }, state: 'CHANGES_REQUESTED', submitted_at: '2026-10-14T10:30:00Z' }]; }],
      ['ready: opened 5 minutes ago', (s) => { s.prs[7].created_at = '2026-10-14T11:55:00Z'; }, ['ready']],
      ['ready: marked ready 5 minutes ago', (s) => { s.timeline[7].push({ event: 'ready_for_review', created_at: '2026-10-14T11:55:00Z' }); }, ['ready']],
      ['ready: a new commit pushed 2 minutes ago', (s) => { s.checkSuites[head] = [{ id: 9, created_at: '2026-10-14T11:58:00Z' }]; }, ['ready']],
      ['mergeable: conflicts', (s) => { s.prs[7].mergeable = false; s.prs[7].mergeable_state = 'dirty'; }, ['mergeable']],
      ['mergeable: still computing', (s) => { s.prs[7].mergeable = null; }, ['mergeable']],
      ['mergeable: behind main', (s) => { s.behind[head] = 2; }, ['mergeable']],
      ['preview: none', (s) => { s.deployments = []; }, ['preview']],
      ['preview: failed', (s) => { s.deploymentStatuses[501] = [{ id: 1, state: 'failure', creator: { login: 'vercel[bot]' }, created_at: '2026-10-14T10:08:00Z' }]; }, ['preview']],
      ['preview: not by Vercel', (s) => { s.deployments[0].creator = { login: 'someone' }; }, ['preview']],
      ['preview: production only', (s) => { s.deployments[0].environment = 'Production'; }, ['preview']],
      ['preview: an address that is not this project\'s preview', (s) => { s.deploymentStatuses[501][0].environment_url = 'https://attacker.example'; }, ['preview']],
      ['production: the live site already fails', null, ['production'], { liveSeo: { ok: null, detail: 'already fails' } }],
      ['smoke: failed earlier on this commit', (s) => { s.comments[7] = [{ id: 1, user: { login: BOT_LOGIN }, body: `${MARKER}\n${smokeFailedMarker(head)}` }]; }, ['smoke']],
      ['merge-refused: GitHub refused this commit before', (s) => { s.comments[7] = [{ id: 1, user: { login: BOT_LOGIN }, body: `${MARKER}\n${noteMarker('merge-refused', head, '405 Repository rule violations found')}` }]; }, ['merge-refused']],
    ];
    for (const [label, edit, expected, options] of SINGLE) {
      const id = label.split(':')[0];
      const result = await gatesOf(fresh(edit || undefined), options);
      const want = (expected || [id]).sort().join(',');
      ok(`gate ${label}: blocks on its own`, !result.eligible && failing(result) === want, `blocked by [${failing(result)}], expected [${want}]`);
    }
    const behind = await gatesOf(fresh((s) => { s.behind[head] = 3; }));
    ok('behind main says "needs main merged in"', gate(behind, 'mergeable').detail.includes('needs main merged in'));
    ok('the live baseline is not run while another gate fails', behind.counts.liveSeo === 0 && !behind.gates.some((g) => g.id === 'production'));
    for (const value of ['off', 'false', '0', 'no', 'disabled', 'stop', 'paused']) {
      const result = await gatesOf(fresh(), { env: { AUTOPILOT_MERGE: value } });
      ok(`AUTOPILOT_MERGE=${value} blocks (fail closed)`, !result.eligible && failing(result) === 'variable' && gate(result, 'variable').detail.includes(`"${value}"`));
    }
    for (const value of ['on', 'ON', '']) ok(`AUTOPILOT_MERGE="${value}" does not block`, (await gatesOf(fresh(), { env: { AUTOPILOT_MERGE: value } })).eligible);
    const smokeOld = await gatesOf(fresh((s) => { s.comments[7] = [{ id: 1, user: { login: BOT_LOGIN }, body: `${MARKER}\n${smokeFailedMarker(old)}` }]; }));
    ok('a smoke failure on an older commit does not block', smokeOld.eligible);
    const forged = await gatesOf(fresh((s) => { s.comments[7] = [{ id: 1, user: { login: 'someone' }, body: `${MARKER}\n${smokeFailedMarker(head)}` }]; }));
    ok("someone else's comment with the markers is ignored", forged.eligible);
    const liveOk = await gatesOf(fresh((s) => { mergedPr(s, 5); s.comments[5] = [{ id: 1, user: { login: BOT_LOGIN }, body: liveOkMarker(SHA('f')) }]; }));
    ok('history: a merge with the live-check record is accounted for', liveOk.eligible, failing(liveOk));
    const forgedLive = await gatesOf(fresh((s) => { mergedPr(s, 5); s.comments[5] = [{ id: 1, user: { login: 'koolkam00' }, body: liveOkMarker(SHA('f')) }]; }));
    ok('history: a live-check record from anyone else does not count', !forgedLive.eligible && failing(forgedLive) === 'history');
    const oldMerge = await gatesOf(fresh((s) => mergedPr(s, 5, { merged_at: '2026-09-20T09:00:00Z' })));
    ok(`history: merges older than ${RECONCILE_DAYS} days are not checked`, oldMerge.eligible);
    const otherBranch = await gatesOf(fresh((s) => mergedPr(s, 5, { head: { ref: 'redesign/x', sha: old, repo: { full_name: s.repo } }, labels: [] })));
    ok("history: the owner's own pull requests are not checked", otherBranch.eligible);

    // Checks: stale, in progress, other apps, this workflow's own jobs, and latest-attempt semantics.
    const stale = await gatesOf(fresh((s) => { for (const run of s.checkRuns) run.head_sha = old; }));
    ok('stale checks on an older commit do not count', !stale.eligible && gate(stale, 'checks').ok === null);
    const running = await gatesOf(fresh((s) => { s.checkRuns[1].status = 'in_progress'; s.checkRuns[1].conclusion = null; }));
    ok('a check still in progress blocks (waiting)', !running.eligible && gate(running, 'checks').ok === null);
    const otherRunning = await gatesOf(fresh((s) => { s.checkRuns.push({ id: 105, name: 'build', head_sha: head, status: 'in_progress', conclusion: null, started_at: '2026-10-14T10:06:00Z', app: { slug: 'github-actions' }, check_suite: { id: 4 } }); }));
    ok('another check still running waits, and says which', gate(otherRunning, 'checks').ok === null && gate(otherRunning, 'checks').detail.includes('build: in progress'), gate(otherRunning, 'checks').detail);
    const otherApp = await gatesOf(fresh((s) => { s.checkRuns[0].app.slug = 'some-app'; }));
    ok('a same-named check from another app does not count as the required one', !otherApp.eligible);
    const ownJob = await gatesOf(fresh((s) => { s.workflowRuns.push({ id: 2, head_sha: head, path: OWN_WORKFLOW, check_suite_id: 8 }); s.checkRuns.push({ id: 106, name: 'gate', head_sha: head, status: 'in_progress', conclusion: null, started_at: '2026-10-14T11:59:00Z', app: { slug: 'github-actions' }, check_suite: { id: 8 } }); }));
    ok("this workflow's own running job is left out", ownJob.eligible, failing(ownJob));
    const neutral = await gatesOf(fresh((s) => { s.checkRuns.push({ id: 105, name: 'optional', head_sha: head, status: 'completed', conclusion: 'skipped', started_at: '2026-10-14T10:06:00Z', app: { slug: 'github-actions' }, check_suite: { id: 4 } }); }));
    ok('a skipped check passes', neutral.eligible && gate(neutral, 'checks').detail.includes('3 other checks passed'), gate(neutral, 'checks').detail);
    const neutralOther = await gatesOf(fresh((s) => { s.checkRuns[2].conclusion = 'neutral'; }));
    ok('a neutral check from another app passes', neutralOther.eligible, failing(neutralOther));
    // A required check passes only by succeeding: skipped or neutral (a job whose condition was false) never passed.
    for (const [index, conclusion] of [[0, 'skipped'], [0, 'neutral'], [1, 'skipped'], [1, 'neutral'], [0, 'cancelled']]) {
      const result = await gatesOf(fresh((s) => { s.checkRuns[index].conclusion = conclusion; }));
      const name = index === 0 ? 'verify' : 'privacy-e2e';
      ok(`required check ${name} ${conclusion} fails, naming it`, !result.eligible && gate(result, 'checks').ok === false && gate(result, 'checks').detail.includes(`${name}: ${conclusion} (a required check must succeed)`), gate(result, 'checks').detail);
    }
    const rerunSkipped = await gatesOf(fresh((s) => { s.checkRuns.push({ ...s.checkRuns[0], id: 201, conclusion: 'skipped', started_at: '2026-10-14T11:00:00Z' }); }));
    ok('latest attempt: success then a skipped re-run of a required check fails', !rerunSkipped.eligible && gate(rerunSkipped, 'checks').ok === false && gate(rerunSkipped, 'checks').detail.includes('verify: skipped'), gate(rerunSkipped, 'checks').detail);
    const otherAppSuccess = await gatesOf(fresh((s) => { s.checkRuns[0].conclusion = 'skipped'; s.checkRuns.push({ ...s.checkRuns[0], id: 202, conclusion: 'success', app: { slug: 'some-app' }, check_suite: { id: 6 } }); }));
    ok('a same-named success from another app does not stand in for a skipped required check', !otherAppSuccess.eligible && gate(otherAppSuccess, 'checks').ok === false, gate(otherAppSuccess, 'checks').detail);
    const rerunFixed = await gatesOf(fresh((s) => { s.checkRuns[0].conclusion = 'failure'; s.checkRuns.push({ ...s.checkRuns[0], id: 201, conclusion: 'success', started_at: '2026-10-14T11:00:00Z' }); }));
    ok('latest attempt: failure then a successful re-run passes', rerunFixed.eligible, failing(rerunFixed));
    const rerunBroke = await gatesOf(fresh((s) => { s.checkRuns.push({ ...s.checkRuns[0], id: 201, conclusion: 'failure', started_at: '2026-10-14T11:00:00Z' }); }));
    ok('latest attempt: success then a failed re-run blocks', !rerunBroke.eligible && gate(rerunBroke, 'checks').ok === false);
    const rerunRunning = await gatesOf(fresh((s) => { s.checkRuns.push({ ...s.checkRuns[0], id: 201, status: 'queued', conclusion: null, started_at: '2026-10-14T11:00:00Z' }); }));
    ok('latest attempt: success then a queued re-run waits', !rerunRunning.eligible && gate(rerunRunning, 'checks').ok === null);
    const forgedPreview = await gatesOf(fresh((s) => { s.deploymentStatuses[501].push({ id: 2, state: 'success', environment_url: 'https://attacker.example', creator: { login: 'koolkam00' }, created_at: '2026-10-14T11:00:00Z' }); }));
    ok("a newer deployment status from someone else does not change the preview address", forgedPreview.eligible && forgedPreview.previewUrl === 'https://htw-live-study-abc-koolkam00s-projects.vercel.app', forgedPreview.previewUrl);

    // Reviews: latest decisive state per reviewer.
    const review = (login, state, minute) => ({ id: minute, user: { login }, state, submitted_at: `2026-10-14T10:${String(minute).padStart(2, '0')}:00Z` });
    for (const [label, reviews, pass] of [
      ['changes requested, then approved', [review('a', 'CHANGES_REQUESTED', 10), review('a', 'APPROVED', 20)], true],
      ['approved, then changes requested', [review('a', 'APPROVED', 10), review('a', 'CHANGES_REQUESTED', 20)], false],
      ['changes requested, then only a comment', [review('a', 'CHANGES_REQUESTED', 10), review('a', 'COMMENTED', 20)], false],
      ['changes requested, then dismissed', [review('a', 'CHANGES_REQUESTED', 10), review('a', 'DISMISSED', 20)], true],
      ['one reviewer approves, another requests changes', [review('a', 'APPROVED', 10), review('b', 'CHANGES_REQUESTED', 20)], false],
    ]) {
      const result = await gatesOf(fresh((s) => { s.reviews[7] = reviews; }));
      ok(`reviews: ${label}`, result.eligible === pass, failing(result));
    }
    const readyLong = await gatesOf(fresh((s) => { s.prs[7].created_at = '2026-10-01T00:00:00Z'; s.timeline[7].push({ event: 'ready_for_review', created_at: '2026-10-14T11:50:00Z' }); }));
    ok('ready time counts from the last ready_for_review event, not creation', gate(readyLong, 'ready').ok === null);
    const pushedLate = await gatesOf(fresh((s) => { s.checkSuites[head] = [{ id: 9, created_at: '2026-10-14T11:58:00Z' }]; }));
    ok('ready time restarts when a new commit arrives, by GitHub\'s clock', gate(pushedLate, 'ready').detail.includes('head commit pushed 2026-10-14 11:58 UTC') && gate(pushedLate, 'ready').detail.includes('can merge from 2026-10-14 12:13 UTC'), gate(pushedLate, 'ready').detail);

    // Unauthenticated reads: threads cannot be read, so nothing is eligible; writes are refused.
    const anon = await gatesOf(fresh(), { token: '' });
    ok('unauthenticated: review threads wait for a token', !anon.eligible && gate(anon, 'threads').detail.includes('GITHUB_TOKEN'));

    // evaluate: outputs, one open autopilot pull request at a time, the pause issue, the sticky comment, dry runs.
    {
      const state = fresh((s) => { openPr(s, 8); openPr(s, 9, { labels: [], head: { ref: 'feature/other', sha: old, repo: { full_name: s.repo } } }); });
      const run = mockDeps(state);
      const code = await cmdEvaluate([], run.deps);
      ok('evaluate: exits 0', code === 0);
      ok('evaluate: two labelled autopilot pull requests: neither merges', run.outputs.eligible === 'false' && run.outputs.candidate === 'false' && run.outputs.pr === '', JSON.stringify(run.outputs));
      ok('evaluate: each status comment fails the one-open gate, naming the other', state.comments[7].length === 1 && state.comments[8].length === 1 && state.comments[7][0].body.startsWith(MARKER)
        && bodyOf(state, 7).includes('| One open autopilot pull request | **fail** | #8 is open too;') && bodyOf(state, 8).includes('| One open autopilot pull request | **fail** | #7 is open too;'), bodyOf(state, 7));
      ok('evaluate: the job summary says why nothing merges', run.summaries.some((text) => text.includes('2 autopilot pull requests are open (#7, #8), so none merges in this run')));
      ok('evaluate: another open pull request is not an autopilot one and is not evaluated', state.comments[9].length === 0 && run.logs.some((l) => l.includes('2 open autopilot pull requests (#7, #8), so none merges')), run.logs[0]);
      const writes = () => run.calls.filter((c) => c.method !== 'GET' && c.path !== '/graphql').length;
      const before = writes();
      await cmdEvaluate([], run.deps);
      ok('evaluate: an unchanged status is not rewritten', writes() === before, `${writes() - before} writes`);
      state.checkRuns[0].conclusion = 'failure';
      await cmdEvaluate([], run.deps);
      const patched = run.calls.filter((c) => c.method === 'PATCH');
      ok('evaluate: a changed status edits the same comment', patched.length === 2 && state.comments[7].length === 1 && state.comments[8].length === 1 && state.comments[7][0].body.includes('verify: failure'), `${patched.length} edits`);
      state.checkRuns[0].conclusion = 'success';
      state.prs[8].state = 'closed';
      await cmdEvaluate([], run.deps);
      ok('evaluate: once the other is closed, the one left merges', run.outputs.eligible === 'true' && run.outputs.pr === '7' && run.outputs.sha === head && run.outputs.preview_url.startsWith('https://htw-live-study-'), JSON.stringify(run.outputs));
      ok('evaluate: its status comment says the gate passes now', state.comments[7].length === 1 && state.comments[7][0].body.includes('| One open autopilot pull request | pass | no other autopilot pull request is open |'));
    }
    {
      // An unlabelled autopilot/ branch, found on the second page of open pull requests.
      const state = fresh((s) => { s.pullsPerPage = 1; openPr(s, 8, { labels: [], head: { ref: 'autopilot/2026-10-14-other', sha: old, repo: { full_name: s.repo } } }); });
      const run = mockDeps(state);
      await cmdEvaluate([], run.deps);
      ok('evaluate: an unlabelled autopilot/ branch on page 2 blocks the labelled one', run.outputs.eligible === 'false' && bodyOf(state, 7).includes('#8 is open too'), bodyOf(state, 7));
      ok('evaluate: and is evaluated itself, failing the label gate too', state.comments[8].length === 1 && bodyOf(state, 8).includes('| Has the autopilot label | **fail** | missing |') && bodyOf(state, 8).includes('#7 is open too'));
    }
    {
      // One pull request a page: #7, `ordinary` other pull requests, then an unlabelled autopilot/ branch on the last page.
      const crowded = (ordinary) => fresh((s) => {
        s.pullsPerPage = 1;
        for (let n = 100; n < 100 + ordinary; n += 1) openPr(s, n, { labels: [], head: { ref: `feature/${n}`, sha: old, repo: { full_name: s.repo } } });
        openPr(s, 300, { labels: [], head: { ref: 'autopilot/2026-10-14-late', sha: old, repo: { full_name: s.repo } } });
      });
      const full = crowded(28);
      const run = mockDeps(full);
      ok('evaluate: an autopilot/ branch on page 30 of open pull requests is found', (await cmdEvaluate([], run.deps)) === 0 && run.outputs.eligible === 'false' && bodyOf(full, 7).includes('#300 is open too'), bodyOf(full, 7));
      const truncated = crowded(29);
      const run2 = mockDeps(truncated);
      let threw = null;
      try { await cmdEvaluate([], run2.deps); } catch (error) { threw = error; }
      ok('evaluate: more than 30 pages of open pull requests fails the run instead of missing one', threw && threw.message.includes('has more than 30 pages') && run2.outputs.eligible !== 'true' && truncated.comments[7].length === 0, threw ? threw.message : JSON.stringify(run2.outputs));
      const run3 = mockDeps(truncated);
      threw = null;
      try { await cmdMerge(['--pr', '7', '--sha', head], run3.deps); } catch (error) { threw = error; }
      ok('merge: refuses when the open pull requests cannot all be listed', threw && threw.message.includes('has more than 30 pages') && truncated.merges.length === 0, threw ? threw.message : 'did not throw');
    }
    {
      // #5 opens while the pages are read, so #7 is listed on page 1 and again on page 2: it counts once.
      const state = fresh((s) => {
        s.pullsPerPage = 1;
        openPr(s, 9, { labels: [], head: { ref: 'feature/other', sha: old, repo: { full_name: s.repo } } });
        s.beforePullsPage = (page) => { if (page === 2 && !s.prs[5]) openPr(s, 5, { labels: [], head: { ref: 'feature/new', sha: old, repo: { full_name: s.repo } } }); };
      });
      const run = mockDeps(state);
      await cmdEvaluate([], run.deps);
      const listed = run.calls.filter((c) => c.method === 'GET' && /\/pulls\?state=open/.test(c.path)).length;
      const read7 = run.calls.filter((c) => c.method === 'GET' && c.path === `/repos/${state.repo}/pulls/7`).length;
      ok('evaluate: a pull request listed twice while the pages shift counts once', listed === 3 && read7 === 1 && run.outputs.eligible === 'true' && run.outputs.pr === '7' && bodyOf(state, 7).includes('| One open autopilot pull request | pass |') && run.logs.some((l) => l.includes('1 open autopilot pull request (#7);')), `${listed} pages, #7 read ${read7} times; ${run.logs[0]}`);
    }
    {
      const state = fresh((s) => openPr(s, 8, { labels: [], user: { login: 'someone' }, head: { ref: 'autopilot/2026-10-14-fork', sha: old, repo: { full_name: 'someone/pace-notes' } } }));
      const run = mockDeps(state);
      let guardRuns = 0;
      run.deps.runGuard = () => { guardRuns += 1; return { ok: true, detail: 'within the rules' }; };
      await cmdEvaluate([], run.deps);
      ok('evaluate: an autopilot/ branch in a fork blocks the labelled one', run.outputs.eligible === 'false' && bodyOf(state, 7).includes('#8 is open too'));
      ok("evaluate: the fork's own table fails, and the guard never runs on it", bodyOf(state, 8).includes('head is in someone/pace-notes') && guardRuns === 1, `guard ran ${guardRuns} times`);
    }
    {
      const state = fresh((s) => openPr(s, 9, { labels: [], head: { ref: 'feature/other', sha: old, repo: { full_name: s.repo } } }));
      const run = mockDeps(state);
      await cmdEvaluate([], run.deps);
      ok('evaluate: a single autopilot pull request still merges next to an ordinary one', run.outputs.eligible === 'true' && run.outputs.pr === '7' && state.comments[9].length === 0 && run.logs.some((l) => l.includes('1 open autopilot pull request (#7);')), JSON.stringify(run.outputs));
    }
    {
      const state = fresh((s) => openPr(s, 8));
      const run = mockDeps(state);
      await cmdEvaluate(['--pr', '7', '--dry-run'], run.deps);
      ok('evaluate --pr: the one-open gate still counts the others', run.outputs.eligible === 'false' && run.outputs.candidate === 'false' && run.logs.some((l) => /FAIL\s+one-open\s+#8 is open too/.test(l)));
    }
    {
      const state = fresh((s) => { s.issues.push({ number: 3, state: 'open', title: 'Autopilot log', labels: [{ name: 'autopilot:paused' }] }); s.prs[8] = JSON.parse(JSON.stringify(s.prs[7])); s.prs[8].number = 8; s.reviews[8] = []; s.timeline[8] = []; s.threads[8] = []; s.comments[8] = []; });
      const run = mockDeps(state);
      await cmdEvaluate([], run.deps);
      ok('pause issue blocks every PR', run.outputs.eligible === 'false' && state.comments[7][0].body.includes('#3 is labelled autopilot:paused') && state.comments[8][0].body.includes('#3 is labelled autopilot:paused'));
    }
    {
      const state = fresh((s) => { s.comments[7] = [{ id: 1, user: { login: 'koolkam00' }, body: 'Looks good' }, { id: 2, user: { login: 'koolkam00' }, body: `quoting ${MARKER}` }, { id: 3, user: { login: 'chatgpt-codex-connector[bot]' }, body: 'review' }]; });
      const run = mockDeps(state);
      await cmdEvaluate([], run.deps);
      ok("evaluate: follows comment pages and never edits someone else's comment", state.comments[7].length === 4 && state.comments[7][1].body === `quoting ${MARKER}` && run.calls.filter((c) => c.method === 'PATCH').length === 0);
    }
    {
      const state = fresh();
      const run = mockDeps(state);
      await cmdEvaluate(['--dry-run'], run.deps);
      ok('dry run: writes nothing', run.calls.every((c) => c.method === 'GET' || c.path === '/graphql') && state.comments[7].length === 0);
      ok('dry run: never sets eligible (no merge)', run.outputs.eligible === 'false' && run.outputs.candidate === 'true' && run.outputs.pr === '7');
    }
    {
      const state = fresh();
      const run = mockDeps(state, { token: '' });
      await cmdEvaluate([], run.deps);
      ok('unauthenticated evaluate: reads without a token and writes nothing', run.calls.every((c) => !c.auth) && run.calls.every((c) => c.method === 'GET') && state.comments[7].length === 0 && run.outputs.eligible === 'false');
    }

    // Reads are retried: one bad answer from GitHub does not fail a scheduled run; a refusal is not retried.
    {
      const state = fresh((s) => { s.faults.push({ method: 'GET', path: /\/pulls$/, status: 502, times: 2 }, { method: 'GET', path: /\/issues$/, status: 429, times: 1 }); });
      const run = mockDeps(state);
      const code = await cmdEvaluate([], run.deps);
      ok('evaluate: a 502 and a 429 on reads are tried again', code === 0 && run.outputs.eligible === 'true' && run.logs.some((l) => /answered 502.*trying again/.test(l)), JSON.stringify(run.outputs));
      const down = fresh((s) => { s.faults.push({ method: 'GET', path: /\/pulls$/, status: 503, times: 9 }); });
      const threw = await cmdEvaluate([], mockDeps(down).deps).then(() => false, (error) => error.status === 503);
      ok('evaluate: a read that keeps failing still fails the run', threw);
      // Two reads of the list (the merge history, then the open pull requests), each tried once.
      const refused = fresh((s) => { s.faults.push({ method: 'GET', path: /\/pulls$/, status: 403, times: 9 }); });
      const refusedRun = mockDeps(refused);
      const refusedThrew = await cmdEvaluate([], refusedRun.deps).then(() => false, (error) => error.status === 403);
      ok('evaluate: a 403 is not tried again', refusedThrew && refusedRun.calls.filter((c) => c.path.startsWith('/repos/koolkam00/pace-notes/pulls?')).length === 2, String(refusedRun.calls.filter((c) => c.path.startsWith('/repos/koolkam00/pace-notes/pulls?')).length));
    }

    // Merges that were never live-checked: merged by hand, or a run that ended before the live checks.
    {
      const state = fresh((s) => mergedPr(s, 5));
      const run = mockDeps(state);
      await cmdEvaluate([], run.deps);
      const issue = state.createdIssues[0];
      ok('reconcile: a merge by hand opens a paused incident', state.createdIssues.length === 1 && issue.body.includes(incidentMarker(5)) && issue.body.includes('by koolkam00, not by the Autopilot merge workflow') && issue.labels.some((l) => l.name === 'autopilot:paused'), issue && issue.body);
      ok('reconcile: and nothing merges', run.outputs.eligible === 'false' && state.comments[7][0].body.includes(`#${issue.number} is labelled autopilot:paused`));
      await cmdEvaluate([], run.deps);
      ok('reconcile: the incident is opened once', state.createdIssues.length === 1);
      issue.state = 'closed';
      await cmdEvaluate([], run.deps);
      ok('reconcile: once the owner closes it, merges resume', state.createdIssues.length === 1 && run.outputs.eligible === 'true', JSON.stringify(run.outputs));
    }
    {
      const state = fresh((s) => { mergedPr(s, 5, { merged_by: { login: BOT_LOGIN } }); s.faults.push({ method: 'POST', path: /\/issues$/, status: 502, times: 3 }); });
      const run = mockDeps(state);
      await cmdEvaluate([], run.deps);
      ok('reconcile: if the incident cannot be opened, the history gate blocks', run.outputs.eligible === 'false' && state.createdIssues.length === 0 && state.comments[7][0].body.includes('#5 merged with no record'));
      await cmdEvaluate([], run.deps);
      ok('reconcile: the next run opens it', state.createdIssues.length === 1 && state.createdIssues[0].body.includes('the Autopilot merge workflow merged it'), state.createdIssues[0] && state.createdIssues[0].body);
    }
    {
      const state = fresh((s) => mergedPr(s, 5));
      const run = mockDeps(state);
      await cmdEvaluate(['--dry-run'], run.deps);
      ok('reconcile: a dry run reports the merge and writes nothing', state.createdIssues.length === 0 && run.logs.some((l) => l.includes('1 merge without a live-check record (#5)')) && run.logs.some((l) => /FAIL\s+history/.test(l)));
      const reconcile = mockDeps(state);
      ok('reconcile command: opens the incident', (await cmdReconcile([], reconcile.deps)) === 0 && state.createdIssues.length === 1);
    }

    // smoke-result, then merge.
    const smokeDir = path.join(tmp, 'preview');
    fs.mkdirSync(smokeDir, { recursive: true });
    fs.writeFileSync(path.join(smokeDir, 'smoke.json'), JSON.stringify({ failures: [{ where: '/tools [mobile]', message: 'pageerror: boom' }] }));
    fs.writeFileSync(path.join(smokeDir, 'seo.log'), 'PASS  /htw: 308 to /slowdown\n      308\n');
    {
      const state = fresh();
      const run = mockDeps(state);
      await cmdEvaluate([], run.deps);
      await cmdSmokeResult(['--pr', '7', '--sha', head, '--smoke-exit', '1', '--seo-exit', '0', '--dir', smokeDir], run.deps);
      ok('smoke-result failure: the status comment says so and records the commit', run.outputs.outcome === 'fail' && state.comments[7].length === 1 && state.comments[7][0].body.includes('preview checks failed') && readNotes(state.comments[7][0], head)['smoke-failed'] !== undefined);
      await cmdEvaluate([], run.deps);
      ok('after a smoke failure the same commit is not retried', run.outputs.eligible === 'false' && 'smoke-failed' in readNotes(state.comments[7][0], head));
      ok('the next evaluate keeps what failed, with the run link', state.comments[7][0].body.includes('/tools [mobile]: pageerror: boom') && state.comments[7][0].body.includes('actions/runs/1'), state.comments[7][0].body);
      state.prs[7].head.sha = SHA('c');
      for (const r of state.checkRuns) r.head_sha = SHA('c');
      state.statuses[SHA('c')] = state.statuses[head];
      state.checkSuites[SHA('c')] = state.checkSuites[head];
      state.deployments[0].sha = SHA('c');
      await cmdEvaluate([], run.deps);
      ok('a new commit clears the smoke failure', run.outputs.eligible === 'true' && run.outputs.sha === SHA('c'));
    }
    {
      const state = fresh();
      const run = mockDeps(state);
      await cmdEvaluate([], run.deps);
      await cmdSmokeResult(['--pr', '7', '--sha', head, '--smoke-exit', '0', '--seo-exit', '1', '--dir', smokeDir], run.deps);
      ok('smoke-result: verify:seo:live failing on the preview blocks the commit', run.outputs.outcome === 'fail' && 'smoke-failed' in readNotes(state.comments[7][0], head));
    }
    {
      const state = fresh();
      const run = mockDeps(state);
      await cmdEvaluate([], run.deps);
      await cmdSmokeResult(['--pr', '7', '--sha', head, '--smoke-exit', '3', '--seo-exit', '0'], run.deps);
      ok('smoke-result could not finish: says so without blocking the commit', run.outputs.outcome === 'incomplete' && state.comments[7][0].body.includes('did not finish') && !('smoke-failed' in readNotes(state.comments[7][0], head)));
      await cmdEvaluate([], run.deps);
      ok('after an unfinished smoke test the commit is tried again', run.outputs.eligible === 'true');
      await cmdSmokeResult(['--pr', '7', '--sha', head, '--smoke-exit', '', '--seo-exit', ''], run.deps);
      ok('smoke-result with no results (the job died) is unfinished, not failed', run.outputs.outcome === 'incomplete');
      await cmdSmokeResult(['--pr', '7', '--sha', head, '--smoke-exit', '0', '--seo-exit', '0'], run.deps);
      ok('smoke-result success: the status comment says it is merging', run.outputs.outcome === 'pass' && state.comments[7][0].body.includes('Merging now') && state.comments[7].length === 1);
    }
    {
      const state = fresh();
      const run = mockDeps(state);
      const code = await cmdMerge(['--pr', '7', '--sha', head], run.deps);
      const merge = state.merges[0];
      ok('merge: squash with the head SHA pinned', code === 0 && merge && merge.merge_method === 'squash' && merge.sha === head, JSON.stringify(merge));
      ok('merge: commit title is "<title> (#n)"', merge && merge.commit_title === 'Clearer home hero (#7)', merge && merge.commit_title);
      ok('merge: message is the first paragraph and the gate sentence', merge && merge.commit_message === 'Lead with the question runners ask.\n\nMerged by the autopilot merge workflow after all gates passed.', merge && JSON.stringify(merge.commit_message));
      ok('merge: outputs the merge commit', run.outputs.merge_sha === merged);
      ok('merge: comments on the PR with the gate table', state.comments[7].some((c) => c.body.includes('Merged by the **Autopilot merge** workflow') && c.body.includes('| Gate | Result | Detail |')));
      ok('merge: re-checks the live baseline first', run.counts.liveSeo === 1);
      const record = mockDeps(state);
      ok('record-live: leaves the record', (await cmdRecordLive(['--pr', '7', '--sha', merged], record.deps)) === 0 && state.comments[7].some((c) => c.body.includes(liveOkMarker(merged))));
      ok('record-live: the merge is then accounted for', (await uncheckedMerges(record.deps.client({ dryRun: true }), record.deps)).length === 0);
    }
    {
      const state = fresh((s) => { s.faults.push({ method: 'PUT', path: /\/merge$/, lost: true, times: 1 }); });
      const run = mockDeps(state);
      const code = await cmdMerge(['--pr', '7', '--sha', head], run.deps);
      ok('merge: an answer lost after GitHub merged still outputs the merge commit', code === 0 && run.outputs.merge_sha === merged && state.merges.length === 1, `code ${code}, ${JSON.stringify(run.outputs)}`);
    }
    {
      const state = fresh((s) => { s.faults.push({ method: 'PUT', path: /\/merge$/, status: 405, message: 'Repository rule violations found', times: 1 }); });
      const run = mockDeps(state);
      await cmdEvaluate([], run.deps);
      let threw = null;
      try { await cmdMerge(['--pr', '7', '--sha', head], run.deps); } catch (error) { threw = error; }
      ok('merge: a refused merge fails the step', threw && threw.status === 405 && !run.outputs.merge_sha);
      ok('merge: a refusal is recorded on the status comment', state.comments[7][0].body.includes('GitHub refused to merge this commit') && state.comments[7][0].body.includes('Repository rule violations found'), state.comments[7][0].body);
      await cmdEvaluate([], run.deps);
      ok('merge: a refused commit is not retried every run', run.outputs.eligible === 'false' && state.comments[7][0].body.includes('Repository rule violations found'));
    }
    {
      const state = fresh((s) => { s.faults.push({ method: 'PUT', path: /\/merge$/, status: 502, times: 1 }); });
      const run = mockDeps(state);
      await cmdEvaluate([], run.deps);
      let threw = null;
      try { await cmdMerge(['--pr', '7', '--sha', head], run.deps); } catch (error) { threw = error; }
      await cmdEvaluate([], run.deps);
      ok('merge: a 5xx that did not merge is tried again next run', threw && run.outputs.eligible === 'true');
    }
    {
      const state = fresh();
      const run = mockDeps(state);
      const code = await cmdMerge(['--pr', '7', '--sha', old], run.deps);
      ok('merge: refuses when the head moved since evaluation', code === 1 && state.merges.length === 0);
      const blocked = fresh((s) => { s.checkRuns[0].conclusion = 'failure'; });
      const run2 = mockDeps(blocked);
      ok('merge: re-checks the gates and refuses when one fails', (await cmdMerge(['--pr', '7', '--sha', head], run2.deps)) === 1 && blocked.merges.length === 0);
      const paused = fresh((s) => { s.issues.push({ number: 3, state: 'open', title: 'log', labels: [{ name: 'autopilot:paused' }] }); });
      const run3 = mockDeps(paused);
      ok('merge: refuses while paused', (await cmdMerge(['--pr', '7', '--sha', head], run3.deps)) === 1 && paused.merges.length === 0);
      const switchedOff = fresh();
      const run4 = mockDeps(switchedOff, { env: { AUTOPILOT_MERGE: 'false' } });
      ok('merge: refuses while AUTOPILOT_MERGE is not on', (await cmdMerge(['--pr', '7', '--sha', head], run4.deps)) === 1 && switchedOff.merges.length === 0);
      const second = fresh((s) => openPr(s, 8, { labels: [], head: { ref: 'autopilot/2026-10-14-other', sha: old, repo: { full_name: s.repo } } }));
      const run5 = mockDeps(second);
      ok('merge: refuses while another autopilot pull request is open', (await cmdMerge(['--pr', '7', '--sha', head], run5.deps)) === 1 && second.merges.length === 0 && run5.logs.some((l) => l.includes('one-open: #8 is open too')));
    }

    // wait-deploy.
    const production = (s, statuses) => { s.deployments.push({ id: 601, sha: merged, environment: 'Production', creator: { login: 'vercel[bot]' }, created_at: '2026-10-14T12:01:00Z' }); s.deploymentStatuses[601] = statuses.map((x) => ({ creator: { login: 'vercel[bot]' }, ...x })); };
    {
      const state = fresh((s) => production(s, [{ id: 1, state: 'in_progress', created_at: '2026-10-14T12:01:00Z' }]));
      state.onSleep = (t) => { if (t > state.now + 60000) state.deploymentStatuses[601] = [{ id: 2, state: 'success', environment_url: 'https://htw-live-study-xyz.vercel.app', creator: { login: 'vercel[bot]' }, created_at: '2026-10-14T12:03:00Z' }, ...state.deploymentStatuses[601]]; };
      let served = 0;
      const run = mockDeps(state, { version: () => new Response(JSON.stringify({ sha: (served += 1) < 3 ? head : merged }), { status: 200 }) });
      const code = await cmdWaitDeploy(['--sha', merged], run.deps);
      ok('wait-deploy: waits for success, then for version.json', code === 0 && served === 3 && run.outputs.deploy_url === 'https://htw-live-study-xyz.vercel.app', `code ${code}, version reads ${served}`);
    }
    {
      const state = fresh((s) => { production(s, [{ id: 2, state: 'success', environment_url: 'https://htw-live-study-xyz.vercel.app', created_at: '2026-10-14T12:03:00Z' }]); s.faults.push({ method: 'GET', path: /\/deployments$/, status: 502, times: 1 }); });
      const run = mockDeps(state);
      ok('wait-deploy: one failed read of the deployments is retried, not a deploy problem', (await cmdWaitDeploy(['--sha', merged], run.deps)) === 0);
    }
    {
      const state = fresh((s) => production(s, [{ id: 2, state: 'failure', created_at: '2026-10-14T12:03:00Z' }]));
      const failed = mockDeps(state);
      ok('wait-deploy: a failed deployment fails, with the reason', (await cmdWaitDeploy(['--sha', merged], failed.deps)) === 1 && /reported failure/.test(failed.outputs.reason || ''), failed.outputs.reason);
      const never = mockDeps(fresh());
      ok('wait-deploy: no deployment within 30 minutes fails, with the reason', (await cmdWaitDeploy(['--sha', merged], never.deps)) === 1 && /after 30 minutes/.test(never.outputs.reason || ''), never.outputs.reason);
      const preview = fresh((s) => { s.deployments.push({ id: 602, sha: merged, environment: 'Preview', creator: { login: 'vercel[bot]' }, created_at: '2026-10-14T12:01:00Z' }); s.deploymentStatuses[602] = [{ id: 1, state: 'success', creator: { login: 'vercel[bot]' }, created_at: '2026-10-14T12:02:00Z' }]; });
      ok('wait-deploy: a Preview deployment does not count', (await cmdWaitDeploy(['--sha', merged], mockDeps(preview).deps)) === 1);
      const forgedProd = fresh((s) => production(s, [{ id: 2, state: 'success', creator: { login: 'koolkam00' }, created_at: '2026-10-14T12:03:00Z' }]));
      ok('wait-deploy: a success status from someone else does not count', (await cmdWaitDeploy(['--sha', merged], mockDeps(forgedProd).deps)) === 1);
      const stale = fresh((s) => production(s, [{ id: 2, state: 'success', created_at: '2026-10-14T12:03:00Z' }]));
      const staleRun = mockDeps(stale, { version: () => new Response(JSON.stringify({ sha: head }), { status: 200 }) });
      ok('wait-deploy: version.json never naming the merge fails, with the reason', (await cmdWaitDeploy(['--sha', merged], staleRun.deps)) === 1 && /version\.json still names/.test(staleRun.outputs.reason || ''));
    }

    // The exact command called by the report job: artifacts -> failure-set comparison -> record/incident/revert.
    {
      const oldFailure = { where: '/about [mobile, old Safari]', message: 'pageerror: old Safari crash' };
      const newFailure = { where: '/stories/example [mobile]', message: 'HTTP 404' };
      const infrastructure = { where: 'sitemap.xml', message: 'could not be read', infrastructure: true };
      const report = (failures, extra = {}) => ({ base: CONFIG.productionUrl, mode: 'full', ok: failures.length === 0, failures, ...extra });
      const existing = report([oldFailure]);
      const changed = report([oldFailure, newFailure]);
      const cases = [
        ['both checks pass even with a failed baseline', '0', '0', '1', existing, report([]), 'pass'],
        ['pre-existing failure plus a new route failure reverts', '1', '0', '1', existing, changed, 'revert'],
        ['same count but a different failure reverts', '1', '0', '1', existing, report([newFailure]), 'revert'],
        ['another failure on the same page reverts', '1', '0', '1', existing, report([{ ...oldFailure, message: 'HTTP 500' }]), 'revert'],
        ['a different viewport reverts', '1', '0', '1', existing, report([{ ...oldFailure, where: '/about [desktop]' }]), 'revert'],
        ['a different browser mode reverts', '1', '0', '1', existing, report([{ ...oldFailure, where: '/about [mobile]' }]), 'revert'],
        ['only identical pre-existing failures do not revert', '1', '0', '1', existing, existing, 'incident'],
        ['a subset of earlier failures does not revert', '1', '0', '1', changed, existing, 'incident'],
        ['ordering and duplicate failure messages do not matter', '1', '0', '1', changed, report([newFailure, oldFailure, oldFailure]), 'incident'],
        ['a passed baseline never suppresses a failure', '1', '0', '0', existing, existing, 'revert'],
        ['an incomplete baseline never suppresses a failure', '1', '0', '3', existing, existing, 'revert'],
        ['missing baseline output never suppresses a failure', '1', '0', '', existing, existing, 'revert'],
        ['missing baseline artifact never suppresses a failure', '1', '0', '1', null, existing, 'revert'],
        ['malformed baseline JSON never suppresses a failure', '1', '0', '1', '{broken', existing, 'revert'],
        ['invalid baseline entries never suppress a failure', '1', '0', '1', report([oldFailure, null]), existing, 'revert'],
        ['empty baseline failure list never suppresses a failure', '1', '0', '1', report([]), existing, 'revert'],
        ['preview artifacts cannot count as production baseline', '1', '0', '1', report([oldFailure], { base: 'https://preview.vercel.app' }), existing, 'revert'],
        ['missing live artifact cannot prove failures pre-existing', '1', '0', '1', existing, null, 'revert'],
        ['malformed live JSON cannot prove failures pre-existing', '1', '0', '1', existing, '{broken', 'revert'],
        ['invalid live entries cannot prove failures pre-existing', '1', '0', '1', existing, report([oldFailure, {}]), 'revert'],
        ['an inconsistent passed report cannot suppress failure', '1', '0', '1', report([oldFailure], { ok: true }), existing, 'revert'],
        ['infrastructure failures do not disguise a new page failure', '1', '0', '1', report([oldFailure, { ...newFailure, infrastructure: true }]), changed, 'revert'],
        ['known failures with an incomplete SEO run open an incident', '1', '3', '1', existing, existing, 'incident'],
        ['known failures and an infrastructure error open an incident', '1', '0', '1', existing, report([oldFailure, infrastructure]), 'incident'],
        ['SEO failure reverts even with identical smoke failures', '1', '1', '1', existing, existing, 'revert'],
        ['SEO failure reverts even if smoke could not finish', '3', '1', '1', existing, null, 'revert'],
        ['unfinished smoke alone never reverts', '3', '0', '1', existing, report([infrastructure]), 'incident'],
        ['unfinished SEO alone never reverts', '0', '3', '0', report([]), report([]), 'incident'],
        ['missing outputs open an incident without reverting', '', '', '', null, null, 'incident'],
      ];
      const baselineFile = path.join(tmp, 'baseline.json');
      const liveFile = path.join(tmp, 'live.json');
      const write = (file, value) => { if (value === null) fs.rmSync(file, { force: true }); else fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value)); };
      for (const [label, smoke, seo, baselineExit, before, after, action] of cases) {
        write(baselineFile, before); write(liveFile, after);
        const state = fresh();
        const run = mockDeps(state);
        let reverts = 0;
        run.deps.revert = (sha, pr) => { reverts += 1; ok(`report-live ${label}: revert target is pinned`, sha === merged && pr === 7); return { pushed: true, revertSha: SHA('e'), detail: 'test revert' }; };
        const code = await main(['report-live', '--pr', '7', '--sha', merged, '--smoke-exit', smoke, '--seo-exit', seo,
          '--baseline-exit', baselineExit, '--baseline', baselineFile, '--live', liveFile], run.deps);
        ok(`report-live ${label}: correct action`, code === 0 && run.outputs.live_action === action && reverts === (action === 'revert' ? 1 : 0), JSON.stringify(run.outputs));
        ok(`report-live ${label}: recorded or paused`, action === 'pass'
          ? state.createdIssues.length === 0 && state.comments[7].some((c) => c.body.includes(liveOkMarker(merged)))
          : state.createdIssues.length === 1 && state.createdIssues[0].labels.some((l) => l.name === CONFIG.pauseLabel));
      }
      const workflow = fs.readFileSync(path.join(ROOT, OWN_WORKFLOW), 'utf8');
      const reportJob = workflow.slice(workflow.indexOf('  report:'));
      ok('workflow: report job downloads baseline artifacts', /name: preview-checks[\s\S]*path: \$\{\{ runner.temp \}\}\/preview/.test(reportJob));
      ok('workflow: delegates the live decision to the tested command with both artifacts', reportJob.includes('autopilot-merge.cjs report-live') && reportJob.includes('--baseline "$RUNNER_TEMP/preview/baseline.json" --live "$RUNNER_TEMP/live/smoke.json"'));
      ok('workflow: production baseline has full coverage, not quick-only', workflow.includes('--base https://splithappens.run --json "$RUNNER_TEMP/preview/baseline.json"') && !workflow.includes('--quick --json "$RUNNER_TEMP/preview/baseline.json"'));
      ok('workflow: no aggregate baseline exit-code exemption remains', !reportJob.includes("env.BASELINE == '1'") && !reportJob.includes("env.BASELINE != '1'"));
    }

    // incident.
    {
      const state = fresh((s) => { s.faults.push({ method: 'POST', path: /\/issues$/, status: 502, times: 1 }); });
      fs.writeFileSync(path.join(tmp, 'smoke.log'), 'line 1\n```\nFAIL: / [mobile]: pageerror: boom\n');
      const run = mockDeps(state);
      const code = await cmdIncident(['--pr', '7', '--sha', merged, '--reason', 'live smoke test failed', '--revert', '--step', 'live smoke test', '--log', path.join(tmp, 'smoke.log')], run.deps);
      const issue = state.createdIssues[0];
      ok('incident: opens an issue with both labels (after one failed try)', code === 0 && state.createdIssues.length === 1 && issue.title === 'Autopilot incident: Clearer home hero' && ['autopilot-incident', 'autopilot:paused'].every((name) => issue.labels.some((l) => l.name === name)));
      ok('incident: creates missing labels first', state.labels.includes('autopilot-incident') && state.labels.includes('autopilot:paused'));
      ok('incident: the body names the step, PR, merge commit, revert and run', issue && [incidentMarker(7), 'live smoke test: live smoke test failed', 'https://github.com/koolkam00/pace-notes/pull/7', merged, `pushed to main as ${SHA('e')}`, 'actions/runs/1', 'pageerror: boom'].every((text) => issue.body.includes(text)), issue && issue.body);
      ok('incident: a fence in the log cannot break the excerpt', issue && (issue.body.match(/```/g) || []).length === 2);
      ok('incident: comments on the PR with the link', state.comments[7].some((c) => c.body.includes(issue.html_url)));
      ok('incident: outputs the revert commit', run.outputs.revert_sha === SHA('e'));
      const noRevert = fresh();
      const run2 = mockDeps(noRevert);
      run2.deps.revert = () => { throw new Error('must not revert'); };
      await cmdIncident(['--pr', '7', '--sha', merged, '--reason', 'deploy timed out', '--step', 'wait-deploy'], run2.deps);
      ok('incident without --revert: no revert, says why', noRevert.createdIssues[0] && noRevert.createdIssues[0].body.includes('not attempted'));
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  // Reverts in real temporary repositories: pushed, conflicting, rejected; the ledger keeps its entries.
  const ledgerLine = (id, extra = {}) => JSON.stringify({ id, date: id.slice(0, 10), kind: 'change', title: 'A change', hypothesis: 'Clearer copy helps.', primary_metric: 'answered_visit_rate@v1', guardrails: ['one_page_no_action_rate@v1'], baseline: {}, decision_rule: 'Keep if the rate rises.', evaluate_after: '2026-10-28', status: 'proposed', pr: null, verdict: null, result: null, ...extra });
  const revertCase = async (label, setup, expectPushed, { ledger = false, sameFailures = false } = {}) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-revert-'));
    const g = (cwd, ...a) => execFileSync('git', ['-c', 'user.name=Self Test', '-c', 'user.email=self-test@example.invalid', '-c', 'commit.gpgsign=false', ...a], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    try {
      const origin = path.join(dir, 'origin.git');
      const work = path.join(dir, 'work');
      g(dir, 'init', '-q', '--bare', '-b', 'main', origin);
      g(dir, 'clone', '-q', origin, work);
      g(work, 'symbolic-ref', 'HEAD', 'refs/heads/main');
      fs.writeFileSync(path.join(work, 'page.txt'), 'one\ntwo\nthree\n');
      fs.mkdirSync(path.join(work, 'autopilot'));
      fs.writeFileSync(path.join(work, LEDGER), `${ledgerLine('2026-10-01-a', { status: 'shipped' })}\n`);
      fs.writeFileSync(path.join(work, LEARNINGS), '# Learnings\n- 2026-10-01: first.\n');
      g(work, 'add', '-A'); g(work, 'commit', '-q', '-m', 'base'); g(work, 'push', '-q', 'origin', 'main');
      fs.writeFileSync(path.join(work, 'page.txt'), 'one\nTWO\nthree\n');
      fs.appendFileSync(path.join(work, LEDGER), `${ledgerLine('2026-10-14-b')}\n`);
      fs.appendFileSync(path.join(work, LEARNINGS), '- 2026-10-14: phone visitors read the first screen.\n');
      g(work, 'commit', '-q', '-am', 'Autopilot change (#7)'); g(work, 'push', '-q', 'origin', 'main');
      const mergeSha = g(work, 'rev-parse', 'HEAD');
      setup({ g, origin, work });
      // Exercise the real report command and real git revert/push against this disposable local origin.
      const before = { base: CONFIG.productionUrl, mode: 'full', ok: false, failures: [{ where: '/about [mobile]', message: 'pageerror: existing problem' }] };
      const after = { ...before, failures: [...before.failures, ...(sameFailures ? [] : [{ where: '/tools [mobile]', message: 'pageerror: new regression' }])] };
      fs.writeFileSync(path.join(dir, 'baseline.json'), JSON.stringify(before));
      fs.writeFileSync(path.join(dir, 'live.json'), JSON.stringify(after));
      const state = fixture(); state.tmp = dir;
      const run = mockDeps(state);
      let result = { pushed: false, detail: 'not attempted' };
      let attempts = 0;
      run.deps.revert = (sha, number) => { attempts += 1; result = revertOnMain(sha, { cwd: work, pr: number }); return result; };
      await cmdReportLive(['--pr', '7', '--sha', mergeSha, '--smoke-exit', '1', '--seo-exit', '0', '--baseline-exit', '1',
        '--baseline', path.join(dir, 'baseline.json'), '--live', path.join(dir, 'live.json')], run.deps);
      ok(`revert: ${label}: report command selects the correct action`, run.outputs.live_action === (sameFailures ? 'incident' : 'revert') && attempts === (sameFailures ? 0 : 1));
      ok(`revert: ${label}: an incident pauses future merges`, state.createdIssues.length === 1 && state.createdIssues[0].labels.some((l) => l.name === CONFIG.pauseLabel));
      ok(`revert: ${label}`, result.pushed === expectPushed, result.detail);
      if (sameFailures) ok(`revert: ${label}: remote stays at the original merge`, g(origin, 'rev-parse', 'main') === mergeSha && g(origin, 'show', 'main:page.txt') === 'one\nTWO\nthree');
      if (expectPushed) {
        ok(`revert: ${label}: main has the old text`, g(origin, 'show', 'main:page.txt') === 'one\ntwo\nthree');
        ok(`revert: ${label}: authored by github-actions[bot]`, g(origin, 'log', '-1', '--format=%an <%ae>', 'main') === `${BOT_LOGIN} <${BOT_EMAIL}>`);
        const lines = g(origin, 'show', `main:${LEDGER}`).split('\n').map((line) => JSON.parse(line));
        const reverted = lines.find((entry) => entry.id === '2026-10-14-b');
        ok(`revert: ${label}: the ledger keeps the reverted change's entry, marked reverted`, lines[0].id === '2026-10-01-a' && lines[0].status === 'shipped' && reverted && reverted.status === 'reverted' && reverted.verdict === 'revert' && /Reverted automatically/.test(reverted.notes), JSON.stringify(lines));
        ok(`revert: ${label}: the entry names the pull request and the day it shipped`, reverted && reverted.pr === 7 && reverted.shipped_on === new Date(g(work, 'show', '-s', '--format=%cI', mergeSha)).toISOString().slice(0, 10), JSON.stringify(reverted));
        ok(`revert: ${label}: the entry is dated the day it was reverted`, reverted && /^\d{4}-\d{2}-\d{2}$/.test(reverted.evaluated_on) && reverted.notes.includes(`Reverted automatically on ${reverted.evaluated_on}:`), JSON.stringify(reverted));
        // The guard's own ledger rules (as a later pull request touching the line would apply them) accept the record.
        const ruled = { violations: [], warnings: [] };
        const guard = require('./autopilot-guard.cjs');
        guard.checkLedger(g(origin, 'show', `main~1:${LEDGER}`), g(origin, 'show', `main:${LEDGER}`), { ...ruled, bookkeeping: true, metrics: guard.metricNames(fs.readFileSync(path.join(ROOT, 'autopilot/metrics.md'), 'utf8')) });
        ok(`revert: ${label}: the reverted entry passes the guard's ledger rules, metric names included`, ruled.violations.length === 0 && !ruled.warnings.some((w) => w.message.includes('metrics.md')), JSON.stringify([...ruled.violations, ...ruled.warnings]));
        ok(`revert: ${label}: the learnings keep the reverted change's line`, g(origin, 'show', `main:${LEARNINGS}`).includes('phone visitors read the first screen'));
        if (ledger) ok(`revert: ${label}: a later entry on main is left alone`, lines.some((entry) => entry.id === '2026-10-14-c' && entry.status === 'proposed'), JSON.stringify(lines));
        ok(`revert: ${label}: one commit`, g(origin, 'rev-list', '--count', 'main') === String(Number(g(work, 'rev-list', '--count', mergeSha)) + (ledger ? 2 : 1)));
      } else {
        ok(`revert: ${label}: no revert in progress afterwards`, !fs.existsSync(path.join(work, '.git', 'REVERT_HEAD')));
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
  await revertCase('only pre-existing failures leave main untouched', () => {}, false, { sameFailures: true });
  await revertCase('a clean revert is pushed', () => {}, true);
  await revertCase('a later commit on main is kept', ({ g, work }) => { fs.writeFileSync(path.join(work, 'other.txt'), 'x\n'); fs.appendFileSync(path.join(work, LEDGER), `${ledgerLine('2026-10-14-c')}\n`); fs.appendFileSync(path.join(work, LEARNINGS), '- 2026-10-15: a later learning.\n'); g(work, 'add', '-A'); g(work, 'commit', '-q', '-m', 'later'); g(work, 'push', '-q', 'origin', 'main'); g(work, 'reset', '-q', '--hard', 'HEAD~1'); }, true, { ledger: true });
  await revertCase('a conflict is skipped', ({ g, work }) => { fs.writeFileSync(path.join(work, 'page.txt'), 'one\nTWO!\nthree\n'); g(work, 'commit', '-q', '-am', 'later edit'); g(work, 'push', '-q', 'origin', 'main'); }, false);
  await revertCase('a rejected push is skipped', ({ origin }) => { fs.writeFileSync(path.join(origin, 'hooks', 'pre-receive'), '#!/bin/sh\necho "protected branch" >&2\nexit 1\n', { mode: 0o755 }); }, false);

  if (failures.length) {
    console.error(`autopilot-merge self-test: ${failures.length} of ${checks} checks failed`);
    for (const failure of failures) console.error(`  ${failure}`);
    return 1;
  }
  console.log(`autopilot-merge self-test: ${checks} checks passed (every gate on its own, pause, one open autopilot pull request, merge history, every check run and required checks that must succeed, stale and re-run checks, reviews, status comment and its notes, dry run, retried reads, merge and lost or refused merges, deploy wait, live failure-set comparisons, live record, incident, report-driven reverts that keep the ledger and the learnings)`);
  return 0;
}
function selfTest() { return selfTestAsync(); }

module.exports = { CONFIG, evaluateGates, revertOnMain, liveCheckDecision, cmdReportLive };

if (require.main === module) main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (error) => { console.error(`autopilot-merge: ${error.stack || error.message}`); process.exitCode = 1; });
