# Data stories

The `/stories` section adds narrative, interactive analyses built from the same verified runner shards as the existing analyses. Each story has its own builder module, a published JSON file under `public/data/insights/`, an independent Node recount in `scripts/verify-insights.cjs`, and a page in `app/stories/[slug]`. This is an addition. It does not change the release pins, the reviewed source-quality policy or any existing analysis output.

## Cohorts and screens

All stories start from the eligible finishes in the adopted runner manifest: **3,871,767** from `htw-db-2026-10-16-1652` (October 16, 2026; branch `feat/release-1652`, not deployed), 3,517,336 under 0934 (historical). `analysis/insights_data.py` re-reads every `public/data/runners` shard, checking its size and SHA-256, and re-checks the timing contract and the raw and eligible counts.

The stories then apply the screens below. They are specific to the stories, and each one is published in the data files. **1652:** the duplicate-edition screen is retired and empty (`DUPLICATE_EDITIONS = ()`): the release deleted the Chicago 2018 and 2019 copies and loaded the real races, and no same-city pair shares more than one nine-time tuple, so the **story cohort is all 3,871,767 eligible finishes**. The start-offset screen now lists **15 editions (138,385 finishes)**: Madrid 2013–18, New York 2006, Prague 2016–19 and Warsaw 2019 and 2023–25 (Barcelona 2019 and New York 2007 are excluded by the 1652 source policy); **shape cohort 3,733,382 finishes in 196 editions**. The table keeps the 0934 counts as historical evidence.

| Screen | Rule | Effect |
| --- | --- | --- |
| Duplicate editions (0934 only; retired in 1652) | Chicago 2018 and 2019 largely repeat the Chicago 2024 field: most of their finishes have a 2024 twin with the same name and all nine checkpoint times. The builder removes them only if at least 95% of their finishes have an identical nine-time twin in 2024. | 103,220 finishes removed. **Story cohort: 3,414,116.** |
| Start offset (shape statistics only) | Editions whose median 0–5 km relative pace exceeds the 5–10 km one by more than 10 points, which is consistent with start delay in the first split. 0934 (historical): Madrid 2013–18, Prague 2016–19, Barcelona 2019, New York 2006–07; 1652: see the paragraph above. | 0934: 13 editions (134,131 finishes) left out of pacing-shape statistics, **shape cohort 3,279,985**; 1652: 15 editions (138,385), shape cohort 3,733,382. Finish-time, slowdown and weather statistics keep them. |
| Exact ages | An edition supplies exact ages only if its age field holds at least 30 distinct values, with fewer than 40% of them multiples of five. | Sources that record age-group floors (Berlin 2023–25, Dubai, Frankfurt 2022, Vienna 2022) never count as exact ages. |

The copies are not byte-identical to the 2024 rows (measured October 15, 2026 from the published shards). 2,946 twins in 2018 and 2,939 in 2019 record gender `F` where the matching 2024 row records none; 307 eligible 2018 names, and the same 307 in 2019, are absent from 2024; and 318 eligible finishes in each copy have no nine-time twin in 2024. The three editions carry separate record-id ranges. The public shards carry record ids, not source participant ids, so the participant-id part of the screen's description is the story builder's (the `DUPLICATE_EDITIONS` reason in `analysis/insights_data.py`), not re-verified here; the screen's rule (at least 95% nine-time twins) does not depend on it. The guard elsewhere on the site (`lib/duplicate-editions.ts`, `scripts/verify-duplicate-editions.cjs`) reads this screen and never repeats its `reason` text. See [known issues](KNOWN_ISSUES.md#chicago-2018-and-2019-measured-impact-october-15-2026).

Shared definitions:
- **Sustained slowdown** is the published definition: at least 25% slower than the 5–20 km pace for at least 5 km after 20 km. The final 2.195 km cannot qualify on its own ([method citation](https://doi.org/10.1371/journal.pone.0251513)).
- **Relative pace** is each section's pace compared with the finish's own whole-race average pace.
- **Block comparisons** compare the 20–40 km block with the 0–20 km block. No halfway or mile splits are inferred.

Every count is a race finish, not a unique person. No published group has fewer than 100 finishes. Every association is descriptive.

Shares that a page prints as a percentage are stored with ten digits (`insights_stats.SHARE_DIGITS`, October 17, 2026), so the page rounds once from the exact share. With four digits a share was rounded twice: Chicago 2018's 13,377 of 44,224 (30.2483%) was stored as 0.3025 and printed as 30.3%, and 10 edition cells and 10 goal-table cells on the course pages were 0.1 point off. `verify-insights` checks printed values against its own recounts.

## Families

| Story (route) | Builder | Output | Main content |
| --- | --- | --- | --- |
| Six ways to run the same race (`/stories/pacing-types`) | `insights_archetypes.py` | `archetypes.json` | Six pacing types from distance-weighted k-means over clipped relative-pace shapes. Includes finish-band river, course mix, pacing "sentences", repeat-pair habits (candidate profile links, not verified people) and a client classifier. |
| The round-number effect (`/stories/round-numbers`; titled "Round numbers" since October 19, 2026, the chapter's short name, so every link to it uses one name; its H1 still names the minute that stands tallest against the curve, 2:59 in release 1652, and the scrolly ends on the quarter-hour contrast) | `insights_round.py` | `finish-times.json` | Minute histogram against a smooth Poisson spline, a cliff index at every minute, second-level lenses and the 40 km "rescue" counts. |
| Watch a marathon unfold (`/stories/race-replay`) | `insights_replay.py` | `replay.json` plus `replay/<slug>.json` | Up to 1,500 finishes sampled at evenly spaced finish ranks for each flagship edition. Also: hour snapshots, the first-finish moment, even-pace ghosts, the emptying-course composition, a 30-second clock pack, and field stretch across editions. |
| Pass or be passed (`/stories/places`) | `insights_positions.py` | `positions.json` | Clock-rank changes within each edition: coin flips at 20/30/35/40 km, section reshuffles, break-even curves, and women and men by edition. |
| After the slowdown (`/stories/final-kick`) | `insights_kick.py` | `kick.json` | Final-section kick against 35–40 km, the four second-half pace states and their flows, where the field breaks by 5–20 km pace, warning lights, same-race same-pace opening residuals (bank and pay), the cost of a sustained slowdown at the same 5–20 km pace, women and men, and recurrence across screened candidate profiles. |
| Women and men (`/stories/who-holds-pace`) | `insights_demographics.py` | `demographics.json` | Women and men matched within edition × finish minute, the ghost race, 10-minute bands, the exact-age ladder and women's share. |
| Every course has a fingerprint (`/stories/courses`) | `insights_courses.py` | `courses.json` | Course pace curves against the typical curve, the fade multiplier and signature, leave-one-out course identification, weather (within-course slopes, same-course pairs, heat signature), a matched 5–20 km pace comparison, and years and pandemic eras. |
| Race-morning weather (`/stories/race-morning`) | `insights_courses.py` | `courses.json` (its `weather` block) | The weather half of the course story since the October 17, 2026 redesign (WP2): same-course pairs, the curvature of the finish against the start temperature, and the heat signature. The course story keeps the curves, the identification and how steady each course ran; the eras moved to `/finish-times#front`. No new data. |
| (course art) | `build_course_geometry.py` | `course-geometry.json` | Simplified supplied routes and elevation every 0.5 km, used for illustrations only. Since 1652 a route is drawn only where the runner context attached its profile to a recorded edition (same race name, inside any supplied validity interval); the others are listed under `omitted` with the context's reason (1652: Washington, whose profile is now named "Marine Corps Marathon"). |
| (runner tools) | `insights_tool_projector.py`, `insights_tool_paceband.py`, `insights_tool_weather.py`, `insights_tool_coursegoal.py` | `tools/*.json` plus shards | Data for the `/tools` pages on the final-kick cohort; see [runner tools](TOOLS.md). |

`manifest.json` binds all of these to:
- the release tag;
- the exact runner manifest (SHA-256 and `as_of`) and the runner-context manifest SHA-256;
- the duplicate screen audit;
- every `insights_*.py` script hash plus `build_insights.py` and `build_fast_start.py`;
- the source-script hashes;
- each file's bytes and SHA-256.

Every sentence a story or `/finish-times` shows is a nugget in `lib/nuggets/stories.ts` with a guard and a plain fallback; `scripts/nuggets/stories.cjs` recounts each one from these files inside `verify-nuggets` (October 17, 2026).

**What the pages draw (October 20, 2026; repository state on `feat/redesign`, not deployed).** Not every output in the table is drawn. A story page (`components/story/StoryPage.tsx`) is a reading (the H1 finding and its figure) and at most six beats, each one finding and one chart; every chart's table sits in one "All numbers" fold at the foot, which ends on "How these were measured →" (`/methodology#story-<slug>`), and the closing stack follows. The story deck, the cards and the per-chart table rows of the earlier pages are gone; the parts of each file that no beat draws (for example the pacing types' repeat-pair habits) stay published, verified below and listed on `/methodology#downloads`. `/stories` lists ten pages: the eight stories, `/finish-times` and `/slowdown`.

The site reads the files at build time through `lib/insights-server.ts`, which re-checks the release, the runner manifest hash and every file hash. Browser fetches (replay rows) go through `lib/insights.ts`, which re-checks the SHA-256 in the browser.

### Final kick

- **Baseline.** Every section is compared with the runner's own 5–20 km pace. "Kick" compares the final 2.195 km with 35–40 km.
- **Faster is strict.** A section counts as faster only when its pace is lower than the reference; an exact tie is not faster (`insights_data.faster_pace`, mirrored in the verifier). The final section's length is 2.1950000000000003 km in floating point, so before October 17, 2026 an exact tie with 35–40 km came out about 1e-16 faster and counted: under 1652 that put 15 ties into `kick.faster` (2,780,098 against the strict 2,780,083). The printed 74.9% did not change.
- **Shape cohort.** On top of the start-offset editions, two grid rules apply, and the editions they remove are published in `grid_screen` (1652: Madrid 2023, Valencia 2021 and Warsaw 2022, leaving 3,710,359 finishes in 193 editions):
  - an edition whose median final section is more than 15% faster than its 35–40 km (Valencia 2021);
  - an edition whose median 5 km section after 20 km is more than 5% faster than its 5–20 km pace (Madrid 2023, consistent with a misplaced mat).
- **Same-race comparisons.** These use strata of one edition × one 5 s/km band of 5–20 km pace with at least 100 finishes, leaving each finish out of its own stratum's mean. The cost comparison uses the story cohort and strata of edition × recorded gender × 5 s/km band, both sides at least 100, weighted by sustained-slowdown finishes.
- **Second-half states.** Each section after 20 km is classed against the finish's own 5–20 km pace: within 5% or faster, drifting (5–10% slower), slowing (10–25% slower) and sustained-slowdown pace (25% or more slower).
- **Recovery.** A recovery is a later full 5 km section back within 10% of the 5–20 km pace. Its share uses only sustained-slowdown finishes whose slowdown episode ends with at least one full section still to run (1652: 186,563 finishes, 12.9% recover; 0934: 166,275, 13.0%), so finishes with no room to recover are not counted as failures.
- **Recurrence.** Recurrence pairs adjacent eligible races of one screened candidate profile, 1–3 years apart, using only profile-years with exactly one eligible finish (1652: 563,774 pairs; 0934: 484,956). Candidate profiles are not verified people.

### Courses, weather and years

- **Course curves.** A course curve is the mean of its editions' median relative-pace curves (shape editions with at least 100 finishes). The typical curve is the median across courses.
- **Fade multiplier and signature.** The fade multiplier fits each edition curve as `a + β·typical`, by least squares with weights √(section length). The residual is the signature.
- **Course identification.** For the courses with at least three shape editions (24 under 1652; 22 under 0934), each edition is matched to the nearest course centroid. The hold-out is strict: the centroids, the typical curve and the fade fit are all rebuilt without the edition being identified. The chosen variant is fade removed with a distance-weighted Euclidean distance; under 1652 it names the right course for 106 of 191 editions (141 in the top three; chance is 1 in 24); under 0934, 95 of 172 (123; 1 in 22). All four variants tried are published.
- **Weather.** Weather is read from the verified runner-context shards: the supplied modelled hour at the scheduled start. The weather race name must match the edition race. Within-course slopes demean by course, weight each edition equally, and resample whole courses (4,000 draws). Curvature uses a within-course quadratic. The heat signature applies the within-course slope to each section's median relative pace in shape editions. This is not the prespecified weather screen, which remains the adjusted analysis.
- **Matched first 20 km.** Bands use 5–20 km pace. Cells are edition × band with at least 100 finishes, and the page draws courses with at least three such editions and 1,000 finishes.
- **Eras.** The eras compare 2015–19 editions with 2022–26 editions of the same course. A course counts only when eligible/raw records are at least 95% in both periods. Changes are means across courses, with a course bootstrap of 10,000 draws.

## Reproduce

```bash
python -m pip install -r analysis/requirements.txt
python -m unittest discover -s analysis -p 'test_insights.py'
python analysis/build_insights.py                      # all families → public/data/insights
python analysis/download_release.py --bundle CORE --output /tmp/release
python analysis/build_course_geometry.py --profiles /tmp/release/course_profiles.parquet
python analysis/build_insights.py --only manifest      # re-bind course-geometry.json
node scripts/verify-insights.cjs                       # independent recount (≈30 s)
```

`--only family,...` rebuilds selected families and keeps the others listed in the manifest only if their bytes still match. Family files contain no build timestamps, so a rebuild from the same shards is byte-identical. The **Story analyses** workflow (`.github/workflows/insights.yml`) rebuilds everything into a temporary directory, recounts it, and compares the family files byte for byte. `npm run verify:data` now ends with `verify-insights.cjs`.

## Verifier

`scripts/verify-insights.cjs` streams every runner shard (7,881 under 1652; 7,766 under 0934) and rebuilds the eligible cohort and the duplicate and start-offset screens. It then recounts, independently of the Python builders:
- the finish-time histogram, marks and cliffs;
- all six archetype counts with the published centroids, and the 600 published sentences;
- position ranks, coin flips and women-ahead editions;
- the matched demographic shares;
- every replay sample row, the first-finish moments, the even-pace ghosts, the clock packs, the on-course counts and the field stretch;
- for courses:
  - edition rows and year cells;
  - the typical curve and course curves;
  - the weather cohort, the same-course pairs and both slopes;
  - the matched-pace cells and the identification tallies;
- for the final kick:
  - the grid screen and the kick and magnet shares;
  - section breaks, warning lights and stay rates;
  - the cost-band and gender counts.

Bootstrap intervals and leave-one-out stratum means are checked for structure only.

For every file it also checks provenance and structure: finite numbers, groups of at least 100, no identifier or name keys, no recorded runner names in text, and no release-tag strings in copy.

## Interpretation limits

- Replays put every finisher on one shared race clock. Wave and start offsets are not recorded, and positions between mats are interpolated for display only. "Ahead", "passes" and "packs" are clock ranks, not positions on the road.
- Course means the supplied city label, not a verified historical route. Routes and elevation are the current supplied course files; the elevation model misses bridge decks.
- Weather is an edition-level overlay at one point in each city, never personal or wave exposure.
- Matching on finish time or early pace balances that measure only. It does not balance ability, goals, experience or conditions.
- Field sizes count eligible finishes in this dataset, not official finishers.
