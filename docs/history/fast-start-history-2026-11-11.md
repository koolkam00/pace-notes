# Fast-start analysis: history (earlier releases)

Moved November 11, 2026 from `docs/FAST_START_ANALYSIS.md` at `de9f8c6f` (`main`), word for word: lines 137–194, everything under its heading "## History (earlier releases)". Only the targets of relative links are re-pointed, so that they resolve from this folder; a link to a heading that stayed in the source document now names that document. Counts belong to the release they name; do not quote them as current.

Text moved here word for word on October 30, 2026 from this file as it stood at `main`'s commit `a2c6e507`, when the sections above were rewritten for 1050. The three result sections keep their headings, one level lower. Counts belong to the release they name; do not quote them as current. Older versions are in Git history.

### The opening and source paragraphs, as written for release 1652 (lines 3, 9 and 13)

Rank 2, `/analyses/starting-pace`, now has two comparison modes. The earlier-best mode was implemented September 17, 2026, with nine Python tests and independent source-data verification; its publication evidence is in [PR #41](https://github.com/koolkam00/htw-live-study/pull/41). The subsequent all-eligible-finishes addition is documented below. Its calculation, CI and production publication must be verified separately; the earlier PR does not certify this addition.

**Current source (October 16, 2026; branch `feat/release-1652`, not deployed): `htw-db-2026-10-16-1652`.** Both outputs were rebuilt from its runner manifest (SHA-256 `1bf94ccdb5b90cfef2fbc53537f9d43b7d97ddc67cbaba3153dae1983a64dce0`, 7,881 shards): **4,915,355 raw records**, **3,871,767 eligible finishes**, **3,922,189 profiles** and **592,241 finishes with the required earlier benchmark** (3,279,526 without one). The [1652 results](#1652-results-october-16-2026) follow; the figures elsewhere on this page are the 0934 calculation and are historical. When this mode was added, the source was the adopted `private-export-20260912-0934` release. This addition changes neither release pin, runner lookup, source-quality policy nor existing calculation scripts. It derives new aggregates from the actual checkpoint times in the [published runner profiles](../../public/data/runners/manifest.json), not from averages of existing charts. The page's visible source copy follows the website convention of describing marathon/year and field coverage without internal export identifiers.

Under 0934 (historical) there were **4,462,379 raw records**, **3,517,336 eligible finishes**, and **555,437 finishes with the required earlier benchmark**; the 1652 counts are in the paragraph above. All eligible finishes contributes every eligible record once, including the finishes without a qualifying recent benchmark (2,961,899 under 0934). Earlier-best comparison remains restricted to the benchmarked finishes and exactly reconciles with the original linked-history calculation. Counts are race performances, not unique people. Neither mode admits incomplete, invalid or held records, guesses missing splits, or changes the existing eligibility policy.

### Earlier-best results for All courses / All filters (0934, historical)

The 1652 history-mode figures are in [1652 results](#1652-results-october-16-2026).

| Opening group | Finishes | Sustained slowdown | Median finish difference from earlier best |
| --- | ---: | ---: | --- |
| More than 10% faster | 142,757 | 47.0% | 16:37 faster |
| 5–10% faster | 137,055 | 29.5% | 1:57 faster |
| 2–5% faster | 103,017 | 20.4% | 0:12 slower |
| Within 2% | 97,545 | 17.9% | 5:25 slower |
| 2–5% slower | 30,793 | 20.3% | 14:33 slower |
| More than 5% slower | 44,270 | 25.3% | 36:11 slower |

In the fastest-opening group, 67,025 finishes meet the slowdown definition. Its onset counts at 20, 25, 30 and 35 km are 8,329, 15,177, 25,073 and 18,446; the most frequent first qualifying section is **30–35 km**. The steady group has 17,472 detected finishes with respective counts 1,073, 2,535, 6,266 and 7,598; its most frequent section is **35–40 km**. These are modes, not a promised or precise onset distance.

These history-mode data show more late slowing among faster-opening groups, while their finish changes can still be faster than the earlier benchmark. Both observations must remain visible. Improved fitness, the earlier race's quality, differing courses and conditions, and selection into linked histories can explain part of this pattern. These numbers do not describe the broader default mode, which has a different opening distance and reference. It is unsupported to turn either comparison into a causal finish-time penalty or a recommendation to start aggressively. Only recorded complete eligible finishes are represented: neither mode estimates withdrawals or the chance of not finishing, nor isolates training, fueling or physiological causes.

### 1652 results (October 16, 2026)

Repository state on branch `feat/release-1652`, not deployed. All-eligible-finishes mode: **325 exact filter combinations / 1,646 opening-group cells**, 935,184 bytes, SHA-256 `a87cf009a7b8c28a338b9e45ea853f1501fb5aa8cd7caffcdc36a636ef73a3a5`. Earlier-best mode: 592,241 benchmarked finishes, **582 filter combinations / 2,873 groups**, 1,209,928 bytes, SHA-256 `2ad3f34df6cf3a35c287a4a012ea948ad77d19f3a742fdce175c049cf982e0fe`. With every filter at All:

| First 5 km versus same-race 5–20 km | Finishes | Sustained slowdown | Median extra time after 20 km versus reference pace | Actual median finish |
| --- | ---: | ---: | ---: | ---: |
| More than 10% faster | 195,980 | 49.6% | 28:11 | 5:46:19 |
| 5–10% faster | 420,124 | 45.6% | 22:37 | 4:59:55 |
| 2–5% faster | 692,392 | 35.2% | 14:58 | 4:23:32 |
| Within 2% | 1,656,393 | 24.3% | 8:28 | 3:55:29 |
| 2–5% slower | 543,768 | 23.5% | 7:51 | 3:56:55 |
| More than 5% slower | 363,110 | 30.0% | 9:38 | 4:08:13 |

In the fastest-opening group 97,297 finishes meet the slowdown definition; its first qualifying sections beginning at 20, 25, 30 and 35 km number 28,729, 28,459, 26,463 and 13,646, so the most common is still **20–25 km**. In history mode, openings more than 10% faster than the earlier benchmark have **43.6%** sustained slowdown (152,758 finishes) against **20.2%** within 2% (100,490), and the faster-opening group's median finish still improves on its earlier benchmark, by **18:58**. Both outputs bind the exact 1652 runner manifest; the independent verifiers' runs are in the [refresh record](../REFRESH_20261016_1652.md). The same interpretation limits apply.

### All-eligible-finishes results for All courses / All filters (0934, historical)

The new calculation includes all **3,517,336 eligible finishes** and publishes **314 exact filter combinations / 1,534 opening-group cells**. Its file is **866,909 bytes**, with SHA-256 `d5f9e85c1118b5914690c7ea45151cb3050087ab4a3619c794da5564cad98745`. These are measured calculation results; CI and production verification remain separate.

| First 5 km versus same-race 5–20 km | Finishes | Sustained slowdown | Median extra time after 20 km versus reference pace | Actual median finish |
| --- | ---: | ---: | ---: | ---: |
| More than 10% faster | 174,935 | 49.6% | 28:04 | 5:45:31 |
| 5–10% faster | 378,819 | 45.7% | 22:34 | 4:59:22 |
| 2–5% faster | 628,637 | 35.4% | 15:00 | 4:23:25 |
| Within 2% | 1,500,147 | 24.5% | 8:35 | 3:55:53 |
| 2–5% slower | 496,667 | 23.7% | 7:57 | 3:57:00 |
| More than 5% slower | 338,131 | 30.5% | 9:54 | 4:07:53 |

The fastest-opening group has **86,734** detected finishes. Counts for first qualifying sections beginning at 20, 25, 30 and 35 km are **26,009, 24,825, 23,806 and 12,094**; its most common first qualifying section is **20–25 km** (approximately **12.4–15.5 miles**). The steady-opening group has **368,281** detections, with onset counts **13,847, 55,780, 142,234 and 156,420**; its mode is **35–40 km**. These locate recorded sections among detected finishes, not exact failure points or all runners' experiences.

The 28:04 figure is a difference from continuing the measured 5–20 km pace after 20 km. It is not 28 minutes caused by starting fast or time the runner could necessarily recover. The groups also have substantially different actual finish distributions; they are not matched runners trying different strategies. Do not subtract their medians to estimate a personal penalty. All-finisher onset findings differ from history findings because both the population and opening definition differ.
