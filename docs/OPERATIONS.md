# Operations runbook

## All-finisher context refresh

After refreshing and verifying both lookup and environmental context, build the additive context file against those exact manifests:

```bash
python -m unittest discover -s analysis -p 'test_all_finisher_context.py'
python analysis/build_all_finisher_context.py --output /path/to/all-finisher-context/evidence.json
node scripts/verify-all-finisher-context.cjs --input /path/to/all-finisher-context/evidence.json
cp /path/to/all-finisher-context/evidence.json public/data/all-finisher-context/evidence.json
npm run verify:data
npm run build
```

The dedicated `all-finisher-context.yml` workflow recalculates and independently verifies without importing or deploying. Existing source and aggregate files remain unchanged when adding these views; source refreshes require rebuilding dependent context instead of relabeling hashes. Record local, CI and production evidence separately in [ALL_FINISHER_ANALYSES.md](ALL_FINISHER_ANALYSES.md).

Use [analysis/README.md](../analysis/README.md) for the complete calculation and import contracts. The current full-refresh source is **`private-export-20260912-0934`**. The [current refresh](REFRESH_20260912_0934.md) records source, calculation, import and deployment evidence; earlier feature updates have their own dated records; a prior deployment does not certify a later change.

## Verify access and source state

1. Read AGENTS.md and PROJECT_HANDOFF.md; record the branch, commit, both analysis pins, relevant Releases/Actions and public `live.json.as_of` separately.
2. Fetch public repository metadata and full-record assets without a token, cookies or an account. Confirm actual bytes and checksums, not only a visible release page. The legacy word `private` in a tag is not an access control.
3. Download immutable CORE and FULL from one exact tag; verify archive/member checksums, schema, units, record/feature alignment, raw counts, overlay dates and source completeness. A successful exporter is not analytical validation.
4. Keep operational credentials out of datasets and logs. Full research records are public and may be stored in or outside the checkout. Prefer durable Release assets for large files.

## Reproduce and audit the current input

Run from the repository root with Python 3.12 and a fresh output directory. Replace `CURRENT_PUBLIC_LIVE_AS_OF` with the actual current compatibility-metadata timestamp; this timestamp is context, not the source release.

```bash
python -m pip install -r analysis/requirements.txt
python analysis/download_release.py --bundle FULL --tag private-export-20260912-0934 --output /path/to/0934-input
python analysis/download_release.py --bundle CORE --tag private-export-20260912-0934 --output /path/to/0934-core
python analysis/inspect_export.py --input /path/to/0934-input --output /path/to/0934-inspection
python analysis/audit_expanded.py --input /path/to/0934-input --output /path/to/0934-inspection
python analysis/audit_release.py --input /path/to/0934-input --core /path/to/0934-core --output /path/to/0934-inspection/release-contract.json
python -m unittest discover -s analysis -p 'test_*.py'
```

`download_release.py` needs no token. If `GH_TOKEN` or `GITHUB_TOKEN` is set, it is sent only to `api.github.com`, including across that host's own redirects: the pinned repository name `koolkam00/htw-live-study` now redirects to the renamed repository, and an anonymous redirected request can hit GitHub's shared runner rate limit. Asset downloads, and redirects to any other host, never carry the token.

Add `--previous /path/to/1107-input` to the release audit to reproduce the raw-record delta. CORE has eight allowed members; FULL adds `features.parquet`. Producer audit notes belong in separate assets. The downloader validates size/SHA-256, rejects unsafe, duplicate or unexpected members and writes provenance. Do not bypass these checks because a prior release had a different archive layout.

Review the release-specific exclusions in `analysis/source_quality.py` before calculation. The policy follows explicit producer/audit evidence for invalid, incomplete, held or selected fields. Apply it after timing eligibility, include its edition counts and hashes in each output, and exclude those editions from earlier benchmarks as well as outcomes. Do not widen exclusions based on small sample size alone or remove usable records merely because age/gender is missing.

## Calculate all owned outputs

```bash
python analysis/build_pacing.py --input /path/to/0934-input --output /path/to/0934-aggregates --live-as-of CURRENT_PUBLIC_LIVE_AS_OF
python analysis/build_extended.py --input /path/to/0934-input --output /path/to/0934-aggregates --personalized-output /path/to/0934-personalized --live-as-of CURRENT_PUBLIC_LIVE_AS_OF
python analysis/write_findings.py --output /path/to/0934-aggregates
python analysis/build_weather.py --input /path/to/0934-input --output /path/to/0934-weather/evidence.json
python analysis/build_public_explorer.py --input /path/to/0934-input --output /path/to/0934-explorer
```

The first two commands produce all 33 registered broad packs. `build_extended.py` also invokes the twelve-path personalized engine, retaining whole-minute targets 90–720. The weather screen is separate: rerun all three fixed candidates with the existing thresholds, retain every decision in its JSON, and let readiness determine which pages exist. A refresh must not freeze old conclusions or loosen the gate to publish a preferred result.

The main workflow produces `pacing-aggregate-packs`, `pacing-personalized-aggregates` and `pacing-export-inspection` for an exact source tag and code commit. The separate weather workflow produces `weather-evidence`; **Public runner explorer** produces `public-runner-explorer` (study plus name-search shards). None of these workflows imports data or deploys the site. Inspect source tag, code revision, successful checks and artifacts; do not infer success from release publication. The historical September 10 failed run is not the status of the current 0934 calculations.

Runner context has an additional dependency on the exact imported runner manifest; follow the [dedicated sequence below](#runner-context-refresh) after importing the supporting study and lookup.

## Validate, import and publish

ZIP each output's contents with the registered pack folder at archive root. The broad archive must have all 33 registry entries; the personalized archive must have only `ext_personalized_guide`. Validate both before replacing their owned public folders:

```bash
python analysis/import_packs.py --archive /path/to/pacing-aggregate-packs.zip --expected-export private-20260912-0934 --check-only
python analysis/import_personalized.py --archive /path/to/pacing-personalized-aggregates.zip --expected-export private-20260912-0934 --check-only
python analysis/import_packs.py --archive /path/to/pacing-aggregate-packs.zip --expected-export private-20260912-0934
python analysis/import_personalized.py --archive /path/to/pacing-personalized-aggregates.zip --expected-export private-20260912-0934
npm ci
python analysis/import_public_explorer.py --input /path/to/0934-explorer
python analysis/build_runner_context.py --input /path/to/0934-input --output /path/to/0934-runner-context
python analysis/import_runner_context.py --input /path/to/0934-runner-context
npm run verify:data
npm run build
```

Review and copy the weather JSON to `public/data/weather/evidence.json` with its exact `analysis/weather-release.json` pin; update `analysis/release.json` with the validated main outputs. The weather file is outside the two ZIP importer contracts. Verify source/script/policy hashes, raw-to-eligible and weather-cohort reconciliation, all candidate gates, dynamic routes, exact source labels and display units. For the current audited release, `calculation_provenance.py` requires the exact reviewed builder and supporting-script hashes before either import; a valid-looking 64-character hash is insufficient. Website data validation repeats these checks on PRs and main. Review the full diff before committing or merging. Verify the deployed source tags and exact commit separately after publication.

Every active analysis must now use the same adopted release. The supporting-study and runner importer replaces only `public/data/study`, `public/data/runners` and current `live.json` compatibility metadata. It validates every shard, all 4,462,379 records, all 3,517,336 eligible timings, name-index membership and calculation/source hashes before import. Historical S/R/RN/P numerical files remain in Git history, outside deployed output. The source pin alone never certifies a refresh.

## Runner context refresh

The context builder uses `analysis/release.json` and requires the verified FULL directory containing `full.tar.gz`, `MANIFEST.json`, `provenance.json` and extracted inputs. It checks the source against the existing runner lookup. It explicitly supports the audited 1107 and 0934 policies; adopting a future tag requires reviewing the source/edition policy, rebuilding the lookup and updating the release-gated contracts together.

Install Python requirements and Node dependencies first. Refresh and import the runner lookup before this sequence when its source or calculation changes. Use a fresh output directory:

```bash
python analysis/build_runner_context.py --input /path/to/0934-input --output /path/to/0934-runner-context --runners public/data/runners
python analysis/import_runner_context.py --input /path/to/0934-runner-context --check-only
python analysis/import_runner_context.py --input /path/to/0934-runner-context
npm run verify:data
npm run build
```

`--runners` defaults to the repository's `public/data/runners`. The importer invokes the full Node verifier before any replacement. It stages only `manifest.json` and the listed edition shards, then replaces only `public/data/runner-context`, restoring the prior directory if the swap fails. Its optional `--output` is the **parent** public-data directory, not the runner-context folder; validation still binds to this repository's runner manifest. No other data folder or release pin is modified.

For a standalone calculation audit, run `node scripts/verify-runner-context.cjs --data-root /path/to/0934-runner-context`. It verifies every context shard, all group/CDF counts against the published eligible runner records, and 16 independently recomputed pacing-quartile samples. `npm run verify:data` also includes the context client and UI checks. A same-tag lookup rebuild changes its manifest hash/timestamp and invalidates older context; rebuild rather than relabeling the context manifest.

The [Runner context and peers workflow](../.github/workflows/runner-context.yml) runs on relevant pull-request paths or manual dispatch. It downloads the pinned FULL, calculates against the checked-in runner manifest, runs the independent verifier and uploads **`runner-context`** for 30 days. It does not import, change the pin, merge or deploy. Download/extract the artifact into an input directory for the importer, inspect the exact source/code revision, and preserve durable verification evidence before CI artifacts expire. Check pending/local/publication status in [RUNNER_CONTEXT_AND_PEERS.md](RUNNER_CONTEXT_AND_PEERS.md).

## Fast-start analysis refresh

After any runner-lookup refresh, recalculate **both** independent fast-start outputs from those exact published shards. This reuses the reviewed input pin and does not download or modify the ingestion database. The default all-finisher mode must include every eligible record once; history must additionally reconcile the strictly-earlier-two-year benchmark count. Both verify all source shards, raw/eligible counts, source calculation hashes and the exact runner-manifest hash. Adding the all-finisher mode without a lookup refresh preserves the existing history output byte for byte.

```bash
python -m unittest discover -s analysis -p 'test_fast_start.py'
python analysis/build_fast_start.py --runners public/data/runners --output /path/to/fast-start/evidence.json
node scripts/verify-fast-start.cjs --input /path/to/fast-start/evidence.json
python -m unittest discover -s analysis -p 'test_fast_start_all.py'
python analysis/build_fast_start_all.py --runners public/data/runners --output /path/to/fast-start/all-finishers.json
node scripts/verify-fast-start-all.cjs --input /path/to/fast-start/all-finishers.json
cp /path/to/fast-start/evidence.json public/data/fast-start/evidence.json
cp /path/to/fast-start/all-finishers.json public/data/fast-start/all-finishers.json
npm run verify:data
npm run build
```

The history verifier checks every cell's count, edition coverage and onset, then independently recomputes every numeric metric for the complete unfiltered cohort and five filtered cohorts. The separate all-finisher verifier covers its full eligible population, exact opening boundaries, published and sparse-cell counts, onset denominators and new time outcomes. Preserve evidence of each verifier's actual checks; passing one mode does not validate the other. Each view uses its selected opening group except its clearly labeled cross-group time-distribution chart. Source pins, lookup hashes and calculation hashes cannot be relabeled to avoid rebuilding. The dedicated [workflow](../.github/workflows/fast-start.yml) recalculates and verifies evidence artifacts; it does not import or deploy. Record CI and anonymous production-payload checks separately. See [definitions and evidence](FAST_START_ANALYSIS.md).

## Data story refresh

Rebuild the stories after the runner or runner-context manifests change:

```bash
python -m unittest discover -s analysis -p 'test_insights.py'
python analysis/build_insights.py
python analysis/build_course_geometry.py --profiles <CORE export>/course_profiles.parquet
python analysis/build_insights.py --only manifest
node scripts/verify-insights.cjs
```

The **Story analyses** workflow repeats the build into a temporary directory and requires byte-identical family files. See [data stories](STORIES.md).

## Producer operations and missing information

The live producer database, scheduled ingestion, retries and recovery scripts are external to this checkout. A consistent SQLite snapshot is made through SQLite's backup mechanism or an equivalent supported snapshot; do not blindly copy a changing database or replace ingestion with a downloaded backup. Publish checksummed full-record snapshots with anonymous opening instructions. Public snapshot access does not require exposing the live service or its credentials.

Producer follow-up priorities are complete/reconcile held editions, parse Paris 2014–2018 elapsed formats with source fixtures, document exact-age and missing-field coverage, resolve ambiguous edition dates/start hours and provide historical route validity. See [KNOWN_ISSUES.md](KNOWN_ISSUES.md) and [INGESTION_HANDOFF.md](INGESTION_HANDOFF.md). Never infer missing values to make a cohort larger.

## Report statuses separately

| Status | Required evidence |
| --- | --- |
| Backup saved | Immutable snapshot, timestamp, integrity and checksum |
| Export ready | Synchronized complete CORE/FULL, manifest and schema/ID audit |
| Access verified | Anonymous download of actual full-record bytes, with dated URLs/checksums |
| Analysis passed | Successful calculation and artifacts for exact tag/commit, with exclusions and methods |
| Repository updated | Validated import committed and reviewed |
| Site updated | Authorized deployment verified against exact source labels and commit |

Inspection artifacts retain seven days and main aggregate artifacts thirty days under the existing workflow contract. Preserve durable source files and essential audit reports with Releases; expiring CI artifacts are not a long-term specification.
