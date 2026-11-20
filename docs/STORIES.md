# Data stories

The `/stories` section: narrative, interactive analyses, each one finding per beat. Eight stories are built from the marathon cohort (`analysis/marathon-cohort`, the names-free records every marathon analysis reads; from the runner lookup's shards until November 14, 2026), each with its own builder module, a published JSON file under `public/data/insights/`, an independent Node recount in `scripts/verify-insights.cjs` and a page in `app/stories/[slug]`; four more, chapter 10 "Over the years" (`fast-and-slow-years`, `race-to-race`, `recorded-bests`, `getting-older`), read the linked-records family `public/data/linked/` ([linked records](LINKED_RECORDS.md)); and [from the half to the marathon](#from-the-half-to-the-marathon-october-30-2026) reads `public/data/half/`. The stories add to the analyses: they never change the release pins, the reviewed source-quality policy or any other analysis output.

## Cohorts and screens

All stories start from the counted finishes of the marathon cohort (`analysis/marathon-cohort`; `analysis/cohort.py` states its format): `eligible_records` in `public/data/insights/manifest.json`, whose `cohort` block also gives the editions, cities, recorded sex and exact-age counts. `analysis/insights_data.py` reads the cohort through `analysis/cohort.py`, which checks every edition file's size and SHA-256, and re-checks the timing contract and the raw and eligible counts. An edition supplies finishes only when the release's edition policy counts it (`source_quality` in the manifest states the policy's digests and counts; the editions it leaves out are listed in `public/data/edition-policy.json`). The cohort's edition list is the edition index of every family file; it also names the editions that keep only an own-record view, which supply no finish to any story.

The stories then apply the screens below. They are specific to the stories, and each one is published in the data files:

| Screen | Rule | Published as |
| --- | --- | --- |
| Duplicate editions | An edition listed in `DUPLICATE_EDITIONS` (`analysis/insights_data.py`) is removed, and only if at least 100 of its finishes and at least 95% of them have an identical nine-time twin in the edition it duplicates. The list has been empty since release 1652, which reloaded Chicago 2018 and 2019 ([known issues](KNOWN_ISSUES.md#chicago-2018-and-2019-measured-impact-october-15-2026)); `scripts/verify-duplicate-editions.cjs` repeats the same-city scan on every build. | `duplicate_edition_screen` in the manifest and every family file |
| Start offset (shape statistics only) | Editions whose median 0–5 km relative pace exceeds the 5–10 km one by more than 10 points (`START_GAP_POINTS`), which is consistent with start delay in the first split. Finish-time, slowdown and weather statistics keep them. | `start_offset_editions` (`archetypes.json`, `kick.json`); `shape_cohort` in `courses.json` |
| Grid (final kick only) | On top of the start-offset editions: an edition whose median final section is more than 15% faster than its 35–40 km, or whose median 5 km section after 20 km is more than 5% faster than its 5–20 km pace (consistent with a misplaced mat). | `grid_screen` and `cohort_n` in `kick.json` |
| Exact ages | An edition supplies exact ages only if its age field holds at least 30 distinct values, with fewer than 40% of them multiples of five. Sources that record age-group floors (Berlin 2023–25, Dubai, Frankfurt 2022, Vienna 2022) never count as exact ages. | `cohort.exact_age` in the manifest |

Under `pace-notes-marathon-half-20261113-1113` (the files' `release_tag`; every count in this paragraph read from the files on November 19, 2026): 4,124,026 counted finishes in 201 editions of 28 cities, and the duplicate screen is empty, so the story cohort is every counted finish. The start-offset screen lists 15 editions (138,385 finishes: Madrid 2013, Madrid 2014, Madrid 2015, Madrid 2016, Madrid 2017, Madrid 2018, New York 2006, Prague 2016, Prague 2017, Prague 2018, Prague 2019, Warsaw 2019, Warsaw 2023, Warsaw 2024, Warsaw 2025), leaving a shape cohort of 3,985,641 finishes in 186 editions of 27 courses; the grid screen then removes Valencia 2021 and Warsaw 2022, leaving 3,969,532 finishes in 184 editions for the final kick. 1,402,378 finishes carry an exact age. Under `master-20261103b` (read from the files of November 5, 2026) the two screens listed the same editions: 4,222,246 eligible finishes in 218 editions of 27 cities, a shape cohort of 4,083,861 in 203 editions and a final-kick cohort of 4,067,752 in 201. Earlier releases' screens are under [history](#history-earlier-releases).

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
| (course art) | `build_course_geometry.py` | `course-geometry.json` | Simplified supplied routes and elevation every 0.5 km, used for illustrations only. A route is drawn only where the runner context attached its profile to a recorded edition (same race name, inside any supplied validity interval); the others are listed under `omitted` with the context's reason (under `pace-notes-marathon-half-20261113-1113`, November 19, 2026: 24 routes drawn and 9 omitted, Athens, Auckland, Cologne, Honolulu, Mexico City, Singapore, Tokyo, Vienna, Washington; a city with no counted edition has no context shard, so its route is not attached and not drawn; under 1050: Washington, whose supplied profile is named "Marine Corps Marathon"). |
| (runner tools) | `insights_tool_projector.py`, `insights_tool_paceband.py`, `insights_tool_weather.py`, `insights_tool_coursegoal.py` | `tools/*.json` plus shards | Data for the `/tools` pages on the final-kick cohort; see [runner tools](TOOLS.md). |

`manifest.json` binds all of these to:
- the release tag;
- the exact marathon cohort manifest (its SHA-256 and `as_of`, in `runner_manifest_sha256` and `runner_manifest_as_of`, the names the two fields had while they named the runner manifest; `cohort_manifest_sha256` states the same digest) and the runner-context manifest SHA-256;
- the edition policy the cohort was cut by (`source_quality`: its digests and counts, as the cohort manifest states them);
- the duplicate screen audit;
- every `insights_*.py` script hash plus `build_insights.py` and `build_fast_start.py`;
- the source-script hashes (the six scripts that wrote the cohort);
- each file's bytes and SHA-256.

Every sentence a story or `/finish-times` shows is a nugget in `lib/nuggets/stories.ts` with a guard and a plain fallback; `scripts/nuggets/stories.cjs` recounts each one from these files inside `verify-nuggets` (October 17, 2026).

**What the pages draw.** Not every output in the table is drawn. A story page (`components/story/StoryPage.tsx`) is a reading (the H1 finding and its figure) and at most six beats, each one finding and one chart; every chart's table sits in one "All numbers" fold at the foot, which ends on "How these were measured →" (`/methodology#story-<slug>`), and the closing stack follows. The parts of each file that no beat draws (for example the pacing types' repeat-pair habits) stay published, verified below and listed on `/methodology#downloads`. `/stories` lists the stories in `lib/stories.ts` that are published in this build, with `/finish-times` and `/slowdown`; its count line ("… stories, one finding each.") is read from that list.

The site reads the files at build time through `lib/insights-server.ts`, which re-checks the release, the cohort manifest's hash (read from `analysis/marathon-cohort/manifest.json` in the checkout) and every file hash. Browser fetches (replay rows) go through `lib/insights.ts`, which re-checks the SHA-256 in the browser.

### Final kick

- **Baseline.** Every section is compared with the runner's own 5–20 km pace. "Kick" compares the final 2.195 km with 35–40 km.
- **Faster is strict.** A section counts as faster only when its pace is lower than the reference; an exact tie is not faster (`insights_data.faster_pace`, mirrored in the verifier). The final section's length is 2.1950000000000003 km in floating point, so before October 17, 2026 an exact tie with 35–40 km came out about 1e-16 faster and counted: under 1652 that put 15 ties into `kick.faster` (2,780,098 against the strict 2,780,083). The printed 74.9% did not change.
- **Shape cohort.** On top of the start-offset editions, two grid rules apply, and the editions they remove are published in `grid_screen` (`pace-notes-marathon-half-20261113-1113`, November 19, 2026: Valencia 2021 and Warsaw 2022, leaving 3,969,532 finishes in 184 editions; 1050: Valencia 2021 and Warsaw 2022, leaving 3,954,255 finishes in 198 editions; 1652: Madrid 2023, Valencia 2021 and Warsaw 2022, leaving 3,710,359 finishes in 193 editions):
  - an edition whose median final section is more than 15% faster than its 35–40 km (Valencia 2021);
  - an edition whose median 5 km section after 20 km is more than 5% faster than its 5–20 km pace (Madrid 2023 under 1652, consistent with a misplaced mat).
- **Same-race comparisons.** These use strata of one edition × one 5 s/km band of 5–20 km pace with at least 100 finishes, leaving each finish out of its own stratum's mean. The cost comparison uses the story cohort and strata of edition × recorded gender × 5 s/km band, both sides at least 100, weighted by sustained-slowdown finishes.
- **Second-half states.** Each section after 20 km is classed against the finish's own 5–20 km pace: within 5% or faster, drifting (5–10% slower), slowing (10–25% slower) and sustained-slowdown pace (25% or more slower).
- **Recovery.** A recovery is a later full 5 km section back within 10% of the 5–20 km pace. Its share uses only sustained-slowdown finishes whose slowdown episode ends with at least one full section still to run (`recovery.room_n` in `kick.json`; `pace-notes-marathon-half-20261113-1113`, November 19, 2026: 206,097 finishes, 13.2% recover; 1050: 194,798 finishes, 12.8% recover; 1652: 186,563, 12.9%; 0934: 166,275, 13.0%), so finishes with no room to recover are not counted as failures.
- **Recurrence.** Recurrence pairs adjacent eligible races of one screened candidate profile, 1–3 years apart, using only profile-years with exactly one eligible finish. Since November 14, 2026 a profile is the cohort's runner: records the pipeline's identity file keys together (links of the tiers high_elite, high or medium that pass its three screens), and a record without a key stands alone (`recurrence.pairs`; `pace-notes-marathon-half-20261113-1113`, November 19, 2026: 781,459 pairs; 1050: 627,833 pairs; 1652: 563,774; 0934: 484,956). Candidate profiles are not verified people.

### Courses, weather and years

- **Course curves.** A course curve is the mean of its editions' median relative-pace curves (shape editions with at least 100 finishes). The typical curve is the median across courses.
- **Fade multiplier and signature.** The fade multiplier fits each edition curve as `a + β·typical`, by least squares with weights √(section length). The residual is the signature.
- **Course identification.** For the courses with at least three shape editions (`identification` in `courses.json`: 19 under `pace-notes-marathon-half-20261113-1113`, 22 under 1050, 24 under 1652, 22 under 0934), each edition is matched to the nearest course centroid. The hold-out is strict: the centroids, the typical curve and the fade fit are all rebuilt without the edition being identified. The chosen variant is fade removed with a distance-weighted Euclidean distance; under `pace-notes-marathon-half-20261113-1113` (November 19, 2026) it names the right course for 112 of 173 editions (143 in the top three; chance is 1 in 19); under 1050 for 114 of 193 editions (146 in the top three; chance is 1 in 22); under 1652, 106 of 191 (141 in the top three; chance is 1 in 24); under 0934, 95 of 172 (123; 1 in 22). All four variants tried are published.
- **Weather.** Weather is read from the verified runner-context shards: the supplied modelled hour at the scheduled start. The weather race name must match the edition race. The context is bound to the cohort manifest and lists a shard only for a counted edition with peers, weather or terrain; an edition without a shard, or whose shard has no weather row, has none (12 of the 201 editions under `pace-notes-marathon-half-20261113-1113`, November 19, 2026: Austin 2022, Austin 2023, Austin 2024, Los Angeles 2015, Los Angeles 2019, Los Angeles 2023, Los Angeles 2024, Los Angeles 2026, New York 2026, Oklahoma City 2025, Toronto Waterfront 2019, Toronto Waterfront 2022), which leaves 189 editions of 25 courses and 342 same-course pairs. Within-course slopes demean by course, weight each edition equally, and resample whole courses (4,000 draws). Curvature uses a within-course quadratic. The heat signature applies the within-course slope to each section's median relative pace in shape editions. This is not the prespecified weather screen, which remains the adjusted analysis.
- **Matched first 20 km.** Bands use 5–20 km pace. Cells are edition × band with at least 100 finishes, and the page draws courses with at least three such editions and 1,000 finishes.
- **Eras.** The eras compare 2015–19 editions with 2022–26 editions of the same course. A course counts only when eligible/raw records are at least 95% in both periods. Changes are means across courses, with a course bootstrap of 10,000 draws.


## From the half to the marathon (October 30, 2026)

Added by pull request #85 (merged as `a2c6e507`, October 30, 2026). The story's data, policy, pairing rules and both verification layers are in [the half marathon](HALF_MARATHON.md), which also says what the page states while each guard holds or fails ([what is published](HALF_MARATHON.md#what-is-published)); its method is on `/methodology#story-half-to-full`.

- **Registry.** `lib/stories.ts` entries carry `source?: 'insights' | 'half'` (default insights), and `storyPublished(story)` reads the verified half manifest for a half story and the insights manifest otherwise. Every story gate uses it: `app/stories/[slug]/page.tsx`, `app/stories/page.tsx`, the sitemap (`lib/seo-routes.ts`), `/methodology` (`MethodsStories` lists the insights files; the half files are under `#downloads-half`) and `scripts/build-og-images.cjs`. Its words come from the half nuggets (`lib/nuggets/half.ts`), not from the `insight()` readers: the title follows `half.extra` (its plain fallback while the guard fails), and the search description is `half.extra`'s reading while it holds, else `half.sexes`'s while that holds, else the neutral line (the Fallbacks bullet below; round 4 review, October 31, 2026: this line had said the description followed `half.extra` alone).
- **Chapter 11.** The story opens chapter 11, "The next one" (`lib/chapters.ts`), before "Where runners improve" and the planner; the chapter's lead is the story's reading, so the home guide's and `/research`'s chapter 11 rows repeat its figure and key as a link (`data-half-link`). The chapter's tools hand back to it (`back: '/stories/half-to-full'`), and `verify-chapters` pins its neighbours.
- **The page** (`components/story/bodies/HalfToFullBody.tsx`, root `data-half-scope="linked"`): the reading, then beat 1 `#after`, the twenty five-minute windows of half time from 1:10 to 2:45 as a profile with a needle (the typical marathon, the middle 8 in 10, double the half), its readout and one sentence under it that follow the needle, "Not a prediction." and a link to the predictor that names the half it opens ("A 1:45 half in the Finish-time predictor →", `t=H:MM:00`; post-merge review, round 4, October 31, 2026; "Your 1:45 half" until its round 4 review, though the needle opens on 1:45 before the reader sets any half); beat 2 `#women-men`, recorded women's and men's marathons after the same half, opening on a guess; then the All numbers fold. The slider's spoken value names each value's measure ("After a 1:45 half: typical marathon 3:54; 8 in 10 marathons 3:35 to 4:23; 65% under 4:00" on `half-dataset-20261030-1904` with the person IDs v4, the `spoken` field of the Scrubber's points), since the chart's key is hidden from assistive technology and the readout's keys alone did not say that 3:54 is the typical marathon (round 4); where a window holds fewer than 300 pairs it adds the key's words, "… from fewer marathons", the cue the faint wash gives a sighted reader (round 4 review; on the first pin the 1:10 and 2:30 to 2:45 windows, and on the v4 build none of the five-minute windows, the smallest holding 353 pairs). The readout's third column is keyed "Round time" with the time in its value, "65% under 4:00" at 1:45 on the v4 build (round 5 review, October 31, 2026, on the first pin: keyed per point, "Under 4:00" over "67%", the share jumped up at each half-hour switch, 41% under 4:00 at 1:50 then 75% under 4:30 at 1:55, as if the slower half did better). The slider's live line speaks only for a move its own value does not announce (a hover, or a tap that left focus elsewhere) and empties four seconds later, so a key press reads the sentence once (round 5 review; `Scrubber`, shared with `/half`). At the needle's first stops (1:10 to 1:20 on a phone) the hour labels stay on the left, just past the needle's last such stop (`scrub.flipGrid: 'needle'`, `Gridlines` `flipTo`), where the plot is empty; flipped to the right ends they had sat on the band and the dashed double-the-half (round 4 review). A label whose place there meets the data at some width is left out at those stops, its gridline kept: "3:00", which sat on the typical line and the band, its halo notching the line (`components/viz/grid-crowded.ts`, worked out on the server, so the analyses that ship `LineProfile` as script carry none of it; round 5 review). The right end of its line was clear, but a figure's gridline labels share one edge (lint-layout check 12). Without JavaScript the needle stays as a still marker over its readout: the crown under the axis, the dek's "Slide from …" and the hero's "Find your half below." are hidden, and the slider is no focus stop (`Beat` `how`, `.js-only` and the layout's no-script style; round 5 review). The minutes over double in the readout are the window's typical marathon as printed minus double its half (`windowOverDouble` in `lib/tools/half-to-full.ts`), so the numbers on screen add up. The scope chip ("Includes unverified half results") follows the dek, and "records linked by name" links to `/methodology#half-linking` on its first mention.
- **Fallbacks.** Each slot follows its nugget's guard: when `half.extra` fails, the H1 is its fallback, the hero figure is the neutral count of pairs (with its own key, also in the chapter 11 rows, the next cards and the `/half` night card), there is no ruler, the sentence under the profile (the window's minutes over double and how many came in under double) is not shown, so the foot is "Not a prediction." and the predictor link, no table row is marked as the reading and the `half-double` card is withdrawn (post-merge review, October 30 and 31, 2026); when beat 1's `half.range` fails, its heading falls back and its dek only says how to use the chart (with JavaScript only, since round 5). The search description carries `half.sexes`'s reading, with "records linked by name", while `half.extra` falls back and `half.sexes` holds (as the weather story's carries its held reading), else the neutral line (round 4, October 31, 2026). `verify-nuggets` (`scripts/nuggets/half.cjs`) recounts every slot.
- **The guess** (`components/ui/GuessFirst.client.tsx`, shared with the home page and round numbers): after Lock it in or Skip, focus moves to the verdict (`tabIndex=-1`), which a screen reader then reads in place of a live region (focus had dropped to the page's body); without JavaScript the guess shows itself as Skip would: the answer from a `<noscript>` under the question, the truth's dots lit (`is-truth-ns` on the server markup) or its ruler mark shown, its count and key from `<noscript>`s, and the layout's no-script style hiding the buttons, the readout, the slider and the You rings, so the static page carries the reading that holds and its picture agrees with it (round 4, October 31, 2026; the chart had kept the unanswered state, 30 dots ringed You over "About 1 in 10 did.", until the round 4 review). The same holds on `/` and round numbers, which share the component. The beats keep their order; leading with the guess is the owner's editorial call.
- **Ways in.** Who holds pace's like-for-like beat links the story's `#women-men` with a stated direction, "For records linked by name: recorded women’s marathons had fewer sustained slowdowns after a half marathon in the same time, too →" (the group and the measure named, so "too" is not read as the second-20K bars above it or "fewer" as the recorded men of the H2 just above; the scope as the term link; round 4 review added the subject), only while its own H1 (`holds.title`), the beat (`holds.unmask`) and `half.sexes` hold, else "Recorded women and men after a half marathon in the same time →" (round 4; it had read "After the same half marathon, too" under no guard; round 6, October 31, 2026, named the half's time: under "Same race, same finish minute", "after the same half marathon" read as the same half-marathon race, which the comparison never matches). `/half`'s round-times beat ends on "Round times in the marathon: Round numbers →", a pointer with no figure.
- **Script.** The profile is drawn on the server; `components/half/PredictorLink.client.tsx` only follows its needle (the slider's `aria-valuenow`). Drawing it in the client had put `LineProfile` into the story route's chunk, which every story page loads (S8; [operations](OPERATIONS.md#first-load-budgets-s8)).
- **Checks.** `verify-nuggets` recounts every half nugget from the published files; `verify-half` checks the files, the flagship's guard battery and, with `--html`, the chip, "records linked by name", "Not a prediction.", the `data-half-link` rows on the export, and since round 4 the description, the guess's no-script answer and who holds pace's way in (with its subject, since the round 4 review) against their guards; S6 checks the page's section signals and that the guess writes no storage and sends no event.
- **Limits.** Linked records are candidates, not verified people, and the pairs describe what went together, not why; the page never says records "ran". Sustained slowdown stays a marathon metric, measured on the marathon of each pair.

## Over the years (November 19, 2026)

Added on the adoption branch of `pace-notes-marathon-half-20261113-1113` (`claude/release-20261113-m5`; not merged, not deployed). Four stories read the linked-records family (`public/data/linked/`, contract [linked records](LINKED_RECORDS.md)) and open chapter 10, "Over the years", in part two after the weather; "Your race" and "The next one" became chapters 11 and 12.

| Story (route) | File | Reading (nugget) | Beats |
| --- | --- | --- | --- |
| Fast years and slow years (`/stories/fast-and-slow-years`, the chapter's lead) | `editions.json`, `checks.json` | `years.beyond`: race-years more than 2% off the race's other years; H1 `years.title` | the race picker over every race with a readable year (default: the race with the most edition rows), `#heat` (`years.heat`, the race window's temperature bands), `#field` (`years.field`, the whole field's sustained-slowdown check, drawn for the default race) |
| Race to race (`/stories/race-to-race`) | `races.json` | `races.faster`: races read faster; H1 `races.title` | `#races`: every race and series in label order with its interval, trail and mountain courses set apart, "Not a ranking, and not a time converter" |
| Recorded bests (`/stories/recorded-bests`) | `bests.json`, `recorded_again.json` | `bests.second` (the guess's truth); H1 `bests.title` | the guess, `#later` (`bests.later`, by recorded marathon against order alone), `#again` (`again.finish`, recorded again by finish group) |
| Getting older (`/stories/getting-older`) | `age.json`, `recorded_again.json` | `age.fifty`: the change per year at 50 to 54; H1 `age.title` | `#across` (`age.across`, recorded men against different men from 45), `#again` (`again.age`, recorded again by age) |

- **Registry.** `source: 'linked'` in `lib/stories.ts`; `storyPublished` reads the linked manifest (`lib/linked-server.ts`, which binds every file by bytes and sha256 and the release tag). The marathon stories' methods topic and the downloads list only `insights` stories; the chapter's methods are `components/methods/MethodsLinked.tsx` (`#linked-records`, each `#story-<slug>`, `#linked-reviews`, `#linked-seen-again`, `#linked-high-links`).
- **Seen again.** `/stories/final-kick#seen-again` (`again.slowdown`, `return.json`): finishes with a sustained slowdown against matched finishes without one, seen in another recorded marathon within two years.
- **Fallbacks.** A year, race or row whose verdict is `null` states no reading: the year picker leaves it out (a "no reading" tick), the race and recorded-again rows show their interval and the words "No reading". Each nugget's fallback is a neutral count; `scripts/nuggets/linked.cjs` recounts every guard and verdict from the files and renders each fallback.
- **The helper.** `linkedEditionReading(label, year, series?)` gives a course page or a race report the words of an edition's verdict, chip- or net-timed editions only.

## Reproduce

```bash
python -m pip install -r analysis/requirements.txt
python -m unittest discover -s analysis -p 'test_insights.py'
python analysis/build_insights.py                      # all families → public/data/insights (reads analysis/marathon-cohort and public/data/runner-context;
                                                       # --data-root and --cohort name other folders; about 11 minutes and 5 GB)
python analysis/download_release.py --bundle CORE --output /tmp/release
python analysis/build_course_geometry.py --profiles /tmp/release/course_profiles.parquet
python analysis/build_course_terrain.py --profiles /tmp/release/course_profiles.parquet \
    --corrections analysis/course_terrain/corrections.json \
    --output public/data/insights/tools/course-terrain.json   # the terrain splits, same pass
python analysis/build_insights.py --only manifest      # re-bind course-geometry.json and course-terrain.json
node scripts/verify-insights.cjs                       # independent recount (about 2 minutes); its name guard reads the runner lookup (below)
```

The full sequence, including a release change, is the [data story refresh](OPERATIONS.md#data-story-refresh). `--only family,...` rebuilds selected families and keeps the others listed in the manifest only if their bytes still match. Family files contain no build timestamps, so a rebuild from the same cohort and runner context is byte-identical. The **Story analyses** workflow (`.github/workflows/insights.yml`) rebuilds everything into a temporary directory, recounts it, and compares the family files byte for byte. `npm run verify:data` runs `verify-insights.cjs`.

## Verifier

`scripts/verify-insights.cjs` reads every edition file of the marathon cohort through `scripts/lib/cohort.cjs` (233 files under `pace-notes-marathon-half-20261113-1113`; the reader checks each file's size and SHA-256 before decoding it) and rebuilds the eligible cohort and the duplicate and start-offset screens. Before that it checks the bindings: the cohort and runner-context manifests' digests, every script digest, and the edition policy (the published list hashes to the policy digest the cohort states; a counted edition is not on it, an own-record edition is on it with its flag, and every edition without a cohort file is on it in the same category). It also recounts the cohort's linkage (keyed records, runners, runners with two or more counted records). It then recounts, independently of the Python builders:
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

**The name guard.** The cohort holds no names, so the guard reads them from where the release's names are; it reads every source it is given and needs at least one. First, the runner lookup, through the lookup's own Node reader (`scripts/lib/lookup-files.cjs`, which checks every file it opens against the manifest's hash chain): the folder the environment variable `PACE_NOTES_LOOKUP_DIR` names (the `runners` folder of a lookup build) or, without it, `public/data/runners` once that is a schema-2 lookup; it must be the adopted release's. Each published string is asked of it as written and in normalised form, and matches when some search name has exactly its search words (word order, case, accents and a repeated word aside), over marathon and half results. Second, kept for now, a names file named by `PACE_NOTES_NAMES_FILE` (gzip text, one recorded marathon name per line, written from the adapted input by `scripts/charts/extract-names.py` with a sidecar `<file>.json`; the guard refuses a file whose sidecar names another adapted input than the cohort's): read as well whenever the variable is set, and alone while no schema-2 lookup can be read. The guard is the verifier's last check and is never skipped: without a source the verifier fails. Five reviewed coincidences are allowed, each only while the string is a race label of the cohort, one of the manifest's fixed sex and age-band labels or a class code of the audited terrain registry (read November 14, 2026, `pace-notes-marathon-half-20261113-1113`): "Paris", "Madrid" and "London" (race labels; a record of another race, or one written with the word twice, carries the label as its recorded name), "Unknown" (the age-band label; a placeholder name on the runner lookup's reviewed list, so only the names file holds it) and "b" (the terrain registry's class code; a few records are recorded as "B" or "B B").

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

The lines the post-merge half review (branch `fix/half-followups`) rewrote are kept word for word, as `main` held them at `f8869591`, in [history](history/half-followups-2026-11.md) (moved November 4, 2026).

### Moved November 19, 2026 (adoption of `pace-notes-marathon-half-20261113-1113`)

The text each line below gives was replaced on November 19, 2026, when the story and tool families moved from the runner lookup's shards to the marathon cohort and were rebuilt on `pace-notes-marathon-half-20261113-1113`. Each is kept word for word.

- **The opening paragraph: where the stories read their finishes:**

  > Eight stories are built from the verified runner shards, each with its own builder module,

- **Cohorts and screens: where the eligible finishes come from:**

  > All stories start from the eligible finishes in the adopted runner manifest: `eligible_records` in `public/data/insights/manifest.json`, whose `cohort` block also gives the editions, cities, recorded sex and exact-age counts. `analysis/insights_data.py` re-reads every `public/data/runners` shard, checking its size and SHA-256, and re-checks the timing contract and the raw and eligible counts.

- **Cohorts and screens: the counts of the adopted release:**

  > Under `private-export-20261021-1050` (the files' `release_tag`): 4,108,749 eligible finishes in 215 editions of 27 cities, and the duplicate screen is empty, so the story cohort is every eligible finish. The start-offset screen lists 15 editions (138,385 finishes: Madrid 2013–18, New York 2006, Prague 2016–19 and Warsaw 2019 and 2023–25), leaving a shape cohort of 3,970,364 finishes in 200 editions of 26 courses; the grid screen then removes Valencia 2021 and Warsaw 2022, leaving 3,954,255 finishes in 198 editions for the final kick. Earlier releases' screens are under [history](#history-earlier-releases).

- **What manifest.json binds:**

  > - the exact runner manifest (SHA-256 and `as_of`) and the runner-context manifest SHA-256;

- **What manifest.json binds: source scripts:**

  > - the source-script hashes;

- **How the site reads the files:**

  > The site reads the files at build time through `lib/insights-server.ts`, which re-checks the release, the runner manifest hash and every file hash.

- **Final kick: the grid screen:**

  > the editions they remove are published in `grid_screen` (1050: Valencia 2021 and Warsaw 2022, leaving 3,954,255 finishes in 198 editions;

- **Final kick: recovery:**

  > (`recovery.room_n` in `kick.json`; 1050: 194,798 finishes, 12.8% recover;

- **Final kick: recurrence:**

  > - **Recurrence.** Recurrence pairs adjacent eligible races of one screened candidate profile, 1–3 years apart, using only profile-years with exactly one eligible finish (`recurrence.pairs`; 1050: 627,833 pairs;

- **Courses: identification courses:**

  > - **Course identification.** For the courses with at least three shape editions (`identification` in `courses.json`: 22 under 1050, 24 under 1652, 22 under 0934), each edition is matched to the nearest course centroid.

- **Courses: identification result:**

  > The chosen variant is fade removed with a distance-weighted Euclidean distance; under 1050 it names the right course for 114 of 193 editions (146 in the top three; chance is 1 in 22);

- **Courses: weather:**

  > - **Weather.** Weather is read from the verified runner-context shards: the supplied modelled hour at the scheduled start. The weather race name must match the edition race.

- **Families: course art:**

  > the others are listed under `omitted` with the context's reason (under 1050: Washington, whose supplied profile is named "Marine Corps Marathon"). |

- **Reproduce: the build command:**

  > python analysis/build_insights.py                      # all families → public/data/insights
  > 

- **Reproduce: the recount command:**

  > node scripts/verify-insights.cjs                       # independent recount (≈30 s)
  > 

- **Reproduce: byte-identical rebuilds:**

  > Family files contain no build timestamps, so a rebuild from the same shards is byte-identical.

- **Verifier: what it reads:**

  > `scripts/verify-insights.cjs` streams every runner shard (7,885 under 1050; 7,881 under 1652; 7,766 under 0934) and rebuilds the eligible cohort and the duplicate and start-offset screens. It then recounts, independently of the Python builders:

- **Verifier: provenance and structure:**

  > For every file it also checks provenance and structure: finite numbers, groups of at least 100, no identifier or name keys, no recorded runner names in text, and no release-tag strings in copy.

