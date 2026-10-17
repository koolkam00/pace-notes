# Direction C · Instrument

**One reading at a time.**

Pace Notes turns into a precision instrument for reading a marathon. The contents page is a stopwatch's lap list. Every page opens on one reading: a number, one sentence and a hairline scale. Every chart with a continuous axis has a needle you drag with your thumb, and the race replay becomes the instrument's face at night. There is one accent colour, the type is exact, and everything below the reading is depth you open when you want it.

- **Prototype:** `proto/` is hand-written HTML, CSS and vanilla JS with no build step. Serve the folder with `python3 -m http.server` and open `index.html`, `story-round-numbers.html`, `analysis-starting-pace.html` or `course-boston.html`. Add `?t=<seconds>` to freeze a replay at a race-clock moment, `?reveal` on the story to open the guess, `?view=route` on Boston for the route replay and `?units=km` for kilometres.
- **Data:** the prototype uses the checked-in release (`private-export-20260912-0934`). `scripts/extract.py` copies the small release files as they are and slices the big ones (fast-start, courses, course-goal, the 30 km checkpoint shard and the all-finisher course row) **keeping their field names**. No page types a number. `proto/js/nuggets.js` is the working prototype of the proposed `lib/nuggets.ts`: every figure and every directional word comes from a field expression with a guard, so the pages stay true when release `htw-db-2026-10-16-1652` lands.
- **Screenshots:** `shots/` (index in §13). Every screen is captured at 390×844 (DPR 2, mobile, touch), both full page and first screen, plus 1440×900 full page. Mid-interaction captures, dark mode and 200% zoom are included. I looked at every capture and fixed what was off (the iteration log is in §12).
- **Numbers in this document** are today's values, given as examples only.

---

## 1. Principles

1. **One reading per page.** A page opens on the one thing: a figure, a sentence that says what it means, and a scale that shows where it sits. The rest is depth on demand: another beat, a tap to compare, a Values table. If a page needs two readings, it is two pages or a ledger (§9).
2. **The needle is the only colour.** Orange marks *the reading*: the finding, or the value under your thumb. Everything else is ink on paper in four greys. The six pacing types are told apart by their **shape**, not by hue. Provenance badges become glyph plus word. Blue, gold, green, rose, violet and teal leave the page UI.
3. **Hairlines, aligned.** Rules are 1 px on the pixel grid. Charts are drawn at their real pixel width, so a hairline never blurs and text never scales. Figures that line up use tabular numerals, and a standalone figure uses proportional ones.
4. **Touch the data.** Every chart with a continuous axis is scrubbable. A horizontal drag moves the needle 1:1, a vertical drag scrolls the page and a tap sets the needle. A detent tick marks every meaningful value. The readout above the chart is the tooltip, so nothing hides under a finger.
5. **Motion explains a change of state.** Springs mark contact (a press, a toggle, a sheet), eased reveals mark data arriving, and nothing moves for decoration. Reduced motion, or the site's Motion switch, shows every final state at once.
6. **Read it like a race.** The site reads as eleven laps from start to finish. A lap track along the top of every screen shows where you are, and every page ends on the next lap's reading, so a reader is always pulled forward.
7. **Insights only.** Method copy lives on `/methodology` only. Each page has one quiet "How we know ↗" link, and the term *sustained slowdown* links to `/methodology#sustained-slowdown`.
8. **Honest by construction.** Every headline is a nugget with a guard and a neutral fallback. Null results look null. One sentence uses one denominator. Shares are "of finishes", never "your chance".
9. **Paper by day, night for the race.** Dark mode is a selected palette rather than an inversion. The replay is always night, in either theme.

---

## 2. The reading flow: eleven laps, start to finish

The home page is the **Start**. After it come eleven laps, each one a stretch of the race or a question the previous lap raises. A lap is one or more existing pages in a fixed order. URLs do not change: laps are an ordering and navigation layer, `lib/laps.ts`, read by the header, the Contents sheet, the rail and the next-lap card.

| Lap | Name | Pages, in order (canonical URLs kept) | Lead reading (nugget, today) | Folds in |
| --- | --- | --- | --- | --- |
| Start | Start line | `/` | 3 in 10 finishes had a sustained slowdown (`study.rate`) | `/about` closing credit |
| 01 | The field | `/finish-times` (with the finish-time-context explorer embedded) → `/stories/race-replay` | Median finish 4:10 (`finish-times.histogram`) | `/analyses/finish-time-context`, years from `/stories/courses#years` |
| 02 | The first 5K | `/analyses/starting-pace` → `/analyses/downhill-start` | +5:00 at the finish after a 10%+ fast 5K (`kick.bank.bands`) | `final-kick#bank`, the r01/s1/r02 opening packs |
| 03 | The shape of a race | `/stories/pacing-types` → `/analyses/pacing-pattern` | 1 in 25 ran the second 20K faster (`ext_pacing_shapes`) | split-pattern and successful-shape packs |
| 04 | Halfway to 30K | `/analyses/checkpoint` → `/stories/places` → `/tools/projector` | 13% on even 4:00 pace at 30K made 4:00 (`checkpoint shard`) | checkpoint-outcome, goal-slip and pace-trend packs |
| 05 | After 30K | `/slowdown` → `/stories/final-kick` (break, warning light, twins) → `/analyses/where-time-is-gained` | 72% of sustained slowdowns began at 30K or later (`study.timing`) | bad-patch and severity packs |
| 06 | The finish line | `/stories/round-numbers` → `/stories/final-kick#magnet` | 1.73× the curve in the 2:59 minute (`finish-times.marks`) | milestone packs, the landmarks figure removed from `/slowdown` |
| 07 | Who holds pace | `/stories/who-holds-pace` → `/analyses/age-and-pacing` | 20% vs 45% sustained slowdown, women vs men at the same finish times (`demographics.overall`) | gender and age packs, the study age figure |
| 08 | Your race | `/runners` → `/tools/split-check` → `/report` | Yours (nine mats) | none |
| 09 | Where you run | `/stories/courses` (fingerprint, name-that-course, matched) → `/analyses/course-comparison` → `/analyses/hills-and-pacing` → `/courses` → `/courses/[city]` | 19–46% sustained slowdown, by course (`all-finisher courses`) | course packs, paired-course comparisons |
| 10 | The weather | `/stories/courses#weather` → `/analyses/race-day-weather` (with **temperature, warming and wind** as three tabs; the two old URLs become anchors) → `/tools/weather-match` | 197 of 225 same-course pairs: the warmer year had more sustained slowdowns (`courses.weather.pairs`) | heat-curve and weather-pattern packs |
| 11 | The next one | `/analyses/finding-improvement` → recurrence and habits → `/tools/plan` → `/tools/pace-band` · `/tools/course-chooser` · `/tools/predictor` | 51% had a sustained slowdown again after one (`kick.recurrence`) | improvement, persistence, experience and spacing packs |
| — | Reference | `/methodology`, `/about`, `/privacy`, `/tools/pace-calculator`, `/tools/qualifying*`, the pace charts | — | — |

**What changed from the 12-chapter order in `nuggets.md`, and why**

- **The prologue is the Start, not a lap.** The lap count then matches the reader's sense of a race: you start, then you run laps.
- **Your race moves from 10 to 08**, straight after Who holds pace. Once a reader knows the patterns, the next question is "and mine?". Checking your own race *before* you choose where and when to run next turns Where you run and The weather into inputs for the plan.
- **Where you run and The weather sit directly before The next one.** The planner at the end of lap 11 then inherits a course and a morning, and the journey's finish line is the plan.
- **Merges** follow `nuggets.md` §3: one opening chapter, one shape chapter, one "on pace at X km" chapter, one sustained-slowdown chapter, one round-numbers home, one weather analysis with three tabs, and one source for per-course slowdown everywhere (`courses.json` on course pages).
- **Cuts and archive moves.** `/research/personalized` gets a 308 to its lap pages. The 77 pack aliases get 308s to lap anchors. `/packs` stays as an archive linked from `/methodology#archive`. `/stories` and `/analyses` become anchors of the Contents. `/research` stays as the Contents' canonical URL, because `verify-seo orphans` needs every story and analysis linked from it.

---

## 3. Navigation on a phone

How a runner moves from one analysis to the next:

| Element | Behaviour | Built in the prototype |
| --- | --- | --- |
| **Lap track** | A 3 px rule fixed to the very top, split into 11 segments with 2 px gaps, like a watch's minute track. Laps already passed are grey and the current lap fills in orange with scroll progress. It stays when the header hides. It is `aria-hidden`, because the header button carries the same information. | yes |
| **Header** (60 px) | Brand, the mi/km switch, and the lap button: `LAP 06` plus a lap-list glyph (`Contents` on Start). It hides on scroll down and returns on scroll up. Motion is transform-only, as today. At 299 px and below the controls take a second row. | yes |
| **Contents sheet** | A bottom sheet with a soft spring and a 26 px corner, a right-hand drawer from 900 px. Top to bottom: the five doors (Plan your race in orange, Analyze a past race, Courses, Tools, All laps), then the **lap list**. Each lap row has its number, title, subtitle and **its reading** on the right, the way a stopwatch shows lap times. The current lap is marked with a signal dot. Methodology, About, Request an analysis and Open data ↗ sit underneath. Escape and a tap on the scrim close it, and focus returns to the toggle. | yes |
| **End of every page** | An "Also in this lap" row, then the **Next lap card**: a night card carrying the next page's reading as a teaser figure, with a 48 px orange go button. Below it sit the previous lap, "How we know ↗" and Was this useful? (Yes / No). The closing stack fits in about one screen. | yes |
| **The crown dock** | A floating pill in the thumb zone on analyses and tools: the one "make it yours" control (course on analyses, goal stepper on tools, reusing the pace-band goal-bar pattern). It hides while the hero is on screen and when the next-lap card arrives. | yes (course) |
| **Desktop rail** | From 1180 px, a sticky list on the left: the laps on stories and analyses, the sections on course pages. `aria-current` marks the place. | yes |
| **In-page** | Each beat has an anchor (`#towers`, `#opening`, `#elevation` …). Course pages keep `nav.course-toc` chips. | yes |

There is no swipe between pages: a horizontal drag belongs to the charts.

---

## 4. Type

Three families, down from four. **Bricolage goes**, and the reading figures use Inter's display optical size, which follows the dataviz rule that a hero figure is set in the sans. **Fraunces is subset to the `wght` and `opsz` axes**, with no SOFT or WONK. The display serif is calmer and crisper, and the italic accent stays.

| Role | Face | Phone → desktop | Weight · leading · tracking | Notes |
| --- | --- | --- | --- | --- |
| H1 / display | Fraunces, opsz auto | `clamp(2.6rem, 9.6vw, 5.4rem)` (home 2.65→5.6rem; analysis 2.35→4.6rem because its H1 is a sentence) | 420 · 1.0 · −0.026em | `text-wrap: balance`; italic accent in `--accent-ink` |
| H2 (beat finding) | Fraunces | `clamp(1.75rem, 6.6vw, 2.75rem)` | 440 · 1.08 · −0.018em | always a finding, never a topic |
| Sentence (the reading's line) | Fraunces | `clamp(1.3rem, 5.4vw, 1.75rem)` | 400 · 1.24 · −0.012em | `text-wrap: pretty` |
| **Figure** (the reading) | Inter, opsz display | `clamp(4.5rem, 22vw, 8.5rem)`; `.m` 3–4.75rem; `.s` 2.25–3rem | 280 · 0.86 · −0.055em | proportional figures; unit suffix at 0.34em in ink-3 |
| Readout value | Inter | 1.75rem → 2rem | 400 · 1.05 · −0.03em | **tabular** (it changes under the thumb, so it must not jitter) |
| Body | Inter | 17 px → 18 px | 400 · 1.6 | `cv11`; colour ink-2 |
| Small | Inter | 14 px | 400 · 1.45 | |
| Label / kicker | JetBrains Mono | 11 px | 500 · 1.4 · 0.12em, uppercase | kickers, readout keys, lap numbers only (never chart row labels) |
| Tick | JetBrains Mono | 10.5–11.5 px | 500 · tabular | ticks ≥ 10.5 px on charts; direct labels in Inter 11.5–12 px |

**Fonts weigh 262 KB against about 400 KB today.** That is Fraunces opsz normal 67 KB, opsz italic 82 KB, Inter opsz 73 KB and JetBrains Mono 40 KB, all Latin subsets. Inter and Fraunces normal are preloaded. `scripts/font-fallbacks.cjs` must regenerate the metric-matched fallbacks for the new axes and weights. One catch: `→` (U+2192) is outside Inter's Latin range, so every arrow on the site is an inline SVG.

---

## 5. Colour

One accent, four greys, one night. Every contrast figure below was computed with the dataviz skill's `contrast()` (`scripts/contrast.mjs`).

**Light (default)**

| Token | Hex | Use | Contrast on paper |
| --- | --- | --- | --- |
| `--paper` | `#F4F1EA` | page (less yellow than today's `#F5F0E6`) | — |
| `--paper-raised` | `#FBFAF6` | cards, sheet, inputs | — |
| `--paper-sunk` | `#EAE6DD` | switch tracks, CTA band | — |
| `--ink` | `#141519` | headings, figures, subject marks | 16.2:1 |
| `--ink-2` | `#45474E` | body | 8.2:1 |
| `--ink-3` | `#6B6962` | muted text, ticks | 4.87:1 (4.41 on sunk, so never as text on sunk) |
| `--mark-quiet` | `#8F8A80` | context marks (other years, other sections) | 3.04:1 |
| `--fill-quiet` | `#CFC9BE` | silhouettes, columns, tracks | 1.55:1; the readout and Values table give the relief |
| `--rule` / `--rule-strong` | `#DCD7CD` / `#B9B3A7` | hairlines / axes and outlines | — |
| `--accent` | `#FF5B2E` | brand fill: the primary button and the brand mark. S1 pins `rgb(255,91,46)`. | text on it: ink 5.90:1 (white fails at 3.09) |
| `--signal` | `#EC5120` | **data marks, the needle, lit dial ticks** | 3.23:1 (the brand orange is 2.74, below the 3:1 mark floor) |
| `--accent-ink` | `#B4380D` | the italic accent, signal text | 5.30:1 |
| `--accent-wash` | `rgba(236,81,32,.09)` | "behind" areas, a highlighted section band | — |

**Night (the replay face and the next-lap card):** `--night #0E1116`, `--night-2 #161A21`, `--night-ink #F4F1EA`, `--night-ink-2 #9EA3AD` (7.47:1), `--night-signal #FF6A3D` (6.65:1).

**Dark** (under `prefers-color-scheme: dark`, guarded by `:root:not([data-theme="light"])` and again under `[data-theme="dark"]`): paper `#0F1013`, raised `#17181C`, sunk `#1E2025`, ink `#EEEBE4` (16.0:1), ink-2 `#B7B4AD` (9.19), ink-3 `#8C8982` (5.45), mark-quiet `#6F6C66`, fill-quiet `#34363C`, rule `#26282D` / `#3A3D44`, signal `#FF6A3D` (6.69), accent-ink `#FF8A63` (8.21). The replay gets a 1 px night-rule ring so it doesn't dissolve into a dark page. See `shots/dark-*.png`.

**Meaning, one job per colour**

- **Orange is the reading.** It marks the finding, the value under the needle, the reader's own value, or a runner at sustained-slowdown pace in the replay. One chart never carries two different oranges.
- **Ink is the subject** (Boston, the observed value) and **quiet grey is context** (other courses, other years).
- **Hollow ink is "typical" or "expected"**, and a dashed ink outline is the typical-course comparison.
- **Pacing types:** a 40×18 shape glyph drawn from each type's profile on one shared scale. A Metronome is flat and a Cliff spikes late. Colour only marks the type a sentence is about.
- **Evidence badges:** glyph plus word, monochrome. ● Pace Notes data · ◆ Published research · ■ Official standard. They are never combined into one figure, and plain calculations carry none.
- **Faster and slower:** position and sign carry direction (bars above or below "own average", ↑ "slower" labels). The blue/red diverging ramp is retired, except in tables where a sign alone reads badly.

**Contract impacts:** `scripts/build-og-images.cjs` checks its `TOKENS` and throws when they change. Update it, then re-render the 63+ cards in the new palette (paper, ink, signal). The manifest `theme_color` becomes `#F4F1EA`, and dark gets its own `<meta name="theme-color" media>`.

---

## 6. Space, grid, breakpoints

- **4 px base.** The scale is 4 · 8 · 12 · 16 · 24 · 32 · 48 · 72 · 112.
- **Side margin** `clamp(16px, 5.2vw, 48px)`, which is 20 px at 390. The container is 1200 px, or 1320 px with the rail. The text measure is 36rem and the figure width is 52rem.
- **Three breakpoints replace about 30:** 600 (large phone, replay frames get a radius), 900 (two-column heroes, the right-hand drawer sheet, 18 px body) and 1180 (the rail appears, laid out as `188px | 56px | content`).
- **Phone grid:** a single column with 4 implicit columns for readouts (main value left, side values right). Ledgers and goal cells are 2–3 equal columns separated by hairlines.
- **Rhythm:** a beat starts `clamp(68px, 13vw, 120px)` below the previous one, its head (label, H2, dek) has 22 px below it, and a figure sits under its readout. Sections are separated by whitespace, not by boxes. Cards appear only in decks, the guess panel, the CTA and "Shaped like Boston".

---

## 7. Motion

| Token | Value | Used for |
| --- | --- | --- |
| `--spring` | CSS `linear()` sampled from a damped spring (ζ ≈ 0.62, one 8% overshoot); fallback `cubic-bezier(.34,1.36,.64,1)` | press release, toggle thumbs, crown pick-up, peak needle |
| `--spring-soft` | `linear()` spring, ζ ≈ 0.8 (1.5% overshoot); fallback `cubic-bezier(.3,1.15,.6,1)` | the sheet, column morphs, reveals of a result |
| `--ease-out` | `cubic-bezier(.16,1,.3,1)` | fades, header hide, section reveals |

**Durations:** a press goes down in 90 ms and springs back in 520 ms. A toggle thumb takes 520 ms. The sheet takes 620 ms. A reveal rises 14 px with a fade over 760 ms. Dial ticks light in a 9 ms stagger (under a second for 100 ticks). Column morphs take 560–620 ms with a 1.6–6 ms stagger per column.

**Rules**
- Only `transform` and `opacity` animate. Columns are drawn at full height and scaled (`transform-box: fill-box`), and the onset bars use `flex-grow`. Nothing animates geometry attributes, so it works in old Safari.
- **The needle never eases: it is 1:1 with the thumb.** Instruments don't lag.
- Nothing moves without a change of state. There is no scroll-jacking and no scroll-scrubbed animation. One looping element per screen at most: the replay, which plays once at 3 race-minutes per second and stops at the last finish. The pixel runner in the CTA is the only decoration, and it stops under reduced motion.
- **Reduced motion and the Motion switch** (`data-motion-off`, the existing `pace-notes-motion` key) set durations to 1 ms. Reveals are visible, the dial is lit, and the replay opens paused on the first-finish frame with its note showing.
- **Haptic feel.** When the needle crosses a detent, the tick flashes (scale 2.2 → 1 in signal) and `navigator.vibrate(3)` fires where it exists (Android). iOS has no web vibration API; I considered the iOS 18 `<input switch>` hack and rejected it as an accessibility risk. Switches also squash slightly on press (`scaleX(1.12)`) before they spring across.

---

## 8. Chart grammar at 390 px

**Anatomy of every figure, top to bottom:**
`[lens control] → readout → hairline → plot → axis → crown row → key → Values`

- **Lens control:** a segmented control or chips, 38–40 px tall, for tap-to-compare (count ↔ against the curve; 3:00 · 3:30 · 4:00; the six opening bands).
- **Readout:** 64 px reserved. On the left, a mono key and an Inter value of 28 px or more (tabular); on the right, one or two side values. It is `aria-live="polite"`, written as a literal attribute. It is the tooltip on phone and desktop alike.
- **Plot:** its box is reserved by CSS before any script runs: an aspect `--r` on phones, capped at `--max` on wide screens through container units, with an `aspect-ratio` fallback. It has `role="slider"` with `aria-valuetext` and keyboard steps.
- **Axis:** a `--rule-strong` baseline, ticks 4–6 px down, mono labels at 11.5 px. There is no y-axis line and at most three gridlines, labelled **inside** the plot on whichever side is clear of data.
- **Crown row:** the needle stops at the baseline and a short stem carries the 20 px crown **below** the tick labels, so the line never crosses a label. A `‹ drag ›` hint shows until the first scrub.
- **Key:** only when two or more encodings appear. Swatches are dots, lines and squares, and the text stays ink.
- **Values:** a `<details>` disclosure holding the table twin (a focusable `role="region"` with a caption).

**Marks:** lines are 2 px with round joins, columns are 24 px or less with 2 px gaps (minute histograms are a silhouette 1–3 px wide), and dots are 8 px or more with a 2 px paper ring. Reference lines are solid ink (zero, 1×, own average). Dashed ink is kept for "typical" or "expected". Direct labels go on the subject and the extremes only. Text never takes a data colour; the exception is accent-ink on the reading. Units follow the switch. Timing mats keep their race names (5K, 20K, 30K) in both modes, because that is what the mats are called. Distances in prose are miles to one decimal, never "3.11 mi". Counts on axes are written out (10,000), never "10K", because on a running site 10K is a distance.

**Interaction rules:** a horizontal drag scrubs (`touch-action: pan-y`; intent needs a 6 px move with dx > 1.2·dy), a vertical drag scrolls and a tap sets. On desktop, hovering moves the needle without a click. The keyboard uses arrows, PageUp/PageDown, Home and End. A detent snaps at round marks, the best point and range ends. Hit areas are 44 px or larger.

**The forms, as built:**

| Form | Where | At 390 px | Interaction |
| --- | --- | --- | --- |
| **Ruler** (scale) | under readings: "54% vs 37% typical", the guess reveal | a one-line hairline 0–100% with 4–5 ticks; signal dot = the reading, hollow = typical, ink = comparison | none (static) |
| **Dial** (100 ticks = 100 finishes) | home stakes (30%), course goal times (9% made 4:00) | 260–340 px bezel, every tenth tick longer, figure in the centre | ticks light clockwise on reveal; the goal segment re-lights it |
| **Scrub curve** | starting pace U-curve, Boston median by year, the year strip | 2 px ink line, signal point under the needle, the best point hollow with a label, "behind" washed | drag, tap, hover, keys; detents at even, the best point and 10% fast |
| **Lens histogram** | the 3:59 towers | 210 minute columns as a silhouette; minutes before a round mark in ink, the tallest ratio in signal; smooth curve 1.25 px | scrub minutes; detents at marks; **lens morph** from count to *diverging from the 1× line* (the honest "against the curve" view); the needle stops at the tower's top instead of covering it |
| **Bins around a mark** | the cushion | 60 ten-second columns, the last minute in ink, the peak in signal, the mark as a solid ink line | segmented marks; columns spring to the new mark and the peak needle slides |
| **Dumbbell list** | six openings, pacing types, by course | 46 px rows, label column 34–46%, hollow typical, filled observed; signal when the gap matters | list; by-course sits in depth |
| **Share bar** | onset by mat | HTML flex bar, exact proportions, the 20K segment in signal; labels move below a segment narrower than 46 px | chips re-fill it with a `flex-grow` spring |
| **Strip** | Boston among courses | beeswarm-lite stacked upward; Boston labelled above on a leader; extremes labelled below; fewer than 3 races drawn hollow | static (tap to open a course page in the build) |
| **Scatter** | race-morning weather | 20 dots or fewer, year labels that flip side on collision, the hot/cool pair joined by a dashed line | static |
| **Elevation + pace** | Boston | one **shared elevation scale for every course** (0 to the largest relief on any course page), with section pace columns under it on the same x-axis; the climb section washed | scrub along the course: elevation, the section's climb, the section pace against typical |
| **Route** | course hero | hairline route, 5K ticks, start and finish marks, the signature section in signal | static |
| **Replay** | home hero, course page | night face; **y = finish rank**, so the field draws itself as a needle that tilts as the race unfolds; paper dots, orange only at sustained-slowdown pace after 20K; mono clock; two stats; the first-finish note | autoplays once when 35% is in view; play/pause; scrub; tap the canvas to pause; field ↔ route toggle |
| **Glyph** | pacing types | 40×18 profile sparkline on one shared scale | none |
| **Guess first** | the last-2K rescue | a question card, a 30 px thumb slider, "Lock it in" | the reveal springs in a ruler (guess, truth, typical), two cells and a verdict sentence; chips re-run it at other marks |

---

## 9. The nugget: "the reading"

```
┌ label ─────────── LAP 06 · THE FINISH LINE · STORY      mono 11 · ink-3
│
│ figure ────────── 1.73×                                 Inter 280 · 84–136 px · ink
│ unit line ─────── the smooth curve, in the 2:59 minute  Inter 15 · ink-2
│
│ sentence ──────── Between 2:59:00 and 2:59:59, 15,856   Fraunces 22–28 · ink
│                   finishes landed: *1.73 times* what     italic accent = the comparison
│                   a smooth curve expects.
│
│ instrument ────── ruler | dial | ledger | year strip     the sentence's number, drawn
│
└ foot ──────────── term link · "drag your first 5K" · depth
```

**Variants**

- **Figure reading** (the story hero, the course hero).
- **Ledger reading**: a stopwatch split list, used when the finding is arithmetic of its parts: Banked by 5K −2:42 / Given back after 20K +7:42 / **At the finish +5:00** in signal (the analysis hero).
- **Dial reading** (shares of finishes).
- **Guess-first reading** (one per chapter at most).
- **Next-lap reading**: the night card at the end of a page.
- **Lap-list reading**: a value and a short key in the Contents.

**The contract.** `lib/nuggets.ts` runs on the server from the verified files. Each nugget returns `{ values, guard, headline, fallback }`, and a page renders the headline only when the guard holds. The prototype's `js/nuggets.js` implements 18 of them, and `js/course.js` holds the course-page guards. The guards are:

- the tallest-tower ratio must exceed 1.1;
- quarter-hours "mostly don't" needs a majority below 1.05;
- the cushion is widest before the slower mark;
- the rescue share must beat the comparison;
- the bank needs `open < 0 && finish > 0`;
- the best opening is "slower" only if `lo > 0`;
- fast starts begin "sooner" only if the 20K share is higher;
- the 30K checkpoint must be under 50%;
- women vs men needs men higher;
- the course spread must be over 1.5×;
- the weather pairs must be a majority;
- recurrence must be above expected;
- the course pages' "biggest climb = slowest 5K" needs `argmax(section gain) === slowest_section`;
- "more Metronomes" needs at least 2 points;
- the hot/cool sentence needs a 5 °C gap or more.

Plain-language fractions come from `approxWords()` ("about 3 in 10", "just over 7 in 10") and `inWords()` (picks the closest small denominator: 3.9% → "1 in 25", not "1 in 20").

---

## 10. Page templates

### Start (home): `/`

```
[lap track]
HEADER  ● Pace Notes                         [mi|km] [≡]
hero ─────────────────────────────────────── data-track-section="hero"
  PACE NOTES · 29 CITY MARATHONS · 2005–2026
  The same 26.2 miles, run *3.4 million* ways.        H1#hero-title
  Pick a course and a goal. See how finishes …         .home-hero-dek
  paths ──────────────────────────────────── data-track-section="paths"
   form.home-door.home-plan (GET)
   ┌ COURSE  All courses ▾ │ GOAL 4:00  Tap . for : ┐  #home-plan-course / #home-plan-goal
   [        Plan your race (the only orange control) ] .home-plan-button
   Analyze a past race  →                              .home-door-link
   Read it lap by lap   →                              .home-door-link
  replay (night face, full bleed; right column on desktop)
stakes ── dial 30% + "About 3 in 10 finishes had a sustained slowdown." + onset bar
guide ─── #guide  "Eleven laps, start to finish."  lap list with readings
steps ─── Plan in three steps (1 — 2 — 3 on a hairline)
stories ─ long reads deck: a.story-card ×3, each with its signature chart drawn from data
cta ───── "Your next marathon starts with a plan."  pixel runner on a hairline
FOOTER  checkered rule · brand · 6 links · Motion switch
```

The section order matches the pinned `hero, paths, stakes, guide, steps, stories, cta`, with `paths` nested in `hero` as it is today, and no `chapter-*` on `/`. Measured phone fit: at 390×664 the title ends at 243 px, the Plan button at 456 px and the two doors at 523 and 573 px. At 402×714 they end at 247, 460 and 527/577 px. "Plan your race" is the only `rgb(255,91,46)` control on screen. At 195 px the header wraps to two rows with no sideways overflow. Phone length is **5.5 screens**, against 7.7 today.

### Chapter / story: `/stories/[slug]`

```
lap-hero ─ hero: crumbs (Lap · chapter · Story) · H1 title · question line · THE READING
beat ×4–6 ─ chapter-1…n: "01 · THE TOWERS" · H2 finding · dek · figure (+ lens) · Values
            one beat per chapter may be guess-first; one may hold visitor input (masked)
next-lap ── related: Also in this lap · Next lap card · ← previous · How we know ↗ · feedback
rail (≥1180): the 11 laps
```

The prototype is "The 3:59 effect" with five beats: towers (scrub and lens), scoreboard, cushion (segmented), the last 2K (guess first) and your minute (`.finish-lookup`, `#my-finish`). It runs **5.5 phone screens against 9.1**.

### Analysis: `/analyses/[slug]`

The story shell with three differences:

- **The H1 is the finding**, and the question becomes a one-line dek.
- **The hero reading is a ledger or a figure plus ruler.** It shows the full answer at the default, with no form first and no empty state.
- **Each beat has exactly one interaction**, and the **crown dock** carries the personalisation.

The whole `main` is `.analysis-layout` (masked). Pagination is `.analysis-pagination` styled as the next-lap card. The prototype is Starting pace: the ledger, the scrubbable U-curve, onset chips, six openings and by-course in depth. It runs **4.6 phone screens against 8.9**.

### Tool: `/tools/*` (specified, not built)

```
tool header ─ H1 tool name · one-line purpose · badges as glyph+word tags (● Pace Notes data)
.tool-workspace
  .tool-inputs ─ an instrument panel of cells (like the home plan panel): Goal | Course | …
  .tool-results ─ the reading: the figure (e.g. "9:09/mi") + a ledger of mats as a lap list
                  aria-live summary first; result / comparison / pace-band divs kept
  depth ─ tables in Values disclosures; handoff rows ("Turn this into a pace band")
crown dock ─ the goal stepper (− 4:00 9:09/mi +), the pace-band goal bar, now universal
```

All pinned ids, labels and button texts from S1, S2 and verify-tools are kept: `getByLabel('Time')`, "Goal finish time", `#plan-course`, "Print wristband strips" and the rest. Tool hue bars are removed. There are no "How this works" boxes.

### Course page: `/courses/[city]`

```
hero ────── crumbs · H1 race · meta (editions · years · month) · THE READING (slowdown share)
            year strip (scrub: share, median, start temperature) · route face · Plan · Watch
            nav.course-toc
chapter-1 ─ #at-a-glance  "Boston’s most distinctive 5K is 35–40K."  glance cells (.course-glance)
chapter-2 ─ #finish-times  median by year (scrub; gaps say NO RACE DATA) · Values
chapter-3 ─ #elevation  shared-scale profile over section pace (scrub along the course)
chapter-4 ─ #pacing  six type glyphs · Boston vs all dumbbells
chapter-5 ─ #slowdown  strip of every course, Boston in signal
chapter-6 ─ #goals  3:00 … 5:00 segmented · dial · four cells · "Every goal" table (#goals tbody th a)
chapter-7 ─ #weather  scatter of editions · hot/cool sentence
cta ─────── #plan  Plan your Boston
(untracked) #replay  the field ↔ on the route
related ─── #other-courses  "Shaped like Boston": nearest pacing fingerprints, not alphabetical neighbours
```

This keeps the pinned `SECTIONS` order and tracking ids from `verify-courses --html`. It avoids every banned rank word: the related section says "Shaped like", never "Similar". It runs **8.0 phone screens against 18.5**. In the build, every printed figure stays a `<data value data-k>`.

### Race report: `/report` (specified)

"The lap screen" is a stopwatch lap list of the race's nine splits, with the pace per section. The first sustained-slowdown section is marked in signal and the finish line is a checkered rule. The reading on top is the finish time plus a sentence in the report's own voice: "This race: ahead of 61 in every 100 other finishes in Berlin 2024". It never says *you*, *your*, *percentile*, *rank* or *record*. Then come a type glyph with its share, and the opening band with the bank-and-pay ledger from lap 02. The PNG export (1080×1350) is the same layout on night. `.race-report` keeps `ph-no-capture`, and `.race-report-title` stays an H3.

### Methodology: `/methodology` (specified)

The reference manual is the one long page. It has numbered parts (§1 Data, §2 Definitions, §3 Calculations, §4 Limits) on the existing `#data #definitions #calculations #limits` anchors, and all 30+ topic anchors are preserved. Phones get a "Jump to" sheet that reuses the Contents sheet; the rail has the same entries. Each definition is a spec card: the term, the rule in one line, and a small instrument. For example, *sustained slowdown* is a ruler with the 25% and 5 km threshold and a slider that shows how the share moves (the sensitivity nugget). The units switch works here.

---

## 11. Staying inside the constraints (`inventory.md` §3)

| Constraint | How Instrument meets it |
| --- | --- |
| **Initial-JS budgets (S8, +1,536 B)** | Charts are **server-rendered SVG**. The client only moves a needle (`transform`) and rewrites readout text, so per-chart JS is tiny. Shared islands, estimated in gzip from the prototype: Scrub plus needle about 1.6 KB, Seg about 0.5 KB, Reveal about 0.3 KB, the Contents sheet about 1.1 KB. **The dial, the ruler and every reveal are CSS-only (0 B).** The root layout replaces the current Menu dropdown with the sheet, so the net change is about +0.6 KB against 2.9 KB of headroom. Analyses drop Recharts (−99 KB on 14 pages) and each story body is split with `next/dynamic` (pages stop paying for the other six). Re-measure with `--write-budget` and record the reason. |
| **CLS ≤ 0.1** | Plot boxes are reserved in CSS (`--r` aspect, `--max` cap through container units, `aspect-ratio` fallback). Readouts have a fixed minimum height and tabular figures. The header hides with transforms. The sheet and dock are fixed-position. The replay frame is fixed-size. The new font axes get regenerated metric-matched fallbacks, and dropping Bricolage removes one swap. |
| **Analytics section ids** | Home keeps the exact order `hero, paths, stakes, guide, steps, stories, cta`, with no `chapter-*`. Course pages keep `hero, chapter-1…7, cta, related` (the replay stays untracked). Stories and analyses use `hero`, `chapter-1…n` (eight at most) and `related`, all of them literals already in `TRACKED_SECTIONS`. **No new ids and no new events**: lap navigation shows up as page paths. |
| **Replay masking** | `.home-plan` on the home form, `.analysis-layout` on the analysis `main`, `.finish-lookup` on the story's visitor-input beat. Every chart sits in `figure.viz`, so `.viz svg` keeps it out of snapshots, and the replay keeps `.replay`. **Build note:** the crown dock must render *inside* `.analysis-layout` (it stays `position: fixed`), because its `<select>` is a form field. |
| **Selectors and copy pinned by e2e** | Kept: `#home-plan-course`, `#home-plan-goal`, `.home-plan-button`, `.home-door-link`, `.nav-toggle`, `#site-menu a`, `.nav-primary`, `.unit-switch` (role group, label "Distance and pace units"), `#my-finish`, `nav.course-toc`, `#goals tbody th a` ("Plan a 4:00 Boston Marathon"), `.page-feedback` (Yes / No). **Changes S1 must mirror:** the menu becomes a sheet, its fifth link "Research" becomes **"All laps"** (same `/research` href), and `.nav-more` keeps About, Request an analysis and Open data ↗. |
| **Accessibility** | Skip link. One H1. Focus rings in signal. Hit targets of 44 px or more (switch 34 px drawn with a 44 px hit area). Scrub plots are `role="slider"` with `aria-valuetext`, the readouts are literal `aria-live="polite"`, and every chart has a finding `aria-label` and a Values table. Segmented controls use `aria-pressed`. The sheet is `role="dialog"`, closes on Escape and returns focus. Colour is never the only cue: hollow vs filled, shape glyphs, labels and position carry meaning. The layout is checked at 195 px (§10). Reduced motion and the Motion switch are both respected. |
| **SEO** | One H1 per page, and pages keep their titles and descriptions. No banned words ("the wall", "arithmetic", "your chance", "fastest" in titles), and course pages avoid rank words. The Contents stays at `/research`, so the orphans check still passes. Bump `CONTENT_DATES` for every rewritten page. OG cards are re-rendered in the new palette. |
| **Units** | Miles by default, with a working switch on every lap page; `/methodology` gets one too. Everything goes through `U.*`, the prototype of `useUnits`. Mats keep their race names. Temperatures are °F in miles mode and elevation is in ft. `?units=km` wins, and `UnitLink` never writes `units=mi`. |
| **Evidence badges** | Monochrome glyph plus word, drawn only by `EvidenceTag`. Never combined, never on plain calculations. |
| **Static export** | Every nugget is computed at build time from verified files. In the browser, `dataFetch` loads only the replay sample files, the shards the tools already load and the analysis explorers' existing tables. No third-party host: fonts are self-hosted and arrows are SVG. |
| **Old Safari (S5)** | No regex lookbehind and no `.at`, `findLast` or `structuredClone`. `linear()` easing falls back to cubic-bezier, container units fall back to `aspect-ratio`, `color-mix` falls back to solid paper, and `:has()` is avoided in favour of a JS class. |
| **Copy rules** | Insights only. The H2s are findings. Two lines sit near the method boundary: "Measured against finishes from the same race that ran the same pace from 5K to 20K", which defines what the finding compares, and the chart descriptions ("Ten-second bins around each mark"). Both are listed for the owner below. |

**Also changes with the redesign:** `docs/DESIGN_SYSTEM.md` (rewritten from §§4–9 here), `docs/WEBSITE_ARCHITECTURE.md` (laps registry), `docs/ANALYTICS.md` (menu as a sheet), `docs/SEO.md` (course sections unchanged), `scripts/font-fallbacks.cjs`, the `build-og-images.cjs` TOKENS, and `RaceReplay`'s hard-coded canvas colours (paper and signal only).

**Owner decisions this direction needs**
1. Rename the menu's "Research" to "All laps", and change the menu from a dropdown to a sheet. This touches the S1 nav assertions.
2. Retire the pacing-type hues in favour of shape glyphs, and the blue/red ramp in favour of position and sign.
3. Approve the reading order change: Your race moves to 08, and Where and Weather come just before The next one.
4. Approve the comparison-defining dek on analyses ("Measured against …") as insight copy rather than method copy.
5. Add a dark theme (it changes `theme_color` handling and needs an OG check only for light).

---

## 12. The prototype: what is real, what was fixed

**Screens:** Start (home), a full chapter (The 3:59 effect), an analysis (Starting pace) and a course page (Boston). Lap links that have no prototype page lead back to the lap list.

**Working interactions:**

| Where | Interaction |
| --- | --- |
| Header | units switch (miles ↔ km, re-renders every unit-bearing label and chart); Contents sheet |
| Lap track | fills with scroll progress |
| Home | the replay (autoplay, play/pause, scrub, tap to pause); the 30% dial lighting on reveal; long-read deck dots |
| Story | the towers scrub with detents and the count ↔ against-the-curve lens morph; the cushion segmented morph; guess-first lock and reveal, re-run at other marks; the finish-time lookup moving its needle |
| Analysis | the U-curve scrub (touch, mouse hover, keys); the onset chips; the by-course depth; the course crown dock |
| Course | year-strip scrub; median-by-year scrub; elevation scrub with section readout; goal segmented with dial re-light; field ↔ route replay |
| Every page | Values disclosures with a spring height; feedback toggle; Motion switch |

**Iteration log** (found by looking at screenshots and then fixed):

1. The closed sheet rendered below the fold in full-page captures and could be focused. It now uses `visibility` with a delayed transition.
2. The replay read as noise with random lanes. Rank lanes now make the field a tilting needle, and only slowdown pace is orange.
3. The towers readout said 1.71× while the hero said 1.73×. Round-mark minutes now use the mark's own fitted ratio everywhere.
4. Gridline "10K" meant 10,000 finishes, so counts are now written out.
5. The needle crossed the "3:00" tick label. A split needle now puts the crown below the labels, and on the towers it points at the tower instead of covering it.
6. "1 in 20" was shown for 3.9%. The fraction picker now chooses the closest denominator.
7. "Nearly 1 in 3" was shown for 30.4%. It now says "about 3 in 10".
8. The onset bar's minimum widths distorted shares. Proportions are now exact, with labels moved below narrow segments.
9. Elevation, strip and weather labels collided. Gridlines now sit in display units, extremes are labelled under the axis, and year labels flip side.
10. Charts were too tall on desktop. Heights are now owned by CSS, with container-unit caps.
11. The contents doors wrapped. "Analyze a past race" now gets a full row and the rest sit in three columns.
12. The header clipped at 200% zoom. Its controls now take a second row.
13. "Any of 28 courses" sat on the page next to "29 city marathons". Counts were removed from the steps copy, so there is one denominator per surface.
14. The `?view=route` toggle state was out of sync, and is now fixed.
15. The Contents sheet on lap pages showed dashes where the readings belong. The readings now load at idle on every page (and on first open), and the hard-coded "29 course pages" subtitle is gone.

**Not built:** tools, report, methodology and the other laps (specified in §10), real routing, and analytics.

**Weight:** the prototype ships 43 KB gzip of hand-written JS across all four screens. That is not the production figure: in the build, charts are server SVG and only the islands in §11 run on the client.

---

## 13. Screenshot index (`shots/`)

| File | What |
| --- | --- |
| `home-phone-first.png`, `home-phone-full.png`, `home-desktop-full.png` | Start |
| `story-round-numbers-phone-first.png`, `-phone-full.png`, `-desktop-full.png` | The 3:59 effect |
| `analysis-starting-pace-phone-first.png`, `-phone-full.png`, `-desktop-full.png` | Starting pace |
| `course-boston-phone-first.png`, `-phone-full.png`, `-desktop-full.png` | Boston |
| `interaction-phone-contents.png`, `interaction-phone-contents-lap06.png` | Contents sheet from Start and from lap 06 |
| `interaction-phone-scrub.png` | U-curve mid-drag (needle at 3–4% slower, crown lifted) |
| `interaction-phone-lens.png` | Towers switched to "Against the curve" |
| `interaction-phone-guess.png` | Guess locked and revealed |
| `interaction-phone-onset.png` | Onset chip changed to 5–10% fast |
| `interaction-phone-km-elevation.png` | km mode, elevation scrub readout |
| `interaction-phone-replay-playing.png` | Home replay playing |
| `interaction-desktop-route.png`, `interaction-desktop-hover-elevation.png` | Route replay; desktop hover scrubbing |
| `dark-home-phone.png`, `dark-story-round-numbers-phone.png` | Dark theme |
| `zoom200-home-phone-first.png` | 195 px (200% zoom) |
