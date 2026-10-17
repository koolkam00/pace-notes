# Pace Notes live site: design critique

**Site:** https://splithappens.run (live `main`, before the insights-only change), captured October 16, 2026.
**Captured at:** iPhone 13 emulation (390×844, DPR 2, touch, mobile UA) and desktop 1440×900. Each page loaded to network idle, waited 1.5 s, scrolled through once, then captured full-page.
**Screenshots:** `shots/live/{phone,desktop}/<slug>.png` (58 pages × 2). Per-page screen-by-screen filmstrips are in `shots/live/strips/{phone,desktop}/<slug>-NN.png`, and contact sheets per section are `shots/live/sheet-<section>-<profile>.png`. Layout metrics for every capture are in `shots/live/metrics.json`. Extra interaction captures (menu open, mid-scroll, replay playing, sticky goal bar) are in `shots/live/extra/`.
**Note on numbers:** every figure quoted below is what the live site shows **today**, given only to illustrate a point. The 1652 release changes all of them, so the redesign must generate headlines from data fields and never hard-code these values.

---

## 0. The verdict in ten lines

1. **The identity is strong and worth keeping.** That means the warm paper background, ink-black panels with an ember glow, the orange accent, the high-contrast display serif with italic orange accent words, mono kickers, the pixel-art runners with time chips, the checkered finish line and the race replay. Few data sites look this ownable.
2. **The stories already read like the NYT, but the analyses read like a filing.** Story headlines are findings ("The red arrives *earlier* for slower finishes", "Five times as many *Cliffs* among men"). Analysis headlines are questions, followed by a form, followed by a headline that is often a **count** ("24 courses to compare.", "5 temperature bands to compare.", "These 11 age groups can be compared within the 3:52:30–4:07:30 achieved-time band."). The nugget is in the chart, and the copy never says it.
3. **Every analysis puts controls before the answer.** On a phone you scroll through 1 to 2.5 screens of `<select>`s and an "Update comparison" button before seeing any data (`/analyses/course-comparison`, `race-day-weather`, `downhill-start`, `starting-pace`). Two analyses show no result at all by default (`/analyses/checkpoint`, and `/analyses/hills-and-pacing`, whose select reads "Choose a cou" and says "Choose your marathon above.").
4. **Methodology is everywhere.** Methodology sits on every template: doi links in body copy, "How to read this" and "Keep in mind" boxes, "How we calculated this" and "Definitions, coverage and limits" disclosures, "What this can tell you", "VIEW EXACT VALUES AND SAMPLE SIZES" (up to 6 per page), 2-to-2.5-screen "Method, data and limits" boxes on stories, "THE STUDY / How we measured it" and "About this data" on course pages, and an /about page that is mostly data-source copy. Under the October 16 decision, all of it moves to /methodology.
5. **Repeated chrome.** Every page ends with the same stack of about 2.5 phone screens: what-this-can-tell-you, downloads, prev/next, "Was this useful?", a tool promo, a "More tools" list, the checkered rule, a brand blurb, "Pause all animations" and 11 footer links. On a 3-screen analysis, that chrome is longer than the content.
6. **Long category lists are sorted A to Z instead of by value.** These include 24 to 29 full-width bars per list (course comparison twice, slowdown, pacing types by course), 22 course cards on the course chooser (sorted by "Course name" by default), 29 big route cards on /courses, and 20-row year tables on course pages. Alphabetical order hides the best and worst, and those extremes are the story.
7. **The same content exists in several tiers.** /analyses (10), /research/personalized (12, in km, with a different header), /packs (35 archived questions), /slowdown, /stories (7), the tools and 29 course pages answer overlapping questions in different styles. A runner cannot tell which version is canonical, or what to read next.
8. **The numbers don't agree.** One visit shows 3.4 million, 3.3 million, 3.26 million, 3,414,116, 3,517,336 and 4,462,379 finishes or records; 29 or 34 cities; 178, 179, 194, 196 or 256 editions. The home page alone uses two denominators (3,414,116 and 3,517,336).
9. **Mobile ergonomics are mostly fine at the control level, with poor details.** Selects and buttons are 44 to 48 px, but kicker links are 16 px tall, list links 17 px, filter chips 26 px and checkboxes 20 px. Tab rows clip with no affordance ("Londo", "Ea", "Ge"). Tables clip columns ("SUSTAINE", "HUMI"). Mile labels are converted from km boundaries ("3.11 mi–12.43 mi", "21.75–24.85 mi", "Final 7.58 mi").
10. **Pages are long, and the best moments sit at the bottom.** Berlin is 19.5 phone screens, with its replay at screen 17. /methodology is 25.6 screens and /research/personalized 21.9. On `/tools/marathon-pace/4-00`, "Finish times bunch just under 4:00" sits at screen 7. On `/tools/pace-band`, the held-versus-slowdown chart (the nugget) sits at screen 4.

---

## 1. What is distinctive and worth keeping

| Element | Where it shows up | Why keep it | What to change |
|---|---|---|---|
| **Paper + ink palette.** Warm off-white page, near-black panels with a soft ember radial glow, one orange-red accent | Everywhere, at its best in the home, story and course heroes | Instantly recognisable and calm. It reads as a sports almanac, not a SaaS dashboard | Use dark panels for one meaning only: *the answer* or *the replay*. Today dark also carries form results, method meta lines, caveats and promos |
| **Display serif with italic orange accent words** ("Plan *yours*.", "hard to *hold*.", "*Matched*, it is 3 times as big.", "Women are a *growing share*") | Story and section heads, home | This is the editorial voice. The italic accent is a perfect "nugget highlighter" | Apply it to *analysis* headlines too, and make the accent the number or the comparison ("Washington runners slowed *2.4×* as often as Valencia's") |
| **Mono kickers** ("02 · THE BARCODE", "ANALYSIS 02 OF 10 / PACE YOUR RACE") | Every section | Gives structure and a sense of series | Keep for kickers and axis ticks only. Remove it from chart row labels ("JUST BELOW THE THRESHOLD" ×18) and disclosure labels ("VIEW EXACT VALUES AND SAMPLE SIZES") |
| **Pixel-art runners with time chips** (3:15 / 4:00 / 4:45 / 5:30) | Home, hubs, CTA band, final kick, places (chaser and leader), who-holds-pace ghost race | Charming and ownable. They humanise the data the way Strava's year-in-review figures do | Use them as *data* (each runner is a finish-time group moving at its real pace), not only as decoration in heroes |
| **The race replay** (dot field on a race clock: Straight course / On the route, speed select, scrubber, counters for Still running / Finished / ≥25% slower / Leading runner) | Home hero (desktop, right of the fold), `/stories/race-replay`, the bottom of each course page | The signature piece. Nothing else on the web shows a marathon field this way | On phone it is below the fold on the home page, and its first frames are an almost empty black rectangle: at 0:08:17 every dot is in a 20 px column at the start (`extra/replay-first-view.png`). Start at a moment with spread, make it full-bleed, and let one tap pause it |
| **Story headlines written as findings** | All 7 stories | Exactly the "runner walks away having learned something" voice | Every analysis, course and tool result should open this way |
| **Pacing-type colour system** (Metronome green, Gentle fader blue, Late fader amber, Early drifter violet, Cliff pink, Fast-start fader orange) | Pacing-types story, courses hub legend and bars, course pages | Semantic and consistent | Keep it for types only. Don't reuse these hues for tool identities or badge borders |
| **Blue (faster) / orange-red (slower) diverging scale** | Barcode, fingerprint heat rows, replay colouring, section bars | Consistent and intuitive | Keep. Standardise one legend component |
| **Charts that already work at 390 px** | Pacing barcode with a finish-time slider; who-holds-pace dumbbell and three pinned stat cards; round-numbers "tallest tower is 2:59" histogram; places "receipt" card and break-even slider; courses story "Name that course" quiz; weather-match beeswarm with "Your 64 °F"; predictor's dark "4:05 to 4:15" range card; projector percentile tiles; split-check verdict card; qualifying "Meets 3 of 6" summary; pace-band held-vs-slowdown section chart | These are the templates for the redesign | Promote them higher and reuse their patterns in the analyses |
| **Floating goal stepper** (− 4:00 9:09/mi +) pinned to the bottom on pace band | `/tools/pace-band` | A great thumb-zone control that changes the answer without scrolling back up | Make this the universal "Your race" control for analyses and tools |
| **MI/KM toggle in the header** | Most pages | Runners need it | Missing on /methodology and /research/personalized (and the latter defaults to km) |
| **Explicit honesty** (Pace Notes data, published research and official standards kept apart; "observed share, not your chance") | Tools | A contract requirement and a trust asset | Keep the badges, but make them quieter (small coloured text tags, not outlined pills on every card) |

---

## 2. What feels heavy, dense, repetitive or confusing on a phone

### 2.1 Everything is a card inside a card
Most sections are an off-white rounded card with a drop shadow on the beige page. Inside sit more boxed tiles: beige "How to read this" boxes, dark result cards and shadowed stat tiles. On a phone this becomes a stack of rounded rectangles with little rhythm. NYT and Strava-style pages alternate full-bleed moments (a big number, a full-width chart, a photo-like replay) with quiet text. Pace Notes boxes everything at the same visual weight.

### 2.2 Closing chrome is longer than many pages
Typical phone bottom stack, measured on `/analyses/checkpoint` (3.2 screens total):
"How to read this" → "Keep in mind" → "How we calculated this" → Previous question card → Next question card → "Was this useful? Yes / No" → Runner tool promo card → checkered rule → "Pace Notes / Every split tells part of the story…" → "By Andrew Kam" → "Pause all animations" → 11 links in two columns.
That is about 2 screens out of 3.2. On analyses, Was-this-useful plus tool promo plus footer repeat identically on all 14 pages.

### 2.3 Mono uppercase overload
On `/analyses/where-time-is-gained`, each of the 9 sections has two bars labelled in mono caps "JUST BELOW THE THRESHOLD / JUST ABOVE THE THRESHOLD". That is 18 identical labels where a two-colour legend would do. "VIEW EXACT VALUES AND SAMPLE SIZES" appears 4 to 6 times on course comparison, weather and downhill. Mono-caps stat labels ("UNDER 3:30 / SUSTAINED SLOWDOWN / AFTER 12.4 MI") repeat on each of the 22 course-chooser cards.

### 2.4 Templated captions under every chart
Under each line chart: "Points average the preceding section. The final section is 24.85–26.22 mi; lines do not locate pace changes within a section." Under bar lists: "Average of the qualifying race-edition rates, with each edition given equal weight. Sample sizes count eligible finishes…". Under time charts: "This is a calculated reference, not a predicted finish, avoidable time loss or evidence…". These run 3 to 6 lines of grey 12 to 13 px text and appear several times per page.

### 2.5 Dark cards say what the page is about, not what it found
The "WHAT THE DATA SHOWS" or "WHAT THESE RACE FIELDS SHOW" dark card is the right slot in the wrong voice:
- course comparison: "**24 courses to compare.**"
- race-day weather: "**5 temperature bands to compare.**"
- downhill start: "**2 opening-terrain groups to compare.**"
- age and pacing: "**These 11 age groups can be compared within the 3:52:30–4:07:30 achieved-time band.**"
- where time is gained: "**Nearby finishes averaged 3:57:34 below the threshold and 4:02:25 above it.**" (true by construction)
- pacing pattern: "**Among finishes in 3:52:30–4:07:30, 21.75–24.85 mi has the slowest median section pace: 9:50/mi.**" (expected, not surprising)
- course chooser: "**22 of 29 courses have enough finishes at 3:30 pace**"
- weather match: "**15 past marathon editions started at 60.8–68 °F**"
- race-replay story: "**16,735 to 58,339 finishes, one race clock.**"

These are followed by 4 to 8 lines of method text inside the same dark card, plus a mono meta line ("All courses · all ages · all recorded categories · all earlier-time bands. 453,052 finishes across 196 race editions.").

### 2.6 Units that look machine-made
Analysis boundaries are km-native, converted to miles and printed to 2 decimals: "3.11 mi–12.43 mi pace", "21.75–24.85 mi", "18.64 mi to the finish", "Opening 6.21 mi / Middle 12.43 mi / Final 7.58 mi", "the final 1.36 mi is excluded", "net drop greater than 82 ft over the first 3.11 mi". In miles mode, label checkpoints as runners say them (5K, 10K, half, 20 miles, the last 10K) or round to one decimal. Never show two-decimal miles in headlines.

### 2.7 Contradictory emphasis
`/analyses/wind-and-pacing`: the headline says "Typical wind differences showed **little change**", while the hero number is a giant red **+0.32** in the same style that `warming-and-pacing` uses for its positive finding (+2.07). A null result should look null (a grey "≈ 0" on a band around zero), not alarming.

### 2.8 A greyed caveat card inside the answer
On warming and wind, a faded "Compared within courses, accounting for start temperature, calendar year…" card overlaps the bottom of the dark answer card. It looks disabled or broken.

---

## 3. Page length on a phone (screens of 844 px) and where the first chart lands

"First chart" counts the first SVG or canvas wider than 150 px. HTML bar lists such as those on where-time-is-gained, finding-improvement and age-and-pacing are not counted, so "none" there means "no SVG chart", not "no bars". Desktop screens are 900 px tall.

| Page | Phone screens | Desktop screens | First chart at (phone screen) | Words | Charts (svg/canvas) | Tables | Disclosures | Small tap targets (<32px) |
|---|---|---|---|---|---|---|---|---|
| `/` | 7.7 | 5.4 | 1.1 | 656 | 2/1 | 0 | 0 | 4 |
| `/research` | 11.9 | 7.8 | 0.4 | 1198 | 1/0 | 1 | 1 | 2 |
| `/stories` | 4.1 | 2.3 | 0.5 | 335 | 1/0 | 0 | 0 | 1 |
| `/stories/pacing-types` | 13.3 | 10.6 | 0.4 | 1526 | 10/0 | 0 | 0 | 13 |
| `/stories/round-numbers` | 9.1 | 6.5 | 0.4 | 989 | 4/0 | 1 | 0 | 8 |
| `/stories/race-replay` | 15 | 10.1 | 0.4 | 1733 | 6/1 | 0 | 0 | 15 |
| `/stories/places` | 9.9 | 7.2 | 0.3 | 2406 | 6/0 | 0 | 0 | 7 |
| `/stories/final-kick` | 14.4 | 10.5 | 0.5 | 1797 | 8/0 | 0 | 0 | 7 |
| `/stories/who-holds-pace` | 11.3 | 6.7 | 0.4 | 1188 | 12/0 | 0 | 0 | 7 |
| `/stories/courses` | 17.5 | 12.8 | 0.4 | 2338 | 14/0 | 0 | 0 | 8 |
| `/tools` | 5.9 | 3.4 | 0.5 | 483 | 1/0 | 0 | 0 | 6 |
| `/tools/plan` | 7.4 | 4.8 | none | 1011 | 0/0 | 2 | 2 | 4 |
| `/tools/pace-calculator` | 7.7 | 5 | none | 730 | 0/0 | 3 | 1 | 6 |
| `/tools/predictor` | 10 | 5.3 | 2.9 | 1200 | 2/0 | 1 | 3 | 8 |
| `/tools/pace-band` | 9.7 | 5.1 | 3.4 | 1242 | 1/0 | 3 | 2 | 5 |
| `/tools/course-chooser` | 14.1 | 5 | 2.6 | 1516 | 22/0 | 1 | 24 | 37 |
| `/tools/weather-match` | 11.7 | 6.2 | 4.3 | 1519 | 2/0 | 3 | 2 | 10 |
| `/tools/projector` | 9.8 | 5.5 | 3.1 | 1131 | 2/0 | 3 | 2 | 2 |
| `/tools/split-check` | 10.9 | 6.4 | 2.6 | 1492 | 3/0 | 2 | 2 | 6 |
| `/tools/qualifying` | 16.6 | 9.6 | 8.5 | 1771 | 1/0 | 2 | 8 | 38 |
| `/analyses` | 4.7 | 3 | 0.5 | 384 | 1/0 | 0 | 0 | 1 |
| `/analyses/pacing-pattern` | 3.9 | 2.9 | 1.5 | 327 | 1/0 | 1 | 3 | 4 |
| `/analyses/starting-pace` | 8.9 | 6.3 | 3.3 | 1096 | 1/0 | 4 | 5 | 9 |
| `/analyses/checkpoint` | 3.2 | 2.2 | none | 268 | 0/0 | 0 | 2 | 4 |
| `/analyses/where-time-is-gained` | 4.6 | 3.5 | none | 405 | 0/0 | 1 | 3 | 3 |
| `/analyses/course-comparison` | 10.7 | 8.3 | 5 | 1026 | 1/0 | 4 | 6 | 8 |
| `/analyses/race-day-weather` | 8.4 | 6.2 | 3.8 | 929 | 1/0 | 4 | 6 | 11 |
| `/analyses/hills-and-pacing` | 2.9 | 2.1 | none | 222 | 0/0 | 0 | 2 | 4 |
| `/analyses/finish-time-context` | 3.9 | 3 | 1.4 | 317 | 1/0 | 1 | 3 | 4 |
| `/analyses/finding-improvement` | 3.7 | 2.7 | none | 324 | 0/0 | 1 | 3 | 4 |
| `/analyses/age-and-pacing` | 3.9 | 3 | none | 286 | 0/0 | 1 | 3 | 3 |
| `/analyses/warming-and-pacing` | 4.7 | 3.6 | 2.8 | 409 | 1/0 | 1 | 2 | 4 |
| `/analyses/wind-and-pacing` | 4.7 | 3.6 | 2.8 | 412 | 1/0 | 1 | 2 | 4 |
| `/analyses/downhill-start` | 8 | 5.6 | 3.8 | 895 | 1/0 | 4 | 6 | 8 |
| `/courses` | 13.5 | 4.3 | 0.6 | 362 | 27/0 | 0 | 0 | 1 |
| `/courses/berlin` | 19.5 | 14.2 | 0.8 | 2391 | 11/1 | 5 | 2 | 13 |
| `/courses/boston` | 18.5 | 13.1 | 0.8 | 2235 | 11/1 | 5 | 2 | 13 |
| `/courses/new-york` | 20 | 14.3 | 0.8 | 2560 | 11/1 | 5 | 2 | 13 |
| `/packs` | 5.7 | 4.2 | none | 475 | 0/0 | 0 | 1 | 2 |
| `/packs/r10_unravel_typology` | 3 | 2.2 | 1 | 212 | 1/0 | 2 | 3 | 3 |
| `/packs/r01_banking_time` | 8.6 | 6.1 | 3.2 | 1051 | 1/0 | 5 | 8 | 10 |
| `/packs/s3_course_breaks` | 2.4 | 1.8 | 1 | 189 | 1/0 | 1 | 2 | 3 |
| `/packs/r04_on_pace_goal_hits` | 2.2 | 1.6 | none | 145 | 0/0 | 1 | 2 | 3 |
| `/packs/r22_aging_changes` | 3.2 | 2.5 | none | 187 | 0/0 | 2 | 3 | 3 |
| `/about` | 6 | 3.9 | none | 637 | 0/0 | 1 | 1 | 2 |
| `/methodology` | 25.6 | 14.4 | none | 3188 | 0/0 | 0 | 51 | 22 |
| `/slowdown` | 8.7 | 7.5 | 5.3 | 498 | 1/0 | 5 | 10 | 3 |
| `/research/personalized` | 21.9 | 18.2 | 2.1 | 2032 | 4/0 | 13 | 27 | 17 |
| `/privacy` | 6.4 | 3.9 | none | 938 | 0/0 | 0 | 0 | 3 |
| `/tools/marathon-pace-chart` | 9.6 | 7.2 | none | 1788 | 0/0 | 2 | 1 | 57 |
| `/tools/half-marathon-pace-chart` | 6.1 | 4.3 | none | 669 | 0/0 | 2 | 1 | 27 |
| `/tools/marathon-pace/3-00` | 9.2 | 4.7 | none | 1023 | 0/0 | 4 | 2 | 7 |
| `/tools/marathon-pace/4-00` | 9.2 | 4.7 | none | 1024 | 0/0 | 4 | 2 | 6 |
| `/tools/marathon-pace/5-00` | 9.2 | 4.7 | none | 1027 | 0/0 | 4 | 2 | 6 |
| `/tools/qualifying/boston` | 9.6 | 5.7 | none | 1016 | 0/0 | 3 | 1 | 9 |
| `/tools/qualifying/nyc` | 7.4 | 4.4 | none | 676 | 0/0 | 3 | 1 | 10 |
| `/tools/qualifying/london` | 7 | 4.1 | none | 576 | 0/0 | 2 | 1 | 6 |
| `/finish-times` | 7 | 3.8 | 1.6 | 794 | 1/0 | 2 | 0 | 31 |

Reading the table:
- The **analyses** are short (3 to 5 screens) but nearly empty. The weather, course and downhill variants are long (8 to 11 screens) because two A-to-Z lists of 24 courses each take about 2 screens.
- The **stories** run 9 to 17.5 screens. They earn their length better than anything else, but a phone reader needs chapter progress and the ability to skip ahead.
- **Course pages** run 18.5 to 20 screens with tables, method copy and duplicated CTAs. A course page should be 6 to 8 screens with expandable depth.
- **Tools** run 7 to 17 screens. The result card usually lands by screen 2, which is good. Then come long tables, research essays and link lists.

---

## 4. Where the insights are buried (nugget inventory)

Each row lists the nugget the page already computes, where it sits today on a phone, and where it belongs. Numbers are today's values, given as examples only.

| Page | The nugget (current values, illustrative) | Where it is now | Where it belongs |
|---|---|---|---|
| `/analyses/starting-pace` | Openings more than 10% fast: **49.6%** sustained slowdown vs **24.5%** for even openings; **28.1 min** more after 20K | Screen 2.5, inside a dense dark paragraph after 1.5 screens of selects | Hero: "Go out 10% fast and you are *twice* as likely to hit the wall", with a two-dot comparison |
| `/analyses/course-comparison` | Sustained-slowdown share runs from about **19% (Valencia)** to **46% (Washington)**; time after 20K from **5 min** to **19 min** | Two alphabetical 24-row bar lists, screens 3–4 and 8–9; never stated in words | Hero sentence plus a ranked dot plot (best 3 and worst 3 labelled, middle collapsed) |
| `/analyses/race-day-weather` | The hottest band (68 °F+) adds about **4 min** after 20K versus the coldest; the slowdown share is non-monotonic (<41 °F: 31.6%, 41–50 °F: 27%) | Bar lists at screens 3 and 6–7; unstated | "Cold isn't free: the sweet spot is {band}", with a U-shaped dot chart |
| `/analyses/downhill-start` | Big downhill openers slowed **less** often (51.5% vs 56.4%) | Screen 3 two-bar chart; unstated; counterintuitive | Lead with the surprise; make the 2-bar comparison the hero |
| `/analyses/finding-improvement` | Improvers gained **19.6 min**; only **2.9 min** came in the first 10K, with **8.2 + 8.5** later | Screen 2 bars; unstated | "Most of a PB is found after 10K", with stacked contributions |
| `/analyses/age-and-pacing` | At the same finish time every age group slows by about **7.4–7.9%**: age barely matters | 11 identical full-width bars; headline is a count | "At the same finish time, a 60-year-old paces like a 25-year-old", with a flat dot strip |
| `/analyses/where-time-is-gained` | Just-under vs just-over goal finishers are level until about 30K; the gap opens late | 18 bars labelled in mono caps; headline is a tautology | "Sub-4 is won after mile 18", with a cumulative gap line |
| `/analyses/finish-time-context` | **42.4%** finish under 4:00; median 4:10:29 | Dark card OK, but the CDF chart has no marker at the target and x runs 1:30–12:00 (half of it flat) | Mark "you" on the curve; crop x to the 1st–99th percentile |
| `/analyses/warming-and-pacing` | A larger temperature rise was linked to **~2 points** more late slowing | Headline OK; the hero widget is an abstract CI dot (−1.3 · 0 · 3.0); a 192-dot scatter with no trend line | Translate to minutes on a 4:00 race; show binned means, not a noise cloud |
| `/analyses/hills-and-pacing` | (none shown by default) | Empty state: "Choose your marathon above." | Default to the course with the most finishes, or a hilliest-vs-flattest pair |
| `/analyses/checkpoint` | (none shown by default) | Two forms, no result | Pre-fill the even-pace example and show the result immediately |
| `/tools/course-chooser` | At 3:30 pace the share finishing under 3:30 ranges **5%–24%** across courses | The dark card gives the range but not *which* courses; 22 cards sorted "Course name" A to Z | Ranked strip chart of all courses first; default sort by share under goal |
| `/tools/pace-band` | Finishes that later blew up passed 20K **8:24 earlier** than those that held pace | Screen 2 dark paragraph; the section-pace chart (held pace flat, slowdown diving after 20K) is at screen 4 | Put the held-vs-slowdown chart directly under the band summary |
| `/tools/projector` | Even-pace trackers miss the real finish by a median **9:00**; the Pace Notes range misses by **5:57**, and holds 80% | Inside the "TESTED" paragraph at screen 3.5 | A stat callout: "Your tracker's finish estimate is about 9 minutes optimistic" |
| `/tools/weather-match` | Mornings like yours: **44%** slowed vs **31%** on cooler mornings; **+16:12 vs +10:57** after 20K | Good side-by-side dark columns at screen 2.5, then repeated in a 9-row table | Keep the side-by-side; drop the table; add the beeswarm as the second view |
| `/tools/marathon-pace/4-00` | **1.30×** as many finishes in 3:59 as a smooth curve predicts | Screen 7, behind "its ratio's 95% interval… is 1.27 to 1.32" | Second card on the page: "The 3:59 pile-up", with a mini histogram |
| `/tools/qualifying/boston` | Cut-offs swing from **0:00** (2022–23) to **7:47** (2021) | A 15-row table only | A cut-off bar or lollipop timeline |
| `/courses/berlin` | Medians **3:59:36 (2013) → 4:20:23 (2025)**; slowdown share 14.1%–38.9%; r = 0.68 with start temperature; most distinctive section 18.6–21.7 mi | Strong prose at screen 2; then a 20-row table; the scatter at screen 14 says "r = 0.68"; the replay sits at screen 17 | "What makes Berlin Berlin" as 3 nugget cards up top; the replay second; tables collapsed |
| `/` home | Only one finding is surfaced (**30.4%** had a sustained slowdown), with a doi link in body copy | Screen 3 | 3 to 5 swipeable nugget cards drawn from the stories and analyses, each linking to its page |
| `/stories/race-replay` | The pack spread ("At 3:00 on the clock, the middle 80% of the field covers 9.5 mi") | The headline is a count range; the spread snapshot is at screen 3 | Make the spread the headline |
| `/stories/who-holds-pace` | Women's growing share | About 15 per-city sparkline cards (about 4 phone screens) | One slope chart with all cities, highlighting the biggest movers |
| `/slowdown` | **30.4%** of finishes; definition | Definition and doi lead; the number sits at the bottom of screen 1; the 29-course list is alphabetical | Merge into a story or explainer card; rank the courses |

---

## 5. Chart legibility at 390 px

- **Text size.** The minimum rendered SVG text is 11 px on most charts, 10 px on hubs and home, **8.8 px** on course chooser and **9.5 px** on the qualifying checker. Axis ticks use light grey mono at about 11 px on paper, which is low contrast in sunlight. Target ≥ 12 px for ticks and ≥ 14 px for direct labels.
- **Overlapping twin lines.** Course comparison (Amsterdam vs Auckland), race-day weather (Below 41 °F vs 41–50 °F) and downhill (larger descent vs other) draw a 2 px solid line and a dashed line that sit almost on top of each other. The reader can't tell them apart, and the point (they are similar, or they differ late) isn't annotated. Use a difference band or label the gap at the end.
- **Scatters without structure.** Warming and wind each plot 192 editions with no trend, no binned means and no highlight. At 390 px it reads as noise. The courses story does this better with the "Untangle by course" toggle.
- **Abstract CI widgets.** The "+2.07 / −1.3 · 0 · 3.0" and "+0.32 / −1.3 · 0 · 1.3" dot-on-a-line widgets are tiny and meaningless without stats literacy. Show the effect in minutes on a reference race, and grey out the null case.
- **CDF framing.** On finish-time-context the x-axis runs 1:30–12:00. The curve is flat from about 6:00, so half the chart is empty, and there is no marker at the chosen target.
- **Misleading elevation scale.** The Berlin elevation profile uses a y-axis of 107–177 ft, so 70 ft of relief looks alpine. Course profiles need a shared y-scale (or a shared "feet per mile" band), or every course looks equally hilly.
- **Legends at the bottom.** The pacing-types gender paired bars put the Women and Men legend under 6 rows of bars. Values print as "37.7% · 24.4%" in mono below each pair. Direct-label the first pair instead.
- **Dense alluvial.** The final-kick "four states" alluvial is crowded at 390 px, and its pill legend wraps.
- **Route squiggles carry no data.** The 29 route thumbnails on /courses (about 200 px tall each) are beautiful but say nothing about pacing. The thin unlabelled pacing-type bar under each is the actual data.
- **Tables wider than the screen clip silently.** Examples are the round-numbers scoreboard, Berlin "Finish times by year" (the "SUSTAINE…" column is clipped), Berlin goal-times (5th column clipped) and Berlin race-morning weather ("HUMI…" clipped). Only the marathon pace chart explains that it scrolls sideways. Use a sticky first column with an edge fade, or turn tables into small multiples.
- **Chip and tab rows clip without affordance.** Examples are the replay race tabs ("Berlin 2024 · New York City 2025 · Londo"), the pacing-types by-course tabs ("Metronome · Gentle fader · Late fader · Ea"), the type-card carousel peek ("Ge"), and the hills select ("Choose a cou").
- **Charts that work** (copy these): the pacing barcode heatmap with a slider, the dumbbells (who-holds-pace), the round-numbers histogram with an annotated tallest tower, the beeswarm with "Your 64 °F", the pace-band section chart with a shaded "after 20 km" zone, the split-check section bars with the hatched slowdown zone, and the strip plot "Berlin 22%" among other courses.

---

## 6. Tap targets (phone)

Measured as links, buttons and inputs rendered smaller than 32 px in either dimension:
- **Kicker breadcrumbs** ("STORIES", "RUNNER TOOLS", "COURSES", "ANALYSIS 02 OF 10 / PACE YOUR RACE") are 16 px tall on every page.
- **Logo link** is 130×26.
- **Inline list links** run 17–21 px tall: the finish-times 29-race list (2 columns, 31 small targets), the JSON download links in story method boxes (`replay/berlin-2024.json`, etc.), and "Download the analysis data · Open the source data · Study methods".
- **Pacing-type filter chips** on stories are 26 px tall; Cliff is 42×26.
- **Course chooser** course-name chips are 28 px tall (37 small targets).
- **Marathon pace chart** "Pace band" row links are 65×16 (57 small targets).
- **Qualifying checker** checkboxes are 20×20 and icon buttons 29×32 (38 small targets).
- **Analysis prev/next** links on some templates are 27 px text links ("← Your pacing pattern", "From here to the finish →").

Good: selects, steppers, segmented controls, primary buttons and the menu button are 40–48 px. The floating goal stepper on pace band sits in the thumb zone.

---

## 7. Navigation between analyses: can a runner flow from one to the next?

**Partly, and only if they know where to look.**
- **Phone menu** (`extra/phone-menu-open.png`): a drop panel of pills reading Plan your race (orange), Analyze a past race, Courses, Tools, Research (black, active), About, Request an analysis and Open data. Neither the stories nor the ten analyses are reachable from the menu directly. "Research" leads to a 12-screen hub that mixes stories, analyses, weather extras, supporting study, methods, open data, marathons-and-years and the archive.
- **Header** hides on scroll down and returns on scroll up (good). There is no reading progress and no "chapter n of 7" or "analysis n of 10" indicator while reading.
- **Desktop analyses** have a sticky "The essential ten" sidebar (good). Phone has nothing equivalent.
- **Prev/next labels are inconsistent** across the 14 analyses:
  - "← Your pacing pattern / From here to the finish →" (text links)
  - "PREVIOUS QUESTION / NEXT QUESTION" (cards)
  - "← The essential ten / Explore your recorded races →" (course and weather)
  - "START WITH TEMPERATURE / ANOTHER WEATHER QUESTION" (warming and wind)
  - "BACK TO THE TEN ↗" (age)
- **The next link sits among promos.** It is wedged between "How we calculated this", "Was this useful?", a tool promo and "More tools". On stories, "next story" arrives after a 2-to-2.5-screen method box.
- **Hubs list questions, not answers.** /analyses shows ten question cards with category tags, /packs 35 underlined questions, /stories titles with decks and a big coloured numeral, and /courses 29 route cards. None of these previews a finding, so nothing pulls the reader in.
- **Duplicate tiers break the sense of a sequence.** /research/personalized repeats the ten analyses as 12 "personalized questions" in km, with its own header (no MI/KM toggle) and the breadcrumb "Research archive · For a focused introduction, explore the ten essential analyses." jammed under the header. /packs repeats 35 older questions in an older card style. /slowdown is a separate definition page.
- **The home page** shows "Seven stories about how marathons are run" but only 3 cards (01, 02, 07), on both phone and desktop.

---

## 8. Consistency across sections

| Aspect | Stories | Analyses | Tools | Courses | Reference |
|---|---|---|---|---|---|
| Hero | Dark, pixel runners, finding-style title | Light, mono kicker and question H1, no visual | Light, kicker, H1 with a per-tool coloured underline bar (blue, purple, orange, teal, amber, pink, green, black) | Dark, big route outline, 4 stats, 3 CTA pills | Light, plain |
| First thing after hero | A chart (by screen 0.4) | A form (1–2.5 screens) | A form, then the dark result (screen 1.5–2.5) | "At a glance" prose and a chip TOC | Prose |
| Headline voice | Findings | Counts or questions | Mixed: "4:05 to 4:15" (great) vs "22 of 29 courses have enough finishes" | Facts | n/a |
| Methods on page | 2–2.5 screen box at the end | Boxes, disclosures, captions and doi links throughout | "How this works", definition paragraphs with doi repeated (plan, pace band, projector, split check, marathon-pace pages) | "THE STUDY / How we measured it", "About this data", "Full methodology & sources" | /about is mostly methods |
| Ending | Downloads, next story, footer | What this can tell you, links, prev/next, useful?, promo, footer | Link cards, How this works, useful?, More tools, footer | Plan cards (repeating the hero CTAs), qualifying, replay, about-data, "Other courses" (alphabetical neighbours), footer | Footer |
| Units | mi | mi with 2-decimal conversions | mi with km mats | mi/ft | /research/personalized is km; /methodology and personalized lack the toggle |

**Colour carries four meanings at once:**
1. Pacing types (six hues).
2. Tool identity: top borders and H1 underline bars in eight hues.
3. Provenance: left borders and badges (orange for Pace Notes data, purple for published research, green for official standards).
4. The faster/slower diverging scale.

On a tools page you can see all four in one screen. Reserve colour for data meaning, and drop tool hues.

**Dark panels carry five meanings:** hero, answer, replay, method meta line, and caveat or promo. Make dark mean "the answer or the replay" only.

---

## 9. Page-by-page notes

### Hubs
- **`/` home (7.7 phone screens).**
  - The hero is a planner form (course select, goal input, orange button) with two small cards beside it. A great planner, but the first impression is a form, not a revelation.
  - On phone the replay is on screen 2 and starts as an almost empty black track. On desktop, hero plus replay side by side is the best fold on the site.
  - "What's at stake" leads with 30.4% and a doi link in body copy.
  - Three pinned stat cards follow (3,414,116 / 29 / **"2021"**: the year of a method paper shown as a stat), plus a grey paragraph reconciling 3,414,116 with 3,517,336.
  - Then "Three steps to a race plan" (1-2-3 cards), "Seven stories" (3 cards shown), a dark closing CTA band with runners, and the footer.
  - Recommendation: a hero nugget plus the replay, then a swipeable deck of 5 to 7 nuggets, each from a different story or analysis, then the planner.
- **`/research` (11.9).** A dark hero with pixel runners and time chips, then a cohort-count paragraph (method). Story cards are about 0.6 screen each, with a big coloured numeral and a blurred colour blob but no preview chart and no finding. Then "Ten questions" cards, an "Also:" link list, weather extras, a supporting-study card with doi, and METHODS + OPEN DATA + "Marathons and years" + data-source paragraphs (screens 9–11, all methodology), then the archive. Split it in two: a reading list (stories plus analyses with their headline nuggets) and /methodology.
- **`/stories` (4.1).** Seven cards, each a numeral, kicker, title, deck and "Read the story". Add each story's single best number and a thumbnail of its signature chart.
- **`/analyses` (4.7).** Dark hero "Find your next question." with ten question cards and tags, two weather cards and a request card. Lead each card with its answer, phrased as a finding.
- **`/tools` (5.9).** Grouped cards (Plan the race / On race day / After the race / Qualify) with coloured top borders, icons and provenance badges, then pace-chart links and four grey-rule principle notes. It's fine. Reduce the rainbow and tighten the cards to 0.4 screen each.
- **`/courses` (13.5).** 29 identical cards, each about 0.45 screen with a route outline, finishes, climb and a thin pacing-type bar. Melbourne shows an empty "No supplied route" box. A–Z only. Add sorts (flattest, steadiest, biggest field, coolest), a compact list or grid toggle, and labels on the type bar.
- **`/packs` (5.7) and pack pages (2.2–8.6).** An older template: "Question 01", inline "How we measured it", a lead stat, a blue line chart and bar list, "VIEW EXACT VALUES". These read as a research archive. Move them under /methodology, or merge the good ones into stories.

### Stories (all strong; tighten for phone)
- **`/stories/pacing-types` (13.3).**
  - The "Six runners, one finish time" animation has labels right-aligned and runners at the left. In a still frame they look stuck at the start.
  - The type carousel peeks the next card (good) but lacks pagination dots.
  - The barcode and slider are excellent. The stacked area chart is good. The gender pairs have their legend at the bottom.
  - Course tabs clip ("Ea"). The 29-row list ranks Vienna with "1 edition" alongside 20-edition courses. Show a sample-size cue or a minimum.
  - "Which runner were you?" (nine inputs, then F/E/S letter tiles) is the most personal moment, and it is buried at screen 10. Offer it as an early "find yourself" chip.
  - The method box runs about 2.5 screens.
- **`/stories/round-numbers` (9.1).** The headline ("tallest tower is 2:59") is great. The histogram with Everyone/Women/Men tabs and a finish-time input works. The scoreboard table overflows horizontally. "Getting under 4:00" (39% / 28% / ≈6,810 plus an S-curve) is good.
- **`/stories/race-replay` (15).**
  - The headline is a count range.
  - The replay panel is tall and mostly empty in its first frames, and the race tabs clip.
  - The snapshots are 8 near-identical small multiples (about 2.5 screens). Cut to 3 key moments with a scrubber.
  - Ghost runner, clock-pack fan and beeswarm are good. The method box takes about 2 screens and holds 10 JSON links.
- **`/stories/places` (9.9).** "A minute is nearly a coin flip" is a great headline. Chaser and leader pixel art, a decay chart, the mono "receipt" card with a zigzag edge and a break-even slider are the most delightful interactions on the site.
- **`/stories/final-kick` (14.4).** A bar chart with a pixel runner on top (great), a dense alluvial, a skeuomorphic gauge with a slider (heavy), bank-and-pay diverging bars and twin runners.
- **`/stories/who-holds-pace` (11.3).** Three pinned stat cards up top (20% vs 45%, 5.9×, 36% vs 22%) are the best "nugget first" opening on the site. The ghost race is strong. The dumbbell has 36 rows (1.5 screens). "Women are a growing share" uses about 15 sparkline cards, roughly 4 phone screens. Replace them with one slope chart.
- **`/stories/courses` (17.5).** The longest story. The "Name that course" quiz (You 0/0 · Model 95/172) is delightful. The scatter with "Untangle by course" is good. R² and "95% interval" are jargon. The heat signature with a pixel runner, sun and 68 °F slider works. Split it in two (courses, then weather) or add chapter navigation.

### Analyses (rework the template)
All 14 share these traits: question H1, a toggle between "All eligible finishes" and "With an earlier result", a filter form, a dark "WHAT THE DATA SHOWS" card, chart cards with method captions, "How to read this" and "Keep in mind", a methods disclosure, prev/next, "Was this useful?", a tool promo and the footer. Page-specific additions:
- **pacing-pattern (3.9).** The best of the ten structurally (one chart with a quartile band), but the headline states the obvious and uses 2-decimal miles.
- **starting-pace (8.9).** About 1.5 screens of controls, then a strong number (49.6%) in a dense card, a long amber caveat, and sections 01–04, each with its own caption.
- **checkpoint (3.2).** An empty state with two forms.
- **where-time-is-gained (4.6).** A tautological headline and 18 mono row labels.
- **course-comparison (10.7).** More than 2 screens of controls (4 selects, Update, then 2 more selects), a count headline and two alphabetical 24-row lists.
- **race-day-weather (8.4).** The same template. "More weather questions" appears as bullet links.
- **hills-and-pacing (2.9).** An empty state with a truncated select.
- **finish-time-context (3.9).** A good number. The CDF lacks a "you" marker.
- **finding-improvement (3.7).** An amber "requires earlier results" box (about 10 lines) appears before the form. The good nugget is never stated in plain words.
- **age-and-pacing (3.9).** A non-finding headline and 11 identical bars.
- **warming-and-pacing (4.7).** A good headline, then an abstract CI widget, a noise scatter, and a greyed caveat overlapping the answer.
- **wind-and-pacing (4.7).** A null result shown with alarming emphasis.
- **downhill-start (8).** A counterintuitive result left unstated, and about 2.3 screens of controls.

### Tools
- **plan (7.4).** The "Your plan" dark splits grid is great. Then come "On all courses" (171,033 / 19%) plus a long definition with doi, a 3-column mono table, an unreadable pace-band thumbnail, three stacked buttons, and two duplicate link lists (Before race day / After the race, then More tools).
- **pace-calculator (7.7).** A clean dark TIME / PACE / TREADMILL card, then a 30-row splits table (about 2 screens) and the watch-reads-long table. Fine for a utility; collapse splits to 5K mats by default.
- **predictor (10).** The dark "4:05 to 4:15" range card is the best result card on the site. Then: method rows, a 5-point research essay (about 2 screens; belongs in a story or methodology), and "A different question", a 20K histogram. Good.
- **pace-band (9.7).** The floating goal stepper is great. The held-vs-slowdown chart should come right after the band summary. The 26-row dark band list is fine for print and long on screen.
- **course-chooser (14.1).** Default sort is A to Z. 22 cards × 3 tiles × 3 pill buttons = 66 buttons. Lead with a ranked chart.
- **weather-match (11.7).** Strong side-by-side columns and beeswarm. The 9-row table repeats the columns. The purple published-research panel (WBGT tables, 4 mini cards, 3 study cards) is about 3 screens; collapse it.
- **projector (9.8).** Eight mat chips with two-line labels ("3.1 mi / 5K"), a 2×2 segmented control, a good dark result and percentile tiles. The tested-accuracy nugget is buried.
- **split-check (10.9).** The verdict card ("27% slower… a sustained slowdown starting at 18.6 mi") and section bars are excellent. The definition card and "finishes like yours" tables are long.
- **qualifying (16.6).** The "Meets 3 of 6" summary with ± bars is good, followed by six detail cards of about 2.5 screens each. Collapse them to one line per race.
- **marathon-pace/{goal} (9.2 each).** The dark summary is good; the tables are long; the 3:59 pile-up nugget sits at screen 7.
- **qualifying/{race} (7–9.6).** Standards tables plus rules prose. Boston's 15-year cut-off table wants a chart.
- **marathon/half pace charts (9.6 / 6.1).** Utility tables with a sideways-scroll notice; 57 small "Pace band" links.

### Courses (`/courses/berlin`, `boston`, `new-york`: 18.5 to 20 screens)
Hero (4 stats, 3 CTA pills, route) → "at a glance" prose (good numbers) → chip TOC (8 chips) → finish-times-by-year table (20 rows, clipped) → method paragraph → elevation chart (exaggerated scale) plus two different climb numbers (169 ft vs 240 ft, confusing) → section climb table → 6 pacing-type tiles → fingerprint line and heat rows → "THE STUDY / How we measured it" → a second pace line chart (duplicate of the fingerprint) → definition and doi again → 3 big stats → goal-times table (clipped) → strip plot vs other courses (nice) → weather-by-year table (20 rows) → temperature scatter with "r = 0.68" → plan link cards (duplicates of the hero CTAs, about 2 screens) → qualifying → **replay at screen 17** → about-this-data → "Other courses" (alphabetical neighbours: "Barcelona, Boston") → footer.

Suggested order: hero → 3 "what makes {course} different" nuggets → replay → how it's paced (fingerprint) → finish times over the years (sparkline, table on tap) → weather vs slowdown → elevation on a shared scale → plan CTAs once → *similar* courses (by fingerprint or flatness, not by alphabet).

### Reference
- **`/methodology` (25.6 screens, 51 disclosures).** This is the right home for all the method copy, but it needs a sticky table of contents, deep anchors that each page's single "How we know" link can target, and the MI/KM toggle in the header.
- **`/about` (6).** "More understanding. Every mile." Mostly data-source copy that belongs on /methodology, and it says "34 marathons and 256 editions" while the home page says 29. Make it a short personal page: who, why, how to request, open data.
- **`/slowdown` (8.7).** Definition-led, with an alphabetical course list. Turn it into an explainer card or story section.
- **`/finish-times` (7).** Median cards (4:10 / 4:31 / 3:59), a histogram, a shares table, a percentile table, "What these numbers cover" (method), and 29 race links in a 2-column list (small targets). A good candidate for the year-in-review treatment: "Your finish time vs the field".
- **`/privacy` (6.4).** Fine.

---

## 10. Desktop-specific notes
- Stories and analyses use a text column of about 640 px, left-aligned in a container of about 1200 px. On text-only sections the right 45% is empty, and charts break out wider, so the page zig-zags. It's readable but sparse. Consider centred measure plus margin notes, or sticky chart / scrolling text.
- The analyses' desktop fold (for example race-day weather, `extra/desktop-weather-fold.png`) shows sidebar, question, toggle, a 4-select form and a button, with **no data visible at 1440×900**.
- Course heroes on desktop (`extra/desktop-newyork-fold.png`) are strong: a big route on dark plus 4 stats. The three CTA pills compete with each other.
- The home desktop fold (hero plus autoplaying replay) is the best first impression on the site. Reproduce it on phone.

---

## 11. Direction for the redesign (design around fields, not numbers)

1. **One anatomy for every analysis, story and course page:**
   - **Question** (kicker) and **answer** (H1 as a finding, generated from fields: extreme, ratio, gap or direction).
   - **One hero chart** with *you* (the default or chosen goal) marked in orange.
   - **3 nugget cards**, swipeable on phone. Each card has one big number, one sentence and a micro-viz.
   - **"Make it yours"**: personalisation in a bottom sheet opened from a floating chip ("All courses · 4:00 · All ages ▾"), reusing the pace-band floating stepper pattern. Defaults always show a full answer, with no empty states.
   - **Deeper views** (progressive: tap to expand tables and secondary charts).
   - **Next up**: a full-width card carrying the next page's headline nugget as a teaser, plus series progress dots.
   - **One quiet "How we know →" link** to the right /methodology anchor. No captions, boxes or doi links on the page.
2. **A headline generator per page type.** Choose a template by which is largest: the gap between extremes, the ratio, or a null ("no clear difference"). Fill it with field values, let the italic orange accent wrap the number, and give null results neutral styling.
3. **Rank, don't alphabetise.** For any category list over about 8 items, use a ranked dot or strip plot with the top and bottom 3 labelled and the middle collapsed ("+18 more"). Show a sample-size cue, such as small or hollow dots for few editions.
4. **Collapse the tiers.** Make "The Essential Ten" a numbered series (and fold in the weather and downhill extras). Treat the stories as long-form chapters. Fold /research/personalized and /packs into those or archive them under /methodology; turn /slowdown into an explainer. Make the hubs show answers.
5. **Phone navigation.** Give the menu a full-screen sheet that lists Stories and Analyses with their headline nuggets. While reading, show a slim progress bar and an "n of 10" pill, and a persistent "Next →" at the end of the page.
6. **Make the replay the hero on phone.** Full-bleed, autoplay when in view, starting at a frame where the field has spread, with tap to pause or scrub. Use the pixel runners as data (each a finish-time group moving at its real pace).
7. **Chrome diet.** The closing stack should fit in one screen or less: next-up card, a small thumbs up or down, share. The footer should be about 0.6 screen. Move "Pause all animations" into a settings or accessibility toggle in the menu.
8. **Colour semantics.** Orange for accent and *you*; the pacing-type palette for types only; blue/orange for faster/slower only; provenance as small text tags. Drop per-tool hues.
9. **Units.** Name checkpoints as 5K / 10K / half / 20 mi / last 10K, round miles to one decimal, and never show two-decimal miles in headlines. Make mi or km a global choice that every page respects, including /methodology and personalised views.
10. **Tables.** Use a sticky first column and an edge fade with a "scroll →" cue, or convert to small multiples (year tables become sparklines with tap-for-table).
11. **Tap targets ≥ 44 px** for every list link, chip, checkbox and breadcrumb. Inline body links can stay inline, but give them padding.
12. **One canonical count per surface,** from the adopted release's manifest. Use a consistent rounding helper ("3.4 million" style), and never show two different denominators side by side without a visible reason.

---

## 12. What was captured and sampled

The sitemap lists 117 URLs, more than the roughly 60 threshold. Every distinct template was captured in full, along with a sample of the repeated ones: **58 pages × 2 sizes = 116 full-page screenshots.**

- **Captured in full (every page of the template):**
  - home, `/research`, `/research/personalized`, `/stories` and all 7 stories
  - `/tools` and all 10 tool pages
  - `/analyses` and all 14 analyses
  - `/courses`, `/packs`, `/about`, `/methodology`, `/slowdown`, `/privacy`, `/finish-times`
  - `/tools/marathon-pace-chart`, `/tools/half-marathon-pace-chart`
- **Sampled:**
  - course pages: `/courses/berlin` (flat, big field), `/courses/boston` (point-to-point, hilly), `/courses/new-york` (bridges, largest climb) — 3 of 29
  - packs: `r10_unravel_typology`, `r01_banking_time`, `s3_course_breaks`, `r04_on_pace_goal_hits`, `r22_aging_changes` — 5 of 34
  - goal pace pages: `/tools/marathon-pace/3-00`, `4-00`, `5-00` — 3 of 5
  - qualifying race pages: `/tools/qualifying/boston`, `nyc`, `london` — 3 of 6
- **Not captured (same templates as sampled pages):**
  - 26 courses: amsterdam, auckland, austin, barcelona, chicago, copenhagen, dubai, eindhoven, frankfurt, gold-coast, hamburg, helsinki, london, madrid, melbourne, oslo, paris, prague, rotterdam, singapore, stockholm, sydney, valencia, vienna, warsaw, washington
  - 29 packs
  - marathon-pace 3-30 and 4-30
  - qualifying chicago, berlin and sydney
- **Capture notes:**
  - Five captures hit a transient 502 on a sub-resource and were re-shot cleanly: finish-times, stories/places, analyses, analyses/pacing-pattern, marathon-pace/5-00.
  - `/tools/split-check` logs a console error on load: `<rect> attribute width: A negative value is not valid ("-1.578…")`, which suggests a chart bar computed with a negative width. Worth a fix.
  - No page had horizontal page overflow at 390 px. Overflow is contained in tables and chip rows, which clip, as noted above.
