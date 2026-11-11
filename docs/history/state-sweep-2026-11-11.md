# The state sweep of November 11, 2026: replaced lines

> Moved here word for word on November 11, 2026 from the files named in each heading, as `main` held them at `de9f8c6f`, when the state sweep (branch `claude/docs-current`) replaced or removed those lines. The line numbers are that commit's. Only the targets of relative links are re-pointed, so that they resolve from this folder; a link to a heading the same change renamed or moved names its new place. A table row, a list item or a heading stands here without its neighbours. The sections that moved whole are not repeated here: six History sections have their own files and rows in the [index](README.md), and the superseded course-shape section moved inside `docs/TOOLS.md`. Counts belong to the release they name; do not quote them as current.

Why the lines were replaced: they named a merged branch, or the release before the adopted one, as the present state (a review of November 9, 2026 listed 31 such lines; [record](../evidence/2026-11-09/site-review/REVIEW.md)); the handoff's Current state, owner list, recent changes and reading order were brought up to date after #92 and #93 merged and the owner lifted the autopilot's pause; three facts in the constitution had moved; and a count that a contract merely repeated was taken out. The owner's request of that day is quoted in the [register](../OWNER_DECISIONS.md).

## AGENTS.md

Lines 40 of `AGENTS.md` at `de9f8c6f`.

**Line 40**

17. **Words the site never uses.** The owner does not want the word "arithmetic" anywhere on the site. Never "the wall" or "hit the wall" (say "sustained slowdown"), never "your chance" in any form, and never a release tag or its date in visible copy. Enforced by `verify-tools` ("arithmetic" in `app/`, `components/` and `lib/`), `verify-seo` `banned-words` (the three phrases in every built page's text, metadata and JSON-LD), `verify-courses` (the phrases, `private-export`, `htw-db-`, `20260912`, `20261016` and `20261021` on course pages), `scripts/lib/words.cjs` (`BANNED` and `RELEASE_LABEL`, which adds `half-dataset-`, `half-snapshot-`, `runner-links-` and `person-ids-`, in `verify-charts` and `verify-half`) and `scripts/autopilot-guard.cjs` on autopilot pull requests.

## README.md

Lines 26, 45 of `README.md` at `de9f8c6f`.

**Line 26**

The adopted marathon release is named in [`analysis/release.json`](../../analysis/release.json) (weather in [`analysis/weather-release.json`](../../analysis/weather-release.json), half marathons in [`analysis/half-release.json`](../../analysis/half-release.json)); its counts are in the current refresh record, [REFRESH_20261021_1050.md](../REFRESH_20261021_1050.md). What production serves is named by [`/version.json`](https://splithappens.run/version.json) (the deployed commit) and [`/data/live.json`](https://splithappens.run/data/live.json) (the release behind its data). A newer export does not automatically update the website; the [project handoff](../PROJECT_HANDOFF.md) records the dated state.

**Line 45**

Open `http://localhost:3000`. `npm run build` writes the static site to `out/`. The calculations need Python 3.12 with `analysis/requirements.txt`; their commands, checksums, imports and per-release ID contracts are in [analysis/README.md](../../analysis/README.md) and the [operations runbook](../OPERATIONS.md). An optional `NEXT_PUBLIC_BASE_PATH` supports hosting under a subpath.

## analysis/ACCESS.md

Lines 3, 46, 96 of `analysis/ACCESS.md` at `de9f8c6f`.

**Line 3**

Updated November 5, 2026 for **`master-20261103b`**, the release every page uses on the branch `feat/half-v4` (draft PR #89; not merged: production still uses `private-export-20261021-1050`, whose section is [below](../../analysis/ACCESS.md#the-1050-release-october-21-2026-historical); production state is recorded in the [project handoff](../PROJECT_HANDOFF.md)). Full source records, recorded names, overlays and the producer's documents are public research material. Files are compressed or plain, never encrypted. Public snapshot access does not imply a connection to the running ingestion database. `/methodology#downloads` links here as "how to open them", so this top section is rewritten at every adoption.

**Line 46**

The half-marathon pages (`/half`, the half-to-full story and the tools' half panels) read the owner's public half releases in the same repository, under CC BY 4.0, pinned by sha256 in [`analysis/half-release.json`](../../analysis/half-release.json) (schema 3). This is the pin of the branch `feat/half-v4`, measured and reviewed on October 31, 2026 and not merged; `main` and production still read the first pin, [below](../../analysis/ACCESS.md#half-marathon-releases-october-30-2026-historical). Contract, rules and evidence: [half marathons](../HALF_MARATHON.md#sources-and-access).

**Line 96**

> Historical (October 31, 2026): the first half pin, which `main` and production still read; the branch `feat/half-v4` replaces it with `half-dataset-20261030-1904` ([above](../../analysis/ACCESS.md#half-marathon-releases-october-31-2026)). This section is kept as written on October 30, 2026; its heading gained "historical".

## analysis/README.md

Lines 15, 17, 21, 35, 116–117, 170 of `analysis/README.md` at `de9f8c6f`.

**Line 15**

On the branch `feat/half-v4` (draft PR #89, not merged; November 5, 2026) both pins name **`master-20261103b`**, read through `analysis/adapt_master.py` with weather and routes from `dataset-20261103-0706` ([refresh record](../REFRESH_20261103b.md)); on `main`, as on October 30, 2026, they name **`private-export-20261021-1050`** in `koolkam00/pace-notes`, adopted by PR #78 (merged as `39f3057` on October 22, 2026); its source, calculation and import evidence is in the [1050 refresh record](../REFRESH_20261021_1050.md). A pin selects an input. It does not certify a calculation, an import or a deployment: what production serves is a separate fact, recorded in the handoff's [Current state](../PROJECT_HANDOFF.md#current-state) (on October 30, 2026 at 23:30 UTC, production `/data/live.json` named the same tag). The half-marathon pages have their own pin, `half-release.json` ([below](../../analysis/README.md#half-marathons-public-source-pages-show-aggregates)). Source files, calculations and output metadata keep metric units; miles and per-mile paces are website display conversions.

**Line 17**

**Tag, bundle id and `--expected-export`.** Every pack records `input_export_id`, which `build_pacing.py` makes from the tag by changing `private-export-` to `private-` (an `htw-db-*` tag stays as it is). The importers' `--expected-export` must equal it, `private-20261021-1050` under 1050; any other value is refused (`import_packs.py`: "Artifact belongs to a different export."; `import_personalized.py` by an assertion). `calculation_provenance.py` then requires the exact reviewed builder hashes for the audited bundle ids `private-20260911-1107`, `private-20260912-0934`, `htw-db-2026-10-16-1652` and `private-20261021-1050`. Every identifier the releases use is in [data architecture](../DATA_ARCHITECTURE.md#identifiers).

**Line 21**

`download_release.py --bundle CORE|FULL [--tag TAG] --output DIR` reads `--tag`, or the pin's tag when it is omitted, and accepts only `private-export-*` and `htw-db-*` tags. It decides the members an archive must hold from the asset's name first, then the tag (`expected_members`). The eight base members are `race_records.parquet`, `race_conditions.parquet`, `course_profiles.parquet`, `course_segments.parquet`, `sources.parquet`, `races_summary.json`, `MANIFEST.json` and `README.md`; FULL always adds `features.parquet`.

**Line 35**

Run from the repository root with Python 3.12 (as in CI) and `analysis/requirements.txt` (DuckDB 1.4.4, NumPy 2.5.3 and pandas 3.0.5, which the half builders use). The study/lookup and runner-context importers (`import_public_explorer.py`, `import_runner_context.py`, which run a Node verifier before replacing anything) and the verifiers need Node on `PATH`; the half source recount opens SQLite with `node:sqlite`, which the Half marathon workflow runs on Node 22. The commands are in [operations](../OPERATIONS.md), in this order; they read `TAG` from the pin (or from `export TAG=<new tag>` for a candidate) and set `IN`, `CORE`, `WORK`, `PREV` and `LIVE_AS_OF` as its [reproduce and audit](../OPERATIONS.md#reproduce-and-audit-the-current-input) section does:

**Lines 116–117**

- **The cohort on `feat/half-v4` (`master-20261103b`**, November 4, 2026, the same fields): raw 5,388,605 in 299 editions and 34 cities; duplicates removed 0; missing or unparsed 867,232; non-increasing 25,098; outside the bounds 12,469; timing-eligible 4,483,806; source-excluded 261,560 in 39 editions (`RULES_MASTER_20261103B`, policy SHA-256 `3a673c3a…92cd`); **eligible 4,222,246 finishes in 218 editions from 27 cities** ([refresh record](../REFRESH_20261103b.md)).

- **The adopted cohort on `main` (1050**, from `cohort` and `source_quality` in `public/data/runners/manifest.json`, the same in every pack): raw 5,327,504 in 298 editions and 34 cities; duplicates removed 0; missing or unparsed 882,266; non-increasing 25,098; outside the bounds 12,430; timing-eligible 4,407,710; source-excluded 298,961 in 41 editions (`RULES_1050`, policy SHA-256 `ba7749ee…2508`); **eligible 4,108,749 finishes in 215 editions from 27 cities**. Historical: 1652 had 4,027,044 timing-eligible, 155,277 excluded (30 editions) and 3,871,767 eligible (211 editions); 0934 had 3,595,426, 78,090 (11 editions) and 3,517,336. The full table is in [data architecture](../DATA_ARCHITECTURE.md#measurement-and-eligibility).

**Line 170**

The half pages read `public/data/half/`, built from the owner's public CC BY 4.0 release `half-dataset-20261030-1904` (its half snapshot and the producer's person IDs v4, `person-ids-v4-20261030-1150`), all pinned by SHA-256 in `half-release.json` (schema 3, measured and reviewed October 31, 2026, on the branch `feat/half-v4`; the first pin, `half-dataset-20261029-1202` with the overlay of `half-dataset-20261029-2157`, is what `main` and production serve until that branch merges). An edition is verified when it is stamped in the snapshot's own edition metadata and on the policy's reviewed list (the pin's `stamps.rule`); the 2157 `csv-edition_meta.csv.zst` stays pinned as the stamp reference, so a withdrawn stamp that returns fails the build. Each source's identity is its `key` (`half-dataset-20261030-1904`, `person-ids-v4-20261030-1150`), which the policy and the reviewed counts are keyed by; `private_tag` is provenance only. The pin's `marathon_release` must equal the tag in `release.json`. The pages publish aggregates only: every shown group holds at least 100 finishes or pairs, and a claim across editions rests on at least 3 editions. The first half work was merged to `main` by PR #85 (`a2c6e507`, October 30, 2026); deployed state is in the handoff's [Current state](../PROJECT_HANDOFF.md#current-state).

## autopilot/CONSTITUTION.md

Lines 15, 30, 132 of `autopilot/CONSTITUTION.md` at `de9f8c6f`.

**Line 15**

1. Never change `analysis/**`, `public/data/**`, the release pins (`analysis/release.json`, `analysis/weather-release.json`) or anything tied to the adopted release (the tag in `analysis/release.json`, currently `private-export-20261021-1050`) or to an earlier release such as `htw-db-2026-10-16-1652` or `private-export-20260912-0934`.

**Line 30**

4. Never show release tags or their dates in visible copy: `private-export`, `htw-db-`, `20260912`, `20261016` or `20261021`.

**Line 132**

At today's traffic, about 18 visits a day, only large effects can be detected, so prefer bold, well-reasoned changes over timid tweaks. Fix anything broken first.

## docs/ALL_FINISHER_ANALYSES.md

Lines 31 of `docs/ALL_FINISHER_ANALYSES.md` at `de9f8c6f`.

**Line 31**

On `feat/half-v4` (draft PR #89, not merged; November 5, 2026) the source is `master-20261103b`: **5,388,605 raw records** and **4,222,246 eligible finishes** across **218 editions** with eligible timings; the context's weather covers 217 of them (New York 2026 has no weather row) and terrain 203 ([refresh record](../REFRESH_20261103b.md)). On `main`, `private-export-20261021-1050` (adopted October 22, 2026) contains 5,327,504 raw records and 4,108,749 eligible finishes across 215 editions (1652, historical: 4,915,355, 3,871,767 and 211; 0934: 4,462,379, 3,517,336 and 196). All eligible finishes can contribute without any previous-result or identity-link requirement. Incomplete timings and reviewed held/selected-field editions remain excluded from aggregate outcomes. Their records remain searchable under the [runner lookup contract](../RUNNERS_AND_REPORT.md#runner-search).

## docs/ANALYSIS_CATALOG.md

Lines 7, 12, 18, 20, 26, 28, 739, 741, 837, 863, 865 of `docs/ANALYSIS_CATALOG.md` at `de9f8c6f`.

**Line 7**

Every calculated output below is rebuilt from the release adopted in [`analysis/release.json`](../../analysis/release.json) (`private-export-20261021-1050` on `main` since October 22, 2026, [1050 refresh record](../REFRESH_20261021_1050.md); `master-20261103b` on the branch `feat/half-v4`, draft PR #89, since November 4, 2026: 4,222,246 eligible finishes, 1,381,218 with exact age and 662,539 with a recent prior benchmark, the policy `RULES_MASTER_20261103B` excluding 261,560 timing-valid finishes in 39 editions, [refresh record](../REFRESH_20261103b.md); a master pack's `input_export_id` is the tag itself). Each pack's release, timestamps and reported n are in its `pack_meta.json` (`input_export_id`, `input_as_of`, `as_of`, `n`; the pack bundle id `private-20261021-1050` names release `private-export-20261021-1050`), and its methods below are that file's `methodology_prose`. Figures quoted elsewhere in this document carry their release; the published files are authoritative. The supporting study, runner search, runner context, fast-start modes and story data use the same input. Earlier releases' text is in [history](analysis-catalog-2026-10.md).

**Line 12**

- Three additional weather candidates are screened together by `build_weather.py`. Only ready candidates receive pages (the Warming and Wind tabs of race-day weather); all results remain in `public/data/weather/evidence.json`. Under 1050, warming and wind are ready (wind a precise null for typical wind speed) and humidity is withheld as too uncertain. See [WEATHER_ANALYSES.md](../WEATHER_ANALYSES.md).

**Line 18**

The personalized engine's counts are in `public/data/packs/ext_personalized_guide/summary.json` (`n`, `age_n`, `history_n`, `cities`). Under 1050 it has **4,108,749 eligible finishes**, including **1,288,687 with exact age** and **648,914 with a recent prior benchmark**, and keeps twelve paths, whole-minute targets 90–720 and 27 cities plus All courses. Missing age, valid history, historical route validity and start/proximity measurements still limit specific comparisons.

**Line 20**

The September 10 failed refresh and schema/archive incompatibilities are dated historical evidence. The runtime canonical join is enabled for the audited September 11 (1107), September 12 (0934), October 16 (1652) and October 21 (1050) releases, each after runtime checks (unique, set-equal IDs; zero label or timing mismatches, never taken from a release's own ID contract); release 0829 was audited and not adopted. See [ACCESS.md](../../analysis/ACCESS.md) and the [1050 refresh record](../REFRESH_20261021_1050.md).

**Line 26**

Then apply the release-specific [source-quality policy](../../analysis/source_quality.py) (`RULES_1050` for the adopted release). Under 1050, 41 reviewed invalid-grid, incomplete, held or selected-field editions exclude 298,961 otherwise timing-valid finishes, leaving 4,108,749 from 4,407,710 timing-eligible records (the runner manifest's `cohort` and `source_quality`). Excluded editions cannot supply earlier benchmarks. Missing age or recorded gender alone does not remove usable timing from All. Every output records policy/script hashes and edition counts.

**Line 28**

Extended calculations use retained raw IDs, supplied feature linkage and edition dates; course analyses also use course segments. Audited 1107, 0934, 1652 and 1050 raw/feature IDs join canonically only after runtime checks of unique matching sets and labels, then full-timing agreement. September 7 reproduction retains one-to-one edition/name/full-timing matching. Cross-race identities remain supplied candidates, screened for ambiguity, conflicting gender/birth year and duplicate editions. Recent best uses only the two strictly earlier calendar years, excluding all same-year results. See [data architecture](../DATA_ARCHITECTURE.md).

**Line 739**

**All eligible finishes** includes every eligible performance once: `analysis_n` in `all-finishers.json` (4,108,749 under 1050), including `eligible_without_prior_n` without a recent earlier benchmark (3,459,835). Compare the first 5 km pace with the same race's 5–20 km pace. No prior race, identity linkage or inferred ability is required. The main time outcome is actual time after 20 km minus the time that distance takes at the recorded 5–20 km pace, with its median and middle 80% shown separately from actual median finish. First-5 km and after-20 km mean differences add to the whole-race mean difference; the 5–20 km reference block contributes zero by definition. This is accounting against the 5–20 km pace, not avoidable minutes or a finish prediction.

**Line 741**

**Earlier-best comparison** keeps its original method: `history_n` finishes (648,914 under 1050) with a best eligible performance in the two strictly earlier calendar years, excluding current/same-year and invalid/held benchmark records. It compares first 10 km pace with the earlier best's full-marathon average. Screened supplied identity candidates are not independently verified people; names do not establish links. Only this mode requires history.

**Line 837**

`analysis/build_public_explorer.py` generates `public/data/study/evidence.json` from the adopted input with the same eligibility parser, source-quality policy and history join. Its methods and denominators replace the old live/core summaries. The current calculation evidence is in [the 1050 refresh record](../REFRESH_20261021_1050.md); earlier refreshes are in their own records ([1652](../REFRESH_20261016_1652.md), [0934](../REFRESH_20260912_0934.md)).

**Line 863**

The [runner-context extension](../RUNNER_CONTEXT_AND_PEERS.md) adds same-edition finish placement for All, recorded gender, exact-age band and combined groups, plus 15-minute achieved-time pacing quartiles. These groups use the same eligible finishes (4,108,749 under 1050) and require 101 observations. Finish percentiles exclude the selected record, with other ties receiving half weight; group medians and pace quartiles include it. Higher percentile means a faster recorded finish among eligible database peers, not official standing. Selected-race section differences are descriptive elapsed-time comparisons.

**Line 865**

Its separate context output, one shard per raw edition (298 under 1050), is bound to the exact runner manifest. Under 1050 (`totals` in the context manifest) weather covers 298 of 298 editions and elevation 281, and elevation remains an unverified historical-route proxy. Whole-profile and section elevation measurements are retained separately. This adds contextual views, not a causal weather/elevation model, new identity linkage, extra independent studies, or a validated finish-time adjustment. Builders, gap details and independent verification are in [RUNNER_CONTEXT_AND_PEERS.md](../RUNNER_CONTEXT_AND_PEERS.md).

## docs/ANALYTICS.md

Lines 169, 172 of `docs/ANALYTICS.md` at `de9f8c6f`.

**Line 169**

- **S6** the visit signals as sent: Instagram tags (allowed, and junk values, which send nothing; the address loses every `utm_*`), each home section once in page order (since October 16, 2026: hero, paths, stakes, guide, steps, stories, cta, and no `chapter-*`; on `feat/redesign` since October 17: hero, paths, stakes, guide, cta), `units_changed` only on a change, reading figures and `$pageleave` (a story read to the end, then the header logo to the longer home page, still reports ≥ 0.9 under the story's path; a second story left with a full load sends a `$pageleave` naming it, and the metrics' "story read to the end" signal counts both stories once each), one feedback answer and reason per page view, `tool_used` (`edit` once per page view, `copy_link`, `print`; the course chooser's list filters are one edit; the projector's "Full result ↓" and the pace band's print button are not edits, and since October 15, 2026 neither is following the predictor's "Turn this into a pace band", on the predictor or on the pace band it opens), the planner's Splits choice (`planner splits choice`; since October 23, 2026, on branch `feat/terrain-splits`: New York 5:15 opens on Terrain, pressing Even pace is the page's one `edit`, and the copied link then carries exactly `course`, `goal`, `pace=even` and `units`; since October 29, 2026 a second visitor presses Terrain while it is already on, scrolls on and partway back and changes the course to Berlin, and the course select must stay where it was on screen; from October 20 the same case on Berlin 3:30 in course shape), the terrain splits' figures (`terrain figures`, which replaced the October 20 `course shape figures`:

**Line 172**

  On `feat/redesign` (October 17, 2026, not yet on main or the live site) a course page's replay fetches its rows only once it is within a screen of the viewport, so the Boston case scrolls to `#replay` first. The race report (October 16, 2026; since October 18 on `feat/redesign`, Save image, Share… and Copy link are pressed in the sheet its Share button opens, which is closed for the print): its section once, Save image one `report_exported` `image`, a cancelled share nothing and a completed one `share`, Print a `print` and Copy link a `copy_link` (no edit), an image the browser cannot encode one `site_error` `export` with its message, the copied link exactly `s` and `course`, and nothing recorded.

## docs/AUTOPILOT.md

Lines 87, 165, 170, 172–175, 177, 187, 192 of `docs/AUTOPILOT.md` at `de9f8c6f`.

**Line 87**

- **An added line breaks a copy rule**: the banned words and phrases in constitution §3 ("the wall clock" is fine), and the release identifiers that never appear in visible copy (the tag, not the `private-export-` prefix the data loaders use to check a release).

**Line 165**

Checked on November 9, 2026. A scheduled run can only work when all of these hold:

**Line 170**

4. **The labels exist.** Every real run of the merge workflow's gate job creates any of the six that the repository lacks (`autopilot`, `autopilot:paused`, `autopilot:needs-owner`, `do-not-merge`, `autopilot-incident`, `autopilot-log`). On November 9, 2026 only `autopilot-log` and `autopilot:paused` existed, so the first real gate run after this change reaches `main` creates the other four. The open "Autopilot log" issue is #59, labelled `autopilot-log`.

**Lines 172–175**

6. **The owner lifts the pause.** `autopilot:paused` has been on #59 since 2026-10-15T21:28:44Z, set while the StoryBrand redesign was built. Before removing it, the owner:

   - merges the pull request of November 9, 2026 that repaired the autopilot (whether it has merged is in the [project handoff](../PROJECT_HANDOFF.md#current-state)). It adds the `@v2` definitions to `autopilot/metrics.md`, the label creation and the ready wait. Until it is on `main`, a run reads `main`'s earlier skill and metrics, and the merge workflow runs `main`'s earlier script;

   - decides how the error guardrail is judged while it is past its threshold. `error_visit_rate@v1` asks for 1% or less and stood at 12 of 582 visits (2.06%) in the 28 days to November 8, 2026 ([measured](../AUTOPILOT.md#measured-on-november-9-2026)). Either the part of its rule that an entry names in advance decides (the skill's step 5.3: "must not double"), or the owner adds an `error_visit_rate@v2` to `autopilot/metrics.md`;

   - adds `report` to PostHog's recording URL blocklist (the site already never records `/report`; [record](handoff-2026-10-14-to-17.md#storybrand-series-what-is-live-and-what-is-open-october-16-2026)).

**Line 177**

   The order matters: merge first, then lift the pause.

**Line 187**

- **A cold start.** The test ran about 19 minutes after the session was last active. The first scheduled run (Thursday, November 12, 2026, 12:56 UTC) is the first to wake it after days, and the machine may be new by then; the prompt covers a missing checkout.

**Line 192**

- **The skill on `main`.** Until the pull request of November 9, 2026 is on `main`, a run reads `main`'s earlier skill. That skill calls PostHog's tool `mcp__PostHog__exec`, and the standing session lists PostHog's server by an id; its step 0 has no branch for a checkout that is already there. The prompt says how to find the tools and what to do when the checkout is already there.

## docs/DATA_ARCHITECTURE.md

Lines 3, 5, 22, 36, 42, 44, 75, 79, 132–133 of `docs/DATA_ARCHITECTURE.md` at `de9f8c6f`.

**Line 3**

How race data reaches the site: where each input lives, which identifiers name it, what counts as an eligible finish, how records join across files and races, and which overlays (weather, course profiles, the half-marathon source) are attached. Counts below name their release. The current refresh record is [REFRESH_20261021_1050.md](../REFRESH_20261021_1050.md); what is deployed is in the [project handoff](../PROJECT_HANDOFF.md#current-state).

**Line 5**

**Branch `feat/half-v4` (draft PR #89, not merged; November 5, 2026): `master-20261103b`**, a combined results release read through `analysis/adapt_master.py`, with weather and routes from `dataset-20261103-0706` (5,388,605 marathon records in CORE, 4,222,246 eligible finishes in 218 editions; [refresh record](../REFRESH_20261103b.md)). **On `main`: `private-export-20261021-1050`** (repository `koolkam00/pace-notes`; manifest created `2026-10-21T15:02:30Z`). Both [analysis/release.json](../../analysis/release.json) and [analysis/weather-release.json](../../analysis/weather-release.json) name it in `tag`. It was adopted in PR #78, merged to `main` as `39f3057` on October 22, 2026 and live the same day ([refresh record](../REFRESH_20261021_1050.md#deployed-october-22)); what production's `/data/live.json` names now is checked, with its date, in the handoff's [Current state](../PROJECT_HANDOFF.md#current-state). Earlier sources are in the [release history](../DATA_ARCHITECTURE.md#release-history).

**Line 22**

| Half input | [half-release.json](../../analysis/half-release.json) | Separate pin (schema 3) of the owner's public half release `half-dataset-20261030-1904` (CC BY 4.0: the snapshot of October 30, 2026, 19:04 ET, and the producer's person IDs v4 `person-ids-v4-20261030-1150`, each identity named as `key`, with the person-ID build's coverage and the links extract's content digest), the stamp reference of `half-dataset-20261029-2157` (`stamps.reference`, by sha256), the reviewed half policy and the marathon release they bind ([half marathons](../HALF_MARATHON.md)). On the branch `feat/half-v4` (October 31, 2026, not merged); `main` still pins schema 2 (`half-dataset-20261029-1202` with the overlay `metadata_correction`) |

**Line 36**

| `private-YYYYMMDD-HHMM` | The packs' bundle ID (`input_export_id`): `build_pacing.py` changes `private-export-` to `private-`, and an `htw-db-*` tag stays as it is | The pack and personalized ZIPs | `--expected-export` of `import_packs.py` and `import_personalized.py` ([operations](../OPERATIONS.md#validate-import-and-publish)) |

**Line 42**

```text
## Verified input (current: private-export-20261021-1050)
```

**Line 44**

Measured on October 21, 2026 by `analysis/audit_release.py` against `htw-db-2026-10-16-1652` ([release contract](../evidence/2026-10-21/release-1050/release-contract.json); [refresh record](../REFRESH_20261021_1050.md#verified-source)). CORE has 17 members and FULL 18; the 17 shared members are byte-identical, and all 17 lines of `SHA256SUMS.txt` match. FULL's two parts are joined and the joined archive's SHA-256 must be listed in `RELEASE-SHA256SUMS-20261021-1050.txt`. The raw and feature tables each hold **5,327,504 rows** in **34 cities and 298 city/year editions**; 5,241,428 have a 5 km split. `EDITIONS.json` has 299 rows, the virtual Amsterdam 2020 marked excluded, and agrees with the parquet and `races_summary.json` edition by edition. There are 299 weather rows (the 298 editions and Amsterdam 2020) and 33 supplied course profiles; `course_profiles.parquet` is byte-identical to 1652's. Against 1652 the raw records add 412,943, delete 794 (Amsterdam 2020) and change none in place.

**Line 75**

The feature and analysis populations differ by design. Missing recorded gender does not invalidate usable timing. Of the 4,108,749 final eligible finishes in 1050, 2,689,659 are recorded men, 1,400,937 recorded women and 18,153 other or not recorded, all of which stay in All; 1,288,687 have an exact age (`cohort` in [the stories manifest](../../public/data/insights/manifest.json); the personalized summary gives the same exact-age count). Raw age is null in 3,675,869 records. Never treat an age-group label as an exact age. The 1652 and 0934 figures are in [history](../DATA_ARCHITECTURE.md#history-earlier-releases).

**Line 79**

The audited canonical record join (`CANONICAL_ID_RELEASES` in `analysis/build_extended.py`: 1107, 0934, 1652 and 1050) checks unique matching IDs and labels at runtime, then agrees on finish and all nine section durations rounded to milliseconds. 0829 was audited but not adopted and is not in that set. Legacy September 7 reproduction retains a one-to-one edition/name/full-timing match because its numeric ID namespaces are incompatible. Never join by row position or apply a newer release contract retroactively.

**Lines 132–133**

| `private-export-20261021-1050` | October 21 | 5,327,504 | 298 | 4,108,749 | Adopted (PR #78, merged October 22); current on `main` | [1050 record](../REFRESH_20261021_1050.md) |

| `master-20261103b` | November 3 | 5,388,605 (CORE) | 299 | 4,222,246 | Adopted on `feat/half-v4` (draft PR #89), not merged; through `analysis/adapt_master.py`, overlays from `dataset-20261103-0706` | [master record](../REFRESH_20261103b.md) |

## docs/FAST_START_ANALYSIS.md

Lines 3, 15, 17, 131 of `docs/FAST_START_ANALYSIS.md` at `de9f8c6f`.

**Line 3**

Rank 2, `/analyses/starting-pace`, has two comparison modes: **All eligible finishes** (the default) and **Earlier-best comparison**. The earlier-best mode was implemented September 17, 2026, with nine Python tests and independent source-data verification (PR #41, merged September 17, 2026 as `e4fd7e45`); the all-eligible-finishes mode was added after it. Both outputs are rebuilt at every runner-lookup refresh. The current ones bind `private-export-20261021-1050` ([current outputs](../FAST_START_ANALYSIS.md#outputs-under-1050)); the deployed state is in the [project handoff](../PROJECT_HANDOFF.md#current-state).

**Line 15**

```text
## Current outputs (1050)
```

**Line 17**

On `feat/half-v4` (draft PR #89) both were rebuilt on November 4, 2026 from the `master-20261103b` lookup (`runner_manifest_sha256` `8f593e05…`, 7,886 shards): 5,388,605 raw records, 4,222,246 eligible finishes and 4,257,513 candidate profiles; 662,539 have the earlier benchmark and 3,559,707 do not; 305 all-eligible filter combinations with 1,579 groups and 593 earlier-best combinations with 2,906 ([record](../REFRESH_20261103b.md)). On `main`, both outputs were rebuilt on October 21, 2026 from the 1050 runner lookup: `release_tag` `private-export-20261021-1050`, `runner_manifest_sha256` `cd2c99d7…` (7,885 shards). They cover 5,327,504 raw records, 4,108,749 eligible finishes and 4,196,334 candidate profiles; 648,914 finishes have the required earlier benchmark (`history_n`) and 3,459,835 do not (`eligible_without_prior_n`). Both record `engine` NumPy 2.5.3.

**Line 131**

Under 1050 both verifiers passed on the local build of October 21, 2026 ([calculation log](../evidence/2026-10-21/release-1050/calculation-log.txt)) and in CI ([above](../FAST_START_ANALYSIS.md#outputs-under-1050)).

## docs/HALF_MARATHON.md

Lines 12–13, 148 of `docs/HALF_MARATHON.md` at `de9f8c6f`.

**Lines 12–13**

- **Repository state.** Merged: `feat/half-v4` landed on `main` as `b35789b8` (#89, squash-merged 2026-11-05 07:59 UTC). The distance label (owner decision of November 5, 2026) is on `feat/cross-distance-label`, not merged. The move of the half snapshot to `dataset-20261103-0706` is still deferred (owner item 14 in the [project handoff](../PROJECT_HANDOFF.md#open-for-the-owner)). `npm run verify:data` runs `verify-half` and the half card check.

- **Deployed state.** Production serves this build: `/version.json` named `b35789b8` (`main`, built 2026-11-05T08:00:13Z) and `/data/half/manifest.json` named `half-dataset-20261030-1904` with set B's 58,597 pairs, both read 2026-11-05 at 08:00 and again at 13:20 UTC. The distance label is not deployed. Read `/version.json` again before calling any later build live.

**Line 148**

The first pin is `main`'s build (the 1133 snapshot, runner links v1 and the 2157 correction); this build is `feat/half-v4`'s. No rule, list, member, clause, floor or guard was changed after a v4 value was read.

## docs/KNOWN_ISSUES.md

Lines 7, 25, 27, 29, 39 of `docs/KNOWN_ISSUES.md` at `de9f8c6f`.

**Line 7**

Updated October 30, 2026; source line November 5, 2026. The source on `main` and in production is `private-export-20261021-1050` (PR #78, merged as `39f3057` and live since October 22, 2026); the branch `feat/half-v4` (draft PR #89) adopts `master-20261103b` ([record](../REFRESH_20261103b.md)), whose rows here are not re-measured unless they say so. The [current refresh record](../REFRESH_20261021_1050.md) separates source, calculation, import and production evidence; the [1652 record](../REFRESH_20261016_1652.md), the [0934 record](../REFRESH_20260912_0934.md) and the other implementation records remain dated historical evidence. **Measured in** names the release or source each row's evidence comes from: a row measured in an earlier release was not re-measured unless it says so. Site issues are in [their own table](../KNOWN_ISSUES.md#site).

**Line 25**

| P1 | Candidate runner identities are not verified people | Every release | Canonical raw/feature alignment is verified; cross-race runner IDs still need ambiguity/conflict checks. In 1050 the producer's `runner_id` covered 4,653,487 records (3,522,317 candidate runners); 29,265 ambiguous records got none. Since November 5, 2026 (`feat/person-id-identity`) the key is the master `person_id`: 4,682,281 keyed records in 2,925,580 links, New York 2026's 32,703 from a preliminary build marked "Preliminary link" ([refresh record](../REFRESH_20261103b.md#marathon-identity-person_id-november-5-2026)) | Retain candidate-identity terminology and earlier-only recomputation; do not use supplied current-inclusive PB/ability as pre-race inputs |

**Line 27**

| Resolved (1050) | Legacy visible analyses used older inputs | 1050 | Current readers use the current release's supporting study and extensions (1050 since October 22, 2026); legacy raw assets are removed from active website publication | Done; CI and production evidence are in the [1050 refresh record](../REFRESH_20261021_1050.md#deployed-october-22) |

**Line 29**

| Calculated, imported, verified and live (1050) | Runner peer and environmental context | 1050 | Same eligible finishes as every analysis (4,108,749 in 1050; 3,871,767 in 1652; 3,517,336 under 0934); exact runner-manifest binding, full finish-distribution recount and independent pacing samples are required | See the current refresh record for calculation, import and production evidence |

**Line 39**

| Owner or lead decision (October 30, 2026; re-measured on the v4 build, October 31, 2026, branch `feat/half-v4`, not merged) | The half story's verified-halves weighting | `half-dataset-20261030-1904` with the person IDs v4; `half-snapshot-20261029-1133` with the 2157 metadata (live) for comparison | On the v4 build 4,598 of the 58,497 half-and-marathon pairs (7.9%) have a verified half. The member now passes as a whole (+19.1 minutes over double against +21.8 pooled, 163.5 s apart; bar 180 s), but 2 of its 143 pre-registered one-edition reruns do not (without Berlin 2017 or Berlin 2015, 186 and 185 s from the pooled minutes), so the story still states no reading and its figure, and chapter 11's, is the count of pairs ([the half marathon](../HALF_MARATHON.md#what-is-published)). Live (first pin): 2,024 of 23,929 pairs (8.5%), +16.3 against +20.9 minutes, the guard failing on the member itself | Decide whether the member stays in the battery; never loosen the 3-minute bar or drop a rerun to bring the headline back |

## docs/OPERATIONS.md

Lines 40, 58, 164, 175, 244, 254, 313 of `docs/OPERATIONS.md` at `de9f8c6f`.

**Line 40**

- `npx tsc --noEmit -p .` (there is no `typecheck` script).

**Line 58**

No script or CI job checks the documents' links yet (a CI check awaits the owner: [handoff](../PROJECT_HANDOFF.md#open-for-the-owner), item 12). Run this from the repository root; it reads every tracked Markdown file, resolves each relative link and each `#anchor` the way GitHub writes heading anchors, skips fenced code, and exits 1 on any broken link:

**Line 164**

9. **Sweep the documents for the previous release.** Use `git grep -n -E "<previous tag>|<its headline counts>" -- '*.md' ':!docs/history' ':!docs/REFRESH_*' ':!docs/evidence'`, then update each hit or label it with its release. PR #78 (1050) updated eleven existing documents and added two refresh records. On October 30, 2026, six it did not touch (STORIES, TOOLS, TOP_TEN_ANALYSES, ANALYSIS_CATALOG, WEBSITE_ARCHITECTURE and SEO) still named the 1652 tag or its eligible count.

**Line 175**

- Owner-only: the current tag in `autopilot/CONSTITUTION.md` §2.1, its release dates in §3.4 and `BANNED` in `scripts/autopilot-guard.cjs`. PR #78 edited the constitution for 1050; propose such changes to the owner as the handoff's [Open for the owner](../PROJECT_HANDOFF.md#open-for-the-owner) item 13 does.

**Line 244**

Use [analysis/README.md](../../analysis/README.md) for the complete calculation and import contracts. The adopted source is the tag in `analysis/release.json` (repository `koolkam00/pace-notes`). On `main` that is **`private-export-20261021-1050`**, prepared on October 21, 2026 and merged as PR #78 (`39f3057`) on October 22, 2026; on the branch `feat/half-v4` (draft PR #89, November 4–5, 2026) it is **`master-20261103b`** ([refresh](../REFRESH_20261103b.md)). What production serves is recorded in the [project handoff](../PROJECT_HANDOFF.md). The [current refresh](../REFRESH_20261021_1050.md) records source, calculation and import evidence; the [1652 refresh](../REFRESH_20261016_1652.md) keeps its own. The release before it, `private-export-20261021-0829`, was verified and reviewed but **not adopted** (its FULL file lacked the producer's runner identities; [review](../REFRESH_20261021_0829.md)); the [0934 refresh](../REFRESH_20260912_0934.md) keeps its own; earlier feature updates have their own dated records; a prior deployment does not certify a later change.

**Line 254**

Run from the repository root with Python 3.12 and fresh output directories. The commands here and in the next two sections use `TAG`, which defaults to the pin's tag. For a candidate release, `export TAG=<new tag>` first ([release intake](../OPERATIONS.md#release-intake) step 5): the pins change only when the release is adopted (step 8). `PREV` is the input folder of the previously adopted release, downloaded the same way (1050 was audited against `htw-db-2026-10-16-1652`). `LIVE_AS_OF` is the current compatibility-metadata timestamp, read from the live site as the pacing workflow does; it is context, not the source release.

**Line 313**

Every active analysis must now use the same adopted release. The supporting-study and runner importer replaces only `public/data/study`, `public/data/runners` and current `live.json` compatibility metadata. It validates every shard, every record and every eligible timing that the runner manifest counts (`raw_records` and `eligible_records` in `public/data/runners/manifest.json`: 5,327,504 and 4,108,749 under 1050), name-index membership and calculation/source hashes before import. Historical S/R/RN/P numerical files remain in Git history, outside deployed output. The source pin alone never certifies a refresh.

## docs/OWNER_DECISIONS.md

Lines 15, 35, 63–69 of `docs/OWNER_DECISIONS.md` at `de9f8c6f`.

**Line 15**

| 2026-10-15 | Autopilot paused. **No owner quote is recorded.** The autopilot setup session (Claude Code) added the `autopilot:paused` label to issue #59 at 21:28:44 UTC and commented at 21:28:53 UTC, both on the owner's account through the Claude GitHub app (`performed_via_github_app`: `claude`; read through GitHub REST on 2026-10-30). The comment's words are the session's, not the owner's: "Paused while the StoryBrand redesign is built." and "The label comes off once the redesign PRs have merged and the live site is checked." Whether the owner asked for the pause, or for that condition to lift it, is not recorded. | — (the redesign merged on 2026-10-20; the label is still on, see the handoff) | The `autopilot:paused` label: the skill stops a run, and `scripts/autopilot-merge.cjs` blocks every merge, while any open issue carries it | [issue #59](https://github.com/koolkam00/pace-notes/issues/59), the setup session's comment of 2026-10-15 21:28 UTC |

**Line 35**

| 2026-11-04 | New data: "I just uploaded new data can you make sure all the analyses and site are full updated as well" (the owner's request of November 4, 2026, UTC, verbatim). Read as adopting `master-20261103b`, the newest release, for every analysis and page. How it is adopted is the lead's **Default** (listed under [Defaults](../OWNER_DECISIONS.md#defaults-not-owner-decisions)), not an owner decision; earlier words still apply: "publish everything and full merge" (October 30) and "Yes you should adopt v4" (October 31). | Supersedes `private-export-20261021-1050` as the adopted release, on `feat/half-v4` (not merged) | `analysis/release.json`; `analysis/source_quality.py` (`RULES_MASTER_20261103B`) | [refresh record](../REFRESH_20261103b.md) |

**Lines 63–69**

| 2026-11-04 | Adopting `master-20261103b` (the lead's decisions of November 4, 2026): Source: `master-20261103b` through the adapter `analysis/adapt_master.py`; weather, routes and edition metadata from `dataset-20261103-0706`, pinned by sha (1050's bytes kept where the content is proven equal); the adapter's own documents labelled as adapter outputs. A producer ask for a `pace-notes-*` export of this snapshot is recorded; it does not block | every analysis and page, on `feat/half-v4` | [refresh record](../REFRESH_20261103b.md) |

| 2026-11-04 | Adopting `master-20261103b` (the lead's decisions of November 4, 2026): Edition policy `RULES_MASTER_20261103B`: `RULES_1050` carried forward, the producer-HOLD reasons reworded to its current partial or unverified status; New York 2026 released (stamped, −0.14% against NYRR's provisional count; passes the timing screens); New York 2008 and Amsterdam 2023 released (now complete against an official count, and pass the screens); Amsterdam 2020 stays out (virtual); London 2025 and 2026 stay in under the owner's "Keep London 2025–26" | every analysis and page, on `feat/half-v4` | [refresh record](../REFRESH_20261103b.md) |

| 2026-11-04 | Adopting `master-20261103b` (the lead's decisions of November 4, 2026): New York 2026 identity: it has no v1 `runner_id`, so it is included without cross-race links and adds no earlier-best benchmark or cross-year pair; v4 `person_id` is never mixed in. A producer ask covers v1 ids for it **Superseded 2026-11-05** by the owner's decision ([decisions](../OWNER_DECISIONS.md#decisions)): New York 2026 links through its preliminary `person_id`s, labelled. | every analysis and page, on `feat/half-v4` | [refresh record](../REFRESH_20261103b.md) |

| 2026-11-04 | Adopting `master-20261103b` (the lead's decisions of November 4, 2026): Weather: New York 2026 has no weather row; the weather analyses leave it out, its "no weather" state shows, and nothing is filled in. The weather pin names the same tag | every analysis and page, on `feat/half-v4` | [refresh record](../REFRESH_20261103b.md) |

| 2026-11-04 | Adopting `master-20261103b` (the lead's decisions of November 4, 2026): Half: the half's `marathon_release` names the new tag; v4 stays the person-ID build with its coverage boundary, and the rule-L link rule, the guards, the pre-registered rule-G checks and every floor are unchanged. The default also moves the half snapshot to `dataset-20261103-0706` with a new reviewed policy (NYC Half 2024 and 2025 out as internal-only, 2016 and 2022 partial loads); that move is **deferred** (not yet taken) and the half stays on `half-dataset-20261030-1904` | every analysis and page, on `feat/half-v4` | [refresh record](../REFRESH_20261103b.md) |

| 2026-11-04 | Adopting `master-20261103b` (the lead's decisions of November 4, 2026): Owner-only files (`autopilot/CONSTITUTION.md`, `scripts/autopilot-guard.cjs`) are not edited; the pull request proposes the change | every analysis and page, on `feat/half-v4` | [refresh record](../REFRESH_20261103b.md) |

| 2026-11-04 | Adopting `master-20261103b` (the lead's decisions of November 4, 2026): Halves and marathons are never mixed in one statistic; the half-to-marathon pairs stay, because the owner asked on 2026-10-29 for takeaways from the combined data **Answered 2026-11-05** by the owner: keep the pairs, each labelled a comparison between distances ([decisions](../OWNER_DECISIONS.md#decisions)). | every analysis and page, on `feat/half-v4` | [refresh record](../REFRESH_20261103b.md) |

## docs/PROJECT_HANDOFF.md

Lines 7, 11–16, 18–20, 24, 28–31, 33–34, 36–38, 40–42, 63, 65, 69, 71, 74–80, 94, 97, 102–107 of `docs/PROJECT_HANDOFF.md` at `de9f8c6f`.

**Line 7**

**Checked 2026-11-11, 01:20 UTC**, after #92 merged. Keep four facts apart: release notes, measured results, repository state and deployed state. Never write "live" for anything without reading `/version.json` again. After a merge that changes a page, data, a contract or a workflow, replace this block, with its date, in the next pull request ([AGENTS.md](../../AGENTS.md) rule 19). The block checked on 2026-11-10 at 22:19 UTC, after #91 merged, is in [history](handoff-2026-11-10-current-state-before-92-merged.md); the one before it, checked on 2026-11-05 at 19:00 UTC, is in [history](autopilot-2026-11-09.md), under "Project handoff: Current state".

**Lines 11–16**

| `main` | `dc89b65c`, "Autopilot repair: @v2 metrics, standing-session run, ready wait and labels (#92)", squash-merged 2026-11-11 01:17 UTC | `git ls-remote origin refs/heads/main` (01:20 UTC) |

| Production | `dc89b65c`, built 2026-11-11T01:19:07Z | `curl -s https://splithappens.run/version.json` (01:20 UTC) |

| Production data | `release_tag` `master-20261103b` (`as_of` 2026-11-05T16:39:47Z), 4,222,246 eligible finishes; the same bytes as `public/data/live.json` at `dc89b65c` | `curl -s https://splithappens.run/data/live.json` (01:20 UTC), its sha256 compared with the commit's file |

| Releases | unchanged from the [13:20 block](handoff-2026-11-05-current-state-before-person-id.md) | not re-read |

| Open pull requests | #93 (the site review's fixes and its record, `claude/site-review-fixes`, this branch), #77, #49, #29 | GitHub: #93 read 2026-11-11; #77, #49 and #29 as read 2026-11-10 at 22:19 UTC, not re-read |

| Autopilot | Paused: issue #59 is open and carries `autopilot:paused` (as read 2026-11-10 at 22:19 UTC; the merge of #92 does not lift it). The scheduled task was replaced on November 9, 2026, and its test run posted "Run skipped: paused by #59" on #59 at 21:53 UTC that day ([autopilot](../AUTOPILOT.md#setup-and-prerequisites)) | GitHub, issue #59 and its comments (22:19 UTC); the task as read on 2026-11-09 |

**Lines 18–20**

- **The site review's fixes and its record** (pull request #93, `claude/site-review-fixes`, this branch): not merged when this block was written, so none of it is on `main` or in production. It holds the SEO fixes (the old host's root redirect, counted labels, elevation named only where a page prints it, Article markup; [SEO](../SEO.md)), the chart bands' strength (`verify-css` rule 11; [design system](../DESIGN_SYSTEM.md)) and the review of November 9 and 10, 2026 ([record](../evidence/2026-11-09/site-review/REVIEW.md)). The old host's root redirect can be proved only after a deploy: run `npm run verify:seo:live` then.

- **The autopilot repair**: merged as #92 (`dc89b65c`, squash-merged 2026-11-11 01:17 UTC; owner, about 01:16 UTC: "Merge all") and live, since production serves that commit (checked above). `main` now holds the `@v2` definitions for five metrics in `autopilot/metrics.md` (in force since this merge), the skill for a run in one standing session, the merge workflow's one wait for a pull request's ready time and its creation of the autopilot labels the repository lacks. Its checks (`verify`, `privacy-e2e`, `autopilot-guard` and Vercel's preview) passed at its head commit `a75d6b74`, the last at 22:54 UTC on November 10, 2026. Outside the repository, the scheduled task was replaced on November 9, 2026. The autopilot stays paused until the owner lifts the pause, and no full run has happened yet. Setup, the test run and what it does not show: [autopilot](../AUTOPILOT.md#setup-and-prerequisites); the baseline measured that day: [measured](../AUTOPILOT.md#measured-on-november-9-2026).

- **The marathon's cross-race identity on `person_id`** (owner, 2026-11-05: "Everywhere (Recommended)" and, for New York 2026, "Use them, labelled"): merged as #91 (`068b6c37`, squash-merged 2026-11-05 20:22 UTC; owner, about 20:21 UTC: "Merge as is (Recommended)") and live, since production serves that commit (checked above). Every history-based output is rebuilt on the producer's `person_id` (adapter version 2); New York 2026's preliminary links are used and marked "Preliminary link" in the runner search. Profiles 4,257,513 → 3,631,904, earlier-year benchmarks 662,539 → 986,580, three Top 100 guards re-judged ([refresh record](../REFRESH_20261103b.md#marathon-identity-person_id-november-5-2026)).

**Line 24**

- **Anonymous access** (2026-11-05, 06:20 UTC): every asset of `master-20261103b` and `dataset-20261103-0706` answered a no-token ranged GET with 206 ([analysis/ACCESS.md](../../analysis/ACCESS.md)).

**Lines 28–31**

1. **Autopilot.** Paused. The scheduled task was replaced on November 9, 2026: it now wakes one standing session, which has the repository and the GitHub and PostHog tools (a push from that session is still untested), and its test run posted "Run skipped: paused by #59" on the log issue ([setup and prerequisites](../AUTOPILOT.md#setup-and-prerequisites)). Before removing `autopilot:paused` from issue #59, in this order: merge pull request #92 (its state is in [Current state](../PROJECT_HANDOFF.md#current-state)), which adds the `@v2` definitions to `autopilot/metrics.md`, the label creation and the ready wait (until it is on `main`, a run reads `main`'s earlier skill and metrics); decide how the error guardrail is judged while it is past its threshold, since `error_visit_rate@v1` asks for 1% or less and stood at 12 of 582 visits (2.06%) over 2026-10-12..2026-11-08: by the part of its rule an entry names in advance (the skill's step 5.3, "must not double") or by an `error_visit_rate@v2` you add to `autopilot/metrics.md`; and add `report` to the PostHog recording URL blocklist if it is not there yet ([analytics](../ANALYTICS.md), configuration step 2; not verified here). Also delete the branch `autopilot/2026-11-09-push-probe`, which a push test left behind (the session was refused its deletion), and do not archive or delete the standing session while its task is on ([optional hardening](../AUTOPILOT.md#optional-hardening-owner-steps)).

2. **Half marathons.** **Decided November 5, 2026:** the owner keeps the half-to-marathon pairs, each labelled "a comparison between distances", and no statistic pools halves and marathons ([register](../OWNER_DECISIONS.md)). Still open: the 1904 README says finish-time-only races are "a separate, marked tier … Do not pool them with split-bearing races.": confirm that pooling finish times only, as the half pages do, is fine (default: proceed as today). Decide whether the v4 person IDs should also replace the marathon release's cross-race identity elsewhere (default: no; New York 2026's preliminary person IDs are not used either). Each default is in the [register](../OWNER_DECISIONS.md#defaults-not-owner-decisions). Decide whether the verified-halves weighting stays in the half story's battery ([known issues](../KNOWN_ISSUES.md)). Q3–Q12, Q14 and Q15 stand at the build's defaults ([half marathon](../HALF_MARATHON.md#owner-questions)); the build specification they cite is not in the repository. The half binds the adopted marathon release, so adopting a new marathon release needs a new person-ID build from the producer first ([release intake](../OPERATIONS.md#release-intake)): decide whether an adoption waits for it or the half pages are withdrawn meanwhile (no decision is recorded). The superseded wording is in [history](handoff-2026-11-05-current-state-before-89.md).

3. **Pull request #77** (release 0829, not adopted, draft since October 21): close it or keep it. #49 and #29 have been open since September.

4. **Licences.** The repository has no licence file (GitHub reports none), while the data releases are CC BY 4.0: choose the licences for the code and the site.

**Lines 33–34**

6. **Course naming.** The course data still name a race "Washington Marathon", which may be the Marine Corps Marathon ([history: search optimisation, October 2026](handoff-2026-09-to-10-13.md#search-optimisation-october-2026)).

7. **Top 100 charts.** Read the hundred cards before posting them; they publish under your name ([history](handoff-2026-10-20-to-30.md#top-100-charts-a-section-of-its-own-october-23-2026)).

**Lines 36–38**

9. **Release 1050 questions:** London's era comparison and the thin-course goal sections ([1050 refresh](../REFRESH_20261021_1050.md#open-for-the-owner-and-the-producer)).

10. **Orientation measure.** Twenty-eight days after the October 22 deploy, compare home → `/about` or `/methodology` and one-page home visits with the 28 days before, after turning analytics off on your own devices at `/privacy` ([history](handoff-2026-10-20-to-30.md#orientation-what-pace-notes-is-where-to-start-and-how-it-is-made-october-22-2026)).

11. **Branches.** Branches are kept after a merge (`delete_branch_on_merge` is false; 56 remote branches on October 30). `feat/redesign` and `rd/*` held the only copy of the redesign spec until this documentation pass restored it to [docs/history](redesign-2026-10/DESIGN-SPEC.md).

**Lines 40–42**

13. **Files only you edit.** Proposed for `autopilot/CONSTITUTION.md`: add the half tags (`half-dataset-`, `half-snapshot-`, `runner-links-`) and their date `20261029` to §3.4 and to the guard's `BANNED` list; name `analysis/half-release.json` among the pins in §2.1; consider protecting the contract and refresh documents in §6; date "about 18 visits a day" in §7. For `autopilot/metrics.md`: label the registry example (`home-hero`, `started: '2026-10-19'`) as an example; `lib/experiments.ts` holds no experiment.

14. **Release `master-20261103b`** (merged as #89, live; [refresh record](../REFRESH_20261103b.md)): the lead adopted it with the defaults listed in the [register](../OWNER_DECISIONS.md#defaults-not-owner-decisions); overturn any of them. In particular: New York 2026 is released without cross-race links (its count is NYRR's provisional one; it has no weather row and no `race_date`; it has no v1 `runner_id`, and its preliminary `person_id`s, which the owner calls less reliable, are not used); New York 2008 and Amsterdam 2023 are released; the half keeps its snapshot `half-dataset-20261030-1904`, and its move to `dataset-20261103-0706` (NYC Half 2024 and 2025 out, 2016 and 2022 partial loads) waits for a policy review that, on the release's own evidence, changes no published figure. The superseded wording is in [history](handoff-2026-11-05-current-state-before-89.md).

15. **Proposed for the owner-only files** (not edited, AGENTS.md and constitution §6): in `autopilot/CONSTITUTION.md` §2.1, name the adopted tag `master-20261103b` (it says `private-export-20261021-1050`), and say that a `master-*` pin also carries its overlay release `dataset-20261103-0706`; in §3.4, add `master-` and `20261103` to the release labels kept out of copy; in `scripts/autopilot-guard.cjs` `BANNED`, add `['"master-2026…" (release tags stay out of copy)', /master-\d{8}/]` and `['"20261103" (release tags stay out of copy)', /20261103/]`, with self-test cases like the `20261021` one.

**Line 63**

| Site, search, analytics, old browsers | [website architecture](../WEBSITE_ARCHITECTURE.md), [SEO](../SEO.md), [analytics](../ANALYTICS.md) | `npm run build` | `verify:seo`, `verify:analytics`, `verify:compat`, `verify:replay-e2e` (S1–S8) | `site-validation.yml` (`verify`, `privacy-e2e`) |

**Line 65**

| Releases and access | [analysis/ACCESS.md](../../analysis/ACCESS.md), [data architecture](../DATA_ARCHITECTURE.md) | `download_release.py`, `source_quality.py` (the edition policy) | `audit_release.py` (the release audit), `inspect_export.py` | `pacing-analysis.yml`, `inspect-full-export.yml` |

**Line 69**

Every pull request below is an ancestor of `b35789b8`, so all are in the production build checked above. The first-live dates come from the records linked.

**Line 71**

- **#89, release `master-20261103b` and the half on the person IDs v4** (`b35789b8`, squash-merged 2026-11-05 07:59 UTC; production built 08:00 UTC and checked above). Every marathon analysis rebuilt from the master release through the adapter; the half pages on the 1904 snapshot with the v4 person IDs, bound to it. Record: [refresh record](../REFRESH_20261103b.md) and [half marathon](../HALF_MARATHON.md).

**Lines 74–80**

- **#85, half marathons** (`a2c6e507`, merged 2026-10-30 20:49 UTC; production built 20:50 UTC and checked above). `/half`, the story `/stories/half-to-full` and half inputs in the predictor, goal pages, half pace chart and calculator, from the owner's public half releases with the corrected stamps. Contract: [half marathon](../HALF_MARATHON.md); record: [history](handoff-2026-10-20-to-30.md#half-marathons-a-page-a-story-and-the-tools-october-2930-2026).

- **#84** (`d84c5af5`, 2026-10-30 20:27 UTC): recorded the terrain splits and stretch paces as merged and live (documents only).

- **#83, terrain splits and stretch paces** (`e3f08ef0`, merged 2026-10-29 21:03 UTC; recorded live at 21:11 UTC). The planner's and pace band's band follows a corrected elevation profile on ten courses, with an option for each stretch's pace. Contract: [tools](../TOOLS.md#terrain-splits-owner-decision-october-23-2026); record: [history](handoff-2026-10-20-to-30.md#terrain-splits-on-the-planner-and-the-pace-band-october-23-2026).

- **#81 and #82, Top 100 charts** (`24caac1c`, merged 2026-10-23 14:38 UTC; recorded live that day; #82 `74c07103` recorded it). `/charts` and 100 chart pages with share cards. Contract: [Top 100 charts](../TOP_100_CHARTS.md); record: [history](handoff-2026-10-20-to-30.md#top-100-charts-a-section-of-its-own-october-23-2026).

- **#80, orientation** (`edf62b19`, merged 2026-10-22 20:48 UTC). One line on the home page saying what Pace Notes is, "Where to start" and "How it is made" on `/about`, and a four-fact short version on `/methodology`. Contract: [website architecture](../WEBSITE_ARCHITECTURE.md); record: [history](handoff-2026-10-20-to-30.md#orientation-what-pace-notes-is-where-to-start-and-how-it-is-made-october-22-2026).

- **#78 and #79, release 1050** (`39f30571`, merged 2026-10-22 13:43 UTC; recorded live at about 13:46 UTC; #79 `cb6bdb17` recorded it). Every analysis rebuilt from `private-export-20261021-1050`. Record: [1050 refresh](../REFRESH_20261021_1050.md) and [history](handoff-2026-10-20-to-30.md#release-private-export-20261021-1050-adopted-for-every-analysis-october-21-2026).

- **#76, the course-shape band** (`659d2c09`, merged 2026-10-20 21:04 UTC), superseded by #83's terrain splits. Record: [history](handoff-2026-10-20-to-30.md#course-shape-pace-band-october-20-2026).

**Line 94**

- **Marathon, measured in `master-20261103b`** ([refresh record](../REFRESH_20261103b.md#open-for-the-owner-and-the-producer)): a final (non-preliminary) person-link build for New York 2026 (since November 5 its preliminary `person_id`s are used and marked, on `feat/person-id-identity`); a weather row and a structured `race_date` for New York 2026. The owner answered the other asks on November 5, 2026: the master table is the standard export.

**Line 97**

- **Half marathons, measured in `half-dataset-20261030-1904` with the person IDs v4** (on `feat/half-v4`; [half marathon](../HALF_MARATHON.md#for-the-producer)): a per-row flag for merges that used a time test, the block counts per person, a corrected `build_info` coverage string, a person-ID build covering the newest halves (257,693 usable finishes above the build's boundary), a hand-review round on persons with both distances, the duplicate loads and copies, the registry gaps, Belém 2024's weaker-source status, labels and dates, the NYRR source, `course_shortened_suspect`, the finish-time-only wording and a figshare version for 1904; carried from the 1133 snapshot: the Oslo Half bib block, Berlin half net times, date collisions, undated editions, misplaced weather geocodes and assumed start hours and the watch items.

**Lines 102–107**

1. [AGENTS.md](../../AGENTS.md), then this file's Current state, Open for the owner and Subsystem index.

2. The owner's [decisions](../OWNER_DECISIONS.md) and [operations](../OPERATIONS.md) (checks, merging, release intake, refresh steps).

3. Data: [data architecture](../DATA_ARCHITECTURE.md), [analysis/README.md](../../analysis/README.md), [export access](../../analysis/ACCESS.md), the current [1050 refresh](../REFRESH_20261021_1050.md) and the [evidence index](../evidence/README.md).

4. Site: [website architecture](../WEBSITE_ARCHITECTURE.md), [design system](../DESIGN_SYSTEM.md), [SEO](../SEO.md) and [analytics](../ANALYTICS.md).

5. The subsystem you change (index above): [ten analyses](../TOP_TEN_ANALYSES.md), [catalog](../ANALYSIS_CATALOG.md), [stories](../STORIES.md), [tools](../TOOLS.md), [runners and the report](../RUNNERS_AND_REPORT.md), [runner context](../RUNNER_CONTEXT_AND_PEERS.md), [all-finisher analyses](../ALL_FINISHER_ANALYSES.md), [weather](../WEATHER_ANALYSES.md), [fast start](../FAST_START_ANALYSIS.md), [Top 100 charts](../TOP_100_CHARTS.md) or [half marathon](../HALF_MARATHON.md).

6. [Known issues](../KNOWN_ISSUES.md) and the [autopilot](../AUTOPILOT.md).

## docs/RUNNER_CONTEXT_AND_PEERS.md

Lines 5 of `docs/RUNNER_CONTEXT_AND_PEERS.md` at `de9f8c6f`.

**Line 5**

**On `feat/half-v4` (draft PR #89, November 4, 2026): `master-20261103b`.** 5,388,605 raw records, 299 editions and 4,222,246 eligible finishes: 299 edition shards, 1,950 peer groups, 15,625 pace groups and 6,061,071 exact finish-distribution cells; weather context for 298 editions (New York 2026 has no weather row) and terrain for 282. `public/data/runner-context/manifest.json` (SHA-256 `9033b64d971cedf3973fcc9d71619315d72c15fb6a604f532f5e4a263ab882b5`, `as_of` `2026-11-04T14:40:17Z`) is bound to runner manifest SHA-256 `8f593e056ac43f0afbe0372d8095427c7805524388ff089e2a8966efd178c700` (`as_of` `2026-11-04T14:30:12Z`); `build_runner_context.py` re-hashes the adapted folder's `master-assets/master_results_FULL.parquet` and checks each member against its `MANIFEST.json` ([refresh record](../REFRESH_20261103b.md)). **On `main` (1050).** Built from `private-export-20261021-1050` (**5,327,504 raw records, 298 editions and 4,108,749 eligible finishes**): 298 edition shards, 1,878 peer groups, 14,954 pace groups and 5,821,275 exact finish-distribution cells. `public/data/runner-context/manifest.json` (SHA-256 `00b907f630e0a327afda936e031fe6da963db0f2bed2f991232c77534eb84d7e`, `as_of` `2026-10-22T11:19:28Z`) is bound to runner manifest SHA-256 `cd2c99d7140d3f32700200901ab21e6d1d10b6b450254a0739382a59e6db028c` (`as_of` `2026-10-21T16:10:31Z`). It was rebuilt on October 22, 2026, after the owner accepted Chicago 2025's 07:00 reading for its 07:35 start; the October 21 manifest was `5d4f8d6a…`.

## docs/SEO.md

Lines 125, 130 of `docs/SEO.md` at `de9f8c6f`.

**Line 125**

- **`/stories/half-to-full`**: from the `half.extra` nugget: while its guard holds, "Half to Marathon: Double It Plus N Minutes | Pace Notes" and "After a half, the typical marathon took double it plus N minutes. See the marathons that followed each half time, 3 to 16 weeks later.", N the pooled minutes over double from `linked.json` (21 on the first pin); without it, "From the Half to the Marathon | Pace Notes" and a description without the figure. Since the stamp correction (October 30, 2026) the guard fails (the verified-halves weighting, now 8.5% of the pairs, took +16 minutes over double; [half marathons](../HALF_MARATHON.md#what-is-published)), so the page ships the second pair and its share card shows the fallback heading; the page's figure, and the chapter 11 row's, is the count of pairs (23,929 on the first pin; review, October 30, 2026). On the v4 build of October 31, 2026 (`feat/half-v4`, not merged) the guard still fails, on two pre-registered one-edition reruns of the verified halves, so the title stays "From the Half to the Marathon | Pace Notes", the figure is the 58,497 pairs and the description carries `half.sexes`'s reading (below; [half marathons](../HALF_MARATHON.md#what-is-published)). Source `half`; `CONTENT_DATES` October 31, 2026 (the follow-ups’ merge day, which the v4 adoption keeps; it moves with the code if the merge slips, as the v4 bullet below says; October 30 until the follow-ups set it).

**Line 130**

- **The v4 adoption's merge day** (`feat/half-v4`, October 31, 2026, not merged). Its built text, diffed against `fix/half-followups` (`b35da73e`), changed 13 routes: `/`, `/research`, `/stories`, `/half`, `/stories/half-to-full` and `/methodology` (all already October 31, 2026 in `CONTENT_DATES` from the follow-ups), the five goal pages (in `HALF_TEXT_REWRITTEN` at October 31, 2026; `lib/seo-pages/pace.ts` passes each goal page's path to `halfTextDate`), and `/report` and `/runners` (the chapter 11 next card; noindex, no `lastmod`). The predictor's and the half pace chart's half panels render in the browser, so their built text did not change; `/finish-times` and `/about` did not change either. The story's `published` stays October 30, 2026. If the merge slips past October 31, move these dates to its day in the merge commit. The `/half` description is unchanged ("Just over half … 1 in 4 under 1:45 …": 55.3% and 25.8% on the v4 build).

## docs/TOOLS.md

Lines 375 of `docs/TOOLS.md` at `de9f8c6f`.

**Line 375**

The text these sections replaced on October 30, 2026 (branch and deploy states, the redesign's review rounds, the stretch-pace measurements and the terrain splits' status block, the 1652/0934 cohort counts and the earlier check counts) is kept word for word in [history](tools-2026-10.md). The October 20 course-shape band, superseded on October 23, is the section above.

## docs/TOP_TEN_ANALYSES.md

Lines 13, 63 of `docs/TOP_TEN_ANALYSES.md` at `de9f8c6f`.

**Line 13**

Under `private-export-20261021-1050` (the engine calculated 2026-10-21T16:04:43Z) the engine holds 4,108,749 eligible finishes, 1,288,687 of them with an exact age (31.4%) and 648,914 with a recent earlier-year benchmark, in 27 cities plus All courses; its published cells are 1,314 profile, 1,831 opening, 766 near-target, 1,413 weather, 933 gains and 88,968 checkpoint cells. The [1050 refresh record](../REFRESH_20261021_1050.md) separates calculation, import and production. Earlier vintages are under [history](../TOP_TEN_ANALYSES.md#history-earlier-releases).

**Line 63**

Rank 2 starts in **All eligible finishes**, with All courses/ages/genders and a first 5 km more than 10% faster than that race's 5–20 km pace. It includes the same eligible finishes as the overall study (`analysis_n` in `fast-start/all-finishers.json`: 4,108,749 under 1050); no earlier race is needed. Its optional **Earlier-best comparison** keeps the finishes with a recent benchmark (`history_n`: 648,914 under 1050) and uses the first-10-km definition. The target-time example is not used in either mode. Both offer every recorded course and an explicit empty state when the exact cohort/opening group has fewer than 100 finishes. `comparison=all|history` selects the mode; legacy `prior=`/`previous=` links imply history only when no explicit mode is supplied. Explicit All clears prior filtering.

## docs/WEATHER_ANALYSES.md

Lines 3, 25 of `docs/WEATHER_ANALYSES.md` at `de9f8c6f`.

**Line 3**

On `feat/half-v4` (draft PR #89, not merged): recalculated November 4, 2026, from `master-20261103b` (both pins name it; the hourly weather comes from its overlay release `dataset-20261103-0706`, value-equal to 1050's): 4,162,015 finishes in 217 editions on 27 courses, New York 2026 left out for want of a weather row; warming and wind ready, humidity withheld, as under 1050 ([refresh record](../REFRESH_20261103b.md#refreshed-outputs)). On `main`: recalculated October 22, 2026, from `private-export-20261021-1050`, adopted in PR #78 (merged as `39f3057` and live on October 22, 2026; the deployed state is in the [project handoff](../PROJECT_HANDOFF.md#current-state)). [analysis/weather-release.json](../../analysis/weather-release.json) and [analysis/release.json](../../analysis/release.json) select the same audited source for weather, the ten interactive analyses and all 33 extension packs. The supporting study also uses this source; the 1652 and 0934 figures remain historical evidence in Git history, the [1652 refresh](../REFRESH_20261016_1652.md) and the [0934 refresh](../REFRESH_20260912_0934.md). See the [current refresh audit](../REFRESH_20261021_1050.md) for source checks and edition exclusions. Deployment is recorded separately from calculation.

**Line 25**

**1050.** The FULL and CORE archives passed the release audit ([data architecture](../DATA_ARCHITECTURE.md#verified-input)). The 299 weather rows are the 298 editions and the virtual Amsterdam 2020, which the release leaves out. The source URLs specify local timezones and wind in m/s. Exact half-hour ties at the scheduled start are valid. Race-day conditions do not establish individual wave exposure.

## docs/WEBSITE_ARCHITECTURE.md

Lines 164, 202 of `docs/WEBSITE_ARCHITECTURE.md` at `de9f8c6f`.

**Line 164**

- `npm run verify:compat` (`scripts/verify-browser-compat.cjs`) scans `app/`, `components/`, `lib/`, `hooks/` and `context/` for lookbehind and for built-ins Safari added in 15.4 or later that Next.js 14 does not polyfill: `structuredClone`, `findLast`/`findLastIndex`, `toSorted`/`toReversed`/`toSpliced`/`with`, `Object.groupBy`/`Map.groupBy`. The comment at the top of the script lists what it covers.

**Line 202**

- Every browser request for the site's data goes through `dataFetch` (`lib/data-fetch.ts`), which reports a failed request as `site_error` `data_fetch` and otherwise behaves like `fetch`; `verify-analytics` refuses a direct `fetch(` anywhere else in `app/`, `components/`, `lib/`, `hooks/` or `context/`.

## docs/evidence/README.md

Lines 38 of `docs/evidence/README.md` at `de9f8c6f`.

**Line 38**

| `2026-11-09/site-review/REVIEW.md` | The site review of November 9 and 10, 2026: findings by area (autopilot, SEO and answer engines, design and UX, architecture and code), what a second read confirmed, what the two pull requests change and what needs the owner | Review | No document |
