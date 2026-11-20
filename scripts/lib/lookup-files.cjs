'use strict';
// Runner lookup v2 read from disk by a Node script: the same steps the browser takes, with every file checked
// against the SHA-256 chain before it is opened. For verifiers and scenario scripts that need to ask the lookup a
// question (the charts name guard: "is this text a recorded name?"; a browser scenario choosing what to type).
// The format and the planner are scripts/lib/lookup.cjs; the complete verification of a build is
// scripts/verify-lookup.cjs. Nothing here writes, and nothing here is needed by the browser.
//
//   const { openLookup } = require('./lib/lookup-files.cjs');
//   const lookup = openLookup(path.join(dataRoot, 'runners'));
//   lookup.search('ana example', 1)      -> { plan, refused, rows }   rows: decoded leaf rows with their search `words`
//   lookup.nameExists('Ana Example')     -> true when a search name has exactly these search words
//   lookup.profile(shard, position)      -> { names, results } (scripts/lib/lookup.cjs decodeShard)

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const L = require('./lookup.cjs');

const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function openLookup(root, options = {}) {
  const manifestBytes = fs.readFileSync(path.join(root, 'manifest.json'));
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (manifest.schema_version !== L.SCHEMA_VERSION) throw new Error(`${root}: not a version ${L.SCHEMA_VERSION} runner lookup`);
  if (options.tag !== undefined && manifest.release_tag !== options.tag) throw new Error(`${root}: the lookup is of ${manifest.release_tag}, not ${options.tag}`);
  /** One gzip JSON file, opened only when its size and SHA-256 are the ones its parent lists. */
  const read = (relative, bytes, digest) => {
    const data = fs.readFileSync(path.join(root, relative));
    if (data.length !== bytes || sha256(data) !== digest) throw new Error(`${relative} differs from the size or SHA-256 its parent lists`);
    return JSON.parse(zlib.gunzipSync(data).toString('utf8'));
  };
  const editions = L.decodeEditions(read(manifest.editions.file, manifest.editions.bytes, manifest.editions.sha256));
  const indexPages = new Map(), profilePages = new Map(), leaves = new Map();
  const indexPage = number => {
    if (!indexPages.has(number)) { const entry = manifest.index.pages[number]; indexPages.set(number, read(L.indexPagePath(number), entry[3], entry[4])); }
    return indexPages.get(number);
  };
  const leaf = number => {
    if (!leaves.has(number)) {
      if (leaves.size >= (options.leafCache || 32)) leaves.delete(leaves.keys().next().value);
      const entry = indexPage(Math.floor(number / L.PAGE_SIZE)).leaves[number % L.PAGE_SIZE];
      leaves.set(number, L.decodeLeaf(read(L.leafPath(number), entry[4], entry[5])).map(row => ({ ...row, words: L.searchWords(row.name) })));
    }
    return leaves.get(number);
  };

  /**
   * The names a query matches at a stage (1: whole words; 2: beginnings), one row per search name.
   * `refused` is true, and nothing is read, when the plan passes `limit` bytes (default SEARCH_HARD_CAP).
   */
  function search(query, stage = 1, limit = L.SEARCH_HARD_CAP) {
    const tokens = L.queryTokens(query, stage);
    const pages = new Map(L.indexPagesFor(tokens, stage, manifest.index).map(number => [number, indexPage(number)]));
    const plan = L.planSearch(tokens, stage, manifest.index, pages);
    if (plan.bytes > limit) return { plan, refused: true, rows: [] };
    const seen = new Set(), rows = [];
    for (const number of plan.leaves) {
      for (const row of leaf(number)) {
        if (!L.rowMatches(row.words, tokens, stage, plan)) continue;
        const key = row.shard + ':' + row.position + ':' + row.name;
        if (!seen.has(key)) { seen.add(key); rows.push(row); }
      }
    }
    return { plan, refused: false, rows };
  }

  /** Whether some search name has exactly the search words of `text` (word order, case, accents and a trailing code aside). */
  function nameExists(text) {
    const words = L.searchWords(text);
    if (!words.length) return false;
    const found = search(words.join(' '), 1);
    if (found.refused) throw new Error('a whole-word search passed the hard cap: the index does not hold its own limits');
    return found.rows.some(row => row.words.length === words.length);
  }

  /** One profile: `shard` 0 to 4095 and `position` in it, as a search row names them. */
  function profile(shard, position) {
    const number = Math.floor(shard / L.PAGE_SIZE);
    if (!profilePages.has(number)) { const entry = manifest.profiles.pages[number]; profilePages.set(number, read(L.profilePagePath(number), entry[0], entry[1])); }
    const entry = profilePages.get(number).shards[shard % L.PAGE_SIZE];
    return L.decodeShard(read(L.shardPath(shard), entry[2], entry[3]), editions, position);
  }

  return { manifest, manifestSha256: sha256(manifestBytes), editions, indexPage, leaf, search, nameExists, profile };
}

module.exports = { openLookup };
