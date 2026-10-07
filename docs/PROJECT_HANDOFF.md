# Project handoff

## Pace Notes presentation and requests

The public name is Pace Notes, with Instagram attribution to Run_with_Kam · Andrew Kam. `/request-analysis` prepares an email request to Andrew; the visitor sends it from their email app or Gmail. It does not send mail from the server or confirm delivery. See [website architecture](WEBSITE_ARCHITECTURE.md#pace-notes-branding-and-analysis-requests). This presentation change does not recalculate analyses or alter data pins.

## Redesign and data stories (October 2026 implementation)

The site has a new visual system ([design system](DESIGN_SYSTEM.md)) and a `/stories` section with seven narrative analyses. The stories are built from the unchanged `private-export-20260912-0934` runner shards by `analysis/build_insights.py` and recounted by `scripts/verify-insights.cjs`, which is now part of `npm run verify:data`. The homepage leads with a race replay and story chapters, then the ten analyses. Course pages add each course's pacing fingerprint and its race mornings. A footer control pauses every animation site-wide, and every hover-only readout has a keyboard path (see the motion and chart rules in the design system). The stories leave out Chicago 2018 and 2019 because they duplicate Chicago 2024 (see [known issues](KNOWN_ISSUES.md)); existing analyses are unchanged. Methods, screens and reproduction are in [data stories](STORIES.md). The repository state described here is separate from deployment: confirm the production commit before claiming the redesign is live.

## Broader analysis views (September 17 implementation)

Weather and course comparisons now default to within-race evidence without linked history. Their prior-result modes retain the original outputs. A new downhill-start view and seven broader archive entries cover slow/aggressive openings, opening variability, course consistency, course profiles, weather profiles and same-edition context. The additive builder consumes the exact checked runner and runner-context manifests; neither source pin nor earlier output is changed. Read [methods, routes and validation](ALL_FINISHER_ANALYSES.md). Personal improvement and longitudinal learning still require linked races; the UI explains this explicitly. Publication evidence for this change must be recorded separately from PR #42.

Updated September 17, 2026 for the expanded [fast-start analysis](FAST_START_ANALYSIS.md), using the unchanged **`private-export-20260912-0934`** pin. Its new default includes all eligible finishes; the earlier-best comparison remains available with its original output. Calculation, CI and publication evidence for the addition must be recorded separately from the earlier [PR #41](https://github.com/koolkam00/htw-live-study/pull/41). The [current refresh record](REFRESH_20260912_0934.md) distinguishes the September 12 source audit, calculation, import and production verification. The [runner-context record](RUNNER_CONTEXT_AND_PEERS.md) and [supporting-study/name-search record](CURRENT_SITE_AND_RUNNER_SEARCH.md) retain their earlier implementation evidence. The public site is [splithappens.run](https://splithappens.run).

## Read in order

1. [Data architecture](DATA_ARCHITECTURE.md)
2. [Website architecture](WEBSITE_ARCHITECTURE.md), with the [design system](DESIGN_SYSTEM.md) and [data stories](STORIES.md)
3. [Analysis catalog](ANALYSIS_CATALOG.md)
4. [Operations](OPERATIONS.md)
5. [Known issues](KNOWN_ISSUES.md)
6. [Producer handoff](INGESTION_HANDOFF.md), treating its September 10 blockers as historical

The [analysis README](../analysis/README.md) gives calculation and import contracts; [export access](../analysis/ACCESS.md) provides direct public downloads.

## Website analytics

The [PostHog integration](ANALYTICS.md) adds cookieless page and feature analytics, with search/identity redaction, session recordings disabled and a visitor opt-out. Account setup, build variables and production event verification are separate launch requirements; see that runbook before claiming collection is live. This integration does not change research inputs or calculations.

## Verified 0934 input and analytical cohort

The September 12 0934 CORE and FULL archives have matching shared files and **4,462,379 raw and feature rows**, spanning **34 cities and 256 city/year editions**. Canonical IDs are unique, non-null and have identical sets. Edition labels, recorded names and ages agree; all comparable cumulative timings agree within 1 ms after converting feature minutes to seconds. Against the September 11 1107 snapshot, the raw table has **254,923 added, zero deleted and zero changed records**, including 16 new editions. The latest included ingestion timestamp is `2026-09-12T10:00:03Z`; manifest creation is `2026-09-12T13:37:16Z`.

The compressed SQLite snapshot was downloaded and opened read-only. Its database SHA-256 matches the manifest, `PRAGMA integrity_check` returned `ok`, and it contains the same 4,462,379 raw rows and latest ingestion timestamp. This is backup verification, not access to or modification of the live service.

Raw timing checks yield **3,595,426** plausible complete finishes. The reviewed source-quality policy removes **78,090** otherwise plausible finishes from eleven specifically identified editions, leaving **3,517,336 eligible finishes**. Raw exclusions are 632,168 missing/unparsed, 225,218 non-increasing, 9,567 outside timing bounds and zero exact duplicates. Source exclusions apply after these checks and do not double-count invalid rows. They also apply before earlier-performance benchmarks are formed.

The producer's `valid_splits` flag identifies **3,558,154** feature rows, with **1,082,894** sustained-slowdown flags among them. That is a different cohort from this site's raw-timing/source-quality cohort. The site's eligible cohort retains 36,161 finishes with unrecorded/other gender. Its gender counts are 2,339,125 men, 1,142,050 women and those 36,161 other/unrecorded finishes. Do not interchange these definitions or call finish counts unique people.

The current linked-history calculation has **3,194,070 linked eligible finishes**, **555,437 recent strictly-earlier-year benchmarks**, **583,670 qualifying cross-year pairs**, and **3,185,321 linked finishes with a supplied edition date**. These are observations and candidate links, not independently verified people.

## Refresh and publication boundary

The September 12 refresh rebuilt the **33 registered extension packs**, the **12-path personalized engine**, and the **three-candidate weather screen**. Both [main](../analysis/release.json) and [weather](../analysis/weather-release.json) pins are adopted with their validated outputs. The complete import passed its checks against the named release. Consult [the refresh record](REFRESH_20260912_0934.md) for deployment verification against the publication commit. Rank 2 subsequently receives two separate fast-start calculations from the same verified runner profiles, covering all eligible finishes and the smaller earlier-best cohort; the archive's earlier opening path and existing packs retain their outputs.

Weather publication follows the existing evidence rule. A previously published candidate can become withheld and vice versa; all three results remain in the downloadable audit. See [weather methods and decisions](WEATHER_ANALYSES.md).

The subsequent implementation removes old `live.json` charts and original S/R/RN/P data as website inputs. `live.json` becomes a small current-release compatibility metadata file, with no historical figures. `build_public_explorer.py` recalculates sustained-slowdown prevalence, onset, threshold sensitivity, age, earlier-performance, recorded-best, severity and milestone summaries into `public/data/study/evidence.json`. Existing S/R aliases use their current extension; old planner/checkpoint entries open current equivalents. Forecast and validated course-adjustment outputs remain explicitly unavailable where the current inputs cannot support them. Historical outputs remain recoverable in Git history and are never relabeled as fresh. The earlier extension metadata’s `live_as_of` field is historical calculation context only. The new supporting calculation has **1,070,946 detected finishes among 3,517,336 eligible finishes (30.4476%)**; the producer’s 1,082,894 count belongs to its different feature-valid cohort.

## Product and statistical contracts

The primary experience presents [ten ranked runner questions](TOP_TEN_ANALYSES.md), plus weather questions passing the evidence gate. The archive retains 35 broader questions: 33 calculated extension packs and two limited by missing group/start-offset measurements. These overlapping views are not independent studies.

The initial personalized profile is explicitly All courses / 4:00, all ages, all recorded genders and no earlier time. Whole-minute target support is 1:30–12:00; achieved-time profiles use 15-minute bands. A valid selection does not guarantee a sufficiently large cohort. Previous time means a band of recent recorded bests from strictly earlier years, not a verified last marathon. Terrain requires an explicit course and remains a supplied-route proxy. The separate fast-start page defaults to all eligible finishes with course, age, gender and opening-band filters. Its optional history mode adds four broad earlier-best time bands. Neither mode uses a target or current-finish filter; sparse selections are never silently broadened.

Miles and minutes per mile are the default display, with a Miles / Kilometres switch and feet for elevation in miles mode. `units=mi|km` takes precedence over the saved preference. Weather converts temperature differences to °F without adding 32 and wind to mph; calculations remain metric. Recorded 5 km sections become 3.11 miles without inventing individual-mile or halfway splits. Visible source descriptions list marathon/year coverage and recorded weather/elevation fields. Exact release tags and timestamps remain in download URLs and machine-readable calculation files, not reader-facing copy.

The sustained-slowdown calculation uses contiguous recorded sections totaling at least 5 km after 20 km; onset is a section boundary, not an exact moment. The definition remains at least 25% slowing for at least 5 km after 20 km relative to the 5–20 km baseline, with the neutral [published-method citation](https://doi.org/10.1371/journal.pone.0251513). Canonical record IDs are not verified cross-race identities: retain ambiguity, gender/birth-year and duplicate-edition checks, and exclude current/same-year results from prior benchmarks.

## Fast-start analysis

Rank 2, `/analyses/starting-pace`, defaults to [all eligible finishes](../public/data/fast-start/all-finishers.json): **3,517,336** performances, including **2,961,899** without a recent prior benchmark. It compares first 5 km pace with the same race's 5–20 km pace using six fixed intensity bands. The primary time outcome is actual elapsed time after 20 km minus the time at that recorded reference pace; the actual median finish is separate. First-5 km and after-20 km mean differences add to the whole-race mean difference because the 5–20 km reference block contributes zero. No earlier history, cross-race identity link, speed filter or imputed data is needed.

The optional [earlier-best comparison](../public/data/fast-start/evidence.json) retains its original output byte for byte. It compares first 10 km pace with the best eligible finish in the two strictly earlier calendar years, covering **555,437 benchmarked finishes**, 576 exact filter combinations and 2,846 groups. Its history restrictions do not limit the new default mode. The earlier personalized opening/target-threshold path remains in the research guide without recalculation.

Both builders check all 7,766 compressed runner shards and source script hashes and reconcile raw/eligible counts. Both outputs bind the exact runner-manifest hash, so lookup refreshes require rebuilding both. Each displayed group needs 100 finishes. Onset distributions additionally need 100 detected finishes and use only those detected finishes as their denominator; the slowdown rate uses every finish in the selected mode/group. All raw records remain searchable/downloadable under the existing lookup contract, but incomplete or held results do not enter these aggregate outcomes.

The all-finisher comparison finds unusually quick first sections, not proven excessive effort. It can miss a runner who maintains an ambitious opening pace through 20 km before fading. The same-race baseline is measured after the opening and is shared by the opening and slowdown ratios. Neither mode estimates causal time penalties, current fitness, physiological failure or withdrawals. Counts are performances, not unique runners. `comparison=all|history` selects the mode; legacy `prior=` or `previous=` links imply history only when no explicit mode is set. Explicit All clears prior filtering.

The new calculation publishes **314 filter combinations / 1,534 groups** and passes ten new Python tests and its full independent source-data verifier. Its All-filters `fast10` group has **174,935 finishes**, **49.6% sustained slowdown**, and median time after 20 km **28:04 above the 5–20 km pace reference**. Its actual median finish is **5:45:31**. The steady group has **1,500,147 finishes**, **24.5% slowdown**, and an **8:35** median after-20 km reference difference. Among detected finishes, their most common first qualifying sections are **20–25 km** and **35–40 km**, respectively. These are pooled descriptive differences, not a personal causal penalty; CI and publication remain separate from the completed local evidence.

In **history mode only**, openings more than 10% faster than the earlier benchmark have **47.0% sustained slowdown**, versus **17.9%** for openings within 2%. Their most common first qualifying sections are 30–35 km and 35–40 km. The faster-opening group's median finish nevertheless improves on its earlier benchmark by **16:37**. These figures cannot be relabeled as all-finisher findings. Nine history calculation tests and its independent verifier passed, including counts/onsets for every cell and all numeric metrics for 36 groups across six filters. [Methods, measured findings and reproduction commands](FAST_START_ANALYSIS.md) distinguish that existing evidence from verification of the new mode. CI and production evidence for the expansion remain separate.

## Public runner lookup

`/runners` searches the current release's recorded names and lets visitors confirm which candidate races belong to them. `build_runner_lookup.py` writes compressed, checksummed search/profile shards and a source manifest. The index includes usable named raw records even when their splits or edition are excluded from aggregate analysis. There are 4,462,237 records with searchable names and 142 without a usable normalized name, including 11 null names. No name is invented. Missing timings and quality reasons remain visible.

Candidates use screened supplied identities where available, otherwise one record per candidate. Names never establish cross-race identity. Every performance comparison is limited to the visitor's selected recorded races and eligible timings; an observed best is not necessarily a lifetime best. Search and full-data downloads are public, with no account requirement.

The new runner-context pipeline adds exact same-edition finish comparisons by recorded gender and exact-age band, achieved-time pacing quartiles, selected-race section differences, and validated weather/current-route context. It binds its 256 edition shards to the exact runner manifest; lookup refreshes therefore require a context rebuild even at the same release tag. It uses the same 3,517,336 eligible finishes, with 1,729 peer groups and 13,523 achieved-time pace groups. Weather matches 249 raw editions and terrain 254; gaps and proxy limits remain explicit. See [methods, coverage and verification](RUNNER_CONTEXT_AND_PEERS.md) and the [refresh commands](OPERATIONS.md#runner-context-refresh).

The [September 17 runner-coverage update](RUNNER_RECORD_COVERAGE.md) makes lookup coverage visible beside the search form and gives selections containing only incomplete or held results a full source-record view. Mixed selections retain those records alongside eligible-race analysis. A scan of every published profile found 944,975 searchable records that are ineligible for analysis; all were already indexed. This is a presentation update, with no source-pin, index, calculation or eligibility change. Publication is verified separately in the PR.

## Public access and operations

Source code, complete runner records including recorded names, exports, database snapshots, overlays and aggregate outputs are public research material. Gzip compression is not encryption. Release assets keep large binaries out of website builds for size and reproducibility. Passwords, access tokens and operational credentials are not dataset contents.

The 0934 manifest omits a self-entry and is independently hashed; the prior incorrect self-size is no longer present. Release/README privacy prose remains stale, and ID-CONTRACT/FEATURE-FIELD-NOTES still name the prior snapshot. The feature notes also overstate which fields are safe as prior inputs. Preserve these immutable source files and recompute earlier-only benchmarks. See [access evidence](../analysis/ACCESS.md).

Public snapshot access does not provide shell access to the live ingestion service. Producer schedules, retries and hosting credentials remain outside the website agent's inspected environment. Never replace the live database with a downloaded snapshot.

## Remaining producer work

Reconcile held and partial editions against source totals; resolve the selected top-finisher source and invalid split grids before reconsidering their exclusion. New York 2008 grew to 38,047 records but remains held until completion/source-total reconciliation is supplied. Valencia 2018 is explicitly held; its missing 20 km timing already excludes it numerically. Investigate Paris 2014–2018 checkpoint parsing against source semantics. Improve missing-age coverage (2,893,395 raw ages are null), source chronology and ambiguous start-time provenance. All feature race dates and all historical validity ranges in the 32 course profiles remain null. Do not infer precise ages, chronology, wave starts or historical routes.

The runner-context audit also identifies a conflicting Helsinki 2025 start hour, six raw editions without weather, two cities without course profiles, and incompatible whole-profile/section elevation totals. Request sourced corrections and documented elevation processing in a new immutable export; preserve the original evidence. Current gaps are listed in [the refresh record](REFRESH_20260912_0934.md#weather-terrain-and-remaining-gaps); the runner-context record retains its earlier coverage evidence.

## Historical milestones

- September 7 CORE/FULL record IDs are incompatible; its natural-key linkage remains supported for reproduction.
- September 10 ID alignment was verified, but archive sidecars and missing history columns prevented that vintage's refresh. [Run 34490423926](https://github.com/koolkam00/htw-live-study/actions/runs/34490423926) failed before extraction. Compatible September 11 exports supersede those blockers; the historical run did not become successful.
- The essential-ten redesign shipped in [PR #32](https://github.com/koolkam00/htw-live-study/pull/32), with miles display in [PR #33](https://github.com/koolkam00/htw-live-study/pull/33). The earlier weather screen used the September 11 0336 export separately from the September 7 main input.
- Dated [ID evidence](evidence/2026-09-11/id-contract-audit.json), [timing evidence](evidence/2026-09-11/timing-unit-contract-audit.json), [access evidence](evidence/2026-09-11/public-access-audit.json) and [display verification](evidence/2026-09-11/miles-display.md) remain historical records, not current-vintage counts or deployment certification.
