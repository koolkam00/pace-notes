# Evidence

Dated audit and verification files that the refresh records and contract documents cite. They are the measured side of a claim: a document says what was found, and the file here shows it.

## Conventions

- **Dated folders are immutable.** A folder named `<YYYY-MM-DD>/<release-or-topic>/` holds what was measured that day for that release or change. Never edit a file in one; a later finding goes in a new dated folder, and the document that cites the old file gets a dated correction.
- **`half/source-recount.json` is a live receipt, not a dated record.** The local half source recount (`verify-half-source`) overwrites it after every half rebuild; `verify-half` and the half workflow fail when it is stale (its `manifest_sha256` must match `public/data/half/manifest.json`). Its earlier versions are in Git history.
- **Say whose claim a file is.** A *measured* file was produced by this repository's own scripts or checks. A *producer* file came from the data producer's side (for example it names the producer's machine paths) and is a claim to check, not a result. A *review* records a judgement on top of measurements.
- Cite a file by its path from the document that relies on it. A file that no document cites is listed below so it is not mistaken for current evidence.
- The autopilot guard keeps autopilot pull requests out of `docs/evidence/**`; owner and agent pull requests may add new dated folders.

## Folders

Citations were read on October 30, 2026 (`git grep` for each path).

| Folder or file | What it holds | Kind | Cited by |
| --- | --- | --- | --- |
| `2026-09-11/archive-members-audit.json` | Members, sizes and SHA-256 of the September CORE/FULL archives | Measured | [export access](../../analysis/ACCESS.md), [data architecture](../DATA_ARCHITECTURE.md), [known issues](../KNOWN_ISSUES.md), [the September 10 request](../history/INGESTION_HANDOFF_20260910.md) |
| `2026-09-11/id-contract-audit.json` | Raw and feature record-ID agreement | Measured | export access, data architecture, known issues, the September 10 request, [handoff history](../history/handoff-2026-09-to-10-13.md#historical-milestones) |
| `2026-09-11/timing-unit-contract-audit.json` | Raw against feature timings, per checkpoint | Measured | export access, data architecture, known issues, the September 10 request, handoff history |
| `2026-09-11/public-access-audit.json` | Anonymous metadata and first-bytes reads of every published asset, September 11 | Measured | export access, handoff history |
| `2026-09-11/sex-normalization-audit.json` | Raw against feature sex codes | Measured | the September 10 request |
| `2026-09-11/miles-display.md` | Display-unit verification before publication | Measured | [website architecture](../WEBSITE_ARCHITECTURE.md), handoff history |
| `2026-09-11/target-range-expansion.json` | Aggregate comparison for the personalized target-range expansion | Measured | No document |
| `2026-09-11/ten-analysis-redesign.md` | Verification record of the ten-analysis redesign (September 7 input) | Measured | No document |
| `2026-09-11/refresh-1107/` | The 1107 refresh: release contract, schema coverage, snapshot, source-quality and expanded audits, CI comparison | Measured | [1107 refresh](../REFRESH_20260911_1107.md); `independent-weather-review.json` by [weather analyses](../WEATHER_ANALYSES.md) |
| `2026-09-11/refresh-1107/live-context.json` | A copy of `live.json`'s `as_of` and `status` from September 7 | Measured | No document |
| `2026-09-12/refresh-0934/` | The 0934 refresh: release contract, calculation runs, environment audit, SQLite and site verification | Measured | [0934 refresh](../REFRESH_20260912_0934.md) |
| `2026-09-12/refresh-0934/producer-review.json` | This repository's review of the producer's 0934 release and its metadata | Review | 0934 refresh |
| `2026-09-12/refresh-0934/_audit_totals.json` | Totals from the producer's audit of its own frozen database; carries the producer's machine path (`/workspace/race-data-platform/…`) | Producer | No document |
| `2026-09-12/refresh-0934/edition_completeness.csv` | Per-edition completeness with corpus, timing-vendor and producer-note columns | Producer | No document |
| `2026-09-12/refresh-0934/paris_2014_2018_non_increasing_deep_dive.json` | Non-increasing timings in Paris 2014–2018; no document says who produced it | Unattributed | No document |
| `2026-10-16/refresh-1652/` | The 1652 refresh: release contract, calculation runs, edition screen and edition-policy review | Measured; the policy review is a review | [1652 refresh](../REFRESH_20261016_1652.md), [data architecture](../DATA_ARCHITECTURE.md), [known issues](../KNOWN_ISSUES.md), [all-finisher analyses](../ALL_FINISHER_ANALYSES.md), `analysis/source_quality.py` |
| `2026-10-21/release-0829/` | The 0829 review: edition screen, per-edition comparison with 1652, cohort preview, the proposed policy and the two scripts that reproduce them (`screen.py`, `cohort.py`) | Measured; the policy proposal is a review | [0829 review](../REFRESH_20261021_0829.md) |
| `2026-10-21/release-1050/` | The 1050 refresh: release contract, the pipeline and its log, and the edition screen | Measured | [1050 refresh](../REFRESH_20261021_1050.md) (the edition screen is cited only through the folder, from [handoff history](../history/handoff-2026-10-20-to-30.md)) |
| `2026-10-22/chicago-2025-weather/` | The partial rebuild after accepting Chicago 2025's 07:00 weather hour: pipeline and log | Measured | [1050 refresh](../REFRESH_20261021_1050.md#chicago-2025-weather-october-22), [operations](../OPERATIONS.md), [weather analyses](../WEATHER_ANALYSES.md) |
| `half/source-recount.json` | The half source recount receipt (live, overwritten each rebuild) | Measured | [half marathon](../HALF_MARATHON.md), [data architecture](../DATA_ARCHITECTURE.md), [operations](../OPERATIONS.md#half-refresh), `analysis/README.md`, `scripts/verify-half.cjs`, `scripts/verify-half-source.cjs`, `.github/workflows/half.yml` |
