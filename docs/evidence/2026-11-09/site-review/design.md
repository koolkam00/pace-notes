> **Copy of a reviewer's report.** This file is the design and UX reviewer's report on https://splithappens.run, written on November 9, 2026 against commit `068b6c370`. It is a reviewer's claim, not a measured record of this repository: its claims were not all tested, and [REVIEW.md](REVIEW.md) says which were and what the second read found. Where the report says "verified", that is the reviewer's word for its own tests.
>
> Paths beginning `/home/user/pace-notes-review/` mean this repository at that commit. Paths under `/tmp/` were the review's working folder (screenshots, crawl output, scripts); it is not kept.
>
> The copy was made by a script and was not retyped (182 lines, 34,336 bytes in the source). The script strips trailing spaces, shortens the working folder's path to `/tmp/scratchpad` (31 places), and writes a Markdown link whose target does not resolve from this folder as a code span with a space between its two parts (none in this file). The reviewer returned this report as text and the lead agent saved it; it is plain text without Markdown headings, so its section titles show as plain lines. One backslash was added so that the words `<climb> of climbing` show.

---

DESIGN AND UX REVIEW OF https://splithappens.run (Pace Notes)

== DIGEST ==

Status
- Build reviewed: https://splithappens.run/version.json read 2026-11-09 21:52 UTC gave sha 068b6c3700f7201b78d13698c1838c515b21a32c, ref main, builtAt 2026-11-05T20:24:05Z. That is HEAD of /home/user/pace-notes-review; every line number below is for that checkout (the lead's /home/user/pace-notes may have drifted).
- Browser work is FINISHED: 336 screenshots, 9 crops, no browser job running. The machine is free for heavy jobs.
- Read-only kept: no edits in either checkout, no git writes, no build or verify commands, no form submitted, no feedback button clicked, the analytics host aborted in every context, only splithappens.run visited.
- REPORT.md was NOT written. The Write tool refused /tmp/scratchpad/review/design/REPORT.md with: "Subagents should return findings as text, not write report files. Include this content in your final response instead." I did not route around it. The full report is the text under this digest; the lead can save it as that file if wanted.
- Evidence folder: /tmp/scratchpad/review/design/ (subfolders shots, crops, data, scripts; the recover subfolder holds my own notes, not deliverables).

Top 10 findings (impact order)
1. P0 D1. Chart bands draw solid on at least 4 research pages plus the runner and checkpoint charts: `.a-band` computes opacity 1 instead of 0.1, because `--wash` is a colour alias. /home/user/pace-notes-review/app/styles/components/chart-frame.css:59. Safe mechanical.
2. P1 D2. With KM pressed, next cards and /analyses rows still show "40 s/mi" and "41–50°F" (0 metric figures on 6 pages probed); `reading.km` is read nowhere. /home/user/pace-notes-review/components/NextCard.tsx:37. Safe mechanical.
3. P1 D3. Home on a phone: the replay fills y 56–350 before the H1 (y 370) and the line saying what the form answers is hidden under 600 px. /home/user/pace-notes-review/app/styles/pages/home.css:20 and :142. Owner decision.
4. P1 D4. /charts is 22.68 phone screens against a hub budget of 4, with no filter or grouping and one inbound link. /home/user/pace-notes-review/app/charts/page.tsx:21. Owner decision (nav current mark is mechanical).
5. P1 D5. Pace band preview text is 7.8–8.13 px at 390 wide and 6.27–6.54 px at 320. /home/user/pace-notes-review/app/styles/pages/tools/pace-band-strip.css:19. Owner decision.
6. P1 D6. Runner flow: Back leaves "1 race selected" and the analysis on screen with the search and profile gone. /home/user/pace-notes-review/components/RunnerSearch.tsx:262. Mechanical (3 setters), behaviour choice.
7. P1 D7. Explorer: the personalising chip sits at page y 857 on an 844 px phone screen (y 972 on a 900 px desktop) and the H1 keeps the 4:00 example after a change. /home/user/pace-notes-review/components/AnalysisExplorer.tsx:289. Owner decision.
8. P2 D8. Raw "Failed to fetch" reaches visitors at 11 code sites (2 seen live). /home/user/pace-notes-review/components/AnalysisExplorer.tsx:237. Safe mechanical.
9. P2 D9. Switching motion off does not stop a running replay (clock 1:49:46, then 1:58:01), and under OS reduced motion the switch still reads on. /home/user/pace-notes-review/components/viz/RaceReplay.tsx:100. Mechanical plus wording.
10. P2 D10. The "Example" label is lost when home's Plan button is pressed with nothing typed (the form always sends course=all). /home/user/pace-notes-review/components/home/PlanFormUnits.tsx:23. Safe mechanical.
Alternates: D11 the pace chart's edge fade stays over the last column at scroll end (519 px hidden); D12 fonts and versioned data answer max-age=0.

== FULL REPORT ==

0. Conventions and method
- Site figures are as displayed live on 2026-11-09 at build 068b6c3. "Verified" means I measured or saw it myself; the method is in brackets.
- Chromium (Playwright) through the agent proxy. Phone 390×844 (touch, mobile) and desktop 1366×900, light and dark; layout also measured at 320 and 360. 26 routes × 6 runs measured; interactions scripted (scripts in the evidence folder).
- Rubric. P0: wrong or unreadable content on a core surface for all visitors. P1: materially hurts a main task or a large group (phone visitors, km readers) or clearly misses one of the site's own design rules. P2: polish, rare states, small inconsistencies, owner notes. Effort: S under an hour, M half a day, L more.
- I ran none of the repository checks (by instruction). Any fix below is a site change and needs the checks in standing rule 23, and a look at the result at phone and desktop widths in light and dark.

1. Findings

D1 (P0). Chart bands draw solid. Verified (live computed styles on seven surfaces in light and dark; screenshots viewed; code and history read). Safe mechanical, S.
- What: the p25–p75 band is designed as a 10% ink wash. Live it is opaque, so the median line and reference lines inside it cannot be seen and the key swatch does not match the band.
- Cause: /home/user/pace-notes-review/app/styles/components/chart-frame.css:59 `.viz-frame .a-band { fill: var(--ink); opacity: var(--wash, .1); }` (key mark at :130) reads the legacy colour alias `--wash: var(--paper-sunk)` at /home/user/pace-notes-review/app/styles/tokens.css:88. A colour is invalid for opacity, so it computes to 1. The rule came in with #85 (2026-10-30); before it the line was `opacity: .1`. /stories/half-to-full is right only because /home/user/pace-notes-review/app/styles/pages/story.css:313 sets its own `--wash: .12`.
- Measured (phone, light unless said): /analyses/pacing-pattern opacity 1, `--wash` #ede6d8 (dark #1f242d), band 291×142 inside the night answer card; /stories/who-holds-pace 358×167; /stories/race-replay 358×150; /stories/final-kick two bands (332×159 and a 73×10 ruler band); runner "Similar runners" 358×79; checkpoint result ruler 203×10; designed look on /stories/half-to-full opacity 0.12. Of 22 research pages probed, 5 have a band at load and 4 draw it solid, hence "at least 4 pages".
- Evidence: /tmp/scratchpad/review/design/shots/band-analyses-pacing-pattern--phone-light.png; /tmp/scratchpad/review/design/shots/band-analyses-pacing-pattern--phone-dark.png; /tmp/scratchpad/review/design/shots/ix-runnertabs--phone-light--tab-peers-chart.png (solid black band); /tmp/scratchpad/review/design/shots/band-stories-half-to-full--phone-light.png (the designed look); /tmp/scratchpad/review/design/data/band.json.
- Fix: rename the opacity knob so it cannot collide. chart-frame.css:59 and :130 to `opacity: var(--band-wash, .1)`; /home/user/pace-notes-review/components/viz/LineProfile.tsx:117 to `full: 'var(--band-wash, .1)'`; story.css:313–315 to `--band-wash: .12` (dark `.15`). Leave tokens.css:88 and the legacy colour uses alone (/home/user/pace-notes-review/app/styles/pages/tools/weather-match.css:43, :46; /home/user/pace-notes-review/app/styles/pages/tools/predictor.css:36, :50). Update the comments at chart-frame.css:56, /home/user/pace-notes-review/components/viz/ChartFrame.tsx:18, LineProfile.tsx:31 and :116. `--wash-thin` has no collision; renaming it too is optional. Re-check the key swatches afterwards.
- Guard: none of the 13 checks in /home/user/pace-notes-review/scripts/design/lint-layout.cjs looks at band opacity. Add one that fails when a `.viz-frame .a-band` that is not `.is-signal` or `.is-fade` computes opacity 1.
- Not measured: gradient band stops; key marks outside the half chart.

D2 (P1, km readers). Mile and Fahrenheit figures with KM pressed. Verified live on three slots (phone light, `?units=km`, KM shown pressed); the rest from code. Safe mechanical, S.
- Measured: 0 metric figures on all six pages probed. Next card on /stories/pacing-types "40 s/mi" (page y 1760); next card on /stories/race-morning "41–50°F" (y 2060); /analyses rows "40 s/mi" (y 570) and "41–50°F" (y 1660). Inferred from code: the desktop rail beat label (/home/user/pace-notes-review/components/analysis/Shell.tsx:87, :94).
- Cause: the reading carries a `km` twin (/home/user/pace-notes-review/lib/chapters.ts:63) but `reading.km` is read nowhere in app, components or lib. The working pattern is at /home/user/pace-notes-review/components/course/CourseGlance.tsx:152.
- Evidence: /tmp/scratchpad/review/design/shots/ix-km--phone-light--next-card.png; /tmp/scratchpad/review/design/shots/ix-km--phone-light--analyses-row.png; /tmp/scratchpad/review/design/data/final-ab.json.
- Fix: at /home/user/pace-notes-review/components/NextCard.tsx:37 and /home/user/pace-notes-review/components/ui/ChapterList.tsx:50 and :69, when `reading.km` exists render `<ByUnits mi={<BigNumber ...reading... />} km={<BigNumber value={reading.km.value} unit={reading.km.unit} sr={reading.km.sr} ... />} />` (/home/user/pace-notes-review/components/ui/ByUnits.client.tsx:11); add a `data-beat-km` twin at Shell.tsx:94 read by /home/user/pace-notes-review/components/RailBeats.client.tsx:18; add a slot check to the nuggets verifier.
- Safety I checked: both files are server components; `useUnits` throws at build (/home/user/pace-notes-review/components/UnitsProvider.tsx:20) on pages outside the lists at /home/user/pace-notes-review/lib/unit-preference.ts:9–10, and every caller that passes readings is on a units page; /home/user/pace-notes-review/app/layout.tsx:72 renders the compact list with no readings. Literal `key:` strings in lib/nuggets contain no unit words (dynamic keys not checked).

D3 (P1). Home, phone first screen. Geometry verified (screenshot and boxes); the impact is judgment. Owner decision.
- Measured at 390×844: header 0–56; night replay y 56–350; H1 y 370–445; "Free pacing research from recorded splits." y 464; course select 211×44 and goal input 144×44 at y 509; orange "Plan your race" 358×52 at y 566–618; doors y 626–670; guess beat from y 770. The line that says what the form answers is `display: none` under 600 px (/home/user/pace-notes-review/app/styles/pages/home.css:140–142). The replay precedes the H1 through `order: -1` (home.css:20), deliberately (comments :19, :22–24).
- Context, quoted with its date and source only: /home/user/pace-notes-review/autopilot/LEARNINGS.md:5–12 (2026-10-14) records about 510 visits in 30 days, 78% on phones, 83% landing on home.
- Evidence: /tmp/scratchpad/review/design/shots/home--phone-light--first.png.
- Options: (a) drop `order: -1` on phones so the H1 and form lead; (b) show the how-line (the CSS comment says this pushes the doors off the first screen at 360×640); (c) shorten the replay on phones.

D4 (P1). /charts hub. Verified (measurement, screenshots, live HTML). Owner decision, M; one part safe mechanical, S.
- Measured: 22.68 phone screens against the hub budget of 4 (/home/user/pace-notes-review/docs/DESIGN_SYSTEM.md:14); 15.73 desktop screens; 111 controls; no filter, grouping or H2 although each row carries one of six themes; on desktop the left column holds only the H1 and dek for 14,155 px. Hard to find: no link from home, one inbound sentence on /research (/home/user/pace-notes-review/app/research/(hub)/page.tsx:48), not in the menu.
- Constraint: /home/user/pace-notes-review/docs/TOP_100_CHARTS.md:45 makes the single numbered list the contract, so any grouping is the owner's call. Proposal that keeps the contract: theme jump chips or a filter above the same numbered list.
- Safe mechanical: Research is not marked current on /charts; add `'/charts'` to the list at /home/user/pace-notes-review/components/SiteNav.tsx:31.
- Evidence: /tmp/scratchpad/review/design/shots/charts--phone-light--first.png; /tmp/scratchpad/review/design/shots/charts--desktop-light--first.png.

D5 (P1, with a caveat). Pace band preview on phones. Verified (text-run measurement at three widths; CSS read). Owner decision, M.
- Measured: times 7.8–8.13 px at 390, 7.14–7.45 at 360, 6.27–6.54 at 320; labels 7.07–7.86, 6.47–7.19, 5.68–6.31; 74 text runs on each of /tools/plan and /tools/pace-band. Sheet 356×217 on phone against 729×444 on desktop (labels 11 px, times 15.99–16.67 px). Cause: /home/user/pace-notes-review/app/styles/pages/tools/pace-band-strip.css:19 scales the font with the container.
- Caveat: it is a deliberate scaled picture of the print (comment :54–57); readable values are in the night card and the "All numbers" folds; pinch zoom is allowed.
- Evidence: /tmp/scratchpad/review/design/shots/ix-plan--phone-light--band.png; /tmp/scratchpad/review/design/data/sum-tiny.txt.
- Options: tap to enlarge; a sideways-scrolling preview at a readable scale; one strip per row on phones.

D6 (P1). Runner flow: Back leaves a mixed state. Verified (two Back presses, state read after each). Part (a) mechanical, S, but a behaviour choice; part (b) owner decision, M.
- Measured after Back from an open analysis: URL /runners, name field empty, results gone, profile gone, while "1 race selected · Edit" (y 720–767) and the analysis remain. A second Back leaves /runners.
- Cause: the reset at /home/user/pace-notes-review/components/RunnerSearch.tsx:258–264 clears search and profile state but not `selected` (:209), `confirmed` (:210) or `editing` (:213); history is written only for the search (:314–315).
- Evidence: /tmp/scratchpad/review/design/shots/ix-runnertabs--phone-light--after-back.png; /tmp/scratchpad/review/design/data/runner-tabs.json.
- Fix (a): add `setSelected([]); setConfirmed(null); setEditing(false);` to the else-branch at :262. Fix (b): push history state objects with no URL change (standing rule 18 keeps names and record IDs out of URLs) when a match opens and when an analysis opens, so Back steps analysis, profile, results.

D7 (P1). Explorer: the personalising control is under the first screen and the H1 answers the example. Verified. Owner decision.
- Measured: chip "All courses · 4:00 Change" 358×48 at page y 857 on phone (screen 844); 420×48 at y 972 on desktop (screen 900). After a changed selection the H1 stays on the 4:00 example with the small line "Showing All courses · 3:45 below. The headline is for all courses at 4:00." (deliberate, /home/user/pace-notes-review/components/AnalysisExplorer.tsx:289–291); the personal sentence is the results title lower down. After Update, focus moves to the chip and the page scrolls to y 201 (phone) or 245 (desktop).
- Evidence: /tmp/scratchpad/review/design/shots/ix-runnertabs--phone-light--finish-time-dest.png.
- Proposals: lift the chip under the dek so it is on the first screen; when the URL carries a selection, lead with the personal sentence and demote the example.

D8 (P2). Raw "Failed to fetch". Verified live on two surfaces (data requests failed in the test); the rest from code. Safe mechanical, S.
- Evidence: /tmp/scratchpad/review/design/data/interact-states.log line 12 ("Failed to fetch Try loading again") and line 14; /tmp/scratchpad/review/design/shots/ix-states--phone-light--runners-data-error.png.
- Sites: /home/user/pace-notes-review/components/AnalysisExplorer.tsx:237; /home/user/pace-notes-review/components/CheckpointExplorer.tsx:78; /home/user/pace-notes-review/components/AllFinisherAnalysis.tsx:258; /home/user/pace-notes-review/components/FastStartAnalysis.tsx:119; /home/user/pace-notes-review/components/RunnerContext.tsx:291; /home/user/pace-notes-review/components/RunnerSearch.tsx:31 (used at :229, :240); /home/user/pace-notes-review/components/tools/Projector.tsx:194, :212; /home/user/pace-notes-review/components/tools/WeatherMatch.tsx:154; /home/user/pace-notes-review/components/tools/CourseChooser.tsx:119; /home/user/pace-notes-review/components/tools/Predictor.tsx:529; /home/user/pace-notes-review/components/tools/LinkedPanel.tsx:67. The right pattern already exists at /home/user/pace-notes-review/components/tools/RacePlan.tsx:51, /home/user/pace-notes-review/components/tools/SplitCheck.tsx:225 and /home/user/pace-notes-review/components/report/RaceReport.tsx:35.
- Fix: one shared helper, for example /home/user/pace-notes-review/lib/error-text.ts with `loadErrorText(e, fallback)`, returning the fallback when `e` is not an `Error` or is a browser-thrown `TypeError`, `SyntaxError` or `DOMException`, else `e.message`; use it at each site with that site's existing fallback string. Do not reuse a `startsWith('This data')` test: it would hide the loaders' own friendly messages (/home/user/pace-notes-review/lib/analysis-aggregates.ts:14, /home/user/pace-notes-review/lib/all-finisher-context.ts:107).

D9 (P2). Motion switch. Verified. S to M; the pause is mechanical, the switch wording is the owner's.
- Measured: with the replay running, switching motion off leaves it running (clock 1:49:46 before, 1:51:37 400 ms after the click, 1:58:01 later, pause icon still shown), although /home/user/pace-notes-review/components/MotionToggle.tsx:4 says off "pauses every animated figure and the replay". Under OS reduced motion the replay is still at load (clock 2:01:09, "Play the replay") but the switch still reads `aria-checked="true"` (:8).
- Cause: /home/user/pace-notes-review/components/viz/RaceReplay.tsx:100 acts only while `phase === 'waiting'`; nothing reacts when `reduced` (:72) changes later.
- Evidence: /tmp/scratchpad/review/design/shots/motion-home--phone-light--switch-off.png; /tmp/scratchpad/review/design/data/extra.json.
- Fix: in RaceReplay.tsx an effect that sets `'paused'` when `reduced` turns from false to true while the phase is `intro` or `playing`, with the previous value kept in a ref (reacting to `reduced === true` alone would stop play from ever resuming). In MotionToggle.tsx:8 show off, or "follows system", under the system setting.

D10 (P2). "Example" label lost through the home button with nothing typed. Verified. Safe mechanical, S.
- Measured: /tools/plan opened directly shows "EXAMPLE · 4:00"; through home's "Plan your race" with nothing typed the card shows "4:00" as if it were the visitor's goal. The GET form always sends `course=all`, and /home/user/pace-notes-review/components/tools/RacePlan.tsx:199 treats any URL key other than `paces` as a real input.
- Evidence: /tmp/scratchpad/review/design/shots/ix-cta--phone-light--empty-dest-first.png.
- Fix: at /home/user/pace-notes-review/components/home/PlanFormUnits.tsx:23 also `event.formData.delete('course')` when it equals `'all'`; or, to cover the form without JavaScript too, at RacePlan.tsx:199 ignore keys whose value equals `DEFAULTS` (:44).

D11 (P2). Marathon pace chart, phone. Verified. Safe mechanical, S.
- Measured: table 877 px in a 358 px box (519 px hidden; 589 at 320). The 20 px right-edge fade stays on at the scroll end, over the last column's "Band" links (x 342–374). Cause: /home/user/pace-notes-review/components/tools/PaceChartTable.tsx:30 tests overflow only, on resize (:33–36), with no scroll listener; mask at /home/user/pace-notes-review/app/styles/pages/tools/pace-charts.css:12.
- Evidence: /tmp/scratchpad/review/design/shots/ix-misc--phone-light--pace-chart-scrolled-right.png.
- Fix: add a passive `scroll` listener and drop the mask class when `el.scrollLeft + el.clientWidth >= el.scrollWidth - 1`.

D12 (P2). Caching. Verified by curl on 2026-11-09 21:52 UTC: /fonts/inter-latin-wght-normal.woff2 and /data/live.json both answer `cache-control: public, max-age=0, must-revalidate`. Config change, S; the lifetime is the owner's choice.
- Fonts (4 files, 238 KB on home) and data JSON whose URLs carry `?v=<sha256>` are revalidated on every visit. /home/user/pace-notes-review/vercel.json:22–47 has no Cache-Control rule for /fonts or /data.
- Fix: add `{ "source": "/fonts/:path*", "headers": [{ "key": "Cache-Control", "value": "public, max-age=<owner's choice>" }] }` (the 13 files in /home/user/pace-notes-review/public/fonts have unhashed names, so not `immutable` unless they are hashed) and `{ "source": "/data/:path*", "has": [{ "type": "query", "key": "v" }], "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] }`. Keep /data/live.json and /version.json as they are.

D13 (P2). Home with data failing. Verified (data requests failed in the test). S.
- "The replay could not load. Refresh to try again." is drawn at y 258 over the axis labels ("Start", "20K", "Finish" at y 268) while a static curve and a play button still show; there is no retry button. /home/user/pace-notes-review/app/styles/components/replay.css:68; /home/user/pace-notes-review/components/viz/ReplayStage.client.tsx:61, :71, :91; /home/user/pace-notes-review/components/viz/ReplayFrame.tsx:90.
- Evidence: /tmp/scratchpad/review/design/shots/ix-states--phone-light--home-data-error-first.png.
- Fix: move the status clear of the axis and offer a retry that re-runs the load effect (ReplayStage.client.tsx:65–73).

D14 (P2). Explorer details. First two verified live, third from code. Wording is the owner's; the URL item is a mechanical nit.
- With age 85–89 and Men the note says the age group was widened, but the chip, hero kicker and scope line still name the narrow group (/home/user/pace-notes-review/components/AnalysisExplorer.tsx:261–262, :291, :320).
- `?race=boston` (a slug) is ignored, while the planner takes `course=boston`.
- URLs keep default filters although `dropDefaults` exists (AnalysisExplorer.tsx:250; /home/user/pace-notes-review/components/CheckpointExplorer.tsx:102).

D15 (P2). Runner flow length. Verified. Owner decision.
- 5 taps on /runners after typing a name, 6 from home. Searching "Smith" gave "10,135 matching record groups" in 567 ms (phone) and 431 ms (desktop); result rows 358×64; profile rows 358×56 with 24×24 checkboxes; analysis in about 2.25 s; tabs 115×38, 122×38, 115×38 (pressed-state buttons with 44 px hit areas); "Make a race report" 203×52. Proposal: a one-tap "view this race" for a single race, keeping the tick boxes for several.

D16 (P2). Courses index. Verified. The first item is a wording choice.
- The "Start temperature" sort says "coolest on average first" (/home/user/pace-notes-review/app/courses/page.tsx:97) but rows show only ranges, so the order cannot be checked by eye (/tmp/scratchpad/review/design/shots/ix-courses--phone-light--sorted-last.png). Washington shows a dash where other rows show a route silhouette. Sort chips hide 247 px on phone (mask present). Sorting does not change the URL.

D17 (P2). Course page. Measurements verified; the reading risk is inferred.
- The route outline's only visible caption is "\<climb> of climbing" (/home/user/pace-notes-review/components/course/CourseHero.tsx:98–100). The elevation beat's nine blocks carry no visible row label (/tmp/scratchpad/review/design/crops/course-boston--phone-light--elevation-strip.png). The hero clips 3 px at every width (client 358, scroll 361; trivial).

D18 (P2). Planner folds. Verified. Safe mechanical, S (wording is the owner's).
- Summaries read "All numbers 9 rows", "All numbers each 5K and mile · 36 rows", "All numbers 9 rows": two identical accessible names. Pass the existing `name` prop (/home/user/pace-notes-review/components/ui/Values.tsx:41) at /home/user/pace-notes-review/components/tools/RacePlan.tsx:485 and :503.

D19 (P2, owner note). /tools/qualifying/boston on a phone opens on the cut-off history; "Qualifying standards" and "Check a time" start at y 1000. Deliberate per /home/user/pace-notes-review/components/tools/QualifyingRace.tsx:82–83. Verified by measurement.

D20 (P2). Layout nits, verified by screenshot. /half on desktop: "Save the image" at y 764 with blank space under it on the first screen (/tmp/scratchpad/review/design/shots/half--desktop-light--first.png). /stories/half-to-full on phone: two evidence chips stacked on separate lines under the dek, y 295–365 (/tmp/scratchpad/review/design/shots/story-half-to-full--phone-light--first.png).

D21 (P2, owner note). /request-analysis: the form's action is a `mailto:` (/home/user/pace-notes-review/components/AnalysisRequest.tsx:39), so it depends on the visitor having a mail client; a plain address link exists (:58). From code; not submitted, by instruction.

D22 (P2, owner decision). 404: one screen, two quiet buttons, empty from y 360 to the footer at y 640 (/tmp/scratchpad/review/design/shots/notfound--phone-light--first.png). By spec (/home/user/pace-notes-review/app/not-found.tsx:5–8); whether to add the two doors is the owner's.

D23 (P2, owner decision). Overlapping indexes: /research (its H1 equals the home guide's H2), /analyses and /stories (near-identical lists), /charts, /half. Verified by reading the pages; which one is the research index is the owner's call.

D24 (P2, owner note). The home hero is a night section that contains a form, while /home/user/pace-notes-review/docs/DESIGN_SYSTEM.md:12 says night is "Never a form". Change the wording or the design.

D25 (P2). Phone focus order on home. Verified (/tmp/scratchpad/review/design/data/extra.json): skip link, brand, MI, KM, Menu, "recorded splits" link (y 454), select and input (y 509), "Plan your race" (y 566), doors (y 626), then back up to "Pause the replay" (44×44 at y 297), then the guess range. Desktop order is visual. Cause: home.css:20. Option (a) of D3 resolves it.

Notes on /methodology (phone), not findings: jump chips hide 189 px (mask present); 12 text runs at 11.76 px; two inline links 20 px tall inside a closed fold; 221 folds, none open by default.

2. Measurements (26 routes × 6 runs; summaries in the data subfolder, files named sum-*.txt)
- Phone length in screens of 844 px: home 4.47, research 3.98, analyses 2.58, pacing-pattern 2.03, stories 2.56, pacing-types 2.68, half-to-full 3.28, tools 1.86, plan 3.11, pace-band 2.72, marathon pace chart 4.05, the 3:30 page 3.02, qualifying/boston 3.34, courses 3.40, courses/boston 5.36, half 3.69, charts 22.68, charts/1 1.62, runners 1.65, finish-times 2.81, slowdown 2.02, methodology 8.60, about 2.40, privacy 1.68, request-analysis 1.51, 404 1.00.
- Desktop length in screens of 900 px: home 3.60, research 2.64, analyses 2.20, pacing-pattern 2.01, stories 2.24, pacing-types 2.54, half-to-full 3.31, tools 1.47, plan 2.83, pace-band 2.30, pace chart 3.74, 3:30 page 2.86, qualifying/boston 2.03, courses 1.85, courses/boston 4.97, half 3.97, charts 15.73, charts/1 1.48, runners 1.42, finish-times 3.11, slowdown 1.99, methodology 7.64, about 1.76, privacy 1.27, request-analysis 1.07, 404 1.00.
- Against the budgets in the design system (home 4.5, story 6, analysis 4, course page 7, tool 5, hubs 4, info pages 2.5, methodology 10): only /charts is over.
- Timing per run, median TTFB and median FCP in ms (LCP equals FCP, the LCP element is text on every route): 390 light 107 and 420; 320 light 102 and 400; 360 light 105 and 428; 1366 light 105 and 424; 390 dark 116 and 440; 1366 dark 102 and 420. Unthrottled, from a data centre.
- Layout shift: 0 on every route in all four phone runs; desktop at most 0.0161 (finish-times, qualifying/boston).
- No page-level horizontal overflow at 320, 360, 390 or 1366. Deliberate sideways scrollers on phone (hidden px): pacing-types table 230; half-to-full tables 438 and 247; pace-band values 91; marathon pace chart 519; 3:30 groups 172; qualifying cut-off values 164; courses sort chips 247; course contents chips 360 and three "All numbers" tables 378, 14, 211; half table 139; finish-times tables 32 and 37; methodology jump chips 189.
- Small text: only the pace band preview (D5), /tools/qualifying/boston (3 runs at 11.67 px) and /methodology (12 runs at 11.76 px).
- Page weight, phone light, network bytes: home 25 requests, 621 KB (script 305 KB in 16 files; fonts 238 KB in 4 files; CSS 30 KB; document 14 KB; data 33 KB; 650 DOM nodes); /stories/pacing-types 26 requests, 602 KB; /tools/plan 31 requests, 630 KB (data 95 KB in 3 fetches; 970 DOM nodes). The italic serif file (82 KB) is the second-largest download on home and is not preloaded; whether italics appear on first screens was not checked.
- Contrast failures: 0. Unnamed controls: 0. Every page starts on an H1 with no skipped heading levels. Console errors: none except my own blocked analytics request.

3. Information architecture and taps to a personal answer
- Phone header: brand, MI/KM, Menu. The menu is a modal dialog (panel 390×820, scroll locked, focus moves to "Close menu", Escape returns focus to "Menu") with 23 links: 5 primary rows 358×52 (Plan your race, Analyze a past race, Courses, Tools, Research), 3 small links (About, Request an analysis, Open data), 11 chapter rows 358×68, then "How we know" and "Privacy". Current marks work, except /charts (D4).
- Desktop inner pages: Plan your race, Analyze a past race, Courses, Tools, Research, MI/KM, Chapters drawer. The home header shows Courses, Tools, Research only, by design.
- From home on a phone. "Plan your race" with nothing typed: 1 tap to /tools/plan with the 4:00 example (lead and night card both in view). Goal only: 2 taps plus typing to /tools/plan?goal=3:45. Course and goal: 4 taps to /tools/plan?course=boston&goal=3:45 ("3:45 IN BOSTON"; the night card, 358×369 at y 535, runs past the first screen on phone and is fully in view on desktop). "Analyze a past race": to /runners, then name, Search, match, tick, view, which is 6 taps from home (D15).
- Shortest personal path on /runners: the finish-time field (212×52 at y 629; typing "3.45" becomes "3:45"), one tap to /analyses/pacing-pattern?goal=225.
- Empty search answers "Enter a recorded name or the beginning of a name."; no match gives a helpful state with three next steps and the list of marathons.
- Units switch MI/KM carries across pages through `?units=km` and storage; it works everywhere checked except the slots in D2.

4. What is good and should be kept (verified)
- Zero contrast failures and zero unnamed controls in all six measured runs; no page-level overflow down to 320 px; layout shift 0 on phone; text LCP on every route; fast responses.
- The menu as a proper modal dialog; a working skip link to `#main`; a visible focus ring on every stop checked by screenshot (2 px blue with 2 px offset, amber inside night sections). One caveat: the planner's Splits/paces checkbox reports no outline and its ring was not confirmed visually.
- The chart scrubber as a slider with a spoken value and arrow keys; the sticky header that hides on scroll down and returns on scroll up; 44 px hit areas.
- The planner updating in place with state in the URL and neutral errors ("Pick a goal between 1:30 and 8:00.", "Try 3:30:00, 3:30 or 210."); the dot key typing a colon in time fields; loading states marked busy; the guess beat moving focus to the verdict.
- Runner search keeps typed text out of the URL (standing rule 18 holds in what I saw); the explorer's bottom sheet on phone and side panel on desktop; every table scroller is a labelled, focusable region; pinch zoom is not blocked; the replay respects reduced motion at load; no service worker.

5. What I did NOT check
- Only Chromium through the agent proxy from a data centre, unthrottled: no Safari, Firefox, real phones, slow network or slow CPU.
- No screen reader pass. No print output and no wristband print (never clicked, by instruction).
- The request-analysis submission and the page-feedback buttons (by instruction).
- Desktop dark full pages (first screens only); widths between 390 and 1366 and above 1366.
- 98 of the 100 chart pages; course pages other than /courses/boston; tools other than plan, pace band, marathon pace chart, the 3:30 page and qualifying/boston (predictor, weather match, course chooser, split check, projector, /report, /your-race: their raw-error sites are from code only).
- Share cards and social images. Analytics data (blocked in the browser and not queried).
- Gradient band stops and key marks outside the half chart; the desktop rail beat label under KM (code only); the nav current mark on the 100 chart pages (code plus the /charts screenshot); the planner checkbox's focus ring.
- Whether the lead's checkout has drifted from 068b6c3, and none of the repository's checks or builds.

6. Sorting for the lead
- Safe mechanical code changes (file and exact change named above): D1, D2, D4 (nav current mark only), D8, D10, D11, D18, D14 (URL defaults nit); D6 part (a) and the D9 pause are mechanical but change behaviour.
- Owner decisions: D3, D4 (hub structure), D5, D6 part (b), D7, D9 (switch wording), D12 (cache lifetime), D13 (retry wording), D14 (widened-group wording), D15, D16, D17, D19, D20, D21, D22, D23, D24; D25 follows D3.
- A regression guard is worth adding with D1 (band opacity) and D2 (units slots), since neither is covered by a current check.
