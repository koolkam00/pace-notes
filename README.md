# Pace Notes

By Andrew Kam. [Explore the site](https://splithappens.run) or [request an analysis](https://splithappens.run/request-analysis).

Pace Notes helps runners explore pacing patterns, compare courses, prepare for a race and understand a past result. The main experience presents ten ranked analyses, one question per page at `/analyses/{slug}`, with comparisons that respond to the supported course, time, age, recorded gender and earlier-performance controls. The [ten-analysis guide](docs/TOP_TEN_ANALYSES.md) maps each question to its methods and limits. The wider 35-question catalog, 33 calculated broad packs, course summaries and sustained-slowdown figures remain a research archive; the shared personalized engine retains 12 calculation paths.

The website is a static Next.js application that renders current analysis JSON/CSV and loads compressed public runner-search shards from `public/data`. Project policy makes the source code, complete runner records, database snapshots, exports and overlays available for anyone to open and download without an account. Use ordinary unencrypted Parquet/SQLite files; compression is optional. Large binary datasets are best distributed through public [GitHub Releases](https://github.com/koolkam00/htw-live-study/releases). The website has no direct connection to the ingestion database.

See the dated [public-access verification status](docs/PROJECT_HANDOFF.md#public-access-and-operations) for the latest anonymous-download checks. Legacy tags containing `private` are retained identifiers, not access requirements.

## Project handoff and current data

Start with [AGENTS.md](AGENTS.md) and [Project handoff](docs/PROJECT_HANDOFF.md), then the [data architecture](docs/DATA_ARCHITECTURE.md), [website architecture](docs/WEBSITE_ARCHITECTURE.md), [analysis catalog](docs/ANALYSIS_CATALOG.md) and [operations runbook](docs/OPERATIONS.md).

All displayed analyses use **`private-export-20260912-0934`**: 4,462,379 raw records across 34 cities and 256 city/year editions. The reviewed timing and edition-quality cohort contains 3,517,336 eligible finishes; exact-age, history and weather questions use smaller documented subsets. The main and weather pins, 33 broad packs, personalized engine, supporting study, public runner lookup and its exactly bound peer/context manifest must agree before publication. Group-running and congestion results remain unavailable because required measurements are missing.

The `/runners` section searches recorded names and lets visitors explicitly select their races before analyzing finish progression and section pacing. Candidate identities are not verified people. Incomplete and held records remain visible with reasons; only eligible selected races enter calculations. Full records and source checkpoints remain publicly downloadable.

The initial comparison for the main analyses is All courses / 4:00, all ages, all recorded genders and no earlier time, with targets from 1:30 through 12:00. Miles and per-mile pace are the default display; source measurements remain metric. A newer export does not automatically update the website. See [project handoff](docs/PROJECT_HANDOFF.md), [known issues](docs/KNOWN_ISSUES.md) and [verified export access](analysis/ACCESS.md) for dated source and deployment evidence.

## Sustained-slowdown measure

The study retains the [Published slowdown method (2021)](https://doi.org/10.1371/journal.pone.0251513): pace at least 25% slower than the 5–20 km baseline, sustained for at least 5 km after 20 km. This inherited timing definition is a descriptive measure, not a diagnosis of its cause. Current figures are recomputed from this project's eligible raw records; historical undocumented numerical outputs remain in Git history.

The `/slowdown` page presents these figures. Other pacing analyses have their own documented definitions and denominators; complete-split analyses compare 0–20 km with 20–40 km rather than inventing measured halfway times.

## Development and verification

Install Node.js 20 or newer, then run:

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`. Before reviewing website or aggregate changes, run:

```bash
npm run verify:data
npm run build
```

The build creates static output in `out/`. The configured public host is [Pace Notes](https://splithappens.run); deployment is a separate authorized step. An optional `NEXT_PUBLIC_BASE_PATH` supports hosting under a subpath.

Calculations, checksums, imports and per-release ID contracts are documented in [analysis/README.md](analysis/README.md). Keep missing measurements explicit, preserve source citations and make the full underlying data available alongside the chart aggregates. Existing repository names, file keys and compatibility URLs remain stable where required by the data contract.
