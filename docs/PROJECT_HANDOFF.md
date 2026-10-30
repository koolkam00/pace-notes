# Project handoff

## Read in order

1. [Data architecture](DATA_ARCHITECTURE.md)
2. [Website architecture](WEBSITE_ARCHITECTURE.md), with the [design system](DESIGN_SYSTEM.md), [data stories](STORIES.md) and [runner tools](TOOLS.md)
3. [Analysis catalog](ANALYSIS_CATALOG.md)
4. [Operations](OPERATIONS.md)
5. [Known issues](KNOWN_ISSUES.md)
6. [Producer handoff](history/INGESTION_HANDOFF_20260910.md), treating its September 10 blockers as historical

The [analysis README](../analysis/README.md) gives calculation and import contracts; [export access](../analysis/ACCESS.md) provides direct public downloads.

## Public access and operations

Source code, complete runner records including recorded names, exports, database snapshots, overlays and aggregate outputs are public research material. Gzip compression is not encryption. Release assets keep large binaries out of website builds for size and reproducibility. Passwords, access tokens and operational credentials are not dataset contents.

The 0934 manifest omitted a self-entry and was independently hashed; the prior incorrect self-size is no longer present. In the 1652 release the README's privacy prose is still stale and `ID-CONTRACT.md` / `FEATURE-FIELD-NOTES.md` still name the 1107 freeze, so ID semantics were verified at runtime instead. The feature notes also overstate which fields are safe as prior inputs. Preserve these immutable source files and recompute earlier-only benchmarks. See [access evidence](../analysis/ACCESS.md).

Public snapshot access does not provide shell access to the live ingestion service. Producer schedules, retries and hosting credentials remain outside the website agent's inspected environment. Never replace the live database with a downloaded snapshot.

## Remaining producer work

Reconcile held and partial editions against source totals; resolve the selected top-finisher source and invalid split grids before reconsidering their exclusion. New York 2008 has 38,047 records and remains held until completion/source-total reconciliation is supplied. Valencia 2017 and 2018 are listed as incomplete under 1652 (held under 0934); their missing 20 km timing already excludes them numerically. Investigate the Paris 2014–2018 in-place rewrite (25 km blank for about 99% of rows) against source semantics. Improve missing-age coverage (3,263,720 raw ages are null under 1652; 2,893,395 under 0934), source chronology and ambiguous start-time provenance. All feature race dates remain null, and 32 of the 33 course profiles still have no historical validity range (Warsaw's PZU profile is valid from 2019). The full 1652 list is in [the refresh record](REFRESH_20261016_1652.md#open-for-the-owner-and-the-producer). Do not infer precise ages, chronology, wave starts or historical routes.

Under 0934 the runner-context audit also identified a conflicting Helsinki 2025 start hour, six raw editions without weather, two cities without course profiles, and incompatible whole-profile/section elevation totals. Under 1652 the Helsinki conflict is gone and only the virtual Amsterdam 2020 lacks weather; terrain covers 270 of 287 editions (no profile for Melbourne 2015, Warsaw 2015–2018 outside the PZU profile's validity, and Washington's profile renamed to "Marine Corps Marathon"). Request sourced corrections and documented elevation processing in a new immutable export; preserve the original evidence. Current gaps are listed in [the 1652 refresh record](REFRESH_20261016_1652.md#weather-terrain-and-remaining-gaps) (0934: [its record](REFRESH_20260912_0934.md#weather-terrain-and-remaining-gaps)); the runner-context record retains its earlier coverage evidence.

## History

The dated sections this file held until October 30, 2026 are in [docs/history](history/README.md), unchanged:

- [October 20–30, 2026](history/handoff-2026-10-20-to-30.md): half marathons, terrain splits, Top 100 charts, orientation, releases 1050 and 0829, and the course-shape band.
- [The redesign, October 18–20, 2026](history/handoff-2026-10-redesign.md): release preparation, integration and WP9 rounds 1–6.
- [October 14–17, 2026](history/handoff-2026-10-14-to-17.md): release 1652, insights only, the StoryBrand pages, the race report, course pages, the race planner, the duplicate-edition guard, visit signals, the autopilot machinery and the older-Safari fix.
- [September to October 13, 2026](history/handoff-2026-09-to-10-13.md): search optimisation, branding, runner tools, the first redesign and stories, broader views, website analytics, the 0934 input, the refresh boundary, the product contracts, fast start, the runner lookup and the milestones.
