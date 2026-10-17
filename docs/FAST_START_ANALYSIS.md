# Fast starts, late slowing and finish time

Rank 2, `/analyses/starting-pace`, now has two comparison modes. The earlier-best mode was implemented September 17, 2026, with nine Python tests and independent source-data verification; its publication evidence is in [PR #41](https://github.com/koolkam00/htw-live-study/pull/41). The subsequent all-eligible-finishes addition is documented below. Its calculation, CI and production publication must be verified separately; the earlier PR does not certify this addition.

## Scope and source

The default **All eligible finishes** mode uses [all-finishers.json](../public/data/fast-start/all-finishers.json), produced by [build_fast_start_all.py](../analysis/build_fast_start_all.py). The optional **Earlier-best comparison** continues to use [evidence.json](../public/data/fast-start/evidence.json), produced by [build_fast_start.py](../analysis/build_fast_start.py). The new builder imports shared validation and aggregation helpers from the unchanged earlier builder. Its addition preserves the earlier evidence file byte for byte. The personalized engine's three-group opening/target-threshold view remains in the research guide; that payload and the 33 research packs have not been regenerated or relabeled.

**Current source (October 16, 2026; branch `feat/release-1652`, not deployed): `htw-db-2026-10-16-1652`.** Both outputs were rebuilt from its runner manifest (SHA-256 `1bf94ccdb5b90cfef2fbc53537f9d43b7d97ddc67cbaba3153dae1983a64dce0`, 7,881 shards): **4,915,355 raw records**, **3,871,767 eligible finishes**, **3,922,189 profiles** and **592,241 finishes with the required earlier benchmark** (3,279,526 without one). The [1652 results](#1652-results-october-16-2026) follow; the figures elsewhere on this page are the 0934 calculation and are historical. When this mode was added, the source was the adopted `private-export-20260912-0934` release. This addition changes neither release pin, runner lookup, source-quality policy nor existing calculation scripts. It derives new aggregates from the actual checkpoint times in the [published runner profiles](../public/data/runners/manifest.json), not from averages of existing charts. The page's visible source copy follows the website convention of describing marathon/year and field coverage without internal export identifiers.

Both builders verify every compressed runner shard (**7,881** under 1652; 7,766 under 0934) against the runner manifest's size and SHA-256, check all five source calculation hashes, and confirm raw/profile ID uniqueness and raw, eligible and profile counts. Each output binds the exact runner-manifest SHA-256, source release, source archive/manifest hashes, source-quality policy and the calculation hashes it uses. The 1652 runner manifest hashes to `1bf94ccdb5b90cfef2fbc53537f9d43b7d97ddc67cbaba3153dae1983a64dce0` (0934: `41632a5249afed6421e0e30e428eecdca3130cac18927a109d79456b3ee1ebe6`).

Under 0934 (historical) there were **4,462,379 raw records**, **3,517,336 eligible finishes**, and **555,437 finishes with the required earlier benchmark**; the 1652 counts are in the paragraph above. All eligible finishes contributes every eligible record once, including the finishes without a qualifying recent benchmark (2,961,899 under 0934). Earlier-best comparison remains restricted to the benchmarked finishes and exactly reconciles with the original linked-history calculation. Counts are race performances, not unique people. Neither mode admits incomplete, invalid or held records, guesses missing splits, or changes the existing eligibility policy.

## Default mode: all eligible finishes

For each eligible record, let `t5`, `t20` and `finish` be its recorded cumulative seconds. Set `baseline = (t20 − t5) / 15`, the observed seconds per km from 5–20 km. Define opening change as:

```text
100 × ((t5 / 5) / baseline − 1)
```

This compares the first 5 km with the next 15 km. No linked identity, previous marathon, declared target or inferred ability is needed. The same six descriptive percentage bands below apply. Exact decimal cross-products classify `300 × t5` against each percentage boundary times `(t20 − t5)`, subtracting source decimal times before comparison rather than rounding a floating-point pace ratio.

This is an **unusually quick first section**, not proof of starting too fast for fitness. A runner who holds an ambitious pace through 20 km and slows later can remain in the steady-opening group. The 5–20 km pace is measured after the opening and may already reflect it, hills or congestion; both opening and later-slowdown ratios share this baseline. The resulting associations are descriptive and statistically coupled, not independent evidence of a causal penalty. Selecting an opening against eventual whole-race pace would introduce an even more direct outcome-based definition; this mode does not do that.

Course, exact-age band, recorded gender and opening group are the only filters in this mode. There is no earlier-time, speed, target or eventual-finish filter. The default is All courses/ages/genders and an opening more than 10% faster than the same-race baseline. Every group needs at least 100 finishes, and a detected-onset distribution needs at least 100 detections. Unsupported exact selections stay unavailable rather than broadening.

**Primary time outcome:** Actual time after 20 km minus the time that distance would take at the recorded 5–20 km pace:

```text
after20_difference = finish − t20 − baseline × 22.195
```

The output publishes the 10th percentile, median and 90th percentile as `after20_delta_p10_s`, `after20_delta_median_s` and `after20_delta_p90_s`. Positive means more time than this arithmetic reference; negative means less. This is neither an avoidable time loss nor a finish prediction. `actual_finish_median_s` separately describes the actual median finish, not a projected marathon time.

**Time accounting:** `opening_difference = t5 − baseline × 5`; `whole_difference = finish − baseline × 42.195`. The first 5 km difference plus the after-20 km difference equals the whole-race difference, because the 5–20 km reference block contributes exactly zero by construction. Mean differences retain this equality; medians do not. The existing `remainder_delta_mean_s` represents the after-20 km difference in this mode. Display the accounting as first 5 km, after 20 km and whole race, explicitly explaining the reference block.

**Section trajectory:** Divide each recorded interval’s actual pace by that same race’s 5–20 km pace and display the median percentage change. These are pooled section summaries, not one representative runner. The first section also determines opening-group membership, so its separation between groups is expected by definition. Slowdown rates and onset retain the common definition below; detection begins after 20 km and cannot establish whether slowing began earlier.

## Mode and shared-link behavior

`comparison=all|history` explicitly selects the mode. With no explicit mode, legacy `prior=` or `previous=` links select history; otherwise All eligible finishes is the default. An explicit `comparison=all` clears any prior-time filter. History retains the existing four broad earlier-best bands and the mapping from a valid legacy `previous=` time. `goal=` never affects either mode. Unit selection changes display only. Filter state, source payload, captions and sample counts must all change together when switching modes; no earlier-best statistic may be presented as an all-finisher result.

## Earlier-best mode: benchmark and opening groups

For each eligible race in year `y`, use the fastest eligible finish from years `y−2` or `y−1` within its screened supplied identity candidate. The current race and all same-year races are excluded. Held, incomplete and invalid records cannot provide a benchmark. Names never establish a link; the source identity screening does not independently verify a person's identity.

The benchmark is a recent recorded best. It is not measured current fitness, a declared goal, the runner's last marathon, or necessarily a lifetime best. Changes in fitness between races are especially important when interpreting a faster opening.

Let `opening_change` be:

```text
100 × ((actual first 10 km elapsed time / 10) / (earlier best finish time / 42.195) − 1)
```

Negative means faster pace than the earlier best's whole-marathon average. The fixed bands are:

| ID | Display description | Exact percentage interval |
| --- | --- | --- |
| `fast10` | More than 10% faster | `< −10` |
| `fast5` | 5–10% faster | `−10 ≤ change < −5` |
| `fast2` | 2–5% faster | `−5 ≤ change < −2` |
| `steady` | Within 2% | `−2 ≤ change ≤ 2` |
| `slow2` | 2–5% slower | `2 < change ≤ 5` |
| `slow5` | More than 5% slower | `> 5` |

Decimal timing cross-products classify boundaries without rounding source times or introducing binary-division artifacts. For example, 2,850 seconds over the first 10 km versus a 12,658.5-second earlier marathon is exactly 5% faster and belongs to `fast2`. These are descriptive categories, not physiological thresholds establishing that a runner started too fast.

## Earlier-best filters and shared sample rules

Within history mode, the initial selection uses All courses, all ages, all recorded genders, all earlier times, and the `fast10` opening group. Filters select an exact combination of:

- Course, pooling its available eligible editions, or All courses.
- Recorded exact age: All, 18–24, then five-year bands from 25–29 through 85–89. Missing, fractional or out-of-range ages stay in All.
- Recorded gender: All, Men or Women. Other/unrecorded values stay in All.
- Earlier recorded-best finish: All, under 3:00, 3:00–under 3:30, 3:30–under 4:00, or 4:00 and longer.

There is **no target-time or current-finish filter** in this view. Earlier time supplies the only time-based filter; it avoids selecting groups by the outcome being explained. Course, age and gender filters do not match or adjust race editions, weather, training or changing fitness. The results remain pooled observational comparisons.

Every displayed opening group requires at least **100 eligible benchmarked finishes**. Each roll-up is calculated directly from its records, never by averaging subgroup medians. Sparse combinations show an unavailable result; they are not silently broadened. The 1652 file contains **582 supported filter combinations and 2,873 opening-group cells**, about **1.21 MB** (0934: 576 and 2,846, about 1.19 MB).

## Earlier-best charts and the shared slowdown definition

**Section trajectory:** For each actual recorded interval, calculate the individual's percentage pace difference from their earlier-best marathon pace, then display its group median. Nine intervals retain the recorded 5 km timing grid and final 2.195 km section. Separate section medians do not describe one representative runner and need not sum to the median finish. Miles mode converts distances without inventing mile splits.

**Finish outcome:** Current finish minus earlier recorded best, in actual seconds. The median is the typical observed difference; the 10th and 90th percentiles describe the middle 80% of individual differences. These percentiles are not confidence intervals or individual predictions.

**Opening and remaining time:** Compare actual first 10 km elapsed time with `10 / 42.195` of the earlier finish. Remaining difference equals finish difference minus opening difference. The group's mean opening and remaining differences add to its mean finish difference. Negative means fewer seconds spent than the reference; positive means more. This signed accounting uses an arithmetic even-pace reference, not an alternative race the runner would have achieved. Means can differ materially from the separate median outcome.

**Sustained-slowdown rate, both modes:** Use the same definition as the supporting study: pace at least 25% slower than the current race's 5–20 km baseline, for contiguous recorded sections totaling at least 5 km after 20 km. A `1e−12` ratio tolerance absorbs binary rounding at the threshold. The final 2.195 km cannot qualify alone. The denominator is every eligible finish in the selected mode and opening group, including those with no detected episode. History requires an earlier benchmark; All eligible finishes does not.

**First qualifying section:** Among detected finishes, count whether the first qualifying section starts at 20, 25, 30 or 35 km. A distribution is displayed only when the group has at least **100 detected finishes**; otherwise `onset` is null. The four shares use the detected-finish denominator, not all finishes. Timing mats locate a section, not the exact instant the pace changed. Slowing may have begun before the threshold or before the first tested section; the chart does not identify physiological failure.

The output also retains median late pace change, comparing 30 km–finish against the same race's 5–20 km baseline. This is a distinct measure from the earlier-best pace reference used for opening groups and section trajectories.

## Earlier-best results for All courses / All filters (0934, historical)

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

## 1652 results (October 16, 2026)

Repository state on branch `feat/release-1652`, not deployed. All-eligible-finishes mode: **325 exact filter combinations / 1,646 opening-group cells**, 935,184 bytes, SHA-256 `a87cf009a7b8c28a338b9e45ea853f1501fb5aa8cd7caffcdc36a636ef73a3a5`. Earlier-best mode: 592,241 benchmarked finishes, **582 filter combinations / 2,873 groups**, 1,209,928 bytes, SHA-256 `2ad3f34df6cf3a35c287a4a012ea948ad77d19f3a742fdce175c049cf982e0fe`. With every filter at All:

| First 5 km versus same-race 5–20 km | Finishes | Sustained slowdown | Median extra time after 20 km versus reference pace | Actual median finish |
| --- | ---: | ---: | ---: | ---: |
| More than 10% faster | 195,980 | 49.6% | 28:11 | 5:46:19 |
| 5–10% faster | 420,124 | 45.6% | 22:37 | 4:59:55 |
| 2–5% faster | 692,392 | 35.2% | 14:58 | 4:23:32 |
| Within 2% | 1,656,393 | 24.3% | 8:28 | 3:55:29 |
| 2–5% slower | 543,768 | 23.5% | 7:51 | 3:56:55 |
| More than 5% slower | 363,110 | 30.0% | 9:38 | 4:08:13 |

In the fastest-opening group 97,297 finishes meet the slowdown definition; its first qualifying sections beginning at 20, 25, 30 and 35 km number 28,729, 28,459, 26,463 and 13,646, so the most common is still **20–25 km**. In history mode, openings more than 10% faster than the earlier benchmark have **43.6%** sustained slowdown (152,758 finishes) against **20.2%** within 2% (100,490), and the faster-opening group's median finish still improves on its earlier benchmark, by **18:58**. Both outputs bind the exact 1652 runner manifest; the independent verifiers' runs are in the [refresh record](REFRESH_20261016_1652.md). The same interpretation limits apply.

## All-eligible-finishes results for All courses / All filters (0934, historical)

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

## Reproduction and independent verification

Run from the repository root with NumPy installed:

```bash
python -m unittest discover -s analysis -p test_fast_start.py -v
python analysis/build_fast_start.py --runners public/data/runners --pin analysis/release.json --output public/data/fast-start/evidence.json
node scripts/verify-fast-start.cjs
python -m unittest discover -s analysis -p test_fast_start_all.py -v
python analysis/build_fast_start_all.py --runners public/data/runners --pin analysis/release.json --output public/data/fast-start/all-finishers.json
node scripts/verify-fast-start-all.cjs
npm run verify:data
npm run build
```

The measured build used NumPy 2.2.6 and records its actual engine version. The nine [Python tests](../analysis/test_fast_start.py) cover exact percentage and decimal-timing boundaries, strictly earlier-year benchmarks, unavailable demographics, the short final section, threshold inclusion, signed time accounting, percentiles and sparse-cohort behavior. A regression fixture also preserves valid exact section-pace bounds after decimal elapsed-time subtraction while rejecting genuinely out-of-range paces. This uses the runner verifier's `1e−8` seconds/km rounding tolerance at 120 and 1200 seconds/km; it does not change the underlying eligibility rules.

The separate [JavaScript verifier](../scripts/verify-fast-start.cjs) independently scans all profile records, reconstructs the earlier benchmarks (592,241 under 1652; 555,437 under 0934), and recomputes **all published cells' counts (2,873 under 1652; 2,846 under 0934), edition counts, slowdown counts and onset distributions**, including omitted sparse cells. It independently recalculates every numeric metric in **36 groups across six filter combinations**, including all six global opening groups and five varied filtered combinations. It uses separate exact integer cross-products for decimal boundary classification. This full verification passed after the final calculation.

Under 0934 the all-finisher build verified all source shards and reconciled **4,462,379 raw records**, **3,517,336 included eligible finishes** and **3,523,474 profiles** (1652: 4,915,355, 3,871,767 and 3,922,189, with all 1,646 published cells reconciled by the verifier). Ten [new Python tests](../analysis/test_fast_start_all.py) passed, covering exact opening boundaries, time accounting, outcomes, sparse groups, a history-free full reader fixture and rejection of altered shards, count mismatches and duplicate IDs. An even first 20 km followed by late slowing remains in the steady-opening group, preserving the stated limitation. The separate [all-finisher verifier](../scripts/verify-fast-start-all.cjs) passed its full source scan, independently reconciling all **1,534** published cells' counts, editions and onset distributions, omitted sparse cells, and numeric outcomes for every global opening group plus representative exact filters. It also checks actual-finish and after-20 km percentiles against the source records. Retain the earlier-best file's original bytes and prior verification; a new default does not recalculate history.

Refreshing the runner lookup requires regenerating **both** outputs against the exact new manifest, even if the source tag stays the same. A benchmark/count/hash mismatch blocks publication; do not relax it to accept unexplained differences. Existing research packs and the archive's opening engine keep their own contracts. Record new calculation results, PR, deployment and live-payload verification separately before claiming the expanded page is live.
