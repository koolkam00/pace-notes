# Direction B · "Wrapped": the marathon in cards

**One nugget per card. Bold chapter colours. Your goal pinned to every page. A race you read from the start line to the finish.**

Written October 16, 2026, against `/home/user/wt/insights` (read-only) and the research in `../../inventory.md`, `../../critique.md` and `../../nuggets.md`. Every number in the prototype is computed in the browser from real `public/data` fields (current release `private-export-20260912-0934`). The new release will change every value, so the prototype code computes them with guards rather than typing them in. Numbers quoted in this document are today's values, given only as examples.

- **Prototype:** `proto/` (hand-written HTML, CSS and vanilla JS, no build step). Run it with `cd proto && python3 -m http.server <port>` and open `index.html`, `chapter-finish-line.html`, `analysis-starting-pace.html` and `course-boston.html`.
- **Screenshots:** `shots/` (the list is in section 12).
- **Data used:** `proto/data/`, produced by `scripts/extract.py` (it copies the small files whole and keeps a subset of fields from the big ones, under the same field names).
- **Palette checks:** `scripts/palette.mjs` and `scripts/contrast2.mjs`, which use the dataviz skill's validator.

---

## 1. Principles

1. **The nugget is the unit.** Each card makes one claim and carries one giant number, one precise micro chart and at most one supporting line. If a card needs two numbers to make its point, it becomes two cards or a "vs" card (`30% vs 4%`). The claim is written as a finding ("Bank 2:42 early. *Give back 7:42.*"), never as a question or a count.
2. **Answers first, controls second.** No page opens with a form. Every page opens with its answer at the default, a 4:00 goal on All courses, and the controls sit inside the card they change. The empty states the critique found on checkpoint and hills disappear by construction.
3. **Your goal is the thread.** You type a goal once, on the home page or in the dock, and every chapter answers for it: the minute before *your* line, *your* first-5K split, *your* odds on *your* course. Orange means *you*, everywhere and only.
4. **Colour carries the chapter; data carries the meaning.** Each of the 12 chapters owns one field colour, used as a full-bleed background, on its share cards and on its station in the rail. Inside a card, data marks use only three things: the field's ink, a muted ink and the orange "you or the finding" highlight. The faster/slower blue–rose pair and the six pacing-type hues appear only on Night or Paper detail cards, where they were validated.
5. **Read it like a race.** The site is one marathon. The progress rail runs from the start line to the finish, and every page ends with a "next stretch" card that previews the next page's lead number. A runner should feel pulled forward, never dropped at a footer.
6. **Precision is the delight.** Wrapped energy comes from scale (a 200 px numeral) and rhythm (colour changes card to card), never from imprecision. Charts are small but exact: real axes, direct labels, the model line drawn as a model, the null drawn as null.
7. **Insights only.** No method, coverage, cohort or source copy appears outside `/methodology`. A card links its term ("sustained slowdown" → `/methodology#sustained-slowdown`) and one quiet "How we know" link per page goes to the right anchor.
8. **Quiet chrome.** The header hides on scroll. The dock is 60 px. The footer is short. Pages end on a next card, not on a stack of promos.

---

## 2. The reading flow: 12 chapters, one race

I kept the 12-chapter idea from `nuggets.md` but reordered it into what a runner knows *before* the gun, the race itself, and what comes *after*. Each chapter now answers the question the previous one raises: who is around me, where am I running, what will the morning be like, then the gun, the shape, halfway, the late race and the finish, then who held on, how did *I* do, and what next.

| # | Chapter | Rail station | Field | Pages (existing URLs keep their address) | Lead nugget (today's value) |
|---|---|---|---|---|---|
| 00 | **The start line** | Prologue | Night `#0E1116` | `/` | 3.4M finishes, one race |
| 01 | **The field** | Corral | Indigo `#17234B` | `/finish-times` (merged with `/analyses/finish-time-context`) → `/stories/race-replay` | Median finish 4:10 |
| 02 | **The course** | Course map | Moss `#0F3624` | `/stories/courses` (fingerprint half) → `/analyses/course-comparison` → `/analyses/hills-and-pacing` → `/courses` → `/courses/[city]` | 55% of editions named by pacing shape alone |
| 03 | **Race morning** | Forecast | Mist `#D1E9F2` | `/stories/courses` weather half (split into `/stories/race-morning`) → `/analyses/race-day-weather` (warming and wind become tabs) → `/tools/weather-match` | 197 of 225 same-course pairs: the warmer race slowed more |
| 04 | **The first 5K** | Gun → 5K | Ember `#451911` | `/analyses/starting-pace` (with `final-kick#bank`) → `/analyses/downhill-start` | Bank 2:42, give back 7:42 |
| 05 | **The shape of a race** | 5K → Half | Sand `#EDE0C8` | `/stories/pacing-types` → `/analyses/pacing-pattern` | About 1 in 26 ran a faster second 20K |
| 06 | **Halfway to 30K** | Half → 30K | Deep teal `#003237` | `/stories/places` → `/analyses/checkpoint` → `/tools/projector` | A minute back at 30K still crossed first 42% of the time |
| 07 | **After 30K** | 30K → 40K | Plum `#391836` | `/slowdown` (becomes the chapter opener) → `final-kick` chapters 2–4 and 6 → `/analyses/where-time-is-gained` | 72% of sustained slowdowns begin at 30K or later |
| 08 | **The finish line** | 40K → Finish | Gold `#F2B33D` | `/stories/round-numbers` (+ `final-kick#magnet`) | The busiest minute is 3:58; 3 in 4 speed up at the end |
| 09 | **Who holds pace** | Finish area | Lilac `#E4DDF3` | `/stories/who-holds-pace` → `/analyses/age-and-pacing` | 20% vs 45%: women and men, same finish times |
| 10 | **Your race** | Results | Orange `#FF5B2E` | `/runners` → `/tools/split-check` → `/report` | Your race, wrapped |
| 11 | **The next one** | Next start line | Slate `#18232D` | `/analyses/finding-improvement` → recurrence, habits and spacing → `/tools/plan` → `/tools/pace-band` and `/tools/course-chooser` | After a sustained slowdown, 51% of next races had one |
| — | Reference | — | Paper | `/methodology`, `/about`, `/tools/pace-calculator`, `/tools/qualifying*`, pace charts, `/privacy` | — |

**What I merge, cut or move.**

- **Hubs.** `/research` becomes **The race map**, the 12 stations with their lead nuggets. It keeps its URL so the `verify-seo orphans` rule (every story and analysis linked from `/research`) still holds. `/stories` and `/analyses` 308 to anchors on it. `/tools` and `/courses` stay as utility indexes.
- **Duplicate tiers.** `/research/personalized` is cut and its 12 questions redirect to their chapters. `/packs` moves under `/methodology#archive`, and the alias pages keep their 308s, since the research IDs are compatibility identifiers. The strong pack nuggets from `nuggets.md` (checkpoint odds, goal slips, bad-patch recovery, habit persistence, spacing) become cards inside chapters 06, 07 and 11.
- **One page per question.** Finish time against the field (`/finish-times` + `finish-time-context`) becomes one page in chapter 01. The three weather analyses become one page with three tabs in chapter 03. Round numbers live only in chapter 08: the landmarks figure leaves `/slowdown`, and goal pages link to the story.
- **Long stories split.** `final-kick` is spread across 07 and 08 by anchor. `courses` splits into "fingerprint" (02) and "race morning" (03).
- **About** folds into the footer credit and `/methodology#about`.

**Inside a chapter** each page is a stack of cards. The chapter opener (the story) comes first and the analyses and tools follow as further pages. The dock shows `08 · The finish line` and the rail moves within the stretch as you scroll.

---

## 3. Navigation on a phone

Built and shown in `shots/home-phone-ix-race-map.png` and `shots/analysis-phone-ix-goal-sheet.png`.

- **The dock** (bottom, in the thumb zone, 60 px, Night glass). It always shows where you are and who you are.
  - *Left:* the **progress rail**, a 2 px line with 12 station ticks. The four start-line stations are dotted (the warm-up), the race stretch is solid with a checkered finish, and the three after-finish stations are dotted again (the cool-down). The pixel runner from the site's art (the same `lib/art/gait.ts` keyframes, ported) stands on it. It strides only while you scroll and stands still otherwise, or always under reduced motion. Its position is the chapter's station plus how far you have read into the page. The gold line behind it is the distance you have covered. Below the rail sit the chapter number and name. Tapping anywhere here opens the race map.
  - *Right:* **your goal bib**, an orange tab with two pin holes showing `YOUR GOAL 4:00`. Tapping it opens the goal sheet.
- **The race map sheet** (from the dock or the header ☰).
  - Its top row is the S1-pinned `nav#site-menu`: *Plan your race* (the only `.nav-primary`, orange), Analyze a past race, Courses, Tools, Research.
  - Then come the 12 stations in three zones (At the start line · The race · After the finish). Each has its colour dot, number, title, landmark and its lead number with a one-line gloss. "You are here" marks the current one.
  - Then `.nav-more` (How we know, About, Request an analysis, Open data ↗), the Miles/Kilometres switch and *Pause animations*.
- **The goal sheet.** A big stepper (− 4:00 +) in 5-minute steps from 2:30 to 6:30, the even pace in your units, a course select and *Done*. Changing it re-renders every personal sentence on the page live. The live site's pace-band floating stepper inspired this, and here it is universal.
- **Within a page.**
  - Cards snap with `scroll-snap-type: y proximity` (never `mandatory`, so long cards and zoom never trap anyone).
  - The kicker shows `3 / 6`, and the cover's TOC chips jump to cards.
  - The header hides on scroll down and tints itself to whichever card is under it, the way an iOS status bar does.
- **Between pages.** Every page ends with a **next stretch** card in the *next* chapter's colour. It carries that page's lead number, a *Keep running →* button and a mini rail ("You are here" → the next station). This one card replaces prev/next links, "Was this useful?", the tool promo and the "More tools" lists. PageFeedback moves to a single thumbs row on the last card.
- **Swipe decks** (home's seven frames, the course page's three) are horizontal `scroll-snap` tracks.
  - Segmented progress bars sit on top, as in Wrapped.
  - Tapping the right third of a frame goes forward and the left third goes back (never on a control). Arrow keys work.
  - Nothing auto-advances.
- **Desktop.** The dock moves into the header bar, centred at 560 px, so it never covers a chart. Cards become a 5/7 split (numeral and claim on the left, chart on the right).

---

## 4. Design tokens

### 4.1 Type (phone → desktop, fluid)

| Role | Face and settings | Size | Line height and tracking |
|---|---|---|---|
| **Giant numeral** | Bricolage Grotesque 800, `opsz 96`, `font-stretch 82%`, proportional figures | `clamp(3.4rem, 30vw, 12.5rem)`; `.md` `clamp(2.6rem, 22vw, 9rem)`; `.sm` `clamp(2.2rem, 16vw, 6.5rem)` | .8 / −.055em; unit suffix .4em, superscript (`%`, `×`) or baseline (`s`, `ft`) |
| Page title (H1) | Fraunces 640, `opsz 144, SOFT 50, WONK 1`; *italic accent* on the finding | `clamp(1.9rem, 12.4vw, 6.4rem)` (home hero `clamp(1.8rem, 10.6vw, 5.6rem)`) | .94 / −.03em |
| Section display (H2) | Fraunces 620, `opsz 110` | `clamp(2.05rem, 8.6vw, 3.6rem)` | 1 / −.024em |
| **Claim** (card H2) | Fraunces 600, `opsz 72, SOFT 50, WONK 1`; `em` italic in `--hi-ink` | `clamp(1.3rem, 6.9vw, 2.65rem)` | 1.08 / −.018em |
| Dek | Inter 400 | 1.125rem | 1.5 |
| Say (support line) | Inter 400, `--fg-2`, max 38ch | 1.0625rem | 1.5 |
| Kicker | JetBrains Mono 600, uppercase | .72rem | .14em |
| Bib number | Bricolage 800, `opsz 48` | 1.85rem (dock 1.32rem) | 1 / −.035em |
| Chart ticks | JetBrains Mono 400 | **12 px** (never smaller) | .02em |
| Direct labels | Inter 650 / highlight Inter 700 in `--hi-ink` | **14 px**; secondary 12.5 px | — |

- The hero figure is a grotesque, Bricolage, in line with the dataviz rule (no serif on numbers). The serif is reserved for words.
- A **digits-only subset of Bricolage** with `wght + opsz + wdth` (0–9 : . % × + − / s ft mi km °F °C) should come to about 10–12 KB. It replaces the 131 KB `standard` file the prototype loads. Body uses of Bricolage keep today's 41 KB `wght` file.
- Fraunces and Bricolage are preloaded.
- `scripts/font-fallbacks.cjs` must regenerate the fallback metrics for the new numeral subset and the title settings.

### 4.2 Colour

**Base (unchanged from the live site):** paper `#F5F0E6`, card `#FFFDF8`, ink `#15171C`, night `#0E1116`, orange `#FF5B2E`, orange-ink `#B4380D`, gold `#F4B23E`.

**New:** `--orange-mark #E8461A`, used for "you" marks on light fields (3.47:1 on paper; `#FF5B2E` is only 2.72:1).

**Chapter fields.** The dark fields sit at OKLCH L ≈ 0.27–0.30, C ≈ 0.05–0.075. The light fields sit at L ≈ 0.91–0.92, C ≈ 0.03. Gold and orange are the two signal fields, used for the finish and for you. Every field has a recipe (`.f-00` … `.f-11`): `--bg --fg --fg-2 --line --hi --hi-ink --chip --mute-mark`. Charts read only these, so one chart works on all 12 fields.

| Field | bg | text | text contrast | highlight mark | mark contrast | accent text |
|---|---|---|---|---|---|---|
| 00 Night | `#0E1116` | paper | 16.6 | `#FF6A3D` | 6.7 | `#FF7A50` |
| 01 Indigo | `#17234B` | paper | 13.4 | `#FF6A3D` | 4.9 | `#FF7A50` |
| 02 Moss | `#0F3624` | paper | 11.8 | `#FF6A3D` | 4.7 | `#FF7A50` (5.2) |
| 03 Mist | `#D1E9F2` | ink | 14.2 | `#E8461A` | 3.1 | `#B4380D` (4.7) |
| 04 Ember | `#451911` | paper | 13.2 | `#FF6A3D` | 5.3 | `#FF7A50` (5.8) |
| 05 Sand | `#EDE0C8` | ink | 13.7 | `#E8461A` | 3.0 | `#B4380D` (4.6) |
| 06 Deep teal | `#003237` | paper | 12.2 | `#FF6A3D` | 4.9 | `#FF7A50` |
| 07 Plum | `#391836` | paper | 13.6 | `#FF6A3D` | 5.0 | `#FF7A50` |
| 08 Gold | `#F2B33D` | ink | 9.6 | `#7A2405` | 5.4 | `#7A2405` |
| 09 Lilac | `#E4DDF3` | ink | 13.6 | `#E8461A` | 3.0+ | `#B4380D` (4.5) |
| 10 Orange | `#FF5B2E` | ink | 5.8 | ink | 5.8 | ink (paper fails at 2.7) |
| 11 Slate | `#18232D` | paper | 14.0 | `#FF6A3D` | 5.2 | `#FF7A50` |

(Measured with `scripts/palette.mjs` and `scripts/contrast2.mjs`, which use the skill's `contrast()`. Muted text clears 4.5:1 on every field. On orange it uses `#3D1407` at 5.2:1.)

**Data colours (detail cards on Night or Paper only).**

- **Faster/slower:** blue `#2F5BFF` / rose `#E2416B` on paper. On night they are `#7D9BFF` (7.2) and `#FF8A9F` (8.5).
- **"You" in a diverging chart:** never a filled ramp colour. It is an orange ring with a label, so it cannot be mistaken for "slower".
- **Pacing types, re-stepped** (validator: all checks pass; adjacent CVD ΔE ≥ 12 on paper, 7.8 on night, which is legal because the type rows are always direct-labelled):
  - Paper: Metronome `#0F8F62`, Gentle fader `#2F5BFF`, Late fader `#C98A12`, Early drifter `#7A4DFF`, Cliff `#E2416B`, **Fast-start fader `#9A4A12`**.
  - Night: `#139C6C`, `#5A7CFF`, `#C08A1C`, `#8D6CF5`, `#E0507A`, `#B57A2E`.
  - **Change:** the fast-start fader leaves orange. Orange now means only *you*, and the old orange and rose pair failed the normal-vision floor (ΔE 11.2 < 15).
- **Ordinal ramps** (onset sections, pacing patterns): one hue light to dark, or the field ink at 62%, 38% and 20% with the bucket that matters in the highlight.

**Dark mode.**
- `@media (prefers-color-scheme: dark)` under `:root:not([data-theme="light"])`, and again under `:root[data-theme="dark"]`.
- It switches only the Paper surfaces, to night paper `#121419` with ink `#F2EDE3`.
- Chapter fields keep their identity (most are already dark) and their recipes don't change.
- Paper-card charts take the night data colours.
- The site still defaults to light. This is an option, not a mandate.

### 4.3 Space and grid

- **Spacing:** a 4-pt scale (4, 8, 12, 16, 24, 32, 48, 64, 96).
- **Gutters:** 20 px on phones (12 px at 299 px and below), 40 px on tablets, 56 px on desktop.
- **Card padding:** top = header + 20; bottom = dock + 36 on phones, 56 on desktop.
- **Phone layout:** a single column at a 560 px max (350 px of content at 390).
- **Tablet:** 680 px max.
- **Desktop:** a 1160 px container. `.split` cards use `5fr / 7fr` with a 72 px gap. The kicker spans both columns, numeral and claim go left, the chart goes right and the actions sit under the claim.
- **Narrow steps** (`≤ 359 px`, `≤ 299 px`): every multi-column block steps down a column; the header wraps to two rows (the live site's ≤299 rule, `--top-h: 104px`); giant numerals have clamp floors so 200% zoom never overflows. **Verified: no horizontal overflow at 195, 320, 390 or 1440 px on all four screens** (`shots/*-zoom200-*.png`).

### 4.4 Motion (CSS first)

| Motion | Rule | Trigger |
|---|---|---|
| Card reveal | Children rise 14 px and fade in, 600–700 ms `cubic-bezier(.16,1,.3,1)`, staggered 60 ms | An IntersectionObserver adds `.is-in` once, at 18% visible |
| **Odometer numerals** | Each digit is a 0–9 column; `translateY(-d×10%)` over 1.1 s, staggered 70 ms. The final digits are already in layout as ghosts, so the width never changes | `.is-in` |
| Line draw | `stroke-dashoffset` from `--len` to 0, 1.2 s | `.is-in` |
| Bars grow | `scaleY` / `scaleX` from the baseline, 700 ms | `.is-in` |
| 100 dots | Fill transitions staggered 8 ms per dot | `.is-in` |
| Flip | `rotateY(180°)`, 620 ms `cubic-bezier(.2,.7,.2,1)`. Front and back share one grid cell, so the height never jumps | Tap on "Details" (`aria-expanded`) |
| Header | Hides on scroll down (transform only); colour tint 450 ms | Scroll |
| Rail runner | Gait phase advances with scroll distance and stops after about 20 idle frames | Scroll |
| Replay | Autoplays when its top passes the bottom fifth of the screen; pauses off screen | IntersectionObserver |
| Decorative runners | Run for at most 30 s, then settle (the existing `useTicker` limit) | In view |

**Reduced motion** (`prefers-reduced-motion: reduce` or the site pause `data-motion-off`):

- All durations drop to 0.01 ms and odometers show their final digits.
- Lines and bars are drawn and the rail runner stands still.
- The replay shows a still at a meaningful moment (just after the first finish).
- Scroll snap is turned off.
- The flip becomes a crossfade.
- The *Pause animations* control lives in the race map sheet and the footer.

---

## 5. The nugget card (component anatomy)

```
┌─ .card.f-08 (chapter field, full-bleed, min-height 100svh) ────────────────┐
│ ● 08 · The finish line                                        3 / 6        │ ← .kick  (mono; chapter dot; card count)
│                                                                            │
│ 1.73×                                                                      │ ← .big   (Bricolage odometer; unit .u)
│ as many finishes in 2:59 as a smooth curve expects.                        │ ← .claim (Fraunces; italic = the finding)
│ Hours pull. Quarter hours mostly don’t: 2:45 0.95×, 3:45 0.96×.            │ ← .say   (optional, ≤ 2 lines)
│ ┌ 2:30 1.45× ┐┌ 2:45 0.95× ┐┌ 3:00 1.73× ┐ …                              │ ← micro chart ([data-share-viz], ≤ 96 px)
│ ┌ 4:00 │ YOUR GOAL  1.30× in 3:59 ┐                                         │ ← .bib (the personal thread; pin holes)
│ (↻ Every mark)  (Share)                         How we know ⓘ              │ ← .foot: flip, share, one methodology link
└────────────────────────────────────────────────────────────────────────────┘
```

- **Front:** kicker, numeral, claim, the say line, the micro chart, the bib and the actions. The number is real text: `aria-hidden` on the digit columns, with the full value in an `sr-only` twin. The section is `aria-labelledby` its claim (H2).
- **Back** (`.face-back`, `inert` until flipped): an exact-values table (≤ 5 columns on phones; `.hide-sm` drops the rest) or the second view of the chart, plus "Back". Every chart's table lives here, so tooltips never gate a value.
- **Share** (`[data-share]` → sheet): a 4:5 preview (1080 × 1350 export) with the same field, kicker, numeral, claim and micro chart, plus a footer with the brand and URL. "Add my goal to the card" is off by default. Save image, Copy link and Share… go through the lazily loaded canvas renderer, the same pattern as `lib/report-image.ts`.
- **Variants:**
  - *vs* card (`30% vs 4%`).
  - *Guess first* (drag to guess → lock in → reveal against 100 dots; the guess stays in component state only).
  - *Scrub* (a native range input plus pointer scrubbing on the plot, with a live readout above the chart).
  - *Your card* (the orange field: everything the chapter said, for your goal).
  - *Next stretch* (the next chapter's field plus the mini rail).
- **Every value comes from `lib/nuggets.ts`** (the contract in `nuggets.md` §0): `values`, a `guard` and `headline`, with a `fallback`. The prototype implements these guards inline:
  - "alike" only when the women's, men's and overall peaks agree;
  - "mostly don't" only when most quarter marks sit below 1.05×;
  - the warm and cool cards only when the two editions are ≥ 5 °C apart;
  - "Fewer/More X" from the largest type difference;
  - "courses that bend like Boston" only for courses with ≥ 5 editions;
  - downhill courses taken from geometry (first-5K net ≤ −25 m) intersected with the data.

---

## 6. Chart grammar at 390 px

All charts render at the real pixel width of their container: 350 px on a phone, or 310 px inside a frame. The prototype redraws them on resize. In production, see §8.2. Shared rules:

- **Axes:** one baseline hairline (1 px, `--line-2`), at most two solid gridlines, no y-axis line, and mono 12 px ticks at round values (`19K` and `39K`, `+6 min`, `30%`). Ticks at the edges anchor start or end, so they never clip.
- **Labels:** direct labels before legends, 14 px Inter, on the extreme, the finding or *you* only. Never a number on every mark. A legend appears only for two or more series.
- **Highlight:** one mark in `--hi` per chart (the finding or you). "You" is a 1.5 px vertical line or a ringed dot labelled `You 4:00`.
- **Model and null:** the expected curve is a dotted 1.5 px line in `--fg-2` (it reads as a model, not as data). A null finding is drawn neutral (grey, in a band around zero), never in alarm colours.
- **Interaction:**
  - Every scrubbable chart takes the pointer on the plot itself (`pointerdown` and `move`; `touch-action: pan-y` keeps vertical scrolling).
  - A native `<input type=range>` sits underneath as the keyboard and screen-reader path, with `aria-valuetext` such as "3:59: 37,308 finishes".
  - The readout is a fixed block above the chart in `aria-live="polite"`, not a floating tooltip.
  - Tap targets are ≥ 44 px, and a chip row scrolls sideways with an edge fade instead of clipping.

| Chart type | At 390 px | Interaction |
|---|---|---|
| **Minute towers** (histogram) | 1 column per minute (about 1.5 px) at 34% ink; the minute before each hour and half hour in `--hi`; dotted smooth curve; two gridlines; ticks at 3:00, 4:00, 5:00, 6:00; the tallest towers direct-labelled (2:59, 3:29), except one near you or the cursor | Scrub any minute → readout (`3:59` · 37,308 finishes · 1.30× against the curve); chips: Everyone / Women / Men |
| **Ten-second lens** | 30 columns (−3 to +2 min); bins before the line in ink, after it muted; the peak bin in `--hi` labelled `−70 s`; the line at 0 labelled with the mark | Mark chips (3:00 … 5:00), with your nearest mark tagged "· you" |
| **U-curve, small multiples** (opening vs finish) | Top: finish against same-pace finishes, with the area washed rose above zero and blue below; the minimum ringed and labelled "Best average finish". Bottom: the sustained-slowdown share on the same x axis (two charts, never two y axes) | Scrub the opening → your first-5K split for your goal, minutes ahead or behind, and the slowdown share |
| **100% stacked rows** (onset by opening) | 20 px rows with 2 px gaps; an ordinal ramp in field ink with the 20–25K bucket in `--hi`; row labels at 13 px; the two compared rows (>10% fast, within 2%) at full strength, the others at 55% | Course chips re-fill the rows and the numeral (`30% vs 4%` → Boston `17% vs 2%`) |
| **100 dots** | A 10 × 10 grid; lit in `--hi`; a comparison grid lit in `--fg`; always next to the number and the words "of 100 finishes" | — |
| **Waffle** | 225 squares (25 × 9) for pairs; lit = the warmer race slowed more | — |
| **Year columns** | One column per edition; value on the cap, year in mono below, start temperature below that; the extremes in field ink, the selected year in `--hi` | Tap a year → a sentence (year · start temperature · median · share) |
| **Fingerprint curve** | The course's deviation (2 px) against the typical course (a zero line); its signature section glows in a 16% `--hi` band with a ringed dot | — (the sparkline variant powers "courses that bend like Boston") |
| **Elevation** | One shared y scale (0–160 m) on every course page, so a flat course looks flat; the slowest 5K overdrawn in `--hi` | — |
| **Route** | A 3.5 px paper line on a 16 px glow; the slowest section in `--hi`; a green start dot and a checkered finish; one leader-line annotation placed on the empty side of the climb | — |
| **Replay** (canvas) | The existing renderer (lanes, pace colours); at 390 px a strip from start to finish with the 10 mi / half / 20 mi marks; stats *below* the canvas, never over it | Play/pause (52 px), clock scrub, autoplay in view |
| **Type rows** | Six bars, each with its validated hue, direct-labelled with the share; a 2 px ink tick marks "every course" | — |
| **Exact-values table** | On the back of the flip; ≤ 5 columns on phones; tabular figures; the row that matters marked with a `--hi` dot | — |

---

## 7. Page templates

### Home (`/`), built
The section ids are exactly `hero, paths, stakes, guide, steps, stories, cta`, in that order (`verify-analytics`, S6).

1. **hero (Night).**
   - The **race replay is the hero**: a full-bleed band (Berlin 2024 today; the edition should be picked by data) that starts at the first finish, when the field is most spread out. Its HUD reads "2:13:56 · Berlin 2024 · race clock" and "26% not yet at halfway".
   - The kicker comes from data. The H1 is "The same 26.2 miles, run *3.4 million* ways. *Plan yours.*"
   - **paths** holds the goal as a white race bib (`#home-plan-goal`, keypad colon), the course (`#home-plan-course`), the one orange *Plan your race* button (`.home-plan-button`), and two doors (`.home-door-link`): *Read the race* and *Analyze a past race*.
   - Verified: at 390 × 664 the title ends at 457 px, the button at 590 and the doors at 646. At 402 × 714 the doors end at 688. *Plan your race* is the only orange control on the first screen.
2. **stakes.**
   - *Guess first* (Sand): "What share of finishes ran their second 20K *faster* than their first?" Drag, lock in, then the odometer reveals 3.9% alongside the four-pattern bar and "Your guess: 18% · 14 points high".
   - Then *three in ten* (Plum): `30%` with 100 dots and "72% of those began at 30K or later".
3. **guide:** "3.4 million finishes, *wrapped*." Seven frames from seven chapters, each a mini nugget card with a share button: 4:10 · 7/7 · 197/225 · 7:42 · 63% · 3:58 · 51%.
4. **steps:** "Your goal rides along every chapter." Pin on your bib (the live bib opens the goal sheet) → read the race (a live personal example) → plan it and print it.
5. **stories:** the race map inline, the same 12 stations as the sheet.
6. **cta (Night, checkered top):** three pixel runners at `3:30 · You 4:00 · 4:30`; "Your *4:00* starts here."; *Plan your race* and *Make a pace band*.
7. A short footer: brand, credit, 6 links, "Open data", *Pause animations*.

### Chapter or story (`chapter-finish-line.html`), built
- **Cover** (the chapter field, H1). It has a kicker, the chapter label, the H1 with the finding in italic, and a dek that names your goal. A six-chip TOC gives each card's number and title. The pixel-runner art comes from `Runner.tsx`: runners crossing a checkered banner. A "six cards" cue closes it.
- **Then 4–8 cards** that alternate field, Night and Paper. Each is `data-track-section="chapter-n"`, and the ids allow up to 8.
- **Then "your card" (Orange)** collects every value for your goal (1.30× · 37,308 · 39% · 70 s) as a shareable card.
- **Then next stretch** (the next field, `related`).
- The 3:59 chapter holds the busiest minute (3:58, women and men alike) → the towers you can scrub → the biggest pull (1.73×, flip for all 11 marks) → guess first (39% vs 28% from up to 2 minutes behind at 40K) → the cushion (70 s before 4:00) → your card → *09 Who holds pace: 20% vs 45%*.

### Analysis (`analysis-starting-pace.html`), built
The `.analysis-layout` class stays on the explorer wrapper (replay masking).

1. **The answer.** The H1 is the finding ("Bank 2:42 early. *Give back 7:42.*"). Under it sits a **race receipt**, the zig-zag card pattern the places story already uses: First 5K −2:42 · After 20K +7:42 · At the finish 5:00 behind · Sustained slowdown 54% vs 37%. A bib then shows what "more than 10% fast" means *for your goal*: under 25:35 at 4:00, against an even 28:26.
2. **Try it.** The explorer reduced to one control: scrub your opening and read your first-5K time, minutes ahead or behind at the finish, and the slowdown share. The best opening (2–3% slower than the 5–20K pace) glows.
3. **Nugget cards** (`30% vs 4%` with course chips; `54%` with 100 dots ×2, flip for all six openings).
4. **Next** (*Downhill starts: 16% vs 16%*, plus the mini rail).

The full filter set (course, age group, recorded gender, earlier marathon) lives in a **"Make it yours" bottom sheet** opened from the dock bib. It keeps the S2-pinned labels ("Finish time to explore", "Age group", "Recorded gender", /Earlier marathon/, "Update comparison"). The defaults always show a full answer.

### Course page (`course-boston.html`), built
Today's `verify-courses` order is replaced (an owner decision, §8.4).

1. **hero** (Moss): the route is the poster, with the slowest section drawn in orange (+140 ft); H1 "Boston Marathon"; a data dek; three stat tiles (3:38 · 22% · 7/7); and your-goal bib ("9 in 100 on 4:00 pace at 20K made it").
2. **chapter-1:** "What makes Boston Boston", a three-frame deck: fingerprint (7/7, 21.7–24.9 mi runs 3.9 points quicker), the climb (140 ft in the slowest 5K) and the clock (median 3:28 in 2026, 3:48 in 2018).
3. **chapter-2:** the replay, moved up from screen 17 to screen 3: "When the first finish crossed, *13%* of the field hadn't reached 20K."
4. **chapter-3:** your goal here, with goal chips, the share that made it against every course (9% vs 14% across 22 courses), the sustained slowdown share and 100 dots.
5. **chapter-4:** year by year, `11% → 34%`, tap a year.
6. **chapter-5:** race morning, warm against cool (only when ≥ 5 °C apart).
7. **chapter-6:** pacing types against every course ("Fewer *Late faders*").
8. **cta:** plan, once; one orange button.
9. **related:** "Courses that *bend like Boston*", the nearest pacing fingerprints with ≥ 5 editions. The page uses no rank words: "similar" is banned, "bend like" is not.

Every printed figure becomes `<data value data-k>` as today.

### Tool (`/tools/*`), described
- **Input as a bib.** The tool's main input (a goal, a time, the splits) is a race bib at the top. On phones, the live pace-band goal bar becomes the universal pattern: the bib docks to the bottom as you scroll.
- **Result as a nugget card.** The answer is a giant numeral with one claim. Example: the predictor reads `4:05–4:15` with "Pace Notes data" in the kicker.
- **Evidence badges.** They appear as one small mono text tag in the result card's kicker (`PACE NOTES DATA`, `PUBLISHED RESEARCH`, `OFFICIAL STANDARD`), drawn only by `EvidenceTag`, never combined. They are not outlined pills and carry no per-tool hues. Plain calculations carry no badge.
- **Outputs.** Secondary outputs (splits, the printable band) are Paper cards. Print views are unchanged.
- **Handoffs.** These become next cards ("Turn this into a pace band →").
- **Unchanged contracts:** `.tool-workspace` and `.tool-results` with their `aria-live` summary, inputs in the URL (never birth dates), the keypad colon and the S2 labels.

### Race report and "Your race" (chapter 10), described
- **Race Wrapped.** The orange chapter's signature: a horizontal deck of 5–6 frames from the runner's own record, using the same frame component as the home deck. The frames are:
  - the placement: "Faster than 62 in 100 finishes in this race"; peer groups need ≥ 101 finishes and the percentile excludes the record;
  - the late race against the field (a q25–q75 box with a tick);
  - the shape (the runner's nine sections morphing into the type centroid);
  - the opening (the bank-and-pay receipt filled with their band);
  - a sustained slowdown yes or no, and where it began.
- **The 1080 × 1350 export** is the existing `lib/report-image.ts`, restyled to the frame.
- **Copy rule kept:** `RaceReport` never says you, your, rank, percentile or record ("this race", "of finishes"). The deck's own UI may say "your race".
- `/report` and `/runners` stay unrecorded, and `ph-no-capture` stays on `.race-report`.

### Methodology (`/methodology`), described
- **The only long-text page.** It sits on Paper, with no chapter colour fields except the 12 chapter dots in its contents.
- **Sticky contents.** On phones it is a horizontal chip bar under the header; on desktop it is a left column with Data, Definitions, Each chapter (12) and Limits.
- **Anchors.** Every "How we know" link lands on its anchor: `#sustained-slowdown`, `#story-…`, `#tools-…`, `#course-pages`.
- **Method blocks** are collapsed `<details>` with a one-line summary each, so the page drops from 67.7 screens to about 12 at first read.
- The MI/KM switch works here (today it is inert). Distances in definitions go through `UnitText`.

---

## 8. Staying inside the constraints (`inventory.md` §3)

### 8.1 JS budgets (S8 / I10)
The design is **CSS first**. The only client code it adds site-wide is one small island.

| Piece | Where it runs | Estimated gzip | Notes |
|---|---|---|---|
| `YourRace` island (dock, goal sheet, `data-you` text swaps, rail runner) | root layout | **≈ 2.5 KB** | The dock and sheet markup are server-rendered. Personal values are **precomputed per goal at build** as tiny `data-by-goal` maps (49 goal steps × a few numbers), so the island fetches nothing and carries no chart code |
| `Reveal` (IntersectionObserver → `.is-in`) + delegated flip/share/deck handler | root layout | ≈ 0.7 KB | Odometers, draws and bars are pure CSS once `.is-in` lands. The digit columns are SSR'd with `--d` |
| Scrubbers (towers, U-curve, lens, goal chips, year taps) | per card, `next/dynamic`, hydrated when the card is within one screen | 1–3 KB each, **not initial** | Data arrays are embedded and small; render code is shared |
| Share renderer (canvas to PNG) | lazy on tap | ≈ 4 KB, not initial | Reuses the `report-image` pattern |
| Replay | only on pages that render one | as today (6.8 KB) | Today it ships on all 29 course pages; only 8 need it |

- **Net effect on budgets:**
  - The simple pages gain about 3.2 KB, beyond today's 2.7 KB headroom, so the budget needs a deliberate `--write-budget` with a note.
  - Analyses and `/runners` *lose* about 99 KB, because Recharts goes: the Wrapped charts are hand-rolled SVG like the stories.
  - Stories stop shipping all seven bodies once split per page.
- **No new libraries:** no GSAP, no D3 runtime, no Lottie. All motion is CSS transitions plus at most one rAF loop (the replay or the rail runner).
- **No scroll-driven CSS** (`animation-timeline`), because Safari 15 lacks it. IntersectionObserver is the trigger.

### 8.2 Layout shift
- **Cards** have `min-height: 100vh; min-height: 100svh`. Content height never depends on data arriving, because everything is SSR'd at build.
- **Charts** are SSR'd twice where the layout differs: at the phone reference width (350) and at the desktop column width (≈ 640). CSS picks one (`.viz-sm` / `.viz-lg`). Text stays at true pixel size and nothing reflows on hydration. Interactive islands redraw at the same aspect ratio.
- **Odometer** ghosts reserve the final width, so rolling never shifts anything.
- **The dock and header are fixed** (no layout), and their tinting is colour-only.
- **The replay** keeps its fixed-size frame while loading, as today.
- **Font metrics** are regenerated for the numeral subset (`font-fallbacks.cjs --check`).
- **Targets:** keep lab CLS ≤ 0.1 on `/`, `/tools/plan` and `/courses/boston`, and add one chapter page and one analysis to S8.

### 8.3 Analytics section ids (`TRACKED_SECTIONS`)
- **Home:** exactly `hero, paths, stakes, guide, steps, stories, cta`. The prototype markup follows it, `paths` sits inside the hero, and there is no `chapter-*` on `/`, so `home_depth@v1` is unchanged.
- **Chapter, story and analysis pages:** `hero` (cover or answer), `chapter-1…8` (cards; at most 8 tracked per page, so longer chapters split into pages), `cta` (where present), `related` (next stretch). No new ids are needed.
- **Course pages:** the same ids in a **new order**: `hero, chapter-1 (what makes it), chapter-2 (replay), chapter-3 (your goal), chapter-4 (year by year), chapter-5 (race morning), chapter-6 (pacing types), cta (plan), related (bend like)`. This needs `verify-courses --html` (`TRACK` map, `SECTIONS` order) and the docs updated together, which is the owner's decision.
- **Paths:** `STORY_SLUGS` gains `race-morning` if the courses story splits. Every new page keeps its own or its section's path.
- **Events:** none added. Share clicks reuse `report_exported`-style naming only with owner approval; otherwise they are not counted.

### 8.4 Replay masking, privacy and storage
- **Personal content is masked.** Every element that prints the visitor's goal or puts it into SVG (bibs, `You` lines, your card, guess results) sits inside a new masked class, **`.your-race`**. That means adding it to `MASKED` and to the SVG-in-masked-region block in `lib/replay-policy.ts` (a protected file: owner change). Decorative charts keep `.viz svg` (blocked) and the replay keeps `.replay`.
- **Existing tokens stay** in their files: `.tool-workspace`, `.tool-results`, `.analysis-layout`, `.which-card`, `.finish-lookup`, `.home-plan`, `.projector-cards`, `.course-chooser-list` and the `ph-no-capture` wrappers.
- **One new storage key:** `pace-notes-your-race` (`{goal, course}`), which must be added to the I6 allowlist and the docs. Units keep `marathon-study-units`. Every access is wrapped in try/catch.
- **The goal never enters analytics.** It reaches a URL only when the visitor shares a card with "Add my goal" ticked, and a goal time is not one of the protected fields (birth dates, names, search text).

### 8.5 Accessibility
- **Semantics:** one H1 per page; each card is a `<section aria-labelledby>` its claim (H2).
- **Numerals:** the giant numerals are real text with an `sr-only` full value.
- **Charts:** every chart is `role="img"` with an `aria-label` that states the finding. Exact values sit on the flip side (no tooltip-only values).
- **Controls:** scrubbers are native range inputs with `aria-valuetext`; readouts are `aria-live="polite"`; flip buttons use `aria-expanded`, and the hidden face is `inert`.
- **Targets and contrast:** tap targets are ≥ 44 px; focus rings are blue, or gold on dark fields; contrast is validated per field (§4.2). Colour is never the only cue, since type rows, onset buckets and dots are all labelled.
- **Zoom:** 200% zoom (195 px) works with no overflow, the header wraps, and the kicker and numerals step down.
- **Motion:** reduced motion and the site pause stop everything (§4.4). Sheets trap Escape, return focus, and their panels take focus without a visible ring.

### 8.6 Static export, SEO, units and copy
- **Static export:** everything is pre-rendered at build. Personalisation is client-only and reads precomputed maps, and no request goes to a third party (fonts are self-hosted, as now).
- **Metadata:** `pageMetadata` for every page. Titles change for chapter pages, so bump `CONTENT_DATES`, re-render the OG cards and update the `build-og-images` `TOKENS` if the share-card fields become OG cards. That would be a good next step: every chapter's OG card in its field colour.
- **Units:**
  - Miles are the default; data stays metric.
  - Sections are labelled by runner landmarks or one-decimal miles (`18.6–21.7 mi`), never two decimals. Mats are named 5K, 10K, 20K, Half and 30K.
  - Temperatures are in °F in miles mode, and gaps in °F (5 °C → 9 °F).
  - Every unit-dependent page is listed in `lib/unit-preference.ts`.
- **Copy:**
  - It never uses "arithmetic", "the wall", "your chance" or "fastest", and course pages use no rank words. The prototype passes a grep for all of these.
  - Shares are written as "of finishes" or "in 100 finishes"; counts are always finishes.
  - It uses association language only ("went with", "had").
  - "Sustained slowdown" links to `/methodology#sustained-slowdown`.

### 8.7 Verifier and e2e impact (what must move together)
- **S1:**
  - The race map sheet keeps `#site-menu a` (5 links in order) + `.nav-more` (phone only), one `.nav-primary` and `.nav-toggle`.
  - The home first-screen rules are met.
  - `#goals tbody th a` moves to the back of the course page's goal card.
- **S2:** labels unchanged (they live in tools and in the "Make it yours" sheet).
- **S6:** home order unchanged; course order as in §8.3.
- **verify-courses:** new section order, and keep `<data data-k>` on figures, the table regions and the absence lists.
- **verify-ten-analyses:** the headline regexes in `inventory.md` §3.14 must be re-pinned to the new finding-style H1s. That is the point of the change, so it is deliberate.
- **verify-tools:** keep `EvidenceTag`, `.tool-workspace` and the share-bar text.
- **S8:** new budgets and CLS pages (§8.1, §8.2).
- **I6:** the new storage key.
- **replay-policy:** `.your-race`.

---

## 9. What I kept (the critique's "keep" list) and how it evolved

| Kept | Evolved into |
|---|---|
| Paper and ink, ember glow | Paper and Night stay the two data surfaces; ten more chapter fields join them, tuned to the same lightness logic |
| Orange accent | Now has one meaning: *you* (plus the one primary button). The fast-start fader leaves orange |
| Display serif with italic accent words | Claims and titles; the italic always wraps *the finding* ("*Give back 7:42*", "*bend like Boston*") |
| Mono labels | Kickers, ticks and the receipt only; never on row labels |
| Pixel runners | The rail runner (your position), the chapter covers, the finish-line CTA with time chips; a future job as data (time-group runners in the replay) |
| Race replay | Promoted to the home hero (starting at the first finish, when the field is spread), and moved to screen 3 of course pages |
| Story headlines as findings | Extended to every analysis, course and tool card |
| Floating goal stepper | Became the universal dock bib and goal sheet |
| The places "receipt" | Became the analysis hero viz (race receipt) |

---

## 10. Open questions for the owner

1. **The course-page section order** and the `verify-courses` re-pin (§8.3).
2. **The `.your-race` masked class** (`lib/replay-policy.ts` is protected) and **the `pace-notes-your-race` storage key** (I6).
3. **Budgets:** accept about +3.2 KB on simple pages for the dock island, against about −99 KB on analyses.
4. **The fast-start fader** moves from orange to `#9A4A12` (orange reserved for you).
5. **URLs:** keep the existing URLs as chapter pages, with `/research` as the race map (my recommendation), or add `/race/<chapter>` routes with redirects.
6. **OS dark mode:** ship it (tokens are ready) or keep light-only.

---

## 11. Risks

- **Card length.** A one-nugget card is a screen. Chapters with many findings (`final-kick`, `courses`) must split into pages, or the scroll gets long. The rule: at most 8 cards per page, which matches the `chapter-1…8` ids.
- **Colour count.** Twelve fields is a lot. They work because the lightness and chroma logic is shared, and because data colours never sit on them. Any chart needing categorical colour must sit on Night or Paper.
- **Personalisation everywhere.** Precomputing per-goal maps keeps it cheap, but each new nugget needs its by-goal expression in `lib/nuggets.ts` and a verifier recount.
- **The new release.** The new release (34 cities, 287 race-years) changes every value. Guards and fallbacks, not literals, are what keep this design honest. Chicago 2015 and the duplicate-edition screen must never be named as range ends (see `nuggets.md` §4).

---

## 12. Prototype files and screenshots

**Files** (`proto/`)

- `index.html` (home), `chapter-finish-line.html` (story), `analysis-starting-pace.html` (analysis), `course-boston.html` (course page; the code takes the city as a parameter, `?city=`, but the prototype ships only Boston's replay sample)
- `css/wrapped.css`: tokens, field recipes, base, header, dock and rail, the card system, numerals, bibs, buttons, chips, flip, tables, chart grammar, motion, sheets, deck, footer, breakpoints, reduced motion, forced colours, print
- `css/pages.css`: the page templates and the narrow and short-viewport steps
- `js/core.js`: data loading, units, the your-race thread, formatting, chapters and stations, lead nuggets, header, dock, rail, sheets, share, flip, odometer, reveal, dots
- `js/runner.js`: a port of `lib/art/gait.ts`
- `js/replay.js`: a port of `RaceReplay.tsx`
- `js/charts.js`: the SVG builders
- `js/home.js`, `js/finish.js`, `js/starting.js`, `js/boston.js`: the pages
- `data/`: extracts from `/home/user/wt/insights/public/data` (`scripts/extract.py`)

**Screenshots** (`shots/`; phone = 390 × 844 at DPR 2 with touch, desktop = 1440 × 900)

- **Full page:** `home-phone-full.png`, `home-desktop-full.png`, `chapter-phone-full.png`, `chapter-desktop-full.png`, `analysis-phone-full.png`, `analysis-desktop-full.png`, `course-phone-full.png`, `course-desktop-full.png`
- **First screen:** `home-phone-first.png`, `chapter-phone-first.png`, `analysis-phone-first.png`, `course-phone-first.png`, `home-phone-664-first.png` (the S1 fold)
- **Mid-interaction:**
  - Home: `home-*-ix-guess-revealed.png`, `home-*-ix-deck-swiped.png`, `home-*-ix-race-map.png`
  - Chapter: `chapter-*-ix-scrub-tower.png`, `chapter-*-ix-guess-rescue.png`, `chapter-*-ix-flipped.png`, `chapter-*-ix-share-sheet.png`
  - Analysis: `analysis-*-ix-scrub-opening.png`, `analysis-*-ix-onset-boston.png`, `analysis-*-ix-goal-sheet.png`
  - Course: `course-*-ix-goal-330.png`, `course-*-ix-year-tap.png`, `course-*-ix-replay-playing.png`
- **200% zoom proxy (195 px):** `*-zoom200-first.png`, `*-zoom200-card.png`
- **OS dark mode with reduced motion:** `chapter-phone-dark-reduced-towers.png`, `chapter-phone-dark-reduced-cushion.png`
- **Scripts:** `scripts/shoot.cjs` (all captures), `scripts/zoom.cjs`, `scripts/dark.cjs`, `scripts/tiles.py` and `scripts/sheet.py` (review sheets in `scratch/`)
