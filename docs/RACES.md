# The marathon race directory

The race directory is the data family behind `/courses` as a list of every marathon with recorded results, and behind a
page for each race that has enough behind it. It lives in `public/data/races/`, is built by
[`analysis/build_races.py`](../analysis/build_races.py) and checked by
[`scripts/verify-races.cjs`](../scripts/verify-races.cjs). This document is its contract. The half-marathon directory
(`/half/races`) mirrors the [schema](#schema) below.

## Status (November 14, 2026)

Keep these apart:

- **Decisions.** The adoption plan's decisions D5 (every edition with rows listed, with its tier), D11 and D15 (one
  place per race; page types by rule), D14 and D19 (the race registry; its label is the pipeline's `city`), D16 (the
  words of each tier), D17 (hold notes on `/methodology` only), D22 (the finish-time universe) and D29 and D30 (Warsaw's
  two series; flags and aliases outside the frozen registry), the lead's addendum of 2026-11-14 that asked for the
  duplicate-edition audit, and the lead's rulings of 2026-11-14 on its three pairs (quoted in
  `analysis/race-notes.json`). None of these is an owner decision; the open owner questions are in the plan.
- **Measured.** A trial build on November 14, 2026 from the adapted input of
  `pace-notes-marathon-half-20261113-1113` whose `MANIFEST.json` is `c0ddc847…8310b` (the input the edition policy
  pinned that day; not the final input of the adoption). Its numbers are under [Measured](#measured) and are replaced
  by the kept build's.
- **Repository.** Branch `claude/release-20261113-races`, cut from `claude/release-20261113`. Not merged. Nothing
  under `public/data/races/` is committed until the lead confirms the final inputs.
- **Deployed.** Nothing. The release branch is not deployed and no page reads the family yet.

## Inputs, and what the manifest binds

| Input | Where | Bound by |
| --- | --- | --- |
| The adapted marathon input | Outside the repository (`analysis/adapt_combined.py`); the builder reads `EDITIONS.json` and, of `race_records.parquet`, the edition, the recorded sex and the finish time of each row | `input.manifest_sha256` must be the digest the frozen edition policy was frozen on; both members' digests are in the manifest |
| The frozen edition policy | `analysis/edition-policy-<stamp>.json` | its sha256, which `analysis/source_quality.py` pins; the published list `public/data/edition-policy.json` by sha256 |
| The race registry | `analysis/race-registry.json` (frozen; read-only for this family) | its sha256, which the edition policy also names |
| The reviewed notes | [`analysis/race-notes.json`](../analysis/race-notes.json) | its sha256 |
| The duplicate-edition audit | `docs/evidence/<date>/<release>/duplicate-editions.json` | its sha256; it must name this adapted input and the audit scripts as they are in the repository |
| The cohort's sensitivity readings | `docs/evidence/<date>/<release>/cohort-sensitivity.json` (the pipeline's) | its sha256; it must name this adapted input and policy |
| Every edition's facts | `docs/evidence/<date>/<release>/edition-policy-review.json` (the pipeline's) | its sha256; it must name this policy |
| The builder | `analysis/build_races.py`, `analysis/races_common.py` | their sha256: a changed builder without a rebuild fails the verifier |
| The source recount | `docs/evidence/<date>/<release>/races-recount.json`, written after the build | it names the manifest's own sha256, so the manifest cannot name it; the verifier checks it |

The notes file names the three evidence files, so a new release needs a reviewed notes file before it can be built.
The manifest has no clock time: two builds give the same bytes.

## The rules, in words

A stranger can recount every file from these and the inputs above.

1. **Universe.** Every marathon edition with at least one written row in the adapted input. An edition of the release
   with no row (an excluded edition) never appears. A race with no live edition (every edition set aside as a copy,
   rule 12) is left out of every list and count of races: it has no results to list (lead ruling, 2026-11-14).
2. **Race.** A race is an entry of the race registry. Its `label` is the pipeline's `city`, the join key with the
   year in every other family; `name` and `place` are the registry's. A race's slug is the registry's and is
   published only when the race has a page.
3. **Results and finishes.** Recorded results are the written rows of an edition; finishes are the rows with a finish
   time (the pacing pipeline's clock parser).
4. **Use.** `counted`: the edition policy counts the edition (it supplies pooled pacing statistics). `own_record`:
   not counted, but a record keeps its own pacing view. `recorded_times_only`: every other edition. `category` is the
   policy's category of an edition that is not counted.
5. **Timing.** The producer's timing-basis text classed as [`lib/tiers.ts`](../lib/tiers.ts) classes it, the one list
   for the whole site: `chip` (chip or net time), `chip_fallback` (chip or net time where the source has one, else gun
   or clock time), `gun`, `mixed` or `not_stated`. An unknown text stops the build.
6. **Flags.** From the registry's flags by rule: `virtual` (`virtual_in_title`), `cancelled` (`cancelled_in_title`),
   `placeholder` (`placeholder_place`), `not_a_marathon_title` (`no_marathon_word_in_title` together with
   `other_event_in_title`), `hand_cycle_title` (`title_names_a_hand_cycle_race`), `mountain_or_trail`
   (`mountain_or_trail_course` or `trail_or_mountain_word_in_title`), `two_races` (`several_race_names`). The notes
   file adds a flag the rule does not give and clears one it gives wrongly, each with its evidence. The first five
   are blocking: a race that carries one has no page unless the notes file records the lead's ruling that allows it
   (`page_rulings`, with the words and the date). `hand_cycle_title` also means the title is never printed beside a
   runner.
7. **Search aliases.** The notes file holds a reviewed table of place words as the release writes them and their
   common English names (Milano: Milan). A race takes the alias when its label, name or place holds the word and none
   of them holds the alias. An alias is for the list's search only and is never shown as a name. A difference of
   accents alone needs no alias: the search folds accents.
8. **Page types** (plan decision D15), computed, never typed:
   - `course`: three or more counted editions, or one of the 27 course pages the site had before this adoption,
     whatever it has left (their addresses never change);
   - `results`: not a course page, three or more badge-verified editions (`stamped` or `stamped_weaker_source`) of
     at least 100 recorded results each, and at least 3,000 recorded results in all;
   - `row`: every other race. A row has no address.
9. **The finish-time universe** (plan decision D22). An edition whose tier is `stamped` or `stamped_weaker_source`,
   or `partial` with the release's finishes between 95% and 105% of the official count (both ends included), and that
   the edition policy does not list as `selected_field`, `mixed_distance_list`, `incomplete_ingestion` or
   `unreconciled_hold`. Any split tier. It is the reading `analysis/linked_universe.py` makes, and the builder stops
   if it disagrees with the policy.
10. **Edition numbers.** Only for an edition of the finish-time universe with at least 100 finishes: the median and
    the quartiles of its finish times (linear interpolation between order statistics; whole seconds give multiples
    of a quarter second, published exactly), and the share of women among the finishes with a recorded sex of F or M,
    with that denominator, when those are at least 100 and at least nine tenths of the finishes. Sex is the published
    sex or the published category, never a name. An edition of the universe under 100 finishes lists its finishes
    and nothing else. An edition outside the universe lists its year, tier, split tier, use and recorded results,
    and no number.
11. **Reading.** "Median finish in a typical verified year": the median of the edition medians over the race's
    badge-verified editions of the finish-time universe with at least 100 finishes, stated only with three or more
    such editions; otherwise `null`. It carries the editions it rests on, their lowest and highest median, their
    finishes and their timing classes, so a page can decline a reading that mixes gun and net years. Where the
    registry gives a label a series note (Warsaw holds two races), each series has its own reading and the label has
    none.
12. **Duplicate editions.** An edition the notes file sets aside as a copy (the lead's ruling on a pair of the
    [audit](#duplicate-editions)) stays in the data, with the review mark `copy` and, in `set_aside_editions`, the
    edition it copies; it carries no number, counts toward no total, floor, page type or reading, and a page does
    not show it as an edition of the race. A race's years and a page's edition count are those of its live editions.
    A pair still pending is listed with the mark `possible_duplicate` and changes nothing else. A pair the lead keeps
    as two editions carries no mark in any page file.
13. **Floors** (AGENTS rule 13; never lowered): 100 finishes behind any number of an edition; three editions behind
    any statement across editions; a recorded sex on nine tenths of the finishes behind a share of women. The last
    was set on November 14, 2026 after reading the distribution: the lowest edition of the finish-time universe
    records a sex for 92.8% of its finishes, so it withholds nothing on this release.

## Tier words (plan decision D16) and what stays on `/methodology`

The words of a tier, a split tier and a timing class are those of [`lib/tiers.ts`](../lib/tiers.ts), the site's one
module for them; `components/ui/TierTag.tsx` is the only file that draws them, and a label links to
`/methodology#edition-tiers`. Data files carry codes. The builder is Python and cannot import the module, so it holds
a copy of the lists, the words and the class of each timing text of this release, and the verifier holds every one of
them to the module in the data: the code lists and their order, the words in the edition table, the class of every
edition's timing text, and the tier counts of every race.

| Code | Words (from `lib/tiers.ts`) |
| --- | --- |
| `stamped` | Verified |
| `stamped_weaker_source` | Verified, weaker source |
| `partial` | Partial results |
| `unverified` | Unverified |
| `held_for_review` | Held for review |
| split tier `finish_time_only` | Finish times only |
| timing class `gun` | Gun times |

An edition with checkpoint times, and one not timed by the gun, say nothing more. A list row's tier text is the
module's `tierLine(race.tiers)` ("6 verified, weaker source · 10 held for review"): every race row carries `tiers`, its
live editions by tier, in the shape that function takes.

Official counts, their sources, coverage, hold notes, release notes and the reasons an edition is not counted are in
`editions.csv` and `summary.json` (`notes`) only: they are for `/methodology` and the download (AGENTS rule 15, plan
decision D17). `directory.json`, `pages.json` and the race files hold none of them, and the verifier refuses a file
that does.

## Schema

All JSON files are UTF-8 with sorted keys and no insignificant white space. No file but `manifest.json` names the
release. A count never appears in a sentence: `what` says what a number counts.

### `directory.json`: every race, its editions as compact rows

```
{ "schema_version": 1, "family": "races", "distance": "marathon",
  "codes": { "tier": [...], "split_tier": [...], "use": [...], "category": [...], "timing": [...], "review": [...], "page": [...], "flags": [...] },
  "edition_columns": ["year", "tier", "split_tier", "results", "finishes", "use", "category", "timing", "review"],
  "left_out": [...], "set_aside_editions": [...],
  "races": [ { "label": <registry label>, "name": <registry name>, "place": <registry place or null>, "page": "course", "slug": <registry slug>,
               "years": [<first year>, <last year>], "results": <recorded results>, "finishes": <finishes>, "tiers": { <tier>: <editions> },
               "editions": [[<year>, 0, 0, <recorded results>, <finishes>, 0, null, 0, 0], ...] }, ... ] }
```

- `races` are the races with a live edition, in registry order (by race id). `slug` is present only when `page` is
  `course` or `results`; `flags`, `aliases` and `withheld` (the page type a blocking flag withholds) only when not
  empty. `place` may be `null`. `years` are the first and last year of the live editions.
- `left_out`: the races with no live edition (`label`, `name`, `place` and their edition rows, every one a copy). No
  page reads it; it is there so that every edition with rows is in the file exactly once.
- `set_aside_editions`: one object per copy, `{ "label", "year", "kept": { "label", "year" }, "reason" }`, the
  edition it copies and why (`one_list_two_years`, `one_race_two_keys`). A list shows a race's editions whose
  review is not `copy`.
- An edition row holds, in the order of `edition_columns`: the year; positions in `codes.tier`, `codes.split_tier`;
  recorded results; finishes; positions in `codes.use`, `codes.category` (or `null` when counted), `codes.timing` and
  `codes.review` (`none`, `possible_duplicate`, `copy`). Rows are in year order. `codes.tier`, `codes.split_tier` and
  `codes.timing` are the module's lists, in its order.
- `tiers`: the race's live editions by tier (`{ "stamped": 12, "partial": 2 }`), for `tierLine`.
- `results` and `finishes` of a race leave out editions set aside as copies.

### `pages.json`: the short head

`pages`: one object per race with a page, in registry order: `label`, `name`, `place`, `slug`, `page`, `years`,
`editions` (the count of live editions), `results`, `finishes`, `tiers` (editions by tier code), `with_checkpoint_times`,
`counted_editions`, `own_record_editions`, `universe_editions`, `page_before` (one of the 27 earlier course pages),
`flags`, `aliases`. It is what a list of pages, the sitemap and the analytics allow-list need without loading the
directory.

### `race/<slug>.json`: one race with a page

```
{ "schema_version": 1, "label", "name", "place", "slug", "page", "flags": [...],
  "editions": [ { "year", "tier", "split_tier", "results", "use", "timing", "in_universe": true,
                  "finishes", "p25_s", "median_s", "p75_s", "women": { "n", "of", "share" } | null,
                  "category"?, "review"?, "copy_of"? }, ... ],
  "reading": { "measure": "median_finish_in_a_typical_verified_year", "median_s", "editions", "years": [...],
               "lowest_s", "highest_s", "finishes", "timing": { "net": 8 } } | null,
  "reading_note": null | "fewer_than_three_verified_editions_of_100_finishes" | "per_series",
  "series"?: [ { "name", "first_year", "last_year", "years": [...], "reading": {...} | null } ] }
```

- Every edition of the race is listed. An edition with `"review": "copy"` carries `copy_of` and no number, and a
  page does not show it. `finishes` is present exactly when `in_universe` is true; the quartiles and `women` exactly
  when the edition also has 100 finishes; `women` is `null` when the sex floor fails.
- Times are seconds. `share` is `n / of` to four decimals; `of` is the finishes recorded as women or men.
- A statement across editions has a `null` fallback and a page states no reading in any slot when it is `null`.

### `summary.json`: the counts a page prints

`races` (`total`, `by_page`, `course_pages_kept`, `flagged`, `page_withheld_by_a_flag`, `left_out`), `editions` (`total` with
results and finishes; `by_tier_and_split_tier`, `by_tier`, `by_split_tier`, `by_timing` and `badge_verified`, each
with races, editions, results and finishes; `by_use`; `not_counted_by_category`; `without_results`: the editions the
release names that have no recorded result, read from the adapted input's list of editions with no written row), `counted` (editions, races, finishes that pass the timing checks, sustained slowdowns and
their share, as the pipeline's evidence states them), `sensitivity` (the same without partial editions, without
weaker-source editions, and by tier: lead ruling R5), `finish_time_universe`, `notes` (`hold`, `release`: the
producer's notes with label, year and tier) and `duplicates`. Counts leave out editions set aside as copies. The
file holds no words for a tier: those are the module's.

### `editions.csv`: the edition table for `/methodology` and the download

One row per edition, sorted by race label and year, with these columns: `race`, `race_name`, `place`, `year`, `tier`,
`tier_in_words` (the module's words), `split_tier`, `split_tier_in_words` ("Finish times only" or empty),
`recorded_results`, `finishes_with_a_time`, `official_count`, `official_count_source` (the source in words, or that
there is no independent count), `official_source_type` (the producer's own words), `coverage_pct` (the release's
finishes over the official count), `use`, `not_counted_category`, `reason_not_counted` (the policy's sentence),
`timing` (the class), `timing_in_words` ("Gun times" or empty), `timing_basis` (the producer's words), `race_date`, `race_date_source` (`weather`: the weather row's date; `reviewed`: a reviewed entry resting on
the producer's own note; `external`: a reviewed entry resting on a cited source outside the release), `hold_note`,
`release_note`, `review` (empty, `possible_duplicate` or `copy`), `copy_of_race` and `copy_of_year`
(the edition a copy copies), `reviewed_note` (the reviewed note of an edition of a listed pair: `one_list_two_years`,
`one_race_two_keys` or `repeated_finish_times`), `release_key` (the release's own race key, the join to the release's
tables; never shown as a name). The table holds every edition with rows, copies and the editions of left-out races
included.

### `manifest.json`

`release_tag`, `input_as_of`, `input` (the adapted manifest's digest and the two members'), `policy`, `registry`,
`notes`, `evidence`, `scripts`, `rules` (the rules above, in words), `floors`, `course_slugs_before`, `counts`,
`review` (what the 27 earlier course pages have now; pages whose label is not a plain key or a reviewed label; page
slugs over 30 characters; flagged races) and `files` (bytes and sha256 of every other file).

### For the half directory

Mirror the file names, the `codes` lists that apply, the edition row and the race object. Differences the half needs
are additions: its own `use` and `category` codes from the half policy, and "Gun times" as a mark on the Berlin Half
editions the plan names. Marathon and half slugs are separate name spaces.

## Duplicate editions

[`analysis/races_duplicates.py`](../analysis/races_duplicates.py) compares every pair of written marathon editions,
of one race or not, and writes edition pairs and counts only to
`docs/evidence/<date>/<release>/duplicate-editions.json`. It excludes nothing. Its rules (the evidence file repeats
them, with every threshold):

- **Name**: accents and every mark dropped, lower case, ł ø đ ð ß æ œ þ ı written as l o d d ss ae oe th i, anything
  that is not a letter or a digit separates words, the words sorted, so "Surname, Given" and "Given Surname" are one
  name. **Finish**: whole seconds. A row with both has a key.
- **exact**: two editions share at least 50 keys, or at least a fifth of the smaller edition's keys.
- **near**: for the names that occur once in each edition and are in both, the differences of their finish times are
  counted in one-minute bins; `aligned` is the most names in two adjacent bins. Listed at 10 aligned names and a fifth
  of the smaller edition, or 50 aligned names and half of the names in common. This is the rule that sees a list
  loaded twice with shifted times (gun times beside net times), which the exact rule cannot.
- **time_only**, for two editions of one race or of one year: the finish seconds they have in common, second by
  second, less the same count with one list moved by one minute either way (the chance level). Listed when the
  smaller edition has 20 finish times and the excess is half of them, or 50 rows and a fifth of them.
- **Kind**: `same_list_twice`, `one_race_two_keys`, `combined_list`, `same_list_under_another_race` or
  `partial_overlap`, from whether the pair is one race or one year and whether four fifths of each list is matched.

The lead rules on each listed pair. A ruling is an entry of `duplicate_editions` in the notes file: `pending`,
`set_aside` (naming the edition) or `keep_both`, with who ruled, when and in what words. The builder refuses to run,
and the verifier fails, unless the reviewed list holds exactly the pairs of the evidence file.

**The set-aside list other builders read.** `set_aside_editions` in
[`analysis/race-notes.json`](../analysis/race-notes.json) lists each copy as label (the pipeline's `city`), year,
the edition kept and the reason. It must say exactly what the rulings say (the builder and the verifier check it).
The runner-lookup builder skips the rows of those editions, so one run is not shown as two results (lead ruling,
2026-11-14). Any other family that counts results or follows runners across editions reads the same list.

**Rulings on this release** (the lead, 2026-11-14; the words are in the notes file):

| Pair | Ruling |
| --- | --- |
| Maratona SDAM 2012 and 2013 | 2013 is set aside: one list under two years of one race. The data cannot say which year is real; the earlier one is kept by convention. Both editions carry the note `one_list_two_years`. |
| The Green Mtn. marathon of 2015 and Champlain Islands 2015 | The Green Mtn edition is set aside: one race of one day under two keys. Its race then has no live edition and is left out of the directory. |
| Maraton Saltillo La Moderna 2023 and 2024 | Both are kept, with the note `repeated_finish_times`: their finish times past about 5:00 are shared between rows and years and are not individual times. No mark on a page beyond the tier. |

### What the audit cannot see

- A list loaded twice with names written so differently that the sorted words differ (initials, a missing middle
  name) **and** times that differ: neither names nor seconds match.
- Editions of different races in different years are compared by name only (exact and near), not by time alone.
- 3 editions have fewer than 10 single names and 55 fewer than 20 finish times: too small for the near and
  time-only rules (the exact rule still applies to them).
- Inside one edition: 131 rows sit on 64 (name, second) keys that repeat in their own edition. Not pairs of
  editions; listed here so that it is not lost.

(Counts of `pace-notes-marathon-half-20261113-1113`, measured 2026-11-14 on the adapted input with manifest
`c0ddc847…8310b`.)

## How it is verified

- `python3 -m unittest analysis/test_races.py analysis/test_races_duplicates.py`: 45 tests on made-up releases (page
  types, the floors at their edge, readings and series, flags, aliases, rulings, a race left out, refusals of inputs
  that do not belong together, each audit rule and kind, no runner detail in any output). One compares the builder's
  lists, words and timing classes with `lib/tiers.ts`. Two build a
  made-up repository and run `scripts/verify-races.cjs --root` on it, self-test included, so the builder and the
  verifier, written apart, must agree on every rule.
- `node scripts/verify-races.cjs [--root <repository>]` (in `npm run verify:data` once the family is built): from the repository alone it
  checks the manifest against the pins, recounts every edition against the policy, the pipeline's facts and the
  cohort manifest, holds the code lists, the words and every timing class to `lib/tiers.ts`, recomputes flags,
  aliases, page types, the finish-time universe, the floors, every reading, the summary, the head and the edition
  table, requires the reviewed duplicate list to be the audit's, and refuses any key or text outside its
  vocabularies. `--self-test` breaks 24 copies of the folder one way at a time and requires each to be refused for
  the reason it names. It needs `typescript` from `node_modules` to read the module, as `scripts/verify-tiers.cjs` does.
- What the verifier cannot recount, because the records are not in the repository: an edition's finishes, its
  quartiles and its women, and the count of editions without results. [`analysis/races_recount.py`](../analysis/races_recount.py) recounts them from the adapted
  input with other code than the builder's (every finish time read into numpy, each edition sorted and interpolated
  by hand, where the builder asks DuckDB for the quantiles) and writes a receipt, `races-recount.json`, beside the
  audit's evidence. The verifier requires the receipt to be clean and bound to the published manifest, the adapted
  input and the recount script, so a rebuild without a fresh recount fails.

## Build

```
python3 -I analysis/races_duplicates.py --input <adapted FULL dir> --out docs/evidence/<date>/<release>/duplicate-editions.json --work <a folder outside the repository>
python3 -I analysis/build_races.py --input <adapted FULL dir>
python3 -I analysis/races_recount.py --input <adapted FULL dir> --out docs/evidence/<date>/<release>/races-recount.json
node scripts/verify-races.cjs --self-test
```

Measured on November 14, 2026 on a 4-CPU, 15 GB machine: the audit 31 s and 1.2 GB with
`PACE_RACES_DUCKDB_MEMORY=1000MB`; the builder 3 s and 0.3 GB; the verifier under a second. Rebuild when the adapted
input, the edition policy, the registry, the notes or a builder script changes; run the audit again when the adapted
input or an audit script changes, and review the notes when its list moves; run the recount after every rebuild.

## What a page builder must know

- Join on `label` and year. A race without `slug` has no page and its row is not a link.
- Tier words come from the code through `lib/tiers.ts`, and a list row's tier text from its `tierLine(race.tiers)`;
  a tier label links to `/methodology#edition-tiers`. No official count, coverage, note or reason on any page but
  `/methodology`.
- A `null` reading is the fallback: no reading in any slot. Each sentence about a reading or an edition number is a
  nugget with its own guard and recount, as on every other page.
- A reading may rest on years timed differently: `timing` counts them by class. Years whose class is `gun` or
  `not_stated` beside `chip` years are not like for like.
- On a course page, the median finish by year in the story data counts finishes with nine checkpoint times; the race
  file counts every finish with a time. They differ for the same edition: show one, or name the measure.
- A race flagged `hand_cycle_title` never has its title printed beside a runner. Flagged races have no page.
- An edition whose review is `copy` is not an edition of the race on a page: show the rows whose review is `none`
  or `possible_duplicate`. A race under `left_out` is not listed.
- An alias is matched by the search and never displayed. The search must fold accents itself.
- A typed filter is typed text (AGENTS rule 18): it stays out of the address, out of analytics and out of recordings.
- New page slugs join the analytics allow-list as literals (plan decision D25); `pages.json` is the list.

## Measured

Trial build of November 14, 2026 from `pace-notes-marathon-half-20261113-1113` (adapted input manifest
`c0ddc847…8310b`, edition policy `ab43c75e…3541`, registry `163ec25d…c6a2`); replaced by the kept build's numbers.

- 811 races, 2,688 editions, 7,820,439 recorded results, 7,807,547 finishes.
- Page types: 28 course (the 27 earlier pages and Los Angeles), 34 results, 749 rows. No page is withheld by a flag;
  44 races carry a blocking flag (42 by the rule on the registry's flags, 4 added and 2 cleared by the notes).
- Finish-time universe: 845 editions in 203 races; 715 of them with at least 100 finishes. In the 62 race files:
  476 editions with numbers, 476 with a share of women, 53 readings.
- Files: `directory.json` 223,526 bytes (46 KB gzipped), `pages.json` 23,328 (3.5 KB), `summary.json` 9,906,
  `editions.csv` 1,376,153 (77 KB gzipped), 62 race files 192,072 in all (the largest 9 KB).
- Duplicate-edition audit: 0 pairs by the exact rule (2,904 pairs share a key; the most is 18), 2 by the near rule
  (Maratona SDAM 2012 and 2013; the Green Mtn. and Champlain Islands marathons of 2015), 1 by the time-only rule
  (Maraton Saltillo La Moderna 2023 and 2024). The name rule in SQL and in Python gives the same key for all
  4,977,511 distinct recorded names.
- `verify-races`: 106,635 checks pass; the self-test refuses 22 of 22 broken copies.
