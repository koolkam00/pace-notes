# Analysis catalog: earlier text (to October 30, 2026)

> Moved here word for word on October 30, 2026 from [`docs/ANALYSIS_CATALOG.md`](../ANALYSIS_CATALOG.md) at `main`'s commit `a2c6e507`, when that file was brought to the adopted release. The line numbers are that commit's. Counts belong to the release they name; do not quote them as current. Relative links are re-pointed for this folder.

## Broader views and the 1652 rebuild (lines 5–7)

The existing pack computations below remain reproducible and unchanged. Their website presentation now adds default single-race views for ranks 5/6 and seven archive questions, with separate original-history options. Downhill starts additionally have `/analyses/downhill-start`. [ALL_FINISHER_ANALYSES.md](../ALL_FINISHER_ANALYSES.md) is the authoritative mapping for these additions, their distinct metric definitions and eligibility. No one-race comparison is labeled personal improvement, learning or verified course adaptation.

**October 16, 2026 (branch `feat/release-1652`, not deployed):** every calculated output below was rebuilt from **`htw-db-2026-10-16-1652`** (4,915,355 raw records, 287 editions, 3,871,767 eligible finishes from 211 editions); the [1652 refresh record](../REFRESH_20261016_1652.md) has the measured counts. Each pack entry's bundle, timestamps and reported n below are the 1652 pack metadata (refreshed October 17, 2026 from the published `pack_meta.json` files); figures quoted in the method prose are the earlier calculation's unless marked 1652, and the published files are authoritative. The supporting study, runner search, runner context, fast-start modes and story data use this same input. Historical: on September 17, 2026 the additive [fast-start analysis](../FAST_START_ANALYSIS.md) was added on the then current **`private-export-20260912-0934`** source, whose refresh, import and production status are in [REFRESH_20260912_0934.md](../REFRESH_20260912_0934.md). Calculated does not mean deployed.

## How to read the catalog: the ten analyses (line 11)

- The primary site has [ten ranked analyses](../TOP_TEN_ANALYSES.md), defined in [lib/ten-analyses.ts](../../lib/ten-analyses.ts). Nine reuse personalized engine paths; rank 2 uses the additive fast-start calculation. These are overlapping views of the same source, not independent datasets. The earlier personalized opening path remains available in the research guide.

## Weather candidates, as written for release 1652 (line 12)

- Three additional weather candidates are screened together by `build_weather.py`. Only ready candidates receive pages; all results remain in `public/data/weather/evidence.json`. The 1652 output (as under 0934) supports warming and a precise null for typical wind speed, while moisture is too uncertain. See [WEATHER_ANALYSES.md](../WEATHER_ANALYSES.md).

## The personalized engine, as written for release 1652 (line 18)

The 1652 personalized engine has **3,871,767 eligible finishes**, including **1,291,322 with exact age** and **592,241 with a recent prior benchmark**. It retains twelve paths, whole-minute targets 90–720 and 28 cities plus All courses (0934, historical: 3,517,336, 1,225,873 and 555,437, with 29 cities). Missing age, valid history, historical route validity and start/proximity measurements still limit specific comparisons.

## Release audits, as written for release 1652 (line 20)

The September 10 failed refresh and schema/archive incompatibilities are dated historical evidence. The 1652 CORE/FULL member layout, canonical IDs and comparable timing units passed audit (unique, set-equal IDs; zero label or timing mismatches, checked at runtime rather than taken from the release's ID-CONTRACT.md); the runtime canonical join is enabled for the audited September 11, September 12 and October 16 releases. See [ACCESS.md](../../analysis/ACCESS.md).

## Source-quality policy counts, as written for release 1652 (line 26)

Then apply the release-specific [source-quality policy](../../analysis/source_quality.py). For 1652, thirty reviewed invalid-grid, incomplete, held or selected-field editions exclude 155,277 otherwise timing-valid finishes, leaving 3,871,767 from 4,027,044 timing-eligible records (0934, historical: eleven editions, 78,090, 3,517,336 from 3,595,426). Excluded editions cannot supply earlier benchmarks. Missing age or recorded gender alone does not remove usable timing from All. Every output records policy/script hashes and edition counts.

## Rank 2: the cohort paragraphs, as written for release 1652 (lines 772–774)

**All eligible finishes** includes every eligible performance once: **3,871,767** in 1652, including **3,279,526** without a recent earlier benchmark (0934: 3,517,336 and 2,961,899). Compare the first 5 km pace with the same race's 5–20 km pace. No prior race, identity linkage or inferred ability is required. The main time outcome is actual time after 20 km minus the time that distance takes at the recorded 5–20 km pace, with its median and middle 80% shown separately from actual median finish. First-5 km and after-20 km mean differences add to the whole-race mean difference; the 5–20 km reference block contributes zero by definition. This is arithmetic accounting, not avoidable minutes or a finish prediction.

**Earlier-best comparison** keeps its original method: **592,241** finishes in 1652 (555,437 under 0934) with a best eligible performance in the two strictly earlier calendar years, excluding current/same-year and invalid/held benchmark records. It compares first 10 km pace with the earlier best's full-marathon average. Screened supplied identity candidates are not independently verified people; names do not establish links. Only this mode requires history.

## Rank 2: measured results, as written for release 1652 (lines 782–784)

Under 1652 the history file has **582 filter combinations / 2,873 published groups**. In that mode's All filters, the **152,758** openings more than 10% faster have **43.6% sustained slowdown**, compared with **20.2%** for the **100,490** steady openings; the faster group's median finish is nevertheless **18:58 faster** than its earlier benchmark (0934, historical: 576 / 2,846, 47.0%, 17.9% and 16:37). These history results do not describe the broader default cohort or its different opening/reference definition.

Under 1652 the all-finisher file has **325 filter combinations / 1,646 groups**. Across All filters, the fastest opening group contains **195,980 finishes**, with **49.6% sustained slowdown** and median after-20 km time **28:11 above the reference**, versus **24.3%** and **8:28** for **1,656,393** steady-opening finishes. The first group's actual median finish is **5:46:19** (0934, historical: 314 / 1,534 groups; 174,935 at 49.6% and 28:04; 1,500,147 at 24.5% and 8:35; 5:45:31). Among detections, its most common first qualifying section is **20–25 km**; the steady group's is **35–40 km**. A reference difference is not time caused by the opening, and these groups have different finish-time distributions.

## Rank 2: verification, as written for release 1652 (line 788)

Both builders verify all runner shards and source hashes and bind their outputs to the exact runner-manifest hash; rebuild both whenever that manifest changes. Under 1652 the history verifier independently checked all 2,873 cells' counts, editions, slowdown/onset and sparse omissions, plus every numeric metric for 36 groups across six filters; the all-finisher mode's [independent verifier](../../scripts/verify-fast-start-all.cjs) checked all 7,881 shard checksums, the full eligible population, all 1,646 cells' counts and onsets, and every numeric outcome for 24 groups across four exact filters including the entire cohort (0934, historical: 2,846 and 1,534 cells). CI and publication are recorded separately. Existing personalized/research payloads and eligibility remain unchanged.

## Personalized engine: timestamps, as written for release 1652 (line 794)

The primary page order and wording come from [the ten-analysis registry](../../lib/ten-analyses.ts); the engine catalog below retains its original focus labels, its earlier `opening` path, and two additional paths, `downhill` and `return`. The primary rank-2 page now uses the separate fast-start output above. The personalized default is an All courses / 4:00 example, with no assumed age, gender or prior performance. The 1652 pack uses input timestamp `2026-10-16T20:55:30Z` and calculation timestamp `2026-10-17T03:49:05Z` (0934, historical: `2026-09-12T13:37:16Z` and `2026-09-12T14:13:44Z`). Every integer target from 90 through 720 minutes has exact threshold support, but profile, near-finish, checkpoint and history cells publish only when their own sample rules pass. Extreme or sparse selections can therefore have no result.

## Current supporting study, as written for release 1652 (line 872)

`analysis/build_public_explorer.py` generates `public/data/study/evidence.json` from the same 1652 input, eligibility parser, source-quality policy and history join. Its methods and denominators replace the old live/core summaries. The current calculation evidence is in [the 1652 refresh record](../REFRESH_20261016_1652.md); the September 12 refresh and its publication are in [REFRESH_20260912_0934.md](../REFRESH_20260912_0934.md).

## Public race lookup: runner context counts, as written for release 1652 (lines 898–900)

The [runner-context extension](../RUNNER_CONTEXT_AND_PEERS.md) adds same-edition finish placement for All, recorded gender, exact-age band and combined groups, plus 15-minute achieved-time pacing quartiles. These groups use the same eligible finishes (3,871,767 in 1652; 3,517,336 under 0934) and require 101 observations. Finish percentiles exclude the selected record, with other ties receiving half weight; group medians and pace quartiles include it. Higher percentile means a faster recorded finish among eligible database peers, not official standing. Selected-race section differences are descriptive elapsed-time comparisons.

Its separate 287-shard context output is bound to the exact runner manifest. Under 1652, weather has 286 valid edition matches (all but Amsterdam 2020) with five supplied hourly readings and source-unit checks; elevation covers 270 editions and remains an unverified historical-route proxy (0934, historical: 256 shards, 249 and 254). Whole-profile and section elevation measurements are retained separately. This adds contextual views, not a causal weather/elevation model, new identity linkage, extra independent studies, or a validated finish-time adjustment. Builders, gap details and independent verification are in [RUNNER_CONTEXT_AND_PEERS.md](../RUNNER_CONTEXT_AND_PEERS.md).

## Maintaining this document (line 904)

Review the primary ten against `lib/ten-analyses.ts`, and the archive and backing-engine maps against `analysis/pack_registry.json`, `lib/question-catalog.ts` and `lib/personalized-catalog.ts` after adding analyses. Update the entry's method, input vintage, cohort, script and output links when calculations change. Preserve the separation between hypotheses, measured fields, derived features, completed outputs and blocked questions.

## Per-pack state and n lines, as written for release 1652

`ext_pacing_shapes` (lines 79–80):

- Calculated state: **ready**; bundle `htw-db-2026-10-16-1652`; input timestamp `2026-10-16T20:55:30Z`; calculation timestamp `2026-10-17T03:46:00Z`.
- Reported n: **3871767**; observation unit: eligible finishes (consult method for subgroup/pair denominators); evidence scope: descriptive.

`ext_performance_profiles` (lines 98–99):

- Calculated state: **ready**; bundle `htw-db-2026-10-16-1652`; input timestamp `2026-10-16T20:55:30Z`; calculation timestamp `2026-10-17T03:48:09Z`.
- Reported n: **592241**; observation unit: eligible finishes; evidence scope: descriptive.

`ext_opening_tradeoffs` (lines 120–121):

- Calculated state: **ready**; bundle `htw-db-2026-10-16-1652`; input timestamp `2026-10-16T20:55:30Z`; calculation timestamp `2026-10-17T03:48:09Z`.
- Reported n: **397732**; observation unit: eligible finishes; evidence scope: descriptive.

`ext_slow_start_responses` (lines 143–144):

- Calculated state: **ready**; bundle `htw-db-2026-10-16-1652`; input timestamp `2026-10-16T20:55:30Z`; calculation timestamp `2026-10-17T03:48:09Z`.
- Reported n: **56711**; observation unit: eligible finishes; evidence scope: descriptive.

`ext_pace_trend_at_20k` (lines 165–166):

- Calculated state: **ready**; bundle `htw-db-2026-10-16-1652`; input timestamp `2026-10-16T20:55:30Z`; calculation timestamp `2026-10-17T03:46:00Z`.
- Reported n: **2070520**; observation unit: eligible finishes (consult method for subgroup/pair denominators); evidence scope: descriptive.

`ext_checkpoint_forecast_validation` (lines 185–186):

- Calculated state: **ready**; bundle `htw-db-2026-10-16-1652`; input timestamp `2026-10-16T20:55:30Z`; calculation timestamp `2026-10-17T03:48:09Z`.
- Reported n: **1039712**; observation unit: eligible finishes; evidence scope: validated forecast.

`ext_bad_patch_recovery` (lines 206–207):

- Calculated state: **ready**; bundle `htw-db-2026-10-16-1652`; input timestamp `2026-10-16T20:55:30Z`; calculation timestamp `2026-10-17T03:48:09Z`.
- Reported n: **1184983**; observation unit: eligible finishes; evidence scope: descriptive.

`ext_split_pattern_success` (lines 226–227):

- Calculated state: **ready**; bundle `htw-db-2026-10-16-1652`; input timestamp `2026-10-16T20:55:30Z`; calculation timestamp `2026-10-17T03:48:09Z`.
- Reported n: **592241**; observation unit: eligible finishes; evidence scope: descriptive.

`ext_successful_race_shapes` (lines 248–249):

- Calculated state: **ready**; bundle `htw-db-2026-10-16-1652`; input timestamp `2026-10-16T20:55:30Z`; calculation timestamp `2026-10-17T03:48:09Z`.
- Reported n: **214932**; observation unit: eligible finishes; evidence scope: descriptive.

`ext_strategy_outcome_spread` (lines 270–271):

- Calculated state: **ready**; bundle `htw-db-2026-10-16-1652`; input timestamp `2026-10-16T20:55:30Z`; calculation timestamp `2026-10-17T03:48:09Z`.
- Reported n: **592241**; observation unit: eligible finishes; evidence scope: descriptive.

`ext_course_pacing_profiles` (lines 292–293):

- Calculated state: **ready**; bundle `htw-db-2026-10-16-1652`; input timestamp `2026-10-16T20:55:30Z`; calculation timestamp `2026-10-17T03:46:00Z`.
- Reported n: **3871767**; observation unit: eligible finishes (consult method for subgroup/pair denominators); evidence scope: descriptive.

`ext_terrain_pacing_proxy` (lines 311–312):

- Calculated state: **ready**; bundle `htw-db-2026-10-16-1652`; input timestamp `2026-10-16T20:55:30Z`; calculation timestamp `2026-10-17T03:48:09Z`.
- Reported n: **3871767**; observation unit: eligible finishes; evidence scope: route proxy.

`ext_paired_course_comparisons` (lines 331–332):

- Calculated state: **ready**; bundle `htw-db-2026-10-16-1652`; input timestamp `2026-10-16T20:55:30Z`; calculation timestamp `2026-10-17T03:48:09Z`.
- Reported n: **108982**; observation unit: linked race pairs; evidence scope: partial comparison.

`ext_course_outcome_spread` (lines 352–353):

- Calculated state: **ready**; bundle `htw-db-2026-10-16-1652`; input timestamp `2026-10-16T20:55:30Z`; calculation timestamp `2026-10-17T03:48:09Z`.
- Reported n: **592241**; observation unit: eligible finishes; evidence scope: descriptive.

`ext_course_familiarity` (lines 374–375):

- Calculated state: **ready**; bundle `htw-db-2026-10-16-1652`; input timestamp `2026-10-16T20:55:30Z`; calculation timestamp `2026-10-17T03:48:09Z`.
- Reported n: **327097**; observation unit: eligible finishes; evidence scope: descriptive.

`ext_weather_pacing_patterns` (lines 397–398):

- Calculated state: **ready**; bundle `htw-db-2026-10-16-1652`; input timestamp `2026-10-16T20:55:30Z`; calculation timestamp `2026-10-17T03:48:09Z`.
- Reported n: **592241**; observation unit: eligible finishes; evidence scope: weather proxy.

`ext_race_day_context` (lines 421–422):

- Calculated state: **ready**; bundle `htw-db-2026-10-16-1652`; input timestamp `2026-10-16T20:55:30Z`; calculation timestamp `2026-10-17T03:48:09Z`.
- Reported n: **592241**; observation unit: eligible finishes; evidence scope: partial comparison.

`ext_course_response_profiles` (lines 444–445):

- Calculated state: **ready**; bundle `htw-db-2026-10-16-1652`; input timestamp `2026-10-16T20:55:30Z`; calculation timestamp `2026-10-17T03:48:09Z`.
- Reported n: **592241**; observation unit: eligible finishes; evidence scope: partial comparison.

`ext_checkpoint_outcomes` (lines 467–468):

- Calculated state: **ready**; bundle `htw-db-2026-10-16-1652`; input timestamp `2026-10-16T20:55:30Z`; calculation timestamp `2026-10-17T03:46:00Z`.
- Reported n: **3871767**; observation unit: eligible finishes (consult method for subgroup/pair denominators); evidence scope: descriptive.

`ext_late_rank_changes` (lines 486–487):

- Calculated state: **ready**; bundle `htw-db-2026-10-16-1652`; input timestamp `2026-10-16T20:55:30Z`; calculation timestamp `2026-10-17T03:46:00Z`.
- Reported n: **3871767**; observation unit: eligible finishes (consult method for subgroup/pair denominators); evidence scope: descriptive.

`ext_milestone_finishing_speed` (lines 505–506):

- Calculated state: **ready**; bundle `htw-db-2026-10-16-1652`; input timestamp `2026-10-16T20:55:30Z`; calculation timestamp `2026-10-17T03:48:09Z`.
- Reported n: **1153606**; observation unit: eligible finishes; evidence scope: descriptive.

`ext_qualifying_threshold_comparison` (lines 525–526):

- Calculated state: **ready**; bundle `htw-db-2026-10-16-1652`; input timestamp `2026-10-16T20:55:30Z`; calculation timestamp `2026-10-17T03:48:09Z`.
- Reported n: **854**; observation unit: eligible finishes; evidence scope: partial comparison.

`ext_goal_slip_recovery` (lines 547–548):

- Calculated state: **ready**; bundle `htw-db-2026-10-16-1652`; input timestamp `2026-10-16T20:55:30Z`; calculation timestamp `2026-10-17T03:48:09Z`.
- Reported n: **288300**; observation unit: eligible finishes; evidence scope: descriptive.

`ext_strong_finish_followup` (lines 567–568):

- Calculated state: **ready**; bundle `htw-db-2026-10-16-1652`; input timestamp `2026-10-16T20:55:30Z`; calculation timestamp `2026-10-17T03:48:09Z`.
- Reported n: **616749**; observation unit: linked race pairs; evidence scope: partial comparison.

`ext_distance_and_elapsed_change` (lines 588–589):

- Calculated state: **ready**; bundle `htw-db-2026-10-16-1652`; input timestamp `2026-10-16T20:55:30Z`; calculation timestamp `2026-10-17T03:48:09Z`.
- Reported n: **2600882**; observation unit: eligible finishes; evidence scope: descriptive.

`ext_pacing_habit_persistence` (lines 608–609):

- Calculated state: **ready**; bundle `htw-db-2026-10-16-1652`; input timestamp `2026-10-16T20:55:30Z`; calculation timestamp `2026-10-17T03:48:09Z`.
- Reported n: **616749**; observation unit: linked race pairs; evidence scope: descriptive.

`ext_age_pacing` (lines 629–630):

- Calculated state: **ready**; bundle `htw-db-2026-10-16-1652`; input timestamp `2026-10-16T20:55:30Z`; calculation timestamp `2026-10-17T03:46:00Z`.
- Reported n: **1286309**; observation unit: eligible finishes (consult method for subgroup/pair denominators); evidence scope: descriptive.

`ext_gender_pacing` (lines 648–649):

- Calculated state: **ready**; bundle `htw-db-2026-10-16-1652`; input timestamp `2026-10-16T20:55:30Z`; calculation timestamp `2026-10-17T03:46:00Z`.
- Reported n: **3289542**; observation unit: eligible finishes (consult method for subgroup/pair denominators); evidence scope: descriptive.

`ext_near_miss_recorded_return` (lines 668–669):

- Calculated state: **ready**; bundle `htw-db-2026-10-16-1652`; input timestamp `2026-10-16T20:55:30Z`; calculation timestamp `2026-10-17T03:48:09Z`.
- Reported n: **246302**; observation unit: eligible finishes; evidence scope: partial comparison.

`ext_experience_and_pacing` (lines 689–690):

- Calculated state: **ready**; bundle `htw-db-2026-10-16-1652`; input timestamp `2026-10-16T20:55:30Z`; calculation timestamp `2026-10-17T03:48:09Z`.
- Reported n: **592241**; observation unit: eligible finishes; evidence scope: descriptive.

`ext_race_spacing_outcomes` (lines 712–713):

- Calculated state: **ready**; bundle `htw-db-2026-10-16-1652`; input timestamp `2026-10-16T20:55:30Z`; calculation timestamp `2026-10-17T03:48:09Z`.
- Reported n: **655552**; observation unit: dated race pairs; evidence scope: descriptive.

`ext_pacing_over_time` (lines 733–734):

- Calculated state: **ready**; bundle `htw-db-2026-10-16-1652`; input timestamp `2026-10-16T20:55:30Z`; calculation timestamp `2026-10-17T03:46:00Z`.
- Reported n: **3718249**; observation unit: eligible finishes (consult method for subgroup/pair denominators); evidence scope: descriptive.

`ext_earlier_best_section_gains` (lines 752–753):

- Calculated state: **ready**; bundle `htw-db-2026-10-16-1652`; input timestamp `2026-10-16T20:55:30Z`; calculation timestamp `2026-10-17T03:48:09Z`.
- Reported n: **328461**; observation unit: earlier-best comparisons; evidence scope: partial comparison.

## The source-quality method bullet, as every pack carried it before the 1050 policy

(line 91, the same text in every pack)

- Apply the reviewed source-quality edition exclusions for this exact export after the timing checks. Known invalid split grids, incomplete ingestion, unreconciled HOLD editions and a selected top-finisher field do not contribute to the analyses or prior benchmarks. Report source exclusions separately; an already invalid timing row is not counted twice. Missing age or recorded gender alone does not exclude an otherwise eligible finish from the overall cohort. Other sparse editions are not declared incomplete merely from their size.
