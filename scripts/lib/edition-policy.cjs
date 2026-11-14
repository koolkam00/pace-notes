// The editions an output's edition policy leaves out, wherever the release keeps the list.
//
// Up to master-20261103b every pack, manifest and evidence file carried the list itself (`source_quality.editions`).
// From the combined release on (analysis/source_quality.py LISTED_IN_ONE_FILE; lead ruling R8, 2026-11-14) an output
// states the policy's digests and counts, and the list, with each edition's counts, is one published file
// (public/data/edition-policy.json, analysis/build_edition_policy.py). `policyEditions` returns the same rows either
// way, so every recount a verifier made on the embedded list is made on the published one; before it returns them it
// checks that the file is the one the output was built with (release, policy digest, script digest, list digest and
// counts). Nothing is trusted from the output alone.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const COLUMNS = ['city', 'year', 'category', 'reason', 'own_record', 'raw_records', 'deduplicated_records', 'timing_eligible_excluded'];

// json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False), as analysis/source_quality.py hashes.
const canonicalJson = (value) => JSON.stringify((function sort(item) {
  if (Array.isArray(item)) return item.map(sort);
  if (item && typeof item === 'object') return Object.fromEntries(Object.keys(item).sort().map((key) => [key, sort(item[key])]));
  return item;
})(value));
const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');

function editionCounts(editions) {
  const byCategory = {};
  for (const row of editions) {
    const c = byCategory[row.category] ??= { editions: 0, own_record_editions: 0, timing_eligible_excluded: 0 };
    c.editions += 1;
    c.own_record_editions += row.own_record ? 1 : 0;
    c.timing_eligible_excluded += row.timing_eligible_excluded;
  }
  const sum = (key, keep = () => true) => editions.reduce((total, row) => total + (keep(row) ? row[key] : 0), 0);
  return {
    editions: editions.length, own_record_editions: editions.filter((row) => row.own_record).length,
    raw_records: sum('raw_records'), deduplicated_records: sum('deduplicated_records'), timing_eligible_excluded: sum('timing_eligible_excluded'),
    timing_eligible_own_record: sum('timing_eligible_excluded', (row) => row.own_record),
    by_category: Object.fromEntries(Object.keys(byCategory).sort().map((key) => [key, byCategory[key]])),
  };
}

const cache = new Map();

/** The published list as rows `{city, year, category, reason, own_record, raw_records, deduplicated_records,
 *  timing_eligible_excluded}`, checked against its own digest and counts. */
function publishedEditions(file) {
  if (!cache.has(file)) {
    const document = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data', file), 'utf8'));
    assert.deepEqual(document.columns, COLUMNS, `${file}: columns`);
    const editions = document.editions.map((row) => {
      assert.equal(row.length, COLUMNS.length, `${file}: a row of another shape`);
      const entry = Object.fromEntries(COLUMNS.map((column, i) => [column, row[i]]));
      assert.ok(Number.isInteger(entry.reason) && entry.reason >= 0 && entry.reason < document.reasons.length, `${file}: reason index`);
      return { ...entry, reason: document.reasons[entry.reason] };
    });
    assert.equal(sha256(canonicalJson(editions)), document.editions_sha256, `${file}: the rows do not hash to editions_sha256`);
    assert.deepEqual(editionCounts(editions), document.counts, `${file}: counts`);
    cache.set(file, { document, editions });
  }
  return cache.get(file);
}

/** The listed editions of an output's `source_quality` report. */
function policyEditions(report, label = 'source_quality') {
  if (Array.isArray(report.editions)) return report.editions;
  assert.equal(report.version, 2, `${label}: a report without its edition list must be version 2`);
  assert.match(report.editions_file ?? '', /^[a-z0-9-]+\.json$/, `${label}: editions_file`);
  const { document, editions } = publishedEditions(report.editions_file);
  for (const key of ['version', 'release_tag', 'reviewed_edition_policy', 'policy_sha256', 'script_sha256', 'editions_sha256']) {
    assert.equal(document[key], report[key], `${label}: ${report.editions_file} is not the edition list this output was built with (${key})`);
  }
  assert.deepEqual(report.counts, document.counts, `${label}: counts differ from ${report.editions_file}`);
  return editions;
}

/** What analysis/source_quality.py hashes as `policy_sha256`: the rules without their counts (version 2 adds each
 *  rule's own-record flag). */
function policyDefinition(report, editions) {
  const rule = report.version === 2
    ? ({ city, year, category, reason, own_record }) => ({ city, year, category, reason, own_record })
    : ({ city, year, category, reason }) => ({ city, year, category, reason });
  return { version: report.version, release_tag: report.release_tag, reviewed_edition_policy: report.reviewed_edition_policy, editions: editions.map(rule) };
}
const policySha256 = (report, editions) => sha256(canonicalJson(policyDefinition(report, editions)));

module.exports = { COLUMNS, canonicalJson, editionCounts, policyDefinition, policyEditions, policySha256, publishedEditions };
