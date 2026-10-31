# Berlin 2026 data contract and append behavior

This helper is ready for a real collected input. Its automated tests use clearly
marked synthetic fixtures and do not supply publishable race records. No full
database download, merge, data release, or feature regeneration was performed
while developing this helper.

## Verified existing export

The public
[September 12 export manifest](https://github.com/koolkam00/pace-notes/releases/download/private-export-20260912-0934/MANIFEST.json)
identifies 4,462,379 raw records and defines canonical IDs as `race_records.id`.
The raw Parquet footer was inspected using HTTP Range requests, without
downloading the 219 MB raw table or a SQLite backup. It confirms these columns:

| Column | Parquet type | Meaning |
| --- | --- | --- |
| `id` | int64 | Existing canonical result ID; preserve on append |
| `race`, `city`, `runner`, `sex`, `age_group` | large_string | Source labels |
| `year` | int64 | Race edition year |
| `age` | double | Exact age when source provides it; Berlin 2026 remains null |
| `split_5km`, `split_10km`, `split_15km`, `split_20km`, `split_25km`, `split_30km`, `split_35km`, `split_40km`, `split_42_2km` | large_string | Original cumulative elapsed times, null when unobserved |
| `source_url`, `ingested_at`, `age_or_group` | large_string | Source detail URL, ingestion timestamp, source age label |

The finish column means 42.195 km. An actual half-marathon reading is 21.0975 km,
kept separately; it never fills a missing 20 km measurement. Raw strings are not
derived feature minutes or paces.

The small public
[source registry](https://github.com/koolkam00/pace-notes/releases/download/private-export-20260912-0934/sources.parquet)
was inspected directly. Its Berlin 2023–2025 entries use `race=Berlin Marathon`,
`city=Berlin`, `paper_city=Berlin`, `timing_vendor=mikatiming`,
`format=searchable,html-list,html-detail`, `url_scope=race-year`,
`has_5km_splits=yes`, and `corpus=majors-current`. The helper uses those same
registry descriptors for 2026, with the observed 2026 source URL and explicit
provisional/unreconciled notes. It never overwrites an existing source row.

SQLite constraints are **not** established by Parquet types. The merge command
therefore checks the actual input database: both tables must have the expected
columns and `INTEGER PRIMARY KEY` IDs. Additional required columns without
defaults, composite IDs, triggers, and foreign keys on the target tables require
review and are rejected. A failed check leaves the source untouched.

## Collector exchange format

Input is UTF-8 JSONL, one participant result per line, with all these keys:

```text
source_result_id, event_id, city, race, year, runner, bib, sex, age,
age_group, nationality, split_5km, split_10km, split_15km, split_20km,
split_25km, split_30km, split_35km, split_40km, split_42_2km, halfway,
finish_gun, status, source_url, observed_at, provisional
```

`event_id` must be `BML_HCH3C0OH37C`, `year` must be 2026, `city` must be
`Berlin`, and `race` must be `Berlin Marathon`. The source URL must identify that
event and participant. `provisional` must be `true`. Unknown values are JSON
`null`; `age` must remain null rather than being inferred from the age band.
`observed_at` must contain a timezone. Timing values remain their original
elapsed strings. Gender normalization belongs to the collector (e.g. recorded
`W` maps to `F` while the original source label stays in `source_fields`).

Additional keys such as the collector's nested `source_fields` are allowed and
retained. Identity is `(event_id, source_result_id)`, never participant name.
Repeated identical identities are deduplicated; conflicting versions abort.
Changing only the observation timestamp does not create a correction.

Non-increasing source timings, missing splits, and certain status/timing
inconsistencies are retained with quality flags. They are not silently repaired
or excluded from the raw dataset. A malformed clock string or unsupported status
requires a collector mapping review. These flags do not substitute for the
website's analytical eligibility rules.

## Package a collected edition

```bash
python3 package_berlin.py package \
  --input collection/normalized.jsonl \
  --collector-report collection/collection-audit.json \
  --output edition-package
```

The output directory must be new. It contains original normalized JSONL, CSV,
SQLite, the collector report, and `MANIFEST.json` with asset hashes, byte counts,
unique record counts, status counts, checkpoint counts, and provisional status.
The SQLite table is `results`, keyed by source event and participant; these are
**not newly allocated platform canonical result IDs**. The SQLite
`source_payload_json` column retains each whole original normalized object,
including extra fields. Each CSV data cell is a JSON value: use `json.loads`
after `csv.DictReader` to distinguish strings, nulls, and nested objects. JSONL
and SQLite whole-row payloads also preserve whether optional extra keys existed.

A supplied collector report must match the input SHA-256, edition, unique count,
and listed/missing counts. `complete` additionally requires a completed listing
and every listed detail. Such a package is labeled `listed-field-reconciled`;
the final official finisher total is not implied. Omitting a report produces an
explicitly `unreconciled` package. Publication should require the collector's
complete, reconciled report.

## Append only to a new database copy

```bash
python3 package_berlin.py merge \
  --input collection/normalized.jsonl \
  --snapshot verified-snapshot.sqlite \
  --snapshot-sha256 VERIFIED_UNCOMPRESSED_SHA256 \
  --output appended-snapshot.sqlite
```

The input must be a frozen SQLite backup, with a verified uncompressed digest
and no WAL/journal sidecar. The output must not exist. The helper checks
integrity, copies using SQLite's backup API, inserts new raw records, and creates
the `berlin_2026_source_records` identity/provenance ledger. New canonical IDs
come from the copied database's integer primary key, preserving all prior IDs.
Existing Berlin 2026 records can be adopted only when their source URL identity
and raw values match; ambiguous or conflicting records abort without overwrites.

The ledger retains bib, nationality, original status, actual half, gun time,
original source payload, and provisional status that do not fit the existing raw
table. Rerunning against a previous output inserts no duplicate result. A changed
source result requires a separately reviewed correction.

The merge writes `appended-snapshot.sqlite.audit.json`, including base/input/output
digests, insert/adoption counts, original row count, and preservation checks. It
verifies all existing raw values and source registry values remain unchanged,
checks foreign keys/integrity, and rechecks the source checksum before commit.
On failure it removes only its newly created output. It does not operate on a
live producer database.

Existing feature tables and derived exports remain unchanged. Rebuild synchronized
CORE/FULL exports with `features.record_id = race_records.id`, then rebuild the
website through its established release workflow before claiming the site has
adopted the edition. A standalone Berlin edition package is not a full-corpus
export or a website refresh.

## Verification

```bash
python3 -m unittest -v test_package_berlin.py
```

Tests cover source identities and timing validation, missing measurements,
un-inferred exact ages, lossless payload round trips, report digest/count checks,
idempotent appends, existing-result adoption, conflict rollback, preserved IDs
and existing features, and rejecting unsafe or unsupported snapshots.
