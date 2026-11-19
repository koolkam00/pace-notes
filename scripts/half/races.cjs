'use strict';
// The half race list (public/data/half/races/, analysis/half_races.py; docs/HALF_MARATHON.md rule R6), checked for
// scripts/verify-half.cjs without the Python builder: the manifest's bindings, every code against the tier module
// (lib/tiers.ts, passed in as `T`), every edition against what it may show, the totals against the half policy's counts,
// the summary and the edition table against the directory. Race names are data and pass no copy word rule.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const HEADER = ['race', 'race_name', 'place', 'year', 'tier', 'tier_in_words', 'split_tier', 'split_tier_in_words', 'results', 'use', 'not_used_category',
  'timing', 'timing_in_words', 'timing_basis', 'mark', 'median_finish_s', 'race_date', 'review', 'copy_of_race', 'copy_of_year', 'source_db', 'release_key'];
const COLUMNS = ['year', 'tier', 'split_tier', 'results', 'use', 'category', 'timing', 'mark', 'median_s', 'review'];
const BADGE = ['stamped', 'stamped_weaker_source'];

/** RFC 4180 rows of a CSV text (quoted fields may hold commas, quotes and line breaks). */
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (ch === '"') quoted = false; else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; } else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/**
 * `root`: the repository; `dir`: public/data/half (or a trial folder); `pin`, `manifest` (the half manifest) and `policy`
 * (the frozen policy file) as verify-half read them; `T`: lib/tiers.ts; `ok` and `eq`: the verifier's assertions.
 * Returns the counts it checked.
 */
function checkRaces({ root, dir, pin, manifest, policy, T, ok, eq }) {
  const folder = path.join(dir, 'races');
  const read = (name) => fs.readFileSync(path.join(folder, name));
  const M = JSON.parse(read('manifest.json'));
  eq([M.schema_version, M.family, M.distance, M.release_tag], [1, 'races', 'half', pin.half.tag], 'races: the manifest is the half race list of the pinned release');
  eq([M.policy.file, M.policy.sha256, M.policy.module_sha256], [manifest.policy.file, manifest.policy.sha256, manifest.policy.module_sha256], 'races: built on the policy the half data bind');
  eq(M.tier_table_sha256, pin.half.core.members['EDITION-TIERS.csv'], 'races: built on the pinned tier table');
  eq(M.registry.sha256, sha(fs.readFileSync(path.join(root, M.registry.file))), 'races: stale race list: the half race registry changed after the build');
  for (const [name, digest] of Object.entries(M.scripts)) eq(digest, sha(fs.readFileSync(path.join(root, name))), `races: stale race list: ${name} changed after the build (rerun analysis/build_half.py)`);
  eq(Object.keys(M.scripts).sort(), ['analysis/half_race_registry.py', 'analysis/half_races.py', 'analysis/race_registry.py'], 'races: the scripts the manifest binds');
  eq(fs.readdirSync(folder).sort(), ['directory.json', 'editions.csv', 'manifest.json', 'summary.json'], 'races: exactly the family’s files (no race has a file or an address of its own)');
  for (const [name, meta] of Object.entries(M.files)) { const bytes = read(name); eq([bytes.length, sha(bytes)], [meta.bytes, meta.sha256], `races/${name}: bytes and sha256`); }
  eq(M.floors, { median_min_results: 100, full_list_min_verified_editions: 3 }, 'races: the floors');

  const D = JSON.parse(read('directory.json')), S = JSON.parse(read('summary.json'));
  const C = D.codes;
  // The codes are the tier module's lists, in its order; nothing with rows carries a never-shown tier.
  eq([C.tier, C.split_tier, C.timing], [[...T.EDITION_TIERS], [...T.SPLIT_TIERS], [...T.TIMING_CLASSES]], 'races: tier, split-tier and timing codes are lib/tiers.ts’s lists');
  eq([C.use, C.review, C.mark, D.edition_columns], [['verified', 'usable', 'none'], ['none', 'copy'], ['course_suspected_short'], COLUMNS], 'races: the half’s own codes and the edition row');
  const known = new Set([...Object.keys(policy.edition_rules.categories), 'marathon_database', 'no_usable_rows', 'no_usable_result']);
  ok(C.category.every((c) => known.has(c)), `races: every category is the half policy’s (${C.category.filter((c) => !known.has(c))})`);

  const labels = new Set();
  let editions = 0, results = 0, medians = 0, copies = 0;
  const used = { editions: 0, results: 0 }, verified = { editions: 0, results: 0 }, held = { editions: 0, results: 0 };
  const marked = [], gun = [];
  const rowOf = (e) => Object.fromEntries(COLUMNS.map((c, i) => [c, e[i]]));
  const checkEdition = (race, e) => {
    ok(Array.isArray(e) && e.length === COLUMNS.length, `races ${race.label}: an edition row of ${COLUMNS.length} values`);
    const x = rowOf(e);
    const tier = C.tier[x.tier], split = C.split_tier[x.split_tier], use = C.use[x.use], timing = C.timing[x.timing], review = C.review[x.review];
    ok(Number.isInteger(x.year) && x.year >= 1990 && x.year <= 2100, `races ${race.label}: a year (${x.year})`);
    ok(tier !== undefined && T.isShownTier(tier), `races ${race.label} ${x.year}: an edition with rows has a tier a page can show (${tier})`);
    ok(split !== undefined && use !== undefined && timing !== undefined && review !== undefined, `races ${race.label} ${x.year}: every code is in its list`);
    ok(x.category === null || C.category[x.category] !== undefined, `races ${race.label} ${x.year}: a category of the list`);
    ok(x.mark === null || C.mark[x.mark] !== undefined, `races ${race.label} ${x.year}: a mark of the list`);
    T.tierWords(tier); T.splitTierWords(split); T.isGunTiming(timing);
    const copy = review === 'copy';
    ok(copy ? x.results === null && x.median_s === null : Number.isSafeInteger(x.results) && x.results >= 0, `races ${race.label} ${x.year}: a copy carries no number, every other edition its results`);
    ok((use === 'none') === (x.category !== null), `races ${race.label} ${x.year}: an edition is used, or carries why it is not`);
    ok(use !== 'verified' || BADGE.includes(tier), `races ${race.label} ${x.year}: only a verified tier supplies verified figures`);
    // A time only for a verified usable edition of at least 100 results with no mark and no gun timing.
    if (x.median_s !== null) {
      medians++;
      ok(use === 'verified' && BADGE.includes(tier) && x.mark === null && !T.isGunTiming(timing) && x.results >= M.floors.median_min_results && Number.isFinite(x.median_s) && x.median_s > 3000 && x.median_s < 14400,
        `races ${race.label} ${x.year}: a time on an edition that may not show one`);
    } else ok(!(use === 'verified' && x.mark === null && !T.isGunTiming(timing) && x.results >= M.floors.median_min_results), `races ${race.label} ${x.year}: a verified edition of 100 results has its median`);
    return { ...x, tier, split, use, timing, review, copy, category: x.category === null ? null : C.category[x.category], mark: x.mark === null ? null : C.mark[x.mark] };
  };
  const full = [];
  for (const race of D.races) {
    ok(typeof race.label === 'string' && race.label && !labels.has(race.label), `races: a unique label (${race.label})`);
    labels.add(race.label);
    ok(typeof race.name === 'string' && race.name.trim() === race.name && race.name && (race.place === null || (typeof race.place === 'string' && race.place)), `races ${race.label}: a name, and a place or none`);
    const es = race.editions.map((e) => checkEdition(race, e));
    const live = es.filter((e) => !e.copy);
    ok(live.length > 0, `races ${race.label}: a listed race has an edition to show`);
    eq(es.map((e) => e.year), [...es.map((e) => e.year)].sort((a, b) => a - b), `races ${race.label}: editions in year order`);
    eq(race.years, [Math.min(...live.map((e) => e.year)), Math.max(...live.map((e) => e.year))], `races ${race.label}: its first and last year`);
    eq(race.results, live.reduce((a, e) => a + e.results, 0), `races ${race.label}: its results are its shown editions’`);
    const tiers = {};
    for (const e of live) tiers[e.tier] = (tiers[e.tier] || 0) + 1;
    eq(race.tiers, tiers, `races ${race.label}: its editions by tier`);
    T.tierLine(race.tiers);
    if (live.filter((e) => BADGE.includes(e.tier)).length >= D.full_list.min_verified_editions) full.push(race.label);
    for (const e of live) {
      editions++; results += e.results;
      if (e.use !== 'none') { used.editions++; used.results += e.results; }
      if (e.use === 'verified') { verified.editions++; verified.results += e.results; }
      if (e.category === 'held_by_producer') { held.editions++; held.results += e.results; }
      if (e.mark) marked.push(`${race.label}\u0000${e.year}`);
      if (T.isGunTiming(e.timing)) gun.push({ label: race.label, year: e.year, median: e.median_s, use: e.use });
    }
    copies += es.length - live.length;
    if (race.flags) ok(race.flags.length > 0 && race.flags.every((f) => C.flags.includes(f)), `races ${race.label}: flags of the list`);
  }
  for (const race of D.left_out) {
    ok(!labels.has(race.label), `races: a left-out race is listed once (${race.label})`);
    labels.add(race.label);
    const es = race.editions.map((e) => checkEdition(race, e));
    ok(es.length > 0 && es.every((e) => e.copy), `races ${race.label}: a race is left out only when every edition is a copy`);
    copies += es.length;
  }
  eq([D.full_list.min_verified_editions, D.full_list.races], [3, full], 'races: the races listed in full are those with three or more editions of a verified tier');
  eq(D.set_aside_editions.length, copies, 'races: every copy is named with the edition it copies');
  // The totals are the half policy's: the usable editions and finishes, the verified ones, the held ones.
  const counts = manifest.policy.counts;
  eq([used.editions, used.results], [counts.use_finish.editions, counts.use_finish.finishes], 'races: the usable editions and their results are the policy’s');
  eq([verified.editions, verified.results], [counts.verified.editions, counts.verified.finishes], 'races: the verified editions and their results are the policy’s');
  eq([held.editions, held.results], [counts.E1_held_editions, counts.E1_held_finishes], 'races: the held editions and their results are the policy’s');
  // The marks: the policy's course-suspected-short editions, and gun times on the Berlin years the release times gross.
  eq(marked.sort(), policy.tiers.course_suspected_short.map((x) => `${x.city}\u0000${x.year}`).sort(), 'races: the course-suspected-short mark is on the policy’s editions and no other');
  const berlin = policy.tiers.gross_timing.map((x) => `${x.city}\u0000${x.year}`).sort();
  ok(berlin.every((k) => gun.some((g) => `${g.label}\u0000${g.year}` === k)), 'races: every gun-time edition of the policy reads as gun timing');
  ok(gun.every((g) => g.median === null && g.use !== 'verified'), 'races: no gun-time edition shows a time or supplies a verified figure');
  eq(M.counts, { races: D.races.length, editions, results, keys: M.counts.keys }, 'races: the manifest’s counts');

  // The summary restates the directory.
  eq([S.races.total, S.races.full_list, S.races.left_out, S.editions.total, S.editions.with_a_median, S.editions.set_aside_as_copies],
    [D.races.length, full.length, D.left_out.length, { editions, results }, medians, copies], 'races: the summary’s totals');
  for (const [group, tally] of Object.entries({ by_tier: S.editions.by_tier, by_use: S.editions.by_use, by_timing: S.editions.by_timing, by_split_tier: S.editions.by_split_tier, by_source_db: S.editions.by_source_db })) {
    eq([Object.values(tally).reduce((a, g) => a + g.editions, 0), Object.values(tally).reduce((a, g) => a + g.results, 0)], [editions, results], `races: the summary ${group} adds up to every edition`);
  }
  ok(Object.keys(S.editions.by_tier).every((t) => T.isShownTier(t)) && Object.keys(S.editions.by_timing).every((t) => T.TIMING_CLASSES.includes(t)), 'races: the summary’s tiers and timing classes are the module’s');

  // The edition table: one row per edition, the module's words, and nothing a row may not carry.
  const table = parseCsv(read('editions.csv').toString('utf8'));
  eq(table[0], HEADER, 'races: the edition table’s columns (no name of a runner, bib, winner, URL, status text or official count)');
  eq(table.length - 1, editions + copies, 'races: the edition table holds every edition with rows once');
  const col = Object.fromEntries(HEADER.map((h, i) => [h, i]));
  for (const row of table.slice(1)) {
    const at = `${row[col.race]} ${row[col.year]}`;
    ok(row.length === HEADER.length && labels.has(row[col.race]), `races table ${at}: a row of the directory`);
    eq(row[col.tier_in_words], T.tierWords(row[col.tier]), `races table ${at}: the tier in the module’s words`);
    eq(row[col.split_tier_in_words], T.splitTierWords(row[col.split_tier]) || '', `races table ${at}: the split tier in the module’s words`);
    eq(row[col.timing], T.timingClass(row[col.timing_basis] === '' ? null : row[col.timing_basis]), `races table ${at}: the class of the release’s timing basis`);
    eq(row[col.timing_in_words], T.isGunTiming(row[col.timing]) ? T.GUN_TIMES : '', `races table ${at}: "Gun times" exactly on the gun class`);
    ok(['half', 'full'].includes(row[col.source_db]) && row[col.release_key], `races table ${at}: its release key`);
  }
  return { races: D.races.length, editions, results, medians, copies, full: full.length };
}

module.exports = { checkRaces, parseCsv };
