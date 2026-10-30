# Pace Notes

By Andrew Kam. [Explore the site](https://splithappens.run) or [request an analysis](https://splithappens.run/request-analysis).

Pace Notes helps runners explore pacing patterns, compare courses, prepare for a race and understand a past result, from recorded marathon and half-marathon splits. Every figure comes from published data files built from the owner's public data releases, and every page states its findings while the methods, sources and limits live on [/methodology](https://splithappens.run/methodology).

## What is on the site

| Section | What it is | Contract |
| --- | --- | --- |
| `/analyses` | The ten ranked analyses, one question per page at `/analyses/{slug}`, with course, time, age, recorded-gender and earlier-performance controls | [ten analyses](docs/TOP_TEN_ANALYSES.md), [catalog](docs/ANALYSIS_CATALOG.md) |
| `/stories` | Data stories, one finding each, in a chapter chain | [stories](docs/STORIES.md) |
| `/tools` | The nine runner tools in `lib/tools/registry.ts` (the race planner, the pace band, the predictor, the qualifying checker and others), plus pace charts and goal pages | [tools](docs/TOOLS.md) |
| `/courses` | One page per course | [SEO](docs/SEO.md) (course pages) |
| `/runners` and `/report` | Recorded-name search, a runner's selected races, and the race report | [runners and the report](docs/RUNNERS_AND_REPORT.md), [runner context](docs/RUNNER_CONTEXT_AND_PEERS.md) |
| `/charts` | The Top 100 charts, each with a share card | [Top 100 charts](docs/TOP_100_CHARTS.md) |
| `/half` and `/stories/half-to-full` | The half marathon, and the marathons that followed a half | [half marathon](docs/HALF_MARATHON.md) |
| `/methodology` | Methods & sources, the downloads and the dated checks | [website architecture](docs/WEBSITE_ARCHITECTURE.md) |

`/runners` searches recorded names and lets visitors explicitly select their races before analyzing finish progression and section pacing. Candidate identities are not verified people. Incomplete and held records remain visible with reasons; only eligible selected races enter calculations. Full records and source checkpoints remain publicly downloadable.

The initial comparison for the main analyses is All courses / 4:00, all ages, all recorded genders and no earlier time, with targets from 1:30 through 12:00. Miles and per-mile pace are the default display; source measurements remain metric. Group-running and congestion results remain unavailable because required measurements are missing.

## Data and current release

The adopted marathon release is named in [`analysis/release.json`](analysis/release.json) (weather in [`analysis/weather-release.json`](analysis/weather-release.json), half marathons in [`analysis/half-release.json`](analysis/half-release.json)); its counts are in the current refresh record, [REFRESH_20261021_1050.md](docs/REFRESH_20261021_1050.md). What production serves is named by [`/version.json`](https://splithappens.run/version.json) (the deployed commit) and [`/data/live.json`](https://splithappens.run/data/live.json) (the release behind its data). A newer export does not automatically update the website; the [project handoff](docs/PROJECT_HANDOFF.md) records the dated state.

Project policy makes the source code, complete runner records, database snapshots, exports and overlays available for anyone to open and download without an account. Use ordinary unencrypted Parquet/SQLite files; compression is optional. Large binary datasets are distributed through public [GitHub Releases](https://github.com/koolkam00/pace-notes/releases) (the repository was renamed from `koolkam00/htw-live-study`, whose links redirect), with files, sizes and checksums in [export access](analysis/ACCESS.md). The website has no direct connection to the ingestion database. See the dated [public-access verification status](docs/PROJECT_HANDOFF.md#public-access-and-operations) for the latest anonymous-download checks. Legacy tags containing `private` are retained identifiers, not access requirements.

## Sustained-slowdown measure

The study retains the [Published slowdown method (2021)](https://doi.org/10.1371/journal.pone.0251513): pace at least 25% slower than the 5–20 km baseline, sustained for at least 5 km after 20 km. This inherited timing definition is a descriptive measure, not a diagnosis of its cause. Current figures are recomputed from this project's eligible raw records; historical undocumented numerical outputs remain in Git history.

The `/slowdown` page presents these figures. Other pacing analyses have their own documented definitions and denominators; complete-split analyses compare 0–20 km with 20–40 km rather than inventing measured halfway times.

## Development

The site is a static Next.js application (`output: 'export'`) that renders the analysis JSON/CSV in `public/data` and loads compressed public runner-search shards from it. Install Node.js 20 or newer (CI uses 20 for the site checks), then run:

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`. `npm run build` writes the static site to `out/`. The calculations need Python 3.12 with `analysis/requirements.txt`; their commands, checksums, imports and per-release ID contracts are in [analysis/README.md](analysis/README.md) and the [operations runbook](docs/OPERATIONS.md). An optional `NEXT_PUBLIC_BASE_PATH` supports hosting under a subpath.

Before a pull request, run the checks for your kind of change: they are listed in [operations: checks by change type](docs/OPERATIONS.md#checks-by-change-type), and CI's "Website data validation" workflow runs the site set (`verify` and `privacy-e2e`) on every pull request.

**Deployment.** The public host is [Pace Notes](https://splithappens.run). Vercel's Git integration builds every pull request as a preview and deploys `main` to production when a pull request merges; `/version.json` names the deployed commit, and the dated check of it is in the handoff's [Current state](docs/PROJECT_HANDOFF.md#current-state). Check it before saying a change is live.

## Working on this repository

Start with [AGENTS.md](AGENTS.md) (the standing rules) and the [project handoff](docs/PROJECT_HANDOFF.md) (the current state, open owner questions and an index of every subsystem). The owner's decisions are quoted and dated in the [register](docs/OWNER_DECISIONS.md). A scheduled autopilot proposes small, measured changes under [its constitution](autopilot/CONSTITUTION.md); how it merges, checks and reverts is in [docs/AUTOPILOT.md](docs/AUTOPILOT.md). Keep missing measurements explicit, preserve source citations and make the full underlying data available alongside the chart aggregates. Existing repository names, file keys and compatibility URLs remain stable where required by the data contract.
