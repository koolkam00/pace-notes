# Pace Notes redesign: the insight nuggets

Read-only research for the redesign of every analysis-like page, written October 16, 2026. Pages were read from `feat/insights-only` (`/home/user/wt/insights`, commit `cce5408`) and numbers come from its `public/data` files.

**Every "Now" value below comes from the files currently checked in, which are release `private-export-20260912-0934`.** That release has 4,462,379 raw records, 3,517,336 eligible finishes and 256 runner editions. The new release `htw-db-2026-10-16-1652` is being adopted in parallel (4,915,355 results, 34 cities, 287 race-years), so every value will change. The values are here so the copy can be checked and the visual scale chosen. Never type them into the page: each nugget names the field or expression that produces it.

## How to read this

**Path roots.** `I/` = `public/data/insights/`, `P/` = `public/data/packs/`, `PG/` = `public/data/packs/ext_personalized_guide/`, `AF` = `public/data/all-finisher-context/evidence.json`, `FS` = `public/data/fast-start/all-finishers.json`, `ST` = `public/data/study/evidence.json`, `WX` = `public/data/weather/evidence.json`. Expressions are JavaScript-like.

**Shard lookups.** Never assume a shard position. Look up the All courses shard with `PG/summary.json → cities.find(c => c.city === 'All courses').file` (today `tables/city_00.json`), and the checkpoint shard with `.checkpoint_file`.

**Language rules** (AGENTS.md, DESIGN_SYSTEM.md and the owner's October 16 decision):
- Use observed and association language only. Never causal wording, never "your chance", never "the wall" (say "sustained slowdown").
- Counts are finishes, not runners.
- Avoid rank words for courses ("fastest course", "best"). Sorted dot strips are fine.
- Methods, definitions and cohort talk go only on `/methodology`. A nugget links its term (for example `/methodology#sustained-slowdown`) and says nothing more about method.
- Distances and paces go through the unit components (miles by default). Data stays metric.

**Marks.**
- ★ marks the page's lead nugget, the one the page should open with.
- **Guard** gives the condition the sentence needs before it is shown. When the new data breaks a guard, the page shows the fallback wording.

---

## 0. A nugget contract (so nothing is hard-coded)

Today many story titles are literal strings that state a direction or a number: "Five times as many *Cliffs* among men", "the tallest tower is *2:59*", "The cushion is widest before *5:00*", "The gap holds *from 2:40 to 6:00*", "nearly half the field". With a new release they can silently become false. The redesign should put every headline number and directional claim through one build-time module, for example `lib/nuggets.ts`, read on the server from the verified files:

```ts
type Nugget = {
  id: string;            // 'kick.magnet'
  page: string;          // '/stories/final-kick#magnet'
  values: Record<string, number | string>;   // computed from the expressions in this file
  guard: boolean;        // the direction or threshold the sentence asserts
  headline: string;      // built from values, e.g. `${shareInWords(v.share)} finishes speed up…`
  fallback?: string;     // neutral wording when guard is false
  viz: 'bigNumber' | 'unitDots' | 'tapCompare' | 'scrubber' | 'scrollReveal' | 'guessFirst' | 'ghostRace' | 'swipeDeck';
  term?: string;         // methodology anchor
};
```

- The verifier (`scripts/verify-insights.cjs` or a new `verify-nuggets.cjs`) should recompute each value from the files and fail when a guard and its headline disagree.
- One module also lets the home page, the indexes, the share cards (`public/og`) and the per-page "3 things" decks reuse the same sentence.

---

## 1. Narrative order: one marathon, start to finish

The site reads best as **one race**. Each chapter is a stretch of the course, and the pages inside it are the km markers.

- **Progress.** On phones a thin route line along the top edge fills as the reader moves through the chapters (the same `CourseArt` route, with the runner dot at the reader's chapter).
- **Chapter end.** Each chapter ends with a "Next stretch →" card that carries the next chapter's lead nugget as a teaser number.

| # | Chapter (stretch of the race) | Pages, in order | Lead nugget it opens with |
| --- | --- | --- | --- |
| 0 | **Prologue: the start line** | `/` | Totals, then "3 in 10 finishes had a sustained slowdown" |
| 1 | **The field** | `/finish-times` → `/stories/race-replay` → (years, from `/stories/courses#years`) | Median 4:10. The busiest single minute is 3:58 |
| 2 | **The first 5 km** | `/analyses/starting-pace` (with `final-kick#bank`) → `/analyses/downhill-start` | Bank 2:42 early, give back 7:42 after 20 km |
| 3 | **The shape of a race** | `/stories/pacing-types` → `/analyses/pacing-pattern` | Only about 1 in 25 finishes ran the second 20 km faster |
| 4 | **Halfway to 30 km** | `/analyses/checkpoint` → `/stories/places` → `/tools/projector` | On even 4:00 pace at 30 km, 13% finished under 4:00 |
| 5 | **After 30 km** | `/slowdown` → `/stories/final-kick` (chapters 2–4, 6) → `/analyses/where-time-is-gained` | 72% of sustained slowdowns begin at 30 km or later |
| 6 | **The finish line** | `/stories/final-kick#magnet` → `/stories/round-numbers` → `/analyses/finish-time-context` | Three in four finishes speed up over the last 2.2 km |
| 7 | **Who holds pace** | `/stories/who-holds-pace` → `/analyses/age-and-pacing` | Same finish time: 20% of women's and 45% of men's finishes had a sustained slowdown |
| 8 | **Where you run** | `/stories/courses` (chapters 1, 2, 5) → `/analyses/course-comparison` → `/analyses/hills-and-pacing` → `/courses` → `/courses/[city]` | The pacing shape alone names the course 55% of the time |
| 9 | **The weather** | `/stories/courses#weather,#heat` → `/analyses/race-day-weather` → `/analyses/warming-and-pacing` → `/analyses/wind-and-pacing` → `/tools/weather-match` | 197 of 225 same-course hot/cool pairs: the warmer year slowed more |
| 10 | **Your race** | `/runners` → `/tools/split-check` → `/report` | Personal "race wrapped" cards |
| 11 | **The next one** | `/analyses/finding-improvement` → (recurrence, habits, spacing) → `/tools/plan` → `/tools/pace-band` / `/tools/course-chooser` / `/tools/predictor` | Improvers found 43% of their gain in the last 29% of the distance |
| — | Reference | `/methodology`, `/about`, `/tools/pace-calculator`, `/tools/qualifying*`, pace charts | — |

**Why this order.**
- It follows the clock. Each chapter answers the question the previous one raises: "most people slow" leads to "when?", then "who?", then "where?", then "what about me?", then "plan the next one".
- The planner becomes the finish line of the reading journey, not only a door on the home page. The redesign can still keep it as door 1 on the home page.
- `/stories/final-kick` and `/stories/courses` are long. Each covers two or three chapters' worth of findings, so this order splits them across chapters by anchor. The alternative is to split them into separate pages (see section 3).

---

## 2. The nuggets, page by page (in narrative order)

### Chapter 0 · Prologue

#### `/` Home
Sources: `public/data/runners/manifest.json`, `I/manifest.json`, `ST`, `P/ext_pacing_shapes`, `I/finish-times.json`.

1. ★ **Scale, said plainly.** "4.9 million recorded marathon results from 34 cities and 287 races. Of those, 3.5 million finishes have every 5 km split."
   - Field (results): `runners/manifest.json → raw_records`.
   - Field (races): `editions.length`.
   - Field (cities): `new Set(editions.map(e => e.city)).size`.
   - Field (split-complete finishes): `eligible_records`.
   - Now: 4,462,379 results; 256 editions; 3,517,336 eligible. Under the new release: 4,915,355 results, 34 cities, 287 race-years.
   - Viz: an odometer counter that rolls up once on first view (stops under reduced motion). Under it, a 1-line "34 cities · 287 races" bib row.
2. **Most finishes don't hold their pace.** "About 3 in 10 recorded finishes had a sustained slowdown."
   - Field: `ST → rate` (also `detected`, `n`).
   - Now: 30.4% (1,070,946 of 3,517,336).
   - Viz: a 10×10 grid of tiny runner glyphs where 30 turn orange as the section scrolls in. Tap the grid to open `/slowdown`.
3. **Negative splits are rare.** "About 1 in 25 finishes ran the second 20 km faster than the first."
   - Field: `P/ext_pacing_shapes/tables/patterns.csv → value where label = 'Faster second 20 km'`.
   - Now: 3.9% (137,634 of 3,517,336).
   - Viz: **guess first**. A slider asks "What share ran a faster second half?" The reader drags, then the true value snaps in beside their guess (NYT "You Draw It" pattern). This is the best opening hook for the whole site.
4. **The 3:58 minute.** "The single busiest finishing minute is 3:58, for recorded women and men alike."
   - Field: `I/finish-times.json → argmax(histogram, h => h.all).minute`. Repeat with `.women` and `.men`.
   - Now: 238 (3:58) in all three.
   - Guard: say "alike" only when the three argmax values are equal.
   - Viz: a mini histogram sparkline with one tower lit (it links into Chapter 1).

### Chapter 1 · The field

#### `/finish-times` Marathon finish times
Source: `I/finish-times.json` histogram plus `I/manifest.json → cohort` totals (logic in `lib/finish-times-summary.ts`).

1. ★ **The typical marathon.** "Half of all finishes took longer than 4:10. Recorded women's median was 4:31, men's 3:59."
   - Field: `getFinishTimeSummary().groups[g].median` (nearest-rank percentile over `histogram[].{all,women,men}` with `cohort.after_duplicate_screen / women / men` as totals).
   - Now: 4:10 · 4:31 · 3:59.
   - Viz: a horizontal strip of 100 dots placed at the 1st–99th percentile finish times. Tap "Women / Men / All" to morph the strip (tap-to-compare), with the median dot labelled.
2. **Even women's busiest minute is just under 4:00.** "Women's median is 4:31, yet their most common finishing minute is 3:58, the same as men's."
   - Field: `argmax(histogram, h => h.women).minute` vs `groups.women.median`.
   - Now: 3:58 vs 4:31.
   - Guard: the women's peak is below 240 and the women's median is above 240.
   - Viz: the women's histogram drawn as a silhouette, with the median line and the peak tower in different colours. A tap toggles men.
3. **Sub-3 is 1 in 20.** "5.1% of finishes were under 3:00. Under 4:00: 42%. Under 5:00: 81%."
   - Field: `groups.all.under[m].share` for m ∈ {180, 240, 300}.
   - Now: 5.1% · 42.3% · 81.0%.
   - Viz: a thumb-slider "your time" with a big "faster than X%" readout. It is a plain calculation from the reader's input, so it needs no badge, and the share wording must stay "of finishes".
4. **The front moved, the back didn't.** "Since 2019, the 10th-percentile finish is about 7 minutes faster on every course compared. The 90th percentile shows no clear change."
   - Field: `I/courses.json → years.eras.summary.p10.change` and `.lower`; `.p90.change` and `.p90.ci95`.
   - Now: −7.1 min, faster in 12 of 12 courses; p90 +1.9 min (interval −2.9 to +6.5).
   - Guard: `p10.ci95[1] < 0` and `p90.ci95` straddles 0.
   - Viz: two arrows per course (p10 and p90, 2015–19 → 2022–26). Scroll-driven: the p10 arrows all slide left together while the p90 arrows wobble.

#### `/stories/race-replay` Watch a marathon unfold
Source: `I/replay.json` (plus `replay/<slug>.json` samples).

1. ★ **When the first runner finishes, much of the field hasn't reached halfway.** "When the first London 2026 finish crossed the line, 47% of the field had not reached 20 km."
   - Field: `editions[i].moments.not_past_20_at_first / editions[i].finishes`.
   - Now: London 47.2% (26,768 of 56,762), New York 32.7%, Chicago 37.2%, Berlin 29.4%, Boston 13.4%, Valencia 9.5%.
   - Guard: pick the edition by data (`argmax` of the share), not the literal 'London'. Say "nearly half" only when the share is ≥ 0.45.
   - Viz: the replay frozen at that clock moment, with a pulsing marker on the 20 km mat and a big "47%" overlay. Swipe sideways to switch race (swipe deck).
2. **Even runners pass people without speeding up.** "Real 4:30 finishers reached 20 km 5 to 9½ minutes ahead of an even 4:30 schedule, in every race replayed."
   - Field: `editions[].ghosts.find(g => g.target_s === 16200)`, then `even_20km_s − typical_20km_s`; take the min and max across editions.
   - Now: 302 s (Berlin) to 568 s (Paris); London 489 s.
   - Guard: every edition has `typical_20km_s < even_20km_s`.
   - Viz: a ghost race. Two dots on one line, the even "ghost" and the "typical" runner. Drag the clock to watch the typical runner lead, then the ghost close in.
3. **The late-race crawl is mostly who's left.** "At 5:00 on the clock in New York 2025, about two-thirds of the drop in on-course speed reflects who is still out there, not people slowing down."
   - Field: `editions[].composition.find(r => r.clock_s === 18000).composition_share`.
   - Now: NY 66%; range 62% (London) to 81% (Boston).
   - Viz: a stacked bar that splits the "speed drop" into "who's left" and "slowing". It animates from one block into two as it scrolls in.
4. **Same split, different races.** "In London 2026, 1,006 finishes passed 10 km within the same 30 seconds; the middle 80% of them finished 49 minutes apart."
   - Field: `editions[].pack.n`, `.finish_window_min`.
   - Now: London 48.7 min; New York 50.5; Boston 22.2.
   - Viz: a "pack explodes" fan. 30 dots leave the 10 km mat together and spread to the finish (scroll-scrubbed).
- Also usable: "In all 177 editions compared, the field spreads out more after 20 km than before" (`stretch.wider_after_20 === stretch.editions.length`). It fits as a one-line footnote under the replay.

### Chapter 2 · The first 5 km

#### `/analyses/starting-pace` Fast starts, late slowing (merged with `/stories/final-kick#bank`)
Sources: `FS` (descriptive groups) and `I/kick.json → bank` (same race, same 5–20 km pace: the cleaner comparison; lead with it).

1. ★ **Banked early, spent later.** "Finishes whose first 5 km was more than 10% faster than their 5–20 km pace banked 2:42, then lost 7:42 more after 20 km than finishes in the same race at the same pace, and finished 5:00 behind."
   - Field: `I/kick.json → bank.bands.find(b => b.label === 'More than 10% faster')`, fields `open_s`, `after20_s`, `finish_s`.
   - Now: −162 s / +462 s / +300 s.
   - Guard: `open_s < 0 && finish_s > 0`.
   - Viz: a ledger bar. A green "banked" chip slides in, then a larger orange "spent" bar pushes it off screen, leaving a net "5:00 behind" bib. This is the site's signature counter-intuitive moment.
2. **The best openings were slightly slower than the 5–20 km pace.** "The best average finish went with a first 5 km 2–3% slower than the 5–20 km pace."
   - Field: `bank.curve` argmin of `finish_s`, giving `lo` to `lo+1`.
   - Now: `lo = 2` (finish −106 s vs peers).
   - Viz: a U-curve with a thumb scrubber along the "first 5 km vs 5–20 km pace" axis. As the thumb moves, the bib shows "finished X:XX ahead/behind" and the curve's lowest point glows.
3. **Fast starts slow sooner.** "When a fast-opening finish had a sustained slowdown, 30% began at 20–25 km; for steady openings, 4%."
   - Field: `FS → rows.find(All courses/all/all).groups.find(g => g.band === 'fast10').onset[0] / Σonset`; same for `steady`.
   - Now: 30.0% vs 3.8%.
   - Viz: two stacked "onset" bars sharing one 20 → 40 km axis. Tap a band chip (six opening bands) and the bar re-fills.
4. **About half of very fast openings ended in a sustained slowdown.** "49.6% of very fast openings ended with a sustained slowdown, against 24.5% of steady ones."
   - Field: `groups[fast10].slowdown_n / n` vs `groups[steady]`.
   - Now: 49.6% vs 24.5%.
   - Caution: this raw contrast mixes slower runners into the fast-opening group (median finish 5:46 vs 3:56). The matched version is `kick.bank.bands[0].slowdown` 53.5% vs `expected` 36.6%. Show the matched one as the headline and the raw one only in the explorer.

#### `/analyses/downhill-start`
Source: `AF → rows[All/all/all/all].downhill` (terrain `downhill` = first 5 km net ≤ `downhill_first5_net_below_m`).

1. ★ **A downhill start didn't mean a faster opening.** "On downhill-opening courses, the share of finishes that opened more than 5% faster than their 5–20 km pace was the same as elsewhere (about 16%)."
   - Field: `Σ n for downhill:fast10 + downhill:fast5` over `Σ n for downhill:*`; the same for `other:*`.
   - Now: 15.9% vs 15.7%.
   - Viz: two 100-dot grids side by side, "downhill start" and "other courses", with the fast openers lit. Same count, which is the point.
2. **Within each opening band, the downhill-start courses slowed less.** "For steady openings: 22.5% sustained slowdown on downhill-start courses vs 28.7% on others."
   - Field: `downhill.find(id === 'downhill:steady').slowdown_pct` vs `'other:steady'`.
   - Now: 22.5% vs 28.7%. It holds in every band.
   - Guard: say "every band" only if it holds for all 6. Name the cities from `editions` with `opening_net_m ≤ −25`; today these are Boston, Sydney and Warsaw (3 cities), so say "three courses".
   - Viz: a dumbbell row per opening band (downhill vs other), tap a row to expand.

### Chapter 3 · The shape of a race

#### `/stories/pacing-types` Six ways to run the same race
Source: `I/archetypes.json` (shape cohort `cohort_n`).

1. ★ **Even pacing fades with the clock.** "Among 2:30–2:45 finishes, 63% held a near-even pace (Metronomes); among 6:15–6:30 finishes, 7% did."
   - Field: `river[0].shares[m]` and `river.at(-1).shares[m]`, where `m = archetypes.findIndex(a => a.slug === 'metronome')`.
   - Now: 63.0% → 6.7%.
   - Viz: a vertical river that scrolls with the reader. Finish bands run top to bottom, the Metronome stream narrows, and a sticky label shows the band.
2. **Cliffs are mostly men's.** "At the same finish times, men's finishes were Cliffs five times as often as women's."
   - Field: `gender.men.standardized_shares[c] / gender.women.standardized_shares[c]`, where `c = slug 'cliff'`.
   - Now: 5.04% vs 1.00%, so 5.0×.
   - Guard: replace the literal title "Five times as many" with `countWord(Math.round(ratio))` and show it only when the ratio is ≥ 2.
   - Viz: tap-to-compare. One big glyph count of 100 runners: tap "Women" and 1 turns red, tap "Men" and 5 turn red.
3. **Habits repeat.** "After a Cliff, the next linked race was a Cliff again 13% of the time: 4 times its overall share."
   - Field: `transitions.rows[c].repeat_share`, `/ overall_share`; overall `transitions.repeat_share`.
   - Now: 13.4% vs 3.3% (4.1×); any type repeats 38%.
   - Viz: a 6×6 transition grid drawn as a "from → to" chord-lite. Tap a type to light its row.
4. **Where steadiness is common.** "Half of Valencia's finishes were Metronomes; in Washington, 1 in 6."
   - Field: `courses[]` max and min of `shares[m]` (filter `finishes ≥ 10000`).
   - Now: Valencia 50.4%, Washington 16.9%.
   - Viz: a sorted dot strip of courses. Drag a type chip to re-sort.
- Personal hook for chapter 07: "Which runner were you?" The classifier (`classifier`) plus `sentences.all_even_n` (147,350 all-even finishes). Keep it, and feed it from the reader's splits.
- Supporting fact: Late faders make up 16% of finishes but 43% of all sustained slowdowns (`archetypes[late].share` vs `.share_of_slowdowns`).

#### `/analyses/pacing-pattern` Your pacing pattern (default: All courses, 4:00)
Source: `PG/<All courses file> → cohorts['all|all|all'].profiles['240'].pace[i]` = `[p25, median, p75]` s/km per section.

1. ★ **4:00 finishers didn't run 4:00 pace.** "Finishes near 4:00 ran 5–10 km at a median 5:25/km, 16 s/km faster than even 4:00 pace, and 35–40 km at 6:06/km, 25 s/km slower."
   - Field: `pace[1][1]` and `pace[7][1]` vs `target*60/42.195`.
   - Now: 325.4 and 366.4 s/km vs 341.3.
   - Viz: an even-pace dashed line with the median profile drawn over it. The section where it crosses the line is labelled "here the clock turns". Tap a target chip (3:00 / 3:30 / 4:00 / 4:30 / 5:00) and the line morphs.
2. **The spread opens late.** "The middle half of 4:00 finishes spanned 24 s/km at 0–5 km and 39 s/km at 35–40 km."
   - Field: `pace[i][2] − pace[i][0]` for i = 0 and 7.
   - Now: 24.2 vs 38.8 s/km.
   - Viz: the profile drawn as a ribbon whose width grows along the course.
3. **Hook into the types.** "Of finishes near 4:00, N% were Metronomes."
   - Field: `I/archetypes.json → river.find(r => r.lo_min === 225 or 240)` shares.
   - Now: 3:45–4:00 Metronome 38.7%; 4:00–4:15 27.0%.
   - Viz: a mini type bar under the profile, linking to chapter 3's story.

### Chapter 4 · Halfway to 30 km

#### `/analyses/checkpoint` From here to the finish (default: 30 km, 4:00)
Source: `PG/<checkpoint_file> → rows` with `checkpoint, elapsed (2-min band start), age='all', gender='all', trend`. Share under T = `cdf[T − cdf_min] / n`.

1. ★ **On even pace at 30 km is behind.** "Finishes that reached 30 km on even 4:00 pace (2:50–2:52) finished under 4:00 13% of the time; their median finish was 4:07:55."
   - Field: the row with `checkpoint === 30`, `trend === 'all'` and the even-pace elapsed (`240*30/42.195 = 170.6`) in `[elapsed, elapsed+2)`; then `cdf[240−90]/n` and `finish[1]`.
   - Now: 13.3% (13,181 of 99,410); 4:07:55.
   - Viz: **guess first**. "You're on 4:00 pace at 30 km. What share of finishes made it?" Then 100 dots, 13 of them green.
2. **How far ahead the half-way-odds point sat.** "Half of finishes made 4:00 from about 5–6 minutes ahead of even pace at 30 km."
   - Field: the latest `elapsed` band whose `cdf[T−90]/n ≥ 0.5`, compared with the even-pace elapsed. Interpolate between bands for display.
   - Now: band 2:44–2:46 → 63% (about 5.6 min ahead).
   - Viz: a thumb scrubber over the 30 km elapsed time. The share under the goal updates as the reader slides (the analysis's control, made tactile), with the 50% point marked on the track.
3. **The trend at the mat matters.** "Two finishes at the same 20 km time: the one whose latest 5 km sped up finished 3.6 minutes sooner on average than a steady one; the one that slowed, 11.5 minutes later."
   - Field: `P/ext_pace_trend_at_20k/summary.json → statistics.accel_diff` and `.slow_diff`.
   - Now: −3.6 / +11.5 min.
   - Viz: three runner chips "speeding up / steady / slowing" at one mat, which fan out to three finish times.
- Archive support to fold in here: "First behind the 4:00 budget at 25 km: 2.8% still broke 4:00" (`P/ext_goal_slip_recovery/tables/slips.csv`, target 'Under 4 hours', label 25).

#### `/stories/places` Pass or be passed
Source: `I/positions.json`.

1. ★ **At 30 km a minute is close to a coin flip, and at 40 km it isn't.** "Trailing by 60–90 s at 30 km, a finish still crossed first 42% of the time; from 40 km, 21%."
   - Field: `coin_flip['30'].find(r => r.gap_lo_s === 60).share` and the same for `['40']`.
   - Now: 41.6% vs 20.6%. Even 5 minutes back at 30 km: 21% (`gap_lo_s === 300`).
   - Guard: say "nearly a coin flip" only when the share is ≥ 0.4.
   - Viz: a gap gauge. A thumb slider sets the gap (0–5 min) and two chips toggle 30 km or 40 km. A coin graphic tilts toward the probability.
2. **Slowing a little still gains places.** "Because most of the field slows, a finish that slowed up to about 16% against its 5–20 km pace after 30 km still tended to move up."
   - Field: `breakeven_crossing`.
   - Now: 16.5%.
   - Viz: a break-even curve with a vertical "you hold your place" line. Drag along it and the bib shows "+N places per 100" (from `breakeven[].median`).
3. **Women gained on men in every edition.** "In all 177 editions compared, recorded women's average clock-position change after 30 km was better than men's."
   - Field: `women_ahead_editions` and `gender_editions.length`. Also: women are `women_share` of finishes but `women_share_of_surgers` of late surgers.
   - Now: 177 of 177; 32% of finishes, 41% of surgers, 9% of sinkers.
   - Guard: say "every" only when they are equal.
   - Viz: 177 tiny ticks (one per edition), all on the women's side, laid out like a barcode.
4. **Big losses for a few.** "57% moved up the clock order after 30 km, but sinkers (≥10 percentile points down) outnumbered surgers 3 to 1."
   - Field: `gained_share`, `sinker_share / surger_share`.
   - Now: 57.4%; 4.7% vs 1.5%.
   - Viz: an asymmetric histogram (gain left, loss right) with a long tail that the reader scrolls through.

#### `/tools/projector` Race-day projector (Pace Notes data)
Source: `I/tools/projector.json → validation`.

1. ★ **Even pace oversells the early miles.** "Projected from 30 km, the data range was within 5 minutes of the real finish 55% of the time; a straight even-pace projection, 41%."
   - Field: `validation.find(v => v.mat === 30 && v.variant === 'all').within_5_min` and `.even_pace_within_5_min`.
   - Now: 55.2% vs 41.0% (test years 2022–2026).
   - Viz: a mat-by-mat ladder (5 → 40 km) where two bars grow toward 100% and the gap between them is shaded.
2. **The 40 km mat knows.** "From 40 km, both projections were within 5 minutes 98–99% of the time."
   - Field: `mat === 40` row.
   - Now: 98.7% / 98.3%.
   - Viz: the same ladder; the last rung pulses "nearly settled".
- Merge note: `P/ext_checkpoint_forecast_validation` is a second validation of the same idea (median error 6.5 min at 20 km, 4.0 at 30 km). Show one.

### Chapter 5 · After 30 km

#### `/slowdown` Sustained slowdown
Source: `ST`.

1. ★ **When it begins.** "Nearly 3 in 4 sustained slowdowns began at 30 km or later."
   - Field: `timing.charts[0].rows` where `label ∈ {30, 35}` (Σ episodes / n_value).
   - Now: 72.1% (37.1% at 30, 35.1% at 35; 8.5% at 20).
   - Viz: a course line with four "onset" flags whose heights are the shares, revealed by a scroll-driven runner moving along the line.
2. **Courses differ by more than double.** "Sustained slowdown ran from 19% of finishes on one course to 47% on another."
   - Field: `overview.charts[0].rows` min and max `value`.
   - Now: Valencia 18.9% to Singapore 47.3%.
   - Viz: a dot strip of courses that links into Chapter 8. Avoid rank language.
3. **Your past predicts more than your age.** "Finishes by runners with an earlier best under 3:00 had a sustained slowdown 11% of the time; with an earlier best of 4:00 or longer, 38%."
   - Field: `figures.find(f => f.id === 'history').charts[0].rows`.
   - Now: 11.2% / 17.8% / 23.8% / 38.0%.
   - Viz: four stepped bars (a "staircase"), animated up on scroll.
4. **The threshold changes the story.** "At 25% slower for 5 km, 30% qualify. At 10% slower, two-thirds would."
   - Field: `figures.find(id === 'sensitivity').charts[0].rows` with `length === '5 km'`.
   - Now: 10% → 67.5%, 25% → 30.4%, 40% → 11.6%.
   - Viz: a thumb slider over the threshold with a big live percentage. It works as an interactive definition and links to `/methodology#sustained-slowdown`.
- Also: the year after a recorded best, the rate is 37% vs 29% in the best year (`figures[history].charts[1].rows` label 1 vs 0). Rates are higher after a best, which is a "regression to the mean" nugget; phrase it carefully.

#### `/stories/final-kick` chapters 2–4 and 6 (no second wind, the break, warning light, twins)
Source: `I/kick.json`.

1. ★ **Same pace to 20 km, 20 minutes apart.** "Finishes with the same race, recorded gender and 5–20 km pace: the ones with a sustained slowdown finished a typical 20 minutes later."
   - Field: `cost.stratified.median_gap_s`.
   - Now: 1,177.5 s ≈ 19.6 min. The example band 3:45–4:00 has 20 km medians 3 s apart and finishes 21:45 apart (`cost.bands.find(b => b.lo_min === 225)`).
   - Viz: twin runners. Two figures leave together, a 20 km split board shows identical times, then they separate; a counter ticks the gap up to 21:45.
2. **A slow 25–30 km is a warning light.** "With no sustained slowdown by 30 km, finishes whose 25–30 km was already 15–20% slower than their early pace went on to have one 65% of the time; those faster than their early pace, 3%."
   - Field: `warning.find(w => w.after === '25–30').rows` (`'15–20% slower'.later` vs `'Faster'.later`).
   - Now: 65.2% vs 2.8%.
   - Viz: a dashboard light with six positions. Tap a "how much slower at 25–30 km" chip and the light colour and percentage change.
3. **No second wind.** "Once a 5 km section was 25%+ slower than early pace, the next one stayed that slow 83–84% of the time."
   - Field: `recovery.stay[].stay`; recovery share `recovery.share_full_section_room`.
   - Now: 84.5% (from 25–30), 83.1% (from 30–35); a later full section back within 10%: 13.0%.
   - Viz: a sankey-lite with 4 states and 5 sections (`states.flows`), scroll-scrubbed section by section.
4. **Women came back more often.** "After a sustained slowdown, recorded women got back within 10% of their early pace 22% of the time; men 10%."
   - Field: `recovery.women_any` vs `recovery.men_any`.
   - Now: 21.9% vs 9.9%.
   - Viz: a tap-to-compare pair of bibs.

#### `/analyses/where-time-is-gained` The minutes that matter (default 4:00)
Source: `PG/<All courses> → cohorts['all|all|all'].near.find(n => n.target === 240)`; `above`/`below` `.durations[i]` (mean seconds per section).

1. ★ **The 5 minutes between 3:57 and 4:02 are mostly made late.** "Finishes just over 4:00 and just under it were 4:50 apart. 58% of that gap opened between 20 and 40 km, and 35–40 km alone held the most (54 s)."
   - Field: `d_i = above.durations[i] − below.durations[i]`; then Σ d, Σ d[4..7] / Σ d, and argmax d.
   - Now: 290.5 s; 167.9 s (57.8%); section 35–40 is 53.8 s.
   - Viz: a waterfall of 9 bars that build the gap section by section as the reader scrolls. Per-km density colours the bars so 35–40 reads hot.
2. **But the gap starts at the gun.** "The two groups were already 28 s apart after the first 5 km."
   - Field: `d_0`.
   - Now: 28.2 s.
   - Viz: the first bar of the waterfall, called out.
3. **The same pattern at other goals.** At 3:00, 35–40 km held 60 s of 286 s. At 5:00 the gap is spread more evenly over 20–40 km.
   - Field: the same expression for targets 180 and 300.
   - Viz: target chips that redraw the waterfall.

### Chapter 6 · The finish line

#### `/stories/final-kick#magnet` (chapters 1 and 7, and 8 moved to Chapter 11)
1. ★ **The finish-line magnet.** "Three in four finishes ran the final 2.2 km faster than their 35–40 km. In any earlier 5 km after 20 km, only 20–30% beat the section before."
   - Field: `kick.share`; earlier `magnet.slice(0, -1).map(r => r.all)` min and max.
   - Now: 74.6%; 20.1–30.5%.
   - Viz: five bars, the last one shooting up (scroll-triggered); the runner glyph leans forward on the last bar.
2. **But the kick doesn't undo a sustained slowdown.** "80% of finishes with a sustained slowdown also sped up at the end, yet only 2% ran it faster than their 5–20 km pace (24% of the rest did)."
   - Field: `kick.slowdown_share`, `kick.slowdown_final_below_baseline`, `kick.other_final_below_baseline`.
   - Now: 80.6% / 2.2% / 24.2%.
   - Viz: two thermometers per group, "faster than 35–40 km" and "back to early pace".
3. **Women out-kick men at nearly every pace.** "At a 3:30–4:00 early pace, 77% of recorded women's finishes sped up over the final section vs 72% of men's."
   - Field: `gender_kick.find(r => r.label === '3:30–4:00')`; exceptions are rows with `women <= men`.
   - Now: 77.4% vs 72.0%; the only exception is Under 2:30.
   - Viz: a dumbbell per pace band, with the exception band marked.

#### `/stories/round-numbers` The 3:59 effect
Source: `I/finish-times.json`.

1. ★ **The tallest tower against the curve.** "Between 2:59:00 and 2:59:59, 15,856 finishes landed: 1.73 times what a smooth curve expects."
   - Field: `marks` argmax of `ratio` → `.mark`, `.minute_before`, `.ratio`.
   - Now: 3:00 mark, ratio 1.73.
   - Guard: replace the literal "2:59" in the title with the argmax mark minus one minute.
   - Viz: a pinch-zoom histogram (minutes) with towers over the smooth curve. The reader taps a tower to flip it to its ratio card.
2. **Hours and half-hours pull; quarter-hours mostly don't.** "The minute before 2:45 and before 3:45 sat slightly below the curve."
   - Field: `marks.filter(m => m.kind === 'quarter').map(m => m.ratio)`.
   - Now: 2:45 0.95×, 3:15 1.12×, 3:45 0.96×.
   - Guard: say "mostly don't" only when a majority of quarter ratios are below 1.05.
   - Viz: a mark scoreboard of 11 chips coloured by ratio.
3. **The last 2 km rescue.** "Of finishes projected 0–2 minutes over 4:00 at 40 km, 39% got under it, against 28% for comparable finishes away from a round mark."
   - Field: `bubble.find(b => b.minutes === 240).over.share_under` vs `.expected_share_under`.
   - Now: 39.3% vs 28.1%. The median final 2.195 km was 36 s ahead of their 35–40 pace vs 21 s for the comparison finishes.
   - Viz: **guess first** ("you're 1 minute over 4:00 pace at 40 km…"), then 100 dots.
4. **The cushion before slower marks is wider.** "Before 3:00 the pile peaks 40 s under the line; before 5:00, 110 s under."
   - Field: `seconds[].peak_offset_s`.
   - Now: −40 / −30 / −70 / −90 / −110 s for 3:00 / 3:30 / 4:00 / 4:30 / 5:00.
   - Guard: replace the literal "5:00" with the argmin offset.
   - Viz: a ten-second-bin lens. Swipe between marks and the peak marker slides away from the line.
- Merge: `ST → landmarks` (minute before vs after 3:00/3:30/4:00) and `P/ext_milestone_finishing_speed` repeat this. Keep this page as the one home for round numbers.

#### `/analyses/finish-time-context` Your target in context
Source: `PG/<All courses> → cohorts['all|all|all'].cdf` (`cdf[T − cdf_min] / n`), plus filters.

1. ★ **Where a target sits.** "42% of eligible finishes were under 4:00. Under 3:30: 19%. Under 3:00: 5%."
   - Field: `cdf[150]/n`, `cdf[120]/n`, `cdf[90]/n`.
   - Now: 42.4% / 18.6% / 5.1%.
   - Viz: a thumb-slider target with a cumulative curve. Haptic-like snap points sit at the round marks, a quiet nod to the round-numbers story.
2. **The field changes the meaning.** "Under 4:00 is X% of women's finishes and Y% of men's (or of course Z's)."
   - Field: `cohorts['all|Women|all']` and `['all|Men|all']` cdf, plus the city shards.
   - Viz: chips for gender and course that re-draw the curve. Only one cohort at a time (no merged denominators).
- Merge: this page and `/finish-times` answer the same question (finish time vs the field). Combine them: `/finish-times` as the narrative, with this explorer embedded as its "set your time" control.

### Chapter 7 · Who holds pace

#### `/stories/who-holds-pace`
Source: `I/demographics.json`.

1. ★ **Matched, the gender gap is three times bigger.** "Pooled, women's and men's second 20 km slowed 10.3% and 12.1%. Compared within the same race and finish minute: 10.1% and 15.7%."
   - Field: `overall.pooled_women_block`, `pooled_men_block`, `women_block`, `men_block`. Ratio = `(men_block − women_block) / (pooled_men − pooled_women)`.
   - Now: 3.2×.
   - Viz: a before/after slider ("pooled ↔ matched") that pulls two bars apart. This is the clearest "data literacy" moment on the site.
2. **Sustained slowdown, matched.** "At the same finish times, 20% of women's and 45% of men's finishes had a sustained slowdown."
   - Field: `overall.women_slowdown`, `overall.men_slowdown`.
   - Now: 19.8% vs 44.5%. The biggest ratio is 5.9× at 3:10–3:20 (`bands` argmax of `men_slowdown / women_slowdown`).
   - Viz: two 100-dot grids.
3. **The ghost race.** "At the same finish time, men reach 25 km almost 4 minutes ahead of women and give it all back."
   - Field: `ghost_s` (max and its index → km).
   - Now: 229.8 s at 25 km; 0 at the finish.
   - Viz: a two-dot ghost race on a single line, scrubbed by the clock.
4. **Older runners slow less than their same-minute field.** "Matched 18–29s had a sustained slowdown 53% of the time; 60–69s 38%."
   - Field: `age_contrast.young_slowdown` vs `older_slowdown`. Also: every women's age group is more even than every men's: `max(ladder[W].slowdown_vs_field) < min(ladder[M].slowdown_vs_field)`.
   - Now: 52.9% vs 37.6%; −8.6 vs −3.7 points.
   - Guard: show the "every… every" title only if that inequality holds.
   - Viz: an age ladder (two columns of rungs) with the field line down the middle.
- Fix needed: the "Women are a growing share" claim. In `women_share_by_city`, first-year vs last-year share rose in 11 of 20 cities. Compute it, and say "in N of M cities" rather than "most". Chicago 2015 (0.4999) may be a partly loaded edition in the new release, so check before using it.

#### `/analyses/age-and-pacing` Age and pace retention
Source: `PG/<All courses> → cohorts['<age>|all|all'].retention` and `'<age>|Women|all'` / `'<age>|Men|all'`.

1. ★ **Pooled, older runners look worse; matched, they slow less.** "Across all finishes, the second 20 km slowed least at 40–44 (11.0%) and most at 70–74 (14.6%). Against runners with the same finish time, older groups slowed less."
   - Field: argmin and argmax of `retention` over ages; contrast `I/demographics.json → age_contrast` and `ladder`.
   - Now: 11.0% at 40–44 to 14.6% at 70–74; matched 18–29 52.9% vs 60–69 37.6%.
   - Viz: the same before/after "pooled ↔ same finish time" slider as on who-holds-pace (a reused component teaches the idea twice).
2. **Women retain better at every age.** "In every age group, recorded women's second 20 km slowed less than men's."
   - Field: for each age, `'<age>|Women|all'.retention < '<age>|Men|all'.retention`.
   - Now: 18–24: 11.2% vs 14.0%; 70–74: 12.9% vs 15.3%.
   - Guard: holds for all published ages.
   - Viz: paired dots per age band in a vertical scroll list.
- Merge: `ST → figures[age]`, `P/ext_age_pacing` and `who-holds-pace#age` are the same question. Make this analysis the explorer inside the story's age chapter.

### Chapter 8 · Where you run

#### `/stories/courses` chapters 1, 2 and 5 (fingerprint, name-that-course, same early pace)
Source: `I/courses.json`.

1. ★ **Every course has a fingerprint.** "From its pacing shape alone, an edition's course was named correctly 55% of the time (chance: 1 in 22). New York 15 of 15, Boston 7 of 7, London 7 of 7."
   - Field: `identification.correct / editions_tested`, `identification.chance`, `per_course.filter(x => x.correct === x.editions && x.editions >= 5)`.
   - Now: 95 / 172; 4.5%.
   - Viz: a game. "Name that course": show one edition's curve and offer 3 course chips. After the tap, reveal the answer and the model's pick. This is the natural "play" moment on phones.
2. **Same early pace, different endings.** "Among finishes that ran 5–20 km at 5:00–5:30/km, 18% had a sustained slowdown on one course and 41% on another."
   - Field: `matched.find(b => b.lo_s === 300).courses.filter(c => c.finishes >= 1000 && c.editions >= 3)` first and last by `slowdown`.
   - Now: Hamburg 18.2%, Washington 41.4%.
   - Viz: a swipe deck of pace bands; each card is a sorted dot strip of courses, with the reader's course highlighted if chosen.
3. **Where the typical race bends.** "On a typical course the median finisher runs 5–10 km 5.5% faster than their own average and 35–40 km 9.3% slower; 26 of 28 courses are slowest at 35–40."
   - Field: `typical_curve[1]`, `typical_curve[7]`, `courses.filter(c => c.slowest_section === '35–40').length` over `courses.filter(c => c.slowest_section)`.
   - Now: −5.5 / +9.3; 26 of 28 (the exceptions are Boston and Helsinki, slowest at 30–35).
   - Viz: overlaid curves; tap a course chip to bring its curve forward.
4. **Hills show up in the shape.** "Across 234 course sections, each 1% of average uphill grade went with about 1.6 points slower relative pace."
   - Field: `grade_association.slope`, `.course_sections`.
   - Now: 1.58 (0.82–2.19).
   - Viz: a scatter with a draggable "grade" cursor.

#### `/analyses/course-comparison` Compare the courses (all-finisher default)
Source: `AF → rows.find(All courses/all/all/early_pace 'all').courses`.

1. ★ **The spread across courses.** "Sustained slowdown ranged from 19% to 46% of finishes across courses."
   - Field: min and max `slowdown_pct`.
   - Now: Valencia 18.9%, Washington 46.1%.
   - Viz: a sorted dot strip with each course's edition range (`slowdown_spread_pct`) as a whisker. Tap a dot to go to `/courses/[city]`.
2. **The pattern holds at every early pace.** "Whatever the 5–20 km pace, the same few courses sit at each end."
   - Field: the same rows with `early_pace ∈ {'under270', '270to330', '330to390', '390plus'}`.
   - Now: Hamburg is among the lowest three in all four bands and Valencia in three. Washington, Gold Coast, Dubai and Sydney recur at the high end.
   - Guard: name courses only from data.
   - Viz: pace chips that re-sort the strip with animated dot travel (FLIP).
3. **Time after 20 km.** "The median finish lost 5 minutes after 20 km on one course and 19 on another (vs its 5–20 km pace)."
   - Field: `after20_delta_s` min and max.
   - Now: 5.1 min (Valencia) to 19.1 (Washington).
   - Viz: a bar per course for the selected course only, with the all-course range behind it.
- Merge: `ST → overview` (course rates) and `I/courses.json → courses[].slowdown` give slightly different numbers for the same course (for example Boston 21.5% vs 21.8%; Berlin 24.4% vs 25.0%) because of different cohorts and averaging. Pick one source for every course number the reader sees (the all-finisher view, or courses.json on course pages), and use it everywhere.

#### `/analyses/hills-and-pacing` Hills and rhythm
Source: `PG/<city file> → terrain[]` (net, gain, loss per 5 km) and `cohorts[...].profiles[target].pace`; `I/courses.json → courses[].curve` and `grade_pct`.

1. ★ **Boston: the climb and the slowest section line up.** "Boston's 30–35 km gains about 50 m and is its field's slowest 5 km; the 40 m drop that follows goes with an easier 35–40."
   - Field: Boston `terrain[6].gain`, `terrain[7].net`; `courses.json` Boston `slowest_section`, `curve[6]`, `curve[7]`.
   - Now: 49.6 m; −40.8 m net; curve 6.6% then 5.4%.
   - Viz: an elevation profile (CourseArt) with the pace ribbon drawn underneath, sharing one x-axis. Scroll scrubs a runner along both.
2. **The steep downhill first 5 km.** "Boston loses 72 m in its first 5 km."
   - Field: `terrain[0].net`.
   - Now: −72.5 m.
   - Viz: the same profile with the first section highlighted, linking to `/analyses/downhill-start`.
- Generic per-course template: "{city}'s biggest climb is {section} (+{gain} m)", using argmax of `terrain[i].gain`, against that section's `curve[i]` and `deviation[i]`.

#### `/courses` index
1. ★ One dot strip of all courses (sustained slowdown share, from the same single source chosen above) with median finish as dot size. Tap to enter a course. One sentence: "Same marathon distance, 19% to 46% sustained slowdown."
2. A mini fingerprint sparkline per course card (`courses[].deviation`), so the index itself teaches the shapes.

#### `/courses/[city]` course pages (template; Berlin values as the example)
Source: `lib/course-page.ts` (`summary` = `I/courses.json → courses[city]`; `types` = `I/archetypes.json → courses[city]`; `goals` = `I/tools/course-goal.json → rows[city]`; `hotCool`, `slope` = `I/courses.json → weather`).

1. ★ **How often the field held on.** "On average, 25% of {race} finishes had a sustained slowdown, from 14% (2010) to 39% (2006)."
   - Field: `summary.slowdown`, `summary.slowdown_range`, `summary.slowdown_range_years`.
   - Now (Berlin): 25.0%, 14.1% to 38.9%.
   - Viz: a year strip (one tick per edition) coloured by the share, with tap-to-reveal temperature.
   - Guard (new release): Chicago 2015 was partly loaded. If its edition stays in the data, it must not be named as a range end. Check against `source_quality` before naming it.
2. **The hot year vs the cool year.** "Berlin 2013 started at 6.7 °C: 16% sustained slowdown. Berlin 2025 at 19.8 °C: 28%."
   - Field: `hotCool` (shown only when `hotCoolShown`, ≥ 5 °C apart).
   - Viz: two weather cards that flip. A thermometer scales the colour.
3. **Your goal on this course.** "Finishes on 4:00 pace through 20 km here made 4:00 19% of the time (29% had a sustained slowdown)."
   - Field: `goals.find(g => g.goal === 240).row.under`, `.sd`.
   - Now (Berlin): 19.2%, 28.8%; New York 8.8%; Boston 9.4%.
   - Viz: a goal chip row (3:00–5:00) with a 100-dot grid. It is the hand-off to the planner.
4. **Signature section.** "{race}'s most distinctive 5 km is {signature_section}, {signature_points} points against the typical course."
   - Field: `summary.signature_section`, `.signature_points` (or argmax |`deviation`|); plus `identified.correct/editions`.
   - Now (New York): 20–25 km +3.2; named 15 of 15. (Berlin: 30–35 −1.9; 15 of 20.)
   - Viz: the fingerprint curve with the signature section glowing.
- Most common pacing type vs all courses (`types.shares` vs `archetypes[].share`) makes a nice tile row (Berlin Metronome 34.5% vs 28.6% overall).

### Chapter 9 · The weather

#### `/stories/courses#weather` and `#heat`
Source: `I/courses.json → weather`.

1. ★ **Compare a course with itself.** "In 197 of 225 pairs of editions of the same course started at least 5 °C apart, the warmer one had more sustained slowdowns."
   - Field: `weather.pairs.hotter_slowed_more / weather.pairs.total`; `pairs.min_gap_c`.
   - Now: 87.6%.
   - Viz: a waffle of 225 pair tiles, coloured as they flip in on scroll. Tap a tile to see its two years.
2. **Each degree counts for more when it's already warm.** "Near 5 °C the median finish changed by about 0.2 min per °C; near 20 °C, about 2.5 min per °C."
   - Field: `weather.curvature.finish_min_per_c.find(x => x.temp === 5 or 20).slope`.
   - Now: 0.18 → 2.49.
   - Viz: a thermometer slider with a big "+X min per °C" readout that accelerates as it warms.
3. **Heat changes the shape, not just the clock.** "For each 10 °C warmer start on the same course, the first 5 km sits 3 points further ahead of the finisher's own average and 35–40 km 3.2 points further behind."
   - Field: `weather.heat_signature[0].per_10c`, `[7].per_10c`.
   - Now: −3.0 / +3.2.
   - Copy note: this is relative to each finish's own average (late slowing drags the average down). Don't say "people start faster when it's hot".
   - Viz: the typical curve tilting as a temperature slider moves.
4. **Within a course, temperature explains three times as much.** "Across courses, start temperature explains about a tenth of the spread in sustained slowdown; within each course, about a third (+1.3 points per °C)."
   - Field: `weather.fits.slowdown_across.r2` and `slowdown_within.r2`, `.slope`, `.ci95`.
   - Now: 0.10 vs 0.32; 1.30 (0.97–1.69).
   - Viz: an "untangle" animation where one cloud of dots separates into per-course lines.

#### `/analyses/race-day-weather` (all-finisher default)
Source: `AF → rows[All/all/all/all].weather` (5 temperature bands).

1. ★ **The coolest band wasn't the steadiest.** "Starts at 5–10 °C had the lowest sustained slowdown share (27%); below 5 °C was 32% and 15–20 °C 39%."
   - Field: argmin `slowdown_pct` over `weather[]`, `.label`.
   - Now: 27.0% / 31.6% / 32.6% / 39.0% / 35.3% (the 20 °C+ band has only 5 editions in 4 cities; label it "few races").
   - Guard: hide any band with `edition_n < 5` from the headline.
   - Viz: five thermometer columns, with the reader's forecast temperature chip snapping to its band.
2. **Prefer the same-course comparison.** Link straight to the story's 197-of-225 pairs, because course mix shapes these bands.

#### `/analyses/warming-and-pacing`
Source: `WX → candidates.find(c => c.id === 'warming')`.

1. ★ **Rising temperature during the race goes with more late slowing.** "When the temperature rose by 6.4 °C over the first four hours instead of 2.6 °C, the field's second 20 km slowed by about 2 points more."
   - Field: `effect.estimate`, `.low`, `.high`; `exposure.q25`, `.q75`; `status === 'ready'`.
   - Now: +2.07 (1.53 to 2.66) points.
   - Viz: a two-thermometer "morning → late morning" animation feeding a single bar.

#### `/analyses/wind-and-pacing`
Source: `WX → candidates.find(c => c.id === 'wind')` (`takeaway_type === 'precise_null'`).

1. ★ **A typical breeze made no material difference.** "Between a 5 mph and a 10 mph start (the middle half of race mornings), late slowing changed by less than a point."
   - Field: `exposure.q25`, `.q75` (m/s) and `effect.estimate` / `low` / `high`.
   - Now: 2.2 → 4.3 m/s; +0.3 (−0.4 to +0.8).
   - Viz: a wind sock that barely moves, plus a "±1 point" band with the interval inside it. A precise null, celebrated as an answer.
- Merge: warming and wind are one-number pages. Fold them, with the race-day-weather bands, into one "Weather" analysis with three tabs, and keep the two URLs as anchors or redirects.

#### `/tools/weather-match` (Pace Notes data badge; published research kept separate)
Source: `I/tools/weather-match.json → rows` (`c` = centre °C, `hw` = half-width, `pace` = 5–20 km s/km).

1. ★ **The sweet spot sits around 6 °C.** "At a 5:30/km early pace, sustained slowdowns were least common on mornings starting near 6 °C (28%) and most common near 18 °C (43%)."
   - Field: `rows.filter(r => r.pace === P && r.hw === 3)`, then argmin and argmax of `sd` over `c`.
   - Now (P = 330): 6 °C 28.1%; 18 °C 43.1%. The minimum falls at 4–8 °C for most paces from 4:00 to 6:15/km.
   - Guard: report argmin only where `n ≥ 1000` and there are ≥ 5 editions.
   - Viz: a forecast thermometer the reader drags. A curve of `sd` vs temperature sits behind it, with the reference row (8–12 °C) as a dashed band. Never subtract the two into a "penalty".

### Chapter 10 · Your race

#### `/runners` (search, compare, peers) and `/report` (one race)
These are personal, so the nuggets are templates filled from the runner's own record and its edition shard (`public/data/runner-context/editions/NNN.json.gz`, `lib/runner-context.ts`, `lib/report.ts`). Design them as a **"Race Wrapped"** swipe deck (Strava year-in-review): one card per insight, full-bleed and shareable (the existing PNG export).
1. ★ **Placement.** "Faster than {percentile}% of the {other_n} other finishes in {race year}."
   - Field: `comparison.percentile`, `.other_n`, `.median_finish` (report `record.placement`). Peer groups need ≥ 101 finishes, and the percentile excludes the focused record.
   - Viz: a field of dots with the runner's dot lit; swipe to the next card.
2. **Your late race against the field's.** "Your pace after 20 km changed {lateChange}%, against a median {groups.all.late_change.median}% in this edition."
   - Field: `metrics.lateChange` vs `context.groups[group].late_change.{q25, median, q75}`.
   - Viz: a box (q25–q75) with the runner's tick.
3. **Your shape.** "You ran a {type}, like {share}% of finishes."
   - Field: `report.type.name`, `.share` (the archetype classifier); the sustained slowdown and its onset come from `report.slowdown`.
   - Viz: the runner's nine-section curve morphing into the type's centroid.
4. **Your opening.** "Your first 5 km was {fraction} against your 5–20 km pace: the {band} group."
   - Field: `report.opening.band`. Pair it with the matched observed share from `I/kick.json → bank.bands[band]` (sustained slowdown share vs expected).
   - Viz: the bank-and-pay ledger from Chapter 2, filled with the runner's band.
- Multi-race view: "Where did your time change?" uses the selected races side by side. Add a single sentence for the biggest section change between the two most recent races.
- Language: the report says "this race", never "you", in the image (existing rule in `lib/report.ts`). Keep the card copy consistent with it.

#### `/tools/split-check` (Pace Notes data and Published research badges)
- Same template as the report (type, sustained slowdown, onset, section paces). Add one cohort nugget per result, from `I/tools/pace-band.json` and its shards: "Of finishes at your time on this course, {sd}% had a sustained slowdown."
  - Field: `groups.all.sd[g]`.
  - Viz: the reader's nine bars over the window's median bars.

### Chapter 11 · The next one

#### `/analyses/finding-improvement` Where improvement happens (default 4:00)
Source: `PG/<All courses> → cohorts['all|all|all'].gains['240']` (`values = [opening 10 km, middle 20 km, final 12.195 km]` in minutes; `total`).

1. ★ **Improvement shows up late.** "Improving runners near 4:00 found 19.6 minutes on an earlier best: 2.9 in the first 10 km, 8.2 in the middle 20 km and 8.5 in the final 12.2 km. That is 43% of the gain from the last 29% of the distance."
   - Field: `values[2] / total`, and `12.195 / 42.195`.
   - Now: 43.4%; per km 17 s → 25 s → 42 s.
   - Viz: a course bar split 10 / 20 / 12.2 km with minutes stacked as coins, so the late segment's coin stack is visibly tallest per km.
2. **The same at every time.** "From 2:15 to 7:00 finishes, the final 12 km gave the most time per km." (Read the range from the first and last `gains` keys; today 135 to 420.)
   - Field: for each bucket in `gains`, `values[2]/12.195 > values[1]/20 > values[0]/10`.
   - Now: holds in all 20 published buckets.
   - Guard: count the buckets where it holds.
   - Viz: target chips.
- Merge: `P/ext_earlier_best_section_gains` is the same question (18.7 min average; 37.0 s/km late vs 17.8 s/km early). Keep one.

#### The next race (recurrence, habits, spacing): today spread across `final-kick#follows`, `pacing-types#habits` and 5 archive packs
1. ★ **A sustained slowdown tends to come back.** "After a sustained slowdown, the next linked race had one 51% of the time, against 34% typical for that race and pace."
   - Field: `I/kick.json → recurrence.after_slowdown.observed` and `.expected`; `after_none.observed`.
   - Now: 50.8% vs 33.6%; after none 21.6%.
   - Viz: two doors ("last race: slowdown / no slowdown"), each with 100 dots behind it.
2. **Pacing habits persist, but loosely.** "Pace retention in consecutive races one year apart correlated at 0.50; three years apart, 0.33."
   - Field: `P/ext_pacing_habit_persistence/tables/correlation.csv` (label 1 and 3).
   - Viz: a decaying line with three points.
3. **More recorded races, more late slowing.** "Second-20-km slowdown was 8.8% after one earlier finish and 12.0% after five or more."
   - Field: `P/ext_experience_and_pacing/tables/experience.csv → retention`.
   - Copy note: counter-intuitive, and it mixes who keeps racing; say only what's observed.
   - Viz: a four-step staircase.
4. **The gap between races barely mattered.** "Median next-finish change stayed between −0.7% and +0.1% from 1–89 days to 2–3 years between races."
   - Field: `P/ext_race_spacing_outcomes/tables/spacing.csv` (sample 'All dated pairs', `median`).
   - Viz: a flat line with wide p10–p90 whiskers. The width is the story.

#### `/tools/plan` and `/tools/course-chooser` (Pace Notes data)
Source: `I/tools/course-goal.json → rows` (5–20 km pace within ±2% of goal pace).

1. ★ **Goal pace through 20 km is not enough.** "Across courses, finishes that ran 4:00 pace through 20 km made 4:00 14% of the time; 34% had a sustained slowdown."
   - Field: `Σ(n·under) / Σn` and `Σ(n·sd) / Σn` over `rows.filter(r => r.goal === G)`. This is a pooled value; label it "across N courses".
   - Now: 14.4% / 34.2% (304,697 finishes).
   - Viz: a 100-dot grid next to the planner's goal field, updating live as the reader changes goal and course.
2. **The course moves the odds of a plan holding.** "On 4:00 pace through 20 km, 8% made 4:00 on one course and 28% on another."
   - Field: min and max `under` over `rows.filter(r => r.goal === 240 && r.n >= 1000)`.
   - Now: Washington 7.8%, Eindhoven 27.6%.
   - Viz: the course chooser's cards, swipeable, each with its dot grid.

#### `/tools/pace-band` and `/tools/marathon-pace/[goal]` (Pace Notes data)
Source: `I/tools/pace-band/<scope>/<gender>.json → groups.{all, held, slowdown}` (window: finishes from G−5:00 to G−0:01).

1. ★ **Sub-4 finishers didn't run even either.** "Finishes from 3:55 to 3:59:59 ran their 35–40 km at a median 6:00/km against an even 5:41/km, after being 5:18 ahead of an even 4:00 schedule at 30 km."
   - Field: `groups.all.s50[i][7]` vs `G*60/42.195`; `even(30) − groups.all.e50[i][5]` where `i = g.indexOf(G)`.
   - Now: 360 vs 341 s/km; 318 s.
   - Viz: the printable band itself, with a ghost "what they actually ran" row under the even row. Tap a mat to compare.
2. **Some made it despite a sustained slowdown.** "19% of sub-4 finishes had a sustained slowdown. They were 13 minutes ahead of even at 25 km."
   - Field: `groups.slowdown.n[i] / groups.all.n[i]`; `even(25) − groups.slowdown.e50[i][4]`.
   - Now: 18.9%; 796 s.
   - Copy note: this must not read as advice to bank time. Pair it with Chapter 2's bank-and-pay nugget.
   - Viz: two lines (held vs sustained slowdown) diverging on one chart.
- Goal pages (`/tools/marathon-pace/4-00` etc.) repeat the same pace-band family plus the round-numbers ratio (`marks.find(m => m.minutes === G).ratio`, 1.30× at 4:00). Keep them for search but reuse these nugget components.

#### `/tools/predictor` (Published research and Pace Notes data, never combined)
- Pace Notes data nugget: from the projector family, "Finishes on pace for {T} at 20 km finished in a median {X}". Show it in its own data panel.
- The research numbers (Riegel, Daniels, Tanda) stay in their own badge panel. "Riegel ran a median 10:09 too fast for recreational runners" is a published-research figure: keep it labelled as such.

#### Research archive (`/packs/*`) and the research-question nuggets worth promoting
These pages mostly hold one answer each. Promote the strong ones into the chapters above and leave the rest in the archive.

| Pack | Nugget | Field | Now | Promote to |
| --- | --- | --- | --- | --- |
| ext_pacing_shapes | Only ~1 in 25 finishes ran a faster second 20 km | `tables/patterns.csv` label 'Faster second 20 km' `value` | 3.9% | Home, Ch 3 |
| ext_split_pattern_success | Even 20 km blocks improved on an earlier best most often | `tables/success_rates.csv` `value` by label | similar 50.7%, faster 48.2%, pronounced slowing 21.7% | Ch 3 |
| ext_successful_race_shapes | Among improved finishes, only 4% had a faster second 20 km | `tables/pattern_mix.csv` | 4.2% (moderate slowing 42.9%) | Ch 3 |
| ext_checkpoint_outcomes | Near sub-3 pace at 20 km, 18% broke 3:00; at 40 km, 52% | `tables/goal_rates.csv` | 18.3% / 52.2% | Ch 4 |
| ext_goal_slip_recovery | First behind 4:00 budget at 25 km, 2.8% still broke 4:00; at 40 km, 11.8% | `tables/slips.csv` | 2.8% / 11.8% | Ch 4 |
| ext_pace_trend_at_20k | Same 20 km time: speeding-up runners finished 3.6 min sooner than steady ones | `summary.json → statistics.accel_diff`, `slow_diff` | −3.6 / +11.5 min | Ch 4 |
| ext_late_rank_changes | 26% of finishes moved more than 5 percentile points after 30 km | `summary.json → statistics.moved` | 26.0% | Ch 4 (places) |
| ext_bad_patch_recovery | A bad 5 km at 20–25 km was followed by a recovery 5.7% of the time; at 30–35 km, 1.6% | `tables/recovery.csv` | 5.7% / 1.6% | Ch 5 |
| ext_distance_and_elapsed_change | First slow section at 25 km: reached at 98 min by fast runners and 178 min by slow ones, so it follows distance more than the clock | `tables/elapsed.csv` | 98 / 178 min | Ch 5 |
| ext_milestone_finishing_speed | Up to 2 min behind a 4:00 projection at 40 km, 14% still broke 4:00 | `tables/hits.csv` | 13.9% | Ch 6 (round numbers) |
| ext_near_miss_recorded_return | Just missing 4:00 didn't change how often runners came back (22.0% vs 22.6%) | `tables/returns.csv` | 22.0 / 22.6% | Ch 6 (aside) |
| ext_strong_finish_followup | A >5% faster final section was followed by a >2% better next race 41% of the time (vs 34%) | `tables/kick_success.csv` | 40.8% / 33.9% | Ch 11 |
| ext_pacing_habit_persistence | r = 0.50 one year apart | `tables/correlation.csv` | 0.50 / 0.33 | Ch 11 |
| ext_experience_and_pacing | More recorded races, more slowing | `tables/experience.csv` | 8.8% → 12.0% | Ch 11 |
| ext_race_spacing_outcomes | Spacing barely moved the median | `tables/spacing.csv` | −0.7% to +0.1% | Ch 11 |
| ext_earlier_best_section_gains | Late km supplied the most gain per km | `summary.json → statistics`, `tables/gains.csv` | 37.0 vs 17.8 s/km | Ch 11 (merge) |
| ext_paired_course_comparisons | Same runners, Boston then Chicago (or reverse): 0.6 min apart | `tables/course_pairs.csv` | 0.6 min (6,374 pairs) | Ch 8 aside |
| ext_course_familiarity | Boston returners slowed 10.9% vs 12.1% for first-recorded Boston runners | `tables/familiarity.csv` | 10.9 / 12.1% | Boston course page only |

- **Conflicting evidence to handle on purpose.** `ext_opening_tradeoffs` says faster openers finished 1.3% *faster* than their earlier benchmark, while `kick.bank` says faster openers finished 5:00 *behind* same-race same-pace peers. They answer different questions: fitness change against an earlier best, versus the same race at the same pace. Never put them side by side as one finding. Lead with `kick.bank`, and leave `ext_opening_tradeoffs` in the archive with its own caption.
- Weak or no headline (archive only, or cut): ext_qualifying_threshold_comparison (only 1 city met the sample rule), ext_course_response_profiles, ext_race_day_context and ext_pacing_over_time ("choose a city", no single answer), ext_terrain_pacing_proxy (it repeats hills-and-pacing).

---

## 3. Pages that repeat each other: merge, fold or cut

| Overlap | Pages | Recommendation |
| --- | --- | --- |
| Opening pace | `/analyses/starting-pace`, `/stories/final-kick#bank`, `/analyses/downhill-start`, `ext_opening_tradeoffs`, `ext_slow_start_responses`, `r01_banking_time`, `s1_banking_time`, `r02_recover_slow_start` | One "First 5 km" chapter. Lead with the same-race same-pace bank result, embed the explorer, and show downhill as a tab. |
| Pacing shape | `/stories/pacing-types`, `/analyses/pacing-pattern`, `ext_pacing_shapes`, `ext_split_pattern_success`, `ext_successful_race_shapes`, `r30_negative_split_success`, `r31_multiple_good_strategies` | One "Shape" chapter. The analysis becomes the "set your time" control inside the story. |
| On pace at a checkpoint | `/analyses/checkpoint`, `ext_checkpoint_outcomes`, `ext_goal_slip_recovery`, `ext_pace_trend_at_20k`, `/tools/projector`, `I/tools/course-goal.json` (planner), `r04_on_pace_goal_hits`, `s2_target_odds`, `s10_goal_slips`, `r03_accel_vs_decel_20k` | Four variants of "on pace at X km, then what?". One story section with one interactive scrubber; the projector stays as the race-day tool. |
| Forecast accuracy | `I/tools/projector.json → validation`, `ext_checkpoint_forecast_validation` | Show one (the projector's, which is the tool people use). |
| Sustained-slowdown basics | `/slowdown`, `final-kick` chapters 2–4, `ext_bad_patch_recovery`, `ext_distance_and_elapsed_change`, `rn1_wall_severity`, `r07`, `s6`, `r09`, `s11`, `r08_early_blowup_signal` | One "After 30 km" chapter. `/slowdown` becomes its first page. |
| Round numbers and milestones | `/stories/round-numbers`, `ST → landmarks` on `/slowdown`, `ext_milestone_finishing_speed`, `r17_milestone_kick`, `/tools/marathon-pace/*` bunching panel | Remove the landmarks figure from `/slowdown` (it is a different cohort with different counts: 16,494 vs 15,856 before 3:00). Round numbers live only in the story; goal pages link to it. |
| Finish time vs the field | `/finish-times`, `/analyses/finish-time-context` | Merge into one page with an embedded slider. |
| Gender and age | `/stories/who-holds-pace`, `/analyses/age-and-pacing`, `ST → figures[age]`, `ext_gender_pacing`, `ext_age_pacing`, `r22`, `r23`, `s8` | One "Who holds pace" chapter. There are two different matched gender gaps (10.1% vs 15.7% matched on finish minute; 10.5% vs 14.9% matched on opening 20 km). Show only one. |
| Course shapes and spread | `/stories/courses`, `/analyses/course-comparison`, `/analyses/hills-and-pacing`, `ext_course_pacing_profiles`, `ext_course_outcome_spread`, `ext_paired_course_comparisons`, `ext_terrain_pacing_proxy`, `r11`, `r12`, `r35`, `s3`, `s4`, `/courses/*` | The story is the overview, the course pages are the detail, and the analyses become the controls. Use **one** per-course slowdown source everywhere (today three sources disagree by up to 0.6 points). |
| Weather | `/stories/courses#weather,#heat`, `/analyses/race-day-weather`, `/analyses/warming-and-pacing`, `/analyses/wind-and-pacing`, `ext_weather_pacing_patterns`, `r15`, `s9`, `rn3_heat_curves`, `p3_race_week_weather`, `/tools/weather-match` | One "Weather" chapter: the same-course story first, then one analysis page with three tabs (temperature, warming, wind), then the tool. |
| Improvement and next race | `/analyses/finding-improvement`, `ext_earlier_best_section_gains`, `ext_performance_profiles`, `ext_strong_finish_followup`, `ext_pacing_habit_persistence`, `final-kick#follows`, `pacing-types#habits`, `ext_race_spacing_outcomes`, `ext_experience_and_pacing`, `r05`, `r20`, `r21`, `r24`, `r32`, `s7` | One "Next one" chapter ending in the planner. |
| Indexes | `/research`, `/stories`, `/analyses`, `/packs`, `/tools`, `/courses` | One "Contents" page drawn as the course map (chapters as km markers). Keep `/tools` and `/courses` as utility indexes; turn `/stories` and `/analyses` into anchors of Contents; keep `/packs` as the archive. |
| Legacy aliases | about 77 `/packs/r**`, `/packs/s*`, `/packs/p*`, `/packs/rn*` alias pages, `/research/personalized`, `/your-race`, `/htw`, `/packs/smyth_htw` | Cut as pages and 308-redirect each to its new chapter anchor (`vercel.json`). The research IDs are compatibility identifiers, so keep the redirects. |
| Reference, no Pace Notes data | `/tools/pace-calculator`, `/tools/qualifying*`, pace charts, `/about` | Keep, outside the narrative. `/about` can fold into the home page's closing credit and `/methodology`. |

---

## 4. Hard-coded prose and data risks to fix in the redesign

1. **Literal titles that assert data.**
   - `PacingTypesBody`: "Five times as many Cliffs among men", "Same finish time, six journeys". Use `countWord(archetypes.length)` and the computed ratio.
   - `RoundNumbersBody`: "the tallest tower is 2:59", "The cushion is widest before 5:00".
   - `DemographicsBody`: "The gap holds from 2:40 to 6:00", "Every women's age group… every men's", "Women are a growing share" (true in only 11 of 20 cities today).
   - `ReplayBody`: "nearly half the field".
   - `PlacesBody`: "nearly a coin flip".
   - `CoursesBody`: "Since the pandemic, the front of the field is faster" (guard on `eras.summary.p10.ci95[1] < 0`).

   Each needs a guard and a fallback (section 0).
2. **Literal selectors.**
   - `byCity('New York')`, `byCity('Boston')`, `per('Copenhagen')`.
   - `e.city === 'London'`, recovery `['New York','Berlin','London']`.
   - `b.lo_min === 225`, `gap_lo_s === 60`, `lo_s === 300`, `target_s === 16200`, `clock_s === 10800`, `clock_s === 18000`.

   With 34 cities and new editions, pick editions and examples by data (argmax or argmin of the nugget's own value) or check that they exist, as some bodies already do with `?.`.
3. **`(100 / 200).toFixed(1)`** in the barcode dek assumes 200 barcode bins. Use `100 / data.barcode.length`.
4. **`lib/tools/registry.ts → EVIDENCE_TEXT.data`** hard-codes "3.26 million screened marathon finishes". Read it from `I/tools/*.json → cohort_n`.
5. **Denominators that differ by page.**

   | Family | Total today | Covers |
   | --- | --- | --- |
   | Eligible (`ST`, `PG`, `AF`, `FS`) | 3,517,336 | Analyses, `/slowdown`, all-finisher views |
   | Story cohort (`analysis_n`) | 3,414,116 | Stories, course pages |
   | Shape cohort | 3,279,985 | Pacing shapes |
   | Positions and courses shape cohort | 3,279,971 | Places, course fingerprints |
   | Kick and tools (`cohort_n`) | 3,260,661 | Final kick, data tools |
   | Demographics | 3,094,804 | Who holds pace |

   The redesign shows one number per sentence with its own set (as `CohortNote` requires), and should never show two slowdown rates (30.4% vs 30.2%) for "all finishes" on one screen.
6. **Chicago 2015 (new release).** It was partly loaded. It appears today as Chicago's lowest-slowdown year (`courses.json → courses[Chicago].slowdown_range_years[0] === 2015`) and with a 50.0% women's share (`women_share_by_city`). If the adoption keeps it, the course page and the women's-share chart must not name or plot it unless `source_quality` clears it.
7. **Finishes without a 5 km split (new release).** Every split-based nugget above already uses the eligible (all nine splits) cohort. Only the home page's "results" total uses `raw_records`. Keep the two labelled apart ("results" vs "finishes with every split").
8. **Duplicate-edition screen.** The Chicago 2018/2019 copies are release-specific. Read `duplicate_edition_screen` from the data; never mention it in page copy (methodology only).

---

## 5. Phone patterns used above (for the design system)

| Pattern | Use | Notes |
| --- | --- | --- |
| **Big number + one line + micro-chart** (`bigNumber`) | Every lead nugget | Bricolage bib numeral at 64–88 px on 390 px wide; the micro-chart is under 64 px tall. |
| **100 dots** (`unitDots`) | Shares (slowdown, goal made, checkpoint) | A 10×10 grid of runner glyphs; the lit count animates once in view. It reads as "of 100 finishes", never "your chance". |
| **Guess first** (`guessFirst`) | Negative splits, 30 km on even pace, the 40 km rescue | A drag-to-guess slider, then the reveal. Store the guess only in component state. |
| **Tap to compare** (`tapCompare`) | Women/men, downhill/other, warm/cool | Two pills; the number morphs (FLIP or tween), with the `aria-live` value text. |
| **Thumb scrubber** (`scrubber`) | Thresholds, checkpoint time, temperature, gap | Snaps at meaningful points; a keyboard range input underneath (existing `.heat-slider` rule). |
| **Scroll-driven reveal** (`scrollReveal`) | Waterfalls, rivers, onsets, waffles | A sticky chart with 3–5 steps; under reduced motion all steps show at once. |
| **Ghost race** (`ghostRace`) | Even-pace ghost, gender ghost, twins | Two dots on one line; drag the clock. Reuses `RunnerLane` and `Runner`. |
| **Swipe deck** (`swipeDeck`) | Races, courses, pace bands, "Race Wrapped" | Horizontal snap scroll with page dots; each card works on its own when shared. |
| **Name that course** | Course fingerprint | 3 choices, then the reveal. It is the one "game" on the site. |
