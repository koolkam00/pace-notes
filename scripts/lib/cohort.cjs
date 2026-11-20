// The marathon cohort, read in Node: the one reader the recounts share (the Python reader is analysis/cohort.py, which
// also states the format). The cohort holds, per edition an analysis can use, every written record: those that pass
// the timing checks with id, runner, the class of the runner's link (`link`: 'h' for a link of tier high_elite or high,
// 'm' for medium, null without a runner), sex, age and nine cumulative times in seconds, and the others with the reason
// their timing is not usable. No name is in it. `decodedSha256` hashes the decoded values exactly as the Python reader
// does, so an edition whose digest equals the manifest's was read to the same numbers in both languages.
'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = path.resolve(__dirname, '..', '..', 'analysis', 'marathon-cohort');
const SCHEMA_VERSION = 2;
const EDITION_VERSION = 2;
const LINK_LETTERS = ['h', 'm', '-'];
const USES = ['counted', 'own_record'];
const REASONS = { d: 'duplicate', m: 'missing_checkpoints', o: 'times_out_of_order', b: 'outside_bounds' };
const SEX_LETTERS = ['M', 'F', 'X', '-'];
// The scripts a cohort manifest names with their digests, and the sources of a race date (analysis/cohort.py SCRIPTS, DATE_SOURCES).
const SCRIPTS = ['build_cohort.py', 'cohort.py', 'build_pacing.py', 'source_quality.py', 'build_record_status.py', 'build_identity.py'];
const DATE_SOURCES = ['weather', 'reviewed', 'external'];
const POINTS_KM = [5, 10, 15, 20, 25, 30, 35, 40, 42.195];
// The release's tiers of an edition with rows, its split tiers, and the columns of the manifest's `other_editions` rows.
const TIERS = ['stamped', 'stamped_weaker_source', 'partial', 'held_for_review', 'unverified'];
const SPLIT_TIERS = ['splits', 'finish_time_only'];
const OTHER_COLUMNS = ['city', 'year', 'raw', 'category', 'tier', 'weaker_source', 'split_tier'];
const FILE_PATTERN = /^editions\/[a-z0-9]+(?:-[a-z0-9]+)*-[0-9]{4}\.json\.gz$/;
const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');

function undelta(values) {
  const out = new Array(values.length);
  let total = 0;
  for (let i = 0; i < values.length; i++) { total += values[i]; out[i] = total; }
  return out;
}

function unpackTimes(unit, flat, exceptions, count) {
  assert.equal(flat.length, 9 * count, 'nine times per record');
  const rows = new Array(count);
  for (let k = 0; k < count; k++) {
    const row = new Array(9);
    let total = 0;
    for (let j = 0; j < 9; j++) { total += flat[9 * k + j]; row[j] = total / unit; }
    rows[k] = row;
  }
  for (const [k, ...row] of exceptions) {
    assert.ok(row.length === 9 && Number.isInteger(k) && k >= 0 && k < count, 'an exception row of another shape');
    rows[k] = row;
  }
  return rows;
}

/** An edition file's bytes -> its decoded values (arrays; times in seconds). */
function decodeEdition(data) {
  const document = JSON.parse(zlib.gunzipSync(data));
  assert.ok(document.v === EDITION_VERSION && USES.includes(document.use), 'an edition file of another version');
  const ids = undelta(document.i);
  const n = ids.length;
  assert.ok(document.g.length === n && document.x.length === n && document.a.length === n && document.l.length === n, 'columns of different lengths');
  const link = Array.from(document.l, (letter, k) => {
    assert.ok(LINK_LETTERS.includes(letter) && (letter === '-') === (document.g[k] === 0), 'a link class without a runner, or a runner without one');
    return letter === '-' ? null : letter;
  });
  const sex = Array.from(document.x, (letter) => { assert.ok(SEX_LETTERS.includes(letter)); return letter === '-' ? null : letter; });
  const runner = ids.map((id, k) => (document.g[k] === 0 ? 0 : id - document.g[k] + 1));
  const otherIds = undelta(document.oi);
  assert.equal(document.oc.length, otherIds.length, 'one reason per other record');
  const otherReasons = Array.from(document.oc, (letter) => { assert.ok(letter in REASONS); return REASONS[letter]; });
  const otherTimes = new Array(otherIds.length).fill(null);
  unpackTimes(document.s, document.ot, document.otx, document.on.length).forEach((row, j) => { otherTimes[document.on[j]] = row; });
  return { city: document.city, year: document.year, use: document.use, ids, runner, link, sex, age: document.a,
    times: unpackTimes(document.s, document.t, document.tx, n), otherIds, otherReasons, otherTimes };
}

/** The digest of the decoded values that analysis/cohort.py decoded_sha256 computes: big-endian integers and doubles. */
function decodedSha256(edition) {
  const hash = crypto.createHash('sha256');
  hash.update(JSON.stringify([edition.city, edition.year, edition.use, edition.ids.length, edition.otherIds.length]));
  const record = Buffer.alloc(8 + 8 + 1 + 1 + 8 + 72);
  for (let k = 0; k < edition.ids.length; k++) {
    record.writeBigUInt64BE(BigInt(edition.ids[k]), 0);
    record.writeBigUInt64BE(BigInt(edition.runner[k]), 8);
    record.write(edition.link[k] ?? '-', 16, 1, 'latin1');
    record.write(edition.sex[k] ?? '-', 17, 1, 'latin1');
    record.writeDoubleBE(edition.age[k] === null ? NaN : edition.age[k], 18);
    for (let j = 0; j < 9; j++) record.writeDoubleBE(edition.times[k][j], 26 + 8 * j);
    hash.update(record);
  }
  const letter = Object.fromEntries(Object.entries(REASONS).map(([key, value]) => [value, key]));
  for (let k = 0; k < edition.otherIds.length; k++) {
    const times = edition.otherTimes[k];
    const other = Buffer.alloc(8 + 1 + 1 + (times ? 72 : 0));
    other.writeBigUInt64BE(BigInt(edition.otherIds[k]), 0);
    other.write(letter[edition.otherReasons[k]], 8, 1, 'latin1');
    other.writeUInt8(times ? 1 : 0, 9);
    if (times) for (let j = 0; j < 9; j++) other.writeDoubleBE(times[j], 10 + 8 * j);
    hash.update(other);
  }
  return hash.digest('hex');
}

/** { manifest, sha256 }: the digest of the manifest's exact bytes is what an output stores to name its cohort. */
function readManifest(root = ROOT) {
  const data = fs.readFileSync(path.join(root, 'manifest.json'));
  const manifest = JSON.parse(data);
  assert.equal(manifest.schema_version, SCHEMA_VERSION, 'a cohort manifest of another version');
  return { manifest, sha256: sha256(data) };
}

/**
 * The manifest after the checks a recount makes before it trusts the cohort (analysis/cohort.py verified_manifest):
 * it is the adopted release's (`pin` is analysis/release.json), its checkpoints are the nine the analyses use, the
 * scripts that wrote it are the checkout's, its counts agree and every counted edition has a race date.
 * Returns { manifest, sha256 }.
 */
function verifiedManifest(pin, root = ROOT, scriptRoot = path.resolve(__dirname, '..', '..', 'analysis')) {
  const read = readManifest(root);
  const { manifest } = read;
  assert.equal(manifest.release_tag, pin.tag, 'Cohort release does not match adopted pin');
  assert.deepEqual(manifest.points_km, POINTS_KM, 'Unexpected checkpoint mapping');
  assert.equal(manifest.linkage.record_join_method, 'canonical_record_id', 'This calculation requires the audited canonical identity contract');
  assert.ok(SCRIPTS.every((name) => name in manifest.scripts), 'Unexpected source script contract');
  for (const [name, digest] of Object.entries(manifest.scripts)) {
    assert.equal(sha256(fs.readFileSync(path.join(scriptRoot, name))), digest, `Source script changed: ${name}`);
  }
  assert.ok(manifest.raw_records === manifest.cohort.raw && manifest.eligible_records === manifest.cohort.eligible, 'Inconsistent source cohort metadata');
  const undated = manifest.editions.filter((e) => e.use === 'counted' && !e.race_date).map((e) => `${e.city} ${e.year}`);
  assert.deepEqual(undated, [], 'Counted editions without a race date');
  return read;
}

/** The written editions without a file, one object per edition with the keys of OTHER_COLUMNS (city, year, raw, category and the tier fields). */
function otherEditions(manifest) {
  assert.deepEqual(manifest.other_editions.columns, OTHER_COLUMNS, 'the cohort manifest lists its other editions with other columns');
  return manifest.other_editions.rows.map((row) => Object.fromEntries(OTHER_COLUMNS.map((name, i) => [name, row[i]])));
}

/** One edition's decoded values, after its file's size and SHA-256 are checked against its manifest entry. */
function readEdition(entry, root = ROOT) {
  assert.match(entry.file, FILE_PATTERN, `an unexpected cohort path: ${entry.file}`);
  const data = fs.readFileSync(path.join(root, entry.file));
  assert.ok(data.length === entry.bytes && sha256(data) === entry.sha256, `${entry.file}: size or checksum differs from the manifest`);
  const edition = decodeEdition(data);
  assert.deepEqual([edition.city, edition.year, edition.use], [entry.city, entry.year, entry.use], `${entry.file}: another edition`);
  assert.deepEqual([edition.ids.length, edition.otherIds.length], [entry.timing_eligible, entry.other], `${entry.file}: record counts differ from the manifest`);
  return edition;
}

/** Call `visit(edition, entry, index)` for every edition of the cohort, in manifest order; returns { manifest, sha256 }. */
function forEachEdition(visit, root = ROOT) {
  const read = readManifest(root);
  read.manifest.editions.forEach((entry, index) => visit(readEdition(entry, root), entry, index));
  return read;
}

module.exports = { ROOT, USES, REASONS, SCRIPTS, DATE_SOURCES, POINTS_KM, TIERS, SPLIT_TIERS, OTHER_COLUMNS, FILE_PATTERN, sha256, decodeEdition, decodedSha256,
  readManifest, verifiedManifest, otherEditions, readEdition, forEachEdition };
