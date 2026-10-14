#!/usr/bin/env node
/**
 * Older-browser checks: Safari before 16.4 (iOS 15 and iOS 16.0–16.3).
 *
 *   npm run verify:compat              the browser source in app/, components/, lib/, hooks/ and context/
 *   npm run verify:compat -- --build   the built JavaScript in out/_next/static (run after npm run build)
 *   node scripts/verify-browser-compat.cjs --build --out <dir>   another export folder
 *
 * What it covers:
 * - Lookbehind, `(?<=` or `(?<!`, in a regex literal or a pattern string, in the source and in the build (which also
 *   holds every third-party module the pages load). Safari before 16.4 throws a SyntaxError when it parses or builds
 *   one, and a throw while a page loads replaces it with Next.js's "Application error" screen. Named groups,
 *   `(?<name>`, work there and are not flagged.
 * - Built-ins that Safari added in 15.4 or later and Next.js 14 does not polyfill, in the source only: structuredClone,
 *   findLast and findLastIndex, toSorted, toReversed, toSpliced and with, Object.groupBy and Map.groupBy. Libraries may
 *   name them behind a feature check, so the build is not scanned for them.
 * Not covered: other syntax (Next.js compiles it down for Safari 12), other built-ins (Next.js polyfills a few, such as
 * Array.prototype.at and Object.hasOwn), CSS, and anything a library calls beyond the lookbehind scan of the build.
 * Comments count too: a flagged name in a comment is a false alarm worth rewording.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '..');
const SOURCE_DIRS = ['app', 'components', 'lib', 'hooks', 'context'];
const LOOKBEHIND = { pattern: /\(\?<[=!]/, label: 'lookbehind (Safari before 16.4 cannot parse it)' };
const NEWER_BUILT_INS = [
  { pattern: /\bstructuredClone\s*\(/, label: 'structuredClone() (Safari 15.4)' },
  { pattern: /\.findLast(?:Index)?\s*\(/, label: 'findLast() or findLastIndex() (Safari 15.4)' },
  { pattern: /\.(?:toSorted|toReversed|toSpliced|with)\s*\(|\bArray\.prototype\.(?:toSorted|toReversed|toSpliced|with)\b/, label: 'toSorted(), toReversed(), toSpliced() or with() (Safari 16)' },
  { pattern: /\b(?:Object|Map)\.groupBy\s*\(/, label: 'Object.groupBy() or Map.groupBy() (Safari 17.4)' },
];

const shown = file => path.relative(ROOT, file).startsWith('..') ? file : path.relative(ROOT, file);
const filesUnder = (dir, extension) => fs.existsSync(dir)
  ? fs.readdirSync(dir, { recursive: true }).filter(file => extension.test(file)).sort().map(file => path.join(dir, file))
  : [];

/** Every hit of the rules in the files, one per rule and line: { file, line, column, rule, excerpt }. */
function scan(files, rules) {
  const problems = [];
  for (const file of files) {
    fs.readFileSync(file, 'utf8').split('\n').forEach((text, index) => {
      for (const rule of rules) {
        const match = rule.pattern.exec(text);
        if (match) problems.push({ file: shown(file), line: index + 1, column: match.index + 1, rule: rule.label, excerpt: text.slice(Math.max(0, match.index - 30), match.index + 50).trim() });
      }
    });
  }
  return problems;
}

/** The browser source: lookbehind and the newer built-ins. */
function sourceProblems() {
  const files = SOURCE_DIRS.flatMap(dir => filesUnder(path.join(ROOT, dir), /\.(?:ts|tsx|js|mjs)$/));
  return { files: files.length, problems: scan(files, [LOOKBEHIND, ...NEWER_BUILT_INS]) };
}

/** The built JavaScript of a static export: lookbehind only. */
function buildProblems(out = path.join(ROOT, 'out')) {
  const files = filesUnder(path.join(out, '_next', 'static'), /\.js$/);
  return { files: files.length, problems: scan(files, [LOOKBEHIND]) };
}

const describe = problems => problems.map(p => `${p.file}:${p.line}:${p.column} ${p.rule}: …${p.excerpt}…`).join('\n');

/** The patterns themselves, checked before every run. */
function selfTest() {
  for (const text of ['/(?<=\\.)\\s+/', "new RegExp('(?<![\\\\w:.])5')", '`(?<!x)`']) assert.match(text, LOOKBEHIND.pattern, text);
  for (const text of ['/(?<year>\\d{4})/', '/(?:a|b)/', '/a(?=b)/', '/a(?!b)/', "'(?<'"]) assert.doesNotMatch(text, LOOKBEHIND.pattern, text);
  const flagged = text => NEWER_BUILT_INS.some(rule => rule.pattern.test(text));
  for (const text of ['structuredClone(value)', 'rows.findLast(row => row.n)', 'rows.findLastIndex(Boolean)', 'rows.toSorted()', 'rows.with(0, 1)', 'Array.prototype.toReversed', 'Object.groupBy(rows, key)', 'Map.groupBy(rows, key)']) assert.ok(flagged(text), text);
  for (const text of ['text.startsWith(prefix)', 'rows.sort()', 'rows.findIndex(Boolean)', 'withUnits(href)', 'findLastFinish(rows)', 'groupBy(rows)']) assert.ok(!flagged(text), text);
}

module.exports = { sourceProblems, buildProblems, describe };

if (require.main === module) {
  selfTest();
  const args = process.argv.slice(2);
  const build = args.includes('--build');
  const out = path.resolve(args.includes('--out') ? args[args.indexOf('--out') + 1] : path.join(ROOT, 'out'));
  const { files, problems } = build ? buildProblems(out) : sourceProblems();
  if (build && !files) {
    console.error(`No built JavaScript under ${path.join(out, '_next', 'static')}: run npm run build first.`);
    process.exit(1);
  }
  if (problems.length) {
    console.error(`${problems.length} older-Safari problem${problems.length === 1 ? '' : 's'}:\n${describe(problems)}`);
    process.exit(1);
  }
  console.log(build
    ? `Checked ${files} built JavaScript files: no lookbehind, so Safari before 16.4 can parse them all.`
    : `Checked ${files} browser source files: no lookbehind and none of the built-ins that need Safari 15.4 or later.`);
}
