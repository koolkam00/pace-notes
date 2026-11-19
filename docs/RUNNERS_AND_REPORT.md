# Runner search, record coverage and the race report

The contract for `/runners` (name search, runner profiles and the records that cannot be analysed) and `/report` (one past race on one page). The runner view's same-edition peers, weather and route context are in [runner comparisons and environmental context](RUNNER_CONTEXT_AND_PEERS.md). Release counts belong in the refresh records and manifests; every count here names its release and date.

**State on November 19, 2026 (branch `claude/release-20261113-lookup`, not merged, not deployed).** This document describes **runner lookup version 2**: its builder (`analysis/build_runner_lookup.py`), format (`analysis/lookup_format.py`), reference decoder and search planner (`scripts/lib/lookup.cjs`, with `scripts/lib/lookup-files.cjs` for Node scripts), verifier (`scripts/verify-lookup.cjs`) and source-side audit (`analysis/lookup_audit.py`) are in the repository and tested, and the one final build of the release is imported in `public/data/runners` (schema 2; the version 1 files are removed in the same commit). The browser client (`lib/runner-search.ts`, `components/RunnerSearch.tsx`) is ported on its own branch; version 1's contract is kept word for word under [History](#history). The sections [Copy editions](#copy-editions) and [Race report](#race-report) describe pages that are unchanged.

This document was assembled on October 30, 2026 from sections that moved here from the project handoff, `RUNNER_RECORD_COVERAGE.md`, `CURRENT_SITE_AND_RUNNER_SEARCH.md` and `RUNNER_CONTEXT_AND_PEERS.md`, with release-specific counts and branch states left in their dated originals under [docs/history](history/README.md).

Sections: [runner search](#runner-search) · [the files](#the-files) · [reading the lookup in the browser](#reading-the-lookup-in-the-browser) · [the rules, in words](#the-rules-in-words) · [record coverage](#record-coverage) · [what a request reveals](#what-a-request-reveals) · [limits](#limits) · [build, verify, import](#build-verify-import) · [verification](#verification) · [copy editions](#copy-editions) · [race report](#race-report) · [history](#history)

## Runner search

`/runners` searches the recorded names of the adopted release and lets a visitor open a runner's results and choose which belong to them. Since lookup version 2 (lead decisions D10 and D24 of the adoption of `pace-notes-marathon-half-20261113-1113`, November 14, 2026):

- **Both distances.** Every named marathon and half-marathon result of the release is listed, in separate sections of a profile; nothing pools the two distances.
- **Two artefacts.** The lookup is a browser artefact only. No analysis reads it: the analyses and the Node recounts read the names-free marathon cohort (`analysis/marathon-cohort/`, format in `analysis/cohort.py`), and the lookup's manifest names the cohort manifest's SHA-256 (`cohort.manifest_sha256`), which is what the runner context binds to. A lookup rebuild never re-binds an analysis.
- **Profiles are the producer's person links, with the tier of every link.** A profile is one person of the release's person links, or one result with no link. A link is *confirmed* when it keys a runner in the pipeline's one identity file (tier high_elite, high or medium, and the person passes the sex, birth-year and one-result-per-edition screens); every other link is a *possible match*, listed apart with its tier and never joined into a profile's figures by the site. The producer links records by recorded name, sex and age or birth year; Pace Notes adds no name matching, and a profile is not a verified person.
- **Every result carries its edition's tier and split tier**, and a marathon result carries the pipeline's record status: counted (pooled figures, peers, its own pacing view), own record (its own pacing view with the tier label, no peers), or limited with a reason (recorded times only).
- **Search runs in two stages.** Stage 1: every typed word equals a word of the name. Stage 2, when stage 1 lists nothing or on request: typed words are beginnings of words (a typed word under three characters must still equal a word). A search loads at most 300 KB of index unasked and never more than 1 MB; one very common word typed alone lists the people recorded under that single word, says how many recorded names hold it, and asks for a second word.
- **Names are published by owner decision; typed text is not.** Recorded names are public research data (AGENTS rule 1). What a visitor types, and which record they open, never reaches analytics, a recording or an address (rule 18): see [what a request reveals](#what-a-request-reveals).

No name is invented, no sex or person is inferred from a name, and missing timings stay missing. Every comparison is limited to the visitor's selected results; an observed best is not necessarily a lifetime best.

## The files

```
public/data/runners/
  manifest.json              the root of the SHA-256 chain (about 20 KB)
  editions.json.gz           every edition with a listed result, once
  index/p/NN.json.gz         directory pages of 64 leaves each (NN = two digits)
  index/NNNNN.json.gz        the leaves of the name index (five digits)
  profiles/p/NN.json.gz      directory pages of 64 shards each
  profiles/XXX.json.gz       4,096 profile shards (three hex digits, 000 to fff)
```

Every file but the manifest is gzip JSON (level 9, no timestamp) of one line: UTF-8, no escaped non-ASCII, no spaces, a final newline. No file but the manifest holds the release tag, and none holds a person id or a release's race key. The manifest lists the size and SHA-256 of `editions.json.gz` and of every directory page; a page lists the size and SHA-256 of its leaves or shards. A reader checks each file against its parent before it opens it, so the manifest's own digest binds every byte. The examples below show the builder's output for a made-up release of five results (`analysis/test_runner_lookup.py` builds a larger one); every name in them is invented.

### `manifest.json`

```json
{"schema_version": 2,
 "release_tag": "pace-notes-marathon-half-20261113-1113",
 "input_as_of": "2026-11-13T19:30:55Z", "as_of": "2026-11-14T05:00:00Z",
 "provisional": [],
 "inputs": {"race_records.parquet": "<sha256>", "EDITION-TIERS.csv": "…", "qa_row_flags.parquet": "…", "pending_review_flags.parquet": "…",
            "edition_meta.parquet": "…", "MANIFEST.json": "…", "person-ids-v5.1-race_results_linked.parquet": "…",
            "record-status.parquet": "…", "identity.parquet": "…", "race-registry.json": "…", "edition-policy.json": "…",
            "race-notes.json": "…", "half-race-registry.json": "…", "half-policy.json": "…",
            "lookup-half-records.json": "…", "lookup-placeholders.json": "…", "lookup-timing.json": "…"},
 "scripts": {"build_runner_lookup.py": "<sha256>", "lookup_format.py": "…", "lookup_names.py": "…", "lookup_races.py": "…", "race_registry.py": "…"},
 "cohort": {"manifest_sha256": "…", "release_tag": "…", "as_of": "…", "input_as_of": "…", "raw_records": 0, "eligible_records": 0, "own_record_records": 0, "editions": 233},
 "pipeline": {"input_manifest_sha256": "…", "policy_sha256": "…", "record_status": {"records": 0, "by_status": {"counted": 0, "limited": 0, "own_record": 0}}},
 "time_unit_ms": 1000,
 "points_km": {"marathon": [5, 10, 15, 20, 25, 30, 35, 40, 42.195], "half": [5, 10, 15, 20, 21.0975]},
 "counts": {
   "marathon": {"release_rows": 0, "left_out": {"rows": 0, "by_flag": {"finish_ge_24h": 0, "…": 0}},
                "set_aside": {"rows": 0, "editions": [["<label>", 2013, 0]]}, "unnamed": 0,
                "placeholder": {"flagged": 0, "listed": 0}, "results": 0, "no_finish": 0, "finish_unread": 0, "editions": 0,
                "unlisted_editions": [["m", "<label>", 2025, "f", 0]],
                "tier": {"0": 0, "1": 0, "2": 0, "3": 0, "4": 0}, "link": {"0": 0, "1": 0, "…": 0}, "screen": {"1": 0}, "age_hidden": 0, "checkpoints_unread": 0,
                "status": {"0": 0, "1": 0, "3": 0, "4": 0, "5": 0, "6": 0}, "unlisted_status": {"0": 0, "…": 0}},
   "half": {"…": 0, "no_comparison": {"1": 0, "2": 0}},
   "results": 0, "profiles": 0,
   "profiles_by_kind": {"one_result": 0, "confirmed_only": 0, "confirmed_and_possible": 0, "possible_only": 0},
   "names": 0, "search_names": 0, "index_rows": 0, "heavy_words": 0},
 "rules": {"normalization": "…", "fold": {"ł": "l", "ø": "o", "đ": "d", "ð": "d", "ß": "ss", "æ": "ae", "œ": "oe", "þ": "th", "ı": "i"},
           "search_words": "…", "search_names": "…", "results": "…", "left_out": {"marathon": "…", "half": "…"}, "placeholders": "…", "identity": "…",
           "profiles": "…", "status": {"0": "…"}, "no_comparison": {"0": "none", "1": "gross (gun) times", "2": "course suspected short"},
           "sex": "…", "age": "…", "times": "…", "half_races": "…",
           "index": {"target_rows": 6000, "max_rows": 8000, "min_rows": 2000, "heavy_over": 6000, "order": "code point"},
           "search": {"auto_bytes": 300000, "hard_cap_bytes": 1000000}},
 "content": {"profiles_raw_sha256": "…", "index_raw_sha256": "…", "editions_raw_sha256": "…", "names_normalized_sha256": "…"},
 "editions": {"file": "editions.json.gz", "bytes": 360, "sha256": "<sha256>", "count": 5, "races": 4,
              "timing": [[null, 4, 1], ["chip", 0, 2], ["chip (clock if no chip)", 1, 1], ["gross (gun / Brutto; the source net column was not loaded)", 2, 1]]},
 "index": {"leaves": 2, "pages": [["", "", 0, 165, "2f20…1bec"]], "heavy": [["david", 89438], ["de", 70022]]},
 "profiles": {"shards": 4096, "pages": [[184, "0828…2df2"], [142, "2f08…aca3"], "… 64 in all"]}}
```

- `provisional` names what a development build did not read as the final build must: `cohort`, `edition_policy`, `race_notes` and `half_policy` (no such file was read), `half_registry` (half races named by the default rule), `race_registry` (a registry other than the checked-in one), and `identity` or `record-status` (a pipeline file that marks itself a stand-in). A build with a non-empty list cannot be imported.
- `cohort.manifest_sha256` is the SHA-256 of `analysis/marathon-cohort/manifest.json`: what the runner view compares with the context manifest. The builder refuses a cohort that was not cut from the same `record-status.parquet` and `identity.parquet`. `pipeline` repeats the status file's own description, so the counts can be reconciled without it.
- `content` holds the SHA-256 of the uncompressed bodies in file order (profile shards 000 to fff; leaves 00000 up; the editions file) and of the normalised form of every recorded name in shard order, each followed by a newline. Two builds on different zlib versions differ in gzip bytes and agree on these.
- `editions.timing` is the part of the reviewed table `analysis/lookup-timing.json` this build used: `[text, class digit, editions]` for each timing-basis text the release states for a listed edition (`null` where it states none, class `not_stated`), so a page never needs the release's text. The table is a copy of the site's tier module (`lib/tiers.ts`, `TIMING_BASES`); the verifier holds the copy to the module entry for entry, requires `timingClass(text)` of every row here to be the row's class, and recounts the editions of each class from `tb`, so a build and the pages cannot class a text differently.
- `counts.<distance>.screen` counts the results whose link is `b`, `c` or `d` by the screen their person failed (`w`).
- `index.pages[p]` is `[word, partner, c, bytes, sha256]`: the directory key of the page's first leaf, then the page file's size and digest. `index.heavy` lists, in code point order, every word that more than `heavy_over` search names contain, with that number. `profiles.pages[p]` is `[bytes, sha256]`.
- `left_out` and `set_aside` are the two counts of rows the lookup does not list by a ruling: the rows the pipeline leaves out, with the flags they carry, and the kept rows of the editions the race directory sets aside, edition by edition. `finish_unread` counts the listed results whose finish text is not a time (they are among `no_finish`).
- Every count is recounted by the verifier from the files; the counts of rows that are *not* in the files (`left_out`, `set_aside`, `unnamed`, `placeholder`, `unlisted_status`) and `finish_unread` are recounted from the release by the audit.

### `editions.json.gz`

One entry per edition with a listed result, as columns. The position is the edition index used everywhere else. Editions are ordered by distance (marathon first), race label, year, source database (`f` before `h`), strings by code point; that tuple is unique.

```json
{"v":2,
 "races":[["m","Amsterdam","Amsterdam Marathon"],["m","Hilltown Marathon","Hilltown Marathon"],["h","Berlin","Berlin"],["h","Lakeside Half Marathon","Lakeside Half Marathon"]],
 "sr":[0,0,1,2,3], "y":[2012,2013,2015,2019,2021],
 "t":"01434", "sp":"10100", "db":"fffhh", "g":"00010", "tb":"00124",
 "q":[2004,2019,3523,8611,3523], "cx":[-1,-1,-1,-1,-1], "rs":[-1,0,1,-1,-1], "nl":[0,0,0,0,0],
 "reasons":["Finish times only: fewer than half of this edition’s records have any checkpoint time, so it supplies no pacing statistic.",
            "Unverified: no independent count of this edition’s finishers exists, so it supplies no pooled statistic."]}
```

| Field | Meaning |
| --- | --- |
| `races` | `[distance letter, label, display name]` of each race. A marathon label is the race registry's `label`, which is the pipeline's `city` (so it equals the cohort's and every pack's), and the display name is the registry's `name` (`analysis/race-registry.json`). A half race comes from the half registry when one exists; until then, and for any key it lacks, from the default rule in [the rules](#the-rules-in-words). A label is unique within its distance |
| `sr`, `y` | race index and year of the edition |
| `t` | tier digit: `0` stamped, `1` stamped_weaker_source, `2` partial, `3` held_for_review, `4` unverified (from the release's `EDITION-TIERS.csv`) |
| `sp` | `1` when the split tier is `splits`, `0` for finish times only |
| `db` | `f` or `h`: the source database of the edition's record ids (`f` is the marathon database, which also holds eight half editions) |
| `g` | never-compared mark, half editions only: `0` none, `1` gross (gun) times, `2` course suspected short. A marked edition's results are listed and never enter a comparison, a best, a ranking or an average |
| `tb` | the class of the timing basis the release states for the edition, either distance: `0` chip, `1` chip_fallback (chip or net time where the source has one, else gun or clock time), `2` gun (gun or gross time), `3` mixed (gun splits with a net finish), `4` not_stated ("as published", or no value). The classes are the tier module's (`lib/tiers.ts`, lead decision D39): the page shows "Gun times" for class `2` and nothing for the others, and never needs the release's text. Every edition marked `g = 1` is of class `2`; class `2` alone does not stop a comparison (15 marathon and 29 half editions of this release are gun-timed; only the five marked half editions are never compared) |
| `q` | the edition's lowest listed record id divided by 256, rounded down; a result stores its id minus `256·q` |
| `cx` | marathon editions: the edition's index in the cohort manifest's `editions` (the editions that have a cohort file: counted, or with an own-record view), which keys the runner-context files; `-1` for a marathon edition of recorded times only, and for half editions |
| `rs`, `reasons` | marathon editions the edition policy does not count: the index of the edition's sentence in `reasons`, the visitor-facing text of `public/data/edition-policy.json`; `-1` for a counted edition and for half editions |
| `nl` | how many of the edition's kept rows are not listed (no usable name, or a placeholder name) |

Reading the example: edition 1 is Amsterdam 2013, a weaker-source stamp with finish times only, chip-timed, not counted for the first reason; edition 2 states chip time with a fallback; edition 3 is the Berlin half marathon of 2019, held for review, finish times only, gun-timed and never compared; edition 4 states no timing basis.

### Profile shards

`profiles/XXX.json.gz` holds whole profiles as columns. A person's shard is the first three hex digits of the person id after its prefix; a result with no link is in the shard named by the first three hex digits of `sha256("f:<record id>")` or `sha256("h:<record id>")`. Inside a shard, persons come first in id order, then results with no link by database (`f` before `h`) and record id; the position in that order is the profile's number in the shard. No person id is published.

```json
{"v":2, "k":[3], "u":[2],
 "n":["Example, Ana (ESP)","Ana Example-Sample"],
 "e":[0,1,3], "i":[8,224,104], "f":[12658,12240,5730],
 "x":"FF-", "a":[34,35,-1], "c":"225", "w":"000", "j":[0,0,1], "s":"06-",
 "m":[255,0,5],
 "d":[1500,1490,1495,1502,1510,1530,1580,1620, 1340,2700]}
```

| Field | Per | Meaning |
| --- | --- | --- |
| `k`, `u` | profile | number of results, number of distinct recorded names |
| `n` | name | the profile's recorded names, in order of first use |
| `e` | result | edition index |
| `i` | result | record id minus `256·q[e]`. A result is identified by its source database `db[e]` and its record id; the id alone repeats across the two databases |
| `f` | result | finish in units of `time_unit_ms` (whole seconds); `-1` when no finish time was recorded, or when the recorded text is not a time greater than zero |
| `x` | result | `M`, `F`, `X` or `-`: the published sex, or the published category's when that is blank; never from a name |
| `a` | result | recorded age; `-1` when none was recorded or the release flags it as implausible |
| `c` | result | link code: `0` no link; `1` high_elite, `2` high, `3` medium: confirmed; `4` medium_variant, `5` low, `6` low_noage, `7` low_noage_series, `8` low_nosex, `9` low_city_pace, `a` low_carryover: possible match; `b`, `c`, `d`: tier 1, 2, 3 whose person fails a screen, shown as possible match. The letter names the tier, not the screen: `w` names the screen |
| `w` | result | the screen a person of a confirmed tier failed, for a result whose link is `b`, `c` or `d`: `1` birth_year_spread (recorded birth years differ), `2` sex_conflict (recorded sexes differ), `3` two_results_in_one_edition; `0` on every other result. It is the identity file's `not_keyed_reason` (lead ruling, November 19, 2026). In `pace-notes-marathon-half-20261113-1113` only `1` occurs |
| `j` | result | which of the profile's names the result was recorded under |
| `s` | result | marathon record status: `0` counted; `1` own record; limited, recorded times only: `2` duplicate of another record, `3` a checkpoint or the finish is missing, `4` times not in order, `5` outside the timing bounds, `6` its edition gives recorded times only. `-` for a half result |
| `m` | result | bit *i* set = checkpoint *i* recorded: marathon 5, 10, 15, 20, 25, 30, 35, 40 km are bits 0 to 7; half 5, 10, 15, 20 km are bits 0 to 3 |
| `d` | recorded checkpoint | the time, in units, from the previous recorded checkpoint of the same result, or from the start; it can be negative when the recorded times are out of order |

A profile's results are ordered by marathon before half, year, record id, database. Reading the example: one profile with three results and two names. The first result is edition 0 (Amsterdam 2012), record `256·2004 + 8 = 513032`, finish 12,658 s (3:30:58), F, 34, link `2` (high, confirmed), name 0, status `0` (counted), all eight checkpoints: 5 km at 1,500 s, 10 km at 2,990 s, and so on to 40 km at 12,227 s. The second is in a finish-times-only edition: no checkpoint, status `6`. The third is a half marathon with a `low` link, a possible match, recorded as "Ana Example-Sample", with 5 km at 1,340 s and 15 km at 4,040 s (mask 5).

`profiles/p/NN.json.gz` is `{"v":2,"first":64·NN,"shards":[[profiles, results, bytes, sha256], … 64]}`.

### The name index

**Search words** of a recorded name: when the name ends with a bracketed code of two or three capital ASCII letters (the pattern `\s*\(([A-Z]{2,3})\)$`, as in "Smith, José (GBR)"), drop that part; normalise; split on spaces; keep the distinct words in code point order. A name whose words would then be empty keeps the code as its word. "Smith, José (GBR)" gives `jose`, `smith`.

**Normalisation**, in this order: Unicode NFKD; remove every code point whose general category starts with M; lower case; the fold table (`ł→l ø→o đ→d ð→d ß→ss æ→ae œ→oe þ→th ı→i`); every run of code points that are neither letters nor numbers becomes one space; trim. Typed queries are normalised the same way.

**Search names.** One per profile and set of search words. Its shown spelling is the recorded name of the profile's latest result with that set (latest year, then marathon before half, lowest record id, database `f` before `h`).

**Postings.** A word is *heavy* when more than 6,000 search names contain it (`index.heavy`). A search name gives one posting `(word, "")` for each of its light words, and for each of its heavy words one posting `(word, partner)` for every other word of the name, or `(word, "")` when the name has no other word. All postings are sorted by word, partner, shown name, shard, position (strings by code point) and cut into leaves:

- a light word's postings are never split: the open leaf is closed first when the word would take it past 8,000 rows, or past 6,000 when it already holds 2,000;
- inside a heavy word whole `(word, partner)` groups are added and the leaf is closed when it reaches 6,000 rows; a group is split only when it cannot fit (an open leaf under 2,000 rows meeting a group that would pass 8,000, or a group over 8,000), and is then cut where the leaf reaches 6,000;
- a last leaf under 2,000 rows is joined to the one before it.

So every leaf holds 2,000 to 9,999 rows.

**Leaf** `index/NNNNN.json.gz`, columns of equal length, one entry per posting:

```json
{"v":2,
 "n":["Ana Example-Sample","Example, Ana (ESP)","Bo Example","Ana Example-Sample","Bo Example","Example, Ana (ESP)"],
 "b":[0,0,1039,0,1039,0], "o":[0,0,0,0,0,0],
 "e":[3,-1,4,3,4,-1], "y":[0,2012,0,0,0,2012], "s":[0,1,0,0,0,1],
 "m":[0,2,0,0,0,2], "h":[0,0,0,0,0,0], "q":[0,1,0,0,0,1], "p":[1,0,0,1,0,0]}
```

| Field | Meaning |
| --- | --- |
| `n` | the search name's shown spelling (the search words are derived from it; the word and partner it is filed under are not stored) |
| `b`, `o` | the profile: shard number 0 to 4095 and position in that shard |
| `p` | `1` when this spelling occurs only on possible-match results of a profile that has confirmed ones: the row then describes those results only. Otherwise `0` and the row describes the whole profile |
| `e` | when the row describes exactly one result, its edition index (the row then reads as that race); otherwise `-1` |
| `y`, `s` | first year and span in years of the results described: of the profile's confirmed results when it has any, else of all its results; of the spelling's results when `p` is 1; both `0` when `e` is set |
| `m`, `h`, `q` | the profile's confirmed marathons, confirmed half marathons and possible-match results; for a `p` row `0`, `0` and the number of results under the spelling; all `0` when `e` is set |

The first row is the spelling "Ana Example-Sample", recorded only on a possible match of a profile with confirmed results: it reads as that one race, edition 3, marked possible. The second reads "Ana Example · ESP: 2 marathons, 2012 to 2013, 1 possible". The third is a result with no link: its one race, edition 4. A row for a profile with no confirmed result has `m + h = 0` and `q` counts its results. A search name appears once per posting, so the same row can come back from two leaves or twice from one: a reader keeps one per `(b, o, n)`.

**Directory page** `index/p/NN.json.gz`:

```json
{"v":2,"first":0,"leaves":[["","",0,6,158,"a562…9977"],["s","",0,3,116,"92d6…6f85"]]}
```

Each entry is `[word, partner, c, rows, bytes, sha256]`; `[word, partner, c]` is the leaf's *key*:

- the first leaf's key is `["", "", 0]`;
- a leaf that starts a new word has partner `""` and, as its word, the shortest beginning of that word that still sorts after the last word of the leaf before it (above, the second leaf starts at the word `sam` after `example`, so `s`);
- a leaf that starts inside a heavy word has that word and the shortest beginning of its first partner that sorts after the last partner before it;
- a leaf that starts inside a `(word, partner)` group has that word and partner and `c = 1`.

So a directory holds heavy words and short beginnings; a key's word may be no word at all. With `[w0, o0, c0]` a leaf's key and `[w1, o1, c1]` the next leaf's, **a leaf holds**:

- every posting of each word strictly between `w0` and `w1`;
- the postings of `w0` with partner from `o0` on: up to `o1` when `w1 = w0` (`o1` itself too when `c1 = 1`), else to the end of the word;
- when `w1 ≠ w0` and the next leaf starts inside its word (`o1 ≠ ""` or `c1 = 1`): the postings of `w1` with partner below `o1` (`o1` itself too when `c1 = 1`).

## Reading the lookup in the browser

Everything a client needs is in `scripts/lib/lookup.cjs`: about 330 lines with no dependency and no Node API, written to be ported line for line into `lib/runner-search.ts`. The verifier runs that module against every search name of a build, so a port that keeps its logic keeps its guarantees. A Node script (a verifier's name guard, a browser scenario choosing what to type) reads a build through `scripts/lib/lookup-files.cjs`: `openLookup(dir)` gives `search(query, stage)`, `nameExists(text)` (some search name has exactly the text's search words) and `profile(shard, position)`, each file checked against the chain. The functions of `lookup.cjs`, in the order a visit uses them:

**1. Load and check.**
- Fetch `manifest.json` (with `?v=<release tag>` as today). Require `schema_version` 2, the pinned `release_tag`, `time_unit_ms` 1000 and the `points_km` above. Refuse to offer anything when `provisional` is not empty on a published site.
- For every other file: fetch it, compare its byte length and SHA-256 with its parent's entry, and only then gunzip (`DecompressionStream('gzip')`) and parse. Parents: `manifest.editions` for the editions file; `manifest.index.pages[p]` (`[…, bytes, sha256]`) for `index/p/NN`; `manifest.profiles.pages[p]` for `profiles/p/NN`; a page's entry for a leaf or shard.
- `decodeEditions(data)` turns the editions columns into one object per edition: `{index, distance, city (the label), race (the display name), year, tier, splits, db, noComparison, timing, q, context, reason, unlisted}`; `timing` is one of `TIMING_CLASSES` (`chip`, `chip_fallback`, `gun`, `mixed`, `not_stated`).
- Every address is built from numbers and hex digits that come from the manifest and the pages (`leafPath`, `indexPagePath`, `shardPath`, `profilePagePath`). Nothing typed, no name and no record id may be put in an address.

**2. Search.**
1. `tokens = queryTokens(query, stage)`: the normalised typed words, repeats removed; in stage 2 a token of three or more characters that begins another token is dropped.
2. `indexPagesFor(tokens, stage, manifest.index)` names the directory pages to load (usually one per token, about 4 KB each); load and check them.
3. `plan = planSearch(tokens, stage, manifest.index, pages)` returns `{leaves, bytes, rows, primary, partner, alone, names}`: the cheapest set of leaves that holds every name the tokens match. It tries every token as the *primary*, alone and with each other token as its *partner*, and keeps the choice with the fewest bytes. For a primary token `t` (and a partner `u`), with `[w0, o0, c0]` a leaf's key and `[w1, o1, c1]` the next leaf's, the leaf is needed when
   - (a) a word strictly between `w0` and `w1` could match `t`: `w0 < t < w1` when `t` must equal the word; when `t` is a beginning, `w0 < t < w1`, or `w0` begins with `t` and `w1 ≠ w0`; or
   - (b) `w0` matches `t`, and `w0` is not heavy, or there is no partner, or a word matching `u` can lie in the leaf's partners of `w0` (from `o0`; below `o1` when `w1 = w0`, or up to it when `c1 = 1`); or
   - (c) `w1 ≠ w0`, the next leaf starts inside its word (`o1 ≠ ""` or `c1 = 1`), `w1` matches `t`, and `w1` is not heavy, or there is no partner, or a word matching `u` can lie below `o1` (or up to it when `c1 = 1`).

   "Matches" is equality in stage 1 and for any token under three characters, "begins with" otherwise. One heavy word typed alone in stage 1 is planned with the partner `""` and `plan.alone` is set: the plan then covers only the names whose single search word it is, and `plan.names` is the number of search names that hold the word.
4. Apply the limits to `plan.bytes`: up to `SEARCH_AUTO` (300,000) load; up to `SEARCH_HARD_CAP` (1,000,000) only on a press; above it never.
5. Load and check each leaf of `plan.leaves`; for each row, `rowMatches(searchWords(row.n), tokens, stage, plan)` keeps it. Keep one row per `(b, o, n)`.
6. Stage 1 first. When it lists nothing, plan stage 2 under the same limits (leaves already loaded count once). When it lists something, stage 2 is offered and never loaded unasked.

All comparisons of words, partners and keys use `compareCodePoints`: JavaScript's `<` and `localeCompare` order UTF-16 units or a locale and would misplace astral characters. The order of the listed rows on the page is the page's own choice.

**3. Open a profile.** A row's `b` and `o` name it. Load `profiles/p/⌊b/64⌋` (checked against `manifest.profiles.pages`), take the entry `b mod 64` (`[profiles, results, bytes, sha256]`), load `profiles/<b as three hex digits>` and call `decodeShard(data, editions, o)`. It returns `{names, results}` with, per result: `edition`, `db`, `id` (the record id), `key` (`db + id`, unique across both distances; a marathon id alone is unique among marathons), `distance`, `finish` (seconds or null), `sex` (or null), `age` (or null), `link`, `confirmed`, `screen` (null unless `link` is `b`, `c` or `d`; then `birth_year_spread`, `sex_conflict` or `two_results_in_one_edition`), `status` (or null for a half), `name`, `mask`, and `times`: the cumulative seconds at the distance's points with null where nothing was recorded, the last being the finish.

**4. What to show.** The words are the site's (lead decision D16); the codes say which apply.
- Confirmed results (`link` 1 to 3) by distance, each with its edition's tier (`tier`, `splits`) and its link tier as quiet text; possible matches (`link` 4 to d) in a list apart, each marked, never ticked by the site (a visitor may tick one into their own selection). A possible match of link `b`, `c` or `d` says why it is not confirmed from its `screen`, in the tier module's words (lead decision D39: "recorded ages differ" for `birth_year_spread`).
- A marathon result's `status`: `0` everything; `1` its own pacing view with the tier label, no peers, weather or edition context; `2` to `6` recorded times only, with the reason: `2` "Duplicate of another recorded race; excluded from analysis.", `3` "One or more checkpoint times are missing or could not be parsed.", `4` "Checkpoint times are not strictly increasing.", `5` "Finish or section pace falls outside the study quality bounds.", `6` (and `1`) the edition's own sentence (`reason`). `finish === null` reads "No finish time recorded" whatever the status.
- An edition whose `timing` is `gun` carries the tier module's "Gun times" words, at either distance. An edition with `noComparison` 1 (gross times) or 2 (course suspected short) is listed and compared with nothing.
- The runner context of a counted marathon result is keyed by `editions[e].context`, the cohort's edition index (the context manifest maps it to a file; an index it does not list means no comparison for that edition). The context manifest's `runner_manifest_sha256` is compared with `manifest.cohort.manifest_sha256`.

## The pages: what a visitor sees (lookup version 2)

Written for the adoption of `pace-notes-marathon-half-20261113-1113` (November 19, 2026). The client is `lib/runner-search.ts` (the reference reader ported line for line, then loading and checking); the screens are `components/RunnerSearch.tsx` and `components/runner/` (`SearchResults.tsx`, `ProfileView.tsx`, `records.tsx`); the runner view is `components/RunnerContext.tsx`; the report is `components/report/`. Every tier, link and timing phrase is drawn by `components/ui/TierTag.tsx` from `lib/tiers.ts` (`verify-tiers` fails a phrase typed anywhere else).

- **Search.** One box for both distances. Whole words first; names that start with the typed words when nothing matches, or after a press. A step over `SEARCH_AUTO` waits for a press that states its size ("List them (412 KB)"); nothing over `SEARCH_HARD_CAP` is loaded ("Too many recorded names match to list. Add another name."); one very common word alone says how many recorded names hold it and asks for a first name or a surname. A row says what it is: "4 marathons · 1 half marathon · 2016–2023 · 3 possible matches", "Valencia 2023 · marathon", "2 results that may belong together · 2011–2014". With no match: fixed links only (finish-time context, the split check, a request, `/courses`, `/half`), never the typed text.
- **Profile.** The heading is the name forms of the runner's own results (a group with no result of its own takes the searched spelling and says "results that may belong together"). Then **Marathons** and **Half marathons**, each with its own summary line ("4 results · 2016–2023 · fastest recorded finish 3:20:26, Valencia 2023") from that list's own results: never a statistic over both distances and never a possible match.
- **A row.** Race and year, the recorded finish, then the edition's labels on every row (the Verified badge too; "Finish times only" where the edition has no splits; "Gun times" where its timing class `tb` is `gun`), a short tag for an exception ("Limited: missing checkpoints", "Recorded times only"), and the link's words where they apply.
- **The key line and the link words.** Above each list of the runner's own results one line says what a row holds and the link confidence the rows leave unsaid: "Each row: race, finish and its results label. Link confidence: High for every race." (or "High unless the row says otherwise.", or "is shown on each row." when no row is High); "results" and "Link confidence" link to `/methodology#edition-tiers` and `#link-confidence`. A row of the runner's own results shows its link words only when they are not "High" ("High, elite", "Medium"), so every confirmed tier is on the page and a profile of High links stays quiet. A profile of one result shows no link at all.
- **Possible matches**, per distance, under their own heading, never ticked by the page: each row carries the "Possible match" pill and its confidence words always, and a confirmed tier whose person failed a screen (link `b`, `c`, `d`) states that result's own screen from `w` ("High · recorded ages differ"). A visitor may tick one; the selection bar and the analysis then say it includes a possible match they selected. Nothing the site computes joins one.
- **What each result offers** (lead decision D20). A counted marathon (status 0): pacing, similar runners, conditions and the race report. An own-record marathon (status 1): its own pacing with its edition's labels and "Its own pacing only: this race is compared with no other finishes."; no similar-runners or conditions tab and no report button. Statuses 2 to 6: recorded times, a short tag and, in "Recorded details", the lookup's sentence. A half: its finish and labels; a never-compared edition says "This edition’s times are not compared with other races." Nothing promises a half report.
- **The runner context** is fetched only for counted races whose edition the context manifest lists, by the lookup's `editions[e].context`; `lib/runner-context.ts` checks the context manifest's `cohort_manifest_sha256` (and its compatibility name `runner_manifest_sha256`, the same value) against the lookup's `cohort.manifest_sha256`, the release, both times, the cohort's counts and `totals.eligible`. An unlisted edition says "No comparison is available for this edition." (D24.8).
- **The report from a record** shows the edition's tier in its kicker (`TierTag`), in the image's kicker ("RACE REPORT · VERIFIED") and in its alternative text; a typed report has none. Under the comparison, one line of year context from the linked-records family where it reads that edition: "<Race> <year> was a slow year for linked runners (records linked by name)." (or "a fast year", "a usual year") The verdicts come from `lib/linked-server.ts` `linkedEditionReading` under the family's own guard, computed in `app/runners/page.tsx` at build time into a compact table (label, year, verdict code, reviewed; the words passed once per code, `lib/report-year.ts`); the client only picks the selected edition's row, prints nothing for an edition without one, links the words to the family's story with the handoff marker, and links "Released after review" to `/methodology#linked-reviews` for an edition a review released. Never in the image or a link.
- **Privacy.** The record keys (`f123`, `h123`), the typed text and names stay in the page: requests are built from manifest numbers and hex digits only, events carry `{}` or bands, the search, profile, selection and analysis regions carry `ph-no-capture`, and `/runners`, `/report` and `/your-race` are never recorded (S2 types both key forms).

## The rules, in words

Written so that a stranger can recount a build from the release, the pipeline's two files and the three checked-in lists. Each is also in the manifest's `rules`.

1. **A result** is one row of the release's `race_records`, keyed by its source database and record id.
2. **Rows that never appear.** The pipeline's two files say which; the builder applies no row rule of its own (lead ruling of November 14, 2026: the rows left out are read from those files and never from a second list). Marathon: every row that is absent from `record-status.parquet`, that is, the rows the adapted marathon input leaves out: a pending-review flag `wheelchair_handcycle_published_category`, `sportstats_nonfinish_status` or `philadelphia_2010_place_sequence_outlier`, or a row-quality flag `finish_faster_than_world_record`, `finish_ge_24h`, `finish_zero` or `finish_equals_earlier_split`, except that the two flags that describe a source's layout do not count in an edition where every row carries them, and except a reviewed row the pipeline keeps although it carries one (the three London 2026 finishes of lead decision D33). Half: every row that `identity.parquet` marks `left_out`, the half row rule the lead froze (decision D28, `HALF_ROW_RULE`): the marathon rule's flags, the pending-review flag `published_disqualified_status` and the row-quality flag `finish_implausibly_fast`, with the same exception for a flag every row of an edition carries. The builder names those flags only to count the absent rows by flag. It stops when a row is absent without a flag of its distance's rule, when the two files disagree on a marathon row, and when the identity file's own description names other flags or another count. Nothing else about such a row is written: no label, no category, no count by person.
3. **Rows that are kept and not listed.** Every kept row of a marathon edition that `analysis/race-notes.json` sets aside (`set_aside_editions`, by race label and year: one race recorded under two keys or two years; lead decision D40): the edition then has no listed result and is not in the editions file. Then a row whose name has no search word (no letter or number), a row the producer flags as a placeholder name (`unlinked_reason = placeholder_name` in the person-links file), and a row whose set of search words equals that of a name on the reviewed list `analysis/lookup-placeholders.json` (names that say they are not a person's: "Anonymous Anonymous", "Late Entry", "Zawodnik Anonimowy"). All of them stay in the release and in the cohort's counts; the manifest counts each kind, and a row is counted under the first that applies.
4. **Sex** is the published sex, or the published category's (`qa_row_flags.sex_from_category`) when that is blank. **Age** is the recorded age unless the release flags it `age_implausible`. **Times** are whole seconds; a checkpoint whose text is not `H:MM:SS` is not recorded (the manifest counts them). A finish text that is not a time greater than zero is not recorded either: a kept half row is listed with no finish time (lead ruling of November 14, 2026, for the six half rows of this release whose finish is a negative text and that no flag leaves out: no time shown, never the text, no figure, no comparison; `finish_unread` counts them), and a kept marathon row with such a text stops the build, because nobody has ruled on one.
5. **Editions** are the release's (distance, source database, race key, year) with a listed result; the tier and split tier are `EDITION-TIERS.csv`'s; the timing class is that of the edition's `timing_basis` text in the release's `edition_meta`, through the reviewed table `analysis/lookup-timing.json` (39 texts and no text in this release, `manifest.editions.timing`; a text that is not in the table stops the build; an edition with no `timing_basis`, or, as for 12 half editions of this release, no `edition_meta` row of its own distance and database, is `not_stated`); the race is the registry's. **Half race names without a registry entry:** a key with no ": " is its own label and name; a composite key's name is the part after the first ": " (entities decoded, a trailing year removed, an all-capitals title re-cased: `race_registry.display_name`) and its label is that name, with its place in brackets and then the first year it has a kept row added where two half labels would give one slug. No race name is read from result rows.
6. **Never compared** is the half policy's list (`never_compared.editions` of the policy `analysis/half-release.json` names, `analysis/half-policy-20261113-1113.json`; lead ruling, November 19, 2026): reason `gun_times` is code 1, `course_suspected_short` code 2. The builder's own reviewed list (`analysis/lookup-half-records.json`) is the check: the half editions whose `timing_basis` in the release's `edition_meta` starts with "gross" (the five Berlin editions 2018, 2019, 2021, 2022, 2023) and the half editions every row of which the person-links file flags `course_shortened_suspect` (Drammen Half 2017 and 2019) must each be on the policy's list with that reason, or the build stops; an edition the policy adds is marked too. Without a half policy the build is provisional (`half_policy`).
7. **Profiles and links** as in [runner search](#runner-search) and the `c` codes above: the profile is the release's `person_id`, the code is the release's `confidence`, and a tier 1 to 3 is confirmed exactly when `identity.parquet` gives the row a `runner_key`. A person's confirmed tiers are all keyed or none (a screen applies to a whole person). A result of a confirmed tier without a key carries its row's `not_keyed_reason` as `w`; a reason other than the three screens stops the build.
8. **Status** is `record-status.parquet`'s, mapped: `counted` → 0, `own_record` → 1, `limited` with `duplicate` → 2, `missing_checkpoints` → 3, `times_out_of_order` → 4, `outside_bounds` → 5, and with `finish_time_only`, `held_for_review`, `invalid_split_grid` or `reviewed_exception` → 6. So a counted edition holds statuses 0 and 2 to 5, an own-record edition 1 and 2 to 5, and an edition of recorded times only 6.
9. **Search names, postings, leaves and keys** as in [the name index](#the-name-index).

## Record coverage

What the lookup lists and what it does not, counted on the final build of `pace-notes-marathon-half-20261113-1113` in `public/data/runners` (built November 19, 2026; provisional: none; every input is the committed final one: status and identity files of the final inputs (99d760bed), the race registry, the half race registry, the half policy, the race notes, the edition policy and the cohort manifest of the checkout). The manifest of a build carries the same counts.

| Rows of `pace-notes-marathon-half-20261113-1113` | Marathon | Half marathon |
| --- | ---: | ---: |
| In the release | 7,822,422 | 7,893,466 |
| Never appear (rule 2) | 1,980 | 951 |
| Kept, in an edition set aside (rule 3) | 847 | 0 |
| Kept, no usable name | 2,515 | 1,696 |
| Kept, a placeholder name the producer flags | 1,524 | 17,530 |
| Kept, a placeholder name on the reviewed list | 1,214 | 3,405 |
| **Listed results** | **7,814,342** | **7,869,884** |
| of which no finish time recorded | 12,889 | 6 |
| of which the finish text is not a time | 0 | 6 |
| Editions with a listed result | 2,683 | 9,595 |

Editions set aside: 45th GMAA Green Mtn. Marathon & Half Marathon 2015 (216 rows); Maratona SDAM 2013 (631 rows). Rows left out, by flag (a row can carry two): marathon `finish_equals_earlier_split` 120, `finish_faster_than_world_record` 156, `finish_ge_24h` 281, `finish_zero` 12, `philadelphia_2010_place_sequence_outlier` 7, `sportstats_nonfinish_status` 1,385, `wheelchair_handcycle_published_category` 32; half `finish_equals_earlier_split` 28, `finish_faster_than_world_record` 221, `finish_ge_24h` 361, `finish_implausibly_fast` 62, `finish_zero` 30, `published_disqualified_status` 15, `wheelchair_handcycle_published_category` 257.

The 15,684,226 listed results form 8,103,113 profiles: 5,315,997 of one result, 1,690,104 of two or more with every link confirmed, 624,858 with confirmed results and possible matches, and 472,154 of two or more with possible matches only. They carry 10,250,603 recorded names, which give 8,346,802 search names and 20,378,666 index rows; 371 words are heavy.

| Link code of a listed result | Marathon | Half marathon |
| --- | ---: | ---: |
| `0` no link | 137,357 | 518,598 |
| `1` to `3` confirmed (high_elite, high, medium) | 6,003,658 | 4,974,010 |
| `4` to `a` possible match by tier | 1,497,354 | 2,339,245 |
| `b` to `d` a confirmed tier whose person fails a screen | 175,973 | 38,031 |

The screen of those results (`w`): `birth_year_spread` 175,973 marathon and 38,031 half; `sex_conflict` and `two_results_in_one_edition` none. Editions by timing class (`tb`): chip 2,316, chip_fallback 7,752, gun 44, mixed 4, not_stated 2,162.

Marathon results by status: counted 4,123,658; own record 218,423; limited: duplicate 0, a time missing 113,285, times not in order 10,195, outside the bounds 5,908, the edition gives recorded times only 3,342,873. Half results in editions never compared: gun times 115,047, course suspected short 1,021. Recorded ages hidden as implausible: 970 and 1,573; checkpoint texts that are not a time: 0 and 15.

These are source records, not people. A result with no usable name stays in the release and the cohort; no invented name makes it searchable. A result with no finish time is listed with the checkpoints that were recorded, reads "No finish time recorded", and enters no figure. Missing or inconsistent readings stay missing or inconsistent: no pace, best, percentile or progression is derived from a limited result.

**Never shown, in any file:** the rows of rule 2; a person id; a release race key; the release tag (outside the manifest); a label that says why a row is absent. Nobody is labelled a wheelchair or handcycle entrant, by presence or by absence: those rows are simply not in the lookup, and the manifest's counts by flag are of rows, never of people.

## What a request reveals

Every data request goes to the site's own host, and its address holds only numbers and hex digits taken from the manifest and the directory pages. Nothing typed, no name, no record id and no person id is in any address, analytics event or recording (`/runners` is never recorded; a failed request reports only its kind: [analytics](ANALYTICS.md)). What the host can still infer from the addresses:

| Request | What it shows | Who shares it (the final build of `pace-notes-marathon-half-20261113-1113`, November 19, 2026) |
| --- | --- | --- |
| `index/p/NN` | the first letters of one typed word: one of 56 ranges | about 364,000.0 postings per page |
| `index/NNNNN`, a leaf of light words | the typed word lies in that leaf's range of words | 2,000 to 9,999 postings by rule; at least 2,014 rows of at least 1,962 different profiles in the build |
| `index/NNNNN`, a leaf inside a heavy word | that word, which more than 6,000 search names hold, and a range of second words | the same floor |
| `profiles/p/NN`, `profiles/XXX` | one of 4,096 shards, set by a hash unrelated to the name | 1,829 to 2,155 profiles per shard |

A request therefore reveals more letters of a name only where thousands of recorded names share them. The verifier enforces the floors on every leaf (at least 2,000 rows and 1,500 different profiles). Robots keep `/data/runners/index/` and `/data/runners/profiles/` closed; the directory pages sit inside those folders.

## Limits

| Limit | Value | Enforced by |
| --- | --- | --- |
| Rows per leaf | 2,000 to 9,999 | builder (cutter), verifier |
| Different profiles per leaf | at least 1,500 | verifier |
| Bytes per leaf, per shard | at most 150,000 | verifier |
| A search name typed in full (stage 1) | found by its plan; never over 1 MB; at least 99.9% within 300 KB | verifier, for every search name |
| A plan over 1 MB | never loaded | client; the verifier's own reader refuses it |
| The whole lookup | at most 850 MB (lead decision D10) | verifier |

Measured on the final build (same release and date): leaves of 27 to 115 KB (median 75 KB) holding 2,014 to 7,817 rows of at least 1,962 different profiles; shards of 74 to 91 KB (median 82 KB) holding 1,829 to 2,155 profiles; directory pages of 2.4 to 3.4 KB; a manifest of 27.0 KB (13.6 KB compressed) and an editions file of 129 KB; 598.1 MB in 7,784 files. Each of the 8,346,802 search names typed in full is reached in one leaf (median 69 KB, 99.9th percentile 92 KB, largest 102 KB). The verifier's 257 sample queries stay under 1 MB (largest 985 KB), and 6 that plan over 1 MB are refused.

## Build, verify, import

```bash
# build (about 15 minutes, peak memory 3.4 GB, temporary disk up to 1.7 GB beside the output; take the heavy-job
# lock). The cohort manifest, the edition policy, the race
# registry and the race notes are read from the checkout (analysis/marathon-cohort/manifest.json, public/data/edition-policy.json,
# analysis/race-registry.json, analysis/race-notes.json); --cohort, --policy, --registry, --race-notes and --half-registry name others.
python3 -I analysis/build_runner_lookup.py --core <unpacked CORE> --links <person-ids linked parquet> \
    --status <record-status.parquet> --identity <identity.parquet> --output <dir>/runners
# audit against the release, and write the keys of the rows that must not appear (about 6 minutes; its own temporary
# folder, removed at the end, reaches about 1.2 GB)
python3 -I analysis/lookup_audit.py --core … --links … --status … --identity … --build <dir> --never-shown <dir>/never-shown.json
# verify from the files alone (about 12 minutes, peak 1.9 GB)
node scripts/verify-lookup.cjs --data-root <dir> --pipeline <dir of the pipeline's files> --never-shown <dir>/never-shown.json
# import: copies the chain's files, verifies the copy, then replaces public/data/runners
python3 -I analysis/import_runner_lookup.py --input <dir> --pipeline … --never-shown <dir>/never-shown.json
```

The builder refuses a release file whose digest is not the pin's (`analysis/release.json`, through the CORE archive's own `SHA256SUMS.txt`), an output folder that already holds a build, and anything it cannot place: an edition without a tier, a key without a race, a status or link value it does not know, a reviewed count that differs (`lookup-half-records.json`, `lookup-placeholders.json`), an edition named differently by the status file and the registry. It records the digest of every input and of its own scripts, and withdraws the build if a script changed while it ran. Every order is total, so two runs with the same Python and zlib give the same bytes; `--as-of` fixes the one field that moves. The evidence: the test "two builds give the same bytes" on the made-up release, and two builds of the real release on November 14, 2026 (builder `4b39c62e4`, the same bytes as the first builder's build, every file compared). The final build was made once, on November 19, 2026, for want of disk for a second (lead's ruling of that day); the columns added since (`tb`, `w`) are written from ordered rows like every other column.

**Disk and memory of a build.** DuckDB holds the rows under a 3 GB memory limit in a temporary database beside the output (`<output>-build-temp`). A table is dropped as soon as the next is made from it; the wide rows are joined to the names and to the editions as the statement is written, so the small side is hashed in memory and the rows stream past it; the identity file is checked against the listed results on a few columns; and the two ordered streams (results by shard, postings by word) are read one range at a time. So nothing is joined or sorted on disk. The folder is measured every two seconds: each progress line gives its size (`temp_mb`) and the last line the peaks (`peak_temp_mb`, `peak_rss_mb`). A build whose folder passes `--temp-limit-gb` (default 4) stops and says so. The folder is removed when the build ends, fails or is stopped by SIGTERM, SIGINT or SIGHUP, and a build that does not finish removes what it wrote of the output, so nothing is left behind. (Measured on November 14, 2026: the first builder kept every table and sorted on disk, 6.7 GB of temporary space; a second gave the same bytes with 4.8 GB, 3 GB of it one join that hashed the wide rows; the builder as it stands, 1.7 GB.)

A build is about 598 MB in about 7,800 files. A development build is never committed: the one final build was imported and committed on November 19, 2026, when the half registry and the half policy were frozen (lead decision D24.9). `--allow-provisional` lets the verifier pass a development build and says so in its first line; the importer never passes it.

## Verification

- **`scripts/verify-lookup.cjs`** (complete, from the published files alone; one run collects every failure): the chain and no stray file; editions in order with codes in range; every result exactly once across both distances; names that normalise to a word, are not on the reviewed placeholder list and are all used; link and status codes consistent with the result's own times, its profile and its edition; the table of timing-basis texts the build used, text by text against the tier module (`lib/tiers.ts`), `analysis/lookup-timing.json` against the module's whole table, and a marked gun-time edition of the gun class; the editions never compared against the half policy's list, by reason and year; a screen (`w`) on exactly the results of link `b`, `c` or `d`, counted by screen; every count of the manifest; **the whole index rebuilt from the profile shards** with this file's own JavaScript normalisation and compared, leaf by leaf, by count and two 256-bit accumulators, with every row in order and every directory key recomputed; the floors and sizes; **every marathon result of every cohort edition against the cohort's own record** (`scripts/lib/cohort.cjs`: status, nine times, sex, age, the cohort's runners exactly the confirmed links and each in one profile) and every edition's kept rows against the cohort's raw count; **every search name typed in full is reached by the stage-1 plan of `scripts/lib/lookup.cjs`**, none over 1 MB and at least 99.9% within 300 KB; a set of queries drawn from the build (beginnings, short words, the heaviest words alone, groups cut across leaves, non-ASCII names) returns exactly what a scan of every search name returns; no person id and no tag in any body. Normalisation parity between Python and JavaScript is proved twice on every name: by the rebuilt index and by `content.names_normalized_sha256`. `--self-test` changes a byte, swaps leaves, removes a posting, re-points a posting, breaks a directory key, a count, a result id and a name, adds a stray file and a tag, and requires each to fail. `--fixture` is for the small build of the tests only.
- **`analysis/lookup_audit.py`** (needs the release): no row that must not appear (left out by the status file or the identity file, in an edition set aside, unnamed, a placeholder) is in a shard and their counts are the manifest's; every other row of the release is in a shard once with its own name, sex, age, times, status and link code and screen (the identity file's `not_keyed_reason`), in the edition of its registry label, year, tier, split tier, timing class and never-compared mark (the half policy's list) (the release's own text through the table the build says it used; the receipt repeats the table); a finish text that is not a time is shown as no finish and counted under its own reason; a profile is exactly a person.
- **Python tests** (`analysis/test_runner_lookup.py`, `analysis/test_runner_lookup_verifier.py`): normalisation with the fold table and non-Latin names; search words; the cutter's rules and keys; a whole build of a made-up release read back (confirmed and possible links, a result with no link, the rows that never appear, the same id at both distances, statuses, a negative gap, a missing finish, an unread checkpoint, a half finish whose text is not a time); the identity file's status column, its own description and each way it can fail to fit the release; an edition set aside; two builds give the same bytes; refusal of wrong digests, counts and lists; a build that is refused, stopped or over its temporary-space limit leaves nothing behind; the cohort binding and its refusals; the Node verifier, its self-test, the Node file reader and the audit on that build; the parity fixture `scripts/lib/lookup-parity.json` in both languages.
- `npm run verify:data` runs `scripts/verify-lookup.cjs` on `public/data/runners` since the final build was imported (it reads about 600 MB and takes about 12 minutes).

## Copy editions

Added October 15, 2026, with review fixes on October 16 (pull request #62, merged as `299c282b`). An edition listed in the story manifest's `duplicate_edition_screen` largely repeats another edition's field. Under `private-export-20260912-0934`, the release adopted then, Chicago 2018 and 2019 repeated Chicago 2024, so 47,639 candidate profiles held the same finish three times, each with its own year's weather and the 2024 field as peers ([measured impact](KNOWN_ISSUES.md#chicago-2018-and-2019-measured-impact-october-15-2026)). The runner-context files are unchanged; the runner view stops presenting the copies as analysable races. Since `htw-db-2026-10-16-1652`, which loaded the real 2018 and 2019 races, the screen has been empty, and it is still empty under `private-export-20261021-1050` (`duplicate_edition_screen: []` in `public/data/insights/manifest.json`, read October 30, 2026), so no edition is treated as a copy; the rules below apply again only if a later release lists one:

- `app/runners/page.tsx` reads the list at build time with `copyEditions()` (`lib/duplicate-editions.ts`, from the verified manifest; no year or count is typed in) and passes it to `RunnerSearch`, which passes it to `RunnerContext`. The client components use the pure helpers in `lib/duplicate-editions-shared.ts`.
- A copy-edition record stays searchable and visible with its recorded names, finish and checkpoints, labelled "Recorded times only" (an eligible race carries no label in the list). In the candidate profile it also says why, as a limited record gives its reason: "This edition’s records largely repeat the Chicago 2024 field. Pacing and peer comparisons are unavailable for this record." The sticky selection panel adds no line for it.
- It is left out of the selection summary (fastest finish, eligible count, year span, year-over-year change, the eligible table) and listed with the readings-only records under `copyEditionSentence()`, shown once per copy edition (the records there drop the profile's line), for example: "Chicago 2019's records largely repeat the Chicago 2024 field (51,212 of its 51,530 finishes share all nine checkpoint times with a 2024 finish), so they are shown as recorded times only, without pacing, peer or weather comparisons." The sentence is built from the screen's counts, never its `reason` text, and never says "the same names" or "all" finishes. When nothing else selected can be analysed, the records view's header says the copies repeat another year's field (alone, or beside records that need more complete or verified data) rather than asking only for more complete data.
- `RunnerContext` gives it no focus option, no peer or weather context, no comparison with the other selected races and no row among them (`RunnerContext` drops copies before it picks the focus race), and no split-check or analysis link; its edition file is not fetched. `race_comparison_opened` counts a selection of copies as `limited`.
- With an empty screen the view is unchanged, so adopting a release without copies turns the guard off with no code change.

`verify-runner-search` and `verify-runner-context-ui` render synthetic copy-edition fixtures; the S3 browser check opens a real Chicago 2018/2019/2024 profile, found in the published shards when it runs (its name is never written down), and checks one eligible race, each sentence once, each copy's reason in the profile and no extra line in the selection panel.

## Race report

Added October 16, 2026 (pull request #66, merged as `87ad3034`). One past race on one page, to print or save as a PDF, save as a 1080 × 1350 PNG, or share. It works with or without a matched record: a quarter of name searches find none, so the split check links to it too.

**Where it shows.**
- `/report` (`app/report/page.tsx`, `components/report/ReportView.tsx`): reads `s` (the split check's nine cumulative h:mm:ss times), `course` (`<slug>|all`), `g` (`all|men|women`, only the comparison group chosen in the split check) and `via` from its own address in the browser. Without nine valid times it shows "Paste your splits" (the split check) and "Find your race" (`/runners`); without JavaScript, which it needs to read its address, its HTML shows the same two links in a `<noscript>`. The header's miles/km switch works on it, as on the tools. It ends with "Was this useful?". noindex, follow, no canonical, no structured data, no share card of its own, not in the sitemap ([SEO](SEO.md)).
- The split check: "Make a race report" in its share row, for a typed race (never the made-up example), `reportHref(times, city?)` (`lib/tools/links.ts`) plus `g` when a recorded gender is chosen. A split check opened from a runner record (`via=runner`) keeps the marker in its report link and never adds `g` (October 16, 2026, after review), so that runner's times never travel in a link without it.
- `/runners`: in the runner view, a "Race report" panel under the focus race's tabs with a "Make a race report" button; the report (`components/report/RaceReport.tsx`) loads only when pressed (`React.lazy` with `Suspense`; if it fails to load, the panel says to reload the page and `site_error` reports `chunk_load`, or `js_error` for any other failure), so the page's initial JavaScript does not carry it. A copy edition is never a focus race, so it has no button: only its `copyEditionSentence()`. The `/runners` heading is now "Analyze a past race", with "Have your splits? Paste them" (the split check) and "Only know your finish time?" (a time field that opens `pacingPatternHref` at the whole minute at or below it) under the search until a search is made, then under the matches until a race is selected (a search with no match has its own next steps).

**What it holds** (`buildReport()` and `ReportModel` in `lib/report.ts`, pure). Every block read from Pace Notes data names its group and its finishes, and a group under 100 finishes is never shown:
- From the nine times, calculated (no badge): finish and average pace, the 5–20 km pace and 25% slower, the nine section paces as bars from that pace, the opening against it with its group among the starting-pace analysis's six (`openingBandOf`).
- The sustained-slowdown reading, yes or no with its onset and the slow sections in a row, the definition and its citation (published research badge).
- The nearest pacing type (`classify` with `archetypes.json`'s classifier), "assigned after the race from its own splits; it describes a shape", with that type's finishes and share of the pacing-types cohort.
- "Compared with finishes at this time": the split check's own window (G = ⌊F ÷ 60⌋ + 3 minutes, finishes from G − 5:00 to G − 0:01) on the course (or all courses when the pace band does not publish it, said so) and comparison group, with its finishes, editions and sustained-slowdown share, and the held-pace and sustained-slowdown medians at 20 km and the finish (each group only with 100 finishes; with neither, the whole window). `windowCheck` and `windowCells` are shared with the split check, which now imports them from `lib/report-shared.ts` (with the percentages, tones, opening groups and `reportLink`), so the two show the same numbers for the same `s`.
- On `/runners` only, from that record's own edition and its All group (never a recorded gender or age group; groups of at least 101): the finish percentile (leave-one-out, ties count halfway) and observed rank, "not an official placing"; the achieved-time pace group's median late change beside this race's; the modelled weather near the scheduled start, "context, not personal exposure"; the supplied-route climb, "the sum of the 5 km sections; context". These exist only on the page and in its printout: never in the image or a link.
- Never: a name, a record ID, a recorded gender or age group, a "you" (it says "this race"), causal wording or an adjusted time.

The typed blocks use the times to the whole second, as the split-check link does, so a link reproduces them exactly; the record blocks keep the record's own millisecond times (the same figures as the runner view's tabs).

**Outputs** (`components/report/ReportActions.tsx`, in a `.tool-share .share-bar` row):
- **Print or save as PDF:** the browser's own print and PDF export. The button marks every sibling on the card's way up to `<body>` (`data-print-hide`) and clears the containers' spacing (`data-print-path`) until `afterprint`, so on `/runners` only the card prints; the print styles (`app/styles/pages/report.css`) make it one page, ink on paper. Measured in Chromium: one Letter and one A4 page for a typed report and for a record's report with its edition block.
- **Save image:** `renderReportImage()` (`lib/report-image.ts`, loaded with `import()` on the first press) draws on a canvas never added to the page after `document.fonts.ready`, in the self-hosted fonts, and downloads `pace-notes-race-report.png` (no course, year or time in the name). It shows the brand, the race (with the year for a record), finish and pace in the units on screen, the nine section bars, the slowdown reading and onset, the pacing type, one comparison line with its finishes and the address (the definition and citation line was dropped on October 16, 2026; they are on `/methodology#sustained-slowdown`); never a name, rank or percentile. `reportLines()` gives the image and its alternative text the same words; a preview with that text appears under the buttons. Save image and Share wait (and say so on the button) until the comparison and the pacing type have loaded, so the image never leaves them out, and a change in the numbers or the units drops the preview. In the image the pacing type and the comparison sit under a "Pace Notes data" tag in the badge's colours, and the alternative text says "Pace Notes data." before them; the calculations from the race's own times carry no label, and the slowdown reading is followed by the published definition and its citation (added October 16, 2026 after review: before that the image carried no label at all, so its data lines read like calculations).
- **Share:** the image as a file when `navigator.canShare({ files })` allows it, else the link with `navigator.share({ url })`, else the image is saved.
- **Copy link:** typed, `reportHref` with `g` when chosen; from a record, `runnerHandoffHref(reportHref(times, city))`, so exactly `s`, `course` and `via=runner`. Neither carries `units`: the report opens in the recipient's own units.

**Privacy and analytics.** `/report` is in `REPLAY_BLOCKED_PAGES` and never recorded, nor is `/runners`; the report's region carries `ph-no-capture`. Events: `report_exported` `{ format: image | share }` (share only once the share sheet resolves; a cancel sends nothing), `tool_used` `print` and `copy_link`, `section_viewed` `report` (on `/report`, and in the runner view, whose panel appears after a press: `SectionTracker` also watches marked sections that join the page later) and `site_error` `export` for an image or share that fails. No time, course or link reaches any event ([analytics](ANALYTICS.md)).

**Presentation since the redesign.** The redesign of October 18, 2026 (WP6, shipped with pull request #71) kept the contracts above (the window, groups, badges, link forms, replay masking, events and the privacy rules) and changed the presentation: the card became a night "lap screen" with tiles, a 20K dumbbell and a share sheet. Its notes, the five review rounds that followed and WP9 round 1 are in [history](history/runner-context-and-report-2026-09-to-10.md#race-report-redesign-and-review-notes-october-18-2026); read them for the layout, which the description above predates.

**Checks** (since November 19, 2026, lookup version 2). `scripts/verify-report.cjs` keeps every check of the version 1 paragraph (in [history](#race-report-checks-to-november-19-2026)) and adds the tier in the kicker, the image's kicker and its alternative text, and the year line: the page's table holds exactly the editions `linkedEditionReading` reads, with its words; the card prints the selected edition's line once with "records linked by name", its link keeping the handoff marker, nothing for an edition without a verdict or for a typed report, and the image never carries it. `verify-runner-search` (schema 2: units, parity with the reference reader on the committed lookup, a sweep of screened profiles, refusals) and `verify-runner-context-ui` render the report button (one, for a counted focus race; none for an own-record race or a copy edition); `verify-runner-context-client` checks the loader against the committed lookup and context manifests. The browser checks S3 and S6 are as before, on the new record keys.

## History

### Version 1 of the lookup (to the adoption of `pace-notes-marathon-half-20261113-1113`)

Moved here on November 14, 2026, word for word, from this document as it stood at `7f7ce6a06`: its introduction and its sections "Runner search", "Record coverage" and "Verification". Version 1 was the lookup `public/data/runners` held until the final version 2 build replaced it on November 19, 2026: marathon records only, in hash shards (`index/<3 hex>.json.gz` by the first three characters of a word, `profiles/<3 hex>.json.gz` by profile id), written by `build_lookup` (now in `analysis/lookup_v1_legacy.py`) inside the supporting study's build and verified by `scripts/verify-public-explorer.cjs`.

#### Introduction (version 1)

The contract for `/runners` (name search, candidate profiles and the records that cannot be analysed) and `/report` (one past race on one page). The runner view's same-edition peers, weather and route context are in [runner comparisons and environmental context](RUNNER_CONTEXT_AND_PEERS.md); the lookup is rebuilt with the [supporting study and runner lookup](OPERATIONS.md#validate-import-and-publish) and the context with the [runner context refresh](OPERATIONS.md#runner-context-refresh). Release counts belong in the refresh records and manifests; the one table here names its release.

#### Runner search (version 1)

`/runners` searches the current release's recorded names and lets visitors confirm which candidate races belong to them. `build_runner_lookup.py` writes compressed, checksummed search/profile shards and a source manifest. The index includes usable named raw records even when their splits or edition are excluded from aggregate analysis. No name is invented. Missing timings and quality reasons remain visible.

Since November 5, 2026, candidates are the producer's screened person links (`person_id`; New York 2026's preliminary links are marked "Preliminary link"), otherwise one record per link. The producer links records by recorded name, sex and age or birth year; Pace Notes adds no name matching of its own, and a link is not a verified person. Every performance comparison is limited to the visitor's selected recorded races and eligible timings; an observed best is not necessarily a lifetime best. Search and full-data downloads are public, with no account requirement.

#### Record coverage (version 1)

The lookup builder retains all raw records with a left join to analytical eligibility. Name indexing filters only unusable normalized names, not incomplete timings, missing demographics or held editions. The complete-data verifier checks each profile record and every expected name alias.

Recounted on October 30, 2026 from all 4,096 profile shards of the 1050 lookup, with the builder's name normalization (the totals equal the manifest's `named_records` and `unnamed_records`):

| Records (1050) | Searchable name | No usable name | Total |
| --- | ---: | ---: | ---: |
| Eligible for pacing analysis | 4,108,676 | 73 | 4,108,749 |
| Ineligible for pacing analysis | 1,218,686 | 69 | 1,218,755 |
| All records | 5,327,362 | 142 | 5,327,504 |

The 0934 and 1652 tables are in [history](history/RUNNER_RECORD_COVERAGE_20260917.md).

These are source records, not unique people. Records without usable names remain in the profile data and complete export; no invented name makes them discoverable by name search. Shared names and supplied identity links still require the visitor to choose which races belong together.

The search page explicitly includes every named record and explains that incomplete results remain available. “View the selected race” (“View 2 selected races” and so on for several) opens recorded results whether or not a pacing comparison is supported. A selection containing only ineligible records shows race/name, recorded age and gender where supplied, original finish and checkpoint readings, and each quality reason. A mixed selection retains its limited-analysis records below the eligible-race summary.

Missing or inconsistent readings stay missing or inconsistent. No pace, fastest eligible finish, percentile or progression is derived from an ineligible result.

#### Verification (version 1)

- Both source pins and every active payload must identify the same release. Calculation and input checksums are verified against actual files.
- The builder validates unique, set-equal raw/feature IDs and recorded labels; existing history linkage also checks finish and all nine section durations.
- The public-data verifier checks every compressed shard, every unique record ID, all profile aliases, complete name-index membership, edition coverage and raw/eligible counts. It independently recomputes slowdown detections and onset totals from the published runner timings.
- Python fixtures cover contiguous slowdown, exact thresholds, the short final section, separate same-name identities, unnamed/invalid records and quotes/newlines in recorded names.
- Browser/client tests cover Unicode and partial-name matching, complete pagination, invalid/held records, year-only progression, stale releases, corrupt transport, millisecond timings and mile/kilometre presentation. Display conversion applies to both ends of pace ranges.
- The Public runner explorer workflow downloads verified FULL input, rebuilds and verifies the study/search outputs, then uploads an artifact. Import and deployment remain separate steps.

`scripts/verify-runner-search.cjs` covers a candidate containing only held/missing-split records through verified compressed name search, profile loading and the selected-record view. It also checks mixed selections, original source formatting, miles/kilometres, and that a faster held time never replaces the eligible best.
Since November 11, 2026 it also asserts that a two-token search loads the smaller of its tokens' listed shards ([the rule](../analysis/README.md#public-name-search-and-selected-race-analysis)).

### Race report checks (to November 19, 2026)

Moved here on November 19, 2026, word for word, from the section "Race report" (the paragraph "Checks."), replaced for lookup version 2.

**Checks.** `scripts/verify-report.cjs` (in `npm run verify:data`, under a second) recomputes the report's window, groups, sustained-slowdown share, pacing type and opening group from the checksum-verified files for sample races on every published course and recorded gender, renders the card in both units and checks each data block's finishes and group, the citation, no "you", rank, percentile or record outside the record block, the image's lines and alternative text, and the link forms. `verify-runner-context-ui` and `verify-runner-search` render the report button (one, for the eligible focus race; none for a copy edition) and the new `/runners` heading and ways in. The browser checks: S3 opens a record's report, saves the image (a 1080 × 1350 PNG), shares it (stubbed), copies the link (exactly `s`, `course`, `via`), prints one Letter page and opens the link in a second tab (the times' blocks only); its copy-edition profile has one report button, and none with the copies alone. S6 counts the exports.
