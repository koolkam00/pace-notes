# Marathon pacing analysis pipeline

## All-finisher environmental and course comparisons

`build_all_finisher_context.py` adds history-independent comparisons from verified runner and runner-context shards. It preserves both pins and all older builder outputs. Run `python -m unittest discover -s analysis -p 'test_all_finisher_context.py'`, then build and independently verify with `node scripts/verify-all-finisher-context.cjs`. The full website check also validates clients and routes. Rebuild after either referenced manifest changes, including same-tag refreshes. Read [definitions, source contracts and commands](../docs/ALL_FINISHER_ANALYSES.md).

The current full-refresh source is **`htw-db-2026-10-16-1652`** (repository `koolkam00/pace-notes`; adopted on branch `feat/release-1652`, October 16, 2026, not yet deployed). Its verified input contains 4,915,355 raw and feature rows across 34 cities and 287 editions; the reviewed timing/source-quality cohort contains 3,871,767 eligible finishes from 211 editions. Calculation, import and publication are distinct statuses recorded in the [current refresh](../docs/REFRESH_20261016_1652.md); the [0934 refresh](../docs/REFRESH_20260912_0934.md) keeps the previous release's evidence. Use the exact tag and current source commit when reproducing results.

The pipeline calculates eight foundation and 25 extended packs, plus the 12-path personalized engine supplying the [essential ten](../docs/TOP_TEN_ANALYSES.md). A separate [weather screen](../docs/WEATHER_ANALYSES.md) evaluates humidity, four-hour warming and wind and publishes only supported candidates. The 33 broad packs form the research archive. Group running and congestion remain limited by missing physical-proximity/start-offset measurements.

## Inputs and ownership

[ACCESS.md](ACCESS.md) provides public CORE/FULL and backup downloads. Gzip compression is not encryption. Complete records, names and supplied features are available independently of aggregate charts. Credentials are not dataset contents.

`release.json` pins the main pipeline and `weather-release.json` pins the weather screen. Both select `koolkam00/pace-notes` and `private-export-20261021-1050` alongside their validated outputs. Pins select inputs; they do not certify analysis or deployment. Source files, calculations and output metadata retain metric units. Miles and per-mile paces are website display conversions.

These builders consume immutable exports and do not scrape races or operate the live ingestion database. The public explorer builder recalculates the supporting sustained-slowdown results and publishes a complete runner lookup. Its importer writes current compatibility metadata to `public/data/live.json`. Historical S/R/RN/P numerical files remain in Git history, outside the deployed website. The older `live_json_as_of` field in extension metadata records context at calculation time; source identity is determined by input export and checksums.

## Download and inspect

Run from the repository root with Python 3.12 and `analysis/requirements.txt` (DuckDB and NumPy). Choose fresh input and output directories.

```bash
python -m pip install -r analysis/requirements.txt
python analysis/download_release.py --bundle FULL --tag htw-db-2026-10-16-1652 --output /path/to/1652-input
python analysis/download_release.py --bundle CORE --tag htw-db-2026-10-16-1652 --output /path/to/1652-core
python analysis/inspect_export.py --input /path/to/1652-input --output /path/to/1652-inspection
python analysis/audit_expanded.py --input /path/to/1652-input --output /path/to/1652-inspection
python analysis/audit_release.py --input /path/to/1652-input --core /path/to/1652-core --previous /path/to/0934-input --output /path/to/1652-inspection/release-contract.json
python -m unittest discover -s analysis -p 'test_*.py'
```

The downloader verifies release asset size/SHA-256, rejects unsafe, duplicate or unexpected archive members, and writes `provenance.json`. A `private-export-*` CORE has exactly eight members and FULL adds `features.parquet`; an `htw-db-*` CORE adds `EDITIONS.json`, `CHANGE-REPORT.md`, `SHA256SUMS.txt` and `ID-CONTRACT.md` (12), and FULL adds `features.parquet` and `FEATURE-FIELD-NOTES.md` (14). Other audit sidecars stay separate assets. `audit_release.py` checks shared files, raw/feature alignment and timing units, and for htw-db releases every `SHA256SUMS.txt` line and the producer's per-edition counts; `--previous` adds the raw-record delta by edition and column (1652 against 0934: 569,263 added, 116,287 deleted, 242,649 changed). The manifest is hashed independently. Release prose and the ID-CONTRACT and FEATURE-FIELD-NOTES texts remain stale (they name the 1107 freeze); preserve the immutable input and the recorded audit findings.

## Rebuild every analysis

Read `https://splithappens.run/data/live.json` and substitute its actual `as_of` below. Use the same verified FULL directory for all builders.

```bash
python analysis/build_pacing.py --input /path/to/1050-input --output /path/to/1050-aggregates --live-as-of CURRENT_PUBLIC_LIVE_AS_OF
python analysis/build_extended.py --input /path/to/1050-input --output /path/to/1050-aggregates --personalized-output /path/to/1050-personalized --live-as-of CURRENT_PUBLIC_LIVE_AS_OF
python analysis/write_findings.py --output /path/to/1050-aggregates
python analysis/build_weather.py --input /path/to/1050-input --output /path/to/1050-weather/evidence.json
python analysis/build_public_explorer.py --input /path/to/1050-input --output /path/to/1050-explorer
```

`build_pacing.py` writes eight foundation packs; `build_extended.py` writes the other 25 and then calls `build_personalized.generate` on the same prepared cohort/linkage tables. Do not run a partial extension import or replace the current 90–720-minute personalized result with an older 150–270-minute artifact. `write_findings.py` generates narrative results from aggregate tables and records its own script hash.

The weather model and publication gate remain fixed across refreshes: all three candidates are rerun and retained in the audit. Current ready decisions determine routes; do not force humidity to remain withheld or wind/warming to remain published. Details and uncertainty methods are in [WEATHER_ANALYSES.md](../docs/WEATHER_ANALYSES.md).

## Validate and import

The aggregate ZIP must contain `ext_pack_name/pack_meta.json`, `summary.json` and referenced `tables/*.csv`, with all 33 names in `pack_registry.json`. The personalized ZIP contains only `ext_personalized_guide/` and its JSON files. ZIP the contents of each output directory, not an extra parent folder. The two importers have separate ownership contracts.

```bash
python analysis/import_packs.py --archive /path/to/pacing-aggregate-packs.zip --expected-export htw-db-2026-10-16-1652 --check-only
python analysis/import_personalized.py --archive /path/to/pacing-personalized-aggregates.zip --expected-export htw-db-2026-10-16-1652 --check-only
python analysis/import_packs.py --archive /path/to/pacing-aggregate-packs.zip --expected-export htw-db-2026-10-16-1652
python analysis/import_personalized.py --archive /path/to/pacing-personalized-aggregates.zip --expected-export htw-db-2026-10-16-1652
```

Review weather input identity, policy/script hashes, cohort reconciliation, all three decisions and edition values before copying its JSON to `public/data/weather/evidence.json`. Adopt both input pins with the reviewed outputs. Then run:

```bash
npm ci
python analysis/import_public_explorer.py --input /path/to/1652-explorer
python analysis/build_runner_context.py --input /path/to/1652-input --output /path/to/1652-runner-context
python analysis/import_runner_context.py --input /path/to/1652-runner-context
npm run verify:data
npm run build
```

The 33-pack importer requires the complete registry and validates before replacing only its owned folders. The personalized importer validates every shard/CDF/cell and writes compact JSON with transport hashes. Artifact limits are 20 MB uncompressed for the 33-pack archive and 512 MB for personalized output; investigate unexpected growth rather than dropping required cells. Weather is outside both import contracts and has its own verification.

The site checks source/pin consistency, raw/timing/source-exclusion reconciliation, finite values, observed cohort counts, strict target boundaries, route readiness, source labels and unit conversions. New publication still requires inspecting the exact diff and verifying production against the named commit and source release.

## Timing and source-quality contract

- Parse raw elapsed strings as H:MM:SS or M:SS; require all nine increasing checkpoints at 5, 10, 15, 20, 25, 30, 35, 40 and **42.195 km**, despite the `split_42_2km` field name. Do not interpolate missing splits or halfway times.
- Deduplicate equivalent records ignoring database IDs, ingestion timestamps and source URLs. Keep finishes from 90 minutes to 12 hours and every section from 2 to 20 min/km. These bounds can exclude real unusual performances.
- Apply [source_quality.py](source_quality.py) after timing checks. Its release-specific reviewed exclusions cover invalid grids (including grids that mix timing bases, mats that stopped recording partway through a field and a virtual edition), incomplete ingestion, unresolved HOLD editions and selected fields (top-finisher lists, and Boston 2013's finishers cut off when the race was stopped). Excluded editions do not supply current outcomes or earlier benchmarks. Do not exclude additional editions merely for being small.
- Reconcile `raw = duplicates_removed + missing_or_unparsed + non_increasing + outside_quality_bounds + source_quality_excluded + eligible`. `timing_eligible = source_quality_excluded + eligible`. The policy's edition counts and hashes travel with every output.
- For 1652: timing-eligible 4,027,044; source-excluded 155,277 (30 editions); final eligible 3,871,767. For 0934 (historical): 3,595,426; 78,090 (11 editions); 3,517,336. Missing age or recorded gender alone does not remove a valid finish from All. Exact-age/gender comparisons retain their own coverage rules. Feature `valid_splits` is a different population.
- Compare 0–20 with 20–40 km at equal distance; do not call these measured half-marathon splits. Runner-normalized median profiles need not integrate to zero even though each individual's normalized profile does.
- Chart cells generally require 100 finishes. Matched strata and edition comparisons have additional documented minima. These are reliability rules, not restrictions on access to full records. Finish counts are not unique-runner counts.

## Identity and chronology

The explicitly audited 1107, 0934 and 1652 releases use canonical raw `id` / feature `record_id` after runtime checks of unique matching sets and recorded labels. The candidate join additionally matches finish and all nine section durations to milliseconds. Legacy September 7 reproduction retains one-to-one edition/name/full-timing matching because those numeric ID namespaces are incompatible. Never join by row order or apply the newer contract retroactively.

Cross-race IDs remain supplied candidates. Retain non-ambiguity, consistent recorded gender, inferred birth-year span at most two years and no duplicate edition. Recompute recent best from the two strictly earlier calendar years; exclude all current/same-year outcomes. Earlier-best improvements use all strictly earlier years, not a claimed lifetime PB. Supplied PB/ability/next-race fields never supply pre-race covariates.

Feature race dates remain null. Dated comparisons use complete, unique supplied edition-date coverage. Pair analyses require uniquely observed endpoint years; recorded return requires subsequent home-city edition coverage. Missing later records do not establish retirement. Course historical validity is unavailable except Warsaw's supplied start year (2019), so terrain is a supplied-route proxy, attached only inside a supplied validity interval.

## Personalized engine

The engine retains 12 calculation paths: achieved-time pacing, earlier-benchmark opening, exact-threshold nearby finishes, age contrasts, terrain, opening/late pacing, checkpoints, course outcome spread, edition-weighted temperature, threshold context, paired returns and earlier-best gains. The primary ten are mapped in `lib/ten-analyses.ts`; the earlier guide remains at `/research/personalized`.

Targets are every whole minute from 90 through 720 with strict finish < target. Achieved-time bands use 43 fifteen-minute presets; exact thresholds do not interpolate. Exact ages are 18–24, then five-year bands through 85–89. Previous time selects a 15-minute band of recorded bests in the two earlier years. Broader cohorts are explicitly labeled; a course never silently falls back to another city.

Checkpoint cells use 20/30/35 km, two-minute elapsed bands with an exclusive upper endpoint, and optional recent-section trend; they do not use a prior-time filter. Their historical proportions are not validated individual probabilities. A separate forecast pack trains only before the latest three observed years and evaluates all models on the same later eligible cohort.

## Outputs, provenance and workflows

Each broad pack has metadata, summary and aggregate CSV tables. Metadata records source/export timestamps, archive/manifest/script hashes, live-context timestamp, raw and eligible counts, source-quality audit and written methods. Personalized metadata also records linkage, target range and JSON transport hashes. Later prose-only edits must be distinguished from numerical recalculation.

The **Marathon pacing analysis** workflow responds to matching release publication, relevant PR changes and manual dispatch. It produces `pacing-aggregate-packs`, `pacing-personalized-aggregates` and `pacing-export-inspection`; it does not import or deploy. The **Weather evidence screen** workflow accepts an explicit tag and produces `weather-evidence`, also without import or deployment. Record exact tag, code commit and artifacts; artifacts can expire, so preserve durable audit reports.

The original sustained-slowdown definition remains unchanged: at least 25% slowing for at least 5 km after 20 km versus the 5–20 km baseline, with a neutral [published-method citation](https://doi.org/10.1371/journal.pone.0251513). The current supporting study recomputes that definition from the same eligible raw timings as the main analyses. The original undocumented cost and adjustment models are not republished as current results.

## Data stories

`build_insights.py` writes the story families (`insights_round.py`, `insights_replay.py`, `insights_archetypes.py`, `insights_positions.py`, `insights_demographics.py`, `insights_kick.py` and `insights_courses.py`) to `public/data/insights/`. It reads the verified runner shards through `insights_data.py` and can apply a duplicate-edition screen specific to the stories (Chicago 2018/2019 under 0934; empty since 1652, which reloaded both editions). Shape statistics also leave out start-offset editions. `build_course_geometry.py` simplifies the supplied routes for illustrations. Tests are in `test_insights.py`; the independent recount is `scripts/verify-insights.cjs`. Methods are in [data stories](../docs/STORIES.md).

## Terrain splits

`build_course_terrain.py` writes `public/data/insights/tools/course-terrain.json` (family `tool-course-terrain`) from the adopted release's `course_profiles.parquet` and the audited correction registry [`course_terrain/corrections.json`](course_terrain/README.md), then `build_insights.py --only manifest` lists it. `terrain_model.py` is the model: one published grade curve (Strava 2017 equal-heart-rate quadratic, third-party fit) spread over the corrected route stretched to 42.195 km, so the visitor's goal is divided along the route and never changed. No finish data enters it and it is never fitted to Pace Notes data (owner decision, October 23, 2026). The builder refuses on any input-hash mismatch, a class c or unsourced terrain course, a smoothed grade above 8% and a feature outside its correction. Tests are in `test_course_terrain.py` (set `COURSE_PROFILES` to the release parquet for the release checks); `scripts/verify-insights.cjs` (`checkCourseTerrain`) checks bindings, course sets and bridge-deck clearances; `scripts/verify-tools.cjs` recomputes every published share with an independent JavaScript model and asserts the same parity fixture (`course_terrain/fixtures/parity.json`). The site contract, the course list with each course's reason, the strings, the checks and the dated evidence are in [runner tools](../docs/TOOLS.md#terrain-splits-owner-decision-october-23-2026); the rebuild and clearing steps are in [operations](../docs/OPERATIONS.md#terrain-splits-refresh).

## Half marathons (private source, aggregates only)

The half pages read `public/data/half/`, built from a private half snapshot and its runner-links build, both pinned in `half-release.json` and kept outside the repository (`PACE_HALF_DIR`, default `~/data/half-1133`). `half_links_extract.py` cuts `links-slim.sqlite` (medium and high links of people in both databases, person keys hashed, no names) from the links release; `half_quality.py` holds the reviewed policy (`REVIEWED_HALF_POLICIES`: record rules R1–R7, edition rules E0–E8, `use_sex`, date suspects, the same-city labels; the reviewed lists in `half_policy_lists.py`) and freezes it as `half-policy-20261029-1133.json` with `--write-policy`; `half_marathon.py` reads the marathon side from the public runner shards and the weather evidence; `half_pairs.py` builds set B (nearest earlier half 21–112 days before each eligible marathon, one pair per person and marathon); `half_field.py`, `half_women.py`, `half_linked.py` and `half_cards.py` write the families; `build_half.py` checks the sources against the pin, asserts every count and writes `manifest.json`. Run them with `python3 -I` (DuckDB `PACE_HALF_DUCKDB_THREADS`, default 2; `PACE_HALF_DUCKDB_MEMORY`, default 4GB; spill to `TMPDIR`):

```
python3 -I analysis/download_half.py --from-dir DIR [--from-dir DIR] | --token-env HALF_SOURCE_TOKEN [--out "$PACE_HALF_DIR"]
python3 -I analysis/half_links_extract.py --links-parquet DIR --out "$PACE_HALF_DIR/links-slim.sqlite" [--pin]
python3 -I analysis/build_half.py --half "$PACE_HALF_DIR/platform_half.sqlite" --links "$PACE_HALF_DIR/links-slim.sqlite" [--accept-counts]
python -m unittest discover -s analysis -p 'test_half.py'   # PACE_HALF_SOURCE_TESTS=1 also recomputes the frozen lists from the snapshot
npm run verify:half-source                                  # the local Node recount; writes docs/evidence/half/source-recount.json
```

`download_half.py` is not the public downloader (`download_release.py` stays anonymous): it reads the owner's `gh release download` folders or a read-only token from an environment variable (sent to api.github.com only, never written or printed), checks every asset against `SHA256SUMS` and the pin, reassembles and checks the SQLite and cuts the links extract (about 9 GB of free disk while both sources are in place). A build takes about 100 s and two builds give the same bytes; it writes no temp file over 1 GB and removes its own. A count that differs from the reviewed one fails the build (`--accept-counts` only for a reviewed refresh); a new snapshot fails until its lists are reviewed. `half_cards.py` writes the plots of the four "From the half" cards, whose words are `lib/charts/text/half.ts` and whose images `node scripts/build-chart-cards.cjs --set half` draws. The nuggets are `lib/nuggets/half.ts`, recounted by `scripts/nuggets/half.cjs`.

CI cannot read the private sources. `scripts/verify-half.cjs` (in `npm run verify:data`) recounts the half-only values from the published aggregates and the marathon side from the public shards, checks the linked aggregates for consistency and fails unless the receipt of the independent Node recount (`scripts/verify-half-source.cjs`, about 80 s and 0.9 GB) binds the current manifest and recount scripts: after any rebuild, or any change to the recount, run `npm run verify:half-source` and commit the new receipt. The contract and dated evidence are in [half marathons](../docs/HALF_MARATHON.md); the refresh steps in [operations](../docs/OPERATIONS.md#half-refresh).

## Public name search and selected-race analysis

`build_public_explorer.py` shares the timing parser, canonical-ID audit, identity checks and reviewed edition exclusions with the existing builders. It writes `study/evidence.json` and `runners/manifest.json` plus deterministic gzip JSON shards. `import_public_explorer.py` invokes the full Node verifier before replacing only these two folders and current `live.json` compatibility metadata. Node must be on PATH. The **Public runner explorer** workflow rebuilds these outputs and uploads `public-runner-explorer`; it does not import or deploy them.

Names are normalized identically in Python and JavaScript (NFKD, remove Unicode marks, lowercase, retain letters/numbers, collapse spaces). Each name token contributes its first three Unicode codepoints to a SHA-256 bucket; shorter tokens use the whole token. A query loads one bucket and requires every query token to match. Results paginate without silently dropping matches. Profile buckets use SHA-256 of the candidate profile ID. Browser requests verify compressed bytes, checksum and source tag before decoding ordinary gzip, which is compression rather than encryption.

A profile is a supplied non-ambiguous identity passing the same consistency checks as linked analyses, or a singleton raw record otherwise. Matching names never merge records. Users explicitly select races, including across separate candidate groups, then confirm analysis. Every raw record is retained, including those with missing names or invalid timings; unnamed records cannot be found by a name query. Excluded records retain raw checkpoint strings and a reason. Profile IDs are release-specific and must not be treated as permanent person IDs.

Individual comparisons use only selected eligible finishes. Early pace covers 5–20 km, late pace 30 km–finish, and the opening is 0–5 km; section plots retain the actual nine timing intervals. Finish progression compares recorded years, without inventing within-year chronology. Neither the fastest selected finish nor a source identity is a verified lifetime best/person. Browser and publication tests verify unambiguous unit conversion, exclusion behavior, query handling and shard integrity.

Threshold comparisons in the supporting study allow a ratio tolerance of 1e−12 solely for binary rounding. Exact decimal boundaries are included; values 1e−9 below a boundary remain excluded. Detection, onset and the independent runner-data recount use the same convention.

## Same-edition peers and environmental context

`build_runner_context.py` invokes the shared eligible-cohort calculation, `runner_peers.py` and `runner_environment.py`. It verifies the FULL archive/manifest and four used Parquet members, then requires the source, cohort, policy and ordered editions to agree with the exact runner manifest. The output is a context manifest plus one deterministic gzip JSON shard for each raw edition (298 in 1050, 287 in 1652). It requires a reviewed release policy; 1107, 0934, 1652 and 1050 are explicitly supported. The [complete contracts and coverage](../docs/RUNNER_CONTEXT_AND_PEERS.md) document calculation and publication evidence separately.

Peer groups are exact city/year/race, with All, recorded Men/Women, exact-age bands and combined demographics. Each group and achieved-time pacing cell requires 101 finishes. Finish distributions preserve times to milliseconds; finish percentiles exclude the selected record and give other ties half weight. Group medians and pace quartiles include the selected record. Pace bands are half-open 15-minute intervals centered on the nearest 15-minute finish, not pre-race ability or declared goals. Late change compares 30 km–finish pace against 5–20 km pace. Between-race section differences add to the signed finish difference without weather, terrain or fitness correction.

Weather joins one valid city/year row to the matching race name and verifies five exact archive hours, units and provenance. Missing/invalid fields remain absent with reasons. Terrain requires one matching supplied course and nine consistent sections; it keeps independent gain/loss/net sums, separate whole-profile totals/distances and unknown historical validity. The 1050 context covers all 298 weather editions (Chicago 2025 through the reviewed early hour in `build_weather.py` `ACCEPTED_EARLY_HOURS`, October 22, 2026) and 281 terrain editions (0934: 249 and 254). It does not fit a new weather model, infer personal exposure or adjust finish times.

After importing the runner lookup, use a fresh context output directory:

```bash
python analysis/build_runner_context.py --input /path/to/1652-input --output /path/to/1652-runner-context --runners public/data/runners
python analysis/import_runner_context.py --input /path/to/1652-runner-context --check-only
python analysis/import_runner_context.py --input /path/to/1652-runner-context
```

The importer requires Node on PATH and runs the full independent verifier before replacing only `public/data/runner-context`. `--output` optionally selects its parent directory and defaults to `public/data`; it does not redirect the verifier's reference runner dataset. Refreshing the lookup requires a context rebuild even at the same tag because the runner-manifest hash/timestamp is part of the contract. The **Runner context and peers** workflow uploads `runner-context` without importing or deploying. Full `npm run verify:data` includes every CDF recount, 16 independent pacing-quartile samples, client tests and UI checks; finish with `npm run build` and separate production verification. See [operations](../docs/OPERATIONS.md#runner-context-refresh).
