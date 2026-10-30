# Course, weather and opening comparisons without earlier finishes

This extension uses the adopted source in [analysis/release.json](../analysis/release.json), with the exact published runner lookup and matching edition context. It adds descriptive within-race comparisons; it does not recalculate or relabel the existing earlier-result calculations. The [fast-start analysis](FAST_START_ANALYSIS.md) already supports finishes without earlier history.

## Scope and questions

The broader views answer these questions using a single eligible race:

- **Courses:** How much late slowing and pacing variation appears in each course's observed race fields?
- **Weather:** How do recorded pacing patterns and sustained slowdown compare across supplied start-temperature bands?
- **Race days:** What pacing pattern appears within a particular recorded edition?
- **Downhill openings:** How do opening pace and later pacing line up on courses whose supplied current route begins downhill?
- **Slow openings and pacing tradeoffs:** What happens after a slow or fast first recorded section compared with the same race's subsequent early pace?

These are separate from personal improvement, learning, familiarity, return races or the same runner's performance on different courses. Those questions need earlier or repeated results by definition. Their existing calculations retain that requirement; a broader current-race comparison must not claim to show personal improvement.

The course and weather pages show these broader views only: their earlier-result comparison was cut in the redesign ([ten analyses](TOP_TEN_ANALYSES.md#current-source-and-defaults)). The personalized paths that computed it measured finish change from a recent earlier best: the fastest eligible result in the two strictly earlier calendar years in a screened supplied identity candidate, not measured fitness, a declared goal, the last marathon, or a verified lifetime best. A blank earlier-time filter there meant all available earlier benchmarks, not all finishes. Earlier performance is not required for these views.

## Routes and preserved history

`/analyses/course-comparison` and `/analyses/race-day-weather` show the broader views; `/analyses/downhill-start` shows the broader downhill view. The twelve-question research guide closed with the redesign (PR #71, merged October 20, 2026): `/research/personalized` answers 308 to `/research` (checked October 30, 2026), and its calculations stay in the analyses.

Until the redesign, seven research-archive routes (`/packs/r01_banking_time`, `r02_recover_slow_start`, `r34_pacing_risk_reward`, `r13_great_day_vs_consistency`, `r35_course_adaptation`, `r15_weather_penalty_who` and `s5_pacing_vs_difficult_day`, with their aliases) showed these broader views by default. The redesign closed the archive ([SEO](SEO.md#moved-addresses-october-18-2026)): those addresses answer 308 to `/methodology#downloads` (checked October 30, 2026 for `/packs/r01_banking_time`), and the calculation data they read is unchanged.

The opening views reused the previously verified all-finisher fast-start output and its optional earlier-best mode. The other defaults used the new context output. Shared underlying observations do not make these independent studies. Earlier-result questions that inherently need multiple races remain clearly identified as such.

## Inputs, eligibility and exact filters

[build_all_finisher_context.py](../analysis/build_all_finisher_context.py) reads every published runner shard and every runner-context edition shard. It checks compressed byte sizes and SHA-256 checksums, record and candidate-profile uniqueness, source calculation hashes, exact edition mapping, the reviewed edition policy and raw/eligible counts. The runner-context manifest must bind the exact runner manifest's hash and timestamp. A matching release tag alone is insufficient. Refreshing either source requires rebuilding the new output.

The current source (`private-export-20261021-1050`, adopted October 22, 2026) contains **5,327,504 raw records** and **4,108,749 eligible finishes** across **215 editions** with eligible timings (1652, historical: 4,915,355, 3,871,767 and 211; 0934: 4,462,379, 3,517,336 and 196). All eligible finishes can contribute without any previous-result or identity-link requirement. Incomplete timings and reviewed held/selected-field editions remain excluded from aggregate outcomes. Their records remain searchable under the [runner lookup contract](RUNNERS_AND_REPORT.md#runner-search).

Exact filters are course, recorded age band, recorded gender and the same race's early pace. Unknown age or gender remains in All; neither is imputed. There is no eventual-finish, target-time or earlier-result selection in the new calculation. No sparse result is silently replaced with another course or a broader demographic group.

Early pace is the recorded **5–20 km** elapsed time divided by 15 km. Bands are below 270, 270 to below 330, 330 to below 390, and at least 390 seconds/km. These are observed current-race pace bands, not pre-race ability. Their boundaries are included in the higher band. The builder recovers the baseline from the existing all-finisher observation matrix and uses a `1e−8` seconds/km tolerance only for binary recovery noise at exact boundaries; source timings are preserved. The independent verifier classifies original decimal elapsed times by exact integer cross-products.

## Edition balance and sample rules

Across-edition course, weather and downhill groups first require **20 eligible finishes within each exact edition/filter/group**. After removing smaller edition cells, a displayed group requires **100 finishes and three editions**. For downhill comparisons, the 20-finish gate applies separately to each opening band within an edition. A sample count includes only records from those supported edition cells.

The single-edition race-day view requires **100 finishes in the exact selected edition/filter**. The three-edition requirement applies to cross-edition comparisons; it does not prevent describing one observed race day. A single edition cannot provide a between-edition comparison or reliability estimate.

For cross-edition groups, each included edition receives equal weight:

| Published measure | Calculation and interpretation |
| --- | --- |
| Sustained-slowdown percentage | Mean of each edition's detected-finish percentage; it is not pooled detections divided by pooled finishes. |
| Late pace change | Mean of each edition's median individual late percentage change. |
| Time difference after 20 km | Mean of each edition's median difference from continuing that race's 5–20 km pace. |
| Nine-section pace curve | Mean of edition medians for each recorded section's percentage difference from that race's 5–20 km baseline. |
| Within-edition late-pacing spread | Mean of each edition's 90th minus 10th percentile of individual late changes. It describes variation within observed fields, not consistency of the same runner across races. |
| Between-edition ranges | 10th and 90th percentiles of edition slowdown percentages or edition median late changes. They are observed spread, not confidence intervals. |
| Actual finish median | Median across the included individual finishes, intentionally pooled to show differences in field composition. |
| First qualifying section | Pooled counts and shares among detected finishes, with at least 100 detections. This uses a different denominator and weighting from the edition-balanced slowdown percentage. |

Each output group lists its exact edition indices. Counts are recorded performances, not unique people or all starters. Large marathons do not dominate the equal-edition metrics solely because their fields contain more records, but equal edition weights do not remove confounding or make repeated editions independent randomized experiments.

## Within-race outcomes

Let `B = (time at 20 km − time at 5 km) / 15` in seconds/km.

- Late percentage change is `100 × (((finish − time at 30 km) / 12.195) / B − 1)`.
- After-20 km time difference is `finish − time at 20 km − 22.195 × B`.
- Each section's percentage change is `100 × (section pace / B − 1)`.

Positive changes mean slower pace or more elapsed time than that recorded reference. The after-20 difference is accounting against the 5–20 km pace, not time caused by an opening choice, weather or terrain, and not time a runner could necessarily recover. Separate section medians do not reconstruct one representative race.

Sustained slowdown retains the site's definition: pace at least **25% slower than the 5–20 km baseline for at least 5 km after 20 km**, with `1e−12` ratio tolerance for binary rounding. The final 2.195 km cannot qualify alone. First qualifying sections start at 20, 25, 30 or 35 km; timing mats locate a recorded section rather than the exact moment or physiological cause of slowing. The neutral [published-method reference](https://doi.org/10.1371/journal.pone.0251513) remains linked on the site.

Only complete eligible finishes are observed. Withdrawals, non-finishers, fueling, training and exertion are not measured by these comparisons.

## Weather and terrain

Weather groups use validated modeled temperature at the supplied scheduled start, with half-open boundaries at **5, 10, 15 and 20°C**. Missing or rejected context is omitted, never converted to zero. Under 1050 the input context matches all **4,108,749 eligible finishes in 215 editions** before sample thresholds (since October 22, 2026, when Chicago 2025's 07:00 reading for its 07:35 start was accepted; on October 21, 4,055,130 finishes in 214 editions). These counts describe context availability; publication thresholds can further reduce a selected chart's denominator.

Scheduled-start temperature is not a runner's personal wave time or exposure along the course. Start-time provenance retains the source limitations documented in [runner context](RUNNER_CONTEXT_AND_PEERS.md). Optional course and early-pace filters make comparisons more specific but do not isolate a causal temperature effect. Course, field composition, year, pace strategy, congestion and fitness can differ across groups. The existing warming/wind analyses and withheld humidity decision retain their separate evidence rules.

The supplied current-route context covers **3,871,757 eligible finishes in 200 editions** before sample thresholds. The 15 eligible editions without a matching profile are Warsaw 2015–2018 and Washington 2008–2018 ([runner context](RUNNER_CONTEXT_AND_PEERS.md)). A descriptive downhill opening means the supplied first-5 km section has net change **strictly below −25 m**. The exact boundary belongs to other known openings; missing terrain is neither flat nor part of that comparison.

Before opening-band and demographic thresholds, the larger-descent source category contains Boston (ten eligible editions), Warsaw (eight, 2019–2026) and Sydney (three). In particular, Boston has a distinct selected race field. This composition is material context when interpreting the grouped comparison.

Historical route validity remains unknown. A current supplied profile does not establish the elevation used in a historical edition. Net change can hide both climbs and descents; supplied section gain/loss and whole-profile totals have different processing and are not interchangeable. No elevation-adjusted finish, terrain penalty, effort estimate or causal downhill effect is calculated.

Opening pace bands retain the [all-finisher fast-start definitions](FAST_START_ANALYSIS.md): first 5 km versus 5–20 km, with six fixed bands from more than 10% faster to more than 5% slower. The opening and later outcomes share a baseline; a quick first section is not proof of excessive effort. A runner who holds an ambitious pace through 20 km and then fades can remain in the steady-opening group.

## Measured output for the adopted source

**1050 (October 22, 2026).** Rebuilt from the 1050 runner manifest (`cd2c99d7…`, `as_of` 2026-10-21T16:10:31Z) and the context manifest rebuilt after the owner accepted Chicago 2025's 07:00 weather reading for its 07:35 start (`00b907f6…`, `as_of` 2026-10-22T11:19:28Z; October 21: `5d4f8d6a…`): **1,360 exact filter rows and 23,261 groups** (2,008 course, 2,071 temperature, 3,996 opening/terrain and 15,186 race-edition summaries), 14,448,969 bytes, SHA-256 `19060f63ee42097fe2e5458e75075b7234a20e4a6bae2a356e6fdf3c17f60fd9`. With every filter at All: 23 courses and 3,952,130 finishes; five temperature bands over all 215 editions and 4,108,749 finishes (13, 72, 103, 21 and 6 editions from coldest to warmest; on October 21, 214 editions and 4,055,130 finishes, with 102 in the 10 to below 15°C band); 215 race days and 4,108,749 finishes; twelve terrain/opening groups over 3,871,357 finishes (terrain on 200 editions). The edition-balanced slowdown percentages across the temperature bands are **30.4%, 26.4%, 32.5%, 40.6% and 37.0%**, coldest to warmest (`slowdown_pct` of `rows[0].weather`): still not monotonic, and no optimal temperature or causal heat penalty follows from them.

**CI on 1050.** The **All-finisher context analyses** workflow recalculated this file from the published runner and context shards on PR #78's final head `68d0f5e1` and reconciled it with the independent verifier ([run 39785746776](https://github.com/koolkam00/pace-notes/actions/runs/39785746776), October 22, 2026, success). Its `all-finisher-context-evidence` artifact, downloaded and compared on October 30, 2026, is identical to the committed file apart from `as_of`.

### Earlier releases (historical)

**1652 (October 16–17, 2026; historical).** Rebuilt from the 1652 runner manifest (`1bf94ccd…`, `as_of` 2026-10-17T03:53:53Z) and context manifest (`f8a9b5e7…`, `as_of` 2026-10-17T04:02:40Z): **1,451 exact filter rows and 23,493 groups** (2,216 course, 1,925 temperature, 4,172 opening/terrain and 15,180 race-edition summaries), 14,559,992 bytes, SHA-256 `864c7c28ee332cfaa665acde3157f0826191d2733e8e407a6808437e13cf613c`. With every filter at All: 25 courses and 3,718,249 finishes; five temperature bands over all 211 editions and 3,871,767 finishes (12, 70, 104, 20 and 5 editions from coldest to warmest); 211 race days and 3,871,767 finishes; twelve terrain/opening groups with 3,634,392 finishes (terrain is available for 196 editions and 3,634,775 finishes; Washington's twelve editions lost terrain because the producer renamed its profile, see [runner context](RUNNER_CONTEXT_AND_PEERS.md)). The edition-balanced slowdown percentages across the temperature bands are **30.1%, 26.4%, 32.7%, 38.8% and 35.3%**, coldest to warmest; still not monotonic. The independent verifier's 1652 run is recorded in the [refresh record](REFRESH_20261016_1652.md). The 0934 figures below are historical.

**0934 (historical).** The additive output contains **1,362 exact filter rows and 21,800 groups**: 1,816 course comparisons, 1,789 temperature comparisons, 4,301 opening/terrain comparisons and 13,894 individual race-edition summaries. Its size is **13,602,357 bytes**, with SHA-256 `97ca3dfdad73f9b6c3307cf8a5097ea6ceb99661bfe96c15934d7eae0becb24e`.

With All courses, ages, recorded genders and early paces:

| View | Published coverage after its sample gates |
| --- | --- |
| Courses | 24 courses; 3,398,784 finishes. |
| Weather | Five temperature bands; 192 editions; 3,507,382 finishes. |
| Race days | 195 individual editions; 3,517,322 finishes. |
| Opening/terrain | Twelve terrain/opening groups; 3,513,963 finishes across all six opening bands. |

These denominators differ from total eligible and context-available records because of the stated edition/group thresholds. The default downhill page selects one opening band; its displayed denominator must not use the sum over all twelve groups.

The unfiltered edition-balanced slowdown percentages across the five temperature bands are **31.6%, 27.0%, 32.6%, 39.0% and 35.3%**, from coldest to warmest. The relationship is not monotonic. Different race fields and conditions remain mixed; these observations do not establish an optimal temperature or a causal heat penalty.

## Reproduction and independent verification

The build, independent verification and import steps are in [operations](OPERATIONS.md#all-finisher-context-refresh): build to a temporary file, run `node scripts/verify-all-finisher-context.cjs --input` on it, then copy it into `public/data/all-finisher-context/` and run `npm run verify:data` and `npm run build`.

The separate [JavaScript verifier](../scripts/verify-all-finisher-context.cjs) imports no calculation helper. It independently verifies every source shard, traverses every raw profile record, checks record/profile uniqueness, reconstructs each exact eligible filter, rejects missing/unsupported groups, recounts every published group's edition membership, sample, detected count and onset shares, and recomputes every edition-balanced slowdown percentage and between-edition rate range.

Full numeric verification covers every unfiltered course, temperature band and published race day, plus representative downhill, age, gender and early-pace combinations. It independently recomputes individual section/late/after-20 outcomes, edition quantiles, equal-edition summaries, pooled actual-finish medians and both within- and between-edition spreads. Numeric checks share typed-array edition cells to keep memory bounded. Boundary fixtures separately distinguish missing from zero, preserve unknown demographics in All, include exact temperature/early-pace boundaries, apply the strict downhill boundary, and reject the short last section as a slowdown episode by itself.

Under 1050 the verifier passed on the local build of October 21, 2026, again after the October 22 rebuild ([calculation log](evidence/2026-10-22/chicago-2025-weather/calculation-log.txt)), and in CI (above).

Under 1652 the verifier checked all 7,881 runner shards and 287 exact context shards, independently recounted all 23,493 groups and recomputed 245 full numeric groups across 280 edition cells (October 17, 2026; [calculation record](evidence/2026-10-16/refresh-1652/calculation-runs.json)). The 0934 run (historical) passed against the artifact identified then. It checked **all 7,766 runner shards and 256 context shards**, reconciled **4,462,379 raw records and 3,517,336 eligible finishes**, validated **all 21,800 published groups** and **8,209 omitted sparse groups**, and independently recomputed the complete numeric metrics in **228 groups across 257 edition cells**. The latter include every unfiltered course, temperature band and published race day plus four representative filtered/terrain groups. All twelve new Python method tests passed. This certifies the stated local calculation checks, not visual browser behavior or production publication.

Record calculation output, tests, PR checks, merge and production checks separately for each rebuild; the deployed state is in the [project handoff](PROJECT_HANDOFF.md#current-state). Existing earlier-result outputs remain preserved with their original bytes and provenance.

## History (earlier releases)

Text moved here word for word on October 30, 2026 from this file as it stood at `main`'s commit `a2c6e507`, when the sections above were rewritten for 1050 and the redesigned site. Counts belong to the release they name; do not quote them as current. Older versions are in Git history.

### The earlier-result mode and routes, as written before the redesign merged (lines 17, 21 and 23)

Earlier-result modes on the course and weather pages continue to measure finish change from a recent earlier best. A blank earlier-time filter means all available earlier benchmarks in that mode, not all finishes. The benchmark is the fastest eligible result in the two strictly earlier calendar years in a screened supplied identity candidate. It is not measured fitness, a declared goal, the last marathon, or a verified lifetime best. Earlier performance is not required for the new default views.

The primary `/analyses/course-comparison` and `/analyses/race-day-weather` pages use the broader views by default and offer the distinct earlier-result comparison. `/analyses/downhill-start` adds the broader downhill view with access to the original history-based guide. The twelve-question research guide (`/research/personalized`) closed on October 18, 2026 (branch state); its calculations stay in the analyses.

Until October 18, 2026 seven research-archive routes (`/packs/r01_banking_time`, `r02_recover_slow_start`, `r34_pacing_risk_reward`, `r13_great_day_vs_consistency`, `r35_course_adaptation`, `r15_weather_penalty_who` and `s5_pacing_vs_difficult_day`, with their aliases) showed these broader views by default. The redesign closed the archive (branch state, not deployed; [SEO](SEO.md#moved-addresses-october-18-2026)): those addresses are stubs that forward to `/methodology#downloads`, and the calculation data they read is unchanged.

### Weather and terrain coverage, as written for 0934 (lines 74, 78 and 80)

Weather groups use validated modeled temperature at the supplied scheduled start, with half-open boundaries at **5, 10, 15 and 20°C**. Missing or rejected context is omitted, never converted to zero. The input context matches **3,507,396 eligible finishes in 193 editions** before sample thresholds. Amsterdam 2020, Frankfurt 2022 and Vienna 2022 have eligible finishes without supplied valid weather context. These counts describe context availability; publication thresholds can further reduce a selected chart's denominator.

The supplied current-route context covers **3,514,374 eligible finishes in 194 editions** before sample thresholds. Melbourne 2015 and Vienna 2022 lack a terrain profile. A descriptive downhill opening means the supplied first-5 km section has net change **strictly below −25 m**. The exact boundary belongs to other known openings; missing terrain is neither flat nor part of that comparison.

Before opening-band and demographic thresholds, the larger-descent source category contains Boston (seven eligible editions), Sydney (three) and Warsaw (four). In particular, Boston has a distinct selected race field. This composition is material context when interpreting the grouped comparison.
