#!/usr/bin/env node
'use strict';
// The tier and link vocabulary (lead decision D16, November 14, 2026; docs/DESIGN_SYSTEM.md, "Tier and link labels").
// One module holds the words (lib/tiers.ts) and one file draws them (components/ui/TierTag.tsx). This checks that:
//   1. the vocabulary is exactly the table below: these codes, these words, these forms, the two anchors, no more;
//   2. every code the release uses has words or is on the never-shown list: the module's lists against the checked-in
//      files of the pinned release that carry its codes, and, with --source, against the release's own files;
//   3. the module's functions refuse what they should: an unknown code, a never-shown tier, `undefined`, a weaker-source
//      flag that disagrees with its tier; and a tier line reads as its two reference examples;
//   4. the components render each label in both modes (a link to its anchor, a bare label) and have no client script;
//      the design system's section names the same words, codes and anchors;
//   5. the styles in app/styles/components/badge.css are built from the evidence badge's and the scope chip's
//      declarations and tokens (so no hue, no fill and no theme rule of their own), wrap at spaces and have a 44 px hit
//      area as links; no other sheet changes a label's look;
//   6. no file under app/, components/ or lib/ other than the module writes a tier phrase in a string or in JSX text,
//      and none but the components writes a label class. What stood before the module is the BASELINE below: listed,
//      counted and printed. A new use fails, and so does a baseline entry that no longer matches (remove it).
//
//   node scripts/verify-tiers.cjs               the checks above
//   node scripts/verify-tiers.cjs --self-test   checks the checker against planted mistakes
//   node scripts/verify-tiers.cjs --list        prints every use check 6 finds, baseline included, and stops
//   node scripts/verify-tiers.cjs --source=<file or folder>[,<file or folder>…]
//       also recounts the codes from the release's own files (edition_meta.parquet, EDITION-TIERS.csv, the link file
//       and the identity file with its description); needs python3 with duckdb. Read on November 14, 2026 from the
//       adapted input folder, the release's CORE folder and its assets folder.
//
// Not part of `npm run verify:data` yet (November 14, 2026): it joins when the pages that use the module land.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { spawnSync } = require('node:child_process');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const rel = (file) => path.relative(ROOT, file).split(path.sep).join('/');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
}).outputText, filename);
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  return resolveFilename.call(this, request.startsWith('@/') ? path.join(ROOT, request.slice(2)) : request, ...args);
};

const MODULE = 'lib/tiers.ts';
const COMPONENTS = 'components/ui/TierTag.tsx';
const SHEET = 'app/styles/components/badge.css';

// ---- 1. The vocabulary, as the lead fixed it. Sentence case, no number, no hue.
const TABLE = [
  { kind: 'tier', code: 'stamped', words: 'Verified', form: 'badge' },
  { kind: 'tier', code: 'stamped_weaker_source', words: 'Verified, weaker source', form: 'badge' },
  { kind: 'tier', code: 'partial', words: 'Partial results', form: 'pill' },
  { kind: 'tier', code: 'unverified', words: 'Unverified', form: 'pill' },
  { kind: 'tier', code: 'held_for_review', words: 'Held for review', form: 'pill' },
  { kind: 'split', code: 'finish_time_only', words: 'Finish times only', form: 'pill' },
  { kind: 'timing', code: 'gross', words: 'Gun times', form: 'pill' },
  ...['medium_variant', 'low', 'low_noage', 'low_noage_series', 'low_nosex', 'low_city_pace', 'low_carryover'].map((code) => ({ kind: 'link', code, words: 'Possible match', form: 'pill' })),
];
/** Codes that say nothing more: the usual case. */
const QUIET = { split: ['splits'], link: ['high_elite', 'high', 'medium'] };
/** Tiers of editions with no result: never shown, and asking for their words is an error. */
const NEVER_SHOWN = ['excluded', 'no_rows'];
/** The editions the release times gross (decision D6). */
const GUN_TIMES = { distance: 'half', city: 'Berlin', years: [2018, 2019, 2021, 2022, 2023] };
const ANCHOR = { tier: '/methodology#edition-tiers', split: '/methodology#edition-tiers', timing: '/methodology#edition-tiers', link: '/methodology#link-confidence' };
const CLASS = { badge: 'tier-badge', pill: 'tier-chip' };

// ---- 2. Checked-in files of the pinned release that carry its codes. Each names the release it was built from.
const EVIDENCE = 'docs/evidence/2026-11-14/release-20261113-1113';
const PIN = 'analysis/release.json';

// ---- 6. What stood before the module (November 14, 2026). Not edited by the module's author; each is reported to
// the lead with the file that owns it. `count` is the number of strings or JSX texts of the file that hold the phrase.
const BASELINE = [
  { file: 'components/methods/MethodsPages.tsx', phrase: 'Possible match', count: 1,
    why: '/methodology#runner-search says a matching name "is a possible match": any name match, not the link mark. D16 rewords it so the term has one meaning.' },
  { file: 'components/methods/MethodsHalf.tsx', phrase: 'Held for review', count: 1,
    why: '/methodology on the half’s editions: "are held for review by the producer". Prose on the one page that defines the words; the half rebuild rewrites the paragraph.' },
  { file: 'components/methods/MethodsHalf.tsx', phrase: 'Gun times', count: 1,
    why: '/methodology, the same paragraph: "The Berlin half’s 2018, 2019, 2022 and 2023 lists are among them: their times fit gun times." Decision D6 adds 2021; the half rebuild rewrites it.' },
  { file: 'lib/analysis-plans.ts', phrase: 'Gun times', count: 1,
    why: 'an analysis request’s list of the data it would need ("Individual chip and gun times, …"): two kinds of time, not the label of an edition.' },
];

let checks = 0;
const ok = (condition, message) => { assert.ok(condition, message); checks++; };
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const throws = (fn, pattern, message) => { assert.throws(fn, pattern, message); checks++; };
const sorted = (list) => [...list].sort();

// ---------------------------------------------------------------------------------------------------------------
// The scanner (check 6)

/** The rules a string or a JSX text is held to, built from the module's own phrases and classes. */
function scanRules(t) {
  const phrases = [];
  for (const phrase of t.TIER_PHRASES) {
    if (/\s/.test(phrase)) {
      // A phrase of several words, anywhere in a text, in any case, singular or plural. "Verified, weaker source" is
      // caught by the words it adds, so a hand-made "weaker source" label is too.
      const words = phrase.toLowerCase().split(/[\s,]+/);
      const own = phrase === t.TIER_WORDS.stamped_weaker_source ? words.slice(1) : words;
      phrases.push({ phrase, test: new RegExp(`\\b${own.join('[\\s,-]+')}(?:es|s)?\\b`, 'i') });
    } else {
      // A one-word phrase is an ordinary word in prose ("verified results"): only the label itself is a use, that is
      // the capitalised word alone, or the word after a count (a hand-made tier line).
      phrases.push({ phrase, test: new RegExp(`^${phrase}$|\\b\\d[\\d,.]*\\s+${phrase.toLowerCase()}\\b(?!\\s+[a-z])`) });
    }
  }
  return { phrases, classes: new RegExp(`\\b(?:${t.TIER_CLASSES.join('|')})\\b`) };
}

/** Every string literal, template chunk and JSX text of a TypeScript source, with its line. Comments are not read. */
function literals(file, text) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out = [];
  const add = (node, value) => out.push({ line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, value });
  const visit = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) add(node, node.text);
    else if (ts.isTemplateExpression(node)) { add(node.head, node.head.text); for (const span of node.templateSpans) add(span.literal, span.literal.text); }
    else if (ts.isJsxText(node)) add(node, node.text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

/** The strings a stylesheet prints (content: '…'). */
function cssStrings(text) {
  const out = [];
  const plain = uncomment(text);
  for (const m of plain.matchAll(/content\s*:\s*(?:'([^']*)'|"([^"]*)")/g)) out.push({ line: plain.slice(0, m.index).split('\n').length, value: m[1] ?? m[2] });
  return out;
}

/** The uses in one file: [{ file, line, kind: 'phrase' | 'class', what, text }]. */
function scanFile(file, text, rules) {
  const found = [];
  const flat = (value) => value.replace(/[\s ]+/g, ' ').trim();
  const isCss = file.endsWith('.css');
  for (const { line, value } of isCss ? cssStrings(text) : literals(file, text)) {
    const words = flat(value);
    if (!words) continue;
    if (file !== MODULE) for (const { phrase, test } of rules.phrases) if (test.test(words)) found.push({ file, line, kind: 'phrase', what: phrase, text: words.slice(0, 110) });
    if (!isCss && file !== MODULE && file !== COMPONENTS && rules.classes.test(words)) found.push({ file, line, kind: 'class', what: rules.classes.exec(words)[0], text: words.slice(0, 110) });
  }
  return found;
}

function walk(dir, test) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file, test) : test.test(entry.name) ? [file] : [];
  }).sort();
}

// ---------------------------------------------------------------------------------------------------------------
// The stylesheet reader (check 5)

const uncomment = (css) => css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));

/** The rules of a sheet: [{ selector, declarations: Map(property → value), context: ['@media …'] }]. */
function cssRules(css) {
  const text = uncomment(css);
  const out = [];
  const stack = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      const prelude = text.slice(start, i).trim().replace(/\s+/g, ' ');
      if (/^@(?:media|supports|container|layer|document)\b/.test(prelude)) { stack.push(prelude); start = i + 1; continue; }
      let depth = 1, end = i + 1;
      while (end < text.length && depth) { if (text[end] === '{') depth++; else if (text[end] === '}') depth--; end++; }
      const body = text.slice(i + 1, end - 1);
      const declarations = new Map(body.split(/;(?![^(]*\))/).map((d) => d.trim()).filter((d) => d.includes(':')).map((d) => [d.slice(0, d.indexOf(':')).trim().toLowerCase(), d.slice(d.indexOf(':') + 1).trim().replace(/\s+/g, ' ')]));
      out.push({ selector: prelude, declarations, context: [...stack] });
      i = end - 1; start = end;
    } else if (text[i] === '}') { stack.pop(); start = i + 1; }
  }
  return out;
}
const selectors = (rule) => rule.selector.split(',').map((s) => s.trim());
const tokensOf = (rule) => [...rule.declarations.values()].flatMap((value) => [...value.matchAll(/var\(\s*(--[a-z0-9-]+)/g)].map((m) => m[1]));
/** Properties that give a label its look: only badge.css sets them on a tier class. */
const LOOK = /^(?:color|background(?:-color|-image)?|border(?:-(?:top|right|bottom|left))?(?:-color)?|border-radius|outline(?:-color)?|box-shadow|fill|stroke|opacity|filter|font-family|font-weight|font-style|text-transform|letter-spacing)$/;

/** The problems of the tier rules of badge.css, and of any other sheet that restyles a label. */
function styleProblems(sheets, t) {
  const problems = [];
  const badge = sheets.find(([file]) => file === SHEET);
  if (!badge) return [`${SHEET} is missing`];
  const rules = cssRules(badge[1]);
  const tierClass = new RegExp(`\\.(?:${t.TIER_CLASSES.join('|')})\\b`);
  const tier = rules.filter((rule) => tierClass.test(rule.selector));
  const base = (selector) => rules.find((rule) => selectors(rule).includes(selector));
  const need = (selector) => { const rule = base(selector); if (!rule) problems.push(`${SHEET}: no rule for ${selector}`); return rule; };
  const same = (mine, theirs, properties) => {
    const a = need(mine), b = need(theirs);
    if (!a || !b) return;
    for (const property of properties) if (a.declarations.get(property) !== b.declarations.get(property)) problems.push(`${SHEET}: ${mine} sets ${property}: ${a.declarations.get(property)}, but ${theirs}, which it is drawn as, has ${b.declarations.get(property)}`);
  };
  // Drawn as the evidence badge is, and as the scope chip is.
  same('.tier-badge', '.evidence-badge', ['display', 'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-transform', 'color', 'background', 'border']);
  same('.tier-chip', '.scope-chip', ['display', 'align-items', 'max-width', 'min-height', 'padding', 'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-transform', 'color', 'background', 'border', 'border-radius', 'white-space', 'text-align']);
  same('a.tier-chip::after', 'a.scope-chip::after', ['content', 'position', 'left', 'right', 'top', 'height', 'min-height', 'transform']);
  // No hue and no fill: only the tokens the two forms above already use, and no background.
  const allowed = new Set(rules.filter((rule) => /\.(?:evidence-badge|scope-chip|distance-chip|reading-dek-tags)\b/.test(rule.selector)).flatMap(tokensOf));
  for (const rule of tier) {
    for (const token of tokensOf(rule)) if (!allowed.has(token)) problems.push(`${SHEET}: ${rule.selector} uses ${token}, which the evidence badge and the scope chip do not: a tier label has no colour of its own`);
    for (const [property, value] of rule.declarations) {
      if (/^background/.test(property) && value !== 'none') problems.push(`${SHEET}: ${rule.selector} has a fill (${property}: ${value})`);
      if (/#[0-9a-f]{3,8}\b|\b(?:rgb|hsl)a?\(/i.test(value)) problems.push(`${SHEET}: ${rule.selector} has a colour literal in ${property}`);
    }
    if (/\[data-theme|\.night\b/.test(rule.selector) || rule.context.some((c) => /prefers-color-scheme/.test(c))) problems.push(`${SHEET}: ${rule.selector} is a theme rule: the tokens already change with the surface`);
  }
  // They wrap at their spaces inside a narrow column, never inside a word.
  for (const selector of ['.tier-badge', '.tier-chip']) {
    const rule = need(selector);
    if (!rule) continue;
    for (const [property, value] of [['white-space', 'normal'], ['overflow-wrap', 'normal'], ['max-width', '100%']]) if (rule.declarations.get(property) !== value) problems.push(`${SHEET}: ${selector} needs ${property}: ${value} to wrap inside its column (it has ${rule.declarations.get(property)})`);
  }
  // As links: a 44 px hit area, a focus ring.
  for (const selector of ['a.tier-badge', 'a.tier-chip']) {
    const after = need(`${selector}::after`);
    if (after && (after.declarations.get('height') !== '44px' || after.declarations.get('position') !== 'absolute')) problems.push(`${SHEET}: ${selector}::after is not the 44 px hit area`);
    const focus = need(`${selector}:focus-visible`);
    if (focus && !/var\(--focus\)/.test(focus.declarations.get('outline') || '')) problems.push(`${SHEET}: ${selector}:focus-visible has no --focus ring`);
  }
  // Every other sheet may place a label (margin, alignment, order) but not change its look.
  for (const [file, css] of sheets) {
    if (file === SHEET) continue;
    for (const rule of cssRules(css)) {
      if (!/\.tier-(?:badge|chip)\b/.test(rule.selector)) continue;
      for (const property of rule.declarations.keys()) if (LOOK.test(property)) problems.push(`${file}: ${rule.selector} sets ${property} on a tier label; its look is ${SHEET}’s alone`);
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------------------------
// The release's own files (check 2 with --source)

const PYTHON = `
import json, sys
import duckdb
con = duckdb.connect()
con.execute("PRAGMA threads=2")
out = []
for path in sys.argv[1:]:
    src = "read_parquet('" + path.replace("'", "''") + "')"
    cols = [r[0] for r in con.execute("DESCRIBE SELECT * FROM " + src).fetchall()]
    entry = {"file": path}
    if "verification_tier" in cols:
        by = "distance" if "distance" in cols else "'marathon'"
        entry["editions"] = con.execute("SELECT " + by + " AS distance, verification_tier, split_tier, weaker_source, verified_badge, count(*) FROM " + src + " GROUP BY ALL ORDER BY ALL").fetchall()
        entry["timing"] = con.execute("SELECT " + by + " AS distance, timing_basis, count(*), list(city || '|' || CAST(year AS VARCHAR) ORDER BY city, year)[1:12] FROM " + src + " GROUP BY ALL ORDER BY ALL").fetchall()
    if "link_tier" in cols:
        entry["links"] = con.execute("SELECT distance, link_tier, status, count(*) FROM " + src + " GROUP BY ALL ORDER BY ALL").fetchall()
    if "confidence" in cols:
        entry["links"] = con.execute("SELECT distance, confidence, CASE WHEN person_id IS NULL THEN 'unlinked' ELSE 'linked' END, count(*) FROM " + src + " GROUP BY ALL ORDER BY ALL").fetchall()
    out.append(entry)
print(json.dumps(out))
`;

/** A CSV with quoted fields, as rows of { column: value }. */
function csvRows(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') quoted = false; else field += c; }
    else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows;
  return body.filter((r) => r.length === header.length).map((r) => Object.fromEntries(header.map((name, i) => [name, r[i]])));
}

/** Recounts the codes from the release's own files and holds the module to them. */
function checkSource(list, t) {
  const WANTED = /^(?:edition_meta\.parquet|EDITION-TIERS\.csv|identity\.parquet|identity\.parquet\.json|.*race_results_linked\.parquet)$/;
  const files = list.flatMap((entry) => {
    const full = path.resolve(entry);
    if (!fs.existsSync(full)) throw new Error(`verify-tiers --source: ${entry} does not exist`);
    if (!fs.statSync(full).isDirectory()) return [full];
    const depth = (dir, left) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? (left ? depth(path.join(dir, e.name), left - 1) : []) : WANTED.test(e.name) ? [path.join(dir, e.name)] : []);
    return depth(full, 1);
  });
  ok(files.length > 0, 'verify-tiers --source: no release file found (edition_meta.parquet, EDITION-TIERS.csv, the link file, the identity file)');
  const seen = { tiers: new Map(), splits: new Map(), links: new Map(), gross: [], statuses: new Map() };
  const named = (file) => `${path.basename(path.dirname(file))}/${path.basename(file)}`;
  const count = (map, code, n, where) => { const row = map.get(code) || { n: 0, where: new Set() }; row.n += n; row.where.add(where); map.set(code, row); };
  /** What each file holds, for the printed receipt: Map(file → Map("distance: kind" → Map(code → n))). */
  const receipt = new Map();
  const tally = (where, group, code, n) => {
    const file = receipt.get(where) || receipt.set(where, new Map()).get(where);
    const codes = file.get(group) || file.set(group, new Map()).get(group);
    codes.set(code, (codes.get(code) || 0) + n);
  };
  const edition = (where, distance, tier, split, weaker, badge, n) => {
    count(seen.tiers, tier, n, where);
    tally(where, `${distance} editions by tier`, tier, n);
    if (split) tally(where, `${distance} editions by split tier`, split, n);
    if (!t.isShownTier(tier)) { ok(split === null || split === '', `${where}: a ${tier} edition has the split tier ${split}; an edition without results has none`); return; }
    count(seen.splits, split, n, where);
    t.splitTierWords(split);
    eq(t.tierWords(tier, weaker), t.TIER_WORDS[tier], `${where}: ${distance} ${tier} with weaker_source ${weaker}`);
    eq(t.tierHasBadge(tier), badge, `${where}: ${distance} ${tier} editions have verified_badge ${badge}`);
  };
  const bool = (v) => (v === true || v === 'True' || v === 'true' ? true : v === false || v === 'False' || v === 'false' ? false : null);
  const parquet = files.filter((f) => f.endsWith('.parquet'));
  if (parquet.length) {
    const run = spawnSync('python3', ['-I', '-c', PYTHON, ...parquet], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (run.status !== 0) throw new Error(`verify-tiers --source: python3 with duckdb could not read the release files:\n${run.stderr || run.error}`);
    for (const entry of JSON.parse(run.stdout)) {
      const where = named(entry.file);
      for (const [distance, tier, split, weaker, badge, n] of entry.editions || []) edition(where, distance, tier, split, weaker, badge, n);
      for (const [distance, basis, n, editions] of entry.timing || []) {
        if (basis !== null && /\bgun\b|brutto|bruto|gross/i.test(basis) && !t.isGrossTiming(basis)) tally(where, `${distance} editions whose basis names gun or gross time among others (not marked)`, basis, n);
        if (t.isGrossTiming(basis)) seen.gross.push({ where, distance, basis, n, editions });
      }
      for (const [distance, confidence, status, n] of entry.links || []) {
        if (confidence !== null) count(seen.links, confidence, n, where);
        count(seen.statuses, status, n, where);
        tally(where, `${distance} results by link confidence`, confidence === null ? 'no link' : confidence, n);
      }
    }
  }
  for (const file of files.filter((f) => f.endsWith('.csv'))) {
    const where = named(file);
    const groups = new Map();
    for (const row of csvRows(fs.readFileSync(file, 'utf8'))) {
      const key = JSON.stringify([row.distance, row.verification_tier, row.split_tier, bool(row.weaker_source), bool(row.verified_badge)]);
      groups.set(key, (groups.get(key) || 0) + 1);
    }
    ok(groups.size > 0, `${where}: no edition row read`);
    for (const [key, n] of groups) { const [distance, tier, split, weaker, badge] = JSON.parse(key); edition(where, distance, tier, split, t.isShownTier(tier) ? weaker : null, badge, n); }
  }
  for (const file of files.filter((f) => f.endsWith('.json'))) {
    const where = named(file);
    const rule = JSON.parse(fs.readFileSync(file, 'utf8')).identity_rule;
    ok(rule && Array.isArray(rule.keyed_confidences) && Array.isArray(rule.possible_confidences), `${where}: no identity_rule with its two lists`);
    eq(sorted(rule.keyed_confidences), sorted(t.KEYED_CONFIDENCES), `${where}: the confidences that key a runner`);
    eq(sorted(rule.possible_confidences), sorted(t.LINK_CONFIDENCES.filter((c) => !t.KEYED_CONFIDENCES.includes(c))), `${where}: the confidences of a possible match`);
    for (const confidence of [...rule.keyed_confidences, ...rule.possible_confidences]) count(seen.links, confidence, 0, where);
  }
  for (const confidence of seen.links.keys()) t.isKeyedConfidence(confidence);
  // With the release's own table of both distances and its link file at hand, the module's lists hold no code the release lacks.
  const complete = [...seen.tiers.values()].some((row) => [...row.where].some((w) => /EDITION-TIERS|edition_meta/.test(w))) && seen.tiers.has('no_rows') && seen.links.size > 0;
  if (complete) {
    eq(sorted(seen.tiers.keys()), sorted(t.EDITION_TIERS), 'the release’s verification tiers are the module’s list');
    eq(sorted(seen.splits.keys()), sorted(t.SPLIT_TIERS), 'the release’s split tiers are the module’s list');
    eq(sorted(seen.links.keys()), sorted(t.LINK_CONFIDENCES), 'the release’s link confidences are the module’s list');
    const gross = seen.gross.filter((g) => g.distance === t.GUN_TIME_EDITIONS.distance);
    eq(sorted(new Set(gross.flatMap((g) => g.editions))), sorted(t.GUN_TIME_EDITIONS.years.map((year) => `${t.GUN_TIME_EDITIONS.city}|${year}`)), 'the editions the release times gross are GUN_TIME_EDITIONS');
    eq(seen.gross.filter((g) => g.distance !== t.GUN_TIME_EDITIONS.distance), [], 'no marathon edition is timed gross');
  }
  console.log(`verify-tiers --source: ${files.length} release files read${complete ? ', both distances and the link file: the module’s lists are complete' : ' (not the full release: only "every code is known" was checked)'}`);
  for (const [where, groups] of receipt) {
    console.log(`  ${where}`);
    for (const [group, codes] of [...groups].sort(([a], [b]) => (a < b ? -1 : 1))) console.log(`    ${group}: ${[...codes].sort(([a], [b]) => (a < b ? -1 : 1)).map(([code, n]) => `${code} ${n.toLocaleString('en-US')}`).join(', ')}`);
  }
  for (const g of seen.gross) console.log(`  timed gross in ${g.where}: ${g.distance} "${g.basis}" on ${g.n} editions (${g.editions.join(', ')})`);
}

// ---------------------------------------------------------------------------------------------------------------

function selfTest(t) {
  const rules = scanRules(t);
  const planted = [
    ['components/x.tsx', "const a = 'Possible match';", ['phrase Possible match']],
    ['components/x.tsx', 'const a = <span>Held for review</span>;', ['phrase Held for review']],
    ['components/x.tsx', 'const a = <p>These are possible matches of one runner.</p>;', ['phrase Possible match']],
    ['components/x.tsx', 'const n = 2; const a = `${n} possible matches`;', ['phrase Possible match']],
    ['components/x.tsx', "// Possible match, Held for review and Verified in a comment\nconst a = 1; /* Gun times */", []],
    ['components/x.tsx', "const a = <span className=\"tier-chip\">x</span>;", ['class tier-chip']],
    ['components/x.tsx', "const a = <a className={`tier-badge ${extra}`} href=\"/\">x</a>;", ['class tier-badge']],
    ['components/x.tsx', "const scope = 'verified'; const b = 'verified results only'; const c = 'Includes unverified half results';", []],
    ['components/x.tsx', 'const a = <b>Verified</b>;', ['phrase Verified']],
    ['components/x.tsx', "const a = 'Unverified';", ['phrase Unverified']],
    ['components/x.tsx', "const a = '16 verified'; const b = '2 unverified · 3 held for review';", ['phrase Verified', 'phrase Unverified', 'phrase Held for review']],
    ['components/x.tsx', "const a = '239 verified editions';", []],
    ['components/x.tsx', "const a = 'Verified, weaker source'; const b = 'weaker-source stamps';", ['phrase Verified, weaker source', 'phrase Verified, weaker source']],
    ['components/x.tsx', "const a = 'begun times'; const b = 'Finish times: only two';", []],
    ['components/x.tsx', "const a = {'Finish times only'}; const b = 'chip and gun times';", ['phrase Finish times only', 'phrase Gun times']],
    ['components/x.tsx', "const a = 'Partial\\u00a0results';", ['phrase Partial results']],
    ['app/styles/x.css', ".a::before { content: 'Verified'; } .b::after { content: ''; } /* content: 'Unverified' */", ['phrase Verified']],
    [COMPONENTS, "const a = <span className=\"tier-chip\">{words}</span>; const b = 'Possible match';", ['phrase Possible match']],
    [MODULE, "export const POSSIBLE_MATCH = 'Possible match'; export const TIER_CLASSES = ['tier-chip'];", []],
  ];
  let failed = 0;
  for (const [file, text, expected] of planted) {
    const got = scanFile(file, text, rules).map((f) => `${f.kind} ${f.what}`);
    if (JSON.stringify(got) !== JSON.stringify(expected)) { failed++; console.error(`self-test: ${file}: ${text}\n  expected ${JSON.stringify(expected)}, got ${JSON.stringify(got)}`); }
  }
  const sheet = fs.readFileSync(path.join(ROOT, SHEET), 'utf8');
  const styles = (extra, other = []) => styleProblems([[SHEET, sheet + extra], ...other], t);
  const css = [
    ['', [], null],
    ['.tier-chip { color: var(--signal-ink); }', [], /--signal-ink/],
    ['.tier-badge::before { border-color: var(--accent); }', [], /--accent/],
    ['a.tier-chip:hover { background: var(--ink); }', [], /a fill/],
    ['.tier-chip { border-color: #E5461A; }', [], /colour literal/],
    ['[data-theme="dark"] .tier-chip { color: var(--ink); }', [], /theme rule/],
    ['', [['app/styles/pages/x.css', '.row .tier-chip { color: var(--ink-3); }']], /its look is/],
    ['', [['app/styles/pages/x.css', '.row .tier-chip { margin-left: 8px; align-self: center; }']], null],
  ];
  for (const [extra, other, expect] of css) {
    const got = styles(extra, other);
    if (expect ? !got.some((p) => expect.test(p)) : got.length) { failed++; console.error(`self-test: styles ${extra || JSON.stringify(other)}\n  expected ${expect || 'no problem'}, got ${JSON.stringify(got)}`); }
  }
  for (const [from, to, expect] of [['white-space: normal; overflow-wrap: normal; text-align: left;\n}\n.tier-badge::before', 'white-space: nowrap; overflow-wrap: normal; text-align: left;\n}\n.tier-badge::before', /white-space/], ['height: 44px; min-height: 100%; transform: translateY(-50%); }\na.tier-chip::after', 'height: 30px; min-height: 100%; transform: translateY(-50%); }\na.tier-chip::after', /44 px hit area/]]) {
    if (!sheet.includes(from)) { failed++; console.error(`self-test: ${SHEET} no longer holds the text a planted mistake replaces: ${from.slice(0, 60)}`); continue; }
    if (!styleProblems([[SHEET, sheet.replace(from, to)]], t).some((p) => expect.test(p))) { failed++; console.error(`self-test: a sheet with ${to.slice(0, 40)}… passed`); }
  }
  console.log(failed ? `verify-tiers self-test: ${failed} failed` : 'verify-tiers self-test: ok');
  return failed ? 1 : 0;
}

function main() {
  const t = require(path.join(ROOT, MODULE));
  if (process.argv.includes('--self-test')) process.exit(selfTest(t));

  // ---- 1. The vocabulary is exactly the table.
  const of = (kind) => TABLE.filter((row) => row.kind === kind);
  eq([...t.SHOWN_TIERS], of('tier').map((row) => row.code), 'the shown tiers, in the order of the table');
  eq({ ...t.TIER_WORDS }, Object.fromEntries(of('tier').map((row) => [row.code, row.words])), 'the tier words');
  eq(sorted(t.BADGE_TIERS), sorted(of('tier').filter((row) => row.form === 'badge').map((row) => row.code)), 'the tiers that carry the badge');
  eq([...t.NEVER_SHOWN_TIERS], NEVER_SHOWN, 'the never-shown tiers');
  eq(sorted(t.EDITION_TIERS), sorted([...of('tier').map((row) => row.code), ...NEVER_SHOWN]), 'every tier has words or is never shown');
  eq(sorted(t.SPLIT_TIERS), sorted([...of('split').map((row) => row.code), ...QUIET.split]), 'the split tiers');
  eq(sorted(t.LINK_CONFIDENCES), sorted([...of('link').map((row) => row.code), ...QUIET.link]), 'the link confidences');
  eq(sorted(t.KEYED_CONFIDENCES), sorted(QUIET.link), 'the confidences that say nothing more');
  eq([t.FINISH_TIMES_ONLY, t.GUN_TIMES, t.POSSIBLE_MATCH], [of('split')[0].words, of('timing')[0].words, of('link')[0].words], 'the split, timing and link words');
  eq([...t.TIER_PHRASES], [...new Set(TABLE.map((row) => row.words))], 'the phrases of the vocabulary, and no other');
  eq([t.TIER_ANCHOR, t.LINK_ANCHOR], [ANCHOR.tier, ANCHOR.link], 'the two anchors');
  eq({ ...t.GUN_TIME_EDITIONS, years: [...t.GUN_TIME_EDITIONS.years] }, GUN_TIMES, 'the editions timed gross');
  for (const row of TABLE) {
    const words = row.kind === 'tier' ? t.tierWords(row.code) : row.kind === 'split' ? t.splitTierWords(row.code) : row.kind === 'timing' ? t.timingWords(row.code) : t.linkWords(row.code);
    eq(words, row.words, `${row.kind} ${row.code}`);
    ok(/^[A-Z][a-z]+(?:,? [a-z]+)*$/.test(row.words), `"${row.words}" is sentence case with no number`);
  }
  for (const [kind, codes] of Object.entries(QUIET)) for (const code of codes) eq(kind === 'split' ? t.splitTierWords(code) : t.linkWords(code), null, `${kind} ${code} says nothing more`);

  // ---- 3. What the functions refuse, and the tier line.
  for (const tier of NEVER_SHOWN) {
    throws(() => t.tierWords(tier), /never shown/, `the words of ${tier} are an error`);
    throws(() => t.tierHasBadge(tier), /never shown/, `the badge of ${tier} is an error`);
    eq(t.isShownTier(tier), false, `${tier} is not shown`);
    throws(() => t.tierLine({ stamped: 1, [tier]: 1 }), /never shown/, `a tier line with ${tier} editions is an error`);
    throws(() => t.countTiers(['stamped', tier]), /never shown/, `counting a ${tier} edition is an error`);
  }
  for (const bad of ['Stamped', 'verified', '', null, undefined, 4]) {
    throws(() => t.tierWords(bad), /unknown verification tier/, `tier ${bad}`);
    throws(() => t.isShownTier(bad), /unknown verification tier/, `tier ${bad}`);
    throws(() => t.splitTierWords(bad), /unknown split tier/, `split tier ${bad}`);
  }
  for (const bad of ['High', 'unlinked', 'low_other', '', undefined, 3]) throws(() => t.linkWords(bad), /unknown link confidence/, `confidence ${bad}`);
  throws(() => t.timingWords(undefined), /no timing basis/, 'an undefined timing basis');
  eq([t.timingWords(null), t.timingWords('chip'), t.timingWords('gun'), t.timingWords('grossly'), t.timingWords('Gross (gun / Brutto)'), t.timingWords(t.GROSS_TIMING)], [null, null, null, null, GUN_TIMES_WORDS(), GUN_TIMES_WORDS()], 'only a basis that starts with the word gross reads "Gun times"');
  throws(() => t.tierWords('stamped', true), /weaker_source/, 'a stamped edition flagged weaker source');
  throws(() => t.tierWords('stamped_weaker_source', false), /weaker_source/, 'a weaker-source stamp without its flag');
  eq([t.tierWords('stamped_weaker_source', true), t.tierWords('stamped', false), t.tierWords('partial', null)], ['Verified, weaker source', 'Verified', 'Partial results'], 'the flag agrees with the tier');
  eq(t.linkWords(null), null, 'a result with no link says nothing');
  eq([t.linkWords('high', { keyed: false }), t.linkWords('medium', { keyed: true }), t.linkWords('low', { keyed: false })], ['Possible match', null, 'Possible match'], 'a keyed confidence without a runner key is a possible match');
  throws(() => t.linkWords('low', { keyed: true }), /never keys/, 'a low link with a runner key');
  throws(() => t.linkWords(null, { keyed: true }), /no link/, 'no link with a runner key');
  const dot = ' · ';
  eq(t.tierLine({ stamped_weaker_source: 6, held_for_review: 10 }), `6 verified, weaker source${dot}10 held for review`, 'the tier line of the first reference example');
  eq(t.tierLine({ stamped: 16 }), '16 verified', 'one tier for all');
  eq(t.tierLine({ held_for_review: 1, unverified: 2, partial: 3, stamped_weaker_source: 4, stamped: 5, excluded: 0 }), ['5 verified', '4 verified, weaker source', '3 partial results', '2 unverified', '1 held for review'].join(dot), 'the order of the table, whatever the order of the counts');
  eq(t.tierLine({ unverified: 1224 }, (n) => n.toLocaleString('en-US')), '1,224 unverified', 'a formatter for large counts');
  eq(t.tierLine(t.countTiers(['partial', 'stamped', 'partial'])), `1 verified${dot}2 partial results`, 'counts from a list of editions');
  eq(t.tierLineParts({ stamped: 2, unverified: 1 }).reduce((sum, part) => sum + part.count, 0), 3, 'the parts add up to the editions');
  for (const bad of [{}, { stamped: 0 }, { stamped: 1.5 }, { stamped: -1 }, { bogus: 1 }]) throws(() => t.tierLine(bad), /lib\/tiers/, `a tier line from ${JSON.stringify(bad)}`);
  eq([t.possibleMatchCount(1), t.possibleMatchCount(2), t.POSSIBLE_MATCHES, t.inline('Held for review')], ['1 possible match', '2 possible matches', 'Possible matches', 'held for review'], 'the words inside a line');

  // ---- 2. Every code in the checked-in files of the pinned release is known.
  const pin = JSON.parse(read(PIN));
  const contract = JSON.parse(read(`${EVIDENCE}/release-contract.json`));
  const directory = JSON.parse(read(`${EVIDENCE}/edition-directory.json`));
  const cohort = JSON.parse(read('analysis/marathon-cohort/manifest.json'));
  for (const [name, tag] of [['release-contract.json', contract.release_tag], ['edition-directory.json', directory.tag], ['the marathon cohort manifest', cohort.release_tag]]) {
    eq(tag, pin.tag, `${name} is of the pinned release: when the pin moves, point this verifier at the new release’s files and recount with --source`);
  }
  const seen = { tiers: new Set(Object.keys(contract.producer_counts.editions_json_tiers)), splits: new Set(), links: new Set([...contract.combined_reconciliation.identity_rule.keyed_confidences, ...contract.combined_reconciliation.identity_rule.possible_confidences]) };
  eq(sorted(contract.combined_reconciliation.identity_rule.keyed_confidences), sorted(t.KEYED_CONFIDENCES), 'the release contract’s keyed confidences');
  const col = Object.fromEntries(directory.columns.map((name, i) => [name, i]));
  for (const name of ['city', 'year', 'tier', 'verified_badge', 'weaker_source', 'split_tier', 'timing_basis']) ok(name in col, `edition-directory.json has the column ${name}`);
  let editions = 0;
  for (const row of directory.editions) {
    const where = `${row[col.city]} ${row[col.year]}`;
    seen.tiers.add(row[col.tier]); seen.splits.add(row[col.split_tier]);
    assert.equal(t.tierWords(row[col.tier], row[col.weaker_source]), t.TIER_WORDS[row[col.tier]], where);
    assert.equal(t.tierHasBadge(row[col.tier]), row[col.verified_badge], `${where}: the badge is the release’s verified_badge`);
    t.splitTierWords(row[col.split_tier]);
    assert.equal(t.timingWords(row[col.timing_basis]), null, `${where}: no marathon edition is timed gross`);
    editions++;
  }
  eq(editions, directory.totals.editions, 'every edition of the directory was read');
  for (const edition of cohort.editions) {
    seen.tiers.add(edition.tier);
    assert.equal(t.tierWords(edition.tier, edition.weaker_source), t.TIER_WORDS[edition.tier], `${edition.city} ${edition.year}`);
    assert.equal(t.timingWords(edition.timing_basis), null, `${edition.city} ${edition.year}`);
  }
  checks += cohort.editions.length;
  for (const tier of seen.tiers) t.isShownTier(tier);
  for (const split of seen.splits) t.splitTierWords(split);
  for (const confidence of seen.links) t.isKeyedConfidence(confidence);
  eq(sorted(seen.links), sorted(t.LINK_CONFIDENCES), 'the link confidences of the release contract are the module’s');
  ok(sorted(t.SHOWN_TIERS).every((tier) => seen.tiers.has(tier)), 'every shown tier occurs in the checked-in files');
  const unseen = t.EDITION_TIERS.filter((tier) => !seen.tiers.has(tier));
  const source = process.argv.find((a) => a.startsWith('--source='));
  if (source) checkSource(source.slice('--source='.length).split(',').filter(Boolean), t);

  // ---- 4. The components.
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const C = require(path.join(ROOT, COMPONENTS));
  const html = (component, props) => renderToStaticMarkup(React.createElement(component, props));
  const attribute = (markup, name) => (new RegExp(`\\s${name}="([^"]*)"`).exec(markup) || [])[1];
  const label = (markup, { tag, cls, href, words, data }) => {
    ok(new RegExp(`^<${tag}\\s[^>]*>[^<]*</${tag}>$`).test(markup), `one <${tag}> with text only: ${markup}`);
    eq([attribute(markup, 'class'), attribute(markup, 'href'), markup.replace(/<[^>]+>/g, '')], [cls, href, words], markup);
    for (const [name, value] of Object.entries(data)) eq(attribute(markup, name), value, `${markup} carries ${name}`);
    ok(t.TIER_LABEL_CLASS.test(markup), `TIER_LABEL_CLASS finds ${markup}`);
  };
  for (const row of TABLE) {
    const [component, props, data] = row.kind === 'tier' ? [C.TierTag, { tier: row.code }, { 'data-tier': row.code }]
      : row.kind === 'split' ? [C.SplitTierTag, { splitTier: row.code }, { 'data-split-tier': row.code }]
        : row.kind === 'timing' ? [C.TimingTag, { timingBasis: row.code }, { 'data-timing': 'gross' }]
          : [C.LinkMark, { confidence: row.code }, { 'data-link': row.code }];
    label(html(component, props), { tag: 'a', cls: CLASS[row.form], href: ANCHOR[row.kind], words: row.words, data });
    label(html(component, { ...props, link: false }), { tag: 'span', cls: CLASS[row.form], href: undefined, words: row.words, data });
  }
  eq(html(C.TierTag, { tier: 'partial', link: false, className: 'x' }), '<span class="tier-chip x" data-tier="partial">Partial results</span>', 'a bare label with a class of the page’s');
  eq([html(C.SplitTierTag, { splitTier: 'splits' }), html(C.TimingTag, { timingBasis: 'chip' }), html(C.TimingTag, { timingBasis: null }), html(C.LinkMark, { confidence: 'high' }), html(C.LinkMark, { confidence: null })], ['', '', '', '', ''], 'the usual case draws nothing');
  label(html(C.LinkMark, { confidence: 'high', keyed: false, link: false }), { tag: 'span', cls: 'tier-chip', href: undefined, words: 'Possible match', data: { 'data-link': 'high' } });
  for (const [component, props] of [[C.TierTag, { tier: 'excluded' }], [C.TierTag, { tier: 'no_rows' }], [C.TierTag, { tier: 'bogus' }], [C.TierTag, { tier: 'stamped', weakerSource: true }], [C.SplitTierTag, { splitTier: null }], [C.TimingTag, {}], [C.LinkMark, { confidence: 'certain' }], [C.EditionTags, { tier: 'stamped', splitTier: 'splits' }]]) {
    throws(() => html(component, props), /lib\/tiers\.ts/, `rendering ${JSON.stringify(props)} stops`);
  }
  const group = html(C.EditionTags, { tier: 'held_for_review', splitTier: 'finish_time_only', timingBasis: 'gross (gun / Brutto)', link: false });
  eq(group, '<span class="tier-tags"><span class="tier-chip" data-tier="held_for_review">Held for review</span><span class="tier-chip" data-split-tier="finish_time_only">Finish times only</span><span class="tier-chip" data-timing="gross">Gun times</span></span>', 'an edition’s labels: tier, split tier, timing');
  ok(/^<span class="tier-tags tier-tags-links"><a [^>]*>Verified, weaker source<\/a><\/span>$/.test(html(C.EditionTags, { tier: 'stamped_weaker_source', weakerSource: true, splitTier: 'splits', timingBasis: 'chip' })), 'a group of links leaves room between rows');
  eq(html(C.TierLine, { counts: { stamped_weaker_source: 6, held_for_review: 10 } }), `<span class="tier-line">6 verified, weaker source${dot}10 held for review</span>`, 'the tier line is plain words');
  ok(t.TIER_LABEL_CLASS.test(html(C.TierLine, { counts: { stamped: 16 } })) && !t.TIER_LABEL_CLASS.test('<span class="frontier-chips">') && !t.TIER_LABEL_CLASS.test(html(C.TierTerm, { children: 'x' })), 'TIER_LABEL_CLASS finds the labels and the line, and nothing else');
  eq([attribute(html(C.TierTerm, { children: 'x' }), 'href'), attribute(html(C.LinkTerm, { children: 'x' }), 'href')], [ANCHOR.tier, ANCHOR.link], 'the two terms link to the two anchors');
  const componentSource = read(COMPONENTS);
  const code = componentSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ok(!/['"]use client['"]|\buse[A-Z]\w*\(|\bon[A-Z]\w*=|\bwindow\b|\bdocument\b/.test(code), `${COMPONENTS} has no client script: no state, effect, handler or browser object`);
  for (const cls of t.TIER_CLASSES) ok(code.includes(cls), `${COMPONENTS} draws with ${cls}`);
  ok(!/^\s*import\s|\brequire\(/m.test(read(MODULE)), `${MODULE} imports nothing`);

  // The design system's section says the same words and anchors.
  const doc = read('docs/DESIGN_SYSTEM.md');
  const section = (/\n## Tier and link labels\n([\s\S]*?)\n## /.exec(doc) || [])[1] || '';
  ok(section.length > 0, 'docs/DESIGN_SYSTEM.md has the section "Tier and link labels"');
  for (const row of TABLE) ok(section.includes(`| ${row.words} |`) && (row.kind === 'timing' || section.includes(`\`${row.code}\``) || /^low/.test(row.code)), `the section’s table has ${row.code}: ${row.words}`);
  for (const word of [...NEVER_SHOWN, ...QUIET.split, ...QUIET.link, ANCHOR.tier, ANCHOR.link, ...t.TIER_CLASSES]) ok(section.includes(word), `the section names ${word}`);

  // ---- 5. The styles.
  const sheets = walk(path.join(ROOT, 'app'), /\.css$/).map((file) => [rel(file), fs.readFileSync(file, 'utf8')]);
  const problems = styleProblems(sheets, t);
  assert.deepEqual(problems, [], `the tier styles:\n  ${problems.join('\n  ')}`);
  checks += sheets.length;

  // ---- 6. Nobody else writes a phrase or a label class.
  const rules = scanRules(t);
  const files = ['app', 'components', 'lib'].flatMap((dir) => walk(path.join(ROOT, dir), /\.(?:tsx?|css)$/));
  const found = files.flatMap((file) => scanFile(rel(file), fs.readFileSync(file, 'utf8'), rules));
  if (process.argv.includes('--list')) {
    for (const f of found) console.log(`${f.file}:${f.line}: ${f.kind} "${f.what}" in "${f.text}"`);
    console.log(`verify-tiers --list: ${found.length} uses in ${files.length} files`);
    return;
  }
  const key = (f) => `${f.file}\u0000${f.what}`;
  const expected = new Map(BASELINE.map((b) => [key({ file: b.file, what: b.phrase }), b]));
  const counts = new Map();
  for (const f of found.filter((f) => f.kind === 'phrase')) counts.set(key(f), [...(counts.get(key(f)) || []), f]);
  const failures = [];
  for (const f of found.filter((f) => f.kind === 'class')) failures.push(`${f.file}:${f.line}: writes the label class ${f.what} by hand ("${f.text}"); draw the label with ${COMPONENTS}`);
  for (const [k, uses] of counts) {
    const base = expected.get(k);
    if (!base) for (const f of uses) failures.push(`${f.file}:${f.line}: writes "${f.what}" ("${f.text}"); take the words from ${MODULE} (TierTag, tierWords, inline, …)`);
    else if (uses.length !== base.count) failures.push(`${base.file}: the baseline counts ${base.count} use of "${base.phrase}", found ${uses.length} (lines ${uses.map((f) => f.line).join(', ')})`);
  }
  for (const [k, base] of expected) if (!counts.has(k)) failures.push(`${base.file}: the baseline lists "${base.phrase}", which the file no longer writes: remove the entry`);
  assert.deepEqual(failures, [], `tier phrases and label classes outside the module:\n  ${failures.join('\n  ')}`);
  checks += files.length;

  console.log(`verify-tiers: ${checks} checks. The vocabulary is the table of ${TABLE.length} codes and ${t.TIER_PHRASES.length} phrases; every tier, split tier and link confidence in the pinned release’s checked-in files (${editions} marathon editions, ${cohort.editions.length} cohort editions, the release contract) has words or says nothing${unseen.length ? `; ${unseen.join(', ')} ${unseen.length === 1 ? 'occurs' : 'occur'} only in the release’s own files (--source)` : ''}; the labels render as links and as bare labels; the styles are the evidence badge’s and the scope chip’s; ${files.length} files under app/, components/ and lib/ write no phrase and no label class of their own.`);
  console.log(`verify-tiers: baseline, ${BASELINE.length} uses that stood before the module (reported, not edited):`);
  for (const base of BASELINE) console.log(`  ${base.file}: "${base.phrase}" × ${base.count}. ${base.why}`);
}

/** The words a gross basis reads, from the table (so check 3 does not trust the module for them). */
function GUN_TIMES_WORDS() { return TABLE.find((row) => row.kind === 'timing').words; }

main();
