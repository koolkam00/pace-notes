# Marathon pacing analysis pipeline

## All-finisher environmental and course comparisons

`build_all_finisher_context.py` adds history-independent comparisons from verified runner and runner-context shards. It preserves both pins and all older builder outputs. Run `python -m unittest discover -s analysis -p 'test_all_finisher_context.py'`, then build and independently verify with `node scripts/verify-all-finisher-context.cjs`. The full website check also validates clients and routes. Rebuild after either referenced manifest changes, including same-tag refreshes. Read [definitions, source contracts and commands](../docs/ALL_FINISHER_ANALYSES.md).

The current full-refresh source is **`private-export-20260912-0934`**. Its verified input contains 4,462,379 raw and feature rows; the reviewed timing/source-quality cohort contains 3,517,336 eligible finishes. Calculation, import and publication are distinct statuses recorded in the [current refresh](../docs/REFRESH_20260912_0934.md). Use the exact tag and current source commit when reproducing results.

The pipeline calculates eight foundation and 25 extended packs, plus the 12-path personalized engine supplying the [essential ten](../docs/TOP_TEN_ANALYSES.md). A separate [weather screen](../docs/WEATHER_ANALYSES.md) evaluates humidity, four-hour warming and wind and publishes only supported candidates. The 33 broad packs form the research archive. Group running and congestion remain limited by missing physical-proximity/start-offset measurements.

## Inputs and ownership

[ACCESS.md](ACCESS.md) provides public CORE/FULL and backup downloads. Gzip compression is not encryption. Complete records, names and supplied features are available independently of aggregate charts. Credentials are not dataset contents.

`release.json` pins the main pipeline and `weather-release.json` pins the weather screen. Both select 0934 alongside their validated outputs. Pins select inputs; they do not certify analysis or deployment. Source files, calculations and output metadata retain metric units. Miles and per-mile paces are website display conversions.

These builders consume immutable exports and do not scrape races or operate the live ingestion database. The public explorer builder recalculates the supporting sustained-slowdown results and publishes a complete runner lookup. Its importer writes current compatibility metadata to `public/data/live.json`. Historical S/R/RN/P numerical files remain in Git history, outside the deployed website. The older `live_json_as_of` field in extension metadata records context at calculation time; source identity is determined by input export and checksums.

## Download and inspect

Run from the repository root with Python 3.12 and `analysis/requirements.txt` (DuckDB and NumPy). Choose fresh input and output directories.

```bash
python -m pip install -r analysis/requirements.txt
python analysis/download_release.py --bundle FULL --tag private-export-20260912-0934 --output /path/to/0934-input
python analysis/download_release.py --bundle CORE --tag private-export-20260912-0934 --output /path/to/0934-core
python analysis/inspect_export.py --input /path/to/0934-input --output /path/to/0934-inspection
python analysis/audit_expanded.py --input /path/to/0934-input --output /path/to/0934-inspection
python analysis/audit_release.py --input /path/to/0934-input --core /path/to/0934-core --output /path/to/0934-inspection/release-contract.json
python -m unittest discover -s analysis -p 'test_*.py'
```

The downloader verifies release asset size/SHA-256, rejects unsafe, duplicate or unexpected archive members, and writes `provenance.json`. CORE has exactly eight members; FULL adds `features.parquet`. Audit sidecars stay separate assets. `audit_release.py` checks shared files, raw/feature alignment and timing units; add `--previous /path/to/1107-input` for a same-ID raw-record delta. The 0934 manifest is hashed independently and omits a self-entry. Release prose and sidecar identity/history notes remain stale; preserve the immutable input and the recorded audit findings.

## Rebuild every analysis

Read `https://splithappens.run/data/live.json` and substitute its actual `as_of` below. Use the same verified FULL directory for all builders.

```bash
python analysis/build_pacing.py --input /path/to/0934-input --output /path/to/0934-aggregates --live-as-of CURRENT_PUBLIC_LIVE_AS_OF
python analysis/build_extended.py --input /path/to/0934-input --output /path/to/0934-aggregates --personalized-output /path/to/0934-personalized --live-as-of CURRENT_PUBLIC_LIVE_AS_OF
python analysis/write_findings.py --output /path/to/0934-aggregates
python analysis/build_weather.py --input /path/to/0934-input --output /path/to/0934-weather/evidence.json
python analysis/build_public_explorer.py --input /path/to/0934-input --output /path/to/0934-explorer
```

`build_pacing.py` writes eight foundation packs; `build_extended.py` writes the other 25 and then calls `build_personalized.generate` on the same prepared cohort/linkage tables. Do not run a partial extension import or replace the current 90–720-minute personalized result with an older 150–270-minute artifact. `write_findings.py` generates narrative results from aggregate tables and records its own script hash.

The weather model and publication gate remain fixed across refreshes: all three candidates are rerun and retained in the audit. Current ready decisions determine routes; do not force humidity to remain withheld or wind/warming to remain published. Details and uncertainty methods are in [WEATHER_ANALYSES.md](../docs/WEATHER_ANALYSES.md).

## Validate and import

The aggregate ZIP must contain `ext_pack_name/pack_meta.json`, `summary.json` and referenced `tables/*.csv`, with all 33 names in `pack_registry.json`. The personalized ZIP contains only `ext_personalized_guide/` and its JSON files. ZIP the contents of each output directory, not an extra parent folder. The two importers have separate ownership contracts.

```bash
python analysis/import_packs.py --archive /path/to/pacing-aggregate-packs.zip --expected-export private-20260912-0934 --check-only
python analysis/import_personalized.py --archive /path/to/pacing-personalized-aggregates.zip --expected-export private-20260912-0934 --check-only
python analysis/import_packs.py --archive /path/to/pacing-aggregate-packs.zip --expected-export private-20260912-0934
python analysis/import_personalized.py --archive /path/to/pacing-personalized-aggregates.zip --expected-export private-20260912-0934
```

Review weather input identity, policy/script hashes, cohort reconciliation, all three decisions and edition values before copying its JSON to `public/data/weather/evidence.json`. Adopt both input pins with the reviewed outputs. Then run:

```bash
npm ci
python analysis/import_public_explorer.py --input /path/to/0934-explorer
python analysis/build_runner_context.py --input /path/to/0934-input --output /path/to/0934-runner-context
python analysis/import_runner_context.py --input /path/to/0934-runner-context
npm run verify:data
npm run build
```

The 33-pack importer requires the complete registry and validates before replacing only its owned folders. The personalized importer validates every shard/CDF/cell and writes compact JSON with transport hashes. Artifact limits are 20 MB uncompressed for the 33-pack archive and 512 MB for personalized output; investigate unexpected growth rather than dropping required cells. Weather is outside both import contracts and has its own verification.

The site checks source/pin consistency, raw/timing/source-exclusion reconciliation, finite values, observed cohort counts, strict target boundaries, route readiness, source labels and unit conversions. New publication still requires inspecting the exact diff and verifying production against the named commit and source release.

## Timing and source-quality contract

- Parse raw elapsed strings as H:MM:SS or M:SS; require all nine increasing checkpoints at 5, 10, 15, 20, 25, 30, 35, 40 and **42.195 km**, despite the `split_42_2km` field name. Do not interpolate missing splits or halfway times.
- Deduplicate equivalent records ignoring database IDs, ingestion timestamps and source URLs. Keep finishes from 90 minutes to 12 hours and every section from 2 to 20 min/km. These bounds can exclude real unusual performances.
- Apply [source_quality.py](source_quality.py) after timing checks. Its release-specific reviewed exclusions cover invalid grids, incomplete ingestion, unresolved HOLD editions and a selected top-finisher field. Excluded editions do not supply current outcomes or earlier benchmarks. Do not exclude additional editions merely for being small.
- Reconcile `raw = duplicates_removed + missing_or_unparsed + non_increasing + outside_quality_bounds + source_quality_excluded + eligible`. `timing_eligible = source_quality_excluded + eligible`. The policy's edition counts and hashes travel with every output.
- For 0934: timing-eligible 3,595,426; source-excluded 78,090; final eligible 3,517,336. Missing age or recorded gender alone does not remove a valid finish from All. Exact-age/gender comparisons retain their own coverage rules. Feature `valid_splits` is a different population.
- Compare 0–20 with 20–40 km at equal distance; do not call these measured half-marathon splits. Runner-normalized median profiles need not integrate to zero even though each individual's normalized profile does.
- Chart cells generally require 100 finishes. Matched strata and edition comparisons have additional documented minima. These are reliability rules, not restrictions on access to full records. Finish counts are not unique-runner counts.

## Identity and chronology

The explicitly audited 1107 and 0934 releases use canonical raw `id` / feature `record_id` after runtime checks of unique matching sets and recorded labels. The candidate join additionally matches finish and all nine section durations to milliseconds. Legacy September 7 reproduction retains one-to-one edition/name/full-timing matching because those numeric ID namespaces are incompatible. Never join by row order or apply the newer contract retroactively.

Cross-race IDs remain supplied candidates. Retain non-ambiguity, consistent recorded gender, inferred birth-year span at most two years and no duplicate edition. Recompute recent best from the two strictly earlier calendar years; exclude all current/same-year outcomes. Earlier-best improvements use all strictly earlier years, not a claimed lifetime PB. Supplied PB/ability/next-race fields never supply pre-race covariates.

Feature race dates remain null. Dated comparisons use complete, unique supplied edition-date coverage. Pair analyses require uniquely observed endpoint years; recorded return requires subsequent home-city edition coverage. Missing later records do not establish retirement. Course historical validity remains unavailable, so terrain is a supplied-route proxy.

## Personalized engine

The engine retains 12 calculation paths: achieved-time pacing, earlier-benchmark opening, exact-threshold nearby finishes, age contrasts, terrain, opening/late pacing, checkpoints, course outcome spread, edition-weighted temperature, threshold context, paired returns and earlier-best gains. The primary ten are mapped in `lib/ten-analyses.ts`; the earlier guide remains at `/research/personalized`.

Targets are every whole minute from 90 through 720 with strict finish < target. Achieved-time bands use 43 fifteen-minute presets; exact thresholds do not interpolate. Exact ages are 18–24, then five-year bands through 85–89. Previous time selects a 15-minute band of recorded bests in the two earlier years. Broader cohorts are explicitly labeled; a course never silently falls back to another city.

Checkpoint cells use 20/30/35 km, two-minute elapsed bands with an exclusive upper endpoint, and optional recent-section trend; they do not use a prior-time filter. Their historical proportions are not validated individual probabilities. A separate forecast pack trains only before the latest three observed years and evaluates all models on the same later eligible cohort.

## Outputs, provenance and workflows

Each broad pack has metadata, summary and aggregate CSV tables. Metadata records source/export timestamps, archive/manifest/script hashes, live-context timestamp, raw and eligible counts, source-quality audit and written methods. Personalized metadata also records linkage, target range and JSON transport hashes. Later prose-only edits must be distinguished from numerical recalculation.

The **Marathon pacing analysis** workflow responds to matching release publication, relevant PR changes and manual dispatch. It produces `pacing-aggregate-packs`, `pacing-personalized-aggregates` and `pacing-export-inspection`; it does not import or deploy. The **Weather evidence screen** workflow accepts an explicit tag and produces `weather-evidence`, also without import or deployment. Record exact tag, code commit and artifacts; artifacts can expire, so preserve durable audit reports.

The original sustained-slowdown definition remains unchanged: at least 25% slowing for at least 5 km after 20 km versus the 5–20 km baseline, with a neutral [published-method citation](https://doi.org/10.1371/journal.pone.0251513). The current supporting study recomputes that definition from the same eligible raw timings as the main analyses. The original undocumented cost and adjustment models are not republished as current results.

## Data stories

`build_insights.py` writes the story families (`insights_round.py`, `insights_replay.py`, `insights_archetypes.py`, `insights_positions.py`, `insights_demographics.py`, `insights_kick.py` and `insights_courses.py`) to `public/data/insights/`. It reads the verified runner shards through `insights_data.py` and applies a duplicate-edition screen (Chicago 2018/2019) specific to the stories. Shape statistics also leave out start-offset editions. `build_course_geometry.py` simplifies the supplied routes for illustrations. Tests are in `test_insights.py`; the independent recount is `scripts/verify-insights.cjs`. Methods are in [data stories](../docs/STORIES.md).

## Public name search and selected-race analysis

`build_public_explorer.py` shares the timing parser, canonical-ID audit, identity checks and reviewed edition exclusions with the existing builders. It writes `study/evidence.json` and `runners/manifest.json` plus deterministic gzip JSON shards. `import_public_explorer.py` invokes the full Node verifier before replacing only these two folders and current `live.json` compatibility metadata. Node must be on PATH. The **Public runner explorer** workflow rebuilds these outputs and uploads `public-runner-explorer`; it does not import or deploy them.

Names are normalized identically in Python and JavaScript (NFKD, remove Unicode marks, lowercase, retain letters/numbers, collapse spaces). Each name token contributes its first three Unicode codepoints to a SHA-256 bucket; shorter tokens use the whole token. A query loads one bucket and requires every query token to match. Results paginate without silently dropping matches. Profile buckets use SHA-256 of the candidate profile ID. Browser requests verify compressed bytes, checksum and source tag before decoding ordinary gzip, which is compression rather than encryption.

A profile is a supplied non-ambiguous identity passing the same consistency checks as linked analyses, or a singleton raw record otherwise. Matching names never merge records. Users explicitly select races, including across separate candidate groups, then confirm analysis. Every raw record is retained, including those with missing names or invalid timings; unnamed records cannot be found by a name query. Excluded records retain raw checkpoint strings and a reason. Profile IDs are release-specific and must not be treated as permanent person IDs.

Individual comparisons use only selected eligible finishes. Early pace covers 5–20 km, late pace 30 km–finish, and the opening is 0–5 km; section plots retain the actual nine timing intervals. Finish progression compares recorded years, without inventing within-year chronology. Neither the fastest selected finish nor a source identity is a verified lifetime best/person. Browser and publication tests verify unambiguous unit conversion, exclusion behavior, query handling and shard integrity.

Threshold comparisons in the supporting study allow a ratio tolerance of 1e−12 solely for binary rounding. Exact decimal boundaries are included; values 1e−9 below a boundary remain excluded. Detection, onset and the independent runner-data recount use the same convention.

## Same-edition peers and environmental context

`build_runner_context.py` invokes the shared eligible-cohort calculation, `runner_peers.py` and `runner_environment.py`. It verifies the FULL archive/manifest and four used Parquet members, then requires the source, cohort, policy and ordered editions to agree with the exact runner manifest. The output is a context manifest plus one deterministic gzip JSON shard for each of the 256 raw editions. It requires a reviewed release policy; 1107 and 0934 are explicitly supported. The [complete contracts and coverage](../docs/RUNNER_CONTEXT_AND_PEERS.md) document calculation and publication evidence separately.

Peer groups are exact city/year/race, with All, recorded Men/Women, exact-age bands and combined demographics. Each group and achieved-time pacing cell requires 101 finishes. Finish distributions preserve times to milliseconds; finish percentiles exclude the selected record and give other ties half weight. Group medians and pace quartiles include the selected record. Pace bands are half-open 15-minute intervals centered on the nearest 15-minute finish, not pre-race ability or declared goals. Late change compares 30 km–finish pace against 5–20 km pace. Between-race section differences add to the signed finish difference without weather, terrain or fitness correction.

Weather joins one valid city/year row to the matching race name and verifies five exact archive hours, units and provenance. Missing/invalid fields remain absent with reasons. Terrain requires one matching supplied course and nine consistent sections; it keeps independent gain/loss/net sums, separate whole-profile totals/distances and unknown historical validity. The 0934 context covers 249 weather editions and 254 terrain editions. It does not fit a new weather model, infer personal exposure or adjust finish times.

After importing the runner lookup, use a fresh context output directory:

```bash
python analysis/build_runner_context.py --input /path/to/0934-input --output /path/to/0934-runner-context --runners public/data/runners
python analysis/import_runner_context.py --input /path/to/0934-runner-context --check-only
python analysis/import_runner_context.py --input /path/to/0934-runner-context
```

The importer requires Node on PATH and runs the full independent verifier before replacing only `public/data/runner-context`. `--output` optionally selects its parent directory and defaults to `public/data`; it does not redirect the verifier's reference runner dataset. Refreshing the lookup requires a context rebuild even at the same tag because the runner-manifest hash/timestamp is part of the contract. The **Runner context and peers** workflow uploads `runner-context` without importing or deploying. Full `npm run verify:data` includes every CDF recount, 16 independent pacing-quartile samples, client tests and UI checks; finish with `npm run build` and separate production verification. See [operations](../docs/OPERATIONS.md#runner-context-refresh).
