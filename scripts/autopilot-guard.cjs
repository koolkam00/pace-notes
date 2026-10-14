#!/usr/bin/env node
/**
 * What an autopilot pull request may change (docs/AUTOPILOT.md; the rules themselves are autopilot/CONSTITUTION.md).
 *
 *   node scripts/autopilot-guard.cjs --base origin/main --head HEAD [--branch autopilot/2026-10-15-home-hero] [--json]
 *   node scripts/autopilot-guard.cjs --self-test     temporary git repositories covering every rule, pass and fail
 *
 * It reads the two commits with git alone (merge-base, diff, show, cat-file) and never runs code from the pull request,
 * so the "Autopilot merge" workflow can run main's copy of this file against a pull request's head. The diff is taken
 * from the merge base of --base and --head to --head, which is what the pull request adds.
 *
 * The branch comes from --branch, else GITHUB_HEAD_REF, else the checked-out branch when --head is HEAD. A branch that
 * does not start with autopilot/ passes without checks. Exit 0 when there is nothing to report, 1 on any violation,
 * 2 on a usage or git error. --json prints the machine-readable result instead of the list.
 */
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

/**
 * Paths an autopilot pull request may never add, change, delete or rename. This list is the authoritative copy of
 * autopilot/CONSTITUTION.md §6; only the owner changes it, in a pull request that is not on an autopilot/ branch.
 * `**` matches across folders, `*` within one path segment.
 */
const PROTECTED = [
  'analysis/**', 'public/data/**', 'data/**',
  'lib/analytics.ts', 'lib/analytics-policy.ts', 'lib/replay-policy.ts', 'lib/event-policy.ts', 'lib/data-fetch.ts', 'lib/experiment-runtime.ts',
  'components/SiteAnalytics.tsx', 'components/AnalyticsPreference.tsx', 'components/PageFeedback.tsx', 'components/SectionTracker.tsx', 'components/Experiment.tsx',
  'app/privacy/**', 'app/error.tsx', 'app/global-error.tsx',
  'scripts/**', '.github/**', '.claude/**', 'CLAUDE.md', 'AGENTS.md',
  'autopilot/CONSTITUTION.md', 'autopilot/metrics.md',
  'package.json', 'package-lock.json', 'next.config.*', 'vercel.json', 'tsconfig.json', '.gitignore', '.npmrc', '.nvmrc', '.node-version',
  'docs/ANALYTICS.md', 'LICENSE*',
];

const BRANCH_PREFIX = 'autopilot/';
const BRANCH_NAME = /^autopilot\/\d{4}-\d{2}-\d{2}-[a-z0-9]+(-[a-z0-9]+)*$/;
const BRANCH_MAX = 80;
const LIMITS = { files: 30, lines: 1500, binaryBytes: 600 * 1024, binaryTotalBytes: 2 * 1024 * 1024 };
const LEDGER = 'autopilot/ledger.jsonl';

/** Page and route handlers (and the metadata routes behind /robots.txt, /sitemap.xml and the manifest): URLs are owner decisions. */
const ROUTE_FILE = /^app\/(?:.+\/)?(?:page|route)\.(?:tsx?|jsx?|mdx?)$|^app\/(?:robots|sitemap|manifest)\.(?:tsx?|jsx?)$/;

/**
 * Added lines are scanned in every text file except documentation: docs/, autopilot/ and Markdown files. That covers
 * app/, components/, lib/, hooks/, context/ and public/, and also any new folder that site code could import from.
 */
const UNSCANNED = [/^docs\//, /^autopilot\//, /\.mdx?$/i];

// An absolute or protocol-relative address right after an opening quote: "https://…", '//…', `http://…`.
const EXTERNAL = String.raw`[\x60'"]\s*(?:https?:)?\/\/`;
const EXTERNAL_BARE = String.raw`[\x60'"]?\s*(?:https?:)?\/\/`;

/**
 * Code that could run third-party code, write browser storage, send data off the site or load something from another
 * host (external images, fonts and media reveal visitors' IP addresses). Plain <a href="https://…"> links are allowed.
 */
const FORBIDDEN = [
  ['<script', /<script\b/i],
  ['next/script', /next\/script/i],
  ['dangerouslySetInnerHTML', /dangerouslySetInnerHTML/i],
  ['HTML injection (innerHTML, outerHTML, insertAdjacentHTML, document.write)', /\b(?:inner|outer)HTML\s*=|insertAdjacentHTML|document\s*\.\s*write/],
  ['eval(', /\beval\s*\(/],
  ['new Function(', /\bFunction\s*\(/],
  ['document.cookie', /document\s*(?:\.\s*cookie|\[\s*[\x60'"]cookie)|\bcookieStore\b/],
  ['browser storage (localStorage, sessionStorage, indexedDB)', /localStorage|sessionStorage|indexedDB/i],
  ['navigator.sendBeacon', /sendBeacon/i],
  ['XMLHttpRequest', /XMLHttpRequest/i],
  ['new WebSocket', /\bWebSocket\b/],
  ['EventSource(', /\bEventSource\b/],
  ['PostHog', /posthog/i],
  ['<iframe', /<(?:iframe|frame|embed)\b/i],
  ['fetch( of an absolute URL', new RegExp(String.raw`\bfetch\s*\(\s*(?:new\s+URL\s*\(\s*)?${EXTERNAL}`, 'i')],
  ['import( of an http(s) URL', new RegExp(String.raw`\bimport\s*\(\s*${EXTERNAL}|\bfrom\s+${EXTERNAL}`, 'i')],
  ['src=/srcSet= of an absolute URL', new RegExp(String.raw`\b(?:src|srcset|poster|action|formaction|ping)\s*=\s*\{?\s*${EXTERNAL}`, 'i')],
  ['url( of an absolute URL', new RegExp(String.raw`\burl\s*\(\s*${EXTERNAL_BARE}`, 'i')],
  ['@import of an http(s) URL', new RegExp(String.raw`@import\s+(?:url\s*\(\s*)?${EXTERNAL_BARE}`, 'i')],
  ['<link>/<image>/<use> of an absolute URL', new RegExp(String.raw`<(?:link|image|use|feimage)\b[^>]*\b(?:xlink:)?href\s*=\s*\{?\s*${EXTERNAL}`, 'i')],
  ['RTCPeerConnection / WebTransport', /RTCPeerConnection|WebTransport/],
  ['service worker', /serviceWorker|importScripts/],
];

/** Wording the site never uses (autopilot/CONSTITUTION.md §3), and release identifiers that never appear in visible copy. */
const BANNED = [
  ['"arithmetic"', /arithmetic/i],
  ['"the wall" (say "sustained slowdown")', /\bthe\s+wall\b/i],
  ['"hit the wall"', /\bhit(s|ting)?\s+the\s+wall\b/i],
  ['"your chance" (shares are observed, never a chance)', /your\s+chance/i],
  ['"private-export" (release tags stay out of copy)', /private-export/i],
  ['"20260912" (release tags stay out of copy)', /20260912/],
];

const LEDGER_REQUIRED = ['id', 'date', 'kind', 'title', 'hypothesis', 'primary_metric', 'guardrails', 'baseline', 'decision_rule', 'evaluate_after', 'status', 'pr', 'verdict', 'result'];
const LEDGER_MUTABLE = new Set(['status', 'verdict', 'result', 'evaluated_on', 'pr', 'notes']);
const LEDGER_KINDS = ['change', 'experiment', 'conclude', 'revert', 'fix'];
const LEDGER_STATUSES = ['proposed', 'shipped', 'reverted', 'concluded'];
const LEDGER_VERDICTS = ['keep', 'revert', 'inconclusive', 'iterate', 'ship-variant', 'keep-control'];
const LEDGER_ID = /^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/;

// ---------- Small helpers ----------

function globRegex(glob) {
  let source = '';
  for (let i = 0; i < glob.length; i += 1) {
    if (glob[i] === '*' && glob[i + 1] === '*') { source += '.*'; i += 1; }
    else if (glob[i] === '*') source += '[^/]*';
    else source += glob[i].replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${source}$`);
}
const PROTECTED_RE = PROTECTED.map((glob) => [glob, globRegex(glob)]);
const protectedBy = (file) => (PROTECTED_RE.find(([, re]) => re.test(file)) || [])[0] || null;
const isScanned = (file) => !UNSCANNED.some((re) => re.test(file)) && !protectedBy(file);

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const sameJson = (a, b) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (isObject(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]));
  return value;
}

class GitError extends Error {}
function git(cwd, args, { buffer = false, allowFail = false } = {}) {
  try {
    return execFileSync('git', ['--no-pager', '--literal-pathspecs', '-c', 'core.quotePath=false', ...args], {
      cwd, encoding: buffer ? null : 'utf8', maxBuffer: 512 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    if (allowFail) return null;
    const stderr = error.stderr ? String(error.stderr).trim() : '';
    throw new GitError(`git ${args.join(' ')} failed: ${stderr.split('\n')[0] || `exit status ${error.status}`}`);
  }
}

// ---------- Reading the change ----------

/** Every changed path between two commits: `git diff --raw -z -M` with full blob ids and modes. */
function changedEntries(cwd, from, to) {
  const tokens = git(cwd, ['diff', '--raw', '-z', '-M', '--no-abbrev', '--no-ext-diff', '--no-textconv', from, to]).split('\0');
  const entries = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const meta = tokens[i];
    if (!meta.startsWith(':')) continue;
    const [oldMode, newMode, oldSha, newSha, statusField] = meta.slice(1).split(' ');
    const status = statusField[0];
    const oldPath = tokens[i + 1];
    const twoPaths = status === 'R' || status === 'C';
    const newPath = twoPaths ? tokens[i + 2] : oldPath;
    i += twoPaths ? 2 : 1;
    entries.push({
      status, oldMode, newMode, oldSha, newSha,
      oldPath: status === 'A' ? null : oldPath,
      newPath: status === 'D' ? null : newPath,
    });
  }
  return entries;
}

const ZERO_SHA = /^0+$/;
function blob(cwd, sha) { return ZERO_SHA.test(sha) ? null : git(cwd, ['cat-file', 'blob', sha], { buffer: true }); }
function blobSize(cwd, sha) { return ZERO_SHA.test(sha) ? 0 : Number(git(cwd, ['cat-file', '-s', sha]).trim()); }
/** Git's own test: a NUL byte in the first 8,000 bytes. Done here so a .gitattributes file cannot hide a text change. */
const looksBinary = (buffer) => Boolean(buffer) && buffer.subarray(0, 8000).includes(0);

/** Added lines (with their line numbers in the new file) and the number of deleted lines of one text change. */
function textChange(cwd, from, to, entry) {
  const paths = [...new Set([entry.oldPath, entry.newPath].filter(Boolean))];
  const patch = git(cwd, ['diff', '--text', '-U0', '--no-color', '--no-ext-diff', '--no-textconv', '-M', from, to, '--', ...paths]);
  const added = [];
  let deleted = 0;
  let inHunk = false;
  let next = 0;
  for (const line of patch.split('\n')) {
    if (line.startsWith('diff --git ')) { inHunk = false; continue; }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) { inHunk = true; next = Number(hunk[1]); continue; }
    if (!inHunk) continue;
    if (line.startsWith('+')) { added.push({ line: next, text: line.slice(1) }); next += 1; }
    else if (line.startsWith('-')) deleted += 1;
  }
  return { added, deleted };
}

/** Consecutive added lines joined into blocks, so a JSX tag or call split over several lines is scanned as one. */
function addedBlocks(added) {
  const blocks = [];
  for (const item of added) {
    const last = blocks[blocks.length - 1];
    if (last && item.line === last.lines[last.lines.length - 1] + 1) { last.lines.push(item.line); last.texts.push(item.text); }
    else blocks.push({ lines: [item.line], texts: [item.text] });
  }
  return blocks.map((block) => ({ ...block, text: block.texts.join('\n') }));
}
function lineAt(block, offset) {
  let seen = 0;
  for (let i = 0; i < block.texts.length; i += 1) {
    seen += block.texts[i].length + 1;
    if (offset < seen) return block.lines[i];
  }
  return block.lines[block.lines.length - 1];
}
function scan(file, added, rules, rule, violations) {
  const reported = new Set();
  for (const block of addedBlocks(added)) {
    for (const [name, pattern] of rules) {
      const global = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
      for (const match of block.text.matchAll(global)) {
        const line = lineAt(block, match.index);
        const key = `${name}:${line}`;
        if (reported.has(key)) continue;
        reported.add(key);
        violations.push({ rule, file, line, message: `${name}: "${match[0].replace(/\s+/g, ' ').slice(0, 60)}"` });
      }
    }
  }
}

const showFile = (cwd, commit, file) => {
  const out = git(cwd, ['show', `${commit}:${file}`], { buffer: true, allowFail: true });
  return out === null ? null : out.toString('utf8');
};
/** JSX and JavaScript comments removed, so a commented-out <SiteAnalytics /> does not count as present. */
const withoutComments = (source) => source
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, ' ')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ');

// ---------- The ledger ----------

function parseLedger(text) {
  if (text === null) return null;
  const lines = text.split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines.map((raw, index) => {
    let value; let error = null;
    try { value = JSON.parse(raw); } catch (e) { error = `does not parse as JSON (${e.message})`; }
    if (!error && !isObject(value)) error = 'is not a JSON object';
    return { number: index + 1, raw, value: error ? null : value, error };
  });
}

function ledgerEntryProblems(value) {
  const problems = [];
  for (const key of LEDGER_REQUIRED) if (!(key in value)) problems.push(`missing "${key}"`);
  const has = (key) => key in value;
  if (has('id') && (typeof value.id !== 'string' || !LEDGER_ID.test(value.id))) problems.push('"id" must look like YYYY-MM-DD-some-slug');
  if (has('date') && !validDate(value.date)) problems.push('"date" must be a YYYY-MM-DD date');
  if (has('kind') && !LEDGER_KINDS.includes(value.kind)) problems.push(`"kind" must be one of ${LEDGER_KINDS.join(', ')}`);
  for (const key of ['title', 'hypothesis', 'primary_metric', 'decision_rule']) if (has(key) && typeof value[key] !== 'string') problems.push(`"${key}" must be a string`);
  if (has('title') && typeof value.title === 'string' && !value.title.trim()) problems.push('"title" is empty');
  if (has('guardrails') && !Array.isArray(value.guardrails)) problems.push('"guardrails" must be an array');
  if (has('baseline') && !isObject(value.baseline)) problems.push('"baseline" must be an object');
  if (has('evaluate_after')) {
    const nullable = value.kind === 'fix' || value.kind === 'revert';
    if (!(validDate(value.evaluate_after) || (nullable && value.evaluate_after === null))) problems.push(`"evaluate_after" must be a YYYY-MM-DD date${nullable ? ' or null' : ' (null only for fix and revert)'}`);
  }
  if (has('status') && !LEDGER_STATUSES.includes(value.status)) problems.push(`"status" must be one of ${LEDGER_STATUSES.join(', ')}`);
  if (has('pr') && !(value.pr === null || (Number.isInteger(value.pr) && value.pr > 0))) problems.push('"pr" must be a pull request number or null');
  if (has('verdict') && !(value.verdict === null || LEDGER_VERDICTS.includes(value.verdict))) problems.push(`"verdict" must be null or one of ${LEDGER_VERDICTS.join(', ')}`);
  if (has('result') && !(value.result === null || isObject(value.result))) problems.push('"result" must be null or an object');
  if (has('evaluated_on') && !(value.evaluated_on === null || validDate(value.evaluated_on))) problems.push('"evaluated_on" must be null or a YYYY-MM-DD date');
  return problems;
}

function checkLedger(baseText, headText, violations) {
  const v = (line, message) => violations.push({ rule: 'ledger', file: LEDGER, line, message });
  const head = parseLedger(headText);
  if (!head) { v(null, 'missing: every autopilot pull request appends a line to autopilot/ledger.jsonl'); return; }
  const base = parseLedger(baseText) || [];
  const seen = new Map();
  for (const entry of head) {
    if (entry.error) { v(entry.number, `line ${entry.error}`); continue; }
    for (const problem of ledgerEntryProblems(entry.value)) v(entry.number, problem);
    if (typeof entry.value.id === 'string') {
      if (seen.has(entry.value.id)) v(entry.number, `id "${entry.value.id}" is already used on line ${seen.get(entry.value.id)}`);
      else seen.set(entry.value.id, entry.number);
    }
  }
  if (head.length <= base.length) v(null, `adds no line (the base has ${base.length}, the head ${head.length}); append one entry for this change`);
  for (const old of base) {
    const now = head[old.number - 1];
    if (!now) { v(old.number, 'an existing line was removed'); continue; }
    if (!old.value || !now.value) { if (old.raw !== now.raw) v(old.number, 'an existing line changed'); continue; }
    if (old.value.id !== now.value.id) { v(old.number, `existing line ${old.number} (id "${old.value.id}") was removed or moved; only append new lines`); continue; }
    const keys = new Set([...Object.keys(old.value), ...Object.keys(now.value)]);
    const changed = [...keys].filter((key) => !LEDGER_MUTABLE.has(key) && !sameJson(old.value[key], now.value[key]));
    if (changed.length) v(old.number, `entry "${old.value.id}" changed ${changed.map((k) => `"${k}"`).join(', ')}; existing entries may change only ${[...LEDGER_MUTABLE].join(', ')}`);
  }
}

// ---------- The check ----------

function currentBranch(cwd) {
  const out = git(cwd, ['symbolic-ref', '--short', '-q', 'HEAD'], { allowFail: true });
  return out ? out.trim() : null;
}

/**
 * Checks one change. Returns { ok, skipped, branch, base, head, mergeBase, files, changedLines, binaryBytes, violations }.
 * Each violation is { rule, file, line, message }.
 */
function check({ cwd = process.cwd(), base, head, branch } = {}) {
  if (!base || !head) throw new GitError('--base and --head are required');
  let name = branch || process.env.GITHUB_HEAD_REF || '';
  if (!name && head === 'HEAD') name = currentBranch(cwd) || '';
  const result = { ok: true, skipped: false, branch: name || null, base, head, mergeBase: null, files: 0, changedLines: 0, binaryBytes: 0, violations: [] };
  if (!name.startsWith(BRANCH_PREFIX)) return { ...result, skipped: true };

  const violations = result.violations;
  const add = (rule, file, line, message) => violations.push({ rule, file, line, message });
  if (!BRANCH_NAME.test(name) || name.length > BRANCH_MAX) add('branch-name', null, null, `"${name}" must match autopilot/YYYY-MM-DD-slug (lower-case letters, digits and single hyphens) and be at most ${BRANCH_MAX} characters`);

  const headSha = git(cwd, ['rev-parse', '--verify', '--quiet', `${head}^{commit}`]).trim();
  const baseSha = git(cwd, ['rev-parse', '--verify', '--quiet', `${base}^{commit}`]).trim();
  const mergeBase = git(cwd, ['merge-base', baseSha, headSha]).trim();
  result.mergeBase = mergeBase;

  const entries = changedEntries(cwd, mergeBase, headSha);
  result.files = entries.length;
  let binaryTotal = 0;
  for (const entry of entries) {
    const shown = entry.newPath || entry.oldPath;
    for (const file of new Set([entry.oldPath, entry.newPath].filter(Boolean))) {
      const glob = protectedBy(file);
      const verb = { A: 'added', D: 'deleted', M: 'changed', R: 'renamed', C: 'copied', T: 'changed type' }[entry.status] || 'changed';
      if (glob) add('protected-path', file, null, `${verb}; ${glob} is protected (autopilot/CONSTITUTION.md §6)`);
    }
    if (entry.oldPath && ROUTE_FILE.test(entry.oldPath) && entry.oldPath !== entry.newPath) {
      add('route-deletion', entry.oldPath, null, entry.newPath ? `renamed to ${entry.newPath}; moving a page changes its URL (owner decision)` : 'deleted; removing a page removes its URL (owner decision)');
    }
    if (entry.newPath && (entry.newMode === '120000' || entry.newMode === '160000')) {
      add('file-type', entry.newPath, null, entry.newMode === '120000' ? 'symbolic links are not allowed' : 'submodules are not allowed');
      continue;
    }
    const oldBlob = entry.oldPath ? blob(cwd, entry.oldSha) : null;
    const newBlob = entry.newPath ? blob(cwd, entry.newSha) : null;
    if (looksBinary(oldBlob) || looksBinary(newBlob)) {
      const where = entry.newPath || entry.oldPath;
      if (!where.startsWith('public/') || where.startsWith('public/data/')) add('binary', where, null, 'binary files may change only under public/ (not public/data/)');
      if (entry.newPath) {
        const size = blobSize(cwd, entry.newSha);
        binaryTotal += size;
        if (size > LIMITS.binaryBytes) add('binary', entry.newPath, null, `${Math.round(size / 1024)} KB; each binary file may be at most ${LIMITS.binaryBytes / 1024} KB`);
      }
      continue;
    }
    const { added, deleted } = textChange(cwd, mergeBase, headSha, entry);
    if (shown !== LEDGER) result.changedLines += added.length + deleted;
    if (entry.newPath && isScanned(entry.newPath)) {
      scan(entry.newPath, added, FORBIDDEN, 'forbidden-pattern', violations);
      scan(entry.newPath, added, BANNED, 'banned-copy', violations);
    }
  }
  result.binaryBytes = binaryTotal;
  if (binaryTotal > LIMITS.binaryTotalBytes) add('size', null, null, `binary files total ${(binaryTotal / 1024 / 1024).toFixed(2)} MB; at most ${LIMITS.binaryTotalBytes / 1024 / 1024} MB`);
  if (entries.length > LIMITS.files) add('size', null, null, `${entries.length} changed files; at most ${LIMITS.files}`);
  if (result.changedLines > LIMITS.lines) add('size', null, null, `${result.changedLines} changed lines (added + deleted, not counting ${LEDGER}); at most ${LIMITS.lines}`);

  const layout = showFile(cwd, headSha, 'app/layout.tsx');
  const layoutBefore = showFile(cwd, mergeBase, 'app/layout.tsx');
  if (layout === null) add('required-content', 'app/layout.tsx', null, 'is missing');
  else {
    const live = withoutComments(layout);
    if (!live.includes('<SiteAnalytics')) add('required-content', 'app/layout.tsx', null, 'must still render <SiteAnalytics />');
    if (layoutBefore !== null && withoutComments(layoutBefore).includes('<ExperimentHead') && !live.includes('<ExperimentHead')) add('required-content', 'app/layout.tsx', null, 'must still render <ExperimentHead />');
  }

  checkLedger(showFile(cwd, mergeBase, LEDGER), showFile(cwd, headSha, LEDGER), violations);
  result.ok = violations.length === 0;
  return result;
}

function report(result) {
  if (result.skipped) return `autopilot-guard: ${result.branch ? `"${result.branch}" is` : 'this is'} not an autopilot branch; nothing to check`;
  const lines = [`autopilot-guard: ${result.branch}: ${result.files} changed files, ${result.changedLines} changed lines, ${Math.round(result.binaryBytes / 1024)} KB of binary files (${result.base}...${result.head}, merge base ${String(result.mergeBase).slice(0, 7)})`];
  if (result.ok) lines.push('PASS: nothing an autopilot pull request may not change');
  else {
    lines.push(`FAIL: ${result.violations.length} violation${result.violations.length === 1 ? '' : 's'}`);
    for (const v of result.violations) lines.push(`  ${v.rule.padEnd(17)} ${v.file ? `${v.file}${v.line ? `:${v.line}` : ''}  ` : ''}${v.message}`);
    lines.push('Rules: autopilot/CONSTITUTION.md and docs/AUTOPILOT.md. A change that needs any of this goes to an autopilot:needs-owner issue.');
  }
  return lines.join('\n');
}

// ---------- Self-test ----------

function selfTest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-guard-'));
  const run = (...args) => execFileSync('git', ['-c', 'user.name=Self Test', '-c', 'user.email=self-test@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  const write = (file, content) => { fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true }); fs.writeFileSync(path.join(dir, file), content); };
  const remove = (file) => fs.rmSync(path.join(dir, file), { force: true });
  const entry = (id, extra = {}) => JSON.stringify({ id, date: id.slice(0, 10), kind: 'change', title: 'A change', hypothesis: 'Clearer copy helps.', primary_metric: 'engaged_visit_rate', guardrails: ['bounce'], baseline: { rate: 0.4, n: 120 }, decision_rule: 'Keep if the rate rises.', evaluate_after: '2026-10-28', status: 'proposed', pr: null, verdict: null, result: null, ...extra });
  const BASE_LEDGER = `${entry('2026-10-01-first', { status: 'shipped', pr: 60 })}\n`;
  const STORE = "export function read() {\n  try { return window.localStorage.getItem('units'); } catch { return null; }\n}\nexport function other() {\n  return 1;\n}\n";
  const LAYOUT = "import SiteAnalytics from '@/components/SiteAnalytics';\nexport default function RootLayout({ children }) {\n  return <html><body>{children}<SiteAnalytics /></body></html>;\n}\n";
  const failures = [];
  let cases = 0;
  try {
    run('init', '-q', '-b', 'main');
    write('app/layout.tsx', LAYOUT);
    write('app/page.tsx', 'export default function Home() { return <h1>Pace Notes</h1>; }\n');
    write('app/tools/page.tsx', 'export default function Tools() { return <h1>Tools</h1>; }\n');
    write('app/robots.ts', 'export default function robots() { return { rules: [] }; }\n');
    write('components/Card.tsx', 'export function Card() {\n  return <div>Card</div>;\n}\n');
    write('components/Store.tsx', STORE);
    write('lib/analytics.ts', 'export const on = true;\n');
    write('docs/NOTES.md', '# Notes\n');
    write('public/og/card.png', Buffer.concat([Buffer.from('\x89PNG\r\n\x1a\n', 'binary'), Buffer.alloc(64)]));
    write(LEDGER, BASE_LEDGER);
    run('add', '-A'); run('commit', '-q', '-m', 'base');

    const expect = (label, { branch = 'autopilot/2026-10-14-test', base = 'main', ledger = true, setup, rules = [], messages = [] }) => {
      cases += 1;
      run('checkout', '-q', '-f', base);
      run('clean', '-q', '-fdx');
      run('checkout', '-q', '-B', `case-${cases}`);
      if (ledger) fs.appendFileSync(path.join(dir, LEDGER), `${entry(`2026-10-14-case-${cases}`)}\n`);
      setup();
      run('add', '-A');
      run('commit', '-q', '--allow-empty', '-m', label);
      let result;
      try { result = check({ cwd: dir, base, head: 'HEAD', branch }); } catch (error) { failures.push(`${label}: threw ${error.message}`); return; }
      const got = [...new Set(result.violations.map((v) => v.rule))].sort();
      const want = [...new Set(rules)].sort();
      if (JSON.stringify(got) !== JSON.stringify(want)) failures.push(`${label}: expected [${want.join(', ') || 'pass'}], got [${got.join(', ') || 'pass'}]${result.violations.length ? `: ${result.violations.map((v) => `${v.rule} ${v.file || ''}:${v.line || ''} ${v.message}`).join(' | ')}` : ''}`);
      for (const text of messages) if (!result.violations.some((v) => `${v.file}:${v.line} ${v.message}`.includes(text))) failures.push(`${label}: no violation mentions "${text}"`);
      return result;
    };

    // Branches
    const skipped = expect('non-autopilot branch passes without checks', { branch: 'feature/anything', ledger: false, setup: () => write('lib/analytics.ts', 'export const on = false;\n') });
    if (skipped && !skipped.skipped) failures.push('non-autopilot branch: not reported as skipped');
    expect('a well-formed change passes', { setup: () => write('components/Card.tsx', 'export function Card() {\n  return <div>Better card</div>;\n}\n') });
    expect('branch without a date', { branch: 'autopilot/home-hero', setup: () => {}, rules: ['branch-name'] });
    expect('branch with capitals', { branch: 'autopilot/2026-10-14-Home', setup: () => {}, rules: ['branch-name'] });
    expect('branch with a double hyphen', { branch: 'autopilot/2026-10-14-home--hero', setup: () => {}, rules: ['branch-name'] });
    expect('branch over 80 characters', { branch: `autopilot/2026-10-14-${'a'.repeat(60)}`, setup: () => {}, rules: ['branch-name'] });

    // Protected paths: change, add, delete, rename out of and into
    expect('protected file changed', { setup: () => write('lib/analytics.ts', 'export const on = false;\n'), rules: ['protected-path'], messages: ['lib/analytics.ts'] });
    expect('protected folder file added', { setup: () => write('scripts/new.cjs', 'console.log(1);\n'), rules: ['protected-path'] });
    expect('workflow added', { setup: () => write('.github/workflows/x.yml', 'on: push\n'), rules: ['protected-path'] });
    expect('protected file deleted', { setup: () => remove('lib/analytics.ts'), rules: ['protected-path'] });
    expect('protected file renamed out', { setup: () => { remove('lib/analytics.ts'); write('lib/stats.ts', 'export const on = true;\n'); }, rules: ['protected-path'], messages: ['lib/analytics.ts'] });
    expect('file renamed into a protected folder', { setup: () => { remove('components/Card.tsx'); write('scripts/Card.tsx', 'export function Card() {\n  return <div>Card</div>;\n}\n'); }, rules: ['protected-path'], messages: ['scripts/Card.tsx'] });
    for (const file of ['public/data/x.json', 'analysis/release.json', 'app/privacy/page.tsx', 'app/error.tsx', 'next.config.mjs', 'LICENSE', 'package.json', 'autopilot/CONSTITUTION.md', '.claude/skills/x/SKILL.md', 'CLAUDE.md', 'docs/ANALYTICS.md']) {
      expect(`protected ${file}`, { setup: () => write(file, '{}\n'), rules: ['protected-path'] });
    }

    // Routes
    expect('page deleted', { setup: () => remove('app/tools/page.tsx'), rules: ['route-deletion'] });
    expect('page renamed', { setup: () => { remove('app/tools/page.tsx'); write('app/kit/page.tsx', 'export default function Tools() { return <h1>Tools</h1>; }\n'); }, rules: ['route-deletion'] });
    expect('robots route deleted', { setup: () => remove('app/robots.ts'), rules: ['route-deletion'] });
    expect('page added', { setup: () => write('app/guide/page.tsx', 'export default function Guide() { return <h1>Guide</h1>; }\n') });

    // Required content
    expect('SiteAnalytics removed', { setup: () => write('app/layout.tsx', LAYOUT.replace('<SiteAnalytics />', '')), rules: ['required-content'] });
    expect('SiteAnalytics commented out', { setup: () => write('app/layout.tsx', LAYOUT.replace('<SiteAnalytics />', '{/* <SiteAnalytics /> */}')), rules: ['required-content'] });
    expect('ExperimentHead absent on base and head', { setup: () => write('app/layout.tsx', LAYOUT.replace('<html>', '<html lang="en">')) });
    run('checkout', '-q', '-f', 'main'); run('checkout', '-q', '-B', 'main-exp');
    write('app/layout.tsx', LAYOUT.replace('<html>', '<html><head><ExperimentHead /></head>'));
    run('add', '-A'); run('commit', '-q', '-m', 'experiments');
    expect('ExperimentHead kept', { base: 'main-exp', setup: () => write('components/Card.tsx', 'export const x = 1;\n') });
    expect('ExperimentHead removed', { base: 'main-exp', setup: () => write('app/layout.tsx', LAYOUT), rules: ['required-content'], messages: ['ExperimentHead'] });

    // Forbidden patterns: each on its own, in a component
    const FORBIDDEN_CASES = [
      ['<script', '<script>alert(1)</script>'], ['next/script', "import Script from 'next/script';"], ['dangerouslySetInnerHTML', '<div dangerouslySetInnerHTML={{ __html: x }} />'],
      ['HTML injection', 'el.innerHTML = text;'], ['eval(', 'eval(code);'], ['new Function(', 'const f = new Function("return 1");'],
      ['document.cookie', 'document.cookie = "a=1";'], ['browser storage', 'window.localStorage.setItem("k", v);'], ['browser storage', 'sessionStorage.getItem("k");'],
      ['browser storage', 'indexedDB.open("db");'], ['navigator.sendBeacon', 'navigator.sendBeacon("/x", body);'], ['XMLHttpRequest', 'new XMLHttpRequest();'],
      ['new WebSocket', 'new WebSocket("wss://x");'], ['EventSource(', 'new EventSource("/x");'], ['PostHog', "import posthog from 'posthog-js';"], ['PostHog', '// PostHog sees this'],
      ['<iframe', '<iframe title="x" />'], ['fetch( of an absolute URL', "fetch('https://api.example.com/x');"], ['fetch( of an absolute URL', 'fetch(`//cdn.example.com/x`)'],
      ['import( of an http(s) URL', "import('https://cdn.example.com/x.js');"], ['src=/srcSet= of an absolute URL', '<img src="https://images.example.com/a.png" alt="" />'],
      ['src=/srcSet= of an absolute URL', '<img srcSet={"https://images.example.com/a.png 2x"} alt="" />'], ['url( of an absolute URL', "const bg = { backgroundImage: 'url(https://images.example.com/a.png)' };"],
      ['@import of an http(s) URL', "@import 'https://fonts.example.com/a.css';"], ['<link>/<image>/<use> of an absolute URL', '<link rel="preconnect" href="https://fonts.example.com" />'],
      ['RTCPeerConnection', 'new RTCPeerConnection();'], ['service worker', "navigator.serviceWorker.register('/sw.js');"],
    ];
    for (const [name, code] of FORBIDDEN_CASES) {
      expect(`forbidden ${name}: ${code}`, { setup: () => write('components/Card.tsx', `export function Card() {\n  ${code}\n  return <div>Card</div>;\n}\n`), rules: ['forbidden-pattern'], messages: [`components/Card.tsx:2 ${name}`] });
    }
    expect('forbidden pattern split over lines', { setup: () => write('components/Card.tsx', 'export function Card() {\n  return <link\n    rel="stylesheet"\n    href="https://fonts.example.com/a.css" />;\n}\n'), rules: ['forbidden-pattern'], messages: ['components/Card.tsx:2'] });
    expect('forbidden pattern in a CSS file', { setup: () => write('app/x.css', '.a { background: url("//images.example.com/a.png"); }\n'), rules: ['forbidden-pattern'] });
    expect('forbidden pattern in an SVG under public', { setup: () => write('public/x.svg', '<svg><script>alert(1)</script></svg>\n'), rules: ['forbidden-pattern'] });
    expect('forbidden pattern in a new folder', { setup: () => write('utils/x.ts', "export const load = () => fetch('https://api.example.com');\n"), rules: ['forbidden-pattern'] });
    expect('allowed: links, local fetch, local images', { setup: () => write('components/Card.tsx', 'export function Card() {\n  fetch(\'/data/x.json\');\n  return <a href="https://doi.org/10.1371/journal.pone.0251513"><img src="/og/card.png" alt="" /></a>;\n}\n') });
    expect('allowed: words in docs and the backlog', { setup: () => { write('docs/NOTES.md', 'PostHog, localStorage and the wall, written in docs.\n'); write('autopilot/backlog.md', 'Check posthog funnels; avoid "arithmetic".\n'); } });
    expect('only added lines are scanned', { setup: () => write('components/Store.tsx', STORE.replace('return 1;', 'return 2;')) });

    // Banned copy
    for (const [label, text] of [['arithmetic', 'Simple arithmetic.'], ['the wall', 'Runners hit the wall.'], ['the wall', 'Before the  wall'], ['your chance', 'Your chance of finishing'], ['private-export', 'From private-export-20260912-0934'], ['20260912', 'Built 20260912']]) {
      expect(`banned ${label}`, { setup: () => write('components/Card.tsx', `export function Card() {\n  return <p>${text}</p>;\n}\n`), rules: ['banned-copy'] });
    }

    // Size and binaries
    expect('31 changed files', { setup: () => { for (let i = 0; i < 30; i += 1) write(`components/gen/F${i}.tsx`, `export const f${i} = ${i};\n`); }, rules: ['size'], messages: ['31 changed files'] });
    expect('30 changed files', { setup: () => { for (let i = 0; i < 29; i += 1) write(`components/gen/F${i}.tsx`, `export const f${i} = ${i};\n`); } });
    expect('1,501 changed lines', { setup: () => write('components/Long.tsx', Array.from({ length: 1501 }, (_, i) => `export const v${i} = ${i};`).join('\n') + '\n'), rules: ['size'], messages: ['1501 changed lines'] });
    expect('1,500 changed lines', { setup: () => write('components/Long.tsx', Array.from({ length: 1500 }, (_, i) => `export const v${i} = ${i};`).join('\n') + '\n') });
    expect('ledger lines do not count', { ledger: false, setup: () => fs.appendFileSync(path.join(dir, LEDGER), Array.from({ length: 1600 }, (_, i) => `${entry(`2026-10-14-bulk-${i}`)}\n`).join('')) });
    const png = (kb) => Buffer.concat([Buffer.from('\x89PNG\r\n\x1a\n', 'binary'), Buffer.alloc(8), Buffer.alloc(kb * 1024 - 16, 1)]);
    expect('binary under public', { setup: () => write('public/og/new.png', png(100)) });
    expect('binary outside public', { setup: () => write('components/x.png', png(1)), rules: ['binary'] });
    expect('binary deleted under public', { setup: () => remove('public/og/card.png') });
    expect('binary over 600 KB', { setup: () => write('public/og/big.png', png(601)), rules: ['binary'], messages: ['601 KB'] });
    expect('binaries over 2 MB in total', { setup: () => { for (let i = 0; i < 4; i += 1) write(`public/og/b${i}.png`, png(550)); }, rules: ['size'] });
    expect('symbolic link', { setup: () => fs.symlinkSync('/etc/hostname', path.join(dir, 'public/link.txt')), rules: ['file-type'] });

    // Ledger
    expect('no ledger line added', { ledger: false, setup: () => write('components/Card.tsx', 'export const y = 2;\n'), rules: ['ledger'], messages: ['adds no line'] });
    const ledgerCase = (label, lineText, wanted = ['ledger']) => expect(label, { ledger: false, setup: () => fs.appendFileSync(path.join(dir, LEDGER), `${lineText}\n`), rules: wanted });
    ledgerCase('ledger line is not JSON', '{not json');
    ledgerCase('ledger line is an array', '[1,2]');
    ledgerCase('ledger key missing', JSON.stringify((({ hypothesis, ...rest }) => rest)(JSON.parse(entry('2026-10-14-missing')))));
    ledgerCase('ledger id malformed', entry('Home Hero'));
    ledgerCase('ledger id reused', entry('2026-10-01-first'));
    ledgerCase('ledger date invalid', entry('2026-10-14-date', { date: '2026-02-30' }));
    ledgerCase('ledger kind unknown', entry('2026-10-14-kind', { kind: 'tweak' }));
    ledgerCase('ledger status unknown', entry('2026-10-14-status', { status: 'done' }));
    ledgerCase('ledger verdict unknown', entry('2026-10-14-verdict', { verdict: 'win' }));
    ledgerCase('ledger pr is a string', entry('2026-10-14-pr', { pr: '61' }));
    ledgerCase('ledger guardrails not an array', entry('2026-10-14-guard', { guardrails: 'bounce' }));
    ledgerCase('ledger baseline not an object', entry('2026-10-14-baseline', { baseline: 0.4 }));
    ledgerCase('ledger result not an object', entry('2026-10-14-result', { result: 'good' }));
    ledgerCase('ledger evaluate_after null for a change', entry('2026-10-14-eval', { evaluate_after: null }));
    ledgerCase('ledger evaluate_after null for a fix', entry('2026-10-14-fix', { kind: 'fix', evaluate_after: null }), []);
    ledgerCase('ledger evaluate_after null for a revert', entry('2026-10-14-revert', { kind: 'revert', evaluate_after: null }), []);
    ledgerCase('ledger with extra keys', entry('2026-10-14-extra', { notes: 'context', evaluated_on: null, experiment: 'home-hero' }), []);
    expect('existing ledger line removed', { ledger: false, setup: () => write(LEDGER, `${entry('2026-10-14-only')}\n`), rules: ['ledger'] });
    expect('existing ledger line moved', { ledger: false, setup: () => write(LEDGER, `${entry('2026-10-14-new')}\n${BASE_LEDGER}`), rules: ['ledger'] });
    expect('existing ledger entry title changed', { ledger: false, setup: () => write(LEDGER, `${entry('2026-10-01-first', { status: 'shipped', pr: 60, title: 'Rewritten' })}\n${entry('2026-10-14-new')}\n`), rules: ['ledger'], messages: ['"title"'] });
    expect('existing ledger entry decision rule changed', { ledger: false, setup: () => write(LEDGER, `${entry('2026-10-01-first', { status: 'shipped', pr: 60, decision_rule: 'Anything goes.' })}\n${entry('2026-10-14-new')}\n`), rules: ['ledger'], messages: ['"decision_rule"'] });
    expect('existing ledger entry evaluated', { ledger: false, setup: () => write(LEDGER, `${entry('2026-10-01-first', { status: 'concluded', pr: 60, verdict: 'keep', result: { rate: 0.45 }, evaluated_on: '2026-10-14', notes: 'Held up.' })}\n${entry('2026-10-14-conclude', { kind: 'conclude' })}\n`) });
    expect('an empty change still needs a ledger line', { ledger: false, setup: () => {}, rules: ['ledger'] });
    run('checkout', '-q', '-f', 'main'); run('checkout', '-q', '-B', 'main-noledger'); remove(LEDGER); run('add', '-A'); run('commit', '-q', '-m', 'no ledger');
    expect('first ledger line on a base without one', { base: 'main-noledger', ledger: false, setup: () => write(LEDGER, `${entry('2026-10-14-first')}\n`) });
    expect('ledger missing on head', { base: 'main-noledger', ledger: false, setup: () => write('components/Card.tsx', 'export const z = 3;\n'), rules: ['ledger'], messages: ['missing'] });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  if (failures.length) {
    console.error(`autopilot-guard self-test: ${failures.length} of ${cases} cases failed`);
    for (const failure of failures) console.error(`  ${failure}`);
    return 1;
  }
  console.log(`autopilot-guard self-test: ${cases} cases passed (${PROTECTED.length} protected patterns, ${FORBIDDEN.length} forbidden patterns, ${BANNED.length} banned phrases)`);
  return 0;
}

// ---------- CLI ----------

function main(argv) {
  if (argv.includes('--self-test')) return selfTest();
  const option = (name) => { const at = argv.indexOf(name); return at >= 0 ? argv[at + 1] : undefined; };
  const json = argv.includes('--json');
  try {
    const result = check({ base: option('--base'), head: option('--head'), branch: option('--branch') });
    console.log(json ? JSON.stringify(result, null, 2) : report(result));
    return result.ok ? 0 : 1;
  } catch (error) {
    if (!(error instanceof GitError)) throw error;
    if (json) console.log(JSON.stringify({ ok: false, error: error.message }, null, 2));
    console.error(`autopilot-guard: ${error.message}\nUsage: node scripts/autopilot-guard.cjs --base <git-ref> --head <git-ref> [--branch <name>] [--json] | --self-test`);
    return 2;
  }
}

module.exports = { PROTECTED, FORBIDDEN, BANNED, LIMITS, check, protectedBy };

if (require.main === module) process.exitCode = main(process.argv.slice(2));
