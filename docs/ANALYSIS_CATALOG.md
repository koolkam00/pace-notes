# Analysis catalog

## Broader views without earlier results

The existing pack computations below remain reproducible and unchanged. Their website presentation now adds default single-race views for ranks 5/6 and seven archive questions, with separate original-history options. Downhill starts additionally have `/analyses/downhill-start`. [ALL_FINISHER_ANALYSES.md](ALL_FINISHER_ANALYSES.md) is the authoritative mapping for these additions, their distinct metric definitions and eligibility. No one-race comparison is labeled personal improvement, learning or verified course adaptation.

Updated September 17, 2026 with the additive [fast-start analysis](FAST_START_ANALYSIS.md), on the unchanged **`private-export-20260912-0934`** source. Its local calculation and independent verification passed; publication is a separate step. Existing pack counts, timestamps and methods below retain the September 12 calculation metadata. [REFRESH_20260912_0934.md](REFRESH_20260912_0934.md) separately records that refresh's validated import and production status; calculated does not mean deployed. The supporting study, runner search and runner context use this same input.

## How to read the catalog

- The primary site has [ten ranked analyses](TOP_TEN_ANALYSES.md), defined in [lib/ten-analyses.ts](../lib/ten-analyses.ts). Nine reuse personalized engine paths; rank 2 uses the additive fast-start calculation. These are overlapping views of the same source, not independent datasets. The earlier personalized opening path remains available in the research guide.
- Three additional weather candidates are screened together by `build_weather.py`. Only ready candidates receive pages; all results remain in `public/data/weather/evidence.json`. The current 0934 output supports warming and a precise null for typical wind speed, while moisture is too uncertain. See [WEATHER_ANALYSES.md](WEATHER_ANALYSES.md).
- The research archive contains 35 questions: eight foundation packs from `build_pacing.py`, 25 from `build_extended.py`, and two measurement-limited questions (group running and congestion). `write_findings.py` writes narratives from the aggregate values.
- Stable S/R/RN/P routes now map to current extensions, the new current-source supporting study, or explicit unsupported states. Historical numerical files remain in Git history rather than active website data. Route aliases are not independent studies.
- `/runners` searches recorded names and compares visitor-confirmed candidate races from the current source. Raw records remain discoverable when invalid timings prevent an analysis; candidate identity is not verified personhood.
- Ready describes an implemented, supported output under its stated method. It does not establish causation or resolve the full breadth of an original question. Full source records are public; chart sample thresholds serve reliability, not access restrictions.

The 0934 personalized engine has **3,517,336 eligible finishes**, including **1,225,873 with exact age** and **555,437 with a recent prior benchmark**. It retains twelve paths, whole-minute targets 90–720 and 29 cities plus All courses. Missing age, valid history, historical route validity and start/proximity measurements still limit specific comparisons.

The September 10 failed refresh and schema/archive incompatibilities are dated historical evidence. Current 0934 CORE/FULL member layout, canonical IDs and comparable timing units passed audit; the runtime canonical join is enabled for the audited September 11 and September 12 releases. See [ACCESS.md](../analysis/ACCESS.md).

## Shared inputs and calculation contracts

Foundation input uses raw edition labels, runner for deduplication, recorded gender, exact age and nine elapsed checkpoint strings. Parse to seconds, require every checkpoint and strict increase, finish 90 minutes–12 hours and each section 2–20 min/km. Compare equal-distance 0–20 and 20–40 km, not measured half-marathon splits. Do not interpolate missing data.

Then apply the release-specific [source-quality policy](../analysis/source_quality.py). Eleven reviewed invalid-grid, incomplete, held or selected-field editions exclude 78,090 otherwise timing-valid finishes, leaving 3,517,336 from 3,595,426 timing-eligible records. Excluded editions cannot supply earlier benchmarks. Missing age or recorded gender alone does not remove usable timing from All. Every output records policy/script hashes and edition counts.

Extended calculations use retained raw IDs, supplied feature linkage and edition dates; course analyses also use course segments. Audited 0934 raw/feature IDs join canonically only after runtime checks of unique matching sets and labels, then full-timing agreement. September 7 reproduction retains one-to-one edition/name/full-timing matching. Cross-race identities remain supplied candidates, screened for ambiguity, conflicting gender/birth year and duplicate editions. Recent best uses only the two strictly earlier calendar years, excluding all same-year results. See [data architecture](DATA_ARCHITECTURE.md).

Eligible finishes, linked finishes, benchmark observations, pairs and weather editions are different populations. Public cells generally require 100 observations, with additional matched/edition rules. The metadata, linked summary and table contracts preserve the actual denominator, observation unit, provenance and limitations. These sources take precedence over an abbreviated question title.

## Broader research archive question map

| # | Question ID and title | Theme | Extension / state | Aliases |
| --- | --- | --- | --- | --- |
| 1 | `r10_unravel_typology`: How do people actually pace a marathon? | strategy | [ext_pacing_shapes](../public/data/packs/ext_pacing_shapes/pack_meta.json) | — |
| 2 | `r05_exceptional_vs_prior`: What does an unusually good race look like? | strategy | [ext_performance_profiles](../public/data/packs/ext_performance_profiles/pack_meta.json) | — |
| 3 | `r01_banking_time`: What are the rewards and risks of an aggressive start? | strategy | [ext_opening_tradeoffs](../public/data/packs/ext_opening_tradeoffs/pack_meta.json) | 's1_banking_time' |
| 4 | `r02_recover_slow_start`: How do runners successfully respond to a slow start? | strategy | [ext_slow_start_responses](../public/data/packs/ext_slow_start_responses/pack_meta.json) | — |
| 5 | `r03_accel_vs_decel_20k`: Can two runners reach 20 km together but have different prospects? | strategy | [ext_pace_trend_at_20k](../public/data/packs/ext_pace_trend_at_20k/pack_meta.json) | — |
| 6 | `r08_early_blowup_signal`: How early can the splits reveal how the race will finish? | strategy | [ext_checkpoint_forecast_validation](../public/data/packs/ext_checkpoint_forecast_validation/pack_meta.json) | — |
| 7 | `r09_bad_patch_recoverable`: When can runners regain their rhythm after a bad patch? | strategy | [ext_bad_patch_recovery](../public/data/packs/ext_bad_patch_recovery/pack_meta.json) | 's11_recover_bad_patch' |
| 8 | `r30_negative_split_success`: Is a negative split always associated with a better performance? | strategy | [ext_split_pattern_success](../public/data/packs/ext_split_pattern_success/pack_meta.json) | — |
| 9 | `r31_multiple_good_strategies`: Is there one good pacing strategy, or several? | strategy | [ext_successful_race_shapes](../public/data/packs/ext_successful_race_shapes/pack_meta.json) | — |
| 10 | `r34_pacing_risk_reward`: Which pacing approaches offer consistency, and which are more variable? | strategy | [ext_strategy_outcome_spread](../public/data/packs/ext_strategy_outcome_spread/pack_meta.json) | — |
| 11 | `s3_course_breaks`: What is each course’s pacing fingerprint? | courses | [ext_course_pacing_profiles](../public/data/packs/ext_course_pacing_profiles/pack_meta.json) | — |
| 12 | `r11_course_section_traps`: How do runners adjust their pace to climbs and descents? | courses | [ext_terrain_pacing_proxy](../public/data/packs/ext_terrain_pacing_proxy/pack_meta.json) | — |
| 13 | `r12_fastest_by_ability`: What would your time be on another course? | courses | [ext_paired_course_comparisons](../public/data/packs/ext_paired_course_comparisons/pack_meta.json) | 's4_time_translation' |
| 14 | `r13_great_day_vs_consistency`: Which marathon offers speed, and which offers consistency? | courses | [ext_course_outcome_spread](../public/data/packs/ext_course_outcome_spread/pack_meta.json) | — |
| 15 | `r14_knowing_course`: Does knowing the course improve execution? | courses | [ext_course_familiarity](../public/data/packs/ext_course_familiarity/pack_meta.json) | — |
| 16 | `r15_weather_penalty_who`: How does weather change the way a marathon is run? | courses | [ext_weather_pacing_patterns](../public/data/packs/ext_weather_pacing_patterns/pack_meta.json) | 's9_weather_penalty' |
| 17 | `s5_pacing_vs_difficult_day`: Was it my pacing or a difficult race day? | courses | [ext_race_day_context](../public/data/packs/ext_race_day_context/pack_meta.json) | — |
| 18 | `r16_groups_hold_or_fall`: How does running with a group shape the race? | courses | No registered extension; missing group/start timing measurements | — |
| 19 | `r33_start_congestion`: How much does the opening crowd shape the rest of the race? | courses | No registered extension; missing group/start timing measurements | — |
| 20 | `r35_course_adaptation`: Are stronger performers better at adjusting their pace to the course? | courses | [ext_course_response_profiles](../public/data/packs/ext_course_response_profiles/pack_meta.json) | — |
| 21 | `r04_on_pace_goal_hits`: Does being on pace mean you will hit your goal? | goals | [ext_checkpoint_outcomes](../public/data/packs/ext_checkpoint_outcomes/pack_meta.json) | 's2_target_odds' |
| 22 | `r06_decided_after_30k`: How much of a marathon is decided after 30 km? | goals | [ext_late_rank_changes](../public/data/packs/ext_late_rank_changes/pack_meta.json) | — |
| 23 | `r17_milestone_kick`: How much finishing speed appears when a milestone is within reach? | goals | [ext_milestone_finishing_speed](../public/data/packs/ext_milestone_finishing_speed/pack_meta.json) | — |
| 24 | `r18_bq_rule_changes`: Do qualifying rules change how people race? | goals | [ext_qualifying_threshold_comparison](../public/data/packs/ext_qualifying_threshold_comparison/pack_meta.json) | — |
| 25 | `s10_goal_slips`: What happens when a goal slips away? | goals | [ext_goal_slip_recovery](../public/data/packs/ext_goal_slip_recovery/pack_meta.json) | — |
| 26 | `r25_huge_kick_next`: Does a strong finish suggest unused capacity? | goals | [ext_strong_finish_followup](../public/data/packs/ext_strong_finish_followup/pack_meta.json) | — |
| 27 | `r07_wall_clock_vs_distance`: Do pacing changes follow distance or elapsed time? | differences | [ext_distance_and_elapsed_change](../public/data/packs/ext_distance_and_elapsed_change/pack_meta.json) | 's6_wall_distance_vs_time' |
| 28 | `r20_pacing_personalities`: Do runners have persistent pacing habits? | differences | [ext_pacing_habit_persistence](../public/data/packs/ext_pacing_habit_persistence/pack_meta.json) | — |
| 29 | `r22_aging_changes`: How do speed and pace retention vary by age? | differences | [ext_age_pacing](../public/data/packs/ext_age_pacing/pack_meta.json) | 's8_age_speed_vs_endurance' |
| 30 | `r23_gender_pacing`: How does pacing differ across recorded gender groups? | differences | [ext_gender_pacing](../public/data/packs/ext_gender_pacing/pack_meta.json) | — |
| 31 | `r19_near_miss_return`: Does a near miss bring people back? | learning | [ext_near_miss_recorded_return](../public/data/packs/ext_near_miss_recorded_return/pack_meta.json) | — |
| 32 | `r21_learn_from_blowup`: What changes as runners gain experience? | learning | [ext_experience_and_pacing](../public/data/packs/ext_experience_and_pacing/pack_meta.json) | 's7_learn_after_blowup' |
| 33 | `r24_interval_after_pb`: How does the previous marathon affect the next one? | learning | [ext_race_spacing_outcomes](../public/data/packs/ext_race_spacing_outcomes/pack_meta.json) | — |
| 34 | `r26_pacing_over_20y`: How have marathon speed and pacing changed over time? | learning | [ext_pacing_over_time](../public/data/packs/ext_pacing_over_time/pack_meta.json) | 's12_pacing_over_20y' |
| 35 | `r32_where_pbs_are_gained`: Where do runners gain the time that produces a personal best? | learning | [ext_earlier_best_section_gains](../public/data/packs/ext_earlier_best_section_gains/pack_meta.json) | — |

## Registered extensions: methods and outputs

### ext_pacing_shapes

How do people actually pace a marathon?

- Producer: [analysis/build_pacing.py](../analysis/build_pacing.py); display question `r10_unravel_typology`.
- Calculated state: **ready**; bundle `private-20260912-0934`; input timestamp `2026-09-12T13:37:16Z`; calculation timestamp `2026-09-12T14:12:22Z`.
- Reported n: **3517336**; observation unit: eligible finishes (consult method for subgroup/pair denominators); evidence scope: descriptive.
- Contracts: [metadata / cohort / provenance](../public/data/packs/ext_pacing_shapes/pack_meta.json); [answer / chart specifications](../public/data/packs/ext_pacing_shapes/summary.json).
- Tables: [patterns.csv](../public/data/packs/ext_pacing_shapes/tables/patterns.csv), [profile.csv](../public/data/packs/ext_pacing_shapes/tables/profile.csv).

Methods and limitations from this pack:

- For each runner, divide section pace by their full-marathon average pace and subtract one. Plot the median of these individual percentages at each checkpoint; zero is that runner’s own marathon pace. A median curve is not itself one runner’s race and need not integrate to zero.
- Compare elapsed time over 0–20 km with 20–40 km. Faster: more than 2% faster; similar: within 2%; moderate slowing: more than 2% through 10%; pronounced slowing: more than 10%. The final 2.195 km appears in the profile but not this equal-distance classification. These are descriptive categories, not slowdown episodes or measured half-marathon splits.
- Use complete, strictly increasing elapsed checkpoints at 5, 10, 15, 20, 25, 30, 35, 40 and 42.195 km. Clock strings must parse as H:MM:SS or M:SS. No missing splits are interpolated.
- Remove exact duplicate race records, ignoring database IDs, ingestion timestamps and source URLs. Retain finishes from 90 minutes to 12 hours with every section between 2 and 20 minutes per km. These quality filters can exclude genuine unusual performances; the analysis describes this eligible cohort, not every entrant.
- Each observation is a race finish. The same person can appear in multiple races. No runner identities are linked across races. Public cells require at least 100 observations; matched comparisons additionally require at least 20 per group in each stratum.
- Apply the reviewed source-quality edition exclusions for this exact export after the timing checks. Known invalid split grids, incomplete ingestion, unreconciled HOLD editions and a selected top-finisher field do not contribute to the analyses or prior benchmarks. Report source exclusions separately; an already invalid timing row is not counted twice. Missing age or recorded gender alone does not exclude an otherwise eligible finish from the overall cohort. Other sparse editions are not declared incomplete merely from their size.

### ext_performance_profiles

What does an unusually good race look like?

- Producer: [analysis/build_extended.py](../analysis/build_extended.py); display question `r05_exceptional_vs_prior`.
- Calculated state: **ready**; bundle `private-20260912-0934`; input timestamp `2026-09-12T13:37:16Z`; calculation timestamp `2026-09-12T14:13:07Z`.
- Reported n: **555437**; observation unit: eligible finishes; evidence scope: descriptive.
- Contracts: [metadata / cohort / provenance](../public/data/packs/ext_performance_profiles/pack_meta.json); [answer / chart specifications](../public/data/packs/ext_performance_profiles/summary.json).
- Tables: [profiles.csv](../public/data/packs/ext_performance_profiles/tables/profiles.csv).

Methods and limitations from this pack:

- Define a substantially improved performance as a finish more than 2% faster than the recent recorded best. Compare each section’s pace with the full-marathon pace of that earlier benchmark, then plot the median by outcome group.
- For explicitly audited canonical-ID releases, validate unique matching CORE/FULL ID sets and matching recorded edition/name labels, then join by record ID with matching finish and all nine section durations. Legacy exports retain the one-to-one edition, trimmed lowercase name and full-timing join because their IDs are incompatible. Durations are compared to milliseconds. Keep only supplied non-ambiguous runner identities without conflicting recorded gender, inferred birth years spanning more than two years, or duplicate editions. These are candidate cross-race identities, not independently verified people; unlinked runners are absent. The linkage audit records which join was used.
- Recompute the benchmark as the fastest eligible finish in the two strictly earlier calendar years. The current race and every other race in its calendar year are excluded. This avoids guessing within-year chronology and prevents current-outcome leakage. It is a recent recorded best, not a fitness measurement, an expected finish, or a lifetime personal best.
- Performance change is 100 × (current finish / recent recorded best − 1). Negative is faster. Opening change compares 0–10 km pace with that earlier best’s full-marathon pace. Faster opening: more than 2% faster; similar: within 2%; slower: more than 2% slower. The ±2% and ±5% cutoffs are predefined descriptions, not physiological thresholds.
- Use complete, strictly increasing elapsed checkpoints at 5, 10, 15, 20, 25, 30, 35, 40 and 42.195 km. Clock strings must parse as H:MM:SS or M:SS. No missing splits are interpolated.
- Remove exact duplicate race records, ignoring database IDs, ingestion timestamps and source URLs. Retain finishes from 90 minutes to 12 hours with every section between 2 and 20 minutes per km. These quality filters can exclude genuine unusual performances; the analysis describes this eligible cohort, not every entrant.
- Full source records are available in public GitHub Releases. These chart tables require at least 100 eligible observations per cell for estimate reliability. Counts refer to finishes, linked pairs or event observations as specified in that answer.
- These are observational results. Fitness changes, intentions, training, selection into the dataset and unmeasured conditions can explain differences. Outcome percentiles describe variation among performances, not confidence intervals or advice about the best strategy.
- Apply the reviewed source-quality edition exclusions for this exact export after the timing checks. Known invalid split grids, incomplete ingestion, unreconciled HOLD editions and a selected top-finisher field do not contribute to the analyses or prior benchmarks. Report source exclusions separately; an already invalid timing row is not counted twice. Missing age or recorded gender alone does not exclude an otherwise eligible finish from the overall cohort. Other sparse editions are not declared incomplete merely from their size.

### ext_opening_tradeoffs

What are the rewards and risks of an aggressive start?

- Producer: [analysis/build_extended.py](../analysis/build_extended.py); display question `r01_banking_time`.
- Calculated state: **ready**; bundle `private-20260912-0934`; input timestamp `2026-09-12T13:37:16Z`; calculation timestamp `2026-09-12T14:13:07Z`.
- Reported n: **375388**; observation unit: eligible finishes; evidence scope: descriptive.
- Contracts: [metadata / cohort / provenance](../public/data/packs/ext_opening_tradeoffs/pack_meta.json); [answer / chart specifications](../public/data/packs/ext_opening_tradeoffs/summary.json).
- Tables: [matched_openings.csv](../public/data/packs/ext_opening_tradeoffs/tables/matched_openings.csv).

Methods and limitations from this pack:

- Match faster, similar and slower openings within city, year, race, recorded gender and 15-minute bands of recent recorded best. Keep strata with at least 20 in all three groups. Weight every group by the smallest group count in that stratum.
- Show the weighted mean percentage change from the prior benchmark. The lower and upper limits are percentile confidence limits from 500 bootstrap draws of whole race editions, seed 20260908. This captures edition clustering but not dependence when the same runner appears in different editions. No multiple-comparison significance claims are made.
- For explicitly audited canonical-ID releases, validate unique matching CORE/FULL ID sets and matching recorded edition/name labels, then join by record ID with matching finish and all nine section durations. Legacy exports retain the one-to-one edition, trimmed lowercase name and full-timing join because their IDs are incompatible. Durations are compared to milliseconds. Keep only supplied non-ambiguous runner identities without conflicting recorded gender, inferred birth years spanning more than two years, or duplicate editions. These are candidate cross-race identities, not independently verified people; unlinked runners are absent. The linkage audit records which join was used.
- Recompute the benchmark as the fastest eligible finish in the two strictly earlier calendar years. The current race and every other race in its calendar year are excluded. This avoids guessing within-year chronology and prevents current-outcome leakage. It is a recent recorded best, not a fitness measurement, an expected finish, or a lifetime personal best.
- Performance change is 100 × (current finish / recent recorded best − 1). Negative is faster. Opening change compares 0–10 km pace with that earlier best’s full-marathon pace. Faster opening: more than 2% faster; similar: within 2%; slower: more than 2% slower. The ±2% and ±5% cutoffs are predefined descriptions, not physiological thresholds.
- Use complete, strictly increasing elapsed checkpoints at 5, 10, 15, 20, 25, 30, 35, 40 and 42.195 km. Clock strings must parse as H:MM:SS or M:SS. No missing splits are interpolated.
- Remove exact duplicate race records, ignoring database IDs, ingestion timestamps and source URLs. Retain finishes from 90 minutes to 12 hours with every section between 2 and 20 minutes per km. These quality filters can exclude genuine unusual performances; the analysis describes this eligible cohort, not every entrant.
- Full source records are available in public GitHub Releases. These chart tables require at least 100 eligible observations per cell for estimate reliability. Counts refer to finishes, linked pairs or event observations as specified in that answer.
- These are observational results. Fitness changes, intentions, training, selection into the dataset and unmeasured conditions can explain differences. Outcome percentiles describe variation among performances, not confidence intervals or advice about the best strategy.
- Apply the reviewed source-quality edition exclusions for this exact export after the timing checks. Known invalid split grids, incomplete ingestion, unreconciled HOLD editions and a selected top-finisher field do not contribute to the analyses or prior benchmarks. Report source exclusions separately; an already invalid timing row is not counted twice. Missing age or recorded gender alone does not exclude an otherwise eligible finish from the overall cohort. Other sparse editions are not declared incomplete merely from their size.

### ext_slow_start_responses

How do runners successfully respond to a slow start?

- Producer: [analysis/build_extended.py](../analysis/build_extended.py); display question `r02_recover_slow_start`.
- Calculated state: **ready**; bundle `private-20260912-0934`; input timestamp `2026-09-12T13:37:16Z`; calculation timestamp `2026-09-12T14:13:07Z`.
- Reported n: **49164**; observation unit: eligible finishes; evidence scope: descriptive.
- Contracts: [metadata / cohort / provenance](../public/data/packs/ext_slow_start_responses/pack_meta.json); [answer / chart specifications](../public/data/packs/ext_slow_start_responses/summary.json).
- Tables: [responses.csv](../public/data/packs/ext_slow_start_responses/tables/responses.csv).

Methods and limitations from this pack:

- A slow start is 0–5 km pace more than 5% slower than the earlier benchmark’s average. Group the change from 0–5 to 5–10 km as more than 5% acceleration, 2–5% acceleration, or less acceleration/slowing. Plot the 10th, 50th and 90th percentiles of final performance change. These groups are not matched on course or fitness.
- For explicitly audited canonical-ID releases, validate unique matching CORE/FULL ID sets and matching recorded edition/name labels, then join by record ID with matching finish and all nine section durations. Legacy exports retain the one-to-one edition, trimmed lowercase name and full-timing join because their IDs are incompatible. Durations are compared to milliseconds. Keep only supplied non-ambiguous runner identities without conflicting recorded gender, inferred birth years spanning more than two years, or duplicate editions. These are candidate cross-race identities, not independently verified people; unlinked runners are absent. The linkage audit records which join was used.
- Recompute the benchmark as the fastest eligible finish in the two strictly earlier calendar years. The current race and every other race in its calendar year are excluded. This avoids guessing within-year chronology and prevents current-outcome leakage. It is a recent recorded best, not a fitness measurement, an expected finish, or a lifetime personal best.
- Performance change is 100 × (current finish / recent recorded best − 1). Negative is faster. Opening change compares 0–10 km pace with that earlier best’s full-marathon pace. Faster opening: more than 2% faster; similar: within 2%; slower: more than 2% slower. The ±2% and ±5% cutoffs are predefined descriptions, not physiological thresholds.
- Use complete, strictly increasing elapsed checkpoints at 5, 10, 15, 20, 25, 30, 35, 40 and 42.195 km. Clock strings must parse as H:MM:SS or M:SS. No missing splits are interpolated.
- Remove exact duplicate race records, ignoring database IDs, ingestion timestamps and source URLs. Retain finishes from 90 minutes to 12 hours with every section between 2 and 20 minutes per km. These quality filters can exclude genuine unusual performances; the analysis describes this eligible cohort, not every entrant.
- Full source records are available in public GitHub Releases. These chart tables require at least 100 eligible observations per cell for estimate reliability. Counts refer to finishes, linked pairs or event observations as specified in that answer.
- These are observational results. Fitness changes, intentions, training, selection into the dataset and unmeasured conditions can explain differences. Outcome percentiles describe variation among performances, not confidence intervals or advice about the best strategy.
- Apply the reviewed source-quality edition exclusions for this exact export after the timing checks. Known invalid split grids, incomplete ingestion, unreconciled HOLD editions and a selected top-finisher field do not contribute to the analyses or prior benchmarks. Report source exclusions separately; an already invalid timing row is not counted twice. Missing age or recorded gender alone does not exclude an otherwise eligible finish from the overall cohort. Other sparse editions are not declared incomplete merely from their size.

### ext_pace_trend_at_20k

Can two runners reach 20 km together but have different prospects?

- Producer: [analysis/build_pacing.py](../analysis/build_pacing.py); display question `r03_accel_vs_decel_20k`.
- Calculated state: **ready**; bundle `private-20260912-0934`; input timestamp `2026-09-12T13:37:16Z`; calculation timestamp `2026-09-12T14:12:22Z`.
- Reported n: **1920435**; observation unit: eligible finishes (consult method for subgroup/pair denominators); evidence scope: descriptive.
- Contracts: [metadata / cohort / provenance](../public/data/packs/ext_pace_trend_at_20k/pack_meta.json); [answer / chart specifications](../public/data/packs/ext_pace_trend_at_20k/summary.json).
- Tables: [matched_trends.csv](../public/data/packs/ext_pace_trend_at_20k/tables/matched_trends.csv).

Methods and limitations from this pack:

- Compare the 15–20 km pace with 10–15 km. Accelerating is more than 2% faster, slowing more than 2% slower, and steady within 2%. Match within city, year, race and the same floored minute of elapsed time at 20 km.
- Only strata with at least 20 finishes in each of the three groups qualify. Use the smallest group count as each stratum’s common weight for all three groups, then average the within-stratum finish-time differences versus steady. Sample counts are actual observations, not matching weights.
- Runners arrive within the same 60-second band, not at an identical instant. Prior fitness and runner intention are unknown. This is a conditional association, not proof that accelerating causes a better finish or an out-of-sample prediction.
- Use complete, strictly increasing elapsed checkpoints at 5, 10, 15, 20, 25, 30, 35, 40 and 42.195 km. Clock strings must parse as H:MM:SS or M:SS. No missing splits are interpolated.
- Remove exact duplicate race records, ignoring database IDs, ingestion timestamps and source URLs. Retain finishes from 90 minutes to 12 hours with every section between 2 and 20 minutes per km. These quality filters can exclude genuine unusual performances; the analysis describes this eligible cohort, not every entrant.
- Each observation is a race finish. The same person can appear in multiple races. No runner identities are linked across races. Public cells require at least 100 observations; matched comparisons additionally require at least 20 per group in each stratum.
- Apply the reviewed source-quality edition exclusions for this exact export after the timing checks. Known invalid split grids, incomplete ingestion, unreconciled HOLD editions and a selected top-finisher field do not contribute to the analyses or prior benchmarks. Report source exclusions separately; an already invalid timing row is not counted twice. Missing age or recorded gender alone does not exclude an otherwise eligible finish from the overall cohort. Other sparse editions are not declared incomplete merely from their size.

### ext_checkpoint_forecast_validation

How early can the splits reveal how the race will finish?

- Producer: [analysis/build_extended.py](../analysis/build_extended.py); display question `r08_early_blowup_signal`.
- Calculated state: **ready**; bundle `private-20260912-0934`; input timestamp `2026-09-12T13:37:16Z`; calculation timestamp `2026-09-12T14:13:07Z`.
- Reported n: **869761**; observation unit: eligible finishes; evidence scope: validated forecast.
- Contracts: [metadata / cohort / provenance](../public/data/packs/ext_checkpoint_forecast_validation/pack_meta.json); [answer / chart specifications](../public/data/packs/ext_checkpoint_forecast_validation/summary.json).
- Tables: [calibration.csv](../public/data/packs/ext_checkpoint_forecast_validation/tables/calibration.csv), [errors.csv](../public/data/packs/ext_checkpoint_forecast_validation/tables/errors.csv).

Methods and limitations from this pack:

- At each checkpoint, start with elapsed time × 42.195 / distance. The elapsed-only model multiplies this by the training median actual/projected ratio in 30-second-per-km elapsed-pace bands. The trend model adds the most recent section’s change from the previous section (faster than −2%, within ±2%, or slower than +2%). At 5 km no trend exists.
- Hold out the latest three observed calendar years (2024–2026). Fit every factor and the 10th–90th percentile ratio interval on earlier years only. Training cells need at least 100 records; missing trend cells fall back to the pace-band model, then the pooled training model. No future splits, finishing-time groups, identities or supplied ability fields enter a prediction.
- Report median absolute error for all three methods, plus observed coverage and median width of the nominal 80% prediction interval and the 90th percentile absolute error. Model selection is fixed before examining these results. A runner may occur in training and test in different years; identities are not used. Results apply to complete eligible finishers and do not predict withdrawals.
- Use complete, strictly increasing elapsed checkpoints at 5, 10, 15, 20, 25, 30, 35, 40 and 42.195 km. Clock strings must parse as H:MM:SS or M:SS. No missing splits are interpolated.
- Remove exact duplicate race records, ignoring database IDs, ingestion timestamps and source URLs. Retain finishes from 90 minutes to 12 hours with every section between 2 and 20 minutes per km. These quality filters can exclude genuine unusual performances; the analysis describes this eligible cohort, not every entrant.
- Full source records are available in public GitHub Releases. These chart tables require at least 100 eligible observations per cell for estimate reliability. Counts refer to finishes, linked pairs or event observations as specified in that answer.
- These are observational results. Fitness changes, intentions, training, selection into the dataset and unmeasured conditions can explain differences. Outcome percentiles describe variation among performances, not confidence intervals or advice about the best strategy.
- Apply the reviewed source-quality edition exclusions for this exact export after the timing checks. Known invalid split grids, incomplete ingestion, unreconciled HOLD editions and a selected top-finisher field do not contribute to the analyses or prior benchmarks. Report source exclusions separately; an already invalid timing row is not counted twice. Missing age or recorded gender alone does not exclude an otherwise eligible finish from the overall cohort. Other sparse editions are not declared incomplete merely from their size.

### ext_bad_patch_recovery

When can runners regain their rhythm after a bad patch?

- Producer: [analysis/build_extended.py](../analysis/build_extended.py); display question `r09_bad_patch_recoverable`.
- Calculated state: **ready**; bundle `private-20260912-0934`; input timestamp `2026-09-12T13:37:16Z`; calculation timestamp `2026-09-12T14:13:07Z`.
- Reported n: **1084906**; observation unit: eligible finishes; evidence scope: descriptive.
- Contracts: [metadata / cohort / provenance](../public/data/packs/ext_bad_patch_recovery/pack_meta.json); [answer / chart specifications](../public/data/packs/ext_bad_patch_recovery/summary.json).
- Tables: [recovery.csv](../public/data/packs/ext_bad_patch_recovery/tables/recovery.csv).

Methods and limitations from this pack:

- Scan 20–25, 25–30 and 30–35 km in order. A patch is the first section more than 10% slower than both the immediately preceding section and the 5–20 km baseline pace. Recovery means the next full 5 km is no more than 5% slower than that baseline.
- Every runner contributes at most one patch. The outcome is next-section recovery, not a diagnosis or necessarily a return maintained to the finish. Course sections and different runner mixes can account for differences across distances. Five-kilometer timing cannot distinguish stops, walking, fatigue or terrain.
- Use complete, strictly increasing elapsed checkpoints at 5, 10, 15, 20, 25, 30, 35, 40 and 42.195 km. Clock strings must parse as H:MM:SS or M:SS. No missing splits are interpolated.
- Remove exact duplicate race records, ignoring database IDs, ingestion timestamps and source URLs. Retain finishes from 90 minutes to 12 hours with every section between 2 and 20 minutes per km. These quality filters can exclude genuine unusual performances; the analysis describes this eligible cohort, not every entrant.
- Full source records are available in public GitHub Releases. These chart tables require at least 100 eligible observations per cell for estimate reliability. Counts refer to finishes, linked pairs or event observations as specified in that answer.
- These are observational results. Fitness changes, intentions, training, selection into the dataset and unmeasured conditions can explain differences. Outcome percentiles describe variation among performances, not confidence intervals or advice about the best strategy.
- Apply the reviewed source-quality edition exclusions for this exact export after the timing checks. Known invalid split grids, incomplete ingestion, unreconciled HOLD editions and a selected top-finisher field do not contribute to the analyses or prior benchmarks. Report source exclusions separately; an already invalid timing row is not counted twice. Missing age or recorded gender alone does not exclude an otherwise eligible finish from the overall cohort. Other sparse editions are not declared incomplete merely from their size.

### ext_split_pattern_success

Is a negative split always associated with a better performance?

- Producer: [analysis/build_extended.py](../analysis/build_extended.py); display question `r30_negative_split_success`.
- Calculated state: **ready**; bundle `private-20260912-0934`; input timestamp `2026-09-12T13:37:16Z`; calculation timestamp `2026-09-12T14:13:07Z`.
- Reported n: **555437**; observation unit: eligible finishes; evidence scope: descriptive.
- Contracts: [metadata / cohort / provenance](../public/data/packs/ext_split_pattern_success/pack_meta.json); [answer / chart specifications](../public/data/packs/ext_split_pattern_success/summary.json).
- Tables: [success_rates.csv](../public/data/packs/ext_split_pattern_success/tables/success_rates.csv).

Methods and limitations from this pack:

- Within each complete-race pattern, divide finishes more than 2% faster than the earlier benchmark by all linked finishes with that pattern. This conditions on a pattern known after the finish; it is a retrospective association, not a pre-race strategy trial.
- For explicitly audited canonical-ID releases, validate unique matching CORE/FULL ID sets and matching recorded edition/name labels, then join by record ID with matching finish and all nine section durations. Legacy exports retain the one-to-one edition, trimmed lowercase name and full-timing join because their IDs are incompatible. Durations are compared to milliseconds. Keep only supplied non-ambiguous runner identities without conflicting recorded gender, inferred birth years spanning more than two years, or duplicate editions. These are candidate cross-race identities, not independently verified people; unlinked runners are absent. The linkage audit records which join was used.
- Recompute the benchmark as the fastest eligible finish in the two strictly earlier calendar years. The current race and every other race in its calendar year are excluded. This avoids guessing within-year chronology and prevents current-outcome leakage. It is a recent recorded best, not a fitness measurement, an expected finish, or a lifetime personal best.
- Performance change is 100 × (current finish / recent recorded best − 1). Negative is faster. Opening change compares 0–10 km pace with that earlier best’s full-marathon pace. Faster opening: more than 2% faster; similar: within 2%; slower: more than 2% slower. The ±2% and ±5% cutoffs are predefined descriptions, not physiological thresholds.
- Use complete, strictly increasing elapsed checkpoints at 5, 10, 15, 20, 25, 30, 35, 40 and 42.195 km. Clock strings must parse as H:MM:SS or M:SS. No missing splits are interpolated.
- Remove exact duplicate race records, ignoring database IDs, ingestion timestamps and source URLs. Retain finishes from 90 minutes to 12 hours with every section between 2 and 20 minutes per km. These quality filters can exclude genuine unusual performances; the analysis describes this eligible cohort, not every entrant.
- Full source records are available in public GitHub Releases. These chart tables require at least 100 eligible observations per cell for estimate reliability. Counts refer to finishes, linked pairs or event observations as specified in that answer.
- These are observational results. Fitness changes, intentions, training, selection into the dataset and unmeasured conditions can explain differences. Outcome percentiles describe variation among performances, not confidence intervals or advice about the best strategy.
- Apply the reviewed source-quality edition exclusions for this exact export after the timing checks. Known invalid split grids, incomplete ingestion, unreconciled HOLD editions and a selected top-finisher field do not contribute to the analyses or prior benchmarks. Report source exclusions separately; an already invalid timing row is not counted twice. Missing age or recorded gender alone does not exclude an otherwise eligible finish from the overall cohort. Other sparse editions are not declared incomplete merely from their size.

### ext_successful_race_shapes

Is there one good pacing strategy, or several?

- Producer: [analysis/build_extended.py](../analysis/build_extended.py); display question `r31_multiple_good_strategies`.
- Calculated state: **ready**; bundle `private-20260912-0934`; input timestamp `2026-09-12T13:37:16Z`; calculation timestamp `2026-09-12T14:13:07Z`.
- Reported n: **182246**; observation unit: eligible finishes; evidence scope: descriptive.
- Contracts: [metadata / cohort / provenance](../public/data/packs/ext_successful_race_shapes/pack_meta.json); [answer / chart specifications](../public/data/packs/ext_successful_race_shapes/summary.json).
- Tables: [pattern_mix.csv](../public/data/packs/ext_successful_race_shapes/tables/pattern_mix.csv).

Methods and limitations from this pack:

- Restrict to finishes more than 2% faster than the recent recorded best. Divide the number in each equal-distance pattern by all such improved finishes. Suppress any pattern with fewer than 100 improved finishes; if a pattern is suppressed, visible shares need not sum to 100.
- For explicitly audited canonical-ID releases, validate unique matching CORE/FULL ID sets and matching recorded edition/name labels, then join by record ID with matching finish and all nine section durations. Legacy exports retain the one-to-one edition, trimmed lowercase name and full-timing join because their IDs are incompatible. Durations are compared to milliseconds. Keep only supplied non-ambiguous runner identities without conflicting recorded gender, inferred birth years spanning more than two years, or duplicate editions. These are candidate cross-race identities, not independently verified people; unlinked runners are absent. The linkage audit records which join was used.
- Recompute the benchmark as the fastest eligible finish in the two strictly earlier calendar years. The current race and every other race in its calendar year are excluded. This avoids guessing within-year chronology and prevents current-outcome leakage. It is a recent recorded best, not a fitness measurement, an expected finish, or a lifetime personal best.
- Performance change is 100 × (current finish / recent recorded best − 1). Negative is faster. Opening change compares 0–10 km pace with that earlier best’s full-marathon pace. Faster opening: more than 2% faster; similar: within 2%; slower: more than 2% slower. The ±2% and ±5% cutoffs are predefined descriptions, not physiological thresholds.
- Use complete, strictly increasing elapsed checkpoints at 5, 10, 15, 20, 25, 30, 35, 40 and 42.195 km. Clock strings must parse as H:MM:SS or M:SS. No missing splits are interpolated.
- Remove exact duplicate race records, ignoring database IDs, ingestion timestamps and source URLs. Retain finishes from 90 minutes to 12 hours with every section between 2 and 20 minutes per km. These quality filters can exclude genuine unusual performances; the analysis describes this eligible cohort, not every entrant.
- Full source records are available in public GitHub Releases. These chart tables require at least 100 eligible observations per cell for estimate reliability. Counts refer to finishes, linked pairs or event observations as specified in that answer.
- These are observational results. Fitness changes, intentions, training, selection into the dataset and unmeasured conditions can explain differences. Outcome percentiles describe variation among performances, not confidence intervals or advice about the best strategy.
- Apply the reviewed source-quality edition exclusions for this exact export after the timing checks. Known invalid split grids, incomplete ingestion, unreconciled HOLD editions and a selected top-finisher field do not contribute to the analyses or prior benchmarks. Report source exclusions separately; an already invalid timing row is not counted twice. Missing age or recorded gender alone does not exclude an otherwise eligible finish from the overall cohort. Other sparse editions are not declared incomplete merely from their size.

### ext_strategy_outcome_spread

Which pacing approaches offer consistency, and which are more variable?

- Producer: [analysis/build_extended.py](../analysis/build_extended.py); display question `r34_pacing_risk_reward`.
- Calculated state: **ready**; bundle `private-20260912-0934`; input timestamp `2026-09-12T13:37:16Z`; calculation timestamp `2026-09-12T14:13:07Z`.
- Reported n: **555437**; observation unit: eligible finishes; evidence scope: descriptive.
- Contracts: [metadata / cohort / provenance](../public/data/packs/ext_strategy_outcome_spread/pack_meta.json); [answer / chart specifications](../public/data/packs/ext_strategy_outcome_spread/summary.json).
- Tables: [shortfalls.csv](../public/data/packs/ext_strategy_outcome_spread/tables/shortfalls.csv), [spread.csv](../public/data/packs/ext_strategy_outcome_spread/tables/spread.csv).

Methods and limitations from this pack:

- Within each prior-time band and opening group, calculate the 10th, 50th and 90th percentiles of finish-time percentage change. Also calculate the share more than 5% slower than the earlier benchmark. These distributions are unadjusted for course and edition, and describe observed finishers only.
- For explicitly audited canonical-ID releases, validate unique matching CORE/FULL ID sets and matching recorded edition/name labels, then join by record ID with matching finish and all nine section durations. Legacy exports retain the one-to-one edition, trimmed lowercase name and full-timing join because their IDs are incompatible. Durations are compared to milliseconds. Keep only supplied non-ambiguous runner identities without conflicting recorded gender, inferred birth years spanning more than two years, or duplicate editions. These are candidate cross-race identities, not independently verified people; unlinked runners are absent. The linkage audit records which join was used.
- Recompute the benchmark as the fastest eligible finish in the two strictly earlier calendar years. The current race and every other race in its calendar year are excluded. This avoids guessing within-year chronology and prevents current-outcome leakage. It is a recent recorded best, not a fitness measurement, an expected finish, or a lifetime personal best.
- Performance change is 100 × (current finish / recent recorded best − 1). Negative is faster. Opening change compares 0–10 km pace with that earlier best’s full-marathon pace. Faster opening: more than 2% faster; similar: within 2%; slower: more than 2% slower. The ±2% and ±5% cutoffs are predefined descriptions, not physiological thresholds.
- Use complete, strictly increasing elapsed checkpoints at 5, 10, 15, 20, 25, 30, 35, 40 and 42.195 km. Clock strings must parse as H:MM:SS or M:SS. No missing splits are interpolated.
- Remove exact duplicate race records, ignoring database IDs, ingestion timestamps and source URLs. Retain finishes from 90 minutes to 12 hours with every section between 2 and 20 minutes per km. These quality filters can exclude genuine unusual performances; the analysis describes this eligible cohort, not every entrant.
- Full source records are available in public GitHub Releases. These chart tables require at least 100 eligible observations per cell for estimate reliability. Counts refer to finishes, linked pairs or event observations as specified in that answer.
- These are observational results. Fitness changes, intentions, training, selection into the dataset and unmeasured conditions can explain differences. Outcome percentiles describe variation among performances, not confidence intervals or advice about the best strategy.
- Apply the reviewed source-quality edition exclusions for this exact export after the timing checks. Known invalid split grids, incomplete ingestion, unreconciled HOLD editions and a selected top-finisher field do not contribute to the analyses or prior benchmarks. Report source exclusions separately; an already invalid timing row is not counted twice. Missing age or recorded gender alone does not exclude an otherwise eligible finish from the overall cohort. Other sparse editions are not declared incomplete merely from their size.

### ext_course_pacing_profiles

What is each course’s pacing fingerprint?

- Producer: [analysis/build_pacing.py](../analysis/build_pacing.py); display question `s3_course_breaks`.
- Calculated state: **ready**; bundle `private-20260912-0934`; input timestamp `2026-09-12T13:37:16Z`; calculation timestamp `2026-09-12T14:12:22Z`.
- Reported n: **3517336**; observation unit: eligible finishes (consult method for subgroup/pair denominators); evidence scope: descriptive.
- Contracts: [metadata / cohort / provenance](../public/data/packs/ext_course_pacing_profiles/pack_meta.json); [answer / chart specifications](../public/data/packs/ext_course_pacing_profiles/summary.json).
- Tables: [course_profiles.csv](../public/data/packs/ext_course_pacing_profiles/tables/course_profiles.csv).

Methods and limitations from this pack:

- Compute individual section pace relative to each runner’s full-marathon average, then take the median by city and section. Every checkpoint within a city uses the same complete-record cohort.
- Cities pool available race editions. Terrain, weather, field composition and route changes are not separated. Course-profile validity years are absent from CORE, so historical elevation has not been assigned to these runners.
- Use complete, strictly increasing elapsed checkpoints at 5, 10, 15, 20, 25, 30, 35, 40 and 42.195 km. Clock strings must parse as H:MM:SS or M:SS. No missing splits are interpolated.
- Remove exact duplicate race records, ignoring database IDs, ingestion timestamps and source URLs. Retain finishes from 90 minutes to 12 hours with every section between 2 and 20 minutes per km. These quality filters can exclude genuine unusual performances; the analysis describes this eligible cohort, not every entrant.
- Each observation is a race finish. The same person can appear in multiple races. No runner identities are linked across races. Public cells require at least 100 observations; matched comparisons additionally require at least 20 per group in each stratum.
- Apply the reviewed source-quality edition exclusions for this exact export after the timing checks. Known invalid split grids, incomplete ingestion, unreconciled HOLD editions and a selected top-finisher field do not contribute to the analyses or prior benchmarks. Report source exclusions separately; an already invalid timing row is not counted twice. Missing age or recorded gender alone does not exclude an otherwise eligible finish from the overall cohort. Other sparse editions are not declared incomplete merely from their size.

### ext_terrain_pacing_proxy

How do runners adjust their pace to climbs and descents?

- Producer: [analysis/build_extended.py](../analysis/build_extended.py); display question `r11_course_section_traps`.
- Calculated state: **ready**; bundle `private-20260912-0934`; input timestamp `2026-09-12T13:37:16Z`; calculation timestamp `2026-09-12T14:13:07Z`.
- Reported n: **3514374**; observation unit: eligible finishes; evidence scope: route proxy.
- Contracts: [metadata / cohort / provenance](../public/data/packs/ext_terrain_pacing_proxy/pack_meta.json); [answer / chart specifications](../public/data/packs/ext_terrain_pacing_proxy/summary.json).
- Tables: [terrain.csv](../public/data/packs/ext_terrain_pacing_proxy/tables/terrain.csv).

Methods and limitations from this pack:

- Join a unique supplied course segment by city and exact checkpoint distance. Classify net grade above +0.15% as uphill, below −0.15% as downhill and the remainder near level. At each distance, plot median individual section pace relative to that runner’s full-marathon average.
- The course profiles use GPX geometry and digital elevation models, sometimes smoothed over 800 m. Net grade conceals mixed climbs and descents; bridge decks, tunnels and route changes may be wrong. Historical races are compared with the available city profile as a proxy only. Different terrain groups contain different courses and fields; no causal hill penalty or physiological effort is inferred.
- Use complete, strictly increasing elapsed checkpoints at 5, 10, 15, 20, 25, 30, 35, 40 and 42.195 km. Clock strings must parse as H:MM:SS or M:SS. No missing splits are interpolated.
- Remove exact duplicate race records, ignoring database IDs, ingestion timestamps and source URLs. Retain finishes from 90 minutes to 12 hours with every section between 2 and 20 minutes per km. These quality filters can exclude genuine unusual performances; the analysis describes this eligible cohort, not every entrant.
- Full source records are available in public GitHub Releases. These chart tables require at least 100 eligible observations per cell for estimate reliability. Counts refer to finishes, linked pairs or event observations as specified in that answer.
- These are observational results. Fitness changes, intentions, training, selection into the dataset and unmeasured conditions can explain differences. Outcome percentiles describe variation among performances, not confidence intervals or advice about the best strategy.
- Apply the reviewed source-quality edition exclusions for this exact export after the timing checks. Known invalid split grids, incomplete ingestion, unreconciled HOLD editions and a selected top-finisher field do not contribute to the analyses or prior benchmarks. Report source exclusions separately; an already invalid timing row is not counted twice. Missing age or recorded gender alone does not exclude an otherwise eligible finish from the overall cohort. Other sparse editions are not declared incomplete merely from their size.

### ext_paired_course_comparisons

What would your time be on another course?

- Producer: [analysis/build_extended.py](../analysis/build_extended.py); display question `r12_fastest_by_ability`.
- Calculated state: **ready**; bundle `private-20260912-0934`; input timestamp `2026-09-12T13:37:16Z`; calculation timestamp `2026-09-12T14:13:07Z`.
- Reported n: **85672**; observation unit: linked race pairs; evidence scope: partial comparison.
- Contracts: [metadata / cohort / provenance](../public/data/packs/ext_paired_course_comparisons/pack_meta.json); [answer / chart specifications](../public/data/packs/ext_paired_course_comparisons/summary.json).
- Tables: [course_pairs.csv](../public/data/packs/ext_paired_course_comparisons/tables/course_pairs.csv).

Methods and limitations from this pack:

- Use consecutive linked races in different calendar years, at most three years apart, with one recorded eligible race in each endpoint year. For each course pair, calculate the mean destination-minus-origin finish time separately for runners taking each race order, then average those two means equally.
- Require at least 20 pairs in each order and at least 100 overall. Balancing order reduces simple order imbalance but cannot remove fitness, weather, aging, motivation or entry-selection effects. The same runner can supply more than one pair. Positive means a slower finish at the destination.
- For explicitly audited canonical-ID releases, validate unique matching CORE/FULL ID sets and matching recorded edition/name labels, then join by record ID with matching finish and all nine section durations. Legacy exports retain the one-to-one edition, trimmed lowercase name and full-timing join because their IDs are incompatible. Durations are compared to milliseconds. Keep only supplied non-ambiguous runner identities without conflicting recorded gender, inferred birth years spanning more than two years, or duplicate editions. These are candidate cross-race identities, not independently verified people; unlinked runners are absent. The linkage audit records which join was used.
- Use complete, strictly increasing elapsed checkpoints at 5, 10, 15, 20, 25, 30, 35, 40 and 42.195 km. Clock strings must parse as H:MM:SS or M:SS. No missing splits are interpolated.
- Remove exact duplicate race records, ignoring database IDs, ingestion timestamps and source URLs. Retain finishes from 90 minutes to 12 hours with every section between 2 and 20 minutes per km. These quality filters can exclude genuine unusual performances; the analysis describes this eligible cohort, not every entrant.
- Full source records are available in public GitHub Releases. These chart tables require at least 100 eligible observations per cell for estimate reliability. Counts refer to finishes, linked pairs or event observations as specified in that answer.
- These are observational results. Fitness changes, intentions, training, selection into the dataset and unmeasured conditions can explain differences. Outcome percentiles describe variation among performances, not confidence intervals or advice about the best strategy.
- Apply the reviewed source-quality edition exclusions for this exact export after the timing checks. Known invalid split grids, incomplete ingestion, unreconciled HOLD editions and a selected top-finisher field do not contribute to the analyses or prior benchmarks. Report source exclusions separately; an already invalid timing row is not counted twice. Missing age or recorded gender alone does not exclude an otherwise eligible finish from the overall cohort. Other sparse editions are not declared incomplete merely from their size.

### ext_course_outcome_spread

Which marathon offers speed, and which offers consistency?

- Producer: [analysis/build_extended.py](../analysis/build_extended.py); display question `r13_great_day_vs_consistency`.
- Calculated state: **ready**; bundle `private-20260912-0934`; input timestamp `2026-09-12T13:37:16Z`; calculation timestamp `2026-09-12T14:13:07Z`.
- Reported n: **555437**; observation unit: eligible finishes; evidence scope: descriptive.
- Contracts: [metadata / cohort / provenance](../public/data/packs/ext_course_outcome_spread/pack_meta.json); [answer / chart specifications](../public/data/packs/ext_course_outcome_spread/summary.json).
- Tables: [course_spread.csv](../public/data/packs/ext_course_outcome_spread/tables/course_spread.csv).

Methods and limitations from this pack:

- Within city and prior-time band, report the 10th, 50th and 90th percentiles of finish-time change versus the earlier benchmark. Pool available editions and require at least 100 observations per city and band. A wide percentile range describes individual variation, not uncertainty in the median.
- For explicitly audited canonical-ID releases, validate unique matching CORE/FULL ID sets and matching recorded edition/name labels, then join by record ID with matching finish and all nine section durations. Legacy exports retain the one-to-one edition, trimmed lowercase name and full-timing join because their IDs are incompatible. Durations are compared to milliseconds. Keep only supplied non-ambiguous runner identities without conflicting recorded gender, inferred birth years spanning more than two years, or duplicate editions. These are candidate cross-race identities, not independently verified people; unlinked runners are absent. The linkage audit records which join was used.
- Recompute the benchmark as the fastest eligible finish in the two strictly earlier calendar years. The current race and every other race in its calendar year are excluded. This avoids guessing within-year chronology and prevents current-outcome leakage. It is a recent recorded best, not a fitness measurement, an expected finish, or a lifetime personal best.
- Performance change is 100 × (current finish / recent recorded best − 1). Negative is faster. Opening change compares 0–10 km pace with that earlier best’s full-marathon pace. Faster opening: more than 2% faster; similar: within 2%; slower: more than 2% slower. The ±2% and ±5% cutoffs are predefined descriptions, not physiological thresholds.
- Use complete, strictly increasing elapsed checkpoints at 5, 10, 15, 20, 25, 30, 35, 40 and 42.195 km. Clock strings must parse as H:MM:SS or M:SS. No missing splits are interpolated.
- Remove exact duplicate race records, ignoring database IDs, ingestion timestamps and source URLs. Retain finishes from 90 minutes to 12 hours with every section between 2 and 20 minutes per km. These quality filters can exclude genuine unusual performances; the analysis describes this eligible cohort, not every entrant.
- Full source records are available in public GitHub Releases. These chart tables require at least 100 eligible observations per cell for estimate reliability. Counts refer to finishes, linked pairs or event observations as specified in that answer.
- These are observational results. Fitness changes, intentions, training, selection into the dataset and unmeasured conditions can explain differences. Outcome percentiles describe variation among performances, not confidence intervals or advice about the best strategy.
- Apply the reviewed source-quality edition exclusions for this exact export after the timing checks. Known invalid split grids, incomplete ingestion, unreconciled HOLD editions and a selected top-finisher field do not contribute to the analyses or prior benchmarks. Report source exclusions separately; an already invalid timing row is not counted twice. Missing age or recorded gender alone does not exclude an otherwise eligible finish from the overall cohort. Other sparse editions are not declared incomplete merely from their size.

### ext_course_familiarity

Does knowing the course improve execution?

- Producer: [analysis/build_extended.py](../analysis/build_extended.py); display question `r14_knowing_course`.
- Calculated state: **ready**; bundle `private-20260912-0934`; input timestamp `2026-09-12T13:37:16Z`; calculation timestamp `2026-09-12T14:13:07Z`.
- Reported n: **263490**; observation unit: eligible finishes; evidence scope: descriptive.
- Contracts: [metadata / cohort / provenance](../public/data/packs/ext_course_familiarity/pack_meta.json); [answer / chart specifications](../public/data/packs/ext_course_familiarity/summary.json).
- Tables: [familiarity.csv](../public/data/packs/ext_course_familiarity/tables/familiarity.csv).

Methods and limitations from this pack:

- Familiar means at least one eligible linked appearance in the same city in an earlier calendar year. Match familiar and first-recorded groups within edition, recorded gender and 15-minute prior-time bands; each group needs 20 finishes per stratum. Use the smaller stratum count as a common weight.
- The outcome is mean percentage change from 0–20 to 20–40 km. Both groups have some prior recorded marathon history, but familiarity itself is not randomly assigned. Route changes and visits absent from the dataset are unknown.
- For explicitly audited canonical-ID releases, validate unique matching CORE/FULL ID sets and matching recorded edition/name labels, then join by record ID with matching finish and all nine section durations. Legacy exports retain the one-to-one edition, trimmed lowercase name and full-timing join because their IDs are incompatible. Durations are compared to milliseconds. Keep only supplied non-ambiguous runner identities without conflicting recorded gender, inferred birth years spanning more than two years, or duplicate editions. These are candidate cross-race identities, not independently verified people; unlinked runners are absent. The linkage audit records which join was used.
- Recompute the benchmark as the fastest eligible finish in the two strictly earlier calendar years. The current race and every other race in its calendar year are excluded. This avoids guessing within-year chronology and prevents current-outcome leakage. It is a recent recorded best, not a fitness measurement, an expected finish, or a lifetime personal best.
- Performance change is 100 × (current finish / recent recorded best − 1). Negative is faster. Opening change compares 0–10 km pace with that earlier best’s full-marathon pace. Faster opening: more than 2% faster; similar: within 2%; slower: more than 2% slower. The ±2% and ±5% cutoffs are predefined descriptions, not physiological thresholds.
- Use complete, strictly increasing elapsed checkpoints at 5, 10, 15, 20, 25, 30, 35, 40 and 42.195 km. Clock strings must parse as H:MM:SS or M:SS. No missing splits are interpolated.
- Remove exact duplicate race records, ignoring database IDs, ingestion timestamps and source URLs. Retain finishes from 90 minutes to 12 hours with every section between 2 and 20 minutes per km. These quality filters can exclude genuine unusual performances; the analysis describes this eligible cohort, not every entrant.
- Full source records are available in public GitHub Releases. These chart tables require at least 100 eligible observations per cell for estimate reliability. Counts refer to finishes, linked pairs or event observations as specified in that answer.
- These are observational results. Fitness changes, intentions, training, selection into the dataset and unmeasured conditions can explain differences. Outcome percentiles describe variation among performances, not confidence intervals or advice about the best strategy.
- Apply the reviewed source-quality edition exclusions for this exact export after the timing checks. Known invalid split grids, incomplete ingestion, unreconciled HOLD editions and a selected top-finisher field do not contribute to the analyses or prior benchmarks. Report source exclusions separately; an already invalid timing row is not counted twice. Missing age or recorded gender alone does not exclude an otherwise eligible finish from the overall cohort. Other sparse editions are not declared incomplete merely from their size.

### ext_weather_pacing_patterns

How does weather change the way a marathon is run?

- Producer: [analysis/build_extended.py](../analysis/build_extended.py); display question `r15_weather_penalty_who`.
- Calculated state: **ready**; bundle `private-20260912-0934`; input timestamp `2026-09-12T13:37:16Z`; calculation timestamp `2026-09-12T14:13:07Z`.
- Reported n: **555415**; observation unit: eligible finishes; evidence scope: weather proxy.
- Contracts: [metadata / cohort / provenance](../public/data/packs/ext_weather_pacing_patterns/pack_meta.json); [answer / chart specifications](../public/data/packs/ext_weather_pacing_patterns/summary.json).
- Tables: [weather_outcomes.csv](../public/data/packs/ext_weather_pacing_patterns/tables/weather_outcomes.csv), [weather_profiles.csv](../public/data/packs/ext_weather_pacing_patterns/tables/weather_profiles.csv).

Methods and limitations from this pack:

- Use the supplied Open-Meteo archive hour nearest the scheduled local start. Join the single city-year weather row whose race date parses and matches the record year. Group temperature below 10°C, 10–14.9°C, 15–19.9°C and at least 20°C.
- First calculate each edition’s median outcome among linked runners with a recent benchmark, requiring 100 finishes. Then average edition medians equally within temperature bands, requiring five editions. The profile is normalized by each runner’s own marathon average; performance is relative to the earlier benchmark.
- The modeled weather is a start-hour proxy, not each runner’s exposure. Start offsets are absent, temperatures change during the race and humidity, wind, sunshine, terrain and fitness remain potential confounders. Edition counts in the source table are the number of weather exposures; finish counts are not independent weather observations.
- For explicitly audited canonical-ID releases, validate unique matching CORE/FULL ID sets and matching recorded edition/name labels, then join by record ID with matching finish and all nine section durations. Legacy exports retain the one-to-one edition, trimmed lowercase name and full-timing join because their IDs are incompatible. Durations are compared to milliseconds. Keep only supplied non-ambiguous runner identities without conflicting recorded gender, inferred birth years spanning more than two years, or duplicate editions. These are candidate cross-race identities, not independently verified people; unlinked runners are absent. The linkage audit records which join was used.
- Recompute the benchmark as the fastest eligible finish in the two strictly earlier calendar years. The current race and every other race in its calendar year are excluded. This avoids guessing within-year chronology and prevents current-outcome leakage. It is a recent recorded best, not a fitness measurement, an expected finish, or a lifetime personal best.
- Performance change is 100 × (current finish / recent recorded best − 1). Negative is faster. Opening change compares 0–10 km pace with that earlier best’s full-marathon pace. Faster opening: more than 2% faster; similar: within 2%; slower: more than 2% slower. The ±2% and ±5% cutoffs are predefined descriptions, not physiological thresholds.
- Use complete, strictly increasing elapsed checkpoints at 5, 10, 15, 20, 25, 30, 35, 40 and 42.195 km. Clock strings must parse as H:MM:SS or M:SS. No missing splits are interpolated.
- Remove exact duplicate race records, ignoring database IDs, ingestion timestamps and source URLs. Retain finishes from 90 minutes to 12 hours with every section between 2 and 20 minutes per km. These quality filters can exclude genuine unusual performances; the analysis describes this eligible cohort, not every entrant.
- Full source records are available in public GitHub Releases. These chart tables require at least 100 eligible observations per cell for estimate reliability. Counts refer to finishes, linked pairs or event observations as specified in that answer.
- These are observational results. Fitness changes, intentions, training, selection into the dataset and unmeasured conditions can explain differences. Outcome percentiles describe variation among performances, not confidence intervals or advice about the best strategy.
- Apply the reviewed source-quality edition exclusions for this exact export after the timing checks. Known invalid split grids, incomplete ingestion, unreconciled HOLD editions and a selected top-finisher field do not contribute to the analyses or prior benchmarks. Report source exclusions separately; an already invalid timing row is not counted twice. Missing age or recorded gender alone does not exclude an otherwise eligible finish from the overall cohort. Other sparse editions are not declared incomplete merely from their size.

### ext_race_day_context

Was it my pacing or a difficult race day?

- Producer: [analysis/build_extended.py](../analysis/build_extended.py); display question `s5_pacing_vs_difficult_day`.
- Calculated state: **ready**; bundle `private-20260912-0934`; input timestamp `2026-09-12T13:37:16Z`; calculation timestamp `2026-09-12T14:13:07Z`.
- Reported n: **555437**; observation unit: eligible finishes; evidence scope: partial comparison.
- Contracts: [metadata / cohort / provenance](../public/data/packs/ext_race_day_context/pack_meta.json); [answer / chart specifications](../public/data/packs/ext_race_day_context/summary.json).
- Tables: [race_days.csv](../public/data/packs/ext_race_day_context/tables/race_days.csv).

Methods and limitations from this pack:

- For every city and race year, calculate the median and 10th–90th percentiles of percentage finish change versus each linked runner’s recent recorded best. Require 100 such finishes per edition. Compare an individual’s percentage change with that edition median to describe their position relative to the field.
- This contemporaneous edition reference is retrospective, includes the runner when eligible, and may shift with selection and fitness changes. It is not a weather correction or a prediction available before race day.
- For explicitly audited canonical-ID releases, validate unique matching CORE/FULL ID sets and matching recorded edition/name labels, then join by record ID with matching finish and all nine section durations. Legacy exports retain the one-to-one edition, trimmed lowercase name and full-timing join because their IDs are incompatible. Durations are compared to milliseconds. Keep only supplied non-ambiguous runner identities without conflicting recorded gender, inferred birth years spanning more than two years, or duplicate editions. These are candidate cross-race identities, not independently verified people; unlinked runners are absent. The linkage audit records which join was used.
- Recompute the benchmark as the fastest eligible finish in the two strictly earlier calendar years. The current race and every other race in its calendar year are excluded. This avoids guessing within-year chronology and prevents current-outcome leakage. It is a recent recorded best, not a fitness measurement, an expected finish, or a lifetime personal best.
- Performance change is 100 × (current finish / recent recorded best − 1). Negative is faster. Opening change compares 0–10 km pace with that earlier best’s full-marathon pace. Faster opening: more than 2% faster; similar: within 2%; slower: more than 2% slower. The ±2% and ±5% cutoffs are predefined descriptions, not physiological thresholds.
- Use complete, strictly increasing elapsed checkpoints at 5, 10, 15, 20, 25, 30, 35, 40 and 42.195 km. Clock strings must parse as H:MM:SS or M:SS. No missing splits are interpolated.
- Remove exact duplicate race records, ignoring database IDs, ingestion timestamps and source URLs. Retain finishes from 90 minutes to 12 hours with every section between 2 and 20 minutes per km. These quality filters can exclude genuine unusual performances; the analysis describes this eligible cohort, not every entrant.
- Full source records are available in public GitHub Releases. These chart tables require at least 100 eligible observations per cell for estimate reliability. Counts refer to finishes, linked pairs or event observations as specified in that answer.
- These are observational results. Fitness changes, intentions, training, selection into the dataset and unmeasured conditions can explain differences. Outcome percentiles describe variation among performances, not confidence intervals or advice about the best strategy.
- Apply the reviewed source-quality edition exclusions for this exact export after the timing checks. Known invalid split grids, incomplete ingestion, unreconciled HOLD editions and a selected top-finisher field do not contribute to the analyses or prior benchmarks. Report source exclusions separately; an already invalid timing row is not counted twice. Missing age or recorded gender alone does not exclude an otherwise eligible finish from the overall cohort. Other sparse editions are not declared incomplete merely from their size.

### ext_course_response_profiles

Are stronger performers better at adjusting their pace to the course?

- Producer: [analysis/build_extended.py](../analysis/build_extended.py); display question `r35_course_adaptation`.
- Calculated state: **ready**; bundle `private-20260912-0934`; input timestamp `2026-09-12T13:37:16Z`; calculation timestamp `2026-09-12T14:13:07Z`.
- Reported n: **555437**; observation unit: eligible finishes; evidence scope: partial comparison.
- Contracts: [metadata / cohort / provenance](../public/data/packs/ext_course_response_profiles/pack_meta.json); [answer / chart specifications](../public/data/packs/ext_course_response_profiles/summary.json).
- Tables: [course_responses.csv](../public/data/packs/ext_course_response_profiles/tables/course_responses.csv).

Methods and limitations from this pack:

- Normalize section pace by each runner’s own full-marathon average, then take the median by city and performance group. Performance groups use more than 2% faster than, within 2% of, or more than 2% slower than the prior benchmark. Require 100 per city and group.
- The outcome group is known after the race. Courses pool editions; neither terrain versions nor race-day conditions are held constant. This is a descriptive course-response profile, not evidence of optimal effort allocation on hills.
- For explicitly audited canonical-ID releases, validate unique matching CORE/FULL ID sets and matching recorded edition/name labels, then join by record ID with matching finish and all nine section durations. Legacy exports retain the one-to-one edition, trimmed lowercase name and full-timing join because their IDs are incompatible. Durations are compared to milliseconds. Keep only supplied non-ambiguous runner identities without conflicting recorded gender, inferred birth years spanning more than two years, or duplicate editions. These are candidate cross-race identities, not independently verified people; unlinked runners are absent. The linkage audit records which join was used.
- Recompute the benchmark as the fastest eligible finish in the two strictly earlier calendar years. The current race and every other race in its calendar year are excluded. This avoids guessing within-year chronology and prevents current-outcome leakage. It is a recent recorded best, not a fitness measurement, an expected finish, or a lifetime personal best.
- Performance change is 100 × (current finish / recent recorded best − 1). Negative is faster. Opening change compares 0–10 km pace with that earlier best’s full-marathon pace. Faster opening: more than 2% faster; similar: within 2%; slower: more than 2% slower. The ±2% and ±5% cutoffs are predefined descriptions, not physiological thresholds.
- Use complete, strictly increasing elapsed checkpoints at 5, 10, 15, 20, 25, 30, 35, 40 and 42.195 km. Clock strings must parse as H:MM:SS or M:SS. No missing splits are interpolated.
- Remove exact duplicate race records, ignoring database IDs, ingestion timestamps and source URLs. Retain finishes from 90 minutes to 12 hours with every section between 2 and 20 minutes per km. These quality filters can exclude genuine unusual performances; the analysis describes this eligible cohort, not every entrant.
- Full source records are available in public GitHub Releases. These chart tables require at least 100 eligible observations per cell for estimate reliability. Counts refer to finishes, linked pairs or event observations as specified in that answer.
- These are observational results. Fitness changes, intentions, training, selection into the dataset and unmeasured conditions can explain differences. Outcome percentiles describe variation among performances, not confidence intervals or advice about the best strategy.
- Apply the reviewed source-quality edition exclusions for this exact export after the timing checks. Known invalid split grids, incomplete ingestion, unreconciled HOLD editions and a selected top-finisher field do not contribute to the analyses or prior benchmarks. Report source exclusions separately; an already invalid timing row is not counted twice. Missing age or recorded gender alone does not exclude an otherwise eligible finish from the overall cohort. Other sparse editions are not declared incomplete merely from their size.

### ext_checkpoint_outcomes

Does being on pace mean you will hit your goal?

- Producer: [analysis/build_pacing.py](../analysis/build_pacing.py); display question `r04_on_pace_goal_hits`.
- Calculated state: **ready**; bundle `private-20260912-0934`; input timestamp `2026-09-12T13:37:16Z`; calculation timestamp `2026-09-12T14:12:22Z`.
- Reported n: **3517336**; observation unit: eligible finishes (consult method for subgroup/pair denominators); evidence scope: descriptive.
- Contracts: [metadata / cohort / provenance](../public/data/packs/ext_checkpoint_outcomes/pack_meta.json); [answer / chart specifications](../public/data/packs/ext_checkpoint_outcomes/summary.json).
- Tables: [goal_rates.csv](../public/data/packs/ext_checkpoint_outcomes/tables/goal_rates.csv).

Methods and limitations from this pack:

- On pace means elapsed time within ±1% of the target’s even-pace time at that checkpoint. A goal is achieved only when the finish is strictly under the target. Divide successes by all eligible on-pace finishes for that goal and checkpoint.
- This window includes runners just ahead of and just behind the target; it is narrower than the older core table’s time-budget definition. Results pool editions and are descriptive historical frequencies, not a validated personal forecast. Goals are inferred benchmarks, not runners’ declared intentions.
- Use complete, strictly increasing elapsed checkpoints at 5, 10, 15, 20, 25, 30, 35, 40 and 42.195 km. Clock strings must parse as H:MM:SS or M:SS. No missing splits are interpolated.
- Remove exact duplicate race records, ignoring database IDs, ingestion timestamps and source URLs. Retain finishes from 90 minutes to 12 hours with every section between 2 and 20 minutes per km. These quality filters can exclude genuine unusual performances; the analysis describes this eligible cohort, not every entrant.
- Each observation is a race finish. The same person can appear in multiple races. No runner identities are linked across races. Public cells require at least 100 observations; matched comparisons additionally require at least 20 per group in each stratum.
- Apply the reviewed source-quality edition exclusions for this exact export after the timing checks. Known invalid split grids, incomplete ingestion, unreconciled HOLD editions and a selected top-finisher field do not contribute to the analyses or prior benchmarks. Report source exclusions separately; an already invalid timing row is not counted twice. Missing age or recorded gender alone does not exclude an otherwise eligible finish from the overall cohort. Other sparse editions are not declared incomplete merely from their size.

### ext_late_rank_changes

How much of a marathon is decided after 30 km?

- Producer: [analysis/build_pacing.py](../analysis/build_pacing.py); display question `r06_decided_after_30k`.
- Calculated state: **ready**; bundle `private-20260912-0934`; input timestamp `2026-09-12T13:37:16Z`; calculation timestamp `2026-09-12T14:12:22Z`.
- Reported n: **3517322**; observation unit: eligible finishes (consult method for subgroup/pair denominators); evidence scope: descriptive.
- Contracts: [metadata / cohort / provenance](../public/data/packs/ext_late_rank_changes/pack_meta.json); [answer / chart specifications](../public/data/packs/ext_late_rank_changes/summary.json).
- Tables: [rank_changes.csv](../public/data/packs/ext_late_rank_changes/tables/rank_changes.csv).

Methods and limitations from this pack:

- Rank the same complete-record finishers at 30 km and at the finish within each city, year and race. Ties receive their average rank. Positive rank change means gaining places; all signed changes sum to zero within each edition.
- Convert rank changes to percentile points using field size minus one. A five-point move corresponds to about 500 positions in a 10,000-person eligible field. Missing-split finishers and non-finishers are absent. Different start waves mean elapsed-time ranks cannot count physical passes.
- Use complete, strictly increasing elapsed checkpoints at 5, 10, 15, 20, 25, 30, 35, 40 and 42.195 km. Clock strings must parse as H:MM:SS or M:SS. No missing splits are interpolated.
- Remove exact duplicate race records, ignoring database IDs, ingestion timestamps and source URLs. Retain finishes from 90 minutes to 12 hours with every section between 2 and 20 minutes per km. These quality filters can exclude genuine unusual performances; the analysis describes this eligible cohort, not every entrant.
- Each observation is a race finish. The same person can appear in multiple races. No runner identities are linked across races. Public cells require at least 100 observations; matched comparisons additionally require at least 20 per group in each stratum.
- Apply the reviewed source-quality edition exclusions for this exact export after the timing checks. Known invalid split grids, incomplete ingestion, unreconciled HOLD editions and a selected top-finisher field do not contribute to the analyses or prior benchmarks. Report source exclusions separately; an already invalid timing row is not counted twice. Missing age or recorded gender alone does not exclude an otherwise eligible finish from the overall cohort. Other sparse editions are not declared incomplete merely from their size.

### ext_milestone_finishing_speed

How much finishing speed appears when a milestone is within reach?

- Producer: [analysis/build_extended.py](../analysis/build_extended.py); display question `r17_milestone_kick`.
- Calculated state: **ready**; bundle `private-20260912-0934`; input timestamp `2026-09-12T13:37:16Z`; calculation timestamp `2026-09-12T14:13:07Z`.
- Reported n: **1051810**; observation unit: eligible finishes; evidence scope: descriptive.
- Contracts: [metadata / cohort / provenance](../public/data/packs/ext_milestone_finishing_speed/pack_meta.json); [answer / chart specifications](../public/data/packs/ext_milestone_finishing_speed/summary.json).
- Tables: [hits.csv](../public/data/packs/ext_milestone_finishing_speed/tables/hits.csv), [kick.csv](../public/data/packs/ext_milestone_finishing_speed/tables/kick.csv).

Methods and limitations from this pack:

- Project finish time at 40 km by multiplying elapsed time by 42.195/40. Keep projections within five minutes of a round target and divide the margin into four bands. The kick measure is 100 × (40–42.195 km pace / 35–40 km pace − 1); negative means a faster final section.
- Plot the median kick and the share finishing strictly below the target. Different courses, ability and fatigue can produce the same projected margin. These are unadjusted associations, not evidence that a milestone caused a sprint.
- Use complete, strictly increasing elapsed checkpoints at 5, 10, 15, 20, 25, 30, 35, 40 and 42.195 km. Clock strings must parse as H:MM:SS or M:SS. No missing splits are interpolated.
- Remove exact duplicate race records, ignoring database IDs, ingestion timestamps and source URLs. Retain finishes from 90 minutes to 12 hours with every section between 2 and 20 minutes per km. These quality filters can exclude genuine unusual performances; the analysis describes this eligible cohort, not every entrant.
- Full source records are available in public GitHub Releases. These chart tables require at least 100 eligible observations per cell for estimate reliability. Counts refer to finishes, linked pairs or event observations as specified in that answer.
- These are observational results. Fitness changes, intentions, training, selection into the dataset and unmeasured conditions can explain differences. Outcome percentiles describe variation among performances, not confidence intervals or advice about the best strategy.
- Apply the reviewed source-quality edition exclusions for this exact export after the timing checks. Known invalid split grids, incomplete ingestion, unreconciled HOLD editions and a selected top-finisher field do not contribute to the analyses or prior benchmarks. Report source exclusions separately; an already invalid timing row is not counted twice. Missing age or recorded gender alone does not exclude an otherwise eligible finish from the overall cohort. Other sparse editions are not declared incomplete merely from their size.

### ext_qualifying_threshold_comparison

Do qualifying rules change how people race?

- Producer: [analysis/build_extended.py](../analysis/build_extended.py); display question `r18_bq_rule_changes`.
- Calculated state: **ready**; bundle `private-20260912-0934`; input timestamp `2026-09-12T13:37:16Z`; calculation timestamp `2026-09-12T14:13:07Z`.
- Reported n: **854**; observation unit: eligible finishes; evidence scope: partial comparison.
- Contracts: [metadata / cohort / provenance](../public/data/packs/ext_qualifying_threshold_comparison/pack_meta.json); [answer / chart specifications](../public/data/packs/ext_qualifying_threshold_comparison/summary.json).
- Tables: [thresholds.csv](../public/data/packs/ext_qualifying_threshold_comparison/tables/thresholds.csv).

Methods and limitations from this pack:

- The B.A.A. history lists 18–34 standards of 3:05 for men and 3:35 for women for 2013–2019 Boston races; the 2020 standards became 3:00 and 3:30, announced in September 2018. Compare 2016–2017 performances with 2019, excluding the transition year. Exact ages 18–31 avoid crossing the 35-year boundary within the next two years.
- Around each fixed old/new benchmark, select finishes within ±2 minutes. Within each city and period, calculate the share at or below the benchmark. Keep cities with at least 20 close finishes in both periods and weight both periods by the smaller city-period count. Report at least 100 observed finishes per displayed period.
- Acceptance cutoffs, declared intentions, age on a future Boston race day, certification and qualifying windows are not assigned to individuals. Round-number appeal, historical field changes and anticipatory behavior can explain bunching. This is not a difference-in-differences causal estimate, and the comparison does not cover every rule change.
- Official sources: https://www.baa.org/races/boston-marathon/qualify/ ; https://www.baa.org/news/2020-boston-marathon-qualifier-acceptances-announced/ . Historical values verified 2026-09-08.
- Use complete, strictly increasing elapsed checkpoints at 5, 10, 15, 20, 25, 30, 35, 40 and 42.195 km. Clock strings must parse as H:MM:SS or M:SS. No missing splits are interpolated.
- Remove exact duplicate race records, ignoring database IDs, ingestion timestamps and source URLs. Retain finishes from 90 minutes to 12 hours with every section between 2 and 20 minutes per km. These quality filters can exclude genuine unusual performances; the analysis describes this eligible cohort, not every entrant.
- Full source records are available in public GitHub Releases. These chart tables require at least 100 eligible observations per cell for estimate reliability. Counts refer to finishes, linked pairs or event observations as specified in that answer.
- These are observational results. Fitness changes, intentions, training, selection into the dataset and unmeasured conditions can explain differences. Outcome percentiles describe variation among performances, not confidence intervals or advice about the best strategy.
- Apply the reviewed source-quality edition exclusions for this exact export after the timing checks. Known invalid split grids, incomplete ingestion, unreconciled HOLD editions and a selected top-finisher field do not contribute to the analyses or prior benchmarks. Report source exclusions separately; an already invalid timing row is not counted twice. Missing age or recorded gender alone does not exclude an otherwise eligible finish from the overall cohort. Other sparse editions are not declared incomplete merely from their size.

### ext_goal_slip_recovery

What happens when a goal slips away?

- Producer: [analysis/build_extended.py](../analysis/build_extended.py); display question `s10_goal_slips`.
- Calculated state: **ready**; bundle `private-20260912-0934`; input timestamp `2026-09-12T13:37:16Z`; calculation timestamp `2026-09-12T14:13:07Z`.
- Reported n: **263589**; observation unit: eligible finishes; evidence scope: descriptive.
- Contracts: [metadata / cohort / provenance](../public/data/packs/ext_goal_slip_recovery/pack_meta.json); [answer / chart specifications](../public/data/packs/ext_goal_slip_recovery/summary.json).
- Tables: [slips.csv](../public/data/packs/ext_goal_slip_recovery/tables/slips.csv).

Methods and limitations from this pack:

- At 20 km keep elapsed time from 99% through 100% of the target’s even-pace budget. Find the first 25, 30, 35 or 40 km checkpoint where elapsed time exceeds that budget. Divide eventual strict sub-target finishes by all such first-crossing observations.
- This uses inferred round-time benchmarks and elapsed chip times. It cannot establish when a runner mentally abandoned a goal. First-crossing groups differ, and results include only complete eligible finishes.
- Use complete, strictly increasing elapsed checkpoints at 5, 10, 15, 20, 25, 30, 35, 40 and 42.195 km. Clock strings must parse as H:MM:SS or M:SS. No missing splits are interpolated.
- Remove exact duplicate race records, ignoring database IDs, ingestion timestamps and source URLs. Retain finishes from 90 minutes to 12 hours with every section between 2 and 20 minutes per km. These quality filters can exclude genuine unusual performances; the analysis describes this eligible cohort, not every entrant.
- Full source records are available in public GitHub Releases. These chart tables require at least 100 eligible observations per cell for estimate reliability. Counts refer to finishes, linked pairs or event observations as specified in that answer.
- These are observational results. Fitness changes, intentions, training, selection into the dataset and unmeasured conditions can explain differences. Outcome percentiles describe variation among performances, not confidence intervals or advice about the best strategy.
- Apply the reviewed source-quality edition exclusions for this exact export after the timing checks. Known invalid split grids, incomplete ingestion, unreconciled HOLD editions and a selected top-finisher field do not contribute to the analyses or prior benchmarks. Report source exclusions separately; an already invalid timing row is not counted twice. Missing age or recorded gender alone does not exclude an otherwise eligible finish from the overall cohort. Other sparse editions are not declared incomplete merely from their size.

### ext_strong_finish_followup

Does a strong finish suggest unused capacity?

- Producer: [analysis/build_extended.py](../analysis/build_extended.py); display question `r25_huge_kick_next`.
- Calculated state: **ready**; bundle `private-20260912-0934`; input timestamp `2026-09-12T13:37:16Z`; calculation timestamp `2026-09-12T14:13:07Z`.
- Reported n: **583670**; observation unit: linked race pairs; evidence scope: partial comparison.
- Contracts: [metadata / cohort / provenance](../public/data/packs/ext_strong_finish_followup/pack_meta.json); [answer / chart specifications](../public/data/packs/ext_strong_finish_followup/summary.json).
- Tables: [kick_followup.csv](../public/data/packs/ext_strong_finish_followup/tables/kick_followup.csv), [kick_success.csv](../public/data/packs/ext_strong_finish_followup/tables/kick_success.csv).

Methods and limitations from this pack:

- A finishing acceleration is the percentage change in pace from 35–40 to 40–42.195 km. Group it as more than 5% faster, up to 5% faster, or similar/slower. Use consecutive cross-year linked pairs at most three years apart.
- Measure next-finish percentage change relative to the first finish, report its 10th/50th/90th percentiles within the first race’s pacing pattern, and the share improving by more than 2%. This does not measure effort reserves, account for absent follow-up, or establish what would have happened with a harder earlier effort.
- For explicitly audited canonical-ID releases, validate unique matching CORE/FULL ID sets and matching recorded edition/name labels, then join by record ID with matching finish and all nine section durations. Legacy exports retain the one-to-one edition, trimmed lowercase name and full-timing join because their IDs are incompatible. Durations are compared to milliseconds. Keep only supplied non-ambiguous runner identities without conflicting recorded gender, inferred birth years spanning more than two years, or duplicate editions. These are candidate cross-race identities, not independently verified people; unlinked runners are absent. The linkage audit records which join was used.
- Use complete, strictly increasing elapsed checkpoints at 5, 10, 15, 20, 25, 30, 35, 40 and 42.195 km. Clock strings must parse as H:MM:SS or M:SS. No missing splits are interpolated.
- Remove exact duplicate race records, ignoring database IDs, ingestion timestamps and source URLs. Retain finishes from 90 minutes to 12 hours with every section between 2 and 20 minutes per km. These quality filters can exclude genuine unusual performances; the analysis describes this eligible cohort, not every entrant.
- Full source records are available in public GitHub Releases. These chart tables require at least 100 eligible observations per cell for estimate reliability. Counts refer to finishes, linked pairs or event observations as specified in that answer.
- These are observational results. Fitness changes, intentions, training, selection into the dataset and unmeasured conditions can explain differences. Outcome percentiles describe variation among performances, not confidence intervals or advice about the best strategy.
- Apply the reviewed source-quality edition exclusions for this exact export after the timing checks. Known invalid split grids, incomplete ingestion, unreconciled HOLD editions and a selected top-finisher field do not contribute to the analyses or prior benchmarks. Report source exclusions separately; an already invalid timing row is not counted twice. Missing age or recorded gender alone does not exclude an otherwise eligible finish from the overall cohort. Other sparse editions are not declared incomplete merely from their size.

### ext_distance_and_elapsed_change

Do pacing changes follow distance or elapsed time?

- Producer: [analysis/build_extended.py](../analysis/build_extended.py); display question `r07_wall_clock_vs_distance`.
- Calculated state: **ready**; bundle `private-20260912-0934`; input timestamp `2026-09-12T13:37:16Z`; calculation timestamp `2026-09-12T14:13:07Z`.
- Reported n: **2372738**; observation unit: eligible finishes; evidence scope: descriptive.
- Contracts: [metadata / cohort / provenance](../public/data/packs/ext_distance_and_elapsed_change/pack_meta.json); [answer / chart specifications](../public/data/packs/ext_distance_and_elapsed_change/summary.json).
- Tables: [distance.csv](../public/data/packs/ext_distance_and_elapsed_change/tables/distance.csv), [elapsed.csv](../public/data/packs/ext_distance_and_elapsed_change/tables/elapsed.csv).

Methods and limitations from this pack:

- Define the first section after 20 km whose average pace is more than 10% slower than 5–20 km. Look only through 40 km so all tested sections are 5 km long. Group runners using their observed 5–20 km pace.
- Among runners with such a section, plot the distribution of its end distance. For each distance and early-pace group, show median elapsed arrival at the start and end of that section. The medians bound a typical observation interval; they are not confidence limits. This broader 10% section definition is separate from the sustained slowdown definition.
- Use complete, strictly increasing elapsed checkpoints at 5, 10, 15, 20, 25, 30, 35, 40 and 42.195 km. Clock strings must parse as H:MM:SS or M:SS. No missing splits are interpolated.
- Remove exact duplicate race records, ignoring database IDs, ingestion timestamps and source URLs. Retain finishes from 90 minutes to 12 hours with every section between 2 and 20 minutes per km. These quality filters can exclude genuine unusual performances; the analysis describes this eligible cohort, not every entrant.
- Full source records are available in public GitHub Releases. These chart tables require at least 100 eligible observations per cell for estimate reliability. Counts refer to finishes, linked pairs or event observations as specified in that answer.
- These are observational results. Fitness changes, intentions, training, selection into the dataset and unmeasured conditions can explain differences. Outcome percentiles describe variation among performances, not confidence intervals or advice about the best strategy.
- Apply the reviewed source-quality edition exclusions for this exact export after the timing checks. Known invalid split grids, incomplete ingestion, unreconciled HOLD editions and a selected top-finisher field do not contribute to the analyses or prior benchmarks. Report source exclusions separately; an already invalid timing row is not counted twice. Missing age or recorded gender alone does not exclude an otherwise eligible finish from the overall cohort. Other sparse editions are not declared incomplete merely from their size.

### ext_pacing_habit_persistence

Do runners have persistent pacing habits?

- Producer: [analysis/build_extended.py](../analysis/build_extended.py); display question `r20_pacing_personalities`.
- Calculated state: **ready**; bundle `private-20260912-0934`; input timestamp `2026-09-12T13:37:16Z`; calculation timestamp `2026-09-12T14:13:07Z`.
- Reported n: **583670**; observation unit: linked race pairs; evidence scope: descriptive.
- Contracts: [metadata / cohort / provenance](../public/data/packs/ext_pacing_habit_persistence/pack_meta.json); [answer / chart specifications](../public/data/packs/ext_pacing_habit_persistence/summary.json).
- Tables: [correlation.csv](../public/data/packs/ext_pacing_habit_persistence/tables/correlation.csv), [transitions.csv](../public/data/packs/ext_pacing_habit_persistence/tables/transitions.csv).

Methods and limitations from this pack:

- Use consecutive linked finishes in different years, no more than three years apart, with exactly one recorded eligible finish in each endpoint year. Calculate Pearson correlation between the two 0–20 versus 20–40 km pace changes, grouped by calendar-year gap.
- For each earlier race pattern, divide the number of next races in each pattern by all eligible pairs with that earlier pattern. These conditional transition percentages sum to 100 within the earlier pattern. Correlation is descriptive; repeat observations of a runner are not independent.
- For explicitly audited canonical-ID releases, validate unique matching CORE/FULL ID sets and matching recorded edition/name labels, then join by record ID with matching finish and all nine section durations. Legacy exports retain the one-to-one edition, trimmed lowercase name and full-timing join because their IDs are incompatible. Durations are compared to milliseconds. Keep only supplied non-ambiguous runner identities without conflicting recorded gender, inferred birth years spanning more than two years, or duplicate editions. These are candidate cross-race identities, not independently verified people; unlinked runners are absent. The linkage audit records which join was used.
- Use complete, strictly increasing elapsed checkpoints at 5, 10, 15, 20, 25, 30, 35, 40 and 42.195 km. Clock strings must parse as H:MM:SS or M:SS. No missing splits are interpolated.
- Remove exact duplicate race records, ignoring database IDs, ingestion timestamps and source URLs. Retain finishes from 90 minutes to 12 hours with every section between 2 and 20 minutes per km. These quality filters can exclude genuine unusual performances; the analysis describes this eligible cohort, not every entrant.
- Full source records are available in public GitHub Releases. These chart tables require at least 100 eligible observations per cell for estimate reliability. Counts refer to finishes, linked pairs or event observations as specified in that answer.
- These are observational results. Fitness changes, intentions, training, selection into the dataset and unmeasured conditions can explain differences. Outcome percentiles describe variation among performances, not confidence intervals or advice about the best strategy.
- Apply the reviewed source-quality edition exclusions for this exact export after the timing checks. Known invalid split grids, incomplete ingestion, unreconciled HOLD editions and a selected top-finisher field do not contribute to the analyses or prior benchmarks. Report source exclusions separately; an already invalid timing row is not counted twice. Missing age or recorded gender alone does not exclude an otherwise eligible finish from the overall cohort. Other sparse editions are not declared incomplete merely from their size.

### ext_age_pacing

How do speed and pace retention vary by age?

- Producer: [analysis/build_pacing.py](../analysis/build_pacing.py); display question `r22_aging_changes`.
- Calculated state: **ready**; bundle `private-20260912-0934`; input timestamp `2026-09-12T13:37:16Z`; calculation timestamp `2026-09-12T14:12:22Z`.
- Reported n: **1220878**; observation unit: eligible finishes (consult method for subgroup/pair denominators); evidence scope: descriptive.
- Contracts: [metadata / cohort / provenance](../public/data/packs/ext_age_pacing/pack_meta.json); [answer / chart specifications](../public/data/packs/ext_age_pacing/summary.json).
- Tables: [age_pacing.csv](../public/data/packs/ext_age_pacing/tables/age_pacing.csv).

Methods and limitations from this pack:

- Use exact integer ages from 18 through 89, grouping 18–29 then ten-year bands. Do not infer exact ages from age-group labels. Report median 0–20 km pace and median percentage pace change from 0–20 to 20–40 km, separately by recorded gender.
- This is cross-sectional: different people, races and performance levels are being compared. Selection into marathons, missing ages, course and prior ability can explain part of the pattern. It is not an estimate of an individual’s aging trajectory.
- Use complete, strictly increasing elapsed checkpoints at 5, 10, 15, 20, 25, 30, 35, 40 and 42.195 km. Clock strings must parse as H:MM:SS or M:SS. No missing splits are interpolated.
- Remove exact duplicate race records, ignoring database IDs, ingestion timestamps and source URLs. Retain finishes from 90 minutes to 12 hours with every section between 2 and 20 minutes per km. These quality filters can exclude genuine unusual performances; the analysis describes this eligible cohort, not every entrant.
- Each observation is a race finish. The same person can appear in multiple races. No runner identities are linked across races. Public cells require at least 100 observations; matched comparisons additionally require at least 20 per group in each stratum.
- Apply the reviewed source-quality edition exclusions for this exact export after the timing checks. Known invalid split grids, incomplete ingestion, unreconciled HOLD editions and a selected top-finisher field do not contribute to the analyses or prior benchmarks. Report source exclusions separately; an already invalid timing row is not counted twice. Missing age or recorded gender alone does not exclude an otherwise eligible finish from the overall cohort. Other sparse editions are not declared incomplete merely from their size.

### ext_gender_pacing

How does pacing differ across recorded gender groups?

- Producer: [analysis/build_pacing.py](../analysis/build_pacing.py); display question `r23_gender_pacing`.
- Calculated state: **ready**; bundle `private-20260912-0934`; input timestamp `2026-09-12T13:37:16Z`; calculation timestamp `2026-09-12T14:12:22Z`.
- Reported n: **2917861**; observation unit: eligible finishes (consult method for subgroup/pair denominators); evidence scope: descriptive.
- Contracts: [metadata / cohort / provenance](../public/data/packs/ext_gender_pacing/pack_meta.json); [answer / chart specifications](../public/data/packs/ext_gender_pacing/summary.json).
- Tables: [gender_matched.csv](../public/data/packs/ext_gender_pacing/tables/gender_matched.csv), [gender_pooled.csv](../public/data/packs/ext_gender_pacing/tables/gender_pooled.csv).

Methods and limitations from this pack:

- Compare average percentage change from the first 20 km to the second 20 km. The pooled chart uses all eligible women’s and men’s records. The matched chart uses only race-edition and one-minute 20 km strata containing at least 20 finishes in each category.
- Use the smaller category count as a common stratum weight. Thus both matched estimates have the same race and opening-time distribution. Opening time is an observed race performance, not an independent measure of prior fitness. Age, experience and other factors remain uncontrolled.
- The export field is sex; labels follow its recorded categories. Other or missing categories remain in the overall pacing analyses but are not included in this two-category comparison.
- Use complete, strictly increasing elapsed checkpoints at 5, 10, 15, 20, 25, 30, 35, 40 and 42.195 km. Clock strings must parse as H:MM:SS or M:SS. No missing splits are interpolated.
- Remove exact duplicate race records, ignoring database IDs, ingestion timestamps and source URLs. Retain finishes from 90 minutes to 12 hours with every section between 2 and 20 minutes per km. These quality filters can exclude genuine unusual performances; the analysis describes this eligible cohort, not every entrant.
- Each observation is a race finish. The same person can appear in multiple races. No runner identities are linked across races. Public cells require at least 100 observations; matched comparisons additionally require at least 20 per group in each stratum.
- Apply the reviewed source-quality edition exclusions for this exact export after the timing checks. Known invalid split grids, incomplete ingestion, unreconciled HOLD editions and a selected top-finisher field do not contribute to the analyses or prior benchmarks. Report source exclusions separately; an already invalid timing row is not counted twice. Missing age or recorded gender alone does not exclude an otherwise eligible finish from the overall cohort. Other sparse editions are not declared incomplete merely from their size.

### ext_near_miss_recorded_return

Does a near miss bring people back?

- Producer: [analysis/build_extended.py](../analysis/build_extended.py); display question `r19_near_miss_return`.
- Calculated state: **ready**; bundle `private-20260912-0934`; input timestamp `2026-09-12T13:37:16Z`; calculation timestamp `2026-09-12T14:13:07Z`.
- Reported n: **214476**; observation unit: eligible finishes; evidence scope: partial comparison.
- Contracts: [metadata / cohort / provenance](../public/data/packs/ext_near_miss_recorded_return/pack_meta.json); [answer / chart specifications](../public/data/packs/ext_near_miss_recorded_return/summary.json).
- Tables: [returns.csv](../public/data/packs/ext_near_miss_recorded_return/tables/returns.csv).

Methods and limitations from this pack:

- Select linked finishes within two minutes of each round target. Under is strictly below the target; an exact target time belongs to the at-or-over group. Require two subsequent calendar years with at least 100 eligible finishes in the index city, and exclude the latest two observed years as index years.
- Return means any eligible linked finish anywhere in the export during the next two calendar years. Same-year returns do not count. Divide returns by every eligible index finish in each group, including those with no observed return. Coverage checks reduce administrative censoring but do not establish complete race ingestion. Repeat index observations, false/missed links, changing coverage and unrecorded goals can affect the association.
- For explicitly audited canonical-ID releases, validate unique matching CORE/FULL ID sets and matching recorded edition/name labels, then join by record ID with matching finish and all nine section durations. Legacy exports retain the one-to-one edition, trimmed lowercase name and full-timing join because their IDs are incompatible. Durations are compared to milliseconds. Keep only supplied non-ambiguous runner identities without conflicting recorded gender, inferred birth years spanning more than two years, or duplicate editions. These are candidate cross-race identities, not independently verified people; unlinked runners are absent. The linkage audit records which join was used.
- Use complete, strictly increasing elapsed checkpoints at 5, 10, 15, 20, 25, 30, 35, 40 and 42.195 km. Clock strings must parse as H:MM:SS or M:SS. No missing splits are interpolated.
- Remove exact duplicate race records, ignoring database IDs, ingestion timestamps and source URLs. Retain finishes from 90 minutes to 12 hours with every section between 2 and 20 minutes per km. These quality filters can exclude genuine unusual performances; the analysis describes this eligible cohort, not every entrant.
- Full source records are available in public GitHub Releases. These chart tables require at least 100 eligible observations per cell for estimate reliability. Counts refer to finishes, linked pairs or event observations as specified in that answer.
- These are observational results. Fitness changes, intentions, training, selection into the dataset and unmeasured conditions can explain differences. Outcome percentiles describe variation among performances, not confidence intervals or advice about the best strategy.
- Apply the reviewed source-quality edition exclusions for this exact export after the timing checks. Known invalid split grids, incomplete ingestion, unreconciled HOLD editions and a selected top-finisher field do not contribute to the analyses or prior benchmarks. Report source exclusions separately; an already invalid timing row is not counted twice. Missing age or recorded gender alone does not exclude an otherwise eligible finish from the overall cohort. Other sparse editions are not declared incomplete merely from their size.

### ext_experience_and_pacing

What changes as runners gain experience?

- Producer: [analysis/build_extended.py](../analysis/build_extended.py); display question `r21_learn_from_blowup`.
- Calculated state: **ready**; bundle `private-20260912-0934`; input timestamp `2026-09-12T13:37:16Z`; calculation timestamp `2026-09-12T14:13:07Z`.
- Reported n: **555437**; observation unit: eligible finishes; evidence scope: descriptive.
- Contracts: [metadata / cohort / provenance](../public/data/packs/ext_experience_and_pacing/pack_meta.json); [answer / chart specifications](../public/data/packs/ext_experience_and_pacing/summary.json).
- Tables: [experience.csv](../public/data/packs/ext_experience_and_pacing/tables/experience.csv), [next_changes.csv](../public/data/packs/ext_experience_and_pacing/tables/next_changes.csv).

Methods and limitations from this pack:

- Count eligible linked finishes in strictly earlier calendar years. Show median opening pace relative to the recent benchmark and median change between the two 20 km blocks by prior count.
- Separately, use consecutive cross-year pairs to calculate the median next-minus-previous pace-retention change, grouped by the previous pattern. Selecting an unusually good or bad first race creates regression to the mean, so improvement after pronounced slowing is not proof of learning. Continued participation and changing fitness also affect these comparisons.
- For explicitly audited canonical-ID releases, validate unique matching CORE/FULL ID sets and matching recorded edition/name labels, then join by record ID with matching finish and all nine section durations. Legacy exports retain the one-to-one edition, trimmed lowercase name and full-timing join because their IDs are incompatible. Durations are compared to milliseconds. Keep only supplied non-ambiguous runner identities without conflicting recorded gender, inferred birth years spanning more than two years, or duplicate editions. These are candidate cross-race identities, not independently verified people; unlinked runners are absent. The linkage audit records which join was used.
- Recompute the benchmark as the fastest eligible finish in the two strictly earlier calendar years. The current race and every other race in its calendar year are excluded. This avoids guessing within-year chronology and prevents current-outcome leakage. It is a recent recorded best, not a fitness measurement, an expected finish, or a lifetime personal best.
- Performance change is 100 × (current finish / recent recorded best − 1). Negative is faster. Opening change compares 0–10 km pace with that earlier best’s full-marathon pace. Faster opening: more than 2% faster; similar: within 2%; slower: more than 2% slower. The ±2% and ±5% cutoffs are predefined descriptions, not physiological thresholds.
- Use complete, strictly increasing elapsed checkpoints at 5, 10, 15, 20, 25, 30, 35, 40 and 42.195 km. Clock strings must parse as H:MM:SS or M:SS. No missing splits are interpolated.
- Remove exact duplicate race records, ignoring database IDs, ingestion timestamps and source URLs. Retain finishes from 90 minutes to 12 hours with every section between 2 and 20 minutes per km. These quality filters can exclude genuine unusual performances; the analysis describes this eligible cohort, not every entrant.
- Full source records are available in public GitHub Releases. These chart tables require at least 100 eligible observations per cell for estimate reliability. Counts refer to finishes, linked pairs or event observations as specified in that answer.
- These are observational results. Fitness changes, intentions, training, selection into the dataset and unmeasured conditions can explain differences. Outcome percentiles describe variation among performances, not confidence intervals or advice about the best strategy.
- Apply the reviewed source-quality edition exclusions for this exact export after the timing checks. Known invalid split grids, incomplete ingestion, unreconciled HOLD editions and a selected top-finisher field do not contribute to the analyses or prior benchmarks. Report source exclusions separately; an already invalid timing row is not counted twice. Missing age or recorded gender alone does not exclude an otherwise eligible finish from the overall cohort. Other sparse editions are not declared incomplete merely from their size.

### ext_race_spacing_outcomes

How does the previous marathon affect the next one?

- Producer: [analysis/build_extended.py](../analysis/build_extended.py); display question `r24_interval_after_pb`.
- Calculated state: **ready**; bundle `private-20260912-0934`; input timestamp `2026-09-12T13:37:16Z`; calculation timestamp `2026-09-12T14:13:07Z`.
- Reported n: **603825**; observation unit: dated race pairs; evidence scope: descriptive.
- Contracts: [metadata / cohort / provenance](../public/data/packs/ext_race_spacing_outcomes/pack_meta.json); [answer / chart specifications](../public/data/packs/ext_race_spacing_outcomes/summary.json).
- Tables: [spacing.csv](../public/data/packs/ext_race_spacing_outcomes/tables/spacing.csv).

Methods and limitations from this pack:

- Use only linked identity groups for which every eligible record has a unique supplied race date. Order by that date, pair adjacent races and retain intervals of 1–1095 days. Unlike the year-based analyses, this includes same-year pairs. Dates come from the supplied calendar overlay and have not all been independently reverified.
- Calculate 100 × (next finish / previous finish − 1) and its 10th/50th/90th percentiles in the displayed day bands. The second view requires the earlier race to beat every recorded finish in earlier calendar years; same-year bests are not used for that label. Fitness, course, motivation and selection into short or long intervals remain confounders.
- For explicitly audited canonical-ID releases, validate unique matching CORE/FULL ID sets and matching recorded edition/name labels, then join by record ID with matching finish and all nine section durations. Legacy exports retain the one-to-one edition, trimmed lowercase name and full-timing join because their IDs are incompatible. Durations are compared to milliseconds. Keep only supplied non-ambiguous runner identities without conflicting recorded gender, inferred birth years spanning more than two years, or duplicate editions. These are candidate cross-race identities, not independently verified people; unlinked runners are absent. The linkage audit records which join was used.
- Use complete, strictly increasing elapsed checkpoints at 5, 10, 15, 20, 25, 30, 35, 40 and 42.195 km. Clock strings must parse as H:MM:SS or M:SS. No missing splits are interpolated.
- Remove exact duplicate race records, ignoring database IDs, ingestion timestamps and source URLs. Retain finishes from 90 minutes to 12 hours with every section between 2 and 20 minutes per km. These quality filters can exclude genuine unusual performances; the analysis describes this eligible cohort, not every entrant.
- Full source records are available in public GitHub Releases. These chart tables require at least 100 eligible observations per cell for estimate reliability. Counts refer to finishes, linked pairs or event observations as specified in that answer.
- These are observational results. Fitness changes, intentions, training, selection into the dataset and unmeasured conditions can explain differences. Outcome percentiles describe variation among performances, not confidence intervals or advice about the best strategy.
- Apply the reviewed source-quality edition exclusions for this exact export after the timing checks. Known invalid split grids, incomplete ingestion, unreconciled HOLD editions and a selected top-finisher field do not contribute to the analyses or prior benchmarks. Report source exclusions separately; an already invalid timing row is not counted twice. Missing age or recorded gender alone does not exclude an otherwise eligible finish from the overall cohort. Other sparse editions are not declared incomplete merely from their size.

### ext_pacing_over_time

How have marathon speed and pacing changed over time?

- Producer: [analysis/build_pacing.py](../analysis/build_pacing.py); display question `r26_pacing_over_20y`.
- Calculated state: **ready**; bundle `private-20260912-0934`; input timestamp `2026-09-12T13:37:16Z`; calculation timestamp `2026-09-12T14:12:22Z`.
- Reported n: **3398784**; observation unit: eligible finishes (consult method for subgroup/pair denominators); evidence scope: descriptive.
- Contracts: [metadata / cohort / provenance](../public/data/packs/ext_pacing_over_time/pack_meta.json); [answer / chart specifications](../public/data/packs/ext_pacing_over_time/summary.json).
- Tables: [yearly_pacing.csv](../public/data/packs/ext_pacing_over_time/tables/yearly_pacing.csv).

Methods and limitations from this pack:

- For each city and year, calculate median first-20-km pace and median percentage pace change from the first 20 km to the second. Show city-years with at least 100 eligible finishes, and cities with at least three available years.
- The same cities, runners and course versions are not represented every year. Choose a city to avoid pooling changing city coverage into one global trend. Even within a city, field composition, route changes and conditions remain uncontrolled. Gaps are years without publishable data, not interpolated observations.
- Use complete, strictly increasing elapsed checkpoints at 5, 10, 15, 20, 25, 30, 35, 40 and 42.195 km. Clock strings must parse as H:MM:SS or M:SS. No missing splits are interpolated.
- Remove exact duplicate race records, ignoring database IDs, ingestion timestamps and source URLs. Retain finishes from 90 minutes to 12 hours with every section between 2 and 20 minutes per km. These quality filters can exclude genuine unusual performances; the analysis describes this eligible cohort, not every entrant.
- Each observation is a race finish. The same person can appear in multiple races. No runner identities are linked across races. Public cells require at least 100 observations; matched comparisons additionally require at least 20 per group in each stratum.
- Apply the reviewed source-quality edition exclusions for this exact export after the timing checks. Known invalid split grids, incomplete ingestion, unreconciled HOLD editions and a selected top-finisher field do not contribute to the analyses or prior benchmarks. Report source exclusions separately; an already invalid timing row is not counted twice. Missing age or recorded gender alone does not exclude an otherwise eligible finish from the overall cohort. Other sparse editions are not declared incomplete merely from their size.

### ext_earlier_best_section_gains

Where do runners gain the time that produces a personal best?

- Producer: [analysis/build_extended.py](../analysis/build_extended.py); display question `r32_where_pbs_are_gained`.
- Calculated state: **ready**; bundle `private-20260912-0934`; input timestamp `2026-09-12T13:37:16Z`; calculation timestamp `2026-09-12T14:13:07Z`.
- Reported n: **278878**; observation unit: earlier-best comparisons; evidence scope: partial comparison.
- Contracts: [metadata / cohort / provenance](../public/data/packs/ext_earlier_best_section_gains/pack_meta.json); [answer / chart specifications](../public/data/packs/ext_earlier_best_section_gains/summary.json).
- Tables: [gains.csv](../public/data/packs/ext_earlier_best_section_gains/tables/gains.csv).

Methods and limitations from this pack:

- For each eligible linked finish faster than every eligible recorded finish in strictly earlier calendar years, select the fastest earlier-year record as comparator. Break tied best times by earlier year and then stable raw record ID. Both races must have all nine valid checkpoints.
- Subtract current from earlier elapsed time over 0–10, 10–30 and 30–42.195 km. Positive means time gained. Compute means so that the three block means sum exactly to the mean finish improvement; separately divide each block by its own distance to show seconds gained per kilometer. Assert that block gains sum to total gain for every pair and in the published means. Different courses and conditions can contribute to gains.
- For explicitly audited canonical-ID releases, validate unique matching CORE/FULL ID sets and matching recorded edition/name labels, then join by record ID with matching finish and all nine section durations. Legacy exports retain the one-to-one edition, trimmed lowercase name and full-timing join because their IDs are incompatible. Durations are compared to milliseconds. Keep only supplied non-ambiguous runner identities without conflicting recorded gender, inferred birth years spanning more than two years, or duplicate editions. These are candidate cross-race identities, not independently verified people; unlinked runners are absent. The linkage audit records which join was used.
- Use complete, strictly increasing elapsed checkpoints at 5, 10, 15, 20, 25, 30, 35, 40 and 42.195 km. Clock strings must parse as H:MM:SS or M:SS. No missing splits are interpolated.
- Remove exact duplicate race records, ignoring database IDs, ingestion timestamps and source URLs. Retain finishes from 90 minutes to 12 hours with every section between 2 and 20 minutes per km. These quality filters can exclude genuine unusual performances; the analysis describes this eligible cohort, not every entrant.
- Full source records are available in public GitHub Releases. These chart tables require at least 100 eligible observations per cell for estimate reliability. Counts refer to finishes, linked pairs or event observations as specified in that answer.
- These are observational results. Fitness changes, intentions, training, selection into the dataset and unmeasured conditions can explain differences. Outcome percentiles describe variation among performances, not confidence intervals or advice about the best strategy.
- Apply the reviewed source-quality edition exclusions for this exact export after the timing checks. Known invalid split grids, incomplete ingestion, unreconciled HOLD editions and a selected top-finisher field do not contribute to the analyses or prior benchmarks. Report source exclusions separately; an already invalid timing row is not counted twice. Missing age or recorded gender alone does not exclude an otherwise eligible finish from the overall cohort. Other sparse editions are not declared incomplete merely from their size.

## Rank 2: fast starts, late slowing and finish time

Route: `/analyses/starting-pace`. Default producer/output: [build_fast_start_all.py](../analysis/build_fast_start_all.py) and [all-finishers.json](../public/data/fast-start/all-finishers.json). Optional history producer/output: [build_fast_start.py](../analysis/build_fast_start.py) and [evidence.json](../public/data/fast-start/evidence.json). Full definitions, measured findings, reproduction commands and verification status: [FAST_START_ANALYSIS.md](FAST_START_ANALYSIS.md).

**All eligible finishes** includes all **3,517,336** eligible performances once, including **2,961,899** without a recent earlier benchmark. Compare the first 5 km pace with the same race's 5–20 km pace. No prior race, identity linkage or inferred ability is required. The main time outcome is actual time after 20 km minus the time that distance takes at the recorded 5–20 km pace, with its median and middle 80% shown separately from actual median finish. First-5 km and after-20 km mean differences add to the whole-race mean difference; the 5–20 km reference block contributes zero by definition. This is arithmetic accounting, not avoidable minutes or a finish prediction.

**Earlier-best comparison** preserves its original output byte for byte: **555,437** finishes with a best eligible performance in the two strictly earlier calendar years, excluding current/same-year and invalid/held benchmark records. It compares first 10 km pace with the earlier best's full-marathon average. Screened supplied identity candidates are not independently verified people; names do not establish links. Only this mode requires history.

Both modes use six exact percentage-change bands: `<−10`, `[−10,−5)`, `[−5,−2)`, `[−2,2]`, `(2,5]`, and `>5`, with decimal timing comparisons preserving boundary inclusion. Both support course, exact-age band, recorded gender and opening-group filters. History adds four earlier-best bands: under 3:00, 3:00–under 3:30, 3:30–under 4:00 and 4:00 or longer, each with All. All eligible finishes has no prior-time or speed filter. Neither mode filters by target/current finish or silently broadens a sparse selection. URL `comparison=all|history` is explicit; legacy `prior`/`previous` links infer history only without it, while explicit All clears prior filtering.

Groups require 100 eligible finishes. Each supplies section-pace medians against its mode's reference. History additionally shows finish differences from the earlier best and signed mean opening-10 km/remaining differences. All eligible finishes shows the after-20 km reference differences defined above and separate actual median finish. Mean components add to their mean total; individual section medians and finish medians need not reconcile. The 10th–90th percentiles describe variation, not confidence intervals or individual predictions.

Sustained slowdown retains the official definition: at least 25% slower than the current race's 5–20 km baseline for contiguous recorded sections totaling at least 5 km after 20 km, with `1e−12` rounding tolerance. The rate denominator is all finishes in the selected group. Onset is the first qualifying recorded section starting at 20, 25, 30 or 35 km; the final 2.195 km cannot qualify alone. Onset shares use detected finishes only and require at least 100 detections. Neither section boundaries nor that threshold locate an exact physiological event.

The history file retains **576 filter combinations / 2,846 published groups**. In that mode's All filters, openings more than 10% faster have **47.0% sustained slowdown**, compared with **17.9%** for steady openings; the faster group's median finish is nevertheless **16:37 faster** than its earlier benchmark. These history results do not describe the broader default cohort or its different opening/reference definition.

The new all-finisher file has **314 filter combinations / 1,534 groups**. Across All filters, the fastest opening group contains **174,935 finishes**, with **49.6% sustained slowdown** and median after-20 km time **28:04 above the reference**, versus **24.5%** and **8:35** for **1,500,147** steady-opening finishes. The first group's actual median finish is **5:45:31**. Among detections, its most common first qualifying section is **20–25 km**; the steady group's is **35–40 km**. A reference difference is not time caused by the opening, and these groups have different finish-time distributions.

The all-finisher mode finds unusually quick first sections; it cannot identify every runner whose whole first half was too ambitious. The 5–20 km reference is measured after the start and is shared by opening and later-slowdown ratios. Terrain, congestion, weather and fitness remain uncontrolled. Neither mode estimates a causal time penalty, physiological failure, optimal strategy or withdrawals. Every count is a finish, not a unique person or every raw record.

Both builders verify all runner shards and source hashes and bind their outputs to the exact runner-manifest hash; rebuild both whenever that manifest changes. The existing history verifier independently checked all 2,846 cells' counts, editions, slowdown/onset and sparse omissions, plus every numeric metric for 36 groups across six filters, alongside nine Python tests. The new mode passed ten builder tests and its [independent verifier](../scripts/verify-fast-start-all.cjs), including the full eligible population, all 1,534 cells' counts/onsets and numeric outcomes for every global group and representative filtered groups. CI and publication are recorded separately. Existing personalized/research payloads and eligibility remain unchanged.

## Personalized engine: twelve calculation paths and methods

Producer: [analysis/build_personalized.py](../analysis/build_personalized.py), called from build_extended.py with --personalized-output. Renderer/calculation selection: [lib/personalized.ts](../lib/personalized.ts); question wording: [lib/personalized-catalog.ts](../lib/personalized-catalog.ts). Output: [metadata](../public/data/packs/ext_personalized_guide/pack_meta.json) and [summary and city-file mapping](../public/data/packs/ext_personalized_guide/summary.json), with tables/city_XX.json and tables/checkpoint_XX.json shards. Import using import_personalized.py separately from the 33-pack import.

The primary page order and wording come from [the ten-analysis registry](../lib/ten-analyses.ts); the engine catalog below retains its original focus labels, its earlier `opening` path, and two additional paths, `downhill` and `return`. The primary rank-2 page now uses the separate fast-start output above. The personalized default is an All courses / 4:00 example, with no assumed age, gender or prior performance. The 0934 pack uses input timestamp `2026-09-12T13:37:16Z` and calculation timestamp `2026-09-12T14:13:44Z`. Every integer target from 90 through 720 minutes has exact threshold support, but profile, near-finish, checkpoint and history cells publish only when their own sample rules pass. Extreme or sparse selections can therefore have no result.

All questions share the eligible and prior-history preparation described above. A displayed filter may be broadened only with explicit labeling. Read each method for dimensions deliberately varied, achieved-time conditioning and prior-time exclusions.

### profile: What does a race near my target look like?

Focus: prepare, review.

Select finishes in the displayed 15-minute finish-time band, centered on the nearest 15-minute target preset. Show each section’s median pace and middle 50% of observed paces. These are achieved times, not declared goals, and the profile is not an optimal pacing plan.

### opening: Which openings are associated with finishing under my target?

Focus: prepare. Retained in the research guide; superseded on the primary rank-2 route by the separate fast-start analysis above. Its existing calculation and output have not changed.

Use runners with a recorded best in the two strictly earlier calendar years. Classify the first 10 km as more than 2% faster than that benchmark’s marathon pace, within 2%, or more than 2% slower. For each group, count finishes strictly below the selected time. Groups are observational and pool available editions; a prior-time filter narrows ability but does not eliminate confounding.

### sections: Where do nearby finishes gain or lose time?

Focus: prepare, review.

Compare finishes in the five minutes strictly below the selected target with finishes from the target up to, but excluding, five minutes above it. Subtract the target’s even-pace time budget from each mean section duration. Means reconcile with mean finish-time differences; selection on the outcome makes this descriptive.

### age: How does pacing differ across age groups?

Focus: prepare, review.

Compare median percentage pace change from 0–20 to 20–40 km across exact-age bands. When previous performance is supplied, compare the same 15-minute prior-time band. Otherwise compare the same displayed achieved-time band. Gender and course are held to the displayed selection. This is a comparison of different people, not an individual aging trajectory.

### terrain: What pace changes appear alongside the terrain?

Focus: prepare, review.

Align the supplied unique city-level course segments with the pacing profile. Historical route validity is unknown. Net elevation change can hide both climbing and descending; bridge decks, tunnels, smoothing and route changes can affect the profile. This does not estimate a historical hill penalty or grade-adjusted effort.

### downhill: What follows a fast opening on a downhill-start profile?

Focus: prepare.

Identify a net-downhill opening from the first two supplied 5 km terrain segments. Among the earlier-benchmark opening groups, compare median pace change from the 5–20 km baseline to the final 12.195 km. The supplied route is a proxy, and these associations do not establish that an early descent caused later slowing. Where no downhill opening is documented, show the general opening comparison and say so.

### checkpoint: What happened to runners at a similar checkpoint time?

Focus: prepare, review.

Match course, available age/gender groups, checkpoint and a two-minute elapsed-time band at 20, 30 or 35 km. Optional recent-5-km pace is classified relative to elapsed average pace using ±2%. The previous-marathon filter is not used because this comparison conditions on current-race progress. Show historical finish percentiles and the fraction below the visitor’s threshold, not a calibrated personal probability. Only complete eligible finishers are represented.

### courses: Which courses combine faster outcomes and consistency?

Focus: choose.

For the same displayed age, gender and prior-time cohort across courses, show the 10th, 50th and 90th percentiles of finish-time change relative to the recent recorded best. Require at least 100 observations and three editions per course. Use identical cohort criteria across the displayed courses. These different runners and editions do not isolate a course effect or provide equivalent-time predictions.

### weather: How do outcomes differ across cooler and warmer editions?

Focus: prepare, choose.

Use the supplied modeled start-hour temperature and runners with earlier benchmarks. Compute edition-level median finish-time change, requiring 20 finishes per edition/group. Average edition medians equally within temperature bands, requiring three editions and 100 finishes. Weather exposure is a start-hour proxy, not personal exposure; humidity, sun, wind and route changes are not isolated.

### ambition: Where does my target sit among comparable results?

Focus: prepare, choose.

Evaluate the selected time against the historical finish-time distribution in the displayed cohort. Optional previous performance selects a 15-minute band of recent recorded bests. Each whole-minute threshold from 1:30 through 12:00 is calculated exactly using a strict less-than comparison. Without previous performance this describes the selected field, not individual readiness.

### return: How do runners change when they return to this course?

Focus: prepare, review.

Use consecutive linked appearances in different years, at most three years apart, on the same city course, requiring one eligible recorded race in both endpoint years. Apply the profile to the later appearance and compare both observed section profiles, each normalized to its own finish. Report paired mean finish-time change. Route changes, fitness and selection remain possible explanations; first recorded is not first ever.

### gains: Where did runners improving toward this time gain minutes?

Focus: prepare, review.

Select finishes in the displayed achieved-time band that beat the runner’s fastest recorded finish from strictly earlier years. Compare durations in the opening 10 km, middle 20 km and final 12.195 km with that earlier result. Mean block gains sum to mean finish improvement. This is an earlier recorded best, not a lifetime personal best or a prescription for a future improvement.

## Current supporting study and compatibility routes

`analysis/build_public_explorer.py` generates `public/data/study/evidence.json` from the same 0934 input, eligibility parser, source-quality policy and history join. Its methods and denominators replace the old live/core summaries. The current refresh and publication evidence are recorded in [the refresh record](REFRESH_20260912_0934.md).

| Route or entry | Current data and interpretation |
| --- | --- |
| `/slowdown`, `/htw`, `/packs/smyth_htw` | Recalculated slowdown prevalence, first qualifying section, recorded-age comparisons and recorded-performance history (threshold/duration sensitivity: `/methodology#definition-sensitivity`, since October 16, 2026) |
| `rn1_wall_severity` | Recalculated distance-weighted positive slowing over 20–42.195 km, separate from sustained-episode detection |
| `rn4_reference_dependence` | Recalculated one-minute finish windows before and after 3:00, 3:30 and 4:00; no declared-goal inference |
| `rn3_heat_curves` | Current `ext_weather_pacing_patterns` |
| `p1_pace_band_planner` | Current full-course pace overview, linking to the dynamic pacing-pattern page for comparable finishers |
| `p2_halfway_calculator` | Current held-out checkpoint validation, linking to the interactive checkpoint comparison; 20 km is not halfway |
| `p3_race_week_weather` | Explicitly unavailable live forecasts; historical weather is not a forecast |
| `p4_even_effort_gap` | Explicitly unavailable validated course-adjustment estimate; links the current terrain proxy without reusing the old model |
| All canonical S/R questions and aliases | The 33 matching current extensions, or missing-start/proximity-data explanations for the remaining two questions |

Sustained slowdown uses contiguous recorded sections at least 25% slower than baseline pace over 5–20 km, totaling at least 5 km after 20 km. The final section is 2.195 km and cannot alone meet the five-kilometre duration. Onset is the first qualifying section boundary. The neutral [Published slowdown method (2021)](https://doi.org/10.1371/journal.pone.0251513) citation identifies the reference definition without claiming to reproduce undocumented old cost formulas.

The recorded-best figure is retrospective: each screened candidate identity's fastest eligible observed finish supplies the comparison year, resolving ties by earliest year and then record ID. The separate earlier-performance chart uses only the best eligible finish from the two strictly earlier years. Best-year selection and unequal follow-up can explain patterns; neither chart identifies a training effect or lifetime best. At least 100 finishes are required for displayed study cells.

Group dynamics (`r16_groups_hold_or_fall`) and congestion (`r33_start_congestion`) cannot establish physical proximity from elapsed splits alone. Actual start offsets/absolute timing and wave information are missing. Terrain and course comparisons remain proxies/observational comparisons; qualifying-threshold analysis is narrower than individual qualification or acceptance.

## Public race lookup

`analysis/build_runner_lookup.py` supplies `/runners` with deterministic compressed name/profile shards and a checksummed manifest. Search normalizes names for discovery, never for identity merging. Screened supplied candidate identities can suggest related races; visitors select which records belong to them. Missing-name records are counted but cannot be discovered by an invented name.

The race display retains missing/raw timing values and quality-exclusion reasons. Eligible runner comparisons use actual recorded splits: early pace covers 5–20 km, late pace covers 30 km–finish, and the opening covers 0–5 km. Section charts use each actual section distance, including the final 2.195 km. A best among selected records is an observed database best, not a verified lifetime best. Course/weather/age context must retain its measured or proxy status; the lookup does not infer training, fueling, health or personal goals.

The [runner-context extension](RUNNER_CONTEXT_AND_PEERS.md) adds same-edition finish placement for All, recorded gender, exact-age band and combined groups, plus 15-minute achieved-time pacing quartiles. These groups use the same 3,517,336 eligible finishes and require 101 observations. Finish percentiles exclude the selected record, with other ties receiving half weight; group medians and pace quartiles include it. Higher percentile means a faster recorded finish among eligible database peers, not official standing. Selected-race section differences are descriptive elapsed-time comparisons.

Its separate 256-shard context output is bound to the exact runner manifest. Weather has 249 valid edition matches with five supplied hourly readings and source-unit checks; elevation covers 254 editions and remains an unverified historical-route proxy. Whole-profile and section elevation measurements are retained separately. This adds contextual views, not a causal weather/elevation model, new identity linkage, extra independent studies, or a validated finish-time adjustment. Builders, gap details and independent verification are in [RUNNER_CONTEXT_AND_PEERS.md](RUNNER_CONTEXT_AND_PEERS.md).

## Maintaining this document

Review the primary ten against `lib/ten-analyses.ts`, and the archive and backing-engine maps against `analysis/pack_registry.json`, `lib/question-catalog.ts` and `lib/personalized-catalog.ts` after adding analyses. Update the entry's method, input vintage, cohort, script and output links when calculations change. Preserve the separation between hypotheses, measured fields, derived features, completed outputs and blocked questions.
