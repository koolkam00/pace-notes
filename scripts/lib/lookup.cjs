'use strict';
// Runner lookup v2: the reference decoder and search planner (docs/RUNNERS_AND_REPORT.md is the contract).
//
// This module has no dependencies and uses no Node API, so the browser client (lib/runner-search.ts) can port it
// line for line. scripts/verify-lookup.cjs runs it against every search name of a build; it is the one
// implementation of the planner. The Python builder (analysis/lookup_names.py, analysis/lookup_format.py) writes
// the files this reads, and the two sides are compared on every published name.
//
// Strings are ordered BY CODE POINT everywhere (compareCodePoints). JavaScript's own `<` and localeCompare order
// UTF-16 units or a locale and must not be used on words, partners or directory keys.

const SCHEMA_VERSION = 2;
const PAGE_SIZE = 64;                 // leaves or shards per directory page
const PROFILE_SHARDS = 4096;
const SEARCH_AUTO = 300000;           // bytes of leaves a search may load unasked
const SEARCH_HARD_CAP = 1000000;      // bytes of leaves a search may never pass
const POINTS_KM = { marathon: [5, 10, 15, 20, 25, 30, 35, 40, 42.195], half: [5, 10, 15, 20, 21.0975] };
const CHECKPOINTS = { marathon: 8, half: 4 };
const TIERS = ['stamped', 'stamped_weaker_source', 'partial', 'held_for_review', 'unverified'];
const LINK_CODES = '0123456789abcd';  // 0 no link; 1-3 confirmed; 4-a possible by tier; b-d a confirmed tier without a key
const CONFIRMED_LINKS = '123';
// Lead decision D24.5: the Latin letters NFKD leaves whole. The manifest repeats the table (rules.fold).
const FOLD = { 'ł': 'l', 'ø': 'o', 'đ': 'd', 'ð': 'd', 'ß': 'ss', 'æ': 'ae', 'œ': 'oe', 'þ': 'th', 'ı': 'i' };

// ---------------------------------------------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------------------------------------------

/** -1, 0 or 1 by code point. A surrogate unit (half of an astral character) sorts after every other unit. */
function compareCodePoints(a, b) {
  const shared = Math.min(a.length, b.length);
  for (let i = 0; i < shared; i++) {
    let x = a.charCodeAt(i), y = b.charCodeAt(i);
    if (x !== y) {
      if (x >= 0xd800) x += x <= 0xdfff ? 0x2000 : -0x800;
      if (y >= 0xd800) y += y <= 0xdfff ? 0x2000 : -0x800;
      return x < y ? -1 : 1;
    }
  }
  return a.length === b.length ? 0 : a.length < b.length ? -1 : 1;
}

/** NFKD; marks removed; lower case; the fold table; letters and numbers kept; every other run one space. */
function normalizeName(value) {
  return String(value === null || value === undefined ? '' : value).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[łøđðßæœþı]/g, letter => FOLD[letter]).replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

const TRAILING_CODE = /\s*\(([A-Z]{2,3})\)$/;

/** The distinct search words of a recorded name, in code point order: a trailing bracketed code is dropped first. */
function searchWords(name) {
  const code = TRAILING_CODE.exec(name);
  let words = normalizeName(code ? name.slice(0, code.index) : name).split(' ').filter(Boolean);
  if (!words.length && code) words = normalizeName(name).split(' ').filter(Boolean);
  return Array.from(new Set(words)).sort(compareCodePoints);
}

const codePointLength = text => Array.from(text).length;

/**
 * The tokens of a typed query: its normalised words, repeats removed. In stage 2 a token of three or more
 * characters that begins another token is dropped (it adds nothing), so two tokens never match the same word.
 */
function queryTokens(query, stage) {
  const words = Array.from(new Set(normalizeName(query).split(' ').filter(Boolean)));
  if (stage !== 2) return words;
  return words.filter(token => codePointLength(token) < 3 || !words.some(other => other !== token && other.startsWith(token)));
}

/** Stage 1, and any token under three characters: the token equals the word. Otherwise the word begins with it. */
const tokenIsExact = (token, stage) => stage !== 2 || codePointLength(token) < 3;
const tokenMatches = (token, word, stage) => tokenIsExact(token, stage) ? word === token : word.startsWith(token);

/**
 * Whether a row's search words satisfy every token. With a plan whose `alone` is set (a heavy word typed alone in
 * stage 1) only the names whose single search word it is are listed.
 */
function rowMatches(words, tokens, stage, plan) {
  if (plan && plan.alone !== null && plan.alone !== undefined && words.length !== 1) return false;
  return tokens.length > 0 && tokens.every(token => words.some(word => tokenMatches(token, word, stage)));
}

// ---------------------------------------------------------------------------------------------------------------
// The search planner
// ---------------------------------------------------------------------------------------------------------------
//
// A leaf's directory key is [word, partner, c]. With [w0, o0, c0] its key and [w1, o1, c1] the next leaf's, it holds
//   - every posting of each word strictly between w0 and w1;
//   - the postings of w0 with partner from o0 on: up to o1 when w1 = w0 (o1 itself too when c1 = 1), else to the
//     end of the word;
//   - when w1 differs from w0 and the next leaf starts inside its word (o1 is not '' or c1 = 1): the postings of w1
//     with partner below o1 (o1 itself too when c1 = 1).
// A key's word may be a shortened beginning that is no word at all; the rules below stay true for it.

const heavyWords = new WeakMap();
/** Map of heavy word to the number of search names that contain it, from the manifest's index.heavy. */
function heavyOf(index) {
  let map = heavyWords.get(index);
  if (!map) { map = new Map(index.heavy); heavyWords.set(index, map); }
  return map;
}

/** Can a word matching the partner token lie from `low` on, below `high` (or up to it when `inclusive`)? */
function partnerCanLie(partner, low, high, inclusive) {
  const side = compareCodePoints(low, partner.token);
  if (partner.exact ? side > 0 : side > 0 && !low.startsWith(partner.token)) return false;
  if (high === null) return true;
  const end = compareCodePoints(partner.token, high);
  return end < 0 || (end === 0 && inclusive);
}

/** Whether the leaf with `key` (followed by `next`, or null) can hold a name the primary and partner tokens match. */
function leafNeeded(key, next, primary, partner, heavy) {
  const w0 = key[0], w1 = next ? next[0] : null;
  const before = compareCodePoints(w0, primary.token);
  // (a) a word strictly between the two start words
  if (before < 0) {
    if (w1 === null || compareCodePoints(primary.token, w1) < 0) return true;
  } else if (!primary.exact && w0.startsWith(primary.token) && w1 !== w0) return true;
  // (b) the leaf's own first word, from its start partner on
  if (primary.exact ? before === 0 : w0.startsWith(primary.token)) {
    if (!heavy.has(w0) || partner === null) return true;
    const sameWord = w1 !== null && w1 === w0;
    if (partnerCanLie(partner, key[1], sameWord ? next[1] : null, sameWord && next[2] === 1)) return true;
  }
  // (c) the head of the next leaf's word, when that word began in this leaf
  if (w1 !== null && w1 !== w0 && (next[1] !== '' || next[2] === 1) && (primary.exact ? w1 === primary.token : w1.startsWith(primary.token))) {
    if (!heavy.has(w1) || partner === null) return true;
    if (partnerCanLie(partner, '', next[1], next[2] === 1)) return true;
  }
  return false;
}

/** Whether a key word sorts after every word the token can match. Keys are in order, so this is false, then true. */
const pastToken = (word, token, exact) => compareCodePoints(word, token) > 0 && (exact || !word.startsWith(token));

/** The first position of `keys` (arrays that start with a word, in order) for which `test(word)` holds; keys.length when none. */
function firstKey(keys, test) {
  let low = 0, high = keys.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (test(keys[middle][0])) high = middle; else low = middle + 1;
  }
  return low;
}

/**
 * The directory pages that can hold a leaf needed for `token`, as [first, last] (last < first when none): from the
 * page before the first whose start word is at or after the token (its last leaves may reach the token's words) to
 * the last page whose start word is not past them.
 */
function pageRange(index, token, exact) {
  const first = Math.max(0, firstKey(index.pages, word => compareCodePoints(word, token) >= 0) - 1);
  return [first, firstKey(index.pages, word => pastToken(word, token, exact)) - 1];
}

/** The directory pages (numbers, ascending) a search for these tokens must load before it can be planned. */
function indexPagesFor(tokens, stage, index) {
  const wanted = new Set();
  for (const token of tokens) {
    const range = pageRange(index, token, tokenIsExact(token, stage));
    for (let page = range[0]; page <= range[1]; page++) wanted.add(page);
  }
  return Array.from(wanted).sort((a, b) => a - b);
}

/**
 * The cheapest set of leaves that holds every name the tokens match.
 *
 * tokens: queryTokens(query, stage). index: the manifest's `index`. pages: Map of page number to the decoded
 * directory page, holding at least indexPagesFor(tokens, stage, index).
 * Returns { stage, leaves: [numbers, ascending], bytes, rows, primary, partner, alone, names }:
 * `alone` is the heavy word when one heavy word was typed alone in stage 1 (the plan then covers only the names
 * whose single search word it is, and `names` is how many search names contain the word); otherwise both are null.
 * Every token is tried as the primary, alone and with each other token as its partner, and the cheapest choice wins
 * (fewest bytes, then fewest leaves, then the earliest token). The caller decides what to load: at most SEARCH_AUTO
 * unasked, at most SEARCH_HARD_CAP ever.
 */
function planSearch(tokens, stage, index, pages) {
  if (!tokens.length) return { stage, leaves: [], bytes: 0, rows: 0, primary: null, partner: null, alone: null, names: null };
  const heavy = heavyOf(index);
  const typed = tokens.map(token => ({ token, exact: tokenIsExact(token, stage) }));
  const alone = stage !== 2 && typed.length === 1 && heavy.has(typed[0].token);
  let best = null;
  for (let p = 0; p < typed.length; p++) {
    const primary = typed[p];
    const partners = alone ? [{ token: '', exact: true }] : [null].concat(typed.filter((_, at) => at !== p));
    // The leaves that can be needed for this primary, whatever the partner: inside each page, from the leaf before
    // the first whose word is at or after the token to the last whose word is not past the token's words.
    const candidates = [];
    const range = pageRange(index, primary.token, primary.exact);
    for (let page = range[0]; page <= range[1]; page++) {
      const loaded = pages.get(page);
      if (!loaded) throw new Error('planSearch: directory page ' + page + ' is not loaded');
      const from = Math.max(0, firstKey(loaded.leaves, word => compareCodePoints(word, primary.token) >= 0) - 1);
      const to = firstKey(loaded.leaves, word => pastToken(word, primary.token, primary.exact)) - 1;
      for (let at = from; at <= to; at++) {
        const following = at + 1 < loaded.leaves.length ? loaded.leaves[at + 1] : page + 1 < index.pages.length ? index.pages[page + 1] : null;
        candidates.push({ number: loaded.first + at, entry: loaded.leaves[at], next: following });
      }
    }
    for (const partner of partners) {
      const leaves = [];
      let bytes = 0, rows = 0;
      for (const leaf of candidates) {
        if (!leafNeeded(leaf.entry, leaf.next, primary, partner, heavy)) continue;
        leaves.push(leaf.number); rows += leaf.entry[3]; bytes += leaf.entry[4];
      }
      if (best === null || bytes < best.bytes || (bytes === best.bytes && leaves.length < best.leaves.length)) {
        best = { stage, leaves, bytes, rows, primary: primary.token, partner: partner === null ? null : partner.token,
          alone: alone ? primary.token : null, names: alone ? heavy.get(primary.token) : null };
      }
    }
  }
  return best;
}

// ---------------------------------------------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------------------------------------------

const pad = (number, width) => String(number).padStart(width, '0');
const leafPath = number => 'index/' + pad(number, 5) + '.json.gz';
const indexPagePath = number => 'index/p/' + pad(number, 2) + '.json.gz';
const shardPath = number => 'profiles/' + number.toString(16).padStart(3, '0') + '.json.gz';
const profilePagePath = number => 'profiles/p/' + pad(number, 2) + '.json.gz';
/** The text an unlinked result's shard is hashed from: shard = the first three hex digits of its SHA-256. */
const unlinkedKey = (db, id) => db + ':' + id;

function sameLength(data, columns, length, what) {
  for (const column of columns) if (!data[column] || data[column].length !== length) throw new Error(what + ': column ' + column + ' has another length');
}

/** editions.json.gz as one object per edition, in index order. */
function decodeEditions(data) {
  if (!data || data.v !== SCHEMA_VERSION) throw new Error('editions: unknown version');
  const count = data.sr.length;
  sameLength(data, ['y', 't', 'sp', 'db', 'g', 'q', 'cx', 'rs', 'nl'], count, 'editions');
  const out = new Array(count);
  for (let at = 0; at < count; at++) {
    const race = data.races[data.sr[at]];
    out[at] = {
      index: at, distance: race[0] === 'm' ? 'marathon' : 'half', city: race[1], race: race[2], year: data.y[at],
      tier: Number(data.t[at]), splits: data.sp[at] === '1', db: data.db[at], noComparison: Number(data.g[at]),
      q: data.q[at], context: data.cx[at] < 0 ? null : data.cx[at], reason: data.rs[at] < 0 ? null : data.reasons[data.rs[at]],
      unlisted: data.nl[at],
    };
  }
  return out;
}

const LEAF_COLUMNS = ['n', 'b', 'o', 'e', 'y', 's', 'm', 'h', 'q', 'p'];

/** An index leaf as rows: the shown name, the profile pointer and what the row describes. */
function decodeLeaf(data) {
  if (!data || data.v !== SCHEMA_VERSION) throw new Error('index leaf: unknown version');
  const count = data.n.length;
  sameLength(data, LEAF_COLUMNS, count, 'index leaf');
  const out = new Array(count);
  for (let at = 0; at < count; at++) {
    out[at] = {
      name: data.n[at], shard: data.b[at], position: data.o[at], edition: data.e[at] < 0 ? null : data.e[at],
      firstYear: data.y[at], lastYear: data.y[at] + data.s[at], marathons: data.m[at], halves: data.h[at],
      possible: data.q[at], onlyPossible: data.p[at] === 1,
    };
  }
  return out;
}

const bits = mask => { let count = 0; for (let rest = mask; rest; rest >>>= 1) count += rest & 1; return count; };

/** Cumulative times at the distance's points (null where not recorded); the last is the finish. */
function resultTimes(mask, gaps, finish, distance) {
  const times = [];
  let total = 0, used = 0;
  for (let bit = 0; bit < CHECKPOINTS[distance]; bit++) {
    if (mask >> bit & 1) { total += gaps[used++]; times.push(total); } else times.push(null);
  }
  if (used !== gaps.length || mask >> CHECKPOINTS[distance]) throw new Error('profile shard: a mask does not fit its distance');
  times.push(finish < 0 ? null : finish);
  return times;
}

/**
 * The profiles of a shard, or the one at `position` when it is given. A result:
 * { edition, db, id, key, distance, finish, sex, age, link, confirmed, status, name, mask, times }.
 * `id` is the record id (i + 256·q of its edition) and `key` is db + id, unique across both distances.
 */
function decodeShard(data, editions, position) {
  if (!data || data.v !== SCHEMA_VERSION) throw new Error('profile shard: unknown version');
  const results = data.e.length;
  sameLength(data, ['i', 'f', 'x', 'a', 'c', 'j', 's', 'm'], results, 'profile shard');
  if (data.k.length !== data.u.length) throw new Error('profile shard: k and u differ in length');
  const out = [];
  let row = 0, name = 0, gap = 0;
  for (let at = 0; at < data.k.length; at++) {
    const wanted = position === undefined || position === at;
    const profile = wanted ? { names: data.n.slice(name, name + data.u[at]), results: [] } : null;
    for (let end = row + data.k[at]; row < end; row++) {
      const count = bits(data.m[row]);
      if (wanted) {
        const edition = editions[data.e[row]];
        if (!edition || data.j[row] >= data.u[at]) throw new Error('profile shard: a result names an unknown edition or name');
        const id = data.i[row] + 256 * edition.q;
        profile.results.push({
          edition: data.e[row], db: edition.db, id, key: edition.db + id, distance: edition.distance,
          finish: data.f[row] < 0 ? null : data.f[row], sex: data.x[row] === '-' ? null : data.x[row], age: data.a[row] < 0 ? null : data.a[row],
          link: data.c[row], confirmed: CONFIRMED_LINKS.includes(data.c[row]), status: data.s[row] === '-' ? null : data.s[row],
          name: profile.names[data.j[row]], mask: data.m[row],
          times: resultTimes(data.m[row], data.d.slice(gap, gap + count), data.f[row], edition.distance),
        });
      }
      gap += count;
    }
    name += data.u[at];
    if (wanted) out.push(profile);
  }
  if (row !== results || name !== data.n.length || gap !== data.d.length) throw new Error('profile shard: the columns do not add up');
  if (position !== undefined) {
    if (out.length !== 1) throw new Error('profile shard: no profile at that position');
    return out[0];
  }
  return out;
}

module.exports = {
  SCHEMA_VERSION, PAGE_SIZE, PROFILE_SHARDS, SEARCH_AUTO, SEARCH_HARD_CAP, POINTS_KM, CHECKPOINTS, TIERS, LINK_CODES, CONFIRMED_LINKS, FOLD,
  compareCodePoints, normalizeName, searchWords, queryTokens, tokenIsExact, tokenMatches, rowMatches,
  heavyOf, leafNeeded, pageRange, indexPagesFor, planSearch,
  leafPath, indexPagePath, shardPath, profilePagePath, unlinkedKey, decodeEditions, decodeLeaf, resultTimes, decodeShard,
};
