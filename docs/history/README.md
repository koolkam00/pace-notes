# History

Dated records that no longer describe the project as it is, kept so that earlier evidence, decisions and reasoning stay readable. The current state is in the [project handoff](../PROJECT_HANDOFF.md); the contracts are in the documents it links; the owner's decisions are in the [register](../OWNER_DECISIONS.md).

## Rules for this folder

- A file here is a copy of what its source said at the commit named below. It is never rewritten. It may gain a one-line banner at its top and dated corrections (`**Correction (YYYY-MM-DD):** …`), nothing else.
- To move text here, copy it with `git show <sha>:<path>`, sliced by line, never retyped. Re-point its relative links for this folder, and to the new home of any section that moved, and change nothing else. Add a row to the table below. Update every inbound link and anchor in the same commit, then run the link and anchor check.
- Counts here belong to the release they name (1107, 0934, 1652 and so on). Do not quote them as current.
- Older material is in Git history (`git log --follow -- <path>`) and in the immutable releases.

## Files

All moves are dated October 30, 2026. Line numbers are the source file's at the source commit.

| File | Source | Source commit | Lines | What it holds |
| --- | --- | --- | --- | --- |
| [handoff-2026-10-20-to-30.md](handoff-2026-10-20-to-30.md) | `docs/PROJECT_HANDOFF.md` | `a2c6e507` | 3–171 | Half marathons (#85), terrain splits (#83), Top 100 charts (#81), orientation (#80), release 1050 (#78), release 0829 (not adopted; draft #77) and the course-shape band (#76) |
| [handoff-2026-10-redesign.md](handoff-2026-10-redesign.md) | `docs/PROJECT_HANDOFF.md` | `a2c6e507` | 173–491 | The redesign (#71): release preparation, integration and WP9 rounds 1–6 |
| [handoff-2026-10-14-to-17.md](handoff-2026-10-14-to-17.md) | `docs/PROJECT_HANDOFF.md` | `a2c6e507` | 493–835 | Release 1652, insights only, the StoryBrand pages, the race report, course pages, the race planner, the duplicate-edition guard, visit signals, the autopilot machinery and the older-Safari fix |
| [handoff-2026-09-to-10-13.md](handoff-2026-09-to-10-13.md) | `docs/PROJECT_HANDOFF.md` | `a2c6e507` | 837–872, 885–943, 959–964 | Search optimisation, branding and requests, runner tools, the first redesign and stories, broader views, website analytics, the verified 0934 input, the refresh boundary, the product and statistical contracts, fast start, the public runner lookup and the milestones, with counts updated through 1652 |
| [runner-context-and-report-2026-09-to-10.md](runner-context-and-report-2026-09-to-10.md) | `docs/RUNNER_CONTEXT_AND_PEERS.md` | `a2c6e507` | 58–70, 102–116 | The race report's redesign and review notes (October 18, 2026) and the 1107 local calculation evidence (September 12, 2026) |
| [INGESTION_HANDOFF_20260910.md](INGESTION_HANDOFF_20260910.md) | `docs/INGESTION_HANDOFF.md` | `a2c6e507` | all | The September 10 producer request |
| [RUNNER_SEARCH_20260912.md](RUNNER_SEARCH_20260912.md) | `docs/CURRENT_SITE_AND_RUNNER_SEARCH.md` | `a2c6e507` | all | The September 12 (1107) runner search record |
| [RUNNER_RECORD_COVERAGE_20260917.md](RUNNER_RECORD_COVERAGE_20260917.md) | `docs/RUNNER_RECORD_COVERAGE.md` | `a2c6e507` | all | The September 17 (0934) and October 16 (1652) record-coverage tables |
| [redesign-2026-10/DESIGN-SPEC.md](redesign-2026-10/DESIGN-SPEC.md) | `docs/redesign-work/DESIGN-SPEC.md` | `b1fe7761` (branch `feat/redesign`) | all (2,718) | The redesign spec of October 17, 2026. `6279e4b5` deleted it before #71 was squash-merged, so `main` never held it; code comments that cite "the redesign spec, section N" mean this file |

## Where the rest went

What these sources said that is still current moved to the documents that own it, in the same commit:

- The copy-edition guard and the race report (`RUNNER_CONTEXT_AND_PEERS.md`), the public runner lookup (the handoff), the record-coverage contract (`RUNNER_RECORD_COVERAGE.md`) and the search verification contract (`CURRENT_SITE_AND_RUNNER_SEARCH.md`, lines 15–20) are in [runner search, record coverage and the race report](../RUNNERS_AND_REPORT.md). Its copies drop the release counts and branch states that stay here.
- Two sentences of the handoff's "Product and statistical contracts" and its sustained-slowdown paragraph are in [the ten analyses](../TOP_TEN_ANALYSES.md#product-and-statistical-contracts). The rest of that section, and the method sentences of "Fast-start analysis", were already in [the ten analyses](../TOP_TEN_ANALYSES.md) and [the fast-start analysis](../FAST_START_ANALYSIS.md); the fast-start counts stay here.
- The handoff's "Refresh and publication boundary" rules (unavailable forecasts, historical outputs never relabelled, weather publication) are in [operations](../OPERATIONS.md#validate-import-and-publish).
