#!/usr/bin/env node
/**
 * The autopilot merge gate (docs/AUTOPILOT.md). .github/workflows/autopilot-merge.yml runs it from main's checkout and
 * never runs a pull request's code. Node built-ins only: global fetch for the GitHub API, git for the guard and reverts.
 *
 *   node scripts/autopilot-merge.cjs evaluate [--dry-run] [--pr <n>]
 *   node scripts/autopilot-merge.cjs smoke-result --pr <n> --sha <head sha> --outcome success|failure [--json <smoke.json>]
 *   node scripts/autopilot-merge.cjs merge --pr <n> --sha <head sha>
 *   node scripts/autopilot-merge.cjs wait-deploy --sha <merge sha>
 *   node scripts/autopilot-merge.cjs incident --pr <n> --sha <merge sha> --reason <text> [--revert] [--step <name>] [--log <file>]
 *   node scripts/autopilot-merge.cjs --self-test     every gate against a mocked GitHub API, and reverts in temporary repositories
 *
 * evaluate checks every open pull request labelled `autopilot`, keeps one status comment on each up to date (only when
 * its text changes) and outputs the first fully eligible one (eligible, pr, sha, preview_url). --pr evaluates one pull
 * request whatever its labels; --dry-run writes nothing. smoke-result records the preview smoke test on that comment.
 * merge checks every gate again and squash-merges with the head commit pinned. wait-deploy waits for Vercel's
 * Production deployment of the merge commit and for /version.json to name it. incident optionally reverts the merge on
 * main as github-actions[bot] and always opens an issue labelled autopilot-incident and autopilot:paused, which stops
 * every further merge until someone closes it.
 *
 * Environment: GITHUB_TOKEN (without it reads are unauthenticated, review threads cannot be read and every write is
 * refused: enough for a local `evaluate --dry-run` of a public repository), GITHUB_REPOSITORY (default
 * koolkam00/pace-notes), AUTOPILOT_MERGE (the repository variable; "off" stops merges), GITHUB_OUTPUT and
 * GITHUB_STEP_SUMMARY (written when set), RUNNER_TEMP (where evaluate leaves its state for smoke-result).
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
const MARKER = '<!-- autopilot-merge-status -->';
const smokeFailedMarker = (sha) => `<!-- autopilot-smoke-failed:${sha} -->`;
const BOT_LOGIN = 'github-actions[bot]';
const BOT_EMAIL = '41898282+github-actions[bot]@users.noreply.github.com';
const VERCEL_LOGIN = 'vercel[bot]';
const CHECKS_APP = 'github-actions';
const VERSION_TIMEOUT_MINUTES = 5;
const POLL_MS = 20000;
const LABEL_COLORS = { [CONFIG.pauseLabel]: 'b60205', [CONFIG.incidentLabel]: 'd93f0b' };

// ---------- Small helpers ----------

class UsageError extends Error {}
class NeedsToken extends Error {}
const short = (sha) => String(sha || '').slice(0, 7);
const cell = (text) => String(text ?? '').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
const utc = (date) => `${new Date(date).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
function option(argv, name) { const at = argv.indexOf(name); return at >= 0 ? argv[at + 1] : undefined; }
function required(argv, name) { const value = option(argv, name); if (!value) throw new UsageError(`${name} is required`); return value; }
function prNumber(argv) { const n = Number(required(argv, '--pr')); if (!Number.isInteger(n) || n < 1) throw new UsageError('--pr must be a pull request number'); return n; }
function shaArg(argv) { const sha = required(argv, '--sha'); if (!/^[0-9a-f]{40}$/.test(sha)) throw new UsageError('--sha must be a full 40-character commit SHA'); return sha; }

function firstParagraph(body) {
  const text = String(body || '').replace(/<!--[\s\S]*?-->/g, '').replace(/\r\n/g, '\n').trim();
  const paragraph = text.split(/\n\s*\n/).map((p) => p.trim()).find(Boolean) || '';
  return paragraph.length > 1500 ? `${paragraph.slice(0, 1500)}…` : paragraph;
}

// ---------- GitHub API ----------

function createClient({ token, fetchImpl, apiUrl, dryRun, log }) {
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
  const failure = (method, route, res) => Object.assign(new Error(`${method} ${route} answered ${res.status}: ${res.data && res.data.message ? res.data.message : String(res.data).slice(0, 200)}`), { status: res.status });
  return {
    authenticated: Boolean(token),
    async get(route, { allow404 = false } = {}) {
      const res = await send('GET', absolute(route));
      if (res.status === 404 && allow404) return null;
      if (!res.ok) throw failure('GET', route, res);
      return res.data;
    },
    /** Every item of a paginated list (follows Link: rel="next", at most `pages` pages). `key` names the array in object responses. */
    async list(route, { key, pages = 10 } = {}) {
      const items = [];
      let url = absolute(route);
      for (let page = 0; url && page < pages; page += 1) {
        const res = await send('GET', url);
        if (!res.ok) throw failure('GET', route, res);
        items.push(...(key ? res.data[key] || [] : res.data));
        const next = /<([^>]+)>;\s*rel="next"/.exec(res.link);
        url = next ? next[1] : null;
      }
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

/** Required check runs on the head commit: per name, the latest attempt by GitHub Actions must have completed with success. */
async function checksGate(gh, repo, sha) {
  const runs = await gh.list(`/repos/${repo}/commits/${sha}/check-runs?filter=all&per_page=100`, { key: 'check_runs' });
  const parts = [];
  let ok = true;
  for (const name of CONFIG.requiredChecks) {
    const attempts = runs.filter((run) => run.name === name && run.head_sha === sha && run.app && run.app.slug === CHECKS_APP).sort(latestFirst);
    const latest = attempts[0];
    if (!latest) { parts.push(`${name}: not reported for this commit yet`); if (ok) ok = null; continue; }
    if (latest.status !== 'completed') { parts.push(`${name}: ${latest.status.replace('_', ' ')}`); if (ok) ok = null; continue; }
    if (latest.conclusion !== 'success') { parts.push(`${name}: ${latest.conclusion}`); ok = false; continue; }
    parts.push(`${name}: success${attempts.length > 1 ? ` (attempt ${attempts.length})` : ''}`);
  }
  return { ok, detail: parts.join('; ') };
}

async function statusesGate(gh, repo, sha) {
  const combined = await gh.get(`/repos/${repo}/commits/${sha}/status?per_page=100`);
  const parts = [];
  let ok = true;
  for (const context of CONFIG.requiredStatuses) {
    const status = (combined.statuses || []).filter((s) => s.context === context).sort((a, b) => Date.parse(b.updated_at || b.created_at || 0) - Date.parse(a.updated_at || a.created_at || 0))[0];
    if (!status) { parts.push(`${context}: not reported yet`); if (ok) ok = null; continue; }
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

async function readyGate(gh, repo, pr, now) {
  const events = await gh.list(`/repos/${repo}/issues/${pr.number}/timeline?per_page=100`);
  const ready = events.filter((e) => e.event === 'ready_for_review').map((e) => e.created_at).sort().pop();
  const since = ready || pr.created_at;
  const due = Date.parse(since) + CONFIG.minReadyMinutes * 60000;
  const detail = `ready since ${utc(since)}${ready ? '' : ' (opened ready)'}`;
  return now() >= due ? { ok: true, detail } : { ok: null, detail: `${detail}; can merge from ${utc(due)}` };
}

async function mergeableGate(gh, repo, pr) {
  const compare = await gh.get(`/repos/${repo}/compare/${encodeURIComponent(CONFIG.base)}...${pr.head.sha}`);
  if (compare.behind_by > 0) return { ok: false, detail: `needs main merged in (${compare.behind_by} commit${compare.behind_by === 1 ? '' : 's'} behind)` };
  if (pr.mergeable === null || pr.mergeable === undefined) return { ok: null, detail: 'GitHub is still working out whether it merges cleanly' };
  if (pr.mergeable !== true) return { ok: false, detail: `does not merge cleanly (${pr.mergeable_state || 'conflicts'})` };
  return { ok: true, detail: 'merges cleanly; up to date with main' };
}

/** Vercel's deployments for a commit in one environment (Preview or Production), newest first, each with its latest status. */
async function vercelDeployments(gh, repo, sha, environment) {
  const deployments = (await gh.list(`/repos/${repo}/deployments?sha=${sha}&per_page=100`, { pages: 2 }))
    .filter((d) => d.creator && d.creator.login === VERCEL_LOGIN && new RegExp(`^${environment}\\b`, 'i').test(d.environment || ''))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id);
  const out = [];
  for (const deployment of deployments.slice(0, 5)) {
    const statuses = await gh.list(`/repos/${repo}/deployments/${deployment.id}/statuses?per_page=30`, { pages: 1 });
    const latest = [...statuses].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id)[0] || null;
    out.push({ deployment, status: latest });
  }
  return out;
}

async function previewGate(gh, repo, sha) {
  const found = await vercelDeployments(gh, repo, sha, 'Preview');
  const ready = found.find(({ status }) => status && status.state === 'success' && /^https:\/\//.test(status.environment_url || ''));
  if (ready) return { ok: true, detail: ready.status.environment_url, url: ready.status.environment_url.replace(/\/$/, '') };
  if (!found.length) return { ok: null, detail: 'no Vercel preview deployment for this commit yet' };
  const state = found[0].status ? found[0].status.state : 'pending';
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
  const run = spawnSync(process.execPath, [GUARD, '--base', `refs/remotes/origin/${CONFIG.base}`, '--head', ref, '--branch', pr.head.ref, '--json'], { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  let result;
  try { result = JSON.parse(run.stdout); } catch { return { ok: false, detail: `the guard did not run (exit ${run.status}): ${String(run.stderr || '').trim().split('\n')[0]}` }; }
  if (result.error) return { ok: false, detail: `guard error: ${result.error}` };
  if (result.skipped) return { ok: false, detail: 'the guard checks only autopilot/ branches' };
  if (run.status === 0 && result.ok) return { ok: true, detail: `${result.files} files, ${result.changedLines} changed lines; within the rules` };
  const listed = result.violations.slice(0, 3).map((v) => `${v.rule}${v.file ? ` ${v.file}${v.line ? `:${v.line}` : ''}` : ''}: ${v.message}`).join('; ');
  return { ok: false, detail: `${result.violations.length} violation${result.violations.length === 1 ? '' : 's'}: ${listed}${result.violations.length > 3 ? '; …' : ''}` };
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
  variable: 'Repository variable AUTOPILOT_MERGE is not off',
  checks: `Checks passed on the head commit (${CONFIG.requiredChecks.join(', ')})`,
  statuses: `Status passed on the head commit (${CONFIG.requiredStatuses.join(', ')})`,
  guard: "Autopilot guard (main's copy) passes",
  threads: 'No unresolved review threads',
  reviews: 'No outstanding change requests',
  ready: `Ready for at least ${CONFIG.minReadyMinutes} minutes`,
  mergeable: 'Merges cleanly and is up to date with main',
  preview: 'Vercel preview deployed for the head commit',
  smoke: 'Preview smoke test has not failed on this commit',
};

/** Every gate for one pull request. ok: true passes, false fails, null is still waiting (or could not be checked). */
async function evaluateGates(gh, deps, pr, { pause, statusComment }) {
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
  const variable = String(deps.env.AUTOPILOT_MERGE || '').trim();
  add('variable', variable.toLowerCase() !== 'off', variable ? `AUTOPILOT_MERGE is "${variable}"` : 'AUTOPILOT_MERGE is not set');
  await attempt('checks', () => checksGate(gh, repo, sha));
  await attempt('statuses', () => statusesGate(gh, repo, sha));
  if (headRepo === repo && pr.state === 'open') await attempt('guard', () => deps.runGuard(pr));
  else add('guard', false, 'not run (closed, or not a branch of this repository)');
  await attempt('threads', () => threadsGate(gh, repo, pr.number));
  await attempt('reviews', () => reviewsGate(gh, repo, pr.number));
  await attempt('ready', () => readyGate(gh, repo, pr, deps.now));
  await attempt('mergeable', () => mergeableGate(gh, repo, pr));
  await attempt('preview', () => previewGate(gh, repo, sha));
  const smokeFailed = Boolean(statusComment && statusComment.body.includes(smokeFailedMarker(sha)));
  add('smoke', !smokeFailed, smokeFailed ? 'failed on this commit; push a fix (or an empty commit to try again)' : 'runs after the gates above pass');
  const eligible = gates.every((g) => g.ok === true);
  const preview = gates.find((g) => g.id === 'preview');
  return { number: pr.number, title: pr.title, sha, headRef: pr.head.ref, gates, eligible, previewUrl: preview && preview.url ? preview.url : null, smokeFailed };
}

async function pausedItems(gh, repo) {
  const items = await gh.list(`/repos/${repo}/issues?state=open&labels=${encodeURIComponent(CONFIG.pauseLabel)}&per_page=100`, { pages: 3 });
  return items.map((i) => ({ number: i.number, title: i.title, pullRequest: Boolean(i.pull_request) }));
}

async function findStatusComment(gh, repo, number) {
  const comments = await gh.list(`/repos/${repo}/issues/${number}/comments?per_page=100`);
  return comments.find((c) => c.user && c.user.login === BOT_LOGIN && typeof c.body === 'string' && c.body.includes(MARKER)) || null;
}

function headline(result, { stage } = {}) {
  if (stage === 'smoke-passed') return '**All gates and the preview smoke test pass.** Merging now, pinned to this commit.';
  if (stage === 'smoke-failed') return '**Blocked: the preview smoke test failed on this commit.** Push a fix, or an empty commit to try again.';
  if (stage === 'smoke-incomplete') return '**Not merging yet:** the preview smoke test did not finish. The workflow tries again on its next run.';
  const failing = result.gates.filter((g) => g.ok === false).map((g) => g.id);
  const waiting = result.gates.filter((g) => g.ok === null).map((g) => g.id);
  if (!failing.length && !waiting.length) return '**All gates pass.** Next: the preview smoke test, then a squash merge pinned to this commit.';
  const parts = [];
  if (failing.length) parts.push(`${failing.length} failing (${failing.join(', ')})`);
  if (waiting.length) parts.push(`${waiting.length} waiting (${waiting.join(', ')})`);
  return `**Not merging yet:** ${parts.join('; ')}.`;
}

function gateTable(gates) {
  return ['| Gate | Result | Detail |', '| --- | --- | --- |', ...gates.map((g) => `| ${cell(g.label)} | ${g.ok === true ? 'pass' : g.ok === false ? '**fail**' : 'waiting'} | ${cell(g.detail)} |`)];
}

function statusBody(deps, result, { stage, extraRows = [] } = {}) {
  const hidden = result.smokeFailed || stage === 'smoke-failed' ? [smokeFailedMarker(result.sha)] : [];
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
  const pause = await pausedItems(gh, deps.repo);
  let prs;
  if (only) prs = [await gh.get(`/repos/${deps.repo}/pulls/${Number(only)}`)];
  else {
    const open = await gh.list(`/repos/${deps.repo}/pulls?state=open&per_page=100`);
    const labelled = open.filter((p) => (p.labels || []).some((l) => l.name === CONFIG.label)).sort((a, b) => a.number - b.number);
    prs = [];
    for (const p of labelled) prs.push(await gh.get(`/repos/${deps.repo}/pulls/${p.number}`));
  }
  deps.log(`autopilot-merge evaluate${dryRun ? ' (dry run)' : ''}: ${deps.repo}; ${only ? `pull request #${only}` : `${prs.length} open pull request${prs.length === 1 ? '' : 's'} labelled ${CONFIG.label}`}; ${pause.length ? `paused by ${pause.map((i) => `#${i.number}`).join(', ')}` : 'not paused'}; AUTOPILOT_MERGE ${deps.env.AUTOPILOT_MERGE ? `"${deps.env.AUTOPILOT_MERGE}"` : 'not set'}; ${gh.authenticated ? 'authenticated' : 'unauthenticated (read-only)'}`);

  const results = [];
  for (const pr of prs) {
    let statusComment = null;
    try { statusComment = await findStatusComment(gh, deps.repo, pr.number); } catch (error) { deps.log(`#${pr.number}: could not read comments: ${error.message}`); }
    const result = await evaluateGates(gh, deps, pr, { pause, statusComment });
    results.push({ ...result, statusComment });
    deps.log(`\n#${pr.number} ${pr.title} (${short(result.sha)}): ${result.eligible ? 'ELIGIBLE' : 'not eligible'}`);
    for (const g of result.gates) deps.log(`  ${g.ok === true ? 'pass   ' : g.ok === false ? 'FAIL   ' : 'waiting'} ${g.id.padEnd(12)} ${g.detail}`);
  }
  const chosen = results.find((r) => r.eligible) || null;
  deps.setOutput('eligible', chosen && !dryRun ? 'true' : 'false');
  deps.setOutput('candidate', chosen ? 'true' : 'false');
  deps.setOutput('pr', chosen ? String(chosen.number) : '');
  deps.setOutput('sha', chosen ? chosen.sha : '');
  deps.setOutput('preview_url', chosen ? chosen.previewUrl : '');
  if (chosen) fs.writeFileSync(statePath(deps), JSON.stringify({ number: chosen.number, title: chosen.title, sha: chosen.sha, headRef: chosen.headRef, gates: chosen.gates, previewUrl: chosen.previewUrl }));

  const summary = [`## Autopilot merge gate${dryRun ? ' (dry run)' : ''}`, ''];
  if (!results.length) summary.push(`No open pull request is labelled \`${CONFIG.label}\`.${pause.length ? ` Merges are paused by ${pause.map((i) => `#${i.number}`).join(', ')}.` : ''}`);
  for (const result of results) summary.push(`### #${result.number} ${cell(result.title)}`, '', headline(result), '', ...gateTable(result.gates), '');
  if (chosen) summary.push(dryRun ? `Dry run: #${chosen.number} would go to the preview smoke test and merge next.` : `#${chosen.number} goes to the preview smoke test next.`);
  deps.summary(summary.join('\n'));

  for (const result of results) {
    if (result.number !== (chosen && chosen.number) && result.eligible) result.gates.push({ id: 'queue', label: 'First in line', ok: null, detail: `waiting for #${chosen.number}` });
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

async function cmdSmokeResult(argv, deps) {
  const number = prNumber(argv);
  const sha = shaArg(argv);
  const outcome = required(argv, '--outcome');
  if (!['success', 'failure', 'cancelled', 'skipped'].includes(outcome)) throw new UsageError('--outcome must be success, failure, cancelled or skipped (a step outcome)');
  const gh = deps.client({ dryRun: false });
  let state;
  try { state = JSON.parse(fs.readFileSync(statePath(deps), 'utf8')); } catch { state = null; }
  if (!state || state.number !== number || state.sha !== sha) {
    const pr = await gh.get(`/repos/${deps.repo}/pulls/${number}`);
    state = { number, title: pr.title, sha, gates: [], previewUrl: null };
  }
  let detail = outcome === 'success' ? 'passed' : outcome === 'failure' ? 'failed' : `did not finish (${outcome})`;
  const smokeFile = option(argv, '--json');
  if (smokeFile) {
    try {
      const smoke = JSON.parse(fs.readFileSync(smokeFile, 'utf8'));
      const failures = smoke.failures || [];
      detail += `: ${smoke.checks ? smoke.checks.length : 0} checks on ${smoke.base}${failures.length ? `; ${failures.length} problem${failures.length === 1 ? '' : 's'}, first: ${failures.slice(0, 2).map((f) => `${f.where}: ${f.message}`).join('; ')}` : ''}`;
    } catch (error) {
      detail += ` (no smoke results: ${error.message.split('\n')[0]})`;
    }
  }
  const passed = outcome === 'success';
  const failed = outcome === 'failure';
  const result = { ...state, smokeFailed: failed };
  const gates = state.gates.filter((g) => g.id !== 'smoke');
  const stage = passed ? 'smoke-passed' : failed ? 'smoke-failed' : 'smoke-incomplete';
  const body = statusBody(deps, { ...result, gates }, { stage, extraRows: [{ id: 'smoke-run', label: 'Preview smoke test', ok: passed ? true : failed ? false : null, detail: `${detail}${deps.runUrl ? ` ([run](${deps.runUrl}))` : ''}` }] });
  const existing = await findStatusComment(gh, deps.repo, number);
  const done = await upsertStatusComment(gh, deps, number, existing, body);
  deps.log(`#${number}: preview smoke test ${passed ? 'passed' : failed ? 'failed' : `did not finish (${outcome})`}; status comment ${done}`);
  deps.summary(`### Preview smoke test for #${number}: ${passed ? 'passed' : '**did not pass**'}\n\n${cell(detail)}\n`);
  return 0;
}

async function cmdMerge(argv, deps) {
  const number = prNumber(argv);
  const sha = shaArg(argv);
  const gh = deps.client({ dryRun: false });
  const pr = await gh.get(`/repos/${deps.repo}/pulls/${number}`);
  const pause = await pausedItems(gh, deps.repo);
  const statusComment = await findStatusComment(gh, deps.repo, number);
  const result = await evaluateGates(gh, deps, pr, { pause, statusComment });
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
  const merged = await gh.write('PUT', `/repos/${deps.repo}/pulls/${number}/merge`, { merge_method: 'squash', sha, commit_title: `${pr.title} (#${number})`, commit_message: commitMessage }, `squash-merge #${number} at ${short(sha)}`);
  if (!merged || !merged.merged || !/^[0-9a-f]{40}$/.test(merged.sha || '')) throw new Error(`the merge API did not confirm a merge: ${JSON.stringify(merged).slice(0, 200)}`);
  deps.setOutput('merge_sha', merged.sha);
  const body = [`Merged by the **Autopilot merge** workflow as \`${short(merged.sha)}\` (squash, pinned to \`${short(sha)}\`) after all gates and the preview smoke test passed.${deps.runUrl ? ` [Workflow run](${deps.runUrl}).` : ''}`, '', ...gateTable(result.gates), '', `Next: the workflow waits for the production deploy, checks ${CONFIG.productionUrl} and reverts this merge automatically if the live site is broken.`].join('\n');
  try { await gh.write('POST', `/repos/${deps.repo}/issues/${number}/comments`, { body }, `comment on #${number}`); } catch (error) { deps.log(`#${number}: merged, but the comment failed: ${error.message}`); }
  deps.log(`#${number}: merged as ${merged.sha}`);
  deps.summary(`### Merged #${number} as \`${short(merged.sha)}\`\n\n${gateTable(result.gates).join('\n')}\n`);
  return 0;
}

async function cmdWaitDeploy(argv, deps) {
  const sha = shaArg(argv);
  const gh = deps.client({ dryRun: false });
  const deadline = deps.now() + CONFIG.deployTimeoutMinutes * 60000;
  let deployUrl = null;
  let last = '';
  for (;;) {
    const found = await vercelDeployments(gh, deps.repo, sha, 'Production');
    const ready = found.find(({ status }) => status && status.state === 'success');
    if (ready) { deployUrl = ready.status.environment_url || null; break; }
    const state = found.length ? (found[0].status ? found[0].status.state : 'pending') : 'not created yet';
    if (['failure', 'error'].includes(state)) {
      deps.log(`wait-deploy: Vercel's production deployment of ${short(sha)} reported ${state}`);
      deps.summary(`### Production deploy of \`${short(sha)}\`: **${state}**\n`);
      return 1;
    }
    if (state !== last) { deps.log(`wait-deploy: production deployment of ${short(sha)}: ${state}`); last = state; }
    if (deps.now() >= deadline) {
      deps.log(`wait-deploy: no successful production deployment of ${short(sha)} after ${CONFIG.deployTimeoutMinutes} minutes (last: ${state})`);
      deps.summary(`### Production deploy of \`${short(sha)}\`: **timed out** after ${CONFIG.deployTimeoutMinutes} minutes (last state: ${state})\n`);
      return 1;
    }
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
    if (deps.now() >= versionDeadline) {
      deps.log(`wait-deploy: ${CONFIG.productionUrl}/version.json still names ${served} after ${VERSION_TIMEOUT_MINUTES} minutes, not ${sha}`);
      deps.summary(`### Production deploy of \`${short(sha)}\`: Vercel reported success, but ${CONFIG.productionUrl}/version.json still names \`${short(served)}\` after ${VERSION_TIMEOUT_MINUTES} minutes\n`);
      return 1;
    }
    await deps.sleep(10000);
  }
  deps.setOutput('deploy_url', deployUrl || '');
  deps.log(`wait-deploy: ${CONFIG.productionUrl} serves ${sha}`);
  deps.summary(`### Production deploy of \`${short(sha)}\`: live\n\n${CONFIG.productionUrl}/version.json names the merge commit.\n`);
  return 0;
}

/** Reverts the merge commit on an up-to-date main and pushes it as github-actions[bot]. Never forces anything. */
function revertOnMain(sha, { cwd = ROOT } = {}) {
  const git = (gitArgs) => execFileSync('git', gitArgs, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const firstLine = (error) => String(error.stderr || error.message).trim().split('\n').filter(Boolean).pop() || 'unknown error';
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
    git(['-c', `user.name=${BOT_LOGIN}`, '-c', `user.email=${BOT_EMAIL}`, '-c', 'commit.gpgsign=false', 'revert', '--no-edit', sha]);
  } catch (error) {
    try { git(['revert', '--abort']); } catch { /* nothing to abort */ }
    return { pushed: false, detail: `not pushed: the revert conflicts with later commits on ${CONFIG.base} (${firstLine(error)}); revert by hand` };
  }
  const revertSha = git(['rev-parse', 'HEAD']);
  try {
    git(['push', '--quiet', 'origin', `HEAD:refs/heads/${CONFIG.base}`]);
  } catch (error) {
    return { pushed: false, revertSha, detail: `not pushed: the push to ${CONFIG.base} was rejected (${firstLine(error)})` };
  }
  return { pushed: true, revertSha, detail: `pushed to ${CONFIG.base} as ${revertSha}` };
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
  const title = pr ? pr.title : `pull request #${number}`;
  const prLink = pr ? pr.html_url : `${deps.serverUrl}/${deps.repo}/pull/${number}`;

  let revert = { pushed: false, detail: 'not attempted: this is a deploy problem, not a broken change' };
  if (argv.includes('--revert')) {
    try { revert = deps.revert(sha); } catch (error) { revert = { pushed: false, detail: `not pushed: ${error.message.split('\n')[0]}` }; }
    deps.log(`incident: revert ${revert.detail}`);
    if (revert.revertSha) deps.setOutput('revert_sha', revert.revertSha);
  }

  let excerpt = '';
  if (logFile) {
    try { excerpt = fs.readFileSync(logFile, 'utf8').split('\n').slice(-60).join('\n').slice(-6000).replace(/`{3,}/g, '` ` `'); } catch (error) { excerpt = `(log not readable: ${error.message})`; }
  }
  for (const name of [CONFIG.incidentLabel, CONFIG.pauseLabel]) {
    try {
      const existing = await gh.get(`/repos/${deps.repo}/labels/${encodeURIComponent(name)}`, { allow404: true });
      if (!existing) await gh.write('POST', `/repos/${deps.repo}/labels`, { name, color: LABEL_COLORS[name], description: name === CONFIG.pauseLabel ? 'Stops autopilot merges and runs while any open issue carries it' : 'Opened by the autopilot merge workflow' }, `create the ${name} label`);
    } catch (error) { deps.log(`incident: label ${name}: ${error.message}`); }
  }
  const body = [
    `The **Autopilot merge** workflow merged #${number} and then found a problem. This issue carries \`${CONFIG.pauseLabel}\`, so no autopilot pull request merges until it is closed.`, '',
    `- **What failed:** ${step}: ${reason}`,
    `- **Pull request:** ${prLink} (${title})`,
    `- **Merge commit:** \`${sha}\``,
    `- **Revert:** ${revert.detail}`,
    deps.runUrl ? `- **Workflow run:** ${deps.runUrl}` : null,
    '',
    excerpt ? '<details><summary>Log excerpt (last lines)</summary>\n\n```\n' + excerpt + '\n```\n\n</details>\n' : null,
    '**Next steps.** Find the cause, ship a fix or confirm the revert is live, and check the site with `npm run autopilot:smoke -- --base https://splithappens.run --quick`. Close this issue to let autopilot merges resume. See [docs/AUTOPILOT.md](' + `${deps.serverUrl}/${deps.repo}/blob/main/docs/AUTOPILOT.md` + ').',
  ].filter((line) => line !== null).join('\n');
  const issue = await gh.write('POST', `/repos/${deps.repo}/issues`, { title: `Autopilot incident: ${title}`, body, labels: [CONFIG.incidentLabel, CONFIG.pauseLabel] }, 'open the incident issue');
  if (issue) {
    deps.setOutput('issue_url', issue.html_url);
    try { await gh.write('POST', `/repos/${deps.repo}/issues/${number}/comments`, { body: `After this merge the ${step} failed: ${reason}. Revert: ${revert.detail}. Incident: ${issue.html_url}. Autopilot merges are paused until it is closed.` }, `comment on #${number}`); } catch (error) { deps.log(`incident: comment on #${number} failed: ${error.message}`); }
  }
  deps.log(`incident: ${issue ? issue.html_url : 'issue not opened'}; revert ${revert.detail}`);
  deps.summary(`### Incident after merging #${number}\n\n- ${cell(step)}: ${cell(reason)}\n- Revert: ${cell(revert.detail)}\n- Issue: ${issue ? issue.html_url : 'not opened'}\n`);
  return 0;
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
    revert: (sha) => revertOnMain(sha),
    setOutput: (key, value) => { if (env.GITHUB_OUTPUT) fs.appendFileSync(env.GITHUB_OUTPUT, `${key}=${String(value ?? '').replace(/[\r\n]/g, ' ')}\n`); },
    summary: (text) => { if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `${text}\n`); },
  };
}

const COMMANDS = { evaluate: cmdEvaluate, 'smoke-result': cmdSmokeResult, merge: cmdMerge, 'wait-deploy': cmdWaitDeploy, incident: cmdIncident };
const USAGE = 'Usage: node scripts/autopilot-merge.cjs evaluate [--dry-run] [--pr <n>] | smoke-result --pr <n> --sha <sha> --outcome success|failure [--json <file>] | merge --pr <n> --sha <sha> | wait-deploy --sha <sha> | incident --pr <n> --sha <sha> --reason <text> [--revert] [--step <name>] [--log <file>] | --self-test';

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
  return {
    repo, now,
    prs: {
      7: { number: 7, state: 'open', merged: false, draft: false, title: 'Clearer home hero', body: '<!-- template -->\nLead with the question runners ask.\n\nDetails follow.', html_url: `https://github.com/${repo}/pull/7`, created_at: '2026-10-14T10:00:00Z', mergeable: true, mergeable_state: 'clean', user: { login: 'koolkam00' }, labels: [{ name: 'autopilot' }], base: { ref: 'main' }, head: { ref: 'autopilot/2026-10-14-home-hero', sha: head, repo: { full_name: repo } } },
    },
    issues: [],
    checkRuns: [
      { id: 101, name: 'verify', head_sha: head, status: 'completed', conclusion: 'success', started_at: '2026-10-14T10:05:00Z', app: { slug: 'github-actions' } },
      { id: 102, name: 'privacy-e2e', head_sha: head, status: 'completed', conclusion: 'success', started_at: '2026-10-14T10:05:00Z', app: { slug: 'github-actions' } },
      { id: 103, name: 'Vercel Preview Comments', head_sha: head, status: 'completed', conclusion: 'success', started_at: '2026-10-14T10:05:00Z', app: { slug: 'vercel' } },
    ],
    statuses: { [head]: [{ context: 'Vercel', state: 'success', updated_at: '2026-10-14T10:08:00Z' }] },
    reviews: { 7: [] },
    timeline: { 7: [{ event: 'labeled', created_at: '2026-10-14T10:00:00Z' }] },
    behind: {},
    threads: { 7: [] },
    deployments: [{ id: 501, sha: head, environment: 'Preview', creator: { login: 'vercel[bot]' }, created_at: '2026-10-14T10:06:00Z' }],
    deploymentStatuses: { 501: [{ id: 1, state: 'success', environment_url: 'https://htw-live-study-abc-koolkam00s-projects.vercel.app', created_at: '2026-10-14T10:08:00Z' }] },
    comments: { 7: [] },
    labels: ['autopilot'],
    createdIssues: [],
    merges: [],
    nextId: 9000,
  };
}

function mockFetch(state, calls) {
  const json = (status, data, headers = {}) => new Response(data === undefined ? '' : JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } });
  return async (url, init = {}) => {
    const u = new URL(url);
    const method = (init.method || 'GET').toUpperCase();
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method, path: `${u.pathname}${u.search}`, body, auth: Boolean(init.headers && init.headers.authorization) });
    const p = u.pathname.replace(`/repos/${state.repo}`, '');
    let m;
    if (method === 'POST' && u.pathname === '/graphql') return json(200, { data: { repository: { pullRequest: { reviewThreads: { totalCount: (state.threads[body.variables.number] || []).length, nodes: state.threads[body.variables.number] || [] } } } } });
    if (method === 'GET' && p === '/pulls') return json(200, Object.values(state.prs).filter((pr) => pr.state === 'open').map(({ mergeable, ...rest }) => rest));
    if (method === 'GET' && (m = /^\/pulls\/(\d+)$/.exec(p))) return state.prs[m[1]] ? json(200, state.prs[m[1]]) : json(404, { message: 'Not Found' });
    if (method === 'GET' && p === '/issues') return json(200, state.issues.filter((i) => i.state === 'open' && i.labels.some((l) => l.name === u.searchParams.get('labels'))));
    if (method === 'GET' && (m = /^\/commits\/([0-9a-f]+)\/check-runs$/.exec(p))) { const runs = state.checkRuns.filter((r) => r.head_sha === m[1]); return json(200, { total_count: runs.length, check_runs: runs }); }
    if (method === 'GET' && (m = /^\/commits\/([0-9a-f]+)\/status$/.exec(p))) return json(200, { state: 'success', statuses: state.statuses[m[1]] || [] });
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
      pr.state = 'closed'; pr.merged = true;
      return json(200, { sha: SHA('d'), merged: true, message: 'Pull Request successfully merged' });
    }
    if (method === 'GET' && (m = /^\/labels\/(.+)$/.exec(p))) return state.labels.includes(decodeURIComponent(m[1])) ? json(200, { name: decodeURIComponent(m[1]) }) : json(404, { message: 'Not Found' });
    if (method === 'POST' && p === '/labels') { state.labels.push(body.name); return json(201, { name: body.name }); }
    if (method === 'POST' && p === '/issues') { const issue = { number: (state.nextId += 1), html_url: `https://github.com/${state.repo}/issues/${state.nextId}`, ...body }; state.createdIssues.push(issue); return json(201, issue); }
    return json(500, { message: `mock has no route for ${method} ${u.pathname}` });
  };
}

function mockDeps(state, { token = 'test-token', env = {}, guard = { ok: true, detail: 'within the rules' }, clock, version } = {}) {
  const calls = [];
  const outputs = {};
  const logs = [];
  const summaries = [];
  let time = clock !== undefined ? clock : state.now;
  const fetchImpl = mockFetch(state, calls);
  const deps = {
    repo: state.repo, serverUrl: 'https://github.com', env: { RUNNER_TEMP: state.tmp, ...env }, runUrl: 'https://github.com/koolkam00/pace-notes/actions/runs/1',
    log: (line) => logs.push(line),
    client: ({ dryRun }) => createClient({ token, fetchImpl, apiUrl: 'https://api.github.test', dryRun, log: (line) => logs.push(line) }),
    fetchPublic: async () => (version ? version() : new Response(JSON.stringify({ sha: SHA('d') }), { status: 200 })),
    now: () => time,
    sleep: async (ms) => { time += ms; if (state.onSleep) state.onSleep(time); },
    runGuard: () => guard,
    revert: () => ({ pushed: true, revertSha: SHA('e'), detail: `pushed to main as ${SHA('e')}` }),
    setOutput: (key, value) => { outputs[key] = value; },
    summary: (text) => summaries.push(text),
  };
  return { deps, calls, outputs, logs, summaries };
}

async function selfTestAsync() {
  const failures = [];
  let checks = 0;
  const ok = (label, condition, detail = '') => { checks += 1; if (!condition) failures.push(`${label}${detail ? `: ${detail}` : ''}`); };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-merge-'));
  const fresh = (edit) => { const state = fixture(); state.tmp = tmp; if (edit) edit(state); return state; };
  const gatesOf = async (state, options) => {
    const { deps } = mockDeps(state, options);
    const gh = deps.client({ dryRun: true });
    const pr = await gh.get(`/repos/${state.repo}/pulls/7`);
    const statusComment = await findStatusComment(gh, state.repo, 7);
    return evaluateGates(gh, deps, pr, { pause: await pausedItems(gh, state.repo), statusComment });
  };
  const failing = (result) => result.gates.filter((g) => g.ok !== true).map((g) => g.id).sort().join(',');
  const head = SHA('a');
  const old = SHA('b');

  try {
    // Every gate passes on the fixture.
    const all = await gatesOf(fresh());
    ok('fixture: every gate passes', all.eligible && failing(all) === '', failing(all) || '');
    ok('fixture: preview URL found', all.previewUrl === 'https://htw-live-study-abc-koolkam00s-projects.vercel.app', all.previewUrl);

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
      ['variable', null, ['variable'], { env: { AUTOPILOT_MERGE: ' OFF ' } }],
      ['checks: verify failed', (s) => { s.checkRuns[0].conclusion = 'failure'; }, ['checks']],
      ['checks: privacy-e2e missing', (s) => { s.checkRuns.splice(1, 1); }, ['checks']],
      ['statuses: Vercel failed', (s) => { s.statuses[head][0].state = 'failure'; }, ['statuses']],
      ['statuses: Vercel pending', (s) => { s.statuses[head][0].state = 'pending'; }, ['statuses']],
      ['guard', null, ['guard'], { guard: { ok: false, detail: '1 violation: protected-path lib/analytics.ts' } }],
      ['threads', (s) => { s.threads[7] = [{ isResolved: true, path: 'a.tsx' }, { isResolved: false, path: 'b.tsx' }]; }],
      ['reviews', (s) => { s.reviews[7] = [{ id: 1, user: { login: 'koolkam00' }, state: 'CHANGES_REQUESTED', submitted_at: '2026-10-14T10:30:00Z' }]; }],
      ['ready: opened 5 minutes ago', (s) => { s.prs[7].created_at = '2026-10-14T11:55:00Z'; }, ['ready']],
      ['ready: marked ready 5 minutes ago', (s) => { s.timeline[7].push({ event: 'ready_for_review', created_at: '2026-10-14T11:55:00Z' }); }, ['ready']],
      ['mergeable: conflicts', (s) => { s.prs[7].mergeable = false; s.prs[7].mergeable_state = 'dirty'; }, ['mergeable']],
      ['mergeable: still computing', (s) => { s.prs[7].mergeable = null; }, ['mergeable']],
      ['mergeable: behind main', (s) => { s.behind[head] = 2; }, ['mergeable']],
      ['preview: none', (s) => { s.deployments = []; }, ['preview']],
      ['preview: failed', (s) => { s.deploymentStatuses[501] = [{ id: 1, state: 'failure', created_at: '2026-10-14T10:08:00Z' }]; }, ['preview']],
      ['preview: not by Vercel', (s) => { s.deployments[0].creator.login = 'someone'; }, ['preview']],
      ['preview: production only', (s) => { s.deployments[0].environment = 'Production'; }, ['preview']],
      ['smoke: failed earlier on this commit', (s) => { s.comments[7] = [{ id: 1, user: { login: BOT_LOGIN }, body: `${MARKER}\n${smokeFailedMarker(head)}` }]; }, ['smoke']],
    ];
    for (const [label, edit, expected, options] of SINGLE) {
      const id = label.split(':')[0];
      const result = await gatesOf(fresh(edit || undefined), options);
      const want = (expected || [id]).sort().join(',');
      ok(`gate ${label}: blocks on its own`, !result.eligible && failing(result) === want, `blocked by [${failing(result)}], expected [${want}]`);
    }
    const behind = await gatesOf(fresh((s) => { s.behind[head] = 3; }));
    ok('behind main says "needs main merged in"', behind.gates.find((g) => g.id === 'mergeable').detail.includes('needs main merged in'));
    const variableOn = await gatesOf(fresh(), { env: { AUTOPILOT_MERGE: 'on' } });
    ok('AUTOPILOT_MERGE=on does not block', variableOn.eligible);
    const smokeOld = await gatesOf(fresh((s) => { s.comments[7] = [{ id: 1, user: { login: BOT_LOGIN }, body: `${MARKER}\n${smokeFailedMarker(old)}` }]; }));
    ok('a smoke failure on an older commit does not block', smokeOld.eligible);
    const forged = await gatesOf(fresh((s) => { s.comments[7] = [{ id: 1, user: { login: 'someone' }, body: `${MARKER}\n${smokeFailedMarker(head)}` }]; }));
    ok("someone else's comment with the markers is ignored", forged.eligible);

    // Checks: stale, in progress, other apps, and latest-attempt semantics.
    const stale = await gatesOf(fresh((s) => { for (const run of s.checkRuns) run.head_sha = old; }));
    ok('stale checks on an older commit do not count', !stale.eligible && stale.gates.find((g) => g.id === 'checks').ok === null);
    const running = await gatesOf(fresh((s) => { s.checkRuns[1].status = 'in_progress'; s.checkRuns[1].conclusion = null; }));
    ok('a check still in progress blocks (waiting)', !running.eligible && running.gates.find((g) => g.id === 'checks').ok === null);
    const otherApp = await gatesOf(fresh((s) => { s.checkRuns[0].app.slug = 'some-app'; }));
    ok('a same-named check from another app does not count', !otherApp.eligible);
    const rerunFixed = await gatesOf(fresh((s) => { s.checkRuns[0].conclusion = 'failure'; s.checkRuns.push({ ...s.checkRuns[0], id: 201, conclusion: 'success', started_at: '2026-10-14T11:00:00Z' }); }));
    ok('latest attempt: failure then a successful re-run passes', rerunFixed.eligible, failing(rerunFixed));
    const rerunBroke = await gatesOf(fresh((s) => { s.checkRuns.push({ ...s.checkRuns[0], id: 201, conclusion: 'failure', started_at: '2026-10-14T11:00:00Z' }); }));
    ok('latest attempt: success then a failed re-run blocks', !rerunBroke.eligible && rerunBroke.gates.find((g) => g.id === 'checks').ok === false);
    const rerunRunning = await gatesOf(fresh((s) => { s.checkRuns.push({ ...s.checkRuns[0], id: 201, status: 'queued', conclusion: null, started_at: '2026-10-14T11:00:00Z' }); }));
    ok('latest attempt: success then a queued re-run waits', !rerunRunning.eligible && rerunRunning.gates.find((g) => g.id === 'checks').ok === null);

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
    ok('ready time counts from the last ready_for_review event, not creation', readyLong.gates.find((g) => g.id === 'ready').ok === null);

    // Unauthenticated reads: threads cannot be read, so nothing is eligible; writes are refused.
    const anon = await gatesOf(fresh(), { token: '' });
    ok('unauthenticated: review threads wait for a token', !anon.eligible && anon.gates.find((g) => g.id === 'threads').detail.includes('GITHUB_TOKEN'));

    // evaluate: outputs, one PR per run, the pause issue, the sticky comment, dry runs.
    {
      const state = fresh((s) => { s.prs[8] = JSON.parse(JSON.stringify(s.prs[7])); s.prs[8].number = 8; s.reviews[8] = []; s.timeline[8] = []; s.threads[8] = []; s.comments[8] = []; });
      const run = mockDeps(state);
      const code = await cmdEvaluate([], run.deps);
      ok('evaluate: exits 0', code === 0);
      ok('evaluate: outputs the first eligible PR only', run.outputs.eligible === 'true' && run.outputs.pr === '7' && run.outputs.sha === head && run.outputs.preview_url.startsWith('https://htw-live-study-'), JSON.stringify(run.outputs));
      ok('evaluate: creates one status comment per PR', state.comments[7].length === 1 && state.comments[8].length === 1 && state.comments[7][0].body.startsWith(MARKER));
      ok('evaluate: the second eligible PR waits its turn', state.comments[8][0].body.includes('waiting for #7'));
      const writes = () => run.calls.filter((c) => c.method !== 'GET' && c.path !== '/graphql').length;
      const before = writes();
      await cmdEvaluate([], run.deps);
      ok('evaluate: an unchanged status is not rewritten', writes() === before, `${writes() - before} writes`);
      state.checkRuns[0].conclusion = 'failure';
      await cmdEvaluate([], run.deps);
      const patched = run.calls.filter((c) => c.method === 'PATCH');
      ok('evaluate: a changed status edits the same comment', patched.length === 2 && state.comments[7].length === 1 && state.comments[8].length === 1 && state.comments[7][0].body.includes('**fail**'), `${patched.length} edits`);
      ok('evaluate: blocked PR is not output', run.outputs.eligible === 'false' && run.outputs.pr === '', JSON.stringify(run.outputs));
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

    // smoke-result, then merge.
    {
      const state = fresh();
      const run = mockDeps(state);
      await cmdEvaluate([], run.deps);
      await cmdSmokeResult(['--pr', '7', '--sha', head, '--outcome', 'failure'], run.deps);
      ok('smoke-result failure: the status comment says so and records the commit', state.comments[7].length === 1 && state.comments[7][0].body.includes('preview smoke test failed') && state.comments[7][0].body.includes(smokeFailedMarker(head)));
      await cmdEvaluate([], run.deps);
      ok('after a smoke failure the same commit is not retried', run.outputs.eligible === 'false' && state.comments[7][0].body.includes(smokeFailedMarker(head)));
      state.prs[7].head.sha = SHA('c');
      for (const r of state.checkRuns) r.head_sha = SHA('c');
      state.statuses[SHA('c')] = state.statuses[head];
      state.deployments[0].sha = SHA('c');
      await cmdEvaluate([], run.deps);
      ok('a new commit clears the smoke failure', run.outputs.eligible === 'true' && run.outputs.sha === SHA('c'));
    }
    {
      const state = fresh();
      const run = mockDeps(state);
      await cmdEvaluate([], run.deps);
      await cmdSmokeResult(['--pr', '7', '--sha', head, '--outcome', 'cancelled'], run.deps);
      ok('smoke-result cancelled: says so without blocking the commit', state.comments[7][0].body.includes('did not finish') && !state.comments[7][0].body.includes(smokeFailedMarker(head)));
      await cmdEvaluate([], run.deps);
      ok('after a cancelled smoke test the commit is tried again', run.outputs.eligible === 'true');
      await cmdSmokeResult(['--pr', '7', '--sha', head, '--outcome', 'success'], run.deps);
      ok('smoke-result success: the status comment says it is merging', state.comments[7][0].body.includes('Merging now') && state.comments[7].length === 1);
    }
    {
      const state = fresh();
      const run = mockDeps(state);
      const code = await cmdMerge(['--pr', '7', '--sha', head], run.deps);
      const merge = state.merges[0];
      ok('merge: squash with the head SHA pinned', code === 0 && merge && merge.merge_method === 'squash' && merge.sha === head, JSON.stringify(merge));
      ok('merge: commit title is "<title> (#n)"', merge && merge.commit_title === 'Clearer home hero (#7)', merge && merge.commit_title);
      ok('merge: message is the first paragraph and the gate sentence', merge && merge.commit_message === 'Lead with the question runners ask.\n\nMerged by the autopilot merge workflow after all gates passed.', merge && JSON.stringify(merge.commit_message));
      ok('merge: outputs the merge commit', run.outputs.merge_sha === SHA('d'));
      ok('merge: comments on the PR with the gate table', state.comments[7].some((c) => c.body.includes('Merged by the **Autopilot merge** workflow') && c.body.includes('| Gate | Result | Detail |')));
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
    }

    // wait-deploy.
    const merged = SHA('d');
    const production = (s, statuses) => { s.deployments.push({ id: 601, sha: merged, environment: 'Production', creator: { login: 'vercel[bot]' }, created_at: '2026-10-14T12:01:00Z' }); s.deploymentStatuses[601] = statuses; };
    {
      const state = fresh((s) => production(s, [{ id: 1, state: 'in_progress', created_at: '2026-10-14T12:01:00Z' }]));
      state.onSleep = (t) => { if (t > state.now + 60000) state.deploymentStatuses[601] = [{ id: 2, state: 'success', environment_url: 'https://htw-live-study-xyz.vercel.app', created_at: '2026-10-14T12:03:00Z' }, ...state.deploymentStatuses[601]]; };
      let served = 0;
      const run = mockDeps(state, { version: () => new Response(JSON.stringify({ sha: (served += 1) < 3 ? head : merged }), { status: 200 }) });
      const code = await cmdWaitDeploy(['--sha', merged], run.deps);
      ok('wait-deploy: waits for success, then for version.json', code === 0 && served === 3 && run.outputs.deploy_url === 'https://htw-live-study-xyz.vercel.app', `code ${code}, version reads ${served}`);
    }
    {
      const state = fresh((s) => production(s, [{ id: 2, state: 'failure', created_at: '2026-10-14T12:03:00Z' }]));
      ok('wait-deploy: a failed deployment fails', (await cmdWaitDeploy(['--sha', merged], mockDeps(state).deps)) === 1);
      const never = fresh();
      ok('wait-deploy: no deployment within 30 minutes fails', (await cmdWaitDeploy(['--sha', merged], mockDeps(never).deps)) === 1);
      const preview = fresh((s) => { s.deployments.push({ id: 602, sha: merged, environment: 'Preview', creator: { login: 'vercel[bot]' }, created_at: '2026-10-14T12:01:00Z' }); s.deploymentStatuses[602] = [{ id: 1, state: 'success', created_at: '2026-10-14T12:02:00Z' }]; });
      ok('wait-deploy: a Preview deployment does not count', (await cmdWaitDeploy(['--sha', merged], mockDeps(preview).deps)) === 1);
      const stale = fresh((s) => production(s, [{ id: 2, state: 'success', created_at: '2026-10-14T12:03:00Z' }]));
      ok('wait-deploy: version.json never naming the merge fails', (await cmdWaitDeploy(['--sha', merged], mockDeps(stale, { version: () => new Response(JSON.stringify({ sha: head }), { status: 200 }) }).deps)) === 1);
    }

    // incident.
    {
      const state = fresh();
      fs.writeFileSync(path.join(tmp, 'smoke.log'), 'line 1\n```\nFAIL: / [mobile]: pageerror: boom\n');
      const run = mockDeps(state);
      const code = await cmdIncident(['--pr', '7', '--sha', merged, '--reason', 'live smoke test failed', '--revert', '--step', 'live smoke test', '--log', path.join(tmp, 'smoke.log')], run.deps);
      const issue = state.createdIssues[0];
      ok('incident: opens an issue with both labels', code === 0 && issue && issue.title === 'Autopilot incident: Clearer home hero' && issue.labels.includes('autopilot-incident') && issue.labels.includes('autopilot:paused'));
      ok('incident: creates missing labels first', state.labels.includes('autopilot-incident') && state.labels.includes('autopilot:paused'));
      ok('incident: the body names the step, PR, merge commit, revert and run', issue && ['live smoke test: live smoke test failed', 'https://github.com/koolkam00/pace-notes/pull/7', merged, `pushed to main as ${SHA('e')}`, 'actions/runs/1', 'pageerror: boom'].every((text) => issue.body.includes(text)), issue && issue.body);
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

  // Reverts in real temporary repositories: pushed, conflicting, rejected.
  const revertCase = (label, setup, expectPushed) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-revert-'));
    const g = (cwd, ...a) => execFileSync('git', ['-c', 'user.name=Self Test', '-c', 'user.email=self-test@example.invalid', '-c', 'commit.gpgsign=false', ...a], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    try {
      const origin = path.join(dir, 'origin.git');
      const work = path.join(dir, 'work');
      g(dir, 'init', '-q', '--bare', '-b', 'main', origin);
      g(dir, 'clone', '-q', origin, work);
      g(work, 'symbolic-ref', 'HEAD', 'refs/heads/main');
      fs.writeFileSync(path.join(work, 'page.txt'), 'one\ntwo\nthree\n');
      g(work, 'add', '-A'); g(work, 'commit', '-q', '-m', 'base'); g(work, 'push', '-q', 'origin', 'main');
      fs.writeFileSync(path.join(work, 'page.txt'), 'one\nTWO\nthree\n');
      g(work, 'commit', '-q', '-am', 'Autopilot change (#7)'); g(work, 'push', '-q', 'origin', 'main');
      const mergeSha = g(work, 'rev-parse', 'HEAD');
      setup({ g, origin, work });
      const result = revertOnMain(mergeSha, { cwd: work });
      ok(`revert: ${label}`, result.pushed === expectPushed, result.detail);
      if (expectPushed) {
        ok(`revert: ${label}: main has the old text`, g(origin, 'show', 'main:page.txt') === 'one\ntwo\nthree');
        ok(`revert: ${label}: authored by github-actions[bot]`, g(origin, 'log', '-1', '--format=%an <%ae>', 'main') === `${BOT_LOGIN} <${BOT_EMAIL}>`);
      } else {
        ok(`revert: ${label}: no revert in progress afterwards`, !fs.existsSync(path.join(work, '.git', 'REVERT_HEAD')));
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
  revertCase('a clean revert is pushed', () => {}, true);
  revertCase('a later commit on main is kept', ({ g, work }) => { fs.writeFileSync(path.join(work, 'other.txt'), 'x\n'); g(work, 'add', '-A'); g(work, 'commit', '-q', '-m', 'later'); g(work, 'push', '-q', 'origin', 'main'); g(work, 'reset', '-q', '--hard', 'HEAD~1'); }, true);
  revertCase('a conflict is skipped', ({ g, work }) => { fs.writeFileSync(path.join(work, 'page.txt'), 'one\nTWO!\nthree\n'); g(work, 'commit', '-q', '-am', 'later edit'); g(work, 'push', '-q', 'origin', 'main'); }, false);
  revertCase('a rejected push is skipped', ({ origin }) => { fs.writeFileSync(path.join(origin, 'hooks', 'pre-receive'), '#!/bin/sh\necho "protected branch" >&2\nexit 1\n', { mode: 0o755 }); }, false);

  if (failures.length) {
    console.error(`autopilot-merge self-test: ${failures.length} of ${checks} checks failed`);
    for (const failure of failures) console.error(`  ${failure}`);
    return 1;
  }
  console.log(`autopilot-merge self-test: ${checks} checks passed (every gate on its own, pause, stale and re-run checks, reviews, status comment, dry run, merge, deploy wait, incident, reverts)`);
  return 0;
}
function selfTest() { return selfTestAsync(); }

module.exports = { CONFIG, evaluateGates, revertOnMain };

if (require.main === module) main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (error) => { console.error(`autopilot-merge: ${error.stack || error.message}`); process.exitCode = 1; });
