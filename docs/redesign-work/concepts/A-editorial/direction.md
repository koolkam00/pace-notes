# Direction A · "Mile by Mile"

Editorial scrollytelling for Pace Notes. The whole site reads as one marathon, gun to finish line. Every screen holds one idea, a big confident sentence and one chart annotated on its marks. Every page opens with what the data found. Each chapter starts with a guess before the answer, and the race replay is the first thing you see.

- Working prototype: `proto/` (hand-written HTML, CSS and vanilla JS, no build step). It loads real numbers from the release files in `proto/data/`. Serve the folder with `python3 -m http.server` and open `index.html`.
- Screenshots: `shots/` (full page and first screen on a phone, full page on desktop), `shots/strips/` (screen-by-screen phone filmstrips) and `shots/interaction/` (shots taken mid-interaction).
- Data is the checked-in release (`private-export-20260912-0934`). No number is typed into any page. Every figure, and every direction a sentence claims, comes from a field through `proto/js/nuggets.js`, the prototype of the proposed `lib/nuggets.ts`. That way the pages stay correct when release `htw-db-2026-10-16-1652` lands.

---

## 1. Principles

1. **One idea per screen.** A beat is one claim, one chart and one annotation. On a phone it fills about one screen. If a chart needs a paragraph to explain it, the chart is wrong.
2. **The answer first, in a sentence.** H1s, chart titles and card titles state findings ("A first 5K over 10% fast banked 2:42. It finished *5:00 behind.*"), never topics or counts. Null results look null: grey figure, "no clear difference".
3. **Guess before you see.** Every chapter has one moment where the reader commits to an answer before the reveal: drag a slider, tap a chip, lock it in. The reveal shows both their guess and the truth on the same marks. It is the cheapest way to make a number stick.
4. **Annotate the marks, not the margins.** Labels sit on the bar, the dot or the line end. There are no captions under charts, no "how to read this" and no legend when a direct label fits. The readout above each chart is the one place a value lives in words.
5. **Orange means you.** The reader's guess, goal, opening, minute and position are orange. Blue is faster than their own early pace, the orange-red step is slower, ink is the story's subject and warm grey is everything else. No other hue carries meaning, except the six pacing-type colours, which mark pacing types only.
6. **Paper for reading, night for the race.** Dark surfaces mean one of two things: the race (the replay, chapter openers) or the answer (an analysis's answer card, the next-stretch card). They are never used for forms, captions or promos.
7. **Motion explains a change of state.** Something moves only when the data changes: columns rise, a curve draws, a window zooms, dots light up. Motion uses CSS transitions on transform, opacity and dash offset, triggered by reading position, never scroll-jacked. With reduced motion, every state change is instant and the replay opens paused on its key frame.
8. **Methods live on /methodology only.** A page carries one quiet "How we know →" link to the right anchor, and the term *sustained slowdown* links to `/methodology#sustained-slowdown`. A page never shows a cohort, source, caveat or citation.
9. **Every page ends by pointing forward.** The last thing on every page is a night "Next" card. It carries the next chapter's lead nugget as a teaser number, so the reader is pulled through the whole site.

---

## 2. The reading flow: one marathon, start to finish

I kept the twelve-stop order from `nuggets.md` (a prologue plus 11 chapters) and grouped it into **three parts**, so a phone reader can hold the whole route in their head:

- **Part one, the race, follows the race clock.** Its chapter markers are race distances (START, 5K, 10K, HALF, 30K, FINISH).
- **Part two, the runner and the road**, covers who runs, where and in what weather.
- **Part three, your race**, ends at the planner, so planning becomes the finish line of the reading journey and not only a door on the home page.

| # | Marker | Chapter | Pages (existing URLs kept) | Lead nugget (field) | Signature interaction |
|---|---|---|---|---|---|
| 0 | — | **Start line** (home) | `/` | Replay hero; guess: faster second 20K is 1 in 25 (`ext_pacing_shapes` "Faster second 20 km") | Live replay; guess-first dots |
| 01 | START | **The field** | `/finish-times` (absorbs `/analyses/finish-time-context` as its "set your time" control), `/stories/race-replay` | Median finish 4:10 (histogram nearest-rank); 47% of London had not reached 20K when the first finisher crossed (`replay.editions[].moments`, edition chosen by argmax) | Replay frozen at the first finish; "where do you sit" scrubber |
| 02 | 5K | **The first 5K** | `/analyses/starting-pace` (leads with `kick.bank`, absorbs `final-kick#bank`), `/analyses/downhill-start` as its second page | 5:00 behind same-pace finishes (`bank.bands[>10%].finish_s`) | Guess the sweet spot, then scrub the U-curve (**built**) |
| 03 | 10K | **The shape of a race** | `/stories/pacing-types`, `/analyses/pacing-pattern` as its explorer | Only 1 in 25 ran the second 20K faster | "Which runner were you?" moved up front; the profile morphs as you tap a goal chip |
| 04 | HALF | **Halfway to 30K** | `/analyses/checkpoint`, `/stories/places`; `/tools/projector` linked | Trailing by a minute at 30K, 42% still crossed first (`positions.coin_flip['30']`) | Guess first, "on even 4:00 pace at 30K…", then the gap gauge scrubber |
| 05 | 30K | **After 30K** | `/slowdown` (becomes this chapter's explainer), `/stories/final-kick` (warning light, no second wind, twins), `/analyses/where-time-is-gained` | 72% of sustained slowdowns began at 30K or later (`study.timing`) | The definition as a threshold slider; a waterfall of the sub-4 gap |
| 06 | FINISH | **The finish line** | `/stories/round-numbers` (**built**), with the final-kick "magnet" as its first beat | 3:58 is the busiest finishing minute (`argmax(histogram.all)`) | Guess the minute; sticky "towers" scrolly; the 40K rescue guess (**built**) |
| 07 | 07 | **Who holds pace** | `/stories/who-holds-pace`, `/analyses/age-and-pacing` | 2.2× as many sustained slowdowns among men's finishes at the same finish times (`demographics.overall`) | A pooled ↔ matched slider (one component, used twice) |
| 08 | 08 | **Where you run** | `/stories/courses` (fingerprint, name-that-course), `/analyses/course-comparison`, `/analyses/hills-and-pacing`, the `/courses` atlas and the `/courses/[city]` pages (**Boston built**) | 55% of editions named from their pacing shape alone (`courses.identification`) | Name that course (the one game) |
| 09 | 09 | **The weather** | Split out of `/stories/courses` (13.6 screens today) as its own page; `/analyses/race-day-weather` with tabs that the `/warming-and-pacing` and `/wind-and-pacing` URLs open; `/tools/weather-match` | 197 of 225 same-course pairs: the warmer year had more sustained slowdowns (`weather.pairs`) | A waffle of 225 pairs that flips as you scroll; the thermometer slider |
| 10 | 10 | **Your race** | `/runners` → `/report` ("Race Wrapped" swipe deck), `/tools/split-check` | Personal, from the runner's own record | Swipe deck of shareable cards (the existing 1080×1350 export) |
| 11 | 11 | **The next one** | `/analyses/finding-improvement`, recurrence (`kick.recurrence`), then `/tools/plan` → pace band, course chooser, predictor | After a sustained slowdown, the next race had one 51% of the time against 34% typical | Two doors with 100 dots behind each; ends in the planner |
| — | — | Reference, outside the route | `/methodology`, `/about`, `/privacy`, `/tools/pace-calculator`, qualifying, pace charts | — | — |

**What is merged or cut**

- `/research` becomes **Contents**: the course line of all 11 chapters with their lead numbers. The URL stays, so S1 (`main a[href^="/analyses/"]`) and the `orphans` check keep passing. `/stories` and `/analyses` redirect to its anchors.
- `/research/personalized` and the roughly 77 `/packs` alias pages get 308 redirects to their chapter anchors in `vercel.json`. `/packs` becomes the "Research archive", linked from `/methodology` only. The strongest pack nuggets are promoted into chapters (see `nuggets.md` §2), with one number per question.
- These pairs collapse into one: `/finish-times` and finish-time context; warming, wind and race-day weather; projector validation and `ext_checkpoint_forecast_validation`; and every duplicated per-course slowdown source (courses.json on course pages, all-finisher rates in the analysis, never both on one screen).
- `/stories/final-kick` keeps its URL as the "After 30K" story. Its magnet beat opens Chapter 06.

**Length targets on a phone:** chapter pages 8–11 screens (the built 3:59 chapter is 12.3, including a 5-step sticky scrolly that is about 5 of those screens); analyses 4–6 (built: 5.8); course pages 7–9 (built: 8.6, down from 14.9–19.5 live); home about 6 (built: 5.8).

---

## 3. Moving through it on a phone

1. **Header (56 px):** brand, MI/KM switch, Menu. It hides on scroll down and returns on scroll up. Over a night opener it turns night itself, so a pale strip never floats over the race.
2. **Reading bar (34 px).** It takes the header's place while reading: a coloured chapter marker ("06 · The finish line"), the page title, minutes left and a route-line progress bar. The progress bar has a tick for every beat and an orange runner dot at the reader's position (`shots/strips/story-phone-03.png`).
3. **Menu = the course.** The sheet keeps the five pinned links in their pinned order (`#site-menu`, "Plan your race" as the only orange control, `.nav-more` below), then draws all 11 chapters on a dashed course line. Each has its distance marker, title and lead number, and the reader's chapter is lit orange (`shots/interaction/home-phone-menu-open.png`, `…-menu-route.png`). Going "to the next analysis" means one tap on a number.
4. **Next card.** It ends every page as a full-width night card with the next chapter's figure. It is the primary forward gesture. There is no horizontal swipe between pages, because horizontal swipes belong to charts and decks.
5. **"Your race" chip (analyses).** A pill pinned in the thumb zone appears only while the explorer is on screen. It reads "Boston · 5–10% fast" and opens a bottom sheet with the course and opening choices. Defaults always show a full answer (`shots/interaction/analysis-phone-explorer-chip.png`, `…-sheet-open.png`, `…-explorer-boston.png`). This is the pace-band floating stepper pattern, generalised.
6. **Course pages** keep a sticky chip contents row (`nav.course-toc`) with 44 px chips.
7. **Desktop:** the header shows the five links inline. Scrollytelling runs side by side: the stepping text sits in a 26 rem column on the left and the sticky graphic on the right (`shots/interaction/story-desktop-towers-step-4.png`).

---

## 4. Design tokens

All colours are CSS custom properties on `:root` (`proto/css/base.css`). The night band (`.night`) and the night edition (`prefers-color-scheme: dark`) only swap tokens, so no component knows its theme.

### Type

Four families are kept. Fraunces is put on a diet: it is instanced at SOFT 50 and WONK 1 with wght 380–720, and the opsz axis is kept, so optical sizing still works (`font-optical-sizing: auto`). Measured: Fraunces drops from 271 KB to 138 KB, and the full first-visit Latin set from about 400 KB to 268 KB. `scripts/font-fallbacks.cjs` must regenerate the metric fallbacks.

| Token | Family / weight | Phone (390) | Desktop (1440) | Use |
|---|---|---|---|---|
| `--fs-display-xl` | Fraunces 640, −0.03em, lh .95 | 39 px | 106 px | Chapter titles, home title (home: 37 → 75 px) |
| `--fs-display-l` | Fraunces 640, lh .99 | 33 px | 70 px | One-idea beat headlines, guess questions |
| `--fs-display-m` | Fraunces 640, lh 1.04 | 25 px | 44 px | Section headlines, next-card titles |
| `--fs-display-s` | Fraunces 600, lh 1.12 | 21 px | 30 px | Guess prompts, sheet titles |
| `em` in any display | Fraunces italic 560, `--accent-ink` | — | — | The accent word is the number or the comparison |
| `--fs-figure-xl / l / m` | Bricolage Grotesque 800, −0.045em, proportional | 117 / 62 / 39 px | 208 / 104 / 58 px | The figure: one per idea. A sans hero figure, never the serif |
| `--fs-dek` | Inter 400, lh 1.5 | 18 px | 22 px | Deks under titles |
| `--fs-body` | Inter 400, lh 1.6–1.65 | 17 px | 17 px | Body, step cards |
| Readout text | Inter 400/650 | 15 px | 15 px | The sentence beside a live figure |
| Direct label | Inter 600 | 14 px | 14 px | On-mark labels (`.lab`) |
| Kicker / tick | JetBrains Mono 600 / 500, +0.12em caps / 12 px | 12 px | 12 px | Kickers, axes. Ticks are never below 12 px; row labels never in mono caps |

### Colour

| Role | Light (paper) | Night band | Night edition (OS dark) |
|---|---|---|---|
| Page / card | `--paper #F5F0E6` / `--card #FFFDF8` | `--night #0E1116` / `--night-2 #171B22` | `#111419` / `#181C23`; night bands step down to `#07090C` |
| Ink 1 / 2 / 3 | `#15171C` / `#3C3F47` / `#66625A` (5.3:1) | `#F5F0E6` / `#B9B3A6` / `#8E897E` | `#F2EDE3` / `#CFC9BD` / `#A39D91` |
| Rules / grid | `--line #DCD3C2` / `--grid #E2D9C8` | `#252B36` / `#20252E` | `#2A3039` / `#252B34` |
| Accent text | `--orange-ink #B4380D` (5.3:1 on paper, 5.9:1 on card) | `--orange #FF5B2E` (6.1:1) | `#FF8A63` (8.0:1) |
| Controls | `--orange #FF5B2E` with `--on-orange #15171C` text (the S1 pin `rgb(255, 91, 46)` holds) | same | same |
| **Mark: you / slower** | `--mark-you #E84A1C` | `#F0592C` | `#F0592C` |
| **Mark: faster** | `--mark-faster #2F5BFF` | `#5C80FF` | `#5C80FF` |
| Mark: subject | `--fg` (ink) | night ink | ink |
| Mark: context | `--mark-context #B5AC99` (de-emphasis; always with labels or a numbers table) | `#4A5160` | `#535A68` |
| Track / unlit dot | `--mark-soft #E7DFD0` | `#232833` | `#232833` |
| Pacing types (types only) | `#17A673 #2F5BFF #F4B23E #7A4DFF #E2416B #FF5B2E` | — | — |

The mark pairs were run through the dataviz validator (`validate_palette.js`). On paper, `#2F5BFF` / `#E84A1C` pass every check: contrast is at least 3:1, CVD ΔE is 32.7 and the normal-vision ΔE is 41.3. The brand `#FF5B2E` sits at 2.72:1 as a mark, which is why marks use the deeper step. On night, `#5C80FF` / `#F0592C` pass the lightness band, the CVD checks (ΔE 29.5) and contrast. Gold and brand orange fail the dark lightness band, so on night they are reserved for HUD text and controls, never for series. Text never wears a mark colour: "you" labels use `--accent-ink`, and large figures may use `--mark-you` (at least 3.4:1 at 36 px and up).

### Space, grid, shape

- **Space:** a 4-based scale, `--s1…--s10` = 4, 8, 12, 16, 24, 32, 48, 64, 96, 128 px. Bands are 64 px on phones and 96 px on desktop.
- **Gutters:** 16 px on phones (358 px of content at 390), 32 px from 720 px and 48 px from 1100 px.
- **Columns:** `.col` 34 rem (reading), `.col-wide` 52 rem (charts) and `.wrap` 1240 px (grids).
- **Breakpoints:** three replace today's 30+. 720 (tablet and type), 1000 (side-by-side scrolly and split heroes) and 1100 (inline desktop nav and four-up decks).
- **Shape:** radii 10 / 18 / 28 / pill. Cards get a 1 px rule and a soft shadow. No card sits inside a card, except a figure tile inside an answer.

### Motion

| Token | Value | Use |
|---|---|---|
| `--t-quick` | 160 ms | Taps, chips, button press (scale .98) |
| `--t-move` | 420 ms | State changes, the header hide, sheet slides |
| `--t-draw` | 900 ms – 1.1 s | A line drawing in (stroke-dashoffset) |
| `--ease` / `--ease-out` | `cubic-bezier(.2,.7,.2,1)` / `(.16,1,.3,1)` | Everything |

**Rules**

- Animate only `transform`, `opacity` and `stroke-dashoffset`. The one exception is the scrolly zoom, which tweens a domain for 800 ms with requestAnimationFrame.
- Steps change when a card crosses 80% of the screen height on phones (72% on desktop). Scroll position is never mapped continuously to animation.
- Columns rise once, left to right, the first time a chart is seen.
- Counters, dot fills and the replay start only when on screen and stop off screen.
- `prefers-reduced-motion` and the site pause (`data-motion-off`, stored under the existing `pace-notes-motion` key) set every transition to 1 ms. The replay then opens paused at the first finish, and decorative runner lanes stand still.

---

## 5. Chart grammar at 390 px

**Shared rules (every chart)**

- Plot width is the full 358 px column. There is no y-axis line: y labels sit on their gridline at the left, or at the right edge where the data runs low (the U-curve). Gridlines are 1 px solid hairlines, at most three of them. The baseline is `--line-2`.
- Ticks are JetBrains Mono at 12 px. Labels use runner-speak in both unit systems: `5K 10K 20K 30K 40K`, `Last 2.2K`, `3:00 4:00`. They never show two-decimal miles, and distances, paces, feet and °F switch with MI/KM (`shots/interaction/home-phone-km.png`).
- **The readout lives above the chart, never under the thumb.** A big figure plus one sentence answers the selected mark. Tapping a mark (scoreboard row, year column, course section, pace profile point) moves the selection, never a floating tooltip. Hit targets are the full column or row, 34–44 px or more.
- **Drag anywhere on the chart.** Scrubbers bind a real `<input type=range>` (keyboard, `aria-valuetext`) and also accept pointer drags across the whole SVG, with `touch-action: pan-y` so vertical scrolling still works.
- Marks: bars are capped at 24 px with a 4 px rounded data end and a 2 px surface gap; lines are 2–2.5 px; dots have r ≥ 4 with a 2 px surface ring. Every "you" mark is orange.
- Every chart is an `role=img` SVG with an `aria-label` stating the finding. A "The numbers" disclosure opens the table twin, with a sticky first column and tabular numbers.

| Chart | Built in | How it reads and behaves on a phone |
|---|---|---|
| **Histogram towers** (sticky scrolly) | Chapter 06 | 270 one-minute columns form a silhouette. Step 1: columns rise and the median is labelled. Step 2: the smooth curve draws in. Step 3: the towers before each hour and half-hour turn ink with time labels. Step 4: the busiest minute gets a leader label. Step 5: the window zooms to 2:45–3:15 and the bars widen, with the ratio annotated on the tower and the curve. `shots/interaction/story-phone-towers-step-0…4.png` |
| **Mini columns with your pick** | Chapter 06 guess | 20 columns; the answer in ink, your pick in orange, labels pushed apart. `shots/interaction/story-phone-guess-minute.png` |
| **Lollipop scoreboard** | Chapter 06 | Ranked, never alphabetical. A 1× reference line; hours and half-hours in ink, quarters in grey; tap a row to set the readout. |
| **Ten-second lens** | Chapter 06 | 36 bars before a round time with the curve; the busiest 10 s in ink; the mark line labelled `4:00:00`. Mark chips switch the round time. |
| **100 dots** | Home, Chapter 06, analysis, course | A 10 × 10 grid, read as "out of 100 finishes", never "your chance". The guess is drawn as orange rings, the answer as fills: typical in grey, the extra in ink or orange. |
| **U-curve scrubber** | Analysis | Hidden until the guess is locked, then it draws. Behind (orange wash) and ahead (blue wash) are split at the "same as peers" zero line. The best opening gets a blue dot; your position is an orange dot on the curve. |
| **Ledger** (banked / given back / net) | Analysis answer card | Diverging bars from a zero line, with values at the bar end, or inside the bar when it runs near the edge. |
| **Pace profile, two lines** | Analysis explorer, course pacing | Course distance on x (section midpoints). The `after 20K` zone is shaded; the selected line is orange with dots, the comparison grey; end labels sit above or below by data. |
| **Dumbbell** | Analysis (downhill) | One row per opening group, downhill dot in blue, other courses in grey. |
| **Year strip** | Course | Missing years shown as "–". Slowdown bars (selected in orange, the extremes labelled) above a median-finish line; tap a column. |
| **Elevation + pace blocks** | Course | **One shared 240 m height scale on every course page**, so Berlin looks flat and Boston does not look alpine. Nine diverging blocks under the profile show the field's pace per 5K; tap a section. |
| **Replay** | Home, course | Canvas with 1,500 sampled finishes. Each dot draws a **speed streak** (its last 4 race-minutes), so motion reads even in a still frame. A HUD shows the clock, finished share and before-20K share; a **moment flag** at the first finish ("1:59:30 First finish. 47% of the field had not reached 20K."). Tap to pause. It starts at 0:50–1:02 on the clock, never on an empty start line. `shots/interaction/home-phone-replay-4.png` |

---

## 6. The nugget

The nugget is the unit of insight. It is the same component on the home deck, the chapter takeaways, the course "at a glance" row, the menu route and the next card.

```
┌──────────────────────────────────────┐
│ CH 06  THE FINISH LINE        kicker │  mono 11 px; chapter in accent
│ 3:58  ON THE CLOCK            figure │  Bricolage 800, 58–80 px + small-caps unit
│ is the busiest finishing      claim  │  Fraunces 22 px; one italic accent word
│ minute, for women and men alike.     │
│ ▁▂▃▅▇█▆▄▃▂▁                micro-viz │  ≤ 64 px tall: dots, spark, bars, ledger
│ The 3:59 effect →               go   │  mono link to the chapter
└──────────────────────────────────────┘
```

- **The contract.** Built in the prototype as `nuggets.js` and proposed as `lib/nuggets.ts`. Each nugget names its fields, computes its values and states a **guard** (the direction or threshold the sentence asserts) with a **neutral fallback**. Examples:
  - "A first 5K over 10% fast… finished 5:00 behind" needs `open_s < 0 && finish_s > 0`.
  - "Quarter-hours mostly don't [pull]" needs a majority of quarter ratios below 1.05, or the title becomes "Hours and half-hours pull hardest".
  - "In the warmer year, more finishes had a sustained slowdown" needs the pair at least 5 °C apart and hot > cool.
  - "every opening group" needs all six bands.
  - "for women and men alike" needs the three argmax values to be equal.

  Ratios become words (`inWords`: 3 in 10, 1 in 25, 3 in 4), and examples are picked by data, never by city literals. The replay hero picks the edition with the largest not-yet-20K share at the first finish, and the course page's "same shape" picks the nearest fingerprints.
- **Variants.** Paper (default), night (`.on-night`, the answer or the warm year), and figure-only (in route rows and story cards).
- **One number per sentence, from one cohort.** A page never shows two different "all finishes" slowdown rates. The analysis shows the matched 54% vs 37% in its nuggets; the raw fast-start 49.6% is not shown at all.
- `verify-nuggets.cjs` recomputes each value from the files and fails when a guard and its headline disagree. The same module feeds the OG cards, so share images can never contradict the page.

---

## 7. Page templates

Each row lists the order and the analytics section ids.

| Template | Order on a phone | `data-track-section` |
|---|---|---|
| **Home** (built) | Night hero: replay band (26% of the screen height, 150–230 px), kicker, title, plan form (course + goal + "Plan your race"), two doors → guess first (100 dots) → four-nugget swipe deck → "Read it like a race" course line (Part one) → Part two and three cards → night CTA with the runner lane → footer | `hero` › `paths` (inside the hero), `stakes`, `guide`, `steps`, `stories`, `cta`: **the pinned order, unchanged**, with no `chapter-*` on `/`. At 390×664 the title, the Plan button and both doors end above the fold (`shots/home-small-fold.png`) |
| **Chapter / story** (built: 3:59) | Night opener (distance marker board, title with accent, dek, minutes · charts · count, runner lane carrying time chips) → guess → sticky scrolly (4–6 steps) → 2–3 one-idea beats, each with a readout chart → the personal lookup (masked) → three takeaway nuggets → feedback → "How we know" → Next card | `hero`, `chapter-1…n` per beat (the list allows up to `chapter-8`), `cta` |
| **Analysis** (built: starting pace) | Paper head with the finding H1 and a night **answer card** (figure, evidence tag, ledger, one sentence) → guess-then-scrub hero chart → two nuggets → explorer with chips and the "Your race" sheet → sibling teaser (downhill) → feedback, How we know, Next. Wrapped in `.analysis-layout`. No form ever comes before the answer | `hero`, `chapter-1…4`, `cta` |
| **Course** (built: Boston; template works for any `?city=`) | Night hero (name, route drawn once, 4 stats, one CTA) → sticky contents chips → **What makes {city} {city}**: 3 guarded nuggets (the start, the late miles, the fingerprint) → replay on the route → pacing fingerprint vs the typical course + pacing-type bar → elevation on the shared scale + pace blocks → year strip (slowdown and median, with a table) → warm year / cool year → goal times (chips + 100 dots, link "Plan a 4:00 Boston Marathon") → plan card → courses that pace the same way (nearest fingerprints; the word "similar" is banned on course pages, so the section is "Same shape") | `hero`, `chapter-1` glance, `chapter-4` pacing, `chapter-3` elevation, `chapter-2` years (holding `chapter-5` slowdown), `chapter-7` weather, `chapter-6` goals, `cta` plan, `related`; the replay has none. **This reorders `verify-courses` SECTIONS** (owner decision) |
| **Tool** (not built) | `.tool-workspace`: inputs first, because a tool is the exception where input precedes the answer, plus a sticky bottom stepper on phones (the pace-band goal bar, generalised) → night result card (`.tool-results`, `aria-live`) → **one** Pace Notes data nugget with its badge ("Pace Notes data" / "Published research" / "Official standard" as small coloured text tags linking to `/methodology#evidence`, never combined; plain calculations carry none) → handoff cards → feedback. Tables collapse behind "The numbers" | `result`, `comparison`, `pace-band` (planner) |
| **Race report** (not built) | "Race Wrapped": a horizontal snap deck of full-bleed cards (placement among the field, your late race vs the field's box, your pacing type morphing into its centroid, your opening on the bank ledger), each exportable as 1080×1350. It says "this race", never "you" | `report` |
| **Methodology** (not built) | The only page with methods. A sticky chip contents row (Data · Definitions · Calculations · Limits), each topic a deep anchor that a page's "How we know" targets, `<details>` per topic, and a working MI/KM switch. "Sustained slowdown" opens with an interactive threshold slider | — |
| **Contents** (`/research`) and **Course atlas** (`/courses`) | Contents is the menu's course line at full size, with each chapter's sub-pages listed. The atlas is one ranked dot strip of all courses (never A to Z) with tap-to-enter, then compact cards with a fingerprint sparkline | `stories`, `analyses` / `related` |

---

## 8. Staying inside the constraints (`inventory.md` §3)

| Constraint | How this direction keeps it |
|---|---|
| **Initial JS budgets (S8, +1.5 KB tolerance)** | Copy is server-rendered: every nugget sentence is built at build time by `lib/nuggets.ts`, so it costs no client JS. The interactive pieces are small islands: `ScrollySteps` (about 0.7 KB gzip, one IntersectionObserver or rAF pass), `GuessFirst` (about 1.2 KB) and one hand-SVG component per chart (1.5–4 KB). Motion is CSS. No library is added. Splitting `/stories/[slug]` bodies with `next/dynamic` stops each story paying for six others (27.7 KB today). Removing Recharts from `WeatherAnalysis` and `RunnerContext` frees about 99 KB on all 14 analysis pages and `/runners`. The reading bar extends `SiteHeader` (under 1 KB) and needs a deliberate `--write-budget` with a note. Measured prototype, all JS including client-side copy building: home 19.2 KB gzip, chapter 19.6, analysis 15.5, course 21.6; CSS 15.5 KB for all three sheets |
| **CLS ≤ 0.1** | Every chart reserves its box: fixed heights in CSS (the scrolly graphic is 54 svh with a vh fallback; charts are 120–250 px). The replay frame is sized before its rows load. Readouts have a min-height. The guess reveal expands only after a tap, inside the input-exclusion window. The header hides with a transform. The instanced Fraunces needs regenerated metric fallbacks. The home first screen was measured at 390×664 and 390×844 |
| **Analytics section ids** | The home order is exactly `hero, paths, stakes, guide, steps, stories, cta`. Stories and analyses use only `hero`, `chapter-1…8` and `cta`. Course ids are kept but their DOM order changes (`verify-courses` update). No new ids, so `lib/analytics-policy.ts` is untouched |
| **Replay masking** | Guess widgets with reader input carry `.which-card`; the finish lookup is `.finish-lookup` (`#my-finish`); analyses wrap in `.analysis-layout`; the home form stays `form.home-door.home-plan`; tools keep `.tool-workspace` / `.tool-results`; status regions are literal `aria-live`. Charts stay `.viz svg` and the replay `.replay`, so they stay out of snapshots. Charts that draw reader input (dots, your-minute bars) sit inside masked regions |
| **E2E selectors and copy** | Kept: `#hero-title`, `.home-plan-button`, `.home-door-link` ×2, `#home-plan-course` / `#home-plan-goal` with "Tap . for :" and dot-to-colon, `#site-menu a` (5 pinned links + `.nav-more` About / Request an analysis / Open data ↗), `.nav-toggle`, `nav.course-toc` and the unit switch `role=group aria-label="Distance and pace units"`. Also kept: `a.story-card` on `/`, and `#goals tbody th a` (the goal table is now the "numbers" twin under the goal dots, its row headers the "Plan a {goal} {race}" links). Two prototype shortcuts to undo in the build: the prototype renders the nav twice (desktop row and menu sheet), where production keeps today's single `SiteNav` so there is exactly one `.nav-primary`; and its Yes/No row stands in for the real `PageFeedback` (`.page-feedback`, four reasons, no text box) |
| **Accessibility** | 44 px minimum targets. The shoot script reports **zero** sub-44 px controls on all four pages at 390 px, apart from inline term links. Visible focus rings (blue, gold on night). Sheets and the menu are `role=dialog aria-modal`, `inert` and `visibility: hidden` when closed, with Escape and focus return. Every slider is a labelled range with `aria-valuetext`. Chips use `aria-pressed`. Charts carry `role=img` with the finding plus a numbers table, and identity is never colour alone (direct labels and legends). Text contrast is at least 4.5:1 (accent text 5.3–5.9:1). Reduced motion and the site pause are honoured |
| **Units** | Miles by default; the existing `marathon-study-units` key; `?units=km` wins. Every pace, distance, elevation and temperature goes through the unit formatters. Checkpoint names are unit-neutral runner-speak. Analysis thresholds stay metric in the data |
| **Copy rules** | Insights only. One "How we know →" per page. *Sustained slowdown* is linked to its definition. No "your chance" (shares are "in 100 finishes"), no "the wall", no "arithmetic", no causal verbs, no rank words on course pages, finishes rather than runners, and no release tags in visible copy |
| **Static export and no third parties** | Everything prerenders; data is read at build time or through `dataFetch`. Fonts are self-hosted and the paper grain is an inline SVG data URI, so there are no remote requests |
| **Old Safari (S5)** | No scroll-driven animations or view transitions are required. `svh` has a `vh` fallback. `color-mix()` sits behind `@supports` with a solid fallback. No `:has()`, lookbehind or post-15.4 built-ins |
| **Storage** | No new keys: the prototype only reads `marathon-study-units` and `pace-notes-motion`, which are already allowlisted |
| **Data fragility** | No literal city, label or index selectors. Every example is chosen by argmax or argmin with a guard, so the 34-city release cannot silently break a title |

**Verifiers and docs to update with the build:** `verify-courses --html` (section order and the merged year section); `verify-analytics` (no change to ids; masked tokens in their new components); the S1 first-screen check (the replay now sits above the title; it passes at 390×664); `build-og-images` (titles from the nugget module, palette unchanged); `font-fallbacks.cjs` (instanced Fraunces); `docs/DESIGN_SYSTEM.md`, `WEBSITE_ARCHITECTURE.md`, `ANALYTICS.md` and `SEO.md`; and `CONTENT_DATES` for every page whose text changes.

---

## 9. What the prototype proves, and what is open

**Built and working with real data**

- **Home:** live replay with streaks and the first-finish flag; guess-first dots; nugget deck; course-line contents; story cards; runner lane.
- **Chapter 06 "The 3:59 effect":** guess the minute; a 5-step sticky scrolly with zoom; tappable scoreboard; ten-second lens with chips; the 40K rescue guess with mark chips; your-minute lookup; takeaways; next card.
- **Analysis "Starting pace":** finding H1; answer card with ledger; guess-then-scrub U-curve with drag-anywhere; two nuggets; band explorer; a working "Your race" bottom sheet over 30 courses; downhill dumbbell; next card.
- **Course "Boston":** a template that renders any course via `?city=`; the three guarded "what makes it" nuggets; replay on the route; fingerprint; elevation on a shared scale with tappable pace blocks; year strip; warm and cool year; goal dots with chips; same-shape courses.
- **Everywhere:** MI/KM switch, reading bar, menu sheet, night edition, reduced motion.

**Decisions for the owner**

1. The replay above the home title. It passes S1 at 390×664, but it changes the first impression from a form to the race.
2. The course page order (replay second, years merged) and the new `verify-courses` order.
3. Three parts and the distance markers as chapter numbers.
4. Splitting the weather chapter out of `/stories/courses`.
5. Adding the night edition (OS dark mode). It is token-only; the OG card palette is unchanged.
6. Instancing Fraunces (−133 KB, new fallbacks).
7. Whether "Research" in the pinned menu should read "Contents" (it would need an S1 mirror).

**Not built (templates specified above):** tools, the race report deck, methodology, Contents, the course atlas, and Chapters 01–05 and 07–11.

---

## 10. Files

- **Prototype pages:** `proto/index.html`, `proto/story-round-numbers.html`, `proto/analysis-starting-pace.html`, `proto/course-boston.html` (also `?city=Berlin`, `?city=New%20York` …).
- **Code:** `proto/css/base.css` (tokens, type, components), `proto/css/viz.css` (chart grammar, scrolly, dots, guess, sheet, replay), `proto/css/pages.css` (templates). `proto/js/core.js` (units, formatters, header and reading bar, menu, scrolly engine), `proto/js/nuggets.js` (the nugget contract and chapters registry), `proto/js/replay.js`, `proto/js/runner.js`, and one script per page.
- **Data:** `proto/data/*.json` are copies of the release files. `proto/data/extract.py` rebuilds the two small extracts (`fast-start-cities.json`, `site-totals.json`) from the full files.
- **Screenshots:** `shots/<page>-phone-fold.png`, `shots/<page>-phone-full.png`, `shots/<page>-desktop-full.png` (plus `-desktop-fold`), `shots/home-small-fold.png` (390×664), `shots/*-dark-*.png` (night edition), `shots/strips/*` (phone filmstrips), `shots/interaction/*` (mid-interaction).
