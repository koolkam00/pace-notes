# Data stories

The `/stories` section: narrative, interactive analyses, each one finding per beat. Eight stories are built from the verified runner shards, each with its own builder module, a published JSON file under `public/data/insights/`, an independent Node recount in `scripts/verify-insights.cjs` and a page in `app/stories/[slug]`; the ninth, [from the half to the marathon](#from-the-half-to-the-marathon-october-30-2026), reads `public/data/half/`. The stories add to the analyses: they never change the release pins, the reviewed source-quality policy or any other analysis output.

## Cohorts and screens

All stories start from the eligible finishes in the adopted runner manifest: `eligible_records` in `public/data/insights/manifest.json`, whose `cohort` block also gives the editions, cities, recorded sex and exact-age counts. `analysis/insights_data.py` re-reads every `public/data/runners` shard, checking its size and SHA-256, and re-checks the timing contract and the raw and eligible counts.

The stories then apply the screens below. They are specific to the stories, and each one is published in the data files:

| Screen | Rule | Published as |
| --- | --- | --- |
| Duplicate editions | An edition listed in `DUPLICATE_EDITIONS` (`analysis/insights_data.py`) is removed, and only if at least 100 of its finishes and at least 95% of them have an identical nine-time twin in the edition it duplicates. The list has been empty since release 1652, which reloaded Chicago 2018 and 2019 ([known issues](KNOWN_ISSUES.md#chicago-2018-and-2019-measured-impact-october-15-2026)); `scripts/verify-duplicate-editions.cjs` repeats the same-city scan on every build. | `duplicate_edition_screen` in the manifest and every family file |
| Start offset (shape statistics only) | Editions whose median 0–5 km relative pace exceeds the 5–10 km one by more than 10 points (`START_GAP_POINTS`), which is consistent with start delay in the first split. Finish-time, slowdown and weather statistics keep them. | `start_offset_editions` (`archetypes.json`, `kick.json`); `shape_cohort` in `courses.json` |
| Grid (final kick only) | On top of the start-offset editions: an edition whose median final section is more than 15% faster than its 35–40 km, or whose median 5 km section after 20 km is more than 5% faster than its 5–20 km pace (consistent with a misplaced mat). | `grid_screen` and `cohort_n` in `kick.json` |
| Exact ages | An edition supplies exact ages only if its age field holds at least 30 distinct values, with fewer than 40% of them multiples of five. Sources that record age-group floors (Berlin 2023–25, Dubai, Frankfurt 2022, Vienna 2022) never count as exact ages. | `cohort.exact_age` in the manifest |

Under `private-export-20261021-1050` (the files' `release_tag`): 4,108,749 eligible finishes in 215 editions of 27 cities, and the duplicate screen is empty, so the story cohort is every eligible finish. The start-offset screen lists 15 editions (138,385 finishes: Madrid 2013–18, New York 2006, Prague 2016–19 and Warsaw 2019 and 2023–25), leaving a shape cohort of 3,970,364 finishes in 200 editions of 26 courses; the grid screen then removes Valencia 2021 and Warsaw 2022, leaving 3,954,255 finishes in 198 editions for the final kick. Earlier releases' screens are under [history](#history-earlier-releases).

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
| The round-number effect (`/stories/round-numbers`; titled "Round numbers", the chapter's short name, so every link to it uses one name; its H1 names the minute that stands tallest against the curve, read from the file, and the scrolly ends on the quarter-hour contrast) | `insights_round.py` | `finish-times.json` | Minute histogram against a smooth Poisson spline, a cliff index at every minute, second-level lenses and the 40 km "rescue" counts. |
| Watch a marathon unfold (`/stories/race-replay`) | `insights_replay.py` | `replay.json` plus `replay/<slug>.json` | Up to 1,500 finishes sampled at evenly spaced finish ranks for each flagship edition. Also: hour snapshots, the first-finish moment, even-pace ghosts, the emptying-course composition, a 30-second clock pack, and field stretch across editions. |
| Pass or be passed (`/stories/places`) | `insights_positions.py` | `positions.json` | Clock-rank changes within each edition: coin flips at 20/30/35/40 km, section reshuffles, break-even curves, and women and men by edition. |
| After the slowdown (`/stories/final-kick`) | `insights_kick.py` | `kick.json` | Final-section kick against 35–40 km, the four second-half pace states and their flows, where the field breaks by 5–20 km pace, warning lights, same-race same-pace opening residuals (bank and pay), the cost of a sustained slowdown at the same 5–20 km pace, women and men, and recurrence across screened candidate profiles. |
| Women and men (`/stories/who-holds-pace`) | `insights_demographics.py` | `demographics.json` | Women and men matched within edition × finish minute, the ghost race, 10-minute bands, the exact-age ladder and women's share. |
| Every course has a fingerprint (`/stories/courses`) | `insights_courses.py` | `courses.json` | Course pace curves against the typical curve, the fade multiplier and signature, leave-one-out course identification, weather (within-course slopes, same-course pairs, heat signature), a matched 5–20 km pace comparison, and years and pandemic eras. |
| Race-morning weather (`/stories/race-morning`) | `insights_courses.py` | `courses.json` (its `weather` block) | The weather half of the course story since the October 17, 2026 redesign (WP2): same-course pairs, the curvature of the finish against the start temperature, and the heat signature. The course story keeps the curves, the identification and how steady each course ran; the eras moved to `/finish-times#front`. No new data. |
| From the half to the marathon (`/stories/half-to-full`) | `half_linked.py` ([the half marathon](HALF_MARATHON.md)) | `public/data/half/linked.json` | The one story not built from `public/data/insights`: marathons of records linked by name to a half 3 to 16 weeks before, half time by half time ([below](#from-the-half-to-the-marathon-october-30-2026)). |
| (course art) | `build_course_geometry.py` | `course-geometry.json` | Simplified supplied routes and elevation every 0.5 km, used for illustrations only. A route is drawn only where the runner context attached its profile to a recorded edition (same race name, inside any supplied validity interval); the others are listed under `omitted` with the context's reason (under 1050: Washington, whose supplied profile is named "Marine Corps Marathon"). |
| (runner tools) | `insights_tool_projector.py`, `insights_tool_paceband.py`, `insights_tool_weather.py`, `insights_tool_coursegoal.py` | `tools/*.json` plus shards | Data for the `/tools` pages on the final-kick cohort; see [runner tools](TOOLS.md). |

`manifest.json` binds all of these to:
- the release tag;
- the exact runner manifest (SHA-256 and `as_of`) and the runner-context manifest SHA-256;
- the duplicate screen audit;
- every `insights_*.py` script hash plus `build_insights.py` and `build_fast_start.py`;
- the source-script hashes;
- each file's bytes and SHA-256.

Every sentence a story or `/finish-times` shows is a nugget in `lib/nuggets/stories.ts` with a guard and a plain fallback; `scripts/nuggets/stories.cjs` recounts each one from these files inside `verify-nuggets` (October 17, 2026).

**What the pages draw.** Not every output in the table is drawn. A story page (`components/story/StoryPage.tsx`) is a reading (the H1 finding and its figure) and at most six beats, each one finding and one chart; every chart's table sits in one "All numbers" fold at the foot, which ends on "How these were measured →" (`/methodology#story-<slug>`), and the closing stack follows. The parts of each file that no beat draws (for example the pacing types' repeat-pair habits) stay published, verified below and listed on `/methodology#downloads`. `/stories` lists the stories in `lib/stories.ts` that are published in this build, with `/finish-times` and `/slowdown`; its count line ("… stories, one finding each.") is read from that list.

The site reads the files at build time through `lib/insights-server.ts`, which re-checks the release, the runner manifest hash and every file hash. Browser fetches (replay rows) go through `lib/insights.ts`, which re-checks the SHA-256 in the browser.

### Final kick

- **Baseline.** Every section is compared with the runner's own 5–20 km pace. "Kick" compares the final 2.195 km with 35–40 km.
- **Faster is strict.** A section counts as faster only when its pace is lower than the reference; an exact tie is not faster (`insights_data.faster_pace`, mirrored in the verifier). The final section's length is 2.1950000000000003 km in floating point, so before October 17, 2026 an exact tie with 35–40 km came out about 1e-16 faster and counted: under 1652 that put 15 ties into `kick.faster` (2,780,098 against the strict 2,780,083). The printed 74.9% did not change.
- **Shape cohort.** On top of the start-offset editions, two grid rules apply, and the editions they remove are published in `grid_screen` (1050: Valencia 2021 and Warsaw 2022, leaving 3,954,255 finishes in 198 editions; 1652: Madrid 2023, Valencia 2021 and Warsaw 2022, leaving 3,710,359 finishes in 193 editions):
  - an edition whose median final section is more than 15% faster than its 35–40 km (Valencia 2021);
  - an edition whose median 5 km section after 20 km is more than 5% faster than its 5–20 km pace (Madrid 2023 under 1652, consistent with a misplaced mat).
- **Same-race comparisons.** These use strata of one edition × one 5 s/km band of 5–20 km pace with at least 100 finishes, leaving each finish out of its own stratum's mean. The cost comparison uses the story cohort and strata of edition × recorded gender × 5 s/km band, both sides at least 100, weighted by sustained-slowdown finishes.
- **Second-half states.** Each section after 20 km is classed against the finish's own 5–20 km pace: within 5% or faster, drifting (5–10% slower), slowing (10–25% slower) and sustained-slowdown pace (25% or more slower).
- **Recovery.** A recovery is a later full 5 km section back within 10% of the 5–20 km pace. Its share uses only sustained-slowdown finishes whose slowdown episode ends with at least one full section still to run (`recovery.room_n` in `kick.json`; 1050: 194,798 finishes, 12.8% recover; 1652: 186,563, 12.9%; 0934: 166,275, 13.0%), so finishes with no room to recover are not counted as failures.
- **Recurrence.** Recurrence pairs adjacent eligible races of one screened candidate profile, 1–3 years apart, using only profile-years with exactly one eligible finish (`recurrence.pairs`; 1050: 627,833 pairs; 1652: 563,774; 0934: 484,956). Candidate profiles are not verified people.

### Courses, weather and years

- **Course curves.** A course curve is the mean of its editions' median relative-pace curves (shape editions with at least 100 finishes). The typical curve is the median across courses.
- **Fade multiplier and signature.** The fade multiplier fits each edition curve as `a + β·typical`, by least squares with weights √(section length). The residual is the signature.
- **Course identification.** For the courses with at least three shape editions (`identification` in `courses.json`: 22 under 1050, 24 under 1652, 22 under 0934), each edition is matched to the nearest course centroid. The hold-out is strict: the centroids, the typical curve and the fade fit are all rebuilt without the edition being identified. The chosen variant is fade removed with a distance-weighted Euclidean distance; under 1050 it names the right course for 114 of 193 editions (146 in the top three; chance is 1 in 22); under 1652, 106 of 191 (141 in the top three; chance is 1 in 24); under 0934, 95 of 172 (123; 1 in 22). All four variants tried are published.
- **Weather.** Weather is read from the verified runner-context shards: the supplied modelled hour at the scheduled start. The weather race name must match the edition race. Within-course slopes demean by course, weight each edition equally, and resample whole courses (4,000 draws). Curvature uses a within-course quadratic. The heat signature applies the within-course slope to each section's median relative pace in shape editions. This is not the prespecified weather screen, which remains the adjusted analysis.
- **Matched first 20 km.** Bands use 5–20 km pace. Cells are edition × band with at least 100 finishes, and the page draws courses with at least three such editions and 1,000 finishes.
- **Eras.** The eras compare 2015–19 editions with 2022–26 editions of the same course. A course counts only when eligible/raw records are at least 95% in both periods. Changes are means across courses, with a course bootstrap of 10,000 draws.


## From the half to the marathon (October 30, 2026)

Added by pull request #85 (merged as `a2c6e507`, October 30, 2026). The story's data, policy, pairing rules and both verification layers are in [the half marathon](HALF_MARATHON.md), which also says what the page states while each guard holds or fails ([what is published](HALF_MARATHON.md#what-is-published)); its method is on `/methodology#story-half-to-full`.

- **Registry.** `lib/stories.ts` entries carry `source?: 'insights' | 'half'` (default insights), and `storyPublished(story)` reads the verified half manifest for a half story and the insights manifest otherwise. Every story gate uses it: `app/stories/[slug]/page.tsx`, `app/stories/page.tsx`, the sitemap (`lib/seo-routes.ts`), `/methodology` (`MethodsStories` lists the insights files; the half files are under `#downloads-half`) and `scripts/build-og-images.cjs`. Its words come from the half nuggets (`lib/nuggets/half.ts`), not from the `insight()` readers; the title and description are built from the `half.extra` nugget, with a plain fallback when its guard fails.
- **Chapter 11.** The story opens chapter 11, "The next one" (`lib/chapters.ts`), before "Where runners improve" and the planner; the chapter's lead is the story's reading, so the home guide's and `/research`'s chapter 11 rows repeat its figure and key as a link (`data-half-link`). The chapter's tools hand back to it (`back: '/stories/half-to-full'`), and `verify-chapters` pins its neighbours.
- **The page** (`components/story/bodies/HalfToFullBody.tsx`, root `data-half-scope="linked"`): the reading, then beat 1 `#after`, the twenty five-minute windows of half time from 1:10 to 2:45 as a profile with a needle (the typical marathon, the middle 8 in 10, double the half), its readout and one sentence under it that follow the needle, "Not a prediction." and a link to the predictor; beat 2 `#women-men`, recorded women's and men's marathons after the same half, opening on a guess; then the All numbers fold. The minutes over double in the readout are the window's typical marathon as printed minus double its half (`windowOverDouble` in `lib/tools/half-to-full.ts`), so the numbers on screen add up. The scope chip ("Includes unverified half results") follows the dek, and "records linked by name" links to `/methodology#half-linking` on its first mention.
- **Fallbacks.** Each slot follows its nugget's guard: when `half.extra` fails, the H1 is its fallback, the hero figure is the neutral count of pairs (with its own key, also in the chapter 11 rows, the next cards and the `/half` night card), there is no ruler, no table row is marked as the reading and the `half-double` card is withdrawn; when beat 1's `half.range` fails, its heading falls back and its dek only says how to use the chart. `verify-nuggets` (`scripts/nuggets/half.cjs`) recounts every slot.
- **Script.** The profile is drawn on the server; `components/half/PredictorLink.client.tsx` only follows its needle (the slider's `aria-valuenow`). Drawing it in the client had put `LineProfile` into the story route's chunk, which every story page loads (S8; [operations](OPERATIONS.md#first-load-budgets-s8)).
- **Checks.** `verify-nuggets` recounts every half nugget from the published files; `verify-half` checks the files, the flagship's guard battery and, with `--html`, the chip, "records linked by name", "Not a prediction." and the `data-half-link` rows on the export; S6 checks the page's section signals and that the guess writes no storage and sends no event.
- **Limits.** Linked records are candidates, not verified people, and the pairs describe what went together, not why; the page never says records "ran". Sustained slowdown stays a marathon metric, measured on the marathon of each pair.

## Reproduce

```bash
python -m pip install -r analysis/requirements.txt
python -m unittest discover -s analysis -p 'test_insights.py'
python analysis/build_insights.py                      # all families → public/data/insights
python analysis/download_release.py --bundle CORE --output /tmp/release
python analysis/build_course_geometry.py --profiles /tmp/release/course_profiles.parquet
python analysis/build_course_terrain.py --profiles /tmp/release/course_profiles.parquet \
    --corrections analysis/course_terrain/corrections.json \
    --output public/data/insights/tools/course-terrain.json   # the terrain splits, same pass
python analysis/build_insights.py --only manifest      # re-bind course-geometry.json and course-terrain.json
node scripts/verify-insights.cjs                       # independent recount (≈30 s)
```

The full sequence, including a release change, is the [data story refresh](OPERATIONS.md#data-story-refresh). `--only family,...` rebuilds selected families and keeps the others listed in the manifest only if their bytes still match. Family files contain no build timestamps, so a rebuild from the same shards is byte-identical. The **Story analyses** workflow (`.github/workflows/insights.yml`) rebuilds everything into a temporary directory, recounts it, and compares the family files byte for byte. `npm run verify:data` runs `verify-insights.cjs`.

## Verifier

`scripts/verify-insights.cjs` streams every runner shard (7,885 under 1050; 7,881 under 1652; 7,766 under 0934) and rebuilds the eligible cohort and the duplicate and start-offset screens. It then recounts, independently of the Python builders:
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

## Adding a story

Each item names the check that fails without it.

1. **The builder and its file.** An `insights_<family>.py` module wired into `analysis/build_insights.py`, its JSON under `public/data/insights/` with a `method` string (`/methodology#story-<slug>` prints it, `components/methods/MethodsStories.tsx`), bound by the manifest (script hash, bytes and SHA-256), with tests in `analysis/test_insights.py` and a recount in `scripts/verify-insights.cjs` (groups of at least 100, no names or identifiers, no release tags in copy).
2. **The registry.** An entry in `lib/stories.ts` (slug, file, number, kicker, title, the required `dek` (the question under the H1), accent and `published`), and the slug in `STORY_SLUGS` in `lib/analytics-policy.ts` (`verify-analytics` compares the two lists).
3. **The words.** Every sentence and figure a nugget in `lib/nuggets/stories.ts` with a guard and a neutral fallback, recounted in `scripts/nuggets/stories.cjs` (`verify-nuggets`), and every slot following the guard ([design system: copy checks](DESIGN_SYSTEM.md#copy-checks)).
4. **The chapter.** A place in `lib/chapters.ts` (`verify-chapters` rule 4: every sitemap story appears exactly once) with a methods anchor, `/methodology#story-<slug>`, that the built page has (rule 5 with `--html`; `verify-seo` `methods-anchors`): the stories topic on `/methodology` writes that anchor for every published marathon story from its registry entry and its file's `method` (a half story's method is written in `components/methods/MethodsStories.tsx` itself). Moving a story in the chain also moves its neighbours, so update the `nextOf` cases among the unit tests in `scripts/verify-chapters.cjs` (its rule 1).
5. **The page.** A body in `components/story/bodies/` on `StoryPage`, added to `BODIES` in `app/stories/[slug]/page.tsx` (a story without one is not built), its beats marked for analytics with the generic section ids, and an S8 figure: a new story shares the story route's figure in `scripts/e2e/budget.json` unless it gets its own ([operations](OPERATIONS.md#first-load-budgets-s8)).
6. **Search and sharing.** The share card `public/og/stories/<slug>.png` from `npm run og:images` (checked by `npm run og:check`, which no CI job runs), and on the merge day the story's `published` date and its `CONTENT_DATES` entry in `lib/seo-routes.ts` (`verify-seo --today` refuses a date after today; [SEO](SEO.md)).
7. **Review.** Build, lint and capture its routes, and run the [visual review](DESIGN_SYSTEM.md#visual-review) until a fresh round finds no P1 or P2.

## History (earlier releases)

The text these sections replaced on October 30, 2026 (the 1652 and 0934 screens and counts, the Chicago copy evidence of October 15, 2026, the earlier family rows and the half story's pre-merge record) is kept word for word in [history](history/stories-2026-09-to-10.md). Older versions are in Git history.
