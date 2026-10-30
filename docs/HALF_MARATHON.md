# Half marathons

The half-marathon pages of Pace Notes (`/half`, the story `/stories/half-to-full`, the predictor's half panel, the goal pages' "The half marathon before", the half pace chart's panel and four "From the half" cards) read the aggregates in `public/data/half/`. Those are built from a **private** half-marathon snapshot and a **private** build of links between half and marathon records, joined to the adopted marathon release through its public runner shards. This document is the contract: what is pinned, which rules decide what counts, what is published and how it is checked when CI cannot see the source. The operating steps are in [operations](OPERATIONS.md#half-refresh); the module list and commands in [analysis/README.md](../analysis/README.md#half-marathons-private-source-aggregates-only); the page and tool contracts in [the website architecture](WEBSITE_ARCHITECTURE.md), [tools](TOOLS.md) and [stories](STORIES.md).

## Status (October 30, 2026)

Keep these three apart:

- **Measured results.** Built on October 29–30, 2026 from `half-snapshot-20261029-1133` and `runner-links-20261029-1156` against `private-export-20261021-1050`; every count below is the builder's output, independently recounted by the Node source recount (receipt dated 2026-10-30: pass, 16,816 published values and 189 policy values checked, 0 mismatches).
- **Repository state.** Branch `feat/half-marathon` (based on `main` at `e3f08ef`), not yet merged. `npm run verify:data` runs `verify-half` and the half card check.
- **Deployed state.** None. Nothing of the half integration is on splithappens.run until the branch is merged and a production check is recorded in the [project handoff](PROJECT_HANDOFF.md). Do not assume a newer build has reached the website.

## Sources and access

| Input | Where | Pinned by |
| --- | --- | --- |
| Half snapshot `half-snapshot-20261029-1133` | Private release in `koolkam00/pace-notes-db-backup` (one zstd part and a README); reassembled to `platform_half.sqlite`, 3,744,944,128 bytes | [`analysis/half-release.json`](../analysis/half-release.json) `half`: the release's `SHA256SUMS` lines and `sqlite_sha256` `655a2d7e…673a` |
| Link build `runner-links-20261029-1156` | Private release in the same repository, built at 2026-10-29 15:51:57 for that snapshot (`pairs_with`) | `links`: the asset sums and `extract_content_sha256` `95c37966…3d75` |
| Links extract `links-slim.sqlite` (about 45 MB) | Cut by `analysis/half_links_extract.py` next to the half snapshot (`PACE_HALF_DIR`, default `~/data/half-1133`); never in the repository | its content digest (canonical TSV of `people` then `links`, the same in Python and Node, whichever source form it was cut from) |
| Marathon side | The adopted release's public runner shards (`public/data/runners`), race dates from `public/data/weather/evidence.json` | `marathon_release` must equal [`analysis/release.json`](../analysis/release.json); the manifest binds the runner manifest, the weather evidence and the two cited marathon files |
| Reviewed policy | [`analysis/half-policy-20261029-1133.json`](../analysis/half-policy-20261029-1133.json), frozen from `analysis/half_quality.py` (with `half_policy_lists.py`: the reviewed lists, and the country of each of the 107 verified city labels) | `policy` in the pin; its sha in the manifest |

**Access.** The half source and its links are an explicit exception to the public-download policy of [AGENTS.md](../AGENTS.md) (owner decision Q1, below): pages and files publish aggregates only. No half row, name, bib, URL, link table, person key or lookup is in the repository or `public/`, and none may be published without a separate owner decision. The producer's README marks the snapshot as not for publication until the owner says so; the owner's request to add half analysis to the site is, under Q1, a go-ahead for aggregates, not for records. The token for the private releases, when one is used (`download_half.py --token-env`), is an operational credential: it is never written to a file, printed or logged.

`/methodology#half-data` and `#downloads-half` say this on the site: the half results and the links are not published as files; the page totals are, with their checksums.

## The policy

`analysis/half_quality.py` holds `REVIEWED_HALF_POLICIES['half-snapshot-20261029-1133']`, mirroring the marathon's `source_quality.py`; the computed lists are recomputed from the source on every build (and by `test_half.py` with `PACE_HALF_SOURCE_TESTS=1`) and must equal the frozen ones, so a new snapshot fails until its lists are reviewed.

**Record rules** (first match wins):

| Rule | Removes | Records |
| --- | --- | ---: |
| raw | `race_records` | 6,854,820 |
| R1 | a producer exclusion flag (duplicate, duplicate_load, duplicate_subset_list, wrong_year_copy, not_running, not_half_distance, separate_edition, separate_championship_list, trail_not_road_half, implausible_time, slow_outlier, disqualified, suspect_result_set; `time_hour_reconstructed` alone never excludes) | 98,768 |
| R2 | finish unparsed or not positive | 0 |
| R3 | a sub-race on the reviewed non-running list (whole-word: skating, MTB, wheelchair, adapted vehicles, joëlette, duathlon and the like; "Tordesillas" does not match) | 1,395 |
| R4 | a sub-race with at least 5% and 2 finishes under 56:42 | 1,088 |
| R5 | a finish under 56:42 (152) or over 6:00:00 (397) | 549 |
| R6 | a within-edition duplicate (same token-sorted name, finish and published sex; the copy from the largest sub-race list is kept, then the lowest id) | 1,949 |
| = | record-usable | 6,751,071 |
| R7 | the Oslo Half bib block: `Oslo Half` 2016–2025, bibs 73000–75999 (same-day marathon finishers listed under the half). A range rule, never a list of people | 606 |
| = | record-usable after R7 | 6,750,465 |

**Edition rules** (an edition supplies nothing if any applies): E0 no registry row (2 editions, 1,080 finishes); E1 status held for review, held for the owner's decision or duplicate held for review (614 editions, 702,694 record-usable finishes); E2 reviewed cross-edition duplicates, overlaps and non-half distances; E3 count screens; E4 one-sex lists unless a single-sex event; E5 truncated top lists; E6 round-number caps without an independent count; E7 atypical fields; E8 the same-race median screen (|log(edition median ÷ median of the label's other editions)| > 0.15, labels with at least 3 editions of at least 100 finishes; it removes stamped Berlin 2018, 2019, 2022 and 2023, whose medians fit gun times). E2–E8 remove 66 editions and 133,940 finishes.

**Usable:** 5,912,751 finishes in 8,019 editions. **Verified** (producer status `stamped`: finisher count within 0.5% of an independent published total, year and both winners confirmed): 1,623,027 finishes in 310 editions. **`use_sex`** (edition at least 95% published sex and each sex at least 3%; record sex M or F, never inferred): 1,558,344 verified finishes in 299 editions. Date flags: three date-suspect editions (Gdańsk 2026, Ribera 2019, Gela 2019) and 251 undated usable editions (820,515 finishes) never enter a date window.

## Set B: half and marathon records linked by name

Every linked figure uses set B:

1. people from `links-slim.sqlite` with confidence high or medium and `ns_keys ≤ 3`; candidate merges not applied;
2. a half that is usable, dated, not R7, not date-suspect, with no second half of the person on the same date and none on the date of one of the person's marathon records;
3. a marathon that is an eligible finish of the adopted release (the public runner shards), joined on the canonical record id;
4. for each eligible marathon, the nearest earlier half 21–112 days before it; one pair per person and marathon.

**23,929 pairs, 20,234 people, 107 marathon editions in 21 cities, 1,045 half editions**; 5,947 recorded women's and 17,982 recorded men's pairs; 59.8% of the halves are verified. Pairs are pairs of records, never verified people: the site says "records linked by name" on the first linked mention of a page.

## What is published

`public/data/half/` (about 156 KB; shapes in [`lib/half-types.ts`](../lib/half-types.ts)):

| File | Scope | Holds |
| --- | --- | --- |
| `field.json` | verified | minute histogram 1:05–3:29 with both tails, 5-minute recorded-sex bins, quantiles, shares under every 5-minute mark 1:10–3:00, the densest 30 minutes, the five round marks against the smooth curve with a 200-draw edition bootstrap, the scope checks (every usable result pooled; verified editions weighted equally, those of at least 1,000 finishes and all of them; the same race in verified and unverified years; the verified finishes by country) |
| `women.json` | verified | women's share by finish band (30 unnamed editions of at least 2,000 finishes), the marathon's crossing cited from `charts/womens-share-by-finish-time.json`, the same-city same-year pairs |
| `linked.json` | linked | set B's summary, sliding windows near every whole half minute (all, recorded women, recorded men), the sex strata, the goal-page rows, the robustness checks and the flagship's battery, and for `/methodology` only the multiple by 5-minute band, the marathon cities of at least 100 pairs from 3 editions (with their halves of 1:40–1:59) and link coverage by marathon city |
| `tools/half-to-full.json` | linked | the predictor's compact copy of the windows |
| `cards.json` | per card | the four card plots and the values they read |
| `manifest.json` | — | provenance (pin, policy, release, runner manifest, weather evidence, cited files, every builder script), the policy counts, the files with their bytes, shas and scopes |

Rules for every file: every shown group holds at least 100 finishes or pairs, and at least 3 editions behind any claim across editions (smaller groups are left out, never rounded up); no identifier keys, names, bibs, URLs or release tags; strings only under allow-listed keys; per-edition rows unnamed, or named only by marathon city and year for same-city pairs of at least 1,000 finishes; deterministic JSON (sorted keys, shares at 10 digits, no timestamps in family files). A published linked window is one of whole minutes, and every one-minute edge slice of a published window holds at least 10 pairs (smallest today: 15 for all pairs, 11 for recorded women, 15 for recorded men), so neighbouring windows never isolate a few records.

**Scopes and the chip.** Half-only figures use verified editions and carry no label. Linked figures include unverified halves (40% of set B) and carry one chip, "Includes unverified half results" (`ScopeTag`, linking to `/methodology#half-coverage`), on each linked surface and in the footer of each linked card. Every half surface root carries `data-half-scope`; a reading repeated as a link elsewhere (the chapter 11 row, the next card, the `/half` night card) carries `data-half-link` and points to the page that carries the chip. Sustained slowdown stays the marathon metric (at least 25% slower for at least 5 km after 20 km against the 5–20 km pace); no half figure is called a sustained slowdown, a split or halfway.

## How it is verified when CI cannot see the source

**CI does not see the source.** This repository's Actions token cannot read `koolkam00/pace-notes-db-backup`, and by default (owner decision Q2) no other token is stored, so no CI job opens the half snapshot or the links. That is weaker than the marathon pattern, where CI rebuilds every figure from the public shards. Two layers make up for part of it:

1. **Layer 1, in CI: `scripts/verify-half.cjs`** (in `npm run verify:data` and the **Half marathon** workflow's `check` job, about 30 s). From the repository alone it checks provenance (the manifest against the pin, the adopted release, the runner manifest, the weather evidence, the cited marathon files, every builder script and every file's bytes and sha); floors, identifier keys, allow-listed strings, release labels and the banned words on every file string, nugget, dek, tool sentence and card word; exact recounts of every half-only value from the published histogram and bins (shares under every mark, quantiles against their bins, the densest 30 minutes, the round marks refitted in Node within 0.05, the women's bands and crossing, the same-city shares) and of the marathon side of every same-city pair from the public shards; and the internal consistency of the linked aggregates (floors, monotone quantiles, mark shares within the bounds their quantile levels allow, contiguous ranges, edge slices, sexes summing to all, the goal rows recomputed from the windows with clean crossings, the battery against the checks, the tool file equal to `linked.json`, the cards equal to their sources). It cannot recount a linked value: those come from private rows.
2. **Layer 2, locally: `scripts/verify-half-source.cjs`** (`npm run verify:half-source`, about 80 s and 0.9 GB). An independent Node recount: it opens both SQLite files read-only with `node:sqlite`, checks them against the pin, reapplies R1–R7 with its own parser, sub-race pattern and name key, recomputes the E3–E8 screens and compares them with the frozen lists, rebuilds set B and every published file and compares them value for value. It writes the receipt [`docs/evidence/half/source-recount.json`](evidence/half/source-recount.json): date, status, values checked, mismatches, per-file counts and the shas it bound (manifest, every recount script, half snapshot, links extract, runner manifest, policy, weather evidence). No row data. Layer 1 fails unless the receipt says pass with no mismatches and binds the current manifest and recount scripts, so **a rebuild or a changed recount without a fresh local recount fails CI**.
3. **Optional layer 3: the workflow's manual `source` job.** Only with an owner-stored read-only `HALF_SOURCE_TOKEN` secret: it downloads with `download_half.py --token-env`, rebuilds into the runner's temp folder, requires byte-identical files and runs the source recount. Without the secret it prints "skipped: no source token (owner decision Q2)" and succeeds.

`--html` (after `npm run build`) adds the page rules: the chip exactly once on a linked surface and never on a verified one, no "verified", "unverified", "stamped", "internal-only" or "held for review" outside the chip and `/methodology`, the reading links, "records linked by name" as a term link, "Not a prediction." where the tools need it, and every `/methodology#half-*` anchor.

`analysis/test_half.py` covers the rules on synthetic sources (parsing, R1–R7, set B's window and exclusions, the windows, marks and goal crossings, edge slices, floors, the battery, determinism, the downloader and the card plots) and, with the snapshot present and `PACE_HALF_SOURCE_TESTS=1`, recomputes the frozen lists from it.

## The cards

Four unnumbered "From the half" cards share the Top 100 card kit (1080 × 1350, the same stamp scheme): `half-under-2` and `half-more-women` (verified, from `field.json` and `women.json`), `half-double` and `half-same-half` (linked, from `linked.json`; their takeaways say "records linked by name" and their footers carry the chip). The words are in `lib/charts/text/half.ts` (a registry of their own, so the Top 100 stays at 100), guarded by each page's nugget; `node scripts/build-chart-cards.cjs --set half` draws them into `public/charts/cards/half-<…>.png` and `--check --set half` (in `verify:data` and the half workflow) recomputes their stamps without a browser. Captions: the "From the half (not numbered)" section of [CHARTS_INSTAGRAM.md](CHARTS_INSTAGRAM.md). See [Top 100 charts](TOP_100_CHARTS.md#from-the-half-cards).

## When to rebuild

Rebuild (and rerun the source recount) after:

- a new half snapshot or link build (new pin, policy review, rebuild, receipt);
- a change to `analysis/release.json` or the runner manifest (`lib/half-server.ts` throws at build until the half data is rebuilt; a new marathon release also needs a new link build from the producer, because link record ids follow the marathon release's canonical ids);
- a change to `analysis/weather-release.json` or the weather evidence (marathon dates);
- a change to `insights/finish-times.json` or `charts/womens-share-by-finish-time.json` (cited marathon values);
- any change to `analysis/half_*.py`, `analysis/build_half.py` or the policy (the manifest binds every builder script);
- any change to `scripts/verify-half-source.cjs` or `scripts/half/{derive,policy,marathon,families}.cjs` (the receipt binds them; a recount is enough, no rebuild).

The steps are in [operations](OPERATIONS.md#half-refresh).

## Owner decisions

Settled at their defaults for the build of October 29–30, 2026 (the questions and alternatives are recorded in the build specification):

| | Question | Decision |
| --- | --- | --- |
| Q1 | Publication scope | Aggregates only; no half rows, names, link tables, half runner search or "your halves" without a separate decision |
| Q2 | CI source access | No secret: CI checks the committed aggregates and the local receipt; the manual `source` job stays skipped |
| Q3 | Navigation | No header, menu or home-door link; the ways in are the chapter 11 opener, one home-guide line, `/research`, `/about`, `/finish-times`, the predictor and the half pace chart |
| Q4 | Headline scope | Half-only figures from verified editions, unlabelled; linked figures from set B with the chip and verified-only guards |
| Q5 | Link rules | Medium or better, `ns_keys ≤ 3`, candidate merges not applied; the low tier only as a sensitivity line |
| Q6 | Chapter placement | The half-to-full story opens chapter 11 and its reading is the chapter's lead |
| Q7 | Predictor | The linked panel replaces the 20K-pace reading for half inputs |
| Q8 | Data fixes | R7 (the Oslo bib block); Berlin 2018, 2019, 2022 and 2023 out by the median screen until net times are confirmed; held editions out (including those held only for an internal count, such as Paris 2016, 2018 and 2021); date suspects and undated editions out of windows; Nordmarka (a forest trail half in the verified set) kept for field counts and flagged to the producer |
| Q9 | Half pacing metric ("pace after 10K") | Not built in this release |
| Q10 | Half weather | Not built until the producer re-geocodes the misplaced rows and supplies start times |
| Q11 | Cards | The four "From the half" cards and captions, unnumbered |
| Q12 | Chip wording | "Includes unverified half results" |
| Q13 | AGENTS.md text | Adopted as written |
| Q14 | Methodology access wording | "Every marathon file is public. No account, no key. Half-marathon results appear only as totals." |
| Q15 | Half goal pages | A follow-up pull request |

## Evidence (measured October 29–30, 2026)

Against `half-snapshot-20261029-1133`, `runner-links-20261029-1156` and `private-export-20261021-1050` (4,108,749 eligible marathon finishes, 1,266,780 with a sustained slowdown, 215 dated editions):

- **Adoption counts:** every count in the policy and set B sections above, asserted by `build_half.py` and recounted by the source recount (receipt 2026-10-30: pass, 16,816 values and 189 policy values, 0 mismatches; per file: `field.json` 427, `women.json` 741, `linked.json` 8,353, `tools/half-to-full.json` 6,993, `cards.json` 113). A build takes about 110 s and two builds give the same bytes. `verify-half` runs 46,210 checks in about 30 s; `test_half.py` 37 tests (one skipped without the snapshot).
- **The verified field:** median 1:57:20 (recorded women's 2:07:21, men's 1:51:43); 56.2% under 2:00 (women's 34.6%, men's 68.0%), 26.3% under 1:45; the densest 30 minutes 1:39–2:09 (54.4%). The minute before 2:00 held 37,490 finishes against 30,369.2 the smooth curve expects (1.23×, interval 1.21–1.26); before 1:30, 1.19× (1.15–1.22); before 1:45, 2:15 and 2:30, 1.05×, 1.06× and 1.05×.
- **Scope checks for the field:** all usable results put 52.3% under 2:00 and 24.6% under 1:45 (median 1:58:53); the 174 verified editions of at least 1,000 finishes weighted equally 57.7% and 24.9%; all 310 verified editions weighted equally 63.4% under 2:00 (the median edition; the 136 editions under 1,000 finishes, 85 of them Norwegian, raise it). The verified results are mostly European (France 26.7% of verified finishes, Germany 16.6%, Poland 13.8%, Norway 11.8%, Spain 10.6%; Paris alone about 19%), the usable results mostly US lists, so the claims are worded about finishes and hold in both pools. In the 71 city labels with both verified and unverified usable editions, the verified years' median of edition medians differed from the unverified years' by a median +25 s (+0.4 min; middle half −2.1 to +2.8 min), so the two kinds differ mainly by which races they hold.
- **Women's share by band:** median over 30 editions 7.1% under 1:30, 16.9%, 34.0%, 49.6%, then 59.0% from 2:15, 63.9%, 65.4% and 66.2% from 3:00; the marathon's crossing is 5:15.
- **Same city, same year:** 22 of 22 verified pairs in 7 cities had more women in the half (medians 37.9% and 23.5%; median difference +12.9 points, range +4.9 to +21.7); over every usable edition 42 of 42 pairs in 11 cities (+13.1). London 2025 and 2026 and Berlin 2025 have no pair (the marathon's unrecorded sex is over 2%).
- **Set B:** the typical marathon took double the half plus 1,254 s (20.9 minutes; middle half +11.1 to +34.7), a multiple of 2.2015; 7.72% came in under double, 22.4% within 10 minutes over it, 47.6% within 20, 68.4% within 30 and 80.9% within 40; 26.2% had a sustained slowdown. Published windows: all pairs 1:10–2:45 (96), recorded women 1:26–2:40 (75), recorded men 1:10–2:29 (80).
- **The flagship's battery** (multiple; minutes over double; under double): pooled 2.2015, +20.9, 7.7%; verified halves 2.1948, +19.6, 6.5%; without the Valencia and Warsaw marathons 2.2116, +23.6, 9.4%; `ns_keys = 1` 2.2116, +22.4, 7.7%; one pair per person 2.2030, +21.2, 8.0%; marathon editions equal (65 with at least 20 pairs) 2.1852, +20.0, 8.6%; (28 with at least 100) 2.2189, +25.1, 8.9%; cities equal (11) 2.1981, +18.6, 8.6%. The minutes move with each weighting's mix of half times; the multiple stays within 2.19–2.22, and at the pooled median half (1:45:18) every member is within 129 s of the pooled minutes, so the guard holds.
- **After a 1:45 half:** 2,573 pairs from 84 marathon editions, 67.3% under 4:00 (verified halves 68.0%, editions equal 66.9%, other marathons 67.1%, `ns_keys = 1` 64.1%, one pair per person 67.0%).
- **Method notes for `/methodology` (linked, source-only):** the median multiple is 2.12 in the 1:10 band and 2.21–2.23 from 1:40 to 2:20, so most of the growth in minutes over double is scale; by marathon city (11 cities of at least 100 pairs from 3 editions) the pooled minutes over double run from +14 (Berlin) to +41 (Washington), and within halves of 1:40–1:59 (8 cities) from +20 (Oslo) to +28 (New York), with Washington at +41 (none of its halves verified); link coverage (eligible marathon finishes linked to a record with a usable half) runs from 41.2% in Warsaw to 0.11% in Chicago over the 22 cities with at least 1,000 finishes and 100 linked. The false-link excess and its upper bound (link audit: about 0.5 points; at most about 13%) come from a shuffled null the independent recount cannot reproduce, so `/methodology` states them in words only.
- **Recorded women and men after the same half:** within half band × marathon city (at least 20 pairs per sex), women's marathons had fewer sustained slowdowns in 54 of 55 strata (standardised 13.7% against 33.0%, 19.3 points); verified halves 25 of 25 (18.9 points). After a 1:45 half, 10.2% against 30.4%.
- **Goal pages** (the slowest window whose median marathon is under the goal): 3:00 after a half near 1:23 (1,325 pairs, 76 editions; no recorded women's window), 3:30 near 1:35 (2,327; 90), 4:00 near 1:48 (2,427; 80), 4:30 near 2:01 (1,568; 69), 5:00 near 2:16 (634; 52); every crossing is clean.

### Where a built value differs from the specification

The production builder's output is canonical. Values that differ from the build specification by more than their rounding step, each explained:

- **All-scope same-city check: 42 pairs, not 43.** The specification's script counted Warsaw 2025 twice (two half labels in one city-year); the builder keeps the larger edition, as the specification's own same-city rule says. The verified comparison (22 pairs) is unchanged.
- **Undated usable editions: 820,515 finishes, not 820,755.** The link audit's count is from before R7; the undated Oslo Half 2016, 2018 and 2019 hold 240 of the 606 bib-block rows (60, 77 and 103).
- **The same race in verified and unverified years: 71 races, not 69.** The audit's 69 is its women's-share comparison (Mainz and Stavanger's 3-Sjøersløpet have no recorded sex on one side); its median-finish comparison, the one published, has the same 71 labels as the builder.
- **All 310 verified editions weighted equally: 63.4% under 2:00, not 64.1%.** The specification's 64.1% is the mean of the editions' shares (its own note gives the median, 63.4%); the builder publishes the median, as for the editions of at least 1,000 finishes.
- **Norway's share of verified finishes: 11.8%, not 11.5%.** The audit's rule-derived country put Holmestrand Maraton Half and Stavanger Marathon Half (six editions, 0.3% of verified finishes) in Denmark by their result host; the policy's reviewed label map puts them in Norway.
- **One pair per person, under 4:00 after a 1:45 half: 67.0%, not 67.1%.** The specification's check kept each person's latest pair within the 1:45 window (2,435 pairs); the builder keeps each person's latest pair overall (20,234 pairs, the battery member's definition) and then takes the window.
- **The cards' plots** draw more than the specification's sketch (same values, from the same files): `half-more-women` puts the marathon as the ring and the half as the dot (the page's key) under a "Typical" row at the two medians; `half-double` shows the marathons within 20 minutes over double as a second part (39.9%); `half-same-half` marks the flagship's 1:45 band as the signal row, the recorded men's share the ring and the women's the filled dot (so the orange mark is the women's share its takeaway prints in orange; round 2 review, October 30, 2026); `half-under-2` carries the recorded women's and men's shares its takeaway quotes.

## For the producer

- The Oslo Half bib block 73000–75999 (606 rows, 2016–2025, inside stamped editions): same-day marathon finishers listed under the half.
- Berlin half 2018, 2019, 2022 and 2023: medians fit gun times (+23% to +36%); can net times be re-pulled?
- Date collisions: Gdańsk 2026 carries the Warsaw marathon's date; Ribera and Gela 2019 share 2019-12-01; smaller: Liverpool and Wilmslow 2011-03-27, Ovar and Guimarães 2025-10-05.
- 251 undated usable editions, including Valencia 2021–22, Copenhagen Half, Oslo Half 2016, 2018 and 2019, Potsdam and Cologne 2019 (Valencia half to Valencia marathon is the largest pairing in the data).
- Weather: 1,012 rows geocoded to the wrong US state and 123 to the wrong country; every start hour assumed.
- Watch items: Nordmarka (a trail half in the stamped set), Helsinki Half's derived country (DK), Graz 2024 (+15% median), Gniezno 2025/26 and Vincennes 2019 (exactly 1,000 women), Valencia 2026 checkpoints for faster finishers only, Jaén 2023 and Huesca 2019 misplaced 10 km columns.
