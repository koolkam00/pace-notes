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

Use [analysis/README.md](../analysis/README.md) for the complete calculation and import contracts. The current full-refresh source is **`private-export-20261021-1050`** (repository `koolkam00/pace-notes`), adopted on branch `data/release-1050` on October 21, 2026 and merged to `main` as PR #78 (`39f3057`) on October 22, 2026; production state is recorded in the [project handoff](PROJECT_HANDOFF.md). The [current refresh](REFRESH_20261021_1050.md) records source, calculation and import evidence; the [1652 refresh](REFRESH_20261016_1652.md) keeps its own. The release before it, `private-export-20261021-0829`, was verified and reviewed but **not adopted** (its FULL file lacked the producer's runner identities; [review](REFRESH_20261021_0829.md)); the [0934 refresh](REFRESH_20260912_0934.md) keeps its own; earlier feature updates have their own dated records; a prior deployment does not certify a later change.

## Verify access and source state

1. Read AGENTS.md and PROJECT_HANDOFF.md; record the branch, commit, both analysis pins, relevant Releases/Actions and public `live.json.as_of` separately.
2. Fetch public repository metadata and full-record assets without a token, cookies or an account. Confirm actual bytes and checksums, not only a visible release page. The legacy word `private` in a tag is not an access control.
3. Download immutable CORE and FULL from one exact tag; verify archive/member checksums, schema, units, record/feature alignment, raw counts, overlay dates and source completeness. A successful exporter is not analytical validation.
4. Keep operational credentials out of datasets and logs. Full research records are public and may be stored in or outside the checkout. Prefer durable Release assets for large files.
5. At each adoption, rewrite the top of [analysis/ACCESS.md](../analysis/ACCESS.md) for the adopted release: asset links and sizes, how to join split parts, the checksum steps and a dated anonymous-access check (since October 22, 2026 `/methodology#downloads` links to it as "how to open them"). Keep the previous release's section below as dated history.

## Reproduce and audit the current input

Run from the repository root with Python 3.12 and a fresh output directory. Replace `CURRENT_PUBLIC_LIVE_AS_OF` with the actual current compatibility-metadata timestamp; this timestamp is context, not the source release.

```bash
python -m pip install -r analysis/requirements.txt
python analysis/download_release.py --bundle FULL --tag private-export-20261021-1050 --output /path/to/1050-input
python analysis/download_release.py --bundle CORE --tag private-export-20261021-1050 --output /path/to/1050-core
python analysis/inspect_export.py --input /path/to/1050-input --output /path/to/1050-inspection
python analysis/audit_expanded.py --input /path/to/1050-input --output /path/to/1050-inspection
python analysis/audit_release.py --input /path/to/1050-input --core /path/to/1050-core --previous /path/to/1050-input --output /path/to/1050-inspection/release-contract.json
python -m unittest discover -s analysis -p 'test_*.py'
```

`download_release.py` needs no token. If `GH_TOKEN` or `GITHUB_TOKEN` is set, it is sent only to `api.github.com`, including across that host's own redirects: both pins now name the renamed repository `koolkam00/pace-notes` (the old name `koolkam00/htw-live-study` still redirects, but its API answered 403 from this container on October 16, 2026), and an anonymous redirected request can hit GitHub's shared runner rate limit. Asset downloads, and redirects to any other host, never carry the token.

`--previous` takes an earlier release's input folder and reports the raw-record delta in total, by edition and by column (1652 against 0934: 569,263 added, 116,287 deleted, 242,649 changed; 1050 against 1652: 412,943 added, 794 deleted, none changed). A `private-export-*` CORE has eight allowed members and FULL adds `features.parquet`; an `htw-db-*` CORE also carries `EDITIONS.json`, `CHANGE-REPORT.md`, `SHA256SUMS.txt` and `ID-CONTRACT.md` (12 members) and FULL adds `features.parquet` and `FEATURE-FIELD-NOTES.md` (14). A `pace-notes-*` archive (first in `private-export-20261021-0829`; the layout follows the asset name, not the tag) has the eight base files plus `EDITIONS.json`, `EDITION-CHECKSUMS.csv`, `CHANGE-REPORT.md`, `SHA256SUMS.txt`, `ID-CONTRACT.md`, `FEATURE-FIELD-NOTES.md`, `edition_meta.parquet` and `record_flags.parquet` in CORE (16) and adds `features.parquet` in FULL (17); from `private-export-20261021-1050` both also carry `MATCHING.md` (17 and 18). A release may split an archive into numbered parts (`….tar.gz.part-00`, `-01`, …, first in 1050's FULL): the downloader joins them in order, checks each part's size and digest, and then requires the joined archive's digest in the release checksum file, so a split archive without one is refused. When the release publishes a `RELEASE-SHA256SUMS*.txt` asset, the downloader verifies it too and requires the archive's digest to be listed in it. For htw-db and pace-notes releases the audit also checks every `SHA256SUMS.txt` line, compares the shared documents between CORE and FULL and reconciles `EDITIONS.json` and `races_summary.json` edition by edition. Other producer audit notes belong in separate assets. The downloader validates size/SHA-256, rejects unsafe, duplicate or unexpected members and writes provenance. Do not bypass these checks because a prior release had a different archive layout.

Review the release-specific exclusions in `analysis/source_quality.py` before calculation. The policy follows explicit producer/audit evidence for invalid, incomplete, held or selected fields. Apply it after timing eligibility, include its edition counts and hashes in each output, and exclude those editions from earlier benchmarks as well as outcomes. Do not widen exclusions based on small sample size alone or remove usable records merely because age/gender is missing.

## Calculate all owned outputs

```bash
python analysis/build_pacing.py --input /path/to/1050-input --output /path/to/1050-aggregates --live-as-of CURRENT_PUBLIC_LIVE_AS_OF
python analysis/build_extended.py --input /path/to/1050-input --output /path/to/1050-aggregates --personalized-output /path/to/1050-personalized --live-as-of CURRENT_PUBLIC_LIVE_AS_OF
python analysis/write_findings.py --output /path/to/1050-aggregates
python analysis/build_weather.py --input /path/to/1050-input --output /path/to/1050-weather/evidence.json
python analysis/build_public_explorer.py --input /path/to/1050-input --output /path/to/1050-explorer
```

The first two commands produce all 33 registered broad packs. `build_extended.py` caps DuckDB at 6 GB and spills the rest to `<input>/extended-temp`; under 1050 the history tables spilled past 4.9 GB of free disk at that cap, so the 1050 run set `PACE_NOTES_EXTENDED_MEMORY=10GB` on a 15 GB machine (results do not depend on the cap). Keep the downloaded `full.tar.gz` beside the extracted files: `build_runner_context.py` re-hashes it and every member it reads. `build_extended.py` also invokes the twelve-path personalized engine, retaining whole-minute targets 90–720. The weather screen is separate: rerun all three fixed candidates with the existing thresholds, retain every decision in its JSON, and let readiness determine which pages exist. A refresh must not freeze old conclusions or loosen the gate to publish a preferred result.

The main workflow produces `pacing-aggregate-packs`, `pacing-personalized-aggregates` and `pacing-export-inspection` for an exact source tag and code commit. The separate weather workflow produces `weather-evidence`; **Public runner explorer** produces `public-runner-explorer` (study plus name-search shards). None of these workflows imports data or deploys the site. Inspect source tag, code revision, successful checks and artifacts; do not infer success from release publication. The historical September 10 failed run is not the status of any later calculation.

Until October 15, 2026, the main pacing workflow (`pacing-analysis.yml`) and the full-export inspection (`inspect-full-export.yml`) ran only when the repository was named `koolkam00/htw-live-study`. After the rename to `koolkam00/pace-notes` both were silently skipped on every pull request, and would have been on a new `private-export-*` release. The last successful pacing run was [35252504876](https://github.com/koolkam00/pace-notes/actions/runs/35252504876) on September 17 and the last successful inspection [34560014278](https://github.com/koolkam00/pace-notes/actions/runs/34560014278) on September 11. Both now check `koolkam00/pace-notes`, the same condition the Autopilot merge workflow uses. A skipped job is not a passing calculation: confirm the job actually ran before relying on its artifacts. Since October 16, 2026 a published `htw-db-*` release triggers it as well as a `private-export-*` one (the weather workflow accepts both tag forms too). Because a new release now triggers the pacing workflow again, a tag without a reviewed edition policy in `analysis/source_quality.py` (`REVIEWED_POLICIES`) is downloaded and inspected only: the workflow uploads `pacing-export-inspection`, calculates nothing, and fails with a message saying the policy and audit must be added first. Otherwise an unreviewed export would be calculated with no exclusions.

Runner context has an additional dependency on the exact imported runner manifest; follow the [dedicated sequence below](#runner-context-refresh) after importing the supporting study and lookup.

## Validate, import and publish

ZIP each output's contents with the registered pack folder at archive root. The broad archive must have all 33 registry entries; the personalized archive must have only `ext_personalized_guide`. Validate both before replacing their owned public folders:

```bash
python analysis/import_packs.py --archive /path/to/pacing-aggregate-packs.zip --expected-export private-20261021-1050 --check-only
python analysis/import_personalized.py --archive /path/to/pacing-personalized-aggregates.zip --expected-export private-20261021-1050 --check-only
python analysis/import_packs.py --archive /path/to/pacing-aggregate-packs.zip --expected-export private-20261021-1050
python analysis/import_personalized.py --archive /path/to/pacing-personalized-aggregates.zip --expected-export private-20261021-1050
npm ci
python analysis/import_public_explorer.py --input /path/to/1050-explorer
python analysis/build_runner_context.py --input /path/to/1050-input --output /path/to/1050-runner-context
python analysis/import_runner_context.py --input /path/to/1050-runner-context
npm run verify:data
npm run build
```

Review and copy the weather JSON to `public/data/weather/evidence.json` with its exact `analysis/weather-release.json` pin; update `analysis/release.json` with the validated main outputs. The weather file is outside the two ZIP importer contracts. Verify source/script/policy hashes, raw-to-eligible and weather-cohort reconciliation, all candidate gates, dynamic routes, exact source labels and display units. For the current audited release, `calculation_provenance.py` requires the exact reviewed builder and supporting-script hashes before either import; a valid-looking 64-character hash is insufficient. Website data validation repeats these checks on PRs and main. Review the full diff before committing or merging. Verify the deployed source tags and exact commit separately after publication.

Every active analysis must now use the same adopted release. The supporting-study and runner importer replaces only `public/data/study`, `public/data/runners` and current `live.json` compatibility metadata. It validates every shard, every record (4,915,355 in 1652), every eligible timing (3,871,767), name-index membership and calculation/source hashes before import. Historical S/R/RN/P numerical files remain in Git history, outside deployed output. The source pin alone never certifies a refresh.

## Runner context refresh

The context builder uses `analysis/release.json` and requires the verified FULL directory containing `full.tar.gz`, `MANIFEST.json`, `provenance.json` and extracted inputs. It checks the source against the existing runner lookup. It explicitly supports the audited 1107, 0934, 1652 and 1050 policies; adopting a future tag requires reviewing the source/edition policy, rebuilding the lookup and updating the release-gated contracts together.

Install Python requirements and Node dependencies first. Refresh and import the runner lookup before this sequence when its source or calculation changes. Use a fresh output directory:

```bash
python analysis/build_runner_context.py --input /path/to/1050-input --output /path/to/1050-runner-context --runners public/data/runners
python analysis/import_runner_context.py --input /path/to/1050-runner-context --check-only
python analysis/import_runner_context.py --input /path/to/1050-runner-context
npm run verify:data
npm run build
```

A change to `build_weather.py` or `runner_environment.py` (the start-hour check) requires rebuilding, in order: the weather screen; runner context (build, `--check-only`, import); the all-finisher context; then the stories and tool data with course geometry, the terrain splits (`build_course_terrain.py`, which binds the runner-context manifest) and their manifest, each with its verifier. The packs, the supporting study, the runner lookup and fast start read neither ([October 22, 2026 example](evidence/2026-10-22/chicago-2025-weather/pipeline.sh)).

`--runners` defaults to the repository's `public/data/runners`. The importer invokes the full Node verifier before any replacement. It stages only `manifest.json` and the listed edition shards, then replaces only `public/data/runner-context`, restoring the prior directory if the swap fails. Its optional `--output` is the **parent** public-data directory, not the runner-context folder; validation still binds to this repository's runner manifest. No other data folder or release pin is modified.

For a standalone calculation audit, run `node scripts/verify-runner-context.cjs --data-root /path/to/1050-runner-context`. It verifies every context shard, all group/CDF counts against the published eligible runner records, and 16 independently recomputed pacing-quartile samples. `npm run verify:data` also includes the context client and UI checks. A same-tag lookup rebuild changes its manifest hash/timestamp and invalidates older context; rebuild rather than relabeling the context manifest.

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

Rebuild the stories after the runner or runner-context manifests change. The terrain splits bind the runner-context manifest (its bytes and `input_as_of`) and the release tag, so they are rebuilt in the same pass, before the manifest step:

```bash
python -m unittest discover -s analysis -p 'test_insights.py'
python analysis/build_insights.py
python analysis/build_course_geometry.py --profiles <CORE export>/course_profiles.parquet
python analysis/build_course_terrain.py --profiles <CORE export>/course_profiles.parquet \
    --corrections analysis/course_terrain/corrections.json \
    --output public/data/insights/tools/course-terrain.json
python analysis/build_insights.py --only manifest
node scripts/verify-insights.cjs
```

The **Story analyses** workflow repeats the build into a temporary directory and requires byte-identical family files. See [data stories](STORIES.md).

When the release changes, build into a fresh empty folder (`--output <dir>`), run the geometry, terrain-splits (`--output <dir>/tools/course-terrain.json`) and `--only manifest` steps against it, verify it with `node scripts/verify-insights.cjs --input <dir>`, and only then replace `public/data/insights` with it: the verifier's inventory check fails on leftover replay or tool shards from the previous release (1652: Boston's and Chicago's replay editions moved to 2014 and 2026, and Melbourne left the course data). `--only` keeps only files listed in the output folder's existing manifest, so it cannot finish a partly built fresh folder; rebuild it whole (about 15 minutes for 1652). Producer follow-ups found by the 1652 refresh are listed in its [record](REFRESH_20261016_1652.md#open-for-the-owner-and-the-producer).

## Terrain splits refresh

The planner's and the pace band's terrain splits (`tools/course-terrain.json`, owner decision of October 23, 2026) are built from the adopted release's `course_profiles.parquet` and the audited correction registry, never from finishes:

```bash
python -m unittest discover -s analysis -p 'test_course_terrain.py'   # COURSE_PROFILES=<release>/course_profiles.parquet runs the release checks too
python analysis/build_course_terrain.py --profiles <release>/course_profiles.parquet \
    --corrections analysis/course_terrain/corrections.json \
    --output public/data/insights/tools/course-terrain.json
python analysis/build_insights.py --only manifest
node scripts/verify-insights.cjs
node scripts/verify-tools.cjs
```

Rebuild whenever the runner-context manifest changes (its bytes, its `input_as_of` or its `course_profiles.parquet` hash; `verify-insights` binds all three), whenever the adopted release in `analysis/release.json` changes, and whenever `analysis/course_terrain/corrections.json` changes (bump its `version`); the [story refresh](#data-story-refresh) above runs it. On a new parquet hash the builder refuses until the registry's `input.sha256` and every correction's anchors are re-based on the new file; it also refuses a terrain course of class c, without `sources` or with a `why`, a smoothed grade above 8%, a feature outside its correction and a slug the pace band does not publish. The **Story analyses** workflow rebuilds the file after the release download and requires the committed bytes.

Clearing another course for terrain splits: add its cited corrections and `sources` to the registry, run the provenance scripts in `analysis/course_terrain/provenance/` (network; never in CI), re-run the steady-finisher check from `analysis/course_terrain/validation-2026-10-23/` on the adopted release, set `band: "terrain"`, add its deck guards to `checkCourseTerrain` in `scripts/verify-insights.cjs` (each window over the water alone, so the uncorrected supplied profile fails it; `test_course_terrain.py` checks that with `COURSE_PROFILES` set), rebuild, re-pin `scripts/verify-tools.cjs` and record the date and the evidence in [tools](TOOLS.md#terrain-splits-owner-decision-october-23-2026).

## Top 100 charts refresh

The charts bind the runner manifest, the weather evidence, the catalog and every chart script by hash, so rebuild them after any of those change (a new release, a weather refresh, an edit to `analysis/build_charts.py`, `analysis/charts_common.py` or an `analysis/charts_*.py` module):

```bash
python -m unittest discover -s analysis -p 'test_charts.py'
python analysis/build_charts.py --output public/data/charts
node scripts/verify-charts.cjs
node scripts/build-chart-cards.cjs              # redraws the cards whose stamp changed (needs Chromium)
node scripts/build-chart-cards.cjs --captions   # docs/CHARTS_INSTAGRAM.md
npm run verify:data && npm run build
```

Read every headline that changed before publishing: a chart whose guard no longer holds shows its neutral fallback. The **Top 100 charts** workflow rebuilds the charts in CI and requires the committed bytes. See [Top 100 charts](TOP_100_CHARTS.md).

## Half refresh

The half aggregates (`public/data/half/`, [half marathons](HALF_MARATHON.md)) come from two private releases in `koolkam00/pace-notes-db-backup` that stay outside the checkout, in `PACE_HALF_DIR` (default `~/data/half-1133`). Nothing below writes a half record into the repository or `public/`. Run the Python with `python3 -I`; DuckDB uses `PACE_HALF_DUCKDB_THREADS` (default 2), `PACE_HALF_DUCKDB_MEMORY` (default 4GB) and spills to `TMPDIR`, leaving no temp file behind.

```bash
export PACE_HALF_DIR=~/data/half-1133
# 1. The sources: the owner's `gh release download <tag> -R koolkam00/pace-notes-db-backup` folders, one per release...
python3 -I analysis/download_half.py --from-dir <half folder> --from-dir <links folder>
#    ...or a fine-grained read-only token in an environment variable (sent to api.github.com only, never written or printed):
#    python3 -I analysis/download_half.py --token-env HALF_SOURCE_TOKEN
#    Both check every asset against SHA256SUMS and the pin, reassemble platform_half.sqlite (integrity check, sha against
#    the pin) and cut links-slim.sqlite from the 5.3 GB links SQLite, which is then deleted. About 9 GB of free disk.
#    Links that come as parquet tables instead: python3 -I analysis/half_links_extract.py --links-parquet <dir>
# 2. Tests, build and the local source recount (writes the receipt docs/evidence/half/source-recount.json):
python -m unittest discover -s analysis -p 'test_half.py'        # PACE_HALF_SOURCE_TESTS=1 also recomputes the frozen lists
python3 -I analysis/build_half.py                                 # --half/--links default to $PACE_HALF_DIR; about 100 s
npm run verify:half-source                                        # the same defaults; about 80 s and 0.9 GB
# 3. The checks, the cards and the site:
node scripts/verify-half.cjs
node scripts/build-chart-cards.cjs --set half                     # redraws the half cards whose stamp changed (needs Chromium)
node scripts/build-chart-cards.cjs --captions                     # docs/CHARTS_INSTAGRAM.md, both sections
npm run verify:data && npm run build
node scripts/verify-half.cjs --html
```

Then capture and read every half surface (`/half`, `/stories/half-to-full`, the predictor with a half typed and each sex chip, the five marathon goal pages, the half pace chart, the four card images) before committing the data, the receipt and the cards together.

**When:** after a new half snapshot or link build; after any change to `analysis/release.json` or the runner manifest (`lib/half-server.ts` throws at build until the half data is rebuilt, and a new marathon release also needs a new link build from the producer); after a change to `analysis/weather-release.json` or the weather evidence; after a change to the cited `insights/finish-times.json` or `charts/womens-share-by-finish-time.json`; after any change to `analysis/half_*.py`, `analysis/build_half.py` or the policy. A change to `scripts/verify-half-source.cjs` or `scripts/half/{derive,policy,marathon,families}.cjs` needs only `npm run verify:half-source` and the new receipt. CI cannot read the sources: `verify-half` fails on a stale receipt, so never commit a rebuild without its recount.

**A new snapshot or link build:** pin the new tags, asset sums and `sqlite_sha256` in `analysis/half-release.json`; cut the extract with `--pin` (it writes `extract_content_sha256`); add a reviewed entry to `REVIEWED_HALF_POLICIES` in `analysis/half_quality.py`, print the recomputed lists with `python3 -I analysis/half_quality.py --discover --half <snapshot>` (local only; never commit its output), review every one (R3, R4, E2–E8), freeze the entry with `--write-policy` under a new policy file name and confirm it with `--check --half <snapshot>`; build with `--accept-counts` only after reading every count change it prints; rerun the source recount; rewrite the dated evidence and the owner questions in [half marathons](HALF_MARATHON.md). The optional manual `source` job of the **Half marathon** workflow repeats the build and the recount in CI only when the owner has stored `HALF_SOURCE_TOKEN` (owner decision Q2: no such secret by default).

## Producer operations and missing information

The live producer database, scheduled ingestion, retries and recovery scripts are external to this checkout. A consistent SQLite snapshot is made through SQLite's backup mechanism or an equivalent supported snapshot; do not blindly copy a changing database or replace ingestion with a downloaded backup. Publish checksummed full-record snapshots with anonymous opening instructions. Public snapshot access does not require exposing the live service or its credentials.

Producer follow-up priorities are complete/reconcile held editions (1652: Chicago 2015, Oslo 2026, New York 2008 and Frankfurt 2019's engine force-drop), explain the in-place Paris 2014–2018 rewrite that left 25 km blank for about 99% of rows, restore the Washington course profile's race name, document exact-age and missing-field coverage, resolve ambiguous edition dates/start hours and provide historical route validity. See [KNOWN_ISSUES.md](KNOWN_ISSUES.md) and [INGESTION_HANDOFF.md](INGESTION_HANDOFF.md). Never infer missing values to make a cohort larger.

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
