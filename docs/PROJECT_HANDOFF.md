# Project handoff

Where the project stands. The standing rules are in [AGENTS.md](../AGENTS.md), the owner's decisions in the [register](OWNER_DECISIONS.md), the procedures and checks in [operations](OPERATIONS.md), and the dated records this file used to hold in [docs/history](history/README.md).

## Current state

**Checked 2026-10-30, 21:26–21:35 UTC**, after #85 merged. Keep four facts apart: release notes, measured results, repository state and deployed state. A docs-only merge after this check changes no page, but never write "live" for anything without reading `/version.json` again. Replace this block, with its date, after every merge.

| Fact | Value | How it was checked |
| --- | --- | --- |
| `main` | `a2c6e507`, "Half marathons: /half, the half-to-marathon story, and half inputs in the tools (#85)", squash-merged 2026-10-30 20:49:11 UTC | `git ls-remote origin refs/heads/main`; GitHub REST `pulls/85` |
| Production | `a2c6e507`, built 2026-10-30T20:50:31.387Z | `curl -s https://splithappens.run/version.json` |
| Production data | `release_tag` `private-export-20261021-1050` (`as_of` 2026-10-21T16:10:31Z) | `curl -s https://splithappens.run/data/live.json` |
| Pages | `/`, `/half`, `/stories/half-to-full`, `/charts`, `/tools`, `/methodology` and `/data/half/manifest.json` answered 200 | `curl` status codes |
| Production smoke | PASS: 54 of 54 checks on 26 pages, old Safari 26 of 26, no third-party requests; `version.json` named `a2c6e507` before and after the pages; home lab LCP 1.0 s, CLS 0.001, TBT 115 ms | `npm run autopilot:smoke -- --base https://splithappens.run --quick --expect-sha a2c6e507…` (finished 21:34 UTC) |
| CI on `main` | Website data validation (`verify`, `privacy-e2e`) and Half marathon (`check`, `source`) succeeded on `a2c6e507`; the `source` job downloaded every pinned half asset anonymously and rebuilt the published bytes (run 41126215052) | GitHub REST check runs and jobs |
| Marathon pin | [`analysis/release.json`](../analysis/release.json): `private-export-20261021-1050` from `koolkam00/pace-notes` | the file |
| Weather pin | [`analysis/weather-release.json`](../analysis/weather-release.json): the same tag | the file |
| Half pin | [`analysis/half-release.json`](../analysis/half-release.json), schema 2: snapshot and links from the public `half-dataset-20261029-1202` (doi:10.6084/m9.figshare.34858428.v1; `private_tag` `half-snapshot-20261029-1133` and `runner-links-20261029-1156`), `metadata_correction` `half-dataset-20261029-2157` ("verified = stamped in both"), `access` "public (CC BY 4.0), owner releases; pages publish aggregates", policy `analysis/half-policy-20261029-1133.json` | the file |
| Anonymous access | A ranged GET (bytes 0–99) with no token answered 206 for `RELEASE-SHA256SUMS-20261021-1050.txt`, `pace-notes-CORE-20261021-1050.tar.gz` and FULL `part-01` of the 1050 release, the half snapshot and links parts of `half-dataset-20261029-1202` and `csv-edition_meta.csv.zst` of `half-dataset-20261029-2157`; a control asset in the private `koolkam00/pace-notes-db-backup` answered 404; HEAD answered 401, which is not a valid test | [operations: access checks](OPERATIONS.md#access-checks); files and sums in [analysis/ACCESS.md](../analysis/ACCESS.md) |
| Releases newer than the pins | `koolkam00/pace-notes`: none after `half-dataset-20261029-2157` (published 2026-10-30 02:00 UTC). `koolkam00/pace-notes-db-backup` (private): `half-snapshot-20261030-1356` and `person-ids-v2-20261030-0825`, `person-ids-v3-20261030-0906` and `person-ids-v4-20261030-1150`, published October 30, **not read** | GitHub REST `releases` |
| Open pull requests | #77 (draft, `data/release-0829`, since 2026-10-21), #49 (draft, `codex/berlin-2026-intake`, since 2026-09-28), #29 (`codex/qa-coverage-mobile`, since 2026-09-09) | GitHub REST `pulls?state=open` |
| Autopilot | Paused: issue #59 has carried `autopilot:paused` since 2026-10-15 21:28:44 UTC (the owner: "Paused while the StoryBrand redesign is built."). The scheduled task "Pace Notes autopilot" (`CRON_TZ=America/New_York 56 7 * * 1,4`) is enabled with no connectors; its 2026-10-29 run reported itself blocked (no `add_repo` or `register_repo_root` tool, no GitHub or PostHog tools, the git proxy refused the repository), made no change and posted no log comment. Next run 2026-11-02 12:56 UTC | GitHub REST issue 59 and its events; the scheduled task and that run's result |

## Open for the owner

1. **Autopilot.** Before removing `autopilot:paused` from issue #59: give the scheduled task the repository `koolkam00/pace-notes` with push access and the GitHub and PostHog connectors (the 2026-10-29 run above); add @v2 definitions to `autopilot/metrics.md`, because `answered_visit_rate@v1` (the north star), `home_continuation_rate@v1` and `home_depth@v1` count `chapter-*` sections on `/`, which the home page has not sent since `b7a675c` (#65, October 16; `lib/analytics-policy.ts`); and add `report` to the PostHog recording URL blocklist if it is not there yet ([analytics](ANALYTICS.md), configuration step 2; not verified here).
2. **Half marathons.** The producer's release READMEs say "Do not mix halves and marathons in one statistic." (`half-dataset-20261029-1202`) and "Halves and marathons are never mixed in one statistic." (`half-dataset-20261029-2157`), while set B pairs a half with the marathon after it: confirm that this pairing is what you want. Decide whether the verified-halves weighting stays in the half story's battery ([known issues](KNOWN_ISSUES.md)). Q3–Q12, Q14 and Q15 stand at the build's defaults ([half marathon](HALF_MARATHON.md#owner-questions)); the build specification they cite is not in the repository. The private releases newer than the half pin (above) are unread.
3. **Pull request #77** (release 0829, not adopted, draft since October 21): close it or keep it. #49 and #29 have been open since September.
4. **Licences.** The repository has no licence file (GitHub reports none), while the data releases are CC BY 4.0: choose the licences for the code and the site.
5. **Search Console and Bing.** Verify the domain and submit the sitemap ([SEO owner checklist](SEO.md); the www redirect is done).
6. **Course naming.** The course data still name a race "Washington Marathon", which may be the Marine Corps Marathon ([history: search optimisation, October 2026](history/handoff-2026-09-to-10-13.md#search-optimisation-october-2026)).
7. **Top 100 charts.** Read the hundred cards before posting them; they publish under your name ([history](history/handoff-2026-10-20-to-30.md#top-100-charts-a-section-of-its-own-october-23-2026)).
8. **Terrain splits** (open since October 23): the NYC Open Data terms need a check in a browser; the defaults stand for the grade curve (Strava's 2017 curve, not Kay 2012) and for street names; the course pages, share cards and all-finisher terrain views still draw the uncorrected supplied profiles ([history](history/handoff-2026-10-20-to-30.md#terrain-splits-on-the-planner-and-the-pace-band-october-23-2026)).
9. **Release 1050 questions:** London's era comparison and the thin-course goal sections ([1050 refresh](REFRESH_20261021_1050.md#open-for-the-owner-and-the-producer)).
10. **Orientation measure.** Twenty-eight days after the October 22 deploy, compare home → `/about` or `/methodology` and one-page home visits with the 28 days before, after turning analytics off on your own devices at `/privacy` ([history](history/handoff-2026-10-20-to-30.md#orientation-what-pace-notes-is-where-to-start-and-how-it-is-made-october-22-2026)).
11. **Branches.** Branches are kept after a merge (`delete_branch_on_merge` is false; 56 remote branches on October 30). `feat/redesign` and `rd/*` held the only copy of the redesign spec until this documentation pass restored it to [docs/history](history/redesign-2026-10/DESIGN-SPEC.md).
12. **Tooling you may approve** (each adds or changes a check): a documentation link and command checker in CI; `npm run og:check` in CI (it runs only locally); a `typecheck` script; removing the `export` and `start` scripts, which do not work with `output: 'export'`; fixing `public-explorer.yml`, whose path filter names the missing `analysis/test_runner_lookup.py`; an optional session-start warning when `HEAD` is behind `origin/main`.
13. **Files only you edit.** Proposed for `autopilot/CONSTITUTION.md`: add the half tags (`half-dataset-`, `half-snapshot-`, `runner-links-`) and their date `20261029` to §3.4 and to the guard's `BANNED` list; name `analysis/half-release.json` among the pins in §2.1; consider protecting the contract and refresh documents in §6; date "about 18 visits a day" in §7. For `autopilot/metrics.md`: label the registry example (`home-hero`, `started: '2026-10-19'`) as an example; `lib/experiments.ts` holds no experiment.

## Subsystem index

Contract documents are the source of each rule; builders are in `analysis/`, verifiers in `scripts/` and workflows in `.github/workflows/`. "In `verify:data`" means the verifier runs in `npm run verify:data`, which CI runs on every pull request.

| Subsystem | Contract | Builder | Verifier | Workflow |
| --- | --- | --- | --- | --- |
| Packs and the ten analyses | [ten analyses](TOP_TEN_ANALYSES.md), [catalog](ANALYSIS_CATALOG.md) | `build_pacing.py`, `build_extended.py`, `build_personalized.py`; `import_packs.py` | `verify-ten-analyses`, `verify-research`, `verify-personalized` (in `verify:data`) | `pacing-analysis.yml` |
| Runner lookup and search | [runners and the report](RUNNERS_AND_REPORT.md) | `build_public_explorer.py`, `build_runner_lookup.py`; `import_public_explorer.py` | `verify-public-explorer`, `verify-runner-search` (in `verify:data`) | `public-explorer.yml` |
| Runner context and peers | [runner context](RUNNER_CONTEXT_AND_PEERS.md) | `build_runner_context.py`; `import_runner_context.py` | `verify-runner-context`, `-client`, `-ui` (in `verify:data`) | `runner-context.yml` |
| All-finisher views | [all-finisher analyses](ALL_FINISHER_ANALYSES.md) | `build_all_finisher_context.py` | `verify-all-finisher-context`, `-client` (in `verify:data`) | `all-finisher-context.yml` |
| Fast start | [fast-start analysis](FAST_START_ANALYSIS.md) | `build_fast_start.py`, `build_fast_start_all.py` | `verify-fast-start`, `-all`, `-client` (in `verify:data`) | `fast-start.yml` |
| Weather | [weather analyses](WEATHER_ANALYSES.md) | `build_weather.py` | `verify-weather` (in `verify:data`) | `weather-analysis.yml` |
| Stories, tool data, terrain | [stories](STORIES.md), [tools](TOOLS.md) | `build_insights.py`, `build_course_geometry.py`, `build_course_terrain.py` | `verify-insights`, `verify-tools`, `verify-nuggets`, `verify-chapters`, `verify-finish-times` (in `verify:data`) | `insights.yml` |
| Courses | [SEO](SEO.md) (course pages) | `build_insights.py` (`courses.json`) | `verify-courses` (in `verify:data`; `--html` in `verify:seo`) | `insights.yml` |
| Race report | [runners and the report](RUNNERS_AND_REPORT.md) | none of its own (`lib/report.ts` reads the published files) | `verify-report` (in `verify:data`) | `site-validation.yml` |
| Top 100 charts | [Top 100 charts](TOP_100_CHARTS.md); captions in [CHARTS_INSTAGRAM.md](CHARTS_INSTAGRAM.md) (generated) | `build_charts.py`, `scripts/build-chart-cards.cjs` | `verify-charts`, `build-chart-cards --check` (in `verify:data`) | `charts.yml` |
| Half marathons | [half marathon](HALF_MARATHON.md) | `build_half.py`, `download_half.py` | `verify-half`, the half card check (in `verify:data`); `npm run verify:half-source` (local) | `half.yml` |
| Duplicate editions | [data architecture](DATA_ARCHITECTURE.md), [known issues](KNOWN_ISSUES.md) | `DUPLICATE_EDITIONS` in `insights_data.py`, written to the insights manifest's `duplicate_edition_screen` | `verify-duplicate-editions` (in `verify:data`) | `site-validation.yml` |
| Units, CSS and fonts | [design system](DESIGN_SYSTEM.md), [website architecture](WEBSITE_ARCHITECTURE.md) | — | `verify-units`, `verify-css` (in `verify:data`); `npm run verify:css` (local) | `site-validation.yml` |
| Site, search, analytics, old browsers | [website architecture](WEBSITE_ARCHITECTURE.md), [SEO](SEO.md), [analytics](ANALYTICS.md) | `npm run build` | `verify:seo`, `verify:analytics`, `verify:compat`, `verify:replay-e2e` (S1–S8) | `site-validation.yml` (`verify`, `privacy-e2e`) |
| Autopilot | [autopilot](AUTOPILOT.md), `autopilot/CONSTITUTION.md` | — | `verify:autopilot`, `autopilot-guard`, `autopilot-smoke` | `autopilot-guard.yml`, `autopilot-merge.yml` |
| Releases and access | [analysis/ACCESS.md](../analysis/ACCESS.md), [data architecture](DATA_ARCHITECTURE.md) | `download_release.py`, `source_quality.py` (the edition policy) | `audit_release.py` (the release audit), `inspect_export.py` | `pacing-analysis.yml`, `inspect-full-export.yml` |

## Recent changes

Every pull request below is an ancestor of `a2c6e507`, so all are in the production build checked above. The first-live dates come from the records linked.

- **#85, half marathons** (`a2c6e507`, merged 2026-10-30 20:49 UTC; production built 20:50 UTC and checked above). `/half`, the story `/stories/half-to-full` and half inputs in the predictor, goal pages, half pace chart and calculator, from the owner's public half releases with the corrected stamps. Contract: [half marathon](HALF_MARATHON.md); record: [history](history/handoff-2026-10-20-to-30.md#half-marathons-a-page-a-story-and-the-tools-october-2930-2026).
- **#84** (`d84c5af5`, 2026-10-30 20:27 UTC): recorded the terrain splits and stretch paces as merged and live (documents only).
- **#83, terrain splits and stretch paces** (`e3f08ef0`, merged 2026-10-29 21:03 UTC; recorded live at 21:11 UTC). The planner's and pace band's band follows a corrected elevation profile on ten courses, with an option for each stretch's pace. Contract: [tools](TOOLS.md#terrain-splits-owner-decision-october-23-2026); record: [history](history/handoff-2026-10-20-to-30.md#terrain-splits-on-the-planner-and-the-pace-band-october-23-2026).
- **#81 and #82, Top 100 charts** (`24caac1c`, merged 2026-10-23 14:38 UTC; recorded live that day; #82 `74c07103` recorded it). `/charts` and 100 chart pages with share cards. Contract: [Top 100 charts](TOP_100_CHARTS.md); record: [history](history/handoff-2026-10-20-to-30.md#top-100-charts-a-section-of-its-own-october-23-2026).
- **#80, orientation** (`edf62b19`, merged 2026-10-22 20:48 UTC). One line on the home page saying what Pace Notes is, "Where to start" and "How it is made" on `/about`, and a four-fact short version on `/methodology`. Contract: [website architecture](WEBSITE_ARCHITECTURE.md); record: [history](history/handoff-2026-10-20-to-30.md#orientation-what-pace-notes-is-where-to-start-and-how-it-is-made-october-22-2026).
- **#78 and #79, release 1050** (`39f30571`, merged 2026-10-22 13:43 UTC; recorded live at about 13:46 UTC; #79 `cb6bdb17` recorded it). Every analysis rebuilt from `private-export-20261021-1050`. Record: [1050 refresh](REFRESH_20261021_1050.md) and [history](history/handoff-2026-10-20-to-30.md#release-private-export-20261021-1050-adopted-for-every-analysis-october-21-2026).
- **#76, the course-shape band** (`659d2c09`, merged 2026-10-20 21:04 UTC), superseded by #83's terrain splits. Record: [history](history/handoff-2026-10-20-to-30.md#course-shape-pace-band-october-20-2026).

## Public access and operations

Source code, complete runner records including recorded names, exports, database snapshots, overlays and aggregate outputs are public research material (AGENTS.md rules 1–3). Gzip compression is not encryption. Release assets keep large binaries out of website builds for size and reproducibility. Passwords, access tokens and operational credentials are not dataset contents.

The dated anonymous-access result for each adopted source is in [Current state](#current-state); the method is in [operations](OPERATIONS.md#access-checks), and the files, sizes, checksums and how to open them are in [export access](../analysis/ACCESS.md). Release READMEs and contract notes can lag the data: the 0934 and 1652 notes are in [history](history/handoff-2026-10-30-access-and-producer.md).

Public snapshot access does not provide shell access to the live ingestion service. Producer schedules, retries and hosting credentials remain outside the website agent's inspected environment. Never replace the live database with a downloaded snapshot.

## Remaining producer work

The one list of what the producer is asked for. Each item names the release it was measured in; the detail stays in the linked record.

- **Marathon, measured in 1050** ([1050 refresh](REFRESH_20261021_1050.md#open-for-the-owner-and-the-producer)): re-pulls for London 2015–2018 and 2021–2024, Stockholm 2025 and Vienna 2022–2024, which fall short of their official finisher counts; New York 2008's official finisher count; Amsterdam 2023's finish times; Chicago's 15 km gaps (2005 and 2009); route files (the Marine Corps Marathon profile measures 42.863 km; Melbourne has none).
- **Marathon, carried from 1652 and 0934 and not re-measured under 1050** ([history](history/handoff-2026-10-30-access-and-producer.md)): source totals for held and partial editions; the selected top-finisher source and the invalid split grids; the Paris 2014–2018 25 km rewrite; missing ages, source chronology and start-time provenance; feature race dates; historical validity ranges for course profiles.
- **Half marathons, measured in the 1133 snapshot with the 2157 metadata** ([half marathon](HALF_MARATHON.md#for-the-producer)): the Oslo Half bib block, Berlin half net times, date collisions, undated editions, misplaced weather geocodes and assumed start hours, the watch items, and a figshare version 2 carrying the corrected edition metadata.
- The September 10 request is kept as [history](history/INGESTION_HANDOFF_20260910.md); its blockers are historical.

## Read in order

1. [AGENTS.md](../AGENTS.md), then this file's Current state, Open for the owner and Subsystem index.
2. The owner's [decisions](OWNER_DECISIONS.md) and [operations](OPERATIONS.md) (checks, merging, release intake, refresh steps).
3. Data: [data architecture](DATA_ARCHITECTURE.md), [analysis/README.md](../analysis/README.md), [export access](../analysis/ACCESS.md), the current [1050 refresh](REFRESH_20261021_1050.md) and the [evidence index](evidence/README.md).
4. Site: [website architecture](WEBSITE_ARCHITECTURE.md), [design system](DESIGN_SYSTEM.md), [SEO](SEO.md) and [analytics](ANALYTICS.md).
5. The subsystem you change (index above): [ten analyses](TOP_TEN_ANALYSES.md), [catalog](ANALYSIS_CATALOG.md), [stories](STORIES.md), [tools](TOOLS.md), [runners and the report](RUNNERS_AND_REPORT.md), [runner context](RUNNER_CONTEXT_AND_PEERS.md), [all-finisher analyses](ALL_FINISHER_ANALYSES.md), [weather](WEATHER_ANALYSES.md), [fast start](FAST_START_ANALYSIS.md), [Top 100 charts](TOP_100_CHARTS.md) or [half marathon](HALF_MARATHON.md).
6. [Known issues](KNOWN_ISSUES.md) and the [autopilot](AUTOPILOT.md).

## History

The dated sections this file held until October 30, 2026 are in [docs/history](history/README.md), unchanged:

- [October 20–30, 2026](history/handoff-2026-10-20-to-30.md): half marathons, terrain splits, Top 100 charts, orientation, releases 1050 and 0829, and the course-shape band.
- [The redesign, October 18–20, 2026](history/handoff-2026-10-redesign.md): release preparation, integration and WP9 rounds 1–6.
- [October 14–17, 2026](history/handoff-2026-10-14-to-17.md): release 1652, insights only, the StoryBrand pages, the race report, course pages, the race planner, the duplicate-edition guard, visit signals, the autopilot machinery and the older-Safari fix.
- [September to October 13, 2026](history/handoff-2026-09-to-10-13.md): search optimisation, branding, runner tools, the first redesign and stories, broader views, website analytics, the 0934 input, the refresh boundary, the product contracts, fast start, the runner lookup and the milestones.
- [Access notes and producer work as of October 30, 2026](history/handoff-2026-10-30-access-and-producer.md): the 0934 and 1652 notes of "Public access and operations" and "Remaining producer work".
