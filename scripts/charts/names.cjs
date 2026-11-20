// The name guard of the Top 100 charts (scripts/verify-charts.cjs): no chart string may equal a recorded runner name.
//
// The marathon cohort (analysis/marathon-cohort) holds no names, so this one function asks for them, from the first
// of these sources that is there:
//
//   1. The runner lookup (schema 2), through the lookup's own reader, scripts/lib/lookup-files.cjs, which checks every
//      file it opens against the manifest's SHA-256 chain. Each chart text is asked with `nameExists`: true when a
//      search name has exactly the text's search words (word order, case, accents and a trailing country code aside).
//      It is asked twice, as written and in the charts' normalised form (which keeps a trailing code as a word), so a
//      text equal to a recorded name is a hit either way and the guard is never weaker than a comparison of whole
//      names. The lookup is
//        a. the committed one, public/data/runners, once it is schema 2 and the adopted release's;
//        b. until then, a build of the adopted release in the folder that PACE_NOTES_LOOKUP_DIR names (its `runners`
//           folder, outside the checkout).
//      It holds both distances; names the producer flags as placeholders are not in it.
//   2. A names file written by scripts/charts/extract-names.py from the adapted marathon input, never committed; its
//      path is in PACE_NOTES_NAMES_FILE. It is used only when the sidecar beside it says it was read from the adapted
//      input this cohort was built from and the file's digest is the sidecar's. Every name is compared, after the
//      charts' normalisation, with every chart text.
//
// With no source, `recordedNameHits` throws and says what is missing: the guard never passes without asking.
'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const LOOKUP_ENV = 'PACE_NOTES_LOOKUP_DIR';
const NAMES_ENV = 'PACE_NOTES_NAMES_FILE';
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
/** The charts' normalisation of a text or a name: NFKD, marks removed, lower case, letters and numbers kept. */
const normaliseName = (text) => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** The lookup folder to ask, or a sentence saying why there is none. */
function lookupSource({ dataRoot, cohort, env }) {
  const tag = cohort.manifest.release_tag;
  const reasons = [];
  const committed = path.join(dataRoot, 'runners');
  if (!fs.existsSync(path.join(committed, 'manifest.json'))) reasons.push('no runner lookup is committed under public/data/runners');
  else {
    const manifest = JSON.parse(fs.readFileSync(path.join(committed, 'manifest.json'), 'utf8'));
    if (manifest.schema_version !== 2) reasons.push(`the committed runner lookup is schema ${manifest.schema_version ?? 1}, the lookup of an earlier release`);
    else if (manifest.release_tag !== tag) reasons.push('the committed runner lookup is not the adopted release’s');
    else return { folder: committed, where: 'public/data/runners' };
  }
  const build = env[LOOKUP_ENV];
  if (!build) reasons.push(`${LOOKUP_ENV} is not set`);
  else if (!fs.existsSync(path.join(build, 'manifest.json'))) reasons.push(`${LOOKUP_ENV} names a folder with no lookup manifest (${build})`);
  else {
    const manifest = JSON.parse(fs.readFileSync(path.join(build, 'manifest.json'), 'utf8'));
    if (manifest.schema_version !== 2) reasons.push(`the lookup build that ${LOOKUP_ENV} names is schema ${manifest.schema_version ?? 1}`);
    else if (manifest.release_tag !== tag) reasons.push(`the lookup build that ${LOOKUP_ENV} names is not the adopted release’s`);
    else return { folder: build, where: `${LOOKUP_ENV} (a build outside the checkout)` };
  }
  return { reason: reasons.join('; ') };
}

/** Every chart text asked of the lookup. */
function askLookup({ folder, where }, tag, texts) {
  const { openLookup } = require('../lib/lookup-files.cjs');
  const lookup = openLookup(folder, { tag });
  const names = lookup.manifest.counts && lookup.manifest.counts.search_names;
  assert.ok(Number.isSafeInteger(names) && names > 0, 'Runner lookup: the manifest states no search names');
  const hits = [];
  for (const [norm, { where: at, text }] of texts) if (lookup.nameExists(text) || lookup.nameExists(norm)) hits.push(at);
  return { source: 'lookup', where: `${where}, manifest ${lookup.manifestSha256.slice(0, 12)}`, names, asked: texts.size, hits };
}

/** The names file as a source, or a sentence saying why it is not one. */
function fileSource({ cohort, env }) {
  const file = env[NAMES_ENV];
  if (!file) return { reason: `${NAMES_ENV} is not set` };
  if (!fs.existsSync(file)) return { reason: `${NAMES_ENV} names a file that does not exist (${file})` };
  if (!fs.existsSync(`${file}.json`)) return { reason: `the names file has no sidecar (${file}.json), so nothing says which input it was read from` };
  const sidecar = JSON.parse(fs.readFileSync(`${file}.json`, 'utf8'));
  if (sidecar.format !== 1) return { reason: 'the names file’s sidecar is of another format' };
  if (sidecar.input_manifest_sha256 !== cohort.manifest.input_manifest_sha256) {
    return { reason: 'the names file was read from another adapted input than the marathon cohort’s (run scripts/charts/extract-names.py again on the current input)' };
  }
  return { file, sidecar };
}

/** Every line of the names file against the chart texts, after its size and digest are checked against the sidecar. */
function readFile({ file, sidecar }, texts) {
  const data = fs.readFileSync(file);
  assert.ok(data.length === sidecar.bytes && sha256(data) === sidecar.sha256, 'Names file: its size or checksum is not the sidecar’s');
  const text = zlib.gunzipSync(data);
  const hits = [];
  let names = 0, start = 0;
  for (let at = text.indexOf(10, start); at >= 0; at = text.indexOf(10, start)) {
    const found = texts.get(normaliseName(text.toString('utf8', start, at)));
    if (found !== undefined) hits.push(found.where);
    names++;
    start = at + 1;
  }
  assert.equal(start, text.length, 'Names file: the last line is not ended');
  assert.ok(names > 0 && names === sidecar.names, 'Names file: the names read are not the sidecar’s count');
  return { source: 'names-file', where: `${NAMES_ENV} (${path.basename(file)}, ${sidecar.source})`, names, asked: texts.size, hits };
}

/**
 * Asks whether any chart text is a recorded runner name. `texts` maps each normalised chart text to { where, text }
 * (where it appears and the text as written); `cohort` is { manifest, sha256 } of the marathon cohort the charts were
 * recounted from. Returns
 * { source, where, names, asked, hits }: `hits` lists where each text that is a recorded name appears.
 */
function recordedNameHits({ dataRoot, cohort, env = process.env }, texts) {
  const lookup = lookupSource({ dataRoot, cohort, env });
  if (!lookup.reason) return askLookup(lookup, cohort.manifest.release_tag, texts);
  const file = fileSource({ cohort, env });
  if (!file.reason) return readFile(file, texts);
  throw new Error('The name guard cannot run: it has no recorded names to check the charts against. '
    + `The lookup: ${lookup.reason}. The names file: ${file.reason}. `
    + `Point ${LOOKUP_ENV} at the runners folder of a lookup build of the adopted release, or write a names file with `
    + `"python3 -I scripts/charts/extract-names.py --input <adapted marathon input> --output <file outside the checkout>" and set ${NAMES_ENV} to it.`);
}

module.exports = { LOOKUP_ENV, NAMES_ENV, normaliseName, recordedNameHits };
