> **History.** Moved here on October 30, 2026 from `docs/CURRENT_SITE_AND_RUNNER_SEARCH.md` at `a2c6e507`, unchanged except that relative links point from this folder and follow sections that moved. Counts belong to the release they name; current state is in the [project handoff](../PROJECT_HANDOFF.md). Its verification contract is also in [runner search and the race report](../RUNNERS_AND_REPORT.md#verification). Index: [docs/history](README.md).

# Current-source analyses and public runner search

Implementation and verification record, September 12, 2026 UTC. Source release: **`private-export-20260911-1107`**. This follows the initial [1107 refresh](../REFRESH_20260911_1107.md), which refreshed the main analyses but left historical supporting figures in place.

## Publication scope

Every active analysis now uses the adopted source: the ten main analyses, 33 broader packs, weather, course pages, supporting sustained-slowdown results and public runner lookup. Historical `live.json` figure payloads, S/R/RN/P numerical folders and `c4` are removed from deployed data. Their Git history is retained. Existing page aliases use a current equivalent; unavailable forecasts and unvalidated course-adjustment models are labeled unavailable.

The new supporting calculation uses the shared raw-timing parser, source-quality policy and canonical-ID audit. It detects **1,023,450** sustained-slowdown finishes among **3,328,159 eligible finishes (30.7512%)**. Onset categories share the full detected-finish denominator. Sensitivity, exact-age, earlier-performance, retrospective recorded-best, severity and milestone summaries have explicit methods. A median normalized course profile is not required to integrate to zero; each individual profile is checked before aggregation.

`/runners` searches recorded names and presents candidate race groups. Visitors choose individual races and explicitly confirm their comparison. Identical names never establish an identity. All raw records are retained; missing names cannot be searched, and unusable timings or excluded editions remain visible with explanations. Numerical comparisons use eligible selected finishes only. The fastest selected time is not a verified lifetime personal best. Early pace is 5–20 km, late pace 30 km–finish, and opening pace 0–5 km; the nine original timing sections are retained in either display unit.

## Verification contract

- Both source pins and every active payload must identify the same release. Calculation and input checksums are verified against actual files.
- The builder validates unique, set-equal raw/feature IDs and recorded labels; existing history linkage also checks finish and all nine section durations.
- The public-data verifier checks every compressed shard, every unique record ID, all profile aliases, complete name-index membership, edition coverage and raw/eligible counts. It independently recomputes slowdown detections and onset totals from the published runner timings.
- Python fixtures cover contiguous slowdown, exact thresholds, the short final section, separate same-name identities, unnamed/invalid records and quotes/newlines in recorded names.
- Browser/client tests cover Unicode and partial-name matching, complete pagination, invalid/held records, year-only progression, stale releases, corrupt transport, millisecond timings and mile/kilometre presentation. Display conversion applies to both ends of pace ranges.
- The Public runner explorer workflow downloads verified FULL input, rebuilds and verifies the study/search outputs, then uploads an artifact. Import and deployment remain separate steps.

## Verification record

The full-data verifier and controlled import passed on September 12, 2026 UTC. It checked **4,207,456 unique records**, **3,328,159 eligible finishes**, **3,342,899 candidate profiles** and all **8,465,443 search-index entries**. There are **4,207,326 records with searchable names** and **130 without usable names**. All **7,755 compressed shards** passed their size and SHA-256 checks: **377,617,172 bytes** in total; the largest is **2,789,923 bytes**. An independent calculation from all published eligible timings reproduces the supporting study's detection and onset counts.

All **31 Python tests** and the complete `npm run verify:data` suite passed. The production build passed with **139 static pages**, including `/runners`. Browser checks on the actual full export covered shared-name pagination, selected multi-year results, an incomplete race excluded from calculations, retained selections across searches, empty results, race focus, miles/kilometres and mobile layout without page overflow.

This is the prepublication verification record for `codex/runner-search-current-data`. CI results and production publication evidence are recorded on the resulting pull request and must be checked separately from this local calculation record. A source upload, local build or release pin alone does not prove a deployment.

Threshold comparisons in the supporting study allow a ratio tolerance of 1e−12 solely for binary rounding. Exact decimal boundaries are included; values 1e−9 below a boundary remain excluded. Detection, onset and the independent runner-data recount use the same convention.
