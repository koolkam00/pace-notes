import release from '@/analysis/release.json';
import { dataFetch } from './data-fetch';
import { TIMING_CLASSES, type TimingClass } from './tiers';

/**
 * Runner lookup version 2 in the browser (the contract is docs/RUNNERS_AND_REPORT.md): every named marathon and
 * half-marathon result of the adopted release, searched by recorded name and opened as a runner's profile.
 *
 * Three parts, in this order:
 * 1. The reference reader, ported. scripts/lib/lookup.cjs is the one implementation the lookup's own verifier runs
 *    against every search name of a build; the functions between the two "ported" marks below are that module line
 *    for line, with types. scripts/verify-runner-search.cjs runs both over the same queries and profiles of a build
 *    and fails on any difference, so a change there must be made here too.
 * 2. Loading: the manifest, then every other file only when its size and SHA-256 are the ones its parent lists.
 *    Every address is built from numbers and hex digits taken from the manifest and the directory pages. Nothing a
 *    visitor types, no name and no record key ever enters an address (AGENTS rule 18).
 * 3. What the page shows: a profile's results by distance, which are the runner's own and which are possible
 *    matches, each list's count, span and fastest recorded finish, and one marathon's pacing metrics.
 *
 * Never infer a person, a sex or an age from anything here: a profile is the producer's link between records, and a
 * possible match is never joined to a profile's figures.
 */

export const RUNNER_RELEASE = release.tag;
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
/**
 * Where the lookup is served: one constant. A development build is reached by setting NEXT_PUBLIC_RUNNER_DATA to an
 * untracked folder under public/data (never committed); only then is a build that names stand-in inputs
 * (`provisional`) accepted. The published path refuses one.
 */
const DEVELOPMENT_DATA = process.env.NEXT_PUBLIC_RUNNER_DATA || '';
export const RUNNER_DATA = DEVELOPMENT_DATA || '/data/runners';

// ---------------------------------------------------------------------------------------------------------------
// 1. The reference reader, ported (scripts/lib/lookup.cjs): BEGIN
// ---------------------------------------------------------------------------------------------------------------
//
// Strings are ordered BY CODE POINT everywhere (compareCodePoints). JavaScript's own `<` and localeCompare order
// UTF-16 units or a locale and must not be used on words, partners or directory keys.

export const SCHEMA_VERSION = 2;
export const PAGE_SIZE = 64;                 // leaves or shards per directory page
export const PROFILE_SHARDS = 4096;
export const SEARCH_AUTO = 300000;           // bytes of leaves a search may load unasked
export const SEARCH_HARD_CAP = 1000000;      // bytes of leaves a search may never pass
export const POINTS_KM = { marathon: [5, 10, 15, 20, 25, 30, 35, 40, 42.195], half: [5, 10, 15, 20, 21.0975] } as const;
export const CHECKPOINTS = { marathon: 8, half: 4 } as const;
export const TIERS = ['stamped', 'stamped_weaker_source', 'partial', 'held_for_review', 'unverified'] as const;
export const LINK_CODES = '0123456789abcd';  // 0 no link; 1-3 confirmed; 4-a possible by tier; b-d a confirmed tier without a key
export const CONFIRMED_LINKS = '123';
// The screen a person of a confirmed tier failed (`w` of a result, a digit; 0 on every result whose link is not b, c or d):
// the identity file's not_keyed_reason.
export const SCREENS = [null, 'birth_year_spread', 'sex_conflict', 'two_results_in_one_edition'] as const;
export type Screen = Exclude<(typeof SCREENS)[number], null>;
// Lead decision D24.5: the Latin letters NFKD leaves whole. The manifest repeats the table (rules.fold).
export const FOLD: Readonly<Record<string, string>> = { 'ł': 'l', 'ø': 'o', 'đ': 'd', 'ð': 'd', 'ß': 'ss', 'æ': 'ae', 'œ': 'oe', 'þ': 'th', 'ı': 'i' };

export type RunnerDistance = 'marathon' | 'half';
/** A leaf's directory key and entry: [word, partner, c, rows, bytes, sha256]. */
export type LeafEntry = [word: string, partner: string, c: number, rows: number, bytes: number, sha256: string];
/** A directory page's own entry in the manifest: [word, partner, c, bytes, sha256]. */
export type IndexPageEntry = [word: string, partner: string, c: number, bytes: number, sha256: string];
export type IndexPage = { v: number; first: number; leaves: LeafEntry[] };
export type RunnerIndex = { leaves: number; pages: IndexPageEntry[]; heavy: [word: string, names: number][] };
type DirectoryKey = readonly [string, ...unknown[]];
type Token = { token: string; exact: boolean };
export type SearchPlan = {
  stage: number; leaves: number[]; bytes: number; rows: number;
  primary: string | null; partner: string | null; alone: string | null; names: number | null;
};

/** -1, 0 or 1 by code point. A surrogate unit (half of an astral character) sorts after every other unit. */
export function compareCodePoints(a: string, b: string): number {
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
export function normalizeName(value: unknown): string {
  return String(value === null || value === undefined ? '' : value).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[łøđðßæœþı]/g, letter => FOLD[letter]).replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

const TRAILING_CODE = /\s*\(([A-Z]{2,3})\)$/;

/** The distinct search words of a recorded name, in code point order: a trailing bracketed code is dropped first. */
export function searchWords(name: string): string[] {
  const code = TRAILING_CODE.exec(name);
  let words = normalizeName(code ? name.slice(0, code.index) : name).split(' ').filter(Boolean);
  if (!words.length && code) words = normalizeName(name).split(' ').filter(Boolean);
  return Array.from(new Set(words)).sort(compareCodePoints);
}

const codePointLength = (text: string) => Array.from(text).length;

/**
 * The tokens of a typed query: its normalised words, repeats removed. In stage 2 a token of three or more
 * characters that begins another token is dropped (it adds nothing), so two tokens never match the same word.
 */
export function queryTokens(query: string, stage: number): string[] {
  const words = Array.from(new Set(normalizeName(query).split(' ').filter(Boolean)));
  if (stage !== 2) return words;
  return words.filter(token => codePointLength(token) < 3 || !words.some(other => other !== token && other.startsWith(token)));
}

/** Stage 1, and any token under three characters: the token equals the word. Otherwise the word begins with it. */
export const tokenIsExact = (token: string, stage: number): boolean => stage !== 2 || codePointLength(token) < 3;
export const tokenMatches = (token: string, word: string, stage: number): boolean => tokenIsExact(token, stage) ? word === token : word.startsWith(token);

/**
 * Whether a row's search words satisfy every token. With a plan whose `alone` is set (a heavy word typed alone in
 * stage 1) only the names whose single search word it is are listed.
 */
export function rowMatches(words: string[], tokens: string[], stage: number, plan?: Pick<SearchPlan, 'alone'> | null): boolean {
  if (plan && plan.alone !== null && plan.alone !== undefined && words.length !== 1) return false;
  return tokens.length > 0 && tokens.every(token => words.some(word => tokenMatches(token, word, stage)));
}

// The search planner
//
// A leaf's directory key is [word, partner, c]. With [w0, o0, c0] its key and [w1, o1, c1] the next leaf's, it holds
//   - every posting of each word strictly between w0 and w1;
//   - the postings of w0 with partner from o0 on: up to o1 when w1 = w0 (o1 itself too when c1 = 1), else to the
//     end of the word;
//   - when w1 differs from w0 and the next leaf starts inside its word (o1 is not '' or c1 = 1): the postings of w1
//     with partner below o1 (o1 itself too when c1 = 1).
// A key's word may be a shortened beginning that is no word at all; the rules below stay true for it.

const heavyWords = new WeakMap<RunnerIndex, Map<string, number>>();
/** Map of heavy word to the number of search names that contain it, from the manifest's index.heavy. */
export function heavyOf(index: RunnerIndex): Map<string, number> {
  let map = heavyWords.get(index);
  if (!map) { map = new Map(index.heavy); heavyWords.set(index, map); }
  return map;
}

/** Can a word matching the partner token lie from `low` on, below `high` (or up to it when `inclusive`)? */
function partnerCanLie(partner: Token, low: string, high: string | null, inclusive: boolean): boolean {
  const side = compareCodePoints(low, partner.token);
  if (partner.exact ? side > 0 : side > 0 && !low.startsWith(partner.token)) return false;
  if (high === null) return true;
  const end = compareCodePoints(partner.token, high);
  return end < 0 || (end === 0 && inclusive);
}

type Key = readonly [string, string, number, ...unknown[]];
/** Whether the leaf with `key` (followed by `next`, or null) can hold a name the primary and partner tokens match. */
export function leafNeeded(key: Key, next: Key | null, primary: Token, partner: Token | null, heavy: Map<string, number>): boolean {
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
    if (partnerCanLie(partner, key[1], sameWord ? next![1] : null, sameWord && next![2] === 1)) return true;
  }
  // (c) the head of the next leaf's word, when that word began in this leaf
  if (w1 !== null && w1 !== w0 && (next![1] !== '' || next![2] === 1) && (primary.exact ? w1 === primary.token : w1.startsWith(primary.token))) {
    if (!heavy.has(w1) || partner === null) return true;
    if (partnerCanLie(partner, '', next![1], next![2] === 1)) return true;
  }
  return false;
}

/** Whether a key word sorts after every word the token can match. Keys are in order, so this is false, then true. */
const pastToken = (word: string, token: string, exact: boolean) => compareCodePoints(word, token) > 0 && (exact || !word.startsWith(token));

/** The first position of `keys` (arrays that start with a word, in order) for which `test(word)` holds; keys.length when none. */
function firstKey(keys: readonly DirectoryKey[], test: (word: string) => boolean): number {
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
export function pageRange(index: RunnerIndex, token: string, exact: boolean): [number, number] {
  const first = Math.max(0, firstKey(index.pages, word => compareCodePoints(word, token) >= 0) - 1);
  return [first, firstKey(index.pages, word => pastToken(word, token, exact)) - 1];
}

/** The directory pages (numbers, ascending) a search for these tokens must load before it can be planned. */
export function indexPagesFor(tokens: string[], stage: number, index: RunnerIndex): number[] {
  const wanted = new Set<number>();
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
export function planSearch(tokens: string[], stage: number, index: RunnerIndex, pages: Map<number, IndexPage>): SearchPlan {
  if (!tokens.length) return { stage, leaves: [], bytes: 0, rows: 0, primary: null, partner: null, alone: null, names: null };
  const heavy = heavyOf(index);
  const typed = tokens.map(token => ({ token, exact: tokenIsExact(token, stage) }));
  const alone = stage !== 2 && typed.length === 1 && heavy.has(typed[0].token);
  let best: SearchPlan | null = null;
  for (let p = 0; p < typed.length; p++) {
    const primary = typed[p];
    const partners: (Token | null)[] = alone ? [{ token: '', exact: true }] : ([null] as (Token | null)[]).concat(typed.filter((_, at) => at !== p));
    // The leaves that can be needed for this primary, whatever the partner: inside each page, from the leaf before
    // the first whose word is at or after the token to the last whose word is not past the token's words.
    const candidates: { number: number; entry: LeafEntry; next: Key | null }[] = [];
    const range = pageRange(index, primary.token, primary.exact);
    for (let page = range[0]; page <= range[1]; page++) {
      const loaded = pages.get(page);
      if (!loaded) throw new Error('planSearch: directory page ' + page + ' is not loaded');
      const from = Math.max(0, firstKey(loaded.leaves, word => compareCodePoints(word, primary.token) >= 0) - 1);
      const to = firstKey(loaded.leaves, word => pastToken(word, primary.token, primary.exact)) - 1;
      for (let at = from; at <= to; at++) {
        const following: Key | null = at + 1 < loaded.leaves.length ? loaded.leaves[at + 1] : page + 1 < index.pages.length ? index.pages[page + 1] : null;
        candidates.push({ number: loaded.first + at, entry: loaded.leaves[at], next: following });
      }
    }
    for (const partner of partners) {
      const leaves: number[] = [];
      let bytes = 0, rows = 0;
      for (const leaf of candidates) {
        if (!leafNeeded(leaf.entry, leaf.next, primary, partner, heavy)) continue;
        leaves.push(leaf.number); rows += leaf.entry[3]; bytes += leaf.entry[4];
      }
      if (best === null || bytes < best.bytes || (bytes === best.bytes && leaves.length < best.leaves.length)) {
        best = { stage, leaves, bytes, rows, primary: primary.token, partner: partner === null ? null : partner.token,
          alone: alone ? primary.token : null, names: alone ? heavy.get(primary.token)! : null };
      }
    }
  }
  return best!;
}

// Files

const pad = (number: number, width: number) => String(number).padStart(width, '0');
export const leafPath = (number: number): string => 'index/' + pad(number, 5) + '.json.gz';
export const indexPagePath = (number: number): string => 'index/p/' + pad(number, 2) + '.json.gz';
export const shardPath = (number: number): string => 'profiles/' + number.toString(16).padStart(3, '0') + '.json.gz';
export const profilePagePath = (number: number): string => 'profiles/p/' + pad(number, 2) + '.json.gz';
/** The text an unlinked result's shard is hashed from: shard = the first three hex digits of its SHA-256. */
export const unlinkedKey = (db: string, id: number): string => db + ':' + id;

type Columns = Record<string, { length: number } | undefined>;
function sameLength(data: Columns, columns: readonly string[], length: number, what: string) {
  for (const column of columns) if (!data[column] || data[column]!.length !== length) throw new Error(what + ': column ' + column + ' has another length');
}

export type EditionsFile = {
  v: number; races: [letter: string, label: string, name: string][]; sr: number[]; y: number[]; t: string; sp: string; db: string; g: string;
  q: number[]; cx: number[]; rs: number[]; nl: number[]; reasons: string[];
  /** Each edition's timing class, a digit into TIMING_CLASSES (lib/tiers.ts). Required. */
  tb: string;
};
/** One edition as the reference decodes it. */
export type DecodedEdition = {
  index: number; distance: RunnerDistance; city: string; race: string; year: number; tier: number; splits: boolean; db: string;
  noComparison: number; q: number; context: number | null; reason: string | null; unlisted: number;
  /** The edition's timing class (lib/tiers.ts TIMING_CLASSES). */
  timing: TimingClass;
};

/** editions.json.gz as one object per edition, in index order. */
export function decodeEditions(data: EditionsFile): DecodedEdition[] {
  if (!data || data.v !== SCHEMA_VERSION) throw new Error('editions: unknown version');
  const count = data.sr.length;
  sameLength(data as unknown as Columns, ['y', 't', 'sp', 'db', 'g', 'tb', 'q', 'cx', 'rs', 'nl'], count, 'editions');
  const out = new Array<DecodedEdition>(count);
  for (let at = 0; at < count; at++) {
    const race = data.races[data.sr[at]];
    out[at] = {
      index: at, distance: race[0] === 'm' ? 'marathon' : 'half', city: race[1], race: race[2], year: data.y[at],
      tier: Number(data.t[at]), splits: data.sp[at] === '1', db: data.db[at], noComparison: Number(data.g[at]),
      q: data.q[at], context: data.cx[at] < 0 ? null : data.cx[at], reason: data.rs[at] < 0 ? null : data.reasons[data.rs[at]],
      unlisted: data.nl[at],
      // An unknown digit decodes to undefined and is refused by validateEditions, never shown as a default.
      timing: TIMING_CLASSES[Number(data.tb[at])] as TimingClass,
    };
  }
  return out;
}

const LEAF_COLUMNS = ['n', 'b', 'o', 'e', 'y', 's', 'm', 'h', 'q', 'p'] as const;
export type LeafFile = { v: number; n: string[]; b: number[]; o: number[]; e: number[]; y: number[]; s: number[]; m: number[]; h: number[]; q: number[]; p: number[] };
/** A search row: the shown name, the profile it points at and what the row describes. */
export type RunnerMatch = {
  name: string; shard: number; position: number; edition: number | null; firstYear: number; lastYear: number;
  marathons: number; halves: number; possible: number; onlyPossible: boolean;
};

/** An index leaf as rows: the shown name, the profile pointer and what the row describes. */
export function decodeLeaf(data: LeafFile): RunnerMatch[] {
  if (!data || data.v !== SCHEMA_VERSION) throw new Error('index leaf: unknown version');
  const count = data.n.length;
  sameLength(data as unknown as Columns, LEAF_COLUMNS, count, 'index leaf');
  const out = new Array<RunnerMatch>(count);
  for (let at = 0; at < count; at++) {
    out[at] = {
      name: data.n[at], shard: data.b[at], position: data.o[at], edition: data.e[at] < 0 ? null : data.e[at],
      firstYear: data.y[at], lastYear: data.y[at] + data.s[at], marathons: data.m[at], halves: data.h[at],
      possible: data.q[at], onlyPossible: data.p[at] === 1,
    };
  }
  return out;
}

const bits = (mask: number) => { let count = 0; for (let rest = mask; rest; rest >>>= 1) count += rest & 1; return count; };

/** Cumulative times at the distance's points (null where not recorded); the last is the finish. */
export function resultTimes(mask: number, gaps: number[], finish: number, distance: RunnerDistance): (number | null)[] {
  const times: (number | null)[] = [];
  let total = 0, used = 0;
  for (let bit = 0; bit < CHECKPOINTS[distance]; bit++) {
    if (mask >> bit & 1) { total += gaps[used++]; times.push(total); } else times.push(null);
  }
  if (used !== gaps.length || mask >> CHECKPOINTS[distance]) throw new Error('profile shard: a mask does not fit its distance');
  times.push(finish < 0 ? null : finish);
  return times;
}

export type ShardFile = {
  v: number; k: number[]; u: number[]; n: string[]; e: number[]; i: number[]; f: number[]; x: string; a: number[]; c: string;
  /** The screen a person of a confirmed tier failed, one digit per result into SCREENS; non-zero exactly on link codes b, c and d. */
  w: string; j: number[]; s: string; m: number[]; d: number[];
};
/** One result as the reference decodes it. */
export type DecodedResult = {
  edition: number; db: string; id: number; key: string; distance: RunnerDistance; finish: number | null; sex: string | null; age: number | null;
  link: string; confirmed: boolean; screen: Screen | null; status: string | null; name: string; mask: number; times: (number | null)[];
};
export type DecodedProfile = { names: string[]; results: DecodedResult[] };

/**
 * The profiles of a shard, or the one at `position` when it is given. A result:
 * { edition, db, id, key, distance, finish, sex, age, link, confirmed, screen, status, name, mask, times }. `screen` is null
 * unless the link is b, c or d: then the screen the person failed (SCREENS).
 * `id` is the record id (i + 256·q of its edition) and `key` is db + id, unique across both distances.
 */
export function decodeShard(data: ShardFile, editions: readonly DecodedEdition[]): DecodedProfile[];
export function decodeShard(data: ShardFile, editions: readonly DecodedEdition[], position: number): DecodedProfile;
export function decodeShard(data: ShardFile, editions: readonly DecodedEdition[], position?: number): DecodedProfile[] | DecodedProfile {
  if (!data || data.v !== SCHEMA_VERSION) throw new Error('profile shard: unknown version');
  const results = data.e.length;
  sameLength(data as unknown as Columns, ['i', 'f', 'x', 'a', 'c', 'w', 'j', 's', 'm'], results, 'profile shard');
  if (data.k.length !== data.u.length) throw new Error('profile shard: k and u differ in length');
  const out: DecodedProfile[] = [];
  let row = 0, name = 0, gap = 0;
  for (let at = 0; at < data.k.length; at++) {
    const wanted = position === undefined || position === at;
    const profile: DecodedProfile | null = wanted ? { names: data.n.slice(name, name + data.u[at]), results: [] } : null;
    for (let end = row + data.k[at]; row < end; row++) {
      const count = bits(data.m[row]);
      if (profile) {
        const edition = editions[data.e[row]];
        if (!edition || data.j[row] >= data.u[at]) throw new Error('profile shard: a result names an unknown edition or name');
        const id = data.i[row] + 256 * edition.q;
        profile.results.push({
          edition: data.e[row], db: edition.db, id, key: edition.db + id, distance: edition.distance,
          finish: data.f[row] < 0 ? null : data.f[row], sex: data.x[row] === '-' ? null : data.x[row], age: data.a[row] < 0 ? null : data.a[row],
          link: data.c[row], confirmed: CONFIRMED_LINKS.includes(data.c[row]), screen: SCREENS[Number(data.w[row])] as Screen | null, status: data.s[row] === '-' ? null : data.s[row],
          name: profile.names[data.j[row]], mask: data.m[row],
          times: resultTimes(data.m[row], data.d.slice(gap, gap + count), data.f[row], edition.distance),
        });
      }
      gap += count;
    }
    name += data.u[at];
    if (profile) out.push(profile);
  }
  if (row !== results || name !== data.n.length || gap !== data.d.length) throw new Error('profile shard: the columns do not add up');
  if (position !== undefined) {
    if (out.length !== 1) throw new Error('profile shard: no profile at that position');
    return out[0];
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// The reference reader, ported: END
// ---------------------------------------------------------------------------------------------------------------

// ---------------------------------------------------------------------------------------------------------------
// 2. Loading and checking
// ---------------------------------------------------------------------------------------------------------------

export type RunnerEdition = Omit<DecodedEdition, 'tier' | 'db' | 'noComparison'> & {
  /** The position of the release's verification tier in TIERS. */
  tier: 0 | 1 | 2 | 3 | 4;
  /** The source database of the edition's record ids: `f` (the marathon database) or `h`. */
  db: 'f' | 'h';
  /** Half editions only: 1 gross (gun) times, 2 course suspected short. Listed, and compared with nothing. */
  noComparison: 0 | 1 | 2;
};
type PageEntry = [bytes: number, sha256: string];
type ShardEntry = [profiles: number, results: number, bytes: number, sha256: string];
type ProfilePage = { v: number; first: number; shards: ShardEntry[] };
export type RunnerManifest = {
  schema_version: 2; release_tag: string; input_as_of: string; as_of: string; provisional: string[];
  /** The marathon cohort the lookup was built beside: what the runner context binds to. */
  cohort: { manifest_sha256: string; release_tag: string; as_of: string; input_as_of: string; raw_records: number; eligible_records: number; own_record_records: number; editions: number };
  time_unit_ms: number; points_km: { marathon: number[]; half: number[] };
  index: RunnerIndex; profiles: { shards: number; pages: PageEntry[] };
  /** The editions file's entry in the manifest; `editions` is its decoded content, set once the file is verified. */
  editions_file: { file: string; bytes: number; sha256: string; count: number; races: number };
  editions: RunnerEdition[];
};

/** Nine marathon mats, in km: the pacing views are the marathon's. */
export const RUNNER_POINTS: readonly number[] = POINTS_KM.marathon;
export const RUNNER_PAGE_SIZE = 25;
export function runnerSearchPage<T>(matches: T[], page: number): T[] {
  if (!Number.isSafeInteger(page) || page < 0) return [];
  return matches.slice(page * RUNNER_PAGE_SIZE, (page + 1) * RUNNER_PAGE_SIZE);
}

const problem = () => new Error('The runner data could not be verified. Please reload and try again.');
const integer = (value: unknown, min = 0): value is number => Number.isSafeInteger(value) && Number(value) >= min;
const sha = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const text = (value: unknown): value is string => typeof value === 'string';
const hex = async (bytes: ArrayBuffer) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');

// Bind the exact fetched bytes to their parsed object without adding fields to the published manifest or trusting a
// digest supplied inside that manifest.
const manifestDigests = new WeakMap<RunnerManifest, string>();
export const runnerManifestDigest = (manifest: RunnerManifest): string | undefined => manifestDigests.get(manifest);

/** Same as the lookup's own normalisation (the fold table included); never infer a person's identity from it. */
export const normalizeRunnerName = (value: string): string => normalizeName(value);

type RunnerManifestHead = Omit<RunnerManifest, 'editions'>;

/**
 * The manifest's own fields, checked: the schema, the pinned release, whole seconds, the two distances' points, the
 * cohort it names, and a chain entry for the editions file and every directory page. A build that names stand-in
 * inputs (`provisional`) is refused unless the page was built for a development folder.
 */
export function validateRunnerManifest(value: unknown): RunnerManifestHead {
  const data = value as Record<string, unknown> | null;
  const cohort = data?.cohort as RunnerManifest['cohort'] | undefined;
  const index = data?.index as RunnerIndex | undefined;
  const profiles = data?.profiles as RunnerManifest['profiles'] | undefined;
  const file = data?.editions as RunnerManifest['editions_file'] | undefined;
  const points = data?.points_km as RunnerManifest['points_km'] | undefined;
  const provisional = data?.provisional as string[] | undefined;
  if (!data || data.schema_version !== SCHEMA_VERSION || data.release_tag !== RUNNER_RELEASE ||
    !text(data.input_as_of) || !Number.isFinite(Date.parse(data.input_as_of)) || !text(data.as_of) || !Number.isFinite(Date.parse(data.as_of)) ||
    !Array.isArray(provisional) || provisional.some(name => !text(name)) || (provisional.length > 0 && !DEVELOPMENT_DATA) ||
    data.time_unit_ms !== 1000 || !points || JSON.stringify(points.marathon) !== JSON.stringify(POINTS_KM.marathon) || JSON.stringify(points.half) !== JSON.stringify(POINTS_KM.half) ||
    !cohort || !sha(cohort.manifest_sha256) || cohort.release_tag !== RUNNER_RELEASE || !text(cohort.as_of) || !Number.isFinite(Date.parse(cohort.as_of)) ||
    !text(cohort.input_as_of) || !Number.isFinite(Date.parse(cohort.input_as_of)) || !integer(cohort.raw_records) || !integer(cohort.eligible_records) || cohort.eligible_records > cohort.raw_records ||
    !file || file.file !== 'editions.json.gz' || !integer(file.bytes, 1) || !sha(file.sha256) || !integer(file.count, 1) ||
    !index || !integer(index.leaves, 1) || !Array.isArray(index.pages) || index.pages.length !== Math.ceil(index.leaves / PAGE_SIZE) ||
    index.pages.some(page => !Array.isArray(page) || page.length !== 5 || !text(page[0]) || !text(page[1]) || (page[2] !== 0 && page[2] !== 1) || !integer(page[3], 1) || !sha(page[4])) ||
    !Array.isArray(index.heavy) || index.heavy.some(row => !Array.isArray(row) || row.length !== 2 || !text(row[0]) || !integer(row[1], 1)) ||
    !profiles || profiles.shards !== PROFILE_SHARDS || !Array.isArray(profiles.pages) || profiles.pages.length !== PROFILE_SHARDS / PAGE_SIZE ||
    profiles.pages.some(page => !Array.isArray(page) || page.length !== 2 || !integer(page[0], 1) || !sha(page[1]))) throw problem();
  return {
    schema_version: 2, release_tag: data.release_tag, input_as_of: data.input_as_of, as_of: data.as_of, provisional, cohort, time_unit_ms: 1000, points_km: points,
    index: { leaves: index.leaves, pages: index.pages, heavy: index.heavy }, profiles: { shards: profiles.shards, pages: profiles.pages }, editions_file: file,
  };
}

/** Every edition's codes are ones the page knows: a code it does not know is refused, never shown as a default. */
function validateEditions(decoded: DecodedEdition[], count: number): RunnerEdition[] {
  if (decoded.length !== count) throw problem();
  for (const edition of decoded) {
    const marathon = edition.distance === 'marathon';
    if (!text(edition.city) || !edition.city || !text(edition.race) || !integer(edition.year, 1) || !integer(edition.q) || !integer(edition.unlisted) ||
      !Number.isInteger(edition.tier) || edition.tier < 0 || edition.tier >= TIERS.length || (edition.db !== 'f' && edition.db !== 'h') ||
      ![0, 1, 2].includes(edition.noComparison) || (marathon && (edition.noComparison !== 0 || edition.db !== 'f')) ||
      (edition.context !== null && (!integer(edition.context) || !marathon)) || (edition.reason !== null && (!text(edition.reason) || !marathon)) ||
      !(TIMING_CLASSES as readonly string[]).includes(edition.timing) || (edition.noComparison === 1 && edition.timing !== 'gun')) throw problem();
  }
  return decoded as RunnerEdition[];
}

// Directory pages are small and all kept; leaves and shards are large, so only the latest few are kept.
const pageCache = new Map<string, unknown>();
const fileCache = new Map<string, unknown>();
const FILES_KEPT = 8;
const aborted = () => new DOMException('Aborted', 'AbortError');
/** Forgets every kept file, so the next read fetches and checks it again (scripts/verify-runner-search.cjs, its refusals). */
export function clearRunnerCaches(): void { pageCache.clear(); fileCache.clear(); }

/**
 * One gzip JSON file of the lookup, opened only when its size and SHA-256 are the ones its parent lists. `path` comes
 * from leafPath, indexPagePath, shardPath or profilePagePath, or is the editions file's fixed name: numbers and hex
 * digits only.
 */
async function loadVerified(path: string, bytes: number, sha256: string, signal: AbortSignal | undefined, keep: 'page' | 'file' | 'none'): Promise<unknown> {
  const key = path + ':' + sha256;
  const cache = keep === 'page' ? pageCache : fileCache;
  const cached = cache.get(key);
  if (cached !== undefined) {
    // The latest used is the last dropped.
    if (keep === 'file') { cache.delete(key); cache.set(key, cached); }
    return cached;
  }
  const response = await dataFetch(basePath + RUNNER_DATA + '/' + path + '?v=' + sha256, { signal });
  if (!response.ok) throw new Error('The matching records could not load. Check your connection and try again.');
  const body = await response.arrayBuffer();
  if (body.byteLength !== bytes || await hex(body) !== sha256) throw problem();
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot open the compressed search files. Please use a current browser.');
  let data: unknown;
  try { data = await new Response(new Blob([body]).stream().pipeThrough(new DecompressionStream('gzip'))).json(); } catch { throw signal?.aborted ? aborted() : problem(); }
  if (signal?.aborted) throw aborted();
  if (data === null || typeof data !== 'object') throw problem();
  if (keep !== 'none') {
    cache.set(key, data);
    if (keep === 'file' && cache.size > FILES_KEPT) cache.delete(cache.keys().next().value!);
  }
  return data;
}

export async function loadRunnerManifest(signal?: AbortSignal): Promise<RunnerManifest> {
  const response = await dataFetch(basePath + RUNNER_DATA + '/manifest.json?v=' + encodeURIComponent(RUNNER_RELEASE), { signal });
  if (!response.ok) throw new Error('Runner search could not load. Check your connection and try again.');
  const bytes = await response.arrayBuffer();
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw problem(); }
  const head = validateRunnerManifest(parsed);
  const file = head.editions_file;
  const raw = await loadVerified(file.file, file.bytes, file.sha256, signal, 'none') as EditionsFile;
  let editions: RunnerEdition[];
  try { editions = validateEditions(decodeEditions(raw), file.count); } catch { throw problem(); }
  const manifest: RunnerManifest = { ...head, editions };
  manifestDigests.set(manifest, await hex(bytes));
  return manifest;
}

async function loadIndexPage(number: number, manifest: RunnerManifest, signal?: AbortSignal): Promise<IndexPage> {
  const entry = manifest.index.pages[number];
  if (!entry) throw problem();
  const page = await loadVerified(indexPagePath(number), entry[3], entry[4], signal, 'page') as IndexPage;
  const expected = number === manifest.index.pages.length - 1 ? manifest.index.leaves - number * PAGE_SIZE : PAGE_SIZE;
  if (page.v !== SCHEMA_VERSION || page.first !== number * PAGE_SIZE || !Array.isArray(page.leaves) || page.leaves.length !== expected ||
    page.leaves.some(leaf => !Array.isArray(leaf) || leaf.length !== 6 || !text(leaf[0]) || !text(leaf[1]) || (leaf[2] !== 0 && leaf[2] !== 1) || !integer(leaf[3], 1) || !integer(leaf[4], 1) || !sha(leaf[5])) ||
    page.leaves[0][0] !== entry[0] || page.leaves[0][1] !== entry[1] || page.leaves[0][2] !== entry[2]) throw problem();
  return page;
}

type IndexedRow = RunnerMatch & { words: string[] };
const leafRows = new WeakMap<object, IndexedRow[]>();
async function loadLeaf(number: number, page: IndexPage, signal?: AbortSignal): Promise<IndexedRow[]> {
  const entry = page.leaves[number - page.first];
  if (!entry) throw problem();
  const data = await loadVerified(leafPath(number), entry[4], entry[5], signal, 'file') as LeafFile;
  let rows = leafRows.get(data);
  if (rows) return rows;
  try { rows = decodeLeaf(data).map(row => ({ ...row, words: searchWords(row.name) })); } catch { throw problem(); }
  if (rows.length !== entry[3] || rows.some(row => !text(row.name) || !integer(row.shard) || row.shard >= PROFILE_SHARDS || !integer(row.position) ||
    (row.edition !== null && !integer(row.edition)) || !integer(row.firstYear) || !integer(row.lastYear) || !integer(row.marathons) || !integer(row.halves) || !integer(row.possible))) throw problem();
  leafRows.set(data, rows);
  return rows;
}

type StagePlan = { tokens: string[]; pages: Map<number, IndexPage>; plan: SearchPlan };
/** The tokens of a query at a stage, the directory pages they need (loaded and checked) and the plan. No leaf is read. */
async function planStage(query: string, stage: 1 | 2, manifest: RunnerManifest, signal?: AbortSignal): Promise<StagePlan> {
  const tokens = queryTokens(query, stage);
  const numbers = indexPagesFor(tokens, stage, manifest.index);
  const loaded = await Promise.all(numbers.map(number => loadIndexPage(number, manifest, signal)));
  const pages = new Map(numbers.map((number, at) => [number, loaded[at]] as [number, IndexPage]));
  return { tokens, pages, plan: planSearch(tokens, stage, manifest.index, pages) };
}

/**
 * The rows a plan matches: its leaves loaded a few at a time (those in `have` are not asked for again) and read in
 * the plan's order, one row kept per profile and shown name.
 */
async function readStage(stage: 1 | 2, planned: StagePlan, signal: AbortSignal | undefined, have: Map<number, IndexedRow[]>): Promise<RunnerMatch[]> {
  const { tokens, pages, plan } = planned;
  const wanted = plan.leaves.filter(number => !have.has(number));
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, wanted.length) }, async () => {
    while (next < wanted.length) {
      const number = wanted[next++];
      have.set(number, await loadLeaf(number, pages.get(Math.floor(number / PAGE_SIZE))!, signal));
    }
  }));
  const seen = new Set<string>(), rows: RunnerMatch[] = [];
  for (const number of plan.leaves) {
    for (const row of have.get(number)!) {
      if (!rowMatches(row.words, tokens, stage, plan)) continue;
      const key = row.shard + ':' + row.position + ':' + row.name;
      if (seen.has(key)) continue;
      seen.add(key);
      const { words: _words, ...match } = row;
      rows.push(match);
    }
  }
  return rows;
}

/** A stage's plan and, unless it passes `limit` bytes, the rows it matches: what scripts/lib/lookup-files.cjs `search` returns. */
export type StageSearch = { plan: SearchPlan; refused: boolean; rows: RunnerMatch[] };

/**
 * The names a query matches at one stage (1: whole words; 2: beginnings), one row per profile and shown name, in the
 * order the leaves hold them. `refused` is true, and no leaf is read, when the plan passes `limit` bytes.
 */
export async function searchStage(query: string, stage: 1 | 2, manifest: RunnerManifest, signal?: AbortSignal, limit: number = SEARCH_HARD_CAP): Promise<StageSearch> {
  const planned = await planStage(query, stage, manifest, signal);
  if (planned.plan.bytes > limit) return { plan: planned.plan, refused: true, rows: [] };
  return { plan: planned.plan, refused: false, rows: await readStage(stage, planned, signal, new Map()) };
}

/** What a search found, and what more it could list. */
export type RunnerSearchResult = {
  matches: RunnerMatch[];
  /** The stage whose matches are listed: 1 whole words, 2 beginnings of words. */
  stage: 1 | 2;
  /** Bytes of index leaves this search has loaded. */
  bytes: number;
  /** One very common word typed alone: only the names recorded as that single word are listed; `names` recorded names hold it. */
  alone: { word: string; names: number } | null;
  /** A step that waits for a press, with what it would add to the download. Never taken unasked. */
  more: { step: 'whole' | 'beginnings'; bytes: number } | null;
  /** A step that can never be taken: it would pass the hard cap. */
  capped: 'whole' | 'beginnings' | null;
};
/** The steps the visitor has pressed for. */
export type RunnerSearchAllow = { whole?: boolean; beginnings?: boolean };
export type RunnerSearchLimits = { auto: number; cap: number };

/**
 * A name search, as the page runs it. Stage 1 first: every typed word equals a word of the name. When that lists
 * nothing, stage 2 (typed words begin words; a word under three characters must still equal one) is planned under the
 * same limits, the leaves already loaded counted once; when it lists something, stage 2 is only offered. A step that
 * would take the search past `auto` bytes (SEARCH_AUTO) waits for a press (`allow`), and none is ever taken past `cap`
 * (SEARCH_HARD_CAP).
 */
export async function searchRunnerNames(query: string, manifest: RunnerManifest, signal?: AbortSignal, allow: RunnerSearchAllow = {}, limits: RunnerSearchLimits = { auto: SEARCH_AUTO, cap: SEARCH_HARD_CAP }): Promise<RunnerSearchResult> {
  const empty: RunnerSearchResult = { matches: [], stage: 1, bytes: 0, alone: null, more: null, capped: null };
  if (!queryTokens(query, 1).length) return empty;
  const whole = await planStage(query, 1, manifest, signal);
  const alone = whole.plan.alone !== null && whole.plan.names !== null ? { word: whole.plan.alone, names: whole.plan.names } : null;
  if (whole.plan.bytes > limits.cap) return { ...empty, alone, capped: 'whole' };
  if (whole.plan.bytes > limits.auto && !allow.whole) return { ...empty, alone, more: { step: 'whole', bytes: whole.plan.bytes } };
  const have = new Map<number, IndexedRow[]>();
  const exact = await readStage(1, whole, signal, have);
  const result: RunnerSearchResult = { ...empty, matches: sortMatches(exact, manifest, query), bytes: whole.plan.bytes, alone };
  // Stage 2 can list more only when a typed word of three or more characters could begin a longer word.
  if (queryTokens(query, 2).every(token => tokenIsExact(token, 2))) return result;
  const beginnings = await planStage(query, 2, manifest, signal);
  const extra = beginnings.plan.leaves.reduce((sum, number) => sum + (have.has(number) ? 0 : beginnings.pages.get(Math.floor(number / PAGE_SIZE))!.leaves[number % PAGE_SIZE][4]), 0);
  const total = whole.plan.bytes + extra;
  if (total > limits.cap) return { ...result, capped: 'beginnings' };
  if (!allow.beginnings && (exact.length > 0 || total > limits.auto)) return { ...result, more: { step: 'beginnings', bytes: extra } };
  return { ...result, matches: sortMatches(await readStage(2, beginnings, signal, have), manifest, query), stage: 2, bytes: total };
}

/**
 * A recorded name as the search rows and the record's heading show it (the record's own details keep the recorded
 * spelling): "Last, First" as "First Last", brackets around a name part dropped, a word recorded all in capitals or all
 * in lower case in title case (a lower-case particle after the first word, "van der", stays), and a country code in brackets as a quiet suffix: "(Smith), Clara (GBR)" reads
 * "Clara Smith · GBR", "suozzo, Brian (USA)" "Brian Suozzo · USA", "Aaron SMITH" "Aaron Smith".
 */
export function displayName(name: string): string {
  const code = /\s*\(([A-Z]{2,3})\)$/.exec(name);
  const parts = (code ? name.slice(0, code.index) : name).replace(/[()]/g, '').split(',').map(part => part.trim()).filter(Boolean);
  const cased = (parts.length === 2 ? `${parts[1]} ${parts[0]}` : parts.join(', ')).replace(/\s+/g, ' ')
    .replace(/[\p{L}\p{M}'’-]+/gu, (word, at: number) => /\p{Lu}/u.test(word) && /\p{Ll}/u.test(word) || at && /^(?:da|de|del|der|den|di|do|dos|du|la|le|van|von)$/.test(word) ? word
      : word.toLocaleLowerCase('en-US').replace(/(^|['’-])(\p{L})/gu, (_, before: string, letter: string) => before + letter.toLocaleUpperCase('en-US')));
  // A token of digits alone in a name field (a bib or ID typed into the first name: "1728207887 Martin") is not shown,
  // so a result row and its sort read by the name (round 6); a record's own details keep the recorded spelling.
  const named = cased.split(' ').filter((word) => !/^\d+[,.]?$/.test(word)).join(' ').replace(/^,\s*|,\s*$/g, '').trim();
  const shown = named || cased;
  return code ? `${shown} · ${code[1]}` : shown;
}

/** How many results a search row stands for. */
export const matchResults = (row: RunnerMatch): number => row.edition !== null ? 1 : row.onlyPossible || row.marathons + row.halves === 0 ? row.possible : row.marathons + row.halves + row.possible;

/**
 * Whether a row's name is exactly what was typed: its search words are the typed words, no more (word order, case,
 * accents and a trailing country code aside). A row of a longer name ("Ana Maria Example" for "ana example") is not.
 */
export function exactName(row: Pick<RunnerMatch, 'name'>, typed: readonly string[]): boolean {
  const words = searchWords(row.name);
  return typed.length > 0 && words.length === typed.length && typed.every(token => words.includes(token));
}

/**
 * The rows in the order the page lists them. With the typed query, the rows whose name is exactly what was typed come
 * first (M7, November 20, 2026: a common name's exact rows had come after every longer variant). Then, in each of the
 * two groups, by the shown name without its punctuation ("(Smith), Clara" sorts as "clara smith"); under one name the
 * rows that hold several results first (the most first), then single races by race and year, newest first. Plain
 * string order, so every browser lists them alike.
 */
export function sortMatches(rows: RunnerMatch[], manifest: Pick<RunnerManifest, 'editions'>, query?: string): RunnerMatch[] {
  const typed = query === undefined ? [] : queryTokens(query, 1);
  const keyed = rows.map(row => {
    const edition = row.edition === null ? null : manifest.editions[row.edition];
    return { row, exact: exactName(row, typed) ? 0 : 1, name: normalizeName(displayName(row.name)), results: matchResults(row), race: edition ? edition.city : '', year: edition ? edition.year : row.lastYear };
  });
  keyed.sort((a, b) => a.exact - b.exact || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) || b.results - a.results || (a.race < b.race ? -1 : a.race > b.race ? 1 : 0) || b.year - a.year ||
    a.row.shard - b.row.shard || a.row.position - b.row.position || (a.row.name < b.row.name ? -1 : a.row.name > b.row.name ? 1 : 0));
  return keyed.map(entry => entry.row);
}

// ---------------------------------------------------------------------------------------------------------------
// 3. A profile and what the page shows of it
// ---------------------------------------------------------------------------------------------------------------

export type LinkCode = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'a' | 'b' | 'c' | 'd';
/** A marathon record's status: 0 counted; 1 own record; 2 to 6 recorded times only. */
export type RunnerStatus = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type RunnerRace = {
  /** Source database and record id (`f123`, `h123`): unique across both distances. It stays in the page. */
  key: string;
  db: 'f' | 'h'; id: number; edition: number; distance: RunnerDistance;
  /** The name this result was recorded under. */
  name: string; sex: string | null; age: number | null;
  /** Seconds at the distance's points (nine for a marathon, five for a half), null where none was recorded; the last is the finish. */
  times: (number | null)[];
  link: LinkCode;
  /** The link keys a runner in the pipeline's identity file (codes 1 to 3). */
  confirmed: boolean;
  /** Codes b, c and d only: the screen the person of a confirmed tier failed, which is why this result is a possible match. */
  screen: Screen | null;
  /** Listed as a possible match: the profile holds other results and this one's link does not key a runner. The one result of a profile of one is linked to nothing, so it is never one. */
  possible: boolean;
  /** null for a half marathon. */
  status: RunnerStatus | null;
  /** A marathon record with its own pacing view (status 0 or 1). */
  eligible: boolean;
  /** Status 0: its edition is counted, so peers, weather and the edition's context apply. */
  counted: boolean;
  /** Why a marathon record has no pacing report, in the lookup's words; null where it has one, and for a half. */
  reason: string | null;
};
export type RunnerProfile = { shard: number; position: number; names: string[]; races: RunnerRace[] };

/** The release's confidence of each link code, and whether the link keys a runner. Codes b, c and d are a keyed tier whose person fails a screen. */
const LINKS: Readonly<Record<LinkCode, { confidence: string | null; keyed: boolean; screened: boolean }>> = {
  '0': { confidence: null, keyed: false, screened: false },
  '1': { confidence: 'high_elite', keyed: true, screened: false }, '2': { confidence: 'high', keyed: true, screened: false }, '3': { confidence: 'medium', keyed: true, screened: false },
  '4': { confidence: 'medium_variant', keyed: false, screened: false }, '5': { confidence: 'low', keyed: false, screened: false }, '6': { confidence: 'low_noage', keyed: false, screened: false },
  '7': { confidence: 'low_noage_series', keyed: false, screened: false }, '8': { confidence: 'low_nosex', keyed: false, screened: false }, '9': { confidence: 'low_city_pace', keyed: false, screened: false },
  a: { confidence: 'low_carryover', keyed: false, screened: false },
  b: { confidence: 'high_elite', keyed: false, screened: true }, c: { confidence: 'high', keyed: false, screened: true }, d: { confidence: 'medium', keyed: false, screened: true },
};
/** A link code as the tier vocabulary (lib/tiers.ts) names it: the confidence, whether it keys a runner, and whether a screen left it without a key. */
export const runnerLink = (code: LinkCode) => LINKS[code];

/** The fixed sentences of the record-level statuses; an edition-level status (1 and 6) takes its edition's own sentence. */
const STATUS_REASONS: Readonly<Partial<Record<RunnerStatus, string>>> = {
  2: 'Duplicate of another recorded race; excluded from analysis.',
  3: 'One or more checkpoint times are missing or could not be parsed.',
  4: 'Checkpoint times are not strictly increasing.',
  5: 'Finish or section pace falls outside the study quality bounds.',
};
export const NO_FINISH = 'No finish time recorded';

/** A result's finish in seconds, or null when none was recorded. */
export const raceFinish = (race: RunnerRace): number | null => race.times[race.times.length - 1];

/** One decoded profile as the page holds it. A code the page does not know is refused. */
export function runnerProfile(decoded: DecodedProfile, shard: number, position: number, manifest: Pick<RunnerManifest, 'editions'>): RunnerProfile {
  const races = decoded.results.map((result): RunnerRace => {
    const edition = manifest.editions[result.edition];
    const marathon = result.distance === 'marathon';
    const status = result.status === null ? null : Number(result.status);
    if (!edition || edition.distance !== result.distance || (result.db !== 'f' && result.db !== 'h') || result.db !== edition.db || !integer(result.id) || result.key !== result.db + result.id ||
      result.link.length !== 1 || !LINK_CODES.includes(result.link) || result.confirmed !== CONFIRMED_LINKS.includes(result.link) ||
      // A screen exactly on the codes that say one failed, and only one the page knows.
      (result.screen === undefined || (result.screen === null) === LINKS[result.link as LinkCode].screened || (result.screen !== null && !SCREENS.includes(result.screen))) ||
      !text(result.name) || !result.name || (result.sex !== null && !text(result.sex)) || (result.age !== null && !integer(result.age)) ||
      (marathon ? status === null || !Number.isInteger(status) || status < 0 || status > 6 : status !== null) ||
      result.times.length !== POINTS_KM[result.distance].length || result.times.some(time => time !== null && !Number.isSafeInteger(time)) ||
      result.times[result.times.length - 1] !== result.finish || (result.finish !== null && result.finish < 0)) throw problem();
    const eligible = marathon && (status === 0 || status === 1);
    // Status 0 only in a counted edition (which has no sentence of its own), and 1 or 6 only in one that is not counted.
    if (marathon && ((status === 0 && edition.reason !== null) || ((status === 1 || status === 6) && edition.reason === null))) throw problem();
    const race: RunnerRace = {
      key: result.key, db: result.db, id: result.id, edition: result.edition, distance: result.distance, name: result.name, sex: result.sex, age: result.age,
      times: result.times, link: result.link as LinkCode, confirmed: result.confirmed, screen: result.screen, possible: decoded.results.length > 1 && !result.confirmed,
      status: status as RunnerStatus | null, eligible, counted: marathon && status === 0,
      reason: !marathon || status === 0 ? null : status === 1 || status === 6 ? edition.reason : STATUS_REASONS[status as RunnerStatus] ?? null,
    };
    if (eligible && !runnerMetrics(race)) throw problem();
    if (marathon && !eligible && race.reason === null) throw problem();
    return race;
  });
  // A result with no link stands alone, and a person's confirmed tiers are all keyed or none.
  if (!races.length || new Set(races.map(race => race.key)).size !== races.length || decoded.names.some(name => !text(name) || !name) ||
    (races.length > 1 && races.some(race => race.link === '0')) || (races.some(race => race.confirmed) && races.some(race => LINKS[race.link].screened))) throw problem();
  return { shard, position, names: decoded.names, races };
}

export async function loadRunnerProfile(shard: number, position: number, manifest: RunnerManifest, signal?: AbortSignal): Promise<RunnerProfile> {
  if (!integer(shard) || shard >= PROFILE_SHARDS || !integer(position)) throw problem();
  const number = Math.floor(shard / PAGE_SIZE), listed = manifest.profiles.pages[number];
  const page = await loadVerified(profilePagePath(number), listed[0], listed[1], signal, 'page') as ProfilePage;
  if (!page || page.v !== SCHEMA_VERSION || page.first !== number * PAGE_SIZE || !Array.isArray(page.shards) || page.shards.length !== PAGE_SIZE) throw problem();
  const entry = page.shards[shard % PAGE_SIZE];
  if (!Array.isArray(entry) || entry.length !== 4 || !integer(entry[0]) || !integer(entry[1]) || !integer(entry[2], 1) || !sha(entry[3]) || position >= entry[0]) throw problem();
  const data = await loadVerified(shardPath(shard), entry[2], entry[3], signal, 'file') as ShardFile;
  let decoded: DecodedProfile;
  try { decoded = decodeShard(data, manifest.editions, position); } catch { throw problem(); }
  return runnerProfile(decoded, shard, position, manifest);
}

/**
 * A record key as the page holds it. Until this lookup a record was named by its marathon id alone, so a bare id is
 * the marathon database's (`123` is `f123`); `f123` and `h123` are themselves. Anything else is no key.
 */
export function recordKey(value: string): string | null {
  const match = /^([fh]?)(0|[1-9]\d{0,14})$/.exec(value.trim());
  return match ? (match[1] || 'f') + match[2] : null;
}

export type RunnerSection = { start: number; end: number; elapsed: number; pace: number; cumulative: number };
export type RunnerMetrics = { finish: number; pace: number; baseline: number; latePace: number; lateChange: number; openingChange: number; sections: RunnerSection[] };

/** Descriptive metrics only, for a marathon record with its own pacing view; the status comes from the audited server-side calculation. */
export function runnerMetrics(race: RunnerRace): RunnerMetrics | null {
  if (!race.eligible || race.distance !== 'marathon' || race.times.length !== 9 || race.times.some(time => time === null || !Number.isFinite(time))) return null;
  const times = race.times as number[];
  const sections = times.map((cumulative, i) => {
    const start = i === 0 ? 0 : RUNNER_POINTS[i - 1], elapsed = cumulative - (i === 0 ? 0 : times[i - 1]);
    return { start, end: RUNNER_POINTS[i], elapsed, cumulative, pace: elapsed / (RUNNER_POINTS[i] - start) };
  });
  if (times[8] < 90 * 60 || times[8] > 12 * 3600 || sections.some(row => row.pace < 120 - 1e-7 || row.pace > 1200 + 1e-7)) return null;
  const baseline = (times[3] - times[0]) / 15, latePace = (times[8] - times[5]) / 12.195;
  return { finish: times[8], pace: times[8] / 42.195, baseline, latePace,
    lateChange: 100 * (latePace / baseline - 1), openingChange: 100 * (sections[0].pace / baseline - 1), sections };
}
export function runnerDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return 'Not recorded';
  const millis = Math.round(seconds * 1000), rounded = Math.floor(millis / 1000);
  const fraction = millis % 1000 ? '.' + String(millis % 1000).padStart(3, '0').replace(/0+$/, '') : '';
  return `${Math.floor(rounded / 3600)}:${String(Math.floor(rounded % 3600 / 60)).padStart(2, '0')}:${String(rounded % 60).padStart(2, '0')}${fraction}`;
}

export function runnerProgression(races: RunnerRace[], manifest: Pick<RunnerManifest, 'editions'>) {
  const valid = races.flatMap(race => {
    const metrics = runnerMetrics(race);
    return metrics ? [{ race, metrics }] : [];
  }).sort((a, b) => manifest.editions[a.race.edition].year - manifest.editions[b.race.edition].year || a.race.id - b.race.id);
  if (!valid.length) return null;
  const best = valid.reduce((current, row) => row.metrics.finish < current.metrics.finish ? row : current);
  const earliestYear = manifest.editions[valid[0].race.edition].year;
  const latestYear = manifest.editions[valid[valid.length - 1].race.edition].year;
  const yearBest = (year: number) => Math.min(...valid.filter(row => manifest.editions[row.race.edition].year === year).map(row => row.metrics.finish));
  // A record ID is not chronology. Never turn two races in the same year into
  // a before/after comparison when the source supplies only a year.
  const yearChange = earliestYear < latestYear ? yearBest(earliestYear) - yearBest(latestYear) : null;
  return { valid, best, earliestYear, latestYear, yearChange };
}

/**
 * Whether a result's finish can stand beside others as a recorded finish: it has one, its record is not one the data
 * sets aside for its own times (a marathon duplicate, times out of order, or outside the timing bounds), and its
 * edition is not one that is compared with nothing (a half with gun times or a course suspected short).
 */
export function finishComparable(race: RunnerRace, manifest: Pick<RunnerManifest, 'editions'>): boolean {
  return raceFinish(race) !== null && race.status !== 2 && race.status !== 4 && race.status !== 5 && manifest.editions[race.edition].noComparison === 0;
}

export type RunnerListSummary = { count: number; firstYear: number; lastYear: number; best: RunnerRace | null };
export type RunnerList = {
  distance: RunnerDistance;
  /** The runner's own results at this distance, newest first: confirmed links, or the one result of a profile of one. */
  own: RunnerRace[];
  /** Possible matches at this distance, newest first: listed apart, never ticked by the site, in no figure. */
  possible: RunnerRace[];
  /** Count, span of years and fastest recorded finish of `own` alone; null without an own result. */
  summary: RunnerListSummary | null;
};

/**
 * A profile as the page lists it: marathons and half marathons apart, and in each the runner's own results apart
 * from the possible matches. Nothing is ever counted across the two distances, and no possible match enters a count,
 * a span or a best. A profile of one result is that result on its own: it is linked to nothing, so it carries no
 * link label.
 */
export function runnerLists(profile: RunnerProfile, manifest: Pick<RunnerManifest, 'editions'>): RunnerList[] {
  const year = (race: RunnerRace) => manifest.editions[race.edition].year;
  const newest = (a: RunnerRace, b: RunnerRace) => year(b) - year(a) || a.id - b.id;
  return (['marathon', 'half'] as const).map(distance => {
    const races = profile.races.filter(race => race.distance === distance);
    const own = races.filter(race => !race.possible).sort(newest), possible = races.filter(race => race.possible).sort(newest);
    const years = own.map(year), timed = own.filter(race => finishComparable(race, manifest));
    return { distance, own, possible, summary: own.length ? { count: own.length, firstYear: Math.min(...years), lastYear: Math.max(...years),
      best: timed.length ? timed.reduce((best, race) => raceFinish(race)! < raceFinish(best)! ? race : best) : null } : null };
  }).filter(list => list.own.length + list.possible.length > 0);
}
