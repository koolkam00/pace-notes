# Berlin Marathon 2026 ingestion

Status on September 27, 2026: **blocked at source access; no full dataset collected or imported**. The source returns HTTP 403 from ordinary local requests, Chromium, and the GitHub runner. The recorded runner probe is https://github.com/koolkam00/pace-notes/actions/runs/36363866151. The organizer's archive API was reachable but exposed editions only through 2025.

These scripts prepare a repeatable import once source access is available. Tests cover parsing and database behavior with explicitly synthetic fixtures. They do not certify the parser against a full captured 2026 response or verify the production SQLite schema. The PR must remain draft until those integration checks and complete-field reconciliation pass.

## Source and data contract

Official source: https://berlin.r.mikatiming.com/2026/, running event `BML_HCH3C0OH37C`. Public browser inspection on September 27 verified results marked **Unofficial Results**, individual finish status and cumulative 5 km checkpoints through 40 km, half marathon and finish. The final displayed overall rank was 50,073. Pagination arithmetic differed from ranks, so this is not an independently verified result count.

The organizer links the source at https://www.bmw-berlin-marathon.com/das-rennen/ergebnisse and displays a private informational use condition. This code does not establish republication rights. No credentials, access-control bypass, proxy rotation, or CAPTCHA handling are used.

The normalized natural key is `(event_id, source_result_id)`. Original elapsed strings, missing values, recorded age group, exact source metadata and provisional status are retained. Exact age remains null. Half marathon is separate from 20 km; finish is 42.195 km despite the legacy field name `split_42_2km`. Source participant IDs are not cross-race person identities.

## Collect and resume

```bash
python -m pip install -r ingestion/berlin2026/requirements.txt
python ingestion/berlin2026/collect_berlin.py --output /path/to/berlin-collected --max-details 5000 --delay 1
```

Successful response bodies are stored in checksummed gzip cache files. Each invocation enumerates fresh result lists and processes at most 5,000 new detail requests, reusing successful detail responses from earlier invocations. Reuse the same output path to continue. The collector stops on access rejection, source structure changes, duplicate IDs across pages or a changing listing. It does not automatically retry a block. Missing checkpoints remain null. `normalized.jsonl` is a candidate input; `collection-audit.json` records whether every enumerated detail was retrieved. A partial batch exits nonzero and cannot qualify for publication.

At one request per second, full detail collection takes many hours. The manual workflow preserves cache between bounded batches; it does not schedule repeated source requests. Cached detail observations retain their original timestamps, so a collected edition is a provisional collection over an interval, not an atomic timing-provider snapshot. A correction refresh should use a fresh cache and a new immutable release.

## Package and merge

```bash
python ingestion/berlin2026/package_berlin.py package \
  --input /path/to/berlin-collected/normalized.jsonl \
  --collector-report /path/to/berlin-collected/collection-audit.json \
  --output /path/to/new-berlin-package

python ingestion/berlin2026/package_berlin.py merge \
  --input /path/to/berlin-collected/normalized.jsonl \
  --snapshot /path/to/frozen-baseline.sqlite \
  --snapshot-sha256 VERIFIED_UNCOMPRESSED_SHA256 \
  --output /path/to/new-platform-with-berlin-2026.sqlite
```

Packaging writes a standalone edition SQLite database plus lossless JSONL and CSV, with a manifest and quality flags. Each CSV data cell is JSON-encoded so null and source strings remain distinct. The merge verifies a frozen input checksum, uses SQLite's backup mechanism to create a new output, and appends canonical raw rows with a separate source-identity ledger. It preserves existing IDs and SQL values, refuses conflicting corrections and unknown schema constraints, and verifies integrity. The live producer database and existing release files are never overwritten.

Appending raw data does not regenerate features. Any feature table retained from the baseline lacks the new results; the merge audit explicitly records this. A complete synchronized CORE/FULL export and every dependent site analysis must be rebuilt before updating the website. This tool does not change source pins or deploy the site.

## GitHub workflow

`.github/workflows/berlin-2026-intake.yml` runs only offline tests on pushes and pull requests. Collection, packaging and publication require a manual dispatch after the workflow is available on the default branch. A supplied same-repository release with `normalized.jsonl` and a matching `collection-audit.json` can also be used.

Publication requires all enumerated IDs, at least 50,000 results consistent with the observed field, no missing detail pages, matching normalized-file checksum, zero duplicate source keys, and a verified merge. The workflow downloads the pinned `htw-db-2026-09-27` baseline only after collection succeeds, checks its compressed digest, and publishes a distinct immutable `berlin-2026-intake-*` release after verifying uploaded assets. Existing backups remain intact. “Complete” in this workflow means complete retrieval of the observed listing; it does not certify official finality.

No ingestion workflow has completed successfully yet. The existing website continues to use `private-export-20260912-0934`.

## Tests

```bash
python -m unittest discover -s ingestion/berlin2026 -p 'test_*.py'
```

Fixtures are artificial and temporary. Tests cover elapsed-vs-clock timing, distinct half-marathon values, missing splits and ages, pagination and source identity, stopping on HTTP 403, resume budgets, lossless exports, conflicting updates, repeated imports and preservation of existing SQLite records.
