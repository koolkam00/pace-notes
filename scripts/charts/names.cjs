// The recorded runner names the Top 100 charts' name guard reads (scripts/verify-charts.cjs: no chart string may equal
// a recorded runner name).
//
// The marathon cohort (analysis/marathon-cohort) holds no names, so they are read here, by this one function, from one
// of two sources, in this order:
//
//   1. The runner lookup under public/data/runners, once the lookup of the adopted release is committed (schema 2):
//      every name of every profile shard. Each file is checked against its parent's size and SHA-256 from the manifest
//      down (the manifest lists the directory pages, a page lists its shards) and the number of names read against the
//      manifest's count. It is used only when the lookup names the adopted release and this cohort (or the adapted
//      input the cohort was built from), so names from another release can never stand in.
//   2. A names file written by scripts/charts/extract-names.py from the adapted marathon input, never committed; its
//      path is in the environment variable PACE_NOTES_NAMES_FILE. It is used only when the sidecar beside it says it
//      was read from the adapted input this cohort was built from and the file's digest is the sidecar's.
//
// With neither source, `recordedNames` throws and says what is missing: the guard never passes without reading names.
'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ENV = 'PACE_NOTES_NAMES_FILE';
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

/** The lookup as a source, or a sentence saying why it is not one. */
function lookupSource({ root, dataRoot, cohort }) {
  const folder = path.join(dataRoot, 'runners');
  const file = path.join(folder, 'manifest.json');
  if (!fs.existsSync(file)) return { reason: 'no runner lookup is committed under public/data/runners' };
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (manifest.schema_version !== 2) return { reason: `the committed runner lookup is schema ${manifest.schema_version ?? 1}, the lookup of an earlier release (it has no profile directory to read names through)` };
  if (manifest.release_tag !== cohort.manifest.release_tag) return { reason: 'the committed runner lookup is not the adopted release’s' };
  const bound = (manifest.cohort && manifest.cohort.manifest_sha256 === cohort.sha256)
    || (manifest.pipeline && manifest.pipeline.input_manifest_sha256 === cohort.manifest.input_manifest_sha256);
  if (!bound) return { reason: 'the committed runner lookup names another cohort and another adapted input than the marathon cohort’s' };
  const reader = path.join(root, 'scripts/lib/lookup.cjs');
  if (!fs.existsSync(reader)) return { reason: 'the runner lookup is committed without its reader (scripts/lib/lookup.cjs)' };
  return { folder, manifest, reader };
}

/** Every name of the lookup's profile shards, each file checked against its parent on the way down. */
function readLookup({ folder, manifest, reader }, visit) {
  const lookup = require(reader);
  assert.equal(manifest.schema_version, lookup.SCHEMA_VERSION, 'The runner lookup and its reader are of different versions');
  const load = (relative, bytes, digest, what) => {
    const data = fs.readFileSync(path.join(folder, relative));
    assert.ok(data.length === bytes && sha256(data) === digest, `Runner lookup: ${what} ${relative} differs from the size or checksum its parent states`);
    return JSON.parse(zlib.gunzipSync(data));
  };
  const pages = manifest.profiles && manifest.profiles.pages;
  assert.ok(Array.isArray(pages) && pages.length > 0 && Number.isSafeInteger(manifest.profiles.shards), 'Runner lookup: the manifest lists no profile directory');
  let names = 0, shards = 0;
  pages.forEach(([bytes, digest], number) => {
    const page = load(lookup.profilePagePath(number), bytes, digest, 'directory page');
    assert.ok(page.v === lookup.SCHEMA_VERSION && page.first === shards && Array.isArray(page.shards), 'Runner lookup: a profile directory page of another shape');
    for (const entry of page.shards) {
      const shard = load(lookup.shardPath(shards++), entry[entry.length - 2], entry[entry.length - 1], 'profile shard');
      assert.ok(shard.v === lookup.SCHEMA_VERSION && Array.isArray(shard.n) && Array.isArray(shard.u), 'Runner lookup: a profile shard of another shape (no name list)');
      assert.equal(shard.u.reduce((total, count) => total + count, 0), shard.n.length, 'Runner lookup: a shard’s names do not add up to its profiles’ name counts');
      for (const name of shard.n) { assert.equal(typeof name, 'string', 'Runner lookup: a name that is not text'); visit(name); }
      names += shard.n.length;
    }
  });
  assert.equal(shards, manifest.profiles.shards, 'Runner lookup: every profile shard');
  assert.equal(names, manifest.counts.names, 'Runner lookup: the names read are not the manifest’s count');
  return { source: 'lookup', where: 'public/data/runners (profile shards)', names };
}

/** The names file as a source, or a sentence saying why it is not one. */
function fileSource({ cohort, env }) {
  const file = env[ENV];
  if (!file) return { reason: `${ENV} is not set` };
  if (!fs.existsSync(file)) return { reason: `${ENV} names a file that does not exist (${file})` };
  if (!fs.existsSync(`${file}.json`)) return { reason: `the names file has no sidecar (${file}.json), so nothing says which input it was read from` };
  const sidecar = JSON.parse(fs.readFileSync(`${file}.json`, 'utf8'));
  if (sidecar.format !== 1) return { reason: 'the names file’s sidecar is of another format' };
  if (sidecar.input_manifest_sha256 !== cohort.manifest.input_manifest_sha256) {
    return { reason: 'the names file was read from another adapted input than the marathon cohort’s (run scripts/charts/extract-names.py again on the current input)' };
  }
  return { file, sidecar };
}

/** Every line of the names file, after its size and digest are checked against the sidecar. */
function readFile({ file, sidecar }, visit) {
  const data = fs.readFileSync(file);
  assert.ok(data.length === sidecar.bytes && sha256(data) === sidecar.sha256, 'Names file: its size or checksum is not the sidecar’s');
  const text = zlib.gunzipSync(data);
  let names = 0, start = 0;
  for (let at = text.indexOf(10, start); at >= 0; at = text.indexOf(10, start)) {
    visit(text.toString('utf8', start, at));
    names++;
    start = at + 1;
  }
  assert.equal(start, text.length, 'Names file: the last line is not ended');
  assert.ok(names > 0 && names === sidecar.names, 'Names file: the names read are not the sidecar’s count');
  return { source: 'names-file', where: `${ENV} (${path.basename(file)}, ${sidecar.source})`, names };
}

/**
 * Calls `visit(name)` for every recorded runner name and returns { source, where, names }. `cohort` is
 * { manifest, sha256 } of the marathon cohort the charts were recounted from.
 */
function recordedNames({ root, dataRoot, cohort, env = process.env }, visit) {
  const lookup = lookupSource({ root, dataRoot, cohort });
  if (!lookup.reason) return readLookup(lookup, visit);
  const file = fileSource({ cohort, env });
  if (!file.reason) return readFile(file, visit);
  throw new Error('The name guard cannot run: it has no recorded names to check the charts against. '
    + `The lookup: ${lookup.reason}. The names file: ${file.reason}. `
    + `Write one with "python3 -I scripts/charts/extract-names.py --input <adapted marathon input> --output <file outside the checkout>" and set ${ENV} to it.`);
}

module.exports = { ENV, recordedNames };
